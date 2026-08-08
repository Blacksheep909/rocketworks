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
  type RigidBodyLoads,
  type RigidBodyModel,
  type RigidBodyState,
  type SixDofSimulationResult,
} from "./six-dof.ts";

export const LAUNCH_RAIL_MODEL_VERSION = "kestrel-launch-rail-0.1.0";

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
  maximumRailSteps?: number;
}>;

export type RailFlightEvent = Readonly<{
  type: "liftoff" | "rail_exit" | "no_liftoff";
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
  trace: readonly RigidBodyState[];
  finalState: RigidBodyState;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

type RailState = Readonly<{
  timeS: number;
  distanceM: number;
  speedMps: number;
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

  const events: RailFlightEvent[] = [];
  let railState: RailState = {
    timeS: input.initialState.timeS,
    distanceM: Math.max(0, initialDistanceM),
    speedMps: Math.max(0, initialSpeedMps),
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
  let scheduledIndex = 0;
  let railStepCount = 0;

  if (railState.distanceM >= input.rail.lengthM) {
    railState = { ...railState, distanceM: input.rail.lengthM };
    railExitState = constrainedState(railState);
  }

  while (!railExitState && railState.timeS < finalTimeS - 1e-13) {
    if (railStepCount >= maximumRailSteps) {
      throw new Error("launch-rail simulation exceeded the maximum step count");
    }
    const nextScheduledTime = scheduledTimes[scheduledIndex] ?? Infinity;
    const targetTimeS = Math.min(
      railState.timeS + input.timeStepS,
      nextScheduledTime,
      finalTimeS,
    );
    const endsAtScheduledTime =
      Number.isFinite(nextScheduledTime) &&
      Math.abs(targetTimeS - nextScheduledTime) < 1e-12;
    const leftLimitTimeS = endsAtScheduledTime ? nextScheduledTime : undefined;

    const currentPoint = evaluate(railState);
    if (
      !liftoffRecorded &&
      railState.distanceM <= 1e-12 &&
      railState.speedMps <= 1e-12 &&
      currentPoint.unconstrainedAxialAccelerationMps2 <= 0
    ) {
      const endPadState: RailState = {
        timeS: targetTimeS,
        distanceM: 0,
        speedMps: 0,
      };
      const endAcceleration = evaluate(endPadState, leftLimitTimeS)
        .unconstrainedAxialAccelerationMps2;
      if (endAcceleration <= 0) {
        railState = endPadState;
        railTrace.push(evaluate(railState));
        if (endsAtScheduledTime) scheduledIndex += 1;
        railStepCount += 1;
        continue;
      }
      let lowerTimeS = railState.timeS;
      let upperTimeS = targetTimeS;
      for (let iteration = 0; iteration < 60; iteration += 1) {
        const middleTimeS = (lowerTimeS + upperTimeS) / 2;
        const middleAcceleration = evaluate({
          timeS: middleTimeS,
          distanceM: 0,
          speedMps: 0,
        }).unconstrainedAxialAccelerationMps2;
        if (middleAcceleration > 0) upperTimeS = middleTimeS;
        else lowerTimeS = middleTimeS;
      }
      railState = { timeS: upperTimeS, distanceM: 0, speedMps: 0 };
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
    if (endsAtScheduledTime) {
      railState = { ...railState, timeS: nextScheduledTime };
      scheduledIndex += 1;
    }
    if (Math.abs(railState.timeS - finalTimeS) < 1e-12) {
      railState = { ...railState, timeS: finalTimeS };
    }
    railTrace.push(evaluate(railState));
    railStepCount += 1;
  }

  if (!liftoffRecorded) {
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
  const freeFlight =
    railExitState && remainingDurationS > 1e-13
      ? simulateRigidBody6D({
          body: input.body,
          initialState: railExitState,
          durationS: remainingDurationS,
          timeStepS: input.timeStepS,
          loads: input.loads,
          scheduledTimesS: remainingScheduledTimes,
        })
      : null;
  const railStates = railTrace.map((point) => point.state);
  const trace = freeFlight
    ? [...railStates, ...freeFlight.trace.slice(1)]
    : railStates;
  const finalState =
    freeFlight?.finalState ?? railExitState ?? constrainedState(railState);

  return {
    modelVersion: LAUNCH_RAIL_MODEL_VERSION,
    validationStatus: "analytical-component-checks-only",
    events,
    railTrace,
    freeFlight,
    trace,
    finalState,
    assumptions: [
      "Rigid straight rail with a fixed world direction",
      "Vehicle reference point moves only along the rail until release",
      "Rail holds initial attitude and zero angular velocity without compliance or friction",
      "Pad support cancels non-positive axial force at the rail origin",
      "Rail release occurs when the vehicle reference point reaches the configured rail length",
    ],
    warnings: [
      "This constrained launcher model has analytical checks only and is not flight-safety validated.",
      "Rail-button spacing, guide clearance, friction, binding, structural flexibility, and launcher motion are not modeled.",
      "The configured rail length is effective travel of the propagated reference point, not automatically the physical rail-button release distance.",
      "State-dependent contact loss, reversal into the pad after liftoff, and re-contact after release are not modeled.",
    ],
  };
}
