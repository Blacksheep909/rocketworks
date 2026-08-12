import {
  addVectors,
  cross,
  magnitude,
  scaleVector,
  subtractVectors,
  type Vector3,
} from "./linear-algebra.ts";
import type { MassProperties } from "./mass-properties.ts";
import {
  rotateBodyToWorld,
  rotateWorldToBody,
  type RigidBodyState,
} from "./six-dof.ts";

/**
 * RocketWorks separation impulse audit.
 *
 * This module does not replace the stage-flight integrator. It audits the
 * instantaneous event handoff that feeds the retained and detached branches:
 * linear momentum must balance, while any first-order angular impulse is made
 * explicit instead of being silently discarded.
 */
export const SEPARATION_DYNAMICS_MODEL_VERSION =
  "rocketworks-separation-dynamics-0.2.0";
export const SEPARATION_DYNAMICS_VALIDATION_STATUS =
  "instantaneous-conservation-audit-only" as const;
export const COUPLED_SEPARATION_IMPULSE_MODEL_VERSION =
  "rocketworks-coupled-separation-impulse-0.2.0";

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
  /** Optional measured retained-body impulse retained as provenance for the audit. */
  configuredRetainedImpulseBodyNs?: Vector3 | null;
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
  retainedImpulseBodyNs: Vector3 | null;
  retainedImpulseWorldNs: Vector3 | null;
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

export type CoupledSeparationImpulseResult = Readonly<{
  modelVersion: typeof COUPLED_SEPARATION_IMPULSE_MODEL_VERSION;
  validationStatus: typeof SEPARATION_DYNAMICS_VALIDATION_STATUS;
  eventId: string;
  releaseTimeS: number;
  status: SeparationDynamicsStatus;
  correctionModel:
    | "minimum-norm-linear-and-angular-impulse"
    | "not-modeled";
  retainedDeltaVBodyMps: Vector3 | null;
  retainedDeltaVWorldMps: Vector3 | null;
  retainedImpulseBodyNs: Vector3 | null;
  retainedImpulseWorldNs: Vector3 | null;
  baselineLinearMomentumResidualKgMps: Vector3 | null;
  baselineAngularImpulseResidualKgM2PerS: Vector3 | null;
  linearMomentumResidualKgMps: Vector3 | null;
  linearMomentumResidualMagnitudeKgMps: number | null;
  angularImpulseResidualKgM2PerS: Vector3 | null;
  angularImpulseResidualMagnitudeKgM2PerS: number | null;
  maximumCorrectionMps: number | null;
  resolvedConstraintCount: number | null;
  detachedBodies: readonly Readonly<{
    id: string;
    massKg: number;
    baselineDeltaVBodyMps: Vector3 | null;
    correctionBodyMps: Vector3;
    solvedDeltaVBodyMps: Vector3 | null;
    solvedDeltaVWorldMps: Vector3 | null;
  }>[];
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

const MOMENTUM_TOLERANCE_RELATIVE = 1e-9;
const ANGULAR_IMPULSE_TOLERANCE_RELATIVE = 1e-9;
const SOLVER_REGULARIZATION = 1e-12;

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

type Matrix = number[][];

function solveSquareSystem(matrix: Matrix, rightHandSide: readonly number[]): number[] | null {
  const size = matrix.length;
  if (size === 0 || matrix.some((row) => row.length !== size) || rightHandSide.length !== size) {
    return null;
  }
  const augmented = matrix.map((row, rowIndex) => [...row, rightHandSide[rowIndex]!]);
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivotRow]![column]!)) {
        pivotRow = row;
      }
    }
    const pivot = augmented[pivotRow]![column]!;
    if (!Number.isFinite(pivot) || Math.abs(pivot) < 1e-18) return null;
    if (pivotRow !== column) {
      const temporary = augmented[column]!;
      augmented[column] = augmented[pivotRow]!;
      augmented[pivotRow] = temporary;
    }
    const normalizedPivot = augmented[column]![column]!;
    for (let entry = column; entry <= size; entry += 1) {
      augmented[column]![entry] /= normalizedPivot;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      if (Math.abs(factor) < 1e-18) continue;
      for (let entry = column; entry <= size; entry += 1) {
        augmented[row]![entry] -= factor * augmented[column]![entry]!;
      }
    }
  }
  const solution = augmented.map((row) => row[size]!);
  return solution.every(Number.isFinite) ? solution : null;
}

function vectorFromComponents(value: readonly number[]): Vector3 {
  return { x: value[0]!, y: value[1]!, z: value[2]! };
}

