import {
  addVectors,
  magnitude,
  scaleVector,
  subtractVectors,
  type Vector3,
  ZERO_VECTOR,
} from "./linear-algebra.ts";

export const STAGE_FLIGHT_VECTOR_BUDGET_MODEL_VERSION =
  "rocketworks-stage-flight-vector-budget-0.1.0";
export const STAGE_FLIGHT_VECTOR_BUDGET_VALIDATION_STATUS =
  "analytical-vector-trace-accounting" as const;

export type StageFlightVectorBudgetStatus = "assessed" | "not-assessed";
export type StageFlightVectorClosureStatus =
  | "closed"
  | "review"
  | "not-assessed";

export type StageFlightVectorBudgetSample = Readonly<{
  timeS: number;
  massKg: number;
  velocityWorldMps: Vector3;
  thrustForceWorldN: Vector3;
  aerodynamicForceWorldN: Vector3;
  gravityForceWorldN: Vector3;
  recoveryForceWorldN: Vector3;
}>;

export type StageFlightVectorBudgetEvent = Readonly<{
  id: string;
  timeS: number;
  deltaVWorldMps: Vector3;
}>;

export type StageFlightVectorBudgetComponent = Readonly<{
  forceImpulseWorldNs: Vector3;
  deltaVWorldMps: Vector3;
  deltaVMagnitudeMps: number;
}>;

