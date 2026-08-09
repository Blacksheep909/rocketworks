import {
  ZERO_VECTOR,
  addVectors,
  dot,
  magnitude,
  scaleVector,
  subtractVectors,
  type Vector3,
} from "./linear-algebra.ts";
import {
  normalizeQuaternion,
  rigidBodyPropertiesAt,
  rotateBodyToWorld,
  simulateRigidBody6D,
  type AppliedRigidBodyEvent,
  type DiscreteRigidBodyState,
  type RigidBodyLoads,
  type RigidBodyModel,
  type RigidBodyState,
  type ScheduledRigidBodyEvent,
  type SixDofSimulationResult,
  type StateTriggeredRigidBodyEvent,
} from "./six-dof.ts";

export const LAUNCH_RAIL_MODEL_VERSION = "kestrel-launch-rail-0.2.0";

export type LaunchRailConfig = Readonly<{
  directionWorld: Vector3;
  lengthM: number;
  originWorldM?: Vector3;
  alignmentToleranceRad?: number;
}>;

export type RailGuidedLaunchInput = Readonly<{
  body: RigidBodyModel;
  initialState: RigidBodyState;
  loads: (state: RigidBodyState) => RigidBodyLoads;
  rail: LaunchRailConfig;
  durationS: number;
  timeStepS: number;
  scheduledTimesS?: readonly number[];
  events?: readonly ScheduledRigidBodyEvent[];
  stateEvents?: readonly StateTriggeredRigidBodyEvent[];
  eventTimeToleranceS?: number;
  maximumEventIterations?: number;
  maximumRailSteps?: number;
}>;

export type RailFlightEvent = Readonly<{
  type: "liftoff" | "rail_exit" | "no_liftoff" | "rail_reversal";
  label: string;
  timeS: number;
  distanceAlongRailM: number;
  speedAlongRailMps: number;
  state: RigidBodyState;
}>;

export type RailTracePoint = Readonly<{
  state: RigidBodyState;
  distanceAlongRailM: number;
  speedAlongRailMps: number;
  axialForceN: number;
  unconstrainedAxialAccelerationMps2: number;
  constrainedAxialAccelerationMps2: number;
  railReactionWorldN: Vector3;
  onPad: boolean;
}>;

