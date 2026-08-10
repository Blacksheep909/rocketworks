import {
  addVectors,
  cross,
  magnitude,
  scaleVector,
  subtractVectors,
  type Vector3,
} from "./linear-algebra.ts";
import type { MassProperties } from "./mass-properties.ts";
import { rotateBodyToWorld, type RigidBodyState } from "./six-dof.ts";

/**
 * RocketWorks separation impulse audit.
 *
 * This module does not replace the stage-flight integrator. It audits the
 * instantaneous event handoff that feeds the retained and detached branches:
 * linear momentum must balance, while any first-order angular impulse is made
 * explicit instead of being silently discarded.
 */
export const SEPARATION_DYNAMICS_MODEL_VERSION =
  "rocketworks-separation-dynamics-0.1.0";
export const SEPARATION_DYNAMICS_VALIDATION_STATUS =
  "instantaneous-conservation-audit-only" as const;

export type SeparationDynamicsStatus = "balanced" | "review" | "unavailable";

export type SeparationDynamicsBodyInput = Readonly<{
  id: string;
  massProperties: MassProperties;
  deltaVBodyMps?: Vector3 | null;
}>;

export type SeparationDynamicsInput = Readonly<{
  eventId: string;
  releaseState: RigidBodyState;
  retainedStateAfter: RigidBodyState;
  retainedMassPropertiesBefore: MassProperties;
  retainedMassPropertiesAfter: MassProperties;
  detachedBodies: readonly SeparationDynamicsBodyInput[];
  /** The configured event impulse. Omit when the event carries no separation dV. */
  configuredRetainedDeltaVBodyMps?: Vector3 | null;
}>;

export type SeparationDynamicsResult = Readonly<{
  modelVersion: string;
  validationStatus: typeof SEPARATION_DYNAMICS_VALIDATION_STATUS;
  eventId: string;
  releaseTimeS: number;
  status: SeparationDynamicsStatus;
  impulseModel: "mass-ratio-linear-momentum" | "not-modeled";
  retainedMassKg: number;
  detachedMassKg: number;
  totalMassBeforeKg: number;
  totalMassAfterKg: number;
  retainedDeltaVBodyMps: Vector3 | null;
  retainedDeltaVWorldMps: Vector3 | null;
  expectedDetachedDeltaVWorldMps: Vector3 | null;
  linearMomentumResidualKgMps: Vector3 | null;
  linearMomentumResidualMagnitudeKgMps: number | null;
  angularImpulseResidualKgM2PerS: Vector3 | null;
  angularImpulseResidualMagnitudeKgM2PerS: number | null;
  detachedBodies: readonly Readonly<{
    id: string;
    massKg: number;
    deltaVBodyMps: Vector3 | null;
    deltaVWorldMps: Vector3 | null;
    deltaVResidualWorldMps: Vector3 | null;
  }>[];
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

const MOMENTUM_TOLERANCE_RELATIVE = 1e-9;
const ANGULAR_IMPULSE_TOLERANCE_RELATIVE = 1e-9;

function finiteVector(value: Vector3, label: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite coordinates`);
  }
}

function positiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive and finite`);
  }
}

function validateMassProperties(properties: MassProperties, label: string): void {
  positiveFinite(properties.massKg, `${label} mass`);
  finiteVector(properties.centerOfMassM, `${label} center of mass`);
  for (const row of properties.inertiaAtCenterKgM2) {
    for (const entry of row) {
      if (!Number.isFinite(entry)) throw new Error(`${label} inertia must be finite`);
    }
  }
}

function finiteState(state: RigidBodyState, label: string): void {
  if (!Number.isFinite(state.timeS)) throw new Error(`${label} time must be finite`);
  finiteVector(state.positionWorldM, `${label} position`);
  finiteVector(state.velocityWorldMps, `${label} velocity`);
  finiteVector(state.angularVelocityBodyRadS, `${label} angular velocity`);
}

function vectorDifference(a: Vector3, b: Vector3): Vector3 {
  return subtractVectors(a, b);
}

function vectorSum(values: readonly Vector3[]): Vector3 {
  return values.reduce((sum, value) => addVectors(sum, value), { x: 0, y: 0, z: 0 });
}

/**
 * Audits the instantaneous topology handoff at a separation event.
 *
 * The event is evaluated in the pre-event body frame. Each body inherits the
 * rigid-body angular-rate contribution at its own center of mass, then the
 * configured separation delta-v is added. This makes both the linear impulse
 * residual and the unmodeled first-order angular impulse observable.
 */
