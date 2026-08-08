import type { LaunchEnvironmentProvider } from "./launch-environment.ts";
import { createMultiStageVehicleModel, initializeMultiStageState, type RocketStage } from "./multi-stage.ts";
import type { StageAerodynamicRegime } from "./stage-aware-aerodynamics.ts";
import { createStageAwareAerodynamicsModel } from "./stage-aware-aerodynamics.ts";
import {
  createPreliminaryRocketLoadModel,
  verticalLaunchOrientationBodyToEnu,
} from "./rocket-loads.ts";
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

export const STAGE_FLIGHT_PREVIEW_MODEL_VERSION =
  "kestrel-stage-flight-preview-0.1.0";
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
    "positionWorldM" | "velocityWorldMps" | "orientationBodyToWorld" | "angularVelocityBodyRadS"
  >>;
  events?: readonly ScheduledRigidBodyEvent[];
  stateEvents?: readonly StateTriggeredRigidBodyEvent[];
}>;

export type StageFlightTracePoint = Readonly<{
  timeS: number;
  altitudeAglM: number;
  speedMps: number;
  massKg: number;
  thrustN: number;
  attachedStageIds: readonly string[];
}>;

export type StageFlightEvent = Readonly<{
  id: string;
  label: string;
  kind: AppliedRigidBodyEvent["kind"];
  timeS: number;
  attachedStageIdsBefore: readonly string[];
  attachedStageIdsAfter: readonly string[];
}>;

export type StageFlightPreviewResult = Readonly<{
  modelVersion: string;
  validationStatus: typeof STAGE_FLIGHT_PREVIEW_STATUS;
  stagingModelVersion: string;
  aerodynamicsModelVersion: string;
  loadsModelVersion: string;
  simulation: SixDofSimulationResult;
  trace: readonly StageFlightTracePoint[];
  events: readonly StageFlightEvent[];
  maxAltitudeAglM: number;
  maxSpeedMps: number;
  timeToApogeeS: number;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

const ZERO_VECTOR: Vector3 = { x: 0, y: 0, z: 0 };

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
  const scheduledTimesS = [
    ...new Set(
      (input.events ?? [])
        .map((event) => event.timeS)
        .filter((timeS) => Number.isFinite(timeS) && timeS >= 0),
    ),
  ];
  const simulation = simulateRigidBody6D({
    body: staging.body,
    initialState,
    durationS: input.durationS,
    timeStepS: input.timeStepS,
    loads: loads.loads,
    events: input.events,
    stateEvents: input.stateEvents,
    scheduledTimesS,
  });
  const trace = simulation.trace.map((state): StageFlightTracePoint => {
    const evaluation = staging.evaluate(state);
    return {
      timeS: state.timeS,
      altitudeAglM: state.positionWorldM.z,
      speedMps: magnitude(state.velocityWorldMps),
      massKg: evaluation.massProperties.massKg,
      thrustN: evaluation.totalThrustN,
      attachedStageIds: [...evaluation.attachedStageIds],
    };
  });
  const maxAltitudeAglM = Math.max(...trace.map((point) => point.altitudeAglM));
  const maxSpeedMps = Math.max(...trace.map((point) => point.speedMps));
  const apogeeIndex = trace.reduce(
    (bestIndex, point, index, points) =>
      point.altitudeAglM > points[bestIndex].altitudeAglM ? index : bestIndex,
    0,
  );
  const warnings = [
    ...staging.warnings,
    ...aerodynamics.warnings,
    ...loads.warnings,
    ...simulation.warnings,
  ];
  const assumptions = [
    ...staging.assumptions,
    ...aerodynamics.assumptions,
    ...loads.assumptions,
    ...simulation.assumptions,
    "The adapter propagates only the retained vehicle; separated bodies are not spawned or clearance-propagated.",
    "The returned trajectory is a deterministic engineering preview and is not a flight-safety assessment.",
  ];
  return {
    modelVersion: STAGE_FLIGHT_PREVIEW_MODEL_VERSION,
    validationStatus: STAGE_FLIGHT_PREVIEW_STATUS,
    stagingModelVersion: staging.modelVersion,
    aerodynamicsModelVersion: aerodynamics.modelVersion,
    loadsModelVersion: loads.modelVersion,
    simulation,
    trace,
    events: simulation.events.map((event) => summarizeEvent(staging, event)),
    maxAltitudeAglM,
    maxSpeedMps,
    timeToApogeeS: trace[apogeeIndex]?.timeS ?? 0,
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
