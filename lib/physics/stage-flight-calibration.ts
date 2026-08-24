import {
  runDesignOptimization,
  type DesignOptimizationResult,
  type OptimizationConstraint,
  type OptimizationObjective,
  type OptimizationVariable,
} from "./design-optimization.ts";
import {
  createStageFlightVariant,
} from "./stage-flight-uncertainty.ts";
import {
  STAGE_FLIGHT_SWEEP_PARAMETER_DEFINITIONS,
  type StageFlightSweepParameterKey,
} from "./stage-flight-sweep.ts";
import {
  simulateStageFlightPreview,
  STAGE_FLIGHT_PREVIEW_MODEL_VERSION,
  type StageFlightPreviewInput,
} from "./stage-flight-preview.ts";
import {
  compareFlightDataToStageTrace,
  type FlightDataSeries,
  type FlightDataMetricComparison,
} from "./flight-data-comparison.ts";

/**
 * Versioned, clean-room parameter-estimation adapter for a user-supplied
 * staged flight log. This is a residual-minimization study, not an
 * experimental validation claim or an alternate simulation kernel.
 */
export const STAGE_FLIGHT_CALIBRATION_ADAPTER_VERSION =
  "rocketworks-stage-flight-calibration-0.1.0";
export const STAGE_FLIGHT_CALIBRATION_STATUS =
  "engineering-preview-unvalidated" as const;

export type StageFlightCalibrationMetricKey =
  | "weightedResidualRmse"
  | "altitudeRmseM"
  | "velocityRmseMps"
  | "accelerationRmseMps2"
  | "matchedSampleFraction"
  | "converged"
  | "simulationFailure";

export type StageFlightCalibrationVariable = Omit<
  OptimizationVariable,
  "key"
> & Readonly<{ key: StageFlightSweepParameterKey }>;

export type StageFlightCalibrationObjective = Omit<
  OptimizationObjective,
  "metricKey"
> & Readonly<{ metricKey: StageFlightCalibrationMetricKey }>;

export type StageFlightCalibrationConstraint = Omit<
  OptimizationConstraint,
  "metricKey"
> & Readonly<{ metricKey: StageFlightCalibrationMetricKey }>;

