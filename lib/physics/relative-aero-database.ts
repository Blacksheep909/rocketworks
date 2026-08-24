import type { AerodynamicDataProvenance } from "./aerodynamic-coefficients.ts";

/**
 * A configuration-specific, flow-aligned relative-body aerodynamic data set.
 *
 * The table is intentionally a small, explicit interpolation contract rather
 * than a CFD or wind-tunnel solver. Axial separation is measured from the
 * source body to the target body along the source body's air-relative flow;
 * lateral separation is the magnitude of the perpendicular offset. Both are
 * normalized by the source body's equivalent diameter. Values are coefficient
 * deltas relative to an isolated-body reference and are never applied to a
 * flight trajectory by this module.
 */
export const RELATIVE_AERO_DATABASE_MODEL_VERSION =
  "rocketworks-relative-aero-database-0.1.0";
export const RELATIVE_AERO_DATABASE_STATUS =
  "analytical-component-checks-only" as const;

export type RelativeAeroDatabaseCoefficientGrid = Readonly<{
  /** Values are ordered lateral separation × axial separation × Mach. */
  values: readonly (readonly (readonly number[])[])[];
  /** Optional source-declared absolute coefficient uncertainty at each cell. */
  absoluteUncertainty?: readonly (readonly (readonly number[])[])[];
}>;

export type RelativeAeroDatabaseDefinition = Readonly<{
  id: string;
  name: string;
  machPoints: readonly number[];
  axialSeparationPointsBodyDiameters: readonly number[];
  lateralSeparationPointsBodyDiameters: readonly number[];
  /** Body-axis axial-force coefficient delta (+x, nose-to-tail convention). */
  axialForceCoefficientDelta: RelativeAeroDatabaseCoefficientGrid;
  /** Optional body-axis normal-force coefficient delta (+y). */
  normalForceCoefficientDelta?: RelativeAeroDatabaseCoefficientGrid;
  /** Optional body-axis side-force coefficient delta (+z). */
  sideForceCoefficientDelta?: RelativeAeroDatabaseCoefficientGrid;
  /** Optional body-axis roll-moment coefficient delta (+x). */
  rollMomentCoefficientDelta?: RelativeAeroDatabaseCoefficientGrid;
  /** Optional body-axis pitch-moment coefficient delta (+y). */
  pitchMomentCoefficientDelta?: RelativeAeroDatabaseCoefficientGrid;
  /** Optional body-axis yaw-moment coefficient delta (+z). */
  yawMomentCoefficientDelta?: RelativeAeroDatabaseCoefficientGrid;
  /** Optional reference area used when the caller has no target area. */
  referenceAreaM2?: number;
  /** Optional moment reference length used when moment deltas are present. */
  momentReferenceLengthM?: number;
  outOfRangePolicy?: "reject" | "clamp-with-warning";
  provenance: AerodynamicDataProvenance;
}>;

export type RelativeAeroDatabaseApplicabilityIssue = Readonly<{
  code:
    | "MACH_BELOW_DATABASE"
    | "MACH_ABOVE_DATABASE"
    | "AXIAL_SEPARATION_BELOW_DATABASE"
    | "AXIAL_SEPARATION_ABOVE_DATABASE"
    | "LATERAL_SEPARATION_BELOW_DATABASE"
    | "LATERAL_SEPARATION_ABOVE_DATABASE";
  severity: "unsupported";
  explanation: string;
}>;

export type RelativeAeroDatabaseCoefficients = Readonly<{
  axialForceCoefficientDelta: number;
  normalForceCoefficientDelta: number | null;
  sideForceCoefficientDelta: number | null;
  rollMomentCoefficientDelta: number | null;
  pitchMomentCoefficientDelta: number | null;
  yawMomentCoefficientDelta: number | null;
}>;

export type RelativeAeroDatabaseCoefficientUncertainty = Readonly<{
  axialForceCoefficientDelta: number;
  normalForceCoefficientDelta: number | null;
  sideForceCoefficientDelta: number | null;
  rollMomentCoefficientDelta: number | null;
  pitchMomentCoefficientDelta: number | null;
  yawMomentCoefficientDelta: number | null;
}>;

