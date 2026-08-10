export const RECOVERY_OPENING_LOAD_MODEL_VERSION =
  "kestrel-recovery-opening-load-0.1.0";
export const RECOVERY_OPENING_LOAD_STATUS =
  "analytical-component-checks-only" as const;

export type RecoveryOpeningLoadTracePoint = Readonly<{
  timeS: number;
  dynamicPressurePa: number;
}>;

export type RecoveryOpeningLoadCoverage =
  | "assessed"
  | "partial"
  | "unavailable";

export type RecoveryOpeningLoadInput = Readonly<{
  trace: readonly RecoveryOpeningLoadTracePoint[];
  commandTimeS: number;
  deploymentDelayS: number;
  inflationTimeS: number;
  dragCoefficient: number;
  referenceAreaM2: number;
}>;

export type RecoveryOpeningLoadResult = Readonly<{
  modelVersion: typeof RECOVERY_OPENING_LOAD_MODEL_VERSION;
  validationStatus: typeof RECOVERY_OPENING_LOAD_STATUS;
  commandTimeS: number;
  inflationStartTimeS: number;
  inflationEndTimeS: number;
  coverage: RecoveryOpeningLoadCoverage;
  assessedDurationS: number;
  peakTimeS: number | null;
  peakDynamicPressurePa: number | null;
  peakQuasiSteadyDragN: number | null;
  inflationImpulseNs: number | null;
  openingLoadRateNps: number | null;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertNonNegative(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0) throw new Error(`${label} must be non-negative`);
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (value <= 0) throw new Error(`${label} must be positive`);
}

function interpolateDynamicPressure(
  trace: readonly RecoveryOpeningLoadTracePoint[],
  timeS: number,
): number {
  if (timeS <= trace[0].timeS) return trace[0].dynamicPressurePa;
  const last = trace[trace.length - 1];
  if (timeS >= last.timeS) return last.dynamicPressurePa;
  for (let index = 1; index < trace.length; index += 1) {
    const right = trace[index];
    if (timeS > right.timeS) continue;
    const left = trace[index - 1];
    const span = right.timeS - left.timeS;
    if (!(span > 0)) return right.dynamicPressurePa;
    const fraction = (timeS - left.timeS) / span;
    return left.dynamicPressurePa +
      (right.dynamicPressurePa - left.dynamicPressurePa) * fraction;
  }
  return last.dynamicPressurePa;
}

function uniqueSortedTimes(times: readonly number[]): number[] {
  return [...new Set(times.map((time) => Number(time.toPrecision(14))))].sort(
    (left, right) => left - right,
  );
}

/**
 * Estimates the quasi-steady drag envelope during a prescribed canopy
 * inflation window. This is intentionally a load *screen*: it integrates
 * `q Cd A` over the supplied dynamic-pressure trace and reports a force-rate
 * proxy, but it does not invent an opening-shock multiplier or model fabric,
 * lines, suspension, or structural response.
 */
