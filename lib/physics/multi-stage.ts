import {
  impulseThrough,
  massFlowAt,
  massFlowThrough,
  thrustAt,
  totalMassFlow,
  totalImpulse,
  validateMassFlowHistory,
  validateThrustCurve,
  type MassFlowPoint,
  type ThrustPoint,
} from "./curves.ts";
import {
  ZERO_MATRIX,
  ZERO_VECTOR,
  addMatrices,
  addVectors,
  cross,
  determinant,
  magnitude,
  scaleMatrix,
  scaleVector,
  subtractVectors,
  type Matrix3,
  type Vector3,
} from "./linear-algebra.ts";
import {
  combineMassProperties,
  shiftInertia,
  type MassProperties,
} from "./mass-properties.ts";
import {
  rotateBodyToWorld,
  type RigidBodyLoads,
  type RigidBodyState,
  type ScheduledRigidBodyEvent,
  type StateTriggeredRigidBodyEvent,
} from "./six-dof.ts";
import type { RecoveryCommandTrigger, RecoveryDevice } from "./recovery-system.ts";

export const MULTI_STAGE_MODEL_VERSION = "kestrel-multi-stage-0.7.0";

/** A motor-local body-frame thrust direction sample for deterministic gimbal interpolation. */
export type MotorGimbalPoint = Readonly<{
  /** Seconds after this motor's local ignition (before any stage-level event offset). */
  timeS: number;
  /** Body-frame thrust direction at the sample; it is normalized by the model. */
  axisBody: Vector3;
}>;

export type MultiStageMotor = Readonly<{
  id: string;
  name: string;
  ignitionDelayS?: number;
  thrustCurve: readonly ThrustPoint[];
  /** Optional positive measured propellant outflow rate relative to motor ignition. */
  massFlowHistoryKgS?: readonly MassFlowPoint[];
  dryMassProperties: MassProperties;
  initialPropellantMassProperties: MassProperties;
  thrustApplicationPointBodyM: Vector3;
  thrustAxisBody?: Vector3;
  /** Optional strictly time-ordered motor-local thrust-axis schedule. */
  thrustAxisSchedule?: readonly MotorGimbalPoint[];
  /** Optional first-order gimbal response time for the commanded schedule. */
  gimbalResponseTimeS?: number;
  /** A configured ignition failure leaves this motor attached with its propellant intact. */
  ignitionFailure?: boolean;
}>;

/**
 * A physical copy of a logical stage. Repeated radial stages can use this
 * shape to receive independent ignition, burnout, and separation state while
 * preserving one logical topology identifier for aerodynamic regimes.
 */
export type RocketStageInstance = Readonly<{
  id: string;
  name: string;
  structuralMassProperties: MassProperties;
  motors: readonly MultiStageMotor[];
  separationDeltaVBodyMps?: number;
  /** Optional measured retained-body separation impulse in N·s, body frame. */
  separationImpulseBodyNs?: Vector3;
}>;

export type RocketStage = Readonly<{
  id: string;
  name: string;
  structuralMassProperties: MassProperties;
  motors: readonly MultiStageMotor[];
  instances?: readonly RocketStageInstance[];
  /** Retained-body axial separation delta-v in the body frame (+X nose direction). */
  separationDeltaVBodyMps?: number;
  /** Optional measured retained-body separation impulse in N·s, body frame. */
  separationImpulseBodyNs?: Vector3;
  /** Recovery hardware that deploys if this stage becomes a detached body. */
  recoveryDevices?: readonly RecoveryDevice[];
  /** Trigger used by the detached-body recovery branch. */
  recoveryDeploymentTrigger?: RecoveryCommandTrigger;
  /** Descending AGL command altitude for detached recovery. */
  recoveryDeploymentAltitudeAglM?: number;
  /** Mission-time command for detached recovery. */
  recoveryDeploymentTimeS?: number;
}>;

export type StagePhase =
  | "waiting"
  | "ignition-delayed"
  | "burning"
  | "burned-out"
  | "ignition-failed"
  | "separated";

export type MultiStageMotorEvaluation = Readonly<{
  id: string;
  name: string;
  localTimeS: number | null;
  phase: "waiting" | "burning" | "burned-out" | "ignition-failed" | "separated";
  thrustN: number;
  totalImpulseNs: number;
  deliveredImpulseNs: number;
  remainingPropellantFraction: number;
  propellantMassKg: number;
  propellantMassRateKgS: number;
  depletionSource: "impulse-proportional" | "measured-mass-flow";
  thrustAxisBody: Vector3;
  forceBodyN: Vector3;
  momentBodyNm: Vector3;
}>;

export type RocketStageEvaluation = Readonly<{
  id: string;
  name: string;
  phase: StagePhase;
  attached: boolean;
  ignitionCommandTimeS: number | null;
  separationTimeS: number | null;
  ignitionFailed: boolean;
  burnoutTimeS: number | null;
  massKg: number;
  propellantMassKg: number;
  thrustN: number;
  motors: readonly MultiStageMotorEvaluation[];
  instances: readonly RocketStageInstanceEvaluation[];
}>;

export type RocketStageInstanceEvaluation = Readonly<{
  id: string;
  name: string;
  phase: StagePhase;
  attached: boolean;
  ignitionCommandTimeS: number | null;
  separationTimeS: number | null;
  ignitionFailed: boolean;
  burnoutTimeS: number | null;
  massKg: number;
  propellantMassKg: number;
  thrustN: number;
  motors: readonly MultiStageMotorEvaluation[];
}>;

export type MultiStageVehicleEvaluation = Readonly<{
  timeS: number;
  massProperties: MassProperties;
  inertiaRateBodyKgM2PerS: Matrix3;
  totalThrustN: number;
  netThrustForceBodyN: Vector3;
  netThrustMomentBodyNm: Vector3;
  attachedStageIds: readonly string[];
  attachedStageInstanceIds: readonly string[];
  stages: readonly RocketStageEvaluation[];
}>;

export type MultiStageVehicleModel = Readonly<{
  modelVersion: string;
  validationStatus: "analytical-component-checks-only";
  stageIds: readonly string[];
  evaluate: (state: RigidBodyState) => MultiStageVehicleEvaluation;
  stageMassProperties: (state: RigidBodyState, stageId: string, instanceId?: string) => MassProperties;
  stageInstanceIds: (stageId: string) => readonly string[];
  body: (state: RigidBodyState) => Readonly<{
    massKg: number;
    inertiaBodyKgM2: Matrix3;
    inertiaRateBodyKgM2PerS: Matrix3;
  }>;
  loads: (state: RigidBodyState) => RigidBodyLoads;
  propulsion: (state: RigidBodyState) => Readonly<{
    totalThrustN: number;
    netThrustForceBodyN: Vector3;
    netThrustMomentBodyNm: Vector3;
    centerOfMassBodyM: Vector3;
    motors: readonly [];
  }>;
  burnoutOffsetS: (stageId: string, instanceId?: string) => number;
  createBurnoutSeparationEvent: (input: Readonly<{
    stageId: string;
    instanceId?: string;
    delayS?: number;
    label?: string;
    separationDeltaVBodyMps?: number;
    separationImpulseBodyNs?: Vector3;
  }>) => StateTriggeredRigidBodyEvent;
  createBurnoutIgnitionEvent: (input: Readonly<{
    sourceStageId: string;
    sourceInstanceId?: string;
    targetStageId: string;
    targetInstanceId?: string;
    delayS?: number;
    label?: string;
  }>) => StateTriggeredRigidBodyEvent;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

type PreparedMotor = MultiStageMotor & Readonly<{
  thrustCurve: readonly ThrustPoint[];
  massFlowHistoryKgS?: readonly MassFlowPoint[];
  totalMassFlowKg?: number;
  normalizedThrustAxisBody: Vector3;
  normalizedThrustAxisSchedule?: readonly MotorGimbalPoint[];
  normalizedGimbalResponseTimeS?: number;
  totalImpulseNs: number;
}>;

type PreparedStageInstance = Omit<RocketStageInstance, "motors"> & Readonly<{
  motors: readonly PreparedMotor[];
  burnoutOffsetS: number;
}>;

type PreparedStage = Omit<RocketStage, "motors" | "instances"> & Readonly<{
  motors: readonly PreparedMotor[];
  burnoutOffsetS: number;
  instances: readonly PreparedStageInstance[];
}>;

type PreparedStageInstanceState = Readonly<{
  instance: PreparedStageInstance;
  separated: boolean;
  separationTimeS: number | null;
  ignitionFailed: boolean;
  ignitionCommandTimeS: number | null;
}>;

type PreparedStageState = Readonly<{
  stage: PreparedStage;
  instances: readonly PreparedStageInstanceState[];
}>;

function validateIdentifier(id: string, label: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`${label} identifiers may contain only letters, numbers, underscores, and hyphens`);
  }
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

