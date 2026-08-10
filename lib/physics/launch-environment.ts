import {
  atmosphereFromSurfaceObservation,
  standardAtmosphere,
  type AtmosphereState,
  type SurfaceAtmosphereObservation,
} from "./atmosphere.ts";
import {
  interpolateWind,
  validateWindProfile,
  type WindLayer,
} from "./curves.ts";
import {
  ZERO_VECTOR,
  addVectors,
  type Vector3,
} from "./linear-algebra.ts";

export const LAUNCH_ENVIRONMENT_MODEL_VERSION = "kestrel-launch-environment-0.2.0";
export const LAUNCH_ENVIRONMENT_MODEL_STATUS = "engineering-preview-unvalidated";

export type LaunchSite = Readonly<{
  name: string;
  latitudeDeg: number;
  longitudeDeg: number;
  elevationM: number;
  datum: "WGS84";
  timeZone?: string;
}>;

export type WeatherDataProvenance = Readonly<{
  sourceName: string;
  sourceKind: "user-supplied" | "weather-station" | "forecast" | "synthetic";
  dataVersion: string;
  licenseIdentifier: string;
  attribution: string;
  sourceUrl?: string;
  observedAtIso?: string;
  validationStatus:
    | "user-supplied-unvalidated"
    | "observed-unverified"
    | "forecast-unverified"
    | "synthetic-unvalidated";
}>;

export type SurfaceWeatherObservation = SurfaceAtmosphereObservation;

export type DrydenShapedTurbulenceConfig = Readonly<{
  seed: string;
  rmsVelocityMps: Readonly<{
    longitudinal: number;
    lateral: number;
    vertical: number;
  }>;
  lengthScaleM: Readonly<{
    longitudinal: number;
    lateral: number;
    vertical: number;
  }>;
  minimumWavelengthM: number;
  maximumWavelengthM: number;
  modeCount?: number;
  minimumAdvectionSpeedMps?: number;
}>;

export type DiscreteGustEvent = Readonly<{
  id: string;
  startTimeS: number;
  durationS: number;
  peakDeltaWindWorldMps: Vector3;
  minimumAltitudeAglM?: number;
  maximumAltitudeAglM?: number;
}>;

export type LaunchEnvironmentDefinition = Readonly<{
  site: LaunchSite;
  provenance: WeatherDataProvenance;
  meanWindProfile?: readonly WindLayer[];
  surfaceObservation?: SurfaceWeatherObservation;
  turbulence?: DrydenShapedTurbulenceConfig;
  gustEvents?: readonly DiscreteGustEvent[];
}>;

export type LaunchEnvironmentQuery = Readonly<{
  timeS: number;
  positionWorldM: Vector3;
}>;

export type LaunchEnvironmentState = Readonly<{
  modelVersion: string;
  validationStatus: typeof LAUNCH_ENVIRONMENT_MODEL_STATUS;
  timeS: number;
  altitudeAglM: number;
  altitudeAslM: number;
  atmosphere: AtmosphereState;
  meanWindWorldMps: Vector3;
  turbulenceWindWorldMps: Vector3;
  discreteGustWindWorldMps: Vector3;
  windWorldMps: Vector3;
  activeGustIds: readonly string[];
  provenance: WeatherDataProvenance;
}>;

export type LaunchEnvironmentProvider = (
  query: LaunchEnvironmentQuery,
) => LaunchEnvironmentState;

export type LaunchEnvironmentModel = Readonly<{
  modelVersion: string;
  validationStatus: typeof LAUNCH_ENVIRONMENT_MODEL_STATUS;
  definition: LaunchEnvironmentDefinition;
  at: LaunchEnvironmentProvider;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

type SpectralMode = Readonly<{ waveNumberRadPerM: number; amplitudeMps: number; phaseRad: number }>;

function finiteVector(vector: Vector3) {
  return [vector.x, vector.y, vector.z].every(Number.isFinite);
}

function finiteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative finite number`);
}

function finitePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive finite number`);
}