export function estimateRecoveryOpeningLoad(
  input: RecoveryOpeningLoadInput,
): RecoveryOpeningLoadResult {
  assertFinite(input.commandTimeS, "recovery command time");
  assertNonNegative(input.deploymentDelayS, "recovery deployment delay");
  assertNonNegative(input.inflationTimeS, "recovery inflation time");
  assertPositive(input.dragCoefficient, "recovery drag coefficient");
  assertPositive(input.referenceAreaM2, "recovery reference area");
  if (input.trace.length === 0) {
    throw new Error("recovery opening-load trace cannot be empty");
  }
  for (let index = 0; index < input.trace.length; index += 1) {
    const point = input.trace[index];
    assertFinite(point.timeS, `recovery trace time ${index}`);
    assertNonNegative(point.dynamicPressurePa, `recovery trace dynamic pressure ${index}`);
    if (index > 0 && point.timeS < input.trace[index - 1].timeS) {
      throw new Error("recovery opening-load trace must be chronological");
    }
  }

  const inflationStartTimeS = input.commandTimeS + input.deploymentDelayS;
  const inflationEndTimeS = inflationStartTimeS + input.inflationTimeS;
  const traceStartTimeS = input.trace[0].timeS;
  const traceEndTimeS = input.trace[input.trace.length - 1].timeS;
  const overlapStartTimeS = Math.max(inflationStartTimeS, traceStartTimeS);
  const overlapEndTimeS = Math.min(inflationEndTimeS, traceEndTimeS);
  const coverage: RecoveryOpeningLoadCoverage = overlapEndTimeS < overlapStartTimeS
    ? "unavailable"
    : traceStartTimeS <= inflationStartTimeS && traceEndTimeS >= inflationEndTimeS
      ? "assessed"
      : "partial";
  const warnings = [
    "This opening-load screen uses quasi-steady q * Cd * A from the supplied trace; opening shock, snatch force, lines, fabric, canopy geometry, and structural response are not modeled.",
  ];
  const assumptions = [
    "Dynamic pressure is linearly interpolated between trace samples without extrapolation.",
    "The supplied drag coefficient and reference area remain constant through the prescribed inflation window.",
    "Inflation impulse is the trapezoidal integral of quasi-steady drag over the assessed window; it is not a measured opening-shock impulse.",
  ];
  if (input.inflationTimeS === 0) {
    warnings.push("Inflation time is zero, so an opening force-rate proxy is unavailable; the instantaneous full-area drag is still reported when the trace covers the command time.");
  }
  if (coverage === "partial") {
    warnings.push("The supplied trace only partially covers the prescribed inflation window; peak and impulse values are lower-bound diagnostics for the assessed interval.");
  } else if (coverage === "unavailable") {
    warnings.push("The supplied trace does not overlap the prescribed inflation window; opening-load metrics are unavailable.");
  }

  if (coverage === "unavailable") {
    return {
      modelVersion: RECOVERY_OPENING_LOAD_MODEL_VERSION,
      validationStatus: RECOVERY_OPENING_LOAD_STATUS,
      commandTimeS: input.commandTimeS,
      inflationStartTimeS,
      inflationEndTimeS,
      coverage,
      assessedDurationS: 0,
      peakTimeS: null,
      peakDynamicPressurePa: null,
      peakQuasiSteadyDragN: null,
      inflationImpulseNs: null,
      openingLoadRateNps: null,
      warnings,
      assumptions,
    };
  }

  const times = uniqueSortedTimes([
    overlapStartTimeS,
    overlapEndTimeS,
    ...input.trace
      .filter((point) => point.timeS >= overlapStartTimeS && point.timeS <= overlapEndTimeS)
      .map((point) => point.timeS),
  ]);
  const samples = times.map((timeS) => ({
    timeS,
    dynamicPressurePa: interpolateDynamicPressure(input.trace, timeS),
  }));
  const scale = input.dragCoefficient * input.referenceAreaM2;
  let peakSample = samples[0];
  for (const sample of samples) {
    if (sample.dynamicPressurePa > peakSample.dynamicPressurePa) peakSample = sample;
  }
  let inflationImpulseNs = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const left = samples[index - 1];
    const right = samples[index];
    inflationImpulseNs +=
      0.5 * (left.dynamicPressurePa + right.dynamicPressurePa) * scale *
      (right.timeS - left.timeS);
  }
  const assessedDurationS = Math.max(0, overlapEndTimeS - overlapStartTimeS);
  const peakQuasiSteadyDragN = peakSample.dynamicPressurePa * scale;
  return {
    modelVersion: RECOVERY_OPENING_LOAD_MODEL_VERSION,
    validationStatus: RECOVERY_OPENING_LOAD_STATUS,
    commandTimeS: input.commandTimeS,
    inflationStartTimeS,
    inflationEndTimeS,
    coverage,
    assessedDurationS,
    peakTimeS: peakSample.timeS,
    peakDynamicPressurePa: peakSample.dynamicPressurePa,
    peakQuasiSteadyDragN,
    inflationImpulseNs,
    openingLoadRateNps: input.inflationTimeS > 0
      ? peakQuasiSteadyDragN / input.inflationTimeS
      : null,
    warnings,
    assumptions,
  };
}