function validateSeparationImpulse(
  value: Vector3 | undefined,
  label: string,
): Vector3 | undefined {
  if (value === undefined) return undefined;
  if (!finiteVector(value)) throw new Error(`${label} must contain finite coordinates`);
  const impulseMagnitudeNs = magnitude(value);
  if (!(impulseMagnitudeNs > 0) || !Number.isFinite(impulseMagnitudeNs)) {
    throw new Error(`${label} must be a finite non-zero vector`);
  }
  return { x: value.x, y: value.y, z: value.z };
}

function finiteVector(vector: Vector3): boolean {
  return [vector.x, vector.y, vector.z].every(Number.isFinite);
}

const MAX_MOTOR_GIMBAL_POINTS = 64;

function normalizeThrustAxis(value: Vector3, label: string): Vector3 {
  if (!finiteVector(value)) {
    throw new Error(`${label} must be finite`);
  }
  const axisMagnitude = magnitude(value);
  if (!(axisMagnitude > 0) || !Number.isFinite(axisMagnitude)) {
    throw new Error(`${label} must be a finite non-zero vector`);
  }
  return scaleVector(value, 1 / axisMagnitude);
}

function prepareThrustAxisSchedule(
  schedule: readonly MotorGimbalPoint[] | undefined,
  label: string,
): readonly MotorGimbalPoint[] | undefined {
  if (schedule === undefined) return undefined;
  if (schedule.length === 0) {
    throw new Error(`${label} cannot be empty`);
  }
  if (schedule.length > MAX_MOTOR_GIMBAL_POINTS) {
    throw new Error(`${label} cannot contain more than ${MAX_MOTOR_GIMBAL_POINTS} points`);
  }
  let previousTimeS = -1;
  return schedule.map((point, index) => {
    if (!Number.isFinite(point.timeS) || point.timeS < 0 || point.timeS <= previousTimeS) {
      throw new Error(`${label}[${index}] time must be finite, non-negative, and strictly increasing`);
    }
    previousTimeS = point.timeS;
    return {
      timeS: point.timeS,
      axisBody: normalizeThrustAxis(point.axisBody, `${label}[${index}] axis`),
    };
  });
}

function prepareGimbalResponseTime(
  value: number | undefined,
  label: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0 || value > 10) {
    throw new Error(`${label} must be positive, finite, and at most 10 seconds`);
  }
  return value;
}

/**
 * Apply a bounded first-order response to the commanded unit vector. The
 * vector-space lag is intentionally explicit and deterministic: it is a
 * small actuator approximation, not a servo, rate-limit, or control-loop
 * model. Each schedule knot is treated as a new command and the response is
 * advanced analytically between knots.
 */
function responseLimitedThrustAxisAtLocalTime(
  motor: PreparedMotor,
  localTimeS: number,
  responseTimeS: number,
): Vector3 {
  const schedule = motor.normalizedThrustAxisSchedule;
  if (!schedule || schedule.length === 0) return motor.normalizedThrustAxisBody;
  const targetTimeS = Math.max(0, localTimeS);
  let response = motor.normalizedThrustAxisBody;
  let command = motor.normalizedThrustAxisBody;
  let cursorTimeS = 0;
  for (const point of schedule) {
    const segmentEndS = Math.min(targetTimeS, point.timeS);
    if (segmentEndS > cursorTimeS) {
      const decay = Math.exp(-(segmentEndS - cursorTimeS) / responseTimeS);
      response = normalizeThrustAxis(
        addVectors(command, scaleVector(subtractVectors(response, command), decay)),
        `motor ${motor.id} gimbal-response axis`,
      );
      cursorTimeS = segmentEndS;
    }
    if (targetTimeS <= point.timeS) return response;
    command = point.axisBody;
  }
  if (targetTimeS > cursorTimeS) {
    const decay = Math.exp(-(targetTimeS - cursorTimeS) / responseTimeS);
    response = normalizeThrustAxis(
      addVectors(command, scaleVector(subtractVectors(response, command), decay)),
      `motor ${motor.id} gimbal-response axis`,
    );
  }
  return response;
}

function thrustAxisAtLocalTime(
  motor: PreparedMotor,
  localTimeS: number | null,
): Vector3 {
  const schedule = motor.normalizedThrustAxisSchedule;
  if (!schedule || schedule.length === 0 || localTimeS === null) {
    return motor.normalizedThrustAxisBody;
  }
  if (motor.normalizedGimbalResponseTimeS !== undefined) {
    return responseLimitedThrustAxisAtLocalTime(
      motor,
      localTimeS,
      motor.normalizedGimbalResponseTimeS,
    );
  }
  const timeS = Math.max(0, localTimeS);
  if (timeS <= schedule[0]!.timeS) return schedule[0]!.axisBody;
  const last = schedule.at(-1)!;
  if (timeS >= last.timeS) return last.axisBody;
  for (let index = 1; index < schedule.length; index += 1) {
    const right = schedule[index]!;
    const left = schedule[index - 1]!;
    if (timeS <= right.timeS) {
      const fraction = (timeS - left.timeS) / (right.timeS - left.timeS);
      return normalizeThrustAxis(
        addVectors(
          left.axisBody,
          scaleVector(subtractVectors(right.axisBody, left.axisBody), fraction),
        ),
        `motor ${motor.id} interpolated thrust axis`,
      );
    }
  }
  return last.axisBody;
}

function validateMassProperties(
  properties: MassProperties,
  label: string,
): void {
  if (!Number.isFinite(properties.massKg) || properties.massKg <= 0) {
    throw new Error(`${label} mass must be a positive finite number`);
  }
  if (!finiteVector(properties.centerOfMassM)) {
    throw new Error(`${label} center of mass must be finite`);
  }
  const inertia = properties.inertiaAtCenterKgM2;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      if (!Number.isFinite(inertia[row][column])) {
        throw new Error(`${label} inertia entries must be finite`);
      }
      if (Math.abs(inertia[row][column] - inertia[column][row]) > 1e-12) {
        throw new Error(`${label} inertia must be symmetric`);
      }
    }
  }
  const leadingMinor2 =
    inertia[0][0] * inertia[1][1] - inertia[0][1] * inertia[1][0];
  if (!(inertia[0][0] > 0 && leadingMinor2 > 0 && determinant(inertia) > 0)) {
    throw new Error(`${label} inertia must be positive definite`);
  }
}