export type RelativeAeroDatabaseEvaluation = Readonly<{
  modelVersion: typeof RELATIVE_AERO_DATABASE_MODEL_VERSION;
  validationStatus: AerodynamicDataProvenance["validationStatus"];
  requestedMach: number;
  requestedAxialSeparationBodyDiameters: number;
  requestedLateralSeparationBodyDiameters: number;
  evaluatedMach: number;
  evaluatedAxialSeparationBodyDiameters: number;
  evaluatedLateralSeparationBodyDiameters: number;
  coefficients: RelativeAeroDatabaseCoefficients;
  uncertainty: RelativeAeroDatabaseCoefficientUncertainty;
  applicability: readonly RelativeAeroDatabaseApplicabilityIssue[];
  provenance: AerodynamicDataProvenance;
}>;

export type RelativeAeroDatabaseModel = Readonly<{
  modelVersion: typeof RELATIVE_AERO_DATABASE_MODEL_VERSION;
  validationStatus: AerodynamicDataProvenance["validationStatus"];
  id: string;
  name: string;
  machRange: readonly [number, number];
  axialSeparationRangeBodyDiameters: readonly [number, number];
  lateralSeparationRangeBodyDiameters: readonly [number, number];
  availableChannels: readonly string[];
  referenceAreaM2: number | null;
  momentReferenceLengthM: number | null;
  provenance: AerodynamicDataProvenance;
  evaluate: (
    input: Readonly<{
      mach: number;
      axialSeparationBodyDiameters: number;
      lateralSeparationBodyDiameters: number;
    }>,
  ) => RelativeAeroDatabaseEvaluation;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

type AxisBracket = Readonly<{
  lowerIndex: number;
  upperIndex: number;
  fraction: number;
  evaluatedValue: number;
  range: "below" | "inside" | "above";
}>;

type GridChannel = keyof Pick<
  RelativeAeroDatabaseDefinition,
  | "axialForceCoefficientDelta"
  | "normalForceCoefficientDelta"
  | "sideForceCoefficientDelta"
  | "rollMomentCoefficientDelta"
  | "pitchMomentCoefficientDelta"
  | "yawMomentCoefficientDelta"
>;

const CHANNELS: readonly GridChannel[] = [
  "axialForceCoefficientDelta",
  "normalForceCoefficientDelta",
  "sideForceCoefficientDelta",
  "rollMomentCoefficientDelta",
  "pitchMomentCoefficientDelta",
  "yawMomentCoefficientDelta",
];

const COEFFICIENT_ABS_LIMIT = 20;
const TIMELESS_EPSILON = 1e-12;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (!(value > 0)) throw new Error(`${label} must be positive`);
}

function validateIdentifier(id: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(
      "relative aerodynamic database identifiers may contain only letters, numbers, underscores, and hyphens",
    );
  }
}

function validateAxis(
  values: readonly number[],
  label: string,
  domain: "positive" | "non-negative" | "signed",
): void {
  if (values.length === 0) throw new Error(`${label} axis cannot be empty`);
  values.forEach((value, index) => {
    assertFinite(value, `${label}[${index}]`);
    if (
      (domain === "positive" && value <= 0) ||
      (domain === "non-negative" && value < 0)
    ) {
      throw new Error(
        `${label} axis must contain strictly increasing ${domain === "positive" ? "positive" : "non-negative"} values`,
      );
    }
    if (index > 0 && value <= values[index - 1]!) {
      throw new Error(`${label} axis must be strictly increasing`);
    }
  });
}

