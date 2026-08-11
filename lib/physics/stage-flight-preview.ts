import type { LaunchEnvironmentProvider } from "./launch-environment.ts";
import { createMultiStageVehicleModel, initializeMultiStageState, type RocketStage } from "./multi-stage.ts";
import type { StageAerodynamicRegime } from "./stage-aware-aerodynamics.ts";
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
  simulateRigidBody6D,
  type AppliedRigidBodyEvent,
  type RigidBodyLoads,
  type RigidBodyState,
  type ScheduledRigidBodyEvent,
  type SixDofSimulationResult,
  type StateTriggeredRigidBodyEvent,
} from "./six-dof.ts";
import { addVectors, magnitude, scaleVector, type Vector3 } from "./linear-algebra.ts";
import type { VehicleComponent } from "./vehicle-components.ts";
import type { WindLayer } from "./curves.ts";
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
  type CoupledMultiBodyGravityOptions,
  type CoupledMultiBodyFlightResult,
} from "./coupled-multi-body-flight.ts";
import {
  computeStageMassRatio,
  type StageMassRatioResult,
} from "./stage-mass-ratio.ts";
import {
  computeStageFlightForceBudget,
  type StageFlightForceBudgetResult,
} from "./stage-flight-force-budget.ts";

export const STAGE_FLIGHT_PREVIEW_MODEL_VERSION =
  "kestrel-stage-flight-preview-0.18.0";
export const STAGE_FLIGHT_PREVIEW_STATUS =
  "mathematical-regression-tests-only" as const;

export type StageFlightPreviewInput = Readonly<{
  retainedMassProperties: MassProperties;
  components: readonly VehicleComponent[];
  stages: readonly RocketStage[];
  regimes: readonly StageAerodynamicRegime[];
  initiallyIgnitedStageIds: readonly string[];
  durationS: number;
  timeStepS: number;
  launchAltitudeM?: number;
  windProfile?: readonly WindLayer[];
  environmentAt?: LaunchEnvironmentProvider;
  /** Multiplicative drag-only uncertainty applied to the selected aero source. */
  dragCoefficientScale?: number;
  /** Multiplicative uncertainty applied to direct body-axis force coefficients. */
  directForceCoefficientScale?: number;
  /** Multiplicative uncertainty applied to direct body-axis static moment coefficients. */
  directMomentCoefficientScale?: number;
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
  /** Optional pairwise gravity mode for the shared released-body track. */
  coupledMultiBodyGravity?: CoupledMultiBodyGravityOptions;
  launchRail?: LaunchRailConfig;
  launchRailMaximumSteps?: number;
  additionalWarnings?: readonly string[];
  additionalAssumptions?: readonly string[];
}>;

export type StageFlightTracePoint = Readonly<{
  timeS: number;
  altitudeAglM: number;
  speedMps: number;
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
  directForceApplied?: boolean;
  directMomentApplied?: boolean;
  coefficientBasis?: string | null;
  recoveryDragN: number;
  recoveryEffectiveAreaM2: number;
  massKg: number;
  thrustN: number;
  attachedStageIds: readonly string[];
}>;

export type StageFlightClusterDiagnostic = Readonly<{
  stageId: string;
  stageName: string;
  motorCount: number;
  failedMotorCount: number;
  activeMotorCount: number;
  attachedPropellantMassKg: number;
  failedPropellantMassKg: number;
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
  forceBudget: StageFlightForceBudgetResult;
  separatedBodies: readonly SeparatedBodyTrajectory[];
  separationDynamics: readonly SeparationDynamicsResult[];
  separationImpulseSolutions: readonly CoupledSeparationImpulseResult[];
  multiBodySeparation: MultiBodySeparationResult | null;
  separationEnvelope: SeparationEnvelopeResult | null;
  coupledMultiBodyFlight: CoupledMultiBodyFlightResult | null;
  convergence: StageFlightConvergenceDiagnostic;
  eventAllocation: MissionEventAllocation;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

const ZERO_VECTOR: Vector3 = { x: 0, y: 0, z: 0 };
const STAGE_FLIGHT_CONVERGENCE_RELATIVE_TOLERANCE = 0.02;
const STAGE_FLIGHT_CONVERGENCE_TIME_TOLERANCE_S = 0.05;

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
}>;

/**
 * Resolves a deliberately small aerodynamic basis for an independently
 * propagated discarded stage. A topology-specific regime supplies the
 * coefficient (a table is sampled at its declared design point); geometry
 * supplies the largest axisymmetric cross-section when no explicit diameter
 * is present. If either side is unavailable, the caller keeps the documented
 * gravity-only fallback instead of borrowing a full-stack coefficient.
 */
