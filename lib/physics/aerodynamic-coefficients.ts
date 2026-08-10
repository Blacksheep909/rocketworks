import type { Vector3 } from "./linear-algebra.ts";

export const AERODYNAMIC_COEFFICIENT_TABLE_MODEL_VERSION =
  "kestrel-aero-coefficient-table-0.1.0";
export const AERODYNAMIC_ANGLE_TABLE_MODEL_VERSION =
  "rocketworks-aero-angle-table-0.1.0";

export type AerodynamicDataProvenance = Readonly<{
  sourceName: string;
  sourceKind:
    | "wind-tunnel"
    | "cfd"
    | "flight-test"
    | "published-analysis"
    | "user-supplied";
  dataVersion: string;
  licenseIdentifier: string;
  sourceUrl?: string;
  attribution?: string;
  validationStatus:
    | "user-supplied-unvalidated"
    | "published-data-unverified"
    | "independently-benchmarked";
}>;

export type CoefficientSurface = Readonly<{
  values: readonly (readonly number[])[];
  absoluteUncertainty?: readonly (readonly number[])[];
}>;

/**
 * Four-dimensional coefficient data ordered as sideslip, angle of attack,
 * Reynolds number, then Mach number. The legacy two-dimensional surfaces
 * remain valid and are used for any coefficient that has no angular volume.
 */
export type CoefficientVolume = Readonly<{
  values: readonly (readonly (readonly (readonly number[])[])[])[];
  absoluteUncertainty?: readonly (readonly (readonly (readonly number[])[])[])[];
}>;

export type AerodynamicCoefficientTableDefinition = Readonly<{
  id: string;
  name: string;
  machPoints: readonly number[];
  reynoldsPoints: readonly number[];
  dragCoefficient: CoefficientSurface;
  normalForceSlopePerRad: CoefficientSurface;
  centerOfPressureXM: CoefficientSurface;
  angleOfAttackPointsRad?: readonly number[];
  sideslipPointsRad?: readonly number[];
  dragCoefficientByAngle?: CoefficientVolume;
  normalForceSlopePerRadByAngle?: CoefficientVolume;
  centerOfPressureXMByAngle?: CoefficientVolume;
  dampingDerivativeBody?: Readonly<{
    roll: CoefficientSurface;
    pitch: CoefficientSurface;
    yaw: CoefficientSurface;
  }>;
  dampingDerivativeBodyByAngle?: Readonly<{
    roll: CoefficientVolume;
    pitch: CoefficientVolume;
    yaw: CoefficientVolume;
  }>;
  outOfRangePolicy?: "reject" | "clamp-with-warning";
  provenance: AerodynamicDataProvenance;
}>;

export type AerodynamicCoefficientApplicabilityIssue = Readonly<{
  code:
    | "MACH_BELOW_TABLE"
    | "MACH_ABOVE_TABLE"
    | "REYNOLDS_BELOW_TABLE"
    | "REYNOLDS_ABOVE_TABLE"
    | "ANGLE_OF_ATTACK_BELOW_TABLE"
    | "ANGLE_OF_ATTACK_ABOVE_TABLE"
    | "SIDESLIP_BELOW_TABLE"
    | "SIDESLIP_ABOVE_TABLE"
    | "COEFFICIENT_UNCERTAINTY_PRESENT";
  severity: "info" | "caution" | "unsupported";
  explanation: string;
}>;

export type AerodynamicCoefficientUncertainty = Readonly<{
  dragCoefficient: number;
  normalForceSlopePerRad: number;
  centerOfPressureXM: number;
  dampingDerivativeBody: Vector3 | null;
}>;

