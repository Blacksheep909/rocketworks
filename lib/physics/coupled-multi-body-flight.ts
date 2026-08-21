import {
  gravityAtAltitude,
  standardAtmosphere,
} from "./atmosphere.ts";
import type { LaunchEnvironmentProvider } from "./launch-environment.ts";
import {
  analyzeMultiBodySeparation,
  type MultiBodySeparationResult,
  type SeparationClearanceTracePoint,
} from "./separation-clearance.ts";
import {
  addVectors,
  cross,
  dot,
  multiplyMatrixVector,
  magnitude,
  scaleVector,
  solveMatrix3,
  subtractVectors,
  type Matrix3,
  type Vector3,
} from "./linear-algebra.ts";
import {
  multiplyQuaternions,
  normalizeQuaternion,
  rotateBodyToWorld,
  rigidBodyPropertiesAt,
  type AdaptiveRigidBodyIntegrationOptions,
  type Quaternion,
  type RigidBodyLoads,
  type RigidBodyIntegrationMethod,
  type RigidBodyState,
} from "./six-dof.ts";
import {
  ATTITUDE_DEPENDENT_DRAG_BODY_AXIS,
  evaluateAttitudeDependentDrag,
  validateAttitudeDependentDragGeometry,
  type AttitudeDependentDragGeometry,
} from "./attitude-dependent-drag.ts";
import {
  DETACHED_BODY_AERODYNAMICS_MODEL_VERSION,
  evaluateDetachedBodyAerodynamics,
  validateDetachedBodyAerodynamicBasis,
  type DetachedBodyAerodynamicBasis,
  type DetachedBodyAerodynamicResult,
} from "./detached-body-aerodynamics.ts";

/**
 * RocketWorks clean-room shared-grid propagator for released bodies.
 *
 * This is intentionally a bounded point-mass component model. Every released
 * body is integrated on the same mission-time grid against the same gravity,
 * atmosphere, and wind provider, then the resulting traces are compared as a
 * group. It can optionally apply a bounded spherical-envelope penalty force
 * when the caller enables the contact contract; plume interaction and
 * aerodynamic interference remain outside the model.
 */
export const COUPLED_MULTI_BODY_FLIGHT_MODEL_VERSION =
  "rocketworks-coupled-multi-body-flight-0.8.0";
export const COUPLED_MULTI_BODY_FLIGHT_STATUS =
  "analytical-component-checks-only" as const;
export const STANDARD_GRAVITATIONAL_CONSTANT_M3_KG_S2 = 6.67430e-11;

export const COUPLED_MULTI_BODY_CONTACT_MODEL_VERSION =
  "rocketworks-coupled-multi-body-contact-0.1.0";
export const COUPLED_MULTI_BODY_CONTACT_STATUS =
  "analytical-compliance-solver" as const;

export const COUPLED_MULTI_BODY_RELATIVE_AERO_MODEL_VERSION =
  "rocketworks-coupled-multi-body-relative-aero-0.1.0";
export const COUPLED_MULTI_BODY_RELATIVE_AERO_STATUS =
  "analytical-component-checks-only" as const;

export type CoupledMultiBodyGravityOptions = Readonly<{
  /** Enables direct pairwise point-mass gravity between released bodies. */
  enabled?: boolean;
  /** Optional Plummer-style softening radius for close approaches. */
  softeningRadiusM?: number;
}>;

/**
 * Optional bounded spherical-envelope contact force for the shared released-
 * body track. Contact is deliberately disabled by default. When enabled,
 * overlapping envelopes receive equal-and-opposite normal penalty forces;
 * missing envelope radii remain outside the solver.
 */
export type CoupledMultiBodyContactOptions = Readonly<{
  enabled?: boolean;
  /** Linear normal stiffness in N/m. */
  stiffnessNPerM?: number;
  /** Linear closing-speed damping in N/(m/s). */
  dampingNsPerM?: number;
  /** Safety cap on each pair's normal force. */
  maximumNormalForceN?: number;
}>;

/**
 * Optional bounded wake-deficit feedback for the shared multi-body track.
 * Disabled by default; when enabled, the strongest overlapping source wake
 * reduces the target's environment-relative flow before its existing drag or
 * aerodynamic basis is evaluated.
 */
export type CoupledMultiBodyRelativeAeroOptions = Readonly<{
  enabled?: boolean;
  wakeHalfAngleDeg?: number;
  wakeRecoveryDistanceBodyDiameters?: number;
  peakVelocityDeficitFraction?: number;
  maximumVelocityDeficitFraction?: number;
}>;

export type CoupledMultiBodyIntegrationOptions = Readonly<{
  /** Fixed RK4 remains the backwards-compatible shared-grid default. */
  method?: RigidBodyIntegrationMethod;
  /** Optional scaled step-doubling controls for adaptive mode. */
  adaptive?: AdaptiveRigidBodyIntegrationOptions;
}>;

export type CoupledMultiBodyVelocityAdjustment = Readonly<{
  deltaVWorldMps: Vector3;
  sourceEventId?: string;
}>;

/**
 * Optional rigid-body state for a released component.
 *
 * Translation still receives the shared gravity/point-drag environment model,
 * while attitude is propagated from Euler's rigid-body equation. Callers may
 * provide additional body/world forces and body moments through `loads`.
 * Contact, flexible-body, plume, and aerodynamic-interference loads remain
 * outside this contract unless the caller supplies them explicitly.
 */
export type CoupledMultiBodyRigidBodyInput = Readonly<{
  orientationBodyToWorld: Quaternion;
  angularVelocityBodyRadS?: Vector3;
  inertiaBodyKgM2: Matrix3;
  loads?: (state: RigidBodyState) => RigidBodyLoads;
}>;

export type CoupledMultiBodyFlightBodyInput = Readonly<{
  id: string;
  label?: string;
  massKg: number;
  releaseTimeS: number;
  releasePositionWorldM: Vector3;
  releaseVelocityWorldMps: Vector3;
  /** Optional explicitly applied release correction, retained for provenance. */
  velocityAdjustment?: CoupledMultiBodyVelocityAdjustment;
  /** Constant isotropic drag basis for this point-mass branch. */
  referenceAreaM2?: number;
  dragCoefficient?: number;
  /** Optional incidence-dependent projected-area drag for a rigid body. */
  attitudeDependentDrag?: AttitudeDependentDragGeometry;
  /** Optional static normal-force / CP-moment basis for a rigid body. */
  aerodynamicBasis?: DetachedBodyAerodynamicBasis;
  envelopeRadiusM?: number;
  /** Optional 6DOF attitude and inertia state for this released body. */
  rigidBody?: CoupledMultiBodyRigidBodyInput;
}>;

export type CoupledMultiBodyTracePoint = Readonly<{
  timeS: number;
  altitudeAglM: number;
  speedMps: number;
  positionWorldM: Vector3;
  velocityWorldMps: Vector3;
  accelerationWorldMps2: Vector3;
  relativeAirSpeedMps?: number;
  /** Optional strongest source-wake velocity deficit used by force feedback. */
  relativeWakeDeficitFraction?: number;
  /** Number of source wakes overlapping the body at this sample. */
  relativeWakeSourceCount?: number;
  dynamicPressurePa?: number;
  attitudeIncidenceRad?: number;
  effectiveReferenceAreaM2?: number;
  effectiveDragCoefficient?: number;
  aerodynamicDragN?: number;
  aerodynamicDragModelVersion?: string;
  aerodynamicAngleOfAttackRad?: number;
  aerodynamicSideslipRad?: number;
  aerodynamicNormalForceN?: number;
  aerodynamicNormalForceApplied?: boolean;
  aerodynamicStaticMomentBodyNm?: Vector3;
  aerodynamicDampingMomentBodyNm?: Vector3;
  aerodynamicReynoldsNumber?: number;
  aerodynamicCoefficientBasis?: DetachedBodyAerodynamicResult["coefficientBasis"];
  aerodynamicDirectForceApplied?: boolean;
  aerodynamicDirectMomentApplied?: boolean;
  aerodynamicCoefficientTableModelVersion?: string;
  aerodynamicCoefficientApplicabilityCount?: number;
  aerodynamicModelVersion?: string;
  /** Equal-and-opposite normal contact force from the optional envelope solver. */
  contactForceWorldN?: Vector3;
  /** Magnitude of the normal contact force applied to this body. */
  contactForceN?: number;
  /** Maximum spherical-envelope penetration involving this body at the sample. */
  contactPenetrationM?: number;
  /** Number of active contact pairs involving this body at the sample. */
  contactPairCount?: number;
  orientationBodyToWorld?: Quaternion;
  angularVelocityBodyRadS?: Vector3;
}>;

export type CoupledMultiBodyFlightTrajectory = Readonly<{
  id: string;
  label: string;
  massKg: number;
  releaseTimeS: number;
  releasePositionWorldM: Vector3;
  releaseVelocityWorldMps: Vector3;
  baselineReleaseVelocityWorldMps: Vector3;
  velocityAdjustmentWorldMps: Vector3;
  trace: readonly CoupledMultiBodyTracePoint[];
  maxAltitudeAglM: number;
  maxSpeedMps: number;
  impactTimeS: number | null;
  referenceAreaM2?: number;
  dragCoefficient?: number;
  attitudeDependentDrag?: AttitudeDependentDragGeometry;
  aerodynamicBasis?: DetachedBodyAerodynamicBasis;
  envelopeRadiusM?: number;
  rigidBody: Readonly<{
    enabled: true;
    initialOrientationBodyToWorld: Quaternion;
    initialAngularVelocityBodyRadS: Vector3;
  }> | null;
}>;

export type CoupledMultiBodyFlightInput = Readonly<{
  bodies: readonly CoupledMultiBodyFlightBodyInput[];
  /** Absolute mission end time, matching the staged preview duration. */
  durationS: number;
  timeStepS: number;
  /** Optional pairwise gravity model; disabled by default for compatibility. */
  mutualGravity?: CoupledMultiBodyGravityOptions;
  /** Optional equal-and-opposite spherical-envelope contact force model. */
  contact?: CoupledMultiBodyContactOptions;
  /** Optional post-trace wake model promoted to bounded force feedback. */
  relativeAeroForceFeedback?: CoupledMultiBodyRelativeAeroOptions;
  launchAltitudeM?: number;
  environmentAt?: LaunchEnvironmentProvider;
  maximumSteps?: number;
  integration?: CoupledMultiBodyIntegrationOptions;
}>;

