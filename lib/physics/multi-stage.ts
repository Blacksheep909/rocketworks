import { impulseThrough, thrustAt, totalImpulse, validateThrustCurve, type ThrustPoint } from "./curves.ts";
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

export const MULTI_STAGE_MODEL_VERSION = "kestrel-multi-stage-0.2.2";

export type MultiStageMotor = Readonly<{
  id: string;
  name: string;
  ignitionDelayS?: number;
  thrustCurve: readonly ThrustPoint[];
  dryMassProperties: MassProperties;
  initialPropellantMassProperties: MassProperties;
  thrustApplicationPointBodyM: Vector3;
  thrustAxisBody?: Vector3;
  /** A configured ignition failure leaves this motor attached with its propellant intact. */
  ignitionFailure?: boolean;
}>;

export type RocketStage = Readonly<{
  id: string;
  name: string;
  structuralMassProperties: MassProperties;
  motors: readonly MultiStageMotor[];
  /** Retained-body axial separation delta-v in the body frame (+X nose direction). */
  separationDeltaVBodyMps?: number;
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
}>;

export type MultiStageVehicleEvaluation = Readonly<{
  timeS: number;
  massProperties: MassProperties;
  inertiaRateBodyKgM2PerS: Matrix3;
  totalThrustN: number;
  netThrustForceBodyN: Vector3;
  netThrustMomentBodyNm: Vector3;
  attachedStageIds: readonly string[];
  stages: readonly RocketStageEvaluation[];
}>;