export type AerodynamicCoefficientEvaluation = Readonly<{
  modelVersion: string;
  validationStatus: AerodynamicDataProvenance["validationStatus"];
  requestedMach: number;
  requestedReynoldsNumber: number;
  requestedAngleOfAttackRad: number;
  requestedSideslipRad: number;
  evaluatedMach: number;
  evaluatedReynoldsNumber: number;
  evaluatedAngleOfAttackRad: number | null;
  evaluatedSideslipRad: number | null;
  dragCoefficient: number;
  normalForceSlopePerRad: number;
  centerOfPressureXM: number;
  dampingDerivativeBody: Vector3 | null;
  uncertainty: AerodynamicCoefficientUncertainty;
  applicability: readonly AerodynamicCoefficientApplicabilityIssue[];
  provenance: AerodynamicDataProvenance;
}>;

export type AerodynamicCoefficientTableModel = Readonly<{
  modelVersion: string;
  validationStatus: AerodynamicDataProvenance["validationStatus"];
  id: string;
  name: string;
  machRange: readonly [number, number];
  reynoldsRange: readonly [number, number];
  angleOfAttackRangeRad: readonly [number, number] | null;
  sideslipRangeRad: readonly [number, number] | null;
  provenance: AerodynamicDataProvenance;
  evaluate: (input: Readonly<{
    mach: number;
    reynoldsNumber: number;
    angleOfAttackRad?: number;
    sideslipRad?: number;
  }>) => AerodynamicCoefficientEvaluation;
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

function validateIdentifier(id: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(
      "aerodynamic table identifiers may contain only letters, numbers, underscores, and hyphens",
    );
  }
}

function validateAxis(
  values: readonly number[],
  label: string,
  allowZero: boolean,
): void {
  if (values.length === 0) throw new Error(`${label} axis cannot be empty`);
  values.forEach((value, index) => {
    if (
      !Number.isFinite(value) ||
      (allowZero ? value < 0 : value <= 0) ||
      (index > 0 && value <= values[index - 1])
    ) {
      throw new Error(
        `${label} axis must contain strictly increasing ${allowZero ? "non-negative" : "positive"} finite values`,
      );
    }
  });
}

function validateSignedAxis(values: readonly number[], label: string): void {
  if (values.length === 0) throw new Error(`${label} axis cannot be empty`);
  values.forEach((value, index) => {
    if (
      !Number.isFinite(value) ||
      (index > 0 && value <= values[index - 1])
    ) {
      throw new Error(
        `${label} axis must contain strictly increasing finite values`,
      );
    }
  });
}

function validateGrid(
  grid: readonly (readonly number[])[],
  reynoldsCount: number,
  machCount: number,
  label: string,
  predicate: (value: number) => boolean,
): void {
  if (
    grid.length !== reynoldsCount ||
    grid.some((row) => row.length !== machCount)
  ) {
    throw new Error(
      `${label} grid must have one row per Reynolds point and one column per Mach point`,
    );
  }
  if (grid.some((row) => row.some((value) => !Number.isFinite(value) || !predicate(value)))) {
    throw new Error(`${label} grid contains an invalid value`);
  }
}

function validateSurface(
  surface: CoefficientSurface,
  reynoldsCount: number,
  machCount: number,
  label: string,
  predicate: (value: number) => boolean,
): void {
  validateGrid(surface.values, reynoldsCount, machCount, label, predicate);
  if (surface.absoluteUncertainty) {
    validateGrid(
      surface.absoluteUncertainty,
      reynoldsCount,
      machCount,
      `${label} uncertainty`,
      (value) => value >= 0,
    );
  }
}

