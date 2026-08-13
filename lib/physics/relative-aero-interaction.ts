import type { LaunchEnvironmentProvider } from "./launch-environment.ts";
import {
  dot,
  magnitude,
  subtractVectors,
  type Vector3,
} from "./linear-algebra.ts";

/**
 * A bounded relative-flow screen for released-body trajectories.
 *
 * This is deliberately a post-processing diagnostic. It represents a
 * generating body wake as a finite expanding cone and reports where another
 * body's centre-of-mass envelope enters that cone. It never adds a force or
 * moment to a flight integrator, and it is not a substitute for stage-
 * separation wind-tunnel data or a CFD solution.
 */
export const RELATIVE_AERO_INTERACTION_MODEL_VERSION =
  "rocketworks-relative-aero-interaction-0.2.0";
export const RELATIVE_AERO_INTERACTION_STATUS =
  "analytical-component-checks-only" as const;

export type RelativeAeroInteractionTracePoint = Readonly<{
  timeS: number;
  positionWorldM: Vector3;
  velocityWorldMps?: Vector3;
}>;

export type RelativeAeroInteractionBody = Readonly<{
  id: string;
  label?: string;
  releaseTimeS: number;
  trace: readonly RelativeAeroInteractionTracePoint[];
  /** Optional reference area used to derive an equivalent circular diameter. */
  referenceAreaM2?: number | null;
  /** Optional conservative COM envelope used for geometric overlap. */
  envelopeRadiusM?: number | null;
}>;

export type RelativeAeroInteractionOptions = Readonly<{
  /** Disable this post-processing screen without changing the flight trace. */
  enabled?: boolean;
  /** Half-angle of the finite wake cone in degrees. */
  wakeHalfAngleDeg?: number;
  /** Wake length expressed in source equivalent-body diameters. */
  wakeRecoveryDistanceBodyDiameters?: number;
  /** Peak proxy velocity-deficit fraction at the source envelope. */
  peakVelocityDeficitFraction?: number;
  /** Hard upper bound on the reported proxy deficit. */
  maximumVelocityDeficitFraction?: number;
}>;

export type RelativeAeroInteractionPair = Readonly<{
  sourceBodyId: string;
  sourceBodyLabel: string;
  targetBodyId: string;
  targetBodyLabel: string;
  status: "assessed" | "not-assessed";
  sampleCount: number;
  flowSampleCount: number;
  exposedSampleCount: number;
  exposureCoverageFraction: number;
  sourceEquivalentDiameterM: number | null;
  targetEquivalentDiameterM: number | null;
  wakeLengthM: number | null;
  minimumWakeClearanceM: number | null;
  peakVelocityDeficitFraction: number | null;
  peakVelocityDeficitTimeS: number | null;
  maximumEstimatedDynamicPressureDeltaPa: number | null;
  maximumEstimatedDynamicPressureDeltaTimeS: number | null;
}>;

export type RelativeAeroInteractionConfiguration = Readonly<{
  enabled: boolean;
  wakeHalfAngleDeg: number;
  wakeRecoveryDistanceBodyDiameters: number;
  peakVelocityDeficitFraction: number;
  maximumVelocityDeficitFraction: number;
}>;