function validateProvenance(provenance: WeatherDataProvenance) {
  for (const [label, value] of [
    ["source name", provenance.sourceName],
    ["data version", provenance.dataVersion],
    ["license identifier", provenance.licenseIdentifier],
    ["attribution", provenance.attribution],
  ] as const) {
    if (!value.trim()) throw new Error(`weather provenance ${label} cannot be empty`);
  }
  if (provenance.sourceUrl) {
    let url: URL;
    try {
      url = new URL(provenance.sourceUrl);
    } catch {
      throw new Error("weather provenance source URL must be valid");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("weather provenance source URL must use HTTP or HTTPS");
    }
  }
  if (provenance.observedAtIso && !Number.isFinite(Date.parse(provenance.observedAtIso))) {
    throw new Error("weather provenance observation time must be an ISO date-time");
  }
  const expected: Record<WeatherDataProvenance["sourceKind"], WeatherDataProvenance["validationStatus"]> = {
    "user-supplied": "user-supplied-unvalidated",
    "weather-station": "observed-unverified",
    forecast: "forecast-unverified",
    synthetic: "synthetic-unvalidated",
  };
  if (expected[provenance.sourceKind] !== provenance.validationStatus) {
    throw new Error(`weather source kind ${provenance.sourceKind} is incompatible with validation status ${provenance.validationStatus}`);
  }
}

