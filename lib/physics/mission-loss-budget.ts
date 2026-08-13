import {
  addVectors,
  dot,
  magnitude,
  scaleVector,
  subtractVectors,
  type Vector3,
  ZERO_VECTOR,
} from "./linear-algebra.ts";

export const MISSION_LOSS_BUDGET_MODEL_VERSION =
  "rocketworks-mission-loss-budget-0.1.0";
export const MISSION_LOSS_BUDGET_VALIDATION_STATUS =
  "analytical-thrust-axis-projection" as const;

export type MissionLossBudgetStatus = "assessed" | "partial" | "not-assessed";

export type MissionLossBudgetSample = Readonly<{
  timeS: number;
  massKg: number;
  velocityWorldMps: Vector3;
  thrustForceWorldN: Vector3;
  aerodynamicForceWorldN: Vector3;
  gravityForceWorldN: Vector3;
  recoveryForceWorldN: Vector3;
}>;

export type MissionLossBudgetEvent = Readonly<{
  id: string;
  timeS: number;
  deltaVWorldMps: Vector3;
}>;

export type MissionLossBudgetProjection = Readonly<{
  /** Signed integral of source acceleration projected onto the local thrust axis. */
  signedAlongThrustMps: number;
  /** Positive part of the projection that opposes the local thrust axis. */
  opposingMps: number;
  /** Positive part of the projection that assists the local thrust axis. */
  assistingMps: number;
}>;

