import {
  gravityAtAltitude,
  standardAtmosphere,
} from "./atmosphere.ts";
import type { LaunchEnvironmentProvider } from "./launch-environment.ts";
import {
  addVectors,
  cross,
  magnitude,
  scaleVector,
  subtractVectors,
  ZERO_VECTOR,
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
  "kestrel-separated-body-flight-0.3.0";
export const SEPARATED_BODY_FLIGHT_STATUS =
  "analytical-component-checks-only" as const;

export type SeparatedBodyImpulseModel =
  | "mass-ratio-linear-momentum"
  | "not-modeled";

export type SeparatedBodyTracePoint = Readonly<{
  timeS: number;
  altitudeAglM: number;
  speedMps: number;
  positionWorldM: Vector3;
  velocityWorldMps: Vector3;
}>;

export type SeparatedBodyTrajectory = Readonly<{
  stageId: string;
  instanceId?: string;
  stageName: string;
  modelVersion: string;
  validationStatus: typeof SEPARATED_BODY_FLIGHT_STATUS;
  releaseTimeS: number;
  releasePositionWorldM: Vector3;
  releaseVelocityWorldMps: Vector3;
  retainedBodyDeltaVBodyMps: Vector3;
  retainedBodyDeltaVWorldMps: Vector3;
  detachedBodyDeltaVBodyMps: Vector3;
  detachedBodyDeltaVWorldMps: Vector3;
  separationImpulseModel: SeparatedBodyImpulseModel;
  trace: readonly SeparatedBodyTracePoint[];
  simulation: SixDofSimulationResult;
  maxAltitudeAglM: number;
  maxSpeedMps: number;
  impactTimeS: number | null;
  /** Constant isotropic drag basis when a bounded detached-stage aero basis is available. */
  referenceAreaM2?: number;
  dragCoefficient?: number;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

export type SeparatedBodyFlightInput = Readonly<{
  stageId: string;
  instanceId?: string;
  stageName: string;
  releaseState: RigidBodyState;
  stageMassProperties: MassProperties;
  parentCenterOfMassBodyM: Vector3;
  durationS: number;
  timeStepS: number;
  launchAltitudeM?: number;
  environmentAt?: LaunchEnvironmentProvider;
  maximumSteps?: number;
  /** Retained-body separation delta-v annotation applied to the retained body. */
  retainedBodyDeltaVBodyMps?: Vector3;
  /** Detached-body delta-v from the same separation impulse, when available. */
  detachedBodyDeltaVBodyMps?: Vector3;
  /** Detached-stage reference area for the bounded isotropic drag branch. */
  referenceAreaM2?: number;
  /** Detached-stage constant drag coefficient for the bounded isotropic drag branch. */
  dragCoefficient?: number;
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

function releaseStateAtStageCenterOfMass(
  input: SeparatedBodyFlightInput,
  detachedBodyDeltaVWorldMps: Vector3,
): RigidBodyState {
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
      addVectors(
        input.releaseState.velocityWorldMps,
        cross(angularVelocityWorldRadS, offsetWorldM),
      ),
      detachedBodyDeltaVWorldMps,
    ),
  };
}

/**
 * Propagates one discarded stage from its exact release state.
 *
 * This carries the released stage's center-of-mass offset and rigid-body rate
 * into the shared 6DOF kernel, then applies altitude-dependent gravity and a
 * terminal ground-impact event. When a reference area and constant drag
 * coefficient are supplied, the branch adds isotropic point drag against the
 * environment-relative velocity. A caller may also provide the detached
 * body's delta-v from an equal-and-opposite separation impulse; the stage-flight
 * adapter derives that vector from the retained and detached masses. Without
 * that vector the branch remains a clearly labelled no-impulse fallback.
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
  const detachedBodyDeltaVBodyMps = input.detachedBodyDeltaVBodyMps ?? ZERO_VECTOR;
  if (
    ![
      detachedBodyDeltaVBodyMps.x,
      detachedBodyDeltaVBodyMps.y,
      detachedBodyDeltaVBodyMps.z,
    ].every(Number.isFinite)
  ) {
    throw new Error("detached-body separation delta-v must contain finite coordinates");
  }
  const hasReferenceArea = input.referenceAreaM2 !== undefined;
  const hasDragCoefficient = input.dragCoefficient !== undefined;
  if (hasReferenceArea !== hasDragCoefficient) {
    throw new Error(
      "separated-body drag requires both reference area and drag coefficient",
    );
  }
  if (
    hasReferenceArea &&
    (!Number.isFinite(input.referenceAreaM2) || input.referenceAreaM2! <= 0)
  ) {
    throw new Error("separated-body reference area must be positive and finite");
  }
  if (
    hasDragCoefficient &&
    (!Number.isFinite(input.dragCoefficient) || input.dragCoefficient! <= 0)
  ) {
    throw new Error("separated-body drag coefficient must be positive and finite");
  }
  const retainedBodyDeltaVWorldMps = rotateBodyToWorld(
    input.releaseState.orientationBodyToWorld,
    retainedBodyDeltaVBodyMps,
  );
  const detachedBodyDeltaVWorldMps = rotateBodyToWorld(
    input.releaseState.orientationBodyToWorld,
    detachedBodyDeltaVBodyMps,
  );
  validateMassProperties(input.stageMassProperties);
  const initialState = releaseStateAtStageCenterOfMass(
    input,
    detachedBodyDeltaVWorldMps,
  );
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
      const gravityForceWorldN = {
        x: 0,
        y: 0,
        z: -input.stageMassProperties.massKg * gravityAtAltitude(altitudeAslM),
      };
      if (!hasReferenceArea || !hasDragCoefficient) {
        return { forceWorldN: gravityForceWorldN };
      }
      const atmosphere = environment?.atmosphere ?? standardAtmosphere(altitudeAslM);
      const relativeAirVelocityMps = subtractVectors(
        state.velocityWorldMps,
        environment?.windWorldMps ?? ZERO_VECTOR,
      );
      const relativeAirSpeedMps = magnitude(relativeAirVelocityMps);
      if (!(relativeAirSpeedMps > 0)) {
        return { forceWorldN: gravityForceWorldN };
      }
      const dragMagnitudeN =
        0.5 *
        atmosphere.densityKgM3 *
        relativeAirSpeedMps ** 2 *
        input.dragCoefficient! *
        input.referenceAreaM2!;
      return {
        forceWorldN: addVectors(
          gravityForceWorldN,
          scaleVector(relativeAirVelocityMps, -dragMagnitudeN / relativeAirSpeedMps),
        ),
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
    ...(input.instanceId ? { instanceId: input.instanceId } : {}),
    stageName: input.stageName,
    modelVersion: SEPARATED_BODY_FLIGHT_MODEL_VERSION,
    validationStatus: SEPARATED_BODY_FLIGHT_STATUS,
    releaseTimeS: input.releaseState.timeS,
    releasePositionWorldM: initialState.positionWorldM,
    releaseVelocityWorldMps: initialState.velocityWorldMps,
    retainedBodyDeltaVBodyMps,
    retainedBodyDeltaVWorldMps,
    detachedBodyDeltaVBodyMps,
    detachedBodyDeltaVWorldMps,
    separationImpulseModel: input.detachedBodyDeltaVBodyMps
      ? "mass-ratio-linear-momentum"
      : "not-modeled",
    trace,
    simulation,
    maxAltitudeAglM,
    maxSpeedMps,
    impactTimeS: simulation.termination?.timeS ?? null,
    ...(hasReferenceArea && hasDragCoefficient
      ? {
          referenceAreaM2: input.referenceAreaM2,
          dragCoefficient: input.dragCoefficient,
        }
      : {}),
    warnings: [
      hasReferenceArea && hasDragCoefficient
        ? "This separated-body branch is a ballistic rigid-body propagation with altitude-dependent gravity and isotropic point drag from the supplied constant coefficient and reference area; attitude-dependent aerodynamics, plume interaction, aerodynamic interference, recovery, and collision are not modeled."
        : "This separated-body branch is ballistic and applies gravity only; drag, plume interaction, aerodynamic interference, recovery, and collision are not modeled.",
      input.detachedBodyDeltaVBodyMps
        ? "The detached branch includes the supplied equal-and-opposite linear-momentum delta-v; this is an instantaneous two-body impulse idealization and does not model the separation mechanism, joint dynamics, or angular impulse."
        : "No detached-body separation impulse was supplied; this branch starts from the pre-event release velocity and is not a momentum-balanced separation analysis.",
      "The result is an analytical component check, not a clearance, range-safety, or flight-safety assessment.",
      ...simulation.warnings,
    ],
    assumptions: [
      "The released stage inherits the parent orientation and angular velocity at separation.",
      "The released stage position is offset to its own center of mass and its velocity includes the parent rigid-body angular-rate contribution.",
      input.detachedBodyDeltaVBodyMps
        ? "The detached-body delta-v is supplied by the stage adapter after applying equal-and-opposite linear momentum using the retained and detached mass at the event; external impulse, spring, joint, plume, and angular-momentum details remain outside the model."
        : "The retained-body separation delta-v is reported from event metadata for traceability; this detached branch starts from the pre-event release state because no detached-body impulse was supplied.",
      "Gravity uses the supplied launch-environment altitude when available, otherwise launch altitude plus local AGL position.",
      hasReferenceArea && hasDragCoefficient
        ? "When present, drag uses the supplied reference area and constant coefficient against environment-relative velocity; it is an isotropic point-drag approximation with no aerodynamic torque."
        : "A terminal ground-impact crossing is root-found only for the discarded body's ballistic path.",
      ...simulation.assumptions,
    ],
  };
}