function validateProvenance(provenance: AerodynamicDataProvenance): void {
  for (const [label, value] of [
    ["source name", provenance.sourceName],
    ["data version", provenance.dataVersion],
    ["license identifier", provenance.licenseIdentifier],
  ] as const) {
    if (!value.trim()) {
      throw new Error(`relative aerodynamic database provenance ${label} cannot be empty`);
    }
  }
  if (
    provenance.sourceKind !== "wind-tunnel" &&
    provenance.sourceKind !== "cfd" &&
    provenance.sourceKind !== "flight-test" &&
    provenance.sourceKind !== "published-analysis" &&
    provenance.sourceKind !== "user-supplied"
  ) {
    throw new Error("relative aerodynamic database provenance source kind is invalid");
  }
  if (
    provenance.validationStatus !== "user-supplied-unvalidated" &&
    provenance.validationStatus !== "published-data-unverified" &&
    provenance.validationStatus !== "independently-benchmarked"
  ) {
    throw new Error("relative aerodynamic database provenance validation status is invalid");
  }
  if (provenance.sourceUrl !== undefined) {
    let url: URL;
    try {
      url = new URL(provenance.sourceUrl);
    } catch {
      throw new Error("relative aerodynamic database provenance source URL must be valid");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("relative aerodynamic database provenance source URL must use HTTP or HTTPS");
    }
  }
}

function validateGrid(
  grid: RelativeAeroDatabaseCoefficientGrid,
  lateralCount: number,
  axialCount: number,
  machCount: number,
  label: string,
): void {
  const shapeMatches =
    grid.values.length === lateralCount &&
    grid.values.every(
      (lateralLayer) =>
        lateralLayer.length === axialCount &&
        lateralLayer.every(
          (axialLayer) => axialLayer.length === machCount,
        ),
    );
  if (!shapeMatches) {
    throw new Error(
      `${label} grid must be ordered lateral separation × axial separation × Mach`,
    );
  }
  grid.values.forEach((lateralLayer, lateralIndex) =>
    lateralLayer.forEach((axialLayer, axialIndex) =>
      axialLayer.forEach((value, machIndex) => {
        assertFinite(
          value,
          `${label}[${lateralIndex}][${axialIndex}][${machIndex}]`,
        );
        if (Math.abs(value) > COEFFICIENT_ABS_LIMIT) {
          throw new Error(
            `${label} values must have absolute magnitude at most ${COEFFICIENT_ABS_LIMIT}`,
          );
        }
      }),
    ),
  );
  if (grid.absoluteUncertainty !== undefined) {
    const uncertaintyShapeMatches =
      grid.absoluteUncertainty.length === lateralCount &&
      grid.absoluteUncertainty.every(
        (lateralLayer) =>
          lateralLayer.length === axialCount &&
          lateralLayer.every(
            (axialLayer) => axialLayer.length === machCount,
          ),
      );
    if (!uncertaintyShapeMatches) {
      throw new Error(`${label} uncertainty grid has an invalid shape`);
    }
    grid.absoluteUncertainty.forEach((lateralLayer, lateralIndex) =>
      lateralLayer.forEach((axialLayer, axialIndex) =>
        axialLayer.forEach((value, machIndex) => {
          assertFinite(
            value,
            `${label} uncertainty[${lateralIndex}][${axialIndex}][${machIndex}]`,
          );
          if (value < 0) {
            throw new Error(`${label} uncertainty values must be non-negative`);
          }
        }),
      ),
    );
  }
}

function bracketAxis(
  value: number,
  axis: readonly number[],
): AxisBracket {
  if (value < axis[0]! - TIMELESS_EPSILON) {
    return {
      lowerIndex: 0,
      upperIndex: 0,
      fraction: 0,
      evaluatedValue: axis[0]!,
      range: "below",
    };
  }
  const lastIndex = axis.length - 1;
  if (value > axis[lastIndex]! + TIMELESS_EPSILON) {
    return {
      lowerIndex: lastIndex,
      upperIndex: lastIndex,
      fraction: 0,
      evaluatedValue: axis[lastIndex]!,
      range: "above",
    };
  }
  if (axis.length === 1) {
    return {
      lowerIndex: 0,
      upperIndex: 0,
      fraction: 0,
      evaluatedValue: axis[0]!,
      range: "inside",
    };
  }
  let lowerIndex = 0;
  let upperIndex = lastIndex;
  while (lowerIndex + 1 < upperIndex) {
    const middle = Math.floor((lowerIndex + upperIndex) / 2);
    if (axis[middle]! <= value) lowerIndex = middle;
    else upperIndex = middle;
  }
  const lower = axis[lowerIndex]!;
  const upper = axis[upperIndex]!;
  const fraction = upper - lower <= TIMELESS_EPSILON ? 0 : (value - lower) / (upper - lower);
  return {
    lowerIndex,
    upperIndex,
    fraction,
    evaluatedValue: value,
    range: "inside",
  };
}