function detachedStageAerodynamicBasis(
  components: readonly VehicleComponent[],
  regimes: readonly StageAerodynamicRegime[],
  stageId: string,
): DetachedStageAerodynamicBasis | null {
  const regime = regimes.find(
    (candidate) =>
      candidate.activeStageIds.length === 1 && candidate.activeStageIds[0] === stageId,
  );
  const referenceAreaM2 = regime?.referenceDiameterM
    ? Math.PI * (regime.referenceDiameterM / 2) ** 2
    : (() => {
        const maximumRadiusM = Math.max(
          0,
          ...components
            .filter(
              (component) =>
                component.stageId === stageId &&
                component.enabled !== false,
            )
            .flatMap((component) =>
              component.kind === "axisymmetric"
                ? component.stations.map((station) => station.outerRadiusM)
                : [],
            ),
        );
        return maximumRadiusM > 0 ? Math.PI * maximumRadiusM ** 2 : undefined;
      })();
  const dragCoefficient = regime?.dragCoefficient ?? (
    regime?.coefficientTable && regime.coefficientTableDesignPoint
      ? regime.coefficientTable.evaluate(regime.coefficientTableDesignPoint).dragCoefficient
      : undefined
  );
  return referenceAreaM2 !== undefined && dragCoefficient !== undefined
    ? { referenceAreaM2, dragCoefficient }
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
  };
}

