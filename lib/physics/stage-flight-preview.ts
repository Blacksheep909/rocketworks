import type { LaunchEnvironmentProvider } from "./launch-environment.ts";
import {
  createMultiStageVehicleModel,
  initializeMultiStageState,
  type MultiStageMotor,
  type RocketStage,
} from "./multi-stage.ts";
import type {
  AerodynamicCoefficientUncertaintyScales,
  StageAerodynamicRegime,
} from "./stage-aware-aerodynamics.ts";
import { createStageAwareAerodynamicsModel } from "./stage-aware-aerodynamics.ts";
import {
  createPreliminaryRocketLoadModel,
  verticalLaunchOrientationBodyToEnu,
} from "./rocket-loads.ts";
import {
  simulateRailGuidedLaunch,
  type LaunchRailConfig,
  type RailGuidedLaunchResult,
} from "./launch-rail.ts";
import {
  rotateBodyToWorld,
  rotateWorldToBody,
  simulateRigidBody6D,
  type AppliedRigidBodyEvent,
  type Quaternion,
  type RigidBodyLoads,
  type RigidBodyState,
  type ScheduledRigidBodyEvent,
  type SixDofIntegrationOptions,
  type SixDofSimulationResult,
  type StateTriggeredRigidBodyEvent,
} from "./six-dof.ts";
import {
  addVectors,
  dot,
  magnitude,
  scaleVector,
  subtractVectors,
  type Vector3,
} from "./linear-algebra.ts";
import type { VehicleComponent } from "./vehicle-components.ts";
import { computeStaticStability } from "./static-aerodynamics.ts";
import type { WindLayer } from "./curves.ts";
import {
  NORMAL_FORCE_COMPRESSIBILITY_MODEL_VERSION,
  type NormalForceModelKind,
} from "./normal-force-compressibility.ts";
import {
  INDUCED_DRAG_MODEL_VERSION,
  type InducedDragModelKind,
} from "./induced-drag.ts";
import type { MassProperties } from "./mass-properties.ts";
import {
  allocateMissionEventPlan,
  type MissionEventAllocation,
} from "./event-allocator.ts";
import {
  createRecoverySystemModel,
  type RecoveryDevice,
  type RecoverySystemModel,
} from "./recovery-system.ts";
import {
  analyzeMultiBodySeparation,
  type MultiBodySeparationResult,
  type SeparationClearanceTracePoint,
} from "./separation-clearance.ts";
import {
  analyzeSphericalSeparationEnvelope,
  type SeparationEnvelopeResult,
} from "./separation-envelope.ts";
import {
  analyzeSeparationContact,
  type SeparationContactResult,
  type SeparationContactTracePoint,
} from "./separation-contact.ts";
import {
  analyzeSeparationContactLoad,
  type SeparationContactLoadOptions,
  type SeparationContactLoadResult,
} from "./separation-contact-load.ts";
import {
  analyzeRelativeAeroInteraction,
  type RelativeAeroInteractionOptions,
  type RelativeAeroInteractionResult,
} from "./relative-aero-interaction.ts";
import {
  auditSeparationDynamics,
  solveCoupledSeparationImpulse,
  type CoupledSeparationImpulseResult,
  type SeparationDynamicsResult,
} from "./separation-dynamics.ts";
import {
  simulateSeparatedBodyFlight,
  type SeparatedBodyTrajectory,
} from "./separated-body-flight.ts";
import {
  simulateCoupledMultiBodyFlight,
  type CoupledMultiBodyFlightBodyInput,
  type CoupledMultiBodyContactOptions,
  type CoupledMultiBodyGravityOptions,
  type CoupledMultiBodyRelativeAeroOptions,
  type CoupledMultiBodyVelocityImpulseEvent,
  type CoupledMultiBodySeparationForcePulse,
  type CoupledMultiBodySeparationForcePulseProfile,
  type CoupledMultiBodyFlightResult,
} from "./coupled-multi-body-flight.ts";
import type { AttitudeDependentDragGeometry } from "./attitude-dependent-drag.ts";
import type { DetachedBodyAerodynamicBasis } from "./detached-body-aerodynamics.ts";
import {
  computeMissionMassRatio,
  computeStageMassRatio,
  type MissionMassRatioResult,
  type StageMassRatioResult,
} from "./stage-mass-ratio.ts";
import {
  computeStageFlightForceBudget,
  type StageFlightForceBudgetResult,
} from "./stage-flight-force-budget.ts";
import {
  computeStageFlightVectorBudget,
  type StageFlightVectorBudgetResult,
} from "./stage-flight-vector-budget.ts";
import {
  computeMissionLossBudget,
  type MissionLossBudgetResult,
} from "./mission-loss-budget.ts";
import {
  computeMissionDeltaVBridge,
  type MissionDeltaVBridgeResult,
} from "./mission-delta-v-bridge.ts";
import {
  analyzeGimbalControlAuthority,
  type GimbalControlAuthorityResult,
  type GimbalControlAuthoritySampleInput,
} from "./gimbal-control-authority.ts";

export const STAGE_FLIGHT_PREVIEW_MODEL_VERSION =
  "kestrel-stage-flight-preview-0.46.0";
export const STAGE_FLIGHT_PREVIEW_STATUS =
  "mathematical-regression-tests-only" as const;

/** Detached-body force-model selection exposed by the browser preview. */
export type ReleasedBodyDragModel =
  | "isotropic-point"
  | "attitude-projected-area"
  | "coefficient-table";

/** Retained-body handoff used by the optional shared released-body track. */
export type RetainedBodyCoupledTrackMode =
  | "trace-replay"
  | "independent-mass-propulsion";

/** User-facing pulse profile for the bounded first-separation mechanism preview. */
export type StageFlightSeparationPulseProfile = CoupledMultiBodySeparationForcePulseProfile;

/**
 * High-level browser configuration for one first-separation mechanism pulse.
 * The translational vector is expressed along the retained vehicle's +X body
 * axis and the optional angular vector along its +Y body axis; both are
 * synthesized against the first detached stage instance. This is intentionally
 * smaller than the generic solver contract so the UI cannot accidentally target
 * an unknown body or introduce an unbounded mechanism.
 */
export type StageFlightSeparationPulseConfiguration = Readonly<{
  relativeDeltaVBodyMps: Vector3;
  relativeAngularDeltaOmegaBodyRadS?: Vector3;
  startOffsetS: number;
  durationS: number;
  profile?: StageFlightSeparationPulseProfile;
}>;

export type StageFlightPreviewInput = Readonly<{
  retainedMassProperties: MassProperties;
  components: readonly VehicleComponent[];
  stages: readonly RocketStage[];
  /** Optional serial burn-order subset used by the mission mass-ratio preview. */
  missionSerialStageIds?: readonly string[];
  regimes: readonly StageAerodynamicRegime[];
  initiallyIgnitedStageIds: readonly string[];
  durationS: number;
  timeStepS: number;
  /** Optional six-degree-of-freedom integration method; fixed RK4 remains the default. */
  integration?: SixDofIntegrationOptions;
  launchAltitudeM?: number;
  windProfile?: readonly WindLayer[];
  environmentAt?: LaunchEnvironmentProvider;
  /** Multiplicative drag-only uncertainty applied to the selected aero source. */
  dragCoefficientScale?: number;
  /** Multiplicative uncertainty applied to direct body-axis force coefficients. */
  directForceCoefficientScale?: number;
  /** Multiplicative uncertainty applied to direct body-axis static moment coefficients. */
  directMomentCoefficientScale?: number;
  /** Signed common-sigma multiplier applied to declared absolute aero-table uncertainties. */
  coefficientUncertaintyScale?: number;
  /** Optional per-channel signed-sigma multipliers; omitted channels use the common value. */
  coefficientUncertaintyScales?: AerodynamicCoefficientUncertaintyScales;
  alwaysActiveGeometryStageIds?: readonly string[];
  separationTransitionWindowS?: number;
  initialState?: Partial<Pick<
    RigidBodyState,
    "positionWorldM" | "velocityWorldMps" | "orientationBodyToWorld" | "angularVelocityBodyRadS" | "discreteState"
  >>;
  events?: readonly ScheduledRigidBodyEvent[];
  stateEvents?: readonly StateTriggeredRigidBodyEvent[];
  /** Optional retained-vehicle recovery devices. Detached-stage branches do not carry them. */
  recoveryDevices?: readonly RecoveryDevice[];
  /** Fixed spherical bounds keyed by `retained-vehicle` or `${stageId}/${instanceId}`. */
  separationEnvelopeRadiiM?: Readonly<Record<string, number | null | undefined>>;
  /** Optional compliance scenario used only by the post-trace contact-load screen. */
  separationContactLoad?: SeparationContactLoadOptions;
  /** Optional pairwise gravity mode for the shared released-body track. */
  coupledMultiBodyGravity?: CoupledMultiBodyGravityOptions;
  /** Optional equal-and-opposite envelope-contact force mode for released bodies. */
  coupledMultiBodyContact?: CoupledMultiBodyContactOptions;
  /** Optional replay-backed retained-vehicle seed in the shared released-body track. */
  coupledMultiBodyIncludeRetainedBody?: boolean;
  /** Optional independent mass/thrust handoff for the retained seed; replay remains the default. */
  coupledMultiBodyRetainedBodyMode?: RetainedBodyCoupledTrackMode;
  /** Optional detached-body force contract for shared-grid and branch tracks. */
  releasedBodyDragModel?: ReleasedBodyDragModel;
  /** Optional post-trace wake/relative-flow screen; it never feeds forces back into flight. */
  relativeAeroInteraction?: RelativeAeroInteractionOptions;
  /** Optional bounded wake-deficit feedback for the shared coupled track. */
  relativeAeroForceFeedback?: CoupledMultiBodyRelativeAeroOptions;
  /** Optional finite-duration equal-and-opposite separation mechanisms for the shared track. */
  separationMechanisms?: readonly CoupledMultiBodySeparationForcePulse[];
  /** Optional bounded pulse synthesized after the first staged separation. */
  coupledSeparationPulse?: StageFlightSeparationPulseConfiguration;
  launchRail?: LaunchRailConfig;
  launchRailMaximumSteps?: number;
  additionalWarnings?: readonly string[];
  additionalAssumptions?: readonly string[];
}>;

export type StageFlightTracePoint = Readonly<{
  timeS: number;
  altitudeAglM: number;
  speedMps: number;
  velocityWorldMps: Vector3;
  mach: number;
  angleOfAttackRad: number;
  sideslipRad: number;
  dynamicPressurePa: number;
  dragN: number;
  /** Magnitude of the aerodynamic body-force vector, excluding propulsion. */
  aerodynamicForceN?: number;
  /** Magnitude of static plus rate-damping aerodynamic moment. */
  aerodynamicMomentNm?: number;
  /** Magnitude of the aerodynamic rate-damping moment component. */
  aerodynamicDampingMomentNm?: number;
  /** Static center of pressure from the active aerodynamic topology, from the nose datum. */
  centerOfPressureXM: number | null;
  /** Mass center from the active staging state, from the nose datum. */
  centerOfMassXM: number | null;
  /** (CP - CG) / reference diameter for the active topology. */
  staticMarginCalibers: number | null;
  /** Active normal-force slope used by the aerodynamic evaluator. */
  normalForceSlopePerRad: number | null;
  /** Body-to-world attitude quaternion retained from the 6DOF state. */
  orientationBodyToWorld: Quaternion;
  /** Body-frame angular velocity retained from the 6DOF state, in rad/s. */
  angularVelocityBodyRadS: Vector3;
  /** Angle between the vehicle nose axis and local vertical, in radians. */
  attitudeTiltRad: number;
  /** Magnitude of body angular velocity, in rad/s. */
  angularRateRadS: number;
  directForceApplied?: boolean;
  directMomentApplied?: boolean;
  coefficientBasis?: string | null;
  thrustForceWorldN: Vector3;
  aerodynamicForceWorldN: Vector3;
  gravityForceWorldN: Vector3;
  recoveryForceWorldN: Vector3;
  recoveryDragN: number;
  recoveryEffectiveAreaM2: number;
  massKg: number;
  thrustN: number;
  /** Net force projected onto the vehicle nose axis (+nose direction) as acceleration. */
  axialAccelerationMps2: number;
  /** Magnitude of the net-force acceleration perpendicular to the nose in body +Y/+Z. */
  transverseAccelerationMps2?: number;
  /** Conservative independent gimbal transverse-force envelope, in newtons. */
  gimbalControlForceN?: number;
  /** Conservative independent gimbal moment envelope, in N·m. */
  gimbalControlMomentNm?: number;
  /** Conservative independent gimbal angular-acceleration envelope, in rad/s². */
  gimbalControlAngularAccelerationRadS2?: number;
  /** Positive-thrust gimballed-motor count at this sample. */
  gimbalActiveMotorCount?: number;
  /** Control-moment magnitude divided by aerodynamic-moment magnitude when defined. */
  gimbalControlToAerodynamicMomentRatio?: number | null;
  attachedStageIds: readonly string[];
}>;

