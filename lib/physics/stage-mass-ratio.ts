import type { MultiStageMotor, RocketStage } from "./multi-stage.ts";

export const STAGE_MASS_RATIO_MODEL_VERSION =
  "rocketworks-stage-mass-ratio-0.1.0";
export const STAGE_MASS_RATIO_VALIDATION_STATUS =
  "analytical-ideal-rocket-equation" as const;
export const STAGE_MASS_RATIO_GRAVITY_MPS2 = 9.80665;

export type StageMassRatioStatus = "assessed" | "review" | "unavailable";

export type StageMassRatioDiagnostic = Readonly<{
  stageId: string;
  stageName: string;
  instanceCount: number;
  status: StageMassRatioStatus;
  structuralMassKg: number;
  motorDryMassKg: number;
  propellantMassKg: number;
  fullStageMassKg: number;
  burnoutStageMassKg: number;
  massRatio: number | null;
  propellantMassFraction: number | null;
  totalImpulseNs: number;
  effectiveSpecificImpulseS: number | null;
  idealDeltaVMps: number | null;
  note: string;
}>;

export type StageMassRatioResult = Readonly<{
  modelVersion: typeof STAGE_MASS_RATIO_MODEL_VERSION;
  validationStatus: typeof STAGE_MASS_RATIO_VALIDATION_STATUS;
  overallStatus: "assessed" | "review" | "not-assessed";
  stages: readonly StageMassRatioDiagnostic[];
  assessedStageCount: number;
  totalIdealDeltaVMps: number | null;
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

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (!(value > 0)) throw new Error(`${label} must be positive`);
}

function trapezoidImpulseNs(motor: MultiStageMotor): number {
  if (motor.thrustCurve.length < 2) {
    throw new Error(`motor ${motor.id} thrust curve needs at least two points`);
  }
  let impulseNs = 0;
  for (let index = 1; index < motor.thrustCurve.length; index += 1) {
    const left = motor.thrustCurve[index - 1];
    const right = motor.thrustCurve[index];
    assertFinite(left.timeS, `motor ${motor.id} thrust time`);
    assertFinite(right.timeS, `motor ${motor.id} thrust time`);
    assertNonNegative(left.thrustN, `motor ${motor.id} thrust`);
    assertNonNegative(right.thrustN, `motor ${motor.id} thrust`);
    if (!(right.timeS > left.timeS)) {
      throw new Error(`motor ${motor.id} thrust times must increase`);
    }
    impulseNs += 0.5 * (left.thrustN + right.thrustN) * (right.timeS - left.timeS);
  }
  return impulseNs;
}

function instanceCountForStage(stage: RocketStage): number {
  const count = stage.instances?.length ?? 1;
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`stage ${stage.id} instance count must be a positive integer`);
  }
  return count;
}

/**
 * Calculate transparent stage-only mass-ratio and ideal rocket-equation
 * diagnostics from the independent multi-stage mass and thrust inputs.
 *
 * The result intentionally excludes downstream payload/upper-stage mass. It is
 * a stage composition diagnostic, not a full mission delta-v budget or a
 * trajectory solver.
 */
