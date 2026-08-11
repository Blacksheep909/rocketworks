import {
  analyzeMultiBodySeparation,
  type MultiBodySeparationResult,
  type SeparationClearanceTracePoint,
} from "./separation-clearance.ts";
import {
  magnitude,
  subtractVectors,
  type Vector3,
} from "./linear-algebra.ts";
import {
  componentMassProperties,
  type VehicleComponent,
} from "./vehicle-components.ts";

export const SEPARATION_ENVELOPE_MODEL_VERSION =
  "kestrel-separation-envelope-0.1.0";
export const SEPARATION_ENVELOPE_STATUS =
  "analytical-component-checks-only" as const;

export type SeparationEnvelopeAssemblyComponent = Readonly<{
  component: VehicleComponent;
  /** World/body-frame translation of the component transform origin. */
  originM: Vector3;
  /** Optional transformed component center, when the caller has an assembly transform. */
  centerOfMassM?: Vector3;
}>;

export type SeparationEnvelopeBody = Readonly<{
  id: string;
  label?: string;
  releaseTimeS: number;
  trace: readonly SeparationClearanceTracePoint[];
  /** Optional fixed-radius spherical bound around the body's COM. */
  envelopeRadiusM?: number | null;
}>;

export type SeparationEnvelopePair = Readonly<{
  firstBodyId: string;
  firstBodyLabel: string;
  secondBodyId: string;
  secondBodyLabel: string;
  minimumDistanceM: number | null;
  minimumDistanceTimeS: number | null;
  envelopeRadiusSumM: number | null;
  minimumEnvelopeClearanceM: number | null;
  minimumEnvelopeClearanceTimeS: number | null;
  relativeSpeedAtClosestApproachMps: number | null;
  closingSpeedAtClosestApproachMps: number | null;
  potentialOverlap: boolean | null;
  status: "assessed" | "not-assessed";
}>;