export type RelativeAeroInteractionResult = Readonly<{
  modelVersion: typeof RELATIVE_AERO_INTERACTION_MODEL_VERSION;
  validationStatus: typeof RELATIVE_AERO_INTERACTION_STATUS;
  bodies: readonly Readonly<{
    id: string;
    label: string;
    releaseTimeS: number;
    sampleCount: number;
    equivalentDiameterM: number | null;
    envelopeRadiusM: number | null;
  }>[];
  pairs: readonly RelativeAeroInteractionPair[];
  assessedPairCount: number;
  exposedPairCount: number;
  maximumVelocityDeficitFraction: number | null;
  maximumEstimatedDynamicPressureDeltaPa: number | null;
  configuration: RelativeAeroInteractionConfiguration;
  status: "assessed" | "partial" | "not-assessed";
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

type NormalizedOptions = Readonly<{
  wakeHalfAngleDeg: number;
  wakeRecoveryDistanceBodyDiameters: number;
  peakVelocityDeficitFraction: number;
  maximumVelocityDeficitFraction: number;
}>;

type NormalizedBody = RelativeAeroInteractionBody & Readonly<{
  label: string;
  referenceAreaM2: number | null;
  envelopeRadiusM: number | null;
  equivalentDiameterM: number | null;
  trace: readonly RelativeAeroInteractionTracePoint[];
}>;

type InterpolatedPoint = Readonly<{
  timeS: number;
  positionWorldM: Vector3;
  velocityWorldMps?: Vector3;
}>;

const DEFAULT_WAKE_HALF_ANGLE_DEG = 8;
const DEFAULT_WAKE_RECOVERY_DISTANCE_BODY_DIAMETERS = 30;
const DEFAULT_PEAK_VELOCITY_DEFICIT_FRACTION = 0.5;
const DEFAULT_MAXIMUM_VELOCITY_DEFICIT_FRACTION = 0.7;
const TIME_TOLERANCE_S = 1e-9;
const FLOW_SPEED_EPSILON_MPS = 1e-8;
const MAX_BODY_COUNT = 64;
const ZERO_VECTOR: Vector3 = { x: 0, y: 0, z: 0 };

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertFiniteVector(value: Vector3, label: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite coordinates`);
  }
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (!(value > 0)) throw new Error(`${label} must be positive`);
}

function normalizeOptionalPositive(
  value: number | null | undefined,
  label: string,
): number | null {
  if (value === undefined || value === null) return null;
  assertPositive(value, label);
  return value;
}

function normalizeOptions(options: RelativeAeroInteractionOptions): NormalizedOptions {
  const wakeHalfAngleDeg = options.wakeHalfAngleDeg ?? DEFAULT_WAKE_HALF_ANGLE_DEG;
  const wakeRecoveryDistanceBodyDiameters =
    options.wakeRecoveryDistanceBodyDiameters ?? DEFAULT_WAKE_RECOVERY_DISTANCE_BODY_DIAMETERS;
  const peakVelocityDeficitFraction =
    options.peakVelocityDeficitFraction ?? DEFAULT_PEAK_VELOCITY_DEFICIT_FRACTION;
  const maximumVelocityDeficitFraction =
    options.maximumVelocityDeficitFraction ?? DEFAULT_MAXIMUM_VELOCITY_DEFICIT_FRACTION;
  assertFinite(wakeHalfAngleDeg, "wake half-angle");
  if (wakeHalfAngleDeg < 0 || wakeHalfAngleDeg > 45) {
    throw new Error("wake half-angle must be between 0 and 45 degrees");
  }
  assertPositive(wakeRecoveryDistanceBodyDiameters, "wake recovery distance");
  if (wakeRecoveryDistanceBodyDiameters > 1_000) {
    throw new Error("wake recovery distance must be at most 1000 body diameters");
  }
  for (const [label, value] of [
    ["peak velocity deficit", peakVelocityDeficitFraction],
    ["maximum velocity deficit", maximumVelocityDeficitFraction],
  ] as const) {
    assertFinite(value, label);
    if (value < 0 || value >= 1) {
      throw new Error(`${label} must be from 0 through less than 1`);
    }
  }
  if (peakVelocityDeficitFraction > maximumVelocityDeficitFraction) {
    throw new Error("peak velocity deficit cannot exceed its maximum");
  }
  return {
    wakeHalfAngleDeg,
    wakeRecoveryDistanceBodyDiameters,
    peakVelocityDeficitFraction,
    maximumVelocityDeficitFraction,
  };
}

function collapseDuplicateTimes(
  trace: readonly RelativeAeroInteractionTracePoint[],
): RelativeAeroInteractionTracePoint[] {
  const collapsed: RelativeAeroInteractionTracePoint[] = [];
  for (const point of trace) {
    const previous = collapsed.at(-1);
    if (previous && Math.abs(point.timeS - previous.timeS) <= TIME_TOLERANCE_S) {
      collapsed[collapsed.length - 1] = point;
    } else {
      collapsed.push(point);
    }
  }
  return collapsed;
}

function validateBody(body: RelativeAeroInteractionBody, index: number): NormalizedBody {
  if (!body.id.trim()) throw new Error(`relative-flow body ${index + 1} id cannot be empty`);
  assertFinite(body.releaseTimeS, `relative-flow body ${body.id} release time`);
  if (body.trace.length === 0) throw new Error(`relative-flow body ${body.id} trace cannot be empty`);
  const trace = collapseDuplicateTimes(body.trace);
  let previousTime = -Infinity;
  trace.forEach((point, pointIndex) => {
    assertFinite(point.timeS, `relative-flow body ${body.id} sample ${pointIndex + 1} time`);
    if (point.timeS < previousTime - TIME_TOLERANCE_S) {
      throw new Error(`relative-flow body ${body.id} times must be non-decreasing`);
    }
    previousTime = point.timeS;
    assertFiniteVector(point.positionWorldM, `relative-flow body ${body.id} sample ${pointIndex + 1} position`);
    if (point.velocityWorldMps) {
      assertFiniteVector(point.velocityWorldMps, `relative-flow body ${body.id} sample ${pointIndex + 1} velocity`);
    }
  });
  const referenceAreaM2 = normalizeOptionalPositive(
    body.referenceAreaM2,
    `relative-flow body ${body.id} reference area`,
  );
  const envelopeRadiusM = body.envelopeRadiusM === undefined || body.envelopeRadiusM === null
    ? null
    : (() => {
        assertFinite(body.envelopeRadiusM!, `relative-flow body ${body.id} envelope radius`);
        if (body.envelopeRadiusM! < 0) {
          throw new Error(`relative-flow body ${body.id} envelope radius must be non-negative`);
        }
        return body.envelopeRadiusM!;
      })();
  const equivalentDiameterM = referenceAreaM2 !== null
    ? Math.sqrt((4 * referenceAreaM2) / Math.PI)
    : envelopeRadiusM !== null && envelopeRadiusM > 0
      ? 2 * envelopeRadiusM
      : null;
  return {
    ...body,
    label: body.label?.trim() || body.id,
    referenceAreaM2,
    envelopeRadiusM,
    equivalentDiameterM,
    trace,
  };
}

function interpolateVector(a: Vector3, b: Vector3, fraction: number): Vector3 {
  return {
    x: a.x + (b.x - a.x) * fraction,
    y: a.y + (b.y - a.y) * fraction,
    z: a.z + (b.z - a.z) * fraction,
  };
}

function interpolateTracePoint(
  trace: readonly RelativeAeroInteractionTracePoint[],
  timeS: number,
): InterpolatedPoint | null {
  if (
    timeS < trace[0]!.timeS - TIME_TOLERANCE_S ||
    timeS > trace.at(-1)!.timeS + TIME_TOLERANCE_S
  ) return null;
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
  const durationS = after.timeS - before.timeS;
  if (durationS <= TIME_TOLERANCE_S) return after;
  const fraction = (timeS - before.timeS) / durationS;
  return {
    timeS,
    positionWorldM: interpolateVector(before.positionWorldM, after.positionWorldM, fraction),
    ...(before.velocityWorldMps && after.velocityWorldMps
      ? { velocityWorldMps: interpolateVector(before.velocityWorldMps, after.velocityWorldMps, fraction) }
      : {}),
  };
}

function unionTimes(
  first: readonly RelativeAeroInteractionTracePoint[],
  second: readonly RelativeAeroInteractionTracePoint[],
  startTimeS: number,
  endTimeS: number,
): number[] {
  return [
    startTimeS,
    ...first.map((point) => point.timeS),
    ...second.map((point) => point.timeS),
    endTimeS,
  ]
    .filter((timeS) => timeS >= startTimeS - TIME_TOLERANCE_S && timeS <= endTimeS + TIME_TOLERANCE_S)
    .sort((left, right) => left - right)
    .reduce<number[]>((times, timeS) => {
      const previous = times.at(-1);
      if (previous === undefined || Math.abs(timeS - previous) > TIME_TOLERANCE_S) times.push(timeS);
      return times;
    }, []);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function evaluateDirection(
  source: NormalizedBody,
  target: NormalizedBody,
  options: NormalizedOptions,
  environmentAt: LaunchEnvironmentProvider | undefined,
): RelativeAeroInteractionPair {
  const sourceRadiusM = source.envelopeRadiusM ?? (source.equivalentDiameterM ?? 0) / 2;
  const targetRadiusM = target.envelopeRadiusM ?? (target.equivalentDiameterM ?? 0) / 2;
  const sourceDiameterM = source.equivalentDiameterM;
  const targetDiameterM = target.equivalentDiameterM;
  const wakeLengthM = sourceDiameterM === null
    ? null
    : sourceDiameterM * options.wakeRecoveryDistanceBodyDiameters;
  const overlapStartS = Math.max(source.releaseTimeS, target.releaseTimeS, source.trace[0]!.timeS, target.trace[0]!.timeS);
  const overlapEndS = Math.min(source.trace.at(-1)!.timeS, target.trace.at(-1)!.timeS);
  if (sourceDiameterM === null || targetDiameterM === null || overlapStartS > overlapEndS + TIME_TOLERANCE_S) {
    return {
      sourceBodyId: source.id,
      sourceBodyLabel: source.label,
      targetBodyId: target.id,
      targetBodyLabel: target.label,
      status: "not-assessed",
      sampleCount: 0,
      flowSampleCount: 0,
      exposedSampleCount: 0,
      exposureCoverageFraction: 0,
      sourceEquivalentDiameterM: sourceDiameterM,
      targetEquivalentDiameterM: targetDiameterM,
      wakeLengthM,
      minimumWakeClearanceM: null,
      peakVelocityDeficitFraction: null,
      peakVelocityDeficitTimeS: null,
      maximumEstimatedDynamicPressureDeltaPa: null,
      maximumEstimatedDynamicPressureDeltaTimeS: null,
    };
  }

  const times = unionTimes(source.trace, target.trace, overlapStartS, overlapEndS);
  let sampleCount = 0;
  let flowSampleCount = 0;
  let exposedSampleCount = 0;
  let minimumWakeClearanceM: number | null = null;
  let peakVelocityDeficitFraction: number | null = null;
  let peakVelocityDeficitTimeS: number | null = null;
  let maximumEstimatedDynamicPressureDeltaPa: number | null = null;
  let maximumEstimatedDynamicPressureDeltaTimeS: number | null = null;
  const wakeHalfAngleRad = (options.wakeHalfAngleDeg * Math.PI) / 180;

  for (const timeS of times) {
    const sourcePoint = interpolateTracePoint(source.trace, timeS);
    const targetPoint = interpolateTracePoint(target.trace, timeS);
    if (!sourcePoint || !targetPoint) continue;
    sampleCount += 1;
    if (!sourcePoint.velocityWorldMps || wakeLengthM === null) continue;
    const sourceEnvironment = environmentAt?.({
      timeS,
      positionWorldM: sourcePoint.positionWorldM,
      velocityWorldMps: sourcePoint.velocityWorldMps,
    });
    const sourceAirVelocity = subtractVectors(
      sourcePoint.velocityWorldMps,
      sourceEnvironment?.windWorldMps ?? ZERO_VECTOR,
    );
    const sourceAirSpeedMps = magnitude(sourceAirVelocity);
    if (sourceAirSpeedMps <= FLOW_SPEED_EPSILON_MPS) continue;
    flowSampleCount += 1;
    const wakeAxis = {
      x: sourceAirVelocity.x / sourceAirSpeedMps,
      y: sourceAirVelocity.y / sourceAirSpeedMps,
      z: sourceAirVelocity.z / sourceAirSpeedMps,
    };
    const separation = subtractVectors(targetPoint.positionWorldM, sourcePoint.positionWorldM);
    const downstreamDistanceM = dot(separation, wakeAxis);
    if (!(downstreamDistanceM > 0) || downstreamDistanceM > wakeLengthM) continue;
    const separationSquaredM2 = dot(separation, separation);
    const lateralDistanceM = Math.sqrt(Math.max(0, separationSquaredM2 - downstreamDistanceM ** 2));
    const wakeRadiusM = sourceRadiusM + Math.tan(wakeHalfAngleRad) * downstreamDistanceM;
    const interactionRadiusM = wakeRadiusM + targetRadiusM;
    const wakeClearanceM = lateralDistanceM - interactionRadiusM;
    minimumWakeClearanceM = minimumWakeClearanceM === null
      ? wakeClearanceM
      : Math.min(minimumWakeClearanceM, wakeClearanceM);
    if (wakeClearanceM > 0) continue;
    exposedSampleCount += 1;
    const exposureFraction = clamp(1 - lateralDistanceM / Math.max(interactionRadiusM, FLOW_SPEED_EPSILON_MPS), 0, 1);
    const recoveryFraction = clamp(1 - downstreamDistanceM / wakeLengthM, 0, 1);
    const deficitFraction = Math.min(
      options.maximumVelocityDeficitFraction,
      options.peakVelocityDeficitFraction * exposureFraction * recoveryFraction,
    );
    if (peakVelocityDeficitFraction === null || deficitFraction > peakVelocityDeficitFraction) {
      peakVelocityDeficitFraction = deficitFraction;
      peakVelocityDeficitTimeS = timeS;
    }
    if (environmentAt && targetPoint.velocityWorldMps) {
      const targetEnvironment = environmentAt({
        timeS,
        positionWorldM: targetPoint.positionWorldM,
        velocityWorldMps: targetPoint.velocityWorldMps,
      });
      const targetAirVelocity = subtractVectors(
        targetPoint.velocityWorldMps,
        targetEnvironment.windWorldMps,
      );
      const dynamicPressurePa =
        0.5 * targetEnvironment.atmosphere.densityKgM3 * magnitude(targetAirVelocity) ** 2;
      const dynamicPressureDeltaPa = dynamicPressurePa * (2 * deficitFraction - deficitFraction ** 2);
      if (
        maximumEstimatedDynamicPressureDeltaPa === null ||
        dynamicPressureDeltaPa > maximumEstimatedDynamicPressureDeltaPa
      ) {
        maximumEstimatedDynamicPressureDeltaPa = dynamicPressureDeltaPa;
        maximumEstimatedDynamicPressureDeltaTimeS = timeS;
      }
    }
  }

  return {
    sourceBodyId: source.id,
    sourceBodyLabel: source.label,
    targetBodyId: target.id,
    targetBodyLabel: target.label,
    status: flowSampleCount > 0 ? "assessed" : "not-assessed",
    sampleCount,
    flowSampleCount,
    exposedSampleCount,
    exposureCoverageFraction: flowSampleCount > 0 ? exposedSampleCount / flowSampleCount : 0,
    sourceEquivalentDiameterM: sourceDiameterM,
    targetEquivalentDiameterM: targetDiameterM,
    wakeLengthM,
    minimumWakeClearanceM,
    peakVelocityDeficitFraction,
    peakVelocityDeficitTimeS,
    maximumEstimatedDynamicPressureDeltaPa,
    maximumEstimatedDynamicPressureDeltaTimeS,
  };
}

/**
 * Analyze directed wake-cone overlap for every ordered pair of supplied
 * released-body traces.
 */
export function analyzeRelativeAeroInteraction(input: Readonly<{
  bodies: readonly RelativeAeroInteractionBody[];
  environmentAt?: LaunchEnvironmentProvider;
  options?: RelativeAeroInteractionOptions;
}>): RelativeAeroInteractionResult {
  if (input.bodies.length > MAX_BODY_COUNT) {
    throw new Error(`relative-flow analysis supports at most ${MAX_BODY_COUNT} bodies`);
  }
  const normalizedOptions = normalizeOptions(input.options ?? {});
  const configuration: RelativeAeroInteractionConfiguration = {
    enabled: input.options?.enabled !== false,
    ...normalizedOptions,
  };
  const ids = new Set<string>();
  const bodies = input.bodies.map((body, index) => {
    const normalized = validateBody(body, index);
    if (ids.has(normalized.id)) throw new Error(`relative-flow body identifiers must be unique: ${normalized.id}`);
    ids.add(normalized.id);
    return normalized;
  });
  if (input.options?.enabled === false || bodies.length < 2) {
    return {
      modelVersion: RELATIVE_AERO_INTERACTION_MODEL_VERSION,
      validationStatus: RELATIVE_AERO_INTERACTION_STATUS,
      bodies: bodies.map((body) => ({
        id: body.id,
        label: body.label,
        releaseTimeS: body.releaseTimeS,
        sampleCount: body.trace.length,
        equivalentDiameterM: body.equivalentDiameterM,
        envelopeRadiusM: body.envelopeRadiusM,
      })),
      pairs: [],
      assessedPairCount: 0,
      exposedPairCount: 0,
      maximumVelocityDeficitFraction: null,
      maximumEstimatedDynamicPressureDeltaPa: null,
      configuration,
      status: "not-assessed",
      warnings: [input.options?.enabled === false ? "Relative-flow interaction screen is disabled." : "At least two released-body traces are required for pairwise interaction analysis."],
      assumptions: [
        "This screen is post-processing only; it never changes retained or detached flight trajectories.",
      ],
    };
  }
  const pairs: RelativeAeroInteractionPair[] = [];
  for (const source of bodies) {
    for (const target of bodies) {
      if (source.id === target.id) continue;
      pairs.push(evaluateDirection(source, target, normalizedOptions, input.environmentAt));
    }
  }
  const assessedPairCount = pairs.filter((pair) => pair.status === "assessed").length;
  const exposedPairCount = pairs.filter((pair) => pair.exposedSampleCount > 0).length;
  const finiteDeficits = pairs.flatMap((pair) => pair.peakVelocityDeficitFraction === null ? [] : [pair.peakVelocityDeficitFraction]);
  const finiteDynamicPressureDeltas = pairs.flatMap((pair) => pair.maximumEstimatedDynamicPressureDeltaPa === null ? [] : [pair.maximumEstimatedDynamicPressureDeltaPa]);
  const warnings = [
    ...(input.environmentAt ? [] : ["No environment provider was supplied; the wake axis uses ground-relative body velocity and dynamic-pressure deltas remain unavailable."]),
    ...(bodies.some((body) => body.equivalentDiameterM === null)
      ? ["Bodies without a positive reference area or envelope radius remain outside the interaction screen."]
      : []),
    ...(exposedPairCount > 0
      ? ["One or more directed wake cones overlap a target envelope; this is a relative-flow review flag, not a force, moment, contact, or flight-safety result."]
      : []),
    "Wake overlap uses a finite expanding-cone and bounded velocity-deficit proxy; stage-separation interference requires wind-tunnel, CFD, or measured flight evidence.",
  ];
  const status = assessedPairCount === 0
    ? "not-assessed"
    : assessedPairCount === pairs.length
      ? "assessed"
      : "partial";
  return {
    modelVersion: RELATIVE_AERO_INTERACTION_MODEL_VERSION,
    validationStatus: RELATIVE_AERO_INTERACTION_STATUS,
    bodies: bodies.map((body) => ({
      id: body.id,
      label: body.label,
      releaseTimeS: body.releaseTimeS,
      sampleCount: body.trace.length,
      equivalentDiameterM: body.equivalentDiameterM,
      envelopeRadiusM: body.envelopeRadiusM,
    })),
    pairs,
    assessedPairCount,
    exposedPairCount,
    maximumVelocityDeficitFraction: finiteDeficits.length > 0 ? Math.max(...finiteDeficits) : null,
    maximumEstimatedDynamicPressureDeltaPa: finiteDynamicPressureDeltas.length > 0 ? Math.max(...finiteDynamicPressureDeltas) : null,
    configuration,
    status,
    warnings,
    assumptions: [
      "The wake axis is the source body's air-relative velocity when an environment provider is available; otherwise it uses ground-relative velocity as an explicitly weaker proxy.",
      "Equivalent diameter is sqrt(4 A / pi) when reference area is supplied, or twice the supplied spherical envelope radius as a fallback.",
      "The wake radius is r_source + tan(half-angle) x downstream distance and is limited to the configured recovery distance in source diameters.",
      "Proxy velocity deficit is peakDeficit x lateral exposure x linear downstream recovery, bounded below one; estimated dynamic-pressure reduction is q [1 - (1 - deficit)^2].",
      "Directed results are evaluated on the union of both traces with piecewise-linear position and velocity interpolation; no aerodynamic load is fed back into either trace.",
      "The result is an engineering diagnostic and does not establish stage-separation clearance, interference-force accuracy, structural adequacy, certification, or flight safety.",
    ],
  };
}
