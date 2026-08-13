import {
  evaluateInducedDrag,
  type InducedDragModelKind,
} from "./induced-drag.ts";
import {
  addVectors,
  cross,
  magnitude,
  scaleVector,
  type Vector3,
} from "./linear-algebra.ts";
import {
  evaluateNormalForceModel,
  type NormalForceModelKind,
} from "./normal-force-compressibility.ts";
import {
  rotateBodyToWorld,
  rotateWorldToBody,
  type Quaternion,
} from "./six-dof.ts";
import {
  evaluateAttitudeDependentDrag,
  validateAttitudeDependentDragGeometry,
  type AttitudeDependentDragGeometry,
} from "./attitude-dependent-drag.ts";

/**
 * Bounded static aerodynamic inputs for a released rigid body.
 *
 * The relation path intentionally mirrors only public low-speed engineering
 * equations: q = 1/2 rho V^2, linear normal force, a CP-to-CG lever arm, and
 * an optional rate-damping derivative. A projected-area drag basis may replace
 * the constant CdA term when the caller has supplied an oriented body profile.
 */
export const DETACHED_BODY_AERODYNAMICS_MODEL_VERSION =
  "rocketworks-detached-body-aerodynamics-0.1.0";
export const DETACHED_BODY_AERODYNAMICS_STATUS =
  "analytical-component-checks-only" as const;

export type DetachedBodyAerodynamicBasis = Readonly<{
  referenceAreaM2: number;
  dragCoefficient: number;
  /** Optional low-speed normal-force slope, C_N,alpha, in rad^-1. */
  normalForceSlopePerRad?: number;
  /** Optional body +X CP minus CG lever arm, in metres. */
  centerOfPressureMinusCenterOfMassM?: number;
  maximumNormalForceMach?: number;
  maximumNormalForceAngleRad?: number;
  minimumNormalForceAirspeedMps?: number;
  normalForceModel?: NormalForceModelKind;
  inducedDragModel?: InducedDragModelKind;
  inducedDragFactor?: number;
  dampingDerivativeBody?: Vector3;
  dampingReferenceLengthBodyM?: Vector3;
  attitudeDependentDrag?: AttitudeDependentDragGeometry;
}>;

export type DetachedBodyAerodynamicInput = Readonly<{
  basis: DetachedBodyAerodynamicBasis;
  densityKgM3: number;
  speedOfSoundMps: number;
  relativeAirVelocityWorldMps: Vector3;
  orientationBodyToWorld: Quaternion;
  angularVelocityBodyRadS?: Vector3;
}>;

export type DetachedBodyAerodynamicResult = Readonly<{
  modelVersion: typeof DETACHED_BODY_AERODYNAMICS_MODEL_VERSION;
  validationStatus: typeof DETACHED_BODY_AERODYNAMICS_STATUS;
  status: "assessed" | "not-assessed";
  airspeedMps: number;
  forwardAirspeedBodyMps: number;
  angleOfAttackRad: number;
  sideslipRad: number;
  mach: number;
  dynamicPressurePa: number;
  dragN: number;
  normalForceN: number;
  normalForceApplied: boolean;
  effectiveDragCoefficient: number;
  aerodynamicForceBodyN: Vector3;
  aerodynamicForceWorldN: Vector3;
  aerodynamicStaticMomentBodyNm: Vector3;
  aerodynamicDampingMomentBodyNm: Vector3;
  aerodynamicMomentBodyNm: Vector3;
  projectedIncidenceRad: number | null;
  effectiveReferenceAreaM2: number;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

const ZERO_VECTOR: Vector3 = { x: 0, y: 0, z: 0 };
const SPEED_EPSILON_MPS = 1e-10;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (!(value > 0)) throw new Error(`${label} must be positive`);
}

function assertNonNegative(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0) throw new Error(`${label} must be non-negative`);
}

