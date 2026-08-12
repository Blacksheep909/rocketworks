/**
 * Explicit compressibility trends for the small-angle normal-force relation.
 *
 * These are engineering-preview extensions, not a substitute for a measured
 * or validated vehicle-specific force database.  The default remains the
 * historical low-speed relation so existing projects keep their behavior.
 */
export const NORMAL_FORCE_COMPRESSIBILITY_MODEL_VERSION =
  "rocketworks-normal-force-compressibility-0.1.0";
export const NORMAL_FORCE_COMPRESSIBILITY_STATUS =
  "engineering-preview-unvalidated" as const;

/** Linearized-flow domain boundaries deliberately leave a transonic gap. */
export const PRANDTL_GLAUERT_MAX_MACH = 0.8;
export const LINEARIZED_SUPERSONIC_MIN_MACH = 1.2;

export type NormalForceModelKind =
  | "low-speed"
  | "prandtl-glauert"
  | "supersonic-linearized";

export type NormalForceModelRegime =
  | "low-speed"
  | "subsonic-linearized"
  | "transonic-gap"
  | "supersonic-linearized";

export type NormalForceModelIssue = Readonly<{
  code: "NORMAL_FORCE_MODEL_DOMAIN";
  severity: "unsupported";
  explanation: string;
}>;

export type NormalForceModelEvaluation = Readonly<{
  model: NormalForceModelKind;
  modelVersion: string;
  validationStatus: typeof NORMAL_FORCE_COMPRESSIBILITY_STATUS;
  mach: number;
  regime: NormalForceModelRegime;
  factor: number;
  applied: boolean;
  issue: NormalForceModelIssue | null;
}>;

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite and non-negative`);
  }
}

/**
 * Evaluate the selected normal-force slope trend.
 *
 * The Prandtl-Glauert factor is `1 / sqrt(1 - M^2)` and is only used below
 * Mach 0.8.  The supersonic option uses the Ackeret `4 / sqrt(M^2 - 1)`
 * slope normalized against the baseline low-speed `2 / rad` relation, giving
 * a transparent factor of `2 / sqrt(M^2 - 1)`.  That normalization is an
 * approximation for mixed body/fin geometry; a supplied coefficient table is
 * preferred whenever vehicle-specific data are available.
 */
export function evaluateNormalForceModel(input: Readonly<{
  model?: NormalForceModelKind;
  mach: number;
}>): NormalForceModelEvaluation {
  assertFiniteNonNegative(input.mach, "normal-force Mach");
  const model = input.model ?? "low-speed";
  if (
    model !== "low-speed" &&
    model !== "prandtl-glauert" &&
    model !== "supersonic-linearized"
  ) {
    throw new Error(
      "normal-force model must be low-speed, prandtl-glauert, or supersonic-linearized",
    );
  }

  if (model === "low-speed") {
    return {
      model,
      modelVersion: NORMAL_FORCE_COMPRESSIBILITY_MODEL_VERSION,
      validationStatus: NORMAL_FORCE_COMPRESSIBILITY_STATUS,
      mach: input.mach,
      regime: "low-speed",
      factor: 1,
      applied: true,
      issue: null,
    };
  }

  if (model === "prandtl-glauert") {
    if (input.mach < PRANDTL_GLAUERT_MAX_MACH) {
      return {
        model,
        modelVersion: NORMAL_FORCE_COMPRESSIBILITY_MODEL_VERSION,
        validationStatus: NORMAL_FORCE_COMPRESSIBILITY_STATUS,
        mach: input.mach,
        regime: "subsonic-linearized",
        factor: 1 / Math.sqrt(1 - input.mach ** 2),
        applied: true,
        issue: null,
      };
    }
    return {
      model,
      modelVersion: NORMAL_FORCE_COMPRESSIBILITY_MODEL_VERSION,
      validationStatus: NORMAL_FORCE_COMPRESSIBILITY_STATUS,
      mach: input.mach,
      regime: "transonic-gap",
      factor: 0,
      applied: false,
      issue: {
        code: "NORMAL_FORCE_MODEL_DOMAIN",
        severity: "unsupported",
        explanation: `The Prandtl-Glauert normal-force trend is limited to Mach below ${PRANDTL_GLAUERT_MAX_MACH.toFixed(2)}; transonic flow is intentionally left unsupported.`,
      },
    };
  }

  if (input.mach > LINEARIZED_SUPERSONIC_MIN_MACH) {
    return {
      model,
      modelVersion: NORMAL_FORCE_COMPRESSIBILITY_MODEL_VERSION,
      validationStatus: NORMAL_FORCE_COMPRESSIBILITY_STATUS,
      mach: input.mach,
      regime: "supersonic-linearized",
      factor: 2 / Math.sqrt(input.mach ** 2 - 1),
      applied: true,
      issue: null,
    };
  }
  return {
    model,
    modelVersion: NORMAL_FORCE_COMPRESSIBILITY_MODEL_VERSION,
    validationStatus: NORMAL_FORCE_COMPRESSIBILITY_STATUS,
    mach: input.mach,
    regime: "transonic-gap",
    factor: 0,
    applied: false,
    issue: {
      code: "NORMAL_FORCE_MODEL_DOMAIN",
      severity: "unsupported",
      explanation: `The linearized supersonic normal-force trend is limited to Mach above ${LINEARIZED_SUPERSONIC_MIN_MACH.toFixed(2)}; subsonic and transonic flow require a different source.`,
    },
  };
}
