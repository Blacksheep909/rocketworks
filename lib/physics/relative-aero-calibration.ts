import {
  runDesignOptimization,
  type DesignOptimizationResult,
  type OptimizationConstraint,
  type OptimizationObjective,
  type OptimizationVariable,
} from "./design-optimization.ts";
import {
  analyzeRelativeAeroInteraction,
  RELATIVE_AERO_INTERACTION_MODEL_VERSION,
  type RelativeAeroInteractionBody,
  type RelativeAeroInteractionOptions,
  type RelativeAeroInteractionResult,
} from "./relative-aero-interaction.ts";
import type { LaunchEnvironmentProvider } from "./launch-environment.ts";

/**
 * Versioned, clean-room evidence adapter for the released-body wake proxy.
 * It estimates only caller-declared proxy factors against aggregate pair
 * observations; it never feeds a force or moment back into a trajectory.
 */
export const RELATIVE_AERO_CALIBRATION_ADAPTER_VERSION =
  "rocketworks-relative-aero-calibration-0.1.0";
export const RELATIVE_AERO_CALIBRATION_STATUS =
  "engineering-preview-unvalidated" as const;

export type RelativeAeroCalibrationMetricKey =
  | "weightedResidualRmse"
  | "exposureCoverageRmse"
  | "peakVelocityDeficitRmse"
  | "dynamicPressureDeltaRmse"
  | "matchedObservationFraction"
  | "simulationFailure";

export type RelativeAeroCalibrationVariableKey =
  | "wakeHalfAngleDeg"
  | "wakeRecoveryDistanceBodyDiameters"
  | "peakVelocityDeficitFraction"
  | "maximumVelocityDeficitFraction";

export type RelativeAeroCalibrationVariable = Omit<
  OptimizationVariable,
  "key"
> & Readonly<{ key: RelativeAeroCalibrationVariableKey }>;

export type RelativeAeroCalibrationObjective = Omit<
  OptimizationObjective,
  "metricKey"
> & Readonly<{ metricKey: RelativeAeroCalibrationMetricKey }>;

export type RelativeAeroCalibrationConstraint = Omit<
  OptimizationConstraint,
  "metricKey"
> & Readonly<{ metricKey: RelativeAeroCalibrationMetricKey }>;

export type RelativeAeroCalibrationObservation = Readonly<{
  sourceBodyId: string;
  targetBodyId: string;
  exposureCoverageFraction?: number;
  peakVelocityDeficitFraction?: number;
  maximumEstimatedDynamicPressureDeltaPa?: number;
  exposureCoverageUncertainty?: number;
  peakVelocityDeficitUncertainty?: number;
  dynamicPressureDeltaUncertainty?: number;
}>;

export type RelativeAeroCalibrationEvidence = Readonly<{
  sourceName: string;
  observations: readonly RelativeAeroCalibrationObservation[];
}>;