function trilinear(
  values: readonly (readonly (readonly number[])[])[],
  lateral: AxisBracket,
  axial: AxisBracket,
  mach: AxisBracket,
): number {
  const at = (lateralIndex: number, axialIndex: number, machIndex: number) =>
    values[lateralIndex]![axialIndex]![machIndex]!;
  const lerp = (left: number, right: number, fraction: number) =>
    left + (right - left) * fraction;
  const lowerMach = lerp(
    at(lateral.lowerIndex, axial.lowerIndex, mach.lowerIndex),
    at(lateral.lowerIndex, axial.lowerIndex, mach.upperIndex),
    mach.fraction,
  );
  const upperMach = lerp(
    at(lateral.lowerIndex, axial.upperIndex, mach.lowerIndex),
    at(lateral.lowerIndex, axial.upperIndex, mach.upperIndex),
    mach.fraction,
  );
  const lowerLateral = lerp(lowerMach, upperMach, axial.fraction);
  if (lateral.lowerIndex === lateral.upperIndex) return lowerLateral;
  const farLowerMach = lerp(
    at(lateral.upperIndex, axial.lowerIndex, mach.lowerIndex),
    at(lateral.upperIndex, axial.lowerIndex, mach.upperIndex),
    mach.fraction,
  );
  const farUpperMach = lerp(
    at(lateral.upperIndex, axial.upperIndex, mach.lowerIndex),
    at(lateral.upperIndex, axial.upperIndex, mach.upperIndex),
    mach.fraction,
  );
  return lerp(lowerLateral, lerp(farLowerMach, farUpperMach, axial.fraction), lateral.fraction);
}

