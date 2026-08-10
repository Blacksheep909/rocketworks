import {
  gravityAtAltitude,
  standardAtmosphere,
} from "./atmosphere.ts";
import type { LaunchEnvironmentProvider } from "./launch-environment.ts";
import {
  analyzeMultiBodySeparation,
  type MultiBodySeparationResult,
  type SeparationClearanceTracePoint,
} from "./separation-clearance.ts";
import {
  addVectors,
  magnitude,
  scaleVector,
  subtractVectors,
  type Vector3,
} from "./linear-algebra.ts";

/**
 * RocketWorks clean-room shared-grid propagator for released bodies.
 *
 * This is intentionally a bounded point-mass component model. Every released
 * body is integrated on the same mission-time grid against the same gravity,
 * atmosphere, and wind provider, then the resulting traces are compared as a
 * group. It is a real simultaneous propagation path, but it does not invent
 * contact forces, plume interaction, or aerodynamic interference that the
 * supplied inputs cannot support.
 */
export const COUPLED_MULTI_BODY_FLIGHT_MODEL_VERSION =
  "rocketworks-coupled-multi-body-flight-0.1.0";
export const COUPLED_MULTI_BODY_FLIGHT_STATUS =
  "analytical-component-checks-only" as const;

export type CoupledMultiBodyVelocityAdjustment = Readonly<{
  deltaVWorldMps: Vector3;
  sourceEventId?: string;
}>;

export type CoupledMultiBodyFlightBodyInput = Readonly<{
  id: string;
  label?: string;
  massKg: number;
  releaseTimeS: number;
  releasePositionWorldM: Vector3;
  releaseVelocityWorldMps: Vector3;
  /** Optional explicitly applied release correction, retained for provenance. */
  velocityAdjustment?: CoupledMultiBodyVelocityAdjustment;
  /** Constant isotropic drag basis for this point-mass branch. */
  referenceAreaM2?: number;
  dragCoefficient?: number;
  envelopeRadiusM?: number;
}>;

export type CoupledMultiBodyTracePoint = Readonly<{
  timeS: number;
  altitudeAglM: number;
  speedMps: number;
  positionWorldM: Vector3;
  velocityWorldMps: Vector3;
  accelerationWorldMps2: Vector3;
}>;

export type CoupledMultiBodyFlightTrajectory = Readonly<{
  id: string;
  label: string;
  massKg: number;
  releaseTimeS: number;
  releasePositionWorldM: Vector3;
  releaseVelocityWorldMps: Vector3;
  baselineReleaseVelocityWorldMps: Vector3;
  velocityAdjustmentWorldMps: Vector3;
  trace: readonly CoupledMultiBodyTracePoint[];
  maxAltitudeAglM: number;
  maxSpeedMps: number;
  impactTimeS: number | null;
  referenceAreaM2?: number;
  dragCoefficient?: number;
  envelopeRadiusM?: number;
}>;

export type CoupledMultiBodyFlightInput = Readonly<{
  bodies: readonly CoupledMultiBodyFlightBodyInput[];
  /** Absolute mission end time, matching the staged preview duration. */
  durationS: number;
  timeStepS: number;
  launchAltitudeM?: number;
  environmentAt?: LaunchEnvironmentProvider;
  maximumSteps?: number;
}>;