export type RelativeAeroCalibrationResult = Readonly<{
  adapterVersion: typeof RELATIVE_AERO_CALIBRATION_ADAPTER_VERSION;
  modelVersion: string;
  validationStatus: typeof RELATIVE_AERO_CALIBRATION_STATUS;
  sourceName: string;
  observationCount: number;
  result: DesignOptimizationResult;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

type SupportedCsvColumn =
  | "sourceBodyId"
  | "targetBodyId"
  | "exposureCoverageFraction"
  | "peakVelocityDeficitFraction"
  | "maximumEstimatedDynamicPressureDeltaPa"
  | "exposureCoverageUncertainty"
  | "peakVelocityDeficitUncertainty"
  | "dynamicPressureDeltaUncertainty";

const CSV_COLUMN_ALIASES: Readonly<Record<string, SupportedCsvColumn>> = {
  source: "sourceBodyId",
  source_id: "sourceBodyId",
  source_body: "sourceBodyId",
  source_body_id: "sourceBodyId",
  target: "targetBodyId",
  target_id: "targetBodyId",
  target_body: "targetBodyId",
  target_body_id: "targetBodyId",
  exposure_fraction: "exposureCoverageFraction",
  exposure_coverage_fraction: "exposureCoverageFraction",
  exposed_fraction: "exposureCoverageFraction",
  coverage_fraction: "exposureCoverageFraction",
  peak_deficit_fraction: "peakVelocityDeficitFraction",
  peak_velocity_deficit_fraction: "peakVelocityDeficitFraction",
  velocity_deficit_fraction: "peakVelocityDeficitFraction",
  dynamic_pressure_delta_pa: "maximumEstimatedDynamicPressureDeltaPa",
  maximum_dynamic_pressure_delta_pa: "maximumEstimatedDynamicPressureDeltaPa",
  maximum_estimated_dynamic_pressure_delta_pa: "maximumEstimatedDynamicPressureDeltaPa",
  q_delta_pa: "maximumEstimatedDynamicPressureDeltaPa",
  exposure_sigma: "exposureCoverageUncertainty",
  exposure_uncertainty: "exposureCoverageUncertainty",
  exposure_coverage_sigma: "exposureCoverageUncertainty",
  peak_deficit_sigma: "peakVelocityDeficitUncertainty",
  peak_velocity_deficit_sigma: "peakVelocityDeficitUncertainty",
  deficit_uncertainty: "peakVelocityDeficitUncertainty",
  dynamic_pressure_delta_sigma_pa: "dynamicPressureDeltaUncertainty",
  dynamic_pressure_uncertainty_pa: "dynamicPressureDeltaUncertainty",
  q_delta_sigma_pa: "dynamicPressureDeltaUncertainty",
};

const MAX_EVIDENCE_CSV_BYTES = 5_000_000;
const MAX_EVIDENCE_OBSERVATIONS = 100_000;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/^\uFEFF/, "").replace(/\s+/g, "_");
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function normalizeSourceName(value: string): string {
  const sourceName = value.trim();
  if (!sourceName) throw new Error("relative-flow calibration source name cannot be empty");
  return sourceName.slice(0, 240);
}

function validateObservation(
  observation: RelativeAeroCalibrationObservation,
  index: number,
): void {
  const label = `relative-flow evidence row ${index + 1}`;
  if (!observation.sourceBodyId.trim() || !observation.targetBodyId.trim()) {
    throw new Error(`${label} requires source and target body identifiers`);
  }
  if (observation.sourceBodyId === observation.targetBodyId) {
    throw new Error(`${label} source and target body identifiers must differ`);
  }
  const metricValues = [
    observation.exposureCoverageFraction,
    observation.peakVelocityDeficitFraction,
    observation.maximumEstimatedDynamicPressureDeltaPa,
  ];
  if (!metricValues.some((value) => value !== undefined)) {
    throw new Error(`${label} requires at least one supported measured metric`);
  }
  if (observation.exposureCoverageFraction !== undefined) {
    assertFinite(observation.exposureCoverageFraction, `${label} exposure coverage`);
    if (observation.exposureCoverageFraction < 0 || observation.exposureCoverageFraction > 1) {
      throw new Error(`${label} exposure coverage must be between 0 and 1`);
    }
  }
  if (observation.peakVelocityDeficitFraction !== undefined) {
    assertFinite(observation.peakVelocityDeficitFraction, `${label} velocity deficit`);
    if (observation.peakVelocityDeficitFraction < 0 || observation.peakVelocityDeficitFraction >= 1) {
      throw new Error(`${label} velocity deficit must be from 0 through less than 1`);
    }
  }
  if (observation.maximumEstimatedDynamicPressureDeltaPa !== undefined) {
    assertFinite(observation.maximumEstimatedDynamicPressureDeltaPa, `${label} dynamic-pressure delta`);
    if (observation.maximumEstimatedDynamicPressureDeltaPa < 0) {
      throw new Error(`${label} dynamic-pressure delta must be non-negative`);
    }
  }
  const uncertainties = [
    observation.exposureCoverageUncertainty,
    observation.peakVelocityDeficitUncertainty,
    observation.dynamicPressureDeltaUncertainty,
  ];
  uncertainties.forEach((value, uncertaintyIndex) => {
    if (value !== undefined) {
      assertFinite(value, `${label} uncertainty ${uncertaintyIndex + 1}`);
      if (!(value > 0)) throw new Error(`${label} uncertainties must be positive`);
    }
  });
  if (observation.exposureCoverageUncertainty !== undefined && observation.exposureCoverageFraction === undefined) {
    throw new Error(`${label} exposure uncertainty requires exposure coverage`);
  }
  if (observation.peakVelocityDeficitUncertainty !== undefined && observation.peakVelocityDeficitFraction === undefined) {
    throw new Error(`${label} deficit uncertainty requires a deficit measurement`);
  }
  if (observation.dynamicPressureDeltaUncertainty !== undefined && observation.maximumEstimatedDynamicPressureDeltaPa === undefined) {
    throw new Error(`${label} dynamic-pressure uncertainty requires a dynamic-pressure measurement`);
  }
}