function channelLabel(channel: GridChannel): string {
  return channel
    .replace(/CoefficientDelta$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

/** Validate and construct a relative-body database model. */
export function createRelativeAeroDatabase(
  definition: RelativeAeroDatabaseDefinition,
): RelativeAeroDatabaseModel {
  validateIdentifier(definition.id);
  if (!definition.name.trim()) throw new Error("relative aerodynamic database name cannot be empty");
  validateAxis(definition.machPoints, "relative aerodynamic database Mach", "non-negative");
  validateAxis(
    definition.axialSeparationPointsBodyDiameters,
    "relative aerodynamic database axial separation",
    "signed",
  );
  validateAxis(
    definition.lateralSeparationPointsBodyDiameters,
    "relative aerodynamic database lateral separation",
    "non-negative",
  );
  validateProvenance(definition.provenance);
  if (definition.referenceAreaM2 !== undefined) {
    assertPositive(definition.referenceAreaM2, "relative aerodynamic database reference area");
  }
  const hasMomentChannel = [
    definition.rollMomentCoefficientDelta,
    definition.pitchMomentCoefficientDelta,
    definition.yawMomentCoefficientDelta,
  ].some((channel) => channel !== undefined);
  if (hasMomentChannel) {
    if (definition.momentReferenceLengthM === undefined) {
      throw new Error(
        "relative aerodynamic database moment channels require a moment reference length",
      );
    }
    assertPositive(
      definition.momentReferenceLengthM,
      "relative aerodynamic database moment reference length",
    );
  } else if (definition.momentReferenceLengthM !== undefined) {
    assertPositive(
      definition.momentReferenceLengthM,
      "relative aerodynamic database moment reference length",
    );
  }
  const gridShape = {
    lateralCount: definition.lateralSeparationPointsBodyDiameters.length,
    axialCount: definition.axialSeparationPointsBodyDiameters.length,
    machCount: definition.machPoints.length,
  };
  if (!definition.axialForceCoefficientDelta) {
    throw new Error("relative aerodynamic database axial-force coefficient delta is required");
  }
  const definedChannels = CHANNELS.filter(
    (channel) => definition[channel] !== undefined,
  );
  if (definedChannels.length === 0) {
    throw new Error("relative aerodynamic database must define at least one coefficient channel");
  }
  for (const channel of definedChannels) {
    validateGrid(
      definition[channel]!,
      gridShape.lateralCount,
      gridShape.axialCount,
      gridShape.machCount,
      channelLabel(channel),
    );
  }
  const outOfRangePolicy = definition.outOfRangePolicy ?? "reject";
  if (outOfRangePolicy !== "reject" && outOfRangePolicy !== "clamp-with-warning") {
    throw new Error("relative aerodynamic database out-of-range policy is invalid");
  }
  const evaluate = (input: Readonly<{
    mach: number;
    axialSeparationBodyDiameters: number;
    lateralSeparationBodyDiameters: number;
  }>): RelativeAeroDatabaseEvaluation => {
    assertFinite(input.mach, "relative aerodynamic database Mach query");
    assertFinite(
      input.axialSeparationBodyDiameters,
      "relative aerodynamic database axial separation query",
    );
    assertFinite(
      input.lateralSeparationBodyDiameters,
      "relative aerodynamic database lateral separation query",
    );
    if (input.mach < 0) throw new Error("relative aerodynamic database Mach query cannot be negative");
    if (input.lateralSeparationBodyDiameters < 0) {
      throw new Error("relative aerodynamic database lateral separation query cannot be negative");
    }
    const mach = bracketAxis(input.mach, definition.machPoints);
    const axial = bracketAxis(
      input.axialSeparationBodyDiameters,
      definition.axialSeparationPointsBodyDiameters,
    );
    const lateral = bracketAxis(
      input.lateralSeparationBodyDiameters,
      definition.lateralSeparationPointsBodyDiameters,
    );
    const outside = [mach, axial, lateral].some((bracket) => bracket.range !== "inside");
    if (outside && outOfRangePolicy === "reject") {
      throw new Error(
        `relative aerodynamic database query is outside table bounds: Mach ${input.mach}, axial ${input.axialSeparationBodyDiameters}, lateral ${input.lateralSeparationBodyDiameters}`,
      );
    }
    const applicability: RelativeAeroDatabaseApplicabilityIssue[] = [];
    const addIssue = (
      bracket: AxisBracket,
      belowCode: RelativeAeroDatabaseApplicabilityIssue["code"],
      aboveCode: RelativeAeroDatabaseApplicabilityIssue["code"],
      label: string,
    ) => {
      if (bracket.range === "inside") return;
      applicability.push({
        code: bracket.range === "below" ? belowCode : aboveCode,
        severity: "unsupported",
        explanation: `${label} query was outside the database and was clamped to ${bracket.evaluatedValue}.`,
      });
    };
    addIssue(
      mach,
      "MACH_BELOW_DATABASE",
      "MACH_ABOVE_DATABASE",
      "Mach",
    );
    addIssue(
      axial,
      "AXIAL_SEPARATION_BELOW_DATABASE",
      "AXIAL_SEPARATION_ABOVE_DATABASE",
      "Axial separation",
    );
    addIssue(
      lateral,
      "LATERAL_SEPARATION_BELOW_DATABASE",
      "LATERAL_SEPARATION_ABOVE_DATABASE",
      "Lateral separation",
    );
    const evaluateGrid = (
      channel: GridChannel,
    ): number | null => {
      const grid = definition[channel];
      return grid === undefined ? null : trilinear(grid.values, lateral, axial, mach);
    };
    const evaluateUncertainty = (
      channel: GridChannel,
    ): number | null => {
      const grid = definition[channel];
      return grid?.absoluteUncertainty === undefined
        ? null
        : trilinear(grid.absoluteUncertainty, lateral, axial, mach);
    };
    return {
      modelVersion: RELATIVE_AERO_DATABASE_MODEL_VERSION,
      validationStatus: definition.provenance.validationStatus,
      requestedMach: input.mach,
      requestedAxialSeparationBodyDiameters: input.axialSeparationBodyDiameters,
      requestedLateralSeparationBodyDiameters: input.lateralSeparationBodyDiameters,
      evaluatedMach: mach.evaluatedValue,
      evaluatedAxialSeparationBodyDiameters: axial.evaluatedValue,
      evaluatedLateralSeparationBodyDiameters: lateral.evaluatedValue,
      coefficients: {
        axialForceCoefficientDelta: evaluateGrid("axialForceCoefficientDelta")!,
        normalForceCoefficientDelta: evaluateGrid("normalForceCoefficientDelta"),
        sideForceCoefficientDelta: evaluateGrid("sideForceCoefficientDelta"),
        rollMomentCoefficientDelta: evaluateGrid("rollMomentCoefficientDelta"),
        pitchMomentCoefficientDelta: evaluateGrid("pitchMomentCoefficientDelta"),
        yawMomentCoefficientDelta: evaluateGrid("yawMomentCoefficientDelta"),
      },
      uncertainty: {
        axialForceCoefficientDelta: evaluateUncertainty("axialForceCoefficientDelta") ?? 0,
        normalForceCoefficientDelta: evaluateUncertainty("normalForceCoefficientDelta"),
        sideForceCoefficientDelta: evaluateUncertainty("sideForceCoefficientDelta"),
        rollMomentCoefficientDelta: evaluateUncertainty("rollMomentCoefficientDelta"),
        pitchMomentCoefficientDelta: evaluateUncertainty("pitchMomentCoefficientDelta"),
        yawMomentCoefficientDelta: evaluateUncertainty("yawMomentCoefficientDelta"),
      },
      applicability,
      provenance: definition.provenance,
    };
  };
  const assumptions = [
    "The table is ordered lateral separation × axial separation × Mach and uses trilinear interpolation between supplied cells.",
    "Axial separation is positive downstream along the source air-relative velocity; lateral separation is a non-negative flow-normal magnitude, both normalized by source equivalent diameter.",
    "Coefficient deltas are source-declared differences from an isolated-body reference; reference area and moment length are caller/table conventions and require independent sign and units review.",
    "Absolute uncertainty cells are interpolated for inspection only; this model does not sample covariance, time correlation, or a joint distribution.",
    "The database model is a post-processing component contract and never adds forces or moments to a trajectory.",
  ];
  const warnings = [
    "Relative-body aerodynamic data are source-declared and unvalidated; no CFD, wind-tunnel, flight-test, or licensing claim is inferred.",
    outOfRangePolicy === "reject"
      ? "Queries outside the supplied Mach/separation domain are rejected."
      : "Queries outside the supplied Mach/separation domain clamp to the nearest boundary with an unsupported applicability issue.",
  ];
  return {
    modelVersion: RELATIVE_AERO_DATABASE_MODEL_VERSION,
    validationStatus: definition.provenance.validationStatus,
    id: definition.id,
    name: definition.name,
    machRange: [definition.machPoints[0]!, definition.machPoints.at(-1)!],
    axialSeparationRangeBodyDiameters: [
      definition.axialSeparationPointsBodyDiameters[0]!,
      definition.axialSeparationPointsBodyDiameters.at(-1)!,
    ],
    lateralSeparationRangeBodyDiameters: [
      definition.lateralSeparationPointsBodyDiameters[0]!,
      definition.lateralSeparationPointsBodyDiameters.at(-1)!,
    ],
    availableChannels: definedChannels,
    referenceAreaM2: definition.referenceAreaM2 ?? null,
    momentReferenceLengthM: definition.momentReferenceLengthM ?? null,
    provenance: definition.provenance,
    evaluate,
    assumptions,
    warnings,
  };
}
