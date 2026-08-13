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
  createAltitudeRecoveryDeploymentEvent,
  createApogeeRecoveryDeploymentEvent,
  createRecoverySystemModel,
  createScheduledRecoveryDeploymentEvent,
  type RecoveryCommandTrigger,
  type RecoveryDevice,
  type RecoverySystemModel,
} from "./recovery-system.ts";
import {
  rotateBodyToWorld,
  simulateRigidBody6D,
  type ScheduledRigidBodyEvent,
  type RigidBodyState,
  type SixDofSimulationResult,
  type StateTriggeredRigidBodyEvent,
} from "./six-dof.ts";
import {
  analyzeSeparationClearance,
  type SeparationClearanceResult,
} from "./separation-clearance.ts";

export const SEPARATED_BODY_FLIGHT_MODEL_VERSION =
  "kestrel-separated-body-flight-0.6.0";
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
  recoveryDragN: number;
  recoveryEffectiveAreaM2: number;
}>;

export type SeparatedBodyTrajectory = Readonly<{
  stageId: string;
  instanceId?: string;
  stageName: string;
  /** Constant branch mass used by pairwise relative-energy screens. */
  massKg: number;
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
  /** Recovery model identity when this detached branch carries a canopy. */
  recoveryModelVersion?: string;
  /** Trigger used by the detached-stage recovery branch. */
  recoveryDeploymentTrigger?: RecoveryCommandTrigger;
  recoveryDeploymentAltitudeAglM?: number;
  recoveryDeploymentTimeS?: number;
  /** Constant isotropic drag basis when a bounded detached-stage aero basis is available. */
  referenceAreaM2?: number;
  dragCoefficient?: number;
  /** Optional fixed conservative spherical envelope radius for clearance screening. */
  envelopeRadiusM?: number;
  clearance?: SeparationClearanceResult;
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
  /** Optional fixed conservative spherical envelope radius for clearance screening. */
  envelopeRadiusM?: number;
  /** Optional retained-body path used for center-of-mass separation diagnostics. */
  retainedBodyTrace?: readonly RigidBodyState[];
  /** Optional recovery devices carried by this detached stage. */
  recoveryDevices?: readonly RecoveryDevice[];
  /** Trigger used by the detached-stage recovery branch; defaults to apogee. */
  recoveryDeploymentTrigger?: RecoveryCommandTrigger;
  /** Descending AGL command altitude when the trigger is altitude. */
  recoveryDeploymentAltitudeAglM?: number;
  /** Mission-time command when the trigger is time. */
  recoveryDeploymentTimeS?: number;
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
  if (
    input.envelopeRadiusM !== undefined &&
    (!Number.isFinite(input.envelopeRadiusM) || input.envelopeRadiusM < 0)
  ) {
    throw new Error("separated-body envelope radius must be non-negative and finite");
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
  const hasRecovery = (input.recoveryDevices?.length ?? 0) > 0;
  const recoveryTrigger = input.recoveryDeploymentTrigger ?? "apogee";
  if (hasRecovery && recoveryTrigger !== "apogee" && recoveryTrigger !== "altitude" && recoveryTrigger !== "time") {
    throw new Error("separated-body recovery deployment trigger must be apogee, altitude, or time");
  }
  const recoveryAltitudeAglM = input.recoveryDeploymentAltitudeAglM ?? 150;
  if (hasRecovery && (!Number.isFinite(recoveryAltitudeAglM) || recoveryAltitudeAglM < 0 || recoveryAltitudeAglM > 100_000)) {
    throw new Error("separated-body recovery deployment altitude must be finite and between 0 and 100000 m");
  }
  const recoveryTimeS = input.recoveryDeploymentTimeS ?? 8;
  if (hasRecovery && (!Number.isFinite(recoveryTimeS) || recoveryTimeS < 0 || recoveryTimeS > 180)) {
    throw new Error("separated-body recovery deployment time must be finite and between 0 and 180 s");
  }
  const recovery: RecoverySystemModel | null = hasRecovery
    ? createRecoverySystemModel({
        devices: input.recoveryDevices ?? [],
        environmentAt: input.environmentAt,
        launchAltitudeM: input.environmentAt ? undefined : input.launchAltitudeM,
        centerOfMassBodyM: () => input.stageMassProperties.centerOfMassM,
    })
    : null;
  const recoveryEvents = input.recoveryDevices?.map((device) => {
    if (recoveryTrigger === "altitude") {
      return createAltitudeRecoveryDeploymentEvent({
        deviceId: device.id,
        altitudeAglM: recoveryAltitudeAglM,
        direction: "falling",
        label: `${input.stageName} ${device.name} command on descent through ${recoveryAltitudeAglM.toFixed(0)} m AGL`,
      });
    }
    if (recoveryTrigger === "time") {
      const minimumScheduledTimeS = input.releaseState.timeS + Math.min(
        1e-9,
        (input.durationS - input.releaseState.timeS) / 2,
      );
      return createScheduledRecoveryDeploymentEvent({
        deviceId: device.id,
        timeS: Math.max(recoveryTimeS, minimumScheduledTimeS),
        label: `${input.stageName} ${device.name} command at mission time ${recoveryTimeS.toFixed(2)} s`,
      });
    }
    return createApogeeRecoveryDeploymentEvent({
      deviceId: device.id,
      label: `${input.stageName} ${device.name} command at branch apogee`,
    });
  }) ?? [];
  const recoveryTriggerDescription = recoveryTrigger === "altitude"
    ? `descending through ${recoveryAltitudeAglM.toFixed(0)} m AGL`
    : recoveryTrigger === "time"
      ? `mission time ${recoveryTimeS.toFixed(2)} s`
      : "branch apogee";
  const scheduledRecoveryEvents = recoveryEvents.filter(
    (event): event is ScheduledRigidBodyEvent =>
      "timeS" in event &&
      event.timeS > input.releaseState.timeS &&
      event.timeS <= input.durationS,
  );
  const stateRecoveryEvents = recoveryEvents.filter(
    (event): event is StateTriggeredRigidBodyEvent => !("timeS" in event),
  );
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
        velocityWorldMps: state.velocityWorldMps,
      });
      const altitudeAslM =
        environment?.altitudeAslM ??
        (input.launchAltitudeM ?? 0) + state.positionWorldM.z;
      const gravityAccelerationWorldMps2 = addVectors(
        {
          x: 0,
          y: 0,
          z: -(environment?.gravityAccelerationMps2 ?? gravityAtAltitude(altitudeAslM)),
        },
        environment?.earthRotationAccelerationWorldMps2 ?? ZERO_VECTOR,
      );
      const gravityForceWorldN = scaleVector(
        gravityAccelerationWorldMps2,
        input.stageMassProperties.massKg,
      );
      let dragForceWorldN = ZERO_VECTOR;
      if (hasReferenceArea && hasDragCoefficient) {
        const atmosphere = environment?.atmosphere ?? standardAtmosphere(altitudeAslM);
        const relativeAirVelocityMps = subtractVectors(
          state.velocityWorldMps,
          environment?.windWorldMps ?? ZERO_VECTOR,
        );
        const relativeAirSpeedMps = magnitude(relativeAirVelocityMps);
        if (relativeAirSpeedMps > 0) {
          const dragMagnitudeN =
            0.5 *
            atmosphere.densityKgM3 *
            relativeAirSpeedMps ** 2 *
            input.dragCoefficient! *
            input.referenceAreaM2!;
          dragForceWorldN = scaleVector(
            relativeAirVelocityMps,
            -dragMagnitudeN / relativeAirSpeedMps,
          );
        }
      }
      const recoveryLoads = recovery?.loads(state);
      return {
        forceWorldN: addVectors(
          addVectors(gravityForceWorldN, dragForceWorldN),
          recoveryLoads?.forceWorldN ?? ZERO_VECTOR,
        ),
        ...(recoveryLoads?.momentBodyNm ? { momentBodyNm: recoveryLoads.momentBodyNm } : {}),
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
      ...stateRecoveryEvents,
    ],
    events: scheduledRecoveryEvents,
  });
  const trace = simulation.trace.map((state): SeparatedBodyTracePoint => {
    const recoveryEvaluation = recovery?.evaluate(state);
    return {
      timeS: state.timeS,
      altitudeAglM: state.positionWorldM.z,
      speedMps: magnitude(state.velocityWorldMps),
      positionWorldM: state.positionWorldM,
      velocityWorldMps: state.velocityWorldMps,
      recoveryDragN: recoveryEvaluation?.devices.reduce((sum, device) => sum + device.dragN, 0) ?? 0,
      recoveryEffectiveAreaM2: recoveryEvaluation?.devices.reduce((sum, device) => sum + device.effectiveAreaM2, 0) ?? 0,
    };
  });
  const maxAltitudeAglM = Math.max(...trace.map((point) => point.altitudeAglM));
  const maxSpeedMps = Math.max(...trace.map((point) => point.speedMps));
  const clearance: SeparationClearanceResult | undefined = input.retainedBodyTrace
    ? analyzeSeparationClearance({
        retainedTrace: input.retainedBodyTrace,
        detachedTrace: trace,
        releaseTimeS: input.releaseState.timeS,
      })
    : undefined;
  return {
    stageId: input.stageId,
    ...(input.instanceId ? { instanceId: input.instanceId } : {}),
    stageName: input.stageName,
    massKg: input.stageMassProperties.massKg,
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
    ...(recovery ? {
      recoveryModelVersion: recovery.modelVersion,
      recoveryDeploymentTrigger: recoveryTrigger,
      recoveryDeploymentAltitudeAglM: recoveryAltitudeAglM,
      recoveryDeploymentTimeS: recoveryTimeS,
    } : {}),
    ...(hasReferenceArea && hasDragCoefficient
      ? {
          referenceAreaM2: input.referenceAreaM2,
          dragCoefficient: input.dragCoefficient,
        }
      : {}),
    ...(input.envelopeRadiusM !== undefined
      ? { envelopeRadiusM: input.envelopeRadiusM }
      : {}),
    ...(clearance ? { clearance } : {}),
    warnings: [
      hasReferenceArea && hasDragCoefficient
        ? recovery
          ? "This separated-body branch is a ballistic rigid-body propagation with altitude-dependent gravity, isotropic point drag, and the configured detached recovery devices; attitude-dependent aerodynamics, plume interaction, aerodynamic interference, and collision are not modeled."
          : "This separated-body branch is a ballistic rigid-body propagation with altitude-dependent gravity and isotropic point drag from the supplied constant coefficient and reference area; attitude-dependent aerodynamics, plume interaction, aerodynamic interference, recovery, and collision are not modeled."
        : recovery
          ? "This separated-body branch applies altitude-dependent gravity and the configured detached recovery devices; aerodynamic drag, plume interaction, aerodynamic interference, and collision are not modeled."
          : "This separated-body branch is ballistic and applies gravity only; drag, plume interaction, aerodynamic interference, recovery, and collision are not modeled.",
      ...(recovery
        ? [
            `Detached recovery devices are commanded on ${recoveryTriggerDescription} and use deterministic delay, inflation, and optional reefing effective-area approximations; opening shock and canopy-line dynamics remain outside the model.`,
            ...(recoveryEvents.some((event) => !simulation.events.some((applied) => applied.id === event.id))
              ? [`${input.stageName} detached recovery trigger was not reached before the branch terminated; its canopy remained stowed.`]
              : []),
          ]
        : []),
      input.detachedBodyDeltaVBodyMps
        ? "The detached branch includes the supplied equal-and-opposite linear-momentum delta-v; this is an instantaneous two-body impulse idealization and does not model the separation mechanism, joint dynamics, or angular impulse."
        : "No detached-body separation impulse was supplied; this branch starts from the pre-event release velocity and is not a momentum-balanced separation analysis.",
      "The result is an analytical component check, not a clearance, range-safety, or flight-safety assessment.",
      ...(input.envelopeRadiusM !== undefined
        ? [
            `A fixed ${input.envelopeRadiusM.toFixed(3)} m spherical envelope bound is available for the separate geometry screen; it is not an oriented collision shape.`,
          ]
        : ["No detached-body spherical envelope was supplied, so geometry clearance remains unavailable."]),
      ...(clearance?.warnings ?? []),
      ...(recovery?.warnings ?? []),
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
      ...(recovery
        ? [
            `Detached recovery loads are coupled through ${recovery.modelVersion}; each device is evaluated against the same branch atmosphere and center-of-mass frame. The selected trigger is ${recoveryTriggerDescription}.`,
          ]
        : []),
      ...(clearance?.assumptions ?? []),
      ...(input.envelopeRadiusM !== undefined
        ? [
            "The detached-body envelope radius is a conservative fixed bound derived by the caller from component geometry and is centered on the simulated body center of mass.",
          ]
        : []),
      ...(recovery?.assumptions ?? []),
      ...simulation.assumptions,
    ],
  };
}
