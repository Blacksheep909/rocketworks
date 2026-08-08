/**
 * Kestrel Lab clean-room atmosphere model.
 *
 * Equations are independently implemented from the layer definitions in the
 * U.S. Standard Atmosphere, 1976. This first increment covers geometric
 * altitudes from -500 m through 20 km.
 */

export type AtmosphereState = {
  geometricAltitudeM: number;
  geopotentialAltitudeM: number;
  temperatureK: number;
  pressurePa: number;
  densityKgM3: number;
  speedOfSoundMps: number;
  dynamicViscosityPaS: number;
  kinematicViscosityM2S: number;
};

export const ATMOSPHERE_MODEL_VERSION = "kestrel-standard-atmosphere-0.3.0";

const EARTH_GEOPOTENTIAL_RADIUS_M = 6_356_766;
const SEA_LEVEL_TEMPERATURE_K = 288.15;
const SEA_LEVEL_PRESSURE_PA = 101_325;
const TROPOSPHERIC_LAPSE_K_PER_M = -0.0065;
const TROPOPAUSE_GEOPOTENTIAL_M = 11_000;
const LOWER_STRATOSPHERE_LIMIT_M = 20_000;
const SPECIFIC_GAS_CONSTANT_AIR = 287.05287;
const STANDARD_GRAVITY_MPS2 = 9.80665;
const HEAT_CAPACITY_RATIO = 1.4;
const SUTHERLAND_REFERENCE_TEMPERATURE_K = 273.15;
const SUTHERLAND_REFERENCE_VISCOSITY_PA_S = 1.716e-5;
const SUTHERLAND_TEMPERATURE_K = 110.4;

export function dynamicViscosityAirPaS(temperatureK: number): number {
  if (!Number.isFinite(temperatureK) || temperatureK <= 0) {
    throw new Error("Air temperature must be a positive finite number.");
  }
  return (
    SUTHERLAND_REFERENCE_VISCOSITY_PA_S *
    Math.pow(temperatureK / SUTHERLAND_REFERENCE_TEMPERATURE_K, 1.5) *
    ((SUTHERLAND_REFERENCE_TEMPERATURE_K + SUTHERLAND_TEMPERATURE_K) /
      (temperatureK + SUTHERLAND_TEMPERATURE_K))
  );
}

export function reynoldsNumber(input: Readonly<{
  densityKgM3: number;
  speedMps: number;
  referenceLengthM: number;
  dynamicViscosityPaS: number;
}>): number {
  if (
    !Number.isFinite(input.densityKgM3) ||
    input.densityKgM3 <= 0 ||
    !Number.isFinite(input.speedMps) ||
    input.speedMps < 0 ||
    !Number.isFinite(input.referenceLengthM) ||
    input.referenceLengthM <= 0 ||
    !Number.isFinite(input.dynamicViscosityPaS) ||
    input.dynamicViscosityPaS <= 0
  ) {
    throw new Error(
      "Reynolds inputs require positive density, length, viscosity, and non-negative speed.",
    );
  }
  return (
    (input.densityKgM3 * input.speedMps * input.referenceLengthM) /
    input.dynamicViscosityPaS
  );
}

function pressureInGradientLayer(
  basePressurePa: number,
  baseTemperatureK: number,
  baseAltitudeM: number,
  altitudeM: number,
  lapseKPerM: number,
): number {
  const temperatureK =
    baseTemperatureK + lapseKPerM * (altitudeM - baseAltitudeM);
  return (
    basePressurePa *
    Math.pow(
      temperatureK / baseTemperatureK,
      -STANDARD_GRAVITY_MPS2 / (SPECIFIC_GAS_CONSTANT_AIR * lapseKPerM),
    )
  );
}

const TROPOPAUSE_TEMPERATURE_K =
  SEA_LEVEL_TEMPERATURE_K +
  TROPOSPHERIC_LAPSE_K_PER_M * TROPOPAUSE_GEOPOTENTIAL_M;
const TROPOPAUSE_PRESSURE_PA = pressureInGradientLayer(
  SEA_LEVEL_PRESSURE_PA,
  SEA_LEVEL_TEMPERATURE_K,
  0,
  TROPOPAUSE_GEOPOTENTIAL_M,
  TROPOSPHERIC_LAPSE_K_PER_M,
);

export function geometricToGeopotentialAltitude(
  geometricAltitudeM: number,
): number {
  return (
    (EARTH_GEOPOTENTIAL_RADIUS_M * geometricAltitudeM) /
    (EARTH_GEOPOTENTIAL_RADIUS_M + geometricAltitudeM)
  );
}

export function standardAtmosphere(
  geometricAltitudeM: number,
): AtmosphereState {
  if (!Number.isFinite(geometricAltitudeM)) {
    throw new Error("Atmosphere altitude must be a finite number.");
  }
  if (geometricAltitudeM < -500 || geometricAltitudeM > 20_000) {
    throw new Error(
      "Kestrel atmosphere v0.3 supports altitudes from -500 m to 20,000 m.",
    );
  }

  const geopotentialAltitudeM =
    geometricToGeopotentialAltitude(geometricAltitudeM);
  let temperatureK: number;
  let pressurePa: number;

  if (geopotentialAltitudeM <= TROPOPAUSE_GEOPOTENTIAL_M) {
    temperatureK =
      SEA_LEVEL_TEMPERATURE_K +
      TROPOSPHERIC_LAPSE_K_PER_M * geopotentialAltitudeM;
    pressurePa = pressureInGradientLayer(
      SEA_LEVEL_PRESSURE_PA,
      SEA_LEVEL_TEMPERATURE_K,
      0,
      geopotentialAltitudeM,
      TROPOSPHERIC_LAPSE_K_PER_M,
    );
  } else if (geopotentialAltitudeM <= LOWER_STRATOSPHERE_LIMIT_M) {
    temperatureK = TROPOPAUSE_TEMPERATURE_K;
    pressurePa =
      TROPOPAUSE_PRESSURE_PA *
      Math.exp(
        (-STANDARD_GRAVITY_MPS2 *
          (geopotentialAltitudeM - TROPOPAUSE_GEOPOTENTIAL_M)) /
          (SPECIFIC_GAS_CONSTANT_AIR * TROPOPAUSE_TEMPERATURE_K),
      );
  } else {
    throw new Error("Atmosphere layer selection failed.");
  }

  const densityKgM3 =
    pressurePa / (SPECIFIC_GAS_CONSTANT_AIR * temperatureK);
  const speedOfSoundMps = Math.sqrt(
    HEAT_CAPACITY_RATIO * SPECIFIC_GAS_CONSTANT_AIR * temperatureK,
  );
  const dynamicViscosityPaS = dynamicViscosityAirPaS(temperatureK);
  const kinematicViscosityM2S = dynamicViscosityPaS / densityKgM3;

  return {
    geometricAltitudeM,
    geopotentialAltitudeM,
    temperatureK,
    pressurePa,
    densityKgM3,
    speedOfSoundMps,
    dynamicViscosityPaS,
    kinematicViscosityM2S,
  };
}

export function gravityAtAltitude(geometricAltitudeM: number): number {
  const radiusRatio =
    EARTH_GEOPOTENTIAL_RADIUS_M /
    (EARTH_GEOPOTENTIAL_RADIUS_M + geometricAltitudeM);
  return STANDARD_GRAVITY_MPS2 * radiusRatio * radiusRatio;
}