export function computeStageMassRatio(
  input: Readonly<{
    stages: readonly RocketStage[];
    gravityMps2?: number;
  }>,
): StageMassRatioResult {
  const gravityMps2 = input.gravityMps2 ?? STAGE_MASS_RATIO_GRAVITY_MPS2;
  assertPositive(gravityMps2, "mass-ratio gravity");
  const stageIds = new Set<string>();
  const warnings: string[] = [];
  const stages: StageMassRatioDiagnostic[] = input.stages.map((stage) => {
    if (!stage.id.trim()) throw new Error("stage mass-ratio id cannot be empty");
    if (!stage.name.trim()) throw new Error(`stage ${stage.id} mass-ratio name cannot be empty`);
    if (stageIds.has(stage.id)) throw new Error(`duplicate stage mass-ratio id: ${stage.id}`);
    stageIds.add(stage.id);
    assertPositive(stage.structuralMassProperties.massKg, `stage ${stage.id} structural mass`);
    const instanceCount = instanceCountForStage(stage);
    const structuralMassKg = stage.structuralMassProperties.massKg;
    const motorDryMassKg = stage.motors.reduce(
      (total, motor) => total + motor.dryMassProperties.massKg,
      0,
    );
    const propellantMassKg = stage.motors.reduce(
      (total, motor) => total + motor.initialPropellantMassProperties.massKg,
      0,
    );
    const totalImpulseNs = stage.motors.reduce(
      (total, motor) => total + trapezoidImpulseNs(motor),
      0,
    );
    assertNonNegative(motorDryMassKg, `stage ${stage.id} motor dry mass`);
    assertNonNegative(propellantMassKg, `stage ${stage.id} propellant mass`);
    assertNonNegative(totalImpulseNs, `stage ${stage.id} total impulse`);
    const fullStageMassKg = structuralMassKg + motorDryMassKg + propellantMassKg;
    const burnoutStageMassKg = structuralMassKg + motorDryMassKg;
    const hasPropellant = propellantMassKg > 0;
    const hasBurnoutMass = burnoutStageMassKg > 0;
    const hasImpulse = totalImpulseNs > 0;
    const massRatio = hasPropellant && hasBurnoutMass
      ? fullStageMassKg / burnoutStageMassKg
      : null;
    const propellantMassFraction = fullStageMassKg > 0
      ? propellantMassKg / fullStageMassKg
      : null;
    const effectiveSpecificImpulseS = hasPropellant && hasImpulse
      ? totalImpulseNs / (propellantMassKg * gravityMps2)
      : null;
    const idealDeltaVMps =
      massRatio !== null && effectiveSpecificImpulseS !== null && massRatio > 1
        ? effectiveSpecificImpulseS * gravityMps2 * Math.log(massRatio)
        : null;
    const status: StageMassRatioStatus =
      idealDeltaVMps !== null
        ? "assessed"
        : !hasPropellant || !hasBurnoutMass || !hasImpulse
          ? "unavailable"
          : "review";
    const note =
      status === "assessed"
        ? "Stage-only ideal rocket-equation proxy; downstream payload and gravity/drag losses are excluded."
        : !hasPropellant
          ? "No positive initial propellant mass is available for a mass-ratio estimate."
          : !hasImpulse
            ? "No positive integrated thrust impulse is available for an ideal delta-v estimate."
            : "Mass-ratio inputs are present but the ideal delta-v proxy is outside its valid positive domain.";
    if (status !== "assessed") warnings.push(`${stage.name}: ${note}`);
    return {
      stageId: stage.id,
      stageName: stage.name,
      instanceCount,
      status,
      structuralMassKg,
      motorDryMassKg,
      propellantMassKg,
      fullStageMassKg,
      burnoutStageMassKg,
      massRatio,
      propellantMassFraction,
      totalImpulseNs,
      effectiveSpecificImpulseS,
      idealDeltaVMps,
      note,
    };
  });
  const assessedStages = stages.filter((stage) => stage.status === "assessed");
  const overallStatus: StageMassRatioResult["overallStatus"] =
    stages.length === 0
      ? "not-assessed"
      : stages.some((stage) => stage.status !== "assessed")
        ? "review"
        : "assessed";
  return {
    modelVersion: STAGE_MASS_RATIO_MODEL_VERSION,
    validationStatus: STAGE_MASS_RATIO_VALIDATION_STATUS,
    overallStatus,
    stages,
    assessedStageCount: assessedStages.length,
    totalIdealDeltaVMps: assessedStages.length > 0
      ? assessedStages.reduce((total, stage) => total + stage.idealDeltaVMps!, 0)
      : null,
    assumptions: [
      "Full stage mass is structural mass plus motor dry mass plus initial propellant mass; separation hardware and downstream payload are not separately identified.",
      "Ideal delta-v uses the Tsiolkovsky logarithmic relation with effective specific impulse derived from integrated thrust impulse and supplied initial propellant mass.",
      "The summed delta-v is a stage-only composition proxy, not a mission budget and not a trajectory result; gravity, drag, steering, residuals, throttling, and staging losses are excluded.",
      "Repeated physical stage instances are aggregated into their logical stage row when the caller supplies a cluster stage.",
    ],
    warnings: [
      "This is an analytical ideal-rocket-equation diagnostic, not flight validation, performance certification, or a flight-safety result.",
      ...(stages.length === 0 ? ["No propulsive stages were supplied, so mass-ratio analysis is not assessed."] : []),
      ...warnings,
    ],
  };
}
