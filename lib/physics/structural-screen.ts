import type {
  AxisymmetricComponent,
  FinSetComponent,
} from "./vehicle-components.ts";
import type { AtmosphereState } from "./atmosphere.ts";
import {
  computeFinFlutterScreen,
  type FinFlutterResult,
} from "./fin-flutter.ts";

export const STRUCTURAL_SCREEN_MODEL_VERSION = "kestrel-structural-screen-0.1.0";
export const STRUCTURAL_SCREEN_VALIDATION_STATUS =
  "analytical-component-checks-only" as const;

export type StructuralCheckStatus = "pass" | "review" | "unavailable";

export type StructuralMaterialModel = Readonly<{
  label: string;
  youngsModulusPa: number;
  poissonRatio?: number;
  allowableCompressionPa: number;
  allowableBendingPa: number;
  allowableShearPa: number;
}>;

export type StructuralCheck = Readonly<{
  id: string;
  label: string;
  status: StructuralCheckStatus;
  demand: number | null;
  capacity: number | null;
  factorOfSafety: number | null;
  unit: string;
  detail: string;
}>;

export type StructuralScreenInput = Readonly<{
  body: AxisymmetricComponent;
  fins?: FinSetComponent | null;
  totalMassKg: number;
  peakThrustN: number;
  maxDynamicPressurePa?: number | null;
  maxAirspeedMps?: number | null;
  flutterAtmosphere?: Pick<AtmosphereState, "pressurePa" | "speedOfSoundMps"> | null;
  flutterSafetyFactor?: number;
  staticMarginCalibers?: number | null;
  material: StructuralMaterialModel;
  flightResultCurrent?: boolean;
  gravityMps2?: number;
  effectiveLengthFactor?: number;
  designNormalForceCoefficient?: number;
  requiredFactorOfSafety?: number;
}>;

export type StructuralScreenResult = Readonly<{
  modelVersion: string;
  validationStatus: typeof STRUCTURAL_SCREEN_VALIDATION_STATUS;
  overallStatus: StructuralCheckStatus;
  material: StructuralMaterialModel;
  geometry: Readonly<{
    bodyLengthM: number;
    minimumOuterDiameterM: number;
    wallThicknessM: number;
    minimumSectionAreaM2: number;
    minimumSecondMomentM4: number;
    slendernessRatio: number;
    finPlanformAreaM2: number | null;
  }>;
  loads: Readonly<{
    peakThrustN: number;
    weightN: number;
    axialCompressionN: number;
    dynamicPressurePa: number | null;
    designNormalForceCoefficient: number;
    requiredFactorOfSafety: number;
  }>;
  finFlutter: FinFlutterResult | null;
  checks: Readonly<{
    axialStress: StructuralCheck;
    eulerBuckling: StructuralCheck;
    finBending: StructuralCheck;
    finShear: StructuralCheck;
    finFlutter: StructuralCheck;
    staticMargin: StructuralCheck;
  }>;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

type BodySection = Readonly<{
  outerRadiusM: number;
  areaM2: number;
  secondMomentM4: number;
}>;

const DEFAULT_GRAVITY_MPS2 = 9.80665;
const DEFAULT_EFFECTIVE_LENGTH_FACTOR = 1;
const DEFAULT_NORMAL_FORCE_COEFFICIENT = 0.8;
const DEFAULT_REQUIRED_FACTOR_OF_SAFETY = 1.5;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (!(value > 0)) throw new Error(`${label} must be positive`);
}

function statusForFactor(
  factorOfSafety: number | null,
  requiredFactorOfSafety: number,
): StructuralCheckStatus {
  if (factorOfSafety === null || !Number.isFinite(factorOfSafety)) {
    return "unavailable";
  }
  return factorOfSafety >= requiredFactorOfSafety ? "pass" : "review";
}

function makeFactorCheck({
  id,
  label,
  demand,
  capacity,
  unit,
  requiredFactorOfSafety,
  detail,
}: Readonly<{
  id: string;
  label: string;
  demand: number | null;
  capacity: number | null;
  unit: string;
  requiredFactorOfSafety: number;
  detail: string;
}>): StructuralCheck {
  const factorOfSafety =
    demand !== null && capacity !== null && demand > 0
      ? capacity / demand
      : null;
  return {
    id,
    label,
    status: statusForFactor(factorOfSafety, requiredFactorOfSafety),
    demand,
    capacity,
    factorOfSafety,
    unit,
    detail,
  };
}

function unavailableCheck(
  id: string,
  label: string,
  unit: string,
  detail: string,
): StructuralCheck {
  return {
    id,
    label,
    status: "unavailable",
    demand: null,
    capacity: null,
    factorOfSafety: null,
    unit,
    detail,
  };
}