function validateVolume(
  volume: CoefficientVolume,
  sideslipCount: number,
  angleOfAttackCount: number,
  reynoldsCount: number,
  machCount: number,
  label: string,
  predicate: (value: number) => boolean,
): void {
  const shapeMatches =
    volume.values.length === sideslipCount &&
    volume.values.every(
      (sideslipLayer) =>
        sideslipLayer.length === angleOfAttackCount &&
        sideslipLayer.every(
          (angleLayer) =>
            angleLayer.length === reynoldsCount &&
            angleLayer.every((row) => row.length === machCount),
        ),
    );
  if (!shapeMatches) {
    throw new Error(
      `${label} volume must be ordered sideslip × angle of attack × Reynolds × Mach`,
    );
  }
  if (
    volume.values.some((sideslipLayer) =>
      sideslipLayer.some((angleLayer) =>
        angleLayer.some((row) =>
          row.some((value) => !Number.isFinite(value) || !predicate(value)),
        ),
      ),
    )
  ) {
    throw new Error(`${label} volume contains an invalid value`);
  }
  if (volume.absoluteUncertainty) {
    const uncertaintyShapeMatches =
      volume.absoluteUncertainty.length === sideslipCount &&
      volume.absoluteUncertainty.every(
        (sideslipLayer) =>
          sideslipLayer.length === angleOfAttackCount &&
          sideslipLayer.every(
            (angleLayer) =>
              angleLayer.length === reynoldsCount &&
              angleLayer.every((row) => row.length === machCount),
          ),
      );
    if (!uncertaintyShapeMatches) {
      throw new Error(
        `${label} uncertainty volume must be ordered sideslip × angle of attack × Reynolds × Mach`,
      );
    }
    if (
      volume.absoluteUncertainty.some((sideslipLayer) =>
        sideslipLayer.some((angleLayer) =>
          angleLayer.some((row) =>
            row.some((value) => !Number.isFinite(value) || value < 0),
          ),
        ),
      )
    ) {
      throw new Error(`${label} uncertainty volume contains an invalid value`);
    }
  }
}

function validateProvenance(provenance: AerodynamicDataProvenance): void {
  if (
    !provenance.sourceName.trim() ||
    !provenance.dataVersion.trim() ||
    !provenance.licenseIdentifier.trim()
  ) {
    throw new Error(
      "aerodynamic table provenance requires source name, data version, and license identifier",
    );
  }
  if (
    ![
      "wind-tunnel",
      "cfd",
      "flight-test",
      "published-analysis",
      "user-supplied",
    ].includes(provenance.sourceKind)
  ) {
    throw new Error("aerodynamic table provenance has an invalid source kind");
  }
  if (
    ![
      "user-supplied-unvalidated",
      "published-data-unverified",
      "independently-benchmarked",
    ].includes(provenance.validationStatus)
  ) {
    throw new Error("aerodynamic table provenance has an invalid validation status");
  }
  if (provenance.sourceUrl) {
    let parsed: URL;
    try {
      parsed = new URL(provenance.sourceUrl);
    } catch {
      throw new Error("aerodynamic table provenance source URL must be valid");
    }
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new Error("aerodynamic table provenance source URL must use HTTP or HTTPS");
    }
  }
}

function bracketAxis(
  axis: readonly number[],
  requestedValue: number,
  logarithmic: boolean,
): AxisBracket {
  if (requestedValue < axis[0]) {
    return {
      lowerIndex: 0,
      upperIndex: 0,
      fraction: 0,
      evaluatedValue: axis[0],
      range: "below",
    };
  }
  if (requestedValue > axis.at(-1)!) {
    const index = axis.length - 1;
    return {
      lowerIndex: index,
      upperIndex: index,
      fraction: 0,
      evaluatedValue: axis[index],
      range: "above",
    };
  }
  if (axis.length === 1 || requestedValue === axis[0]) {
    return {
      lowerIndex: 0,
      upperIndex: 0,
      fraction: 0,
      evaluatedValue: axis[0],
      range: "inside",
    };
  }
  for (let upperIndex = 1; upperIndex < axis.length; upperIndex += 1) {
    if (requestedValue <= axis[upperIndex]) {
      const lowerIndex = upperIndex - 1;
      const transform = logarithmic ? Math.log10 : (value: number) => value;
      const lower = transform(axis[lowerIndex]);
      const upper = transform(axis[upperIndex]);
      const requested = transform(requestedValue);
      return {
        lowerIndex,
        upperIndex,
        fraction: (requested - lower) / (upper - lower),
        evaluatedValue: requestedValue,
        range: "inside",
      };
    }
  }
  throw new Error("aerodynamic table axis bracketing failed");
}

