import {
  ZERO_VECTOR,
  addVectors,
  cross,
  determinant,
  dot,
  magnitude,
  multiplyMatrixVector,
  scaleVector,
  solveMatrix3,
  subtractVectors,
  type Matrix3,
  type Vector3,
} from "./linear-algebra.ts";

export const SIX_DOF_MODEL_VERSION = "kestrel-rigid-body-6dof-0.3.0";

export type Quaternion = Readonly<{
  w: number;
  x: number;
  y: number;
  z: number;
}>;

export const IDENTITY_QUATERNION: Quaternion = { w: 1, x: 0, y: 0, z: 0 };

export type DiscreteStateValue = boolean | number | string;
export type DiscreteRigidBodyState = Readonly<
  Record<string, DiscreteStateValue>
>;

export type RigidBodyState = Readonly<{
  timeS: number;
  positionWorldM: Vector3;
  velocityWorldMps: Vector3;
  orientationBodyToWorld: Quaternion;
  angularVelocityBodyRadS: Vector3;
  discreteState?: DiscreteRigidBodyState;
}>;

export type RigidBodyLoads = Readonly<{
  forceWorldN?: Vector3;
  forceBodyN?: Vector3;
  momentBodyNm?: Vector3;
}>;

export type RigidBodyDefinition = Readonly<{
  massKg: number;
  inertiaBodyKgM2: Matrix3;
}>;

export type RigidBodyProperties = RigidBodyDefinition &
  Readonly<{
    inertiaRateBodyKgM2PerS?: Matrix3;
  }>;

export type RigidBodyPropertyProvider = (
  state: RigidBodyState,
) => RigidBodyProperties;

export type RigidBodyModel = RigidBodyDefinition | RigidBodyPropertyProvider;

export type ScheduledRigidBodyEvent = Readonly<{
  id: string;
  label: string;
  timeS: number;
  apply: (state: RigidBodyState) => RigidBodyState;
}>;

export type StateEventDirection = "rising" | "falling" | "any";

export type StateTriggeredRigidBodyEvent = Readonly<{
  id: string;
  label: string;
  value: (state: RigidBodyState) => number;
  direction?: StateEventDirection;
  triggerAtStart?: boolean;
  terminal?: boolean;
  apply?: (state: RigidBodyState) => RigidBodyState;
  valueTolerance?: number;
}>;

export type AppliedRigidBodyEvent = Readonly<{
  id: string;
  label: string;
  kind: "scheduled" | "state";
  terminal: boolean;
  timeS: number;
  stateBefore: RigidBodyState;
  stateAfter: RigidBodyState;
}>;

export type SixDofSimulationInput = Readonly<{
  body: RigidBodyModel;
  initialState: RigidBodyState;
  durationS: number;
  timeStepS: number;
  loads?: (state: RigidBodyState) => RigidBodyLoads;
  scheduledTimesS?: readonly number[];
  events?: readonly ScheduledRigidBodyEvent[];
  stateEvents?: readonly StateTriggeredRigidBodyEvent[];
  eventTimeToleranceS?: number;
  maximumEventIterations?: number;
  maximumSteps?: number;
}>;

