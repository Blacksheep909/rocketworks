import type {
  AxisymmetricComponent,
  FinSetComponent,
  VehicleComponent,
} from "./vehicle-components.ts";

export const STATIC_AERODYNAMICS_MODEL_VERSION =
  "kestrel-static-aero-0.1.0";

export type AerodynamicContribution = Readonly<{
  id: string;
  label: string;
  kind: "body-profile" | "fin-set";
  normalForceSlopePerRad: number;
  centerOfPressureXM: number;
}>;

export type AerodynamicWarning = Readonly<{
  severity: "info" | "caution" | "unsupported";
  title: string;
  explanation: string;
}>;

export type StaticStabilityResult = Readonly<{
  modelVersion: string;
  validationStatus: "analytical-checks-only";
  referenceDiameterM: number;
  referenceAreaM2: number;
  vehicleLengthM: number;
  finenessRatio: number;
  normalForceSlopePerRad: number;
  centerOfPressureXM: number;
  centerOfMassXM: number;
  staticMarginCalibers: number;
  contributions: readonly AerodynamicContribution[];
  warnings: readonly AerodynamicWarning[];
  assumptions: readonly string[];
}>;

export type StaticStabilityInput = Readonly<{
  components: readonly VehicleComponent[];
  centerOfMassXM: number;
  referenceDiameterM?: number;
  mach?: number;
  activeStageIds?: readonly string[];
}>;

