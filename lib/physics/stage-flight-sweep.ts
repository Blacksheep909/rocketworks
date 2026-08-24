import { magnitude } from "./linear-algebra.ts";
import {
  simulateStageFlightPreview,
  STAGE_FLIGHT_PREVIEW_MODEL_VERSION,
  STAGE_FLIGHT_PREVIEW_STATUS,
  type StageFlightPreviewInput,
} from "./stage-flight-preview.ts";
import {
  createStageFlightVariant,
  type StageFlightUncertaintyFactorKey,
} from "./stage-flight-uncertainty.ts";
import {
  runParameterSweep,
  type NumericOutputs,
  type ParameterSweepResult,
} from "./uncertainty-analysis.ts";

/**
 * Versioned adapter for deterministic one-variable studies over the complete
 * staged preview. This intentionally reuses the public staged variant
 * contract rather than maintaining a second, subtly different evaluator.
 */
export const STAGE_FLIGHT_SWEEP_ADAPTER_VERSION =
  "rocketworks-stage-flight-sweep-0.1.0";
export const STAGE_FLIGHT_SWEEP_STATUS = STAGE_FLIGHT_PREVIEW_STATUS;

export type StageFlightSweepParameterKey = Extract<
  StageFlightUncertaintyFactorKey,
  | "dryMassScale"
  | "propellantMassScale"
  | "thrustScale"
  | "dragCoefficientScale"
  | "windScale"
  | "recoveryAreaScale"
  | "recoveryInflationTimeScale"
  | "ignitionDelayOffsetS"
  | "separationImpulseScale"
  | "alignmentOffsetRad"
  | "railFrictionScale"
  | "railTipOffScale"
>;

export type StageFlightSweepParameterDefinition = Readonly<{
  key: StageFlightSweepParameterKey;
  label: string;
  unit: string;
  minimum: number;
  maximum: number;
  step: number;
  precision: number;
}>;

/**
 * UI-neutral bounds for common staged trade studies. These are screening
 * ranges, not manufacturing tolerances or probability distributions.
 */
export const STAGE_FLIGHT_SWEEP_PARAMETER_DEFINITIONS: readonly StageFlightSweepParameterDefinition[] = [
  { key: "thrustScale", label: "Delivered thrust", unit: "×", minimum: 0.75, maximum: 1.3, step: 0.01, precision: 2 },
  { key: "dryMassScale", label: "Dry mass", unit: "×", minimum: 0.9, maximum: 1.1, step: 0.01, precision: 2 },
  { key: "propellantMassScale", label: "Propellant mass", unit: "×", minimum: 0.9, maximum: 1.1, step: 0.01, precision: 2 },
  { key: "dragCoefficientScale", label: "Drag coefficient", unit: "×", minimum: 0.8, maximum: 1.2, step: 0.01, precision: 2 },
  { key: "windScale", label: "Wind profile", unit: "×", minimum: 0, maximum: 2, step: 0.01, precision: 2 },
  { key: "recoveryAreaScale", label: "Recovery area", unit: "×", minimum: 0.5, maximum: 1.5, step: 0.01, precision: 2 },
  { key: "recoveryInflationTimeScale", label: "Recovery inflation time", unit: "×", minimum: 0.5, maximum: 2, step: 0.01, precision: 2 },
  { key: "ignitionDelayOffsetS", label: "Ignition delay offset", unit: "s", minimum: -0.2, maximum: 0.5, step: 0.01, precision: 2 },
  { key: "separationImpulseScale", label: "Separation impulse", unit: "×", minimum: 0.5, maximum: 1.5, step: 0.01, precision: 2 },
  { key: "alignmentOffsetRad", label: "Launch alignment offset", unit: "rad", minimum: -0.01, maximum: 0.01, step: 0.0005, precision: 4 },
  { key: "railFrictionScale", label: "Guide friction", unit: "×", minimum: 0.5, maximum: 1.5, step: 0.01, precision: 2 },
  { key: "railTipOffScale", label: "Rail-exit tip-off", unit: "×", minimum: 0.5, maximum: 1.5, step: 0.01, precision: 2 },
];

