/**
 * Optional quadratic drag-due-to-normal-force polar for the relation path.
 *
 * The coefficient is intentionally caller-authored rather than inferred from
 * a fin planform.  A rocket's fin interference, body crossflow, and reference
 * area conventions need vehicle-specific evidence; silently inventing an
 * aspect ratio would be less honest than exposing the factor directly.
 * Direct body-axis force tables bypass this model.
 */
export const INDUCED_DRAG_MODEL_VERSION =
  "rocketworks-induced-drag-polar-0.1.0";
export const INDUCED_DRAG_MODEL_STATUS =
  "engineering-preview-unvalidated" as const;
export const MAX_INDUCED_DRAG_FACTOR = 10;

export type InducedDragModelKind =
  | "disabled"
  | "quadratic-normal-force";

export type InducedDragEvaluation = Readonly<{
  model: InducedDragModelKind;
  modelVersion: string;
  validationStatus: typeof INDUCED_DRAG_MODEL_STATUS;
  normalForceCoefficient: number;
  factor: number;
  inducedDragCoefficient: number;
  applied: boolean;
}>;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
}

function assertFactor(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > MAX_INDUCED_DRAG_FACTOR) {
    throw new Error(
      `induced drag factor must be finite from 0 through ${MAX_INDUCED_DRAG_FACTOR}`,
    );
  }
}

/**
 * Evaluate `C_D,i = k C_N^2` for the relation-based aerodynamic fallback.
 *
 * `C_N` is signed at the coefficient level but the square makes induced drag
 * non-negative for either crossflow direction. The result is dimensionless
 * and uses the same reference area as the supplied baseline drag coefficient.
 */
export function evaluateInducedDrag(input: Readonly<{
  model?: InducedDragModelKind;
  normalForceCoefficient: number;
  factor?: number;
}>): InducedDragEvaluation {
  assertFinite(input.normalForceCoefficient, "induced-drag normal-force coefficient");
  const model = input.model ?? "disabled";
  if (model !== "disabled" && model !== "quadratic-normal-force") {
    throw new Error(
      "induced drag model must be disabled or quadratic-normal-force",
    );
  }
  const factor = input.factor ?? 0;
  assertFactor(factor);
  const inducedDragCoefficient =
    model === "quadratic-normal-force"
      ? factor * input.normalForceCoefficient ** 2
      : 0;
  if (!Number.isFinite(inducedDragCoefficient)) {
    throw new Error("induced-drag coefficient must be finite");
  }
  return {
    model,
    modelVersion: INDUCED_DRAG_MODEL_VERSION,
    validationStatus: INDUCED_DRAG_MODEL_STATUS,
    normalForceCoefficient: input.normalForceCoefficient,
    factor,
    inducedDragCoefficient,
    applied: model === "quadratic-normal-force" && inducedDragCoefficient > 0,
  };
}