type StageFlightRun = Readonly<{
  simulation: SixDofSimulationResult | null;
  rail: RailGuidedLaunchResult | null;
  trace: readonly StageFlightTracePoint[];
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
  });
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

  const baseState = defaultInitialState(input);
  const initialState = initializeMultiStageState(
    baseState,
    initiallyIgnitedStageIds,
  );
  const initialEvaluation = staging.evaluate(initialState);
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
        const status: StageFlightClusterDiagnostic["status"] =
          failedMotorCount === 0
            ? "nominal"
            : failedMotorCount === stage.motors.length
              ? "failed"
              : "watch";
        const note = stage.ignitionFailed
          ? "Stage-level ignition failure is armed; all motor propellant remains attached."
          : failedMotorCount === stage.motors.length
            ? "All motor instances are ignition-failed; the stage retains its propellant and has no powered thrust."
            : failedMotorCount > 0
              ? "A partial cluster failure is configured; retained propellant and off-axis imbalance remain in scope."
              : "All motor instances are available at pad initialization; no deterministic cluster failure is configured.";
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
          status,
          note,
        };
      });
  const scheduledTimesS = [
    ...new Set(
      (input.events ?? [])
        .map((event) => event.timeS)
        .filter((timeS) => Number.isFinite(timeS) && timeS >= 0),
    ),
  ];
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
          events: input.events,
          stateEvents: input.stateEvents,
          maximumRailSteps: input.launchRailMaximumSteps,
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
          events: input.events,
          stateEvents: input.stateEvents,
          scheduledTimesS,
        }));
    const simulationTrace = rail?.trace ?? simulation?.trace ?? [];
    const trace = simulationTrace.map((state): StageFlightTracePoint => {
      const evaluation = staging.evaluate(state);
      const loadEvaluation = loads.evaluate(state);
      const recoveryEvaluation = recovery?.evaluate(state);
      return {
        timeS: state.timeS,
        altitudeAglM: state.positionWorldM.z,
        speedMps: magnitude(state.velocityWorldMps),
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
        directForceApplied: loadEvaluation.diagnostics.directForceApplied,
        directMomentApplied: loadEvaluation.diagnostics.directMomentApplied,
        coefficientBasis: loadEvaluation.diagnostics.coefficientBasis,
        recoveryDragN: recoveryEvaluation?.devices.reduce((sum, device) => sum + device.dragN, 0) ?? 0,
        recoveryEffectiveAreaM2: recoveryEvaluation?.devices.reduce((sum, device) => sum + device.effectiveAreaM2, 0) ?? 0,
        massKg: evaluation.massProperties.massKg,
        thrustN: evaluation.totalThrustN,
        attachedStageIds: [...evaluation.attachedStageIds],
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
  const eventAllocation: MissionEventAllocation =
    primaryRun.simulation?.eventAllocation ??
    primaryRun.rail?.freeFlight?.eventAllocation ??
    allocateMissionEventPlan([
      ...(input.events ?? []).map((event) => ({
        id: event.id,
        label: event.label,
        kind: event.kind,
        timeS: event.timeS,
        priority: event.priority,
        dependsOn: event.dependsOn,
        mutualExclusionKey: event.mutualExclusionKey,
      })),
      ...(input.stateEvents ?? []).map((event) => ({
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
  const separatedBodyWarnings: string[] = [];
  const retainedBodyTrace = primaryRun.rail?.trace ?? primaryRun.simulation?.trace ?? [];
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
      const separationInput = {
        eventId: event.id,
        releaseState: event.stateBefore,
        retainedStateAfter: event.stateAfter,
        retainedMassPropertiesBefore: before.massProperties,
        retainedMassPropertiesAfter: retainedMassPropertiesAfterSeparation,
        configuredRetainedDeltaVBodyMps: event.separationDeltaVBodyMps,
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
    for (const { stageId, instanceId, massProperties } of detachedStageMassEntries) {
      const spawnKey = `${stageId}/${instanceId}`;
      if (spawnedStageInstances.has(spawnKey)) continue;
      const envelopeRadiusM = input.separationEnvelopeRadiiM?.[spawnKey];
      const detachedAero = detachedStageAerodynamicBasis(
        input.components,
        input.regimes,
        stageId,
      );
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
            ...(detachedAero ?? {}),
            ...(detachedRecoveryDevices && detachedRecoveryDevices.length > 0
              ? { recoveryDevices: detachedRecoveryDevices }
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
        });
        spawnedStageInstances.add(spawnKey);
      } catch (error) {
        separatedBodyWarnings.push(
          `${stageId} separated-body preview unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
  }
  let coupledMultiBodyFlight: CoupledMultiBodyFlightResult | null = null;
  if (coupledBodySeeds.length > 0) {
    try {
      coupledMultiBodyFlight = simulateCoupledMultiBodyFlight({
        bodies: coupledBodySeeds,
        durationS: input.durationS,
        timeStepS: input.timeStepS,
        launchAltitudeM: input.launchAltitudeM,
        environmentAt: input.environmentAt,
        mutualGravity: input.coupledMultiBodyGravity,
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
    ...separationDynamics.flatMap((audit) => audit.warnings),
    ...separationImpulseSolutions.flatMap((solution) => solution.warnings),
    ...massRatio.warnings,
    ...forceBudget.warnings,
  ];
  const assumptions = [
    ...(input.additionalAssumptions ?? []),
    ...staging.assumptions,
    ...aerodynamics.assumptions,
    ...loads.assumptions,
    ...(recovery?.assumptions ?? []),
    ...(primaryRun.rail?.assumptions ?? primaryRun.simulation?.assumptions ?? []),
    ...(primaryRun.rail?.freeFlight?.assumptions ?? []),
    ...eventAllocation.assumptions,
    ...convergence.assumptions,
    `Explicit separation events spawn a separate ballistic-capable trajectory for each newly detached stage; separated bodies are represented independently; ${separatedBodies.filter((body) => body.recoveryModelVersion !== undefined).length} branch(es) carry configured recovery devices, ${separatedBodies.filter((body) => body.referenceAreaM2 !== undefined && body.dragCoefficient !== undefined).length} branch(es) use bounded isotropic point drag, and ${separatedBodies.filter((body) => body.referenceAreaM2 === undefined || body.dragCoefficient === undefined).length} branch(es) use the gravity-only fallback.`,
    "When one separation event releases multiple physical copies, the equal-and-opposite impulse uses their combined detached mass and assigns one shared detached velocity increment to each copy; individual separation-mechanism impulses are not modeled.",
    "Separated-body previews apply a mass-ratio equal-and-opposite linear-momentum delta-v when the separation event carries a configured retained-body delta-v; a single event releasing multiple copies uses their combined detached mass and assigns one shared detached velocity increment. Separation mechanism dynamics, angular impulse, lift, attitude-dependent aerodynamic torque, plume interaction, aerodynamic interference, and contact/collision response remain outside the model; the separate fixed spherical-envelope screen is only a potential-overlap diagnostic. Detached-stage recovery devices are propagated only when explicitly configured on that stage and remain a deterministic canopy-load approximation.",
    ...(separatedBodies.some((body) => body.recoveryModelVersion !== undefined)
      ? [
          "Detached recovery commands are located at each branch apogee; deployment delay, inflation, and optional reefing are carried by the independent recovery-load model rather than copied from the retained vehicle.",
        ]
      : []),
    ...(coupledMultiBodyFlight
      ? [
          "The shared-grid detached-body track applies event-level velocity corrections only when the associated impulse allocator is balanced; the independent detached 6DOF branches remain on their baseline release states.",
        ]
      : []),
    ...(multiBodySeparation?.assumptions ?? []),
    ...(coupledMultiBodyFlight?.assumptions ?? []),
    ...(separationEnvelope?.assumptions ?? []),
    ...separationDynamics.flatMap((audit) => audit.assumptions),
    ...separationImpulseSolutions.flatMap((solution) => solution.assumptions),
    ...massRatio.assumptions,
    ...forceBudget.assumptions,
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
    forceBudget,
    separatedBodies,
    separationDynamics,
    separationImpulseSolutions,
    multiBodySeparation,
    separationEnvelope,
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