export type SixDofSimulationResult = Readonly<{
  modelVersion: string;
  validationStatus: "mathematical-regression-tests-only";
  trace: readonly RigidBodyState[];
  finalState: RigidBodyState;
  events: readonly AppliedRigidBodyEvent[];
  termination: AppliedRigidBodyEvent | null;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

type StateDerivative = Readonly<{
  positionRateWorldMps: Vector3;
  velocityRateWorldMps2: Vector3;
  orientationRate: Quaternion;
  angularVelocityRateBodyRadS2: Vector3;
}>;

export function quaternionMagnitude(value: Quaternion): number {
  return Math.hypot(value.w, value.x, value.y, value.z);
}

export function normalizeQuaternion(value: Quaternion): Quaternion {
  const norm = quaternionMagnitude(value);
  if (!Number.isFinite(norm) || norm <= 1e-15) {
    throw new Error("orientation quaternion must have finite non-zero magnitude");
  }
  return {
    w: value.w / norm,
    x: value.x / norm,
    y: value.y / norm,
    z: value.z / norm,
  };
}

export function conjugateQuaternion(value: Quaternion): Quaternion {
  return { w: value.w, x: -value.x, y: -value.y, z: -value.z };
}

export function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quaternionFromAxisAngle(
  axis: Vector3,
  angleRad: number,
): Quaternion {
  const axisMagnitude = magnitude(axis);
  if (!Number.isFinite(angleRad) || !(axisMagnitude > 0)) {
    throw new Error("axis-angle rotation requires a finite angle and non-zero axis");
  }
  const halfAngle = angleRad / 2;
  const scale = Math.sin(halfAngle) / axisMagnitude;
  return normalizeQuaternion({
    w: Math.cos(halfAngle),
    x: axis.x * scale,
    y: axis.y * scale,
    z: axis.z * scale,
  });
}

export function rotateBodyToWorld(
  orientationBodyToWorld: Quaternion,
  vectorBody: Vector3,
): Vector3 {
  const orientation = normalizeQuaternion(orientationBodyToWorld);
  const rotated = multiplyQuaternions(
    multiplyQuaternions(orientation, { w: 0, ...vectorBody }),
    conjugateQuaternion(orientation),
  );
  return { x: rotated.x, y: rotated.y, z: rotated.z };
}

export function rotateWorldToBody(
  orientationBodyToWorld: Quaternion,
  vectorWorld: Vector3,
): Vector3 {
  return rotateBodyToWorld(conjugateQuaternion(orientationBodyToWorld), vectorWorld);
}

function validateBody(body: RigidBodyProperties): void {
  if (!Number.isFinite(body.massKg) || body.massKg <= 0) {
    throw new Error("rigid-body mass must be a positive finite number");
  }
  const inertia = body.inertiaBodyKgM2;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      if (!Number.isFinite(inertia[row][column])) {
        throw new Error("inertia tensor entries must be finite");
      }
      if (Math.abs(inertia[row][column] - inertia[column][row]) > 1e-12) {
        throw new Error("inertia tensor must be symmetric");
      }
    }
  }
  const leadingMinor2 =
    inertia[0][0] * inertia[1][1] - inertia[0][1] * inertia[1][0];
  if (!(inertia[0][0] > 0 && leadingMinor2 > 0 && determinant(inertia) > 0)) {
    throw new Error("inertia tensor must be positive definite");
  }
  if (body.inertiaRateBodyKgM2PerS) {
    const rate = body.inertiaRateBodyKgM2PerS;
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        if (!Number.isFinite(rate[row][column])) {
          throw new Error("inertia-rate tensor entries must be finite");
        }
        if (Math.abs(rate[row][column] - rate[column][row]) > 1e-12) {
          throw new Error("inertia-rate tensor must be symmetric");
        }
      }
    }
  }
}

export function rigidBodyPropertiesAt(
  bodyModel: RigidBodyModel,
  state: RigidBodyState,
): RigidBodyProperties {
  const body = typeof bodyModel === "function" ? bodyModel(state) : bodyModel;
  validateBody(body);
  return body;
}

function validateState(state: RigidBodyState): void {
  if (!Number.isFinite(state.timeS)) throw new Error("state time must be finite");
  const vectors = [
    state.positionWorldM,
    state.velocityWorldMps,
    state.angularVelocityBodyRadS,
  ];
  if (
    vectors.some((vector) =>
      [vector.x, vector.y, vector.z].some((entry) => !Number.isFinite(entry)),
    )
  ) {
    throw new Error("state vectors must contain finite values");
  }
  normalizeQuaternion(state.orientationBodyToWorld);
  if (state.discreteState !== undefined) {
    if (
      state.discreteState === null ||
      typeof state.discreteState !== "object" ||
      Array.isArray(state.discreteState)
    ) {
      throw new Error("discrete state must be a key-value object");
    }
    for (const [key, value] of Object.entries(state.discreteState)) {
      if (!key.trim()) throw new Error("discrete state keys cannot be empty");
      if (
        !["boolean", "number", "string"].includes(typeof value) ||
        (typeof value === "number" && !Number.isFinite(value))
      ) {
        throw new Error(
          "discrete state values must be booleans, finite numbers, or strings",
        );
      }
    }
  }
}

