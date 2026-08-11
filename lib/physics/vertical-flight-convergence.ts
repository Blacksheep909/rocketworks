import {
  simulateVerticalFlight,
  type VerticalFlightConfig,
  type VerticalFlightResult,
} from "./vertical-flight.ts";

/**
 * The convergence helper is intentionally separate from the flight result.
 * A result remains the output of one requested integration, while this record
 * describes a second, deterministic replay at half the step size. Keeping the
 * two records separate prevents a numerical diagnostic from being mistaken
 * for a higher-fidelity trajectory.
 */
export const VERTICAL_FLIGHT_CONVERGENCE_MODEL_VERSION =
  "rocketworks-vertical-convergence-0.1.0";
export const VERTICAL_FLIGHT_CONVERGENCE_STATUS =
  "engineering-preview-unvalidated" as const;
export const VERTICAL_FLIGHT_CONVERGENCE_RELATIVE_TOLERANCE = 0.02;
export const VERTICAL_FLIGHT_CONVERGENCE_TIME_TOLERANCE_S = 0.05;

export type VerticalFlightConvergenceStatus =
  | "converged"
  | "watch"
  | "not-assessed";

export type VerticalFlightConvergenceDiagnostic = Readonly<{
  modelVersion: typeof VERTICAL_FLIGHT_CONVERGENCE_MODEL_VERSION;
  validationStatus: typeof VERTICAL_FLIGHT_CONVERGENCE_STATUS;
  status: VerticalFlightConvergenceStatus;
  baseTimeStepS: number;
  refinedTimeStepS: number;
  maximumRelativeDifference: number | null;
  apogeeRelativeDifference: number | null;
  maxSpeedRelativeDifference: number | null;
  maxDynamicPressureRelativeDifference: number | null;
  impactSpeedRelativeDifference: number | null;
  apogeeTimeDifferenceS: number | null;
  totalFlightTimeDifferenceS: number | null;
  maximumEventTimeDifferenceS: number | null;
  eventSetsMatch: boolean | null;
  relativeTolerance: number;
  timeToleranceS: number;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

function relativeDifference(left: number, right: number): number {
  const denominator = Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.abs(left - right) / denominator;
}

function validateTolerance(value: number | undefined, label: string, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new Error(`${label} must be finite and non-negative`);
  }
  return resolved;
}

function eventKey(type: string, index: number): string {
  return `${type}:${index}`;
}

function assessEventTiming(
  base: VerticalFlightResult,
  refined: VerticalFlightResult,
): Readonly<{ eventSetsMatch: boolean; maximumEventTimeDifferenceS: number | null }> {
  const baseEvents = new Map<string, number>();
  const refinedEvents = new Map<string, number>();
  const baseTypeCounts = new Map<string, number>();
  const refinedTypeCounts = new Map<string, number>();
  for (const event of base.events) {
    const index = baseTypeCounts.get(event.type) ?? 0;
    baseTypeCounts.set(event.type, index + 1);
    baseEvents.set(eventKey(event.type, index), event.timeS);
  }
  for (const event of refined.events) {
    const index = refinedTypeCounts.get(event.type) ?? 0;
    refinedTypeCounts.set(event.type, index + 1);
    refinedEvents.set(eventKey(event.type, index), event.timeS);
  }
  const eventSetsMatch =
    baseEvents.size === refinedEvents.size &&
    [...baseEvents.keys()].every((key) => refinedEvents.has(key));
  if (!eventSetsMatch) {
    return { eventSetsMatch, maximumEventTimeDifferenceS: null };
  }
  return {
    eventSetsMatch,
    maximumEventTimeDifferenceS: Math.max(
      0,
      ...[...baseEvents.entries()].map(([key, timeS]) =>
        Math.abs(timeS - refinedEvents.get(key)!),
      ),
    ),
  };
}

function notAssessed(
  baseTimeStepS: number,
  refinedTimeStepS: number,
  relativeTolerance: number,
  timeToleranceS: number,
  reason: string,
): VerticalFlightConvergenceDiagnostic {
  return {
    modelVersion: VERTICAL_FLIGHT_CONVERGENCE_MODEL_VERSION,
    validationStatus: VERTICAL_FLIGHT_CONVERGENCE_STATUS,
    status: "not-assessed",
    baseTimeStepS,
    refinedTimeStepS,
    maximumRelativeDifference: null,
    apogeeRelativeDifference: null,
    maxSpeedRelativeDifference: null,
    maxDynamicPressureRelativeDifference: null,
    impactSpeedRelativeDifference: null,
    apogeeTimeDifferenceS: null,
    totalFlightTimeDifferenceS: null,
    maximumEventTimeDifferenceS: null,
    eventSetsMatch: null,
    relativeTolerance,
    timeToleranceS,
    warnings: [
      `The half-step vertical replay could not be completed: ${reason}`,
    ],
    assumptions: [
      "Convergence compares one deterministic vertical-flight result with a replay at half the requested integration step.",
      "A missing replay is reported as not assessed rather than silently treated as converged.",
    ],
  };
}

/**
 * Compare a vertical-flight run with a deterministic half-step replay.
 *
 * This is a numerical sensitivity heuristic. It does not estimate model-form
 * error, experimental uncertainty, aerodynamic validity, or flight safety.
 */