function validatePositive(label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function bodyContribution(
  component: AxisymmetricComponent,
  referenceAreaM2: number,
): AerodynamicContribution | undefined {
  const offsetX = component.positionM?.x ?? 0;
  let normalForceSlopePerRad = 0;
  let momentSlopeMPerRad = 0;

  for (let index = 0; index < component.stations.length - 1; index += 1) {
    const start = component.stations[index];
    const end = component.stations[index + 1];
    const startAreaM2 = Math.PI * start.outerRadiusM ** 2;
    const endAreaM2 = Math.PI * end.outerRadiusM ** 2;
    const areaChangeM2 = endAreaM2 - startAreaM2;
    if (Math.abs(areaChangeM2) < 1e-15) continue;

    const segmentLengthM = end.xM - start.xM;
    const segmentVolumeM3 =
      (Math.PI *
        segmentLengthM *
        (start.outerRadiusM ** 2 +
          start.outerRadiusM * end.outerRadiusM +
          end.outerRadiusM ** 2)) /
      3;
    const localCenterOfPressureM =
      (end.xM * endAreaM2 -
        start.xM * startAreaM2 -
        segmentVolumeM3) /
      areaChangeM2;
    const slope = (2 * areaChangeM2) / referenceAreaM2;
    normalForceSlopePerRad += slope;
    momentSlopeMPerRad += slope * (offsetX + localCenterOfPressureM);
  }

  if (Math.abs(normalForceSlopePerRad) < 1e-12) return undefined;
  return {
    id: component.id,
    label: component.name,
    kind: "body-profile",
    normalForceSlopePerRad,
    centerOfPressureXM: momentSlopeMPerRad / normalForceSlopePerRad,
  };
}

function finContribution(
  component: FinSetComponent,
  referenceDiameterM: number,
): AerodynamicContribution {
  validatePositive("fin count", component.count);
  validatePositive("fin span", component.spanM);
  validatePositive("fin root chord", component.rootChordM);
  validatePositive("fin tip chord", component.tipChordM);
  const midChordLineM = Math.hypot(
    component.spanM,
    component.sweepM +
      component.tipChordM / 2 -
      component.rootChordM / 2,
  );
  const planformCorrection =
    1 +
    Math.sqrt(
      1 +
        (2 * midChordLineM /
          (component.rootChordM + component.tipChordM)) **
          2,
    );
  const bodyInterference =
    1 +
    component.bodyRadiusM /
      (component.bodyRadiusM + component.spanM);
  const normalForceSlopePerRad =
    (bodyInterference *
      4 *
      component.count *
      (component.spanM / referenceDiameterM) ** 2) /
    planformCorrection;
  const centerOfPressureXM =
    component.axialPositionM +
    (component.sweepM / 3) *
      ((component.rootChordM + 2 * component.tipChordM) /
        (component.rootChordM + component.tipChordM)) +
    (1 / 6) *
      (component.rootChordM +
        component.tipChordM -
        (component.rootChordM * component.tipChordM) /
          (component.rootChordM + component.tipChordM));

  return {
    id: component.id,
    label: component.name,
    kind: "fin-set",
    normalForceSlopePerRad,
    centerOfPressureXM,
  };
}

function isIdentityRotation(component: AxisymmetricComponent): boolean {
  if (!component.rotation) return true;
  const identity = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  return component.rotation.every((row, rowIndex) =>
    row.every(
      (entry, columnIndex) =>
        Math.abs(entry - identity[rowIndex][columnIndex]) < 1e-12,
    ),
  );
}

export function computeStaticStability(
  input: StaticStabilityInput,
): StaticStabilityResult {
  if (!Number.isFinite(input.centerOfMassXM)) {
    throw new Error("center of mass must be finite");
  }
  if (input.mach !== undefined && (!Number.isFinite(input.mach) || input.mach < 0)) {
    throw new Error("Mach number must be finite and non-negative");
  }
  const activeStages = input.activeStageIds
    ? new Set(input.activeStageIds)
    : undefined;
  const components = input.components.filter(
    (component) =>
      component.enabled !== false &&
      (!activeStages || activeStages.has(component.stageId)),
  );
  const axisymmetric = components.filter(
    (component): component is AxisymmetricComponent =>
      component.kind === "axisymmetric",
  );
  const finSets = components.filter(
    (component): component is FinSetComponent => component.kind === "finSet",
  );
  const maximumRadiusM = Math.max(
    0,
    ...axisymmetric.flatMap((component) =>
      component.stations.map((station) => station.outerRadiusM),
    ),
    ...finSets.map((component) => component.bodyRadiusM),
  );
  const referenceDiameterM = input.referenceDiameterM ?? 2 * maximumRadiusM;
  validatePositive("reference diameter", referenceDiameterM);
  const referenceAreaM2 = Math.PI * (referenceDiameterM / 2) ** 2;

  const contributions = [
    ...axisymmetric
      .map((component) => bodyContribution(component, referenceAreaM2))
      .filter(
        (contribution): contribution is AerodynamicContribution =>
          contribution !== undefined,
      ),
    ...finSets.map((component) =>
      finContribution(component, referenceDiameterM),
    ),
  ];
  const normalForceSlopePerRad = contributions.reduce(
    (sum, contribution) => sum + contribution.normalForceSlopePerRad,
    0,
  );
  if (!(normalForceSlopePerRad > 0)) {
    throw new Error(
      "active geometry must produce a positive normal-force slope",
    );
  }
  const centerOfPressureXM =
    contributions.reduce(
      (sum, contribution) =>
        sum +
        contribution.normalForceSlopePerRad *
          contribution.centerOfPressureXM,
      0,
    ) / normalForceSlopePerRad;
  const vehicleLengthM = Math.max(
    0,
    ...axisymmetric.map((component) => {
      const finalStation = component.stations.at(-1);
      return (component.positionM?.x ?? 0) + (finalStation?.xM ?? 0);
    }),
    ...finSets.map(
      (component) => component.axialPositionM + component.rootChordM,
    ),
  );
  const finenessRatio = vehicleLengthM / referenceDiameterM;
  const staticMarginCalibers =
    (centerOfPressureXM - input.centerOfMassXM) / referenceDiameterM;
  const warnings: AerodynamicWarning[] = [];

  if (axisymmetric.some((component) => !isIdentityRotation(component))) {
    warnings.push({
      severity: "unsupported",
      title: "Off-axis bodies are not modeled",
      explanation:
        "This model treats axisymmetric profiles as coaxial even when their mass transform is rotated.",
    });
  }
  if (finSets.some((component) => component.count !== 3 && component.count !== 4)) {
    warnings.push({
      severity: "caution",
      title: "Fin-count applicability is limited",
      explanation:
        "The reference method is intended primarily for slender vehicles with three or four fins.",
    });
  }
  if ((input.mach ?? 0) > 0.3) {
    warnings.push({
      severity: "unsupported",
      title: "Compressibility is outside this model",
      explanation:
        "Version 0.1 uses the low-speed small-angle relation; do not extrapolate its center of pressure through transonic or supersonic flight.",
    });
  }
  if (finenessRatio < 6) {
    warnings.push({
      severity: "caution",
      title: "Vehicle is outside the slender-body preference",
      explanation:
        "Low-fineness-ratio bodies can have separated-flow and viscous effects that this method does not predict.",
    });
  }
  if (staticMarginCalibers <= 0) {
    warnings.push({
      severity: "caution",
      title: "Negative static margin",
      explanation:
        "The estimated center of pressure is ahead of the center of mass, indicating static instability in the stated model.",
    });
  } else if (staticMarginCalibers < 1) {
    warnings.push({
      severity: "caution",
      title: "Low static margin",
      explanation:
        "The estimated margin is below one body caliber; uncertainty or changing mass state could reverse it.",
    });
  } else if (staticMarginCalibers > 3) {
    warnings.push({
      severity: "caution",
      title: "High static margin",
      explanation:
        "A large restoring tendency can increase weathercocking and structural loads; dynamic simulation is required.",
    });
  }
  if (warnings.length === 0) {
    warnings.push({
      severity: "info",
      title: "Preliminary static margin is positive",
      explanation:
        "The low-speed small-angle estimate is between one and three calibers, subject to the model assumptions.",
    });
  }

  return {
    modelVersion: STATIC_AERODYNAMICS_MODEL_VERSION,
    validationStatus: "analytical-checks-only",
    referenceDiameterM,
    referenceAreaM2,
    vehicleLengthM,
    finenessRatio,
    normalForceSlopePerRad,
    centerOfPressureXM,
    centerOfMassXM: input.centerOfMassXM,
    staticMarginCalibers,
    contributions,
    warnings,
    assumptions: [
      "Slender, axisymmetric body",
      "Small angle of attack and linear normal-force response",
      "Low-speed incompressible relation",
      "Three or four identical, evenly spaced trapezoidal fins preferred",
      "Steady rigid geometry with no separated-flow prediction",
    ],
  };
}

