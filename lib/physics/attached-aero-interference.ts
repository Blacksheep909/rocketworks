import {
  IDENTITY_MATRIX,
  ZERO_VECTOR,
  addVectors,
  multiplyMatrices,
  multiplyMatrixVector,
  type Matrix3,
  type Vector3,
} from "./linear-algebra.ts";
import type { RigidTransform } from "./mass-properties.ts";
import type { VehicleComponent } from "./vehicle-components.ts";

export const ATTACHED_AERO_INTERFERENCE_MODEL_VERSION =
  "rocketworks-attached-aero-interference-0.1.0";
export const ATTACHED_AERO_INTERFERENCE_VALIDATION_STATUS =
  "analytical-component-checks-only" as const;

export type AttachedAeroInterferenceStatus =
  | "screened"
  | "watch"
  | "review"
  | "not-assessed";
export type AttachedAeroPairStatus = "clear" | "near" | "overlap";
export type AttachedAeroGeometrySource = "component-envelope" | "missing";

export type AttachedAeroComponentEnvelope = Readonly<{
  id: string;
  label: string;
  sourceKind: "axisymmetric" | "finSet";
  axialStartM: number;
  axialEndM: number;
  centerYM: number;
  centerZM: number;
  outerRadiusM: number;
}>;

export type AttachedAeroInterferenceBody = Readonly<{
  id: string;
  label: string;
  stageId: string;
  stageRole?: "core" | "upper" | "booster" | "payload";
  stageAttachment: "serial" | "parallel";
  stageInstanceIndex: number;
  centerYM: number;
  centerZM: number;
  /** Component envelopes are already expressed in the common vehicle frame. */
  components: readonly AttachedAeroComponentEnvelope[];
}>;

export type AttachedAeroInterferencePair = Readonly<{
  id: string;
  upstreamBodyId: string;
  upstreamLabel: string;
  downstreamBodyId: string;
  downstreamLabel: string;
  axialOverlapM: number;
  radialCenterDistanceM: number;
  radialClearanceM: number;
  nearClearanceM: number;
  status: AttachedAeroPairStatus;
  detail: string;
}>;

