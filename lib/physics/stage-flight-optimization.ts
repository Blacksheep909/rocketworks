import {
  runDesignOptimization,
  type DesignOptimizationResult,
  type OptimizationConstraint,
  type OptimizationObjective,
  type OptimizationVariable,
} from "./design-optimization.ts";
import {
  createStageFlightVariant,
  type StageFlightUncertaintyFactor,
} from "./stage-flight-uncertainty.ts";
import {
  STAGE_FLIGHT_SWEEP_PARAMETER_DEFINITIONS,
  type StageFlightSweepParameterKey,
} from "./stage-flight-sweep.ts";
import {
  simulateStageFlightPreview,
  STAGE_FLIGHT_PREVIEW_MODEL_VERSION,
  STAGE_FLIGHT_PREVIEW_STATUS,
  type StageFlightPreviewInput,
  type StageFlightPreviewResult,
} from "./stage-flight-preview.ts";
import {
  runUncertaintyAnalysis,
  type UncertaintyAnalysisResult,
  type UncertaintyCorrelation,
} from "./uncertainty-analysis.ts";
import { magnitude } from "./linear-algebra.ts";

/**
 * Versioned adapter for bounded design searches over the complete staged
 * preview. The search owns no alternate equations: every candidate is
 * evaluated by the same staged 6DOF, rail, event, recovery, and released-body
 * branches as a nominal run.
 */
export const STAGE_FLIGHT_OPTIMIZATION_ADAPTER_VERSION =
  "rocketworks-stage-flight-optimization-0.1.0";
export const STAGE_FLIGHT_OPTIMIZATION_STATUS = STAGE_FLIGHT_PREVIEW_STATUS;

export type StageFlightOptimizationMetricKey =
  | "maxAltitudeAglM"
  | "maxSpeedMps"
  | "timeToApogeeS"
  | "maxDynamicPressurePa"
  | "finalSpeedMps"
  | "eventCount"
  | "separatedBodyCount"
  | "converged"
  | "robustMaxAltitudeP05M"
  | "robustMaxDynamicPressureP95Pa"
  | "robustFinalSpeedP95Mps"
  | "robustFailureRate";

export type StageFlightOptimizationVariable = Omit<
  OptimizationVariable,
  "key"
> & Readonly<{ key: StageFlightSweepParameterKey }>;

export type StageFlightOptimizationObjective = Omit<
  OptimizationObjective,
  "metricKey"
> & Readonly<{ metricKey: StageFlightOptimizationMetricKey }>;

export type StageFlightOptimizationConstraint = Omit<
  OptimizationConstraint,
  "metricKey"
> & Readonly<{ metricKey: StageFlightOptimizationMetricKey }>;

export type StageFlightOptimizationRobustness = Readonly<{
  /** Number of bounded uncertainty scenarios evaluated per candidate. */
  sampleCount: number;
  seed: string;
  factors: readonly StageFlightUncertaintyFactor[];
  correlations?: readonly UncertaintyCorrelation[];
}>;

export type StageFlightOptimizationResult = Readonly<{
  adapterVersion: typeof STAGE_FLIGHT_OPTIMIZATION_ADAPTER_VERSION;
  modelVersion: string;
  validationStatus: typeof STAGE_FLIGHT_OPTIMIZATION_STATUS;
  result: DesignOptimizationResult;
  robustness: StageFlightOptimizationRobustness | null;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

function stableCandidateSeed(
  seed: string,
  values: Readonly<Record<string, number>>,
): string {
  return `${seed}:${JSON.stringify(
    Object.fromEntries(
      Object.keys(values)
        .sort()
        .map((key) => [key, values[key]]),
    ),
  )}`;
}

function summaryValue(
  summary: { p05: number | null; p95: number | null } | undefined,
  quantile: "p05" | "p95",
  fallback: number,
): number {
  const value = summary?.[quantile];
  return value === null || value === undefined || !Number.isFinite(value)
    ? fallback
    : value;
}

function finalStateSpeedMps(result: StageFlightPreviewResult): number {
  const finalState = result.rail?.finalState ?? result.simulation?.finalState;
  return finalState ? magnitude(finalState.velocityWorldMps) : 0;
}

function evaluateStageFlight(
  input: StageFlightPreviewInput,
  values: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const result = simulateStageFlightPreview(createStageFlightVariant(input, values));
  return {
    maxAltitudeAglM: result.maxAltitudeAglM,
    maxSpeedMps: result.maxSpeedMps,
    timeToApogeeS: result.timeToApogeeS,
    maxDynamicPressurePa: Math.max(
      0,
      ...result.trace.map((point) => point.dynamicPressurePa),
    ),
    finalSpeedMps: finalStateSpeedMps(result),
    eventCount: result.events.length,
    separatedBodyCount: result.separatedBodies.length,
    converged: result.convergence.status === "converged" ? 1 : 0,
  };
}

function validateRobustness(
  robustness: StageFlightOptimizationRobustness | undefined,
): void {
  if (!robustness) return;
  if (!robustness.seed.trim()) {
    throw new Error("staged robust optimization seed cannot be empty");
  }
  if (
    !Number.isInteger(robustness.sampleCount) ||
    robustness.sampleCount < 8 ||
    robustness.sampleCount > 128
  ) {
    throw new Error(
      "staged robust optimization sample count must be an integer from 8 through 128",
    );
  }
  if (robustness.factors.length === 0) {
    throw new Error("staged robust optimization requires at least one uncertainty factor");
  }
}

function validateVariables(
  variables: readonly StageFlightOptimizationVariable[],
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
      throw new Error(`staged optimization variable ${variable.key} is not supported`);
    }
    if (
      variable.minimum < definition.minimum ||
      variable.maximum > definition.maximum
    ) {
      throw new Error(
        `staged optimization variable ${variable.key} must remain between ${definition.minimum} and ${definition.maximum}`,
      );
    }
  }
}

