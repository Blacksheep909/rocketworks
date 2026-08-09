import { gravityAtAltitude } from "./atmosphere.ts";
import type {
  LaunchEnvironmentProvider,
  LaunchSite,
} from "./launch-environment.ts";
import type { Vector3 } from "./linear-algebra.ts";
import {
  runUncertaintyAnalysis,
  type ProbabilityDistribution,
  type UncertaintyAnalysisResult,
} from "./uncertainty-analysis.ts";

export const RECOVERY_DESCENT_MODEL_VERSION = "kestrel-recovery-descent-0.1.0";
export const LANDING_FOOTPRINT_MODEL_VERSION = "kestrel-landing-footprint-0.2.0";
export const LANDING_ZONE_MODEL_STATUS = "engineering-preview-unvalidated";

const WGS84_SEMI_MAJOR_AXIS_M = 6_378_137;
const WGS84_INVERSE_FLATTENING = 298.257223563;

export type RecoveryDescentPhase =
  | "deployment-delay"
  | "inflating"
  | "inflated"
  | "ballistic";

export type RecoveryDescentTracePoint = Readonly<{
  timeS: number;
  positionWorldM: Vector3;
  velocityWorldMps: Vector3;
  windWorldMps: Vector3;
  airspeedMps: number;
  densityKgM3: number;
  effectiveDragAreaM2: number;
  phase: RecoveryDescentPhase;
}>;

