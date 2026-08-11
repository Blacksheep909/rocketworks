import type {
  StructuralCheck,
  StructuralScreenResult,
} from "./structural-screen.ts";
import type { StageStructuralReviewResult } from "./stage-structural-review.ts";
import type { StageMassRatioResult } from "./stage-mass-ratio.ts";

export const ENGINEERING_DESIGN_REVIEW_MODEL_VERSION =
  "rocketworks-engineering-design-review-0.1.0";
export const ENGINEERING_DESIGN_REVIEW_VALIDATION_STATUS =
  "analytical-review-aggregation-only" as const;

export type EngineeringReviewFindingStatus = "pass" | "review" | "unavailable";
export type EngineeringReviewSeverity = "critical" | "warning" | "info";
export type EngineeringReviewCategory =
  | "configuration"
  | "aerodynamics"
  | "structural"
  | "flight"
  | "staging"
  | "provenance";

export type EngineeringReviewStageEventStatus = "allocated" | "watch" | "invalid";
export type EngineeringReviewStageConvergenceStatus =
  | "converged"
  | "watch"
  | "not-assessed";

export type EngineeringDesignReviewInput = Readonly<{
  /** Peak launch thrust divided by current vehicle weight. */
  thrustToWeight?: number | null;
  staticMarginCalibers?: number | null;
  staticAerodynamicsModelVersion?: string | null;
  structural?: StructuralScreenResult | null;
  stageStructural?: StageStructuralReviewResult | null;
  stageMassRatio?: StageMassRatioResult | null;
  verticalFlightCurrent?: boolean | null;
  verticalFlightModelVersion?: string | null;
  stageFlightConfigured?: boolean;
  stageFlightCurrent?: boolean | null;
  stageFlightModelVersion?: string | null;
  stageEventAllocationStatus?: EngineeringReviewStageEventStatus | null;
  stageConvergenceStatus?: EngineeringReviewStageConvergenceStatus | null;
  separationImpulseReviewCount?: number | null;
}>;

export type EngineeringReviewFinding = Readonly<{
  id: string;
  category: EngineeringReviewCategory;
  label: string;
  status: EngineeringReviewFindingStatus;
  severity: EngineeringReviewSeverity;
  summary: string;
  detail: string;
  action: string;
  value: number | null;
  threshold: number | null;
  unit: string;
  modelVersion: string | null;
}>;