function stateEventValue(
  event: StateTriggeredRigidBodyEvent,
  state: RigidBodyState,
): number {
  const value = event.value(state);
  if (!Number.isFinite(value)) {
    throw new Error(`state event ${event.id} returned a non-finite value`);
  }
  return value;
}

function crossesStateEvent(
  event: StateTriggeredRigidBodyEvent,
  startValue: number,
  endValue: number,
): boolean {
  const tolerance = event.valueTolerance ?? 1e-10;
  const direction = event.direction ?? "any";
  const rising = startValue < -tolerance && endValue >= -tolerance;
  const falling = startValue > tolerance && endValue <= tolerance;
  return direction === "rising"
    ? rising
    : direction === "falling"
      ? falling
      : rising || falling;
}

function quaternionRate(
  orientationBodyToWorld: Quaternion,
  angularVelocityBodyRadS: Vector3,
): Quaternion {
  const product = multiplyQuaternions(orientationBodyToWorld, {
    w: 0,
    ...angularVelocityBodyRadS,
  });
  return {
    w: product.w / 2,
    x: product.x / 2,
    y: product.y / 2,
    z: product.z / 2,
  };
}

function derivative(
  state: RigidBodyState,
  bodyModel: RigidBodyModel,
  loadProvider: (state: RigidBodyState) => RigidBodyLoads,
): StateDerivative {
  const body = rigidBodyPropertiesAt(bodyModel, state);
  const loads = loadProvider(state);
  const forceWorldN = addVectors(
    loads.forceWorldN ?? ZERO_VECTOR,
    rotateBodyToWorld(
      state.orientationBodyToWorld,
      loads.forceBodyN ?? ZERO_VECTOR,
    ),
  );
  const angularMomentumBody = multiplyMatrixVector(
    body.inertiaBodyKgM2,
    state.angularVelocityBodyRadS,
  );
  const gyroscopicMoment = cross(
    state.angularVelocityBodyRadS,
    angularMomentumBody,
  );
  const inertiaRateMoment = multiplyMatrixVector(
    body.inertiaRateBodyKgM2PerS ?? [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    state.angularVelocityBodyRadS,
  );
  const angularAcceleration = solveMatrix3(
    body.inertiaBodyKgM2,
    subtractVectors(
      subtractVectors(loads.momentBodyNm ?? ZERO_VECTOR, gyroscopicMoment),
      inertiaRateMoment,
    ),
  );
  return {
    positionRateWorldMps: state.velocityWorldMps,
    velocityRateWorldMps2: scaleVector(forceWorldN, 1 / body.massKg),
    orientationRate: quaternionRate(
      state.orientationBodyToWorld,
      state.angularVelocityBodyRadS,
    ),
    angularVelocityRateBodyRadS2: angularAcceleration,
  };
}

function addScaledQuaternion(
  value: Quaternion,
  derivativeValue: Quaternion,
  scale: number,
): Quaternion {
  return {
    w: value.w + derivativeValue.w * scale,
    x: value.x + derivativeValue.x * scale,
    y: value.y + derivativeValue.y * scale,
    z: value.z + derivativeValue.z * scale,
  };
}

function addScaledState(
  state: RigidBodyState,
  stateDerivative: StateDerivative,
  scale: number,
): RigidBodyState {
  return {
    timeS: state.timeS + scale,
    positionWorldM: addVectors(
      state.positionWorldM,
      scaleVector(stateDerivative.positionRateWorldMps, scale),
    ),
    velocityWorldMps: addVectors(
      state.velocityWorldMps,
      scaleVector(stateDerivative.velocityRateWorldMps2, scale),
    ),
    orientationBodyToWorld: normalizeQuaternion(
      addScaledQuaternion(state.orientationBodyToWorld, stateDerivative.orientationRate, scale),
    ),
    angularVelocityBodyRadS: addVectors(
      state.angularVelocityBodyRadS,
      scaleVector(stateDerivative.angularVelocityRateBodyRadS2, scale),
    ),
    discreteState: state.discreteState,
  };
}

function weightedDerivative(
  a: StateDerivative,
  b: StateDerivative,
  c: StateDerivative,
  d: StateDerivative,
): StateDerivative {
  const weightedVector = (
    av: Vector3,
    bv: Vector3,
    cv: Vector3,
    dv: Vector3,
  ) =>
    scaleVector(
      addVectors(addVectors(av, scaleVector(bv, 2)), addVectors(scaleVector(cv, 2), dv)),
      1 / 6,
    );
  return {
    positionRateWorldMps: weightedVector(
      a.positionRateWorldMps,
      b.positionRateWorldMps,
      c.positionRateWorldMps,
      d.positionRateWorldMps,
    ),
    velocityRateWorldMps2: weightedVector(
      a.velocityRateWorldMps2,
      b.velocityRateWorldMps2,
      c.velocityRateWorldMps2,
      d.velocityRateWorldMps2,
    ),
    orientationRate: {
      w: (a.orientationRate.w + 2 * b.orientationRate.w + 2 * c.orientationRate.w + d.orientationRate.w) / 6,
      x: (a.orientationRate.x + 2 * b.orientationRate.x + 2 * c.orientationRate.x + d.orientationRate.x) / 6,
      y: (a.orientationRate.y + 2 * b.orientationRate.y + 2 * c.orientationRate.y + d.orientationRate.y) / 6,
      z: (a.orientationRate.z + 2 * b.orientationRate.z + 2 * c.orientationRate.z + d.orientationRate.z) / 6,
    },
    angularVelocityRateBodyRadS2: weightedVector(
      a.angularVelocityRateBodyRadS2,
      b.angularVelocityRateBodyRadS2,
      c.angularVelocityRateBodyRadS2,
      d.angularVelocityRateBodyRadS2,
    ),
  };
}

export function stepRigidBodyRk4(
  state: RigidBodyState,
  body: RigidBodyModel,
  timeStepS: number,
  loads: (state: RigidBodyState) => RigidBodyLoads = () => ({}),
): RigidBodyState {
  rigidBodyPropertiesAt(body, state);
  if (!Number.isFinite(timeStepS) || timeStepS <= 0) {
    throw new Error("time step must be a positive finite number");
  }
  const normalizedState = {
    ...state,
    orientationBodyToWorld: normalizeQuaternion(state.orientationBodyToWorld),
  };
  const k1 = derivative(normalizedState, body, loads);
  const k2 = derivative(addScaledState(normalizedState, k1, timeStepS / 2), body, loads);
  const k3 = derivative(addScaledState(normalizedState, k2, timeStepS / 2), body, loads);
  const k4 = derivative(addScaledState(normalizedState, k3, timeStepS), body, loads);
  return addScaledState(
    normalizedState,
    weightedDerivative(k1, k2, k3, k4),
    timeStepS,
  );
}

export function simulateRigidBody6D(
  input: SixDofSimulationInput,
): SixDofSimulationResult {
  validateState(input.initialState);
  rigidBodyPropertiesAt(input.body, input.initialState);
  if (!Number.isFinite(input.durationS) || input.durationS < 0) {
    throw new Error("duration must be finite and non-negative");
  }
  if (!Number.isFinite(input.timeStepS) || input.timeStepS <= 0) {
    throw new Error("time step must be a positive finite number");
  }
  const scheduledTimes = [...(input.scheduledTimesS ?? [])];
  if (
    scheduledTimes.some(
      (time, index) =>
        !Number.isFinite(time) ||
        time <= input.initialState.timeS ||
        time >= input.initialState.timeS + input.durationS ||
        (index > 0 && time <= scheduledTimes[index - 1]),
    )
  ) {
    throw new Error("scheduled times must increase strictly within the simulation interval");
  }
  const scheduledEvents = [...(input.events ?? [])];
  if (
    scheduledEvents.some(
      (event, index) =>
        !event.id.trim() ||
        !event.label.trim() ||
        !Number.isFinite(event.timeS) ||
        event.timeS <= input.initialState.timeS ||
        event.timeS > input.initialState.timeS + input.durationS ||
        (index > 0 && event.timeS < scheduledEvents[index - 1].timeS),
    )
  ) {
    throw new Error(
      "events must have identifiers and labels and be ordered within the simulation interval",
    );
  }
  if (new Set(scheduledEvents.map((event) => event.id)).size !== scheduledEvents.length) {
    throw new Error("event identifiers must be unique");
  }
  const stateEvents = [...(input.stateEvents ?? [])];
  if (
    stateEvents.some(
      (event) =>
        !event.id.trim() ||
        !event.label.trim() ||
        !["rising", "falling", "any"].includes(event.direction ?? "any") ||
        (event.valueTolerance !== undefined &&
          (!Number.isFinite(event.valueTolerance) || event.valueTolerance < 0)),
    )
  ) {
    throw new Error(
      "state events must have identifiers, labels, valid directions, and non-negative finite tolerances",
    );
  }
  const allEventIds = [
    ...scheduledEvents.map((event) => event.id),
    ...stateEvents.map((event) => event.id),
  ];
  if (new Set(allEventIds).size !== allEventIds.length) {
    throw new Error("all scheduled and state event identifiers must be unique");
  }
  const eventTimeToleranceS = input.eventTimeToleranceS ?? 1e-9;
  if (!Number.isFinite(eventTimeToleranceS) || eventTimeToleranceS <= 0) {
    throw new Error("event time tolerance must be a positive finite number");
  }
  const maximumEventIterations = input.maximumEventIterations ?? 80;
  if (!Number.isInteger(maximumEventIterations) || maximumEventIterations <= 0) {
    throw new Error("maximum event iterations must be a positive integer");
  }
  const boundaryTimes = [
    ...new Set([...scheduledTimes, ...scheduledEvents.map((event) => event.timeS)]),
  ].sort((a, b) => a - b);
  const maximumSteps = input.maximumSteps ?? 1_000_000;
  if (!Number.isInteger(maximumSteps) || maximumSteps <= 0) {
    throw new Error("maximum steps must be a positive integer");
  }
  const finalTimeS = input.initialState.timeS + input.durationS;
  let state: RigidBodyState = {
    ...input.initialState,
    orientationBodyToWorld: normalizeQuaternion(input.initialState.orientationBodyToWorld),
  };
  const trace: RigidBodyState[] = [state];
  const appliedEvents: AppliedRigidBodyEvent[] = [];
  const firedStateEventIds = new Set<string>();
  let termination: AppliedRigidBodyEvent | null = null;
  let boundaryIndex = 0;
  let eventIndex = 0;
  let stepCount = 0;
  const applyStateTriggeredEvent = (
    event: StateTriggeredRigidBodyEvent,
  ): void => {
    const stateBefore = state;
    const candidateState = event.apply?.(stateBefore) ?? stateBefore;
    validateState(candidateState);
    if (Math.abs(candidateState.timeS - stateBefore.timeS) > eventTimeToleranceS) {
      throw new Error(`state event ${event.id} must preserve its root-found time`);
    }
    state = {
      ...candidateState,
      timeS: stateBefore.timeS,
      orientationBodyToWorld: normalizeQuaternion(
        candidateState.orientationBodyToWorld,
      ),
    };
    rigidBodyPropertiesAt(input.body, state);
    const appliedEvent: AppliedRigidBodyEvent = {
      id: event.id,
      label: event.label,
      kind: "state",
      terminal: event.terminal ?? false,
      timeS: state.timeS,
      stateBefore,
      stateAfter: state,
    };
    firedStateEventIds.add(event.id);
    appliedEvents.push(appliedEvent);
    trace.push(state);
    if (appliedEvent.terminal) termination = appliedEvent;
  };

  while (state.timeS < finalTimeS - 1e-13 && !termination) {
    if (stepCount >= maximumSteps) {
      throw new Error("simulation exceeded the maximum step count");
    }

    for (const event of stateEvents) {
      if (
        termination ||
        firedStateEventIds.has(event.id) ||
        !event.triggerAtStart
      ) {
        continue;
      }
      const tolerance = event.valueTolerance ?? 1e-10;
      if (Math.abs(stateEventValue(event, state)) <= tolerance) {
        applyStateTriggeredEvent(event);
      }
    }
    if (termination) break;

    const nextScheduledTime = boundaryTimes[boundaryIndex] ?? Infinity;
    const targetTime = Math.min(
      state.timeS + input.timeStepS,
      nextScheduledTime,
      finalTimeS,
    );
    const endsAtScheduledTime =
      Number.isFinite(nextScheduledTime) &&
      Math.abs(targetTime - nextScheduledTime) < 1e-12;
    const loadProvider = input.loads
      ? (evaluationState: RigidBodyState) => {
          if (
            endsAtScheduledTime &&
            evaluationState.timeS >= nextScheduledTime - 1e-13
          ) {
            const leftLimitOffset = Math.max(
              Number.EPSILON * Math.max(1, Math.abs(nextScheduledTime)) * 16,
              (targetTime - state.timeS) * 1e-12,
            );
            return input.loads?.({
              ...evaluationState,
              timeS: nextScheduledTime - leftLimitOffset,
            }) ?? {};
          }
          return input.loads?.(evaluationState) ?? {};
        }
      : undefined;
    const inputBodyProvider =
      typeof input.body === "function" ? input.body : undefined;
    const bodyModel: RigidBodyModel =
      inputBodyProvider
        ? (evaluationState) => {
            if (
              endsAtScheduledTime &&
              evaluationState.timeS >= nextScheduledTime - 1e-13
            ) {
              const leftLimitOffset = Math.max(
                Number.EPSILON * Math.max(1, Math.abs(nextScheduledTime)) * 16,
                (targetTime - state.timeS) * 1e-12,
              );
              return inputBodyProvider({
                ...evaluationState,
                timeS: nextScheduledTime - leftLimitOffset,
              });
            }
            return inputBodyProvider(evaluationState);
          }
        : input.body;
    const candidateState = stepRigidBodyRk4(
      state,
      bodyModel,
      targetTime - state.timeS,
      loadProvider,
    );

    const rootCandidates = stateEvents
      .map((event, declarationIndex) => {
        if (firedStateEventIds.has(event.id)) return null;
        const startValue = stateEventValue(event, state);
        const endValue = stateEventValue(event, candidateState);
        if (!crossesStateEvent(event, startValue, endValue)) return null;
        let lowerOffsetS = 0;
        let upperOffsetS = targetTime - state.timeS;
        let lowerValue = startValue;
        for (
          let iteration = 0;
          iteration < maximumEventIterations &&
          upperOffsetS - lowerOffsetS > eventTimeToleranceS;
          iteration += 1
        ) {
          const middleOffsetS = (lowerOffsetS + upperOffsetS) / 2;
          const middleState = stepRigidBodyRk4(
            state,
            bodyModel,
            middleOffsetS,
            loadProvider,
          );
          const middleValue = stateEventValue(event, middleState);
          const tolerance = event.valueTolerance ?? 1e-10;
          if (Math.abs(middleValue) <= tolerance) {
            lowerOffsetS = middleOffsetS;
            upperOffsetS = middleOffsetS;
            break;
          }
          const rootInLowerHalf =
            (lowerValue < 0 && middleValue >= 0) ||
            (lowerValue > 0 && middleValue <= 0);
          if (rootInLowerHalf) {
            upperOffsetS = middleOffsetS;
          } else {
            lowerOffsetS = middleOffsetS;
            lowerValue = middleValue;
          }
        }
        const rootOffsetS = (lowerOffsetS + upperOffsetS) / 2;
        return {
          event,
          declarationIndex,
          timeS: state.timeS + rootOffsetS,
          state: stepRigidBodyRk4(
            state,
            bodyModel,
            rootOffsetS,
            loadProvider,
          ),
        };
      })
      .filter((candidate) => candidate !== null)
      .sort(
        (a, b) =>
          a.timeS - b.timeS || a.declarationIndex - b.declarationIndex,
      );

    if (rootCandidates.length > 0) {
      const firstRoot = rootCandidates[0];
      state = { ...firstRoot.state, timeS: firstRoot.timeS };
      trace.push(state);
      for (const root of rootCandidates) {
        if (Math.abs(root.timeS - firstRoot.timeS) > eventTimeToleranceS) break;
        applyStateTriggeredEvent(root.event);
        if (termination) break;
      }
      stepCount += 1;
      if (termination) break;
      if (state.timeS < targetTime - eventTimeToleranceS) continue;
      state = { ...state, timeS: targetTime };
    } else {
      state = candidateState;
    }

    if (Math.abs(state.timeS - nextScheduledTime) < 1e-12) {
      state = { ...state, timeS: nextScheduledTime };
      boundaryIndex += 1;
      while (
        eventIndex < scheduledEvents.length &&
        Math.abs(scheduledEvents[eventIndex].timeS - nextScheduledTime) < 1e-12
      ) {
        const event = scheduledEvents[eventIndex];
        const stateBefore = state;
        const candidateState = event.apply(stateBefore);
        validateState(candidateState);
        if (Math.abs(candidateState.timeS - event.timeS) > 1e-12) {
          throw new Error(`event ${event.id} must preserve its scheduled time`);
        }
        state = {
          ...candidateState,
          timeS: event.timeS,
          orientationBodyToWorld: normalizeQuaternion(
            candidateState.orientationBodyToWorld,
          ),
        };
        rigidBodyPropertiesAt(input.body, state);
        appliedEvents.push({
          id: event.id,
          label: event.label,
          kind: "scheduled",
          terminal: false,
          timeS: event.timeS,
          stateBefore,
          stateAfter: state,
        });
        trace.push(state);
        eventIndex += 1;
      }
    }
    if (Math.abs(state.timeS - finalTimeS) < 1e-12) {
      state = { ...state, timeS: finalTimeS };
    }
    trace.push(state);
    stepCount += 1;
  }

  return {
    modelVersion: SIX_DOF_MODEL_VERSION,
    validationStatus: "mathematical-regression-tests-only",
    trace,
    finalState: state,
    events: appliedEvents,
    termination,
    assumptions: [
      typeof input.body === "function"
        ? "Rigid body with prescribed state-dependent mass, inertia, and optional inertia rate"
        : "Rigid body with constant mass and inertia",
      "Non-rotating Cartesian world frame",
      "Body-to-world scalar-first unit quaternion",
      "Body-frame angular velocity and moments",
      "Forces applied at the center of mass unless included in the supplied moment",
      "State-triggered events are one-shot scalar zero crossings located within accepted integration steps",
      "Discrete state is piecewise constant between explicit event resets",
    ],
    warnings: [
      "No aerodynamic, propulsion, gravity, atmosphere, terrain, launch-rail, recovery, staging, or failure model is coupled by default.",
      "Prescribed changing mass properties do not model exhaust control-volume momentum, slosh, or internal-flow dynamics; thrust and related moments must be supplied explicitly.",
      "Quaternion normalization controls numerical drift but does not constitute physical validation.",
      "State-event root finding assumes a continuous scalar event function with at most one relevant crossing per integration step.",
      "Do not use this mathematical kernel alone for flight-safety decisions.",
    ],
  };
}

export function combineRigidBodyLoads(
  ...loads: readonly RigidBodyLoads[]
): RigidBodyLoads {
  return loads.reduce<RigidBodyLoads>(
    (combined, load) => ({
      forceWorldN: addVectors(
        combined.forceWorldN ?? ZERO_VECTOR,
        load.forceWorldN ?? ZERO_VECTOR,
      ),
      forceBodyN: addVectors(
        combined.forceBodyN ?? ZERO_VECTOR,
        load.forceBodyN ?? ZERO_VECTOR,
      ),
      momentBodyNm: addVectors(
        combined.momentBodyNm ?? ZERO_VECTOR,
        load.momentBodyNm ?? ZERO_VECTOR,
      ),
    }),
    {},
  );
}

export function combineRigidBodyLoadProviders(
  ...providers: readonly ((state: RigidBodyState) => RigidBodyLoads)[]
): (state: RigidBodyState) => RigidBodyLoads {
  return (state) =>
    combineRigidBodyLoads(...providers.map((provider) => provider(state)));
}

export function rotationalKineticEnergyJ(
  inertiaBodyKgM2: Matrix3,
  angularVelocityBodyRadS: Vector3,
): number {
  return (
    dot(
      angularVelocityBodyRadS,
      multiplyMatrixVector(inertiaBodyKgM2, angularVelocityBodyRadS),
    ) / 2
  );
}

export function angularMomentumWorldNms(
  state: RigidBodyState,
  inertiaBodyKgM2: Matrix3,
): Vector3 {
  return rotateBodyToWorld(
    state.orientationBodyToWorld,
    multiplyMatrixVector(inertiaBodyKgM2, state.angularVelocityBodyRadS),
  );
}
