import { gravityAtAltitude } from "./atmosphere.ts";
import type { LaunchEnvironmentProvider } from "./launch-environment.ts";
import {
  addVectors,
  cross,
  magnitude,
  type Vector3,
} from "./linear-algebra.ts";
import type { MassProperties } from "./mass-properties.ts";
import {
  rotateBodyToWorld,
  simulateRigidBody6D,
  type RigidBodyState,
  type SixDofSimulationResult,
} from "./six-dof.ts";

export const SEPARATED_BODY_FLIGHT_MODEL_VERSION =
  "kestrel-separated-body-flight-0.1.1";
export const SEPARATED_BODY_FLIGHT_STATUS =
  "analytical-component-checks-only" as const;

export type SeparatedBodyTracePoint = Readonly<{
  timeS: number;
  altitudeAglM: number;
  speedMps: number;
  positionWorldM: Vector3;
  velocityWorldMps: Vector3;
}>;

export type SeparatedBodyTrajectory = Readonly<{
  stageId: string;
  stageName: string;
  modelVersion: string;
  validationStatus: typeof SEPARATED_BODY_FLIGHT_STATUS;
  releaseTimeS: number;
  releasePositionWorldM: Vector3;
  releaseVelocityWorldMps: Vector3;
  retainedBodyDeltaVBodyMps: Vector3;
  retainedBodyDeltaVWorldMps: Vector3;
  trace: readonly SeparatedBodyTracePoint[];
  simulation: SixDofSimulationResult;
  maxAltitudeAglM: number;
  maxSpeedMps: number;
  impactTimeS: number | null;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

export type SeparatedBodyFlightInput = Readonly<{
  stageId: string;
  stageName: string;
  releaseState: RigidBodyState;
  stageMassProperties: MassProperties;
  parentCenterOfMassBodyM: Vector3;
  durationS: number;
  timeStepS: number;
  launchAltitudeM?: number;
  environmentAt?: LaunchEnvironmentProvider;
  maximumSteps?: number;
  /** Retained-body separation delta-v annotation; the detached branch is not impulsed. */
  retainedBodyDeltaVBodyMps?: Vector3;
}>;

function validateMassProperties(properties: MassProperties): void {
  if (!Number.isFinite(properties.massKg) || properties.massKg <= 0) {
    throw new Error("separated-body mass must be positive and finite");
  }
  if (
    [
      properties.centerOfMassM.x,
      properties.centerOfMassM.y,
      properties.centerOfMassM.z,
    ].some((value) => !Number.isFinite(value))
  ) {
    throw new Error("separated-body center of mass must be finite");
  }
  const inertia = properties.inertiaAtCenterKgM2;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      if (!Number.isFinite(inertia[row][column])) {
        throw new Error("separated-body inertia must be finite");
      }
    }
  }
}

function releaseStateAtStageCenterOfMass(input: SeparatedBodyFlightInput): RigidBodyState {
  const stageOffsetBodyM = {
    x: input.stageMassProperties.centerOfMassM.x - input.parentCenterOfMassBodyM.x,
    y: input.stageMassProperties.centerOfMassM.y - input.parentCenterOfMassBodyM.y,
    z: input.stageMassProperties.centerOfMassM.z - input.parentCenterOfMassBodyM.z,
  };
  const offsetWorldM = rotateBodyToWorld(
    input.releaseState.orientationBodyToWorld,
    stageOffsetBodyM,
  );
  const angularVelocityWorldRadS = rotateBodyToWorld(
    input.releaseState.orientationBodyToWorld,
    input.releaseState.angularVelocityBodyRadS,
  );
  return {
    ...input.releaseState,
    positionWorldM: addVectors(input.releaseState.positionWorldM, offsetWorldM),
    velocityWorldMps: addVectors(
      input.releaseState.velocityWorldMps,
      cross(angularVelocityWorldRadS, offsetWorldM),
    ),
  };
}

/**
 * Propagates one discarded stage from its exact release state.
 *
 * This is deliberately a ballistic branch: it carries the released stage's
 * center-of-mass offset and rigid-body rate into the shared 6DOF kernel, then
 * applies altitude-dependent gravity and a terminal ground-impact event. It
 * does not invent drag, plume, separation impulse, collision, or recovery
 * models for the discarded body.
 */
