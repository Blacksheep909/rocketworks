import type { AtmosphereState } from "./atmosphere.ts";
import type { FinSetComponent } from "./vehicle-components.ts";

/**
 * RocketWorks preliminary fin-flutter screen.
 *
 * The relation is the thin, flat, isotropic-plate form transcribed from the
 * public NACA TN-4197 preliminary-design guidance. It is intentionally kept
 * separate from the flight integrators so the boundary of this screen stays
 * obvious: it is a design-review flag, not a coupled aeroelastic solver.
 */
export const FIN_FLUTTER_MODEL_VERSION = "rocketworks-fin-flutter-0.1.0";
export const FIN_FLUTTER_VALIDATION_STATUS =
  "preliminary-naca-tn-4197-style-screen" as const;

export type FinFlutterStatus = "pass" | "review" | "unavailable";

export type FinFlutterMaterial = Readonly<{
  youngsModulusPa: number;
  /** Isotropic Poisson ratio. A representative 0.30 default is used when omitted. */
  poissonRatio?: number;
}>;

export type FinFlutterInput = Readonly<{
  fins: FinSetComponent;
  material: FinFlutterMaterial;
  maxAirspeedMps?: number | null;
  atmosphere?: Pick<AtmosphereState, "pressurePa" | "speedOfSoundMps"> | null;
  safetyFactor?: number;
  referencePressurePa?: number;
  heatCapacityRatio?: number;
}>;

export type FinFlutterResult = Readonly<{
  modelVersion: string;
  validationStatus: typeof FIN_FLUTTER_VALIDATION_STATUS;
  status: FinFlutterStatus;
  geometry: Readonly<{
    planformAreaM2: number;
    aspectRatio: number;
    taperRatio: number;
    centroidFromRootM: number;
    sweepM: number;
    thicknessRatio: number;
    epsilon: number;
  }>;
  material: Readonly<{
    youngsModulusPa: number;
    poissonRatio: number;
    shearModulusPa: number;
  }>;
  conditions: Readonly<{
    maxAirspeedMps: number | null;
    pressurePa: number | null;
    speedOfSoundMps: number | null;
    mach: number | null;
    safetyFactor: number;
  }>;
  predictedFlutterSpeedMps: number | null;
  safeAirspeedMps: number | null;
  factorOfSafety: number | null;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

const DEFAULT_POISSON_RATIO = 0.3;
const DEFAULT_SAFETY_FACTOR = 1.25;
const DEFAULT_REFERENCE_PRESSURE_PA = 101_325;
const DEFAULT_HEAT_CAPACITY_RATIO = 1.4;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (!(value > 0)) throw new Error(`${label} must be positive`);
}

function assertNonNegative(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0) throw new Error(`${label} cannot be negative`);
}

function emptyResult(
  geometry: FinFlutterResult["geometry"],
  material: FinFlutterResult["material"],
  conditions: FinFlutterResult["conditions"],
  status: FinFlutterStatus,
  warnings: readonly string[],
  assumptions: readonly string[],
): FinFlutterResult {
  return {
    modelVersion: FIN_FLUTTER_MODEL_VERSION,
    validationStatus: FIN_FLUTTER_VALIDATION_STATUS,
    status,
    geometry,
    material,
    conditions,
    predictedFlutterSpeedMps: null,
    safeAirspeedMps: null,
    factorOfSafety: null,
    warnings,
    assumptions,
  };
}

/**
 * Evaluates a conservative preliminary flutter speed for a trapezoidal fin.
 *
 * The implemented relation is:
 *
 *   G = E / (2 (1 + nu))
 *   D = 24 epsilon gamma p0 / pi
 *   F = D AR^3 / ((t/c_r)^3 (AR + 2)) * ((lambda + 1) / 2) * (p/p0)
 *   V_f = a sqrt(G / F)
 *
 * where epsilon is the normalized fin-centroid offset from the quarter-chord.
 * The result is only considered available when a current airspeed and local
 * atmosphere are supplied; missing flight conditions remain visibly
 * unavailable instead of silently substituting sea-level values.
 */