export type MultiStageVehicleModel = Readonly<{
  modelVersion: string;
  validationStatus: "analytical-component-checks-only";
  stageIds: readonly string[];
  evaluate: (state: RigidBodyState) => MultiStageVehicleEvaluation;
  stageMassProperties: (state: RigidBodyState, stageId: string) => MassProperties;
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
  burnoutOffsetS: (stageId: string) => number;
  createBurnoutSeparationEvent: (input: Readonly<{
    stageId: string;
    delayS?: number;
    label?: string;
    separationDeltaVBodyMps?: number;
  }>) => StateTriggeredRigidBodyEvent;
  createBurnoutIgnitionEvent: (input: Readonly<{
    sourceStageId: string;
    targetStageId: string;
    delayS?: number;
    label?: string;
  }>) => StateTriggeredRigidBodyEvent;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

type PreparedMotor = MultiStageMotor & Readonly<{
  thrustCurve: readonly ThrustPoint[];
  normalizedThrustAxisBody: Vector3;
  totalImpulseNs: number;
}>;

type PreparedStage = Omit<RocketStage, "motors"> & Readonly<{
  motors: readonly PreparedMotor[];
  burnoutOffsetS: number;
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

function finiteVector(vector: Vector3): boolean {
  return [vector.x, vector.y, vector.z].every(Number.isFinite);
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

export function igniteStage(
  state: RigidBodyState,
  stageId: string,
): RigidBodyState {
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
): RigidBodyState {
  if (!finiteVector(separationDeltaVBodyMps)) {
    throw new Error("stage separation delta-v must be finite");
  }
  const deltaVelocityWorldMps = rotateBodyToWorld(
    state.orientationBodyToWorld,
    separationDeltaVBodyMps,
  );
  return {
    ...state,
    velocityWorldMps: addVectors(state.velocityWorldMps, deltaVelocityWorldMps),
    discreteState: {
      ...(state.discreteState ?? {}),
      [stageSeparationKey(stageId)]: true,
      [stageSeparationTimeKey(stageId)]: state.timeS,
    },
  };
}

export function failStageIgnition(
  state: RigidBodyState,
  stageId: string,
): RigidBodyState {
  return {
    ...state,
    discreteState: {
      ...(state.discreteState ?? {}),
      [stageIgnitionFailureKey(stageId)]: true,
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
  timeS: number;
  label?: string;
}>): ScheduledRigidBodyEvent {
  validateIdentifier(input.stageId, "stage");
  return {
    id: `staging-${input.stageId}-ignition`,
    label: input.label ?? `${input.stageId} stage ignition`,
    timeS: input.timeS,
    apply: (state) => igniteStage(state, input.stageId),
  };
}

export function createScheduledStageSeparationEvent(input: Readonly<{
  stageId: string;
  timeS: number;
  label?: string;
  separationDeltaVBodyMps?: Vector3;
}>): ScheduledRigidBodyEvent {
  validateIdentifier(input.stageId, "stage");
  if (input.separationDeltaVBodyMps && !finiteVector(input.separationDeltaVBodyMps)) {
    throw new Error("stage separation delta-v must be finite");
  }
  const separationLabel = input.separationDeltaVBodyMps
    ? ` (body dV ${input.separationDeltaVBodyMps.x.toFixed(2)},${input.separationDeltaVBodyMps.y.toFixed(2)},${input.separationDeltaVBodyMps.z.toFixed(2)} m/s)`
    : "";
  return {
    id: `staging-${input.stageId}-separation`,
    label: input.label ?? `${input.stageId} stage separation${separationLabel}`,
    timeS: input.timeS,
    apply: (state) => separateStage(state, input.stageId, input.separationDeltaVBodyMps),
  };
}

export function createScheduledStageIgnitionFailureEvent(input: Readonly<{
  stageId: string;
  timeS: number;
  label?: string;
}>): ScheduledRigidBodyEvent {
  validateIdentifier(input.stageId, "stage");
  return {
    id: `staging-${input.stageId}-ignition-failure`,
    label: input.label ?? `${input.stageId} stage ignition failure`,
    timeS: input.timeS,
    apply: (state) => failStageIgnition(state, input.stageId),
  };
}

function burnoutEventValue(
  state: RigidBodyState,
  stageId: string,
  burnoutOffsetS: number,
  delayS: number,
  allowSeparated: boolean,
): number {
  if (
    (!allowSeparated &&
      readBooleanState(
        state,
        stageSeparationKey(stageId),
        `stage ${stageId} separation state`,
      )) ||
    readBooleanState(
      state,
      stageIgnitionFailureKey(stageId),
      `stage ${stageId} ignition failure state`,
    )
  ) {
    return -1;
  }
  const ignitionTimeS = stageIgnitionTime(state, stageId);
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
  const stages: PreparedStage[] = input.stages.map((stage) => {
    validateIdentifier(stage.id, "stage");
    if (!stage.name.trim()) throw new Error("stages must have names");
    validateMassProperties(stage.structuralMassProperties, `stage ${stage.id} structure`);
    const separationDeltaVBodyMps = stage.separationDeltaVBodyMps ?? 0;
    assertNonNegative(separationDeltaVBodyMps, `stage ${stage.id} separation delta-v`);
    if (stage.motors.length === 0) {
      throw new Error(`stage ${stage.id} requires at least one motor`);
    }
    const motors: PreparedMotor[] = stage.motors.map((motor) => {
      validateIdentifier(motor.id, "motor");
      if (!motor.name.trim()) throw new Error("motors must have names");
      const thrustCurve = [...motor.thrustCurve];
      validateThrustCurve(thrustCurve);
      const totalImpulseNs = totalImpulse(thrustCurve);
      if (!(totalImpulseNs > 0)) {
        throw new Error(`motor ${motor.id} thrust curve must have positive total impulse`);
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
      const axisMagnitude = magnitude(axis);
      if (!(axisMagnitude > 0) || !Number.isFinite(axisMagnitude)) {
        throw new Error(`motor ${motor.id} thrust axis must be a finite non-zero vector`);
      }
      const ignitionFailure = motor.ignitionFailure ?? false;
      if (typeof ignitionFailure !== "boolean") {
        throw new Error(`motor ${motor.id} ignition failure must be boolean`);
      }
      return {
        ...motor,
        ignitionFailure,
        thrustCurve,
        normalizedThrustAxisBody: scaleVector(axis, 1 / axisMagnitude),
        totalImpulseNs,
      };
    });
    if (new Set(motors.map((motor) => motor.id)).size !== motors.length) {
      throw new Error(`motor identifiers must be unique within stage ${stage.id}`);
    }
    return {
      ...stage,
      separationDeltaVBodyMps,
      motors,
      burnoutOffsetS: Math.max(
        0,
        ...motors
          .filter((motor) => !motor.ignitionFailure)
          .map(
            (motor) => (motor.ignitionDelayS ?? 0) + motor.thrustCurve.at(-1)!.timeS,
          ),
      ),
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

  const evaluate = (state: RigidBodyState): MultiStageVehicleEvaluation => {
    if (!Number.isFinite(state.timeS)) throw new Error("staging state time must be finite");
    const prepared = stages.map((stage) => {
      const separated = readBooleanState(
        state,
        stageSeparationKey(stage.id),
        `stage ${stage.id} separation state`,
      );
      const ignitionFailed = readBooleanState(
        state,
        stageIgnitionFailureKey(stage.id),
        `stage ${stage.id} ignition failure state`,
      );
      const ignitionCommandTimeS = stageIgnitionTime(state, stage.id);
      const separationTimeValue =
        state.discreteState?.[stageSeparationTimeKey(stage.id)];
      if (
        separationTimeValue !== undefined &&
        (typeof separationTimeValue !== "number" ||
          !Number.isFinite(separationTimeValue))
      ) {
        throw new Error(`stage ${stage.id} separation time must be a finite number`);
      }
      const separationTimeS =
        typeof separationTimeValue === "number" ? separationTimeValue : null;
      if (separationTimeS !== null && separationTimeS > state.timeS + 1e-12) {
        throw new Error(`stage ${stage.id} separation time cannot be in the future`);
      }
      if (separated !== (separationTimeS !== null)) {
        throw new Error(
          `stage ${stage.id} separation flag and time must be recorded together`,
        );
      }
      if (ignitionCommandTimeS !== null && ignitionCommandTimeS > state.timeS + 1e-12) {
        throw new Error(`stage ${stage.id} ignition time cannot be in the future`);
      }
      return {
        stage,
        separated,
        separationTimeS,
        ignitionFailed,
        ignitionCommandTimeS,
      };
    });

    const massParts: MassProperties[] = [input.retainedMassProperties];
    for (const item of prepared) {
      if (item.separated) continue;
      massParts.push(item.stage.structuralMassProperties);
      for (const motor of item.stage.motors) {
        massParts.push(motor.dryMassProperties);
        const localTimeS =
          item.ignitionCommandTimeS === null || item.ignitionFailed || motor.ignitionFailure
            ? null
            : state.timeS - item.ignitionCommandTimeS - (motor.ignitionDelayS ?? 0);
        const deliveredImpulseNs =
          localTimeS === null
            ? 0
            : Math.min(motor.totalImpulseNs, Math.max(0, impulseThrough(motor.thrustCurve as ThrustPoint[], localTimeS)));
        const remainingFraction = Math.max(0, 1 - deliveredImpulseNs / motor.totalImpulseNs);
        if (remainingFraction > 0) {
          massParts.push(scaledMassProperties(motor.initialPropellantMassProperties, remainingFraction));
        }
      }
    }
    const massProperties = combineMassProperties(massParts);
    let inertiaRateBodyKgM2PerS: Matrix3 = ZERO_MATRIX;
    let netThrustForceBodyN: Vector3 = ZERO_VECTOR;
    let netThrustMomentBodyNm: Vector3 = ZERO_VECTOR;

    const stageEvaluations = prepared.map((item): RocketStageEvaluation => {
      const motorEvaluations = item.stage.motors.map(
        (motor): MultiStageMotorEvaluation => {
          const localTimeS =
            item.ignitionCommandTimeS === null || item.ignitionFailed || motor.ignitionFailure
              ? null
              : state.timeS - item.ignitionCommandTimeS - (motor.ignitionDelayS ?? 0);
          const deliveredImpulseNs =
            localTimeS === null
              ? 0
              : Math.min(motor.totalImpulseNs, Math.max(0, impulseThrough(motor.thrustCurve as ThrustPoint[], localTimeS)));
          const remainingPropellantFraction = Math.max(
            0,
            1 - deliveredImpulseNs / motor.totalImpulseNs,
          );
          const curveEndS = motor.thrustCurve.at(-1)!.timeS;
          const thrustN =
            item.separated || item.ignitionFailed || motor.ignitionFailure || localTimeS === null || remainingPropellantFraction <= 1e-14
              ? 0
              : thrustAt(motor.thrustCurve as ThrustPoint[], localTimeS);
          const propellantMassRateKgS =
            !item.separated &&
            !item.ignitionFailed &&
            !motor.ignitionFailure &&
            localTimeS !== null &&
            localTimeS >= motor.thrustCurve[0].timeS &&
            localTimeS < curveEndS &&
            remainingPropellantFraction > 1e-14
              ? (-motor.initialPropellantMassProperties.massKg * thrustN) /
                motor.totalImpulseNs
              : 0;
          const forceBodyN = scaleVector(motor.normalizedThrustAxisBody, thrustN);
          const momentBodyNm = cross(
            subtractVectors(
              motor.thrustApplicationPointBodyM,
              massProperties.centerOfMassM,
            ),
            forceBodyN,
          );
          if (propellantMassRateKgS !== 0) {
            inertiaRateBodyKgM2PerS = addMatrices(
              inertiaRateBodyKgM2PerS,
              shiftInertia(
                scaleMatrix(
                  motor.initialPropellantMassProperties.inertiaAtCenterKgM2,
                  propellantMassRateKgS /
                    motor.initialPropellantMassProperties.massKg,
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
            propellantMassKg:
              item.separated
                ? 0
                : motor.initialPropellantMassProperties.massKg *
                  remainingPropellantFraction,
            propellantMassRateKgS,
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
        id: item.stage.id,
        name: item.stage.name,
        phase,
        attached: !item.separated,
        ignitionCommandTimeS: item.ignitionCommandTimeS,
        separationTimeS: item.separationTimeS,
        ignitionFailed: item.ignitionFailed,
        burnoutTimeS:
          item.ignitionCommandTimeS === null
            ? null
            : item.ignitionCommandTimeS + item.stage.burnoutOffsetS,
        massKg: item.separated
          ? 0
          : item.stage.structuralMassProperties.massKg +
            motorEvaluations.reduce(
              (sum, motor, index) =>
                sum +
                item.stage.motors[index].dryMassProperties.massKg +
                motor.propellantMassKg,
              0,
            ),
        propellantMassKg: motorEvaluations.reduce(
          (sum, motor) => sum + motor.propellantMassKg,
          0,
        ),
        thrustN: motorEvaluations.reduce((sum, motor) => sum + motor.thrustN, 0),
        motors: motorEvaluations,
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
      stages: stageEvaluations,
    };
  };

  const createBurnoutSeparationEvent = (eventInput: Readonly<{
    stageId: string;
    delayS?: number;
    label?: string;
    separationDeltaVBodyMps?: number;
  }>): StateTriggeredRigidBodyEvent => {
    const stage = requireStage(eventInput.stageId);
    const delayS = eventInput.delayS ?? 0;
    assertNonNegative(delayS, "stage separation delay");
    const separationDeltaVBodyMps = eventInput.separationDeltaVBodyMps ?? stage.separationDeltaVBodyMps ?? 0;
    assertNonNegative(separationDeltaVBodyMps, "stage separation delta-v");
    const separationLabel = separationDeltaVBodyMps > 0
      ? ` (+${separationDeltaVBodyMps.toFixed(2)} m/s body +X)`
      : "";
    return {
      id: `staging-${stage.id}-burnout-separation`,
      label: eventInput.label ?? `${stage.name} separation after burnout${separationLabel}`,
      direction: "rising",
      value: (state) =>
        burnoutEventValue(state, stage.id, stage.burnoutOffsetS, delayS, false),
      apply: (state) => separateStage(state, stage.id, { x: separationDeltaVBodyMps, y: 0, z: 0 }),
    };
  };

  const createBurnoutIgnitionEvent = (eventInput: Readonly<{
    sourceStageId: string;
    targetStageId: string;
    delayS?: number;
    label?: string;
  }>): StateTriggeredRigidBodyEvent => {
    const source = requireStage(eventInput.sourceStageId);
    const target = requireStage(eventInput.targetStageId);
    if (source.id === target.id) throw new Error("a stage cannot ignite itself after burnout");
    const delayS = eventInput.delayS ?? 0;
    assertNonNegative(delayS, "stage ignition delay");
    return {
      id: `staging-${target.id}-ignition-after-${source.id}-burnout`,
      label:
        eventInput.label ?? `${target.name} ignition after ${source.name} burnout`,
      direction: "rising",
      value: (state) =>
        burnoutEventValue(state, source.id, source.burnoutOffsetS, delayS, true),
      apply: (state) => igniteStage(state, target.id),
    };
  };

  const stageMassProperties = (
    state: RigidBodyState,
    stageId: string,
  ): MassProperties => {
    const stage = requireStage(stageId);
    const evaluation = evaluate(state);
    const stageEvaluation = evaluation.stages.find((item) => item.id === stageId);
    if (!stageEvaluation?.attached) {
      throw new Error(`stage ${stageId} is not attached at the requested state`);
    }
    const parts: MassProperties[] = [stage.structuralMassProperties];
    stage.motors.forEach((motor, index) => {
      parts.push(motor.dryMassProperties);
      const remainingFraction =
        stageEvaluation.motors[index]?.remainingPropellantFraction ?? 0;
      if (remainingFraction > 0) {
        parts.push(scaledMassProperties(motor.initialPropellantMassProperties, remainingFraction));
      }
    });
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
    burnoutOffsetS: (stageId) => requireStage(stageId).burnoutOffsetS,
    createBurnoutSeparationEvent,
    createBurnoutIgnitionEvent,
    assumptions: [
      "Stages are rigidly attached until an explicit separation event",
      "Stage ignition commands establish motor-local time; each motor may add a deterministic delay",
      "Propellant consumption is proportional to delivered impulse",
      "Separated stages, their motors, and remaining propellant leave the tracked vehicle immediately",
      "A configured separation delta-v is applied instantaneously to the retained body in its body-frame +X direction; a zero value preserves translational and angular velocity",
    ],
    warnings: [
      "This staging model has analytical component checks only and is not flight-safety validated.",
      "Pyrotechnic mechanism, spring forces, joint constraints, plume impingement, collision risk, equal-and-opposite discarded-stage impulse, and coupled discarded-stage trajectories are not modeled; the browser adapter may expose a separate ballistic component check.",
      "Stage separation is an instantaneous topology change; use a dedicated multi-body model for separation-clearance analysis.",
      "Impulse-proportional depletion is approximate unless thrust tracks propellant mass flow at effectively constant exhaust velocity.",
    ],
  };
}