function assertFiniteVector(value: Vector3, label: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite coordinates`);
  }
}

export function validateDetachedBodyAerodynamicBasis(
  basis: DetachedBodyAerodynamicBasis,
): void {
  assertPositive(basis.referenceAreaM2, "detached-body aerodynamic reference area");
  assertNonNegative(basis.dragCoefficient, "detached-body aerodynamic drag coefficient");
  if (basis.normalForceSlopePerRad !== undefined) {
    assertPositive(basis.normalForceSlopePerRad, "detached-body normal-force slope");
  }
  if (basis.centerOfPressureMinusCenterOfMassM !== undefined) {
    assertFinite(basis.centerOfPressureMinusCenterOfMassM, "detached-body CP-to-CG offset");
  }
  if (basis.normalForceSlopePerRad !== undefined && basis.centerOfPressureMinusCenterOfMassM === undefined) {
    throw new Error("detached-body normal-force slope requires a CP-to-CG offset");
  }
  if (basis.maximumNormalForceMach !== undefined) {
    assertPositive(basis.maximumNormalForceMach, "detached-body maximum normal-force Mach");
  }
  if (basis.maximumNormalForceAngleRad !== undefined) {
    assertPositive(basis.maximumNormalForceAngleRad, "detached-body maximum normal-force angle");
  }
  if (basis.minimumNormalForceAirspeedMps !== undefined) {
    assertPositive(basis.minimumNormalForceAirspeedMps, "detached-body minimum normal-force airspeed");
  }
  if (basis.inducedDragFactor !== undefined) {
    assertNonNegative(basis.inducedDragFactor, "detached-body induced-drag factor");
  }
  const hasDampingDerivative = basis.dampingDerivativeBody !== undefined;
  const hasDampingLength = basis.dampingReferenceLengthBodyM !== undefined;
  if (hasDampingDerivative !== hasDampingLength) {
    throw new Error("detached-body damping derivative and reference lengths must be supplied together");
  }
  if (basis.dampingDerivativeBody) assertFiniteVector(basis.dampingDerivativeBody, "detached-body damping derivative");
  if (basis.dampingReferenceLengthBodyM) {
    assertFiniteVector(basis.dampingReferenceLengthBodyM, "detached-body damping reference lengths");
    if (![basis.dampingReferenceLengthBodyM.x, basis.dampingReferenceLengthBodyM.y, basis.dampingReferenceLengthBodyM.z].every((value) => value > 0)) {
      throw new Error("detached-body damping reference lengths must be positive");
    }
  }
  if (basis.attitudeDependentDrag) validateAttitudeDependentDragGeometry(basis.attitudeDependentDrag);
}

/**
 * Evaluate a released-body aerodynamic load basis in the body frame.
 *
 * The body +X axis runs from nose toward tail, so nose-first flow has a
 * negative body-X velocity. Normal force is disabled outside the configured
 * low-speed/forward-flow/small-angle applicability envelope; drag remains
 * available whenever a positive airspeed is present.
 */
export function evaluateDetachedBodyAerodynamics(
  input: DetachedBodyAerodynamicInput,
): DetachedBodyAerodynamicResult {
  validateDetachedBodyAerodynamicBasis(input.basis);
  assertNonNegative(input.densityKgM3, "detached-body aerodynamic density");
  assertPositive(input.speedOfSoundMps, "detached-body aerodynamic speed of sound");
  assertFiniteVector(input.relativeAirVelocityWorldMps, "detached-body relative air velocity");
  assertFiniteVector(input.orientationBodyToWorld, "detached-body orientation");
  const angularVelocityBodyRadS = input.angularVelocityBodyRadS ?? ZERO_VECTOR;
  assertFiniteVector(angularVelocityBodyRadS, "detached-body angular velocity");

  const relativeAirVelocityBodyMps = rotateWorldToBody(
    input.orientationBodyToWorld,
    input.relativeAirVelocityWorldMps,
  );
  const airspeedMps = magnitude(relativeAirVelocityBodyMps);
  const forwardAirspeedBodyMps = -relativeAirVelocityBodyMps.x;
  const transverseAirspeedMps = Math.hypot(
    relativeAirVelocityBodyMps.y,
    relativeAirVelocityBodyMps.z,
  );
  const angleOfAttackRad = airspeedMps > SPEED_EPSILON_MPS
    ? Math.atan2(transverseAirspeedMps, forwardAirspeedBodyMps)
    : 0;
  const sideslipRad = airspeedMps > SPEED_EPSILON_MPS
    ? Math.asin(Math.min(1, Math.max(-1, relativeAirVelocityBodyMps.y / airspeedMps)))
    : 0;
  const mach = airspeedMps / input.speedOfSoundMps;
  const dynamicPressurePa = 0.5 * input.densityKgM3 * airspeedMps ** 2;
  const normalForceModel = input.basis.normalForceModel ?? "low-speed";
  const normalForceModelEvaluation = evaluateNormalForceModel({ model: normalForceModel, mach });
  const maximumNormalForceMach = input.basis.maximumNormalForceMach ?? 0.3;
  const maximumNormalForceAngleRad = input.basis.maximumNormalForceAngleRad ?? (10 * Math.PI) / 180;
  const minimumNormalForceAirspeedMps = input.basis.minimumNormalForceAirspeedMps ?? 1;
  const normalForceConfigured = input.basis.normalForceSlopePerRad !== undefined;
  const normalForceApplied = normalForceConfigured &&
    airspeedMps >= minimumNormalForceAirspeedMps &&
    forwardAirspeedBodyMps > 0 &&
    (normalForceModel === "low-speed"
      ? mach <= maximumNormalForceMach
      : normalForceModelEvaluation.applied);
  const boundedAngleRad = Math.min(angleOfAttackRad, maximumNormalForceAngleRad);
  const normalForceCoefficient = normalForceApplied
    ? input.basis.normalForceSlopePerRad! * normalForceModelEvaluation.factor * boundedAngleRad
    : 0;
  const inducedDragEvaluation = evaluateInducedDrag({
    model: input.basis.inducedDragModel ?? "disabled",
    factor: input.basis.inducedDragFactor ?? 0,
    normalForceCoefficient,
  });

  let dragN: number;
  let effectiveDragCoefficient: number;
  let effectiveReferenceAreaM2 = input.basis.referenceAreaM2;
  let projectedIncidenceRad: number | null = null;
  if (input.basis.attitudeDependentDrag) {
    const projected = evaluateAttitudeDependentDrag({
      geometry: input.basis.attitudeDependentDrag,
      densityKgM3: input.densityKgM3,
      relativeAirVelocityWorldMps: input.relativeAirVelocityWorldMps,
      bodyAxisWorldM: rotateBodyToWorld(input.orientationBodyToWorld, { x: 1, y: 0, z: 0 }),
    });
    dragN = magnitude(projected.dragForceWorldN);
    effectiveReferenceAreaM2 = projected.effectiveReferenceAreaM2;
    projectedIncidenceRad = projected.incidenceRad;
    if (inducedDragEvaluation.inducedDragCoefficient > 0 && dynamicPressurePa > 0) {
      dragN += dynamicPressurePa * inducedDragEvaluation.inducedDragCoefficient * input.basis.referenceAreaM2;
    }
    effectiveDragCoefficient = dynamicPressurePa > 0 && effectiveReferenceAreaM2 > 0
      ? dragN / (dynamicPressurePa * effectiveReferenceAreaM2)
      : projected.effectiveDragCoefficient;
  } else {
    effectiveDragCoefficient = input.basis.dragCoefficient + inducedDragEvaluation.inducedDragCoefficient;
    dragN = dynamicPressurePa * effectiveDragCoefficient * input.basis.referenceAreaM2;
  }
  const dragBodyN = airspeedMps > SPEED_EPSILON_MPS
    ? scaleVector(relativeAirVelocityBodyMps, -dragN / airspeedMps)
    : ZERO_VECTOR;
  const normalForceN = normalForceApplied
    ? dynamicPressurePa * input.basis.referenceAreaM2 * normalForceCoefficient
    : 0;
  const normalBodyN = normalForceN > 0 && transverseAirspeedMps > SPEED_EPSILON_MPS
    ? {
        x: 0,
        y: (-normalForceN * relativeAirVelocityBodyMps.y) / transverseAirspeedMps,
        z: (-normalForceN * relativeAirVelocityBodyMps.z) / transverseAirspeedMps,
      }
    : ZERO_VECTOR;
  const aerodynamicForceBodyN = addVectors(dragBodyN, normalBodyN);
  const aerodynamicStaticMomentBodyNm = input.basis.centerOfPressureMinusCenterOfMassM !== undefined
    ? cross({ x: input.basis.centerOfPressureMinusCenterOfMassM, y: 0, z: 0 }, normalBodyN)
    : ZERO_VECTOR;
  const aerodynamicDampingMomentBodyNm = input.basis.dampingDerivativeBody && input.basis.dampingReferenceLengthBodyM && airspeedMps > SPEED_EPSILON_MPS
    ? (() => {
        const scale = (dynamicPressurePa * input.basis.referenceAreaM2) / (2 * airspeedMps);
        return {
          x: scale * input.basis.dampingDerivativeBody.x * angularVelocityBodyRadS.x * input.basis.dampingReferenceLengthBodyM.x ** 2,
          y: scale * input.basis.dampingDerivativeBody.y * angularVelocityBodyRadS.y * input.basis.dampingReferenceLengthBodyM.y ** 2,
          z: scale * input.basis.dampingDerivativeBody.z * angularVelocityBodyRadS.z * input.basis.dampingReferenceLengthBodyM.z ** 2,
        };
      })()
    : ZERO_VECTOR;
  const aerodynamicMomentBodyNm = addVectors(aerodynamicStaticMomentBodyNm, aerodynamicDampingMomentBodyNm);
  const warnings = [
    "Detached-body aerodynamic loads are a bounded low-speed relation path; transonic/separated flow, fin interference, plume interaction, and unsteady effects are not inferred.",
    ...(input.basis.attitudeDependentDrag
      ? ["Projected-area drag supplies a smooth axial/broadside CdA blend; its coefficient/area pairs require independent calibration."]
      : []),
    ...(normalForceConfigured && !normalForceApplied && airspeedMps > SPEED_EPSILON_MPS
      ? ["Static normal force is outside its configured forward-flow, airspeed, angle, or compressibility domain and was disabled for this sample."]
      : []),
  ];
  const assumptions = [
    "Body +X points from nose toward tail; forward flight is negative body-X air-relative velocity.",
    "Normal force uses a linear C_N,alpha relation with a bounded angle and selected compressibility trend.",
    "The CP-to-CG lever arm is body-axis aligned and produces r x F static moment only.",
    ...(input.basis.dampingDerivativeBody ? ["Optional rotational damping uses the supplied body-rate derivative and reference lengths; it is not inferred from geometry."] : []),
    ...(input.basis.attitudeDependentDrag ? ["Projected drag and relation normal force are superposed; no crossflow lift or aerodynamic database interpolation is inferred."] : []),
  ];
  return {
    modelVersion: DETACHED_BODY_AERODYNAMICS_MODEL_VERSION,
    validationStatus: DETACHED_BODY_AERODYNAMICS_STATUS,
    status: airspeedMps > SPEED_EPSILON_MPS ? "assessed" : "not-assessed",
    airspeedMps,
    forwardAirspeedBodyMps,
    angleOfAttackRad,
    sideslipRad,
    mach,
    dynamicPressurePa,
    dragN,
    normalForceN,
    normalForceApplied,
    effectiveDragCoefficient,
    aerodynamicForceBodyN,
    aerodynamicForceWorldN: rotateBodyToWorld(input.orientationBodyToWorld, aerodynamicForceBodyN),
    aerodynamicStaticMomentBodyNm,
    aerodynamicDampingMomentBodyNm,
    aerodynamicMomentBodyNm,
    projectedIncidenceRad,
    effectiveReferenceAreaM2,
    warnings,
    assumptions,
  };
}
