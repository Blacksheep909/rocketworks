import {
  runParameterSweep,
  type ParameterSweepResult,
} from "./uncertainty-analysis.ts";
import {
  createVerticalFlightVariant,
  type VerticalFlightUncertaintyFactorKey,
} from "./vertical-flight-uncertainty.ts";
import {
  simulateVerticalFlight,
  VERTICAL_MODEL_STATUS,
  VERTICAL_MODEL_VERSION,
  type VerticalFlightConfig,
} from "./vertical-flight.ts";

export const VERTICAL_FLIGHT_SWEEP_ADAPTER_VERSION =
  "kestrel-vertical-sweep-0.1.0";
export const VERTICAL_FLIGHT_SWEEP_STATUS = VERTICAL_MODEL_STATUS;

export type VerticalFlightSweepParameterKey =
  | Extract<
      VerticalFlightUncertaintyFactorKey,
      | "dryMassScale"
      | "dragCoefficientScale"
      | "thrustScale"
      | "windScale"
      | "recoveryDelayS"
    >;

export type VerticalFlightSweepResult = Readonly<{
  adapterVersion: string;
  modelVersion: string;
  validationStatus: string;
  parameterKey: VerticalFlightSweepParameterKey;
  result: ParameterSweepResult;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

const parameterBounds: Readonly<
  Record<VerticalFlightSweepParameterKey, readonly [number, number]>
> = {
  dryMassScale: [0.1, 3],
  dragCoefficientScale: [0.1, 3],
  thrustScale: [0, 3],
  windScale: [0, 5],
  recoveryDelayS: [0, 120],
};

function assertSweepBounds(
  parameterKey: VerticalFlightSweepParameterKey,
  minimum: number,
  maximum: number,
): void {
  if (![minimum, maximum].every(Number.isFinite)) {
    throw new Error("sweep bounds must be finite");
  }
  const [allowedMinimum, allowedMaximum] = parameterBounds[parameterKey];
  if (minimum < allowedMinimum || maximum > allowedMaximum) {
    throw new Error(
      `${parameterKey} sweep must remain between ${allowedMinimum} and ${allowedMaximum}`,
    );
  }
}

export function sweepVerticalFlight(input: Readonly<{
  baseConfig: VerticalFlightConfig;
  parameterKey: VerticalFlightSweepParameterKey;
  minimum: number;
  maximum: number;
  steps: number;
}>): VerticalFlightSweepResult {
  assertSweepBounds(input.parameterKey, input.minimum, input.maximum);
  const result = runParameterSweep({
    parameterKey: input.parameterKey,
    minimum: input.minimum,
    maximum: input.maximum,
    steps: input.steps,
    evaluator: (values) => {
      const flight = simulateVerticalFlight(
        createVerticalFlightVariant(input.baseConfig, values),
      );
      return {
        apogeeM: flight.apogeeM,
        maxSpeedMps: flight.maxSpeedMps,
        maxDynamicPressurePa: flight.maxDynamicPressurePa,
        impactSpeedMps: flight.impactSpeedMps,
        thrustToWeightAtIgnition: flight.thrustToWeightAtIgnition,
        totalImpulseNs: flight.totalImpulseNs,
        liftedOff: flight.events.some((event) => event.type === "liftoff") ? 1 : 0,
      };
    },
  });
  return {
    adapterVersion: VERTICAL_FLIGHT_SWEEP_ADAPTER_VERSION,
    modelVersion: VERTICAL_MODEL_VERSION,
    validationStatus: VERTICAL_FLIGHT_SWEEP_STATUS,
    parameterKey: input.parameterKey,
    result,
    warnings: [
      "Each row re-runs the vertical preview with one declared parameter varied; all other inputs remain fixed.",
      "Failed rows remain visible and are excluded from metric comparisons.",
      "This bounded sweep is an engineering preview, not validation, certification, or a flight-safety assessment.",
    ],
    assumptions: [
      "Parameter effects are evaluated through the same deterministic vertical-flight model as the nominal run.",
      "The sweep parameter is varied independently; correlations with other inputs are not modeled.",
      "The configured integration step and atmospheric/wind assumptions are unchanged across rows.",
    ],
  };
}
