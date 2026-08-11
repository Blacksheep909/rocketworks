/**
 * Trace-level force-magnitude accounting for the coupled stage preview.
 *
 * This module integrates already-recorded scalar diagnostics. It does not
 * reconstruct vector forces, attribute a true gravity/steering loss, or
 * replace the six-degree-of-freedom integrator.
 */

export const STAGE_FLIGHT_FORCE_BUDGET_MODEL_VERSION =
  "rocketworks-stage-flight-force-budget-0.1.0";
export const STAGE_FLIGHT_FORCE_BUDGET_VALIDATION_STATUS =
  "analytical-trace-integral-only" as const;

export type StageFlightForceBudgetStatus = "assessed" | "not-assessed";

export type StageFlightForceBudgetSample = Readonly<{
  timeS: number;
  massKg: number;
  thrustN: number;
  dragN: number;
  recoveryDragN: number;
  aerodynamicForceN?: number | null;
  dynamicPressurePa?: number | null;
  speedMps?: number | null;
  attachedStageIds?: readonly string[];
}>;

export type StageFlightForceBudgetStage = Readonly<{
  stageId: string;
  stageName: string;
  sampleCount: number;
  activeDurationS: number;
  thrustImpulseNs: number;
  aerodynamicDragImpulseNs: number;
  recoveryDragImpulseNs: number;
  combinedDragImpulseNs: number;
  thrustVelocityEquivalentMps: number;
  combinedDragVelocityEquivalentMps: number;
  peakThrustN: number;
  peakDragN: number;
  peakDynamicPressurePa: number | null;
  peakSpeedMps: number | null;
}>;

export type StageFlightForceBudgetResult = Readonly<{
  modelVersion: typeof STAGE_FLIGHT_FORCE_BUDGET_MODEL_VERSION;
  validationStatus: typeof STAGE_FLIGHT_FORCE_BUDGET_VALIDATION_STATUS;
  status: StageFlightForceBudgetStatus;
  sampleCount: number;
  timeSpanS: number;
  thrustImpulseNs: number | null;
  aerodynamicDragImpulseNs: number | null;
  recoveryDragImpulseNs: number | null;
  combinedDragImpulseNs: number | null;
  aerodynamicForceImpulseNs: number | null;
  thrustVelocityEquivalentMps: number | null;
  combinedDragVelocityEquivalentMps: number | null;
  dragToThrustVelocityEquivalentRatio: number | null;
  peakThrustN: number | null;
  peakAerodynamicDragN: number | null;
  peakRecoveryDragN: number | null;
  peakDynamicPressurePa: number | null;
  peakSpeedMps: number | null;
  stages: readonly StageFlightForceBudgetStage[];
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertNonNegative(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0) throw new Error(`${label} cannot be negative`);
}

function positiveOrNull(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : value;
}

function peakOptional(
  samples: readonly StageFlightForceBudgetSample[],
  select: (sample: StageFlightForceBudgetSample) => number | null | undefined,
): number | null {
  const values = samples
    .map(select)
    .filter((value): value is number => value !== null && value !== undefined);
  return values.length > 0 ? Math.max(...values) : null;
}

function trapezoid(left: number, right: number, durationS: number): number {
  return 0.5 * (left + right) * durationS;
}

type MutableStageBudget = {
  stageId: string;
  stageName: string;
  sampleCount: number;
  activeDurationS: number;
  thrustImpulseNs: number;
  aerodynamicDragImpulseNs: number;
  recoveryDragImpulseNs: number;
  combinedDragImpulseNs: number;
  thrustVelocityEquivalentMps: number;
  combinedDragVelocityEquivalentMps: number;
  peakThrustN: number;
  peakDragN: number;
  peakDynamicPressurePa: number | null;
  peakSpeedMps: number | null;
};

