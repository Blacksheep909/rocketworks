/**
 * RocketWorks clean-room atmosphere model.
 *
 * Equations are independently implemented from the layer definitions in the
 * U.S. Standard Atmosphere, 1976. The implemented hydrostatic layers cover
 * geometric altitudes from -500 m through the 86 km geometric equivalent of
 * the published 84.852 km geopotential boundary.
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
  /** Present when a moist-air observation is applied to this atmosphere. */
  relativeHumidityFraction?: number;
  /** Water-vapor partial pressure used by the moist-air correction. */
  waterVaporPartialPressurePa?: number;
  /** Virtual temperature used for moist-air density and sound speed. */
  virtualTemperatureK?: number;
  /** Mixing ratio of water vapor to dry air, kg/kg. */
  mixingRatioKgPerKgDryAir?: number;
};

export type SurfaceAtmosphereObservation = Readonly<{
  stationPressurePa: number;
  temperatureK: number;
  relativeHumidityFraction?: number;
}>;

export const ATMOSPHERE_MODEL_VERSION = "kestrel-standard-atmosphere-0.5.0";

/** Upper published geopotential layer boundary used by the 1976 model. */
export const ATMOSPHERE_MAX_GEOPOTENTIAL_ALTITUDE_M = 84_852;

const EARTH_GEOPOTENTIAL_RADIUS_M = 6_356_766;
/** Lower and upper geometric altitude limits accepted by `standardAtmosphere`. */
export const ATMOSPHERE_MIN_GEOMETRIC_ALTITUDE_M = -500;
export const ATMOSPHERE_MAX_GEOMETRIC_ALTITUDE_M =
  (EARTH_GEOPOTENTIAL_RADIUS_M * ATMOSPHERE_MAX_GEOPOTENTIAL_ALTITUDE_M) /
  (EARTH_GEOPOTENTIAL_RADIUS_M - ATMOSPHERE_MAX_GEOPOTENTIAL_ALTITUDE_M);
const SEA_LEVEL_TEMPERATURE_K = 288.15;
const SEA_LEVEL_PRESSURE_PA = 101_325;
const TROPOSPHERIC_LAPSE_K_PER_M = -0.0065;
const TROPOPAUSE_GEOPOTENTIAL_M = 11_000;
const SPECIFIC_GAS_CONSTANT_AIR = 287.05287;
const SPECIFIC_GAS_CONSTANT_WATER_VAPOR = 461.525;
const WATER_VAPOR_TO_DRY_AIR_GAS_CONSTANT_RATIO =
  SPECIFIC_GAS_CONSTANT_AIR / SPECIFIC_GAS_CONSTANT_WATER_VAPOR;
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

/**
 * Returns saturation vapour pressure using the WMO Annex 4.B form over
 * liquid water above freezing and ice below freezing. The input is Kelvin;
 * the result is Pa. This is a bounded engineering relation, not a phase
 * equilibrium solver.
 */
export function saturationVaporPressurePa(temperatureK: number): number {
  if (!Number.isFinite(temperatureK) || temperatureK <= 0) {
    throw new Error("Temperature must be a positive finite number.");
  }
  const temperatureC = temperatureK - 273.15;
  const exponent = temperatureC >= 0
    ? (17.62 * temperatureC) / (243.12 + temperatureC)
    : (22.46 * temperatureC) / (272.62 + temperatureC);
  const pressurePa = 611.2 * Math.exp(exponent);
  if (!Number.isFinite(pressurePa) || pressurePa <= 0) {
    throw new Error("Saturation vapor pressure could not be evaluated.");
  }
  return pressurePa;
}

/**
 * Applies a constant-relative-humidity ideal-mixture correction to a dry-air
 * atmosphere state. The gas mixture uses dry-air and water-vapour gas
 * constants, while the dry-air gamma and Sutherland viscosity remain the
 * bounded approximations documented by the environment model.
 */