function scaledMassProperties(
  properties: MassProperties,
  fraction: number,
): MassProperties {
  return {
    massKg: properties.massKg * fraction,
    centerOfMassM: properties.centerOfMassM,
    inertiaAtCenterKgM2: scaleMatrix(properties.inertiaAtCenterKgM2, fraction),
  };
}

export function stageIgnitionTimeKey(stageId: string): string {
  validateIdentifier(stageId, "stage");
  return `staging.${stageId}.ignitionTimeS`;
}

export function stageSeparationKey(stageId: string): string {
  validateIdentifier(stageId, "stage");
  return `staging.${stageId}.separated`;
}

export function stageSeparationTimeKey(stageId: string): string {
  validateIdentifier(stageId, "stage");
  return `staging.${stageId}.separationTimeS`;
}

export function stageIgnitionFailureKey(stageId: string): string {
  validateIdentifier(stageId, "stage");
  return `staging.${stageId}.ignitionFailed`;
}

function validateStageInstanceIdentifier(instanceId: string): void {
  validateIdentifier(instanceId, "stage instance");
}

export function stageInstanceIgnitionTimeKey(stageId: string, instanceId: string): string {
  validateIdentifier(stageId, "stage");
  validateStageInstanceIdentifier(instanceId);
  return `staging.${stageId}.instances.${instanceId}.ignitionTimeS`;
}

export function stageInstanceSeparationKey(stageId: string, instanceId: string): string {
  validateIdentifier(stageId, "stage");
  validateStageInstanceIdentifier(instanceId);
  return `staging.${stageId}.instances.${instanceId}.separated`;
}

export function stageInstanceSeparationTimeKey(stageId: string, instanceId: string): string {
  validateIdentifier(stageId, "stage");
  validateStageInstanceIdentifier(instanceId);
  return `staging.${stageId}.instances.${instanceId}.separationTimeS`;
}

export function stageInstanceIgnitionFailureKey(stageId: string, instanceId: string): string {
  validateIdentifier(stageId, "stage");
  validateStageInstanceIdentifier(instanceId);
  return `staging.${stageId}.instances.${instanceId}.ignitionFailed`;
}

function readBooleanState(
  state: RigidBodyState,
  key: string,
  label: string,
): boolean {
  const value = state.discreteState?.[key];
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`${label} must be boolean`);
  }
  return value === true;
}

export function stageIgnitionTime(
  state: RigidBodyState,
  stageId: string,
): number | null {
  const value = state.discreteState?.[stageIgnitionTimeKey(stageId)];
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error(`stage ${stageId} ignition time must be a finite number`);
  }
  return typeof value === "number" ? value : null;
}