function seededRandom(seed: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSpectralModes(
  random: () => number,
  sigmaMps: number,
  lengthScaleM: number,
  minimumWavelengthM: number,
  maximumWavelengthM: number,
  modeCount: number,
  component: "longitudinal" | "transverse",
): SpectralMode[] {
  if (sigmaMps === 0) return [];
  const minimumWaveNumber = (2 * Math.PI) / maximumWavelengthM;
  const maximumWaveNumber = (2 * Math.PI) / minimumWavelengthM;
  const deltaWaveNumber = (maximumWaveNumber - minimumWaveNumber) / modeCount;
  const raw = Array.from({ length: modeCount }, (_, index) => {
    const waveNumberRadPerM = minimumWaveNumber + (index + 0.5) * deltaWaveNumber;
    const scaled = lengthScaleM * waveNumberRadPerM;
    const spectralDensity =
      component === "longitudinal"
        ? ((2 * sigmaMps ** 2 * lengthScaleM) / Math.PI) / (1 + scaled ** 2)
        : ((sigmaMps ** 2 * lengthScaleM) / Math.PI) *
          ((1 + 3 * scaled ** 2) / (1 + scaled ** 2) ** 2);
    return {
      waveNumberRadPerM,
      amplitudeMps: Math.sqrt(2 * spectralDensity * deltaWaveNumber),
      phaseRad: random() * 2 * Math.PI,
    };
  });
  const representedRms = Math.sqrt(raw.reduce((sum, mode) => sum + mode.amplitudeMps ** 2 / 2, 0));
  const normalization = sigmaMps / representedRms;
  return raw.map((mode) => ({ ...mode, amplitudeMps: mode.amplitudeMps * normalization }));
}

function evaluateModes(modes: readonly SpectralMode[], advectedDistanceM: number) {
  return modes.reduce(
    (sum, mode) => sum + mode.amplitudeMps * Math.sin(mode.waveNumberRadPerM * advectedDistanceM + mode.phaseRad),
    0,
  );
}

function adjustedAtmosphere(
  altitudeAslM: number,
  siteElevationM: number,
  observation: SurfaceWeatherObservation | undefined,
): AtmosphereState {
  const standard = standardAtmosphere(altitudeAslM);
  if (!observation) return standard;
  return atmosphereFromSurfaceObservation(altitudeAslM, siteElevationM, observation);
}

export function createLaunchEnvironmentModel(definition: LaunchEnvironmentDefinition): LaunchEnvironmentModel {
  const { site } = definition;
  if (!site.name.trim()) throw new Error("launch site name cannot be empty");
  if (!Number.isFinite(site.latitudeDeg) || site.latitudeDeg < -90 || site.latitudeDeg > 90) {
    throw new Error("launch-site latitude must be from -90 through 90 degrees");
  }
  if (!Number.isFinite(site.longitudeDeg) || site.longitudeDeg < -180 || site.longitudeDeg > 180) {
    throw new Error("launch-site longitude must be from -180 through 180 degrees");
  }
  if (!Number.isFinite(site.elevationM) || site.elevationM < -500 || site.elevationM > 20_000) {
    throw new Error("launch-site elevation must be within the atmosphere model range");
  }
  validateProvenance(definition.provenance);
  const meanWindProfile = [...(definition.meanWindProfile ?? [])];
  validateWindProfile(meanWindProfile);
  const observation = definition.surfaceObservation;
  if (observation) {
    finitePositive(observation.stationPressurePa, "station pressure");
    finitePositive(observation.temperatureK, "surface temperature");
    if (
      observation.relativeHumidityFraction !== undefined &&
      (!Number.isFinite(observation.relativeHumidityFraction) ||
        observation.relativeHumidityFraction < 0 ||
        observation.relativeHumidityFraction > 1)
    ) {
      throw new Error("relative humidity fraction must be from 0 through 1");
    }
  }
  const gustEvents = [...(definition.gustEvents ?? [])];
  const gustIds = new Set<string>();
  gustEvents.forEach((gust) => {
    if (!/^[A-Za-z0-9_-]+$/.test(gust.id) || gustIds.has(gust.id)) {
      throw new Error("gust identifiers must be valid and unique");
    }
    gustIds.add(gust.id);
    if (!Number.isFinite(gust.startTimeS)) throw new Error(`gust ${gust.id} start time must be finite`);
    finitePositive(gust.durationS, `gust ${gust.id} duration`);
    if (!finiteVector(gust.peakDeltaWindWorldMps)) throw new Error(`gust ${gust.id} peak wind must be finite`);
    const minimum = gust.minimumAltitudeAglM ?? -Infinity;
    const maximum = gust.maximumAltitudeAglM ?? Infinity;
    if (
      (gust.minimumAltitudeAglM !== undefined &&
        !Number.isFinite(gust.minimumAltitudeAglM)) ||
      (gust.maximumAltitudeAglM !== undefined &&
        !Number.isFinite(gust.maximumAltitudeAglM))
    ) {
      throw new Error(`gust ${gust.id} altitude limits must be finite when supplied`);
    }
    if (Number.isNaN(minimum) || Number.isNaN(maximum) || maximum < minimum) {
      throw new Error(`gust ${gust.id} altitude range is invalid`);
    }
  });

  const turbulence = definition.turbulence;
  let turbulenceModes: Readonly<{
    longitudinal: readonly SpectralMode[];
    lateral: readonly SpectralMode[];
    vertical: readonly SpectralMode[];
    minimumAdvectionSpeedMps: number;
  }> | null = null;
  if (turbulence) {
    if (!turbulence.seed.trim()) throw new Error("turbulence seed cannot be empty");
    for (const [label, value] of Object.entries(turbulence.rmsVelocityMps)) finiteNonNegative(value, `${label} turbulence RMS`);
    for (const [label, value] of Object.entries(turbulence.lengthScaleM)) finitePositive(value, `${label} turbulence length scale`);
    finitePositive(turbulence.minimumWavelengthM, "minimum turbulence wavelength");
    finitePositive(turbulence.maximumWavelengthM, "maximum turbulence wavelength");
    if (turbulence.maximumWavelengthM <= turbulence.minimumWavelengthM) {
      throw new Error("maximum turbulence wavelength must exceed its minimum");
    }
    const modeCount = turbulence.modeCount ?? 32;
    if (!Number.isInteger(modeCount) || modeCount < 4 || modeCount > 256) {
      throw new Error("turbulence mode count must be an integer from 4 through 256");
    }
    const minimumAdvectionSpeedMps = turbulence.minimumAdvectionSpeedMps ?? 0.5;
    finitePositive(minimumAdvectionSpeedMps, "minimum turbulence advection speed");
    const random = seededRandom(turbulence.seed);
    turbulenceModes = {
      longitudinal: makeSpectralModes(random, turbulence.rmsVelocityMps.longitudinal, turbulence.lengthScaleM.longitudinal, turbulence.minimumWavelengthM, turbulence.maximumWavelengthM, modeCount, "longitudinal"),
      lateral: makeSpectralModes(random, turbulence.rmsVelocityMps.lateral, turbulence.lengthScaleM.lateral, turbulence.minimumWavelengthM, turbulence.maximumWavelengthM, modeCount, "transverse"),
      vertical: makeSpectralModes(random, turbulence.rmsVelocityMps.vertical, turbulence.lengthScaleM.vertical, turbulence.minimumWavelengthM, turbulence.maximumWavelengthM, modeCount, "transverse"),
      minimumAdvectionSpeedMps,
    };
  }

  const at: LaunchEnvironmentProvider = (query) => {
    if (!Number.isFinite(query.timeS) || !finiteVector(query.positionWorldM)) {
      throw new Error("launch-environment query time and position must be finite");
    }
    const altitudeAglM = query.positionWorldM.z;
    const altitudeAslM = site.elevationM + altitudeAglM;
    const atmosphere = adjustedAtmosphere(altitudeAslM, site.elevationM, observation);
    const mean = interpolateWind(meanWindProfile, altitudeAglM);
    const meanWindWorldMps = { x: mean.eastMps, y: mean.northMps, z: mean.upMps };
    const horizontalSpeed = Math.hypot(mean.eastMps, mean.northMps);
    const alongEast = horizontalSpeed > 1e-12 ? mean.eastMps / horizontalSpeed : 1;
    const alongNorth = horizontalSpeed > 1e-12 ? mean.northMps / horizontalSpeed : 0;
    let turbulenceWindWorldMps = ZERO_VECTOR;
    if (turbulenceModes) {
      const advectionSpeed = Math.max(horizontalSpeed, turbulenceModes.minimumAdvectionSpeedMps);
      const alongPosition = alongEast * query.positionWorldM.x + alongNorth * query.positionWorldM.y;
      const advectedDistanceM = alongPosition - advectionSpeed * query.timeS;
      const longitudinal = evaluateModes(turbulenceModes.longitudinal, advectedDistanceM);
      const lateral = evaluateModes(turbulenceModes.lateral, advectedDistanceM);
      const vertical = evaluateModes(turbulenceModes.vertical, advectedDistanceM);
      turbulenceWindWorldMps = {
        x: longitudinal * alongEast - lateral * alongNorth,
        y: longitudinal * alongNorth + lateral * alongEast,
        z: vertical,
      };
    }
    const activeGustIds: string[] = [];
    const discreteGustWindWorldMps = gustEvents.reduce((sum, gust) => {
      const localTime = query.timeS - gust.startTimeS;
      const altitudeInside =
        altitudeAglM >= (gust.minimumAltitudeAglM ?? -Infinity) &&
        altitudeAglM <= (gust.maximumAltitudeAglM ?? Infinity);
      if (localTime < 0 || localTime > gust.durationS || !altitudeInside) return sum;
      activeGustIds.push(gust.id);
      const fraction = localTime / gust.durationS;
      const envelope = 0.5 * (1 - Math.cos(2 * Math.PI * fraction));
      return addVectors(sum, {
        x: gust.peakDeltaWindWorldMps.x * envelope,
        y: gust.peakDeltaWindWorldMps.y * envelope,
        z: gust.peakDeltaWindWorldMps.z * envelope,
      });
    }, ZERO_VECTOR);
    return {
      modelVersion: LAUNCH_ENVIRONMENT_MODEL_VERSION,
      validationStatus: LAUNCH_ENVIRONMENT_MODEL_STATUS,
      timeS: query.timeS,
      altitudeAglM,
      altitudeAslM,
      atmosphere,
      meanWindWorldMps,
      turbulenceWindWorldMps,
      discreteGustWindWorldMps,
      windWorldMps: addVectors(addVectors(meanWindWorldMps, turbulenceWindWorldMps), discreteGustWindWorldMps),
      activeGustIds,
      provenance: definition.provenance,
    };
  };

  return {
    modelVersion: LAUNCH_ENVIRONMENT_MODEL_VERSION,
    validationStatus: LAUNCH_ENVIRONMENT_MODEL_STATUS,
    definition,
    at,
    warnings: [
      ...(observation
        ? ["Surface pressure and temperature are anchored to the supplied launch-site observation and are not live weather data."]
        : []),
      ...(observation?.relativeHumidityFraction !== undefined
        ? ["Relative humidity is coupled to water-vapor partial pressure, virtual temperature, density, and speed of sound in version 0.2; condensation and humidity-dependent viscosity are not modeled."]
        : []),
      ...(turbulence ? ["Turbulence is a finite-band deterministic Dryden-shaped spectral realization, not a measured gust history."] : []),
      "Weather provenance and observation age must be reviewed before use; RocketWorks does not authenticate external weather data.",
      "The launch-environment model is unvalidated and is not a flight-safety weather assessment.",
    ],
    assumptions: [
      "World coordinates are local east, north, up metres from the launch point.",
      "Mean wind is piecewise-linear in altitude AGL and clamped outside supplied layers.",
      "Surface pressure scales the standard pressure profile and the surface temperature offset persists with altitude.",
      ...(observation?.relativeHumidityFraction !== undefined
        ? ["Relative humidity is held constant through the altitude-adjusted profile; condensation, precipitation, and phase change are not modeled."]
        : ["Without a humidity observation, the dry-air density and speed-of-sound fallback is used."]),
      "Turbulence uses Taylor frozen-field advection along the local horizontal mean-wind direction.",
      "Discrete gusts use a smooth finite one-minus-cosine pulse with zero value at both endpoints.",
    ],
  };
}