function zeroVector(): Vector3 {
  return { x: 0, y: 0, z: 0 };
}

function bodyOffsetWorldM(
  centerOfMassM: Vector3,
  preSeparationCenterOfMassBodyM: Vector3,
  orientationBodyToWorld: RigidBodyState["orientationBodyToWorld"],
): Vector3 {
  return rotateBodyToWorld(
    orientationBodyToWorld,
    subtractVectors(centerOfMassM, preSeparationCenterOfMassBodyM),
  );
}

function normalizedImpulseRows(
  rows: readonly number[][],
  targets: readonly number[],
): { rows: number[][]; targets: number[] } {
  const scales = rows.map((row) => {
    const norm = Math.sqrt(row.reduce((sum, value) => sum + value * value, 0));
    return Math.max(norm, 1);
  });
  return {
    rows: rows.map((row, rowIndex) => row.map((value) => value / scales[rowIndex]!)),
    targets: targets.map((value, rowIndex) => value / scales[rowIndex]!),
  };
}

function minimumNormImpulseCorrection(
  rows: readonly number[][],
  target: readonly number[],
): number[] | null {
  const normalized = normalizedImpulseRows(rows, target);
  const rowCount = normalized.rows.length;
  const columnCount = normalized.rows[0]?.length ?? 0;
  if (rowCount === 0 || columnCount === 0) return null;
  const gram: Matrix = Array.from({ length: rowCount }, (_, row) =>
    Array.from({ length: rowCount }, (_, column) =>
      normalized.rows[row]!.reduce(
        (sum, value, index) => sum + value * normalized.rows[column]![index]!,
        0,
      ),
    ),
  );
  for (let index = 0; index < rowCount; index += 1) {
    gram[index]![index] += SOLVER_REGULARIZATION;
  }
  const dual = solveSquareSystem(gram, normalized.targets);
  if (!dual) return null;
  return Array.from({ length: columnCount }, (_, column) =>
    normalized.rows.reduce(
      (sum, row, rowIndex) => sum + row[column]! * dual[rowIndex]!,
      0,
    ),
  );
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
  const configuredRetainedImpulseBodyNs =
    input.configuredRetainedImpulseBodyNs === undefined || input.configuredRetainedImpulseBodyNs === null
      ? null
      : input.configuredRetainedImpulseBodyNs;
  if (configuredRetainedImpulseBodyNs) {
    finiteVector(configuredRetainedImpulseBodyNs, "retained separation impulse");
  }
  const retainedDeltaVWorldMps = configuredRetainedDeltaVBodyMps
      ? rotateBodyToWorld(input.releaseState.orientationBodyToWorld, configuredRetainedDeltaVBodyMps)
      : null;
  const retainedImpulseWorldNs = configuredRetainedImpulseBodyNs
    ? rotateBodyToWorld(input.releaseState.orientationBodyToWorld, configuredRetainedImpulseBodyNs)
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
  if (configuredRetainedImpulseBodyNs && !configuredRetainedDeltaVBodyMps) {
    warnings.push("A measured retained-body separation impulse was supplied without a converted delta-v, so conservation status remains unavailable.");
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
    retainedImpulseBodyNs: configuredRetainedImpulseBodyNs,
    retainedImpulseWorldNs,
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

/**
 * Allocates a minimum-norm correction across detached-body velocity
 * increments so the supplied point-mass release can satisfy both linear and
 * first-order angular momentum constraints when the detached geometry has
 * enough independent moment arms.
 *
 * This is deliberately an event-level diagnostic. The correction is returned
 * in body and world frames but is never silently applied to a trajectory; a
 * caller must explicitly choose to use it after reviewing the assumptions.
 */
export function solveCoupledSeparationImpulse(
  input: SeparationDynamicsInput,
): CoupledSeparationImpulseResult {
  const baseline = auditSeparationDynamics(input);
  const baselineBodies = input.detachedBodies.map((body) => ({
    id: body.id,
    massKg: body.massProperties.massKg,
    baselineDeltaVBodyMps: body.deltaVBodyMps ?? null,
  }));
  const baseResult = {
    modelVersion: COUPLED_SEPARATION_IMPULSE_MODEL_VERSION,
    validationStatus: SEPARATION_DYNAMICS_VALIDATION_STATUS,
    eventId: input.eventId,
    releaseTimeS: input.releaseState.timeS,
    retainedDeltaVBodyMps:
      input.configuredRetainedDeltaVBodyMps ?? null,
    retainedDeltaVWorldMps: baseline.retainedDeltaVWorldMps,
    retainedImpulseBodyNs: input.configuredRetainedImpulseBodyNs ?? null,
    retainedImpulseWorldNs: baseline.retainedImpulseWorldNs,
    baselineLinearMomentumResidualKgMps: baseline.linearMomentumResidualKgMps,
    baselineAngularImpulseResidualKgM2PerS: baseline.angularImpulseResidualKgM2PerS,
  } as const;
  const zeroCorrections = baselineBodies.map((body) => ({
    ...body,
    correctionBodyMps: zeroVector(),
    solvedDeltaVBodyMps: body.baselineDeltaVBodyMps,
    solvedDeltaVWorldMps: body.baselineDeltaVBodyMps
      ? rotateBodyToWorld(
          input.releaseState.orientationBodyToWorld,
          body.baselineDeltaVBodyMps,
        )
      : null,
  }));
  if (input.configuredRetainedDeltaVBodyMps === undefined || input.configuredRetainedDeltaVBodyMps === null) {
    return {
      ...baseResult,
      status: "unavailable",
      correctionModel: "not-modeled",
      linearMomentumResidualKgMps: baseline.linearMomentumResidualKgMps,
      linearMomentumResidualMagnitudeKgMps: baseline.linearMomentumResidualMagnitudeKgMps,
      angularImpulseResidualKgM2PerS: baseline.angularImpulseResidualKgM2PerS,
      angularImpulseResidualMagnitudeKgM2PerS: baseline.angularImpulseResidualMagnitudeKgM2PerS,
      maximumCorrectionMps: null,
      resolvedConstraintCount: null,
      detachedBodies: zeroCorrections,
      warnings: [
        "No configured retained-body separation delta-v was supplied, so a coupled impulse allocation remains unavailable.",
        "This diagnostic is not a coupled multi-body flight solver or flight-safety assessment.",
        ...baseline.warnings,
      ],
      assumptions: [
        "The solver requires an explicit configured retained-body delta-v; it does not infer a mechanism impulse from an observed state reset.",
        "No correction is applied to the retained or detached trajectories by this result.",
      ],
    };
  }

  const preSeparationCenterOfMassBodyM = input.retainedMassPropertiesBefore.centerOfMassM;
  const orientationBodyToWorld = input.releaseState.orientationBodyToWorld;
  const rows = Array.from({ length: 6 }, () => [] as number[]);
  for (const body of input.detachedBodies) {
    const offsetWorldM = bodyOffsetWorldM(
      body.massProperties.centerOfMassM,
      preSeparationCenterOfMassBodyM,
      orientationBodyToWorld,
    );
    const massKg = body.massProperties.massKg;
    const basis = [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
    ] as const;
    for (const direction of basis) {
      const linearImpulsePerMps = scaleVector(direction, massKg);
      const angularImpulsePerMps = cross(offsetWorldM, linearImpulsePerMps);
      const column = [
        linearImpulsePerMps.x,
        linearImpulsePerMps.y,
        linearImpulsePerMps.z,
        angularImpulsePerMps.x,
        angularImpulsePerMps.y,
        angularImpulsePerMps.z,
      ];
      column.forEach((value, rowIndex) => rows[rowIndex]!.push(value));
    }
  }
  const baselineLinear = baseline.linearMomentumResidualKgMps ?? zeroVector();
  const baselineAngular = baseline.angularImpulseResidualKgM2PerS ?? zeroVector();
  const target = [
    -baselineLinear.x,
    -baselineLinear.y,
    -baselineLinear.z,
    -baselineAngular.x,
    -baselineAngular.y,
    -baselineAngular.z,
  ];
  const correctionWorldComponents = minimumNormImpulseCorrection(rows, target);
  if (!correctionWorldComponents) {
    return {
      ...baseResult,
      status: "review",
      correctionModel: "minimum-norm-linear-and-angular-impulse",
      linearMomentumResidualKgMps: baseline.linearMomentumResidualKgMps,
      linearMomentumResidualMagnitudeKgMps: baseline.linearMomentumResidualMagnitudeKgMps,
      angularImpulseResidualKgM2PerS: baseline.angularImpulseResidualKgM2PerS,
      angularImpulseResidualMagnitudeKgM2PerS: baseline.angularImpulseResidualMagnitudeKgM2PerS,
      maximumCorrectionMps: null,
      resolvedConstraintCount: 0,
      detachedBodies: zeroCorrections,
      warnings: [
        "The minimum-norm impulse system could not be solved for the supplied detached geometry.",
        "The baseline conservation residual remains the active diagnostic; no correction is applied.",
      ],
      assumptions: [
        "Detached bodies are represented as point masses at their event centers of mass.",
        "No correction is applied to the retained or detached trajectories by this result.",
      ],
    };
  }

  const solvedBodies = input.detachedBodies.map((body, bodyIndex) => {
    const correctionWorldMps = vectorFromComponents(
      correctionWorldComponents.slice(bodyIndex * 3, bodyIndex * 3 + 3),
    );
    const correctionBodyMps = rotateWorldToBody(
      orientationBodyToWorld,
      correctionWorldMps,
    );
    const baselineDeltaVBodyMps = body.deltaVBodyMps ?? zeroVector();
    const solvedDeltaVBodyMps = addVectors(
      baselineDeltaVBodyMps,
      correctionBodyMps,
    );
    return {
      id: body.id,
      massProperties: body.massProperties,
      deltaVBodyMps: solvedDeltaVBodyMps,
      correctionBodyMps,
      correctionWorldMps,
      baselineDeltaVBodyMps: body.deltaVBodyMps ?? null,
    };
  });
  const solvedAudit = auditSeparationDynamics({
    ...input,
    detachedBodies: solvedBodies.map((body) => ({
      id: body.id,
      massProperties: body.massProperties,
      deltaVBodyMps: body.deltaVBodyMps,
    })),
  });
  const linearBalanced =
    solvedAudit.linearMomentumResidualMagnitudeKgMps !== null &&
    solvedAudit.linearMomentumResidualMagnitudeKgMps <=
      MOMENTUM_TOLERANCE_RELATIVE * Math.max(solvedAudit.totalMassBeforeKg, 1);
  const angularBalanced =
    solvedAudit.angularImpulseResidualMagnitudeKgM2PerS !== null &&
    solvedAudit.angularImpulseResidualMagnitudeKgM2PerS <=
      ANGULAR_IMPULSE_TOLERANCE_RELATIVE * Math.max(solvedAudit.totalMassBeforeKg, 1);
  const correctionMagnitudes = solvedBodies.map((body) => magnitude(body.correctionWorldMps));
  const resolvedConstraintCount = (linearBalanced ? 3 : 0) + (angularBalanced ? 3 : 0);
  return {
    ...baseResult,
    status: linearBalanced && angularBalanced ? "balanced" : "review",
    correctionModel: "minimum-norm-linear-and-angular-impulse",
    linearMomentumResidualKgMps: solvedAudit.linearMomentumResidualKgMps,
    linearMomentumResidualMagnitudeKgMps: solvedAudit.linearMomentumResidualMagnitudeKgMps,
    angularImpulseResidualKgM2PerS: solvedAudit.angularImpulseResidualKgM2PerS,
    angularImpulseResidualMagnitudeKgM2PerS: solvedAudit.angularImpulseResidualMagnitudeKgM2PerS,
    maximumCorrectionMps: correctionMagnitudes.length > 0 ? Math.max(...correctionMagnitudes) : 0,
    resolvedConstraintCount,
    detachedBodies: solvedBodies.map((body) => ({
      id: body.id,
      massKg: body.massProperties.massKg,
      baselineDeltaVBodyMps: body.baselineDeltaVBodyMps,
      correctionBodyMps: body.correctionBodyMps,
      solvedDeltaVBodyMps: body.deltaVBodyMps,
      solvedDeltaVWorldMps: rotateBodyToWorld(
        orientationBodyToWorld,
        body.deltaVBodyMps,
      ),
    })),
    warnings: [
      "This is a minimum-norm instantaneous impulse allocation diagnostic, not a coupled multi-body flight solver or flight-safety assessment.",
      ...(linearBalanced && angularBalanced
        ? [
            "The solved point-mass increments balance linear and first-order angular impulse within the deterministic audit tolerance; they are not measured separation-mechanism impulses.",
          ]
        : [
            `The solved release retains ${resolvedConstraintCount} of 6 linear/angular momentum constraints; inspect the residual before considering any explicit state reset.`,
          ]),
      "The correction is reported for review only and is not applied to the current separated-body trajectories.",
      ...solvedAudit.warnings.filter(
        (warning) => !warning.includes("instantaneous separation conservation audit"),
      ),
    ],
    assumptions: [
      "Corrections are minimum-norm world-frame velocity increments distributed across detached point masses, then rotated into the event body frame.",
      "The retained-body configured delta-v is held fixed; only detached-body increments are corrected.",
      "Detached-body inertia, attitude, joint compliance, plume interaction, contact, and external loads over the event window are not modeled.",
      "No correction is applied to the retained or detached trajectories by this result.",
    ],
  };
}
