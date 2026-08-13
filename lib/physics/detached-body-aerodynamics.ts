import {
  evaluateInducedDrag,
  type InducedDragModelKind,
} from "./induced-drag.ts";
import {
  addVectors,
  cross,
  dot,
  magnitude,
  scaleVector,
  subtractVectors,
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
import type {
  AerodynamicCoefficientApplicabilityIssue,
  AerodynamicCoefficientTableModel,
  AerodynamicDataProvenance,
} from "./aerodynamic-coefficients.ts";

/**
 * Bounded static aerodynamic inputs for a released rigid body.
 *
 * The relation path intentionally mirrors only public low-speed engineering
 * equations: q = 1/2 rho V^2, linear normal force, a CP-to-CG lever arm, and
 * an optional rate-damping derivative. A projected-area drag basis may replace
 * the constant CdA term when the caller has supplied an oriented body profile.
 */
export const DETACHED_BODY_AERODYNAMICS_MODEL_VERSION =
  "rocketworks-detached-body-aerodynamics-0.2.0";
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
  /** Optional validated Mach/Reynolds/(angle,sideslip) coefficient source. */
  coefficientTable?: AerodynamicCoefficientTableModel;
  /** Reference length used to query the table Reynolds-number axis. */
  referenceLengthM?: number;
  /** Table CP stations use this local nose datum for CP-to-CG conversion. */
  centerOfMassXM?: number;
  /** Reference lengths for any direct body-axis moment coefficients. */
  momentReferenceLengthBodyM?: Vector3;
  /** Signed common-sigma perturbation for declared table uncertainty cells. */
  coefficientUncertaintyScale?: number;
  attitudeDependentDrag?: AttitudeDependentDragGeometry;
}>;