function interpolateGrid(
  grid: readonly (readonly number[])[],
  mach: AxisBracket,
  reynolds: AxisBracket,
): number {
  const lowerReynoldsValue =
    grid[reynolds.lowerIndex][mach.lowerIndex] * (1 - mach.fraction) +
    grid[reynolds.lowerIndex][mach.upperIndex] * mach.fraction;
  const upperReynoldsValue =
    grid[reynolds.upperIndex][mach.lowerIndex] * (1 - mach.fraction) +
    grid[reynolds.upperIndex][mach.upperIndex] * mach.fraction;
  return (
    lowerReynoldsValue * (1 - reynolds.fraction) +
    upperReynoldsValue * reynolds.fraction
  );
}

function interpolateVolume(
  volume: CoefficientVolume["values"],
  angleOfAttack: AxisBracket,
  sideslip: AxisBracket,
  mach: AxisBracket,
  reynolds: AxisBracket,
): number {
  const atAngle = (sideslipIndex: number, angleIndex: number) =>
    interpolateGrid(volume[sideslipIndex][angleIndex], mach, reynolds);
  const lowerSideslip =
    atAngle(sideslip.lowerIndex, angleOfAttack.lowerIndex) *
      (1 - angleOfAttack.fraction) +
    atAngle(sideslip.lowerIndex, angleOfAttack.upperIndex) *
      angleOfAttack.fraction;
  const upperSideslip =
    atAngle(sideslip.upperIndex, angleOfAttack.lowerIndex) *
      (1 - angleOfAttack.fraction) +
    atAngle(sideslip.upperIndex, angleOfAttack.upperIndex) *
      angleOfAttack.fraction;
  return (
    lowerSideslip * (1 - sideslip.fraction) +
    upperSideslip * sideslip.fraction
  );
}