export type CoupledMultiBodyFlightResult = Readonly<{
  modelVersion: typeof COUPLED_MULTI_BODY_FLIGHT_MODEL_VERSION;
  validationStatus: typeof COUPLED_MULTI_BODY_FLIGHT_STATUS;
  startTimeS: number;
  endTimeS: number;
  timeStepS: number;
  stepCount: number;
  trajectories: readonly CoupledMultiBodyFlightTrajectory[];
  pairwise: MultiBodySeparationResult | null;
  minimumDistanceM: number | null;
  closestPair: Readonly<{
    firstBodyId: string;
    secondBodyId: string;
    timeS: number;
    distanceM: number;
  }> | null;
  status: "assessed" | "partial" | "not-assessed";
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

type PointState = Readonly<{
  timeS: number;
  positionWorldM: Vector3;
  velocityWorldMps: Vector3;
}>;

type Derivative = Readonly<{
  positionRateWorldMps: Vector3;
  velocityRateWorldMps2: Vector3;
}>;

const ZERO_VECTOR: Vector3 = { x: 0, y: 0, z: 0 };
const TIME_TOLERANCE_S = 1e-9;
const DEFAULT_MAXIMUM_STEPS = 200_000;

function assertFiniteVector(value: Vector3, label: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite coordinates`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive and finite`);
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be non-negative and finite`);
  }
}

function interpolateVector(a: Vector3, b: Vector3, fraction: number): Vector3 {
  return addVectors(a, scaleVector(subtractVectors(b, a), fraction));
}

function validateBody(body: CoupledMultiBodyFlightBodyInput): void {
  if (!body.id.trim()) throw new Error("coupled-flight body id cannot be empty");
  if (body.label !== undefined && !body.label.trim()) {
    throw new Error(`coupled-flight body ${body.id} label cannot be empty`);
  }
  assertPositiveFinite(body.massKg, `coupled-flight body ${body.id} mass`);
  assertNonNegativeFinite(body.releaseTimeS, `coupled-flight body ${body.id} release time`);
  assertFiniteVector(body.releasePositionWorldM, `coupled-flight body ${body.id} release position`);
  assertFiniteVector(body.releaseVelocityWorldMps, `coupled-flight body ${body.id} release velocity`);
  if (body.velocityAdjustment) {
    assertFiniteVector(
      body.velocityAdjustment.deltaVWorldMps,
      `coupled-flight body ${body.id} velocity adjustment`,
    );
    if (body.velocityAdjustment.sourceEventId !== undefined && !body.velocityAdjustment.sourceEventId.trim()) {
      throw new Error(`coupled-flight body ${body.id} adjustment source cannot be empty`);
    }
  }
  const hasArea = body.referenceAreaM2 !== undefined;
  const hasCoefficient = body.dragCoefficient !== undefined;
  if (hasArea !== hasCoefficient) {
    throw new Error(`coupled-flight body ${body.id} drag requires area and coefficient together`);
  }
  if (hasArea) {
    assertPositiveFinite(body.referenceAreaM2!, `coupled-flight body ${body.id} reference area`);
    assertPositiveFinite(body.dragCoefficient!, `coupled-flight body ${body.id} drag coefficient`);
  }
  if (body.envelopeRadiusM !== undefined) {
    assertNonNegativeFinite(body.envelopeRadiusM, `coupled-flight body ${body.id} envelope radius`);
  }
}

function environmentAt(
  input: CoupledMultiBodyFlightInput,
  timeS: number,
  positionWorldM: Vector3,
) {
  return input.environmentAt?.({ timeS, positionWorldM });
}

function accelerationAt(
  body: CoupledMultiBodyFlightBodyInput,
  input: CoupledMultiBodyFlightInput,
  timeS: number,
  positionWorldM: Vector3,
  velocityWorldMps: Vector3,
): Vector3 {
  const environment = environmentAt(input, timeS, positionWorldM);
  const altitudeAslM =
    environment?.altitudeAslM ?? (input.launchAltitudeM ?? 0) + positionWorldM.z;
  const gravityAccelerationWorldMps2 = {
    x: 0,
    y: 0,
    z: -gravityAtAltitude(altitudeAslM),
  };
  if (body.referenceAreaM2 === undefined || body.dragCoefficient === undefined) {
    return gravityAccelerationWorldMps2;
  }
  const atmosphere = environment?.atmosphere ?? standardAtmosphere(altitudeAslM);
  const relativeAirVelocityMps = subtractVectors(
    velocityWorldMps,
    environment?.windWorldMps ?? ZERO_VECTOR,
  );
  const relativeAirSpeedMps = magnitude(relativeAirVelocityMps);
  if (relativeAirSpeedMps <= 0) return gravityAccelerationWorldMps2;
  const dragAccelerationMagnitudeMps2 =
    (0.5 * atmosphere.densityKgM3 * relativeAirSpeedMps ** 2 * body.dragCoefficient * body.referenceAreaM2) /
    body.massKg;
  return addVectors(
    gravityAccelerationWorldMps2,
    scaleVector(relativeAirVelocityMps, -dragAccelerationMagnitudeMps2 / relativeAirSpeedMps),
  );
}

function derivativeAt(
  body: CoupledMultiBodyFlightBodyInput,
  input: CoupledMultiBodyFlightInput,
  timeS: number,
  positionWorldM: Vector3,
  velocityWorldMps: Vector3,
): Derivative {
  return {
    positionRateWorldMps: velocityWorldMps,
    velocityRateWorldMps2: accelerationAt(body, input, timeS, positionWorldM, velocityWorldMps),
  };
}

function integrateRungeKutta4(
  body: CoupledMultiBodyFlightBodyInput,
  input: CoupledMultiBodyFlightInput,
  state: PointState,
  stepS: number,
): PointState {
  const k1 = derivativeAt(body, input, state.timeS, state.positionWorldM, state.velocityWorldMps);
  const k2 = derivativeAt(
    body,
    input,
    state.timeS + stepS / 2,
    addVectors(state.positionWorldM, scaleVector(k1.positionRateWorldMps, stepS / 2)),
    addVectors(state.velocityWorldMps, scaleVector(k1.velocityRateWorldMps2, stepS / 2)),
  );
  const k3 = derivativeAt(
    body,
    input,
    state.timeS + stepS / 2,
    addVectors(state.positionWorldM, scaleVector(k2.positionRateWorldMps, stepS / 2)),
    addVectors(state.velocityWorldMps, scaleVector(k2.velocityRateWorldMps2, stepS / 2)),
  );
  const k4 = derivativeAt(
    body,
    input,
    state.timeS + stepS,
    addVectors(state.positionWorldM, scaleVector(k3.positionRateWorldMps, stepS)),
    addVectors(state.velocityWorldMps, scaleVector(k3.velocityRateWorldMps2, stepS)),
  );
  const weightedPositionRate = scaleVector(
    addVectors(
      addVectors(k1.positionRateWorldMps, scaleVector(k2.positionRateWorldMps, 2)),
      addVectors(scaleVector(k3.positionRateWorldMps, 2), k4.positionRateWorldMps),
    ),
    1 / 6,
  );
  const weightedVelocityRate = scaleVector(
    addVectors(
      addVectors(k1.velocityRateWorldMps2, scaleVector(k2.velocityRateWorldMps2, 2)),
      addVectors(scaleVector(k3.velocityRateWorldMps2, 2), k4.velocityRateWorldMps2),
    ),
    1 / 6,
  );
  return {
    timeS: state.timeS + stepS,
    positionWorldM: addVectors(state.positionWorldM, scaleVector(weightedPositionRate, stepS)),
    velocityWorldMps: addVectors(state.velocityWorldMps, scaleVector(weightedVelocityRate, stepS)),
  };
}

function tracePoint(
  body: CoupledMultiBodyFlightBodyInput,
  input: CoupledMultiBodyFlightInput,
  state: PointState,
): CoupledMultiBodyTracePoint {
  return {
    timeS: state.timeS,
    altitudeAglM: state.positionWorldM.z,
    speedMps: magnitude(state.velocityWorldMps),
    positionWorldM: state.positionWorldM,
    velocityWorldMps: state.velocityWorldMps,
    accelerationWorldMps2: accelerationAt(
      body,
      input,
      state.timeS,
      state.positionWorldM,
      state.velocityWorldMps,
    ),
  };
}

function createMissionTimeGrid(startTimeS: number, endTimeS: number, timeStepS: number): number[] {
  const grid: number[] = [startTimeS];
  while (grid.at(-1)! < endTimeS - TIME_TOLERANCE_S) {
    grid.push(Math.min(endTimeS, grid.at(-1)! + timeStepS));
  }
  return grid;
}

function propagateBody(
  body: CoupledMultiBodyFlightBodyInput,
  input: CoupledMultiBodyFlightInput,
  grid: readonly number[],
  integrationStepS: number,
): CoupledMultiBodyFlightTrajectory {
  const adjustment = body.velocityAdjustment?.deltaVWorldMps ?? ZERO_VECTOR;
  const baselineVelocityWorldMps = body.releaseVelocityWorldMps;
  const releaseVelocityWorldMps = addVectors(baselineVelocityWorldMps, adjustment);
  let state: PointState | null = null;
  let impactTimeS: number | null = null;
  const trace: CoupledMultiBodyTracePoint[] = [];
  const appendTrace = (point: CoupledMultiBodyTracePoint): void => {
    const previous = trace.at(-1);
    if (previous && Math.abs(previous.timeS - point.timeS) <= TIME_TOLERANCE_S) {
      trace[trace.length - 1] = point;
    } else {
      trace.push(point);
    }
  };

  for (const targetTimeS of grid) {
    if (targetTimeS < body.releaseTimeS - TIME_TOLERANCE_S) continue;
    if (!state) {
      state = {
        timeS: body.releaseTimeS,
        positionWorldM: body.releasePositionWorldM,
        velocityWorldMps: releaseVelocityWorldMps,
      };
      appendTrace(tracePoint(body, input, state));
      if (state.positionWorldM.z <= 0 && state.velocityWorldMps.z <= 0) {
        impactTimeS = state.timeS;
        break;
      }
    }
    while (state.timeS < targetTimeS - TIME_TOLERANCE_S && impactTimeS === null) {
      const stepS = Math.min(integrationStepS, targetTimeS - state.timeS);
      const previousState: PointState = state;
      const nextState = integrateRungeKutta4(body, input, state, stepS);
      if (previousState.positionWorldM.z > 0 && nextState.positionWorldM.z <= 0) {
        const fraction = Math.min(
          1,
          Math.max(
            0,
            previousState.positionWorldM.z /
              (previousState.positionWorldM.z - nextState.positionWorldM.z),
          ),
        );
        state = {
          timeS: previousState.timeS + fraction * stepS,
          positionWorldM: interpolateVector(
            previousState.positionWorldM,
            nextState.positionWorldM,
            fraction,
          ),
          velocityWorldMps: interpolateVector(
            previousState.velocityWorldMps,
            nextState.velocityWorldMps,
            fraction,
          ),
        };
        appendTrace(tracePoint(body, input, state));
        impactTimeS = state.timeS;
        break;
      }
      state = nextState;
    }
    if (state && impactTimeS === null) appendTrace(tracePoint(body, input, state));
    if (impactTimeS !== null) break;
  }

  if (trace.length === 0) {
    throw new Error(`coupled-flight body ${body.id} did not overlap the mission time grid`);
  }
  return {
    id: body.id,
    label: body.label ?? body.id,
    massKg: body.massKg,
    releaseTimeS: body.releaseTimeS,
    releasePositionWorldM: body.releasePositionWorldM,
    releaseVelocityWorldMps,
    baselineReleaseVelocityWorldMps: baselineVelocityWorldMps,
    velocityAdjustmentWorldMps: adjustment,
    trace,
    maxAltitudeAglM: Math.max(...trace.map((point) => point.altitudeAglM)),
    maxSpeedMps: Math.max(...trace.map((point) => point.speedMps)),
    impactTimeS,
    ...(body.referenceAreaM2 !== undefined && body.dragCoefficient !== undefined
      ? { referenceAreaM2: body.referenceAreaM2, dragCoefficient: body.dragCoefficient }
      : {}),
    ...(body.envelopeRadiusM !== undefined ? { envelopeRadiusM: body.envelopeRadiusM } : {}),
  };
}

/**
 * Propagates all released bodies on one shared mission-time grid.
 *
 * The coupling here is explicit and bounded: bodies share the same
 * environment provider and time grid, while pairwise relative motion is
 * evaluated from the resulting traces. No body-to-body force is synthesized.
 */
export function simulateCoupledMultiBodyFlight(
  input: CoupledMultiBodyFlightInput,
): CoupledMultiBodyFlightResult {
  if (input.bodies.length === 0) {
    throw new Error("coupled multi-body flight requires at least one body");
  }
  if (!Number.isFinite(input.durationS) || input.durationS <= 0) {
    throw new Error("coupled multi-body flight duration must be positive and finite");
  }
  assertPositiveFinite(input.timeStepS, "coupled multi-body flight time step");
  const maximumSteps = input.maximumSteps ?? DEFAULT_MAXIMUM_STEPS;
  if (!Number.isInteger(maximumSteps) || maximumSteps < 2) {
    throw new Error("coupled multi-body flight maximum steps must be an integer >= 2");
  }
  const ids = new Set<string>();
  input.bodies.forEach((body) => {
    validateBody(body);
    if (ids.has(body.id)) throw new Error(`coupled-flight body id ${body.id} is duplicated`);
    ids.add(body.id);
    if (body.releaseTimeS > input.durationS + TIME_TOLERANCE_S) {
      throw new Error(`coupled-flight body ${body.id} releases after mission end`);
    }
  });
  const startTimeS = Math.min(...input.bodies.map((body) => body.releaseTimeS));
  const nominalStepCount = Math.ceil((input.durationS - startTimeS) / input.timeStepS);
  const gridStepCount = Math.min(nominalStepCount, maximumSteps - 1);
  const budgetAdjusted = nominalStepCount > maximumSteps - 1;
  const effectiveTimeStepS = nominalStepCount > 0
    ? Math.min(input.timeStepS, (input.durationS - startTimeS) / Math.max(gridStepCount, 1))
    : input.timeStepS;
  const grid = createMissionTimeGrid(startTimeS, input.durationS, effectiveTimeStepS);
  const trajectories = input.bodies.map((body) =>
    propagateBody(body, input, grid, effectiveTimeStepS),
  );
  const pairwise: MultiBodySeparationResult | null = trajectories.length > 1
    ? analyzeMultiBodySeparation({
        bodies: trajectories.map((trajectory) => ({
          id: trajectory.id,
          label: trajectory.label,
          releaseTimeS: trajectory.releaseTimeS,
          trace: trajectory.trace.map((point): SeparationClearanceTracePoint => ({
            timeS: point.timeS,
            positionWorldM: point.positionWorldM,
            velocityWorldMps: point.velocityWorldMps,
          })),
        })),
      })
    : null;
  const warnings = [
    "All released bodies were propagated simultaneously on a shared mission-time grid with a common environment provider.",
    "The shared-grid coupling evaluates relative motion together but does not synthesize contact forces, collision response, plume interaction, or aerodynamic interference.",
    "Each body uses altitude-dependent gravity and, when supplied, constant isotropic point drag against environment-relative wind.",
    ...(trajectories.some((trajectory) => trajectory.impactTimeS !== null)
      ? ["Ground crossings are terminal component events; post-impact body motion is not propagated."]
      : []),
    ...(input.bodies.some((body) => body.velocityAdjustment)
      ? ["Some release velocities include an explicitly supplied correction; the source event and vector are retained for auditability."]
      : []),
    ...(budgetAdjusted
      ? [`The requested ${input.timeStepS.toFixed(4)} s step would exceed the maximum step budget (${maximumSteps}); the shared grid was coarsened to ${effectiveTimeStepS.toFixed(4)} s to reach the mission end.`]
      : []),
    ...(pairwise?.warnings ?? []),
  ];
  const assumptions = [
    "Each detached body is represented as a point mass with its supplied release position and velocity.",
    "The integrator is explicit fourth-order Runge-Kutta over a shared mission-time grid; release times are inserted as exact initial points and partial steps are used to align with the grid.",
    "Gravity is evaluated from altitude using the RocketWorks atmosphere/gravity implementation; drag is a constant-Cd, constant-reference-area isotropic approximation when configured.",
    "The environment provider is queried separately for each body at each Runge-Kutta substep, so wind and atmosphere may vary with time and position but bodies do not alter the environment.",
    "Pairwise separation is a continuous piecewise-linear trace diagnostic; spherical envelope bounds, contact, collision response, and range-safety margins remain outside this model.",
    ...(input.bodies.some((body) => body.velocityAdjustment)
      ? ["Velocity adjustments are treated as instantaneous release-state corrections supplied by the caller; separation mechanism, joint compliance, and angular impulse are not modeled."]
      : []),
  ];
  const status: CoupledMultiBodyFlightResult["status"] = budgetAdjusted
    ? "partial"
    : trajectories.length === 0
      ? "not-assessed"
      : "assessed";
  return {
    modelVersion: COUPLED_MULTI_BODY_FLIGHT_MODEL_VERSION,
    validationStatus: COUPLED_MULTI_BODY_FLIGHT_STATUS,
    startTimeS,
    endTimeS: grid.at(-1)!,
    timeStepS: effectiveTimeStepS,
    stepCount: Math.max(grid.length - 1, 0),
    trajectories,
    pairwise,
    minimumDistanceM: pairwise?.minimumDistanceM ?? null,
    closestPair: pairwise?.closestPair ?? null,
    status,
    warnings: [...new Set(warnings)],
    assumptions: [...new Set(assumptions)],
  };
}
