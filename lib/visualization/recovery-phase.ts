import type { FlightTracePoint } from "../physics/vertical-flight.ts";

/**
 * Presentation-only recovery states derived from the vertical trace. These
 * names describe the configured effective-area approximation; they are not a
 * claim about physical canopy, line, or hardware state.
 */
export type RecoveryPhase =
  | "ballistic"
  | "deployment-delay"
  | "inflating"
  | "reefing"
  | "inflated";

export type RecoveryPhaseSample = Readonly<{
  timeS: number;
  phase: RecoveryPhase;
  inflationFraction: number;
  reefingFraction: number;
}>;

export type RecoveryPhaseSpan = Readonly<{
  phase: RecoveryPhase;
  startTimeS: number;
  endTimeS: number;
  sampleCount: number;
}>;

const EPSILON = 1e-6;

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** Map one recorded sample onto the configured effective-area phase labels. */
export function classifyRecoveryPhase(
  sample: Pick<FlightTracePoint, "recoveryDeployed" | "recoveryInflationFraction" | "recoveryReefingFraction">,
): RecoveryPhase {
  if (!sample.recoveryDeployed) return "ballistic";
  const inflationFraction = clampUnit(sample.recoveryInflationFraction);
  const reefingFraction = clampUnit(sample.recoveryReefingFraction);
  if (inflationFraction < 1 - EPSILON) {
    return inflationFraction <= EPSILON ? "deployment-delay" : "inflating";
  }
  if (reefingFraction < 1 - EPSILON) return "reefing";
  return "inflated";
}

/**
 * Produce finite, time-ordered samples for a trace. The helper intentionally
 * preserves the recorded fractions instead of interpolating or inventing
 * physical state between solver samples.
 */
export function createRecoveryPhaseSamples(
  trace: readonly FlightTracePoint[],
  recoveryEnabled: boolean,
): RecoveryPhaseSample[] {
  if (!recoveryEnabled) return [];
  return trace
    .filter((sample) => Number.isFinite(sample.timeS))
    .map((sample) => ({
      timeS: sample.timeS,
      phase: classifyRecoveryPhase(sample),
      inflationFraction: clampUnit(sample.recoveryInflationFraction),
      reefingFraction: clampUnit(sample.recoveryReefingFraction),
    }))
    .sort((left, right) => left.timeS - right.timeS);
}

/** Collapse adjacent samples with the same displayed state into spans. */
export function createRecoveryPhaseSpans(
  samples: readonly RecoveryPhaseSample[],
): RecoveryPhaseSpan[] {
  if (samples.length === 0) return [];
  const spans: RecoveryPhaseSpan[] = [];
  let current = samples[0]!;
  let sampleCount = 1;
  for (let index = 1; index < samples.length; index += 1) {
    const next = samples[index]!;
    if (next.phase === current.phase) {
      sampleCount += 1;
      current = next;
      continue;
    }
    spans.push({
      phase: current.phase,
      startTimeS: spans.length === 0 ? samples[0]!.timeS : spans.at(-1)!.endTimeS,
      endTimeS: next.timeS,
      sampleCount,
    });
    current = next;
    sampleCount = 1;
  }
  const finalSpanStart = spans.length === 0 ? samples[0]!.timeS : spans.at(-1)!.endTimeS;
  const lastTime = samples.at(-1)!.timeS;
  spans.push({
    phase: current.phase,
    startTimeS: finalSpanStart,
    endTimeS: Math.max(finalSpanStart, lastTime),
    sampleCount,
  });
  return spans;
}

export function recoveryPhaseLabel(phase: RecoveryPhase): string {
  switch (phase) {
    case "deployment-delay": return "Deployment delay";
    case "inflating": return "Inflating";
    case "reefing": return "Reefing";
    case "inflated": return "Inflated";
    case "ballistic": return "Ballistic";
  }
}
