import { magnitude, subtractVectors, type Vector3 } from "./linear-algebra.ts";

export const SEPARATION_CLEARANCE_MODEL_VERSION =
  "kestrel-separation-clearance-0.1.0";
export const SEPARATION_CLEARANCE_STATUS =
  "analytical-component-checks-only" as const;

export type SeparationClearanceTracePoint = Readonly<{
  timeS: number;
  positionWorldM: Vector3;
  velocityWorldMps?: Vector3;
}>;

export type SeparationClearanceResult = Readonly<{
  modelVersion: typeof SEPARATION_CLEARANCE_MODEL_VERSION;
  validationStatus: typeof SEPARATION_CLEARANCE_STATUS;
  releaseTimeS: number;
  sampleCount: number;
  matchedSampleCount: number;
  minimumDistanceM: number | null;
  minimumDistanceTimeS: number | null;
  releaseDistanceM: number | null;
  finalDistanceM: number | null;
  relativeVelocityAtReleaseMps: number | null;
  status: "assessed" | "partial" | "not-assessed";
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

export type SeparationClearanceInput = Readonly<{
  retainedTrace: readonly SeparationClearanceTracePoint[];
  detachedTrace: readonly SeparationClearanceTracePoint[];
  releaseTimeS: number;
}>;

const TIME_TOLERANCE_S = 1e-9;

function assertFiniteVector(value: Vector3, label: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite coordinates`);
  }
}

function validateTrace(
  trace: readonly SeparationClearanceTracePoint[],
  label: string,
): void {
  if (trace.length === 0) throw new Error(`${label} cannot be empty`);
  let previousTime = -Infinity;
  trace.forEach((point, index) => {
    if (!Number.isFinite(point.timeS)) {
      throw new Error(`${label} sample ${index + 1} time must be finite`);
    }
    if (point.timeS < previousTime) {
      throw new Error(`${label} times must be non-decreasing`);
    }
    assertFiniteVector(point.positionWorldM, `${label} sample ${index + 1} position`);
    if (point.velocityWorldMps) {
      assertFiniteVector(point.velocityWorldMps, `${label} sample ${index + 1} velocity`);
    }
    previousTime = point.timeS;
  });
}

function collapseDuplicateTimes(
  trace: readonly SeparationClearanceTracePoint[],
): SeparationClearanceTracePoint[] {
  const collapsed: SeparationClearanceTracePoint[] = [];
  for (const point of trace) {
    const previous = collapsed.at(-1);
    if (previous && point.timeS === previous.timeS) collapsed[collapsed.length - 1] = point;
    else collapsed.push(point);
  }
  return collapsed;
}

function interpolatePoint(
  trace: readonly SeparationClearanceTracePoint[],
  timeS: number,
): SeparationClearanceTracePoint | null {
  if (timeS < trace[0]!.timeS - TIME_TOLERANCE_S || timeS > trace.at(-1)!.timeS + TIME_TOLERANCE_S) {
    return null;
  }
  if (timeS <= trace[0]!.timeS + TIME_TOLERANCE_S) return trace[0]!;
  if (timeS >= trace.at(-1)!.timeS - TIME_TOLERANCE_S) return trace.at(-1)!;

  let low = 0;
  let high = trace.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (trace[middle]!.timeS <= timeS) low = middle;
    else high = middle;
  }
  const before = trace[low]!;
  const after = trace[high]!;
  const fraction = (timeS - before.timeS) / (after.timeS - before.timeS);
  const interpolateVector = (a: Vector3, b: Vector3): Vector3 => ({
    x: a.x + (b.x - a.x) * fraction,
    y: a.y + (b.y - a.y) * fraction,
    z: a.z + (b.z - a.z) * fraction,
  });
  return {
    timeS,
    positionWorldM: interpolateVector(before.positionWorldM, after.positionWorldM),
    ...(before.velocityWorldMps && after.velocityWorldMps
      ? { velocityWorldMps: interpolateVector(before.velocityWorldMps, after.velocityWorldMps) }
      : {}),
  };
}

/**
 * Compare retained-vehicle and detached-body center-of-mass paths after a
 * staging event. This is intentionally a geometry-free diagnostic: it does
 * not infer collision clearance, plume interaction, or range-safety margins.
 */
export function analyzeSeparationClearance(
  input: SeparationClearanceInput,
): SeparationClearanceResult {
  if (!Number.isFinite(input.releaseTimeS)) {
    throw new Error("separation release time must be finite");
  }
  validateTrace(input.retainedTrace, "retained trajectory");
  validateTrace(input.detachedTrace, "detached trajectory");

  const retainedTrace = collapseDuplicateTimes(input.retainedTrace);
  const detachedTrace = collapseDuplicateTimes(input.detachedTrace);
  const detachedSamples = detachedTrace.filter(
    (point) => point.timeS >= input.releaseTimeS - TIME_TOLERANCE_S,
  );
  const matched: Array<{ timeS: number; distanceM: number; relativeVelocityMps: number | null }> = [];
  let unmatchedSampleCount = 0;
  for (const detachedPoint of detachedSamples) {
    const retainedPoint = interpolatePoint(retainedTrace, detachedPoint.timeS);
    if (!retainedPoint) {
      unmatchedSampleCount += 1;
      continue;
    }
    const distanceM = magnitude(
      subtractVectors(detachedPoint.positionWorldM, retainedPoint.positionWorldM),
    );
    const relativeVelocityMps = detachedPoint.velocityWorldMps && retainedPoint.velocityWorldMps
      ? magnitude(subtractVectors(detachedPoint.velocityWorldMps, retainedPoint.velocityWorldMps))
      : null;
    matched.push({ timeS: detachedPoint.timeS, distanceM, relativeVelocityMps });
  }

  const minimum = matched.reduce<{ timeS: number; distanceM: number } | null>(
    (best, sample) => !best || sample.distanceM < best.distanceM
      ? { timeS: sample.timeS, distanceM: sample.distanceM }
      : best,
    null,
  );
  const releaseSample = matched.find(
    (sample) => Math.abs(sample.timeS - input.releaseTimeS) <= TIME_TOLERANCE_S,
  ) ?? matched[0];
  const finalSample = matched.at(-1);
  const releasePoint = input.detachedTrace.find(
    (point) => Math.abs(point.timeS - input.releaseTimeS) <= TIME_TOLERANCE_S,
  ) ?? input.detachedTrace[0];
  const releaseRetainedPoint = releasePoint
    ? interpolatePoint(retainedTrace, releasePoint.timeS)
    : null;
  const relativeVelocityAtReleaseMps = releasePoint?.velocityWorldMps && releaseRetainedPoint?.velocityWorldMps
    ? magnitude(subtractVectors(releasePoint.velocityWorldMps, releaseRetainedPoint.velocityWorldMps))
    : releaseSample?.relativeVelocityMps ?? null;
  const status: SeparationClearanceResult["status"] =
    matched.length === 0
      ? "not-assessed"
      : unmatchedSampleCount > 0
        ? "partial"
        : "assessed";
  const warnings = [
    "Center-of-mass separation is a diagnostic only; body geometry, collision shapes, plume interaction, aerodynamic interference, and range-safety margins are not modeled.",
    ...(status === "partial"
      ? [`Retained trajectory coverage matched ${matched.length} of ${detachedSamples.length} detached samples; the remaining interval is outside the retained trace.`]
      : []),
    ...(status === "not-assessed"
      ? ["No detached samples overlapped the retained trajectory time range, so separation distance was not assessed."]
      : []),
    ...(minimum && releaseSample && minimum.distanceM < releaseSample.distanceM
      ? ["Center-of-mass separation decreases after release; inspect the staged geometry and separation mechanism independently."]
      : []),
  ];
  return {
    modelVersion: SEPARATION_CLEARANCE_MODEL_VERSION,
    validationStatus: SEPARATION_CLEARANCE_STATUS,
    releaseTimeS: input.releaseTimeS,
    sampleCount: detachedSamples.length,
    matchedSampleCount: matched.length,
    minimumDistanceM: minimum?.distanceM ?? null,
    minimumDistanceTimeS: minimum?.timeS ?? null,
    releaseDistanceM: releaseSample?.distanceM ?? null,
    finalDistanceM: finalSample?.distanceM ?? null,
    relativeVelocityAtReleaseMps,
    status,
    warnings,
    assumptions: [
      "Retained and detached positions are compared in the shared world frame.",
      "Retained positions are linearly interpolated at detached-body sample times.",
      "The detached body is represented by its center of mass; no body envelope or attitude-dependent geometry is applied.",
      "A partial result reports only the overlapping time interval and must not be extrapolated.",
    ],
  };
}
