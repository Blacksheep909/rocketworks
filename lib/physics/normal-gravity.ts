import { gravityAtAltitude } from "./atmosphere.ts";

/** WGS84 semi-major axis, semi-minor axis, and angular rate constants. */
export const WGS84_SEMI_MAJOR_AXIS_M = 6_378_137;
export const WGS84_SEMI_MINOR_AXIS_M = 6_356_752.314245179;
export const WGS84_FLATTENING = 1 / 298.257223563;
export const WGS84_FIRST_ECCENTRICITY_SQUARED =
  6.6943799901413165e-3;
export const WGS84_ANGULAR_RATE_RAD_S = 7.292115e-5;
export const WGS84_GRAVITATIONAL_CONSTANT_M3_KG_S2 = 3.986004418e14;
export const WGS84_NORMAL_GRAVITY_MODEL_VERSION =
  "rocketworks-wgs84-normal-gravity-0.1.0";
export const GRAVITY_MODEL_STATUS = "engineering-preview-unvalidated" as const;

export type GravityModelKind = "standard" | "wgs84-normal";

export type GravityEvaluation = Readonly<{
  model: GravityModelKind;
  modelVersion: string;
  validationStatus: typeof GRAVITY_MODEL_STATUS;
  latitudeDeg: number;
  altitudeM: number;
  gravityMps2: number;
}>;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function validateLatitude(latitudeDeg: number): void {
  assertFinite(latitudeDeg, "gravity latitude");
  if (latitudeDeg < -90 || latitudeDeg > 90) {
    throw new Error("gravity latitude must be from -90 through 90 degrees");
  }
}

/**
 * WGS84 normal gravity at geodetic latitude and geometric height.
 *
 * The surface term is Somigliana normal gravity.  Height uses the standard
 * second-order normal-gravity expansion, which is transparent and accurate
 * for launch-site and atmospheric altitudes but is not an EGM/geoid solver.
 */
export function wgs84NormalGravityAtLatitudeAltitude(
  latitudeDeg: number,
  altitudeM: number,
): number {
  validateLatitude(latitudeDeg);
  assertFinite(altitudeM, "gravity altitude");
  if (altitudeM < -10_000 || altitudeM > 1_000_000) {
    throw new Error("gravity altitude must be from -10000 through 1000000 m");
  }
  const latitudeRad = (latitudeDeg * Math.PI) / 180;
  const sinLatitude = Math.sin(latitudeRad);
  const sinSquared = sinLatitude ** 2;
  const normalGravityEquatorMps2 = 9.78032533590406;
  const normalGravityPoleMps2 = 9.83218493786363;
  const k =
    (normalGravityPoleMps2 / normalGravityEquatorMps2) *
      Math.sqrt(1 - WGS84_FIRST_ECCENTRICITY_SQUARED) -
    1;
  const surfaceGravityMps2 =
    (normalGravityEquatorMps2 * (1 + k * sinSquared)) /
    Math.sqrt(1 - WGS84_FIRST_ECCENTRICITY_SQUARED * sinSquared);
  const dynamicEllipticityFactor =
    (WGS84_ANGULAR_RATE_RAD_S ** 2 *
      WGS84_SEMI_MAJOR_AXIS_M ** 2 *
      WGS84_SEMI_MINOR_AXIS_M) /
    WGS84_GRAVITATIONAL_CONSTANT_M3_KG_S2;
  const heightCoefficient =
    (2 / WGS84_SEMI_MAJOR_AXIS_M) *
    (1 + WGS84_FLATTENING + dynamicEllipticityFactor -
      2 * WGS84_FLATTENING * sinSquared);
  const heightRatio = altitudeM / WGS84_SEMI_MAJOR_AXIS_M;
  const gravityMps2 =
    surfaceGravityMps2 *
    (1 - heightCoefficient * altitudeM + 3 * heightRatio ** 2);
  if (!(gravityMps2 > 0) || !Number.isFinite(gravityMps2)) {
    throw new Error("WGS84 normal gravity is outside its positive finite domain");
  }
  return gravityMps2;
}

export function evaluateGravity(input: Readonly<{
  model?: GravityModelKind;
  latitudeDeg: number;
  altitudeM: number;
}>): GravityEvaluation {
  validateLatitude(input.latitudeDeg);
  assertFinite(input.altitudeM, "gravity altitude");
  const model = input.model ?? "standard";
  if (model !== "standard" && model !== "wgs84-normal") {
    throw new Error("gravity model must be standard or wgs84-normal");
  }
  if (model === "standard") {
    return {
      model,
      modelVersion: "rocketworks-standard-gravity-0.1.0",
      validationStatus: GRAVITY_MODEL_STATUS,
      latitudeDeg: input.latitudeDeg,
      altitudeM: input.altitudeM,
      gravityMps2: gravityAtAltitude(input.altitudeM),
    };
  }
  return {
    model,
    modelVersion: WGS84_NORMAL_GRAVITY_MODEL_VERSION,
    validationStatus: GRAVITY_MODEL_STATUS,
    latitudeDeg: input.latitudeDeg,
    altitudeM: input.altitudeM,
    gravityMps2: wgs84NormalGravityAtLatitudeAltitude(
      input.latitudeDeg,
      input.altitudeM,
    ),
  };
}