export type CoupledMultiBodyFlightResult = Readonly<{
  modelVersion: typeof COUPLED_MULTI_BODY_FLIGHT_MODEL_VERSION;
  validationStatus: typeof COUPLED_MULTI_BODY_FLIGHT_STATUS;
  startTimeS: number;
  endTimeS: number;
  timeStepS: number;
  stepCount: number;
  mutualGravity: Readonly<{
    enabled: boolean;
    softeningRadiusM: number;
    gravitationalConstantM3KgS2: typeof STANDARD_GRAVITATIONAL_CONSTANT_M3_KG_S2;
  }>;
  contact: Readonly<{
    modelVersion: typeof COUPLED_MULTI_BODY_CONTACT_MODEL_VERSION;
    validationStatus: typeof COUPLED_MULTI_BODY_CONTACT_STATUS;
    enabled: boolean;
    stiffnessNPerM: number;
    dampingNsPerM: number;
    maximumNormalForceN: number;
    maximumPenetrationM: number | null;
    maximumNormalForceNObserved: number | null;
    contactPairCount: number;
    contactSampleCount: number;
  }>;
  relativeAeroForceFeedback: Readonly<{
    modelVersion: typeof COUPLED_MULTI_BODY_RELATIVE_AERO_MODEL_VERSION;
    validationStatus: typeof COUPLED_MULTI_BODY_RELATIVE_AERO_STATUS;
    enabled: boolean;
    wakeHalfAngleDeg: number;
    wakeRecoveryDistanceBodyDiameters: number;
    peakVelocityDeficitFraction: number;
    maximumVelocityDeficitFraction: number;
    maximumObservedVelocityDeficitFraction: number | null;
    exposedSampleCount: number;
    affectedBodyCount: number;
  }>;
  rigidBodyCount: number;
  aerodynamicBodyCount: number;
  integration: Readonly<{
    method: RigidBodyIntegrationMethod;
    acceptedStepCount: number;
    rejectedStepCount: number;
    maximumNormalizedError: number | null;
    minimumAcceptedStepS: number | null;
    maximumAcceptedStepS: number | null;
  }>;
  trajectories: readonly CoupledMultiBodyFlightTrajectory[];
  pairwise: MultiBodySeparationResult | null;
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

type PointState = Readonly<{
  timeS: number;
  positionWorldM: Vector3;
  velocityWorldMps: Vector3;
}>;

type Derivative = Readonly<{
  positionRateWorldMps: Vector3;
  velocityRateWorldMps2: Vector3;
}>;

type CoupledGroupState = Readonly<{
  timeS: number;
  positionsWorldM: Vector3[];
  velocitiesWorldMps: Vector3[];
  orientationsBodyToWorld: (Quaternion | null)[];
  angularVelocitiesBodyRadS: (Vector3 | null)[];
  active: boolean[];
}>;

type CoupledGroupDerivative = Readonly<{
  positionRatesWorldMps: readonly Vector3[];
  velocityRatesWorldMps2: readonly Vector3[];
  accelerationsWorldMps2: readonly Vector3[];
  contactForceWorldNs: readonly Vector3[];
  contactPenetrationsM: readonly number[];
  contactPairCounts: readonly number[];
  orientationRates: readonly (Quaternion | null)[];
  angularVelocityRatesBodyRadS2: readonly (Vector3 | null)[];
  relativeAirVelocityWorldMps: readonly (Vector3 | null)[];
  relativeWakeDeficitFractions: readonly (number | null)[];
  relativeWakeSourceCounts: readonly number[];
}>;

const ZERO_VECTOR: Vector3 = { x: 0, y: 0, z: 0 };
const TIME_TOLERANCE_S = 1e-9;
const DEFAULT_MAXIMUM_STEPS = 200_000;
const DEFAULT_ADAPTIVE_RELATIVE_TOLERANCE = 1e-7;
const DEFAULT_ADAPTIVE_ABSOLUTE_TOLERANCE = 1e-9;
const DEFAULT_ADAPTIVE_MINIMUM_STEP_S = 1e-8;
const DEFAULT_ADAPTIVE_SAFETY_FACTOR = 0.9;

type CoupledIntegrationConfig = Readonly<{
  method: RigidBodyIntegrationMethod;
  adaptive?: Required<AdaptiveRigidBodyIntegrationOptions>;
}>;

type MutableCoupledIntegrationDiagnostics = {
  method: RigidBodyIntegrationMethod;
  acceptedStepCount: number;
  rejectedStepCount: number;
  maximumNormalizedError: number;
  minimumAcceptedStepS: number;
  maximumAcceptedStepS: number;
};

type CoupledAdaptiveStepResult = Readonly<{
  state: CoupledGroupState;
  acceptedStepCount: number;
  rejectedStepCount: number;
  maximumNormalizedError: number;
  minimumAcceptedStepS: number;
  maximumAcceptedStepS: number;
}>;

type NormalizedRelativeAeroForceFeedbackOptions = Readonly<{
  enabled: boolean;
  wakeHalfAngleDeg: number;
  wakeRecoveryDistanceBodyDiameters: number;
  peakVelocityDeficitFraction: number;
  maximumVelocityDeficitFraction: number;
}>;

type RelativeAeroForceFeedbackEvaluation = Readonly<{
  relativeAirVelocityWorldMps: Vector3;
  maximumVelocityDeficitFraction: number;
  sourceCount: number;
}>;

const DEFAULT_RELATIVE_AERO_WAKE_HALF_ANGLE_DEG = 8;
const DEFAULT_RELATIVE_AERO_WAKE_RECOVERY_DISTANCE_BODY_DIAMETERS = 30;
const DEFAULT_RELATIVE_AERO_PEAK_VELOCITY_DEFICIT_FRACTION = 0.5;
const DEFAULT_RELATIVE_AERO_MAXIMUM_VELOCITY_DEFICIT_FRACTION = 0.7;
const RELATIVE_AERO_FLOW_SPEED_EPSILON_MPS = 1e-8;

function assertFiniteVector(value: Vector3, label: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite coordinates`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive and finite`);
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be non-negative and finite`);
  }
}

function validateCoupledAdaptiveOptions(
  durationS: number,
  options: AdaptiveRigidBodyIntegrationOptions,
): Required<AdaptiveRigidBodyIntegrationOptions> {
  const relativeTolerance =
    options.relativeTolerance ?? DEFAULT_ADAPTIVE_RELATIVE_TOLERANCE;
  const absoluteTolerance =
    options.absoluteTolerance ?? DEFAULT_ADAPTIVE_ABSOLUTE_TOLERANCE;
  const minimumStepS =
    options.minimumStepS ?? Math.min(DEFAULT_ADAPTIVE_MINIMUM_STEP_S, durationS);
  const maximumStepS = options.maximumStepS ?? durationS;
  const safetyFactor = options.safetyFactor ?? DEFAULT_ADAPTIVE_SAFETY_FACTOR;
  if (!Number.isFinite(relativeTolerance) || relativeTolerance <= 0) {
    throw new Error("coupled adaptive relative tolerance must be positive and finite");
  }
  if (!Number.isFinite(absoluteTolerance) || absoluteTolerance <= 0) {
    throw new Error("coupled adaptive absolute tolerance must be positive and finite");
  }
  if (!Number.isFinite(minimumStepS) || minimumStepS <= 0) {
    throw new Error("coupled adaptive minimum step must be positive and finite");
  }
  if (!Number.isFinite(maximumStepS) || maximumStepS <= 0) {
    throw new Error("coupled adaptive maximum step must be positive and finite");
  }
  if (minimumStepS > maximumStepS) {
    throw new Error("coupled adaptive minimum step cannot exceed maximum step");
  }
  if (!Number.isFinite(safetyFactor) || safetyFactor < 0.1 || safetyFactor > 1) {
    throw new Error("coupled adaptive safety factor must be finite and between 0.1 and 1");
  }
  return {
    relativeTolerance,
    absoluteTolerance,
    minimumStepS,
    maximumStepS,
    safetyFactor,
  };
}

function normalizeMutualGravityOptions(
  options: CoupledMultiBodyGravityOptions | undefined,
): Required<CoupledMultiBodyGravityOptions> {
  const enabled = options?.enabled ?? false;
  if (typeof enabled !== "boolean") {
    throw new Error("coupled multi-body mutual gravity enabled flag must be boolean");
  }
  const softeningRadiusM = options?.softeningRadiusM ?? 0;
  assertNonNegativeFinite(
    softeningRadiusM,
    "coupled multi-body mutual gravity softening radius",
  );
  return { enabled, softeningRadiusM };
}

const DEFAULT_CONTACT_STIFFNESS_N_PER_M = 50_000;
const DEFAULT_CONTACT_DAMPING_NS_PER_M = 100;
const DEFAULT_CONTACT_MAXIMUM_FORCE_N = 1_000_000;

type NormalizedContactOptions = Readonly<{
  enabled: boolean;
  stiffnessNPerM: number;
  dampingNsPerM: number;
  maximumNormalForceN: number;
}>;

function normalizeContactOptions(
  options: CoupledMultiBodyContactOptions | undefined,
): NormalizedContactOptions {
  const enabled = options?.enabled ?? false;
  if (typeof enabled !== "boolean") {
    throw new Error("coupled multi-body contact enabled flag must be boolean");
  }
  const stiffnessNPerM = options?.stiffnessNPerM ?? DEFAULT_CONTACT_STIFFNESS_N_PER_M;
  const dampingNsPerM = options?.dampingNsPerM ?? DEFAULT_CONTACT_DAMPING_NS_PER_M;
  const maximumNormalForceN = options?.maximumNormalForceN ?? DEFAULT_CONTACT_MAXIMUM_FORCE_N;
  assertPositiveFinite(stiffnessNPerM, "coupled multi-body contact stiffness");
  assertNonNegativeFinite(dampingNsPerM, "coupled multi-body contact damping");
  assertPositiveFinite(maximumNormalForceN, "coupled multi-body contact maximum force");
  if (stiffnessNPerM > 1e9) {
    throw new Error("coupled multi-body contact stiffness cannot exceed 1e9 N/m");
  }
  if (dampingNsPerM > 1e7) {
    throw new Error("coupled multi-body contact damping cannot exceed 1e7 N/(m/s)");
  }
  if (maximumNormalForceN > 1e10) {
    throw new Error("coupled multi-body contact maximum force cannot exceed 1e10 N");
  }
  return { enabled, stiffnessNPerM, dampingNsPerM, maximumNormalForceN };
}

function normalizeRelativeAeroForceFeedbackOptions(
  options: CoupledMultiBodyRelativeAeroOptions | undefined,
): NormalizedRelativeAeroForceFeedbackOptions {
  const enabled = options?.enabled ?? false;
  if (typeof enabled !== "boolean") {
    throw new Error("coupled multi-body relative-aero feedback enabled flag must be boolean");
  }
  const wakeHalfAngleDeg = options?.wakeHalfAngleDeg ?? DEFAULT_RELATIVE_AERO_WAKE_HALF_ANGLE_DEG;
  const wakeRecoveryDistanceBodyDiameters =
    options?.wakeRecoveryDistanceBodyDiameters ?? DEFAULT_RELATIVE_AERO_WAKE_RECOVERY_DISTANCE_BODY_DIAMETERS;
  const peakVelocityDeficitFraction =
    options?.peakVelocityDeficitFraction ?? DEFAULT_RELATIVE_AERO_PEAK_VELOCITY_DEFICIT_FRACTION;
  const maximumVelocityDeficitFraction =
    options?.maximumVelocityDeficitFraction ?? DEFAULT_RELATIVE_AERO_MAXIMUM_VELOCITY_DEFICIT_FRACTION;
  if (!Number.isFinite(wakeHalfAngleDeg) || wakeHalfAngleDeg < 0 || wakeHalfAngleDeg > 45) {
    throw new Error("coupled multi-body relative-aero wake half-angle must be between 0 and 45 degrees");
  }
  assertPositiveFinite(
    wakeRecoveryDistanceBodyDiameters,
    "coupled multi-body relative-aero wake recovery distance",
  );
  if (wakeRecoveryDistanceBodyDiameters > 1_000) {
    throw new Error("coupled multi-body relative-aero wake recovery distance cannot exceed 1000 body diameters");
  }
  for (const [label, value] of [
    ["coupled multi-body relative-aero peak velocity deficit", peakVelocityDeficitFraction],
    ["coupled multi-body relative-aero maximum velocity deficit", maximumVelocityDeficitFraction],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(`${label} must be from 0 through less than 1`);
    }
  }
  if (peakVelocityDeficitFraction > maximumVelocityDeficitFraction) {
    throw new Error("coupled multi-body relative-aero peak deficit cannot exceed its maximum");
  }
  return {
    enabled,
    wakeHalfAngleDeg,
    wakeRecoveryDistanceBodyDiameters,
    peakVelocityDeficitFraction,
    maximumVelocityDeficitFraction,
  };
}

function interpolateVector(a: Vector3, b: Vector3, fraction: number): Vector3 {
  return addVectors(a, scaleVector(subtractVectors(b, a), fraction));
}

function interpolateQuaternion(
  a: Quaternion,
  b: Quaternion,
  fraction: number,
): Quaternion {
  return normalizeQuaternion({
    w: a.w + (b.w - a.w) * fraction,
    x: a.x + (b.x - a.x) * fraction,
    y: a.y + (b.y - a.y) * fraction,
    z: a.z + (b.z - a.z) * fraction,
  });
}

function validateBody(body: CoupledMultiBodyFlightBodyInput): void {
  if (!body.id.trim()) throw new Error("coupled-flight body id cannot be empty");
  if (body.label !== undefined && !body.label.trim()) {
    throw new Error(`coupled-flight body ${body.id} label cannot be empty`);
  }
  assertPositiveFinite(body.massKg, `coupled-flight body ${body.id} mass`);
  assertNonNegativeFinite(body.releaseTimeS, `coupled-flight body ${body.id} release time`);
  assertFiniteVector(body.releasePositionWorldM, `coupled-flight body ${body.id} release position`);
  assertFiniteVector(body.releaseVelocityWorldMps, `coupled-flight body ${body.id} release velocity`);
  if (body.velocityAdjustment) {
    assertFiniteVector(
      body.velocityAdjustment.deltaVWorldMps,
      `coupled-flight body ${body.id} velocity adjustment`,
    );
    if (body.velocityAdjustment.sourceEventId !== undefined && !body.velocityAdjustment.sourceEventId.trim()) {
      throw new Error(`coupled-flight body ${body.id} adjustment source cannot be empty`);
    }
  }
  const hasArea = body.referenceAreaM2 !== undefined;
  const hasCoefficient = body.dragCoefficient !== undefined;
  if (hasArea !== hasCoefficient) {
    throw new Error(`coupled-flight body ${body.id} drag requires area and coefficient together`);
  }
  if (hasArea) {
    assertPositiveFinite(body.referenceAreaM2!, `coupled-flight body ${body.id} reference area`);
    assertPositiveFinite(body.dragCoefficient!, `coupled-flight body ${body.id} drag coefficient`);
  }
  if (body.attitudeDependentDrag) {
    if (!body.rigidBody) {
      throw new Error(`coupled-flight body ${body.id} attitude-dependent drag requires a rigid-body state`);
    }
    validateAttitudeDependentDragGeometry(body.attitudeDependentDrag);
  }
  if (body.aerodynamicBasis) {
    if (!body.rigidBody) {
      throw new Error(`coupled-flight body ${body.id} aerodynamic basis requires a rigid-body state`);
    }
    validateDetachedBodyAerodynamicBasis(body.aerodynamicBasis);
  }
  if (body.envelopeRadiusM !== undefined) {
    assertNonNegativeFinite(body.envelopeRadiusM, `coupled-flight body ${body.id} envelope radius`);
  }
  if (body.rigidBody) {
    if (
      [
        body.rigidBody.orientationBodyToWorld.w,
        body.rigidBody.orientationBodyToWorld.x,
        body.rigidBody.orientationBodyToWorld.y,
        body.rigidBody.orientationBodyToWorld.z,
      ].some((entry) => !Number.isFinite(entry))
    ) {
      throw new Error(`coupled-flight body ${body.id} rigid-body orientation must be finite`);
    }
    const angularVelocity = body.rigidBody.angularVelocityBodyRadS ?? ZERO_VECTOR;
    assertFiniteVector(
      angularVelocity,
      `coupled-flight body ${body.id} angular velocity`,
    );
    normalizeQuaternion(body.rigidBody.orientationBodyToWorld);
    rigidBodyPropertiesAt(
      {
        massKg: body.massKg,
        inertiaBodyKgM2: body.rigidBody.inertiaBodyKgM2,
      },
      {
        timeS: body.releaseTimeS,
        positionWorldM: body.releasePositionWorldM,
        velocityWorldMps: body.releaseVelocityWorldMps,
        orientationBodyToWorld: body.rigidBody.orientationBodyToWorld,
        angularVelocityBodyRadS: angularVelocity,
      },
    );
    if (body.rigidBody.loads !== undefined && typeof body.rigidBody.loads !== "function") {
      throw new Error(`coupled-flight body ${body.id} rigid-body loads must be a function`);
    }
  }
}

function environmentAt(
  input: CoupledMultiBodyFlightInput,
  timeS: number,
  positionWorldM: Vector3,
  velocityWorldMps?: Vector3,
) {
  return input.environmentAt?.({
    timeS,
    positionWorldM,
    ...(velocityWorldMps === undefined ? {} : { velocityWorldMps }),
  });
}

function bodyWakeDiameterM(body: CoupledMultiBodyFlightBodyInput): number | null {
  const referenceAreaM2 = body.aerodynamicBasis?.referenceAreaM2
    ?? (body.attitudeDependentDrag
      ? Math.max(
          body.attitudeDependentDrag.axialReferenceAreaM2,
          body.attitudeDependentDrag.crossflowReferenceAreaM2,
        )
      : body.referenceAreaM2);
  if (referenceAreaM2 !== undefined && referenceAreaM2 > 0) {
    return Math.sqrt((4 * referenceAreaM2) / Math.PI);
  }
  return body.envelopeRadiusM !== undefined && body.envelopeRadiusM > 0
    ? 2 * body.envelopeRadiusM
    : null;
}

function bodyWakeRadiusM(body: CoupledMultiBodyFlightBodyInput): number {
  if (body.envelopeRadiusM !== undefined && body.envelopeRadiusM > 0) {
    return body.envelopeRadiusM;
  }
  const diameterM = bodyWakeDiameterM(body);
  return diameterM === null ? 0 : diameterM / 2;
}

function hasAerodynamicLoadContract(body: CoupledMultiBodyFlightBodyInput): boolean {
  return Boolean(
    body.referenceAreaM2 !== undefined ||
    body.attitudeDependentDrag ||
    body.aerodynamicBasis,
  );
}

function evaluateRelativeAeroForceFeedbackForBody(
  targetIndex: number,
  bodies: readonly CoupledMultiBodyFlightBodyInput[],
  input: CoupledMultiBodyFlightInput,
  state: CoupledGroupState,
  options: NormalizedRelativeAeroForceFeedbackOptions,
): RelativeAeroForceFeedbackEvaluation | null {
  if (!options.enabled || !state.active[targetIndex] || !hasAerodynamicLoadContract(bodies[targetIndex]!)) {
    return null;
  }
  const targetBody = bodies[targetIndex]!;
  const targetPosition = state.positionsWorldM[targetIndex]!;
  const targetVelocity = state.velocitiesWorldMps[targetIndex]!;
  const targetEnvironment = environmentAt(input, state.timeS, targetPosition, targetVelocity);
  const targetAirVelocity = subtractVectors(
    targetVelocity,
    targetEnvironment?.windWorldMps ?? ZERO_VECTOR,
  );
  const targetRadiusM = bodyWakeRadiusM(targetBody);
  let strongestDeficitVelocityWorldMps = ZERO_VECTOR;
  let strongestDeficitVelocityMps = 0;
  let maximumVelocityDeficitFraction = 0;
  let sourceCount = 0;
  const wakeHalfAngleRad = (options.wakeHalfAngleDeg * Math.PI) / 180;
  for (let sourceIndex = 0; sourceIndex < bodies.length; sourceIndex += 1) {
    if (sourceIndex === targetIndex || !state.active[sourceIndex]) continue;
    const sourceBody = bodies[sourceIndex]!;
    const sourceDiameterM = bodyWakeDiameterM(sourceBody);
    if (sourceDiameterM === null) continue;
    const sourcePosition = state.positionsWorldM[sourceIndex]!;
    const sourceVelocity = state.velocitiesWorldMps[sourceIndex]!;
    const sourceEnvironment = environmentAt(input, state.timeS, sourcePosition, sourceVelocity);
    const sourceAirVelocity = subtractVectors(
      sourceVelocity,
      sourceEnvironment?.windWorldMps ?? ZERO_VECTOR,
    );
    const sourceAirSpeedMps = magnitude(sourceAirVelocity);
    if (sourceAirSpeedMps <= RELATIVE_AERO_FLOW_SPEED_EPSILON_MPS) continue;
    const wakeAxis = scaleVector(sourceAirVelocity, 1 / sourceAirSpeedMps);
    const separation = subtractVectors(targetPosition, sourcePosition);
    const downstreamDistanceM = dot(separation, wakeAxis);
    const wakeLengthM = sourceDiameterM * options.wakeRecoveryDistanceBodyDiameters;
    if (!(downstreamDistanceM > 0) || downstreamDistanceM > wakeLengthM) continue;
    const lateralDistanceSquaredM2 = Math.max(
      0,
      dot(separation, separation) - downstreamDistanceM ** 2,
    );
    const lateralDistanceM = Math.sqrt(lateralDistanceSquaredM2);
    const interactionRadiusM =
      bodyWakeRadiusM(sourceBody) + Math.tan(wakeHalfAngleRad) * downstreamDistanceM + targetRadiusM;
    if (lateralDistanceM > interactionRadiusM) continue;
    const exposureFraction = Math.min(
      1,
      Math.max(0, 1 - lateralDistanceM / Math.max(interactionRadiusM, RELATIVE_AERO_FLOW_SPEED_EPSILON_MPS)),
    );
    const recoveryFraction = Math.min(1, Math.max(0, 1 - downstreamDistanceM / wakeLengthM));
    const deficitFraction = Math.min(
      options.maximumVelocityDeficitFraction,
      options.peakVelocityDeficitFraction * exposureFraction * recoveryFraction,
    );
    if (!(deficitFraction > 0)) continue;
    sourceCount += 1;
    maximumVelocityDeficitFraction = Math.max(maximumVelocityDeficitFraction, deficitFraction);
    const deficitVelocityWorldMps = scaleVector(
      wakeAxis,
      sourceAirSpeedMps * deficitFraction,
    );
    const deficitVelocityMps = magnitude(deficitVelocityWorldMps);
    if (deficitVelocityMps > strongestDeficitVelocityMps) {
      strongestDeficitVelocityMps = deficitVelocityMps;
      strongestDeficitVelocityWorldMps = deficitVelocityWorldMps;
    }
  }
  return {
    relativeAirVelocityWorldMps: subtractVectors(
      targetAirVelocity,
      strongestDeficitVelocityWorldMps,
    ),
    maximumVelocityDeficitFraction,
    sourceCount,
  };
}

type CoupledBodyAerodynamicEvaluation = Readonly<{
  modelVersion: string;
  forceWorldN: Vector3;
  relativeAirSpeedMps: number;
  dynamicPressurePa: number;
  dragN: number;
  effectiveReferenceAreaM2: number;
  effectiveDragCoefficient: number;
  attitudeIncidenceRad: number | null;
  angleOfAttackRad: number | null;
  sideslipRad: number | null;
  normalForceN: number | null;
  normalForceApplied: boolean | null;
  staticMomentBodyNm: Vector3;
  dampingMomentBodyNm: Vector3;
  reynoldsNumber: number | null;
  coefficientBasis: DetachedBodyAerodynamicResult["coefficientBasis"];
  directForceApplied: boolean;
  directMomentApplied: boolean;
  coefficientTableModelVersion: string | null;
  coefficientApplicabilityCount: number;
}>;

function evaluateCoupledBodyAerodynamics(
  body: CoupledMultiBodyFlightBodyInput,
  input: CoupledMultiBodyFlightInput,
  timeS: number,
  positionWorldM: Vector3,
  velocityWorldMps: Vector3,
  orientationBodyToWorld: Quaternion | undefined,
  angularVelocityBodyRadS: Vector3 = ZERO_VECTOR,
  relativeAirVelocityWorldMps?: Vector3,
): CoupledBodyAerodynamicEvaluation | null {
  if (!orientationBodyToWorld || (!body.aerodynamicBasis && !body.attitudeDependentDrag)) return null;
  const environment = environmentAt(input, timeS, positionWorldM, velocityWorldMps);
  const altitudeAslM =
    environment?.altitudeAslM ?? (input.launchAltitudeM ?? 0) + positionWorldM.z;
  const atmosphere = environment?.atmosphere ?? standardAtmosphere(altitudeAslM);
  const effectiveRelativeAirVelocityWorldMps = relativeAirVelocityWorldMps ?? subtractVectors(
    velocityWorldMps,
    environment?.windWorldMps ?? ZERO_VECTOR,
  );
  if (body.aerodynamicBasis) {
    const result = evaluateDetachedBodyAerodynamics({
      basis: body.aerodynamicBasis,
      densityKgM3: atmosphere.densityKgM3,
      speedOfSoundMps: atmosphere.speedOfSoundMps,
      dynamicViscosityPaS: atmosphere.dynamicViscosityPaS,
      relativeAirVelocityWorldMps: effectiveRelativeAirVelocityWorldMps,
      orientationBodyToWorld,
      angularVelocityBodyRadS,
    });
    return {
      modelVersion: result.modelVersion,
      forceWorldN: result.aerodynamicForceWorldN,
      relativeAirSpeedMps: result.airspeedMps,
      dynamicPressurePa: result.dynamicPressurePa,
      dragN: result.dragN,
      effectiveReferenceAreaM2: result.effectiveReferenceAreaM2,
      effectiveDragCoefficient: result.effectiveDragCoefficient,
      attitudeIncidenceRad: result.projectedIncidenceRad,
      angleOfAttackRad: result.angleOfAttackRad,
      sideslipRad: result.sideslipRad,
      normalForceN: result.normalForceN,
      normalForceApplied: result.normalForceApplied,
      staticMomentBodyNm: result.aerodynamicStaticMomentBodyNm,
      dampingMomentBodyNm: result.aerodynamicDampingMomentBodyNm,
      reynoldsNumber: result.reynoldsNumber,
      coefficientBasis: result.coefficientBasis,
      directForceApplied: result.directForceApplied,
      directMomentApplied: result.directMomentApplied,
      coefficientTableModelVersion: body.aerodynamicBasis.coefficientTable?.modelVersion ?? null,
      coefficientApplicabilityCount: result.coefficientApplicability.length,
    };
  }
  const result = evaluateAttitudeDependentDrag({
    geometry: body.attitudeDependentDrag!,
    densityKgM3: atmosphere.densityKgM3,
    relativeAirVelocityWorldMps: effectiveRelativeAirVelocityWorldMps,
    bodyAxisWorldM: rotateBodyToWorld(
      orientationBodyToWorld,
      ATTITUDE_DEPENDENT_DRAG_BODY_AXIS,
    ),
  });
  return {
    modelVersion: result.modelVersion,
    forceWorldN: result.dragForceWorldN,
    relativeAirSpeedMps: result.relativeAirSpeedMps,
    dynamicPressurePa: result.dynamicPressurePa,
    dragN: magnitude(result.dragForceWorldN),
    effectiveReferenceAreaM2: result.effectiveReferenceAreaM2,
    effectiveDragCoefficient: result.effectiveDragCoefficient,
    attitudeIncidenceRad: result.incidenceRad,
    angleOfAttackRad: null,
    sideslipRad: null,
    normalForceN: null,
    normalForceApplied: null,
    staticMomentBodyNm: ZERO_VECTOR,
    dampingMomentBodyNm: ZERO_VECTOR,
    reynoldsNumber: null,
    coefficientBasis: null,
    directForceApplied: false,
    directMomentApplied: false,
    coefficientTableModelVersion: null,
    coefficientApplicabilityCount: 0,
  };
}

function accelerationAt(
  body: CoupledMultiBodyFlightBodyInput,
  input: CoupledMultiBodyFlightInput,
  timeS: number,
  positionWorldM: Vector3,
  velocityWorldMps: Vector3,
  orientationBodyToWorld?: Quaternion,
  relativeAirVelocityWorldMps?: Vector3,
): Vector3 {
  const environment = environmentAt(input, timeS, positionWorldM, velocityWorldMps);
  const altitudeAslM =
    environment?.altitudeAslM ?? (input.launchAltitudeM ?? 0) + positionWorldM.z;
  const gravityAccelerationWorldMps2 = addVectors(
    {
      x: 0,
      y: 0,
      z: -(environment?.gravityAccelerationMps2 ?? gravityAtAltitude(altitudeAslM)),
    },
    environment?.earthRotationAccelerationWorldMps2 ?? { x: 0, y: 0, z: 0 },
  );
  if (
    (body.referenceAreaM2 === undefined || body.dragCoefficient === undefined) &&
    !body.attitudeDependentDrag &&
    !body.aerodynamicBasis
  ) {
    return gravityAccelerationWorldMps2;
  }
  if (body.aerodynamicBasis) {
    // The shared rigid-body derivative adds this basis once alongside its
    // external moment; keeping it out here prevents a force double-count.
    return gravityAccelerationWorldMps2;
  }
  const relativeAirVelocityMps = relativeAirVelocityWorldMps ?? subtractVectors(
    velocityWorldMps,
    environment?.windWorldMps ?? ZERO_VECTOR,
  );
  const relativeAirSpeedMps = magnitude(relativeAirVelocityMps);
  if (relativeAirSpeedMps <= 0) return gravityAccelerationWorldMps2;
  if (body.attitudeDependentDrag && orientationBodyToWorld) {
    const atmosphere = environment?.atmosphere ?? standardAtmosphere(altitudeAslM);
    const drag = evaluateAttitudeDependentDrag({
      geometry: body.attitudeDependentDrag,
      densityKgM3: atmosphere.densityKgM3,
      relativeAirVelocityWorldMps: relativeAirVelocityMps,
      bodyAxisWorldM: rotateBodyToWorld(
        orientationBodyToWorld,
        ATTITUDE_DEPENDENT_DRAG_BODY_AXIS,
      ),
    });
    return addVectors(
      gravityAccelerationWorldMps2,
      scaleVector(drag.dragForceWorldN, 1 / body.massKg),
    );
  }
  if (body.referenceAreaM2 === undefined || body.dragCoefficient === undefined) {
    return gravityAccelerationWorldMps2;
  }
  const atmosphere = environment?.atmosphere ?? standardAtmosphere(altitudeAslM);
  const dragAccelerationMagnitudeMps2 =
    (0.5 * atmosphere.densityKgM3 * relativeAirSpeedMps ** 2 * body.dragCoefficient * body.referenceAreaM2) /
    body.massKg;
  return addVectors(
    gravityAccelerationWorldMps2,
    scaleVector(relativeAirVelocityMps, -dragAccelerationMagnitudeMps2 / relativeAirSpeedMps),
  );
}

function mutualGravityAccelerationAt(
  bodyIndex: number,
  bodies: readonly CoupledMultiBodyFlightBodyInput[],
  positionsWorldM: readonly Vector3[],
  active: readonly boolean[],
  softeningRadiusM: number,
): Vector3 {
  let acceleration = ZERO_VECTOR;
  const position = positionsWorldM[bodyIndex];
  for (let otherIndex = 0; otherIndex < bodies.length; otherIndex += 1) {
    if (otherIndex === bodyIndex || !active[otherIndex]) continue;
    const displacement = subtractVectors(positionsWorldM[otherIndex], position);
    const distanceSquared =
      displacement.x ** 2 + displacement.y ** 2 + displacement.z ** 2;
    if (distanceSquared === 0 && softeningRadiusM === 0) {
      throw new Error(
        `coupled multi-body mutual gravity singularity between ${bodies[bodyIndex].id} and ${bodies[otherIndex].id}`,
      );
    }
    const softenedDistanceSquared = distanceSquared + softeningRadiusM ** 2;
    const inverseDistanceCubed = 1 / softenedDistanceSquared ** 1.5;
    acceleration = addVectors(
      acceleration,
      scaleVector(
        displacement,
        STANDARD_GRAVITATIONAL_CONSTANT_M3_KG_S2 *
          bodies[otherIndex].massKg *
          inverseDistanceCubed,
      ),
    );
  }
  return acceleration;
}

type CoupledContactEvaluation = Readonly<{
  forcesWorldN: readonly Vector3[];
  penetrationsM: readonly number[];
  pairCounts: readonly number[];
  maximumPenetrationM: number | null;
  maximumNormalForceN: number | null;
  contactPairCount: number;
}>;

function evaluateCoupledContact(
  bodies: readonly CoupledMultiBodyFlightBodyInput[],
  state: CoupledGroupState,
  options: NormalizedContactOptions,
): CoupledContactEvaluation {
  const forcesWorldN = bodies.map(() => ZERO_VECTOR);
  const penetrationsM = bodies.map(() => 0);
  const pairCounts = bodies.map(() => 0);
  if (!options.enabled) {
    return {
      forcesWorldN,
      penetrationsM,
      pairCounts,
      maximumPenetrationM: null,
      maximumNormalForceN: null,
      contactPairCount: 0,
    };
  }
  let maximumPenetrationM = 0;
  let maximumNormalForceN = 0;
  let contactPairCount = 0;
  for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
    if (!state.active[firstIndex]) continue;
    const firstRadiusM = bodies[firstIndex]!.envelopeRadiusM;
    if (firstRadiusM === undefined || firstRadiusM <= 0) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
      if (!state.active[secondIndex]) continue;
      const secondRadiusM = bodies[secondIndex]!.envelopeRadiusM;
      if (secondRadiusM === undefined || secondRadiusM <= 0) continue;
      const relativePositionM = subtractVectors(
        state.positionsWorldM[secondIndex]!,
        state.positionsWorldM[firstIndex]!,
      );
      const distanceM = magnitude(relativePositionM);
      const penetrationM = firstRadiusM + secondRadiusM - distanceM;
      if (penetrationM <= 0) continue;
      const normalWorld = distanceM > 1e-12
        ? scaleVector(relativePositionM, 1 / distanceM)
        : { x: 1, y: 0, z: 0 };
      const relativeVelocityMps = subtractVectors(
        state.velocitiesWorldMps[secondIndex]!,
        state.velocitiesWorldMps[firstIndex]!,
      );
      const closingSpeedMps = Math.max(0, -dot(normalWorld, relativeVelocityMps));
      const normalForceN = Math.min(
        options.maximumNormalForceN,
        Math.max(0, options.stiffnessNPerM * penetrationM + options.dampingNsPerM * closingSpeedMps),
      );
      const forceWorldN = scaleVector(normalWorld, normalForceN);
      forcesWorldN[firstIndex] = subtractVectors(forcesWorldN[firstIndex]!, forceWorldN);
      forcesWorldN[secondIndex] = addVectors(forcesWorldN[secondIndex]!, forceWorldN);
      penetrationsM[firstIndex] = Math.max(penetrationsM[firstIndex]!, penetrationM);
      penetrationsM[secondIndex] = Math.max(penetrationsM[secondIndex]!, penetrationM);
      pairCounts[firstIndex] += 1;
      pairCounts[secondIndex] += 1;
      maximumPenetrationM = Math.max(maximumPenetrationM, penetrationM);
      maximumNormalForceN = Math.max(maximumNormalForceN, normalForceN);
      contactPairCount += 1;
    }
  }
  return {
    forcesWorldN,
    penetrationsM,
    pairCounts,
    maximumPenetrationM: contactPairCount > 0 ? maximumPenetrationM : null,
    maximumNormalForceN: contactPairCount > 0 ? maximumNormalForceN : null,
    contactPairCount,
  };
}

function quaternionRate(
  orientationBodyToWorld: Quaternion,
  angularVelocityBodyRadS: Vector3,
): Quaternion {
  const product = multiplyQuaternions(orientationBodyToWorld, {
    w: 0,
    ...angularVelocityBodyRadS,
  });
  return {
    w: product.w / 2,
    x: product.x / 2,
    y: product.y / 2,
    z: product.z / 2,
  };
}

function validateRigidBodyLoads(
  loads: RigidBodyLoads,
  bodyId: string,
): RigidBodyLoads {
  if (loads === null || typeof loads !== "object" || Array.isArray(loads)) {
    throw new Error(`coupled-flight body ${bodyId} rigid-body loads must return an object`);
  }
  for (const [label, vector] of [
    ["world force", loads.forceWorldN],
    ["body force", loads.forceBodyN],
    ["body moment", loads.momentBodyNm],
  ] as const) {
    if (vector !== undefined) assertFiniteVector(vector, `coupled-flight body ${bodyId} ${label}`);
  }
  return loads;
}

function rigidBodyStateAt(
  body: CoupledMultiBodyFlightBodyInput,
  state: CoupledGroupState,
  index: number,
): RigidBodyState {
  const rigidBody = body.rigidBody;
  if (!rigidBody) throw new Error(`coupled-flight body ${body.id} has no rigid-body state`);
  const orientation = state.orientationsBodyToWorld[index];
  const angularVelocity = state.angularVelocitiesBodyRadS[index];
  if (!orientation || !angularVelocity) {
    throw new Error(`coupled-flight body ${body.id} rigid-body state is unavailable`);
  }
  return {
    timeS: state.timeS,
    positionWorldM: state.positionsWorldM[index]!,
    velocityWorldMps: state.velocitiesWorldMps[index]!,
    orientationBodyToWorld: orientation,
    angularVelocityBodyRadS: angularVelocity,
  };
}

function rigidBodyAngularAccelerationAt(
  body: CoupledMultiBodyFlightBodyInput,
  state: RigidBodyState,
  loads: RigidBodyLoads,
): Vector3 {
  const rigidBody = body.rigidBody;
  if (!rigidBody) return ZERO_VECTOR;
  const angularMomentumBody = multiplyMatrixVector(
    rigidBody.inertiaBodyKgM2,
    state.angularVelocityBodyRadS,
  );
  return solveMatrix3(
    rigidBody.inertiaBodyKgM2,
    subtractVectors(
      loads.momentBodyNm ?? ZERO_VECTOR,
      cross(state.angularVelocityBodyRadS, angularMomentumBody),
    ),
  );
}

function coupledGroupDerivativeAt(
  bodies: readonly CoupledMultiBodyFlightBodyInput[],
  input: CoupledMultiBodyFlightInput,
  state: CoupledGroupState,
  mutualGravity: Required<CoupledMultiBodyGravityOptions>,
  contact: NormalizedContactOptions,
  relativeAero: NormalizedRelativeAeroForceFeedbackOptions,
): CoupledGroupDerivative {
  const positionRatesWorldMps: Vector3[] = [];
  const velocityRatesWorldMps2: Vector3[] = [];
  const accelerationsWorldMps2: Vector3[] = [];
  const contactForceWorldNs: Vector3[] = [];
  const contactPenetrationsM: number[] = [];
  const contactPairCounts: number[] = [];
  const orientationRates: (Quaternion | null)[] = [];
  const angularVelocityRatesBodyRadS2: (Vector3 | null)[] = [];
  const relativeAirVelocityWorldMps: (Vector3 | null)[] = [];
  const relativeWakeDeficitFractions: (number | null)[] = [];
  const relativeWakeSourceCounts: number[] = [];
  const contactEvaluation = evaluateCoupledContact(bodies, state, contact);
  for (let index = 0; index < bodies.length; index += 1) {
    if (!state.active[index]) {
      positionRatesWorldMps.push(ZERO_VECTOR);
      velocityRatesWorldMps2.push(ZERO_VECTOR);
      accelerationsWorldMps2.push(ZERO_VECTOR);
      contactForceWorldNs.push(ZERO_VECTOR);
      contactPenetrationsM.push(0);
      contactPairCounts.push(0);
      orientationRates.push(null);
      angularVelocityRatesBodyRadS2.push(null);
      relativeAirVelocityWorldMps.push(null);
      relativeWakeDeficitFractions.push(null);
      relativeWakeSourceCounts.push(0);
      continue;
    }
    const body = bodies[index]!;
    const relativeAeroEvaluation = evaluateRelativeAeroForceFeedbackForBody(
      index,
      bodies,
      input,
      state,
      relativeAero,
    );
    const rigidState = body.rigidBody
      ? rigidBodyStateAt(body, state, index)
      : null;
    const aerodynamic = evaluateCoupledBodyAerodynamics(
      body,
      input,
      state.timeS,
      state.positionsWorldM[index]!,
      state.velocitiesWorldMps[index]!,
      state.orientationsBodyToWorld[index] ?? undefined,
      state.angularVelocitiesBodyRadS[index] ?? ZERO_VECTOR,
      relativeAeroEvaluation?.relativeAirVelocityWorldMps,
    );
    const baseAcceleration = addVectors(
      addVectors(
        addVectors(
          accelerationAt(
            body,
            input,
            state.timeS,
            state.positionsWorldM[index]!,
            state.velocitiesWorldMps[index]!,
            state.orientationsBodyToWorld[index] ?? undefined,
            relativeAeroEvaluation?.relativeAirVelocityWorldMps,
          ),
          aerodynamic && body.aerodynamicBasis
            ? scaleVector(aerodynamic.forceWorldN, 1 / body.massKg)
            : ZERO_VECTOR,
        ),
        mutualGravity.enabled
          ? mutualGravityAccelerationAt(
              index,
              bodies,
              state.positionsWorldM,
              state.active,
              mutualGravity.softeningRadiusM,
            )
          : ZERO_VECTOR,
      ),
      contact.enabled
        ? scaleVector(contactEvaluation.forcesWorldN[index]!, 1 / body.massKg)
        : ZERO_VECTOR,
    );
    let acceleration = baseAcceleration;
    let orientationRate: Quaternion | null = null;
    let angularVelocityRate: Vector3 | null = null;
    if (body.rigidBody) {
      const loads = validateRigidBodyLoads(
        body.rigidBody.loads?.(rigidState!) ?? {},
        body.id,
      );
      const externalForceWorldN = addVectors(
        loads.forceWorldN ?? ZERO_VECTOR,
        rotateBodyToWorld(
          rigidState!.orientationBodyToWorld,
          loads.forceBodyN ?? ZERO_VECTOR,
        ),
      );
      acceleration = scaleVector(
        addVectors(
          scaleVector(baseAcceleration, body.massKg),
          externalForceWorldN,
        ),
        1 / body.massKg,
      );
      orientationRate = quaternionRate(
        rigidState!.orientationBodyToWorld,
        rigidState!.angularVelocityBodyRadS,
      );
      angularVelocityRate = rigidBodyAngularAccelerationAt(
        body,
        rigidState!,
        {
          ...loads,
          ...(aerodynamic
            ? {
                momentBodyNm: addVectors(
                  addVectors(
                    loads.momentBodyNm ?? ZERO_VECTOR,
                    aerodynamic.staticMomentBodyNm,
                  ),
                  aerodynamic.dampingMomentBodyNm,
                ),
              }
            : {}),
        },
      );
    }
    positionRatesWorldMps.push(state.velocitiesWorldMps[index]);
    velocityRatesWorldMps2.push(acceleration);
    accelerationsWorldMps2.push(acceleration);
    contactForceWorldNs.push(contactEvaluation.forcesWorldN[index]!);
    contactPenetrationsM.push(contactEvaluation.penetrationsM[index]!);
    contactPairCounts.push(contactEvaluation.pairCounts[index]!);
    orientationRates.push(orientationRate);
    angularVelocityRatesBodyRadS2.push(angularVelocityRate);
    relativeAirVelocityWorldMps.push(relativeAeroEvaluation?.relativeAirVelocityWorldMps ?? null);
    relativeWakeDeficitFractions.push(
      relativeAeroEvaluation && relativeAeroEvaluation.sourceCount > 0
        ? relativeAeroEvaluation.maximumVelocityDeficitFraction
        : null,
    );
    relativeWakeSourceCounts.push(relativeAeroEvaluation?.sourceCount ?? 0);
  }
  return {
    positionRatesWorldMps,
    velocityRatesWorldMps2,
    accelerationsWorldMps2,
    contactForceWorldNs,
    contactPenetrationsM,
    contactPairCounts,
    orientationRates,
    angularVelocityRatesBodyRadS2,
    relativeAirVelocityWorldMps,
    relativeWakeDeficitFractions,
    relativeWakeSourceCounts,
  };
}

function integrateCoupledGroupRungeKutta4(
  bodies: readonly CoupledMultiBodyFlightBodyInput[],
  input: CoupledMultiBodyFlightInput,
  state: CoupledGroupState,
  stepS: number,
  mutualGravity: Required<CoupledMultiBodyGravityOptions>,
  contact: NormalizedContactOptions,
  relativeAero: NormalizedRelativeAeroForceFeedbackOptions,
): CoupledGroupState {
  const addScaledQuaternion = (
    value: Quaternion,
    derivative: Quaternion,
    scale: number,
  ): Quaternion => normalizeQuaternion({
    w: value.w + derivative.w * scale,
    x: value.x + derivative.x * scale,
    y: value.y + derivative.y * scale,
    z: value.z + derivative.z * scale,
  });
  const k1 = coupledGroupDerivativeAt(bodies, input, state, mutualGravity, contact, relativeAero);
  const halfState = (
    base: CoupledGroupState,
    derivative: CoupledGroupDerivative,
    scale: number,
    timeS: number,
  ): CoupledGroupState => ({
    timeS,
    positionsWorldM: base.positionsWorldM.map((position, index) =>
      addVectors(position, scaleVector(derivative.positionRatesWorldMps[index], scale)),
    ),
    velocitiesWorldMps: base.velocitiesWorldMps.map((velocity, index) =>
      addVectors(velocity, scaleVector(derivative.velocityRatesWorldMps2[index], scale)),
    ),
    orientationsBodyToWorld: base.orientationsBodyToWorld.map((orientation, index) => {
      const rate = derivative.orientationRates[index];
      return orientation && rate
        ? addScaledQuaternion(orientation, rate, scale)
        : orientation;
    }),
    angularVelocitiesBodyRadS: base.angularVelocitiesBodyRadS.map((angularVelocity, index) => {
      const rate = derivative.angularVelocityRatesBodyRadS2[index];
      return angularVelocity && rate
        ? addVectors(angularVelocity, scaleVector(rate, scale))
        : angularVelocity;
    }),
    active: base.active,
  });
  const k2 = coupledGroupDerivativeAt(
    bodies,
    input,
    halfState(state, k1, stepS / 2, state.timeS + stepS / 2),
    mutualGravity,
    contact,
    relativeAero,
  );
  const k3 = coupledGroupDerivativeAt(
    bodies,
    input,
    halfState(state, k2, stepS / 2, state.timeS + stepS / 2),
    mutualGravity,
    contact,
    relativeAero,
  );
  const k4 = coupledGroupDerivativeAt(
    bodies,
    input,
    halfState(state, k3, stepS, state.timeS + stepS),
    mutualGravity,
    contact,
    relativeAero,
  );
  const weighted = (
    index: number,
    values: readonly Vector3[],
  ): Vector3 => scaleVector(
    addVectors(
      addVectors(values[index], scaleVector(k2.positionRatesWorldMps[index], 2)),
      addVectors(
        scaleVector(k3.positionRatesWorldMps[index], 2),
        k4.positionRatesWorldMps[index],
      ),
    ),
    1 / 6,
  );
  const weightedAcceleration = (index: number): Vector3 => scaleVector(
    addVectors(
      addVectors(
        k1.velocityRatesWorldMps2[index],
        scaleVector(k2.velocityRatesWorldMps2[index], 2),
      ),
      addVectors(
        scaleVector(k3.velocityRatesWorldMps2[index], 2),
        k4.velocityRatesWorldMps2[index],
      ),
    ),
    1 / 6,
  );
  const weightedQuaternionRate = (index: number): Quaternion | null => {
    const rates = [
      k1.orientationRates[index],
      k2.orientationRates[index],
      k3.orientationRates[index],
      k4.orientationRates[index],
    ];
    if (rates.some((rate) => !rate)) return null;
    return {
      w: (rates[0]!.w + 2 * rates[1]!.w + 2 * rates[2]!.w + rates[3]!.w) / 6,
      x: (rates[0]!.x + 2 * rates[1]!.x + 2 * rates[2]!.x + rates[3]!.x) / 6,
      y: (rates[0]!.y + 2 * rates[1]!.y + 2 * rates[2]!.y + rates[3]!.y) / 6,
      z: (rates[0]!.z + 2 * rates[1]!.z + 2 * rates[2]!.z + rates[3]!.z) / 6,
    };
  };
  const weightedAngularVelocityRate = (index: number): Vector3 | null => {
    const rates = [
      k1.angularVelocityRatesBodyRadS2[index],
      k2.angularVelocityRatesBodyRadS2[index],
      k3.angularVelocityRatesBodyRadS2[index],
      k4.angularVelocityRatesBodyRadS2[index],
    ];
    if (rates.some((rate) => !rate)) return null;
    return scaleVector(
      addVectors(
        addVectors(rates[0]!, scaleVector(rates[1]!, 2)),
        addVectors(scaleVector(rates[2]!, 2), rates[3]!),
      ),
      1 / 6,
    );
  };
  return {
    timeS: state.timeS + stepS,
    positionsWorldM: state.positionsWorldM.map((position, index) =>
      addVectors(position, scaleVector(weighted(index, k1.positionRatesWorldMps), stepS)),
    ),
    velocitiesWorldMps: state.velocitiesWorldMps.map((velocity, index) =>
      addVectors(velocity, scaleVector(weightedAcceleration(index), stepS)),
    ),
    orientationsBodyToWorld: state.orientationsBodyToWorld.map((orientation, index) => {
      const rate = weightedQuaternionRate(index);
      return orientation && rate
        ? addScaledQuaternion(orientation, rate, stepS)
        : orientation;
    }),
    angularVelocitiesBodyRadS: state.angularVelocitiesBodyRadS.map((angularVelocity, index) => {
      const rate = weightedAngularVelocityRate(index);
      return angularVelocity && rate
        ? addVectors(angularVelocity, scaleVector(rate, stepS))
        : angularVelocity;
    }),
    active: state.active,
  };
}

function adaptiveComponentError(
  fullValue: number,
  refinedValue: number,
  relativeTolerance: number,
  absoluteTolerance: number,
): number {
  const scale =
    absoluteTolerance +
    relativeTolerance * Math.max(Math.abs(fullValue), Math.abs(refinedValue));
  const error = Math.abs(refinedValue - fullValue) / 15 / scale;
  if (!Number.isFinite(error)) {
    throw new Error("coupled adaptive error estimate is non-finite");
  }
  return error;
}

function adaptiveVectorError(
  fullValue: Vector3,
  refinedValue: Vector3,
  relativeTolerance: number,
  absoluteTolerance: number,
): number {
  return Math.max(
    adaptiveComponentError(fullValue.x, refinedValue.x, relativeTolerance, absoluteTolerance),
    adaptiveComponentError(fullValue.y, refinedValue.y, relativeTolerance, absoluteTolerance),
    adaptiveComponentError(fullValue.z, refinedValue.z, relativeTolerance, absoluteTolerance),
  );
}

function adaptiveQuaternionError(
  fullValue: Quaternion,
  refinedValue: Quaternion,
  relativeTolerance: number,
  absoluteTolerance: number,
): number {
  const sign =
    fullValue.w * refinedValue.w +
      fullValue.x * refinedValue.x +
      fullValue.y * refinedValue.y +
      fullValue.z * refinedValue.z <
    0
      ? -1
      : 1;
  return Math.max(
    adaptiveComponentError(fullValue.w, sign * refinedValue.w, relativeTolerance, absoluteTolerance),
    adaptiveComponentError(fullValue.x, sign * refinedValue.x, relativeTolerance, absoluteTolerance),
    adaptiveComponentError(fullValue.y, sign * refinedValue.y, relativeTolerance, absoluteTolerance),
    adaptiveComponentError(fullValue.z, sign * refinedValue.z, relativeTolerance, absoluteTolerance),
  );
}

function adaptiveCoupledStateErrorNorm(
  fullStep: CoupledGroupState,
  refinedStep: CoupledGroupState,
  relativeTolerance: number,
  absoluteTolerance: number,
): number {
  let maximumError = 0;
  for (let index = 0; index < fullStep.positionsWorldM.length; index += 1) {
    if (!fullStep.active[index]) continue;
    maximumError = Math.max(
      maximumError,
      adaptiveVectorError(
        fullStep.positionsWorldM[index]!,
        refinedStep.positionsWorldM[index]!,
        relativeTolerance,
        absoluteTolerance,
      ),
      adaptiveVectorError(
        fullStep.velocitiesWorldMps[index]!,
        refinedStep.velocitiesWorldMps[index]!,
        relativeTolerance,
        absoluteTolerance,
      ),
    );
    const fullOrientation = fullStep.orientationsBodyToWorld[index];
    const refinedOrientation = refinedStep.orientationsBodyToWorld[index];
    if (fullOrientation || refinedOrientation) {
      if (!fullOrientation || !refinedOrientation) {
        throw new Error("coupled adaptive rigid-body orientation state is inconsistent");
      }
      maximumError = Math.max(
        maximumError,
        adaptiveQuaternionError(
          fullOrientation,
          refinedOrientation,
          relativeTolerance,
          absoluteTolerance,
        ),
      );
    }
    const fullAngularVelocity = fullStep.angularVelocitiesBodyRadS[index];
    const refinedAngularVelocity = refinedStep.angularVelocitiesBodyRadS[index];
    if (fullAngularVelocity || refinedAngularVelocity) {
      if (!fullAngularVelocity || !refinedAngularVelocity) {
        throw new Error("coupled adaptive angular-rate state is inconsistent");
      }
      maximumError = Math.max(
        maximumError,
        adaptiveVectorError(
          fullAngularVelocity,
          refinedAngularVelocity,
          relativeTolerance,
          absoluteTolerance,
        ),
      );
    }
  }
  return maximumError;
}

function integrateCoupledGroupAdaptive(
  bodies: readonly CoupledMultiBodyFlightBodyInput[],
  input: CoupledMultiBodyFlightInput,
  state: CoupledGroupState,
  durationS: number,
  mutualGravity: Required<CoupledMultiBodyGravityOptions>,
  contact: NormalizedContactOptions,
  relativeAero: NormalizedRelativeAeroForceFeedbackOptions,
  options: Required<AdaptiveRigidBodyIntegrationOptions>,
): CoupledAdaptiveStepResult {
  if (!Number.isFinite(durationS) || durationS <= 0) {
    throw new Error("coupled adaptive integration duration must be positive and finite");
  }
  const maximumStepS = Math.min(options.maximumStepS, durationS);
  if (options.minimumStepS > maximumStepS) {
    throw new Error("coupled adaptive minimum step cannot exceed the requested duration");
  }
  const timeTolerance = Number.EPSILON * Math.max(1, Math.abs(durationS)) * 16;
  let current: CoupledGroupState = state;
  let elapsedS = 0;
  let stepS = maximumStepS;
  let acceptedStepCount = 0;
  let rejectedStepCount = 0;
  let maximumNormalizedError = 0;
  let minimumAcceptedStepS = Number.POSITIVE_INFINITY;
  let maximumAcceptedStepS = 0;
  let attempts = 0;
  const maximumInternalAttempts = 1_000_000;
  while (elapsedS < durationS - timeTolerance) {
    attempts += 1;
    if (attempts > maximumInternalAttempts) {
      throw new Error("coupled adaptive integration exceeded the internal step-attempt limit");
    }
    const remainingS = durationS - elapsedS;
    const candidateStepS = Math.min(stepS, remainingS);
    const fullStep = integrateCoupledGroupRungeKutta4(
      bodies,
      input,
      current,
      candidateStepS,
      mutualGravity,
      contact,
      relativeAero,
    );
    const halfStep = integrateCoupledGroupRungeKutta4(
      bodies,
      input,
      current,
      candidateStepS / 2,
      mutualGravity,
      contact,
      relativeAero,
    );
    const refinedStep = integrateCoupledGroupRungeKutta4(
      bodies,
      input,
      halfStep,
      candidateStepS / 2,
      mutualGravity,
      contact,
      relativeAero,
    );
    const normalizedError = adaptiveCoupledStateErrorNorm(
      fullStep,
      refinedStep,
      options.relativeTolerance,
      options.absoluteTolerance,
    );
    const minimumStepBoundary = options.minimumStepS * (1 + Number.EPSILON * 32);
    if (normalizedError <= 1) {
      maximumNormalizedError = Math.max(maximumNormalizedError, normalizedError);
      current = {
        ...refinedStep,
        timeS: state.timeS + elapsedS + candidateStepS,
      };
      elapsedS += candidateStepS;
      acceptedStepCount += 1;
      minimumAcceptedStepS = Math.min(minimumAcceptedStepS, candidateStepS);
      maximumAcceptedStepS = Math.max(maximumAcceptedStepS, candidateStepS);
      const growth = normalizedError === 0
        ? 2.5
        : Math.min(2.5, Math.max(0.2, options.safetyFactor * normalizedError ** -0.2));
      stepS = Math.min(
        maximumStepS,
        Math.max(options.minimumStepS, candidateStepS * growth),
      );
      continue;
    }
    if (candidateStepS <= minimumStepBoundary) {
      throw new Error(
        `coupled adaptive integration reached its minimum step (${options.minimumStepS} s) before meeting the requested tolerance`,
      );
    }
    rejectedStepCount += 1;
    const reduction = Math.min(
      0.5,
      Math.max(0.1, options.safetyFactor * normalizedError ** -0.2),
    );
    stepS = Math.max(options.minimumStepS, candidateStepS * reduction);
  }
  return {
    state: { ...current, timeS: state.timeS + durationS },
    acceptedStepCount,
    rejectedStepCount,
    maximumNormalizedError,
    minimumAcceptedStepS,
    maximumAcceptedStepS,
  };
}

function recordCoupledAcceptedSteps(
  diagnostics: MutableCoupledIntegrationDiagnostics,
  acceptedStepCount: number,
  rejectedStepCount: number,
  maximumNormalizedError: number | null,
  minimumAcceptedStepS: number,
  maximumAcceptedStepS: number,
): void {
  diagnostics.acceptedStepCount += acceptedStepCount;
  diagnostics.rejectedStepCount += rejectedStepCount;
  if (maximumNormalizedError !== null) {
    diagnostics.maximumNormalizedError = Math.max(
      diagnostics.maximumNormalizedError,
      maximumNormalizedError,
    );
  }
  diagnostics.minimumAcceptedStepS = Math.min(
    diagnostics.minimumAcceptedStepS,
    minimumAcceptedStepS,
  );
  diagnostics.maximumAcceptedStepS = Math.max(
    diagnostics.maximumAcceptedStepS,
    maximumAcceptedStepS,
  );
}

function integrateCoupledGroupInterval(
  bodies: readonly CoupledMultiBodyFlightBodyInput[],
  input: CoupledMultiBodyFlightInput,
  state: CoupledGroupState,
  durationS: number,
  mutualGravity: Required<CoupledMultiBodyGravityOptions>,
  contact: NormalizedContactOptions,
  relativeAero: NormalizedRelativeAeroForceFeedbackOptions,
  integration: CoupledIntegrationConfig,
  diagnostics: MutableCoupledIntegrationDiagnostics,
): CoupledGroupState {
  if (durationS <= 0) return state;
  if (integration.method === "fixed-rk4") {
    const nextState = integrateCoupledGroupRungeKutta4(
      bodies,
      input,
      state,
      durationS,
      mutualGravity,
      contact,
      relativeAero,
    );
    recordCoupledAcceptedSteps(
      diagnostics,
      1,
      0,
      null,
      durationS,
      durationS,
    );
    return nextState;
  }
  const adaptiveStep = integrateCoupledGroupAdaptive(
    bodies,
    input,
    state,
    durationS,
    mutualGravity,
    contact,
    relativeAero,
    integration.adaptive!,
  );
  recordCoupledAcceptedSteps(
    diagnostics,
    adaptiveStep.acceptedStepCount,
    adaptiveStep.rejectedStepCount,
    adaptiveStep.maximumNormalizedError,
    adaptiveStep.minimumAcceptedStepS,
    adaptiveStep.maximumAcceptedStepS,
  );
  return adaptiveStep.state;
}

function derivativeAt(
  body: CoupledMultiBodyFlightBodyInput,
  input: CoupledMultiBodyFlightInput,
  timeS: number,
  positionWorldM: Vector3,
  velocityWorldMps: Vector3,
): Derivative {
  return {
    positionRateWorldMps: velocityWorldMps,
    velocityRateWorldMps2: accelerationAt(body, input, timeS, positionWorldM, velocityWorldMps),
  };
}

function integrateRungeKutta4(
  body: CoupledMultiBodyFlightBodyInput,
  input: CoupledMultiBodyFlightInput,
  state: PointState,
  stepS: number,
): PointState {
  const k1 = derivativeAt(body, input, state.timeS, state.positionWorldM, state.velocityWorldMps);
  const k2 = derivativeAt(
    body,
    input,
    state.timeS + stepS / 2,
    addVectors(state.positionWorldM, scaleVector(k1.positionRateWorldMps, stepS / 2)),
    addVectors(state.velocityWorldMps, scaleVector(k1.velocityRateWorldMps2, stepS / 2)),
  );
  const k3 = derivativeAt(
    body,
    input,
    state.timeS + stepS / 2,
    addVectors(state.positionWorldM, scaleVector(k2.positionRateWorldMps, stepS / 2)),
    addVectors(state.velocityWorldMps, scaleVector(k2.velocityRateWorldMps2, stepS / 2)),
  );
  const k4 = derivativeAt(
    body,
    input,
    state.timeS + stepS,
    addVectors(state.positionWorldM, scaleVector(k3.positionRateWorldMps, stepS)),
    addVectors(state.velocityWorldMps, scaleVector(k3.velocityRateWorldMps2, stepS)),
  );
  const weightedPositionRate = scaleVector(
    addVectors(
      addVectors(k1.positionRateWorldMps, scaleVector(k2.positionRateWorldMps, 2)),
      addVectors(scaleVector(k3.positionRateWorldMps, 2), k4.positionRateWorldMps),
    ),
    1 / 6,
  );
  const weightedVelocityRate = scaleVector(
    addVectors(
      addVectors(k1.velocityRateWorldMps2, scaleVector(k2.velocityRateWorldMps2, 2)),
      addVectors(scaleVector(k3.velocityRateWorldMps2, 2), k4.velocityRateWorldMps2),
    ),
    1 / 6,
  );
  return {
    timeS: state.timeS + stepS,
    positionWorldM: addVectors(state.positionWorldM, scaleVector(weightedPositionRate, stepS)),
    velocityWorldMps: addVectors(state.velocityWorldMps, scaleVector(weightedVelocityRate, stepS)),
  };
}

function tracePoint(
  body: CoupledMultiBodyFlightBodyInput,
  input: CoupledMultiBodyFlightInput,
  state: PointState,
): CoupledMultiBodyTracePoint {
  return {
    timeS: state.timeS,
    altitudeAglM: state.positionWorldM.z,
    speedMps: magnitude(state.velocityWorldMps),
    positionWorldM: state.positionWorldM,
    velocityWorldMps: state.velocityWorldMps,
    accelerationWorldMps2: accelerationAt(
      body,
      input,
      state.timeS,
      state.positionWorldM,
      state.velocityWorldMps,
    ),
  };
}

function tracePointWithAcceleration(
  body: CoupledMultiBodyFlightBodyInput,
  input: CoupledMultiBodyFlightInput,
  state: PointState,
  accelerationWorldMps2: Vector3,
  orientationBodyToWorld?: Quaternion,
  angularVelocityBodyRadS?: Vector3,
  contactDiagnostics?: Readonly<{
    forceWorldN: Vector3;
    penetrationM: number;
    pairCount: number;
  }>,
  relativeAeroDiagnostics?: Readonly<{
    relativeAirVelocityWorldMps: Vector3;
    deficitFraction: number | null;
    sourceCount: number;
  }>,
): CoupledMultiBodyTracePoint {
  const aerodynamic = evaluateCoupledBodyAerodynamics(
    body,
    input,
    state.timeS,
    state.positionWorldM,
    state.velocityWorldMps,
    orientationBodyToWorld,
    angularVelocityBodyRadS ?? ZERO_VECTOR,
    relativeAeroDiagnostics?.relativeAirVelocityWorldMps,
  );
  const aerodynamicTelemetry = aerodynamic
    ? {
        relativeAirSpeedMps: aerodynamic.relativeAirSpeedMps,
        dynamicPressurePa: aerodynamic.dynamicPressurePa,
        ...(aerodynamic.attitudeIncidenceRad !== null
          ? { attitudeIncidenceRad: aerodynamic.attitudeIncidenceRad }
          : {}),
        effectiveReferenceAreaM2: aerodynamic.effectiveReferenceAreaM2,
        effectiveDragCoefficient: aerodynamic.effectiveDragCoefficient,
        aerodynamicDragN: aerodynamic.dragN,
        aerodynamicDragModelVersion: aerodynamic.modelVersion,
        aerodynamicModelVersion: aerodynamic.modelVersion,
        ...(aerodynamic.angleOfAttackRad !== null
          ? {
              aerodynamicAngleOfAttackRad: aerodynamic.angleOfAttackRad,
              aerodynamicSideslipRad: aerodynamic.sideslipRad!,
              aerodynamicNormalForceN: aerodynamic.normalForceN!,
              aerodynamicNormalForceApplied: aerodynamic.normalForceApplied!,
              aerodynamicStaticMomentBodyNm: aerodynamic.staticMomentBodyNm,
              aerodynamicDampingMomentBodyNm: aerodynamic.dampingMomentBodyNm,
              ...(aerodynamic.reynoldsNumber !== null
                ? { aerodynamicReynoldsNumber: aerodynamic.reynoldsNumber }
                : {}),
              aerodynamicCoefficientBasis: aerodynamic.coefficientBasis,
              aerodynamicDirectForceApplied: aerodynamic.directForceApplied,
              aerodynamicDirectMomentApplied: aerodynamic.directMomentApplied,
              ...(aerodynamic.coefficientTableModelVersion
                ? { aerodynamicCoefficientTableModelVersion: aerodynamic.coefficientTableModelVersion }
                : {}),
              aerodynamicCoefficientApplicabilityCount: aerodynamic.coefficientApplicabilityCount,
            }
          : {}),
      }
    : {};
  return {
    timeS: state.timeS,
    altitudeAglM: state.positionWorldM.z,
    speedMps: magnitude(state.velocityWorldMps),
    positionWorldM: state.positionWorldM,
    velocityWorldMps: state.velocityWorldMps,
    accelerationWorldMps2,
    ...aerodynamicTelemetry,
    ...(relativeAeroDiagnostics
      ? {
          relativeAirSpeedMps: magnitude(relativeAeroDiagnostics.relativeAirVelocityWorldMps),
          ...(relativeAeroDiagnostics.deficitFraction !== null
            ? { relativeWakeDeficitFraction: relativeAeroDiagnostics.deficitFraction }
            : {}),
          relativeWakeSourceCount: relativeAeroDiagnostics.sourceCount,
        }
      : {}),
    ...(contactDiagnostics
      ? {
          contactForceWorldN: contactDiagnostics.forceWorldN,
          contactForceN: magnitude(contactDiagnostics.forceWorldN),
          contactPenetrationM: contactDiagnostics.penetrationM,
          contactPairCount: contactDiagnostics.pairCount,
        }
      : {}),
    ...(orientationBodyToWorld ? { orientationBodyToWorld } : {}),
    ...(angularVelocityBodyRadS ? { angularVelocityBodyRadS } : {}),
  };
}

function createMissionTimeGrid(
  startTimeS: number,
  endTimeS: number,
  timeStepS: number,
  exactTimes: readonly number[] = [],
): number[] {
  const grid: number[] = [startTimeS];
  while (grid.at(-1)! < endTimeS - TIME_TOLERANCE_S) {
    grid.push(Math.min(endTimeS, grid.at(-1)! + timeStepS));
  }
  const merged = [...grid, ...exactTimes.filter((time) =>
    time > startTimeS + TIME_TOLERANCE_S && time < endTimeS - TIME_TOLERANCE_S,
  )].sort((left, right) => left - right);
  return merged.filter((time, index) =>
    index === 0 || Math.abs(time - merged[index - 1]) > TIME_TOLERANCE_S,
  );
}

function trajectoryFromTrace(
  body: CoupledMultiBodyFlightBodyInput,
  trace: readonly CoupledMultiBodyTracePoint[],
  impactTimeS: number | null,
): CoupledMultiBodyFlightTrajectory {
  const adjustment = body.velocityAdjustment?.deltaVWorldMps ?? ZERO_VECTOR;
  return {
    id: body.id,
    label: body.label ?? body.id,
    massKg: body.massKg,
    releaseTimeS: body.releaseTimeS,
    releasePositionWorldM: body.releasePositionWorldM,
    releaseVelocityWorldMps: addVectors(body.releaseVelocityWorldMps, adjustment),
    baselineReleaseVelocityWorldMps: body.releaseVelocityWorldMps,
    velocityAdjustmentWorldMps: adjustment,
    trace,
    maxAltitudeAglM: Math.max(...trace.map((point) => point.altitudeAglM)),
    maxSpeedMps: Math.max(...trace.map((point) => point.speedMps)),
    impactTimeS,
    ...(body.referenceAreaM2 !== undefined && body.dragCoefficient !== undefined
      ? { referenceAreaM2: body.referenceAreaM2, dragCoefficient: body.dragCoefficient }
      : {}),
    ...(body.attitudeDependentDrag
      ? { attitudeDependentDrag: body.attitudeDependentDrag }
      : {}),
    ...(body.aerodynamicBasis
      ? { aerodynamicBasis: body.aerodynamicBasis }
      : {}),
    ...(body.envelopeRadiusM !== undefined ? { envelopeRadiusM: body.envelopeRadiusM } : {}),
    rigidBody: body.rigidBody
      ? {
          enabled: true,
          initialOrientationBodyToWorld: normalizeQuaternion(
            body.rigidBody.orientationBodyToWorld,
          ),
          initialAngularVelocityBodyRadS:
            body.rigidBody.angularVelocityBodyRadS ?? ZERO_VECTOR,
        }
      : null,
  };
}

function propagateBody(
  body: CoupledMultiBodyFlightBodyInput,
  input: CoupledMultiBodyFlightInput,
  grid: readonly number[],
  integrationStepS: number,
): CoupledMultiBodyFlightTrajectory {
  const adjustment = body.velocityAdjustment?.deltaVWorldMps ?? ZERO_VECTOR;
  const baselineVelocityWorldMps = body.releaseVelocityWorldMps;
  const releaseVelocityWorldMps = addVectors(baselineVelocityWorldMps, adjustment);
  let state: PointState | null = null;
  let impactTimeS: number | null = null;
  const trace: CoupledMultiBodyTracePoint[] = [];
  const appendTrace = (point: CoupledMultiBodyTracePoint): void => {
    const previous = trace.at(-1);
    if (previous && Math.abs(previous.timeS - point.timeS) <= TIME_TOLERANCE_S) {
      trace[trace.length - 1] = point;
    } else {
      trace.push(point);
    }
  };

  for (const targetTimeS of grid) {
    if (targetTimeS < body.releaseTimeS - TIME_TOLERANCE_S) continue;
    if (!state) {
      state = {
        timeS: body.releaseTimeS,
        positionWorldM: body.releasePositionWorldM,
        velocityWorldMps: releaseVelocityWorldMps,
      };
      appendTrace(tracePoint(body, input, state));
      if (state.positionWorldM.z <= 0 && state.velocityWorldMps.z <= 0) {
        impactTimeS = state.timeS;
        break;
      }
    }
    while (state.timeS < targetTimeS - TIME_TOLERANCE_S && impactTimeS === null) {
      const stepS = Math.min(integrationStepS, targetTimeS - state.timeS);
      const previousState: PointState = state;
      const nextState = integrateRungeKutta4(body, input, state, stepS);
      if (previousState.positionWorldM.z > 0 && nextState.positionWorldM.z <= 0) {
        const fraction = Math.min(
          1,
          Math.max(
            0,
            previousState.positionWorldM.z /
              (previousState.positionWorldM.z - nextState.positionWorldM.z),
          ),
        );
        state = {
          timeS: previousState.timeS + fraction * stepS,
          positionWorldM: interpolateVector(
            previousState.positionWorldM,
            nextState.positionWorldM,
            fraction,
          ),
          velocityWorldMps: interpolateVector(
            previousState.velocityWorldMps,
            nextState.velocityWorldMps,
            fraction,
          ),
        };
        appendTrace(tracePoint(body, input, state));
        impactTimeS = state.timeS;
        break;
      }
      state = nextState;
    }
    if (state && impactTimeS === null) appendTrace(tracePoint(body, input, state));
    if (impactTimeS !== null) break;
  }

  if (trace.length === 0) {
    throw new Error(`coupled-flight body ${body.id} did not overlap the mission time grid`);
  }
  return trajectoryFromTrace(body, trace, impactTimeS);
}

function propagateCoupledBodies(
  bodies: readonly CoupledMultiBodyFlightBodyInput[],
  input: CoupledMultiBodyFlightInput,
  grid: readonly number[],
  integrationStepS: number,
  mutualGravity: Required<CoupledMultiBodyGravityOptions>,
  contact: NormalizedContactOptions,
  relativeAero: NormalizedRelativeAeroForceFeedbackOptions,
  integration: CoupledIntegrationConfig,
  diagnostics: MutableCoupledIntegrationDiagnostics,
): CoupledMultiBodyFlightTrajectory[] {
  const traces: CoupledMultiBodyTracePoint[][] = bodies.map(() => []);
  const impactTimes: (number | null)[] = bodies.map(() => null);
  const released = bodies.map(() => false);
  const active = bodies.map(() => false);
  const positionsWorldM = bodies.map((body) => body.releasePositionWorldM);
  const velocitiesWorldMps = bodies.map((body) =>
    addVectors(body.releaseVelocityWorldMps, body.velocityAdjustment?.deltaVWorldMps ?? ZERO_VECTOR),
  );
  const orientationsBodyToWorld = bodies.map((body) =>
    body.rigidBody
      ? normalizeQuaternion(body.rigidBody.orientationBodyToWorld)
      : null,
  );
  const angularVelocitiesBodyRadS = bodies.map((body) =>
    body.rigidBody?.angularVelocityBodyRadS ?? (body.rigidBody ? ZERO_VECTOR : null),
  );
  let state: CoupledGroupState = {
    timeS: grid[0]!,
    positionsWorldM,
    velocitiesWorldMps,
    orientationsBodyToWorld,
    angularVelocitiesBodyRadS,
    active,
  };
  const appendTrace = (index: number, point: CoupledMultiBodyTracePoint): void => {
    const previous = traces[index].at(-1);
    if (previous && Math.abs(previous.timeS - point.timeS) <= TIME_TOLERANCE_S) {
      traces[index][traces[index].length - 1] = point;
    } else {
      traces[index].push(point);
    }
  };
  const releaseBodiesAtCurrentTime = (): void => {
    const newlyReleased: number[] = [];
    for (let index = 0; index < bodies.length; index += 1) {
      if (released[index] || bodies[index].releaseTimeS > state.timeS + TIME_TOLERANCE_S) {
        continue;
      }
      released[index] = true;
      const body = bodies[index]!;
      state.positionsWorldM[index] = body.releasePositionWorldM;
      state.velocitiesWorldMps[index] = velocitiesWorldMps[index];
      state.orientationsBodyToWorld[index] = body.rigidBody
        ? normalizeQuaternion(body.rigidBody.orientationBodyToWorld)
        : null;
      state.angularVelocitiesBodyRadS[index] = body.rigidBody
        ? body.rigidBody.angularVelocityBodyRadS ?? ZERO_VECTOR
        : null;
      state.active[index] = true;
      newlyReleased.push(index);
    }
    for (const index of newlyReleased) {
      const initialDerivative = coupledGroupDerivativeAt(
        bodies,
        input,
        state,
        mutualGravity,
        contact,
        relativeAero,
      );
      appendTrace(index, tracePointWithAcceleration(
        bodies[index],
        input,
        {
          timeS: state.timeS,
          positionWorldM: state.positionsWorldM[index],
          velocityWorldMps: state.velocitiesWorldMps[index],
        },
        initialDerivative.accelerationsWorldMps2[index]!,
        state.orientationsBodyToWorld[index] ?? undefined,
        state.angularVelocitiesBodyRadS[index] ?? undefined,
        contact.enabled
          ? {
              forceWorldN: initialDerivative.contactForceWorldNs[index]!,
              penetrationM: initialDerivative.contactPenetrationsM[index]!,
              pairCount: initialDerivative.contactPairCounts[index]!,
            }
          : undefined,
        relativeAero.enabled && initialDerivative.relativeAirVelocityWorldMps[index]
          ? {
              relativeAirVelocityWorldMps: initialDerivative.relativeAirVelocityWorldMps[index]!,
              deficitFraction: initialDerivative.relativeWakeDeficitFractions[index]!,
              sourceCount: initialDerivative.relativeWakeSourceCounts[index]!,
            }
          : undefined,
      ));
      if (
        state.positionsWorldM[index].z <= 0 &&
        state.velocitiesWorldMps[index].z <= 0
      ) {
        state.active[index] = false;
        impactTimes[index] = state.timeS;
      }
    }
  };

  for (const targetTimeS of grid) {
    releaseBodiesAtCurrentTime();
    while (state.timeS < targetTimeS - TIME_TOLERANCE_S) {
      const stepS = Math.min(integrationStepS, targetTimeS - state.timeS);
      const previousState = state;
      const nextState = integrateCoupledGroupInterval(
        bodies,
        input,
        previousState,
        stepS,
        mutualGravity,
        contact,
        relativeAero,
        integration,
        diagnostics,
      );
      const nextActive = [...nextState.active];
      for (let index = 0; index < bodies.length; index += 1) {
        if (!previousState.active[index] || impactTimes[index] !== null) continue;
        const previousPosition = previousState.positionsWorldM[index];
        const nextPosition = nextState.positionsWorldM[index];
        if (previousPosition.z > 0 && nextPosition.z <= 0) {
          const fraction = Math.min(
            1,
            Math.max(
              0,
              previousPosition.z / (previousPosition.z - nextPosition.z),
            ),
          );
          const impactState: PointState = {
            timeS: previousState.timeS + fraction * stepS,
            positionWorldM: interpolateVector(
              previousPosition,
              nextPosition,
              fraction,
            ),
            velocityWorldMps: interpolateVector(
              previousState.velocitiesWorldMps[index],
              nextState.velocitiesWorldMps[index],
              fraction,
            ),
          };
          const impactOrientation =
            previousState.orientationsBodyToWorld[index] &&
            nextState.orientationsBodyToWorld[index]
              ? interpolateQuaternion(
                  previousState.orientationsBodyToWorld[index]!,
                  nextState.orientationsBodyToWorld[index]!,
                  fraction,
                )
              : null;
          const impactAngularVelocity =
            previousState.angularVelocitiesBodyRadS[index] &&
            nextState.angularVelocitiesBodyRadS[index]
              ? interpolateVector(
                  previousState.angularVelocitiesBodyRadS[index]!,
                  nextState.angularVelocitiesBodyRadS[index]!,
                  fraction,
                )
              : null;
          const impactGroupState: CoupledGroupState = {
            timeS: impactState.timeS,
            positionsWorldM: nextState.positionsWorldM.map((position, candidateIndex) =>
              candidateIndex === index ? impactState.positionWorldM : position,
            ),
            velocitiesWorldMps: nextState.velocitiesWorldMps.map((velocity, candidateIndex) =>
              candidateIndex === index ? impactState.velocityWorldMps : velocity,
            ),
            orientationsBodyToWorld: nextState.orientationsBodyToWorld.map((orientation, candidateIndex) =>
              candidateIndex === index ? impactOrientation : orientation,
            ),
            angularVelocitiesBodyRadS: nextState.angularVelocitiesBodyRadS.map((angularVelocity, candidateIndex) =>
              candidateIndex === index ? impactAngularVelocity : angularVelocity,
            ),
            active: previousState.active,
          };
          const impactDerivative = coupledGroupDerivativeAt(
            bodies,
            input,
            impactGroupState,
            mutualGravity,
            contact,
            relativeAero,
          );
          appendTrace(
            index,
            tracePointWithAcceleration(
              bodies[index],
              input,
              impactState,
              impactDerivative.accelerationsWorldMps2[index]!,
              impactOrientation ?? undefined,
              impactAngularVelocity ?? undefined,
              contact.enabled
                ? {
                    forceWorldN: impactDerivative.contactForceWorldNs[index]!,
                    penetrationM: impactDerivative.contactPenetrationsM[index]!,
                    pairCount: impactDerivative.contactPairCounts[index]!,
                  }
                : undefined,
              relativeAero.enabled && impactDerivative.relativeAirVelocityWorldMps[index]
                ? {
                    relativeAirVelocityWorldMps: impactDerivative.relativeAirVelocityWorldMps[index]!,
                    deficitFraction: impactDerivative.relativeWakeDeficitFractions[index]!,
                    sourceCount: impactDerivative.relativeWakeSourceCounts[index]!,
                  }
                : undefined,
            ),
          );
          impactTimes[index] = impactState.timeS;
          nextState.positionsWorldM[index] = impactState.positionWorldM;
          nextState.velocitiesWorldMps[index] = impactState.velocityWorldMps;
          nextActive[index] = false;
        }
      }
      state = {
        timeS: nextState.timeS,
        positionsWorldM: nextState.positionsWorldM,
        velocitiesWorldMps: nextState.velocitiesWorldMps,
        orientationsBodyToWorld: nextState.orientationsBodyToWorld,
        angularVelocitiesBodyRadS: nextState.angularVelocitiesBodyRadS,
        active: nextActive,
      };
    }
    for (let index = 0; index < bodies.length; index += 1) {
      if (state.active[index]) {
        const derivative = coupledGroupDerivativeAt(
          bodies,
          input,
          state,
          mutualGravity,
          contact,
          relativeAero,
        );
        appendTrace(index, tracePointWithAcceleration(
          bodies[index],
          input,
          {
            timeS: state.timeS,
            positionWorldM: state.positionsWorldM[index],
            velocityWorldMps: state.velocitiesWorldMps[index],
          },
          derivative.accelerationsWorldMps2[index]!,
          state.orientationsBodyToWorld[index] ?? undefined,
          state.angularVelocitiesBodyRadS[index] ?? undefined,
          contact.enabled
            ? {
                forceWorldN: derivative.contactForceWorldNs[index]!,
                penetrationM: derivative.contactPenetrationsM[index]!,
                pairCount: derivative.contactPairCounts[index]!,
              }
            : undefined,
          relativeAero.enabled && derivative.relativeAirVelocityWorldMps[index]
            ? {
                relativeAirVelocityWorldMps: derivative.relativeAirVelocityWorldMps[index]!,
                deficitFraction: derivative.relativeWakeDeficitFractions[index]!,
                sourceCount: derivative.relativeWakeSourceCounts[index]!,
              }
            : undefined,
        ));
      }
    }
  }
  return bodies.map((body, index) => trajectoryFromTrace(
    body,
    traces[index],
    impactTimes[index],
  ));
}

/**
 * Propagates all released bodies on one shared mission-time grid.
 *
 * The coupling here is explicit and bounded: bodies share the same
 * environment provider and time grid, while pairwise relative motion is
 * evaluated from the resulting traces. An opt-in envelope contact force may
 * act only between active released bodies with supplied positive radii.
 */
export function simulateCoupledMultiBodyFlight(
  input: CoupledMultiBodyFlightInput,
): CoupledMultiBodyFlightResult {
  if (input.bodies.length === 0) {
    throw new Error("coupled multi-body flight requires at least one body");
  }
  if (!Number.isFinite(input.durationS) || input.durationS <= 0) {
    throw new Error("coupled multi-body flight duration must be positive and finite");
  }
  assertPositiveFinite(input.timeStepS, "coupled multi-body flight time step");
  const maximumSteps = input.maximumSteps ?? DEFAULT_MAXIMUM_STEPS;
  if (!Number.isInteger(maximumSteps) || maximumSteps < 2) {
    throw new Error("coupled multi-body flight maximum steps must be an integer >= 2");
  }
  const integrationMethod = input.integration?.method ?? "fixed-rk4";
  if (
    integrationMethod !== "fixed-rk4" &&
    integrationMethod !== "adaptive-rk4-step-doubling"
  ) {
    throw new Error("coupled integration method must be fixed-rk4 or adaptive-rk4-step-doubling");
  }
  const adaptiveIntegrationOptions = integrationMethod === "adaptive-rk4-step-doubling"
    ? validateCoupledAdaptiveOptions(
        input.durationS,
        {
          ...(input.integration?.adaptive ?? {}),
          maximumStepS: input.integration?.adaptive?.maximumStepS ?? input.timeStepS,
        },
      )
    : undefined;
  const integration: CoupledIntegrationConfig = {
    method: integrationMethod,
    ...(adaptiveIntegrationOptions ? { adaptive: adaptiveIntegrationOptions } : {}),
  };
  const mutualGravity = normalizeMutualGravityOptions(input.mutualGravity);
  const contact = normalizeContactOptions(input.contact);
  const relativeAero = normalizeRelativeAeroForceFeedbackOptions(input.relativeAeroForceFeedback);
  const ids = new Set<string>();
  input.bodies.forEach((body) => {
    validateBody(body);
    if (ids.has(body.id)) throw new Error(`coupled-flight body id ${body.id} is duplicated`);
    ids.add(body.id);
    if (body.releaseTimeS > input.durationS + TIME_TOLERANCE_S) {
      throw new Error(`coupled-flight body ${body.id} releases after mission end`);
    }
  });
  const rigidBodyCount = input.bodies.filter((body) => body.rigidBody !== undefined).length;
  const attitudeDependentDragBodyCount = input.bodies.filter(
    (body) => body.attitudeDependentDrag !== undefined && body.aerodynamicBasis === undefined,
  ).length;
  const aerodynamicBodyCount = input.bodies.filter(
    (body) => body.aerodynamicBasis !== undefined,
  ).length;
  const startTimeS = Math.min(...input.bodies.map((body) => body.releaseTimeS));
  const nominalStepCount = Math.ceil((input.durationS - startTimeS) / input.timeStepS);
  const budgetAdjusted = nominalStepCount > maximumSteps - 1;
  let effectiveTimeStepS = nominalStepCount > 0
    ? Math.min(input.timeStepS, (input.durationS - startTimeS) / Math.max(Math.min(nominalStepCount, maximumSteps - 1), 1))
    : input.timeStepS;
  let grid: number[];
  if (
    mutualGravity.enabled ||
    contact.enabled ||
    relativeAero.enabled ||
    rigidBodyCount > 0 ||
    integrationMethod === "adaptive-rk4-step-doubling"
  ) {
    const requestedGrid = createMissionTimeGrid(
      startTimeS,
      input.durationS,
      input.timeStepS,
      input.bodies.map((body) => body.releaseTimeS),
    );
    if (requestedGrid.length - 1 > maximumSteps - 1) {
      throw new Error(
        `coupled multi-body grid exceeds the maximum step budget (${maximumSteps}); increase maximumSteps or timeStepS`,
      );
    }
    effectiveTimeStepS = input.timeStepS;
    grid = requestedGrid;
  } else {
    const gridStepCount = Math.min(nominalStepCount, maximumSteps - 1);
    effectiveTimeStepS = nominalStepCount > 0
      ? Math.min(input.timeStepS, (input.durationS - startTimeS) / Math.max(gridStepCount, 1))
      : input.timeStepS;
    grid = createMissionTimeGrid(startTimeS, input.durationS, effectiveTimeStepS);
  }
  const integrationDiagnostics: MutableCoupledIntegrationDiagnostics = {
    method: integrationMethod,
    acceptedStepCount: 0,
    rejectedStepCount: 0,
    maximumNormalizedError: 0,
    minimumAcceptedStepS: Number.POSITIVE_INFINITY,
    maximumAcceptedStepS: 0,
  };
  const usesCoupledGroup =
    mutualGravity.enabled ||
    contact.enabled ||
    relativeAero.enabled ||
    rigidBodyCount > 0 ||
    integrationMethod === "adaptive-rk4-step-doubling";
  const trajectories = usesCoupledGroup
    ? propagateCoupledBodies(
        input.bodies,
        input,
        grid,
        effectiveTimeStepS,
        mutualGravity,
        contact,
        relativeAero,
        integration,
        integrationDiagnostics,
      )
    : input.bodies.map((body) =>
        propagateBody(body, input, grid, effectiveTimeStepS),
      );
  if (!usesCoupledGroup) {
    recordCoupledAcceptedSteps(
      integrationDiagnostics,
      Math.max(grid.length - 1, 0),
      0,
      null,
      effectiveTimeStepS,
      effectiveTimeStepS,
    );
  }
  const pairwise: MultiBodySeparationResult | null = trajectories.length > 1
    ? analyzeMultiBodySeparation({
        bodies: trajectories.map((trajectory) => ({
          id: trajectory.id,
          label: trajectory.label,
          releaseTimeS: trajectory.releaseTimeS,
          trace: trajectory.trace.map((point): SeparationClearanceTracePoint => ({
            timeS: point.timeS,
            positionWorldM: point.positionWorldM,
            velocityWorldMps: point.velocityWorldMps,
          })),
        })),
      })
    : null;
  const contactTraceSamples = trajectories.flatMap((trajectory) =>
    trajectory.trace.filter((point) => (point.contactPairCount ?? 0) > 0),
  );
  const contactMaximumPenetrationM = contactTraceSamples.length > 0
    ? Math.max(...contactTraceSamples.map((point) => point.contactPenetrationM ?? 0))
    : null;
  const contactMaximumNormalForceN = contactTraceSamples.length > 0
    ? Math.max(...contactTraceSamples.map((point) => point.contactForceN ?? 0))
    : null;
  const contactPairCount = contactTraceSamples.length > 0
    ? Math.max(...contactTraceSamples.map((point) => point.contactPairCount ?? 0))
    : 0;
  const relativeAeroTraceSamples = trajectories.flatMap((trajectory) =>
    trajectory.trace.filter((point) => (point.relativeWakeSourceCount ?? 0) > 0),
  );
  const relativeAeroMaximumObservedVelocityDeficitFraction = relativeAeroTraceSamples.length > 0
    ? Math.max(...relativeAeroTraceSamples.map((point) => point.relativeWakeDeficitFraction ?? 0))
    : null;
  const relativeAeroAffectedBodyCount = trajectories.filter((trajectory) =>
    trajectory.trace.some((point) => (point.relativeWakeSourceCount ?? 0) > 0),
  ).length;
  const warnings = [
    "All released bodies were propagated simultaneously on a shared mission-time grid with a common environment provider.",
    relativeAero.enabled
      ? "The opt-in wake feedback path adjusts each eligible target's environment-relative flow using a bounded source-wake proxy; contact, collision response, plume interaction, unsteady interference, and validated proximity-load data remain outside the shared track."
      : contact.enabled
        ? "The opt-in spherical-envelope contact solver applies equal-and-opposite normal penalty forces between active released bodies with positive envelope radii; retained-vehicle contact, friction, rotation from off-centre contact, plume interaction, and aerodynamic interference remain outside the shared track."
        : mutualGravity.enabled
          ? "Mutual point-mass gravity was included between active released bodies; contact forces, collision response, plume interaction, and aerodynamic interference remain outside the model."
          : "The shared-grid coupling evaluates relative motion together but does not synthesize contact forces, collision response, plume interaction, or aerodynamic interference.",
    ...(rigidBodyCount > 0
      ? [`${rigidBodyCount} released bod${rigidBodyCount === 1 ? "y" : "ies"} used the opt-in rigid-body attitude state; supplied external loads were evaluated in the body/world frames.`]
      : []),
    ...(attitudeDependentDragBodyCount > 0
      ? [`${attitudeDependentDragBodyCount} released bod${attitudeDependentDragBodyCount === 1 ? "y" : "ies"} used the opt-in projected-area attitude drag model; the trace retains incidence, effective area, and Cd diagnostics.`]
      : []),
    ...(aerodynamicBodyCount > 0
      ? [`${aerodynamicBodyCount} released bod${aerodynamicBodyCount === 1 ? "y" : "ies"} used the opt-in detached-body static aerodynamic load basis; normal-force, CP-moment, and rate-damping diagnostics remain traceable.`]
      : []),
    ...(relativeAero.enabled
      ? [
          `The opt-in ${COUPLED_MULTI_BODY_RELATIVE_AERO_MODEL_VERSION} wake feedback path applied the strongest overlapping source-wake velocity deficit to ${relativeAeroAffectedBodyCount} body${relativeAeroAffectedBodyCount === 1 ? "" : "ies"}; this remains an analytical sensitivity model, not validated interference data.`,
          ...(relativeAeroAffectedBodyCount === 0
            ? ["Wake feedback was enabled but no source/target overlap with usable aerodynamic geometry was sampled; no wake force adjustment was applied."]
            : []),
        ]
      : []),
    "An optional earthRotationAccelerationWorldMps2 field from the environment provider is added to each body's shared acceleration; the provider remains responsible for its provenance and validation status.",
    ...(mutualGravity.enabled && mutualGravity.softeningRadiusM > 0
      ? [`Mutual gravity uses a Plummer-style softening radius of ${mutualGravity.softeningRadiusM.toFixed(6)} m for close approaches; this is a numerical approximation, not a contact model.`]
      : []),
    ...(contact.enabled
      ? [
          `Envelope contact uses ${COUPLED_MULTI_BODY_CONTACT_MODEL_VERSION}: F_n = min(F_max, k δ + c v_closing), with k=${contact.stiffnessNPerM.toFixed(3)} N/m, c=${contact.dampingNsPerM.toFixed(3)} N/(m/s), and F_max=${contact.maximumNormalForceN.toFixed(3)} N.`,
          "Contact forces are applied at the body centres and therefore produce no angular impulse; envelope radii are conservative spherical bounds, not collision meshes or structural stiffness data.",
          ...(contactTraceSamples.length === 0
            ? ["The contact branch was enabled but no active released-body envelope overlap was sampled; no contact force was applied."]
            : []),
        ]
      : []),
    aerodynamicBodyCount > 0
      ? "Bodies with a detached-body aerodynamic basis use altitude-dependent gravity and the supplied relation/projected-area force basis against environment-relative wind; other bodies retain their configured point-drag path."
      : attitudeDependentDragBodyCount > 0
        ? "Bodies with an attitude-dependent drag basis use altitude-dependent gravity and a bounded projected-area CdA blend against environment-relative wind; other bodies retain the constant isotropic point-drag basis when configured."
      : "Each body uses altitude-dependent gravity and, when supplied, constant isotropic point drag against environment-relative wind.",
    ...(rigidBodyCount > 0
      ? ["Rigid-body attitude uses quaternion kinematics and Euler angular momentum with the supplied constant inertia tensor; flexible-body, contact, plume, and unprovided aerodynamic moment models remain outside the solver."]
      : []),
    ...(trajectories.some((trajectory) => trajectory.impactTimeS !== null)
      ? ["Ground crossings are terminal component events; post-impact body motion is not propagated."]
      : []),
    ...(input.bodies.some((body) => body.velocityAdjustment)
      ? ["Some release velocities include an explicitly supplied correction; the source event and vector are retained for auditability."]
      : []),
    ...(budgetAdjusted
      ? [`The requested ${input.timeStepS.toFixed(4)} s step would exceed the maximum step budget (${maximumSteps}); the shared grid was coarsened to ${effectiveTimeStepS.toFixed(4)} s to reach the mission end.`]
      : []),
    ...(integrationMethod === "adaptive-rk4-step-doubling"
      ? [`Adaptive RK4 step-doubling accepted ${integrationDiagnostics.acceptedStepCount} internal steps and rejected ${integrationDiagnostics.rejectedStepCount}; the reported error is numerical truncation only, not model validation.`]
      : []),
    ...(pairwise?.warnings ?? []),
  ];
  const assumptions = [
    "Each detached body is represented as a point mass for translation with its supplied release position and velocity; bodies with an opt-in rigid-body record additionally propagate attitude and angular velocity.",
    "The integrator is explicit fourth-order Runge-Kutta over a shared mission-time grid; release times are inserted as exact initial points and partial steps are used to align with the grid.",
    "Gravity is evaluated from altitude using the RocketWorks atmosphere/gravity implementation; drag is a constant-Cd, constant-reference-area isotropic approximation when configured.",
    "The environment provider is queried separately for each body at each Runge-Kutta substep, so wind and atmosphere may vary with time and position but bodies do not alter the environment.",
    "Environment-supplied Earth rotation acceleration is interpreted in the same local ENU frame and uses ground-relative velocity when the provider computes Coriolis effects.",
    ...(mutualGravity.enabled
      ? [`Pairwise point-mass gravity uses F = G m₁ m₂ r / (|r|² + ε²)^(3/2), with G=${STANDARD_GRAVITATIONAL_CONSTANT_M3_KG_S2.toExponential(5)} m³ kg⁻¹ s⁻² and ε=${mutualGravity.softeningRadiusM.toFixed(6)} m.`]
      : []),
    contact.enabled
      ? "Pairwise separation remains a continuous diagnostic alongside the contact branch; F_n = min(F_max, k * penetration + c * closing speed) is bounded by the caller cap and does not model deformation, friction, rebound geometry, joints, or range-safety margins."
      : "Pairwise separation is a continuous piecewise-linear trace diagnostic; spherical envelope bounds, contact, collision response, and range-safety margins remain outside this model.",
    ...(input.bodies.some((body) => body.velocityAdjustment)
      ? ["Velocity adjustments are treated as instantaneous release-state corrections supplied by the caller; separation mechanism, joint compliance, and angular impulse are not modeled."]
      : []),
    ...(rigidBodyCount > 0
      ? [
          "Rigid-body attitude uses quaternion kinematics and Euler angular momentum with the supplied constant inertia tensor; flexible-body, contact, plume, and unprovided aerodynamic moment models remain outside the solver.",
          relativeAero.enabled
            ? "Rigid-body loads are caller-supplied additions to the shared gravity/drag force basis; the opt-in wake proxy is the only inferred pairwise aerodynamic force, omitted moments are zero, and no validated interference force is inferred."
            : "Rigid-body loads are caller-supplied additions to the shared gravity/drag force basis; omitted moments are zero and no contact or aerodynamic-interference force is inferred.",
        ]
      : []),
    ...(attitudeDependentDragBodyCount > 0
      ? [
          "Projected-area drag uses the supplied axial and crossflow CdA pairs blended by the squared cosine of the body-axis incidence; lift, aerodynamic moments, fins, and unsteady flow are not inferred.",
        ]
      : []),
    ...(aerodynamicBodyCount > 0
      ? [
          `Detached-body aerodynamic loads use ${DETACHED_BODY_AERODYNAMICS_MODEL_VERSION}: static normal force is bounded by the supplied forward-flow/angle/compressibility envelope, the CP-to-CG lever arm supplies r x F moment, and optional rate derivatives supply damping; this remains an analytical component check.`,
        ]
      : []),
    ...(relativeAero.enabled
      ? [
          `Wake feedback uses a finite expanding cone with half-angle ${relativeAero.wakeHalfAngleDeg.toFixed(3)}°, recovery length ${relativeAero.wakeRecoveryDistanceBodyDiameters.toFixed(3)} source diameters, peak deficit ${relativeAero.peakVelocityDeficitFraction.toFixed(3)}, and maximum deficit ${relativeAero.maximumVelocityDeficitFraction.toFixed(3)}.`,
          "When several source wakes overlap, only the strongest candidate velocity-deficit vector is applied to keep the feedback bounded; the target's existing aerodynamic or point-drag model then evaluates the adjusted relative flow. Wake roll-up, turbulence, plume effects, crossflow database calibration, and unsteady derivatives are not modeled.",
        ]
      : []),
    ...(integrationMethod === "adaptive-rk4-step-doubling"
      ? [
          "Adaptive step-doubling compares one full RK4 step with two half RK4 steps over each shared-grid interval; refined states are accepted only when the scaled component error is at most one.",
          `Adaptive tolerances are relative ${adaptiveIntegrationOptions!.relativeTolerance} and absolute ${adaptiveIntegrationOptions!.absoluteTolerance}; internal steps are bounded from ${adaptiveIntegrationOptions!.minimumStepS} s to ${adaptiveIntegrationOptions!.maximumStepS} s with safety factor ${adaptiveIntegrationOptions!.safetyFactor}.`,
        ]
      : []),
  ];
  const status: CoupledMultiBodyFlightResult["status"] = budgetAdjusted
    ? "partial"
    : trajectories.length === 0
      ? "not-assessed"
      : "assessed";
  return {
    modelVersion: COUPLED_MULTI_BODY_FLIGHT_MODEL_VERSION,
    validationStatus: COUPLED_MULTI_BODY_FLIGHT_STATUS,
    startTimeS,
    endTimeS: grid.at(-1)!,
    timeStepS: effectiveTimeStepS,
    stepCount: Math.max(grid.length - 1, 0),
    mutualGravity: {
      enabled: mutualGravity.enabled,
      softeningRadiusM: mutualGravity.softeningRadiusM,
      gravitationalConstantM3KgS2: STANDARD_GRAVITATIONAL_CONSTANT_M3_KG_S2,
    },
    contact: {
      modelVersion: COUPLED_MULTI_BODY_CONTACT_MODEL_VERSION,
      validationStatus: COUPLED_MULTI_BODY_CONTACT_STATUS,
      enabled: contact.enabled,
      stiffnessNPerM: contact.stiffnessNPerM,
      dampingNsPerM: contact.dampingNsPerM,
      maximumNormalForceN: contact.maximumNormalForceN,
      maximumPenetrationM: contactMaximumPenetrationM,
      maximumNormalForceNObserved: contactMaximumNormalForceN,
      contactPairCount,
      contactSampleCount: contactTraceSamples.length,
    },
    relativeAeroForceFeedback: {
      modelVersion: COUPLED_MULTI_BODY_RELATIVE_AERO_MODEL_VERSION,
      validationStatus: COUPLED_MULTI_BODY_RELATIVE_AERO_STATUS,
      enabled: relativeAero.enabled,
      wakeHalfAngleDeg: relativeAero.wakeHalfAngleDeg,
      wakeRecoveryDistanceBodyDiameters: relativeAero.wakeRecoveryDistanceBodyDiameters,
      peakVelocityDeficitFraction: relativeAero.peakVelocityDeficitFraction,
      maximumVelocityDeficitFraction: relativeAero.maximumVelocityDeficitFraction,
      maximumObservedVelocityDeficitFraction: relativeAeroMaximumObservedVelocityDeficitFraction,
      exposedSampleCount: relativeAeroTraceSamples.length,
      affectedBodyCount: relativeAeroAffectedBodyCount,
    },
    rigidBodyCount,
    aerodynamicBodyCount,
    integration: {
      method: integrationDiagnostics.method,
      acceptedStepCount: integrationDiagnostics.acceptedStepCount,
      rejectedStepCount: integrationDiagnostics.rejectedStepCount,
      maximumNormalizedError: integrationMethod === "adaptive-rk4-step-doubling"
        ? integrationDiagnostics.maximumNormalizedError
        : null,
      minimumAcceptedStepS: Number.isFinite(integrationDiagnostics.minimumAcceptedStepS)
        ? integrationDiagnostics.minimumAcceptedStepS
        : null,
      maximumAcceptedStepS: integrationDiagnostics.maximumAcceptedStepS > 0
        ? integrationDiagnostics.maximumAcceptedStepS
        : null,
    },
    trajectories,
    pairwise,
    minimumDistanceM: pairwise?.minimumDistanceM ?? null,
    closestPair: pairwise?.closestPair ?? null,
    status,
    warnings: [...new Set(warnings)],
    assumptions: [...new Set(assumptions)],
  };
}