export type StageFlightClusterMotorPeak = Readonly<{
  id: string;
  name: string;
  peakThrustN: number;
  ignitionFailure: boolean;
}>;

export type StageFlightClusterDiagnostic = Readonly<{
  stageId: string;
  stageName: string;
  motorCount: number;
  failedMotorCount: number;
  activeMotorCount: number;
  attachedPropellantMassKg: number;
  failedPropellantMassKg: number;
  /** Sum of each available motor's individual thrust-curve peak ordinate. */
  peakCurveThrustN: number;
  /** Difference between the largest and smallest available individual peak ordinates. */
  peakCurveSpreadN: number | null;
  /** Peak spread divided by the mean available individual peak ordinate. */
  peakCurveSpreadFraction: number | null;
  motorPeakThrusts: readonly StageFlightClusterMotorPeak[];
  status: "nominal" | "watch" | "failed";
  note: string;
}>;

export type StageFlightEvent = Readonly<{
  id: string;
  label: string;
  kind: AppliedRigidBodyEvent["kind"] | "rail";
  timeS: number;
  attachedStageIdsBefore: readonly string[];
  attachedStageIdsAfter: readonly string[];
  detachedStageIds: readonly string[];
  attachedStageInstanceIdsBefore: readonly string[];
  attachedStageInstanceIdsAfter: readonly string[];
  detachedStageInstanceIds: readonly string[];
  missionKind: "rail" | "separation" | "ignition" | "failure" | "recovery" | "custom";
  priority: number;
  separationDeltaVBodyMps?: Vector3;
  separationDeltaVWorldMps?: Vector3;
  separationImpulseBodyNs?: Vector3;
  separationImpulseWorldNs?: Vector3;
}>;

export type StageFlightConvergenceDiagnostic = Readonly<{
  status: "converged" | "watch" | "not-assessed";
  baseTimeStepS: number;
  refinedTimeStepS: number;
  maximumRelativeDifference: number | null;
  maxAltitudeRelativeDifference: number | null;
  maxSpeedRelativeDifference: number | null;
  apogeeTimeDifferenceS: number | null;
  finalPositionDifferenceM: number | null;
  finalVelocityDifferenceMps: number | null;
  maximumEventTimeDifferenceS: number | null;
  relativeTolerance: number;
  timeToleranceS: number;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

export type StageFlightPreviewResult = Readonly<{
  modelVersion: string;
  validationStatus: typeof STAGE_FLIGHT_PREVIEW_STATUS;
  stagingModelVersion: string;
  aerodynamicsModelVersion: string;
  loadsModelVersion: string;
  normalForceModel: NormalForceModelKind | "mixed";
  normalForceModelVersion: string;
  inducedDragModel: InducedDragModelKind | "mixed";
  inducedDragModelVersion: string;
  inducedDragFactor: number | "mixed";
  /** Selected detached-body aerodynamic contract, retained for report provenance. */
  releasedBodyDragModel?: ReleasedBodyDragModel;
  recoveryModelVersion: string | null;
  simulation: SixDofSimulationResult | null;
  rail: RailGuidedLaunchResult | null;
  trace: readonly StageFlightTracePoint[];
  events: readonly StageFlightEvent[];
  maxAltitudeAglM: number;
  maxSpeedMps: number;
  timeToApogeeS: number;
  clusterDiagnostics: readonly StageFlightClusterDiagnostic[];
  massRatio: StageMassRatioResult;
  missionMassRatio: MissionMassRatioResult;
  forceBudget: StageFlightForceBudgetResult;
  vectorBudget: StageFlightVectorBudgetResult;
  gimbalControlAuthority: GimbalControlAuthorityResult;
  missionLossBudget: MissionLossBudgetResult;
  missionDeltaVBridge: MissionDeltaVBridgeResult;
  separatedBodies: readonly SeparatedBodyTrajectory[];
  separationDynamics: readonly SeparationDynamicsResult[];
  separationImpulseSolutions: readonly CoupledSeparationImpulseResult[];
  multiBodySeparation: MultiBodySeparationResult | null;
  separationEnvelope: SeparationEnvelopeResult | null;
  separationContact: SeparationContactResult | null;
  separationContactLoad: SeparationContactLoadResult | null;
  relativeAeroInteraction: RelativeAeroInteractionResult | null;
  coupledMultiBodyFlight: CoupledMultiBodyFlightResult | null;
  convergence: StageFlightConvergenceDiagnostic;
  eventAllocation: MissionEventAllocation;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

const ZERO_VECTOR: Vector3 = { x: 0, y: 0, z: 0 };
const STAGE_FLIGHT_CONVERGENCE_RELATIVE_TOLERANCE = 0.02;
const STAGE_FLIGHT_CONVERGENCE_TIME_TOLERANCE_S = 0.05;

function interpolateVector(left: Vector3, right: Vector3, fraction: number): Vector3 {
  return {
    x: left.x + (right.x - left.x) * fraction,
    y: left.y + (right.y - left.y) * fraction,
    z: left.z + (right.z - left.z) * fraction,
  };
}

/**
 * Replays the non-gravity translation loads from the authoritative staged
 * trace. This is intentionally separate from the coupled solver's gravity,
 * contact, and mutual-gravity loads so the replay does not double-count them.
 */
function interpolateStageTraceNonGravityForceWorldN(
  trace: readonly StageFlightTracePoint[],
  timeS: number,
): Vector3 {
  if (trace.length === 0) return ZERO_VECTOR;
  const first = trace[0]!;
  const last = trace[trace.length - 1]!;
  if (timeS <= first.timeS) {
    return addVectors(
      addVectors(first.thrustForceWorldN, first.aerodynamicForceWorldN),
      first.recoveryForceWorldN,
    );
  }
  if (timeS >= last.timeS) {
    return addVectors(
      addVectors(last.thrustForceWorldN, last.aerodynamicForceWorldN),
      last.recoveryForceWorldN,
    );
  }
  let low = 0;
  let high = trace.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (trace[middle]!.timeS <= timeS) low = middle;
    else high = middle;
  }
  const left = trace[low]!;
  const right = trace[high]!;
  const span = right.timeS - left.timeS;
  const fraction = span > 0 ? (timeS - left.timeS) / span : 0;
  return addVectors(
    addVectors(
      interpolateVector(left.thrustForceWorldN, right.thrustForceWorldN, fraction),
      interpolateVector(left.aerodynamicForceWorldN, right.aerodynamicForceWorldN, fraction),
    ),
    interpolateVector(left.recoveryForceWorldN, right.recoveryForceWorldN, fraction),
  );
}

function combineRigidBodyLoads(
  primary: RigidBodyLoads,
  secondary: RigidBodyLoads,
): RigidBodyLoads {
  const forceWorldN = primary.forceWorldN || secondary.forceWorldN
    ? addVectors(primary.forceWorldN ?? ZERO_VECTOR, secondary.forceWorldN ?? ZERO_VECTOR)
    : undefined;
  const forceBodyN = primary.forceBodyN || secondary.forceBodyN
    ? addVectors(primary.forceBodyN ?? ZERO_VECTOR, secondary.forceBodyN ?? ZERO_VECTOR)
    : undefined;
  const momentBodyNm = primary.momentBodyNm || secondary.momentBodyNm
    ? addVectors(primary.momentBodyNm ?? ZERO_VECTOR, secondary.momentBodyNm ?? ZERO_VECTOR)
    : undefined;
  return {
    ...(forceWorldN ? { forceWorldN } : {}),
    ...(forceBodyN ? { forceBodyN } : {}),
    ...(momentBodyNm ? { momentBodyNm } : {}),
  };
}

function finiteVector(value: Vector3, label: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite coordinates`);
  }
}

function uniqueStrings(values: readonly string[], label: string): string[] {
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value) => !value)) throw new Error(`${label} cannot contain empty identifiers`);
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} must be unique`);
  return normalized;
}

function configuredPhysicalMotors(stage: RocketStage): readonly MultiStageMotor[] {
  return stage.instances
    ? stage.instances.flatMap((instance) => instance.motors)
    : stage.motors;
}

function motorPeakThrustN(motor: MultiStageMotor): number {
  return Math.max(0, ...motor.thrustCurve.map((point) => point.thrustN));
}

function peakSpreadFraction(
  peakThrustsN: readonly number[],
): number | null {
  if (peakThrustsN.length < 2) return null;
  const minimum = Math.min(...peakThrustsN);
  const maximum = Math.max(...peakThrustsN);
  const mean = peakThrustsN.reduce((sum, value) => sum + value, 0) / peakThrustsN.length;
  return mean > 0 ? (maximum - minimum) / mean : null;
}

function defaultInitialState(
  input: StageFlightPreviewInput,
): RigidBodyState {
  const positionWorldM = input.initialState?.positionWorldM ?? ZERO_VECTOR;
  const velocityWorldMps = input.initialState?.velocityWorldMps ?? ZERO_VECTOR;
  const orientationBodyToWorld =
    input.initialState?.orientationBodyToWorld ?? verticalLaunchOrientationBodyToEnu();
  const angularVelocityBodyRadS =
    input.initialState?.angularVelocityBodyRadS ?? ZERO_VECTOR;
  finiteVector(positionWorldM, "initial position");
  finiteVector(velocityWorldMps, "initial velocity");
  finiteVector(angularVelocityBodyRadS, "initial angular velocity");
  return {
    timeS: 0,
    positionWorldM,
    velocityWorldMps,
    orientationBodyToWorld,
    angularVelocityBodyRadS,
    discreteState: input.initialState?.discreteState,
  };
}

function stageIdsAt(
  staging: ReturnType<typeof createMultiStageVehicleModel>,
  state: RigidBodyState,
): readonly string[] {
  return staging.evaluate(state).attachedStageIds;
}

function stageInstanceIdsAt(
  staging: ReturnType<typeof createMultiStageVehicleModel>,
  state: RigidBodyState,
): readonly string[] {
  return staging.evaluate(state).attachedStageInstanceIds;
}

type DetachedStageInstance = Readonly<{
  stageId: string;
  instanceId: string;
}>;

function detachedStageInstancesBetween(
  staging: ReturnType<typeof createMultiStageVehicleModel>,
  beforeState: RigidBodyState,
  afterState: RigidBodyState,
): readonly DetachedStageInstance[] {
  const before = staging.evaluate(beforeState);
  const afterByStageId = new Map(staging.evaluate(afterState).stages.map((stage) => [stage.id, stage]));
  return before.stages.flatMap((stage) => {
    const afterStage = afterByStageId.get(stage.id);
    return stage.instances
      .filter((instance) => instance.attached)
      .filter((instance) => !afterStage?.instances.find((candidate) => candidate.id === instance.id)?.attached)
      .map((instance) => ({ stageId: stage.id, instanceId: instance.id }));
  });
}

type DetachedStageAerodynamicBasis = Readonly<{
  referenceAreaM2: number;
  dragCoefficient: number;
  attitudeDependentDrag?: AttitudeDependentDragGeometry;
  aerodynamicBasis?: DetachedBodyAerodynamicBasis;
}>;

/**
 * Resolves a deliberately small aerodynamic basis for an independently
 * propagated discarded stage. A topology-specific regime supplies the
 * coefficient metadata (a table's design point provides the fallback Cd),
 * while table-backed detached modes query the source at each live sample.
 * Geometry supplies the largest axisymmetric cross-section when no explicit
 * diameter is present. If either side is unavailable, the caller keeps the
 * documented gravity-only fallback instead of borrowing a full-stack
 * coefficient.
 */
