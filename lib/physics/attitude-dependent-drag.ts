import {
  dot,
  magnitude,
  scaleVector,
  type Vector3,
} from "./linear-algebra.ts";

/**
 * A deliberately bounded projected-area drag basis for released rigid bodies.
 *
 * The caller supplies two reference-area/Cd pairs: one for flow aligned with
 * the body +X axis and one for broadside flow. The model blends their
 * force-area products with the squared cosine of the incidence angle. It is a
 * transparent engineering approximation, not a CFD, wind-tunnel, or
 * attitude-dependent coefficient database.
 */
export const ATTITUDE_DEPENDENT_DRAG_MODEL_VERSION =
  "rocketworks-attitude-dependent-drag-0.1.0";
export const ATTITUDE_DEPENDENT_DRAG_STATUS =
  "analytical-component-checks-only" as const;
export const ATTITUDE_DEPENDENT_DRAG_BODY_AXIS: Vector3 = { x: 1, y: 0, z: 0 };

export type AttitudeDependentDragGeometry = Readonly<{
  /** Frontal/reference area for flow parallel to the body +X axis. */
  axialReferenceAreaM2: number;
  /** Broadside projected/reference area for flow normal to the body +X axis. */
  crossflowReferenceAreaM2: number;
  /** Cd paired with axialReferenceAreaM2. */
  axialDragCoefficient: number;
  /** Cd paired with crossflowReferenceAreaM2. */
  crossflowDragCoefficient: number;
}>;

export type AttitudeDependentDragInput = Readonly<{
  geometry: AttitudeDependentDragGeometry;
  densityKgM3: number;
  relativeAirVelocityWorldMps: Vector3;
  bodyAxisWorldM: Vector3;
}>;

export type AttitudeDependentDragResult = Readonly<{
  modelVersion: typeof ATTITUDE_DEPENDENT_DRAG_MODEL_VERSION;
  validationStatus: typeof ATTITUDE_DEPENDENT_DRAG_STATUS;
  status: "assessed" | "not-assessed";
  relativeAirSpeedMps: number;
  dynamicPressurePa: number;
  incidenceRad: number;
  axialAlignment: number;
  axialWeight: number;
  crossflowWeight: number;
  effectiveReferenceAreaM2: number;
  effectiveDragCoefficient: number;
  effectiveCdAreaM2: number;
  dragForceWorldN: Vector3;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

const SPEED_EPSILON_MPS = 1e-10;
const ZERO_VECTOR: Vector3 = { x: 0, y: 0, z: 0 };

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

function normalized(value: Vector3, label: string): Vector3 {
  assertFiniteVector(value, label);
  const length = magnitude(value);
  assertPositive(length, `${label} magnitude`);
  return scaleVector(value, 1 / length);
}

export function validateAttitudeDependentDragGeometry(
  geometry: AttitudeDependentDragGeometry,
): void {
  assertPositive(geometry.axialReferenceAreaM2, "attitude drag axial reference area");
  assertPositive(geometry.crossflowReferenceAreaM2, "attitude drag crossflow reference area");
  assertNonNegative(geometry.axialDragCoefficient, "attitude drag axial coefficient");
  assertNonNegative(geometry.crossflowDragCoefficient, "attitude drag crossflow coefficient");
  if (geometry.axialDragCoefficient === 0 && geometry.crossflowDragCoefficient === 0) {
    throw new Error("attitude drag requires at least one positive drag coefficient");
  }
}

/**
 * Evaluate a projected-area drag force using D = q Cd A and a bounded
 * squared-cosine incidence blend. The force is opposite relative air flow.
 */
export function evaluateAttitudeDependentDrag(
  input: AttitudeDependentDragInput,
): AttitudeDependentDragResult {
  validateAttitudeDependentDragGeometry(input.geometry);
  assertNonNegative(input.densityKgM3, "attitude drag density");
  assertFiniteVector(input.relativeAirVelocityWorldMps, "attitude drag relative air velocity");
  const speedMps = magnitude(input.relativeAirVelocityWorldMps);
  const bodyAxis = normalized(input.bodyAxisWorldM, "attitude drag body axis");
  const relativeAirVelocity = speedMps <= SPEED_EPSILON_MPS
    ? ZERO_VECTOR
    : scaleVector(input.relativeAirVelocityWorldMps, 1 / speedMps);
  const alignment = speedMps <= SPEED_EPSILON_MPS
    ? 1
    : Math.min(1, Math.abs(dot(bodyAxis, relativeAirVelocity)));
  const axialWeight = alignment ** 2;
  const crossflowWeight = 1 - axialWeight;
  const effectiveReferenceAreaM2 =
    input.geometry.axialReferenceAreaM2 * axialWeight +
    input.geometry.crossflowReferenceAreaM2 * crossflowWeight;
  const effectiveCdAreaM2 =
    input.geometry.axialDragCoefficient * input.geometry.axialReferenceAreaM2 * axialWeight +
    input.geometry.crossflowDragCoefficient * input.geometry.crossflowReferenceAreaM2 * crossflowWeight;
  const effectiveDragCoefficient = effectiveCdAreaM2 / effectiveReferenceAreaM2;
  const dynamicPressurePa = 0.5 * input.densityKgM3 * speedMps ** 2;
  const dragMagnitudeN = dynamicPressurePa * effectiveCdAreaM2;
  const incidenceRad = Math.acos(alignment);
  const dragForceWorldN = speedMps <= SPEED_EPSILON_MPS
    ? { x: 0, y: 0, z: 0 }
    : scaleVector(relativeAirVelocity, -dragMagnitudeN);
  return {
    modelVersion: ATTITUDE_DEPENDENT_DRAG_MODEL_VERSION,
    validationStatus: ATTITUDE_DEPENDENT_DRAG_STATUS,
    status: speedMps <= SPEED_EPSILON_MPS ? "not-assessed" : "assessed",
    relativeAirSpeedMps: speedMps,
    dynamicPressurePa,
    incidenceRad,
    axialAlignment: alignment,
    axialWeight,
    crossflowWeight,
    effectiveReferenceAreaM2,
    effectiveDragCoefficient,
    effectiveCdAreaM2,
    dragForceWorldN,
    warnings: [
      "Projected-area drag is a bounded incidence proxy; it does not supply lift, pitching/yawing moments, fin interference, or unsteady flow physics.",
      "The axial and crossflow coefficient/area pairs must be independently calibrated or benchmarked before operational use.",
    ],
    assumptions: [
      "Body +X is the aerodynamic nose axis and the drag force is aligned opposite relative air velocity.",
      "Axial and crossflow CdA products are blended with axialAlignment²; this is a smooth interpolation, not a derived flow solution.",
      "Dynamic pressure is q = 0.5 rho V² using the supplied local density and air-relative speed.",
    ],
  };
}
