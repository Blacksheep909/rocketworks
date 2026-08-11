import type {
  AerodynamicCoefficientApplicabilityIssue,
  AerodynamicCoefficientTableModel,
} from "./aerodynamic-coefficients.ts";

export const AERODYNAMIC_POLAR_MODEL_VERSION =
  "rocketworks-aero-polar-0.1.0";
export const AERODYNAMIC_POLAR_VALIDATION_STATUS =
  "analytical-coefficient-sampling" as const;

export type AerodynamicPolarStatus = "assessed" | "review" | "not-assessed";

export type AerodynamicPolarPoint = Readonly<{
  angleOfAttackRad: number;
  sideslipRad: number;
  dragCoefficient: number;
  normalForceCoefficient: number;
  axialForceCoefficient: number;
  sideForceCoefficient: number | null;
  centerOfPressureXM: number;
  normalToDragRatio: number | null;
  dragCoefficientUncertainty: number | null;
  forceCoefficientUncertainty: Readonly<{
    x: number;
    y: number;
    z: number;
  }> | null;
  applicability: readonly AerodynamicCoefficientApplicabilityIssue[];
}>;

export type AerodynamicPolarResult = Readonly<{
  modelVersion: typeof AERODYNAMIC_POLAR_MODEL_VERSION;
  validationStatus: typeof AERODYNAMIC_POLAR_VALIDATION_STATUS;
  status: AerodynamicPolarStatus;
  tableModelVersion: string;
  mach: number;
  reynoldsNumber: number;
  sideslipRad: number;
  points: readonly AerodynamicPolarPoint[];
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertNonNegative(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0) throw new Error(`${label} must be non-negative`);
}

function assertStrictlyIncreasing(values: readonly number[], label: string): void {
  if (values.length < 2) throw new Error(`${label} requires at least two points`);
  values.forEach((value, index) => {
    assertFinite(value, `${label} point ${index + 1}`);
    if (index > 0 && value <= values[index - 1]) {
      throw new Error(`${label} must be strictly increasing`);
    }
  });
}

function midpoint(range: readonly [number, number]): number {
  return 0.5 * (range[0] + range[1]);
}

function geometricMidpoint(range: readonly [number, number]): number {
  return Math.sqrt(range[0] * range[1]);
}

function defaultAngles(model: AerodynamicCoefficientTableModel): readonly number[] {
  const range = model.angleOfAttackRangeRad ?? [(-12 * Math.PI) / 180, (12 * Math.PI) / 180];
  const count = 9;
  return Array.from({ length: count }, (_, index) =>
    range[0] + ((range[1] - range[0]) * index) / (count - 1),
  );
}

function defaultSideslip(model: AerodynamicCoefficientTableModel): number {
  if (!model.sideslipRangeRad) return 0;
  const [minimum, maximum] = model.sideslipRangeRad;
  return Math.max(minimum, Math.min(maximum, 0));
}

function uniqueWarnings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

/**
 * Sample one coefficient table at a fixed Mach/Reynolds/sideslip condition.
 *
 * Direct force-volume resultants are preferred when available. Legacy tables
 * fall back to the declared drag coefficient and the small-angle normal-force
 * slope multiplied by angle of attack; that fallback remains explicitly an
 * analytical polar proxy.
 */
export function sampleAerodynamicPolar(
  model: AerodynamicCoefficientTableModel,
  options: Readonly<{
    mach?: number;
    reynoldsNumber?: number;
    sideslipRad?: number;
    angleOfAttackPointsRad?: readonly number[];
  }> = {},
): AerodynamicPolarResult {
  const mach = options.mach ?? midpoint(model.machRange);
  const reynoldsNumber = options.reynoldsNumber ?? geometricMidpoint(model.reynoldsRange);
  const sideslipRad = options.sideslipRad ?? defaultSideslip(model);
  assertNonNegative(mach, "polar Mach");
  assertNonNegative(reynoldsNumber, "polar Reynolds number");
  assertFinite(sideslipRad, "polar sideslip");
  const angleOfAttackPointsRad = options.angleOfAttackPointsRad ?? defaultAngles(model);
  assertStrictlyIncreasing(angleOfAttackPointsRad, "polar angle-of-attack points");
  if (angleOfAttackPointsRad.length > 128) {
    throw new Error("polar angle-of-attack points cannot exceed 128 samples");
  }

  const points = angleOfAttackPointsRad.map((angleOfAttackRad) => {
    const evaluation = model.evaluate({
      mach,
      reynoldsNumber,
      angleOfAttackRad,
      sideslipRad,
    });
    const directForce = evaluation.forceCoefficientBody;
    const normalForceCoefficient =
      directForce?.y ?? evaluation.normalForceSlopePerRad * angleOfAttackRad;
    const axialForceCoefficient = directForce?.x ?? -evaluation.dragCoefficient;
    const sideForceCoefficient = directForce?.z ?? null;
    const normalToDragRatio = evaluation.dragCoefficient > 0
      ? normalForceCoefficient / evaluation.dragCoefficient
      : null;
    return {
      angleOfAttackRad,
      sideslipRad,
      dragCoefficient: evaluation.dragCoefficient,
      normalForceCoefficient,
      axialForceCoefficient,
      sideForceCoefficient,
      centerOfPressureXM: evaluation.centerOfPressureXM,
      normalToDragRatio,
      dragCoefficientUncertainty: evaluation.uncertainty.dragCoefficient,
      forceCoefficientUncertainty: evaluation.uncertainty.forceCoefficientBody,
      applicability: evaluation.applicability,
    } satisfies AerodynamicPolarPoint;
  });
  const unsupportedApplicability = points.flatMap((point) =>
    point.applicability
      .filter((issue) => issue.severity === "unsupported")
      .map((issue) => issue.explanation),
  );
  const warnings = uniqueWarnings([
    ...model.warnings,
    ...(unsupportedApplicability.length > 0
      ? [
          `One or more polar samples are outside the declared coefficient domain: ${unsupportedApplicability[0]}`,
        ]
      : []),
    ...(model.forceMomentDatabaseAvailable
      ? []
      : [
          "No direct body-axis force volume is present; axial force uses negative drag and normal force uses the small-angle normal-force slope times angle of attack.",
        ]),
  ]);
  return {
    modelVersion: AERODYNAMIC_POLAR_MODEL_VERSION,
    validationStatus: AERODYNAMIC_POLAR_VALIDATION_STATUS,
    status: unsupportedApplicability.length > 0 ? "review" : "assessed",
    tableModelVersion: model.modelVersion,
    mach,
    reynoldsNumber,
    sideslipRad,
    points,
    assumptions: [
      "Mach and Reynolds number remain fixed across the sampled polar; Reynolds interpolation uses the table model's logarithmic policy.",
      "Direct body-axis force coefficients are used when supplied; otherwise the legacy drag and small-angle normal-force relation provides an analytical proxy.",
      "This polar shows supplied or interpolated coefficients only. It does not model separated flow, transonic hysteresis, dynamic stall, or experimental uncertainty beyond declared table cells.",
    ],
    warnings,
  };
}
