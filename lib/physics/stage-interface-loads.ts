/**
 * First-order axial load-path review for stage interfaces.
 *
 * This is deliberately a bounded proxy, not a connector/contact solver. It
 * uses the supplied stage masses, peak thrusts, and shell-section allowables
 * to estimate the axial force carried across each serial topology edge. A
 * parallel edge is reported as unavailable because its radial attachment and
 * local joint load path are outside this model.
 */

export const STAGE_INTERFACE_LOADS_MODEL_VERSION =
  "rocketworks-stage-interface-loads-0.1.0";
export const STAGE_INTERFACE_LOADS_VALIDATION_STATUS =
  "analytical-axial-load-path-proxy" as const;

export type StageInterfaceLoadAttachment = "serial" | "parallel";
export type StageInterfaceLoadStatus = "pass" | "review" | "unavailable";

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
  /** Minimum shell-section area used as a connector-section proxy. */
  sectionAreaM2?: number | null;
  /** Compression allowable used as a connector-section proxy. */
  allowableCompressionPa?: number | null;
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
  downstreamMassKg: number | null;
  totalStackMassKg: number;
  peakThrustN: number;
  effectiveAxialAccelerationMps2: number;
  loadFactor: number;
  axialDemandN: number | null;
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
  counts: Readonly<{
    pass: number;
    review: number;
    unavailable: number;
  }>;
  totalStackMassKg: number;
  retainedMassKg: number;
  peakThrustN: number;
  effectiveAxialAccelerationMps2: number | null;
  gravityMps2: number;
  loadFactor: number;
  interfaces: readonly StageInterfaceLoadInterface[];
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

function statusRank(status: StageInterfaceLoadStatus): number {
  return status === "review" ? 0 : status === "unavailable" ? 1 : 2;
}

/**
 * Review axial force transfer across each enabled topology edge.
 *
 * The effective acceleration is `max(g, T/M)`, then each serial interface
 * demand is `downstream mass * effective acceleration * load factor`. Capacity
 * is the weaker of the parent/child section proxies when both are supplied.
 * This intentionally ignores drag, rail contact, thrust cant, transients,
 * bending, fasteners, joints, local buckling, and separation dynamics.
 */
export function createStageInterfaceLoadReview(
  input: Readonly<{
    stages: readonly StageInterfaceLoadStageInput[];
    retainedMassKg?: number;
    gravityMps2?: number;
    loadFactor?: number;
  }>,
): StageInterfaceLoadResult {
  const retainedMassKg = input.retainedMassKg ?? 0;
  assertNonNegative(retainedMassKg, "retained mass");
  const gravityMps2 = normalizePositive(input.gravityMps2, DEFAULT_GRAVITY_MPS2, "gravity");
  const loadFactor = normalizePositive(input.loadFactor, DEFAULT_LOAD_FACTOR, "interface load factor");

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
    const requiredFactorOfSafety = normalizePositive(
      stage.requiredFactorOfSafety,
      DEFAULT_REQUIRED_FACTOR_OF_SAFETY,
      `stage ${stage.id} required factor of safety`,
    );
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
      requiredFactorOfSafety,
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
  const effectiveAxialAccelerationMps2 = totalStackMassKg > 0
    ? Math.max(gravityMps2, peakThrustN / totalStackMassKg)
    : null;

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
      const base = {
        id,
        parentStageId: parentId,
        childStageId: child.id,
        parentLabel: parent?.label ?? null,
        childLabel: child.label,
        attachment: child.attachment,
        totalStackMassKg,
        peakThrustN,
        effectiveAxialAccelerationMps2: effectiveAxialAccelerationMps2 ?? 0,
        loadFactor,
        requiredFactorOfSafety,
      };

      if (effectiveAxialAccelerationMps2 === null) {
        return {
          ...base,
          status: "unavailable" as const,
          downstreamMassKg: null,
          axialDemandN: null,
          sectionAreaM2: null,
          allowableCompressionPa: null,
          capacityN: null,
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
          sectionAreaM2: null,
          allowableCompressionPa: null,
          capacityN: null,
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
          sectionAreaM2: null,
          allowableCompressionPa: null,
          capacityN: null,
          factorOfSafety: null,
          detail: "The parent stage is disabled, so the active axial load path is incomplete.",
          reason: `Parent stage ${parent.label} is disabled or inactive.`,
        };
      }

      const downstreamMassKg = subtreeMass(child.id, new Set()) + retainedMassKg;
      const axialDemandN = downstreamMassKg * effectiveAxialAccelerationMps2 * loadFactor;
      if (child.attachment === "parallel") {
        return {
          ...base,
          status: "unavailable" as const,
          downstreamMassKg: null,
          axialDemandN: null,
          sectionAreaM2: null,
          allowableCompressionPa: null,
          capacityN: null,
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
      const capacityN = sectionAreaM2 !== null && allowableCompressionPa !== null
        ? sectionAreaM2 * allowableCompressionPa
        : null;
      const factorOfSafety = capacityN !== null && axialDemandN > 0
        ? capacityN / axialDemandN
        : null;
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
        sectionAreaM2,
        allowableCompressionPa,
        capacityN,
        factorOfSafety,
        detail: status === "pass"
          ? "Serial interface passes the supplied axial compression proxy with the declared reserve."
          : reason ?? "Serial interface requires review.",
        reason,
      };
    });

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
    "This proxy uses a common axial acceleration and a weaker parent/child shell-section capacity; it does not model connector geometry, fasteners, joints, bending, local buckling, or transient loads.",
    "Thrust is summed by configured peak value and thrust cant, drag, rail contact, staging impulse, and off-axis imbalance are not represented.",
    ...(interfaces.some((item) => item.attachment === "parallel")
      ? ["One or more parallel interfaces are visible but remain unavailable because radial load transfer is outside this serial axial proxy."]
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
    counts,
    totalStackMassKg,
    retainedMassKg,
    peakThrustN,
    effectiveAxialAccelerationMps2,
    gravityMps2,
    loadFactor,
    interfaces,
    weakestInterface,
    assumptions: [
      "A serial interface carries the downstream child subtree plus retained payload/recovery mass under a common axial acceleration proxy.",
      "Interface capacity uses the minimum supplied parent/child shell-section area multiplied by the minimum supplied compression allowable.",
      "The load factor defaults to 1.0 and is an explicit screening multiplier, not a measured transient or certification factor.",
      "A pass means only that this analytical proxy exceeds the declared factor-of-safety threshold; it is not connector qualification or flight-safety evidence.",
    ],
    warnings,
  };
}