function sectionAtStation(
  outerRadiusM: number,
  wallThicknessM: number,
): BodySection {
  assertPositive(outerRadiusM, "body outer radius");
  const innerRadiusM = outerRadiusM - wallThicknessM;
  if (!(innerRadiusM > 0)) {
    throw new Error("body wall thickness must be smaller than the outer radius");
  }
  return {
    outerRadiusM,
    areaM2: Math.PI * (outerRadiusM ** 2 - innerRadiusM ** 2),
    secondMomentM4: (Math.PI / 4) * (outerRadiusM ** 4 - innerRadiusM ** 4),
  };
}

export function computeStructuralScreen(
  input: StructuralScreenInput,
): StructuralScreenResult {
  const body = input.body;
  if (body.kind !== "axisymmetric") {
    throw new Error("structural screen body must be axisymmetric");
  }
  if (body.stations.length < 2) {
    throw new Error("structural screen body needs at least two stations");
  }
  assertPositive(input.totalMassKg, "structural screen mass");
  assertFinite(input.peakThrustN, "structural screen peak thrust");
  if (input.peakThrustN < 0) throw new Error("structural screen peak thrust cannot be negative");
  assertPositive(input.material.youngsModulusPa, "material Young's modulus");
  assertPositive(input.material.allowableCompressionPa, "material compression allowable");
  assertPositive(input.material.allowableBendingPa, "material bending allowable");
  assertPositive(input.material.allowableShearPa, "material shear allowable");

  const wallThicknessM = body.wallThicknessM;
  if (wallThicknessM === undefined) {
    throw new Error("structural screen requires an explicit body wall thickness");
  }
  assertPositive(wallThicknessM, "body wall thickness");

  const gravityMps2 = input.gravityMps2 ?? DEFAULT_GRAVITY_MPS2;
  const effectiveLengthFactor = input.effectiveLengthFactor ?? DEFAULT_EFFECTIVE_LENGTH_FACTOR;
  const designNormalForceCoefficient =
    input.designNormalForceCoefficient ?? DEFAULT_NORMAL_FORCE_COEFFICIENT;
  const requiredFactorOfSafety =
    input.requiredFactorOfSafety ?? DEFAULT_REQUIRED_FACTOR_OF_SAFETY;
  assertPositive(gravityMps2, "gravity");
  assertPositive(effectiveLengthFactor, "effective length factor");
  assertPositive(designNormalForceCoefficient, "design normal-force coefficient");
  assertPositive(requiredFactorOfSafety, "required factor of safety");

  const sections = body.stations.map((station) =>
    sectionAtStation(station.outerRadiusM, wallThicknessM),
  );
  const minimumSection = sections.reduce((minimum, section) =>
    section.areaM2 < minimum.areaM2 ? section : minimum,
  );
  const minimumSecondMoment = sections.reduce((minimum, section) =>
    section.secondMomentM4 < minimum.secondMomentM4 ? section : minimum,
  );
  const bodyLengthM =
    body.stations[body.stations.length - 1].xM - body.stations[0].xM;
  assertPositive(bodyLengthM, "body structural length");

  const weightN = input.totalMassKg * gravityMps2;
  const axialCompressionN = input.peakThrustN + weightN;
  const axialStressPa = axialCompressionN / minimumSection.areaM2;
  const eulerCriticalLoadN =
    (Math.PI ** 2 * input.material.youngsModulusPa * minimumSecondMoment.secondMomentM4) /
    (effectiveLengthFactor * bodyLengthM) ** 2;
  const radiusOfGyrationM = Math.sqrt(
    minimumSecondMoment.secondMomentM4 / minimumSection.areaM2,
  );
  const slendernessRatio = (effectiveLengthFactor * bodyLengthM) / radiusOfGyrationM;

  const axialStress = makeFactorCheck({
    id: "axial-stress",
    label: "Axial compression stress",
    demand: axialStressPa,
    capacity: input.material.allowableCompressionPa,
    unit: "Pa",
    requiredFactorOfSafety,
    detail: "Peak thrust plus vehicle weight divided by the weakest modeled airframe shell area.",
  });
  const eulerBuckling = makeFactorCheck({
    id: "euler-buckling",
    label: "Euler column buckling",
    demand: axialCompressionN,
    capacity: eulerCriticalLoadN,
    unit: "N",
    requiredFactorOfSafety,
    detail: `Pinned-column proxy with K=${effectiveLengthFactor.toFixed(2)}; local shell buckling and joints are omitted.`,
  });

  const dynamicPressurePa =
    input.maxDynamicPressurePa === null || input.maxDynamicPressurePa === undefined
      ? null
      : input.maxDynamicPressurePa;
  if (dynamicPressurePa !== null) {
    assertFinite(dynamicPressurePa, "maximum dynamic pressure");
    if (dynamicPressurePa < 0) throw new Error("maximum dynamic pressure cannot be negative");
  }
  const maxAirspeedMps =
    input.maxAirspeedMps === null || input.maxAirspeedMps === undefined
      ? null
      : input.maxAirspeedMps;
  if (maxAirspeedMps !== null) {
    assertFinite(maxAirspeedMps, "maximum airspeed");
    if (maxAirspeedMps < 0) throw new Error("maximum airspeed cannot be negative");
  }

  const finPlanformAreaM2 = input.fins
    ? 0.5 * (input.fins.rootChordM + input.fins.tipChordM) * input.fins.spanM
    : null;
  if (input.fins) {
    assertPositive(input.fins.count, "fin count");
    if (!Number.isInteger(input.fins.count)) throw new Error("fin count must be an integer");
    assertPositive(input.fins.rootChordM, "fin root chord");
    assertPositive(input.fins.tipChordM, "fin tip chord");
    assertPositive(input.fins.spanM, "fin span");
    assertPositive(input.fins.thicknessM, "fin thickness");
    assertFinite(input.fins.sweepM, "fin sweep");
    if (input.fins.sweepM < 0) throw new Error("fin sweep cannot be negative");
  }
  let finBending: StructuralCheck;
  let finShear: StructuralCheck;
  let finFlutter: StructuralCheck;
  let finFlutterResult: FinFlutterResult | null = null;
  const warnings: string[] = [
    "This is an analytical component screen, not structural certification or flight-safety evidence.",
    "Airframe buckling uses the weakest modeled circular shell section, pinned end conditions, and the selected material's representative allowables.",
    "Fin loads use an equal-load, uniform-span proxy at the supplied peak dynamic pressure; attachment, adhesive, body-fin coupling, skin, vibration, and manufacturing effects are omitted.",
  ];

  if (!input.fins) {
    finBending = unavailableCheck(
      "fin-bending",
      "Fin-root bending",
      "Pa",
      "No fin-set component is available for this configuration.",
    );
    finShear = unavailableCheck(
      "fin-shear",
      "Fin-root shear",
      "Pa",
      "No fin-set component is available for this configuration.",
    );
    finFlutter = unavailableCheck(
      "fin-flutter",
      "Fin flutter margin",
      "m/s",
      "No fin-set component is available for this configuration.",
    );
    warnings.push("Fin-root checks are unavailable until a fin-set component is supplied.");
  } else if (dynamicPressurePa === null || !(dynamicPressurePa > 0)) {
    finBending = unavailableCheck(
      "fin-bending",
      "Fin-root bending",
      "Pa",
      "Run the vertical estimate to provide a positive peak dynamic pressure.",
    );
    finShear = unavailableCheck(
      "fin-shear",
      "Fin-root shear",
      "Pa",
      "Run the vertical estimate to provide a positive peak dynamic pressure.",
    );
    finFlutterResult = computeFinFlutterScreen({
      fins: input.fins,
      material: input.material,
      maxAirspeedMps,
      atmosphere: input.flutterAtmosphere,
      safetyFactor: input.flutterSafetyFactor,
    });
    finFlutter = {
      id: "fin-flutter",
      label: "Fin flutter margin",
      status: finFlutterResult.status,
      demand: finFlutterResult.conditions.maxAirspeedMps,
      capacity: finFlutterResult.predictedFlutterSpeedMps,
      factorOfSafety: finFlutterResult.factorOfSafety,
      unit: "m/s",
      detail: finFlutterResult.warnings[0] ?? "Preliminary flutter screen.",
    };
    warnings.push("Fin-root checks are unavailable because no positive peak dynamic pressure is loaded.");
  } else {
    const forcePerFinN =
      (dynamicPressurePa * (finPlanformAreaM2 ?? 0) * designNormalForceCoefficient) /
      input.fins.count;
    const rootMomentNm = forcePerFinN * input.fins.spanM * 0.5;
    const rootSectionModulusM3 =
      (input.fins.rootChordM * input.fins.thicknessM ** 2) / 6;
    const rootShearAreaM2 = input.fins.rootChordM * input.fins.thicknessM;
    assertPositive(rootSectionModulusM3, "fin root section modulus");
    assertPositive(rootShearAreaM2, "fin root shear area");
    finBending = makeFactorCheck({
      id: "fin-bending",
      label: "Fin-root bending stress",
      demand: rootMomentNm / rootSectionModulusM3,
      capacity: input.material.allowableBendingPa,
      unit: "Pa",
      requiredFactorOfSafety,
      detail: `Per-fin force ${forcePerFinN.toFixed(2)} N; uniform-span root moment proxy.`,
    });
    finShear = makeFactorCheck({
      id: "fin-shear",
      label: "Fin-root shear stress",
      demand: forcePerFinN / rootShearAreaM2,
      capacity: input.material.allowableShearPa,
      unit: "Pa",
      requiredFactorOfSafety,
      detail: "Per-fin force divided by the rectangular root attachment area.",
    });
    if (input.flightResultCurrent === false) {
      warnings.push("Peak dynamic pressure comes from a stale flight result; rerun the estimate before relying on fin-load trends.");
    }
    finFlutterResult = computeFinFlutterScreen({
      fins: input.fins,
      material: input.material,
      maxAirspeedMps,
      atmosphere: input.flutterAtmosphere,
      safetyFactor: input.flutterSafetyFactor,
    });
    finFlutter = {
      id: "fin-flutter",
      label: "Fin flutter margin",
      status: finFlutterResult.status,
      demand: finFlutterResult.conditions.maxAirspeedMps,
      capacity: finFlutterResult.predictedFlutterSpeedMps,
      factorOfSafety: finFlutterResult.factorOfSafety,
      unit: "m/s",
      detail: finFlutterResult.warnings[0] ?? "Preliminary flutter screen.",
    };
  }

  if (finFlutterResult) {
    warnings.push(...finFlutterResult.warnings.map((warning) => `Fin flutter: ${warning}`));
  }

  const staticMargin =
    input.staticMarginCalibers === null || input.staticMarginCalibers === undefined
      ? unavailableCheck(
          "static-margin",
          "Static margin review",
          "cal",
          "Static margin was not supplied by the low-speed aerodynamic model.",
        )
      : makeFactorCheck({
          id: "static-margin",
          label: "Static margin review",
          demand: 1,
          capacity: input.staticMarginCalibers,
          unit: "cal",
          requiredFactorOfSafety: 1,
          detail: "Review threshold is 1.0 calibre; damping and dynamic stability are not modeled.",
        });
  if (staticMargin.status === "review") {
    warnings.push("Static margin is below the 1.0-calibre review threshold in the low-speed model.");
  }

  const requiredChecks = [
    axialStress,
    eulerBuckling,
    finBending,
    finShear,
    ...(maxAirspeedMps !== null ? [finFlutter] : []),
  ];
  const overallStatus: StructuralCheckStatus =
    requiredChecks.some((check) => check.status === "unavailable")
      ? "review"
      : requiredChecks.some((check) => check.status === "review") || staticMargin.status === "review"
        ? "review"
        : "pass";
  if (input.flightResultCurrent === false && dynamicPressurePa !== null) {
    warnings.push("The structural screen is using an existing flight result that no longer matches the current editable inputs.");
  }

  return {
    modelVersion: STRUCTURAL_SCREEN_MODEL_VERSION,
    validationStatus: STRUCTURAL_SCREEN_VALIDATION_STATUS,
    overallStatus,
    material: input.material,
    geometry: {
      bodyLengthM,
      minimumOuterDiameterM: Math.min(...body.stations.map((station) => station.outerRadiusM * 2)),
      wallThicknessM,
      minimumSectionAreaM2: minimumSection.areaM2,
      minimumSecondMomentM4: minimumSecondMoment.secondMomentM4,
      slendernessRatio,
      finPlanformAreaM2,
    },
    loads: {
      peakThrustN: input.peakThrustN,
      weightN,
      axialCompressionN,
      dynamicPressurePa,
      designNormalForceCoefficient,
      requiredFactorOfSafety,
    },
    finFlutter: finFlutterResult,
    checks: { axialStress, eulerBuckling, finBending, finShear, finFlutter, staticMargin },
    assumptions: [
      "Axial compression demand is peak thrust plus full-vehicle weight, with no thrust eccentricity or transient amplification.",
      `Euler buckling uses effective length factor K=${effectiveLengthFactor.toFixed(2)} and the weakest station section.`,
      `Fin loads use a representative normal-force coefficient of ${designNormalForceCoefficient.toFixed(2)} and equal sharing across the fin count.`,
      `A factor of safety of ${requiredFactorOfSafety.toFixed(2)} is the screen review target, not a project requirement or material certification value.`,
      ...(finFlutterResult?.assumptions ?? []),
    ],
    warnings,
  };
}