export type AttachedAeroInterferenceResult = Readonly<{
  modelVersion: typeof ATTACHED_AERO_INTERFERENCE_MODEL_VERSION;
  validationStatus: typeof ATTACHED_AERO_INTERFERENCE_VALIDATION_STATUS;
  overallStatus: AttachedAeroInterferenceStatus;
  bodyCount: number;
  assessedBodyCount: number;
  unavailableBodyCount: number;
  pairCount: number;
  clearPairCount: number;
  nearPairCount: number;
  overlapPairCount: number;
  minimumClearanceM: number | null;
  maximumPenetrationM: number | null;
  pairs: readonly AttachedAeroInterferencePair[];
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

export type AttachedAeroInterferenceOptions = Readonly<{
  /** Clearance below this value is shown as a near-interference watch item. */
  nearClearanceM?: number;
  /** Small numerical tolerance used for axial overlap and co-linear tests. */
  axialToleranceM?: number;
}>;

export type AttachedAeroInterferenceInput = Readonly<{
  bodies: readonly AttachedAeroInterferenceBody[];
  options?: AttachedAeroInterferenceOptions;
}>;

type EnvelopeSample = Readonly<{
  xM: number;
  radiusM: number;
}>;

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function positive(value: number, label: string): void {
  finite(value, label);
  if (!(value > 0)) throw new Error(`${label} must be positive`);
}

function nonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must be non-empty`);
}

function validateRotation(rotation: Matrix3, label: string): void {
  if (!rotation.flat().every(Number.isFinite)) {
    throw new Error(`${label} rotation must contain finite values`);
  }
}

function worldPoint(
  transform: Required<RigidTransform>,
  localPoint: Vector3,
): Vector3 {
  return addVectors(
    transform.translationM,
    multiplyMatrixVector(transform.rotation, localPoint),
  );
}

function envelopeFromSamples(
  id: string,
  label: string,
  sourceKind: AttachedAeroComponentEnvelope["sourceKind"],
  transform: Required<RigidTransform>,
  localRotation: Matrix3,
  localOrigin: Vector3,
  samples: readonly EnvelopeSample[],
): AttachedAeroComponentEnvelope {
  if (samples.length === 0) throw new Error(`${label} has no aerodynamic envelope samples`);
  const rotation = multiplyMatrices(transform.rotation, localRotation);
  validateRotation(rotation, `${label} world`);
  const origin = worldPoint(transform, localOrigin);
  let axialStartM = Number.POSITIVE_INFINITY;
  let axialEndM = Number.NEGATIVE_INFINITY;
  const centers: Vector3[] = [];
  for (const sample of samples) {
    finite(sample.xM, `${label} axial station`);
    if (sample.radiusM < 0 || !Number.isFinite(sample.radiusM)) {
      throw new Error(`${label} envelope radius must be finite and non-negative`);
    }
    const center = addVectors(
      origin,
      multiplyMatrixVector(rotation, { x: sample.xM, y: 0, z: 0 }),
    );
    /*
     * A cross-section can contribute to the world-X extent when a caller
     * supplies a tilted component. The transverse radius below is likewise
     * conservative for the common body-axis-aligned case.
     */
    const axialRadiusM = sample.radiusM * Math.hypot(rotation[0][1], rotation[0][2]);
    axialStartM = Math.min(axialStartM, center.x - axialRadiusM);
    axialEndM = Math.max(axialEndM, center.x + axialRadiusM);
    centers.push(center);
  }
  const middle = centers[Math.floor(centers.length / 2)] ?? worldPoint(transform, ZERO_VECTOR);
  let outerRadiusM = 0;
  for (let index = 0; index < centers.length; index += 1) {
    const center = centers[index];
    outerRadiusM = Math.max(
      outerRadiusM,
      Math.hypot(center.y - middle.y, center.z - middle.z) + samples[index].radiusM,
    );
  }
  positive(axialEndM - axialStartM, `${label} axial extent`);
  positive(outerRadiusM, `${label} transverse envelope`);
  return {
    id,
    label,
    sourceKind,
    axialStartM,
    axialEndM,
    centerYM: middle.y,
    centerZM: middle.z,
    outerRadiusM,
  };
}

/**
 * Convert an original RocketWorks component primitive into a conservative
 * geometry envelope for the attached-flow review. Point masses intentionally
 * return null because they have no aerodynamic surface geometry.
 */
export function createAttachedAeroComponentEnvelope(
  component: VehicleComponent,
  transform: Required<RigidTransform>,
): AttachedAeroComponentEnvelope | null {
  if (component.kind === "pointMass") return null;
  if (!component.id.trim() || !component.name.trim()) {
    throw new Error("aerodynamic component id and name must be non-empty");
  }
  validateRotation(transform.rotation, `component ${component.id}`);
  if (component.kind === "axisymmetric") {
    if (component.stations.length < 2) {
      throw new Error(`axisymmetric component ${component.id} requires two stations`);
    }
    const samples = component.stations.map((station) => ({
      xM: station.xM,
      radiusM: station.outerRadiusM,
    }));
    return envelopeFromSamples(
      component.id,
      component.name,
      "axisymmetric",
      transform,
      component.rotation ?? IDENTITY_MATRIX,
      component.positionM ?? ZERO_VECTOR,
      samples,
    );
  }
  if (!Number.isInteger(component.count) || component.count < 1) {
    throw new Error(`fin set ${component.id} count must be a positive integer`);
  }
  for (const [label, value] of [
    ["axial position", component.axialPositionM],
    ["body radius", component.bodyRadiusM],
    ["root chord", component.rootChordM],
    ["tip chord", component.tipChordM],
    ["sweep", component.sweepM],
    ["span", component.spanM],
  ] as const) {
    finite(value, `fin set ${component.id} ${label}`);
  }
  if (component.bodyRadiusM < 0 || component.rootChordM <= 0 || component.tipChordM <= 0 || component.spanM <= 0) {
    throw new Error(`fin set ${component.id} has invalid envelope dimensions`);
  }
  const endOffsetM = Math.max(component.rootChordM, component.sweepM + component.tipChordM);
  return envelopeFromSamples(
    component.id,
    component.name,
    "finSet",
    transform,
    IDENTITY_MATRIX,
    ZERO_VECTOR,
    [
      { xM: component.axialPositionM, radiusM: component.bodyRadiusM + component.spanM },
      { xM: component.axialPositionM + endOffsetM, radiusM: component.bodyRadiusM + component.spanM },
    ],
  );
}

export function createAttachedAeroInterferenceBody(
  input: Readonly<{
    id: string;
    label: string;
    stageId: string;
    stageRole?: AttachedAeroInterferenceBody["stageRole"];
    stageAttachment: AttachedAeroInterferenceBody["stageAttachment"];
    stageInstanceIndex: number;
    centerYM: number;
    centerZM: number;
    components: readonly AttachedAeroComponentEnvelope[];
  }>,
): AttachedAeroInterferenceBody {
  nonEmpty(input.id, "attached aero body id");
  nonEmpty(input.label, "attached aero body label");
  nonEmpty(input.stageId, "attached aero stage id");
  if (!Number.isInteger(input.stageInstanceIndex) || input.stageInstanceIndex < 0) {
    throw new Error("attached aero stage instance index must be a non-negative integer");
  }
  finite(input.centerYM, `${input.id} centre y`);
  finite(input.centerZM, `${input.id} centre z`);
  if (input.components.length === 0) {
    return { ...input, components: [] };
  }
  for (const component of input.components) {
    nonEmpty(component.id, `${input.id} component id`);
    nonEmpty(component.label, `${input.id} component label`);
    finite(component.axialStartM, `${component.id} axial start`);
    finite(component.axialEndM, `${component.id} axial end`);
    if (!(component.axialEndM > component.axialStartM)) {
      throw new Error(`${component.id} axial end must exceed axial start`);
    }
    finite(component.centerYM, `${component.id} centre y`);
    finite(component.centerZM, `${component.id} centre z`);
    positive(component.outerRadiusM, `${component.id} outer radius`);
  }
  return { ...input, components: [...input.components] };
}

function bodyGeometry(body: AttachedAeroInterferenceBody): Readonly<{
  axialStartM: number;
  axialEndM: number;
  outerRadiusM: number;
}> | null {
  if (body.components.length === 0) return null;
  const axialStartM = Math.min(...body.components.map((component) => component.axialStartM));
  const axialEndM = Math.max(...body.components.map((component) => component.axialEndM));
  const outerRadiusM = Math.max(
    ...body.components.map((component) =>
      Math.hypot(component.centerYM - body.centerYM, component.centerZM - body.centerZM) + component.outerRadiusM,
    ),
  );
  if (!(axialEndM > axialStartM) || !(outerRadiusM > 0)) return null;
  return { axialStartM, axialEndM, outerRadiusM };
}

function pairDetail(status: AttachedAeroPairStatus, clearanceM: number): string {
  if (status === "overlap") {
    return `Conservative radial envelopes overlap by ${(Math.abs(clearanceM) * 1000).toFixed(1)} mm.`;
  }
  if (status === "near") {
    return `Only ${(clearanceM * 1000).toFixed(1)} mm of radial envelope clearance remains.`;
  }
  return `Radial envelope clearance is ${(clearanceM * 1000).toFixed(1)} mm.`;
}

function validateBody(body: AttachedAeroInterferenceBody, index: number): void {
  nonEmpty(body.id, `attached aero body ${index + 1} id`);
  nonEmpty(body.label, `attached aero body ${index + 1} label`);
  nonEmpty(body.stageId, `attached aero body ${index + 1} stage id`);
  if (!["serial", "parallel"].includes(body.stageAttachment)) {
    throw new Error(`attached aero body ${body.id} stage attachment is invalid`);
  }
  if (!Number.isInteger(body.stageInstanceIndex) || body.stageInstanceIndex < 0) {
    throw new Error(`attached aero body ${body.id} stage instance index is invalid`);
  }
  finite(body.centerYM, `${body.id} centre y`);
  finite(body.centerZM, `${body.id} centre z`);
  for (const component of body.components) {
    finite(component.axialStartM, `${component.id} axial start`);
    finite(component.axialEndM, `${component.id} axial end`);
    if (!(component.axialEndM > component.axialStartM)) {
      throw new Error(`${component.id} axial end must exceed axial start`);
    }
    finite(component.centerYM, `${component.id} centre y`);
    finite(component.centerZM, `${component.id} centre z`);
    positive(component.outerRadiusM, `${component.id} outer radius`);
  }
}

/**
 * Screen attached stage envelopes for axial overlap and radial clearance.
 * This is deliberately post-processing: the result never changes an aero
 * coefficient, force, moment, or trajectory state.
 */
export function analyzeAttachedAeroInterference(
  input: AttachedAeroInterferenceInput,
): AttachedAeroInterferenceResult {
  if (input.bodies.length > 128) throw new Error("attached aero review supports at most 128 bodies");
  const nearClearanceM = input.options?.nearClearanceM ?? 0.005;
  const axialToleranceM = input.options?.axialToleranceM ?? 1e-6;
  finite(nearClearanceM, "attached aero near clearance");
  finite(axialToleranceM, "attached aero axial tolerance");
  if (nearClearanceM < 0 || nearClearanceM > 1) {
    throw new Error("attached aero near clearance must be between 0 and 1 m");
  }
  if (axialToleranceM < 0 || axialToleranceM > 0.1) {
    throw new Error("attached aero axial tolerance must be between 0 and 0.1 m");
  }
  input.bodies.forEach(validateBody);
  const geometries = input.bodies.map((body) => bodyGeometry(body));
  const pairs: AttachedAeroInterferencePair[] = [];
  for (let leftIndex = 0; leftIndex < input.bodies.length; leftIndex += 1) {
    const left = input.bodies[leftIndex];
    const leftGeometry = geometries[leftIndex];
    if (!leftGeometry) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < input.bodies.length; rightIndex += 1) {
      const right = input.bodies[rightIndex];
      const rightGeometry = geometries[rightIndex];
      if (!rightGeometry) continue;
      if (left.stageId === right.stageId && left.stageInstanceIndex === right.stageInstanceIndex) continue;
      const axialOverlapM = Math.min(leftGeometry.axialEndM, rightGeometry.axialEndM) - Math.max(leftGeometry.axialStartM, rightGeometry.axialStartM);
      if (axialOverlapM <= axialToleranceM) continue;
      const radialCenterDistanceM = Math.hypot(
        left.centerYM - right.centerYM,
        left.centerZM - right.centerZM,
      );
      /* Co-linear serial stages meet at a structural interface by design. */
      if (
        left.stageAttachment === "serial" &&
        right.stageAttachment === "serial" &&
        radialCenterDistanceM <= axialToleranceM
      ) continue;
      const radialClearanceM = radialCenterDistanceM - leftGeometry.outerRadiusM - rightGeometry.outerRadiusM;
      const status: AttachedAeroPairStatus = radialClearanceM < -axialToleranceM
        ? "overlap"
        : radialClearanceM <= nearClearanceM
          ? "near"
          : "clear";
      const [first, second] = left.id.localeCompare(right.id) <= 0 ? [left, right] : [right, left];
      pairs.push({
        id: `${first.id}__${second.id}`,
        upstreamBodyId: first.id,
        upstreamLabel: first.label,
        downstreamBodyId: second.id,
        downstreamLabel: second.label,
        axialOverlapM,
        radialCenterDistanceM,
        radialClearanceM,
        nearClearanceM,
        status,
        detail: pairDetail(status, radialClearanceM),
      });
    }
  }
  pairs.sort((left, right) => left.radialClearanceM - right.radialClearanceM || left.id.localeCompare(right.id));
  const clearPairCount = pairs.filter((pair) => pair.status === "clear").length;
  const nearPairCount = pairs.filter((pair) => pair.status === "near").length;
  const overlapPairCount = pairs.filter((pair) => pair.status === "overlap").length;
  const unavailableBodyCount = geometries.filter((geometry) => geometry === null).length;
  const assessedBodyCount = input.bodies.length - unavailableBodyCount;
  const overallStatus: AttachedAeroInterferenceStatus = input.bodies.length === 0 || assessedBodyCount === 0
    ? "not-assessed"
    : overlapPairCount > 0
      ? "review"
      : nearPairCount > 0 || unavailableBodyCount > 0
        ? "watch"
        : "screened";
  const minimumClearanceM = pairs.length > 0
    ? Math.min(...pairs.map((pair) => pair.radialClearanceM))
    : null;
  const maximumPenetrationM = overlapPairCount > 0
    ? Math.max(...pairs.filter((pair) => pair.status === "overlap").map((pair) => -pair.radialClearanceM))
    : null;
  const warnings = [
    "This is a conservative attached-flow geometry screen; it does not modify drag, lift, moments, or trajectory propagation.",
    ...(unavailableBodyCount > 0
      ? [`${unavailableBodyCount} attached body${unavailableBodyCount === 1 ? " is" : "ies are"} missing aerodynamic surface geometry and was not pair-screened.`]
      : []),
    ...(overlapPairCount > 0
      ? [`${overlapPairCount} attached body pair${overlapPairCount === 1 ? " has" : "s have"} overlapping conservative radial envelopes.`]
      : []),
    ...(nearPairCount > 0
      ? [`${nearPairCount} attached body pair${nearPairCount === 1 ? " is" : "s are"} within the ${nearClearanceM * 1000} mm near-clearance watch band.`]
      : []),
    ...(pairs.length === 0 && unavailableBodyCount === 0
      ? ["No attached-body pairs with axial overlap and a non-coaxial relationship were identified."]
      : []),
  ];
  return {
    modelVersion: ATTACHED_AERO_INTERFERENCE_MODEL_VERSION,
    validationStatus: ATTACHED_AERO_INTERFERENCE_VALIDATION_STATUS,
    overallStatus,
    bodyCount: input.bodies.length,
    assessedBodyCount,
    unavailableBodyCount,
    pairCount: pairs.length,
    clearPairCount,
    nearPairCount,
    overlapPairCount,
    minimumClearanceM,
    maximumPenetrationM,
    pairs,
    assumptions: [
      "Each body is represented by a conservative axial and transverse envelope assembled from the supplied axisymmetric and fin geometry.",
      "Pairs without axial overlap are omitted; co-linear serial bodies are treated as an intentional structural interface and are not flagged as interference.",
      "This review is an analytical component check only. Relative flow, plume interaction, unsteady loads, and stage separation are outside the model.",
    ],
    warnings,
  };
}
