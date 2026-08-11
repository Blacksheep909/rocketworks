import type { StructuralScreenResult } from "./structural-screen.ts";

export const STAGE_STRUCTURAL_REVIEW_MODEL_VERSION =
  "rocketworks-stage-structural-review-0.1.0";
export const STAGE_STRUCTURAL_REVIEW_VALIDATION_STATUS =
  "analytical-stage-aggregation-only" as const;

export type StageStructuralReviewStatus = "pass" | "review" | "unavailable";

export type StageStructuralReviewStageInput = Readonly<{
  id: string;
  label: string;
  role?: string | null;
  /** Number of physical copies represented by this logical stage row. */
  instanceCount?: number;
  screen?: StructuralScreenResult | null;
  unavailableReason?: string | null;
}>;

export type StageStructuralReviewStage = Readonly<{
  id: string;
  label: string;
  role: string | null;
  instanceCount: number;
  status: StageStructuralReviewStatus;
  screen: StructuralScreenResult | null;
  checkCounts: Readonly<{
    pass: number;
    review: number;
    unavailable: number;
  }>;
  weakestFactorOfSafety: number | null;
  unavailableReason: string | null;
}>;

export type StageStructuralReviewResult = Readonly<{
  modelVersion: typeof STAGE_STRUCTURAL_REVIEW_MODEL_VERSION;
  validationStatus: typeof STAGE_STRUCTURAL_REVIEW_VALIDATION_STATUS;
  overallStatus: StageStructuralReviewStatus | "not-assessed";
  counts: Readonly<{
    pass: number;
    review: number;
    unavailable: number;
  }>;
  checkCounts: Readonly<{
    pass: number;
    review: number;
    unavailable: number;
  }>;
  stages: readonly StageStructuralReviewStage[];
  weakestStage: StageStructuralReviewStage | null;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

function assertStageText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must be non-empty`);
}

function normalizeInstanceCount(value: number | undefined, label: string): number {
  const count = value ?? 1;
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return count;
}

function stageRank(stage: StageStructuralReviewStage): number {
  return stage.status === "review" ? 0 : stage.status === "unavailable" ? 1 : 2;
}

/**
 * Aggregate independently computed component screens for every enabled stage.
 *
 * This deliberately does not invent a stage-interface solver: each row keeps
 * the original screen, while the aggregate only applies deterministic review
 * policy and makes missing stage evidence visible.
 */
export function createStageStructuralReview(
  inputs: readonly StageStructuralReviewStageInput[],
): StageStructuralReviewResult {
  const ids = new Set<string>();
  const stages: StageStructuralReviewStage[] = inputs.map((input) => {
    assertStageText(input.id, "stage structural review id");
    assertStageText(input.label, `stage ${input.id} label`);
    if (ids.has(input.id)) throw new Error(`duplicate stage structural review id: ${input.id}`);
    ids.add(input.id);
    const instanceCount = normalizeInstanceCount(
      input.instanceCount,
      `stage ${input.id} instance count`,
    );
    const screen = input.screen ?? null;
    const checks = screen ? Object.values(screen.checks) : [];
    const checkCounts = {
      pass: checks.filter((check) => check.status === "pass").length,
      review: checks.filter((check) => check.status === "review").length,
      unavailable: checks.filter((check) => check.status === "unavailable").length,
    } as const;
    const factors = checks
      .map((check) => check.factorOfSafety)
      .filter((factor): factor is number => factor !== null && Number.isFinite(factor));
    return {
      id: input.id,
      label: input.label,
      role: input.role ?? null,
      instanceCount,
      status: screen === null ? "unavailable" : screen.overallStatus === "pass" ? "pass" : "review",
      screen,
      checkCounts,
      weakestFactorOfSafety: factors.length > 0 ? Math.min(...factors) : null,
      unavailableReason: input.unavailableReason ?? null,
    };
  });

  const counts = {
    pass: stages.filter((stage) => stage.status === "pass").length,
    review: stages.filter((stage) => stage.status === "review").length,
    unavailable: stages.filter((stage) => stage.status === "unavailable").length,
  } as const;
  const checkCounts = {
    pass: stages.reduce((total, stage) => total + stage.checkCounts.pass, 0),
    review: stages.reduce((total, stage) => total + stage.checkCounts.review, 0),
    unavailable: stages.reduce((total, stage) => total + stage.checkCounts.unavailable, 0),
  } as const;
  const orderedStages = [...stages].sort((left, right) => {
    const statusDifference = stageRank(left) - stageRank(right);
    if (statusDifference !== 0) return statusDifference;
    const leftFactor = left.weakestFactorOfSafety ?? Number.POSITIVE_INFINITY;
    const rightFactor = right.weakestFactorOfSafety ?? Number.POSITIVE_INFINITY;
    if (leftFactor !== rightFactor) return leftFactor - rightFactor;
    return left.id.localeCompare(right.id);
  });
  const weakestStage = orderedStages[0] ?? null;
  const overallStatus: StageStructuralReviewResult["overallStatus"] =
    stages.length === 0
      ? "not-assessed"
      : counts.review > 0 || counts.unavailable > 0
        ? "review"
        : "pass";
  const warnings = [
    "Each stage row reuses its supplied component screen; interfaces, load transfer, fasteners, joints, and stage-to-stage dynamics are not modeled.",
    "Repeated parallel stages are represented by one logical screen per instance geometry; symmetry, canted-thrust imbalance, and cluster coupling are outside this aggregate.",
    ...(stages.length === 0
      ? ["No enabled stage geometry was supplied, so stage-aware structural review is not assessed."]
      : []),
    ...stages.flatMap((stage) =>
      stage.unavailableReason ? [`${stage.label}: ${stage.unavailableReason}`] : [],
    ),
  ];
  return {
    modelVersion: STAGE_STRUCTURAL_REVIEW_MODEL_VERSION,
    validationStatus: STAGE_STRUCTURAL_REVIEW_VALIDATION_STATUS,
    overallStatus,
    counts,
    checkCounts,
    stages,
    weakestStage,
    assumptions: [
      "Stage status is pass only when the supplied component screen reports pass; missing or stale evidence remains visible.",
      "The aggregate counts logical stage rows, while each row records the number of physical copies represented by the topology.",
      "This is an engineering triage surface and does not certify structural adequacy, manufacturing readiness, or flight safety.",
    ],
    warnings,
  };
}
