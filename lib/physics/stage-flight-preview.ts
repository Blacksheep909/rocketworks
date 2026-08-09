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
  simulateRigidBody6D,
  type AppliedRigidBodyEvent,
  type RigidBodyState,
  type ScheduledRigidBodyEvent,
  type SixDofSimulationResult,
  type StateTriggeredRigidBodyEvent,
} from "./six-dof.ts";
import { magnitude, type Vector3 } from "./linear-algebra.ts";
import type { VehicleComponent } from "./vehicle-components.ts";
import type { WindLayer } from "./curves.ts";
import type { MassProperties } from "./mass-properties.ts";
import {
  simulateSeparatedBodyFlight,
  type SeparatedBodyTrajectory,
} from "./separated-body-flight.ts";

export const STAGE_FLIGHT_PREVIEW_MODEL_VERSION =
  "kestrel-stage-flight-preview-0.4.3";
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
  alwaysActiveGeometryStageIds?: readonly string[];
  separationTransitionWindowS?: number;
  initialState?: Partial<Pick<
    RigidBodyState,
    "positionWorldM" | "velocityWorldMps" | "orientationBodyToWorld" | "angularVelocityBodyRadS" | "discreteState"
  >>;
  events?: readonly ScheduledRigidBodyEvent[];
  stateEvents?: readonly StateTriggeredRigidBodyEvent[];
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
  simulation: SixDofSimulationResult | null;
  rail: RailGuidedLaunchResult | null;
  trace: readonly StageFlightTracePoint[];
  events: readonly StageFlightEvent[];
  maxAltitudeAglM: number;
  maxSpeedMps: number;
  timeToApogeeS: number;
  clusterDiagnostics: readonly StageFlightClusterDiagnostic[];
  separatedBodies: readonly SeparatedBodyTrajectory[];
  convergence: StageFlightConvergenceDiagnostic;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

const ZERO_VECTOR: Vector3 = { x: 0, y: 0, z: 0 };
const STAGE_FLIGHT_CONVERGENCE_RELATIVE_TOLERANCE = 0.02;
const STAGE_FLIGHT_CONVERGENCE_TIME_TOLERANCE_S = 0.05;

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

function summarizeEvent(
  staging: ReturnType<typeof createMultiStageVehicleModel>,
  event: AppliedRigidBodyEvent,
): StageFlightEvent {
  return {
    id: event.id,
    label: event.label,
    kind: event.kind,
    timeS: event.timeS,
    attachedStageIdsBefore: [...stageIdsAt(staging, event.stateBefore)],
    attachedStageIdsAfter: [...stageIdsAt(staging, event.stateAfter)],
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
  });
  const loads = createPreliminaryRocketLoadModel({
    body: staging.body,
    propulsion: staging.propulsion,
    aerodynamicsAt: aerodynamics.aerodynamicsAt,
    environmentAt: input.environmentAt,
    launchAltitudeM: input.environmentAt ? undefined : input.launchAltitudeM,
    windProfile: input.environmentAt ? undefined : input.windProfile,
  });

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
          loads: loads.loads,
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
          loads: loads.loads,
          events: input.events,
          stateEvents: input.stateEvents,
          scheduledTimesS,
        }));
    const simulationTrace = rail?.trace ?? simulation?.trace ?? [];
    const trace = simulationTrace.map((state): StageFlightTracePoint => {
      const evaluation = staging.evaluate(state);
      const loadEvaluation = loads.evaluate(state);
      return {
        timeS: state.timeS,
        altitudeAglM: state.positionWorldM.z,
        speedMps: magnitude(state.velocityWorldMps),
        mach: loadEvaluation.diagnostics.mach,
        angleOfAttackRad: loadEvaluation.diagnostics.angleOfAttackRad,
        sideslipRad: loadEvaluation.diagnostics.sideslipRad,
        dynamicPressurePa: loadEvaluation.diagnostics.dynamicPressurePa,
        dragN: loadEvaluation.diagnostics.dragN,
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
      })) ?? []),
      ...appliedEvents.map((event) =>
        summarizeEvent(staging, event),
      ),
    ].sort((a, b) => a.timeS - b.timeS || a.id.localeCompare(b.id));
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
  const separatedBodyWarnings: string[] = [];
  const stageNames = new Map(input.stages.map((stage) => [stage.id, stage.name]));
  const spawnedStageIds = new Set<string>();
  for (const event of primaryRun.appliedEvents) {
    const before = staging.evaluate(event.stateBefore);
    const after = staging.evaluate(event.stateAfter);
    const detachedStageIds = before.attachedStageIds.filter(
      (stageId) => !after.attachedStageIds.includes(stageId),
    );
    for (const stageId of detachedStageIds) {
      if (spawnedStageIds.has(stageId)) continue;
      try {
        separatedBodies.push(
          simulateSeparatedBodyFlight({
            stageId,
            stageName: stageNames.get(stageId) ?? stageId,
            releaseState: event.stateBefore,
            stageMassProperties: staging.stageMassProperties(event.stateBefore, stageId),
            parentCenterOfMassBodyM: before.massProperties.centerOfMassM,
            durationS: input.durationS,
            timeStepS: input.timeStepS,
            launchAltitudeM: input.launchAltitudeM,
            environmentAt: input.environmentAt,
          }),
        );
        spawnedStageIds.add(stageId);
      } catch (error) {
        separatedBodyWarnings.push(
          `${stageId} separated-body preview unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
  }
  const warnings = [
    ...(input.additionalWarnings ?? []),
    ...staging.warnings,
    ...aerodynamics.warnings,
    ...loads.warnings,
    ...(primaryRun.rail?.warnings ?? primaryRun.simulation?.warnings ?? []),
    ...convergence.warnings,
    ...separatedBodyWarnings,
  ];
  const assumptions = [
    ...(input.additionalAssumptions ?? []),
    ...staging.assumptions,
    ...aerodynamics.assumptions,
    ...loads.assumptions,
    ...(primaryRun.rail?.assumptions ?? primaryRun.simulation?.assumptions ?? []),
    ...(primaryRun.rail?.freeFlight?.assumptions ?? []),
    ...convergence.assumptions,
    "Explicit separation events spawn a separate ballistic gravity-only preview for each newly detached stage; separated bodies are represented independently.",
    "Separated-body previews do not model drag, plume interaction, aerodynamic interference, recovery, collision, clearance, or the equal-and-opposite discarded-body separation impulse.",
    "The returned trajectory is a deterministic engineering preview and is not a flight-safety assessment.",
  ];
  return {
    modelVersion: STAGE_FLIGHT_PREVIEW_MODEL_VERSION,
    validationStatus: STAGE_FLIGHT_PREVIEW_STATUS,
    stagingModelVersion: staging.modelVersion,
    aerodynamicsModelVersion: aerodynamics.modelVersion,
    loadsModelVersion: loads.modelVersion,
    simulation: primaryRun.simulation,
    rail: primaryRun.rail,
    trace: primaryRun.trace,
    events: primaryRun.events,
    maxAltitudeAglM: primaryRun.maxAltitudeAglM,
    maxSpeedMps: primaryRun.maxSpeedMps,
    timeToApogeeS: primaryRun.timeToApogeeS,
    clusterDiagnostics,
    separatedBodies,
    convergence,
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