export function computeFinFlutterScreen(input: FinFlutterInput): FinFlutterResult {
  const fins = input.fins;
  if (fins.kind !== "finSet") throw new Error("fin flutter screen requires a fin-set component");
  if (!Number.isInteger(fins.count) || fins.count <= 0) {
    throw new Error("fin flutter count must be a positive integer");
  }
  assertPositive(fins.rootChordM, "fin root chord");
  assertPositive(fins.tipChordM, "fin tip chord");
  assertPositive(fins.spanM, "fin span");
  assertPositive(fins.thicknessM, "fin thickness");
  assertFinite(fins.sweepM, "fin sweep");
  assertNonNegative(fins.sweepM, "fin sweep");
  assertPositive(input.material.youngsModulusPa, "fin flutter Young's modulus");

  const poissonRatio = input.material.poissonRatio ?? DEFAULT_POISSON_RATIO;
  assertFinite(poissonRatio, "fin flutter Poisson ratio");
  if (!(poissonRatio > -1 && poissonRatio < 0.5)) {
    throw new Error("fin flutter Poisson ratio must be between -1 and 0.5");
  }
  const safetyFactor = input.safetyFactor ?? DEFAULT_SAFETY_FACTOR;
  const referencePressurePa = input.referencePressurePa ?? DEFAULT_REFERENCE_PRESSURE_PA;
  const heatCapacityRatio = input.heatCapacityRatio ?? DEFAULT_HEAT_CAPACITY_RATIO;
  assertPositive(safetyFactor, "fin flutter safety factor");
  assertPositive(referencePressurePa, "fin flutter reference pressure");
  assertPositive(heatCapacityRatio, "fin flutter heat-capacity ratio");

  const taperRatio = fins.tipChordM / fins.rootChordM;
  const planformAreaM2 = ((fins.rootChordM + fins.tipChordM) / 2) * fins.spanM;
  const aspectRatio = fins.spanM ** 2 / planformAreaM2;
  const centroidFromRootM =
    (2 * fins.tipChordM * fins.sweepM +
      fins.tipChordM ** 2 +
      fins.sweepM * fins.rootChordM +
      fins.tipChordM * fins.rootChordM +
      fins.rootChordM ** 2) /
    (3 * (fins.tipChordM + fins.rootChordM));
  const epsilon = centroidFromRootM / fins.rootChordM - 0.25;
  const thicknessRatio = fins.thicknessM / fins.rootChordM;
  const shearModulusPa = input.material.youngsModulusPa / (2 * (1 + poissonRatio));
  const maxAirspeedMps = input.maxAirspeedMps ?? null;
  if (maxAirspeedMps !== null) assertNonNegative(maxAirspeedMps, "maximum airspeed");
  const pressurePa = input.atmosphere?.pressurePa ?? null;
  const speedOfSoundMps = input.atmosphere?.speedOfSoundMps ?? null;
  if (pressurePa !== null) assertPositive(pressurePa, "flutter evaluation pressure");
  if (speedOfSoundMps !== null) assertPositive(speedOfSoundMps, "flutter speed of sound");
  const mach = maxAirspeedMps !== null && speedOfSoundMps !== null
    ? maxAirspeedMps / speedOfSoundMps
    : null;
  const geometry = {
    planformAreaM2,
    aspectRatio,
    taperRatio,
    centroidFromRootM,
    sweepM: fins.sweepM,
    thicknessRatio,
    epsilon,
  };
  const material = {
    youngsModulusPa: input.material.youngsModulusPa,
    poissonRatio,
    shearModulusPa,
  };
  const conditions = {
    maxAirspeedMps,
    pressurePa,
    speedOfSoundMps,
    mach,
    safetyFactor,
  };
  const assumptions = [
    "NACA-TN-4197-style thin, flat, isotropic fin relation with a single trapezoidal planform.",
    "The supplied pressure and sound speed represent the worst-case flight condition selected by the current estimate.",
    "Linear elastic behavior, uniform thickness, idealized boundary conditions, and no body-fin coupling are assumed.",
  ];
  const warnings: string[] = [
    "This is a preliminary aeroelastic screen, not flutter certification or flight-safety evidence.",
    "Transonic effects, fin-body interference, joints, fillets, skins, mass balancing, damping, manufacturing tolerances, and dynamic pressure transients are omitted.",
  ];

  if (epsilon <= 0) {
    warnings.push("The fin centroid is at or ahead of the quarter-chord reference, so this relation has no positive flutter-speed solution for the supplied geometry.");
    return emptyResult(geometry, material, conditions, "unavailable", warnings, assumptions);
  }
  if (maxAirspeedMps === null || !(maxAirspeedMps > 0)) {
    warnings.push("Provide a positive current maximum airspeed to evaluate the flutter margin.");
    return emptyResult(geometry, material, conditions, "unavailable", warnings, assumptions);
  }
  if (pressurePa === null || speedOfSoundMps === null) {
    warnings.push("Provide local pressure and speed of sound from a current atmosphere model to evaluate the flutter margin.");
    return emptyResult(geometry, material, conditions, "unavailable", warnings, assumptions);
  }

  const dynamicFactor = pressurePa / referencePressurePa;
  assertPositive(dynamicFactor, "flutter pressure ratio");
  const D = (24 * epsilon * heatCapacityRatio * referencePressurePa) / Math.PI;
  const F =
    (D * aspectRatio ** 3) /
    (thicknessRatio ** 3 * (aspectRatio + 2)) *
    ((taperRatio + 1) / 2) *
    dynamicFactor;
  assertPositive(F, "flutter aerodynamic factor");
  const predictedFlutterSpeedMps = speedOfSoundMps * Math.sqrt(shearModulusPa / F);
  assertPositive(predictedFlutterSpeedMps, "predicted flutter speed");
  const safeAirspeedMps = predictedFlutterSpeedMps / safetyFactor;
  const factorOfSafety = predictedFlutterSpeedMps / maxAirspeedMps;
  const transonicReview = mach !== null && mach >= 0.8;
  if (transonicReview) {
    warnings.push("The selected condition is at or above Mach 0.8; transonic flutter effects are outside this subsonic preliminary relation.");
  }
  if (factorOfSafety < safetyFactor) {
    warnings.push(`The predicted flutter speed is below the ${safetyFactor.toFixed(2)}× screen target at the selected condition.`);
  }
  return {
    modelVersion: FIN_FLUTTER_MODEL_VERSION,
    validationStatus: FIN_FLUTTER_VALIDATION_STATUS,
    status: factorOfSafety >= safetyFactor && !transonicReview ? "pass" : "review",
    geometry,
    material,
    conditions,
    predictedFlutterSpeedMps,
    safeAirspeedMps,
    factorOfSafety,
    warnings,
    assumptions,
  };
}
