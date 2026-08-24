/**
 * First-order axial load-path review with optional body-transverse telemetry
 * and explicitly separate shell-section shear capacity proxies.
 *
 * This is deliberately a bounded proxy, not a connector/contact solver. It
 * uses the supplied stage masses, peak thrusts, and shell-section allowables
 * to estimate the axial force carried across each serial topology edge. A
 * current staged-flight trace may add peak body-axis and body-transverse
 * acceleration envelopes, while the peak-thrust baseline remains as a
 * conservative lower bound for axial demand. A parallel edge keeps its
 * serial-capacity row unavailable, but also receives a separate equal-share
 * force-scale audit so radial and eccentric effects stay visible. When both
 * parent and child shear evidence is supplied, the audit also compares the
 * local radial demand with a shell-section shear proxy; it never pretends to
 * solve the local connector or joint.
 */

export const STAGE_INTERFACE_LOADS_MODEL_VERSION =
  "rocketworks-stage-interface-loads-0.6.0";
export const STAGE_INTERFACE_LOADS_VALIDATION_STATUS =
  "analytical-axial-transverse-radial-connector-load-path-proxy" as const;

export type StageInterfaceLoadAttachment = "serial" | "parallel";
export type StageInterfaceLoadStatus = "pass" | "review" | "unavailable";
export type StageInterfaceLoadAccelerationBasis =
  | "peak-thrust-common-acceleration"
  | "trace-peak-with-baseline";
export type StageInterfaceLoadTransverseAccelerationBasis =
  | "not-available"
  | "trace-body-transverse";

export type StageInterfaceLoadTracePoint = Readonly<{
  timeS: number;
  /** Net acceleration projected onto the vehicle nose axis (+nose direction). */
  axialAccelerationMps2: number;
  /** Magnitude of net acceleration perpendicular to the nose in body +Y/+Z. */
  transverseAccelerationMps2?: number;
  /** Optional active-stage set used to exclude post-separation intervals. */
  attachedStageIds?: readonly string[];
}>;

export type StageParallelLoadAuditStatus = "screened" | "unavailable";
export type StageInterfaceShearCapacityStatus = "pass" | "review" | "unavailable";
export type StageInterfaceShearReviewStatus = "assessed" | "review" | "not-assessed";
export type StageInterfaceConnectorReviewStatus = "assessed" | "review" | "not-assessed";

/**
 * User-supplied upstream connector-group evidence for one child stage.
 *
 * The group is treated as a set of identical fasteners sharing a direct
 * single-shear load. `efficiency` is an explicit user-supplied reduction for
 * load sharing/installation effects; it is not inferred from geometry.
 */
export type StageInterfaceConnectorEvidence = Readonly<{
  count: number;
  diameterM: number;
  allowableShearPa: number;
  efficiency?: number;
}>;

/**
 * A bounded equal-share load audit for a repeated radial stage. The values
 * are force and moment scales, not a connector or finite-element solution.
 */
export type StageParallelLoadAudit = Readonly<{
  id: string;
  parentStageId: string;
  childStageId: string;
  parentLabel: string | null;
  childLabel: string;
  status: StageParallelLoadAuditStatus;
  reason: string | null;
  instanceCount: number;
  repeatRadiusM: number;
  thrustCantAngleDeg: number;
  thrustCantAzimuthDeg: number;
  loadShareFraction: number | null;
  downstreamMassKg: number | null;
  totalDownstreamAxialDemandN: number | null;
  perInstanceAxialDemandN: number | null;
  totalDownstreamTransverseDemandN: number | null;
  perInstanceTransverseDemandN: number | null;
  perInstanceResultantDemandN: number | null;
  radialDemandN: number | null;
  shearCapacityN: number | null;
  radialFactorOfSafety: number | null;
  radialCapacityStatus: StageInterfaceShearCapacityStatus;
  connectorCapacityN: number | null;
  connectorFactorOfSafety: number | null;
  connectorCapacityStatus: StageInterfaceShearCapacityStatus;
  perInstancePeakThrustN: number | null;
  perInstanceRadialThrustN: number | null;
  perInstanceEccentricMomentNm: number | null;
  symmetricResultantRadialThrustN: number | null;
  effectiveAxialAccelerationMps2: number | null;
  tracePeakAxialAccelerationMps2: number | null;
  tracePeakTimeS: number | null;
  transverseAccelerationMps2: number | null;
  tracePeakTransverseAccelerationMps2: number | null;
  tracePeakTransverseTimeS: number | null;
  loadFactor: number;
  detail: string;
}>;

export type StageInterfaceLoadStageInput = Readonly<{
  id: string;
  label: string;
  parentStageId?: string | null;
  attachment: StageInterfaceLoadAttachment;
  enabled?: boolean;
  /** Total mass of the logical stage row, excluding retained payload mass. */
  stageMassKg: number;
  /** Sum of configured motor peak thrust for this logical stage row. */
  peakThrustN: number;
  /** Number of repeated physical instances for a parallel stage. */
  repeatCount?: number;
  /** Radial placement radius for repeated parallel instances, in metres. */
  repeatRadiusM?: number;
  /** Authored nominal thrust cant angle for this stage, in degrees. */
  thrustCantAngleDeg?: number;
  /** Authored nominal thrust cant azimuth, in degrees. */
  thrustCantAzimuthDeg?: number;
  /** Minimum shell-section area used as a connector-section proxy. */
  sectionAreaM2?: number | null;
  /** Compression allowable used as a connector-section proxy. */
  allowableCompressionPa?: number | null;
  /** Shear allowable used as a clearly labelled shell-section capacity proxy. */
  allowableShearPa?: number | null;
  /** Optional upstream connector-group evidence for this child stage. */
  connectorEvidence?: StageInterfaceConnectorEvidence | null;
  requiredFactorOfSafety?: number;
}>;

