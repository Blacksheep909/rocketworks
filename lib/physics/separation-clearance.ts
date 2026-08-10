import {
  addVectors,
  dot,
  magnitude,
  scaleVector,
  subtractVectors,
  type Vector3,
} from "./linear-algebra.ts";

export const SEPARATION_CLEARANCE_MODEL_VERSION =
  "kestrel-separation-clearance-0.2.0";
export const SEPARATION_CLEARANCE_STATUS =
  "analytical-component-checks-only" as const;
export const MULTI_BODY_SEPARATION_MODEL_VERSION =
  "kestrel-multi-body-separation-0.2.0";

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

export type MultiBodySeparationBody = Readonly<{
  id: string;
  label?: string;
  releaseTimeS: number;
  trace: readonly SeparationClearanceTracePoint[];
}>;

export type MultiBodySeparationPair = Readonly<
  SeparationClearanceResult & {
    firstBodyId: string;
    firstBodyLabel: string;
    secondBodyId: string;
    secondBodyLabel: string;
  }
>;

export type MultiBodySeparationResult = Readonly<{
  modelVersion: typeof MULTI_BODY_SEPARATION_MODEL_VERSION;
  validationStatus: typeof SEPARATION_CLEARANCE_STATUS;
  releaseTimeS: number;
  bodies: readonly Readonly<{
    id: string;
    label: string;
    releaseTimeS: number;
    sampleCount: number;
  }>[];
  pairs: readonly MultiBodySeparationPair[];
  minimumDistanceM: number | null;
  closestPair: Readonly<{
    firstBodyId: string;
    secondBodyId: string;
    timeS: number;
    distanceM: number;
  }> | null;
  status: "assessed" | "partial" | "not-assessed";
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

export type MultiBodySeparationInput = Readonly<{
  bodies: readonly MultiBodySeparationBody[];
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

type RelativeClosestApproach = Readonly<{
  timeS: number;
  distanceM: number;
}>;

/**
 * Finds the closest relative position over a piecewise-linear interval. Both
 * traces are interpolated at the same union of sample times, so the relative
 * position is linear between adjacent candidates. This catches a crossing
 * between integration samples that a sample-only minimum would miss.
 */
function continuousClosestApproach(
  retainedTrace: readonly SeparationClearanceTracePoint[],
  detachedTrace: readonly SeparationClearanceTracePoint[],
  releaseTimeS: number,
): RelativeClosestApproach | null {
  const overlapStartS = Math.max(
    releaseTimeS,
    retainedTrace[0]!.timeS,
    detachedTrace[0]!.timeS,
  );
  const overlapEndS = Math.min(
    retainedTrace.at(-1)!.timeS,
    detachedTrace.at(-1)!.timeS,
  );
  if (overlapStartS > overlapEndS + TIME_TOLERANCE_S) return null;

  const candidateTimes = [
    overlapStartS,
    ...retainedTrace.map((point) => point.timeS),
    ...detachedTrace.map((point) => point.timeS),
    overlapEndS,
  ]
    .filter(
      (timeS) =>
        timeS >= overlapStartS - TIME_TOLERANCE_S &&
        timeS <= overlapEndS + TIME_TOLERANCE_S,
    )
    .sort((a, b) => a - b)
    .reduce<number[]>((times, timeS) => {
      const previous = times.at(-1);
      if (previous === undefined || Math.abs(timeS - previous) > TIME_TOLERANCE_S) {
        times.push(timeS);
      }
      return times;
    }, []);
  const samples = candidateTimes.flatMap((timeS) => {
    const retained = interpolatePoint(retainedTrace, timeS);
    const detached = interpolatePoint(detachedTrace, timeS);
    if (!retained || !detached) return [];
    return [{ timeS, relativePositionM: subtractVectors(detached.positionWorldM, retained.positionWorldM) }];
  });
  if (samples.length === 0) return null;

  let closest: RelativeClosestApproach | null = null;
  const consider = (candidate: RelativeClosestApproach): void => {
    if (!closest || candidate.distanceM < closest.distanceM) closest = candidate;
  };
  samples.forEach((sample) =>
    consider({ timeS: sample.timeS, distanceM: magnitude(sample.relativePositionM) }),
  );
  for (let index = 0; index < samples.length - 1; index += 1) {
    const before = samples[index]!;
    const after = samples[index + 1]!;
    const durationS = after.timeS - before.timeS;
    if (!(durationS > TIME_TOLERANCE_S)) continue;
    const relativeDeltaM = subtractVectors(
      after.relativePositionM,
      before.relativePositionM,
    );
    const deltaSquaredM2 = dot(relativeDeltaM, relativeDeltaM);
    const fraction = deltaSquaredM2 > 1e-24
      ? Math.min(
          1,
          Math.max(
            0,
            -dot(before.relativePositionM, relativeDeltaM) / deltaSquaredM2,
          ),
        )
      : 0;
    const closestPositionM = addRelativePosition(
      before.relativePositionM,
      relativeDeltaM,
      fraction,
    );
    consider({
      timeS: before.timeS + fraction * durationS,
      distanceM: magnitude(closestPositionM),
    });
  }
  return closest;
}

function addRelativePosition(
  origin: Vector3,
  delta: Vector3,
  fraction: number,
): Vector3 {
  return addVectors(origin, scaleVector(delta, fraction));
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

  const minimum = continuousClosestApproach(
    retainedTrace,
    detachedTrace,
    input.releaseTimeS,
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
      "Minimum separation uses continuous closest approach over piecewise-linear relative position between the union of both traces' sample times; it is not a contact solve.",
      "The detached body is represented by its center of mass; no body envelope or attitude-dependent geometry is applied.",
      "A partial result reports only the overlapping time interval and must not be extrapolated.",
    ],
  };
}

/**
 * Compare every pair of retained and detached center-of-mass paths. Each pair
 * starts at the later of the two body release times, so a body is never
 * compared against a pre-release trajectory segment. This is deliberately a
 * pairwise path-divergence diagnostic, not a coupled contact or collision
 * solver.
 */
export function analyzeMultiBodySeparation(
  input: MultiBodySeparationInput,
): MultiBodySeparationResult {
  if (input.bodies.length < 2) {
    throw new Error("multi-body separation requires at least two bodies");
  }
  const normalizedBodies = input.bodies.map((body, index) => {
    const id = body.id.trim();
    if (!id) throw new Error(`multi-body separation body ${index + 1} id cannot be empty`);
    if (!Number.isFinite(body.releaseTimeS)) {
      throw new Error(`multi-body separation body ${id} release time must be finite`);
    }
    validateTrace(body.trace, `multi-body separation body ${id} trajectory`);
    return {
      id,
      label: body.label?.trim() || id,
      releaseTimeS: body.releaseTimeS,
      trace: body.trace,
    };
  });
  const ids = new Set<string>();
  for (const body of normalizedBodies) {
    if (ids.has(body.id)) throw new Error(`multi-body separation body ids must be unique: ${body.id}`);
    ids.add(body.id);
  }
  const pairs: MultiBodySeparationPair[] = [];
  for (let firstIndex = 0; firstIndex < normalizedBodies.length - 1; firstIndex += 1) {
    const first = normalizedBodies[firstIndex]!;
    for (let secondIndex = firstIndex + 1; secondIndex < normalizedBodies.length; secondIndex += 1) {
      const second = normalizedBodies[secondIndex]!;
      const releaseTimeS = Math.max(first.releaseTimeS, second.releaseTimeS);
      const clearance = analyzeSeparationClearance({
        retainedTrace: first.trace,
        detachedTrace: second.trace,
        releaseTimeS,
      });
      pairs.push({
        ...clearance,
        firstBodyId: first.id,
        firstBodyLabel: first.label,
        secondBodyId: second.id,
        secondBodyLabel: second.label,
      });
    }
  }
  const assessedPairs = pairs.filter((pair) => pair.status === "assessed");
  const partialPairs = pairs.filter((pair) => pair.status === "partial");
  const matchedPairs = pairs.filter((pair) => pair.minimumDistanceM !== null);
  const status: MultiBodySeparationResult["status"] =
    matchedPairs.length === 0
      ? "not-assessed"
      : partialPairs.length > 0 || assessedPairs.length < pairs.length
        ? "partial"
        : "assessed";
  const closestPair = matchedPairs.reduce<MultiBodySeparationResult["closestPair"]>(
    (closest, pair) => {
      if (pair.minimumDistanceM === null || pair.minimumDistanceTimeS === null) return closest;
      if (!closest || pair.minimumDistanceM < closest.distanceM) {
        return {
          firstBodyId: pair.firstBodyId,
          secondBodyId: pair.secondBodyId,
          timeS: pair.minimumDistanceTimeS,
          distanceM: pair.minimumDistanceM,
        };
      }
      return closest;
    },
    null,
  );
  const minimumDistanceM = closestPair?.distanceM ?? null;
  const releaseTimeS = Math.min(...normalizedBodies.map((body) => body.releaseTimeS));
  return {
    modelVersion: MULTI_BODY_SEPARATION_MODEL_VERSION,
    validationStatus: SEPARATION_CLEARANCE_STATUS,
    releaseTimeS,
    bodies: normalizedBodies.map(({ id, label, releaseTimeS: bodyReleaseTimeS, trace }) => ({
      id,
      label,
      releaseTimeS: bodyReleaseTimeS,
      sampleCount: trace.length,
    })),
    pairs,
    minimumDistanceM,
    closestPair,
    status,
    warnings: [
      "Pairwise center-of-mass separation is a diagnostic only; body envelopes, contact, collision shapes, plume interaction, aerodynamic interference, and range-safety margins are not modeled.",
      ...(status === "partial"
        ? [`${partialPairs.length + (pairs.length - assessedPairs.length - partialPairs.length)} of ${pairs.length} pair checks have incomplete or unavailable time overlap.`]
        : []),
      ...(status === "not-assessed"
        ? ["No pair had overlapping post-release samples, so a minimum multi-body separation was not assessed."]
        : []),
      ...(closestPair
        ? [`Closest assessed pair: ${closestPair.firstBodyId} / ${closestPair.secondBodyId} at ${closestPair.distanceM.toFixed(3)} m.`]
        : []),
    ],
    assumptions: [
      "All body positions are compared in the shared world frame.",
      "Each pair is evaluated from the later of its two release times; no pre-release trajectory is treated as a separated body.",
      "Retained positions are linearly interpolated at the other body's sample times and samples outside the shared trace interval are not extrapolated.",
      "The result reports center-of-mass path divergence only; it is not a body-envelope, collision, aerodynamic-clearance, or flight-safety assessment.",
    ],
  };
}