export type StageFlightCalibrationResult = Readonly<{
  adapterVersion: typeof STAGE_FLIGHT_CALIBRATION_ADAPTER_VERSION;
  modelVersion: string;
  validationStatus: typeof STAGE_FLIGHT_CALIBRATION_STATUS;
  sourceName: string;
  timeOffsetS: number;
  result: DesignOptimizationResult;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

type MetricSummary = FlightDataMetricComparison | undefined;

function metricScale(metric: "altitudeM" | "velocityMps" | "accelerationMps2", summary: MetricSummary): number {
  const floor = metric === "altitudeM" ? 10 : 5;
  return Math.max(Math.abs(summary?.measuredMean ?? 0), floor);
}

function metricLoss(
  metric: "altitudeM" | "velocityMps" | "accelerationMps2",
  summary: MetricSummary,
): number {
  if (!summary) return 0;
  if (summary.rootMeanSquareNormalizedResidual !== null) {
    return summary.rootMeanSquareNormalizedResidual;
  }
  return summary.rootMeanSquareError / metricScale(metric, summary);
}

function finiteMetric(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

function evaluateCalibration(
  baseInput: StageFlightPreviewInput,
  series: FlightDataSeries,
  timeOffsetS: number,
  values: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  try {
    const result = simulateStageFlightPreview(createStageFlightVariant(baseInput, values));
    const comparison = compareFlightDataToStageTrace(
      result.trace.map((point) => ({
        timeS: point.timeS,
        altitudeAglM: point.altitudeAglM,
        speedMps: point.speedMps,
      })),
      series,
      { timeOffsetS },
    );
    const altitude = comparison.metrics.altitudeM;
    const velocity = comparison.metrics.velocityMps;
    const acceleration = comparison.metrics.accelerationMps2;
    const losses = [
      [metricLoss("altitudeM", altitude), altitude?.sampleCount ?? 0],
      [metricLoss("velocityMps", velocity), velocity?.sampleCount ?? 0],
      [metricLoss("accelerationMps2", acceleration), acceleration?.sampleCount ?? 0],
    ] as const;
    const weightedCount = losses.reduce((sum, [, count]) => sum + count, 0);
    const weightedResidualRmse = weightedCount > 0
      ? Math.sqrt(losses.reduce((sum, [loss, count]) => sum + loss ** 2 * count, 0) / weightedCount)
      : 1e9;
    return {
      weightedResidualRmse,
      altitudeRmseM: finiteMetric(altitude?.rootMeanSquareError, 1e9),
      velocityRmseMps: finiteMetric(velocity?.rootMeanSquareError, 1e9),
      accelerationRmseMps2: finiteMetric(acceleration?.rootMeanSquareError, 1e9),
      matchedSampleFraction: comparison.matchedSampleCount / Math.max(series.samples.length, 1),
      converged: result.convergence.status === "converged" ? 1 : 0,
      simulationFailure: 0,
    };
  } catch {
    return {
      weightedResidualRmse: 1e9,
      altitudeRmseM: 1e9,
      velocityRmseMps: 1e9,
      accelerationRmseMps2: 1e9,
      matchedSampleFraction: 0,
      converged: 0,
      simulationFailure: 1,
    };
  }
}

function validateVariables(
  variables: readonly StageFlightCalibrationVariable[],
): void {
  const definitions = new Map(
    STAGE_FLIGHT_SWEEP_PARAMETER_DEFINITIONS.map((definition) => [
      definition.key,
      definition,
    ]),
  );
  for (const variable of variables) {
    const definition = definitions.get(variable.key);
    if (!definition) {
      throw new Error(`staged calibration variable ${variable.key} is not supported`);
    }
    if (
      variable.minimum < definition.minimum ||
      variable.maximum > definition.maximum
    ) {
      throw new Error(
        `staged calibration variable ${variable.key} must remain between ${definition.minimum} and ${definition.maximum}`,
      );
    }
  }
}

/**
 * Estimate bounded declared factors against an imported stage-flight log.
 * Residuals are normalized by supplied one-sigma values when present;
 * otherwise each channel uses a documented measured-mean scale. Failed
 * candidate evaluations become explicitly infeasible metric rows rather than
 * disappearing from the search.
 */
export function calibrateStageFlightToData(input: Readonly<{
  baseInput: StageFlightPreviewInput;
  series: FlightDataSeries;
  timeOffsetS?: number;
  seed: string;
  populationSize: number;
  generations: number;
  variables: readonly StageFlightCalibrationVariable[];
  objectives: readonly StageFlightCalibrationObjective[];
  constraints?: readonly StageFlightCalibrationConstraint[];
}>): StageFlightCalibrationResult {
  validateVariables(input.variables);
  const timeOffsetS = input.timeOffsetS ?? 0;
  if (!Number.isFinite(timeOffsetS) || timeOffsetS < -600 || timeOffsetS > 600) {
    throw new Error("staged calibration time offset must be finite and between -600 and 600 s");
  }
  if (input.series.samples.length < 2) {
    throw new Error("staged calibration requires at least two measured samples");
  }
  const result = runDesignOptimization({
    seed: input.seed,
    populationSize: input.populationSize,
    generations: input.generations,
    variables: input.variables,
    objectives: input.objectives,
    constraints: input.constraints,
    evaluator: (values) =>
      evaluateCalibration(input.baseInput, input.series, timeOffsetS, values),
  });
  return {
    adapterVersion: STAGE_FLIGHT_CALIBRATION_ADAPTER_VERSION,
    modelVersion: STAGE_FLIGHT_PREVIEW_MODEL_VERSION,
    validationStatus: STAGE_FLIGHT_CALIBRATION_STATUS,
    sourceName: input.series.sourceName,
    timeOffsetS,
    result,
    warnings: [
      "Calibration minimizes residuals against the supplied log; it does not establish sensor accuracy, model validity, or causal parameter truth.",
      "Candidate simulation failures remain visible as an infeasible simulationFailure metric and are not converted into plausible residuals.",
      "This calibration study is an engineering preview, not validation, certification, manufacturing approval, or a flight-safety assessment.",
    ],
    assumptions: [
      "Measured samples are compared with linearly interpolated coupled stage-flight altitude, speed, and reconstructed acceleration.",
      "Positive supplied one-sigma values define the normalized residual scale; channels without sigma use a measured-mean scale with a conservative floor.",
      "The time offset is caller-declared and fixed during the search; event alignment, sensor bias, coordinate transforms, and time-correlated noise are not estimated.",
      "Only the declared bounded variant factors change; topology, event declarations, environment source, integration method, and aerodynamic source remain fixed.",
    ],
  };
}