export function analyzeVerticalFlightConvergence(input: Readonly<{
  config: VerticalFlightConfig;
  baseResult?: VerticalFlightResult;
  relativeTolerance?: number;
  timeToleranceS?: number;
}>): VerticalFlightConvergenceDiagnostic {
  const baseTimeStepS = input.config.integration?.timeStepS ?? 0.02;
  if (!Number.isFinite(baseTimeStepS) || baseTimeStepS <= 0 || baseTimeStepS > 0.1) {
    throw new Error("vertical convergence base time step must be greater than 0 and at most 0.1 s");
  }
  const refinedTimeStepS = baseTimeStepS / 2;
  const relativeTolerance = validateTolerance(
    input.relativeTolerance,
    "vertical convergence relative tolerance",
    VERTICAL_FLIGHT_CONVERGENCE_RELATIVE_TOLERANCE,
  );
  const timeToleranceS = validateTolerance(
    input.timeToleranceS,
    "vertical convergence time tolerance",
    VERTICAL_FLIGHT_CONVERGENCE_TIME_TOLERANCE_S,
  );
  const baseResult = input.baseResult ?? simulateVerticalFlight(input.config);
  let refinedResult: VerticalFlightResult;
  try {
    refinedResult = simulateVerticalFlight({
      ...input.config,
      integration: {
        ...input.config.integration,
        timeStepS: refinedTimeStepS,
      },
    });
  } catch (error) {
    return notAssessed(
      baseTimeStepS,
      refinedTimeStepS,
      relativeTolerance,
      timeToleranceS,
      error instanceof Error ? error.message : "unknown replay error",
    );
  }

  const apogeeRelativeDifference = relativeDifference(
    baseResult.apogeeM,
    refinedResult.apogeeM,
  );
  const maxSpeedRelativeDifference = relativeDifference(
    baseResult.maxSpeedMps,
    refinedResult.maxSpeedMps,
  );
  const maxDynamicPressureRelativeDifference = relativeDifference(
    baseResult.maxDynamicPressurePa,
    refinedResult.maxDynamicPressurePa,
  );
  const impactSpeedRelativeDifference =
    baseResult.impactSpeedMps === null || refinedResult.impactSpeedMps === null
      ? null
      : relativeDifference(baseResult.impactSpeedMps, refinedResult.impactSpeedMps);
  const maximumRelativeDifference = Math.max(
    apogeeRelativeDifference,
    maxSpeedRelativeDifference,
    maxDynamicPressureRelativeDifference,
    ...(impactSpeedRelativeDifference === null
      ? []
      : [impactSpeedRelativeDifference]),
  );
  const apogeeTimeDifferenceS = Math.abs(
    baseResult.timeToApogeeS - refinedResult.timeToApogeeS,
  );
  const totalFlightTimeDifferenceS = Math.abs(
    baseResult.totalFlightTimeS - refinedResult.totalFlightTimeS,
  );
  const eventTiming = assessEventTiming(baseResult, refinedResult);
  const impactAvailabilityMatches =
    (baseResult.impactSpeedMps === null) === (refinedResult.impactSpeedMps === null);
  const status: VerticalFlightConvergenceStatus =
    eventTiming.eventSetsMatch &&
    eventTiming.maximumEventTimeDifferenceS !== null &&
    eventTiming.maximumEventTimeDifferenceS <= timeToleranceS &&
    apogeeTimeDifferenceS <= timeToleranceS &&
    maximumRelativeDifference <= relativeTolerance &&
    impactAvailabilityMatches
      ? "converged"
      : "watch";
  const warnings = [
    ...(status === "watch"
      ? [
          "The half-step replay changes one or more vertical-flight metrics beyond the numerical heuristic; reduce the step or investigate event/model discontinuities before interpreting the result.",
        ]
      : []),
    ...(!eventTiming.eventSetsMatch
      ? [
          "The coarse and half-step runs reached different event sets, so event timing convergence is unavailable.",
        ]
      : []),
    ...(!impactAvailabilityMatches
      ? [
          "Only one run reached ground impact within its configured duration; impact-speed convergence is unavailable.",
        ]
      : []),
  ];
  return {
    modelVersion: VERTICAL_FLIGHT_CONVERGENCE_MODEL_VERSION,
    validationStatus: VERTICAL_FLIGHT_CONVERGENCE_STATUS,
    status,
    baseTimeStepS,
    refinedTimeStepS,
    maximumRelativeDifference,
    apogeeRelativeDifference,
    maxSpeedRelativeDifference,
    maxDynamicPressureRelativeDifference,
    impactSpeedRelativeDifference,
    apogeeTimeDifferenceS,
    totalFlightTimeDifferenceS,
    maximumEventTimeDifferenceS: eventTiming.maximumEventTimeDifferenceS,
    eventSetsMatch: eventTiming.eventSetsMatch,
    relativeTolerance,
    timeToleranceS,
    warnings,
    assumptions: [
      "Convergence compares the deterministic vertical model with the same model at half the integration step.",
      "Apogee, peak speed, peak dynamic pressure, and impact speed use relative differences normalized by the larger absolute value and a 1-unit floor.",
      "A 2% metric and 0.05 s timing threshold are heuristic numerical checks, not validation, certification, or a flight-safety gate.",
      "Different event sets or impact availability are treated as a watch state rather than silently discarded.",
    ],
  };
}