export function simulateSeparatedBodyFlight(
  input: SeparatedBodyFlightInput,
): SeparatedBodyTrajectory {
  if (!input.stageId.trim() || !input.stageName.trim()) {
    throw new Error("separated-body identifiers and names cannot be empty");
  }
  if (!Number.isFinite(input.durationS) || input.durationS <= input.releaseState.timeS) {
    throw new Error("separated-body duration must extend beyond release time");
  }
  if (!Number.isFinite(input.timeStepS) || input.timeStepS <= 0) {
    throw new Error("separated-body time step must be positive and finite");
  }
  const retainedBodyDeltaVBodyMps = input.retainedBodyDeltaVBodyMps ?? { x: 0, y: 0, z: 0 };
  if (
    ![
      retainedBodyDeltaVBodyMps.x,
      retainedBodyDeltaVBodyMps.y,
      retainedBodyDeltaVBodyMps.z,
    ].every(Number.isFinite)
  ) {
    throw new Error("retained-body separation delta-v must contain finite coordinates");
  }
  const retainedBodyDeltaVWorldMps = rotateBodyToWorld(
    input.releaseState.orientationBodyToWorld,
    retainedBodyDeltaVBodyMps,
  );
  validateMassProperties(input.stageMassProperties);
  const initialState = releaseStateAtStageCenterOfMass(input);
  const body = {
    massKg: input.stageMassProperties.massKg,
    inertiaBodyKgM2: input.stageMassProperties.inertiaAtCenterKgM2,
  } as const;
  const simulation = simulateRigidBody6D({
    body,
    initialState,
    durationS: input.durationS - input.releaseState.timeS,
    timeStepS: input.timeStepS,
    maximumSteps: input.maximumSteps,
    loads: (state) => {
      const environment = input.environmentAt?.({
        timeS: state.timeS,
        positionWorldM: state.positionWorldM,
      });
      const altitudeAslM =
        environment?.altitudeAslM ??
        (input.launchAltitudeM ?? 0) + state.positionWorldM.z;
      return {
        forceWorldN: {
          x: 0,
          y: 0,
          z: -input.stageMassProperties.massKg * gravityAtAltitude(altitudeAslM),
        },
      };
    },
    stateEvents: [
      {
        id: `${input.stageId}-ballistic-impact`,
        label: `${input.stageName} ballistic impact`,
        direction: "falling",
        value: (state) => state.positionWorldM.z,
        terminal: true,
      },
    ],
  });
  const trace = simulation.trace.map((state): SeparatedBodyTracePoint => ({
    timeS: state.timeS,
    altitudeAglM: state.positionWorldM.z,
    speedMps: magnitude(state.velocityWorldMps),
    positionWorldM: state.positionWorldM,
    velocityWorldMps: state.velocityWorldMps,
  }));
  const maxAltitudeAglM = Math.max(...trace.map((point) => point.altitudeAglM));
  const maxSpeedMps = Math.max(...trace.map((point) => point.speedMps));
  return {
    stageId: input.stageId,
    stageName: input.stageName,
    modelVersion: SEPARATED_BODY_FLIGHT_MODEL_VERSION,
    validationStatus: SEPARATED_BODY_FLIGHT_STATUS,
    releaseTimeS: input.releaseState.timeS,
    releasePositionWorldM: initialState.positionWorldM,
    releaseVelocityWorldMps: initialState.velocityWorldMps,
    retainedBodyDeltaVBodyMps,
    retainedBodyDeltaVWorldMps,
    trace,
    simulation,
    maxAltitudeAglM,
    maxSpeedMps,
    impactTimeS: simulation.termination?.timeS ?? null,
    warnings: [
      "This separated-body branch is ballistic and applies gravity only; drag, plume interaction, aerodynamic interference, recovery, collision, and equal-and-opposite separation impulse are not modeled.",
      "The result is an analytical component check, not a clearance, range-safety, or flight-safety assessment.",
      ...simulation.warnings,
    ],
    assumptions: [
      "The released stage inherits the parent orientation and angular velocity at separation.",
      "The released stage position is offset to its own center of mass and its velocity includes the parent rigid-body angular-rate contribution.",
      "The retained-body separation delta-v is reported from event metadata for traceability; this detached branch starts from the pre-event release state and does not solve the equal-and-opposite discarded-body impulse or a coupled separation mechanism.",
      "Gravity uses the supplied launch-environment altitude when available, otherwise launch altitude plus local AGL position.",
      "A terminal ground-impact crossing is root-found only for the discarded body's ballistic path.",
      ...simulation.assumptions,
    ],
  };
}
