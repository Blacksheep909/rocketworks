import {
  runDesignOptimization,
  type DesignOptimizationResult,
  type OptimizationConstraint,
  type OptimizationObjective,
  type OptimizationVariable,
} from "./design-optimization.ts";
import {
  createVerticalFlightVariant,
  type VerticalFlightUncertaintyFactorKey,
  type VerticalFlightUncertaintyFactor,
} from "./vertical-flight-uncertainty.ts";
import { runUncertaintyAnalysis, type UncertaintyCorrelation } from "./uncertainty-analysis.ts";
import {
  simulateVerticalFlight,
  type VerticalFlightConfig,
} from "./vertical-flight.ts";

export const VERTICAL_FLIGHT_OPTIMIZATION_ADAPTER_VERSION =
  "kestrel-vertical-optimization-0.2.0";

export type VerticalFlightOptimizationMetricKey =
  | "apogeeM"
  | "maxSpeedMps"
  | "maxMach"
  | "maxDynamicPressurePa"
  | "timeToApogeeS"
  | "totalFlightTimeS"
  | "impactSpeedMps"
  | "thrustToWeightAtIgnition"
  | "totalImpulseNs"
  | "liftedOff"
  | "completedFlight"
  | "robustApogeeP05M"
  | "robustMaxDynamicPressureP95Pa"
  | "robustImpactSpeedP95Mps"
  | "robustFailureRate";

export type VerticalFlightOptimizationRobustness = Readonly<{
  /** Number of bounded uncertainty scenarios evaluated for each candidate. */
  sampleCount: number;
  seed: string;
  factors: readonly VerticalFlightUncertaintyFactor[];
  correlations?: readonly UncertaintyCorrelation[];
}>;

function stableCandidateSeed(seed: string, values: Readonly<Record<string, number>>): string {
  return `${seed}:${JSON.stringify(Object.fromEntries(Object.keys(values).sort().map((key) => [key, values[key]])))}`;
}

function summaryValue(
  summary: { p05: number | null; p95: number | null } | undefined,
  quantile: "p05" | "p95",
  fallback: number,
): number {
  const value = summary?.[quantile];
  return value === null || value === undefined || !Number.isFinite(value) ? fallback : value;
}

export type VerticalFlightOptimizationVariable = Omit<
  OptimizationVariable,
  "key"
> &
  Readonly<{ key: VerticalFlightUncertaintyFactorKey }>;

export type VerticalFlightOptimizationObjective = Omit<
  OptimizationObjective,
  "metricKey"
> &
  Readonly<{ metricKey: VerticalFlightOptimizationMetricKey }>;

export type VerticalFlightOptimizationConstraint = Omit<
  OptimizationConstraint,
  "metricKey"
> &
  Readonly<{ metricKey: VerticalFlightOptimizationMetricKey }>;

export function optimizeVerticalFlightDesign(input: Readonly<{
  baseConfig: VerticalFlightConfig;
  seed: string;
  populationSize: number;
  generations: number;
  variables: readonly VerticalFlightOptimizationVariable[];
  objectives: readonly VerticalFlightOptimizationObjective[];
  constraints?: readonly VerticalFlightOptimizationConstraint[];
  robustness?: VerticalFlightOptimizationRobustness;
}>): DesignOptimizationResult {
  if (input.robustness) {
    if (!input.robustness.seed.trim()) throw new Error("robust optimization seed cannot be empty");
    if (!Number.isInteger(input.robustness.sampleCount) || input.robustness.sampleCount < 8 || input.robustness.sampleCount > 256) {
      throw new Error("robust optimization sample count must be an integer from 8 through 256");
    }
    if (input.robustness.factors.length === 0) throw new Error("robust optimization requires at least one uncertainty factor");
  }
  const result = runDesignOptimization({
    seed: input.seed,
    populationSize: input.populationSize,
    generations: input.generations,
    variables: input.variables,
    objectives: input.objectives,
    constraints: input.constraints,
    evaluator: (values) => {
      const candidateConfig = createVerticalFlightVariant(input.baseConfig, values);
      const nominal = simulateVerticalFlight(candidateConfig);
      const metrics = {
        apogeeM: nominal.apogeeM,
        maxSpeedMps: nominal.maxSpeedMps,
        maxMach: nominal.maxMach,
        maxDynamicPressurePa: nominal.maxDynamicPressurePa,
        timeToApogeeS: nominal.timeToApogeeS,
        totalFlightTimeS: nominal.totalFlightTimeS,
        impactSpeedMps: nominal.impactSpeedMps ?? 1e9,
        thrustToWeightAtIgnition: nominal.thrustToWeightAtIgnition,
        totalImpulseNs: nominal.totalImpulseNs,
        liftedOff: nominal.events.some((event) => event.type === "liftoff") ? 1 : 0,
        completedFlight: nominal.impactSpeedMps === null ? 0 : 1,
      };
      if (!input.robustness) return metrics;
      const robust = runUncertaintyAnalysis({
        seed: stableCandidateSeed(input.robustness.seed, values),
        method: "latin-hypercube",
        sampleCount: input.robustness.sampleCount,
        parameters: [...input.robustness.factors],
        correlations: input.robustness.correlations,
        evaluator: (uncertainValues) => {
          const scenario = simulateVerticalFlight(
            createVerticalFlightVariant(candidateConfig, uncertainValues),
          );
          return {
            apogeeM: scenario.apogeeM,
            maxDynamicPressurePa: scenario.maxDynamicPressurePa,
            impactSpeedMps: scenario.impactSpeedMps,
          };
        },
      });
      return {
        ...metrics,
        robustApogeeP05M: summaryValue(robust.metrics.apogeeM, "p05", -1e9),
        robustMaxDynamicPressureP95Pa: summaryValue(robust.metrics.maxDynamicPressurePa, "p95", 1e9),
        robustImpactSpeedP95Mps: summaryValue(robust.metrics.impactSpeedMps, "p95", 1e9),
        robustFailureRate: robust.failedSampleCount / robust.requestedSampleCount,
      };
    },
  });
  if (!input.robustness) return result;
  return {
    ...result,
    assumptions: [
      ...result.assumptions,
      `Each candidate is propagated through ${input.robustness.sampleCount} seeded Latin-hypercube uncertainty scenarios before robust metrics are reported.`,
      "Robust quantiles exclude failed scenario outputs and the failure-rate metric reports failed scenarios over requested scenarios.",
    ],
    warnings: [
      ...result.warnings,
      "Robust optimization is a finite-sample risk screen, not reliability qualification or a flight-safety analysis.",
      "Uncertainty factors and any dependence pairs are assumptions supplied by the caller; small ensembles can miss rare tails.",
    ],
  };
}
