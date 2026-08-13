import type { StageFlightPreviewResult } from "./stage-flight-preview.ts";

/**
 * A presentation-safe delta between two completed coupled/staged previews.
 *
 * This module intentionally does not rerun physics or infer accuracy. It only
 * compares finite values already produced by the independent stage-flight
 * preview, so the UI can keep a design decision visible without mutating the
 * simulation contract.
 */
export const STAGE_FLIGHT_COMPARISON_MODEL_VERSION =
  "rocketworks-stage-flight-comparison-0.1.0";
export const STAGE_FLIGHT_COMPARISON_VALIDATION_STATUS = "diagnostic-only" as const;

export type StageFlightComparisonMetricKey =
  | "maxAltitudeAglM"
  | "maxSpeedMps"
  | "timeToApogeeS"
  | "traceSampleCount"
  | "eventCount"
  | "releasedBodyCount";

export type StageFlightComparisonMetric = Readonly<{
  key: StageFlightComparisonMetricKey;
  label: string;
  unit: string;
  decimals: number;
  reference: number | null;
  current: number | null;
  delta: number | null;
}>;

export type StageFlightComparisonResult = Readonly<{
  modelVersion: typeof STAGE_FLIGHT_COMPARISON_MODEL_VERSION;
  validationStatus: typeof STAGE_FLIGHT_COMPARISON_VALIDATION_STATUS;
  metrics: readonly StageFlightComparisonMetric[];
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

type MetricDefinition = Readonly<{
  key: StageFlightComparisonMetricKey;
  label: string;
  unit: string;
  decimals: number;
  value: (result: StageFlightPreviewResult) => number;
}>;

const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  { key: "maxAltitudeAglM", label: "Apogee", unit: "m", decimals: 1, value: (result) => result.maxAltitudeAglM },
  { key: "maxSpeedMps", label: "Maximum speed", unit: "m/s", decimals: 1, value: (result) => result.maxSpeedMps },
  { key: "timeToApogeeS", label: "Time to apogee", unit: "s", decimals: 2, value: (result) => result.timeToApogeeS },
  { key: "traceSampleCount", label: "Trace samples", unit: "samples", decimals: 0, value: (result) => result.trace.length },
  { key: "eventCount", label: "Flight events", unit: "events", decimals: 0, value: (result) => result.events.length },
  { key: "releasedBodyCount", label: "Released bodies", unit: "bodies", decimals: 0, value: (result) => result.separatedBodies.length },
];

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

/**
 * Compare two completed stage-flight previews using deterministic SI values.
 * The delta is always `current - reference`; unavailable values remain null.
 */
export function createStageFlightComparison(
  reference: StageFlightPreviewResult,
  current: StageFlightPreviewResult,
): StageFlightComparisonResult {
  const metrics = METRIC_DEFINITIONS.map((definition) => {
    const referenceValue = finiteOrNull(definition.value(reference));
    const currentValue = finiteOrNull(definition.value(current));
    return {
      key: definition.key,
      label: definition.label,
      unit: definition.unit,
      decimals: definition.decimals,
      reference: referenceValue,
      current: currentValue,
      delta: referenceValue === null || currentValue === null
        ? null
        : currentValue - referenceValue,
    };
  });

  return {
    modelVersion: STAGE_FLIGHT_COMPARISON_MODEL_VERSION,
    validationStatus: STAGE_FLIGHT_COMPARISON_VALIDATION_STATUS,
    metrics,
    warnings: [
      "This is a deterministic run delta, not a validation or flight-safety result.",
      "Both runs must use the same project model and current input fingerprint before a delta is decision-ready.",
    ],
    assumptions: [
      "Values are compared from completed coupled/staged preview result objects without rerunning or reweighting physics.",
      "Trace, event, and released-body counts describe the sampled output and are not convergence evidence.",
      "The delta sign is current minus reference.",
    ],
  };
}