function validateEvidence(evidence: RelativeAeroCalibrationEvidence): string {
  const sourceName = normalizeSourceName(evidence.sourceName);
  if (evidence.observations.length < 1) {
    throw new Error("relative-flow calibration requires at least one evidence row");
  }
  const pairKeys = new Set<string>();
  evidence.observations.forEach((observation, index) => {
    validateObservation(observation, index);
    const key = `${observation.sourceBodyId}\u0000${observation.targetBodyId}`;
    if (pairKeys.has(key)) throw new Error(`relative-flow evidence contains duplicate pair ${observation.sourceBodyId} → ${observation.targetBodyId}`);
    pairKeys.add(key);
  });
  return sourceName;
}

/**
 * Parse a strict pair-level evidence CSV. Blank metric cells are allowed so a
 * source can provide only the channels it measured. Unknown columns are
 * ignored, while source/target identifiers and at least one metric are
 * required per row.
 */
export function parseRelativeAeroCalibrationCsv(
  csv: string,
  sourceName = "Relative-flow evidence CSV",
): RelativeAeroCalibrationEvidence {
  if (typeof csv !== "string") throw new Error("relative-flow evidence CSV must be text");
  if (new TextEncoder().encode(csv).byteLength > MAX_EVIDENCE_CSV_BYTES) {
    throw new Error("relative-flow evidence CSV exceeds the 5 MB import limit");
  }
  const rows = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter((row) => row.line && !row.line.startsWith("#"));
  if (rows.length < 2) throw new Error("relative-flow evidence CSV requires a header and at least one data row");
  const headers = rows[0]!.line.split(",").map(normalizeHeader);
  const mappedHeaders = headers.map((header) => CSV_COLUMN_ALIASES[header] ?? null);
  if (!mappedHeaders.includes("sourceBodyId") || !mappedHeaders.includes("targetBodyId")) {
    throw new Error("relative-flow evidence CSV needs source_body_id and target_body_id columns");
  }
  const seen = new Set<string>();
  mappedHeaders.forEach((header) => {
    if (header === null) return;
    if (seen.has(header)) throw new Error(`relative-flow evidence CSV contains duplicate ${header} columns`);
    seen.add(header);
  });
  const observations: RelativeAeroCalibrationObservation[] = [];
  rows.slice(1).forEach((row) => {
    if (observations.length >= MAX_EVIDENCE_OBSERVATIONS) throw new Error("relative-flow evidence CSV contains too many rows");
    if (row.line.includes('"')) throw new Error(`relative-flow evidence CSV line ${row.lineNumber} must not contain quoted fields`);
    const fields = row.line.split(",").map((field) => field.trim());
    if (fields.length !== headers.length) throw new Error(`relative-flow evidence CSV line ${row.lineNumber} must contain ${headers.length} columns`);
    const values: Partial<Record<SupportedCsvColumn, string | number>> = {};
    fields.forEach((field, index) => {
      const key = mappedHeaders[index];
      if (key === null || field === "") return;
      if (key === "sourceBodyId" || key === "targetBodyId") {
        values[key] = field;
        return;
      }
      const value = Number(field);
      if (!Number.isFinite(value)) throw new Error(`relative-flow evidence CSV line ${row.lineNumber} contains a non-finite number`);
      values[key] = value;
    });
    if (typeof values.sourceBodyId !== "string" || typeof values.targetBodyId !== "string") {
      throw new Error(`relative-flow evidence CSV line ${row.lineNumber} requires source and target identifiers`);
    }
    const observation: RelativeAeroCalibrationObservation = {
      sourceBodyId: values.sourceBodyId,
      targetBodyId: values.targetBodyId,
      ...(typeof values.exposureCoverageFraction === "number" ? { exposureCoverageFraction: values.exposureCoverageFraction } : {}),
      ...(typeof values.peakVelocityDeficitFraction === "number" ? { peakVelocityDeficitFraction: values.peakVelocityDeficitFraction } : {}),
      ...(typeof values.maximumEstimatedDynamicPressureDeltaPa === "number" ? { maximumEstimatedDynamicPressureDeltaPa: values.maximumEstimatedDynamicPressureDeltaPa } : {}),
      ...(typeof values.exposureCoverageUncertainty === "number" ? { exposureCoverageUncertainty: values.exposureCoverageUncertainty } : {}),
      ...(typeof values.peakVelocityDeficitUncertainty === "number" ? { peakVelocityDeficitUncertainty: values.peakVelocityDeficitUncertainty } : {}),
      ...(typeof values.dynamicPressureDeltaUncertainty === "number" ? { dynamicPressureDeltaUncertainty: values.dynamicPressureDeltaUncertainty } : {}),
    };
    validateObservation(observation, observations.length);
    observations.push(observation);
  });
  const evidence = { sourceName, observations } satisfies RelativeAeroCalibrationEvidence;
  validateEvidence(evidence);
  return { sourceName: normalizeSourceName(sourceName), observations };
}