export type StageInterfaceLoadInterface = Readonly<{
  id: string;
  parentStageId: string | null;
  childStageId: string;
  parentLabel: string | null;
  childLabel: string;
  attachment: StageInterfaceLoadAttachment;
  status: StageInterfaceLoadStatus;
  accelerationBasis: StageInterfaceLoadAccelerationBasis;
  transverseAccelerationBasis: StageInterfaceLoadTransverseAccelerationBasis;
  tracePeakAxialAccelerationMps2: number | null;
  tracePeakTimeS: number | null;
  tracePeakTransverseAccelerationMps2: number | null;
  tracePeakTransverseTimeS: number | null;
  downstreamMassKg: number | null;
  totalStackMassKg: number;
  peakThrustN: number;
  effectiveAxialAccelerationMps2: number;
  effectiveTransverseAccelerationMps2: number | null;
  loadFactor: number;
  axialDemandN: number | null;
  transverseDemandN: number | null;
  resultantDemandN: number | null;
  shearCapacityN: number | null;
  transverseFactorOfSafety: number | null;
  transverseCapacityStatus: StageInterfaceShearCapacityStatus;
  connectorCapacityN: number | null;
  connectorFactorOfSafety: number | null;
  connectorCapacityStatus: StageInterfaceShearCapacityStatus;
  sectionAreaM2: number | null;
  allowableCompressionPa: number | null;
  capacityN: number | null;
  factorOfSafety: number | null;
  requiredFactorOfSafety: number;
  detail: string;
  reason: string | null;
}>;

