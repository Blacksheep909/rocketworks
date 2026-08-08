import { simulateVerticalFlight, type VerticalFlightConfig } from "./vertical-flight.ts";
import {
  runUncertaintyAnalysis,
  type ProbabilityDistribution,
  type ThresholdDefinition,
  type UncertaintyAnalysisResult,
} from "./uncertainty-analysis.ts";

export const VERTICAL_UNCERTAINTY_ADAPTER_VERSION = "kestrel-vertical-uncertainty-0.1.0";

export type VerticalFlightUncertaintyFactorKey =
  | "dryMassScale"
  | "propellantMassScale"
  | "dragCoefficientScale"
  | "thrustScale"
  | "windScale"
  | "recoveryDragAreaScale"
  | "recoveryDelayS"
  | "launchAltitudeOffsetM";

export type VerticalFlightUncertaintyFactor = {
  key: VerticalFlightUncertaintyFactorKey;
  label: string;
  distribution: ProbabilityDistribution;
};

export function createVerticalFlightVariant(
  base: VerticalFlightConfig,
  values: Readonly<Record<string, number>>,
): VerticalFlightConfig {
  const dryMassScale = values.dryMassScale ?? 1;
  const propellantMassScale = values.propellantMassScale ?? 1;
  const dragCoefficientScale = values.dragCoefficientScale ?? 1;
  const thrustScale = values.thrustScale ?? 1;
  const windScale = values.windScale ?? 1;
  const recoveryDragAreaScale = values.recoveryDragAreaScale ?? 1;
  const recoveryDelayS = values.recoveryDelayS ?? base.recovery?.deploymentDelayAfterApogeeS ?? 0;
  const launchAltitudeOffsetM = values.launchAltitudeOffsetM ?? 0;
  return {
    ...base,
    vehicle: {
      ...base.vehicle,
      dryMassKg: base.vehicle.dryMassKg * dryMassScale,
      propellantMassKg: base.vehicle.propellantMassKg * propellantMassScale,
      dragCoefficient: base.vehicle.dragCoefficient * dragCoefficientScale,
    },
    motor: {
      thrustCurve: base.motor.thrustCurve.map((point) => ({ ...point, thrustN: point.thrustN * thrustScale })),
    },
    recovery: base.recovery
      ? {
          ...base.recovery,
          dragAreaM2: base.recovery.dragAreaM2 * recoveryDragAreaScale,
          deploymentDelayAfterApogeeS: recoveryDelayS,
        }
      : undefined,
    environment: {
      ...base.environment,
      launchAltitudeM: (base.environment?.launchAltitudeM ?? 0) + launchAltitudeOffsetM,
      windProfile: base.environment?.windProfile?.map((layer) => ({
        ...layer,
        eastMps: layer.eastMps * windScale,
        northMps: layer.northMps * windScale,
        upMps: (layer.upMps ?? 0) * windScale,
      })),
    },
  };
}

export function analyzeVerticalFlightUncertainty({
  baseConfig,
  factors,
  seed,
  sampleCount,
  thresholds,
}: {
  baseConfig: VerticalFlightConfig;
  factors: VerticalFlightUncertaintyFactor[];
  seed: string;
  sampleCount: number;
  thresholds?: ThresholdDefinition[];
}): UncertaintyAnalysisResult {
  return runUncertaintyAnalysis({
    seed,
    method: "latin-hypercube",
    sampleCount,
    parameters: factors,
    thresholds,
    evaluator: (values) => {
      const result = simulateVerticalFlight(createVerticalFlightVariant(baseConfig, values));
      return {
        apogeeM: result.apogeeM,
        maxSpeedMps: result.maxSpeedMps,
        maxMach: result.maxMach,
        maxDynamicPressurePa: result.maxDynamicPressurePa,
        timeToApogeeS: result.timeToApogeeS,
        totalFlightTimeS: result.totalFlightTimeS,
        impactSpeedMps: result.impactSpeedMps,
        thrustToWeightAtIgnition: result.thrustToWeightAtIgnition,
        totalImpulseNs: result.totalImpulseNs,
        liftedOff: result.events.some((event) => event.type === "liftoff") ? 1 : 0,
      };
    },
  });
}