export type SeparationEnvelopeResult = Readonly<{
  modelVersion: typeof SEPARATION_ENVELOPE_MODEL_VERSION;
  validationStatus: typeof SEPARATION_ENVELOPE_STATUS;
  centerOfMassModelVersion: MultiBodySeparationResult["modelVersion"];
  releaseTimeS: number;
  bodies: readonly Readonly<{
    id: string;
    label: string;
    releaseTimeS: number;
    sampleCount: number;
    envelopeRadiusM: number | null;
  }>[];
  pairs: readonly SeparationEnvelopePair[];
  minimumEnvelopeClearanceM: number | null;
  closestEnvelopePair: Readonly<{
    firstBodyId: string;
    secondBodyId: string;
    timeS: number;
    clearanceM: number;
    radiusSumM: number;
    relativeSpeedMps: number | null;
    closingSpeedMps: number | null;
  }> | null;
  status: MultiBodySeparationResult["status"];
  envelopeStatus: "assessed" | "partial" | "not-assessed";
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

function assertFiniteVector(value: Vector3, label: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite coordinates`);
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

function componentCenterForGeometry(component: VehicleComponent): Vector3 {
  const unrotatedComponent = component.kind === "axisymmetric" && component.rotation
    ? { ...component, rotation: undefined }
    : component;
  return componentMassProperties(unrotatedComponent).centerOfMassM;
}

function componentBoundFromCenter(component: VehicleComponent): number {
  const componentCenter = componentCenterForGeometry(component);
  if (component.kind === "axisymmetric") {
    const position = component.positionM ?? { x: 0, y: 0, z: 0 };
    return Math.max(
      ...component.stations.map((station) =>
        Math.hypot(
          position.x + station.xM - componentCenter.x,
          station.outerRadiusM,
        ),
      ),
    );
  }
  if (component.kind === "finSet") {
    const leadingX = component.axialPositionM;
    const trailingX =
      component.axialPositionM +
      Math.max(component.rootChordM, component.tipChordM) +
      Math.abs(component.sweepM);
    const radialExtent =
      component.bodyRadiusM + component.spanM + component.thicknessM / 2;
    return Math.max(
      Math.hypot(leadingX - componentCenter.x, radialExtent),
      Math.hypot(trailingX - componentCenter.x, radialExtent),
    );
  }
  return magnitude(subtractVectors(component.positionM, componentCenter));
}

/**
 * Computes a fixed spherical bound from the supplied original component
 * geometry. The bound is intentionally conservative and is measured from the
 * supplied aggregate center of mass; it does not depend on attitude or infer
 * a collision mesh.
 */
export function estimateSphericalEnvelopeRadiusM(input: Readonly<{
  centerOfMassM: Vector3;
  components: readonly SeparationEnvelopeAssemblyComponent[];
}>): number | null {
  assertFiniteVector(input.centerOfMassM, "separation envelope center of mass");
  if (input.components.length === 0) return null;
  let radius = 0;
  let usedComponent = false;
  for (const item of input.components) {
    assertFiniteVector(item.originM, "separation envelope component origin");
    const localCenter = componentCenterForGeometry(item.component);
    const componentCenter = item.centerOfMassM ?? {
      x: item.originM.x + localCenter.x,
      y: item.originM.y + localCenter.y,
      z: item.originM.z + localCenter.z,
    };
    assertFiniteVector(componentCenter, "separation envelope component center");
    const bound = componentBoundFromCenter(item.component);
    if (!Number.isFinite(bound) || bound < 0) {
      throw new Error("separation envelope component geometry must be finite");
    }
    radius = Math.max(
      radius,
      magnitude(subtractVectors(componentCenter, input.centerOfMassM)) + bound,
    );
    usedComponent = true;
  }
  return usedComponent ? radius : null;
}

function normalizedRadius(
  value: number | null | undefined,
  label: string,
): number | null {
  if (value === undefined || value === null) return null;
  assertNonNegativeFinite(value, label);
  return value;
}

/**
 * Applies constant spherical bounds to the existing multi-body COM paths.
 * This deliberately does not create a contact solver: it only subtracts the
 * sum of two fixed conservative radii from the continuous piecewise-linear
 * COM closest approach.
 */
export function analyzeSphericalSeparationEnvelope(
  input: Readonly<{ bodies: readonly SeparationEnvelopeBody[] }>,
): SeparationEnvelopeResult {
  if (input.bodies.length < 2) {
    throw new Error("separation envelope requires at least two bodies");
  }
  const normalizedBodies = input.bodies.map((body) => ({
    ...body,
    envelopeRadiusM: normalizedRadius(
      body.envelopeRadiusM,
      `separation envelope radius for ${body.id}`,
    ),
  }));
  const centerOfMass = analyzeMultiBodySeparation({
    bodies: normalizedBodies.map(({ id, label, releaseTimeS, trace }) => ({
      id,
      ...(label ? { label } : {}),
      releaseTimeS,
      trace,
    })),
  });
  const bodyById = new Map(normalizedBodies.map((body) => [body.id, body]));
  const pairs: SeparationEnvelopePair[] = centerOfMass.pairs.map((pair) => {
    const first = bodyById.get(pair.firstBodyId)!;
    const second = bodyById.get(pair.secondBodyId)!;
    const envelopeRadiusSumM =
      first.envelopeRadiusM !== null && second.envelopeRadiusM !== null
        ? first.envelopeRadiusM + second.envelopeRadiusM
        : null;
    const minimumEnvelopeClearanceM =
      pair.minimumDistanceM !== null && envelopeRadiusSumM !== null
        ? pair.minimumDistanceM - envelopeRadiusSumM
        : null;
    return {
      firstBodyId: pair.firstBodyId,
      firstBodyLabel: pair.firstBodyLabel,
      secondBodyId: pair.secondBodyId,
      secondBodyLabel: pair.secondBodyLabel,
      minimumDistanceM: pair.minimumDistanceM,
      minimumDistanceTimeS: pair.minimumDistanceTimeS,
      envelopeRadiusSumM,
      minimumEnvelopeClearanceM,
      minimumEnvelopeClearanceTimeS:
        minimumEnvelopeClearanceM === null
          ? null
          : pair.minimumDistanceTimeS,
      relativeSpeedAtClosestApproachMps: pair.relativeSpeedAtMinimumMps,
      closingSpeedAtClosestApproachMps: pair.closingSpeedAtMinimumMps,
      potentialOverlap:
        minimumEnvelopeClearanceM === null
          ? null
          : minimumEnvelopeClearanceM <= 0,
      status: minimumEnvelopeClearanceM === null ? "not-assessed" : "assessed",
    };
  });
  const assessedPairs = pairs.filter(
    (pair) => pair.minimumEnvelopeClearanceM !== null,
  );
  const envelopeStatus: SeparationEnvelopeResult["envelopeStatus"] =
    assessedPairs.length === 0
      ? "not-assessed"
      : assessedPairs.length === pairs.length
        ? "assessed"
        : "partial";
  const closestEnvelopePair = assessedPairs.reduce<SeparationEnvelopeResult["closestEnvelopePair"]>(
    (closest, pair) => {
      if (
        pair.minimumEnvelopeClearanceM === null ||
        pair.minimumEnvelopeClearanceTimeS === null ||
        pair.envelopeRadiusSumM === null
      ) {
        return closest;
      }
      if (!closest || pair.minimumEnvelopeClearanceM < closest.clearanceM) {
        return {
          firstBodyId: pair.firstBodyId,
          secondBodyId: pair.secondBodyId,
          timeS: pair.minimumEnvelopeClearanceTimeS,
          clearanceM: pair.minimumEnvelopeClearanceM,
          radiusSumM: pair.envelopeRadiusSumM,
          relativeSpeedMps: pair.relativeSpeedAtClosestApproachMps,
          closingSpeedMps: pair.closingSpeedAtClosestApproachMps,
        };
      }
      return closest;
    },
    null,
  );
  const minimumEnvelopeClearanceM = closestEnvelopePair?.clearanceM ?? null;
  return {
    modelVersion: SEPARATION_ENVELOPE_MODEL_VERSION,
    validationStatus: SEPARATION_ENVELOPE_STATUS,
    centerOfMassModelVersion: centerOfMass.modelVersion,
    releaseTimeS: centerOfMass.releaseTimeS,
    bodies: centerOfMass.bodies.map((body) => ({
      ...body,
      envelopeRadiusM: bodyById.get(body.id)?.envelopeRadiusM ?? null,
    })),
    pairs,
    minimumEnvelopeClearanceM,
    closestEnvelopePair,
    status: centerOfMass.status,
    envelopeStatus,
    warnings: [
      "Spherical envelope clearance is a conservative fixed-radius geometry screen; it is not a contact, collision, plume, or range-safety solver.",
      ...(envelopeStatus === "partial"
        ? ["Only pairs with both supplied envelope radii and overlapping COM traces were assessed."]
        : []),
      ...(envelopeStatus === "not-assessed"
        ? ["No pair had both a supplied geometry envelope and an overlapping COM path, so spherical clearance was not assessed."]
        : []),
      ...(closestEnvelopePair && closestEnvelopePair.clearanceM <= 0
        ? [`Potential spherical-envelope overlap for ${closestEnvelopePair.firstBodyId} / ${closestEnvelopePair.secondBodyId} at ${closestEnvelopePair.timeS.toFixed(2)} s; inspect separation geometry and mechanism independently.`]
        : []),
    ],
    assumptions: [
      "Each body is represented by a fixed sphere centered at its simulated center of mass.",
      "Envelope radii are conservative bounds from supplied component geometry and do not vary with attitude, flex, propellant slosh, or contact response.",
      "Envelope clearance subtracts the two radii from the existing sampled center-of-mass minimum; it does not reconstruct intermediate contact events.",
      "Relative and closing speeds at the closest approach are kinematic telemetry from the underlying traces; they are not impact loads or contact-response predictions.",
      "A non-positive clearance is a potential overlap diagnostic, not proof of physical contact or a flight-safety result.",
      ...centerOfMass.assumptions,
    ],
  };
}