function metricScale(metric: "exposure" | "deficit" | "dynamicPressure", value: number): number {
  if (metric === "exposure") return 0.25;
  if (metric === "deficit") return 0.1;
  return Math.max(Math.abs(value), 10);
}

function normalizedResidual(
  predicted: number,
  measured: number,
  uncertainty: number | undefined,
  metric: "exposure" | "deficit" | "dynamicPressure",
): number {
  const scale = uncertainty ?? metricScale(metric, measured);
  return (predicted - measured) / scale;
}

function evaluateObservationMetric(
  predicted: RelativeAeroInteractionResult["pairs"][number] | undefined,
  observation: RelativeAeroCalibrationObservation,
): Readonly<{ sumSquared: number; count: number; residuals: number[]; failed: boolean }> {
  if (!predicted) return { sumSquared: 1e18, count: 1, residuals: [1e9], failed: true };
  const residuals: number[] = [];
  if (observation.exposureCoverageFraction !== undefined) {
    const value = predicted.exposureCoverageFraction;
    residuals.push(normalizedResidual(value, observation.exposureCoverageFraction, observation.exposureCoverageUncertainty, "exposure"));
  }
  if (observation.peakVelocityDeficitFraction !== undefined) {
    const value = predicted.peakVelocityDeficitFraction;
    if (value === null) return { sumSquared: 1e18, count: 1, residuals: [1e9], failed: true };
    residuals.push(normalizedResidual(value, observation.peakVelocityDeficitFraction, observation.peakVelocityDeficitUncertainty, "deficit"));
  }
  if (observation.maximumEstimatedDynamicPressureDeltaPa !== undefined) {
    const value = predicted.maximumEstimatedDynamicPressureDeltaPa;
    if (value === null) return { sumSquared: 1e18, count: 1, residuals: [1e9], failed: true };
    residuals.push(normalizedResidual(value, observation.maximumEstimatedDynamicPressureDeltaPa, observation.dynamicPressureDeltaUncertainty, "dynamicPressure"));
  }
  return {
    sumSquared: residuals.reduce((sum, residual) => sum + residual ** 2, 0),
    count: residuals.length,
    residuals,
    failed: false,
  };
}