export type DetachedBodyAerodynamicInput = Readonly<{
  basis: DetachedBodyAerodynamicBasis;
  densityKgM3: number;
  speedOfSoundMps: number;
  dynamicViscosityPaS?: number;
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
  reynoldsNumber: number | null;
  coefficientBasis:
    | "constant"
    | "mach-reynolds-table"
    | "mach-reynolds-angle-table"
    | "mach-reynolds-force-moment-table"
    | null;
  directForceCoefficientBody: Vector3 | null;
  directMomentCoefficientBody: Vector3 | null;
  directForceApplied: boolean;
  directMomentApplied: boolean;
  coefficientProvenance: AerodynamicDataProvenance | null;
  coefficientApplicability: readonly AerodynamicCoefficientApplicabilityIssue[];
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

function applyUncertainty(
  nominal: number,
  absoluteUncertainty: number,
  sigma: number,
  label: string,
  requirePositive = false,
): number {
  const value = nominal + sigma * absoluteUncertainty;
  if (!Number.isFinite(value) || (requirePositive && value <= 0)) {
    throw new Error(`${label} became non-physical after coefficient uncertainty perturbation`);
  }
  return value;
}

function perturbVector(
  nominal: Vector3 | null,
  absoluteUncertainty: Vector3 | null,
  sigma: number,
  label: string,
): Vector3 | null {
  if (!nominal) return null;
  const uncertainty = absoluteUncertainty ?? ZERO_VECTOR;
  const value = addVectors(nominal, scaleVector(uncertainty, sigma));
  assertFiniteVector(value, label);
  return value;
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
  if (basis.coefficientTable) {
    assertPositive(basis.referenceLengthM ?? NaN, "detached-body aerodynamic table reference length");
    if (basis.centerOfMassXM === undefined) {
      throw new Error("detached-body aerodynamic table requires a local center-of-mass station");
    }
    assertFinite(basis.centerOfMassXM, "detached-body table center of mass station");
    if (basis.coefficientUncertaintyScale !== undefined) {
      assertFinite(basis.coefficientUncertaintyScale, "detached-body coefficient uncertainty scale");
    }
    if (basis.momentReferenceLengthBodyM) {
      assertFiniteVector(basis.momentReferenceLengthBodyM, "detached-body moment reference lengths");
      if (![basis.momentReferenceLengthBodyM.x, basis.momentReferenceLengthBodyM.y, basis.momentReferenceLengthBodyM.z].every((value) => value > 0)) {
        throw new Error("detached-body moment reference lengths must be positive");
      }
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
  if (input.dynamicViscosityPaS !== undefined) {
    assertPositive(input.dynamicViscosityPaS, "detached-body dynamic viscosity");
  }
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
  const coefficientTable = input.basis.coefficientTable;
  let reynoldsNumber: number | null = null;
  let coefficientBasis: DetachedBodyAerodynamicResult["coefficientBasis"] = coefficientTable
    ? null
    : "constant";
  let coefficientProvenance: AerodynamicDataProvenance | null = null;
  let coefficientApplicability: readonly AerodynamicCoefficientApplicabilityIssue[] = [];
  let dragCoefficient = input.basis.dragCoefficient;
  let normalForceSlopePerRad = input.basis.normalForceSlopePerRad;
  let centerOfPressureMinusCenterOfMassM = input.basis.centerOfPressureMinusCenterOfMassM;
  let dampingDerivativeBody = input.basis.dampingDerivativeBody;
  const dampingReferenceLengthBodyM = input.basis.dampingReferenceLengthBodyM;
  let directForceCoefficientBody: Vector3 | null = null;
  let directMomentCoefficientBody: Vector3 | null = null;
  if (coefficientTable && airspeedMps > SPEED_EPSILON_MPS) {
    if (input.dynamicViscosityPaS === undefined) {
      throw new Error("detached-body aerodynamic table requires dynamic viscosity");
    }
    reynoldsNumber = (input.densityKgM3 * airspeedMps * input.basis.referenceLengthM!) / input.dynamicViscosityPaS;
    const evaluation = coefficientTable.evaluate({
      mach,
      reynoldsNumber,
      angleOfAttackRad,
      sideslipRad,
    });
    const sigma = input.basis.coefficientUncertaintyScale ?? 0;
    dragCoefficient = applyUncertainty(
      evaluation.dragCoefficient,
      evaluation.uncertainty.dragCoefficient,
      sigma,
      "detached-body drag coefficient",
      true,
    );
    normalForceSlopePerRad = applyUncertainty(
      evaluation.normalForceSlopePerRad,
      evaluation.uncertainty.normalForceSlopePerRad,
      sigma,
      "detached-body normal-force slope",
      true,
    );
    centerOfPressureMinusCenterOfMassM = applyUncertainty(
      evaluation.centerOfPressureXM,
      evaluation.uncertainty.centerOfPressureXM,
      sigma,
      "detached-body table center of pressure",
    ) - input.basis.centerOfMassXM!;
    directForceCoefficientBody = perturbVector(
      evaluation.forceCoefficientBody,
      evaluation.uncertainty.forceCoefficientBody,
      sigma,
      "detached-body direct force coefficient",
    );
    directMomentCoefficientBody = perturbVector(
      evaluation.momentCoefficientBody,
      evaluation.uncertainty.momentCoefficientBody,
      sigma,
      "detached-body direct moment coefficient",
    );
    dampingDerivativeBody = perturbVector(
      evaluation.dampingDerivativeBody,
      evaluation.uncertainty.dampingDerivativeBody,
      sigma,
      "detached-body damping derivative",
    ) ?? input.basis.dampingDerivativeBody;
    coefficientProvenance = evaluation.provenance;
    coefficientApplicability = evaluation.applicability;
    coefficientBasis = directForceCoefficientBody !== null || directMomentCoefficientBody !== null
      ? "mach-reynolds-force-moment-table"
      : evaluation.evaluatedAngleOfAttackRad === null
        ? "mach-reynolds-table"
        : "mach-reynolds-angle-table";
  }
  const normalForceModel = input.basis.normalForceModel ?? "low-speed";
  const normalForceModelEvaluation = evaluateNormalForceModel({ model: normalForceModel, mach });
  const maximumNormalForceMach = input.basis.maximumNormalForceMach ?? 0.3;
  const maximumNormalForceAngleRad = input.basis.maximumNormalForceAngleRad ?? (10 * Math.PI) / 180;
  const minimumNormalForceAirspeedMps = input.basis.minimumNormalForceAirspeedMps ?? 1;
  const normalForceConfigured = normalForceSlopePerRad !== undefined;
  const directForceApplied = directForceCoefficientBody !== null &&
    airspeedMps >= minimumNormalForceAirspeedMps &&
    forwardAirspeedBodyMps > 0;
  if (directMomentCoefficientBody !== null && !input.basis.momentReferenceLengthBodyM) {
    throw new Error("detached-body direct moment coefficients require moment reference lengths");
  }
  const directMomentApplied = directMomentCoefficientBody !== null &&
    airspeedMps >= minimumNormalForceAirspeedMps &&
    forwardAirspeedBodyMps > 0;
  const normalForceRelationApplied = !directForceApplied && normalForceConfigured &&
    airspeedMps >= minimumNormalForceAirspeedMps &&
    forwardAirspeedBodyMps > 0 &&
    (normalForceModel === "low-speed"
      ? mach <= maximumNormalForceMach
      : normalForceModelEvaluation.applied);
  const normalForceApplied = directForceApplied || normalForceRelationApplied;
  const boundedAngleRad = Math.min(angleOfAttackRad, maximumNormalForceAngleRad);
  const normalForceCoefficient = normalForceRelationApplied
    ? normalForceSlopePerRad! * normalForceModelEvaluation.factor * boundedAngleRad
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
  let normalForceN: number;
  let normalBodyN: Vector3;
  let dragBodyN: Vector3;
  let aerodynamicForceBodyN: Vector3;
  if (directForceApplied) {
    const directForceBodyN = scaleVector(
      directForceCoefficientBody!,
      dynamicPressurePa * input.basis.referenceAreaM2,
    );
    const airRelativeUnitBody = scaleVector(relativeAirVelocityBodyMps, 1 / airspeedMps);
    const axialForceN = dot(directForceBodyN, airRelativeUnitBody);
    dragN = Math.max(0, -axialForceN);
    dragBodyN = scaleVector(airRelativeUnitBody, -dragN);
    normalBodyN = subtractVectors(directForceBodyN, scaleVector(airRelativeUnitBody, axialForceN));
    normalForceN = magnitude(normalBodyN);
    aerodynamicForceBodyN = directForceBodyN;
    effectiveDragCoefficient = dynamicPressurePa > 0 && input.basis.referenceAreaM2 > 0
      ? dragN / (dynamicPressurePa * input.basis.referenceAreaM2)
      : dragCoefficient;
  } else if (input.basis.attitudeDependentDrag) {
    const projected = evaluateAttitudeDependentDrag({
      geometry: input.basis.attitudeDependentDrag,
      densityKgM3: input.densityKgM3,
      relativeAirVelocityWorldMps: input.relativeAirVelocityWorldMps,
      bodyAxisWorldM: rotateBodyToWorld(input.orientationBodyToWorld, { x: 1, y: 0, z: 0 }),
    });
    const projectedCoefficientScale = input.basis.dragCoefficient > 0
      ? Math.max(0, dragCoefficient / input.basis.dragCoefficient)
      : 1;
    dragN = magnitude(projected.dragForceWorldN) * projectedCoefficientScale;
    effectiveReferenceAreaM2 = projected.effectiveReferenceAreaM2;
    projectedIncidenceRad = projected.incidenceRad;
    if (inducedDragEvaluation.inducedDragCoefficient > 0 && dynamicPressurePa > 0) {
      dragN += dynamicPressurePa * inducedDragEvaluation.inducedDragCoefficient * input.basis.referenceAreaM2;
    }
    effectiveDragCoefficient = dynamicPressurePa > 0 && effectiveReferenceAreaM2 > 0
      ? dragN / (dynamicPressurePa * effectiveReferenceAreaM2)
      : projected.effectiveDragCoefficient;
    dragBodyN = airspeedMps > SPEED_EPSILON_MPS
      ? scaleVector(relativeAirVelocityBodyMps, -dragN / airspeedMps)
      : ZERO_VECTOR;
    normalForceN = normalForceApplied
      ? dynamicPressurePa * input.basis.referenceAreaM2 * normalForceCoefficient
      : 0;
    normalBodyN = normalForceN > 0 && transverseAirspeedMps > SPEED_EPSILON_MPS
      ? {
          x: 0,
          y: (-normalForceN * relativeAirVelocityBodyMps.y) / transverseAirspeedMps,
          z: (-normalForceN * relativeAirVelocityBodyMps.z) / transverseAirspeedMps,
        }
      : ZERO_VECTOR;
    aerodynamicForceBodyN = addVectors(dragBodyN, normalBodyN);
  } else {
    effectiveDragCoefficient = dragCoefficient + inducedDragEvaluation.inducedDragCoefficient;
    dragN = dynamicPressurePa * effectiveDragCoefficient * input.basis.referenceAreaM2;
    dragBodyN = airspeedMps > SPEED_EPSILON_MPS
      ? scaleVector(relativeAirVelocityBodyMps, -dragN / airspeedMps)
      : ZERO_VECTOR;
    normalForceN = normalForceApplied
      ? dynamicPressurePa * input.basis.referenceAreaM2 * normalForceCoefficient
      : 0;
    normalBodyN = normalForceN > 0 && transverseAirspeedMps > SPEED_EPSILON_MPS
      ? {
          x: 0,
          y: (-normalForceN * relativeAirVelocityBodyMps.y) / transverseAirspeedMps,
          z: (-normalForceN * relativeAirVelocityBodyMps.z) / transverseAirspeedMps,
        }
      : ZERO_VECTOR;
    aerodynamicForceBodyN = addVectors(dragBodyN, normalBodyN);
  }
  const aerodynamicStaticMomentBodyNm = directMomentApplied
    ? {
        x: dynamicPressurePa * input.basis.referenceAreaM2 * directMomentCoefficientBody!.x * input.basis.momentReferenceLengthBodyM!.x,
        y: dynamicPressurePa * input.basis.referenceAreaM2 * directMomentCoefficientBody!.y * input.basis.momentReferenceLengthBodyM!.y,
        z: dynamicPressurePa * input.basis.referenceAreaM2 * directMomentCoefficientBody!.z * input.basis.momentReferenceLengthBodyM!.z,
      }
    : centerOfPressureMinusCenterOfMassM !== undefined
      ? cross({ x: centerOfPressureMinusCenterOfMassM, y: 0, z: 0 }, normalBodyN)
      : ZERO_VECTOR;
  const aerodynamicDampingMomentBodyNm = dampingDerivativeBody && dampingReferenceLengthBodyM && airspeedMps > SPEED_EPSILON_MPS
    ? (() => {
        const scale = (dynamicPressurePa * input.basis.referenceAreaM2) / (2 * airspeedMps);
        return {
          x: scale * dampingDerivativeBody.x * angularVelocityBodyRadS.x * dampingReferenceLengthBodyM.x ** 2,
          y: scale * dampingDerivativeBody.y * angularVelocityBodyRadS.y * dampingReferenceLengthBodyM.y ** 2,
          z: scale * dampingDerivativeBody.z * angularVelocityBodyRadS.z * dampingReferenceLengthBodyM.z ** 2,
        };
      })()
    : ZERO_VECTOR;
  const aerodynamicMomentBodyNm = addVectors(aerodynamicStaticMomentBodyNm, aerodynamicDampingMomentBodyNm);
  const warnings = [
    "Detached-body aerodynamic loads are a bounded low-speed relation path; transonic/separated flow, fin interference, plume interaction, and unsteady effects are not inferred.",
    ...(coefficientTable
      ? ["A validated coefficient table is interpolated at the requested Mach, Reynolds number, angle, and sideslip; table provenance and applicability remain the caller's responsibility."]
      : []),
    ...(directForceApplied
      ? ["Direct body-axis force coefficients supply the aerodynamic resultant for this sample; the relation/projected force path is not added a second time."]
      : []),
    ...(directMomentApplied
      ? ["Direct body-axis static moment coefficients supply the static moment for this sample; the CP lever-arm moment is not added a second time."]
      : []),
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
    ...(coefficientTable
      ? ["Table queries use dynamic viscosity and the supplied reference length for Reynolds number; no coefficient is extrapolated outside the table's declared policy."]
      : []),
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
    reynoldsNumber,
    coefficientBasis,
    directForceCoefficientBody,
    directMomentCoefficientBody,
    directForceApplied,
    directMomentApplied,
    coefficientProvenance,
    coefficientApplicability,
    warnings,
    assumptions,
  };
}