export function createAerodynamicCoefficientTable(
  definition: AerodynamicCoefficientTableDefinition,
): AerodynamicCoefficientTableModel {
  validateIdentifier(definition.id);
  if (!definition.name.trim()) throw new Error("aerodynamic tables must have names");
  validateAxis(definition.machPoints, "Mach", true);
  validateAxis(definition.reynoldsPoints, "Reynolds", false);
  validateProvenance(definition.provenance);
  const reynoldsCount = definition.reynoldsPoints.length;
  const machCount = definition.machPoints.length;
  validateSurface(
    definition.dragCoefficient,
    reynoldsCount,
    machCount,
    "drag coefficient",
    (value) => value > 0,
  );
  validateSurface(
    definition.normalForceSlopePerRad,
    reynoldsCount,
    machCount,
    "normal-force slope",
    (value) => value > 0,
  );
  validateSurface(
    definition.centerOfPressureXM,
    reynoldsCount,
    machCount,
    "center of pressure",
    () => true,
  );
  const hasAngularCoefficientVolume = [
    definition.dragCoefficientByAngle,
    definition.normalForceSlopePerRadByAngle,
    definition.centerOfPressureXMByAngle,
    definition.dampingDerivativeBodyByAngle?.roll,
    definition.dampingDerivativeBodyByAngle?.pitch,
    definition.dampingDerivativeBodyByAngle?.yaw,
  ].some((surface) => surface !== undefined);
  const hasAngularAxes =
    definition.angleOfAttackPointsRad !== undefined ||
    definition.sideslipPointsRad !== undefined;
  if (hasAngularCoefficientVolume !== hasAngularAxes) {
    throw new Error(
      "angle-of-attack and sideslip axes must be supplied together with at least one angular coefficient volume",
    );
  }
  if (hasAngularCoefficientVolume) {
    validateSignedAxis(definition.angleOfAttackPointsRad!, "angle-of-attack");
    validateSignedAxis(definition.sideslipPointsRad!, "sideslip");
    const angleOfAttackCount = definition.angleOfAttackPointsRad!.length;
    const sideslipCount = definition.sideslipPointsRad!.length;
    const validateAngular = (
      surface: CoefficientVolume | undefined,
      label: string,
      predicate: (value: number) => boolean,
    ) => {
      if (surface) {
        validateVolume(
          surface,
          sideslipCount,
          angleOfAttackCount,
          reynoldsCount,
          machCount,
          label,
          predicate,
        );
      }
    };
    validateAngular(definition.dragCoefficientByAngle, "angular drag coefficient", (value) => value > 0);
    validateAngular(definition.normalForceSlopePerRadByAngle, "angular normal-force slope", (value) => value > 0);
    validateAngular(definition.centerOfPressureXMByAngle, "angular center of pressure", () => true);
    validateAngular(definition.dampingDerivativeBodyByAngle?.roll, "angular roll damping derivative", () => true);
    validateAngular(definition.dampingDerivativeBodyByAngle?.pitch, "angular pitch damping derivative", () => true);
    validateAngular(definition.dampingDerivativeBodyByAngle?.yaw, "angular yaw damping derivative", () => true);
  }
  if (definition.dampingDerivativeBodyByAngle && !definition.dampingDerivativeBody) {
    throw new Error(
      "angular damping derivative volumes require their legacy damping surfaces",
    );
  }
  if (definition.dampingDerivativeBody) {
    validateSurface(
      definition.dampingDerivativeBody.roll,
      reynoldsCount,
      machCount,
      "roll damping derivative",
      () => true,
    );
    validateSurface(
      definition.dampingDerivativeBody.pitch,
      reynoldsCount,
      machCount,
      "pitch damping derivative",
      () => true,
    );
    validateSurface(
      definition.dampingDerivativeBody.yaw,
      reynoldsCount,
      machCount,
      "yaw damping derivative",
      () => true,
    );
  }
  const outOfRangePolicy = definition.outOfRangePolicy ?? "reject";
  if (!["reject", "clamp-with-warning"].includes(outOfRangePolicy)) {
    throw new Error("aerodynamic table out-of-range policy is invalid");
  }
  const modelVersion = hasAngularCoefficientVolume
    ? AERODYNAMIC_ANGLE_TABLE_MODEL_VERSION
    : AERODYNAMIC_COEFFICIENT_TABLE_MODEL_VERSION;

  const evaluate = (input: Readonly<{
    mach: number;
    reynoldsNumber: number;
    angleOfAttackRad?: number;
    sideslipRad?: number;
  }>): AerodynamicCoefficientEvaluation => {
    if (!Number.isFinite(input.mach) || input.mach < 0) {
      throw new Error("coefficient-table Mach query must be finite and non-negative");
    }
    if (!Number.isFinite(input.reynoldsNumber) || input.reynoldsNumber < 0) {
      throw new Error("coefficient-table Reynolds query must be finite and non-negative");
    }
    const requestedAngleOfAttackRad = input.angleOfAttackRad ?? 0;
    const requestedSideslipRad = input.sideslipRad ?? 0;
    if (!Number.isFinite(requestedAngleOfAttackRad)) {
      throw new Error("coefficient-table angle of attack query must be finite");
    }
    if (!Number.isFinite(requestedSideslipRad)) {
      throw new Error("coefficient-table sideslip query must be finite");
    }
    const mach = bracketAxis(definition.machPoints, input.mach, false);
    const reynolds = bracketAxis(
      definition.reynoldsPoints,
      input.reynoldsNumber,
      true,
    );
    const angleOfAttack = hasAngularCoefficientVolume
      ? bracketAxis(definition.angleOfAttackPointsRad!, requestedAngleOfAttackRad, false)
      : null;
    const sideslip = hasAngularCoefficientVolume
      ? bracketAxis(definition.sideslipPointsRad!, requestedSideslipRad, false)
      : null;
    const outside =
      mach.range !== "inside" ||
      reynolds.range !== "inside" ||
      (angleOfAttack?.range ?? "inside") !== "inside" ||
      (sideslip?.range ?? "inside") !== "inside";
    if (outside && outOfRangePolicy === "reject") {
      throw new Error(
        `aerodynamic coefficient query is outside table bounds: Mach ${input.mach}, Reynolds ${input.reynoldsNumber}`,
      );
    }
    const applicability: AerodynamicCoefficientApplicabilityIssue[] = [];
    if (mach.range !== "inside") {
      applicability.push({
        code: mach.range === "below" ? "MACH_BELOW_TABLE" : "MACH_ABOVE_TABLE",
        severity: "unsupported",
        explanation: `Mach ${input.mach} is outside the table and was clamped to ${mach.evaluatedValue}.`,
      });
    }
    if (reynolds.range !== "inside") {
      applicability.push({
        code:
          reynolds.range === "below"
            ? "REYNOLDS_BELOW_TABLE"
            : "REYNOLDS_ABOVE_TABLE",
        severity: "unsupported",
        explanation: `Reynolds number ${input.reynoldsNumber} is outside the table and was clamped to ${reynolds.evaluatedValue}.`,
      });
    }
    if (angleOfAttack && angleOfAttack.range !== "inside") {
      applicability.push({
        code:
          angleOfAttack.range === "below"
            ? "ANGLE_OF_ATTACK_BELOW_TABLE"
            : "ANGLE_OF_ATTACK_ABOVE_TABLE",
        severity: "unsupported",
        explanation: `Angle of attack ${requestedAngleOfAttackRad} rad is outside the table and was clamped to ${angleOfAttack.evaluatedValue}.`,
      });
    }
    if (sideslip && sideslip.range !== "inside") {
      applicability.push({
        code:
          sideslip.range === "below"
            ? "SIDESLIP_BELOW_TABLE"
            : "SIDESLIP_ABOVE_TABLE",
        severity: "unsupported",
        explanation: `Sideslip ${requestedSideslipRad} rad is outside the table and was clamped to ${sideslip.evaluatedValue}.`,
      });
    }
    const value = (
      surface: CoefficientSurface,
      angularSurface?: CoefficientVolume,
    ) =>
      angularSurface && angleOfAttack && sideslip
        ? interpolateVolume(
            angularSurface.values,
            angleOfAttack,
            sideslip,
            mach,
            reynolds,
          )
        : interpolateGrid(surface.values, mach, reynolds);
    const uncertainty = (
      surface: CoefficientSurface,
      angularSurface?: CoefficientVolume,
    ) =>
      angularSurface?.absoluteUncertainty && angleOfAttack && sideslip
        ? interpolateVolume(
            angularSurface.absoluteUncertainty,
            angleOfAttack,
            sideslip,
            mach,
            reynolds,
          )
        : surface.absoluteUncertainty
          ? interpolateGrid(surface.absoluteUncertainty, mach, reynolds)
          : 0;
    const dampingDerivativeBody = definition.dampingDerivativeBody
      ? {
          x: value(
            definition.dampingDerivativeBody.roll,
            definition.dampingDerivativeBodyByAngle?.roll,
          ),
          y: value(
            definition.dampingDerivativeBody.pitch,
            definition.dampingDerivativeBodyByAngle?.pitch,
          ),
          z: value(
            definition.dampingDerivativeBody.yaw,
            definition.dampingDerivativeBodyByAngle?.yaw,
          ),
        }
      : null;
    const dampingUncertainty = definition.dampingDerivativeBody
      ? {
          x: uncertainty(
            definition.dampingDerivativeBody.roll,
            definition.dampingDerivativeBodyByAngle?.roll,
          ),
          y: uncertainty(
            definition.dampingDerivativeBody.pitch,
            definition.dampingDerivativeBodyByAngle?.pitch,
          ),
          z: uncertainty(
            definition.dampingDerivativeBody.yaw,
            definition.dampingDerivativeBodyByAngle?.yaw,
          ),
        }
      : null;
    const coefficientUncertainty: AerodynamicCoefficientUncertainty = {
      dragCoefficient: uncertainty(
        definition.dragCoefficient,
        definition.dragCoefficientByAngle,
      ),
      normalForceSlopePerRad: uncertainty(
        definition.normalForceSlopePerRad,
        definition.normalForceSlopePerRadByAngle,
      ),
      centerOfPressureXM: uncertainty(
        definition.centerOfPressureXM,
        definition.centerOfPressureXMByAngle,
      ),
      dampingDerivativeBody: dampingUncertainty,
    };
    if (
      coefficientUncertainty.dragCoefficient > 0 ||
      coefficientUncertainty.normalForceSlopePerRad > 0 ||
      coefficientUncertainty.centerOfPressureXM > 0 ||
      (dampingUncertainty !== null &&
        [dampingUncertainty.x, dampingUncertainty.y, dampingUncertainty.z].some(
          (entry) => entry > 0,
        ))
    ) {
      applicability.push({
        code: "COEFFICIENT_UNCERTAINTY_PRESENT",
        severity: "info",
        explanation:
          "Interpolated absolute coefficient uncertainty is available for dispersion analysis.",
      });
    }
    return {
      modelVersion,
      validationStatus: definition.provenance.validationStatus,
      requestedMach: input.mach,
      requestedReynoldsNumber: input.reynoldsNumber,
      requestedAngleOfAttackRad,
      requestedSideslipRad,
      evaluatedMach: mach.evaluatedValue,
      evaluatedReynoldsNumber: reynolds.evaluatedValue,
      evaluatedAngleOfAttackRad: angleOfAttack?.evaluatedValue ?? null,
      evaluatedSideslipRad: sideslip?.evaluatedValue ?? null,
      dragCoefficient: value(
        definition.dragCoefficient,
        definition.dragCoefficientByAngle,
      ),
      normalForceSlopePerRad: value(
        definition.normalForceSlopePerRad,
        definition.normalForceSlopePerRadByAngle,
      ),
      centerOfPressureXM: value(
        definition.centerOfPressureXM,
        definition.centerOfPressureXMByAngle,
      ),
      dampingDerivativeBody,
      uncertainty: coefficientUncertainty,
      applicability,
      provenance: definition.provenance,
    };
  };

  return {
    modelVersion,
    validationStatus: definition.provenance.validationStatus,
    id: definition.id,
    name: definition.name,
    machRange: [definition.machPoints[0], definition.machPoints.at(-1)!],
    reynoldsRange: [
      definition.reynoldsPoints[0],
      definition.reynoldsPoints.at(-1)!,
    ],
    angleOfAttackRangeRad: hasAngularCoefficientVolume
      ? [
          definition.angleOfAttackPointsRad![0],
          definition.angleOfAttackPointsRad!.at(-1)!,
        ]
      : null,
    sideslipRangeRad: hasAngularCoefficientVolume
      ? [definition.sideslipPointsRad![0], definition.sideslipPointsRad!.at(-1)!]
      : null,
    provenance: definition.provenance,
    evaluate,
    assumptions: [
      "Coefficients vary bilinearly in Mach and log10 Reynolds number between supplied nodes",
      "Rows correspond to Reynolds points and columns correspond to Mach points",
      ...(hasAngularCoefficientVolume
        ? [
            "Angular coefficient volumes are ordered sideslip, angle of attack, Reynolds, then Mach",
            "Angle of attack and sideslip are linearly interpolated in radians; angular volumes fall back to their legacy 2D surface only when a volume is omitted",
          ]
        : [
            "Angle of attack and sideslip are not axes of this legacy table; the consuming low-angle model supplies its own normal-force relation",
          ]),
      "Absolute uncertainty uses the same interpolation rule as nominal coefficients",
      outOfRangePolicy === "reject"
        ? "Queries outside the tabulated domain are rejected"
        : "Queries outside the tabulated domain clamp to the nearest boundary with an unsupported warning",
    ],
    warnings: [
      "RocketWorks validates and interpolates supplied data but does not certify its aerodynamic accuracy.",
      "Interpolation cannot reconstruct shocks, transitions, hysteresis, or discontinuities absent from the supplied grid.",
      "Coefficient reference axes, areas, lengths, signs, and moment conventions must match the consuming vehicle model.",
      ...(hasAngularCoefficientVolume
        ? []
        : [
            "Angle-of-attack and sideslip dependence is absent from this table and remains outside its interpolated coefficient source.",
          ]),
    ],
  };
}