function readOptionalTimeState(state: RigidBodyState, key: string, label: string): number | null {
  const value = state.discreteState?.[key];
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${label} must be a finite number`);
  }
  return typeof value === "number" ? value : null;
}

function stageInstanceIgnitionTime(
  state: RigidBodyState,
  stageId: string,
  instanceId: string,
): number | null {
  const instanceTime = readOptionalTimeState(
    state,
    stageInstanceIgnitionTimeKey(stageId, instanceId),
    `stage ${stageId} instance ${instanceId} ignition time`,
  );
  return instanceTime ?? stageIgnitionTime(state, stageId);
}

function stageInstanceSeparated(state: RigidBodyState, stageId: string, instanceId: string): boolean {
  return (
    readBooleanState(
      state,
      stageSeparationKey(stageId),
      `stage ${stageId} separation state`,
    ) ||
    readBooleanState(
      state,
      stageInstanceSeparationKey(stageId, instanceId),
      `stage ${stageId} instance ${instanceId} separation state`,
    )
  );
}

function stageInstanceIgnitionFailed(state: RigidBodyState, stageId: string, instanceId: string): boolean {
  return (
    readBooleanState(
      state,
      stageIgnitionFailureKey(stageId),
      `stage ${stageId} ignition failure state`,
    ) ||
    readBooleanState(
      state,
      stageInstanceIgnitionFailureKey(stageId, instanceId),
      `stage ${stageId} instance ${instanceId} ignition failure state`,
    )
  );
}

function stageInstanceSeparationTime(
  state: RigidBodyState,
  stageId: string,
  instanceId: string,
): number | null {
  const logicalTime = readOptionalTimeState(
    state,
    stageSeparationTimeKey(stageId),
    `stage ${stageId} separation time`,
  );
  const instanceTime = readOptionalTimeState(
    state,
    stageInstanceSeparationTimeKey(stageId, instanceId),
    `stage ${stageId} instance ${instanceId} separation time`,
  );
  return instanceTime ?? logicalTime;
}

export function igniteStage(
  state: RigidBodyState,
  stageId: string,
  instanceId?: string,
): RigidBodyState {
  if (instanceId !== undefined) {
    validateStageInstanceIdentifier(instanceId);
    if (stageInstanceSeparated(state, stageId, instanceId)) {
      throw new Error(`cannot ignite separated stage ${stageId} instance ${instanceId}`);
    }
    const existingTime = stageInstanceIgnitionTime(state, stageId, instanceId);
    if (existingTime !== null) return state;
    return {
      ...state,
      discreteState: {
        ...(state.discreteState ?? {}),
        [stageInstanceIgnitionTimeKey(stageId, instanceId)]: state.timeS,
      },
    };
  }
  if (readBooleanState(state, stageSeparationKey(stageId), `stage ${stageId} separation state`)) {
    throw new Error(`cannot ignite separated stage ${stageId}`);
  }
  const existingTime = stageIgnitionTime(state, stageId);
  if (existingTime !== null) return state;
  return {
    ...state,
    discreteState: {
      ...(state.discreteState ?? {}),
      [stageIgnitionTimeKey(stageId)]: state.timeS,
    },
  };
}

export function separateStage(
  state: RigidBodyState,
  stageId: string,
  separationDeltaVBodyMps: Vector3 = ZERO_VECTOR,
  instanceId?: string,
): RigidBodyState {
  if (!finiteVector(separationDeltaVBodyMps)) {
    throw new Error("stage separation delta-v must be finite");
  }
  const deltaVelocityWorldMps = rotateBodyToWorld(
    state.orientationBodyToWorld,
    separationDeltaVBodyMps,
  );
  const discreteState = {
    ...(state.discreteState ?? {}),
    ...(instanceId === undefined
      ? {
          [stageSeparationKey(stageId)]: true,
          [stageSeparationTimeKey(stageId)]: state.timeS,
        }
      : {
          [stageInstanceSeparationKey(stageId, instanceId)]: true,
          [stageInstanceSeparationTimeKey(stageId, instanceId)]: state.timeS,
        }),
  };
  return {
    ...state,
    velocityWorldMps: addVectors(state.velocityWorldMps, deltaVelocityWorldMps),
    discreteState,
  };
}

export function failStageIgnition(
  state: RigidBodyState,
  stageId: string,
  instanceId?: string,
): RigidBodyState {
  if (instanceId !== undefined) validateStageInstanceIdentifier(instanceId);
  return {
    ...state,
    discreteState: {
      ...(state.discreteState ?? {}),
      [instanceId === undefined
        ? stageIgnitionFailureKey(stageId)
        : stageInstanceIgnitionFailureKey(stageId, instanceId)]: true,
    },
  };
}

export function initializeMultiStageState(
  state: RigidBodyState,
  initiallyIgnitedStageIds: readonly string[],
): RigidBodyState {
  return initiallyIgnitedStageIds.reduce(
    (current, stageId) => igniteStage(current, stageId),
    state,
  );
}

export function createScheduledStageIgnitionEvent(input: Readonly<{
  stageId: string;
  instanceId?: string;
  timeS: number;
  label?: string;
}>): ScheduledRigidBodyEvent {
  validateIdentifier(input.stageId, "stage");
  if (input.instanceId !== undefined) validateStageInstanceIdentifier(input.instanceId);
  return {
    id: `staging-${input.stageId}${input.instanceId ? `-${input.instanceId}` : ""}-ignition`,
    label: input.label ?? `${input.stageId}${input.instanceId ? ` instance ${input.instanceId}` : ""} stage ignition`,
    kind: "ignition",
    priority: 20,
    timeS: input.timeS,
    apply: (state) => igniteStage(state, input.stageId, input.instanceId),
  };
}

export function createScheduledStageSeparationEvent(input: Readonly<{
  stageId: string;
  instanceId?: string;
  timeS: number;
  label?: string;
  separationDeltaVBodyMps?: Vector3;
}>): ScheduledRigidBodyEvent {
  validateIdentifier(input.stageId, "stage");
  if (input.instanceId !== undefined) validateStageInstanceIdentifier(input.instanceId);
  if (input.separationDeltaVBodyMps && !finiteVector(input.separationDeltaVBodyMps)) {
    throw new Error("stage separation delta-v must be finite");
  }
  const separationLabel = input.separationDeltaVBodyMps
    ? ` (body dV ${input.separationDeltaVBodyMps.x.toFixed(2)},${input.separationDeltaVBodyMps.y.toFixed(2)},${input.separationDeltaVBodyMps.z.toFixed(2)} m/s)`
    : "";
  return {
    id: `staging-${input.stageId}${input.instanceId ? `-${input.instanceId}` : ""}-separation`,
    label: input.label ?? `${input.stageId}${input.instanceId ? ` instance ${input.instanceId}` : ""} stage separation${separationLabel}`,
    kind: "separation",
    priority: 10,
    timeS: input.timeS,
    apply: (state) => separateStage(state, input.stageId, input.separationDeltaVBodyMps, input.instanceId),
    separationDeltaVBodyMps: input.separationDeltaVBodyMps ?? ZERO_VECTOR,
  };
}

export function createScheduledStageIgnitionFailureEvent(input: Readonly<{
  stageId: string;
  instanceId?: string;
  timeS: number;
  label?: string;
}>): ScheduledRigidBodyEvent {
  validateIdentifier(input.stageId, "stage");
  if (input.instanceId !== undefined) validateStageInstanceIdentifier(input.instanceId);
  return {
    id: `staging-${input.stageId}${input.instanceId ? `-${input.instanceId}` : ""}-ignition-failure`,
    label: input.label ?? `${input.stageId}${input.instanceId ? ` instance ${input.instanceId}` : ""} stage ignition failure`,
    kind: "failure",
    priority: 30,
    timeS: input.timeS,
    apply: (state) => failStageIgnition(state, input.stageId, input.instanceId),
  };
}

function burnoutEventValue(
  state: RigidBodyState,
  stageId: string,
  burnoutOffsetS: number,
  delayS: number,
  allowSeparated: boolean,
  instanceId?: string,
): number {
  const separated = instanceId === undefined
    ? readBooleanState(
        state,
        stageSeparationKey(stageId),
        `stage ${stageId} separation state`,
      )
    : stageInstanceSeparated(state, stageId, instanceId);
  const ignitionFailed = instanceId === undefined
    ? readBooleanState(
        state,
        stageIgnitionFailureKey(stageId),
        `stage ${stageId} ignition failure state`,
      )
    : stageInstanceIgnitionFailed(state, stageId, instanceId);
  if (
    (!allowSeparated && separated) || ignitionFailed
  ) {
    return -1;
  }
  const ignitionTimeS = instanceId === undefined
    ? stageIgnitionTime(state, stageId)
    : stageInstanceIgnitionTime(state, stageId, instanceId);
  return ignitionTimeS === null
    ? -1
    : state.timeS - ignitionTimeS - burnoutOffsetS - delayS;
}

export function createMultiStageVehicleModel(input: Readonly<{
  retainedMassProperties: MassProperties;
  stages: readonly RocketStage[];
}>): MultiStageVehicleModel {
  validateMassProperties(input.retainedMassProperties, "retained vehicle");
  if (input.stages.length === 0) {
    throw new Error("a multi-stage vehicle requires at least one stage");
  }
  const prepareMotors = (
    motorsInput: readonly MultiStageMotor[],
    label: string,
  ): readonly PreparedMotor[] => {
    if (motorsInput.length === 0) throw new Error(`${label} requires at least one motor`);
    const motors: PreparedMotor[] = motorsInput.map((motor) => {
      validateIdentifier(motor.id, "motor");
      if (!motor.name.trim()) throw new Error("motors must have names");
      const thrustCurve = [...motor.thrustCurve];
      validateThrustCurve(thrustCurve);
      const totalImpulseNs = totalImpulse(thrustCurve);
      if (!(totalImpulseNs > 0)) {
        throw new Error(`motor ${motor.id} thrust curve must have positive total impulse`);
      }
      const massFlowHistoryKgS = motor.massFlowHistoryKgS === undefined
        ? undefined
        : [...motor.massFlowHistoryKgS];
      const totalMassFlowKg = massFlowHistoryKgS
        ? totalMassFlow(massFlowHistoryKgS)
        : undefined;
      if (massFlowHistoryKgS) {
        validateMassFlowHistory(massFlowHistoryKgS);
        if (!(totalMassFlowKg! > 0)) {
          throw new Error(`motor ${motor.id} mass-flow history must consume positive mass`);
        }
        if (
          totalMassFlowKg! >
          motor.initialPropellantMassProperties.massKg * (1 + 1e-9)
        ) {
          throw new Error(`motor ${motor.id} mass-flow history exceeds initial propellant mass`);
        }
      }
      validateMassProperties(motor.dryMassProperties, `motor ${motor.id} dry`);
      validateMassProperties(
        motor.initialPropellantMassProperties,
        `motor ${motor.id} propellant`,
      );
      assertNonNegative(motor.ignitionDelayS ?? 0, `motor ${motor.id} ignition delay`);
      if (!finiteVector(motor.thrustApplicationPointBodyM)) {
        throw new Error(`motor ${motor.id} thrust application point must be finite`);
      }
      const axis = motor.thrustAxisBody ?? { x: -1, y: 0, z: 0 };
      const normalizedThrustAxisBody = normalizeThrustAxis(axis, `motor ${motor.id} thrust axis`);
      const normalizedThrustAxisSchedule = prepareThrustAxisSchedule(
        motor.thrustAxisSchedule,
        `motor ${motor.id} thrust-axis schedule`,
      );
      const normalizedGimbalResponseTimeS = prepareGimbalResponseTime(
        motor.gimbalResponseTimeS,
        `motor ${motor.id} gimbal response time`,
      );
      if (normalizedGimbalResponseTimeS !== undefined && normalizedThrustAxisSchedule === undefined) {
        throw new Error(`motor ${motor.id} gimbal response time requires a thrust-axis schedule`);
      }
      const ignitionFailure = motor.ignitionFailure ?? false;
      if (typeof ignitionFailure !== "boolean") {
        throw new Error(`motor ${motor.id} ignition failure must be boolean`);
      }
      return {
        ...motor,
        ignitionFailure,
        thrustCurve,
        ...(massFlowHistoryKgS ? { massFlowHistoryKgS, totalMassFlowKg } : {}),
        normalizedThrustAxisBody,
        ...(normalizedThrustAxisSchedule
          ? { normalizedThrustAxisSchedule }
          : {}),
        ...(normalizedGimbalResponseTimeS !== undefined
          ? { normalizedGimbalResponseTimeS }
          : {}),
        totalImpulseNs,
      };
    });
    if (new Set(motors.map((motor) => motor.id)).size !== motors.length) {
      throw new Error(`motor identifiers must be unique within ${label}`);
    }
    return motors;
  };
  const burnoutOffset = (motors: readonly PreparedMotor[]): number => Math.max(
    0,
    ...motors
      .filter((motor) => !motor.ignitionFailure)
      .map((motor) => (motor.ignitionDelayS ?? 0) + motor.thrustCurve.at(-1)!.timeS),
  );
  const stages: PreparedStage[] = input.stages.map((stage) => {
    validateIdentifier(stage.id, "stage");
    if (!stage.name.trim()) throw new Error("stages must have names");
    validateMassProperties(stage.structuralMassProperties, `stage ${stage.id} structure`);
    const separationDeltaVBodyMps = stage.separationDeltaVBodyMps ?? 0;
    assertNonNegative(separationDeltaVBodyMps, `stage ${stage.id} separation delta-v`);
    const separationImpulseBodyNs = validateSeparationImpulse(
      stage.separationImpulseBodyNs,
      `stage ${stage.id} separation impulse`,
    );
    if (separationImpulseBodyNs && separationDeltaVBodyMps > 0) {
      throw new Error(`stage ${stage.id} cannot configure both separation delta-v and separation impulse`);
    }
    const motors = prepareMotors(stage.motors, `stage ${stage.id}`);
    const rawInstances = stage.instances ?? [{
      id: stage.id,
      name: stage.name,
      structuralMassProperties: stage.structuralMassProperties,
      motors: stage.motors,
      separationDeltaVBodyMps,
      ...(separationImpulseBodyNs ? { separationImpulseBodyNs } : {}),
    }];
    if (rawInstances.length === 0) throw new Error(`stage ${stage.id} requires at least one physical instance`);
    const instanceIds = new Set<string>();
    const instances: PreparedStageInstance[] = rawInstances.map((instance) => {
      validateIdentifier(instance.id, "stage instance");
      if (instanceIds.has(instance.id)) throw new Error(`stage instance identifiers must be unique within ${stage.id}`);
      instanceIds.add(instance.id);
      if (!instance.name.trim()) throw new Error("stage instances must have names");
      validateMassProperties(instance.structuralMassProperties, `stage ${stage.id} instance ${instance.id} structure`);
      const instanceDeltaV = instance.separationDeltaVBodyMps ?? separationDeltaVBodyMps;
      assertNonNegative(instanceDeltaV, `stage ${stage.id} instance ${instance.id} separation delta-v`);
      const instanceImpulse = validateSeparationImpulse(
        instance.separationImpulseBodyNs ?? separationImpulseBodyNs,
        `stage ${stage.id} instance ${instance.id} separation impulse`,
      );
      if (instanceImpulse && instanceDeltaV > 0) {
        throw new Error(`stage ${stage.id} instance ${instance.id} cannot configure both separation delta-v and separation impulse`);
      }
      const instanceMotors = prepareMotors(instance.motors, `stage ${stage.id} instance ${instance.id}`);
      return {
        ...instance,
        separationDeltaVBodyMps: instanceDeltaV,
        ...(instanceImpulse ? { separationImpulseBodyNs: instanceImpulse } : {}),
        motors: instanceMotors,
        burnoutOffsetS: burnoutOffset(instanceMotors),
      };
    });
    return {
      ...stage,
      separationDeltaVBodyMps,
      ...(separationImpulseBodyNs ? { separationImpulseBodyNs } : {}),
      motors,
      instances,
      burnoutOffsetS: Math.max(...instances.map((instance) => instance.burnoutOffsetS)),
    };
  });
  if (new Set(stages.map((stage) => stage.id)).size !== stages.length) {
    throw new Error("stage identifiers must be unique");
  }
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const requireStage = (stageId: string): PreparedStage => {
    const stage = stageById.get(stageId);
    if (!stage) throw new Error(`unknown stage ${stageId}`);
    return stage;
  };
  const requireStageInstance = (
    stage: PreparedStage,
    instanceId: string,
  ): PreparedStageInstance => {
    validateStageInstanceIdentifier(instanceId);
    const instance = stage.instances.find((candidate) => candidate.id === instanceId);
    if (!instance) throw new Error(`unknown stage ${stage.id} instance ${instanceId}`);
    return instance;
  };
  const measuredMassFlowMotors = stages.flatMap((stage) => [
    ...stage.motors,
    ...stage.instances.flatMap((instance) => instance.motors),
  ]).filter((motor) => motor.massFlowHistoryKgS);
  const hasMeasuredMassFlow = measuredMassFlowMotors.length > 0;
  const hasResidualMeasuredPropellant = measuredMassFlowMotors.some(
    (motor) =>
      (motor.totalMassFlowKg ?? motor.initialPropellantMassProperties.massKg) <
      motor.initialPropellantMassProperties.massKg * (1 - 1e-9),
  );
  const gimbalMotors = stages.flatMap((stage) => [
    ...stage.motors,
    ...stage.instances.flatMap((instance) => instance.motors),
  ]).filter((motor) => motor.normalizedThrustAxisSchedule);
  const hasGimbalSchedule = gimbalMotors.length > 0;
  const hasGimbalResponse = gimbalMotors.some(
    (motor) => motor.normalizedGimbalResponseTimeS !== undefined,
  );
  const measuredSeparationStages = stages.filter((stage) =>
    stage.separationImpulseBodyNs !== undefined ||
    stage.instances.some((instance) => instance.separationImpulseBodyNs !== undefined),
  );
  const hasMeasuredSeparationImpulse = measuredSeparationStages.length > 0;

  const evaluate = (state: RigidBodyState): MultiStageVehicleEvaluation => {
    if (!Number.isFinite(state.timeS)) throw new Error("staging state time must be finite");

    const prepared: PreparedStageState[] = stages.map((stage) => ({
      stage,
      instances: stage.instances.map((instance): PreparedStageInstanceState => {
        const separated = stageInstanceSeparated(state, stage.id, instance.id);
        const separationTimeS = stageInstanceSeparationTime(state, stage.id, instance.id);
        if (separationTimeS !== null && separationTimeS > state.timeS + 1e-12) {
          throw new Error(`stage ${stage.id} instance ${instance.id} separation time cannot be in the future`);
        }
        if (separated !== (separationTimeS !== null)) {
          throw new Error(
            `stage ${stage.id} instance ${instance.id} separation flag and time must be recorded together`,
          );
        }
        const ignitionCommandTimeS = stageInstanceIgnitionTime(state, stage.id, instance.id);
        if (ignitionCommandTimeS !== null && ignitionCommandTimeS > state.timeS + 1e-12) {
          throw new Error(`stage ${stage.id} instance ${instance.id} ignition time cannot be in the future`);
        }
        return {
          instance,
          separated,
          separationTimeS,
          ignitionFailed: stageInstanceIgnitionFailed(state, stage.id, instance.id),
          ignitionCommandTimeS,
        };
      }),
    }));

    const motorLocalTime = (
      item: PreparedStageInstanceState,
      motor: PreparedMotor,
    ): number | null =>
      item.ignitionCommandTimeS === null || item.ignitionFailed || motor.ignitionFailure
        ? null
        : state.timeS - item.ignitionCommandTimeS - (motor.ignitionDelayS ?? 0);
    const deliveredImpulse = (motor: PreparedMotor, localTimeS: number | null): number =>
      localTimeS === null
        ? 0
        : Math.min(
            motor.totalImpulseNs,
            Math.max(0, impulseThrough(motor.thrustCurve as ThrustPoint[], localTimeS)),
          );
    const consumedFraction = (motor: PreparedMotor, localTimeS: number | null): number => {
      if (localTimeS === null) return 0;
      if (!motor.massFlowHistoryKgS) {
        return deliveredImpulse(motor, localTimeS) / motor.totalImpulseNs;
      }
      const consumedMassKg = Math.min(
        motor.initialPropellantMassProperties.massKg,
        Math.max(0, massFlowThrough(motor.massFlowHistoryKgS, localTimeS)),
      );
      return consumedMassKg / motor.initialPropellantMassProperties.massKg;
    };

    const massParts: MassProperties[] = [input.retainedMassProperties];
    for (const stageState of prepared) {
      for (const instanceState of stageState.instances) {
        if (instanceState.separated) continue;
        massParts.push(instanceState.instance.structuralMassProperties);
        for (const motor of instanceState.instance.motors) {
          massParts.push(motor.dryMassProperties);
          const localTimeS = motorLocalTime(instanceState, motor);
          const remainingFraction = Math.max(
            0,
            1 - consumedFraction(motor, localTimeS),
          );
          if (remainingFraction > 0) {
            massParts.push(scaledMassProperties(motor.initialPropellantMassProperties, remainingFraction));
          }
        }
      }
    }
    const massProperties = combineMassProperties(massParts);
    let inertiaRateBodyKgM2PerS: Matrix3 = ZERO_MATRIX;
    let netThrustForceBodyN: Vector3 = ZERO_VECTOR;
    let netThrustMomentBodyNm: Vector3 = ZERO_VECTOR;

    const evaluateInstance = (
      item: PreparedStageInstanceState,
    ): RocketStageInstanceEvaluation => {
      const motorEvaluations = item.instance.motors.map(
        (motor): MultiStageMotorEvaluation => {
          const localTimeS = motorLocalTime(item, motor);
          const deliveredImpulseNs = deliveredImpulse(motor, localTimeS);
          const consumedFractionValue = consumedFraction(motor, localTimeS);
          const remainingPropellantFraction = Math.max(
            0,
            1 - consumedFractionValue,
          );
          const curveEndS = motor.thrustCurve.at(-1)!.timeS;
          const thrustN =
            item.separated ||
            item.ignitionFailed ||
            motor.ignitionFailure ||
            localTimeS === null ||
            remainingPropellantFraction <= 1e-14
              ? 0
              : thrustAt(motor.thrustCurve as ThrustPoint[], localTimeS);
          const propellantMassRateKgS = motor.massFlowHistoryKgS
            ? !item.separated &&
              !item.ignitionFailed &&
              !motor.ignitionFailure &&
              localTimeS !== null &&
              remainingPropellantFraction > 1e-14
              ? -massFlowAt(motor.massFlowHistoryKgS, localTimeS)
              : 0
            : !item.separated &&
              !item.ignitionFailed &&
              !motor.ignitionFailure &&
              localTimeS !== null &&
              localTimeS >= motor.thrustCurve[0].timeS &&
              localTimeS < curveEndS &&
              remainingPropellantFraction > 1e-14
                ? (-motor.initialPropellantMassProperties.massKg * thrustN) /
                  motor.totalImpulseNs
                : 0;
          const thrustAxisBody = thrustAxisAtLocalTime(motor, localTimeS);
          const forceBodyN = scaleVector(thrustAxisBody, thrustN);
          const momentBodyNm = cross(
            subtractVectors(motor.thrustApplicationPointBodyM, massProperties.centerOfMassM),
            forceBodyN,
          );
          if (propellantMassRateKgS !== 0) {
            inertiaRateBodyKgM2PerS = addMatrices(
              inertiaRateBodyKgM2PerS,
              shiftInertia(
                scaleMatrix(
                  motor.initialPropellantMassProperties.inertiaAtCenterKgM2,
                  propellantMassRateKgS / motor.initialPropellantMassProperties.massKg,
                ),
                propellantMassRateKgS,
                subtractVectors(
                  motor.initialPropellantMassProperties.centerOfMassM,
                  massProperties.centerOfMassM,
                ),
              ),
            );
          }
          netThrustForceBodyN = addVectors(netThrustForceBodyN, forceBodyN);
          netThrustMomentBodyNm = addVectors(netThrustMomentBodyNm, momentBodyNm);
          const phase = item.separated
            ? "separated"
            : item.ignitionFailed
              ? "ignition-failed"
              : motor.ignitionFailure
                ? "ignition-failed"
                : localTimeS === null || localTimeS < motor.thrustCurve[0].timeS
                  ? "waiting"
                  : localTimeS >= curveEndS || remainingPropellantFraction <= 1e-14
                    ? "burned-out"
                    : "burning";
          return {
            id: motor.id,
            name: motor.name,
            localTimeS,
            phase,
            thrustN,
            totalImpulseNs: motor.totalImpulseNs,
            deliveredImpulseNs,
            remainingPropellantFraction,
            propellantMassKg: item.separated
              ? 0
              : motor.initialPropellantMassProperties.massKg * remainingPropellantFraction,
            propellantMassRateKgS,
            depletionSource: motor.massFlowHistoryKgS
              ? "measured-mass-flow"
              : "impulse-proportional",
            thrustAxisBody,
            forceBodyN,
            momentBodyNm,
          };
        },
      );
      const hasBurningMotor = motorEvaluations.some((motor) => motor.phase === "burning");
      const hasWaitingMotor = motorEvaluations.some((motor) => motor.phase === "waiting");
      const phase: StagePhase = item.separated
        ? "separated"
        : item.ignitionFailed
          ? "ignition-failed"
          : item.ignitionCommandTimeS === null
            ? "waiting"
            : hasBurningMotor
              ? "burning"
              : hasWaitingMotor
                ? "ignition-delayed"
                : "burned-out";
      return {
        id: item.instance.id,
        name: item.instance.name,
        phase,
        attached: !item.separated,
        ignitionCommandTimeS: item.ignitionCommandTimeS,
        separationTimeS: item.separationTimeS,
        ignitionFailed: item.ignitionFailed,
        burnoutTimeS:
          item.ignitionCommandTimeS === null
            ? null
            : item.ignitionCommandTimeS + item.instance.burnoutOffsetS,
        massKg: item.separated
          ? 0
          : item.instance.structuralMassProperties.massKg +
            motorEvaluations.reduce(
              (sum, motor, index) =>
                sum + item.instance.motors[index].dryMassProperties.massKg + motor.propellantMassKg,
              0,
            ),
        propellantMassKg: motorEvaluations.reduce(
          (sum, motor) => sum + motor.propellantMassKg,
          0,
        ),
        thrustN: motorEvaluations.reduce((sum, motor) => sum + motor.thrustN, 0),
        motors: motorEvaluations,
      };
    };

    const stageEvaluations = prepared.map((stageState): RocketStageEvaluation => {
      const instanceEvaluations = stageState.instances.map(evaluateInstance);
      const attachedInstances = instanceEvaluations.filter((instance) => instance.attached);
      const allSeparated = attachedInstances.length === 0;
      const hasBurningInstance = instanceEvaluations.some((instance) => instance.phase === "burning");
      const hasIgnitionDelayedInstance = instanceEvaluations.some((instance) => instance.phase === "ignition-delayed");
      const hasWaitingInstance = instanceEvaluations.some((instance) => instance.phase === "waiting");
      const hasIgnitionFailedInstance = instanceEvaluations.some((instance) => instance.phase === "ignition-failed");
      const ignitionTimes = instanceEvaluations
        .map((instance) => instance.ignitionCommandTimeS)
        .filter((value): value is number => value !== null);
      const separationTimes = instanceEvaluations
        .map((instance) => instance.separationTimeS)
        .filter((value): value is number => value !== null);
      const ignitionCommandTimeS = ignitionTimes.length > 0 && ignitionTimes.every((time) => time === ignitionTimes[0])
        ? ignitionTimes[0]
        : null;
      const separationTimeS = separationTimes.length > 0
        ? Math.max(...separationTimes)
        : null;
      const stageIgnitionFailed = readBooleanState(
        state,
        stageIgnitionFailureKey(stageState.stage.id),
        `stage ${stageState.stage.id} ignition failure state`,
      );
      const phase: StagePhase = allSeparated
        ? "separated"
        : stageIgnitionFailed || (hasIgnitionFailedInstance && !hasBurningInstance && !hasIgnitionDelayedInstance && !hasWaitingInstance)
          ? "ignition-failed"
          : hasBurningInstance
            ? "burning"
            : hasIgnitionDelayedInstance
              ? "ignition-delayed"
              : hasWaitingInstance
                ? "waiting"
                : hasIgnitionFailedInstance
                  ? "ignition-failed"
                  : "burned-out";
      return {
        id: stageState.stage.id,
        name: stageState.stage.name,
        phase,
        attached: attachedInstances.length > 0,
        ignitionCommandTimeS,
        separationTimeS,
        ignitionFailed: stageIgnitionFailed || instanceEvaluations.every((instance) => instance.ignitionFailed),
        burnoutTimeS:
          ignitionCommandTimeS === null
            ? null
            : ignitionCommandTimeS + stageState.stage.burnoutOffsetS,
        massKg: instanceEvaluations.reduce((sum, instance) => sum + instance.massKg, 0),
        propellantMassKg: instanceEvaluations.reduce((sum, instance) => sum + instance.propellantMassKg, 0),
        thrustN: instanceEvaluations.reduce((sum, instance) => sum + instance.thrustN, 0),
        motors: instanceEvaluations.flatMap((instance) => instance.motors),
        instances: instanceEvaluations,
      };
    });

    return {
      timeS: state.timeS,
      massProperties,
      inertiaRateBodyKgM2PerS,
      totalThrustN: stageEvaluations.reduce((sum, stage) => sum + stage.thrustN, 0),
      netThrustForceBodyN,
      netThrustMomentBodyNm,
      attachedStageIds: stageEvaluations
        .filter((stage) => stage.attached)
        .map((stage) => stage.id),
      attachedStageInstanceIds: stageEvaluations.flatMap((stage) =>
        stage.instances.filter((instance) => instance.attached).map((instance) => instance.id),
      ),
      stages: stageEvaluations,
    };
  };

  const createBurnoutSeparationEvent = (eventInput: Readonly<{
    stageId: string;
    instanceId?: string;
    delayS?: number;
    label?: string;
    separationDeltaVBodyMps?: number;
    separationImpulseBodyNs?: Vector3;
  }>): StateTriggeredRigidBodyEvent => {
    const stage = requireStage(eventInput.stageId);
    const instance = eventInput.instanceId === undefined
      ? undefined
      : requireStageInstance(stage, eventInput.instanceId);
    const delayS = eventInput.delayS ?? 0;
    assertNonNegative(delayS, "stage separation delay");
    const separationDeltaVBodyMps = eventInput.separationDeltaVBodyMps ??
      instance?.separationDeltaVBodyMps ?? stage.separationDeltaVBodyMps ?? 0;
    assertNonNegative(separationDeltaVBodyMps, "stage separation delta-v");
    const separationImpulseBodyNs = validateSeparationImpulse(
      eventInput.separationImpulseBodyNs ??
        instance?.separationImpulseBodyNs ??
        stage.separationImpulseBodyNs,
      `stage ${stage.id} separation impulse`,
    );
    if (separationImpulseBodyNs && separationDeltaVBodyMps > 0) {
      throw new Error("stage separation cannot configure both delta-v and impulse");
    }
    const separationLabel = separationImpulseBodyNs
      ? ` (measured impulse ${separationImpulseBodyNs.x.toFixed(2)},${separationImpulseBodyNs.y.toFixed(2)},${separationImpulseBodyNs.z.toFixed(2)} N·s)`
      : separationDeltaVBodyMps > 0
        ? ` (+${separationDeltaVBodyMps.toFixed(2)} m/s body +X)`
        : "";
    const retainedDeltaVForState = (state: RigidBodyState): Vector3 => {
      if (!separationImpulseBodyNs) return { x: separationDeltaVBodyMps, y: 0, z: 0 };
      const stateAfterSeparation = separateStage(
        state,
        stage.id,
        ZERO_VECTOR,
        instance?.id,
      );
      const retainedMassKg = evaluate(stateAfterSeparation).massProperties.massKg;
      if (!(retainedMassKg > 0) || !Number.isFinite(retainedMassKg)) {
        throw new Error(`stage ${stage.id} retained post-separation mass must be positive for impulse conversion`);
      }
      return scaleVector(separationImpulseBodyNs, 1 / retainedMassKg);
    };
    const instanceSuffix = instance ? `-${instance.id}` : "";
    return {
      id: `staging-${stage.id}${instanceSuffix}-burnout-separation`,
      label: eventInput.label ?? `${stage.name}${instance ? ` ${instance.name}` : ""} separation after burnout${separationLabel}`,
      kind: "separation",
      priority: 10,
      direction: "rising",
      value: (state) =>
        burnoutEventValue(
          state,
          stage.id,
          instance?.burnoutOffsetS ?? stage.burnoutOffsetS,
          delayS,
          false,
          instance?.id,
        ),
      apply: (state) => separateStage(
        state,
        stage.id,
        retainedDeltaVForState(state),
        instance?.id,
      ),
      ...(separationImpulseBodyNs
        ? { separationImpulseBodyNs }
        : { separationDeltaVBodyMps: { x: separationDeltaVBodyMps, y: 0, z: 0 } }),
    };
  };

  const createBurnoutIgnitionEvent = (eventInput: Readonly<{
    sourceStageId: string;
    sourceInstanceId?: string;
    targetStageId: string;
    targetInstanceId?: string;
    delayS?: number;
    label?: string;
  }>): StateTriggeredRigidBodyEvent => {
    const source = requireStage(eventInput.sourceStageId);
    const target = requireStage(eventInput.targetStageId);
    const sourceInstance = eventInput.sourceInstanceId === undefined
      ? undefined
      : requireStageInstance(source, eventInput.sourceInstanceId);
    const targetInstance = eventInput.targetInstanceId === undefined
      ? undefined
      : requireStageInstance(target, eventInput.targetInstanceId);
    if (
      source.id === target.id &&
      (sourceInstance === undefined || targetInstance === undefined || sourceInstance.id === targetInstance.id)
    ) {
      throw new Error("a stage cannot ignite itself after burnout");
    }
    const delayS = eventInput.delayS ?? 0;
    assertNonNegative(delayS, "stage ignition delay");
    const sourceSuffix = sourceInstance ? `-${sourceInstance.id}` : "";
    const targetSuffix = targetInstance ? `-${targetInstance.id}` : "";
    return {
      id: `staging-${target.id}${targetSuffix}-ignition-after-${source.id}${sourceSuffix}-burnout`,
      label:
        eventInput.label ?? `${target.name}${targetInstance ? ` ${targetInstance.name}` : ""} ignition after ${source.name}${sourceInstance ? ` ${sourceInstance.name}` : ""} burnout`,
      kind: "ignition",
      priority: 20,
      direction: "rising",
      value: (state) =>
        burnoutEventValue(
          state,
          source.id,
          sourceInstance?.burnoutOffsetS ?? source.burnoutOffsetS,
          delayS,
          true,
          sourceInstance?.id,
        ),
      apply: (state) => igniteStage(state, target.id, targetInstance?.id),
    };
  };

  const stageMassProperties = (
    state: RigidBodyState,
    stageId: string,
    instanceId?: string,
  ): MassProperties => {
    const stage = requireStage(stageId);
    if (instanceId !== undefined) requireStageInstance(stage, instanceId);
    const evaluation = evaluate(state);
    const stageEvaluation = evaluation.stages.find((item) => item.id === stageId);
    if (!stageEvaluation) {
      throw new Error(`stage ${stageId} is not present in the requested state`);
    }
    const selectedInstances = instanceId === undefined
      ? stageEvaluation.instances.filter((instance) => instance.attached)
      : [stageEvaluation.instances.find((instance) => instance.id === instanceId)].filter(
          (instance): instance is RocketStageInstanceEvaluation => instance !== undefined && instance.attached,
        );
    if (selectedInstances.length === 0) {
      const label = instanceId === undefined ? `stage ${stageId}` : `stage ${stageId} instance ${instanceId}`;
      throw new Error(`${label} is not attached at the requested state`);
    }
    const parts: MassProperties[] = [];
    for (const selected of selectedInstances) {
      const instance = requireStageInstance(stage, selected.id);
      parts.push(instance.structuralMassProperties);
      instance.motors.forEach((motor, index) => {
        parts.push(motor.dryMassProperties);
        const remainingFraction = selected.motors[index]?.remainingPropellantFraction ?? 0;
        if (remainingFraction > 0) {
          parts.push(scaledMassProperties(motor.initialPropellantMassProperties, remainingFraction));
        }
      });
    }
    return combineMassProperties(parts);
  };

  return {
    modelVersion: MULTI_STAGE_MODEL_VERSION,
    validationStatus: "analytical-component-checks-only",
    stageIds: stages.map((stage) => stage.id),
    evaluate,
    stageMassProperties,
    body: (state) => {
      const result = evaluate(state);
      return {
        massKg: result.massProperties.massKg,
        inertiaBodyKgM2: result.massProperties.inertiaAtCenterKgM2,
        inertiaRateBodyKgM2PerS: result.inertiaRateBodyKgM2PerS,
      };
    },
    loads: (state) => {
      const result = evaluate(state);
      return {
        forceBodyN: result.netThrustForceBodyN,
        momentBodyNm: result.netThrustMomentBodyNm,
      };
    },
    propulsion: (state) => {
      const result = evaluate(state);
      return {
        totalThrustN: result.totalThrustN,
        netThrustForceBodyN: result.netThrustForceBodyN,
        netThrustMomentBodyNm: result.netThrustMomentBodyNm,
        centerOfMassBodyM: result.massProperties.centerOfMassM,
        motors: [],
      };
    },
    stageInstanceIds: (stageId) => requireStage(stageId).instances.map((instance) => instance.id),
    burnoutOffsetS: (stageId, instanceId) => {
      const stage = requireStage(stageId);
      return instanceId === undefined
        ? stage.burnoutOffsetS
        : requireStageInstance(stage, instanceId).burnoutOffsetS;
    },
    createBurnoutSeparationEvent,
    createBurnoutIgnitionEvent,
    assumptions: [
      "Stages are rigidly attached until an explicit separation event",
      "Stage ignition commands establish motor-local time; each motor may add a deterministic delay",
      ...(hasGimbalSchedule
        ? [
            ...(hasGimbalResponse
              ? [
                  "Motor thrust-axis schedules are evaluated in motor-local time; response-free stages linearly interpolate between knots, while stages with a response time treat each knot as a command and apply a deterministic first-order vector lag",
                ]
              : [
                  "Motor thrust-axis schedules are linearly interpolated in motor-local time and normalized before force and moment evaluation",
                ]),
          ]
        : []),
      ...(hasMeasuredSeparationImpulse
        ? [
            "Measured separation impulses are converted to retained-body delta-v using the live post-separation mass at the event boundary",
          ]
        : []),
      ...(hasMeasuredMassFlow
        ? [
            "When supplied, positive measured mass-flow history directly drives motor propellant depletion while thrust remains an independent curve",
            "Measured mass-flow history is linearly interpolated and integrated between its supplied knots",
          ]
        : ["Propellant consumption is proportional to delivered impulse"]),
      "Separated stages, their motors, and remaining propellant leave the tracked vehicle immediately",
      "A configured separation delta-v is applied instantaneously to the retained body in its body-frame +X direction; a zero value preserves translational and angular velocity",
    ],
    warnings: [
      "This staging model has analytical component checks only and is not flight-safety validated.",
      "Pyrotechnic mechanism, spring forces, joint constraints, plume impingement, collision risk, equal-and-opposite discarded-stage impulse, and coupled discarded-stage trajectories are not modeled; the browser adapter may expose a separate ballistic component check.",
      "Stage separation is an instantaneous topology change; use a dedicated multi-body model for separation-clearance analysis.",
      ...(hasGimbalSchedule
        ? [
            ...(hasGimbalResponse
              ? [
                  "Gimbal response is a bounded first-order vector-lag approximation; rate limits, saturation, servo dynamics, flexure, plume effects, and control-loop coupling are not modeled.",
                ]
              : [
                  "Gimbal schedules are deterministic commanded-axis previews; actuator dynamics, rate limits, flexure, plume effects, and control-loop coupling are not modeled.",
                ]),
          ]
        : []),
      ...(hasMeasuredSeparationImpulse
        ? [
            "Measured separation impulses are user-supplied vectors; calibration, timing uncertainty, mechanism compliance, and equal-and-opposite discarded-body dynamics remain outside this staged model.",
          ]
        : []),
      ...(hasMeasuredMassFlow
        ? [
            "Measured mass-flow history is accepted as user-supplied evidence; sensor calibration, phase lag, residual propellant, and sample uncertainty are not independently validated.",
            ...(hasResidualMeasuredPropellant
              ? [
                  "At least one measured mass-flow history integrates below its declared initial propellant mass; residual propellant remains attached after the supplied history ends.",
                ]
              : []),
          ]
        : [
            "Impulse-proportional depletion is approximate unless thrust tracks propellant mass flow at effectively constant exhaust velocity.",
          ]),
    ],
  };
}
