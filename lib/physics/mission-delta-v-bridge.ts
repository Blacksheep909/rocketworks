import type { MissionLossBudgetResult } from "./mission-loss-budget.ts";
import type { MissionMassRatioResult } from "./stage-mass-ratio.ts";

export const MISSION_DELTA_V_BRIDGE_MODEL_VERSION =
  "rocketworks-mission-delta-v-bridge-0.1.0";
export const MISSION_DELTA_V_BRIDGE_VALIDATION_STATUS =
  "analytical-composition-to-trace-comparison" as const;

export type MissionDeltaVBridgeStatus = "assessed" | "partial" | "not-assessed";

export type MissionDeltaVBridgeResult = Readonly<{
  modelVersion: typeof MISSION_DELTA_V_BRIDGE_MODEL_VERSION;
  validationStatus: typeof MISSION_DELTA_V_BRIDGE_VALIDATION_STATUS;
  status: MissionDeltaVBridgeStatus;
  idealSerialStackDeltaVMps: number | null;
  traceThrustImpulseEquivalentMps: number | null;
  traceNetThrustDeltaVMagnitudeMps: number | null;
  idealToTraceGapMps: number | null;
  idealToNetThrustGapMps: number | null;
  traceToIdealFraction: number | null;
  netThrustToIdealFraction: number | null;
  thrustAxisCoverageFraction: number;
  serialStageCount: number;
  excludedStageCount: number;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertNonNegative(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0) throw new Error(`${label} cannot be negative`);
}

function validateMetric(value: number | null, label: string): void {
  if (value !== null) assertNonNegative(value, label);
}

/**
 * Compare the serial-stack ideal composition preview with the thrust impulse
 * recorded by a coupled trace. This is deliberately a bridge diagnostic: the
 * two values share units but come from different analytical views and must not
 * be presented as achieved mission performance or a certified loss budget.
 */
export function computeMissionDeltaVBridge(input: Readonly<{
  missionMassRatio: MissionMassRatioResult;
  missionLossBudget: MissionLossBudgetResult;
}>): MissionDeltaVBridgeResult {
  const idealSerialStackDeltaVMps = input.missionMassRatio.totalIdealDeltaVMps;
  const traceThrustImpulseEquivalentMps =
    input.missionLossBudget.thrustImpulseEquivalentMps;
  const traceNetThrustDeltaVMagnitudeMps =
    input.missionLossBudget.netThrustDeltaVMagnitudeMps;
  validateMetric(idealSerialStackDeltaVMps, "ideal serial-stack delta-v");
  validateMetric(traceThrustImpulseEquivalentMps, "trace thrust impulse equivalent");
  validateMetric(traceNetThrustDeltaVMagnitudeMps, "trace net thrust delta-v");

  const idealToTraceGapMps = idealSerialStackDeltaVMps !== null && traceThrustImpulseEquivalentMps !== null
    ? idealSerialStackDeltaVMps - traceThrustImpulseEquivalentMps
    : null;
  const idealToNetThrustGapMps = idealSerialStackDeltaVMps !== null && traceNetThrustDeltaVMagnitudeMps !== null
    ? idealSerialStackDeltaVMps - traceNetThrustDeltaVMagnitudeMps
    : null;
  const traceToIdealFraction = idealSerialStackDeltaVMps !== null
    && idealSerialStackDeltaVMps > 0
    && traceThrustImpulseEquivalentMps !== null
    ? traceThrustImpulseEquivalentMps / idealSerialStackDeltaVMps
    : null;
  const netThrustToIdealFraction = idealSerialStackDeltaVMps !== null
    && idealSerialStackDeltaVMps > 0
    && traceNetThrustDeltaVMagnitudeMps !== null
    ? traceNetThrustDeltaVMagnitudeMps / idealSerialStackDeltaVMps
    : null;
  const excludedStageCount = input.missionMassRatio.excludedStageIds.length;
  const hasPrimaryComparison = idealSerialStackDeltaVMps !== null
    && traceThrustImpulseEquivalentMps !== null;
  const status: MissionDeltaVBridgeStatus = !hasPrimaryComparison
    ? "not-assessed"
    : input.missionMassRatio.overallStatus === "assessed"
      && input.missionLossBudget.status === "assessed"
      && excludedStageCount === 0
      ? "assessed"
      : "partial";
  const warnings = [
    "This bridge compares a serial-stack ideal composition value with recorded thrust-axis trace accounting; it is not achieved delta-v, a validated mission loss budget, performance certification, or a flight-safety result.",
    ...(idealSerialStackDeltaVMps === null
      ? ["The serial-stack ideal delta-v is unavailable, so no composition-to-trace gap is reported."]
      : []),
    ...(traceThrustImpulseEquivalentMps === null
      ? ["The trace thrust impulse equivalent is unavailable, so no composition-to-trace gap is reported."]
      : []),
    ...(idealSerialStackDeltaVMps !== null && idealSerialStackDeltaVMps === 0
      ? ["The ideal serial-stack delta-v is zero; normalized trace-to-ideal fractions are not defined."]
      : []),
    ...(input.missionMassRatio.overallStatus !== "assessed"
      ? [`Serial-stack composition status is ${input.missionMassRatio.overallStatus}; inspect its warnings before comparing the signed gap.`]
      : []),
    ...(input.missionLossBudget.status !== "assessed"
      ? [`Trace thrust-axis coverage status is ${input.missionLossBudget.status}; zero-thrust or incomplete intervals limit the comparison.`]
      : []),
    ...(excludedStageCount > 0
      ? [`${excludedStageCount} stage(s) are excluded from the serial-stack composition preview: ${input.missionMassRatio.excludedStageIds.join(", ")}.`]
      : []),
    ...(idealToTraceGapMps !== null && idealToTraceGapMps < 0
      ? ["The signed ideal-to-trace gap is negative; the recorded scalar thrust integral exceeds the serial composition preview, which can indicate topology or mass-model mismatch rather than a physical loss credit."]
      : []),
  ];
  return {
    modelVersion: MISSION_DELTA_V_BRIDGE_MODEL_VERSION,
    validationStatus: MISSION_DELTA_V_BRIDGE_VALIDATION_STATUS,
    status,
    idealSerialStackDeltaVMps,
    traceThrustImpulseEquivalentMps,
    traceNetThrustDeltaVMagnitudeMps,
    idealToTraceGapMps,
    idealToNetThrustGapMps,
    traceToIdealFraction,
    netThrustToIdealFraction,
    thrustAxisCoverageFraction: input.missionLossBudget.thrustAxisCoverageFraction,
    serialStageCount: input.missionMassRatio.stages.length,
    excludedStageCount,
    assumptions: [
      "The ideal serial-stack value comes from the supplied burn-order mass-ratio preview and carries downstream serial-stage mass through each ideal burn.",
      "The trace value is the trapezoidal integral of recorded thrust magnitude divided by endpoint mass along the existing coupled trace.",
      "The signed gap is ideal serial-stack delta-v minus trace thrust impulse equivalent; it does not subtract gravity, aerodynamic, recovery, steering, or event projections from either value.",
      "The vector comparison uses the magnitude of the integrated thrust acceleration and is separate from the scalar thrust impulse equivalent.",
      "Parallel, booster, residual-propellant, separation, guidance, and unrecorded constraint effects remain disclosed by the source diagnostics rather than being inferred as a single mission loss.",
    ],
    warnings,
  };
}