/**
 * Runs a seeded, constraint-aware staged design search. Robust metrics are
 * finite-sample scenario summaries around each nominal candidate; failed
 * scenarios remain visible through the failure-rate metric and the shared
 * uncertainty contract.
 */
export function optimizeStageFlightDesign(input: Readonly<{
  baseInput: StageFlightPreviewInput;
  seed: string;
  populationSize: number;
  generations: number;
  variables: readonly StageFlightOptimizationVariable[];
  objectives: readonly StageFlightOptimizationObjective[];
  constraints?: readonly StageFlightOptimizationConstraint[];
  robustness?: StageFlightOptimizationRobustness;
}>): StageFlightOptimizationResult {
  validateVariables(input.variables);
  validateRobustness(input.robustness);
  const result = runDesignOptimization({
    seed: input.seed,
    populationSize: input.populationSize,
    generations: input.generations,
    variables: input.variables,
    objectives: input.objectives,
    constraints: input.constraints,
    evaluator: (values) => {
      const nominal = evaluateStageFlight(input.baseInput, values);
      if (!input.robustness) return nominal;
      const candidateInput = createStageFlightVariant(input.baseInput, values);
      const robust: UncertaintyAnalysisResult = runUncertaintyAnalysis({
        seed: stableCandidateSeed(input.robustness.seed, values),
        method: "latin-hypercube",
        sampleCount: input.robustness.sampleCount,
        parameters: [...input.robustness.factors],
        correlations: input.robustness.correlations,
        evaluator: (uncertainValues) =>
          evaluateStageFlight(candidateInput, uncertainValues),
      });
      return {
        ...nominal,
        robustMaxAltitudeP05M: summaryValue(
          robust.metrics.maxAltitudeAglM,
          "p05",
          -1e9,
        ),
        robustMaxDynamicPressureP95Pa: summaryValue(
          robust.metrics.maxDynamicPressurePa,
          "p95",
          1e9,
        ),
        robustFinalSpeedP95Mps: summaryValue(
          robust.metrics.finalSpeedMps,
          "p95",
          1e9,
        ),
        robustFailureRate:
          robust.failedSampleCount / robust.requestedSampleCount,
      };
    },
  });
  const robustness = input.robustness ?? null;
  return {
    adapterVersion: STAGE_FLIGHT_OPTIMIZATION_ADAPTER_VERSION,
    modelVersion: STAGE_FLIGHT_PREVIEW_MODEL_VERSION,
    validationStatus: STAGE_FLIGHT_OPTIMIZATION_STATUS,
    result,
    robustness,
    warnings: [
      "Each candidate re-runs the complete staged preview with immutable topology, event, environment, and model inputs outside the declared variables.",
      ...(robustness
        ? [
            "Robust metrics are finite-sample Latin-hypercube screening summaries; failed scenarios remain visible through robustFailureRate.",
          ]
        : []),
      "This search is an engineering preview, not validation, certification, manufacturing approval, or a flight-safety assessment.",
    ],
    assumptions: [
      "The seeded constrained evolutionary search does not prove a global optimum and may exploit model error.",
      "One candidate variable is varied through the same stage-flight variant contract; no hidden parameter mutation is introduced.",
      ...(robustness
        ? [
            `Each candidate receives ${robustness.sampleCount} seeded uncertainty scenarios using the caller-supplied factor distributions and dependence pairs.`,
          ]
        : []),
      "Results inherit the selected staged preview's numerical, aerodynamic, event, recovery, separation, and released-body limitations.",
    ],
  };
}