export type StageFlightSweepResult = Readonly<{
  adapterVersion: string;
  modelVersion: string;
  validationStatus: typeof STAGE_FLIGHT_SWEEP_STATUS;
  parameterKey: StageFlightSweepParameterKey;
  result: ParameterSweepResult;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

const parameterBounds: Readonly<Record<StageFlightSweepParameterKey, readonly [number, number]>> =
  Object.fromEntries(
    STAGE_FLIGHT_SWEEP_PARAMETER_DEFINITIONS.map((definition) => [
      definition.key,
      [definition.minimum, definition.maximum],
    ]),
  ) as unknown as Record<StageFlightSweepParameterKey, readonly [number, number]>;

function assertSweepBounds(
  parameterKey: StageFlightSweepParameterKey,
  minimum: number,
  maximum: number,
): void {
  if (![minimum, maximum].every(Number.isFinite)) {
    throw new Error("staged sweep bounds must be finite");
  }
  const [allowedMinimum, allowedMaximum] = parameterBounds[parameterKey];
  if (minimum < allowedMinimum || maximum > allowedMaximum) {
    throw new Error(
      `${parameterKey} staged sweep must remain between ${allowedMinimum} and ${allowedMaximum}`,
    );
  }
}

function finalStateSpeedMps(result: ReturnType<typeof simulateStageFlightPreview>): number {
  const state = result.rail?.finalState ?? result.simulation?.finalState;
  return state ? magnitude(state.velocityWorldMps) : 0;
}

function evaluateStageFlight(
  input: StageFlightPreviewInput,
  values: Readonly<Record<string, number>>,
): NumericOutputs {
  const result = simulateStageFlightPreview(createStageFlightVariant(input, values));
  return {
    maxAltitudeAglM: result.maxAltitudeAglM,
    maxSpeedMps: result.maxSpeedMps,
    timeToApogeeS: result.timeToApogeeS,
    maxDynamicPressurePa: Math.max(0, ...result.trace.map((point) => point.dynamicPressurePa)),
    finalSpeedMps: finalStateSpeedMps(result),
    eventCount: result.events.length,
    separatedBodyCount: result.separatedBodies.length,
    converged: result.convergence.status === "converged" ? 1 : 0,
  };
}

/**
 * Re-runs the same staged 6DOF, rail, event, recovery, and released-body
 * branches for evenly spaced values of one declared input. Evaluator errors
 * are retained per row by the shared sweep contract so a single invalid
 * scenario cannot hide the rest of the trade study.
 */
export function sweepStageFlight(input: Readonly<{
  baseInput: StageFlightPreviewInput;
  parameterKey: StageFlightSweepParameterKey;
  minimum: number;
  maximum: number;
  steps: number;
}>): StageFlightSweepResult {
  assertSweepBounds(input.parameterKey, input.minimum, input.maximum);
  const result = runParameterSweep({
    parameterKey: input.parameterKey,
    minimum: input.minimum,
    maximum: input.maximum,
    steps: input.steps,
    evaluator: (values) => evaluateStageFlight(input.baseInput, values),
  });
  return {
    adapterVersion: STAGE_FLIGHT_SWEEP_ADAPTER_VERSION,
    modelVersion: STAGE_FLIGHT_PREVIEW_MODEL_VERSION,
    validationStatus: STAGE_FLIGHT_SWEEP_STATUS,
    parameterKey: input.parameterKey,
    result,
    warnings: [
      "Each row re-runs the complete staged preview with one declared parameter varied; all other topology, event, environment, and model inputs remain fixed.",
      "Failed rows remain visible and are excluded from metric comparisons.",
      "This deterministic trade study is an engineering preview, not validation, certification, or a flight-safety assessment.",
    ],
    assumptions: [
      "Parameter effects are evaluated through the same staged 6DOF, launch-rail, recovery, and separation branches as the nominal preview.",
      "The swept parameter is varied independently; correlations and measured tolerances are not modeled.",
      "The configured integration step, event allocation, aerodynamic source, and environment remain unchanged across rows.",
    ],
  };
}