export function applyRelativeHumidityToAtmosphere(
  atmosphere: AtmosphereState,
  relativeHumidityFraction: number,
): AtmosphereState {
  if (
    !Number.isFinite(relativeHumidityFraction) ||
    relativeHumidityFraction < 0 ||
    relativeHumidityFraction > 1
  ) {
    throw new Error("Relative humidity fraction must be from 0 through 1.");
  }
  const vaporPressurePa =
    relativeHumidityFraction * saturationVaporPressurePa(atmosphere.temperatureK);
  if (!(vaporPressurePa < atmosphere.pressurePa)) {
    throw new Error("Water-vapor partial pressure must remain below total pressure.");
  }
  const mixingRatioKgPerKgDryAir =
    WATER_VAPOR_TO_DRY_AIR_GAS_CONSTANT_RATIO *
    (vaporPressurePa / (atmosphere.pressurePa - vaporPressurePa));
  const virtualTemperatureK =
    atmosphere.temperatureK *
    ((1 + mixingRatioKgPerKgDryAir / WATER_VAPOR_TO_DRY_AIR_GAS_CONSTANT_RATIO) /
      (1 + mixingRatioKgPerKgDryAir));
  const densityKgM3 =
    atmosphere.pressurePa /
    (SPECIFIC_GAS_CONSTANT_AIR * virtualTemperatureK);
  const speedOfSoundMps = Math.sqrt(
    HEAT_CAPACITY_RATIO * SPECIFIC_GAS_CONSTANT_AIR * virtualTemperatureK,
  );
  return {
    ...atmosphere,
    densityKgM3,
    speedOfSoundMps,
    kinematicViscosityM2S: atmosphere.dynamicViscosityPaS / densityKgM3,
    relativeHumidityFraction,
    waterVaporPartialPressurePa: vaporPressurePa,
    virtualTemperatureK,
    mixingRatioKgPerKgDryAir,
  };
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

function pressureInLayer(
  basePressurePa: number,
  baseTemperatureK: number,
  baseAltitudeM: number,
  altitudeM: number,
  lapseKPerM: number,
): number {
  if (lapseKPerM === 0) {
    return (
      basePressurePa *
      Math.exp(
        (-STANDARD_GRAVITY_MPS2 * (altitudeM - baseAltitudeM)) /
          (SPECIFIC_GAS_CONSTANT_AIR * baseTemperatureK),
      )
    );
  }
  const temperatureK =
    baseTemperatureK + lapseKPerM * (altitudeM - baseAltitudeM);
  if (!(temperatureK > 0)) {
    throw new Error("Atmosphere layer temperature became non-positive.");
  }
  return (
    basePressurePa *
    Math.pow(
      temperatureK / baseTemperatureK,
      -STANDARD_GRAVITY_MPS2 / (SPECIFIC_GAS_CONSTANT_AIR * lapseKPerM),
    )
  );
}

type AtmosphereLayer = Readonly<{
  lowerGeopotentialAltitudeM: number;
  upperGeopotentialAltitudeM: number;
  baseTemperatureK: number;
  lapseKPerM: number;
  basePressurePa: number;
}>;

type AtmosphereLayerDefinition = Readonly<{
  lowerGeopotentialAltitudeM: number;
  upperGeopotentialAltitudeM: number;
  baseTemperatureK: number;
  lapseKPerM: number;
}>;

const ATMOSPHERE_LAYER_DEFINITIONS: readonly AtmosphereLayerDefinition[] = [
  { lowerGeopotentialAltitudeM: 0, upperGeopotentialAltitudeM: TROPOPAUSE_GEOPOTENTIAL_M, baseTemperatureK: SEA_LEVEL_TEMPERATURE_K, lapseKPerM: TROPOSPHERIC_LAPSE_K_PER_M },
  { lowerGeopotentialAltitudeM: TROPOPAUSE_GEOPOTENTIAL_M, upperGeopotentialAltitudeM: 20_000, baseTemperatureK: 216.65, lapseKPerM: 0 },
  { lowerGeopotentialAltitudeM: 20_000, upperGeopotentialAltitudeM: 32_000, baseTemperatureK: 216.65, lapseKPerM: 0.001 },
  { lowerGeopotentialAltitudeM: 32_000, upperGeopotentialAltitudeM: 47_000, baseTemperatureK: 228.65, lapseKPerM: 0.0028 },
  { lowerGeopotentialAltitudeM: 47_000, upperGeopotentialAltitudeM: 51_000, baseTemperatureK: 270.65, lapseKPerM: 0 },
  { lowerGeopotentialAltitudeM: 51_000, upperGeopotentialAltitudeM: 71_000, baseTemperatureK: 270.65, lapseKPerM: -0.0028 },
  { lowerGeopotentialAltitudeM: 71_000, upperGeopotentialAltitudeM: ATMOSPHERE_MAX_GEOPOTENTIAL_ALTITUDE_M, baseTemperatureK: 214.65, lapseKPerM: -0.002 },
];

/**
 * Build continuous hydrostatic layer anchors from the sea-level constants.
 * The layer boundaries and lapse rates follow the published COESA 1976
 * table; pressures are propagated with the same perfect-gas equations used at
 * query time so boundary values cannot drift through duplicated constants.
 */
const ATMOSPHERE_LAYERS: readonly AtmosphereLayer[] = (() => {
  let basePressurePa = SEA_LEVEL_PRESSURE_PA;
  return ATMOSPHERE_LAYER_DEFINITIONS.map((definition) => {
    const layer: AtmosphereLayer = { ...definition, basePressurePa };
    basePressurePa = pressureInLayer(
      basePressurePa,
      definition.baseTemperatureK,
      definition.lowerGeopotentialAltitudeM,
      definition.upperGeopotentialAltitudeM,
      definition.lapseKPerM,
    );
    return layer;
  });
})();

export function geometricToGeopotentialAltitude(
  geometricAltitudeM: number,
): number {
  if (!Number.isFinite(geometricAltitudeM)) {
    throw new Error("Geometric altitude must be finite.");
  }
  if (geometricAltitudeM <= -EARTH_GEOPOTENTIAL_RADIUS_M) {
    throw new Error("Geometric altitude is outside the geopotential conversion domain.");
  }
  return (
    (EARTH_GEOPOTENTIAL_RADIUS_M * geometricAltitudeM) /
    (EARTH_GEOPOTENTIAL_RADIUS_M + geometricAltitudeM)
  );
}

/** Inverse of `geometricToGeopotentialAltitude` for layer-boundary tooling. */
export function geopotentialToGeometricAltitude(
  geopotentialAltitudeM: number,
): number {
  if (!Number.isFinite(geopotentialAltitudeM)) {
    throw new Error("Geopotential altitude must be finite.");
  }
  if (geopotentialAltitudeM >= EARTH_GEOPOTENTIAL_RADIUS_M) {
    throw new Error("Geopotential altitude is outside the conversion domain.");
  }
  return (
    (EARTH_GEOPOTENTIAL_RADIUS_M * geopotentialAltitudeM) /
    (EARTH_GEOPOTENTIAL_RADIUS_M - geopotentialAltitudeM)
  );
}

export function standardAtmosphere(
  geometricAltitudeM: number,
): AtmosphereState {
  if (!Number.isFinite(geometricAltitudeM)) {
    throw new Error("Atmosphere altitude must be a finite number.");
  }
  if (
    geometricAltitudeM < ATMOSPHERE_MIN_GEOMETRIC_ALTITUDE_M ||
    geometricAltitudeM > ATMOSPHERE_MAX_GEOMETRIC_ALTITUDE_M
  ) {
    throw new Error(
      "RocketWorks atmosphere v0.5 supports geometric altitudes from -500 m to 86,000 m (the published model boundary is 84.852 km geopotential).",
    );
  }

  const geopotentialAltitudeM =
    geometricToGeopotentialAltitude(geometricAltitudeM);
  const layer = ATMOSPHERE_LAYERS.find(
    (candidate) => geopotentialAltitudeM <= candidate.upperGeopotentialAltitudeM,
  );
  if (!layer) throw new Error("Atmosphere layer selection failed.");
  const temperatureK =
    layer.baseTemperatureK +
    layer.lapseKPerM *
      (geopotentialAltitudeM - layer.lowerGeopotentialAltitudeM);
  const pressurePa = pressureInLayer(
    layer.basePressurePa,
    layer.baseTemperatureK,
    layer.lowerGeopotentialAltitudeM,
    geopotentialAltitudeM,
    layer.lapseKPerM,
  );

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

/**
 * Anchors the standard profile to a launch-site surface observation.
 * Pressure is scaled by the ratio of observed to standard site pressure and
 * temperature keeps its observed offset from the standard profile. The
 * optional humidity correction is applied after those dry-air adjustments so
 * the same state can be consumed by the fast vertical and coupled paths.
 */
export function atmosphereFromSurfaceObservation(
  altitudeAslM: number,
  siteElevationM: number,
  observation: SurfaceAtmosphereObservation,
): AtmosphereState {
  if (!Number.isFinite(observation.stationPressurePa) || observation.stationPressurePa <= 0) {
    throw new Error("Surface observation pressure must be positive and finite.");
  }
  if (!Number.isFinite(observation.temperatureK) || observation.temperatureK <= 0) {
    throw new Error("Surface observation temperature must be positive and finite.");
  }
  if (
    observation.relativeHumidityFraction !== undefined &&
    (!Number.isFinite(observation.relativeHumidityFraction) ||
      observation.relativeHumidityFraction < 0 ||
      observation.relativeHumidityFraction > 1)
  ) {
    throw new Error("Surface observation relative humidity must be from 0 through 1.");
  }
  const standard = standardAtmosphere(altitudeAslM);
  const siteStandard = standardAtmosphere(siteElevationM);
  const temperatureK =
    standard.temperatureK + observation.temperatureK - siteStandard.temperatureK;
  if (!(temperatureK > 0)) {
    throw new Error("Surface-observation-adjusted atmosphere temperature became non-positive.");
  }
  const pressurePa =
    standard.pressurePa * (observation.stationPressurePa / siteStandard.pressurePa);
  const densityKgM3 = pressurePa / (SPECIFIC_GAS_CONSTANT_AIR * temperatureK);
  const dynamicViscosityPaS = dynamicViscosityAirPaS(temperatureK);
  const dryAtmosphere: AtmosphereState = {
    ...standard,
    temperatureK,
    pressurePa,
    densityKgM3,
    speedOfSoundMps: Math.sqrt(
      HEAT_CAPACITY_RATIO * SPECIFIC_GAS_CONSTANT_AIR * temperatureK,
    ),
    dynamicViscosityPaS,
    kinematicViscosityM2S: dynamicViscosityPaS / densityKgM3,
  };
  return observation.relativeHumidityFraction === undefined
    ? dryAtmosphere
    : applyRelativeHumidityToAtmosphere(
        dryAtmosphere,
        observation.relativeHumidityFraction,
      );
}

export function gravityAtAltitude(geometricAltitudeM: number): number {
  const radiusRatio =
    EARTH_GEOPOTENTIAL_RADIUS_M /
    (EARTH_GEOPOTENTIAL_RADIUS_M + geometricAltitudeM);
  return STANDARD_GRAVITY_MPS2 * radiusRatio * radiusRatio;
}
