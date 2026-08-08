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
} from "./vertical-flight-uncertainty.ts";
import {
  simulateVerticalFlight,
  type VerticalFlightConfig,
} from "./vertical-flight.ts";

export const VERTICAL_FLIGHT_OPTIMIZATION_ADAPTER_VERSION =
  "kestrel-vertical-optimization-0.1.0";

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
  | "completedFlight";

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
}>): DesignOptimizationResult {
  return runDesignOptimization({
    seed: input.seed,
    populationSize: input.populationSize,
    generations: input.generations,
    variables: input.variables,
    objectives: input.objectives,
    constraints: input.constraints,
    evaluator: (values) => {
      const result = simulateVerticalFlight(
        createVerticalFlightVariant(input.baseConfig, values),
      );
      return {
        apogeeM: result.apogeeM,
        maxSpeedMps: result.maxSpeedMps,
        maxMach: result.maxMach,
        maxDynamicPressurePa: result.maxDynamicPressurePa,
        timeToApogeeS: result.timeToApogeeS,
        totalFlightTimeS: result.totalFlightTimeS,
        impactSpeedMps: result.impactSpeedMps ?? 1e9,
        thrustToWeightAtIgnition: result.thrustToWeightAtIgnition,
        totalImpulseNs: result.totalImpulseNs,
        liftedOff: result.events.some((event) => event.type === "liftoff") ? 1 : 0,
        completedFlight: result.impactSpeedMps === null ? 0 : 1,
      };
    },
  });
}