export type StageFlightVectorBudgetResult = Readonly<{
  modelVersion: typeof STAGE_FLIGHT_VECTOR_BUDGET_MODEL_VERSION;
  validationStatus: typeof STAGE_FLIGHT_VECTOR_BUDGET_VALIDATION_STATUS;
  status: StageFlightVectorBudgetStatus;
  sampleCount: number;
  eventCount: number;
  timeSpanS: number;
  initialVelocityWorldMps: Vector3 | null;
  finalVelocityWorldMps: Vector3 | null;
  observedVelocityChangeWorldMps: Vector3 | null;
  thrust: StageFlightVectorBudgetComponent | null;
  aerodynamic: StageFlightVectorBudgetComponent | null;
  gravity: StageFlightVectorBudgetComponent | null;
  recovery: StageFlightVectorBudgetComponent | null;
  continuousNet: StageFlightVectorBudgetComponent | null;
  eventDeltaVWorldMps: Vector3 | null;
  accountedVelocityChangeWorldMps: Vector3 | null;
  closureResidualWorldMps: Vector3 | null;
  closureResidualMagnitudeMps: number | null;
  closureToleranceMps: number;
  closureStatus: StageFlightVectorClosureStatus;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

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

function integrateVector(
  left: Vector3,
  right: Vector3,
  durationS: number,
): Vector3 {
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

function component(
  forceImpulseWorldNs: Vector3,
  deltaVWorldMps: Vector3,
): StageFlightVectorBudgetComponent {
  return {
    forceImpulseWorldNs,
    deltaVWorldMps,
    deltaVMagnitudeMps: magnitude(deltaVWorldMps),
  };
}

function addComponentDeltaV(
  components: readonly StageFlightVectorBudgetComponent[],
): Vector3 {
  return components.reduce(
    (sum, current) => addVectors(sum, current.deltaVWorldMps),
    ZERO_VECTOR,
  );
}

function emptyResult(
  sampleCount: number,
  eventCount: number,
  closureToleranceMps: number,
  warnings: readonly string[],
): StageFlightVectorBudgetResult {
  return {
    modelVersion: STAGE_FLIGHT_VECTOR_BUDGET_MODEL_VERSION,
    validationStatus: STAGE_FLIGHT_VECTOR_BUDGET_VALIDATION_STATUS,
    status: "not-assessed",
    sampleCount,
    eventCount,
    timeSpanS: 0,
    initialVelocityWorldMps: null,
    finalVelocityWorldMps: null,
    observedVelocityChangeWorldMps: null,
    thrust: null,
    aerodynamic: null,
    gravity: null,
    recovery: null,
    continuousNet: null,
    eventDeltaVWorldMps: null,
    accountedVelocityChangeWorldMps: null,
    closureResidualWorldMps: null,
    closureResidualMagnitudeMps: null,
    closureToleranceMps,
    closureStatus: "not-assessed",
    assumptions: [
      "Each force contribution is integrated in the world ENU frame as force divided by the recorded instantaneous mass.",
      "A discrete event delta-v is added separately from continuous force integration; event mechanisms are not reconstructed as finite-duration forces.",
      "The closure residual compares accounted continuous and discrete velocity changes with the recorded state velocity change.",
    ],
    warnings,
  };
}

/**
 * Integrate the actual world-frame force vectors recorded by a coupled trace.
 *
 * This is a transparent accounting layer, not a new flight integrator. It is
 * useful for finding omitted constraint/event forces and for explaining the
 * trajectory, but it does not certify a mission delta-v budget or losses.
 */
export function computeStageFlightVectorBudget(
  samples: readonly StageFlightVectorBudgetSample[],
  events: readonly StageFlightVectorBudgetEvent[] = [],
  options: Readonly<{
    closureToleranceMps?: number;
    additionalWarnings?: readonly string[];
  }> = {},
): StageFlightVectorBudgetResult {
  const closureToleranceMps = options.closureToleranceMps ?? 0.5;
  assertPositive(closureToleranceMps, "vector-budget closure tolerance");
  const normalized = samples.map((sample, index) => {
    assertFinite(sample.timeS, `vector budget sample ${index + 1} time`);
    assertPositive(sample.massKg, `vector budget sample ${index + 1} mass`);
    assertFiniteVector(sample.velocityWorldMps, `vector budget sample ${index + 1} velocity`);
    assertFiniteVector(sample.thrustForceWorldN, `vector budget sample ${index + 1} thrust force`);
    assertFiniteVector(sample.aerodynamicForceWorldN, `vector budget sample ${index + 1} aerodynamic force`);
    assertFiniteVector(sample.gravityForceWorldN, `vector budget sample ${index + 1} gravity force`);
    assertFiniteVector(sample.recoveryForceWorldN, `vector budget sample ${index + 1} recovery force`);
    return sample;
  });
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].timeS < normalized[index - 1].timeS) {
      throw new Error("vector budget sample times must be non-decreasing");
    }
  }
  const normalizedEvents = events.map((event, index) => {
    if (!event.id.trim()) throw new Error(`vector budget event ${index + 1} id cannot be empty`);
    assertFinite(event.timeS, `vector budget event ${event.id} time`);
    assertFiniteVector(event.deltaVWorldMps, `vector budget event ${event.id} delta-v`);
    return event;
  });
  for (let index = 1; index < normalizedEvents.length; index += 1) {
    if (normalizedEvents[index].timeS < normalizedEvents[index - 1].timeS) {
      throw new Error("vector budget event times must be non-decreasing");
    }
  }
  if (normalized.length < 2) {
    return emptyResult(
      normalized.length,
      normalizedEvents.length,
      closureToleranceMps,
      [
        "The trace has fewer than two samples, so world-frame vector impulses are not assessed.",
        ...(options.additionalWarnings ?? []),
      ],
    );
  }
  const firstSample = normalized[0];
  const lastSample = normalized[normalized.length - 1];
  const timeSpanS = lastSample.timeS - firstSample.timeS;
  if (!(timeSpanS > 0)) {
    return {
      ...emptyResult(
        normalized.length,
        normalizedEvents.length,
        closureToleranceMps,
        [
          "The trace has no positive time span, so world-frame vector impulses are not assessed.",
          ...(options.additionalWarnings ?? []),
        ],
      ),
      timeSpanS,
    };
  }
  for (const event of normalizedEvents) {
    if (event.timeS < firstSample.timeS - 1e-9 || event.timeS > lastSample.timeS + 1e-9) {
      throw new Error(`vector budget event ${event.id} lies outside the trace time span`);
    }
  }

  const forceKeys = ["thrust", "aerodynamic", "gravity", "recovery"] as const;
  const forceImpulses: Record<(typeof forceKeys)[number], Vector3> = {
    thrust: ZERO_VECTOR,
    aerodynamic: ZERO_VECTOR,
    gravity: ZERO_VECTOR,
    recovery: ZERO_VECTOR,
  };
  const deltaVs: Record<(typeof forceKeys)[number], Vector3> = {
    thrust: ZERO_VECTOR,
    aerodynamic: ZERO_VECTOR,
    gravity: ZERO_VECTOR,
    recovery: ZERO_VECTOR,
  };
  for (let index = 1; index < normalized.length; index += 1) {
    const left = normalized[index - 1];
    const right = normalized[index];
    const durationS = right.timeS - left.timeS;
    if (!(durationS > 0)) continue;
    const forces = {
      thrust: [left.thrustForceWorldN, right.thrustForceWorldN] as const,
      aerodynamic: [left.aerodynamicForceWorldN, right.aerodynamicForceWorldN] as const,
      gravity: [left.gravityForceWorldN, right.gravityForceWorldN] as const,
      recovery: [left.recoveryForceWorldN, right.recoveryForceWorldN] as const,
    };
    for (const key of forceKeys) {
      const [leftForce, rightForce] = forces[key];
      forceImpulses[key] = addVectors(
        forceImpulses[key],
        integrateVector(leftForce, rightForce, durationS),
      );
      deltaVs[key] = addVectors(
        deltaVs[key],
        integrateForceOverMass(
          leftForce,
          rightForce,
          left.massKg,
          right.massKg,
          durationS,
        ),
      );
    }
  }
  const components = forceKeys.map((key) => component(forceImpulses[key], deltaVs[key]));
  const [thrust, aerodynamic, gravity, recovery] = components;
  const continuousNetDeltaVWorldMps = addComponentDeltaV(components);
  const continuousNetForceImpulseWorldNs = forceKeys.reduce(
    (sum, key) => addVectors(sum, forceImpulses[key]),
    ZERO_VECTOR,
  );
  const continuousNet = component(
    continuousNetForceImpulseWorldNs,
    continuousNetDeltaVWorldMps,
  );
  const eventDeltaVWorldMps = normalizedEvents.reduce(
    (sum, event) => addVectors(sum, event.deltaVWorldMps),
    ZERO_VECTOR,
  );
  const observedVelocityChangeWorldMps = subtractVectors(
    lastSample.velocityWorldMps,
    firstSample.velocityWorldMps,
  );
  const accountedVelocityChangeWorldMps = addVectors(
    continuousNetDeltaVWorldMps,
    eventDeltaVWorldMps,
  );
  const closureResidualWorldMps = subtractVectors(
    accountedVelocityChangeWorldMps,
    observedVelocityChangeWorldMps,
  );
  const closureResidualMagnitudeMps = magnitude(closureResidualWorldMps);
  const closureStatus: StageFlightVectorClosureStatus =
    closureResidualMagnitudeMps <= closureToleranceMps ? "closed" : "review";
  return {
    modelVersion: STAGE_FLIGHT_VECTOR_BUDGET_MODEL_VERSION,
    validationStatus: STAGE_FLIGHT_VECTOR_BUDGET_VALIDATION_STATUS,
    status: "assessed",
    sampleCount: normalized.length,
    eventCount: normalizedEvents.length,
    timeSpanS,
    initialVelocityWorldMps: firstSample.velocityWorldMps,
    finalVelocityWorldMps: lastSample.velocityWorldMps,
    observedVelocityChangeWorldMps,
    thrust,
    aerodynamic,
    gravity,
    recovery,
    continuousNet,
    eventDeltaVWorldMps,
    accountedVelocityChangeWorldMps,
    closureResidualWorldMps,
    closureResidualMagnitudeMps,
    closureToleranceMps,
    closureStatus,
    assumptions: [
      "Each force contribution is integrated in the world ENU frame as force divided by the recorded instantaneous mass using trapezoidal intervals.",
      "Discrete event delta-v is added from the supplied state jump and is not reconstructed as a finite-duration mechanism force.",
      "The closure residual is a diagnostic for omitted constraint forces, event mechanisms, discontinuities, and numerical integration error; it is not a safety margin.",
    ],
    warnings: [
      "This world-frame vector budget is an analytical trace accounting layer, not a validated mission delta-v, loss, certification, or flight-safety result.",
      ...(closureStatus === "review"
        ? [`Velocity closure residual ${closureResidualMagnitudeMps.toFixed(3)} m/s exceeds the ${closureToleranceMps.toFixed(3)} m/s diagnostic tolerance; inspect constraint forces, event mechanisms, and step sensitivity.`]
        : []),
      ...(options.additionalWarnings ?? []),
    ],
  };
}