export type RecoveryDescentResult = Readonly<{
  modelVersion: string;
  validationStatus: typeof LANDING_ZONE_MODEL_STATUS;
  landed: boolean;
  impactTimeS: number | null;
  descentDurationS: number;
  impactPositionWorldM: Vector3 | null;
  impactVelocityWorldMps: Vector3 | null;
  impactSpeedMps: number | null;
  maximumAirspeedMps: number;
  maximumHorizontalDistanceM: number;
  trace: readonly RecoveryDescentTracePoint[];
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

export type LandingImpactSample = Readonly<{
  id: string;
  eastM: number;
  northM: number;
  impactSpeedMps: number;
  descentDurationS: number;
}>;

export type Wgs84Position = Readonly<{
  latitudeDeg: number;
  longitudeDeg: number;
  elevationM: number;
}>;

export type LandingConfidenceEllipse = Readonly<{
  probability: number;
  centerEastM: number;
  centerNorthM: number;
  semiMajorM: number;
  semiMinorM: number;
  majorAxisAngleDegFromEast: number;
}>;

export type LandingFootprintResult = Readonly<{
  modelVersion: string;
  validationStatus: typeof LANDING_ZONE_MODEL_STATUS;
  site: LaunchSite;
  sampleCount: number;
  impacts: readonly (LandingImpactSample & Readonly<{ positionWgs84: Wgs84Position }>)[];
  meanImpact: Readonly<{
    eastM: number;
    northM: number;
    positionWgs84: Wgs84Position;
  }>;
  covarianceM2: Readonly<{
    eastEast: number;
    eastNorth: number;
    northNorth: number;
  }>;
  confidenceEllipses: readonly LandingConfidenceEllipse[];
  convexHull: readonly Readonly<{ eastM: number; northM: number }>[];
  radialDistanceM: Readonly<{
    p50: number;
    p90: number;
    p95: number;
    maximum: number;
  }>;
  impactSpeedMps: Readonly<{ p50: number; p95: number; maximum: number }>;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

export type LandingDispersionParameter = Readonly<{
  key: string;
  label: string;
  distribution: ProbabilityDistribution;
}>;

export type LandingDispersionResult = Readonly<{
  modelVersion: string;
  validationStatus: typeof LANDING_ZONE_MODEL_STATUS;
  seed: string;
  uncertainty: UncertaintyAnalysisResult;
  footprint: LandingFootprintResult;
  deploymentScenario: LandingDeploymentScenarioSummary | null;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

export type LandingDeploymentScenarioSummary = Readonly<{
  parameterKey: string;
  label: string;
  assumedSuccessProbability: number;
  successfulSampleCount: number;
  failedSampleCount: number;
  unclassifiedSampleCount: number;
  observedSuccessRate: number | null;
  wilson95: Readonly<{ lower: number; upper: number }> | null;
}>;

type DescentState = Readonly<{
  timeS: number;
  positionWorldM: Vector3;
  velocityWorldMps: Vector3;
}>;

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function finiteVector(vector: Vector3): boolean {
  return [vector.x, vector.y, vector.z].every(Number.isFinite);
}

function addScaled(left: Vector3, right: Vector3, scale: number): Vector3 {
  return {
    x: left.x + right.x * scale,
    y: left.y + right.y * scale,
    z: left.z + right.z * scale,
  };
}

function interpolateVector(left: Vector3, right: Vector3, fraction: number): Vector3 {
  return {
    x: left.x + (right.x - left.x) * fraction,
    y: left.y + (right.y - left.y) * fraction,
    z: left.z + (right.z - left.z) * fraction,
  };
}

function smoothstep(fraction: number): number {
  const bounded = Math.max(0, Math.min(1, fraction));
  return bounded * bounded * (3 - 2 * bounded);
}

function wilsonInterval95(successes: number, total: number): Readonly<{ lower: number; upper: number }> | null {
  if (total === 0) return null;
  const z = 1.959963984540054;
  const observed = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (observed + (z * z) / (2 * total)) / denominator;
  const radius =
    (z / denominator) *
    Math.sqrt((observed * (1 - observed)) / total + (z * z) / (4 * total * total));
  return { lower: Math.max(0, center - radius), upper: Math.min(1, center + radius) };
}

export function simulateRecoveryDescent(input: Readonly<{
  massKg: number;
  initialTimeS: number;
  initialPositionWorldM: Vector3;
  initialVelocityWorldMps: Vector3;
  environmentAt: LaunchEnvironmentProvider;
  ballisticDragCoefficient: number;
  ballisticReferenceAreaM2: number;
  recovery?: Readonly<{
    dragCoefficient: number;
    referenceAreaM2: number;
    deploymentDelayS?: number;
    inflationTimeS?: number;
  }>;
  integration?: Readonly<{
    timeStepS?: number;
    maximumDurationS?: number;
    traceIntervalS?: number;
  }>;
}>): RecoveryDescentResult {
  assertPositive(input.massKg, "descent mass");
  if (!Number.isFinite(input.initialTimeS)) {
    throw new Error("descent initial time must be finite");
  }
  if (!finiteVector(input.initialPositionWorldM) || input.initialPositionWorldM.z <= 0) {
    throw new Error("descent initial position must be finite and above ground");
  }
  if (!finiteVector(input.initialVelocityWorldMps)) {
    throw new Error("descent initial velocity must be finite");
  }
  assertPositive(input.ballisticDragCoefficient, "ballistic drag coefficient");
  assertPositive(input.ballisticReferenceAreaM2, "ballistic reference area");
  const deploymentDelayS = input.recovery?.deploymentDelayS ?? 0;
  const inflationTimeS = input.recovery?.inflationTimeS ?? 0;
  if (!Number.isFinite(deploymentDelayS) || deploymentDelayS < 0) {
    throw new Error("recovery deployment delay must be a non-negative finite number");
  }
  if (!Number.isFinite(inflationTimeS) || inflationTimeS < 0) {
    throw new Error("recovery inflation time must be a non-negative finite number");
  }
  if (input.recovery) {
    assertPositive(input.recovery.dragCoefficient, "recovery drag coefficient");
    assertPositive(input.recovery.referenceAreaM2, "recovery reference area");
  }
  const timeStepS = input.integration?.timeStepS ?? 0.04;
  const maximumDurationS = input.integration?.maximumDurationS ?? 600;
  const traceIntervalS = input.integration?.traceIntervalS ?? 0.25;
  assertPositive(timeStepS, "descent time step");
  assertPositive(maximumDurationS, "maximum descent duration");
  assertPositive(traceIntervalS, "descent trace interval");
  if (timeStepS > 0.5) throw new Error("descent time step may not exceed 0.5 seconds");
  if (maximumDurationS > 7200) {
    throw new Error("maximum descent duration may not exceed 7200 seconds");
  }
  const ballisticDragAreaM2 =
    input.ballisticDragCoefficient * input.ballisticReferenceAreaM2;
  const recoveryDragAreaM2 = input.recovery
    ? input.recovery.dragCoefficient * input.recovery.referenceAreaM2
    : 0;
  const descentStartTimeS = input.initialTimeS;

  const recoveryState = (timeS: number) => {
    if (!input.recovery) {
      return { phase: "ballistic" as const, inflationFraction: 0 };
    }
    const sinceStart = timeS - descentStartTimeS;
    if (sinceStart < deploymentDelayS) {
      return { phase: "deployment-delay" as const, inflationFraction: 0 };
    }
    if (inflationTimeS > 0 && sinceStart < deploymentDelayS + inflationTimeS) {
      return {
        phase: "inflating" as const,
        inflationFraction: smoothstep((sinceStart - deploymentDelayS) / inflationTimeS),
      };
    }
    return { phase: "inflated" as const, inflationFraction: 1 };
  };

  const derivative = (state: DescentState) => {
    const environment = input.environmentAt(state);
    const airRelativeVelocity = {
      x: state.velocityWorldMps.x - environment.windWorldMps.x,
      y: state.velocityWorldMps.y - environment.windWorldMps.y,
      z: state.velocityWorldMps.z - environment.windWorldMps.z,
    };
    const airspeedMps = Math.hypot(
      airRelativeVelocity.x,
      airRelativeVelocity.y,
      airRelativeVelocity.z,
    );
    const recovery = recoveryState(state.timeS);
    const effectiveDragAreaM2 =
      ballisticDragAreaM2 + recoveryDragAreaM2 * recovery.inflationFraction;
    const dragAccelerationFactor =
      airspeedMps > 0
        ? (-0.5 *
            environment.atmosphere.densityKgM3 *
            effectiveDragAreaM2 *
            airspeedMps) /
          input.massKg
        : 0;
    return {
      positionDerivative: state.velocityWorldMps,
      velocityDerivative: {
        x: dragAccelerationFactor * airRelativeVelocity.x,
        y: dragAccelerationFactor * airRelativeVelocity.y,
        z:
          dragAccelerationFactor * airRelativeVelocity.z -
          gravityAtAltitude(environment.altitudeAslM),
      },
      environment,
      airspeedMps,
      effectiveDragAreaM2,
      phase: recovery.phase,
    };
  };

  const advance = (state: DescentState, stepS: number): DescentState => {
    const first = derivative(state);
    const secondState = {
      timeS: state.timeS + stepS / 2,
      positionWorldM: addScaled(state.positionWorldM, first.positionDerivative, stepS / 2),
      velocityWorldMps: addScaled(state.velocityWorldMps, first.velocityDerivative, stepS / 2),
    };
    const second = derivative(secondState);
    const thirdState = {
      timeS: state.timeS + stepS / 2,
      positionWorldM: addScaled(state.positionWorldM, second.positionDerivative, stepS / 2),
      velocityWorldMps: addScaled(state.velocityWorldMps, second.velocityDerivative, stepS / 2),
    };
    const third = derivative(thirdState);
    const fourthState = {
      timeS: state.timeS + stepS,
      positionWorldM: addScaled(state.positionWorldM, third.positionDerivative, stepS),
      velocityWorldMps: addScaled(state.velocityWorldMps, third.velocityDerivative, stepS),
    };
    const fourth = derivative(fourthState);
    const combine = (
      initial: Vector3,
      firstValue: Vector3,
      secondValue: Vector3,
      thirdValue: Vector3,
      fourthValue: Vector3,
    ): Vector3 => ({
      x:
        initial.x +
        (stepS / 6) *
          (firstValue.x + 2 * secondValue.x + 2 * thirdValue.x + fourthValue.x),
      y:
        initial.y +
        (stepS / 6) *
          (firstValue.y + 2 * secondValue.y + 2 * thirdValue.y + fourthValue.y),
      z:
        initial.z +
        (stepS / 6) *
          (firstValue.z + 2 * secondValue.z + 2 * thirdValue.z + fourthValue.z),
    });
    return {
      timeS: state.timeS + stepS,
      positionWorldM: combine(
        state.positionWorldM,
        first.positionDerivative,
        second.positionDerivative,
        third.positionDerivative,
        fourth.positionDerivative,
      ),
      velocityWorldMps: combine(
        state.velocityWorldMps,
        first.velocityDerivative,
        second.velocityDerivative,
        third.velocityDerivative,
        fourth.velocityDerivative,
      ),
    };
  };

  const trace: RecoveryDescentTracePoint[] = [];
  let state: DescentState = {
    timeS: input.initialTimeS,
    positionWorldM: { ...input.initialPositionWorldM },
    velocityWorldMps: { ...input.initialVelocityWorldMps },
  };
  let nextTraceTimeS = state.timeS;
  let maximumAirspeedMps = 0;
  let maximumHorizontalDistanceM = Math.hypot(
    state.positionWorldM.x,
    state.positionWorldM.y,
  );
  const record = (recordState: DescentState) => {
    const evaluation = derivative(recordState);
    maximumAirspeedMps = Math.max(maximumAirspeedMps, evaluation.airspeedMps);
    maximumHorizontalDistanceM = Math.max(
      maximumHorizontalDistanceM,
      Math.hypot(recordState.positionWorldM.x, recordState.positionWorldM.y),
    );
    trace.push({
      timeS: recordState.timeS,
      positionWorldM: { ...recordState.positionWorldM },
      velocityWorldMps: { ...recordState.velocityWorldMps },
      windWorldMps: { ...evaluation.environment.windWorldMps },
      airspeedMps: evaluation.airspeedMps,
      densityKgM3: evaluation.environment.atmosphere.densityKgM3,
      effectiveDragAreaM2: evaluation.effectiveDragAreaM2,
      phase: evaluation.phase,
    });
  };
  record(state);
  nextTraceTimeS += traceIntervalS;
  const endTimeS = input.initialTimeS + maximumDurationS;
  while (state.timeS < endTimeS - 1e-12) {
    const stepS = Math.min(timeStepS, endTimeS - state.timeS);
    const next = advance(state, stepS);
    if (next.positionWorldM.z <= 0) {
      const fraction =
        state.positionWorldM.z /
        (state.positionWorldM.z - next.positionWorldM.z);
      state = {
        timeS: state.timeS + stepS * fraction,
        positionWorldM: {
          ...interpolateVector(state.positionWorldM, next.positionWorldM, fraction),
          z: 0,
        },
        velocityWorldMps: interpolateVector(
          state.velocityWorldMps,
          next.velocityWorldMps,
          fraction,
        ),
      };
      record(state);
      return {
        modelVersion: RECOVERY_DESCENT_MODEL_VERSION,
        validationStatus: LANDING_ZONE_MODEL_STATUS,
        landed: true,
        impactTimeS: state.timeS,
        descentDurationS: state.timeS - input.initialTimeS,
        impactPositionWorldM: { ...state.positionWorldM },
        impactVelocityWorldMps: { ...state.velocityWorldMps },
        impactSpeedMps: Math.hypot(
          state.velocityWorldMps.x,
          state.velocityWorldMps.y,
          state.velocityWorldMps.z,
        ),
        maximumAirspeedMps,
        maximumHorizontalDistanceM,
        trace,
        assumptions: [
          "Recovery vehicle is a three-degree-of-freedom point mass in local east-north-up coordinates",
          "Gravity and density vary with ASL altitude through the supplied launch environment",
          "Drag opposes the complete air-relative velocity vector",
          "Body drag remains active and canopy drag area is added through a deterministic smoothstep inflation ramp",
          "Ground is a flat z=0 AGL plane",
        ],
        warnings: [
          "This recovery-drift model is an engineering preview and is not validated for range-safety decisions.",
          "Ascent drift, canopy/vehicle relative motion, pendulum dynamics, line forces, reefing, wake interaction, and terrain are omitted.",
          "Impact is linearly interpolated across the final RK4 step; decrease the time step for convergence studies.",
        ],
      };
    }
    state = next;
    const evaluation = derivative(state);
    maximumAirspeedMps = Math.max(maximumAirspeedMps, evaluation.airspeedMps);
    maximumHorizontalDistanceM = Math.max(
      maximumHorizontalDistanceM,
      Math.hypot(state.positionWorldM.x, state.positionWorldM.y),
    );
    if (state.timeS + 1e-12 >= nextTraceTimeS) {
      record(state);
      nextTraceTimeS += traceIntervalS;
    }
  }
  return {
    modelVersion: RECOVERY_DESCENT_MODEL_VERSION,
    validationStatus: LANDING_ZONE_MODEL_STATUS,
    landed: false,
    impactTimeS: null,
    descentDurationS: maximumDurationS,
    impactPositionWorldM: null,
    impactVelocityWorldMps: null,
    impactSpeedMps: null,
    maximumAirspeedMps,
    maximumHorizontalDistanceM,
    trace,
    assumptions: [
      "Recovery vehicle is a three-degree-of-freedom point mass in local east-north-up coordinates",
      "Ground is a flat z=0 AGL plane",
    ],
    warnings: [
      "The configured maximum duration elapsed before ground impact.",
      "This recovery-drift model is an engineering preview and is not validated for range-safety decisions.",
    ],
  };
}

export function localEnuOffsetToWgs84(
  site: LaunchSite,
  eastM: number,
  northM: number,
  upM = 0,
): Wgs84Position {
  if (![eastM, northM, upM].every(Number.isFinite)) {
    throw new Error("local ENU offset must be finite");
  }
  if (Math.hypot(eastM, northM) > 100_000) {
    throw new Error("local tangent WGS84 conversion is limited to 100 km");
  }
  if (Math.abs(site.latitudeDeg) > 89.5) {
    throw new Error("local tangent WGS84 conversion is unsupported near the poles");
  }
  const latitudeRad = (site.latitudeDeg * Math.PI) / 180;
  const flattening = 1 / WGS84_INVERSE_FLATTENING;
  const eccentricitySquared = flattening * (2 - flattening);
  const sinLatitude = Math.sin(latitudeRad);
  const denominator = Math.sqrt(1 - eccentricitySquared * sinLatitude ** 2);
  const primeVerticalRadiusM = WGS84_SEMI_MAJOR_AXIS_M / denominator;
  const meridianRadiusM =
    (WGS84_SEMI_MAJOR_AXIS_M * (1 - eccentricitySquared)) /
    denominator ** 3;
  const latitude =
    latitudeRad + northM / (meridianRadiusM + site.elevationM);
  const longitude =
    (site.longitudeDeg * Math.PI) / 180 +
    eastM /
      ((primeVerticalRadiusM + site.elevationM) * Math.cos(latitudeRad));
  const normalizedLongitudeDeg =
    ((((longitude * 180) / Math.PI + 180) % 360) + 360) % 360 - 180;
  return {
    latitudeDeg: (latitude * 180) / Math.PI,
    longitudeDeg: normalizedLongitudeDeg,
    elevationM: site.elevationM + upM,
  };
}

function quantile(sorted: readonly number[], probability: number): number {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const fraction = position - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

function convexHull(points: readonly Readonly<{ eastM: number; northM: number }>[]) {
  const sorted = [...points].sort(
    (left, right) => left.eastM - right.eastM || left.northM - right.northM,
  );
  const cross2d = (
    origin: Readonly<{ eastM: number; northM: number }>,
    first: Readonly<{ eastM: number; northM: number }>,
    second: Readonly<{ eastM: number; northM: number }>,
  ) =>
    (first.eastM - origin.eastM) * (second.northM - origin.northM) -
    (first.northM - origin.northM) * (second.eastM - origin.eastM);
  const half = (values: typeof sorted) => {
    const result: typeof sorted = [];
    for (const point of values) {
      while (
        result.length >= 2 &&
        cross2d(result[result.length - 2], result[result.length - 1], point) <= 0
      ) {
        result.pop();
      }
      result.push(point);
    }
    return result;
  };
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function analyzeLandingFootprint(input: Readonly<{
  site: LaunchSite;
  impacts: readonly LandingImpactSample[];
}>): LandingFootprintResult {
  if (input.impacts.length < 3) {
    throw new Error("landing footprint requires at least three impact samples");
  }
  const ids = new Set<string>();
  input.impacts.forEach((impact) => {
    if (!impact.id.trim() || ids.has(impact.id)) {
      throw new Error("landing impact identifiers must be non-empty and unique");
    }
    ids.add(impact.id);
    if (
      ![
        impact.eastM,
        impact.northM,
        impact.impactSpeedMps,
        impact.descentDurationS,
      ].every(Number.isFinite) ||
      impact.impactSpeedMps < 0 ||
      impact.descentDurationS < 0
    ) {
      throw new Error(`landing impact ${impact.id} contains invalid values`);
    }
  });
  const meanEastM =
    input.impacts.reduce((sum, impact) => sum + impact.eastM, 0) /
    input.impacts.length;
  const meanNorthM =
    input.impacts.reduce((sum, impact) => sum + impact.northM, 0) /
    input.impacts.length;
  const denominator = input.impacts.length - 1;
  const covariance = input.impacts.reduce(
    (sum, impact) => {
      const east = impact.eastM - meanEastM;
      const north = impact.northM - meanNorthM;
      return {
        eastEast: sum.eastEast + east * east,
        eastNorth: sum.eastNorth + east * north,
        northNorth: sum.northNorth + north * north,
      };
    },
    { eastEast: 0, eastNorth: 0, northNorth: 0 },
  );
  covariance.eastEast /= denominator;
  covariance.eastNorth /= denominator;
  covariance.northNorth /= denominator;
  const halfDifference = (covariance.eastEast - covariance.northNorth) / 2;
  const root = Math.hypot(halfDifference, covariance.eastNorth);
  const meanVariance = (covariance.eastEast + covariance.northNorth) / 2;
  const majorVariance = Math.max(0, meanVariance + root);
  const minorVariance = Math.max(0, meanVariance - root);
  const majorAxisAngleRad =
    0.5 * Math.atan2(2 * covariance.eastNorth, covariance.eastEast - covariance.northNorth);
  const confidenceEllipses = [0.5, 0.9, 0.95].map(
    (probability): LandingConfidenceEllipse => {
      const scale = Math.sqrt(-2 * Math.log(1 - probability));
      return {
        probability,
        centerEastM: meanEastM,
        centerNorthM: meanNorthM,
        semiMajorM: Math.sqrt(majorVariance) * scale,
        semiMinorM: Math.sqrt(minorVariance) * scale,
        majorAxisAngleDegFromEast: (majorAxisAngleRad * 180) / Math.PI,
      };
    },
  );
  const radialDistances = input.impacts
    .map((impact) => Math.hypot(impact.eastM, impact.northM))
    .sort((left, right) => left - right);
  const impactSpeeds = input.impacts
    .map((impact) => impact.impactSpeedMps)
    .sort((left, right) => left - right);
  return {
    modelVersion: LANDING_FOOTPRINT_MODEL_VERSION,
    validationStatus: LANDING_ZONE_MODEL_STATUS,
    site: { ...input.site },
    sampleCount: input.impacts.length,
    impacts: input.impacts.map((impact) => ({
      ...impact,
      positionWgs84: localEnuOffsetToWgs84(input.site, impact.eastM, impact.northM),
    })),
    meanImpact: {
      eastM: meanEastM,
      northM: meanNorthM,
      positionWgs84: localEnuOffsetToWgs84(input.site, meanEastM, meanNorthM),
    },
    covarianceM2: covariance,
    confidenceEllipses,
    convexHull: convexHull(input.impacts),
    radialDistanceM: {
      p50: quantile(radialDistances, 0.5),
      p90: quantile(radialDistances, 0.9),
      p95: quantile(radialDistances, 0.95),
      maximum: radialDistances[radialDistances.length - 1],
    },
    impactSpeedMps: {
      p50: quantile(impactSpeeds, 0.5),
      p95: quantile(impactSpeeds, 0.95),
      maximum: impactSpeeds[impactSpeeds.length - 1],
    },
    assumptions: [
      "Impact offsets use a local east-north-up tangent plane at the WGS84 launch-site coordinate",
      "Covariance uses the unbiased sample estimate",
      "Confidence ellipses assume an approximately bivariate-normal impact distribution",
      "Ellipse probability scale uses the exact two-degree-of-freedom chi-square radial relation",
    ],
    warnings: [
      "A confidence ellipse summarizes sample covariance and can under-represent skewed, multimodal, bounded, or failed-flight distributions.",
      "The local WGS84 conversion is a curvature-radius approximation limited to 100 km and is not a surveyed geodetic solution.",
      "This footprint is an unvalidated engineering preview, not a launch corridor or range-safety determination.",
    ],
  };
}

export function analyzeRecoveryLandingDispersion(input: Readonly<{
  site: LaunchSite;
  seed: string;
  sampleCount: number;
  parameters: readonly LandingDispersionParameter[];
  deploymentScenario?: Readonly<{
    parameterKey: string;
    label?: string;
  }>;
  descentForSample: (
    values: Readonly<Record<string, number>>,
    sampleIndex: number,
  ) => RecoveryDescentResult;
}>): LandingDispersionResult {
  const uncertainty = runUncertaintyAnalysis({
    seed: input.seed,
    method: "latin-hypercube",
    sampleCount: input.sampleCount,
    parameters: [...input.parameters],
    evaluator: (values, sampleIndex) => {
      const descent = input.descentForSample(values, sampleIndex);
      if (
        !descent.landed ||
        !descent.impactPositionWorldM ||
        descent.impactSpeedMps === null
      ) {
        throw new Error("descent did not reach the ground within its configured duration");
      }
      return {
        impactEastM: descent.impactPositionWorldM.x,
        impactNorthM: descent.impactPositionWorldM.y,
        impactSpeedMps: descent.impactSpeedMps,
        descentDurationS: descent.descentDurationS,
        radialDistanceM: Math.hypot(
          descent.impactPositionWorldM.x,
          descent.impactPositionWorldM.y,
        ),
      };
    },
  });
  const deploymentParameter = input.deploymentScenario
    ? input.parameters.find((parameter) => parameter.key === input.deploymentScenario!.parameterKey)
    : undefined;
  const deploymentDistribution = deploymentParameter?.distribution;
  if (input.deploymentScenario && !deploymentParameter) {
    throw new Error(`deployment scenario parameter ${input.deploymentScenario.parameterKey} was not declared`);
  }
  if (input.deploymentScenario && deploymentDistribution?.kind !== "bernoulli") {
    throw new Error("deployment scenario parameter must use a Bernoulli distribution");
  }
  const deploymentScenario = deploymentDistribution?.kind === "bernoulli" && deploymentParameter
    ? (() => {
        const parameterKey = deploymentParameter.key;
        const classified = uncertainty.samples.reduce(
          (counts, sample) => {
            const outcome = sample.inputs[parameterKey];
            if (outcome === 1) counts.successfulSampleCount += 1;
            else if (outcome === 0) counts.failedSampleCount += 1;
            else counts.unclassifiedSampleCount += 1;
            return counts;
          },
          { successfulSampleCount: 0, failedSampleCount: 0, unclassifiedSampleCount: 0 },
        );
        const classifiedCount =
          classified.successfulSampleCount + classified.failedSampleCount;
        return {
          parameterKey,
          label: input.deploymentScenario?.label ?? deploymentParameter.label,
          assumedSuccessProbability: deploymentDistribution.successProbability,
          ...classified,
          observedSuccessRate:
            classifiedCount === 0
              ? null
              : classified.successfulSampleCount / classifiedCount,
          wilson95: wilsonInterval95(
            classified.successfulSampleCount,
            classifiedCount,
          ),
        } satisfies LandingDeploymentScenarioSummary;
      })()
    : null;
  const impacts = uncertainty.samples
    .filter((sample) => sample.outputs !== null)
    .map(
      (sample): LandingImpactSample => ({
        id: `sample-${String(sample.index + 1).padStart(3, "0")}`,
        eastM: sample.outputs!.impactEastM!,
        northM: sample.outputs!.impactNorthM!,
        impactSpeedMps: sample.outputs!.impactSpeedMps!,
        descentDurationS: sample.outputs!.descentDurationS!,
      }),
    );
  const footprint = analyzeLandingFootprint({ site: input.site, impacts });
  return {
    modelVersion: LANDING_FOOTPRINT_MODEL_VERSION,
    validationStatus: LANDING_ZONE_MODEL_STATUS,
    seed: input.seed,
    uncertainty,
    footprint,
    deploymentScenario,
    assumptions: [
      ...footprint.assumptions,
      "Scenario inputs use independent Latin-hypercube samples",
      ...(deploymentScenario
        ? [
            `Recovery deployment outcome is modeled as a Bernoulli assumption with ${(deploymentScenario.assumedSuccessProbability * 100).toFixed(1)}% success probability; value 0 uses ballistic descent.`,
          ]
        : []),
    ],
    warnings: [
      ...uncertainty.warnings,
      ...footprint.warnings,
      "Failed descent scenarios are excluded from footprint geometry and remain visible in uncertainty diagnostics.",
      ...(deploymentScenario && deploymentScenario.failedSampleCount > 0
        ? [
            `${deploymentScenario.failedSampleCount} sampled recovery deployment scenarios used ballistic descent because the Bernoulli deployment outcome was failure.`,
          ]
        : []),
    ],
  };
}