export type RailGuidedLaunchResult = Readonly<{
  modelVersion: string;
  validationStatus: "analytical-component-checks-only";
  events: readonly RailFlightEvent[];
  railTrace: readonly RailTracePoint[];
  freeFlight: SixDofSimulationResult | null;
  appliedEvents: readonly AppliedRigidBodyEvent[];
  termination: AppliedRigidBodyEvent | null;
  trace: readonly RigidBodyState[];
  finalState: RigidBodyState;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

type RailState = Readonly<{
  timeS: number;
  distanceM: number;
  speedMps: number;
  discreteState?: DiscreteRigidBodyState;
}>;

type RailDerivative = Readonly<{
  distanceRateMps: number;
  speedRateMps2: number;
}>;

function normalized(value: Vector3, label: string): Vector3 {
  const valueMagnitude = magnitude(value);
  if (!(valueMagnitude > 0) || !Number.isFinite(valueMagnitude)) {
    throw new Error(`${label} must be a finite non-zero vector`);
  }
  return scaleVector(value, 1 / valueMagnitude);
}

function finiteVector(value: Vector3): boolean {
  return [value.x, value.y, value.z].every(Number.isFinite);
}

function validateDiscreteState(value: DiscreteRigidBodyState | undefined): void {
  if (value === undefined) return;
  for (const [key, stateValue] of Object.entries(value)) {
    if (!key.trim()) throw new Error("discrete state keys cannot be empty");
    if (
      !["boolean", "number", "string"].includes(typeof stateValue) ||
      (typeof stateValue === "number" && !Number.isFinite(stateValue))
    ) {
      throw new Error("discrete state values must be booleans, finite numbers, or strings");
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

export function simulateRailGuidedLaunch(
  input: RailGuidedLaunchInput,
): RailGuidedLaunchResult {
  if (!Number.isFinite(input.durationS) || input.durationS < 0) {
    throw new Error("launch duration must be finite and non-negative");
  }
  if (!Number.isFinite(input.timeStepS) || input.timeStepS <= 0) {
    throw new Error("launch time step must be a positive finite number");
  }
  if (!Number.isFinite(input.rail.lengthM) || input.rail.lengthM <= 0) {
    throw new Error("launch-rail length must be a positive finite number");
  }
  const railDirection = normalized(input.rail.directionWorld, "launch-rail direction");
  const railOrigin = input.rail.originWorldM ?? input.initialState.positionWorldM;
  if (!finiteVector(railOrigin)) throw new Error("launch-rail origin must be finite");
  const orientation = normalizeQuaternion(input.initialState.orientationBodyToWorld);
  const noseDirectionWorld = rotateBodyToWorld(orientation, { x: -1, y: 0, z: 0 });
  const alignmentToleranceRad = input.rail.alignmentToleranceRad ?? 0.5 * Math.PI / 180;
  if (!Number.isFinite(alignmentToleranceRad) || alignmentToleranceRad < 0) {
    throw new Error("rail alignment tolerance must be finite and non-negative");
  }
  const alignmentAngleRad = Math.acos(
    Math.min(1, Math.max(-1, dot(noseDirectionWorld, railDirection))),
  );
  if (alignmentAngleRad > alignmentToleranceRad) {
    throw new Error("initial body nose direction must align with the launch rail");
  }
  if (magnitude(input.initialState.angularVelocityBodyRadS) > 1e-10) {
    throw new Error("initial angular velocity must be zero while constrained to the rail");
  }
  const initialOffset = subtractVectors(input.initialState.positionWorldM, railOrigin);
  const initialDistanceM = dot(initialOffset, railDirection);
  const initialTransverseOffset = subtractVectors(
    initialOffset,
    scaleVector(railDirection, initialDistanceM),
  );
  const initialSpeedMps = dot(input.initialState.velocityWorldMps, railDirection);
  const initialTransverseVelocity = subtractVectors(
    input.initialState.velocityWorldMps,
    scaleVector(railDirection, initialSpeedMps),
  );
  if (magnitude(initialTransverseOffset) > 1e-8) {
    throw new Error("initial position must lie on the launch-rail axis");
  }
  if (magnitude(initialTransverseVelocity) > 1e-8 || initialSpeedMps < -1e-12) {
    throw new Error("initial velocity must be non-negative and parallel to the launch rail");
  }
  if (initialDistanceM < -1e-10) {
    throw new Error("initial position cannot be behind the launch-rail origin");
  }
  validateDiscreteState(input.initialState.discreteState);
  rigidBodyPropertiesAt(input.body, input.initialState);

  const finalTimeS = input.initialState.timeS + input.durationS;
  const scheduledTimes = [...(input.scheduledTimesS ?? [])];
  if (
    scheduledTimes.some(
      (time, index) =>
        !Number.isFinite(time) ||
        time <= input.initialState.timeS ||
        time >= finalTimeS ||
        (index > 0 && time <= scheduledTimes[index - 1]),
    )
  ) {
    throw new Error("scheduled times must increase strictly within the launch interval");
  }
  const scheduledEvents = [...(input.events ?? [])];
  if (
    scheduledEvents.some(
      (event, index) =>
        !event.id.trim() ||
        !event.label.trim() ||
        !Number.isFinite(event.timeS) ||
        event.timeS <= input.initialState.timeS ||
        event.timeS > finalTimeS ||
        (index > 0 && event.timeS < scheduledEvents[index - 1].timeS),
    )
  ) {
    throw new Error(
      "launch-rail events must have identifiers and labels and be ordered within the launch interval",
    );
  }
  if (new Set(scheduledEvents.map((event) => event.id)).size !== scheduledEvents.length) {
    throw new Error("launch-rail event identifiers must be unique");
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
      "launch-rail state events must have identifiers, labels, valid directions, and non-negative finite tolerances",
    );
  }
  const allEventIds = [
    ...scheduledEvents.map((event) => event.id),
    ...stateEvents.map((event) => event.id),
  ];
  if (new Set(allEventIds).size !== allEventIds.length) {
    throw new Error("launch-rail scheduled and state event identifiers must be unique");
  }
  const eventTimeToleranceS = input.eventTimeToleranceS ?? 1e-9;
  if (!Number.isFinite(eventTimeToleranceS) || eventTimeToleranceS <= 0) {
    throw new Error("launch-rail event time tolerance must be positive and finite");
  }
  const maximumEventIterations = input.maximumEventIterations ?? 80;
  if (!Number.isInteger(maximumEventIterations) || maximumEventIterations <= 0) {
    throw new Error("launch-rail maximum event iterations must be a positive integer");
  }
  const boundaryTimes = [
    ...new Set([
      ...scheduledTimes,
      ...scheduledEvents.map((event) => event.timeS),
    ]),
  ].sort((a, b) => a - b);
  const maximumRailSteps = input.maximumRailSteps ?? 1_000_000;
  if (!Number.isInteger(maximumRailSteps) || maximumRailSteps <= 0) {
    throw new Error("maximum rail steps must be a positive integer");
  }

  const constrainedState = (railState: RailState): RigidBodyState => ({
    timeS: railState.timeS,
    positionWorldM: addVectors(
      railOrigin,
      scaleVector(railDirection, railState.distanceM),
    ),
    velocityWorldMps: scaleVector(railDirection, railState.speedMps),
    orientationBodyToWorld: orientation,
    angularVelocityBodyRadS: ZERO_VECTOR,
    discreteState: railState.discreteState,
  });

  const evaluate = (
    railState: RailState,
    leftLimitTimeS?: number,
  ): RailTracePoint => {
    const physicalState = constrainedState(railState);
    const queryState =
      leftLimitTimeS !== undefined && railState.timeS >= leftLimitTimeS - 1e-13
        ? {
            ...physicalState,
            timeS:
              leftLimitTimeS -
              Math.max(
                Number.EPSILON * Math.max(1, Math.abs(leftLimitTimeS)) * 16,
                input.timeStepS * 1e-12,
              ),
          }
        : physicalState;
    const body = rigidBodyPropertiesAt(input.body, queryState);
    const loads = input.loads(queryState);
    const totalForceWorldN = addVectors(
      loads.forceWorldN ?? ZERO_VECTOR,
      rotateBodyToWorld(orientation, loads.forceBodyN ?? ZERO_VECTOR),
    );
    const axialForceN = dot(totalForceWorldN, railDirection);
    const unconstrainedAxialAccelerationMps2 = axialForceN / body.massKg;
    const onPad =
      railState.distanceM <= 1e-12 &&
      railState.speedMps <= 1e-12 &&
      unconstrainedAxialAccelerationMps2 <= 0;
    const constrainedAxialAccelerationMps2 = onPad
      ? 0
      : unconstrainedAxialAccelerationMps2;
    const permittedAxialForceN = onPad ? 0 : axialForceN;
    const railReactionWorldN = subtractVectors(
      scaleVector(railDirection, permittedAxialForceN),
      totalForceWorldN,
    );
    return {
      state: physicalState,
      distanceAlongRailM: railState.distanceM,
      speedAlongRailMps: railState.speedMps,
      axialForceN,
      unconstrainedAxialAccelerationMps2,
      constrainedAxialAccelerationMps2,
      railReactionWorldN,
      onPad,
    };
  };

  const derivative = (
    railState: RailState,
    leftLimitTimeS?: number,
  ): RailDerivative => {
    const point = evaluate(railState, leftLimitTimeS);
    return {
      distanceRateMps: point.onPad ? 0 : railState.speedMps,
      speedRateMps2: point.constrainedAxialAccelerationMps2,
    };
  };

  const addScaled = (
    railState: RailState,
    value: RailDerivative,
    scale: number,
  ): RailState => ({
    ...railState,
    timeS: railState.timeS + scale,
    distanceM: railState.distanceM + value.distanceRateMps * scale,
    speedMps: railState.speedMps + value.speedRateMps2 * scale,
  });

  const step = (
    railState: RailState,
    timeStepS: number,
    leftLimitTimeS?: number,
  ): RailState => {
    const k1 = derivative(railState);
    const k2 = derivative(addScaled(railState, k1, timeStepS / 2));
    const k3 = derivative(addScaled(railState, k2, timeStepS / 2));
    const k4 = derivative(addScaled(railState, k3, timeStepS), leftLimitTimeS);
    return {
      ...railState,
      timeS: railState.timeS + timeStepS,
      distanceM:
        railState.distanceM +
        (timeStepS / 6) *
          (k1.distanceRateMps +
            2 * k2.distanceRateMps +
            2 * k3.distanceRateMps +
            k4.distanceRateMps),
      speedMps:
        railState.speedMps +
        (timeStepS / 6) *
          (k1.speedRateMps2 +
            2 * k2.speedRateMps2 +
            2 * k3.speedRateMps2 +
            k4.speedRateMps2),
    };
  };

  const railStateFromEventState = (
    candidate: RigidBodyState,
    expectedTimeS: number,
    previous: RailState,
  ): RailState => {
    if (!Number.isFinite(candidate.timeS) || Math.abs(candidate.timeS - expectedTimeS) > eventTimeToleranceS) {
      throw new Error("launch-rail events must preserve their event time");
    }
    if (!finiteVector(candidate.positionWorldM) || !finiteVector(candidate.velocityWorldMps)) {
      throw new Error("launch-rail event state vectors must be finite");
    }
    if (magnitude(candidate.angularVelocityBodyRadS) > 1e-10) {
      throw new Error("launch-rail events must preserve zero angular velocity");
    }
    const candidateOrientation = normalizeQuaternion(candidate.orientationBodyToWorld);
    const candidateNoseDirectionWorld = rotateBodyToWorld(candidateOrientation, { x: -1, y: 0, z: 0 });
    const candidateAlignmentAngleRad = Math.acos(
      Math.min(1, Math.max(-1, dot(candidateNoseDirectionWorld, railDirection))),
    );
    if (candidateAlignmentAngleRad > alignmentToleranceRad) {
      throw new Error("launch-rail events must preserve the rail-aligned attitude");
    }
    const offset = subtractVectors(candidate.positionWorldM, railOrigin);
    const distanceM = dot(offset, railDirection);
    const transverseOffset = subtractVectors(offset, scaleVector(railDirection, distanceM));
    const speedMps = dot(candidate.velocityWorldMps, railDirection);
    const transverseVelocity = subtractVectors(
      candidate.velocityWorldMps,
      scaleVector(railDirection, speedMps),
    );
    if (magnitude(transverseOffset) > 1e-8 || magnitude(transverseVelocity) > 1e-8) {
      throw new Error("launch-rail events must preserve the rail axis");
    }
    if (distanceM < -1e-10 || speedMps < -1e-10) {
      throw new Error("launch-rail events cannot move behind the rail origin or reverse the vehicle");
    }
    validateDiscreteState(candidate.discreteState);
    return {
      ...previous,
      timeS: expectedTimeS,
      distanceM: Math.max(0, distanceM),
      speedMps: Math.max(0, speedMps),
      discreteState: candidate.discreteState,
    };
  };

  const events: RailFlightEvent[] = [];
  const railWarnings: string[] = [];
  const appliedEvents: AppliedRigidBodyEvent[] = [];
  const firedStateEventIds = new Set<string>();
  let termination: AppliedRigidBodyEvent | null = null;
  let railState: RailState = {
    timeS: input.initialState.timeS,
    distanceM: Math.max(0, initialDistanceM),
    speedMps: Math.max(0, initialSpeedMps),
    discreteState: input.initialState.discreteState,
  };
  const railTrace: RailTracePoint[] = [evaluate(railState)];
  let liftoffRecorded = railState.distanceM > 0 || railState.speedMps > 0;
  if (liftoffRecorded) {
    events.push({
      type: "liftoff",
      label: "Vehicle moving on launch rail",
      timeS: railState.timeS,
      distanceAlongRailM: railState.distanceM,
      speedAlongRailMps: railState.speedMps,
      state: constrainedState(railState),
    });
  }
  let railExitState: RigidBodyState | null = null;
  let boundaryIndex = 0;
  let scheduledEventIndex = 0;
  let railStepCount = 0;

  const applyScheduledEventsAtCurrentTime = (): void => {
    while (
      scheduledEventIndex < scheduledEvents.length &&
      Math.abs(scheduledEvents[scheduledEventIndex]!.timeS - railState.timeS) <= eventTimeToleranceS
    ) {
      const event = scheduledEvents[scheduledEventIndex]!;
      const stateBefore = constrainedState(railState);
      const candidateState = event.apply(stateBefore);
      const nextRailState = railStateFromEventState(candidateState, event.timeS, railState);
      railState = nextRailState;
      const stateAfter = constrainedState(railState);
      rigidBodyPropertiesAt(input.body, stateAfter);
      appliedEvents.push({
        id: event.id,
        label: event.label,
        kind: "scheduled",
        terminal: false,
        timeS: event.timeS,
        stateBefore,
        stateAfter,
      });
      scheduledEventIndex += 1;
    }
  };

  const applyStateEvent = (
    event: StateTriggeredRigidBodyEvent,
    candidateRailState: RailState,
  ): void => {
    const stateBefore = constrainedState(candidateRailState);
    const candidateState = event.apply?.(stateBefore) ?? stateBefore;
    const nextRailState = railStateFromEventState(candidateState, candidateRailState.timeS, candidateRailState);
    railState = nextRailState;
    const stateAfter = constrainedState(railState);
    rigidBodyPropertiesAt(input.body, stateAfter);
    const appliedEvent: AppliedRigidBodyEvent = {
      id: event.id,
      label: event.label,
      kind: "state",
      terminal: event.terminal ?? false,
      timeS: candidateRailState.timeS,
      stateBefore,
      stateAfter,
    };
    firedStateEventIds.add(event.id);
    appliedEvents.push(appliedEvent);
    if (appliedEvent.terminal) termination = appliedEvent;
  };

  if (railState.distanceM >= input.rail.lengthM) {
    railState = { ...railState, distanceM: input.rail.lengthM };
    railExitState = constrainedState(railState);
  }

  while (!railExitState && !termination && railState.timeS < finalTimeS - 1e-13) {
    if (railStepCount >= maximumRailSteps) {
      throw new Error("launch-rail simulation exceeded the maximum step count");
    }
    const nextBoundaryTime = boundaryTimes[boundaryIndex] ?? Infinity;
    const targetTimeS = Math.min(
      railState.timeS + input.timeStepS,
      nextBoundaryTime,
      finalTimeS,
    );
    const endsAtBoundary =
      Number.isFinite(nextBoundaryTime) &&
      Math.abs(targetTimeS - nextBoundaryTime) < 1e-12;
    const leftLimitTimeS = endsAtBoundary ? nextBoundaryTime : undefined;

    for (const stateEvent of stateEvents) {
      if (
        firedStateEventIds.has(stateEvent.id) ||
        !stateEvent.triggerAtStart ||
        Math.abs(stateEventValue(stateEvent, constrainedState(railState))) >
          (stateEvent.valueTolerance ?? 1e-10)
      ) {
        continue;
      }
      applyStateEvent(stateEvent, railState);
      railTrace.push(evaluate(railState));
      if (termination) break;
    }
    if (termination) break;

    const currentPoint = evaluate(railState);
    if (
      !liftoffRecorded &&
      railState.distanceM <= 1e-12 &&
      railState.speedMps <= 1e-12 &&
      currentPoint.unconstrainedAxialAccelerationMps2 <= 0
    ) {
      const endPadState: RailState = {
        ...railState,
        timeS: targetTimeS,
        distanceM: 0,
        speedMps: 0,
      };
      const endAcceleration = evaluate(endPadState, leftLimitTimeS)
        .unconstrainedAxialAccelerationMps2;
      if (endAcceleration <= 0) {
        railState = endPadState;
        if (endsAtBoundary) {
          applyScheduledEventsAtCurrentTime();
          boundaryIndex += 1;
        }
        railTrace.push(evaluate(railState));
        railStepCount += 1;
        continue;
      }
      let lowerTimeS = railState.timeS;
      let upperTimeS = targetTimeS;
      for (let iteration = 0; iteration < 60; iteration += 1) {
        const middleTimeS = (lowerTimeS + upperTimeS) / 2;
        const middleAcceleration = evaluate({
          ...railState,
          timeS: middleTimeS,
          distanceM: 0,
          speedMps: 0,
        }).unconstrainedAxialAccelerationMps2;
        if (middleAcceleration > 0) upperTimeS = middleTimeS;
        else lowerTimeS = middleTimeS;
      }
      railState = { ...railState, timeS: upperTimeS, distanceM: 0, speedMps: 0 };
      liftoffRecorded = true;
      const liftoffState = constrainedState(railState);
      events.push({
        type: "liftoff",
        label: "Net force released vehicle from pad support",
        timeS: railState.timeS,
        distanceAlongRailM: 0,
        speedAlongRailMps: 0,
        state: liftoffState,
      });
      railTrace.push(evaluate(railState));
      railStepCount += 1;
      continue;
    }
    if (!liftoffRecorded && currentPoint.unconstrainedAxialAccelerationMps2 > 0) {
      liftoffRecorded = true;
      events.push({
        type: "liftoff",
        label: "Net force released vehicle from pad support",
        timeS: railState.timeS,
        distanceAlongRailM: railState.distanceM,
        speedAlongRailMps: railState.speedMps,
        state: constrainedState(railState),
      });
    }

    const timeStepS = targetTimeS - railState.timeS;
    const candidate = step(railState, timeStepS, leftLimitTimeS);
    const rootCandidates = stateEvents
      .map((stateEvent, declarationIndex) => {
        if (firedStateEventIds.has(stateEvent.id)) return null;
        const startValue = stateEventValue(stateEvent, constrainedState(railState));
        const endValue = stateEventValue(stateEvent, constrainedState(candidate));
        if (!crossesStateEvent(stateEvent, startValue, endValue)) return null;
        let lowerOffsetS = 0;
        let upperOffsetS = timeStepS;
        let lowerValue = startValue;
        for (
          let iteration = 0;
          iteration < maximumEventIterations &&
          upperOffsetS - lowerOffsetS > eventTimeToleranceS;
          iteration += 1
        ) {
          const middleOffsetS = (lowerOffsetS + upperOffsetS) / 2;
          const middleRailState = step(railState, middleOffsetS);
          const middleValue = stateEventValue(stateEvent, constrainedState(middleRailState));
          const tolerance = stateEvent.valueTolerance ?? 1e-10;
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
          stateEvent,
          declarationIndex,
          timeS: railState.timeS + rootOffsetS,
          railState: step(railState, rootOffsetS),
        };
      })
      .filter((candidateRoot) => candidateRoot !== null)
      .sort(
        (a, b) =>
          a.timeS - b.timeS || a.declarationIndex - b.declarationIndex,
      );
    if (rootCandidates.length > 0) {
      const firstRoot = rootCandidates[0]!;
      railState = { ...firstRoot.railState, timeS: firstRoot.timeS };
      for (const root of rootCandidates) {
        if (Math.abs(root.timeS - firstRoot.timeS) > eventTimeToleranceS) break;
        applyStateEvent(root.stateEvent, railState);
        if (termination) break;
      }
      railTrace.push(evaluate(railState));
      railStepCount += 1;
      if (termination) break;
      continue;
    }
    if (candidate.speedMps < -1e-10 || candidate.distanceM < -1e-10) {
      let reversalStepS = timeStepS;
      if (candidate.speedMps < -1e-10) {
        let lowerStepS = 0;
        let upperStepS = timeStepS;
        for (let iteration = 0; iteration < 60; iteration += 1) {
          const middleStepS = (lowerStepS + upperStepS) / 2;
          if (step(railState, middleStepS).speedMps <= 0) upperStepS = middleStepS;
          else lowerStepS = middleStepS;
        }
        reversalStepS = upperStepS;
      }
      const reversalCandidate = step(railState, reversalStepS, leftLimitTimeS);
      railState = {
        ...reversalCandidate,
        timeS: railState.timeS + reversalStepS,
        distanceM: Math.max(0, reversalCandidate.distanceM),
        speedMps: 0,
      };
      railTrace.push(evaluate(railState));
      events.push({
        type: "rail_reversal",
        label: "Vehicle lost positive travel before rail exit",
        timeS: railState.timeS,
        distanceAlongRailM: railState.distanceM,
        speedAlongRailMps: 0,
        state: constrainedState(railState),
      });
      railWarnings.push(
        "The vehicle lost positive rail travel before release; the preview stopped at the guide origin instead of modeling re-contact or tip-off.",
      );
      break;
    }
    if (candidate.distanceM >= input.rail.lengthM) {
      let lowerStepS = 0;
      let upperStepS = timeStepS;
      let exitCandidate = candidate;
      for (let iteration = 0; iteration < 60; iteration += 1) {
        const middleStepS = (lowerStepS + upperStepS) / 2;
        const middleCandidate = step(railState, middleStepS);
        if (middleCandidate.distanceM >= input.rail.lengthM) {
          upperStepS = middleStepS;
          exitCandidate = middleCandidate;
        } else {
          lowerStepS = middleStepS;
        }
      }
      railState = {
        ...exitCandidate,
        timeS: railState.timeS + upperStepS,
        distanceM: input.rail.lengthM,
      };
      if (
        endsAtBoundary &&
        railState.timeS >= nextBoundaryTime - eventTimeToleranceS
      ) {
        applyScheduledEventsAtCurrentTime();
        boundaryIndex += 1;
      }
      railExitState = constrainedState(railState);
      const exitPoint = evaluate(railState);
      railTrace.push(exitPoint);
      events.push({
        type: "rail_exit",
        label: "Vehicle reference point cleared launch rail",
        timeS: railState.timeS,
        distanceAlongRailM: railState.distanceM,
        speedAlongRailMps: railState.speedMps,
        state: railExitState,
      });
      break;
    }
    railState = candidate;
    if (endsAtBoundary) {
      railState = { ...railState, timeS: nextBoundaryTime };
      applyScheduledEventsAtCurrentTime();
      boundaryIndex += 1;
    }
    if (Math.abs(railState.timeS - finalTimeS) < 1e-12) {
      railState = { ...railState, timeS: finalTimeS };
    }
    railTrace.push(evaluate(railState));
    railStepCount += 1;
  }

  if (!liftoffRecorded && !termination) {
    events.push({
      type: "no_liftoff",
      label: "Vehicle remained supported on launch pad",
      timeS: railState.timeS,
      distanceAlongRailM: railState.distanceM,
      speedAlongRailMps: railState.speedMps,
      state: constrainedState(railState),
    });
  }

  const remainingDurationS = railExitState
    ? Math.max(0, finalTimeS - railExitState.timeS)
    : 0;
  const remainingScheduledTimes = railExitState
    ? scheduledTimes.filter(
        (time) => time > railExitState!.timeS + 1e-12 && time < finalTimeS - 1e-12,
      )
    : [];
  const remainingScheduledEvents = railExitState
    ? scheduledEvents.filter(
        (event) => event.timeS > railExitState!.timeS + eventTimeToleranceS,
      )
    : [];
  const remainingStateEvents = railExitState
    ? stateEvents.filter((event) => !firedStateEventIds.has(event.id))
    : [];
  const freeFlight =
    railExitState && remainingDurationS > 1e-13 && !termination
      ? simulateRigidBody6D({
          body: input.body,
          initialState: railExitState,
          durationS: remainingDurationS,
          timeStepS: input.timeStepS,
          loads: input.loads,
          scheduledTimesS: remainingScheduledTimes,
          events: remainingScheduledEvents,
          stateEvents: remainingStateEvents,
          eventTimeToleranceS,
          maximumEventIterations,
        })
      : null;
  const railStates = railTrace.map((point) => point.state);
  const trace = freeFlight
    ? [...railStates, ...freeFlight.trace.slice(1)]
    : railStates;
  const finalState =
    freeFlight?.finalState ?? railExitState ?? constrainedState(railState);
  const allAppliedEvents = [
    ...appliedEvents,
    ...(freeFlight?.events ?? []),
  ];

  return {
    modelVersion: LAUNCH_RAIL_MODEL_VERSION,
    validationStatus: "analytical-component-checks-only",
    events,
    railTrace,
    freeFlight,
    appliedEvents: allAppliedEvents,
    termination: termination ?? freeFlight?.termination ?? null,
    trace,
    finalState,
    assumptions: [
      "Rigid straight rail with a fixed world direction",
      "Vehicle reference point moves only along the rail until release",
      "Rail holds initial attitude and zero angular velocity without compliance or friction",
      "Pad support cancels non-positive axial force at the rail origin",
      "Rail release occurs when the vehicle reference point reaches the configured rail length",
      "Scheduled and state-triggered events are applied at exact rail or free-flight boundaries",
    ],
    warnings: [
      "This constrained launcher model has analytical checks only and is not flight-safety validated.",
      "Rail-button spacing, guide clearance, friction, binding, structural flexibility, and launcher motion are not modeled.",
      "The configured rail length is effective travel of the propagated reference point, not automatically the physical rail-button release distance.",
      "State-dependent contact loss and re-contact after release are not modeled; pre-release reversal is detected and stops the preview.",
      ...railWarnings,
      ...(freeFlight?.warnings ?? []),
    ],
  };
}