function makeStageBudget(stageId: string, stageName: string): MutableStageBudget {
  return {
    stageId,
    stageName,
    sampleCount: 0,
    activeDurationS: 0,
    thrustImpulseNs: 0,
    aerodynamicDragImpulseNs: 0,
    recoveryDragImpulseNs: 0,
    combinedDragImpulseNs: 0,
    thrustVelocityEquivalentMps: 0,
    combinedDragVelocityEquivalentMps: 0,
    peakThrustN: 0,
    peakDragN: 0,
    peakDynamicPressurePa: null,
    peakSpeedMps: null,
  };
}

function updateStagePeaks(
  budget: MutableStageBudget,
  sample: StageFlightForceBudgetSample,
): void {
  budget.peakThrustN = Math.max(budget.peakThrustN, sample.thrustN);
  budget.peakDragN = Math.max(budget.peakDragN, sample.dragN + sample.recoveryDragN);
  const dynamicPressurePa = positiveOrNull(sample.dynamicPressurePa);
  if (dynamicPressurePa !== null) {
    budget.peakDynamicPressurePa = budget.peakDynamicPressurePa === null
      ? dynamicPressurePa
      : Math.max(budget.peakDynamicPressurePa, dynamicPressurePa);
  }
  const speedMps = positiveOrNull(sample.speedMps);
  if (speedMps !== null) {
    budget.peakSpeedMps = budget.peakSpeedMps === null
      ? speedMps
      : Math.max(budget.peakSpeedMps, speedMps);
  }
}

function freezeStageBudget(budget: MutableStageBudget): StageFlightForceBudgetStage {
  return { ...budget };
}

/**
 * Integrate scalar force diagnostics with the trapezoidal rule.
 *
 * The velocity-equivalent values integrate `force / recorded mass`; they are
 * useful accounting signals, but they are not vector delta-v or mission loss
 * terms. Stage intervals use the left endpoint's attached-stage topology so a
 * zero-duration event boundary cannot double-count an interval.
 */