function detachedStageAerodynamicBasis(
  components: readonly VehicleComponent[],
  regimes: readonly StageAerodynamicRegime[],
  stageId: string,
  centerOfMassXM: number,
  coefficientUncertaintyScale?: number,
  coefficientUncertaintyScales?: AerodynamicCoefficientUncertaintyScales,
): DetachedStageAerodynamicBasis | null {
  const regime = regimes.find(
    (candidate) =>
      candidate.activeStageIds.length === 1 && candidate.activeStageIds[0] === stageId,
  );
  const maximumComponentRadiusM = Math.max(
    0,
    ...components
      .filter((component) => component.stageId === stageId && component.enabled !== false)
      .flatMap((component) => component.kind === "axisymmetric"
        ? component.stations.map((station) => station.outerRadiusM)
        : component.kind === "finSet"
          ? [component.bodyRadiusM]
          : []),
  );
  const referenceDiameterM = regime?.referenceDiameterM ?? (
    maximumComponentRadiusM > 0 ? maximumComponentRadiusM * 2 : undefined
  );
  const referenceAreaM2 = referenceDiameterM !== undefined
    ? Math.PI * (referenceDiameterM / 2) ** 2
    : undefined;
  const dragCoefficient = regime?.dragCoefficient ?? (
    regime?.coefficientTable && regime.coefficientTableDesignPoint
      ? regime.coefficientTable.evaluate(regime.coefficientTableDesignPoint).dragCoefficient
      : undefined
  );
  const stageAxisymmetricComponents = components.filter(
    (component): component is Extract<VehicleComponent, { kind: "axisymmetric" }> =>
      component.stageId === stageId && component.enabled !== false && component.kind === "axisymmetric",
  );
  const profileExtents = stageAxisymmetricComponents.flatMap((component) => {
    const offsetXM = component.positionM?.x ?? 0;
    return component.stations.map((station) => ({
      xM: offsetXM + station.xM,
      radiusM: station.outerRadiusM,
    }));
  });
  const maximumRadiusM = profileExtents.length > 0
    ? Math.max(...profileExtents.map((point) => point.radiusM))
    : 0;
  const profileLengthM = profileExtents.length > 1
    ? Math.max(...profileExtents.map((point) => point.xM)) - Math.min(...profileExtents.map((point) => point.xM))
    : 0;
  const crossflowReferenceAreaM2 = profileLengthM > 0 && maximumRadiusM > 0
    ? profileLengthM * maximumRadiusM * 2
    : undefined;
  let staticStability: ReturnType<typeof computeStaticStability> | null = null;
  if (referenceDiameterM !== undefined) {
    try {
      staticStability = computeStaticStability({
        components,
        centerOfMassXM,
        referenceDiameterM,
        activeStageIds: [stageId],
      });
    } catch {
      staticStability = null;
    }
  }
  const coefficientEvaluation = regime?.coefficientTable && regime.coefficientTableDesignPoint
    ? regime.coefficientTable.evaluate(regime.coefficientTableDesignPoint)
    : null;
  const tableReferenceLengthM = regime?.referenceLengthM ?? (
    profileLengthM > 0 ? profileLengthM : referenceDiameterM
  );
  const aerodynamicBasis = referenceAreaM2 !== undefined &&
    dragCoefficient !== undefined &&
    (staticStability !== null || regime?.coefficientTable)
    ? {
        referenceAreaM2,
        dragCoefficient,
        ...(coefficientEvaluation?.normalForceSlopePerRad !== undefined || staticStability
          ? {
              normalForceSlopePerRad: coefficientEvaluation?.normalForceSlopePerRad ?? staticStability!.normalForceSlopePerRad,
            }
          : {}),
        ...(coefficientEvaluation?.centerOfPressureXM !== undefined || staticStability
          ? {
              centerOfPressureMinusCenterOfMassM:
                (coefficientEvaluation?.centerOfPressureXM ?? staticStability!.centerOfPressureXM) - centerOfMassXM,
            }
          : {}),
        maximumNormalForceMach: regime?.maximumNormalForceMach ?? regime?.coefficientTable?.machRange[1],
        maximumNormalForceAngleRad: regime?.maximumNormalForceAngleRad,
        minimumNormalForceAirspeedMps: regime?.minimumNormalForceAirspeedMps,
        normalForceModel: regime?.normalForceModel,
        inducedDragModel: regime?.inducedDragModel,
        inducedDragFactor: regime?.inducedDragFactor,
        ...(regime?.coefficientTable && tableReferenceLengthM !== undefined
          ? {
              coefficientTable: regime.coefficientTable,
              referenceLengthM: tableReferenceLengthM,
              centerOfMassXM,
              ...(regime.momentReferenceLengthBodyM || regime.coefficientTable.forceMomentDatabaseAvailable
                ? {
                    momentReferenceLengthBodyM: regime.momentReferenceLengthBodyM ?? {
                      x: referenceDiameterM ?? tableReferenceLengthM,
                      y: tableReferenceLengthM,
                      z: tableReferenceLengthM,
                    },
                  }
                : {}),
              ...(coefficientUncertaintyScale !== undefined
                ? { coefficientUncertaintyScale }
                : {}),
              ...(coefficientUncertaintyScales !== undefined
                ? { coefficientUncertaintyScales }
                : {}),
            }
          : {}),
        ...(regime?.dampingReferenceLengthBodyM
          ? { dampingReferenceLengthBodyM: regime.dampingReferenceLengthBodyM }
          : {}),
        ...(coefficientEvaluation?.dampingDerivativeBody
          ? {
              dampingDerivativeBody: coefficientEvaluation.dampingDerivativeBody,
              dampingReferenceLengthBodyM: regime?.dampingReferenceLengthBodyM ?? {
                x: referenceDiameterM ?? tableReferenceLengthM ?? 1,
                y: tableReferenceLengthM ?? referenceDiameterM ?? 1,
                z: tableReferenceLengthM ?? referenceDiameterM ?? 1,
              },
            }
          : {}),
        ...(crossflowReferenceAreaM2 !== undefined && dragCoefficient !== undefined
          ? {
              attitudeDependentDrag: {
                axialReferenceAreaM2: referenceAreaM2,
                crossflowReferenceAreaM2,
                axialDragCoefficient: dragCoefficient,
                crossflowDragCoefficient: dragCoefficient,
              },
            }
          : {}),
      }
    : undefined;
  return referenceAreaM2 !== undefined && dragCoefficient !== undefined
    ? {
        referenceAreaM2,
        dragCoefficient,
        ...(aerodynamicBasis ? { aerodynamicBasis } : {}),
        ...(aerodynamicBasis?.attitudeDependentDrag
          ? { attitudeDependentDrag: aerodynamicBasis.attitudeDependentDrag }
          : {}),
      }
    : null;
}

function summarizeEvent(
  staging: ReturnType<typeof createMultiStageVehicleModel>,
  event: AppliedRigidBodyEvent,
): StageFlightEvent {
  const attachedStageIdsBefore = [...stageIdsAt(staging, event.stateBefore)];
  const attachedStageIdsAfter = [...stageIdsAt(staging, event.stateAfter)];
  const attachedStageInstanceIdsBefore = [...stageInstanceIdsAt(staging, event.stateBefore)];
  const attachedStageInstanceIdsAfter = [...stageInstanceIdsAt(staging, event.stateAfter)];
  const detachedStageIds = attachedStageIdsBefore.filter(
    (stageId) => !attachedStageIdsAfter.includes(stageId),
  );
  const detachedStageInstanceIds = attachedStageInstanceIdsBefore.filter(
    (instanceId) => !attachedStageInstanceIdsAfter.includes(instanceId),
  );
  return {
    id: event.id,
    label: event.label,
    kind: event.kind,
    timeS: event.timeS,
    attachedStageIdsBefore,
    attachedStageIdsAfter,
    detachedStageIds,
    attachedStageInstanceIdsBefore,
    attachedStageInstanceIdsAfter,
    detachedStageInstanceIds,
    missionKind: event.missionKind,
    priority: event.priority,
    separationDeltaVBodyMps: event.separationDeltaVBodyMps,
    separationDeltaVWorldMps: event.separationDeltaVBodyMps
      ? rotateBodyToWorld(event.stateBefore.orientationBodyToWorld, event.separationDeltaVBodyMps)
      : undefined,
    separationImpulseBodyNs: event.separationImpulseBodyNs,
    separationImpulseWorldNs: event.separationImpulseBodyNs
      ? rotateBodyToWorld(event.stateBefore.orientationBodyToWorld, event.separationImpulseBodyNs)
      : undefined,
  };
}

function bindMeasuredSeparationImpulseEvent<
  T extends ScheduledRigidBodyEvent | StateTriggeredRigidBodyEvent,
>(
  event: T,
  staging: ReturnType<typeof createMultiStageVehicleModel>,
): T {
  const impulseBodyNs = event.separationImpulseBodyNs;
  if (!impulseBodyNs || !event.apply) return event;
  if (event.separationDeltaVBodyMps) {
    throw new Error(`${event.id} cannot carry both separation delta-v and measured impulse`);
  }
  return {
    ...event,
    apply: (state: Parameters<NonNullable<T["apply"]>>[0]) => {
      const after = event.apply!(state);
      const retainedMassKg = staging.evaluate(after).massProperties.massKg;
      if (!(retainedMassKg > 0) || !Number.isFinite(retainedMassKg)) {
        throw new Error(`${event.id} measured separation impulse requires positive retained post-separation mass`);
      }
      const targetDeltaVBodyMps = scaleVector(impulseBodyNs, 1 / retainedMassKg);
      const originalDeltaVBodyMps = rotateWorldToBody(
        state.orientationBodyToWorld,
        subtractVectors(after.velocityWorldMps, state.velocityWorldMps),
      );
      const correctionWorldMps = rotateBodyToWorld(
        state.orientationBodyToWorld,
        subtractVectors(targetDeltaVBodyMps, originalDeltaVBodyMps),
      );
      return {
        ...after,
        velocityWorldMps: addVectors(after.velocityWorldMps, correctionWorldMps),
      };
    },
  } as T;
}

type StageFlightRun = Readonly<{
  simulation: SixDofSimulationResult | null;
  rail: RailGuidedLaunchResult | null;
  trace: readonly StageFlightTracePoint[];
  gimbalControlAuthority: GimbalControlAuthorityResult;
  events: readonly StageFlightEvent[];
  maxAltitudeAglM: number;
  maxSpeedMps: number;
  timeToApogeeS: number;
  finalState: RigidBodyState;
  appliedEvents: readonly AppliedRigidBodyEvent[];
}>;

function relativeDifference(left: number, right: number): number {
  const denominator = Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.abs(left - right) / denominator;
}

function stateVectorDifference(
  left: Vector3,
  right: Vector3,
): number {
  return magnitude({
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  });
}

function assessStageFlightConvergence(
  base: StageFlightRun,
  refined: StageFlightRun | null,
  baseTimeStepS: number,
): StageFlightConvergenceDiagnostic {
  const refinedTimeStepS = baseTimeStepS / 2;
  const common = {
    baseTimeStepS,
    refinedTimeStepS,
    relativeTolerance: STAGE_FLIGHT_CONVERGENCE_RELATIVE_TOLERANCE,
    timeToleranceS: STAGE_FLIGHT_CONVERGENCE_TIME_TOLERANCE_S,
  };
  if (!refined) {
    return {
      ...common,
      status: "not-assessed",
      maximumRelativeDifference: null,
      maxAltitudeRelativeDifference: null,
      maxSpeedRelativeDifference: null,
      apogeeTimeDifferenceS: null,
      finalPositionDifferenceM: null,
      finalVelocityDifferenceMps: null,
      maximumEventTimeDifferenceS: null,
      warnings: [
        "A half-step rerun could not be completed, so numerical convergence was not assessed.",
      ],
      assumptions: [
        "Convergence compares this deterministic preview with a second run at half the integration step.",
      ],
    };
  }

  const maxAltitudeRelativeDifference = relativeDifference(
    base.maxAltitudeAglM,
    refined.maxAltitudeAglM,
  );
  const maxSpeedRelativeDifference = relativeDifference(
    base.maxSpeedMps,
    refined.maxSpeedMps,
  );
  const apogeeTimeDifferenceS = Math.abs(
    base.timeToApogeeS - refined.timeToApogeeS,
  );
  const finalPositionDifferenceM = stateVectorDifference(
    base.finalState.positionWorldM,
    refined.finalState.positionWorldM,
  );
  const finalVelocityDifferenceMps = stateVectorDifference(
    base.finalState.velocityWorldMps,
    refined.finalState.velocityWorldMps,
  );
  const finalPositionRelativeDifference = relativeDifference(
    magnitude(base.finalState.positionWorldM),
    magnitude(refined.finalState.positionWorldM),
  );
  const finalVelocityRelativeDifference = relativeDifference(
    magnitude(base.finalState.velocityWorldMps),
    magnitude(refined.finalState.velocityWorldMps),
  );
  const baseEvents = new Map(base.events.map((event) => [event.id, event.timeS]));
  const refinedEvents = new Map(refined.events.map((event) => [event.id, event.timeS]));
  const eventSetsMatch =
    baseEvents.size === refinedEvents.size &&
    [...baseEvents.keys()].every((id) => refinedEvents.has(id));
  const maximumEventTimeDifferenceS = eventSetsMatch
    ? Math.max(
        0,
        ...[...baseEvents.entries()].map(([id, timeS]) =>
          Math.abs(timeS - refinedEvents.get(id)!),
        ),
      )
    : null;
  const relativeDifferences = [
    maxAltitudeRelativeDifference,
    maxSpeedRelativeDifference,
    finalPositionRelativeDifference,
    finalVelocityRelativeDifference,
  ];
  const maximumRelativeDifference = Math.max(...relativeDifferences);
  const timeStable =
    apogeeTimeDifferenceS <= STAGE_FLIGHT_CONVERGENCE_TIME_TOLERANCE_S &&
    (maximumEventTimeDifferenceS === null ||
      maximumEventTimeDifferenceS <= STAGE_FLIGHT_CONVERGENCE_TIME_TOLERANCE_S);
  const status =
    eventSetsMatch &&
    maximumRelativeDifference <= STAGE_FLIGHT_CONVERGENCE_RELATIVE_TOLERANCE &&
    timeStable
      ? "converged"
      : "watch";
  const warnings = [
    ...(status === "watch"
      ? [
          "The half-step rerun changes one or more trajectory metrics beyond the numerical convergence heuristic; reduce the step or investigate model discontinuities before interpreting the result.",
        ]
      : []),
    ...(!eventSetsMatch
      ? [
          "The coarse and half-step runs reached different event sets, so event timing convergence is unavailable.",
        ]
      : []),
  ];
  return {
    ...common,
    status,
    maximumRelativeDifference,
    maxAltitudeRelativeDifference,
    maxSpeedRelativeDifference,
    apogeeTimeDifferenceS,
    finalPositionDifferenceM,
    finalVelocityDifferenceMps,
    maximumEventTimeDifferenceS,
    warnings,
    assumptions: [
      "Convergence compares the deterministic preview with the same model at half the integration step.",
      "A 2% aggregate relative-difference threshold and 0.05 s event/apogee threshold are heuristic numerical checks, not validation or certification.",
      "Different event sets are treated as a convergence warning rather than silently discarded.",
    ],
  };
}

