/**
 * Small, shared recovery-area schedule primitive.
 *
 * The schedule is intentionally a piecewise-linear effective-area fraction,
 * not a parachute fabric or line model. It gives callers a deterministic way
 * to represent staged reefing while keeping the approximation visible.
 */
export const RECOVERY_REEFING_MODEL_VERSION = "kestrel-recovery-reefing-0.1.0";

export type RecoveryReefingStage = Readonly<{
  /** Seconds after inflation begins. The first stage must start at zero. */
  timeFromInflationS: number;
  /** Effective canopy-area fraction, bounded from zero through one. */
  areaFraction: number;
}>;

export type RecoveryReefingEvaluation = Readonly<{
  areaFraction: number;
  stageIndex: number | null;
}>;

const MAX_REEFING_STAGES = 8;
const EPSILON = 1e-12;

export function validateRecoveryReefingStages(
  stages: readonly RecoveryReefingStage[] | undefined,
  label = "recovery reefing stages",
): readonly RecoveryReefingStage[] {
  if (stages === undefined) return [];
  if (stages.length > MAX_REEFING_STAGES) {
    throw new Error(`${label} may contain at most ${MAX_REEFING_STAGES} stages`);
  }
  const normalized = stages.map((stage, index) => {
    if (!Number.isFinite(stage.timeFromInflationS) || stage.timeFromInflationS < 0) {
      throw new Error(`${label}[${index}] time must be a non-negative finite number`);
    }
    if (!Number.isFinite(stage.areaFraction) || stage.areaFraction < 0 || stage.areaFraction > 1) {
      throw new Error(`${label}[${index}] area fraction must be finite from 0 through 1`);
    }
    return {
      timeFromInflationS: stage.timeFromInflationS,
      areaFraction: stage.areaFraction,
    };
  });
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index]!.timeFromInflationS <= normalized[index - 1]!.timeFromInflationS) {
      throw new Error(`${label} times must be strictly increasing`);
    }
  }
  if (normalized.length > 0 && normalized[0]!.timeFromInflationS > EPSILON) {
    throw new Error(`${label} must start at 0 seconds after inflation begins`);
  }
  if (
    normalized.length > 0 &&
    Math.abs(normalized[normalized.length - 1]!.areaFraction - 1) > EPSILON
  ) {
    throw new Error(`${label} must end at a fully open area fraction of 1`);
  }
  return normalized;
}

export function evaluateRecoveryReefing(
  stages: readonly RecoveryReefingStage[] | undefined,
  timeFromInflationS: number,
): RecoveryReefingEvaluation {
  if (!Number.isFinite(timeFromInflationS)) {
    throw new Error("recovery reefing time must be finite");
  }
  const normalized = stages ?? [];
  if (normalized.length === 0) return { areaFraction: 1, stageIndex: null };
  const timeS = Math.max(0, timeFromInflationS);
  if (timeS <= normalized[0]!.timeFromInflationS) {
    return { areaFraction: normalized[0]!.areaFraction, stageIndex: 0 };
  }
  for (let index = 1; index < normalized.length; index += 1) {
    const left = normalized[index - 1]!;
    const right = normalized[index]!;
    if (timeS <= right.timeFromInflationS) {
      const fraction =
        (timeS - left.timeFromInflationS) /
        (right.timeFromInflationS - left.timeFromInflationS);
      return {
        areaFraction: left.areaFraction + (right.areaFraction - left.areaFraction) * fraction,
        stageIndex: index,
      };
    }
  }
  return {
    areaFraction: normalized[normalized.length - 1]!.areaFraction,
    stageIndex: normalized.length - 1,
  };
}