export function computeStageFlightForceBudget(
  samples: readonly StageFlightForceBudgetSample[],
  options: Readonly<{
    stageLabels?: Readonly<Record<string, string>>;
  }> = {},
): StageFlightForceBudgetResult {
  const normalized = samples.map((sample, index) => {
    assertFinite(sample.timeS, `force budget sample ${index + 1} time`);
    assertFinite(sample.massKg, `force budget sample ${index + 1} mass`);
    if (!(sample.massKg > 0)) throw new Error(`force budget sample ${index + 1} mass must be positive`);
    assertNonNegative(sample.thrustN, `force budget sample ${index + 1} thrust`);
    assertNonNegative(sample.dragN, `force budget sample ${index + 1} aerodynamic drag`);
    assertNonNegative(sample.recoveryDragN, `force budget sample ${index + 1} recovery drag`);
    const optionalValues: readonly [string, number | null | undefined][] = [
      ["aerodynamic force", sample.aerodynamicForceN],
      ["dynamic pressure", sample.dynamicPressurePa],
      ["speed", sample.speedMps],
    ];
    optionalValues.forEach(([label, value]) => {
      if (value !== null && value !== undefined) assertNonNegative(value, `force budget sample ${index + 1} ${label}`);
    });
    if (sample.attachedStageIds?.some((stageId) => !stageId.trim())) {
      throw new Error(`force budget sample ${index + 1} stage identifiers must be non-empty`);
    }
    return {
      ...sample,
      aerodynamicForceN: sample.aerodynamicForceN ?? sample.dragN,
      dynamicPressurePa: sample.dynamicPressurePa ?? null,
      speedMps: sample.speedMps ?? null,
      attachedStageIds: [...new Set(sample.attachedStageIds ?? [])],
    } as const;
  });
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].timeS < normalized[index - 1].timeS) {
      throw new Error("force budget sample times must be non-decreasing");
    }
  }

  const stageBudgets = new Map<string, MutableStageBudget>();
  const stageLabels = options.stageLabels ?? {};
  for (const sample of normalized) {
    for (const stageId of sample.attachedStageIds ?? []) {
      const budget = stageBudgets.get(stageId) ?? makeStageBudget(
        stageId,
        stageLabels[stageId] ?? stageId,
      );
      budget.sampleCount += 1;
      updateStagePeaks(budget, sample);
      stageBudgets.set(stageId, budget);
    }
  }

  const emptyResult = (warnings: readonly string[]): StageFlightForceBudgetResult => ({
    modelVersion: STAGE_FLIGHT_FORCE_BUDGET_MODEL_VERSION,
    validationStatus: STAGE_FLIGHT_FORCE_BUDGET_VALIDATION_STATUS,
    status: "not-assessed",
    sampleCount: normalized.length,
    timeSpanS: normalized.length > 0
      ? normalized[normalized.length - 1].timeS - normalized[0].timeS
      : 0,
    thrustImpulseNs: null,
    aerodynamicDragImpulseNs: null,
    recoveryDragImpulseNs: null,
    combinedDragImpulseNs: null,
    aerodynamicForceImpulseNs: null,
    thrustVelocityEquivalentMps: null,
    combinedDragVelocityEquivalentMps: null,
    dragToThrustVelocityEquivalentRatio: null,
    peakThrustN: normalized.length > 0 ? Math.max(...normalized.map((sample) => sample.thrustN)) : null,
    peakAerodynamicDragN: normalized.length > 0 ? Math.max(...normalized.map((sample) => sample.dragN)) : null,
    peakRecoveryDragN: normalized.length > 0 ? Math.max(...normalized.map((sample) => sample.recoveryDragN)) : null,
    peakDynamicPressurePa: peakOptional(normalized, (sample) => sample.dynamicPressurePa),
    peakSpeedMps: peakOptional(normalized, (sample) => sample.speedMps),
    stages: [...stageBudgets.values()].sort((left, right) => left.stageId.localeCompare(right.stageId)).map(freezeStageBudget),
    assumptions: [
      "At least two time-separated trace samples are required for trapezoidal impulse integration.",
      "Force and force/mass values are scalar magnitudes from the coupled trace; their velocity equivalents are not vector delta-v or mission loss terms.",
      "Stage-specific intervals use the left endpoint's attached-stage topology across each positive-duration interval.",
    ],
    warnings,
  });

  if (normalized.length < 2) {
    return emptyResult(["The trace has fewer than two samples, so force impulses are not assessed."]);
  }
  const timeSpanS = normalized[normalized.length - 1].timeS - normalized[0].timeS;
  if (!(timeSpanS > 0)) {
    return emptyResult(["The trace has no positive time span, so force impulses are not assessed."]);
  }

  let thrustImpulseNs = 0;
  let aerodynamicDragImpulseNs = 0;
  let recoveryDragImpulseNs = 0;
  let aerodynamicForceImpulseNs = 0;
  let thrustVelocityEquivalentMps = 0;
  let combinedDragVelocityEquivalentMps = 0;
  for (let index = 1; index < normalized.length; index += 1) {
    const left = normalized[index - 1];
    const right = normalized[index];
    const durationS = right.timeS - left.timeS;
    if (!(durationS > 0)) continue;
    thrustImpulseNs += trapezoid(left.thrustN, right.thrustN, durationS);
    aerodynamicDragImpulseNs += trapezoid(left.dragN, right.dragN, durationS);
    recoveryDragImpulseNs += trapezoid(left.recoveryDragN, right.recoveryDragN, durationS);
    aerodynamicForceImpulseNs += trapezoid(left.aerodynamicForceN ?? left.dragN, right.aerodynamicForceN ?? right.dragN, durationS);
    thrustVelocityEquivalentMps += trapezoid(
      left.thrustN / left.massKg,
      right.thrustN / right.massKg,
      durationS,
    );
    combinedDragVelocityEquivalentMps += trapezoid(
      (left.dragN + left.recoveryDragN) / left.massKg,
      (right.dragN + right.recoveryDragN) / right.massKg,
      durationS,
    );
    const activeStageIds = left.attachedStageIds ?? [];
    for (const stageId of activeStageIds) {
      const budget = stageBudgets.get(stageId) ?? makeStageBudget(
        stageId,
        stageLabels[stageId] ?? stageId,
      );
      budget.activeDurationS += durationS;
      budget.thrustImpulseNs += trapezoid(left.thrustN, right.thrustN, durationS);
      budget.aerodynamicDragImpulseNs += trapezoid(left.dragN, right.dragN, durationS);
      budget.recoveryDragImpulseNs += trapezoid(left.recoveryDragN, right.recoveryDragN, durationS);
      budget.combinedDragImpulseNs += trapezoid(
        left.dragN + left.recoveryDragN,
        right.dragN + right.recoveryDragN,
        durationS,
      );
      budget.thrustVelocityEquivalentMps += trapezoid(
        left.thrustN / left.massKg,
        right.thrustN / right.massKg,
        durationS,
      );
      budget.combinedDragVelocityEquivalentMps += trapezoid(
        (left.dragN + left.recoveryDragN) / left.massKg,
        (right.dragN + right.recoveryDragN) / right.massKg,
        durationS,
      );
    }
  }
  for (const budget of stageBudgets.values()) {
    budget.combinedDragImpulseNs = budget.aerodynamicDragImpulseNs + budget.recoveryDragImpulseNs;
  }
  const ratio = thrustVelocityEquivalentMps > 0
    ? combinedDragVelocityEquivalentMps / thrustVelocityEquivalentMps
    : null;
  return {
    modelVersion: STAGE_FLIGHT_FORCE_BUDGET_MODEL_VERSION,
    validationStatus: STAGE_FLIGHT_FORCE_BUDGET_VALIDATION_STATUS,
    status: "assessed",
    sampleCount: normalized.length,
    timeSpanS,
    thrustImpulseNs,
    aerodynamicDragImpulseNs,
    recoveryDragImpulseNs,
    combinedDragImpulseNs: aerodynamicDragImpulseNs + recoveryDragImpulseNs,
    aerodynamicForceImpulseNs,
    thrustVelocityEquivalentMps,
    combinedDragVelocityEquivalentMps,
    dragToThrustVelocityEquivalentRatio: ratio,
    peakThrustN: Math.max(...normalized.map((sample) => sample.thrustN)),
    peakAerodynamicDragN: Math.max(...normalized.map((sample) => sample.dragN)),
    peakRecoveryDragN: Math.max(...normalized.map((sample) => sample.recoveryDragN)),
    peakDynamicPressurePa: peakOptional(normalized, (sample) => sample.dynamicPressurePa),
    peakSpeedMps: peakOptional(normalized, (sample) => sample.speedMps),
    stages: [...stageBudgets.values()].sort((left, right) => left.stageId.localeCompare(right.stageId)).map(freezeStageBudget),
    assumptions: [
      "Scalar thrust, aerodynamic drag, recovery drag, and aerodynamic-force magnitudes are integrated with the trapezoidal rule over the returned coupled trace.",
      "Force/mass integrations are velocity-equivalent accounting signals; they are not vector delta-v, gravity loss, steering loss, or a mission-performance budget.",
      "Stage-specific intervals use the left endpoint's attached-stage topology, with zero-duration event boundaries excluded from integration.",
    ],
    warnings: [
      "The budget cannot attribute a true gravity, steering, plume, or staging loss because the trace exposes scalar magnitudes rather than complete force vectors and propulsive efficiency states.",
      "Mass changes and event discontinuities are represented only through the recorded samples; sub-step force histories and transient mechanisms are not reconstructed.",
      ...(stageBudgets.size === 0
        ? ["The trace contains no attached-stage identifiers, so stage-specific force accounting is not available."]
        : []),
      ...(thrustVelocityEquivalentMps <= 0
        ? ["No positive thrust velocity-equivalent was recorded, so the drag-to-thrust ratio is unavailable."]
        : []),
    ],
  };
}