export function auditSeparationDynamics(
  input: SeparationDynamicsInput,
): SeparationDynamicsResult {
  if (!input.eventId.trim()) throw new Error("separation audit event id cannot be empty");
  finiteState(input.releaseState, "separation release state");
  finiteState(input.retainedStateAfter, "separation retained state");
  if (input.retainedStateAfter.timeS < input.releaseState.timeS) {
    throw new Error("separation retained state cannot precede release state");
  }
  validateMassProperties(input.retainedMassPropertiesBefore, "retained pre-separation");
  validateMassProperties(input.retainedMassPropertiesAfter, "retained post-separation");
  if (input.detachedBodies.length === 0) {
    throw new Error("separation audit requires at least one detached body");
  }
  input.detachedBodies.forEach((body) => {
    if (!body.id.trim()) throw new Error("detached separation body id cannot be empty");
    validateMassProperties(body.massProperties, `detached ${body.id}`);
    if (body.deltaVBodyMps !== undefined && body.deltaVBodyMps !== null) {
      finiteVector(body.deltaVBodyMps, `detached ${body.id} delta-v`);
    }
  });

  const configuredRetainedDeltaVBodyMps =
    input.configuredRetainedDeltaVBodyMps === undefined || input.configuredRetainedDeltaVBodyMps === null
      ? null
      : input.configuredRetainedDeltaVBodyMps;
  if (configuredRetainedDeltaVBodyMps) {
    finiteVector(configuredRetainedDeltaVBodyMps, "retained separation delta-v");
  }
  const retainedDeltaVWorldMps = configuredRetainedDeltaVBodyMps
    ? rotateBodyToWorld(input.releaseState.orientationBodyToWorld, configuredRetainedDeltaVBodyMps)
    : null;
  const detachedMassKg = input.detachedBodies.reduce(
    (sum, body) => sum + body.massProperties.massKg,
    0,
  );
  positiveFinite(detachedMassKg, "detached separation mass");
  const retainedMassKg = input.retainedMassPropertiesAfter.massKg;
  const totalMassBeforeKg = input.retainedMassPropertiesBefore.massKg;
  const totalMassAfterKg = retainedMassKg + detachedMassKg;
  const expectedDetachedDeltaVWorldMps = retainedDeltaVWorldMps
    ? scaleVector(retainedDeltaVWorldMps, -retainedMassKg / detachedMassKg)
    : null;
  const omegaWorldRadS = rotateBodyToWorld(
    input.releaseState.orientationBodyToWorld,
    input.releaseState.angularVelocityBodyRadS,
  );
  const preSeparationCenterOfMassBodyM = input.retainedMassPropertiesBefore.centerOfMassM;
  const retainedOffsetWorldM = rotateBodyToWorld(
    input.releaseState.orientationBodyToWorld,
    subtractVectors(
      input.retainedMassPropertiesAfter.centerOfMassM,
      preSeparationCenterOfMassBodyM,
    ),
  );
  const retainedInheritedVelocityWorldMps = addVectors(
    input.releaseState.velocityWorldMps,
    cross(omegaWorldRadS, retainedOffsetWorldM),
  );
  const retainedObservedDeltaVWorldMps = vectorDifference(
    input.retainedStateAfter.velocityWorldMps,
    retainedInheritedVelocityWorldMps,
  );
  const retainedDeltaVForAuditWorldMps = retainedDeltaVWorldMps ?? retainedObservedDeltaVWorldMps;
  const retainedVelocityForAuditWorldMps = addVectors(
    retainedInheritedVelocityWorldMps,
    retainedDeltaVForAuditWorldMps,
  );
  const detachedKinematics = input.detachedBodies.map((body) => {
    const offsetWorldM = rotateBodyToWorld(
      input.releaseState.orientationBodyToWorld,
      subtractVectors(body.massProperties.centerOfMassM, preSeparationCenterOfMassBodyM),
    );
    const inheritedVelocityWorldMps = addVectors(
      input.releaseState.velocityWorldMps,
      cross(omegaWorldRadS, offsetWorldM),
    );
    const deltaVBodyMps = body.deltaVBodyMps ?? null;
    const deltaVWorldMps = deltaVBodyMps
      ? rotateBodyToWorld(input.releaseState.orientationBodyToWorld, deltaVBodyMps)
      : null;
    const velocityWorldMps = addVectors(inheritedVelocityWorldMps, deltaVWorldMps ?? { x: 0, y: 0, z: 0 });
    return {
      id: body.id,
      massKg: body.massProperties.massKg,
      offsetWorldM,
      deltaVBodyMps,
      deltaVWorldMps,
      velocityWorldMps,
    };
  });
  const preSeparationMomentumKgMps = scaleVector(
    input.releaseState.velocityWorldMps,
    totalMassBeforeKg,
  );
  const postSeparationMomentumKgMps = vectorSum([
    scaleVector(retainedVelocityForAuditWorldMps, retainedMassKg),
    ...detachedKinematics.map((body) => scaleVector(body.velocityWorldMps, body.massKg)),
  ]);
  const linearMomentumResidualKgMps = vectorDifference(
    postSeparationMomentumKgMps,
    preSeparationMomentumKgMps,
  );
  const linearMomentumResidualMagnitudeKgMps = magnitude(linearMomentumResidualKgMps);
  const angularImpulseResidualKgM2PerS = vectorSum([
    cross(retainedOffsetWorldM, scaleVector(retainedDeltaVForAuditWorldMps, retainedMassKg)),
    ...detachedKinematics.map((body) =>
      cross(body.offsetWorldM, scaleVector(body.deltaVWorldMps ?? { x: 0, y: 0, z: 0 }, body.massKg)),
    ),
  ]);
  const angularImpulseResidualMagnitudeKgM2PerS = magnitude(angularImpulseResidualKgM2PerS);
  const momentumTolerance = MOMENTUM_TOLERANCE_RELATIVE * Math.max(totalMassBeforeKg, 1);
  const angularImpulseTolerance =
    ANGULAR_IMPULSE_TOLERANCE_RELATIVE * Math.max(totalMassBeforeKg, 1);
  const hasConfiguredImpulse = configuredRetainedDeltaVBodyMps !== null;
  const momentumBalanced = linearMomentumResidualMagnitudeKgMps <= momentumTolerance;
  const angularImpulseBalanced = angularImpulseResidualMagnitudeKgM2PerS <= angularImpulseTolerance;
  const status: SeparationDynamicsStatus = !hasConfiguredImpulse
    ? "unavailable"
    : momentumBalanced && angularImpulseBalanced
      ? "balanced"
      : "review";
  const warnings: string[] = [
    "This is an instantaneous separation conservation audit, not a coupled multi-body flight solver or flight-safety assessment.",
    "Each body inherits the pre-event rigid-body angular-rate contribution at its center of mass; external loads over the event window are ignored.",
  ];
  if (!hasConfiguredImpulse) {
    warnings.push("No configured retained-body separation delta-v was available, so the equal-and-opposite impulse audit remains unavailable.");
  }
  if (!momentumBalanced) {
    warnings.push(`Linear momentum residual is ${linearMomentumResidualMagnitudeKgMps.toExponential(3)} kg·m/s, above the audit tolerance.`);
  }
  if (!angularImpulseBalanced) {
    warnings.push(`The configured impulse leaves an unmodeled angular impulse of ${angularImpulseResidualMagnitudeKgM2PerS.toExponential(3)} kg·m²/s about the pre-event center of mass.`);
  }
  return {
    modelVersion: SEPARATION_DYNAMICS_MODEL_VERSION,
    validationStatus: SEPARATION_DYNAMICS_VALIDATION_STATUS,
    eventId: input.eventId,
    releaseTimeS: input.releaseState.timeS,
    status,
    impulseModel: hasConfiguredImpulse ? "mass-ratio-linear-momentum" : "not-modeled",
    retainedMassKg,
    detachedMassKg,
    totalMassBeforeKg,
    totalMassAfterKg,
    retainedDeltaVBodyMps: configuredRetainedDeltaVBodyMps,
    retainedDeltaVWorldMps: retainedDeltaVWorldMps ?? retainedObservedDeltaVWorldMps,
    expectedDetachedDeltaVWorldMps,
    linearMomentumResidualKgMps,
    linearMomentumResidualMagnitudeKgMps,
    angularImpulseResidualKgM2PerS,
    angularImpulseResidualMagnitudeKgM2PerS,
    detachedBodies: detachedKinematics.map((body) => ({
      id: body.id,
      massKg: body.massKg,
      deltaVBodyMps: body.deltaVBodyMps,
      deltaVWorldMps: body.deltaVWorldMps,
      deltaVResidualWorldMps:
        expectedDetachedDeltaVWorldMps && body.deltaVWorldMps
          ? vectorDifference(body.deltaVWorldMps, expectedDetachedDeltaVWorldMps)
          : null,
    })),
    warnings,
    assumptions: [
      "The retained and detached masses are evaluated at the event boundary from the shared topology model.",
      "The configured retained-body delta-v is rotated from body to world using the event attitude.",
      "An angular-impulse residual is reported when impulse lines do not pass through the pre-event center of mass; no compensating angular impulse is synthesized.",
      "Plume interaction, contact, spring or pyrotechnic mechanism dynamics, attitude-dependent aerodynamics, and collision response remain outside this audit.",
    ],
  };
}