function evaluateCalibration(
  input: Readonly<{
    bodies: readonly RelativeAeroInteractionBody[];
    environmentAt?: LaunchEnvironmentProvider;
    options?: RelativeAeroInteractionOptions;
  }>,
  evidence: RelativeAeroCalibrationEvidence,
  values: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  try {
    const result = analyzeRelativeAeroInteraction({
      bodies: input.bodies,
      environmentAt: input.environmentAt,
      options: {
        ...(input.options ?? {}),
        enabled: true,
        ...values,
      },
    });
    const pairs = new Map(result.pairs.map((pair) => [`${pair.sourceBodyId}\u0000${pair.targetBodyId}`, pair]));
    let sumSquared = 0;
    let metricCount = 0;
    let matchedObservationCount = 0;
    let exposureSumSquared = 0;
    let exposureCount = 0;
    let deficitSumSquared = 0;
    let deficitCount = 0;
    let dynamicPressureSumSquared = 0;
    let dynamicPressureCount = 0;
    let simulationFailure = false;
    for (const observation of evidence.observations) {
      const pair = pairs.get(`${observation.sourceBodyId}\u0000${observation.targetBodyId}`);
      if (pair) matchedObservationCount += 1;
      const metric = evaluateObservationMetric(pair, observation);
      simulationFailure ||= metric.failed;
      sumSquared += metric.sumSquared;
      metricCount += metric.count;
      let cursor = 0;
      if (observation.exposureCoverageFraction !== undefined) {
        exposureSumSquared += (metric.residuals[cursor++] ?? 1e9) ** 2;
        exposureCount += 1;
      }
      if (observation.peakVelocityDeficitFraction !== undefined) {
        deficitSumSquared += (metric.residuals[cursor++] ?? 1e9) ** 2;
        deficitCount += 1;
      }
      if (observation.maximumEstimatedDynamicPressureDeltaPa !== undefined) {
        dynamicPressureSumSquared += (metric.residuals[cursor++] ?? 1e9) ** 2;
        dynamicPressureCount += 1;
      }
    }
    return {
      weightedResidualRmse: metricCount > 0 ? Math.sqrt(sumSquared / metricCount) : 1e9,
      exposureCoverageRmse: exposureCount > 0 ? Math.sqrt(exposureSumSquared / exposureCount) : 0,
      peakVelocityDeficitRmse: deficitCount > 0 ? Math.sqrt(deficitSumSquared / deficitCount) : 0,
      dynamicPressureDeltaRmse: dynamicPressureCount > 0 ? Math.sqrt(dynamicPressureSumSquared / dynamicPressureCount) : 0,
      matchedObservationFraction: matchedObservationCount / Math.max(evidence.observations.length, 1),
      simulationFailure: simulationFailure ? 1 : 0,
    };
  } catch {
    return {
      weightedResidualRmse: 1e9,
      exposureCoverageRmse: 1e9,
      peakVelocityDeficitRmse: 1e9,
      dynamicPressureDeltaRmse: 1e9,
      matchedObservationFraction: 0,
      simulationFailure: 1,
    };
  }
}

function validateVariables(variables: readonly RelativeAeroCalibrationVariable[]): void {
  const bounds: Readonly<Record<RelativeAeroCalibrationVariableKey, readonly [number, number]>> = {
    wakeHalfAngleDeg: [0, 45],
    wakeRecoveryDistanceBodyDiameters: [1, 1_000],
    peakVelocityDeficitFraction: [0, 0.99],
    maximumVelocityDeficitFraction: [0, 0.99],
  };
  for (const variable of variables) {
    const range = bounds[variable.key];
    if (!range) throw new Error(`relative-flow calibration variable ${variable.key} is not supported`);
    if (variable.minimum < range[0] || variable.maximum > range[1]) {
      throw new Error(`relative-flow calibration variable ${variable.key} must remain between ${range[0]} and ${range[1]}`);
    }
  }
}

/**
 * Fit bounded wake-proxy factors against pair-level evidence. The calibrated
 * values describe agreement with the supplied evidence source only; they do
 * not promote the interaction screen into a validated aerodynamic model.
 */