export type MissionLossBudgetResult = Readonly<{
  modelVersion: typeof MISSION_LOSS_BUDGET_MODEL_VERSION;
  validationStatus: typeof MISSION_LOSS_BUDGET_VALIDATION_STATUS;
  status: MissionLossBudgetStatus;
  sampleCount: number;
  eventCount: number;
  timeSpanS: number;
  thrustAxisSampleCount: number;
  thrustAxisCoverageS: number;
  thrustAxisCoverageFraction: number;
  thrustImpulseEquivalentMps: number | null;
  netThrustDeltaVWorldMps: Vector3 | null;
  netThrustDeltaVMagnitudeMps: number | null;
  steeringDispersionMps: number | null;
  gravity: MissionLossBudgetProjection | null;
  aerodynamic: MissionLossBudgetProjection | null;
  recovery: MissionLossBudgetProjection | null;
  discreteEvents: MissionLossBudgetProjection | null;
  projectedEventCount: number;
  unprojectedEventCount: number;
  observedVelocityChangeWorldMps: Vector3 | null;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

const THRUST_AXIS_EPSILON_N = 1e-9;

type ProjectionAccumulator = {
  signedAlongThrustMps: number;
  opposingMps: number;
  assistingMps: number;
};

type EndpointMetrics = {
  thrustAccelerationMps2: number;
  thrustAxis: Vector3 | null;
  projections: Record<"gravity" | "aerodynamic" | "recovery", ProjectionAccumulator>;
};

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertFiniteVector(value: Vector3, label: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite x, y, and z components`);
  }
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (!(value > 0)) throw new Error(`${label} must be positive`);
}

function integrateVector(left: Vector3, right: Vector3, durationS: number): Vector3 {
  return scaleVector(addVectors(left, right), 0.5 * durationS);
}

function integrateForceOverMass(
  leftForce: Vector3,
  rightForce: Vector3,
  leftMassKg: number,
  rightMassKg: number,
  durationS: number,
): Vector3 {
  return integrateVector(
    scaleVector(leftForce, 1 / leftMassKg),
    scaleVector(rightForce, 1 / rightMassKg),
    durationS,
  );
}

function emptyProjection(): ProjectionAccumulator {
  return { signedAlongThrustMps: 0, opposingMps: 0, assistingMps: 0 };
}

function addProjection(
  target: ProjectionAccumulator,
  left: ProjectionAccumulator,
  right: ProjectionAccumulator,
  durationS: number,
): void {
  target.signedAlongThrustMps +=
    0.5 * (left.signedAlongThrustMps + right.signedAlongThrustMps) * durationS;
  target.opposingMps += 0.5 * (left.opposingMps + right.opposingMps) * durationS;
  target.assistingMps += 0.5 * (left.assistingMps + right.assistingMps) * durationS;
}

function projectionFor(
  forceWorldN: Vector3,
  massKg: number,
  thrustAxis: Vector3 | null,
): ProjectionAccumulator {
  if (thrustAxis === null) return emptyProjection();
  const signed = dot(scaleVector(forceWorldN, 1 / massKg), thrustAxis);
  return {
    signedAlongThrustMps: signed,
    opposingMps: Math.max(0, -signed),
    assistingMps: Math.max(0, signed),
  };
}

function endpointMetrics(sample: MissionLossBudgetSample): EndpointMetrics {
  const thrustMagnitudeN = magnitude(sample.thrustForceWorldN);
  const thrustAxis = thrustMagnitudeN > THRUST_AXIS_EPSILON_N
    ? scaleVector(sample.thrustForceWorldN, 1 / thrustMagnitudeN)
    : null;
  return {
    thrustAccelerationMps2: thrustMagnitudeN / sample.massKg,
    thrustAxis,
    projections: {
      gravity: projectionFor(sample.gravityForceWorldN, sample.massKg, thrustAxis),
      aerodynamic: projectionFor(sample.aerodynamicForceWorldN, sample.massKg, thrustAxis),
      recovery: projectionFor(sample.recoveryForceWorldN, sample.massKg, thrustAxis),
    },
  };
}

function projectionResult(value: ProjectionAccumulator): MissionLossBudgetProjection {
  return {
    signedAlongThrustMps: value.signedAlongThrustMps,
    opposingMps: value.opposingMps,
    assistingMps: value.assistingMps,
  };
}

function nearestActiveThrustAxis(
  samples: readonly MissionLossBudgetSample[],
  timeS: number,
): Vector3 | null {
  let nearest: { distanceS: number; axis: Vector3 } | null = null;
  for (const sample of samples) {
    const thrustMagnitudeN = magnitude(sample.thrustForceWorldN);
    if (!(thrustMagnitudeN > THRUST_AXIS_EPSILON_N)) continue;
    const distanceS = Math.abs(sample.timeS - timeS);
    if (nearest === null || distanceS < nearest.distanceS) {
      nearest = {
        distanceS,
        axis: scaleVector(sample.thrustForceWorldN, 1 / thrustMagnitudeN),
      };
    }
  }
  return nearest?.axis ?? null;
}

function baseResult(
  sampleCount: number,
  eventCount: number,
  timeSpanS: number,
  warnings: readonly string[],
): MissionLossBudgetResult {
  return {
    modelVersion: MISSION_LOSS_BUDGET_MODEL_VERSION,
    validationStatus: MISSION_LOSS_BUDGET_VALIDATION_STATUS,
    status: "not-assessed",
    sampleCount,
    eventCount,
    timeSpanS,
    thrustAxisSampleCount: 0,
    thrustAxisCoverageS: 0,
    thrustAxisCoverageFraction: 0,
    thrustImpulseEquivalentMps: null,
    netThrustDeltaVWorldMps: null,
    netThrustDeltaVMagnitudeMps: null,
    steeringDispersionMps: null,
    gravity: null,
    aerodynamic: null,
    recovery: null,
    discreteEvents: null,
    projectedEventCount: 0,
    unprojectedEventCount: eventCount,
    observedVelocityChangeWorldMps: null,
    assumptions: [
      "Recorded force vectors are divided by the endpoint masses and integrated with the trapezoidal rule.",
      "Opposition and assistance are positive-part projections onto the instantaneous recorded thrust direction; they are not scalar mission losses.",
      "Thrust impulse-equivalent speed is the integral of thrust magnitude divided by mass. Steering dispersion is the non-negative difference between that scalar integral and the magnitude of the integrated thrust vector.",
      "Discrete event projections use the nearest active-thrust sample and are not inferred when no thrust axis is available.",
    ],
    warnings,
  };
}

/**
 * Project recorded force and event contributions onto the local thrust axis.
 *
 * This is an explanatory accounting layer built from a trace that already
 * exists. It does not integrate a new trajectory or certify a mission loss
 * budget, performance number, or flight-safety decision.
 */
export function computeMissionLossBudget(
  samples: readonly MissionLossBudgetSample[],
  events: readonly MissionLossBudgetEvent[] = [],
  options: Readonly<{ additionalWarnings?: readonly string[] }> = {},
): MissionLossBudgetResult {
  const normalized = samples.map((sample, index) => {
    assertFinite(sample.timeS, `mission loss sample ${index + 1} time`);
    assertPositive(sample.massKg, `mission loss sample ${index + 1} mass`);
    assertFiniteVector(sample.velocityWorldMps, `mission loss sample ${index + 1} velocity`);
    assertFiniteVector(sample.thrustForceWorldN, `mission loss sample ${index + 1} thrust force`);
    assertFiniteVector(sample.aerodynamicForceWorldN, `mission loss sample ${index + 1} aerodynamic force`);
    assertFiniteVector(sample.gravityForceWorldN, `mission loss sample ${index + 1} gravity force`);
    assertFiniteVector(sample.recoveryForceWorldN, `mission loss sample ${index + 1} recovery force`);
    return sample;
  });
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].timeS < normalized[index - 1].timeS) {
      throw new Error("mission loss sample times must be non-decreasing");
    }
  }
  const normalizedEvents = events.map((event, index) => {
    if (!event.id.trim()) throw new Error(`mission loss event ${index + 1} id cannot be empty`);
    assertFinite(event.timeS, `mission loss event ${event.id} time`);
    assertFiniteVector(event.deltaVWorldMps, `mission loss event ${event.id} delta-v`);
    return event;
  });
  for (let index = 1; index < normalizedEvents.length; index += 1) {
    if (normalizedEvents[index].timeS < normalizedEvents[index - 1].timeS) {
      throw new Error("mission loss event times must be non-decreasing");
    }
  }
  if (normalized.length < 2) {
    return baseResult(
      normalized.length,
      normalizedEvents.length,
      0,
      [
        "The trace has fewer than two samples, so thrust-axis projections are not assessed.",
        ...(options.additionalWarnings ?? []),
      ],
    );
  }
  const firstSample = normalized[0];
  const lastSample = normalized[normalized.length - 1];
  const timeSpanS = lastSample.timeS - firstSample.timeS;
  if (!(timeSpanS > 0)) {
    return {
      ...baseResult(
        normalized.length,
        normalizedEvents.length,
        timeSpanS,
        [
          "The trace has no positive time span, so thrust-axis projections are not assessed.",
          ...(options.additionalWarnings ?? []),
        ],
      ),
      timeSpanS,
    };
  }
  for (const event of normalizedEvents) {
    if (event.timeS < firstSample.timeS - 1e-9 || event.timeS > lastSample.timeS + 1e-9) {
      throw new Error(`mission loss event ${event.id} lies outside the trace time span`);
    }
  }

  const thrustAxisSampleCount = normalized.filter(
    (sample) => magnitude(sample.thrustForceWorldN) > THRUST_AXIS_EPSILON_N,
  ).length;
  let thrustAxisCoverageS = 0;
  let thrustImpulseEquivalentMps = 0;
  let netThrustDeltaVWorldMps = ZERO_VECTOR;
  const componentAccumulators = {
    gravity: emptyProjection(),
    aerodynamic: emptyProjection(),
    recovery: emptyProjection(),
  };
  for (let index = 1; index < normalized.length; index += 1) {
    const left = normalized[index - 1];
    const right = normalized[index];
    const durationS = right.timeS - left.timeS;
    if (!(durationS > 0)) continue;
    const leftMetrics = endpointMetrics(left);
    const rightMetrics = endpointMetrics(right);
    if (leftMetrics.thrustAxis !== null || rightMetrics.thrustAxis !== null) {
      thrustAxisCoverageS += durationS;
    }
    thrustImpulseEquivalentMps += 0.5 * (
      leftMetrics.thrustAccelerationMps2 + rightMetrics.thrustAccelerationMps2
    ) * durationS;
    netThrustDeltaVWorldMps = addVectors(
      netThrustDeltaVWorldMps,
      integrateForceOverMass(
        left.thrustForceWorldN,
        right.thrustForceWorldN,
        left.massKg,
        right.massKg,
        durationS,
      ),
    );
    addProjection(componentAccumulators.gravity, leftMetrics.projections.gravity, rightMetrics.projections.gravity, durationS);
    addProjection(componentAccumulators.aerodynamic, leftMetrics.projections.aerodynamic, rightMetrics.projections.aerodynamic, durationS);
    addProjection(componentAccumulators.recovery, leftMetrics.projections.recovery, rightMetrics.projections.recovery, durationS);
  }

  const projectedEvents = emptyProjection();
  let projectedEventCount = 0;
  for (const event of normalizedEvents) {
    const axis = nearestActiveThrustAxis(normalized, event.timeS);
    if (axis === null) continue;
    const signed = dot(event.deltaVWorldMps, axis);
    projectedEvents.signedAlongThrustMps += signed;
    projectedEvents.opposingMps += Math.max(0, -signed);
    projectedEvents.assistingMps += Math.max(0, signed);
    projectedEventCount += 1;
  }
  const netThrustDeltaVMagnitudeMps = magnitude(netThrustDeltaVWorldMps);
  const steeringDispersionMps = Math.max(
    0,
    thrustImpulseEquivalentMps - netThrustDeltaVMagnitudeMps,
  );
  const thrustAxisCoverageFraction = Math.min(1, Math.max(0, thrustAxisCoverageS / timeSpanS));
  const status: MissionLossBudgetStatus = thrustAxisSampleCount >= 2
    ? thrustAxisCoverageFraction >= 0.999999 ? "assessed" : "partial"
    : "partial";
  const warnings = [
    "This thrust-axis screen is an analytical projection of recorded trace forces, not a validated mission delta-v or loss budget.",
    "Opposing values report only the positive component against the instantaneous thrust direction; cross-axis force, guidance logic, propellant residuals, and unrecorded constraints are not converted into mission losses.",
    ...(thrustAxisCoverageFraction < 0.999999
      ? [`Thrust-axis direction was available over ${(thrustAxisCoverageFraction * 100).toFixed(1)}% of the trace span; zero-thrust intervals are not directionally classified.`]
      : []),
    ...(normalizedEvents.length > projectedEventCount
      ? [`${normalizedEvents.length - projectedEventCount} event(s) were not projected because no active thrust-axis sample was available; inspect the vector budget for their world-frame effect.`]
      : []),
    ...(options.additionalWarnings ?? []),
  ];
  return {
    modelVersion: MISSION_LOSS_BUDGET_MODEL_VERSION,
    validationStatus: MISSION_LOSS_BUDGET_VALIDATION_STATUS,
    status,
    sampleCount: normalized.length,
    eventCount: normalizedEvents.length,
    timeSpanS,
    thrustAxisSampleCount,
    thrustAxisCoverageS,
    thrustAxisCoverageFraction,
    thrustImpulseEquivalentMps,
    netThrustDeltaVWorldMps,
    netThrustDeltaVMagnitudeMps,
    steeringDispersionMps,
    gravity: projectionResult(componentAccumulators.gravity),
    aerodynamic: projectionResult(componentAccumulators.aerodynamic),
    recovery: projectionResult(componentAccumulators.recovery),
    discreteEvents: projectedEventCount > 0 ? projectionResult(projectedEvents) : null,
    projectedEventCount,
    unprojectedEventCount: normalizedEvents.length - projectedEventCount,
    observedVelocityChangeWorldMps: subtractVectors(
      lastSample.velocityWorldMps,
      firstSample.velocityWorldMps,
    ),
    assumptions: [
      "Recorded force vectors are divided by the endpoint masses and integrated with the trapezoidal rule.",
      "Opposition and assistance are positive-part projections onto the instantaneous recorded thrust direction; they are not scalar mission losses.",
      "Thrust impulse-equivalent speed is the integral of thrust magnitude divided by mass. Steering dispersion is the non-negative difference between that scalar integral and the magnitude of the integrated thrust vector.",
      "Discrete event projections use the nearest active-thrust sample and are not inferred when no thrust axis is available.",
    ],
    warnings,
  };
}