/**
 * Compose the independent stage, aerodynamic, environment, load, and 6-DOF
 * models into one deterministic browser-sized preview. This is intentionally
 * an adapter rather than a new physics implementation: each underlying model
 * keeps its own version, assumptions, and applicability warnings.
 */
export function simulateStageFlightPreview(
  input: StageFlightPreviewInput,
): StageFlightPreviewResult {
  if (!Number.isFinite(input.durationS) || input.durationS <= 0) {
    throw new Error("stage-flight preview duration must be positive and finite");
  }
  if (!Number.isFinite(input.timeStepS) || input.timeStepS <= 0 || input.timeStepS > 0.1) {
    throw new Error("stage-flight preview time step must be greater than 0 and at most 0.1 s");
  }
  const retainedBodyMode = input.coupledMultiBodyRetainedBodyMode ?? "trace-replay";
  if (
    retainedBodyMode !== "trace-replay" &&
    retainedBodyMode !== "independent-mass-propulsion"
  ) {
    throw new Error("coupled multi-body retained-body mode must be trace-replay or independent-mass-propulsion");
  }
  const configuredSeparationPulse = input.coupledSeparationPulse;
  if (configuredSeparationPulse !== undefined) {
    if (input.coupledMultiBodyIncludeRetainedBody !== true) {
      throw new Error("coupledSeparationPulse requires coupledMultiBodyIncludeRetainedBody to be true");
    }
    finiteVector(
      configuredSeparationPulse.relativeDeltaVBodyMps,
      "coupledSeparationPulse.relativeDeltaVBodyMps",
    );
    const deltaVMagnitude = magnitude(configuredSeparationPulse.relativeDeltaVBodyMps);
    if (!Number.isFinite(deltaVMagnitude) || deltaVMagnitude <= 0 || deltaVMagnitude > 25) {
      throw new Error("coupledSeparationPulse.relativeDeltaVBodyMps magnitude must be greater than 0 and at most 25 m/s");
    }
    if (configuredSeparationPulse.relativeAngularDeltaOmegaBodyRadS !== undefined) {
      finiteVector(
        configuredSeparationPulse.relativeAngularDeltaOmegaBodyRadS,
        "coupledSeparationPulse.relativeAngularDeltaOmegaBodyRadS",
      );
      const angularDeltaMagnitude = magnitude(configuredSeparationPulse.relativeAngularDeltaOmegaBodyRadS);
      if (!Number.isFinite(angularDeltaMagnitude) || angularDeltaMagnitude <= 0 || angularDeltaMagnitude > 10) {
        throw new Error("coupledSeparationPulse.relativeAngularDeltaOmegaBodyRadS magnitude must be greater than 0 and at most 10 rad/s");
      }
    }
    if (
      !Number.isFinite(configuredSeparationPulse.startOffsetS) ||
      configuredSeparationPulse.startOffsetS < 0 ||
      configuredSeparationPulse.startOffsetS > 60
    ) {
      throw new Error("coupledSeparationPulse.startOffsetS must be finite from 0 through 60 s");
    }
    if (
      !Number.isFinite(configuredSeparationPulse.durationS) ||
      configuredSeparationPulse.durationS <= 0 ||
      configuredSeparationPulse.durationS > 30
    ) {
      throw new Error("coupledSeparationPulse.durationS must be finite, positive, and at most 30 s");
    }
    if (
      configuredSeparationPulse.profile !== undefined &&
      configuredSeparationPulse.profile !== "constant" &&
      configuredSeparationPulse.profile !== "raised-cosine"
    ) {
      throw new Error("coupledSeparationPulse.profile must be constant or raised-cosine");
    }
  }
  if (input.components.length === 0) throw new Error("stage-flight preview requires geometry components");
  const initiallyIgnitedStageIds = uniqueStrings(
    input.initiallyIgnitedStageIds,
    "initially ignited stage identifiers",
  );
  if (initiallyIgnitedStageIds.length === 0) {
    throw new Error("stage-flight preview requires at least one initially ignited stage");
  }

  const staging = createMultiStageVehicleModel({
    retainedMassProperties: input.retainedMassProperties,
    stages: input.stages,
  });
  const massRatio = computeStageMassRatio({ stages: input.stages });
  const missionSerialStageIds = uniqueStrings(
    input.missionSerialStageIds ?? input.stages.map((stage) => stage.id),
    "mission serial stage identifiers",
  );
  const stageById = new Map(input.stages.map((stage) => [stage.id, stage]));
  const unknownMissionStageIds = missionSerialStageIds.filter((stageId) => !stageById.has(stageId));
  if (unknownMissionStageIds.length > 0) {
    throw new Error(`mission serial mass-ratio references unknown stages: ${unknownMissionStageIds.join(", ")}`);
  }
  const missionSerialStages = missionSerialStageIds.map((stageId) => stageById.get(stageId)!);
  const missionExcludedStageIds = input.stages
    .filter((stage) => !missionSerialStageIds.includes(stage.id))
    .map((stage) => stage.id);
  const missionMassRatio = computeMissionMassRatio({
    serialStages: missionSerialStages,
    retainedPayloadMassKg: input.retainedMassProperties.massKg,
    excludedStageIds: missionExcludedStageIds,
  });
  const unknownInitialStageIds = initiallyIgnitedStageIds.filter(
    (stageId) => !staging.stageIds.includes(stageId),
  );
  if (unknownInitialStageIds.length > 0) {
    throw new Error(`initial ignition references unknown stages: ${unknownInitialStageIds.join(", ")}`);
  }

  const aerodynamics = createStageAwareAerodynamicsModel({
    components: input.components,
    staging,
    regimes: input.regimes,
    alwaysActiveGeometryStageIds: input.alwaysActiveGeometryStageIds,
    separationTransitionWindowS: input.separationTransitionWindowS,
    dragCoefficientScale: input.dragCoefficientScale,
    directForceCoefficientScale: input.directForceCoefficientScale,
    directMomentCoefficientScale: input.directMomentCoefficientScale,
    coefficientUncertaintyScale: input.coefficientUncertaintyScale,
    coefficientUncertaintyScales: input.coefficientUncertaintyScales,
  });
  const normalForceModels = [
    ...new Set(input.regimes.map((regime) => regime.normalForceModel ?? "low-speed")),
  ];
  const normalForceModel: StageFlightPreviewResult["normalForceModel"] =
    normalForceModels.length === 1 ? normalForceModels[0]! : "mixed";
  const inducedDragModels = [
    ...new Set(input.regimes.map((regime) => regime.inducedDragModel ?? "disabled")),
  ];
  const inducedDragModel: StageFlightPreviewResult["inducedDragModel"] =
    inducedDragModels.length === 1 ? inducedDragModels[0]! : "mixed";
  const inducedDragFactors = [
    ...new Set(input.regimes.map((regime) => regime.inducedDragFactor ?? 0)),
  ];
  const inducedDragFactor: StageFlightPreviewResult["inducedDragFactor"] =
    inducedDragFactors.length === 1 ? inducedDragFactors[0]! : "mixed";
  const loads = createPreliminaryRocketLoadModel({
    body: staging.body,
    propulsion: staging.propulsion,
    aerodynamicsAt: aerodynamics.aerodynamicsAt,
    environmentAt: input.environmentAt,
    launchAltitudeM: input.environmentAt ? undefined : input.launchAltitudeM,
    windProfile: input.environmentAt ? undefined : input.windProfile,
  });
  const recovery: RecoverySystemModel | null = input.recoveryDevices && input.recoveryDevices.length > 0
    ? createRecoverySystemModel({
        devices: input.recoveryDevices,
        environmentAt: input.environmentAt,
        launchAltitudeM: input.environmentAt ? undefined : input.launchAltitudeM,
        windProfile: input.environmentAt ? undefined : input.windProfile,
        centerOfMassBodyM: (state) => staging.evaluate(state).massProperties.centerOfMassM,
      })
    : null;
  const combinedLoads = (state: RigidBodyState): RigidBodyLoads =>
    combineRigidBodyLoads(loads.loads(state), recovery?.loads(state) ?? {});

  /**
   * Compose fresh retained-stage loads for the independent shared-track mode.
   * The coupled solver supplies gravity separately, so the preliminary model's
   * world gravity term is intentionally omitted here. Propulsion, stage-aware
   * aerodynamics, and recovery force/moment terms remain caller-supplied loads.
   */
  const independentRetainedLoads = (state: RigidBodyState): RigidBodyLoads => {
    const stagedLoads = loads.evaluate(state).loads;
    const recoveryLoads = recovery?.loads(state) ?? {};
    return {
      ...(stagedLoads.forceBodyN ? { forceBodyN: stagedLoads.forceBodyN } : {}),
      ...(recoveryLoads.forceWorldN ? { forceWorldN: recoveryLoads.forceWorldN } : {}),
      momentBodyNm: addVectors(
        stagedLoads.momentBodyNm ?? ZERO_VECTOR,
        recoveryLoads.momentBodyNm ?? ZERO_VECTOR,
      ),
    };
  };

  const baseState = defaultInitialState(input);
  const initialState = initializeMultiStageState(
    baseState,
    initiallyIgnitedStageIds,
  );
  const initialEvaluation = staging.evaluate(initialState);
  const configuredStageById = new Map(input.stages.map((stage) => [stage.id, stage]));
  const clusterDiagnostics: readonly StageFlightClusterDiagnostic[] =
    initialEvaluation.stages
      .filter(
        (stage) =>
          stage.motors.length > 1 ||
          stage.motors.some((motor) => motor.phase === "ignition-failed"),
      )
      .map((stage): StageFlightClusterDiagnostic => {
        const failedMotors = stage.motors.filter(
          (motor) => motor.phase === "ignition-failed",
        );
        const failedMotorCount = failedMotors.length;
        const configuredStage = configuredStageById.get(stage.id);
        const configuredMotors = configuredStage
          ? configuredPhysicalMotors(configuredStage)
          : [];
        const motorPeakThrusts = configuredMotors.map((motor, index) => ({
          id: motor.id,
          name: motor.name,
          peakThrustN: motorPeakThrustN(motor),
          ignitionFailure:
            motor.ignitionFailure === true ||
            stage.motors[index]?.phase === "ignition-failed",
        }));
        const availablePeakThrustsN = motorPeakThrusts
          .filter((motor) => !motor.ignitionFailure)
          .map((motor) => motor.peakThrustN);
        const peakCurveThrustN = availablePeakThrustsN.reduce(
          (sum, thrustN) => sum + thrustN,
          0,
        );
        const peakCurveSpreadN = availablePeakThrustsN.length > 1
          ? Math.max(...availablePeakThrustsN) - Math.min(...availablePeakThrustsN)
          : null;
        const peakCurveSpreadFraction = peakSpreadFraction(availablePeakThrustsN);
        const status: StageFlightClusterDiagnostic["status"] =
          failedMotorCount === 0
            ? "nominal"
            : failedMotorCount === stage.motors.length
              ? "failed"
              : "watch";
        const baseNote = stage.ignitionFailed
          ? "Stage-level ignition failure is armed; all motor propellant remains attached."
          : failedMotorCount === stage.motors.length
            ? "All motor instances are ignition-failed; the stage retains its propellant and has no powered thrust."
            : failedMotorCount > 0
              ? "A partial cluster failure is configured; retained propellant and off-axis imbalance remain in scope."
              : "All motor instances are available at pad initialization; no deterministic cluster failure is configured.";
        const note = peakCurveSpreadFraction === null
          ? baseNote
          : `${baseNote} Available individual thrust-curve peaks span ${(peakCurveSpreadFraction * 100).toFixed(1)}%; this is not a synchronized net-force or flight-safety margin.`;
        return {
          stageId: stage.id,
          stageName: stage.name,
          motorCount: stage.motors.length,
          failedMotorCount,
          activeMotorCount: stage.motors.length - failedMotorCount,
          attachedPropellantMassKg: stage.propellantMassKg,
          failedPropellantMassKg: failedMotors.reduce(
            (sum, motor) => sum + motor.propellantMassKg,
            0,
          ),
          peakCurveThrustN,
          peakCurveSpreadN,
          peakCurveSpreadFraction,
          motorPeakThrusts,
          status,
          note,
        };
      });
  const effectiveEvents = (input.events ?? []).map((event) =>
    bindMeasuredSeparationImpulseEvent(event, staging),
  );
  const effectiveStateEvents = (input.stateEvents ?? []).map((event) =>
    bindMeasuredSeparationImpulseEvent(event, staging),
  );
  const scheduledTimesS = [
    ...new Set(
      effectiveEvents
        .map((event) => event.timeS)
        .filter((timeS) => Number.isFinite(timeS) && timeS >= 0),
    ),
  ];
  const sourceMotorsById = new Map<string, MultiStageMotor>();
  for (const stage of input.stages) {
    for (const motor of stage.motors) sourceMotorsById.set(motor.id, motor);
    for (const instance of stage.instances ?? []) {
      for (const motor of instance.motors) sourceMotorsById.set(motor.id, motor);
    }
  }
  const runAtTimeStep = (timeStepS: number): StageFlightRun => {
    const rail = input.launchRail
      ? simulateRailGuidedLaunch({
          body: staging.body,
          initialState,
          durationS: input.durationS,
          timeStepS,
          loads: combinedLoads,
          rail: input.launchRail,
          scheduledTimesS,
          events: effectiveEvents,
          stateEvents: effectiveStateEvents,
          maximumRailSteps: input.launchRailMaximumSteps,
          integration: input.integration,
        })
      : null;
    const simulation = rail?.freeFlight ?? (input.launchRail
      ? null
      : simulateRigidBody6D({
          body: staging.body,
          initialState,
          durationS: input.durationS,
          timeStepS,
          loads: combinedLoads,
          events: effectiveEvents,
          stateEvents: effectiveStateEvents,
          scheduledTimesS,
          integration: input.integration,
        }));
    const simulationTrace = rail?.trace ?? simulation?.trace ?? [];
    const authoritySampleInputs: GimbalControlAuthoritySampleInput[] = [];
    const traceWithoutGimbalAuthority = simulationTrace.map((state): StageFlightTracePoint => {
      const evaluation = staging.evaluate(state);
      const loadEvaluation = loads.evaluate(state);
      const recoveryEvaluation = recovery?.evaluate(state);
      const thrustForceWorldN = rotateBodyToWorld(
        state.orientationBodyToWorld,
        loadEvaluation.diagnostics.propulsionForceBodyN,
      );
      const aerodynamicForceWorldN = rotateBodyToWorld(
        state.orientationBodyToWorld,
        loadEvaluation.diagnostics.aerodynamicForceBodyN,
      );
      const gravityForceWorldN = {
        x: 0,
        y: 0,
        z: -loadEvaluation.diagnostics.gravityN,
      };
      const recoveryForceWorldN = recoveryEvaluation?.loads.forceWorldN ?? ZERO_VECTOR;
      const netForceWorldN = addVectors(
        addVectors(thrustForceWorldN, aerodynamicForceWorldN),
        addVectors(gravityForceWorldN, recoveryForceWorldN),
      );
      const netAccelerationBodyMps2 = rotateWorldToBody(
        state.orientationBodyToWorld,
        scaleVector(netForceWorldN, 1 / evaluation.massProperties.massKg),
      );
      const noseDirectionWorld = rotateBodyToWorld(
        state.orientationBodyToWorld,
        { x: -1, y: 0, z: 0 },
      );
      const attitudeTiltRad = Math.acos(
        Math.min(1, Math.max(-1, dot(noseDirectionWorld, { x: 0, y: 0, z: 1 }))),
      );
      const evaluatedMotors = evaluation.stages.flatMap((stageEvaluation) =>
        stageEvaluation.instances.length > 0
          ? stageEvaluation.instances.flatMap((instanceEvaluation) =>
              instanceEvaluation.motors.map((motorEvaluation) => ({ motorEvaluation })),
            )
          : stageEvaluation.motors.map((motorEvaluation) => ({ motorEvaluation })),
      );
      authoritySampleInputs.push({
        timeS: state.timeS,
        massProperties: evaluation.massProperties,
        motors: evaluatedMotors.flatMap(({ motorEvaluation }) => {
          const sourceMotor = sourceMotorsById.get(motorEvaluation.id);
          if (!sourceMotor) return [];
          return [{
            id: motorEvaluation.id,
            name: motorEvaluation.name,
            thrustN: motorEvaluation.thrustN,
            thrustAxisBody: motorEvaluation.thrustAxisBody,
            thrustApplicationPointBodyM: sourceMotor.thrustApplicationPointBodyM,
            gimbalConfigured: Boolean(sourceMotor.thrustAxisSchedule?.length),
            ...(sourceMotor.gimbalResponseTimeS === undefined
              ? {}
              : { responseTimeS: sourceMotor.gimbalResponseTimeS }),
          }];
        }),
        aerodynamicMomentBodyNm: addVectors(
          loadEvaluation.diagnostics.aerodynamicStaticMomentBodyNm,
          loadEvaluation.diagnostics.aerodynamicDampingMomentBodyNm,
        ),
      });
      return {
        timeS: state.timeS,
        altitudeAglM: state.positionWorldM.z,
        speedMps: magnitude(state.velocityWorldMps),
        velocityWorldMps: state.velocityWorldMps,
        mach: loadEvaluation.diagnostics.mach,
        angleOfAttackRad: loadEvaluation.diagnostics.angleOfAttackRad,
        sideslipRad: loadEvaluation.diagnostics.sideslipRad,
        dynamicPressurePa: loadEvaluation.diagnostics.dynamicPressurePa,
        dragN: loadEvaluation.diagnostics.dragN,
        aerodynamicForceN: magnitude(loadEvaluation.diagnostics.aerodynamicForceBodyN),
        aerodynamicMomentNm: magnitude(
          addVectors(
            loadEvaluation.diagnostics.aerodynamicStaticMomentBodyNm,
            loadEvaluation.diagnostics.aerodynamicDampingMomentBodyNm,
          ),
        ),
        aerodynamicDampingMomentNm: magnitude(
          loadEvaluation.diagnostics.aerodynamicDampingMomentBodyNm,
        ),
        centerOfPressureXM: loadEvaluation.diagnostics.centerOfPressureXM,
        centerOfMassXM: loadEvaluation.diagnostics.centerOfMassXM,
        staticMarginCalibers: loadEvaluation.diagnostics.staticMarginCalibers,
        normalForceSlopePerRad: loadEvaluation.diagnostics.normalForceSlopePerRad,
        orientationBodyToWorld: state.orientationBodyToWorld,
        angularVelocityBodyRadS: state.angularVelocityBodyRadS,
        attitudeTiltRad,
        angularRateRadS: magnitude(state.angularVelocityBodyRadS),
        directForceApplied: loadEvaluation.diagnostics.directForceApplied,
        directMomentApplied: loadEvaluation.diagnostics.directMomentApplied,
        coefficientBasis: loadEvaluation.diagnostics.coefficientBasis,
        thrustForceWorldN,
        aerodynamicForceWorldN,
        gravityForceWorldN,
        recoveryForceWorldN,
        recoveryDragN: recoveryEvaluation?.devices.reduce((sum, device) => sum + device.dragN, 0) ?? 0,
        recoveryEffectiveAreaM2: recoveryEvaluation?.devices.reduce((sum, device) => sum + device.effectiveAreaM2, 0) ?? 0,
        massKg: evaluation.massProperties.massKg,
        thrustN: evaluation.totalThrustN,
        axialAccelerationMps2: dot(
          scaleVector(netForceWorldN, 1 / evaluation.massProperties.massKg),
          noseDirectionWorld,
        ),
        transverseAccelerationMps2: Math.hypot(
          netAccelerationBodyMps2.y,
          netAccelerationBodyMps2.z,
        ),
        attachedStageIds: [...evaluation.attachedStageIds],
      };
    });
    const gimbalControlAuthority = analyzeGimbalControlAuthority(authoritySampleInputs);
    const trace = traceWithoutGimbalAuthority.map((point, index) => {
      const authoritySample = gimbalControlAuthority.samples[index];
      return {
        ...point,
        ...(authoritySample
          ? {
              gimbalControlForceN: authoritySample.controlForceN,
              gimbalControlMomentNm: authoritySample.controlMomentNm,
              gimbalControlAngularAccelerationRadS2: authoritySample.controlAngularAccelerationRadS2,
              gimbalActiveMotorCount: authoritySample.gimballedMotorCount,
              gimbalControlToAerodynamicMomentRatio: authoritySample.controlToAerodynamicMomentRatio,
            }
          : {}),
      };
    });
    const maxAltitudeAglM = trace.length > 0
      ? Math.max(...trace.map((point) => point.altitudeAglM))
      : 0;
    const maxSpeedMps = trace.length > 0
      ? Math.max(...trace.map((point) => point.speedMps))
      : 0;
    const apogeeIndex = trace.reduce(
      (bestIndex, point, index, points) =>
        point.altitudeAglM > points[bestIndex].altitudeAglM ? index : bestIndex,
      0,
    );
    const appliedEvents = rail?.appliedEvents ?? simulation?.events ?? [];
    const events = [
      ...(rail?.events.map((event, index): StageFlightEvent => ({
        id: `launch-rail-${event.type}-${index}`,
        label: event.label,
        kind: "rail",
        timeS: event.timeS,
        attachedStageIdsBefore: [...stageIdsAt(staging, event.state)],
        attachedStageIdsAfter: [...stageIdsAt(staging, event.state)],
        detachedStageIds: [],
        attachedStageInstanceIdsBefore: [...stageInstanceIdsAt(staging, event.state)],
        attachedStageInstanceIdsAfter: [...stageInstanceIdsAt(staging, event.state)],
        detachedStageInstanceIds: [],
        missionKind: "rail",
        priority: 0,
      })) ?? []),
      ...appliedEvents.map((event) =>
        summarizeEvent(staging, event),
      ),
    ].sort((a, b) => a.timeS - b.timeS || a.priority - b.priority || a.id.localeCompare(b.id));
    return {
      simulation,
      rail,
      trace,
      gimbalControlAuthority,
      events,
      maxAltitudeAglM,
      maxSpeedMps,
      timeToApogeeS: trace[apogeeIndex]?.timeS ?? 0,
      finalState: rail?.finalState ?? simulation?.finalState ?? simulationTrace.at(-1) ?? initialState,
      appliedEvents,
    };
  };

  const primaryRun = runAtTimeStep(input.timeStepS);
  const forceBudget = computeStageFlightForceBudget(primaryRun.trace, {
    stageLabels: Object.fromEntries(input.stages.map((stage) => [stage.id, stage.name])),
  });
  const vectorBudget = computeStageFlightVectorBudget(
    primaryRun.trace,
    primaryRun.appliedEvents.map((event) => ({
      id: event.id,
      timeS: event.timeS,
      deltaVWorldMps: subtractVectors(
        event.stateAfter.velocityWorldMps,
        event.stateBefore.velocityWorldMps,
      ),
    })),
    {
      ...(input.launchRail
        ? {
            additionalWarnings: [
              "Launch-rail reaction and guide-contact forces are not recorded as separate vector trace components; their effect appears in the closure residual.",
            ],
          }
        : {}),
    },
  );
  const missionLossBudget = computeMissionLossBudget(
    primaryRun.trace,
    primaryRun.appliedEvents.map((event) => ({
      id: event.id,
      timeS: event.timeS,
      deltaVWorldMps: subtractVectors(
        event.stateAfter.velocityWorldMps,
        event.stateBefore.velocityWorldMps,
      ),
    })),
    {
      ...(input.launchRail
        ? {
            additionalWarnings: [
              "Launch-rail reaction and guide-contact forces are not recorded as separate thrust-axis loss components; inspect the vector-budget closure residual.",
            ],
          }
        : {}),
    },
  );
  const missionDeltaVBridge = computeMissionDeltaVBridge({
    missionMassRatio,
    missionLossBudget,
  });
  const eventAllocation: MissionEventAllocation =
    primaryRun.simulation?.eventAllocation ??
    primaryRun.rail?.freeFlight?.eventAllocation ??
    allocateMissionEventPlan([
      ...effectiveEvents.map((event) => ({
        id: event.id,
        label: event.label,
        kind: event.kind,
        timeS: event.timeS,
        priority: event.priority,
        dependsOn: event.dependsOn,
        mutualExclusionKey: event.mutualExclusionKey,
      })),
      ...effectiveStateEvents.map((event) => ({
        id: event.id,
        label: event.label,
        kind: event.kind,
        priority: event.priority,
        dependsOn: event.dependsOn,
        mutualExclusionKey: event.mutualExclusionKey,
      })),
    ]).allocation;
  let refinedRun: StageFlightRun | null = null;
  let convergenceFailure: string | null = null;
  try {
    refinedRun = runAtTimeStep(input.timeStepS / 2);
  } catch (error) {
    convergenceFailure = error instanceof Error ? error.message : "unknown error";
  }
  const convergenceBase = assessStageFlightConvergence(
    primaryRun,
    refinedRun,
    input.timeStepS,
  );
  const convergence = convergenceFailure
    ? {
        ...convergenceBase,
        warnings: [
          ...convergenceBase.warnings,
          `Half-step convergence rerun failed: ${convergenceFailure}`,
        ],
      }
    : convergenceBase;
  const separatedBodies: SeparatedBodyTrajectory[] = [];
  const separationDynamics: SeparationDynamicsResult[] = [];
  const separationImpulseSolutions: CoupledSeparationImpulseResult[] = [];
  const coupledBodySeeds: CoupledMultiBodyFlightBodyInput[] = [];
  let retainedBodyCoupledSeed: CoupledMultiBodyFlightBodyInput | null = null;
  let retainedBodyStagingHandoffs: RigidBodyState[] = [];
  const retainedBodyVelocityImpulseEvents: CoupledMultiBodyVelocityImpulseEvent[] = [];
  let firstSeparationTimeS: number | null = null;
  let firstDetachedBodyId: string | null = null;
  let retainedBodyLaterSeparationAssumptionAdded = false;
  const retainedCoupledTrackAssumptions: string[] = [];
  const separatedBodyWarnings: string[] = [];
  const retainedBodyTrace = primaryRun.rail?.trace ?? primaryRun.simulation?.trace ?? [];
  const retainedLoadTrace = primaryRun.trace;
  const stageNames = new Map(input.stages.map((stage) => [stage.id, stage.name]));
  const stageInstanceNames = new Map<string, string>(
    input.stages.flatMap((stage) =>
      (stage.instances ?? [{ id: stage.id, name: stage.name }]).map((instance) => [
        `${stage.id}/${instance.id}`,
        instance.name,
      ] as const),
    ),
  );
  const spawnedStageInstances = new Set<string>();
  for (const event of primaryRun.appliedEvents) {
    const before = staging.evaluate(event.stateBefore);
    const detachedStageInstances = detachedStageInstancesBetween(
      staging,
      event.stateBefore,
      event.stateAfter,
    );
    const detachedStageMassEntries = detachedStageInstances.map(({ stageId, instanceId }) => ({
      stageId,
      instanceId,
      massProperties: staging.stageMassProperties(event.stateBefore, stageId, instanceId),
    }));
    const detachedMassKg = detachedStageMassEntries.reduce(
      (total, entry) => total + entry.massProperties.massKg,
      0,
    );
    const retainedMassPropertiesAfterSeparation = staging.evaluate(
      event.stateAfter,
    ).massProperties;
    const detachedBodyDeltaVBodyMps = event.separationDeltaVBodyMps && detachedMassKg > 0
      ? scaleVector(
          event.separationDeltaVBodyMps,
          -retainedMassPropertiesAfterSeparation.massKg / detachedMassKg,
        )
      : undefined;
    if (detachedStageMassEntries.length > 0) {
      if (firstSeparationTimeS === null) {
        firstSeparationTimeS = event.timeS;
        const firstDetachedEntry = detachedStageMassEntries[0]!;
        firstDetachedBodyId = `${firstDetachedEntry.stageId}/${firstDetachedEntry.instanceId}`;
      }
      const separationInput = {
        eventId: event.id,
        releaseState: event.stateBefore,
        retainedStateAfter: event.stateAfter,
        retainedMassPropertiesBefore: before.massProperties,
        retainedMassPropertiesAfter: retainedMassPropertiesAfterSeparation,
        configuredRetainedDeltaVBodyMps: event.separationDeltaVBodyMps,
        configuredRetainedImpulseBodyNs: event.separationImpulseBodyNs,
        detachedBodies: detachedStageMassEntries.map((entry) => ({
          id: `${entry.stageId}/${entry.instanceId}`,
          massProperties: entry.massProperties,
          deltaVBodyMps: detachedBodyDeltaVBodyMps ?? ZERO_VECTOR,
        })),
      } as const;
      try {
        separationDynamics.push(
          auditSeparationDynamics(separationInput),
        );
      } catch (error) {
        separatedBodyWarnings.push(
          `${event.id} separation impulse audit unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
      try {
        separationImpulseSolutions.push(
          solveCoupledSeparationImpulse(separationInput),
        );
      } catch (error) {
        separatedBodyWarnings.push(
          `${event.id} coupled separation impulse allocation unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
    if (
      input.coupledMultiBodyIncludeRetainedBody &&
      retainedBodyCoupledSeed !== null &&
      retainedBodyMode === "independent-mass-propulsion"
    ) {
      // Keep every later discrete staging handoff available to the dynamic
      // retained callbacks. The coupled solver owns position/velocity, while
      // this authoritative event state supplies active-stage topology.
      retainedBodyStagingHandoffs.push(event.stateAfter);
      if (detachedStageMassEntries.length > 0) {
        const retainedDeltaVBodyMps = event.separationDeltaVBodyMps ?? rotateWorldToBody(
          event.stateBefore.orientationBodyToWorld,
          subtractVectors(
            event.stateAfter.velocityWorldMps,
            event.stateBefore.velocityWorldMps,
          ),
        );
        if (magnitude(retainedDeltaVBodyMps) > 1e-12) {
          retainedBodyVelocityImpulseEvents.push({
            id: `retained-${event.id}`,
            bodyId: "retained-vehicle",
            timeS: event.timeS,
            deltaVBodyMps: retainedDeltaVBodyMps,
            sourceEventId: event.id,
          });
        }
      }
    }
    if (input.coupledMultiBodyIncludeRetainedBody && detachedStageMassEntries.length > 0) {
      if (retainedBodyCoupledSeed === null) {
        const retainedEnvelopeRadiusM = input.separationEnvelopeRadiiM?.["retained-vehicle"];
        retainedBodyStagingHandoffs = [event.stateAfter];
        const retainedStateAt = (state: RigidBodyState): RigidBodyState => {
          let latestHandoff = retainedBodyStagingHandoffs[0]!;
          for (const handoff of retainedBodyStagingHandoffs) {
            if (handoff.timeS <= state.timeS + 1e-9) latestHandoff = handoff;
          }
          return {
            ...latestHandoff,
            ...state,
            ...(latestHandoff.discreteState !== undefined
              ? { discreteState: latestHandoff.discreteState }
              : {}),
          };
        };
        retainedBodyCoupledSeed = {
          id: "retained-vehicle",
          label: retainedBodyMode === "independent-mass-propulsion"
            ? "Retained vehicle (independent mass + fresh aero/recovery)"
            : "Retained vehicle (trace replay)",
          massKg: retainedMassPropertiesAfterSeparation.massKg,
          releaseTimeS: event.timeS,
          releasePositionWorldM: event.stateAfter.positionWorldM,
          releaseVelocityWorldMps: event.stateAfter.velocityWorldMps,
          ...(retainedEnvelopeRadiusM !== undefined && retainedEnvelopeRadiusM !== null
            ? { envelopeRadiusM: retainedEnvelopeRadiusM }
            : {}),
          rigidBody: {
            orientationBodyToWorld: event.stateAfter.orientationBodyToWorld,
            angularVelocityBodyRadS: event.stateAfter.angularVelocityBodyRadS,
            inertiaBodyKgM2: retainedMassPropertiesAfterSeparation.inertiaAtCenterKgM2,
            ...(retainedBodyMode === "independent-mass-propulsion"
              ? {
                  propertiesAt: (state: RigidBodyState) => staging.body(retainedStateAt(state)),
                  loads: (state: RigidBodyState): RigidBodyLoads => independentRetainedLoads(retainedStateAt(state)),
                }
              : retainedLoadTrace.length > 0
                ? {
                    loads: (state: RigidBodyState): RigidBodyLoads => ({
                      forceWorldN: interpolateStageTraceNonGravityForceWorldN(
                        retainedLoadTrace,
                        state.timeS,
                      ),
                    }),
                  }
                : {}),
          },
        };
        if (retainedBodyMode === "independent-mass-propulsion") {
          retainedCoupledTrackAssumptions.push(
            "The retained vehicle in the shared coupled track uses the first separation event as a state handoff, then evaluates clean-room staging mass/inertia plus propulsion, active-topology aerodynamics, and recovery callbacks at every shared-grid substep.",
            "The coupled solver supplies gravity and optional mutual/contact terms; the retained callback omits the preliminary model's duplicate world-gravity term while preserving body-frame propulsion/aero loads and recovery force/moment loads.",
            "Later authoritative staging state handoffs and retained-body velocity impulses are applied at exact shared-grid boundaries; an optional bounded separation-force pulse may be forwarded, while mechanism hardware, plume interaction, and validated stage interference remain outside this branch.",
          );
        } else if (retainedLoadTrace.length > 0) {
          retainedCoupledTrackAssumptions.push(
            "The retained vehicle in the shared coupled track is seeded at the first separation event and replays interpolated thrust, aerodynamic, and recovery translation loads from the authoritative staged trace; coupled gravity, mutual gravity, and envelope contact remain evaluated by the shared solver.",
            "The retained replay track is a translation-load diagnostic, not an independent retained-stage 6DOF rerun: retained-stage propellant flow, fresh aerodynamic evaluation, aerodynamic moments, and later mass-property changes are not re-solved.",
          );
        } else {
          separatedBodyWarnings.push(
            "Retained-vehicle coupled replay was requested, but the authoritative staged trace was empty; the retained seed has no replayed non-gravity loads.",
          );
          retainedCoupledTrackAssumptions.push(
            "The retained coupled seed has no replayed translation loads because the authoritative staged trace was empty; only the shared solver's configured gravity and contact terms remain active.",
          );
        }
      } else if (
        retainedBodyMode === "trace-replay" &&
        !retainedBodyLaterSeparationAssumptionAdded
      ) {
        retainedBodyLaterSeparationAssumptionAdded = true;
        retainedCoupledTrackAssumptions.push(
          "The retained replay seed is frozen at the first separation event; later staging events continue to affect detached branches but are not re-applied to the retained shared-track mass, inertia, or replay-load source.",
        );
      }
    }
    for (const { stageId, instanceId, massProperties } of detachedStageMassEntries) {
      const spawnKey = `${stageId}/${instanceId}`;
      if (spawnedStageInstances.has(spawnKey)) continue;
      const envelopeRadiusM = input.separationEnvelopeRadiiM?.[spawnKey];
      const detachedAero = detachedStageAerodynamicBasis(
        input.components,
        input.regimes,
        stageId,
        massProperties.centerOfMassM.x,
        input.coefficientUncertaintyScale,
        input.coefficientUncertaintyScales,
      );
      const projectedAreaMode = input.releasedBodyDragModel === "attitude-projected-area";
      const coefficientTableMode = input.releasedBodyDragModel === "coefficient-table";
      const detachedCoefficientTableAvailable = Boolean(detachedAero?.aerodynamicBasis?.coefficientTable);
      const useDetachedAerodynamicBasis = Boolean(
        detachedAero?.aerodynamicBasis &&
        (projectedAreaMode || (coefficientTableMode && detachedCoefficientTableAvailable)),
      );
      const selectedDetachedAerodynamicBasis = useDetachedAerodynamicBasis
        ? detachedAero?.aerodynamicBasis
        : undefined;
      if (
        projectedAreaMode &&
        !detachedAero?.attitudeDependentDrag
      ) {
        separatedBodyWarnings.push(
          `${stageId}/${instanceId} projected-area drag unavailable: stage geometry did not provide a positive axisymmetric profile; isotropic point drag remains the fallback.`,
        );
      }
      if (
        projectedAreaMode &&
        detachedAero?.attitudeDependentDrag &&
        !detachedAero.aerodynamicBasis
      ) {
        separatedBodyWarnings.push(
          `${stageId}/${instanceId} static aerodynamic loads unavailable: stage geometry did not produce a positive normal-force basis; projected drag remains active without lift or CP moment.`,
        );
      }
      if (coefficientTableMode && !useDetachedAerodynamicBasis) {
        separatedBodyWarnings.push(
          `${stageId}/${instanceId} coefficient-table loads unavailable: the detached topology has no validated table-backed aerodynamic basis; isotropic point drag remains the fallback.`,
        );
      }
      const stageDefinition = input.stages.find((stage) => stage.id === stageId);
      const detachedRecoveryDevices = stageDefinition?.recoveryDevices;
      try {
        const separatedBody = simulateSeparatedBodyFlight({
            stageId,
            instanceId,
            stageName: stageInstanceNames.get(spawnKey) ?? stageNames.get(stageId) ?? stageId,
            releaseState: event.stateBefore,
            stageMassProperties: massProperties,
            parentCenterOfMassBodyM: before.massProperties.centerOfMassM,
            durationS: input.durationS,
            timeStepS: input.timeStepS,
            launchAltitudeM: input.launchAltitudeM,
            environmentAt: input.environmentAt,
            retainedBodyDeltaVBodyMps: event.separationDeltaVBodyMps,
            detachedBodyDeltaVBodyMps,
            ...(retainedBodyTrace.length > 0 ? { retainedBodyTrace } : {}),
            ...(envelopeRadiusM !== undefined && envelopeRadiusM !== null
              ? { envelopeRadiusM }
              : {}),
            ...(detachedAero
              ? {
                  referenceAreaM2: detachedAero.referenceAreaM2,
                  dragCoefficient: detachedAero.dragCoefficient,
                }
              : {}),
            ...(selectedDetachedAerodynamicBasis
              ? { aerodynamicBasis: selectedDetachedAerodynamicBasis }
              : {}),
            ...(detachedRecoveryDevices && detachedRecoveryDevices.length > 0
              ? { recoveryDevices: detachedRecoveryDevices }
              : {}),
            ...(stageDefinition?.recoveryDeploymentTrigger
              ? {
                  recoveryDeploymentTrigger: stageDefinition.recoveryDeploymentTrigger,
                  recoveryDeploymentAltitudeAglM: stageDefinition.recoveryDeploymentAltitudeAglM,
                  recoveryDeploymentTimeS: stageDefinition.recoveryDeploymentTimeS,
                }
              : {}),
          });
        separatedBodies.push(separatedBody);
        const bodyId = `${stageId}/${instanceId}`;
        const impulseSolution = separationImpulseSolutions.find(
          (solution) => solution.eventId === event.id,
        );
        const solvedBody = impulseSolution?.status === "balanced"
          ? impulseSolution.detachedBodies.find((body) => body.id === bodyId)
          : undefined;
        const velocityAdjustmentWorldMps = solvedBody?.solvedDeltaVWorldMps
          ? {
              x: solvedBody.solvedDeltaVWorldMps.x - separatedBody.detachedBodyDeltaVWorldMps.x,
              y: solvedBody.solvedDeltaVWorldMps.y - separatedBody.detachedBodyDeltaVWorldMps.y,
              z: solvedBody.solvedDeltaVWorldMps.z - separatedBody.detachedBodyDeltaVWorldMps.z,
            }
          : undefined;
        const detachedInitialState = separatedBody.simulation.trace[0] ?? event.stateBefore;
        coupledBodySeeds.push({
          id: bodyId,
          label: instanceId
            ? `${separatedBody.stageName} / ${instanceId}`
            : separatedBody.stageName,
          massKg: massProperties.massKg,
          releaseTimeS: separatedBody.releaseTimeS,
          releasePositionWorldM: separatedBody.releasePositionWorldM,
          releaseVelocityWorldMps: separatedBody.releaseVelocityWorldMps,
          ...(velocityAdjustmentWorldMps && magnitude(velocityAdjustmentWorldMps) > 1e-12
            ? {
                velocityAdjustment: {
                  deltaVWorldMps: velocityAdjustmentWorldMps,
                  sourceEventId: event.id,
                },
              }
            : {}),
          ...(separatedBody.referenceAreaM2 !== undefined && separatedBody.dragCoefficient !== undefined
            ? {
                referenceAreaM2: separatedBody.referenceAreaM2,
                dragCoefficient: separatedBody.dragCoefficient,
              }
            : {}),
          ...(separatedBody.envelopeRadiusM !== undefined
            ? { envelopeRadiusM: separatedBody.envelopeRadiusM }
            : {}),
          ...(projectedAreaMode && detachedAero?.attitudeDependentDrag
            ? { attitudeDependentDrag: detachedAero.attitudeDependentDrag }
            : {}),
          ...(selectedDetachedAerodynamicBasis
            ? { aerodynamicBasis: selectedDetachedAerodynamicBasis }
            : {}),
          rigidBody: {
            orientationBodyToWorld: detachedInitialState.orientationBodyToWorld,
            angularVelocityBodyRadS: detachedInitialState.angularVelocityBodyRadS,
            inertiaBodyKgM2: massProperties.inertiaAtCenterKgM2,
          },
        });
        spawnedStageInstances.add(spawnKey);
      } catch (error) {
        separatedBodyWarnings.push(
          `${stageId} separated-body preview unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
  }
  const resolvedSeparationMechanisms: CoupledMultiBodySeparationForcePulse[] = [
    ...(input.separationMechanisms ?? []),
  ];
  if (configuredSeparationPulse !== undefined) {
    const firstDetachedBodyAvailable = firstDetachedBodyId !== null &&
      coupledBodySeeds.some((body) => body.id === firstDetachedBodyId);
    if (
      firstSeparationTimeS !== null &&
      firstDetachedBodyId !== null &&
      retainedBodyCoupledSeed !== null &&
      firstDetachedBodyAvailable
    ) {
      resolvedSeparationMechanisms.push({
        id: "browser-first-separation-pulse",
        retainedBodyId: "retained-vehicle",
        detachedBodyId: firstDetachedBodyId,
        startTimeS: firstSeparationTimeS + configuredSeparationPulse.startOffsetS,
        durationS: configuredSeparationPulse.durationS,
        relativeDeltaVBodyMps: configuredSeparationPulse.relativeDeltaVBodyMps,
        ...(configuredSeparationPulse.relativeAngularDeltaOmegaBodyRadS
          ? { relativeAngularDeltaOmegaBodyRadS: configuredSeparationPulse.relativeAngularDeltaOmegaBodyRadS }
          : {}),
        profile: configuredSeparationPulse.profile ?? "raised-cosine",
      });
    } else {
      separatedBodyWarnings.push(
        "The configured first-separation pulse was not synthesized because the first detached body did not produce a retained shared-track seed.",
      );
    }
  }
  let coupledMultiBodyFlight: CoupledMultiBodyFlightResult | null = null;
  if (coupledBodySeeds.length > 0) {
    try {
      coupledMultiBodyFlight = simulateCoupledMultiBodyFlight({
        bodies: retainedBodyCoupledSeed
          ? [retainedBodyCoupledSeed, ...coupledBodySeeds]
          : coupledBodySeeds,
        durationS: input.durationS,
        timeStepS: input.timeStepS,
        launchAltitudeM: input.launchAltitudeM,
        environmentAt: input.environmentAt,
        mutualGravity: input.coupledMultiBodyGravity,
        contact: input.coupledMultiBodyContact,
        relativeAeroForceFeedback: input.relativeAeroForceFeedback,
        ...(retainedBodyVelocityImpulseEvents.length > 0
          ? { velocityImpulseEvents: retainedBodyVelocityImpulseEvents }
          : {}),
        ...(resolvedSeparationMechanisms.length > 0
          ? { separationMechanisms: resolvedSeparationMechanisms }
          : {}),
        integration: input.integration,
      });
    } catch (error) {
      separatedBodyWarnings.push(
        `Coupled multi-body flight propagation unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  const multiBodySeparation: MultiBodySeparationResult | null =
    retainedBodyTrace.length > 0 && separatedBodies.length > 0
      ? analyzeMultiBodySeparation({
          bodies: [
            {
              id: "retained-vehicle",
              label: "Retained vehicle",
              releaseTimeS: 0,
              trace: retainedBodyTrace.map((state): SeparationClearanceTracePoint => ({
                timeS: state.timeS,
                positionWorldM: state.positionWorldM,
                velocityWorldMps: state.velocityWorldMps,
              })),
            },
            ...separatedBodies.map((body, index) => ({
              id: `${body.stageId}/${body.instanceId ?? `logical-${index + 1}`}`,
              label: body.instanceId ? `${body.stageName} · ${body.instanceId}` : body.stageName,
              releaseTimeS: body.releaseTimeS,
              trace: body.trace.map((point): SeparationClearanceTracePoint => ({
                timeS: point.timeS,
                positionWorldM: point.positionWorldM,
                velocityWorldMps: point.velocityWorldMps,
              })),
            })),
          ],
        })
      : null;
  const separationEnvelope: SeparationEnvelopeResult | null =
    retainedBodyTrace.length > 0 && separatedBodies.length > 0
      ? analyzeSphericalSeparationEnvelope({
          bodies: [
            {
              id: "retained-vehicle",
              label: "Retained vehicle",
              releaseTimeS: 0,
              envelopeRadiusM: input.separationEnvelopeRadiiM?.["retained-vehicle"],
              trace: retainedBodyTrace.map((state): SeparationClearanceTracePoint => ({
                timeS: state.timeS,
                positionWorldM: state.positionWorldM,
                velocityWorldMps: state.velocityWorldMps,
              })),
            },
            ...separatedBodies.map((body, index) => ({
              id: `${body.stageId}/${body.instanceId ?? `logical-${index + 1}`}`,
              label: body.instanceId ? `${body.stageName} / ${body.instanceId}` : body.stageName,
              releaseTimeS: body.releaseTimeS,
              envelopeRadiusM: body.envelopeRadiusM,
              trace: body.trace.map((point): SeparationClearanceTracePoint => ({
                timeS: point.timeS,
                positionWorldM: point.positionWorldM,
                velocityWorldMps: point.velocityWorldMps,
              })),
            })),
          ],
        })
      : null;
  let separationContact: SeparationContactResult | null = null;
  if (primaryRun.trace.length > 0 && separatedBodies.length > 0) {
    const retainedContactTrace: SeparationContactTracePoint[] = primaryRun.trace.map(
      (point, index) => ({
        // The display trace and the retained rigid-body trace are produced from
        // the same state array; preserving the index avoids silently replacing
        // a mismatched sample with a fabricated origin.
        ...(() => {
          const state = retainedBodyTrace[index];
          if (!state || Math.abs(state.timeS - point.timeS) > 1e-8) {
            throw new Error("retained contact trace lost alignment with the staged state trace");
          }
          return {
            positionWorldM: state.positionWorldM,
          };
        })(),
        timeS: point.timeS,
        velocityWorldMps: point.velocityWorldMps,
        massKg: point.massKg,
      }),
    );
    const detachedContactBodies = coupledMultiBodyFlight
      ? coupledMultiBodyFlight.trajectories
          .filter((trajectory) => trajectory.id !== "retained-vehicle")
          .map((trajectory) => ({
          id: trajectory.id,
          label: trajectory.label,
          releaseTimeS: trajectory.releaseTimeS,
          envelopeRadiusM: trajectory.envelopeRadiusM ?? null,
          massKg: trajectory.massKg,
          trace: trajectory.trace,
          }))
      : separatedBodies.map((body, index) => ({
          id: `${body.stageId}/${body.instanceId ?? `logical-${index + 1}`}`,
          label: body.instanceId ? `${body.stageName} / ${body.instanceId}` : body.stageName,
          releaseTimeS: body.releaseTimeS,
          envelopeRadiusM: body.envelopeRadiusM ?? null,
          massKg: body.massKg,
          trace: body.trace,
        }));
    if (detachedContactBodies.length > 0) {
      try {
        separationContact = analyzeSeparationContact({
          bodies: [
            {
              id: "retained-vehicle",
              label: "Retained vehicle",
              releaseTimeS: retainedContactTrace[0]!.timeS,
              envelopeRadiusM: input.separationEnvelopeRadiiM?.["retained-vehicle"],
              massKg: primaryRun.trace[0]?.massKg ?? null,
              trace: retainedContactTrace,
            },
            ...detachedContactBodies,
          ],
        });
      } catch (error) {
        separatedBodyWarnings.push(
          `Pairwise contact screen unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
  }
  let separationContactLoad: SeparationContactLoadResult | null = null;
  if (separationContact) {
    try {
      separationContactLoad = analyzeSeparationContactLoad(
        separationContact,
        input.separationContactLoad,
      );
    } catch (error) {
      separatedBodyWarnings.push(
        `Contact-load scenario unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  if (
    input.coupledMultiBodyIncludeRetainedBody &&
    coupledBodySeeds.length > 0 &&
    retainedBodyCoupledSeed === null
  ) {
    separatedBodyWarnings.push(
      "Retained-vehicle coupled replay was requested, but no retained seed could be created from the staged separation events.",
    );
  }
  let relativeAeroInteraction: RelativeAeroInteractionResult | null = null;
  if (retainedBodyTrace.length > 0 && separatedBodies.length > 0) {
    const detachedInteractionBodies = coupledMultiBodyFlight
      ? coupledMultiBodyFlight.trajectories
          .filter((trajectory) => trajectory.id !== "retained-vehicle")
          .map((trajectory) => ({
          id: trajectory.id,
          label: trajectory.label,
          releaseTimeS: trajectory.releaseTimeS,
          referenceAreaM2: trajectory.referenceAreaM2,
          envelopeRadiusM: trajectory.envelopeRadiusM,
          trace: trajectory.trace.map((point) => ({
            timeS: point.timeS,
            positionWorldM: point.positionWorldM,
            velocityWorldMps: point.velocityWorldMps,
          })),
          }))
      : separatedBodies.map((body, index) => ({
          id: `${body.stageId}/${body.instanceId ?? `logical-${index + 1}`}`,
          label: body.instanceId ? `${body.stageName} / ${body.instanceId}` : body.stageName,
          releaseTimeS: body.releaseTimeS,
          referenceAreaM2: body.referenceAreaM2,
          envelopeRadiusM: body.envelopeRadiusM,
          trace: body.trace.map((point) => ({
            timeS: point.timeS,
            positionWorldM: point.positionWorldM,
            velocityWorldMps: point.velocityWorldMps,
          })),
        }));
    if (detachedInteractionBodies.length > 0) {
      try {
        relativeAeroInteraction = analyzeRelativeAeroInteraction({
          environmentAt: input.environmentAt,
          options: input.relativeAeroInteraction,
          bodies: [
            {
              id: "retained-vehicle",
              label: "Retained vehicle",
              releaseTimeS: retainedBodyTrace[0]!.timeS,
              envelopeRadiusM: input.separationEnvelopeRadiiM?.["retained-vehicle"],
              trace: retainedBodyTrace.map((state) => ({
                timeS: state.timeS,
                positionWorldM: state.positionWorldM,
                velocityWorldMps: state.velocityWorldMps,
              })),
            },
            ...detachedInteractionBodies,
          ],
        });
      } catch (error) {
        separatedBodyWarnings.push(
          `Relative-flow interaction screen unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
  }
  const warnings = [
    ...(input.additionalWarnings ?? []),
    ...staging.warnings,
    ...aerodynamics.warnings,
    ...loads.warnings,
    ...(recovery?.warnings ?? []),
    ...(primaryRun.rail?.warnings ?? primaryRun.simulation?.warnings ?? []),
    ...eventAllocation.warnings,
    ...convergence.warnings,
    ...separatedBodyWarnings,
    ...(multiBodySeparation?.warnings ?? []),
    ...(coupledMultiBodyFlight?.warnings ?? []),
    ...(separationEnvelope?.warnings ?? []),
    ...(separationContact?.warnings ?? []),
    ...(separationContactLoad?.warnings ?? []),
    ...(relativeAeroInteraction?.warnings ?? []),
    ...separationDynamics.flatMap((audit) => audit.warnings),
    ...separationImpulseSolutions.flatMap((solution) => solution.warnings),
    ...massRatio.warnings,
    ...missionMassRatio.warnings,
    ...forceBudget.warnings,
    ...vectorBudget.warnings,
    ...primaryRun.gimbalControlAuthority.warnings,
    ...missionLossBudget.warnings,
    ...missionDeltaVBridge.warnings,
    ...(configuredSeparationPulse !== undefined && resolvedSeparationMechanisms.every(
      (mechanism) => mechanism.id !== "browser-first-separation-pulse",
    )
      ? ["The configured first-separation pulse was requested but no compatible first separation handoff was available."]
      : []),
  ];
  const assumptions = [
    ...(input.additionalAssumptions ?? []),
    ...staging.assumptions,
    ...aerodynamics.assumptions,
    ...loads.assumptions,
    `Relation normal-force model: ${normalForceModel}; model version ${NORMAL_FORCE_COMPRESSIBILITY_MODEL_VERSION}. Direct force/moment tables remain authoritative and the transonic domain gap is not interpolated.`,
    `Induced-drag polar: ${inducedDragModel}; k = ${inducedDragFactor}; model version ${INDUCED_DRAG_MODEL_VERSION}. The caller-authored C_D,i = k C_N² relation remains an engineering-preview approximation and direct force tables remain authoritative.`,
    ...(recovery?.assumptions ?? []),
    ...(primaryRun.rail?.assumptions ?? primaryRun.simulation?.assumptions ?? []),
    ...(primaryRun.rail?.freeFlight?.assumptions ?? []),
    ...eventAllocation.assumptions,
    ...convergence.assumptions,
    `Explicit separation events spawn a separate ballistic-capable trajectory for each newly detached stage; separated bodies are represented independently; ${separatedBodies.filter((body) => body.recoveryModelVersion !== undefined).length} branch(es) carry configured recovery devices, ${separatedBodies.filter((body) => body.referenceAreaM2 !== undefined && body.dragCoefficient !== undefined).length} branch(es) use bounded isotropic point drag, and ${separatedBodies.filter((body) => body.referenceAreaM2 === undefined || body.dragCoefficient === undefined).length} branch(es) use the gravity-only fallback.`,
    ...(input.releasedBodyDragModel === "attitude-projected-area"
      ? [
          "The shared-grid released-body track uses projected-area attitude drag when a detached stage supplies a positive axisymmetric profile; missing profiles retain the isotropic point-drag or gravity-only fallback.",
          "The stage adapter reuses the selected detached stage Cd for both axial and crossflow CdA because no independent crossflow coefficient is supplied; calibrate this preview basis before relying on it.",
          "When the active stage geometry produces a positive static normal-force basis, the same detached track adds bounded linear normal force, an r x F CP-to-CG moment, and supplied rate damping when available; otherwise projected drag remains a drag-only fallback.",
        ]
      : []),
    ...(input.releasedBodyDragModel === "coefficient-table"
      ? [
          "The released-body track uses the selected validated aerodynamic table at each detached-body sample; declared direct body-axis force/moment volumes take precedence over the relation/projected fallback, and missing table-backed bases retain isotropic point drag.",
        ]
      : []),
    "When one separation event releases multiple physical copies, the equal-and-opposite impulse uses their combined detached mass and assigns one shared detached velocity increment to each copy; individual separation-mechanism impulses are not modeled.",
    "Separated-body previews apply a mass-ratio equal-and-opposite linear-momentum delta-v when the separation event carries a configured retained-body delta-v; a single event releasing multiple copies uses their combined detached mass and assigns one shared detached velocity increment. Separation mechanism dynamics, angular impulse, lift, attitude-dependent aerodynamic torque, plume interaction, aerodynamic interference, and contact/collision response remain outside the model; the separate fixed spherical-envelope screen is only a potential-overlap diagnostic. Detached-stage recovery devices are propagated only when explicitly configured on that stage and remain a deterministic canopy-load approximation.",
    ...(separatedBodies.some((body) => body.recoveryModelVersion !== undefined)
      ? [
          "Detached recovery commands use each stage's configured apogee, descending-altitude, or mission-time trigger; deployment delay, inflation, and optional reefing are carried by the independent recovery-load model rather than copied from the retained vehicle.",
        ]
      : []),
    ...(coupledMultiBodyFlight
      ? [
          "The shared-grid detached-body track applies event-level velocity corrections only when the associated impulse allocator is balanced; the independent detached 6DOF branches remain on their baseline release states.",
          ...retainedCoupledTrackAssumptions,
          ...(resolvedSeparationMechanisms.some(
            (mechanism) => mechanism.id === "browser-first-separation-pulse",
          )
            ? [
            "The browser first-separation pulse is synthesized against the first detached stage instance, begins at the first authoritative separation time plus the configured offset, and applies along the retained vehicle's +X body axis. When configured, its angular target is along the retained vehicle's +Y body axis and is converted through the sampled retained/detached inertia tensors into an equal-and-opposite torque pair. This remains a bounded translational/angular mechanism preview; springs, pyrotechnic timing, plume interaction, structural flex, joint calibration, and hardware validation remain outside the model.",
              ]
            : []),
          ...(coupledMultiBodyFlight.contact.enabled
            ? [
                ...(retainedBodyCoupledSeed
                  ? [
                      "The shared-grid contact branch applies bounded equal-and-opposite spherical-envelope normal forces between active released bodies with positive radii, including the optional retained replay seed; friction, off-centre moments, deformation, plume interaction, and aerodynamic interference remain outside this preview.",
                    ]
                  : [
                      "The shared-grid contact branch applies bounded equal-and-opposite spherical-envelope normal forces only between active detached bodies with positive radii; retained-vehicle contact, friction, off-centre moments, deformation, plume interaction, and aerodynamic interference remain outside this preview.",
                    ]),
              ]
            : []),
        ]
      : []),
    ...(multiBodySeparation?.assumptions ?? []),
    ...(coupledMultiBodyFlight?.assumptions ?? []),
    ...(separationEnvelope?.assumptions ?? []),
    ...(separationContact?.assumptions ?? []),
    ...(separationContactLoad?.assumptions ?? []),
    ...(relativeAeroInteraction?.assumptions ?? []),
    ...separationDynamics.flatMap((audit) => audit.assumptions),
    ...separationImpulseSolutions.flatMap((solution) => solution.assumptions),
    ...massRatio.assumptions,
    ...missionMassRatio.assumptions,
    ...forceBudget.assumptions,
    ...vectorBudget.assumptions,
    ...primaryRun.gimbalControlAuthority.assumptions,
    ...missionLossBudget.assumptions,
    ...missionDeltaVBridge.assumptions,
    ...(recovery
      ? [
          `Retained-vehicle recovery devices are coupled as body loads through ${recovery.modelVersion}; deployment commands, inflation, and reefing remain deterministic effective-area approximations.`,
        ]
      : []),
    "The returned trajectory is a deterministic engineering preview and is not a flight-safety assessment.",
  ];
  return {
    modelVersion: STAGE_FLIGHT_PREVIEW_MODEL_VERSION,
    validationStatus: STAGE_FLIGHT_PREVIEW_STATUS,
    stagingModelVersion: staging.modelVersion,
    aerodynamicsModelVersion: aerodynamics.modelVersion,
    loadsModelVersion: loads.modelVersion,
    normalForceModel,
    normalForceModelVersion: NORMAL_FORCE_COMPRESSIBILITY_MODEL_VERSION,
    inducedDragModel,
    inducedDragModelVersion: INDUCED_DRAG_MODEL_VERSION,
    inducedDragFactor,
    ...(input.releasedBodyDragModel ? { releasedBodyDragModel: input.releasedBodyDragModel } : {}),
    recoveryModelVersion: recovery?.modelVersion ?? null,
    simulation: primaryRun.simulation,
    rail: primaryRun.rail,
    trace: primaryRun.trace,
    events: primaryRun.events,
    maxAltitudeAglM: primaryRun.maxAltitudeAglM,
    maxSpeedMps: primaryRun.maxSpeedMps,
    timeToApogeeS: primaryRun.timeToApogeeS,
    clusterDiagnostics,
    massRatio,
    missionMassRatio,
    forceBudget,
    vectorBudget,
    gimbalControlAuthority: primaryRun.gimbalControlAuthority,
    missionLossBudget,
    missionDeltaVBridge,
    separatedBodies,
    separationDynamics,
    separationImpulseSolutions,
    multiBodySeparation,
    separationEnvelope,
    separationContact,
    separationContactLoad,
    relativeAeroInteraction,
    coupledMultiBodyFlight,
    convergence,
    eventAllocation,
    warnings: [...new Set(warnings)],
    assumptions: [...new Set(assumptions)],
  };
}

export function stageFlightPreviewInitialState(): RigidBodyState {
  return {
    timeS: 0,
    positionWorldM: ZERO_VECTOR,
    velocityWorldMps: ZERO_VECTOR,
    orientationBodyToWorld: verticalLaunchOrientationBodyToEnu(),
    angularVelocityBodyRadS: ZERO_VECTOR,
  };
}