export function calibrateRelativeAeroInteraction(input: Readonly<{
  bodies: readonly RelativeAeroInteractionBody[];
  environmentAt?: LaunchEnvironmentProvider;
  options?: RelativeAeroInteractionOptions;
  evidence: RelativeAeroCalibrationEvidence;
  seed: string;
  populationSize: number;
  generations: number;
  variables: readonly RelativeAeroCalibrationVariable[];
  objectives: readonly RelativeAeroCalibrationObjective[];
  constraints?: readonly RelativeAeroCalibrationConstraint[];
}>): RelativeAeroCalibrationResult {
  const sourceName = validateEvidence(input.evidence);
  validateVariables(input.variables);
  const result = runDesignOptimization({
    seed: input.seed,
    populationSize: input.populationSize,
    generations: input.generations,
    variables: input.variables,
    objectives: input.objectives,
    constraints: input.constraints,
    evaluator: (values) => evaluateCalibration(input, input.evidence, values),
  });
  return {
    adapterVersion: RELATIVE_AERO_CALIBRATION_ADAPTER_VERSION,
    modelVersion: RELATIVE_AERO_INTERACTION_MODEL_VERSION,
    validationStatus: RELATIVE_AERO_CALIBRATION_STATUS,
    sourceName,
    observationCount: input.evidence.observations.length,
    result,
    warnings: [
      "Calibration minimizes residuals against aggregate pair observations; it does not establish sensor accuracy, CFD fidelity, wind-tunnel repeatability, or causal parameter truth.",
      "A candidate with no matching pair or no available predicted metric remains an explicitly infeasible simulationFailure row rather than disappearing from the search.",
      "The wake interaction screen remains post-processing only. Calibrated factors do not add forces, moments, contact, plume exchange, or trajectory feedback.",
      "This study is an engineering preview, not stage-separation validation, certification, manufacturing approval, or flight-safety evidence.",
    ],
    assumptions: [
      "Evidence rows identify directed source → target body pairs and compare aggregate exposure coverage, peak velocity deficit, and/or maximum dynamic-pressure delta.",
      "Positive supplied uncertainties define the normalized residual scale; channels without uncertainty use a bounded fraction scale or the measured dynamic-pressure magnitude with a 10 Pa floor.",
      "Body traces, environment provider, geometry, and all unlisted interaction options remain fixed while the declared wake factors vary.",
      "The analyzer uses piecewise-linear trace interpolation and the finite expanding-cone proxy documented by the relative-flow interaction model; no smoothing, phase alignment, or sensor-bias estimation is applied.",
    ],
  };
}

function csvField(value: number | string | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[,\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Export the deterministic Pareto rows for evidence handoff and review. */
export function createRelativeAeroCalibrationCsv(
  result: RelativeAeroCalibrationResult,
): string {
  const lines = [
    `# adapter_version,${csvField(result.adapterVersion)}`,
    `# model_version,${csvField(result.modelVersion)}`,
    `# validation_status,${csvField(result.validationStatus)}`,
    `# source_name,${csvField(result.sourceName)}`,
    `# seed,${csvField(result.result.seed)}`,
    `# observation_count,${csvField(result.observationCount)}`,
    "candidate_id,evaluation_index,feasible,tradeoff_score,wake_half_angle_deg,wake_recovery_distance_body_diameters,peak_velocity_deficit_fraction,maximum_velocity_deficit_fraction,weighted_residual_rmse,exposure_coverage_rmse,peak_velocity_deficit_rmse,dynamic_pressure_delta_rmse,matched_observation_fraction,simulation_failure",
    ...result.result.paretoFront.map((candidate) => [
      candidate.id,
      candidate.evaluationIndex,
      candidate.feasible,
      candidate.tradeoffScore,
      candidate.variables.wakeHalfAngleDeg,
      candidate.variables.wakeRecoveryDistanceBodyDiameters,
      candidate.variables.peakVelocityDeficitFraction,
      candidate.variables.maximumVelocityDeficitFraction,
      candidate.metrics.weightedResidualRmse,
      candidate.metrics.exposureCoverageRmse,
      candidate.metrics.peakVelocityDeficitRmse,
      candidate.metrics.dynamicPressureDeltaRmse,
      candidate.metrics.matchedObservationFraction,
      candidate.metrics.simulationFailure,
    ].map(csvField).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