export type StageInterfaceLoadResult = Readonly<{
  modelVersion: typeof STAGE_INTERFACE_LOADS_MODEL_VERSION;
  validationStatus: typeof STAGE_INTERFACE_LOADS_VALIDATION_STATUS;
  overallStatus: "assessed" | "review" | "not-assessed";
  shearStatus: StageInterfaceShearReviewStatus;
  connectorStatus: StageInterfaceConnectorReviewStatus;
  counts: Readonly<{
    pass: number;
    review: number;
    unavailable: number;
  }>;
  totalStackMassKg: number;
  retainedMassKg: number;
  peakThrustN: number;
  effectiveAxialAccelerationMps2: number | null;
  accelerationBasis: StageInterfaceLoadAccelerationBasis;
  transverseAccelerationBasis: StageInterfaceLoadTransverseAccelerationBasis;
  tracePeakAxialAccelerationMps2: number | null;
  tracePeakTimeS: number | null;
  tracePeakTransverseAccelerationMps2: number | null;
  tracePeakTransverseTimeS: number | null;
  gravityMps2: number;
  loadFactor: number;
  interfaces: readonly StageInterfaceLoadInterface[];
  parallelAudits: readonly StageParallelLoadAudit[];
  weakestInterface: StageInterfaceLoadInterface | null;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

const DEFAULT_GRAVITY_MPS2 = 9.80665;
const DEFAULT_LOAD_FACTOR = 1;
const DEFAULT_REQUIRED_FACTOR_OF_SAFETY = 1.5;

function assertText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must be non-empty`);
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertNonNegative(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0) throw new Error(`${label} cannot be negative`);
}

function normalizePositive(value: number | undefined, fallback: number, label: string): number {
  const normalized = value ?? fallback;
  assertFinite(normalized, label);
  if (!(normalized > 0)) throw new Error(`${label} must be positive`);
  return normalized;
}

function normalizeOptionalPositive(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null;
  assertFinite(value, label);
  if (!(value > 0)) throw new Error(`${label} must be positive when supplied`);
  return value;
}

function normalizeOptionalNonNegative(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null;
  assertNonNegative(value, label);
  return value;
}

function normalizeConnectorEvidence(
  value: StageInterfaceConnectorEvidence | null | undefined,
  label: string,
): StageInterfaceConnectorEvidence | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") throw new Error(`${label} must be an object when supplied`);
  const count = value.count;
  if (!Number.isInteger(count) || count < 1 || count > 256) {
    throw new Error(`${label} count must be an integer from 1 through 256`);
  }
  const diameterM = value.diameterM;
  if (!Number.isFinite(diameterM) || diameterM <= 0 || diameterM > 0.2) {
    throw new Error(`${label} diameter must be finite, positive, and at most 0.2 m`);
  }
  const allowableShearPa = value.allowableShearPa;
  if (!Number.isFinite(allowableShearPa) || allowableShearPa <= 0 || allowableShearPa > 2e9) {
    throw new Error(`${label} allowable shear must be finite, positive, and at most 2e9 Pa`);
  }
  const efficiency = value.efficiency ?? 1;
  if (!Number.isFinite(efficiency) || efficiency <= 0 || efficiency > 1) {
    throw new Error(`${label} efficiency must be greater than 0 and at most 1`);
  }
  return { count, diameterM, allowableShearPa, efficiency };
}

function connectorCapacityN(evidence: StageInterfaceConnectorEvidence | null): number | null {
  if (evidence === null) return null;
  const grossShearAreaM2 = evidence.count * Math.PI * (evidence.diameterM / 2) ** 2;
  return grossShearAreaM2 * evidence.allowableShearPa * (evidence.efficiency ?? 1);
}

function normalizeRepeatCount(value: number | undefined, label: string): number {
  const normalized = value ?? 1;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 8) {
    throw new Error(`${label} must be an integer from 1 through 8`);
  }
  return normalized;
}

function normalizeBounded(value: number | undefined, fallback: number, minimum: number, maximum: number, label: string): number {
  const normalized = value ?? fallback;
  assertFinite(normalized, label);
  if (normalized < minimum || normalized > maximum) {
    throw new Error(`${label} must be from ${minimum} through ${maximum}`);
  }
  return normalized;
}

function normalizeTrace(
  trace: readonly StageInterfaceLoadTracePoint[] | undefined,
): readonly StageInterfaceLoadTracePoint[] {
  if (trace === undefined) return [];
  if (trace.length === 0) throw new Error("stage interface load trace cannot be empty when supplied");
  let previousTimeS = -Infinity;
  return trace.map((point, index) => {
    assertFinite(point.timeS, `stage interface load trace sample ${index + 1} time`);
    if (point.timeS < previousTimeS) {
      throw new Error("stage interface load trace times must be non-decreasing");
    }
    assertFinite(
      point.axialAccelerationMps2,
      `stage interface load trace sample ${index + 1} axial acceleration`,
    );
    if (point.transverseAccelerationMps2 !== undefined) {
      assertNonNegative(
        point.transverseAccelerationMps2,
        `stage interface load trace sample ${index + 1} transverse acceleration`,
      );
    }
    const attachedStageIds = point.attachedStageIds === undefined
      ? undefined
      : [...new Set(point.attachedStageIds.map((stageId) => stageId.trim()))];
    if (attachedStageIds?.some((stageId) => !stageId)) {
      throw new Error(`stage interface load trace sample ${index + 1} stage identifiers cannot be empty`);
    }
    previousTimeS = point.timeS;
    return {
      timeS: point.timeS,
      axialAccelerationMps2: point.axialAccelerationMps2,
      ...(point.transverseAccelerationMps2 === undefined
        ? {}
        : { transverseAccelerationMps2: point.transverseAccelerationMps2 }),
      ...(attachedStageIds ? { attachedStageIds } : {}),
    };
  });
}

function tracePeakForInterface(
  trace: readonly StageInterfaceLoadTracePoint[],
  parentStageId: string,
  childStageId: string,
  channel: "axial" | "transverse" = "axial",
): Readonly<{ accelerationMps2: number; timeS: number }> | null {
  const relevant = trace.filter((point) =>
    (channel === "axial" || point.transverseAccelerationMps2 !== undefined) &&
    (point.attachedStageIds === undefined ||
      (point.attachedStageIds.includes(parentStageId) && point.attachedStageIds.includes(childStageId))),
  );
  if (relevant.length === 0) return null;
  const accelerationAt = (point: StageInterfaceLoadTracePoint): number =>
    channel === "axial" ? point.axialAccelerationMps2 : point.transverseAccelerationMps2!;
  return relevant.reduce<Readonly<{ accelerationMps2: number; timeS: number }>>(
    (peak, point) => accelerationAt(point) > peak.accelerationMps2
      ? { accelerationMps2: accelerationAt(point), timeS: point.timeS }
      : peak,
    { accelerationMps2: accelerationAt(relevant[0]!), timeS: relevant[0]!.timeS },
  );
}

function statusRank(status: StageInterfaceLoadStatus): number {
  return status === "review" ? 0 : status === "unavailable" ? 1 : 2;
}

/**
 * Review axial force transfer across each enabled topology edge.
 *
 * The baseline effective acceleration is `max(g, T/M)`, then each serial
 * interface demand is `downstream mass * effective acceleration * load factor`.
 * When a trace is supplied, the largest attached-sample body-axis acceleration
 * is compared with that baseline. Axial capacity is the weaker of the
 * parent/child section proxies when both are supplied. A separate
 * `A · allowableShear` proxy is reported for body-transverse or per-instance
 * radial demand when positive shear evidence exists; it never changes the
 * axial compression status. This intentionally ignores drag, rail
 * contact/reaction, thrust cant beyond the parallel force-scale term,
 * transients, bending, fasteners, joints, local buckling, and separation
 * dynamics.
 */
export function createStageInterfaceLoadReview(
  input: Readonly<{
    stages: readonly StageInterfaceLoadStageInput[];
    retainedMassKg?: number;
    gravityMps2?: number;
    loadFactor?: number;
    trace?: readonly StageInterfaceLoadTracePoint[];
  }>,
): StageInterfaceLoadResult {
  const retainedMassKg = input.retainedMassKg ?? 0;
  assertNonNegative(retainedMassKg, "retained mass");
  const gravityMps2 = normalizePositive(input.gravityMps2, DEFAULT_GRAVITY_MPS2, "gravity");
  const loadFactor = normalizePositive(input.loadFactor, DEFAULT_LOAD_FACTOR, "interface load factor");
  const trace = normalizeTrace(input.trace);

  const seenIds = new Set<string>();
  const normalizedStages = input.stages.map((stage) => {
    assertText(stage.id, "stage interface id");
    assertText(stage.label, `stage ${stage.id} label`);
    if (seenIds.has(stage.id)) throw new Error(`duplicate stage interface id: ${stage.id}`);
    seenIds.add(stage.id);
    if (stage.attachment !== "serial" && stage.attachment !== "parallel") {
      throw new Error(`stage ${stage.id} attachment must be serial or parallel`);
    }
    if (stage.enabled !== undefined && typeof stage.enabled !== "boolean") {
      throw new Error(`stage ${stage.id} enabled must be boolean when supplied`);
    }
    if (stage.parentStageId !== undefined && stage.parentStageId !== null) {
      assertText(stage.parentStageId, `stage ${stage.id} parent id`);
    }
    assertNonNegative(stage.stageMassKg, `stage ${stage.id} mass`);
    assertNonNegative(stage.peakThrustN, `stage ${stage.id} peak thrust`);
    const sectionAreaM2 = normalizeOptionalPositive(
      stage.sectionAreaM2,
      `stage ${stage.id} section area`,
    );
    const allowableCompressionPa = normalizeOptionalPositive(
      stage.allowableCompressionPa,
      `stage ${stage.id} compression allowable`,
    );
    const allowableShearPa = normalizeOptionalPositive(
      stage.allowableShearPa,
      `stage ${stage.id} shear allowable`,
    );
    const connectorEvidence = normalizeConnectorEvidence(
      stage.connectorEvidence,
      `stage ${stage.id} connector evidence`,
    );
    const requiredFactorOfSafety = normalizePositive(
      stage.requiredFactorOfSafety,
      DEFAULT_REQUIRED_FACTOR_OF_SAFETY,
      `stage ${stage.id} required factor of safety`,
    );
    const repeatCount = normalizeRepeatCount(stage.repeatCount, `stage ${stage.id} repeat count`);
    const repeatRadiusM = normalizeOptionalNonNegative(stage.repeatRadiusM, `stage ${stage.id} repeat radius`)
      ?? 0;
    const thrustCantAngleDeg = normalizeBounded(
      stage.thrustCantAngleDeg,
      0,
      0,
      15,
      `stage ${stage.id} thrust cant angle`,
    );
    const thrustCantAzimuthDeg = normalizeBounded(
      stage.thrustCantAzimuthDeg,
      0,
      -180,
      180,
      `stage ${stage.id} thrust cant azimuth`,
    );
    if (stage.attachment === "parallel" && repeatCount > 1 && !(repeatRadiusM > 0)) {
      throw new Error(`stage ${stage.id} repeat radius must be positive for repeated parallel instances`);
    }
    return {
      id: stage.id,
      label: stage.label,
      parentStageId: stage.parentStageId ?? null,
      attachment: stage.attachment,
      enabled: stage.enabled !== false,
      stageMassKg: stage.stageMassKg,
      peakThrustN: stage.peakThrustN,
      sectionAreaM2,
      allowableCompressionPa,
      allowableShearPa,
      connectorEvidence,
      requiredFactorOfSafety,
      repeatCount,
      repeatRadiusM,
      thrustCantAngleDeg,
      thrustCantAzimuthDeg,
    } as const;
  });

  const allStagesById = new Map(normalizedStages.map((stage) => [stage.id, stage]));
  const activeStages = normalizedStages.filter((stage) => stage.enabled);
  const activeStagesById = new Map(activeStages.map((stage) => [stage.id, stage]));
  const childrenByParent = new Map<string, string[]>();
  for (const stage of activeStages) {
    if (stage.parentStageId === null) continue;
    const children = childrenByParent.get(stage.parentStageId) ?? [];
    children.push(stage.id);
    childrenByParent.set(stage.parentStageId, children);
  }

  const subtreeMassMemo = new Map<string, number>();
  const subtreeMass = (stageId: string, path: Set<string>): number => {
    const cached = subtreeMassMemo.get(stageId);
    if (cached !== undefined) return cached;
    if (path.has(stageId)) throw new Error(`stage interface topology contains a cycle at ${stageId}`);
    const stage = activeStagesById.get(stageId);
    if (!stage) return 0;
    const nextPath = new Set(path);
    nextPath.add(stageId);
    const mass = stage.stageMassKg + (childrenByParent.get(stageId) ?? [])
      .reduce((total, childId) => total + subtreeMass(childId, nextPath), 0);
    subtreeMassMemo.set(stageId, mass);
    return mass;
  };
  for (const stage of activeStages) subtreeMass(stage.id, new Set());

  const totalStackMassKg = retainedMassKg + activeStages.reduce(
    (total, stage) => total + stage.stageMassKg,
    0,
  );
  const peakThrustN = activeStages.reduce((total, stage) => total + stage.peakThrustN, 0);
  const baselineAxialAccelerationMps2 = totalStackMassKg > 0
    ? Math.max(gravityMps2, peakThrustN / totalStackMassKg)
    : null;
  const tracePeak = trace.length > 0
    ? trace.reduce<Readonly<{ accelerationMps2: number; timeS: number }>>(
        (peak, point) => point.axialAccelerationMps2 > peak.accelerationMps2
          ? { accelerationMps2: point.axialAccelerationMps2, timeS: point.timeS }
          : peak,
        { accelerationMps2: trace[0]!.axialAccelerationMps2, timeS: trace[0]!.timeS },
      )
    : null;
  const transverseTrace = trace.filter(
    (point): point is StageInterfaceLoadTracePoint & { transverseAccelerationMps2: number } =>
      point.transverseAccelerationMps2 !== undefined,
  );
  const tracePeakTransverse = transverseTrace.length > 0
    ? transverseTrace.reduce<Readonly<{ accelerationMps2: number; timeS: number }>>(
        (peak, point) => point.transverseAccelerationMps2 > peak.accelerationMps2
          ? { accelerationMps2: point.transverseAccelerationMps2, timeS: point.timeS }
          : peak,
        {
          accelerationMps2: transverseTrace[0]!.transverseAccelerationMps2,
          timeS: transverseTrace[0]!.timeS,
        },
      )
    : null;
  const effectiveAxialAccelerationMps2 = baselineAxialAccelerationMps2 === null
    ? null
    : Math.max(baselineAxialAccelerationMps2, tracePeak?.accelerationMps2 ?? 0);
  const accelerationBasis: StageInterfaceLoadAccelerationBasis = trace.length > 0
    ? "trace-peak-with-baseline"
    : "peak-thrust-common-acceleration";
  const transverseAccelerationBasis: StageInterfaceLoadTransverseAccelerationBasis =
    tracePeakTransverse === null ? "not-available" : "trace-body-transverse";

  const interfaces: StageInterfaceLoadInterface[] = activeStages
    .filter((stage) => stage.parentStageId !== null)
    .map((child) => {
      const parentId = child.parentStageId;
      const parent = parentId === null ? undefined : allStagesById.get(parentId);
      const activeParent = parentId === null ? undefined : activeStagesById.get(parentId);
      const id = `${parentId ?? "missing-parent"}--${child.id}`;
      const requiredFactorOfSafety = Math.max(
        child.requiredFactorOfSafety,
        parent?.requiredFactorOfSafety ?? DEFAULT_REQUIRED_FACTOR_OF_SAFETY,
      );
      const interfaceTracePeak = parentId === null
        ? null
        : tracePeakForInterface(trace, parentId, child.id);
      const interfaceTracePeakTransverse = parentId === null
        ? null
        : tracePeakForInterface(trace, parentId, child.id, "transverse");
      const interfaceEffectiveAxialAccelerationMps2 = effectiveAxialAccelerationMps2 === null
        ? null
        : Math.max(
            baselineAxialAccelerationMps2 ?? 0,
            interfaceTracePeak?.accelerationMps2 ?? 0,
          );
      const interfaceEffectiveTransverseAccelerationMps2 =
        interfaceTracePeakTransverse?.accelerationMps2 ?? null;
      const base = {
        id,
        parentStageId: parentId,
        childStageId: child.id,
        parentLabel: parent?.label ?? null,
        childLabel: child.label,
        attachment: child.attachment,
        accelerationBasis,
        transverseAccelerationBasis,
        tracePeakAxialAccelerationMps2: interfaceTracePeak?.accelerationMps2 ?? null,
        tracePeakTimeS: interfaceTracePeak?.timeS ?? null,
        tracePeakTransverseAccelerationMps2: interfaceTracePeakTransverse?.accelerationMps2 ?? null,
        tracePeakTransverseTimeS: interfaceTracePeakTransverse?.timeS ?? null,
        totalStackMassKg,
        peakThrustN,
        effectiveAxialAccelerationMps2: interfaceEffectiveAxialAccelerationMps2 ?? 0,
        effectiveTransverseAccelerationMps2: interfaceEffectiveTransverseAccelerationMps2,
        loadFactor,
        requiredFactorOfSafety,
      };

      if (interfaceEffectiveAxialAccelerationMps2 === null) {
        return {
          ...base,
          status: "unavailable" as const,
          downstreamMassKg: null,
          axialDemandN: null,
          transverseDemandN: null,
          resultantDemandN: null,
          sectionAreaM2: null,
          allowableCompressionPa: null,
          capacityN: null,
          shearCapacityN: null,
          transverseFactorOfSafety: null,
          transverseCapacityStatus: "unavailable",
          connectorCapacityN: null,
          connectorFactorOfSafety: null,
          connectorCapacityStatus: "unavailable",
          factorOfSafety: null,
          detail: "Axial demand is not available because the active stack has no positive mass.",
          reason: "No positive active stack mass was supplied.",
        };
      }
      if (!parent) {
        return {
          ...base,
          status: "unavailable" as const,
          downstreamMassKg: null,
          axialDemandN: null,
          transverseDemandN: null,
          resultantDemandN: null,
          sectionAreaM2: null,
          allowableCompressionPa: null,
          capacityN: null,
          shearCapacityN: null,
          transverseFactorOfSafety: null,
          transverseCapacityStatus: "unavailable",
          connectorCapacityN: null,
          connectorFactorOfSafety: null,
          connectorCapacityStatus: "unavailable",
          factorOfSafety: null,
          detail: "The parent stage is not present in the supplied topology.",
          reason: `Parent stage ${parentId ?? "(none)"} is missing.`,
        };
      }
      if (!activeParent) {
        return {
          ...base,
          status: "unavailable" as const,
          downstreamMassKg: null,
          axialDemandN: null,
          transverseDemandN: null,
          resultantDemandN: null,
          sectionAreaM2: null,
          allowableCompressionPa: null,
          capacityN: null,
          shearCapacityN: null,
          transverseFactorOfSafety: null,
          transverseCapacityStatus: "unavailable",
          connectorCapacityN: null,
          connectorFactorOfSafety: null,
          connectorCapacityStatus: "unavailable",
          factorOfSafety: null,
          detail: "The parent stage is disabled, so the active axial load path is incomplete.",
          reason: `Parent stage ${parent.label} is disabled or inactive.`,
        };
      }

      const downstreamMassKg = subtreeMass(child.id, new Set()) + retainedMassKg;
      const axialDemandN = downstreamMassKg * interfaceEffectiveAxialAccelerationMps2 * loadFactor;
      const transverseDemandN = interfaceEffectiveTransverseAccelerationMps2 === null
        ? null
        : downstreamMassKg * interfaceEffectiveTransverseAccelerationMps2 * loadFactor;
      const resultantDemandN = transverseDemandN === null
        ? null
        : Math.hypot(axialDemandN, transverseDemandN);
      if (child.attachment === "parallel") {
        return {
          ...base,
          status: "unavailable" as const,
          downstreamMassKg: null,
          axialDemandN: null,
          transverseDemandN: null,
          resultantDemandN: null,
          sectionAreaM2: null,
          allowableCompressionPa: null,
          capacityN: null,
          shearCapacityN: null,
          transverseFactorOfSafety: null,
          transverseCapacityStatus: "unavailable",
          connectorCapacityN: null,
          connectorFactorOfSafety: null,
          connectorCapacityStatus: "unavailable",
          factorOfSafety: null,
          detail: "Parallel attachment is identified, but radial joint load transfer is not modeled.",
          reason: "Parallel/radial interface solver is outside this axial serial proxy.",
        };
      }

      const sectionAreaM2 = child.sectionAreaM2 !== null && parent.sectionAreaM2 !== null
        ? Math.min(child.sectionAreaM2, parent.sectionAreaM2)
        : null;
      const allowableCompressionPa = child.allowableCompressionPa !== null && parent.allowableCompressionPa !== null
        ? Math.min(child.allowableCompressionPa, parent.allowableCompressionPa)
        : null;
      const allowableShearPa = child.allowableShearPa !== null && parent.allowableShearPa !== null
        ? Math.min(child.allowableShearPa, parent.allowableShearPa)
        : null;
      const capacityN = sectionAreaM2 !== null && allowableCompressionPa !== null
        ? sectionAreaM2 * allowableCompressionPa
        : null;
      const shearCapacityN = sectionAreaM2 !== null && allowableShearPa !== null
        ? sectionAreaM2 * allowableShearPa
        : null;
      const factorOfSafety = capacityN !== null && axialDemandN > 0
        ? capacityN / axialDemandN
        : null;
      const transverseFactorOfSafety = shearCapacityN !== null && transverseDemandN !== null && transverseDemandN > 0
        ? shearCapacityN / transverseDemandN
        : null;
      const transverseCapacityStatus: StageInterfaceShearCapacityStatus = transverseDemandN === null || shearCapacityN === null
        ? "unavailable"
        : transverseFactorOfSafety === null
          ? "unavailable"
          : transverseFactorOfSafety >= requiredFactorOfSafety
            ? "pass"
            : "review";
      const connectorCapacity = connectorCapacityN(child.connectorEvidence);
      const connectorFactorOfSafety = connectorCapacity !== null && transverseDemandN !== null && transverseDemandN > 0
        ? connectorCapacity / transverseDemandN
        : null;
      const connectorCapacityStatus: StageInterfaceShearCapacityStatus = transverseDemandN === null || connectorCapacity === null
        ? "unavailable"
        : connectorFactorOfSafety === null
          ? "unavailable"
          : connectorFactorOfSafety >= requiredFactorOfSafety
            ? "pass"
            : "review";
      const missingEvidence = [
        sectionAreaM2 === null ? "parent/child section area" : null,
        allowableCompressionPa === null ? "parent/child compression allowable" : null,
      ].filter((value): value is string => value !== null);
      const status: StageInterfaceLoadStatus = factorOfSafety === null
        ? "unavailable"
        : factorOfSafety >= requiredFactorOfSafety
          ? "pass"
          : "review";
      const reason = missingEvidence.length > 0
        ? `Missing ${missingEvidence.join(" and ")} evidence.`
        : status === "review" && factorOfSafety !== null
          ? `Interface factor of safety ${factorOfSafety.toFixed(2)}x is below the required ${requiredFactorOfSafety.toFixed(2)}x.`
          : null;
      return {
        ...base,
        status,
        downstreamMassKg,
        axialDemandN,
        transverseDemandN,
        resultantDemandN,
        sectionAreaM2,
        allowableCompressionPa,
        capacityN,
        shearCapacityN,
        transverseFactorOfSafety,
        transverseCapacityStatus,
        connectorCapacityN: connectorCapacity,
        connectorFactorOfSafety,
        connectorCapacityStatus,
        factorOfSafety,
        detail: status === "pass"
          ? "Serial interface passes the supplied axial compression proxy with the declared reserve."
          : reason ?? "Serial interface requires review.",
        reason,
      };
    });

  const parallelAudits: StageParallelLoadAudit[] = activeStages
    .filter((stage) => stage.parentStageId !== null && stage.attachment === "parallel")
    .map((child) => {
      const parentId = child.parentStageId!;
      const parent = allStagesById.get(parentId);
      const activeParent = activeStagesById.get(parentId);
      const id = `${parentId}--${child.id}`;
      const interfaceTracePeak = tracePeakForInterface(trace, parentId, child.id);
      const interfaceTracePeakTransverse = tracePeakForInterface(
        trace,
        parentId,
        child.id,
        "transverse",
      );
      const effectiveAcceleration = effectiveAxialAccelerationMps2 === null
        ? null
        : Math.max(
            baselineAxialAccelerationMps2 ?? 0,
            interfaceTracePeak?.accelerationMps2 ?? 0,
          );
      const effectiveTransverseAcceleration = interfaceTracePeakTransverse?.accelerationMps2 ?? null;
      const instanceCount = child.repeatCount;
      const angleRad = (child.thrustCantAngleDeg * Math.PI) / 180;
      const azimuthRad = (child.thrustCantAzimuthDeg * Math.PI) / 180;
      const downstreamMassKg = subtreeMass(child.id, new Set());
      const perInstanceMassKg = downstreamMassKg / instanceCount;
      const perInstancePeakThrustN = child.peakThrustN / instanceCount;
      const perInstanceRadialThrustN = perInstancePeakThrustN * Math.sin(angleRad);
      let resultantY = 0;
      let resultantZ = 0;
      for (let index = 0; index < instanceCount; index += 1) {
        const instanceAzimuthRad = azimuthRad + (2 * Math.PI * index) / instanceCount;
        resultantY += perInstanceRadialThrustN * Math.cos(instanceAzimuthRad);
        resultantZ += perInstanceRadialThrustN * Math.sin(instanceAzimuthRad);
      }
      const symmetricResultantRadialThrustN = Math.hypot(resultantY, resultantZ);
      const missingReason = effectiveAcceleration === null
        ? "Axial demand is not available because the active stack has no positive mass."
        : !parent
          ? `Parent stage ${parentId} is missing from the supplied topology.`
          : !activeParent
            ? `Parent stage ${parent.label} is disabled or inactive.`
            : null;
      const perInstanceAxialDemandN = effectiveAcceleration === null || missingReason !== null
        ? null
        : perInstanceMassKg * effectiveAcceleration * loadFactor;
      const totalDownstreamAxialDemandN = perInstanceAxialDemandN === null
        ? null
        : perInstanceAxialDemandN * instanceCount;
      const perInstanceTransverseDemandN = effectiveTransverseAcceleration === null || missingReason !== null
        ? null
        : perInstanceMassKg * effectiveTransverseAcceleration * loadFactor;
      const totalDownstreamTransverseDemandN = perInstanceTransverseDemandN === null
        ? null
        : perInstanceTransverseDemandN * instanceCount;
      const perInstanceResultantDemandN = perInstanceAxialDemandN === null || perInstanceTransverseDemandN === null
        ? null
        : Math.hypot(perInstanceAxialDemandN, perInstanceTransverseDemandN);
      const radialDemandMagnitudeN = missingReason !== null || (perInstanceTransverseDemandN === null && perInstanceRadialThrustN === null)
        ? 0
        : Math.abs(perInstanceTransverseDemandN ?? 0) + Math.abs(perInstanceRadialThrustN ?? 0);
      const radialDemandN = radialDemandMagnitudeN > 0 ? radialDemandMagnitudeN : null;
      const shearSectionAreaM2 = missingReason === null && parent?.sectionAreaM2 !== null && child.sectionAreaM2 !== null
        ? Math.min(parent!.sectionAreaM2, child.sectionAreaM2)
        : null;
      const allowableShearPa = missingReason === null && parent?.allowableShearPa !== null && child.allowableShearPa !== null
        ? Math.min(parent!.allowableShearPa, child.allowableShearPa)
        : null;
      const shearCapacityN = shearSectionAreaM2 !== null && allowableShearPa !== null
        ? shearSectionAreaM2 * allowableShearPa
        : null;
      const radialFactorOfSafety = shearCapacityN !== null && radialDemandN !== null && radialDemandN > 0
        ? shearCapacityN / radialDemandN
        : null;
      const radialCapacityStatus: StageInterfaceShearCapacityStatus = radialDemandN === null || shearCapacityN === null
        ? "unavailable"
        : radialFactorOfSafety === null
          ? "unavailable"
          : radialFactorOfSafety >= child.requiredFactorOfSafety
            ? "pass"
            : "review";
      const connectorCapacity = connectorCapacityN(child.connectorEvidence);
      const connectorFactorOfSafety = connectorCapacity !== null && radialDemandN !== null && radialDemandN > 0
        ? connectorCapacity / radialDemandN
        : null;
      const connectorCapacityStatus: StageInterfaceShearCapacityStatus = radialDemandN === null || connectorCapacity === null
        ? "unavailable"
        : connectorFactorOfSafety === null
          ? "unavailable"
          : connectorFactorOfSafety >= child.requiredFactorOfSafety
            ? "pass"
            : "review";
      return {
        id,
        parentStageId: parentId,
        childStageId: child.id,
        parentLabel: parent?.label ?? null,
        childLabel: child.label,
        status: missingReason === null ? "screened" as const : "unavailable" as const,
        reason: missingReason,
        instanceCount,
        repeatRadiusM: child.repeatRadiusM,
        thrustCantAngleDeg: child.thrustCantAngleDeg,
        thrustCantAzimuthDeg: child.thrustCantAzimuthDeg,
        loadShareFraction: missingReason === null ? 1 / instanceCount : null,
        downstreamMassKg: missingReason === null ? downstreamMassKg : null,
        totalDownstreamAxialDemandN,
        perInstanceAxialDemandN,
        totalDownstreamTransverseDemandN,
        perInstanceTransverseDemandN,
        perInstanceResultantDemandN,
        radialDemandN,
        shearCapacityN,
        radialFactorOfSafety,
        radialCapacityStatus,
        connectorCapacityN: connectorCapacity,
        connectorFactorOfSafety,
        connectorCapacityStatus,
        perInstancePeakThrustN: missingReason === null ? perInstancePeakThrustN : null,
        perInstanceRadialThrustN: missingReason === null ? perInstanceRadialThrustN : null,
        perInstanceEccentricMomentNm: missingReason === null
          ? perInstanceRadialThrustN * child.repeatRadiusM
          : null,
        symmetricResultantRadialThrustN: missingReason === null
          ? symmetricResultantRadialThrustN
          : null,
        effectiveAxialAccelerationMps2: effectiveAcceleration,
        tracePeakAxialAccelerationMps2: interfaceTracePeak?.accelerationMps2 ?? null,
        tracePeakTimeS: interfaceTracePeak?.timeS ?? null,
        transverseAccelerationMps2: effectiveTransverseAcceleration,
        tracePeakTransverseAccelerationMps2: interfaceTracePeakTransverse?.accelerationMps2 ?? null,
        tracePeakTransverseTimeS: interfaceTracePeakTransverse?.timeS ?? null,
        loadFactor,
        detail: missingReason === null
          ? "Equal-share parallel load scale computed; shell-section shear capacity is shown only when parent/child shear evidence is supplied; connector geometry and moment capacity remain outside this review."
          : missingReason,
      };
    });

  const shearStatuses = [
    ...interfaces
      .filter((item) => item.transverseDemandN !== null && item.transverseDemandN > 0)
      .map((item) => item.transverseCapacityStatus),
    ...parallelAudits
      .filter((audit) => audit.radialDemandN !== null && audit.radialDemandN > 0)
      .map((audit) => audit.radialCapacityStatus),
  ];
  const shearStatus: StageInterfaceShearReviewStatus = shearStatuses.length === 0
    ? "not-assessed"
    : shearStatuses.some((status) => status === "review" || status === "unavailable")
      ? "review"
      : "assessed";
  const connectorStatuses = [
    ...interfaces
      .filter((item) => item.transverseDemandN !== null && item.transverseDemandN > 0)
      .map((item) => item.connectorCapacityStatus),
    ...parallelAudits
      .filter((audit) => audit.radialDemandN !== null && audit.radialDemandN > 0)
      .map((audit) => audit.connectorCapacityStatus),
  ];
  const connectorStatus: StageInterfaceConnectorReviewStatus = connectorStatuses.length === 0
    ? "not-assessed"
    : connectorStatuses.some((status) => status === "review" || status === "unavailable")
      ? "review"
      : "assessed";
  const counts = {
    pass: interfaces.filter((item) => item.status === "pass").length,
    review: interfaces.filter((item) => item.status === "review").length,
    unavailable: interfaces.filter((item) => item.status === "unavailable").length,
  } as const;
  const weakestInterface = [...interfaces].sort((left, right) => {
    const statusDifference = statusRank(left.status) - statusRank(right.status);
    if (statusDifference !== 0) return statusDifference;
    if (left.factorOfSafety !== null && right.factorOfSafety !== null) {
      const factorDifference = left.factorOfSafety - right.factorOfSafety;
      if (factorDifference !== 0) return factorDifference;
    } else if (left.factorOfSafety !== null) {
      return -1;
    } else if (right.factorOfSafety !== null) {
      return 1;
    }
    return left.id.localeCompare(right.id);
  })[0] ?? null;
  const overallStatus: StageInterfaceLoadResult["overallStatus"] = interfaces.length === 0
    ? "not-assessed"
    : counts.review > 0 || counts.unavailable > 0
      ? "review"
      : "assessed";
  const warnings = [
    "This proxy uses a common or trace-backed acceleration and weaker parent/child shell-section compression and shear proxies; optional connector evidence is a separate direct-shear capacity screen, not a joint solver and does not model connector geometry, contact, or local joint behavior.",
    "Thrust is summed by configured peak value and thrust cant, drag, rail contact, staging impulse, and off-axis imbalance are not represented.",
    ...(trace.length > 0
      ? [
          `The current trace peak axial acceleration is ${tracePeak!.accelerationMps2.toFixed(3)} m/s² at ${tracePeak!.timeS.toFixed(3)} s; demand retains the peak-thrust baseline when it is larger. Rail reaction, stage-wise propellant redistribution, and transient amplification remain outside this proxy.`,
      ]
      : []),
    ...(tracePeakTransverse !== null
      ? [
          `The trace also provides a ${tracePeakTransverse.accelerationMps2.toFixed(3)} m/s² body-transverse acceleration envelope at ${tracePeakTransverse.timeS.toFixed(3)} s; transverse demand is kept separate from the axial compression factor of safety and is compared with the optional shell-section shear proxy when evidence is supplied.`,
        ]
      : trace.length > 0
        ? ["The supplied trace has no body-transverse acceleration channel, so transverse interface demand remains unavailable."]
        : []),
    ...(interfaces.some((item) => item.attachment === "parallel")
      ? [
          "Parallel interfaces receive an equal-share force-scale audit. When parent/child shear evidence exists, a per-instance radial shear proxy is compared against it; connector geometry, bending capacity, fasteners, and local failure modes remain outside this review.",
          ...parallelAudits
            .filter((audit) => audit.status === "screened")
            .map((audit) => `${audit.childLabel}: ${audit.instanceCount} equal-share instance load scale(s) retained; canted thrust is shown as per-instance radial force and eccentric moment, with radial shear capacity status ${audit.radialCapacityStatus}.`),
        ]
      : []),
    ...(interfaces.some((item) => item.transverseCapacityStatus === "review")
      ? ["One or more serial interfaces has a transverse shear proxy below its required factor of safety; review the joint design independently."]
      : []),
    ...(interfaces.some((item) => item.transverseDemandN !== null && item.transverseCapacityStatus === "unavailable")
      ? ["Body-transverse demand is present for at least one serial interface, but parent/child shear evidence is incomplete, so transverse capacity remains unavailable."]
      : []),
    ...(parallelAudits.some((audit) => audit.radialCapacityStatus === "review")
      ? ["One or more parallel instances has a radial shear proxy below its required factor of safety; connector and bending qualification remain separate work."]
      : []),
    ...(interfaces.some((item) => item.connectorCapacityStatus === "review") || parallelAudits.some((audit) => audit.connectorCapacityStatus === "review")
      ? ["One or more connector-group direct-shear screens is below the required factor of safety; bearing, pull-through, preload, prying, fatigue, and joint qualification remain separate work."]
      : []),
    ...(interfaces.some((item) => item.transverseDemandN !== null && item.connectorCapacityStatus === "unavailable") || parallelAudits.some((audit) => audit.radialDemandN !== null && audit.connectorCapacityStatus === "unavailable")
      ? ["Positive transverse or radial demand exists without complete upstream connector-group evidence, so connector direct-shear capacity remains unavailable."]
      : []),
    ...(interfaces.length === 0
      ? ["No enabled child stage with a parent relationship was supplied, so stage-interface load review is not assessed."]
      : []),
    ...interfaces.flatMap((item) => item.reason ? [`${item.childLabel}: ${item.reason}`] : []),
  ];
  return {
    modelVersion: STAGE_INTERFACE_LOADS_MODEL_VERSION,
    validationStatus: STAGE_INTERFACE_LOADS_VALIDATION_STATUS,
    overallStatus,
    shearStatus,
    connectorStatus,
    counts,
    totalStackMassKg,
    retainedMassKg,
    peakThrustN,
    effectiveAxialAccelerationMps2,
    accelerationBasis,
    transverseAccelerationBasis,
    tracePeakAxialAccelerationMps2: tracePeak?.accelerationMps2 ?? null,
    tracePeakTimeS: tracePeak?.timeS ?? null,
    tracePeakTransverseAccelerationMps2: tracePeakTransverse?.accelerationMps2 ?? null,
    tracePeakTransverseTimeS: tracePeakTransverse?.timeS ?? null,
    gravityMps2,
    loadFactor,
    interfaces,
    parallelAudits,
    weakestInterface,
    assumptions: [
      "A serial interface carries the downstream child subtree plus retained payload/recovery mass under a common axial acceleration proxy.",
      ...(trace.length > 0
        ? [
            "When supplied, each interface filters the current stage-flight trace to samples where both parent and child are attached, then uses the largest body-axis acceleration while retaining the static peak-thrust baseline if larger.",
            "Trace axial acceleration is the unconstrained net-force projection onto the vehicle nose axis; rail reaction, flex, local eccentricity, propellant slosh, and transient joint response are not reconstructed.",
            "When available, body-transverse acceleration is the magnitude of the net-force acceleration in body +Y/+Z; it produces a separate force envelope and is not combined with the axial shell-section capacity.",
          ]
        : []),
      "Axial interface capacity uses the minimum supplied parent/child shell-section area multiplied by the minimum supplied compression allowable.",
      "When both parent and child supply positive shear allowables, the same weaker shell-section area is multiplied by the weaker shear allowable to provide a clearly labelled transverse/radial shear proxy; it is not connector qualification.",
      "When a child stage supplies connector evidence, direct-shear capacity is count × π(d/2)² × allowable shear × efficiency. The evidence describes that child stage's upstream connector group and is not inferred from shell geometry.",
      ...(parallelAudits.length > 0
        ? [
            "Parallel repeated stages are split by equal instance count for a force-scale audit; canted thrust uses the authored angle and radial placement radius to report per-instance radial force and eccentric moment.",
            "Symmetric radial resultant is a vector-sum diagnostic only. It does not remove local per-instance joint demand; the optional radial shear proxy is evaluated per instance and does not establish connector capacity.",
          ]
        : []),
      "The load factor defaults to 1.0 and is an explicit screening multiplier, not a measured transient or certification factor.",
      "A pass means only that this analytical proxy exceeds the declared factor-of-safety threshold; it is not connector qualification or flight-safety evidence.",
    ],
    warnings,
  };
}