export type EngineeringDesignReviewResult = Readonly<{
  modelVersion: typeof ENGINEERING_DESIGN_REVIEW_MODEL_VERSION;
  validationStatus: typeof ENGINEERING_DESIGN_REVIEW_VALIDATION_STATUS;
  overallStatus: "nominal" | "review" | "not-assessed";
  counts: Readonly<{
    pass: number;
    review: number;
    unavailable: number;
  }>;
  findings: readonly EngineeringReviewFinding[];
  primaryFinding: EngineeringReviewFinding | null;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

function assertFiniteOrNull(value: number | null | undefined, label: string): void {
  if (value !== null && value !== undefined && !Number.isFinite(value)) {
    throw new Error(`${label} must be finite when supplied`);
  }
}

function makeFinding(
  input: EngineeringReviewFinding,
): EngineeringReviewFinding {
  assertFiniteOrNull(input.value, `${input.id} value`);
  assertFiniteOrNull(input.threshold, `${input.id} threshold`);
  return input;
}

function factorSeverity(
  check: StructuralCheck,
): EngineeringReviewSeverity {
  if (check.status === "pass") return "info";
  if (check.factorOfSafety !== null && check.factorOfSafety < 1) {
    return "critical";
  }
  return "warning";
}

function structuralFinding(
  check: StructuralCheck,
  structural: StructuralScreenResult,
): EngineeringReviewFinding {
  const status = check.status;
  const factor = check.factorOfSafety;
  const severity = factorSeverity(check);
  const summary =
    factor === null
      ? `${check.label} is not assessed.`
      : `${check.label}: ${factor.toFixed(2)}x factor of safety.`;
  const action =
    status === "pass"
      ? "No immediate review action from this analytical screen."
      : status === "unavailable"
        ? "Supply the missing current flight condition or geometry, then rerun the screen."
        : "Review geometry, material allowables, load assumptions, and attachment details before using this result.";
  return makeFinding({
    id: `structural-${check.id}`,
    category: "structural",
    label: check.label,
    status,
    severity,
    summary,
    detail: check.detail,
    action,
    value: factor,
    threshold: structural.loads.requiredFactorOfSafety,
    unit: "factor of safety",
    modelVersion: structural.modelVersion,
  });
}

function findingRank(finding: EngineeringReviewFinding): number {
  const statusRank =
    finding.status === "review" ? 0 : finding.status === "unavailable" ? 1 : 2;
  const severityRank =
    finding.severity === "critical" ? 0 : finding.severity === "warning" ? 1 : 2;
  return statusRank * 10 + severityRank;
}

/**
 * Combine the existing RocketWorks analytical screens into one deterministic,
 * explainable review surface. This module applies policy thresholds only; it
 * does not add a new flight or structural solver and cannot certify a design.
 */
export function createEngineeringDesignReview(
  input: EngineeringDesignReviewInput,
): EngineeringDesignReviewResult {
  assertFiniteOrNull(input.thrustToWeight, "thrust-to-weight ratio");
  assertFiniteOrNull(input.staticMarginCalibers, "static margin");
  assertFiniteOrNull(input.separationImpulseReviewCount, "separation review count");
  if (
    input.separationImpulseReviewCount !== null &&
    input.separationImpulseReviewCount !== undefined &&
    input.separationImpulseReviewCount < 0
  ) {
    throw new Error("separation review count cannot be negative");
  }

  const findings: EngineeringReviewFinding[] = [];
  const thrustToWeight = input.thrustToWeight ?? null;
  if (thrustToWeight === null) {
    findings.push(
      makeFinding({
        id: "configuration-thrust-to-weight",
        category: "configuration",
        label: "Launch thrust-to-weight",
        status: "unavailable",
        severity: "warning",
        summary: "Launch thrust-to-weight is not available.",
        detail: "A current mass and motor peak-thrust estimate are required for this policy check.",
        action: "Select a motor and run the current estimate.",
        value: null,
        threshold: 3,
        unit: "ratio",
        modelVersion: null,
      }),
    );
  } else {
    const status: EngineeringReviewFindingStatus = thrustToWeight >= 3 ? "pass" : "review";
    findings.push(
      makeFinding({
        id: "configuration-thrust-to-weight",
        category: "configuration",
        label: "Launch thrust-to-weight",
        status,
        severity: status === "pass" ? "info" : thrustToWeight <= 0 ? "critical" : "warning",
        summary: `Launch thrust-to-weight is ${thrustToWeight.toFixed(2)}:1.`,
        detail: "Policy threshold is 3:1 using the current peak motor thrust and vehicle weight.",
        action:
          status === "pass"
            ? "No immediate review action from this policy threshold."
            : "Review motor selection, launch mass, and rail-exit performance before relying on the estimate.",
        value: thrustToWeight,
        threshold: 3,
        unit: "ratio",
        modelVersion: null,
      }),
    );
  }

  const staticMargin = input.staticMarginCalibers ?? null;
  if (staticMargin === null) {
    findings.push(
      makeFinding({
        id: "aerodynamics-static-margin",
        category: "aerodynamics",
        label: "Static margin",
        status: "unavailable",
        severity: "warning",
        summary: "Static margin is not available.",
        detail: "The low-speed center-of-pressure model did not provide a current margin.",
        action: "Run the current mass-property and static-aerodynamics calculation.",
        value: null,
        threshold: 1,
        unit: "cal",
        modelVersion: input.staticAerodynamicsModelVersion ?? null,
      }),
    );
  } else {
    const status: EngineeringReviewFindingStatus =
      staticMargin >= 1 && staticMargin <= 3 ? "pass" : "review";
    findings.push(
      makeFinding({
        id: "aerodynamics-static-margin",
        category: "aerodynamics",
        label: "Static margin",
        status,
        severity: status === "pass" ? "info" : staticMargin <= 0 ? "critical" : "warning",
        summary: `Static margin is ${staticMargin.toFixed(2)} calibers.`,
        detail: "Policy review band is 1 to 3 calibers for the supplied low-speed model.",
        action:
          status === "pass"
            ? "No immediate review action from this policy threshold."
            : "Review center-of-mass, center-of-pressure, fin geometry, and dynamic stability before flight interpretation.",
        value: staticMargin,
        threshold: 1,
        unit: "cal",
        modelVersion: input.staticAerodynamicsModelVersion ?? null,
      }),
    );
  }

  if (input.structural) {
    for (const check of Object.values(input.structural.checks)) {
      if (check.id === "static-margin") continue;
      findings.push(structuralFinding(check, input.structural));
    }
  }

  if (input.stageStructural) {
    const stageStructural = input.stageStructural;
    const stageNeedsReview =
      stageStructural.counts.review + stageStructural.counts.unavailable;
    const status: EngineeringReviewFindingStatus =
      stageStructural.overallStatus === "pass"
        ? "pass"
        : stageStructural.overallStatus === "not-assessed"
          ? "unavailable"
          : "review";
    findings.push(
      makeFinding({
        id: "structural-stage-review",
        category: "structural",
        label: "Stage-aware structural review",
        status,
        severity:
          status === "pass"
            ? "info"
            : status === "unavailable"
              ? "warning"
              : stageStructural.counts.review > 0
                ? "critical"
                : "warning",
        summary:
          stageStructural.overallStatus === "pass"
            ? `${stageStructural.counts.pass} stage${stageStructural.counts.pass === 1 ? "" : "s"} pass the supplied component screen.`
            : stageStructural.overallStatus === "not-assessed"
              ? "Stage-aware structural review is not assessed."
              : `${stageNeedsReview} stage row${stageNeedsReview === 1 ? "" : "s"} need structural review or evidence.`,
        detail:
          "Each enabled stage is reviewed independently with the current simplified component screen; stage interfaces and load transfer remain outside scope.",
        action:
          status === "pass"
            ? "No stage-level action from this analytical aggregate."
            : status === "unavailable"
              ? "Supply enabled stage geometry and rerun the stage-aware screen."
              : "Inspect the weakest stage, interfaces, motor attachment, and load-path assumptions before interpreting the aggregate.",
        value: stageNeedsReview,
        threshold: 0,
        unit: "stage rows needing review",
        modelVersion: stageStructural.modelVersion,
      }),
    );
  }

  if (input.stageMassRatio) {
    const stageMassRatio = input.stageMassRatio;
    const unassessedStageCount =
      stageMassRatio.stages.length - stageMassRatio.assessedStageCount;
    const status: EngineeringReviewFindingStatus =
      stageMassRatio.overallStatus === "assessed"
        ? "pass"
        : stageMassRatio.overallStatus === "not-assessed"
          ? "unavailable"
          : "review";
    findings.push(
      makeFinding({
        id: "staging-mass-ratio",
        category: "staging",
        label: "Stage mass-ratio diagnostic",
        status,
        severity: status === "pass" ? "info" : "warning",
        summary:
          stageMassRatio.overallStatus === "assessed"
            ? `${stageMassRatio.assessedStageCount} stage${stageMassRatio.assessedStageCount === 1 ? "" : "s"} have positive ideal mass-ratio evidence.`
            : stageMassRatio.overallStatus === "not-assessed"
              ? "Stage mass-ratio evidence is not available."
              : `${unassessedStageCount} stage row${unassessedStageCount === 1 ? "" : "s"} lack a complete ideal mass-ratio proxy.`,
        detail:
          "The branch uses supplied stage-only masses and thrust impulse with the ideal rocket equation; it is not a mission delta-v budget or trajectory validation.",
        action:
          status === "pass"
            ? "No mass-ratio action from this analytical proxy."
            : status === "unavailable"
              ? "Run the coupled stage preview with positive motor impulse and propellant mass evidence."
              : "Inspect the incomplete stage mass or impulse inputs before comparing stage-only delta-v trends.",
        value: unassessedStageCount,
        threshold: 0,
        unit: "stage rows not assessed",
        modelVersion: stageMassRatio.modelVersion,
      }),
    );
  }

  const verticalFlightCurrent = input.verticalFlightCurrent ?? null;
  findings.push(
    makeFinding({
      id: "flight-vertical-freshness",
      category: "flight",
      label: "Vertical estimate freshness",
      status:
        verticalFlightCurrent === true
          ? "pass"
          : verticalFlightCurrent === false
            ? "review"
            : "unavailable",
      severity: verticalFlightCurrent === true ? "info" : "warning",
      summary:
        verticalFlightCurrent === true
          ? "Vertical estimate matches the current editable inputs."
          : verticalFlightCurrent === false
            ? "Vertical estimate is stale."
            : "Vertical estimate has not been run for this configuration.",
      detail: "Freshness is a state check, not a validation claim about the flight model.",
      action:
        verticalFlightCurrent === true
          ? "No freshness action required."
          : "Run the vertical estimate after the next design or environment change.",
      value: verticalFlightCurrent === null ? null : verticalFlightCurrent ? 1 : 0,
      threshold: 1,
      unit: "current",
      modelVersion: input.verticalFlightModelVersion ?? null,
    }),
  );

  if (input.stageFlightConfigured) {
    const stageFlightCurrent = input.stageFlightCurrent ?? null;
    findings.push(
      makeFinding({
        id: "staging-flight-freshness",
        category: "staging",
        label: "Coupled stage preview freshness",
        status: stageFlightCurrent === true ? "pass" : "review",
        severity: stageFlightCurrent === true ? "info" : "warning",
        summary:
          stageFlightCurrent === true
            ? "Coupled stage preview matches the current editable inputs."
            : "Coupled stage preview is missing or stale.",
        detail: "Staged event, separation, and convergence findings are only current after a rerun.",
        action:
          stageFlightCurrent === true
            ? "No freshness action required."
            : "Run the coupled stage preview before interpreting staged results.",
        value: stageFlightCurrent === null ? null : stageFlightCurrent ? 1 : 0,
        threshold: 1,
        unit: "current",
        modelVersion: input.stageFlightModelVersion ?? null,
      }),
    );

    const eventStatus = input.stageEventAllocationStatus ?? null;
    if (eventStatus !== null) {
      const status: EngineeringReviewFindingStatus =
        eventStatus === "allocated" ? "pass" : "review";
      findings.push(
        makeFinding({
          id: "staging-event-allocation",
          category: "staging",
          label: "Mission event allocation",
          status,
          severity: eventStatus === "invalid" ? "critical" : status === "pass" ? "info" : "warning",
          summary: `Mission event allocator status: ${eventStatus}.`,
          detail: "Rail, separation, ignition, failure, recovery, and custom events are checked for ordering conflicts.",
          action:
            status === "pass"
              ? "No allocator review action is currently required."
              : "Resolve allocator warnings or conflicts before interpreting event timing.",
          value: eventStatus === "allocated" ? 1 : 0,
          threshold: 1,
          unit: "allocated",
          modelVersion: input.stageFlightModelVersion ?? null,
        }),
      );
    } else {
      findings.push(
        makeFinding({
          id: "staging-event-allocation",
          category: "staging",
          label: "Mission event allocation",
          status: "unavailable",
          severity: "warning",
          summary: "Mission event allocation is not available.",
          detail: "The coupled stage preview did not return an allocator result.",
          action: "Run the coupled stage preview and inspect event conflicts.",
          value: null,
          threshold: 1,
          unit: "allocated",
          modelVersion: input.stageFlightModelVersion ?? null,
        }),
      );
    }

    const convergenceStatus = input.stageConvergenceStatus ?? null;
    const convergenceFindingStatus: EngineeringReviewFindingStatus =
      convergenceStatus === "converged" ? "pass" : convergenceStatus === null ? "unavailable" : "review";
    findings.push(
      makeFinding({
        id: "staging-step-convergence",
        category: "staging",
        label: "Coupled step convergence",
        status: convergenceFindingStatus,
        severity: convergenceFindingStatus === "pass" ? "info" : "warning",
        summary:
          convergenceStatus === "converged"
            ? "Coarse and half-step coupled previews agree within the declared heuristic."
            : convergenceStatus === "watch"
              ? "Coupled step convergence needs review."
              : "Coupled step convergence is not assessed.",
        detail: "This is a numerical sensitivity diagnostic, not experimental validation.",
        action:
          convergenceFindingStatus === "pass"
            ? "No numerical convergence action is currently required."
            : "Reduce the time step or inspect event discontinuities before interpreting the trace.",
        value: convergenceStatus === "converged" ? 1 : 0,
        threshold: 1,
        unit: "converged",
        modelVersion: input.stageFlightModelVersion ?? null,
      }),
    );

    const separationReviewCount = input.separationImpulseReviewCount ?? null;
    if (separationReviewCount !== null) {
      const status: EngineeringReviewFindingStatus = separationReviewCount === 0 ? "pass" : "review";
      findings.push(
        makeFinding({
          id: "staging-separation-impulse",
          category: "staging",
          label: "Separation impulse proposals",
          status,
          severity: status === "pass" ? "info" : "warning",
          summary:
            separationReviewCount === 0
              ? "All separation impulse proposals are balanced in the current preview."
              : `${separationReviewCount} separation impulse proposal${separationReviewCount === 1 ? "" : "s"} need review.`,
          detail: "The event-level solver is a bounded momentum-balance proposal, not a contact or plume-interaction solver.",
          action:
            status === "pass"
              ? "No impulse-allocation action is currently required."
              : "Inspect separation masses, requested delta-v, and residual angular impulse.",
          value: separationReviewCount,
          threshold: 0,
          unit: "review items",
          modelVersion: input.stageFlightModelVersion ?? null,
        }),
      );
    }
  }

  const counts = {
    pass: findings.filter((finding) => finding.status === "pass").length,
    review: findings.filter((finding) => finding.status === "review").length,
    unavailable: findings.filter((finding) => finding.status === "unavailable").length,
  } as const;
  const overallStatus: EngineeringDesignReviewResult["overallStatus"] =
    findings.length === 0
      ? "not-assessed"
      : counts.review > 0 || counts.unavailable > 0
        ? "review"
        : "nominal";
  const orderedFindings = [...findings].sort((left, right) => {
    const rankDifference = findingRank(left) - findingRank(right);
    return rankDifference !== 0 ? rankDifference : left.id.localeCompare(right.id);
  });
  return {
    modelVersion: ENGINEERING_DESIGN_REVIEW_MODEL_VERSION,
    validationStatus: ENGINEERING_DESIGN_REVIEW_VALIDATION_STATUS,
    overallStatus,
    counts,
    findings: orderedFindings,
    primaryFinding: orderedFindings[0] ?? null,
    assumptions: [
      "This review aggregates existing analytical screens and applies explicit policy thresholds; it does not add a new flight, structural, or aeroelastic solver.",
      "Launch thrust-to-weight is reviewed at a 3:1 minimum using the supplied peak thrust and current vehicle weight.",
      "Static margin is reviewed in the 1 to 3 caliber band for the supplied low-speed aerodynamic model.",
      "Unavailable or stale results are never treated as passes.",
    ],
    warnings: [
      "This review is an engineering triage surface, not flight-safety, range-safety, manufacturing, certification, or experimental validation evidence.",
      ...(counts.unavailable > 0
        ? [`${counts.unavailable} review item${counts.unavailable === 1 ? " is" : "s are"} unavailable or not yet assessed.`]
        : []),
    ],
  };
}
