import {
  validateVehicleTopology,
  type LocalVehicleTopology,
} from "./vehicle-topology.ts";
import type { NormalForceModelKind } from "../physics/normal-force-compressibility.ts";
import type { InducedDragModelKind } from "../physics/induced-drag.ts";

export const LOCAL_PROJECT_SCHEMA_ID = "dev.kestrel-lab.local-project";
export const LOCAL_PROJECT_SCHEMA_VERSION = 1;
export const LOCAL_PROJECT_HISTORY_SCHEMA_ID = "dev.kestrel-lab.local-project-history";
export const LOCAL_PROJECT_STORAGE_KEY = "kestrel.project.arc54.current.v1";
export const LOCAL_PROJECT_HISTORY_STORAGE_KEY = "kestrel.project.arc54.history.v1";
export const DEFAULT_LOCAL_HISTORY_LIMIT = 40;
export const DEFAULT_UNCERTAINTY_SAMPLE_COUNT = 48;
export const DEFAULT_UNCERTAINTY_SEED = "arc54-preview-v1";
export const DEFAULT_WEATHER_SEED = "arc54-weather-v1";

export type ProjectMaterial = "kraft" | "fiberglass" | "carbon";
export type NoseProfile = "ogive" | "conical" | "elliptical";
export type RecoveryDeploymentTrigger = "apogee" | "altitude" | "time";
export type ProjectTerrainModel = "flat" | "planar";

/**
 * A user-supplied mean-wind layer in the local ENU frame. An empty array
 * keeps the deterministic RocketWorks synthetic profile.
 */
export type ProjectWindLayer = Readonly<{
  altitudeM: number;
  eastMps: number;
  northMps: number;
  upMps: number;
}>;

/**
 * A persisted pairwise dependence assumption for uncertainty analyses. The
 * coefficient is interpreted in the latent Gaussian-copula space by the
 * physics adapters; it is not a measured physical correlation.
 */
export type ProjectUncertaintyCorrelation = Readonly<{
  firstParameterKey: string;
  secondParameterKey: string;
  coefficient: number;
}>;

export type EditableProjectInputs = Readonly<{
  lengthMm: number;
  diameterMm: number;
  noseLengthMm: number;
  noseProfile: NoseProfile;
  finCount: number;
  finRootChordMm: number;
  finTipChordMm: number;
  finSweepMm: number;
  finSpanMm: number;
  finThicknessMm: number;
  payloadMassKg: number;
  material: ProjectMaterial;
  thrustN: number;
  burnTimeS: number;
  dragCoefficient: number;
  /** User-facing launch range label carried into environment provenance. */
  launchSiteName: string;
  /** Launch-site latitude in WGS84 degrees. */
  launchLatitudeDeg: number;
  /** Launch-site longitude in WGS84 degrees. */
  launchLongitudeDeg: number;
  launchAltitudeM: number;
  /** Opt-in local ENU Coriolis correction for coupled flight paths. */
  earthRotationEnabled?: boolean;
  /** Opt-in WGS84 normal-gravity correction using launch latitude. */
  normalGravityEnabled?: boolean;
  /** Relation-based 6DOF normal-force compressibility trend. */
  normalForceModel?: NormalForceModelKind;
  /** Optional relation-based quadratic drag-due-to-normal-force polar. */
  inducedDragModel?: InducedDragModelKind;
  /** Caller-authored dimensionless factor in C_D,i = k C_N². */
  inducedDragFactor?: number;
  /** Local ENU terrain contact model used by landing-dispersion descent. */
  terrainModel: ProjectTerrainModel;
  /** Planar terrain rise per metre moving east, expressed as percent. */
  terrainEastSlopePercent: number;
  /** Planar terrain rise per metre moving north, expressed as percent. */
  terrainNorthSlopePercent: number;
  windSpeedMps: number;
  /** Mean-wind azimuth in the local ENU frame: 0° east, +90° north. */
  windAzimuthDeg: number;
  windProfileLayers: ReadonlyArray<ProjectWindLayer>;
  /** Multiplier for the deterministic synthetic turbulence RMS envelope. */
  turbulenceScale: number;
  /** Reproducibility seed for the deterministic launch-environment turbulence field. */
  weatherSeed: string;
  relativeHumidityPercent: number;
  surfacePressureHpa: number;
  surfaceTemperatureC: number;
  launchRailEnabled: boolean;
  launchRailLengthM: number;
  launchRailInclinationDeg: number;
  launchRailAzimuthDeg: number;
  /** Effective axial guide-loss acceleration used by the rail preview. */
  launchRailFrictionAccelerationMps2: number;
  /** Body-frame pitch tip-off rate applied at rail exit, in degrees per second. */
  launchRailTipOffPitchRateDegS: number;
  /** Body-frame yaw tip-off rate applied at rail exit, in degrees per second. */
  launchRailTipOffYawRateDegS: number;
  recoveryEnabled: boolean;
  recoveryDelayS: number;
  /** Seconds from recovery command to fully inflated effective area. */
  recoveryInflationTimeS: number;
  /** Primary recovery command trigger. */
  recoveryDeploymentTrigger: RecoveryDeploymentTrigger;
  /** Descending AGL command altitude when the trigger is altitude. */
  recoveryDeploymentAltitudeM: number;
  /** Mission-time command when the trigger is time. */
  recoveryDeploymentTimeS: number;
  recoveryDiameterM: number;
  recoveryMassKg: number;
  recoveryDeploymentSuccessProbability: number;
  /** Enables the compact browser recovery schedule: start reefed, then linearly open. */
  recoveryReefingEnabled: boolean;
  recoveryReefingDurationS: number;
  recoveryReefingStartAreaFraction: number;
  /** Number of scenarios used by the browser's vertical uncertainty preview. */
  uncertaintySampleCount: number;
  /** Reproducibility seed used by the browser's vertical uncertainty preview. */
  uncertaintySeed: string;
  /** Optional pairwise dependence assumptions shared by preview analyses. */
  uncertaintyCorrelations?: ReadonlyArray<ProjectUncertaintyCorrelation>;
}>;

export type ProjectSourceSelections = Readonly<{
  selectedMotorId: string;
  selectedAerodynamicTableId: string;
}>;

export type LocalProjectSnapshot = Readonly<{
  schema: typeof LOCAL_PROJECT_SCHEMA_ID;
  schemaVersion: typeof LOCAL_PROJECT_SCHEMA_VERSION;
  projectId: string;
  projectName: string;
  revision: number;
  savedAtIso: string;
  inputs: EditableProjectInputs;
  /** Optional in schema v1 for migration; new browser checkpoints include it. */
  topology?: LocalVehicleTopology;
  /** Optional in schema v1 for migration; new browser checkpoints include it. */
  selectedMotorId?: string;
  /** Optional in schema v1 for migration; new browser checkpoints include it. */
  selectedAerodynamicTableId?: string;
}>;

export type ProjectHistoryEntry = Readonly<{
  id: string;
  label: string;
  snapshot: LocalProjectSnapshot;
}>;

export type LocalProjectHistory = Readonly<{
  schema: typeof LOCAL_PROJECT_HISTORY_SCHEMA_ID;
  schemaVersion: typeof LOCAL_PROJECT_SCHEMA_VERSION;
  projectId: string;
  entries: ReadonlyArray<ProjectHistoryEntry>;
}>;

const numericRanges: Readonly<Record<keyof Omit<EditableProjectInputs, "material" | "noseProfile" | "launchSiteName" | "terrainModel" | "windProfileLayers" | "recoveryEnabled" | "recoveryDeploymentTrigger" | "launchRailEnabled" | "recoveryReefingEnabled" | "earthRotationEnabled" | "normalGravityEnabled" | "normalForceModel" | "inducedDragModel" | "inducedDragFactor" | "uncertaintySeed" | "weatherSeed" | "uncertaintyCorrelations">, readonly [number, number]>> = {
  lengthMm: [200, 1600],
  diameterMm: [20, 200],
  noseLengthMm: [40, 600],
  finCount: [2, 12],
  finRootChordMm: [20, 500],
  finTipChordMm: [5, 300],
  finSweepMm: [0, 300],
  finSpanMm: [5, 300],
  finThicknessMm: [0.2, 20],
  payloadMassKg: [0.001, 20],
  thrustN: [1, 5000],
  burnTimeS: [0.1, 30],
  dragCoefficient: [0.1, 2],
  launchLatitudeDeg: [-90, 90],
  launchLongitudeDeg: [-180, 180],
  launchAltitudeM: [-400, 10000],
  terrainEastSlopePercent: [-100, 100],
  terrainNorthSlopePercent: [-100, 100],
  windSpeedMps: [0, 80],
  windAzimuthDeg: [-180, 180],
  turbulenceScale: [0, 3],
  relativeHumidityPercent: [0, 100],
  surfacePressureHpa: [20, 1100],
  surfaceTemperatureC: [-90, 70],
  launchRailLengthM: [0.25, 12],
  launchRailInclinationDeg: [0, 30],
  launchRailAzimuthDeg: [-180, 180],
  launchRailFrictionAccelerationMps2: [0, 50],
  launchRailTipOffPitchRateDegS: [-1145.9, 1145.9],
  launchRailTipOffYawRateDegS: [-1145.9, 1145.9],
  recoveryDelayS: [0, 30],
  recoveryInflationTimeS: [0, 30],
  recoveryDeploymentAltitudeM: [0, 100_000],
  recoveryDeploymentTimeS: [0, 180],
  recoveryDiameterM: [0.1, 3],
  recoveryMassKg: [0.005, 2],
  recoveryDeploymentSuccessProbability: [0, 1],
  recoveryReefingDurationS: [0.1, 30],
  recoveryReefingStartAreaFraction: [0.05, 1],
  uncertaintySampleCount: [16, 512],
};

const numericDefaults: Readonly<Partial<Record<keyof typeof numericRanges, number>>> = {
  noseLengthMm: 180,
  finCount: 3,
  finRootChordMm: 130,
  finTipChordMm: 55,
  finSweepMm: 45,
  finSpanMm: 75,
  finThicknessMm: 3,
  launchRailLengthM: 1.2,
  launchRailInclinationDeg: 0,
  launchRailAzimuthDeg: 0,
  launchRailFrictionAccelerationMps2: 0,
  launchRailTipOffPitchRateDegS: 0,
  launchRailTipOffYawRateDegS: 0,
  relativeHumidityPercent: 60,
  launchLatitudeDeg: -36.85,
  launchLongitudeDeg: 174.76,
  terrainEastSlopePercent: 0,
  terrainNorthSlopePercent: 0,
  surfacePressureHpa: 1004,
  surfaceTemperatureC: 15,
  windAzimuthDeg: 0,
  turbulenceScale: 1,
  recoveryDeploymentAltitudeM: 150,
  recoveryDeploymentTimeS: 8,
  recoveryMassKg: 0.06,
  recoveryDeploymentSuccessProbability: 0.9,
  recoveryInflationTimeS: 1.2,
  recoveryReefingDurationS: 3,
  recoveryReefingStartAreaFraction: 0.35,
  uncertaintySampleCount: DEFAULT_UNCERTAINTY_SAMPLE_COUNT,
};

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function validateUncertaintyCorrelations(value: unknown): ProjectUncertaintyCorrelation[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("uncertaintyCorrelations must be an array.");
  if (value.length > 24) throw new Error("uncertaintyCorrelations cannot contain more than 24 pairs.");
  const seen = new Set<string>();
  return value.map((candidate, index) => {
    const correlation = objectValue(candidate, `uncertaintyCorrelations[${index}]`);
    const firstParameterKey = nonEmptyString(correlation.firstParameterKey, `uncertaintyCorrelations[${index}].firstParameterKey`, 80);
    const secondParameterKey = nonEmptyString(correlation.secondParameterKey, `uncertaintyCorrelations[${index}].secondParameterKey`, 80);
    if (firstParameterKey === secondParameterKey) {
      throw new Error("An uncertainty parameter cannot be correlated with itself.");
    }
    const coefficient = correlation.coefficient;
    if (typeof coefficient !== "number" || !Number.isFinite(coefficient)) {
      throw new Error(`uncertaintyCorrelations[${index}].coefficient must be finite.`);
    }
    if (coefficient <= -0.999 || coefficient >= 0.999) {
      throw new Error("uncertainty correlation coefficients must be strictly between -0.999 and 0.999.");
    }
    const key = [firstParameterKey, secondParameterKey].sort().join("\u0000");
    if (seen.has(key)) throw new Error(`Duplicate uncertainty correlation pair: ${key.replace("\u0000", " / ")}.`);
    seen.add(key);
    return { firstParameterKey, secondParameterKey, coefficient };
  });
}

function validateWindProfileLayers(value: unknown): ProjectWindLayer[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("windProfileLayers must be an array.");
  if (value.length > 32) throw new Error("windProfileLayers cannot contain more than 32 layers.");
  if (value.length === 1) throw new Error("windProfileLayers requires at least two layers when supplied.");
  let previousAltitudeM = -Infinity;
  return value.map((candidate, index) => {
    const layer = objectValue(candidate, `windProfileLayers[${index}]`);
    const numberValue = (value: unknown, label: string): number => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`windProfileLayers[${index}].${label} must be finite.`);
      }
      return value;
    };
    const altitudeM = numberValue(layer.altitudeM, "altitudeM");
    const eastMps = numberValue(layer.eastMps, "eastMps");
    const northMps = numberValue(layer.northMps, "northMps");
    const upMps = numberValue(layer.upMps ?? 0, "upMps");
    for (const [label, component, minimum, maximum] of [
      ["altitudeM", altitudeM, -500, 50_000],
      ["eastMps", eastMps, -200, 200],
      ["northMps", northMps, -200, 200],
      ["upMps", upMps, -100, 100],
    ] as const) {
      if (
        component < minimum ||
        component > maximum
      ) {
        throw new Error(
          `windProfileLayers[${index}].${label} must be a finite value from ${minimum} to ${maximum}.`,
        );
      }
    }
    if (altitudeM <= previousAltitudeM) {
      throw new Error("windProfileLayers altitudes must be strictly increasing.");
    }
    previousAltitudeM = altitudeM;
    return { altitudeM, eastMps, northMps, upMps };
  });
}

function nonEmptyString(value: unknown, label: string, maximumLength = 160): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value.length > maximumLength) throw new Error(`${label} is too long.`);
  return value;
}

function validateProjectSourceSelections(value: Readonly<{
  selectedMotorId?: unknown;
  selectedAerodynamicTableId?: unknown;
}> = {}): ProjectSourceSelections {
  return {
    selectedMotorId: value.selectedMotorId === undefined
      ? "synthetic"
      : nonEmptyString(value.selectedMotorId, "selectedMotorId"),
    selectedAerodynamicTableId: value.selectedAerodynamicTableId === undefined
      ? "constant"
      : nonEmptyString(value.selectedAerodynamicTableId, "selectedAerodynamicTableId"),
  };
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer greater than or equal to ${minimum}.`);
  }
  return value as number;
}

function isoDate(value: unknown, label: string): string {
  const date = nonEmptyString(value, label);
  if (Number.isNaN(Date.parse(date)) || new Date(date).toISOString() !== date) {
    throw new Error(`${label} must be an ISO 8601 UTC timestamp.`);
  }
  return date;
}

export function validateEditableProjectInputs(value: unknown): EditableProjectInputs {
  const input = objectValue(value, "Project inputs");
  const validated = {} as Record<string, number>;
  for (const [key, [minimum, maximum]] of Object.entries(numericRanges)) {
    const candidate = input[key] ?? numericDefaults[key as keyof typeof numericDefaults];
    if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < minimum || candidate > maximum) {
      throw new Error(`${key} must be a finite number from ${minimum} to ${maximum}.`);
    }
    if (key === "finCount" && !Number.isInteger(candidate)) {
      throw new Error("finCount must be an integer from 2 through 12.");
    }
    validated[key] = candidate;
  }
  const noseProfile = input.noseProfile ?? "ogive";
  if (noseProfile !== "ogive" && noseProfile !== "conical" && noseProfile !== "elliptical") {
    throw new Error("noseProfile must be ogive, conical, or elliptical.");
  }
  if (validated.finTipChordMm > validated.finRootChordMm) {
    throw new Error("finTipChordMm cannot exceed finRootChordMm.");
  }
  if (validated.finRootChordMm > validated.lengthMm) {
    throw new Error("finRootChordMm cannot exceed lengthMm.");
  }
  if (validated.finSweepMm + validated.finTipChordMm > validated.finRootChordMm) {
    throw new Error("finSweepMm plus finTipChordMm must remain within finRootChordMm.");
  }
  if (input.material !== "kraft" && input.material !== "fiberglass" && input.material !== "carbon") {
    throw new Error("material must be kraft, fiberglass, or carbon.");
  }
  const launchSiteName = input.launchSiteName === undefined
    ? "ARC 54 synthetic range"
    : nonEmptyString(input.launchSiteName, "launchSiteName", 120);
  if (typeof input.recoveryEnabled !== "boolean") {
    throw new Error("recoveryEnabled must be boolean.");
  }
  const terrainModel = input.terrainModel ?? "flat";
  if (terrainModel !== "flat" && terrainModel !== "planar") {
    throw new Error("terrainModel must be flat or planar.");
  }
  const recoveryDeploymentTrigger = input.recoveryDeploymentTrigger ?? "apogee";
  if (recoveryDeploymentTrigger !== "apogee" && recoveryDeploymentTrigger !== "altitude" && recoveryDeploymentTrigger !== "time") {
    throw new Error("recoveryDeploymentTrigger must be apogee, altitude, or time.");
  }
  const recoveryReefingEnabled = input.recoveryReefingEnabled === undefined ? false : input.recoveryReefingEnabled;
  if (typeof recoveryReefingEnabled !== "boolean") {
    throw new Error("recoveryReefingEnabled must be boolean.");
  }
  const launchRailEnabled = input.launchRailEnabled === undefined ? true : input.launchRailEnabled;
  if (typeof launchRailEnabled !== "boolean") {
    throw new Error("launchRailEnabled must be boolean.");
  }
  const earthRotationEnabled = input.earthRotationEnabled === undefined
    ? false
    : input.earthRotationEnabled;
  if (typeof earthRotationEnabled !== "boolean") {
    throw new Error("earthRotationEnabled must be boolean.");
  }
  const normalGravityEnabled = input.normalGravityEnabled === undefined
    ? false
    : input.normalGravityEnabled;
  if (typeof normalGravityEnabled !== "boolean") {
    throw new Error("normalGravityEnabled must be boolean.");
  }
  const normalForceModel = input.normalForceModel === undefined
    ? "low-speed"
    : input.normalForceModel;
  if (
    normalForceModel !== "low-speed" &&
    normalForceModel !== "prandtl-glauert" &&
    normalForceModel !== "supersonic-linearized"
  ) {
    throw new Error("normalForceModel must be low-speed, prandtl-glauert, or supersonic-linearized.");
  }
  const inducedDragModel = input.inducedDragModel === undefined
    ? "disabled"
    : input.inducedDragModel;
  if (inducedDragModel !== "disabled" && inducedDragModel !== "quadratic-normal-force") {
    throw new Error("inducedDragModel must be disabled or quadratic-normal-force.");
  }
  const inducedDragFactor = input.inducedDragFactor === undefined ? 0 : input.inducedDragFactor;
  if (typeof inducedDragFactor !== "number" || !Number.isFinite(inducedDragFactor) || inducedDragFactor < 0 || inducedDragFactor > 10) {
    throw new Error("inducedDragFactor must be a finite number from 0 through 10.");
  }
  const uncertaintySeed = input.uncertaintySeed === undefined
    ? DEFAULT_UNCERTAINTY_SEED
    : nonEmptyString(input.uncertaintySeed, "uncertaintySeed", 80);
  const weatherSeed = input.weatherSeed === undefined
    ? DEFAULT_WEATHER_SEED
    : nonEmptyString(input.weatherSeed, "weatherSeed", 80);
  return {
    lengthMm: validated.lengthMm,
    diameterMm: validated.diameterMm,
    noseLengthMm: validated.noseLengthMm,
    noseProfile,
    finCount: validated.finCount,
    finRootChordMm: validated.finRootChordMm,
    finTipChordMm: validated.finTipChordMm,
    finSweepMm: validated.finSweepMm,
    finSpanMm: validated.finSpanMm,
    finThicknessMm: validated.finThicknessMm,
    payloadMassKg: validated.payloadMassKg,
    material: input.material,
    thrustN: validated.thrustN,
    burnTimeS: validated.burnTimeS,
    dragCoefficient: validated.dragCoefficient,
    launchSiteName,
    launchLatitudeDeg: validated.launchLatitudeDeg,
    launchLongitudeDeg: validated.launchLongitudeDeg,
    launchAltitudeM: validated.launchAltitudeM,
    ...(input.earthRotationEnabled === undefined ? {} : { earthRotationEnabled }),
    ...(input.normalGravityEnabled === undefined ? {} : { normalGravityEnabled }),
    ...(input.normalForceModel === undefined ? {} : { normalForceModel }),
    ...(input.inducedDragModel === undefined ? {} : { inducedDragModel }),
    ...(input.inducedDragFactor === undefined ? {} : { inducedDragFactor }),
    terrainModel,
    terrainEastSlopePercent: validated.terrainEastSlopePercent,
    terrainNorthSlopePercent: validated.terrainNorthSlopePercent,
    windSpeedMps: validated.windSpeedMps,
    windAzimuthDeg: validated.windAzimuthDeg,
    windProfileLayers: validateWindProfileLayers(input.windProfileLayers),
    turbulenceScale: validated.turbulenceScale,
    weatherSeed,
    relativeHumidityPercent: validated.relativeHumidityPercent,
    surfacePressureHpa: validated.surfacePressureHpa,
    surfaceTemperatureC: validated.surfaceTemperatureC,
    launchRailEnabled,
    launchRailLengthM: validated.launchRailLengthM,
    launchRailInclinationDeg: validated.launchRailInclinationDeg,
    launchRailAzimuthDeg: validated.launchRailAzimuthDeg,
    launchRailFrictionAccelerationMps2: validated.launchRailFrictionAccelerationMps2,
    launchRailTipOffPitchRateDegS: validated.launchRailTipOffPitchRateDegS,
    launchRailTipOffYawRateDegS: validated.launchRailTipOffYawRateDegS,
    recoveryEnabled: input.recoveryEnabled,
    recoveryDelayS: validated.recoveryDelayS,
    recoveryInflationTimeS: validated.recoveryInflationTimeS,
    recoveryDeploymentTrigger,
    recoveryDeploymentAltitudeM: validated.recoveryDeploymentAltitudeM,
    recoveryDeploymentTimeS: validated.recoveryDeploymentTimeS,
    recoveryDiameterM: validated.recoveryDiameterM,
    recoveryMassKg: validated.recoveryMassKg,
    recoveryDeploymentSuccessProbability: validated.recoveryDeploymentSuccessProbability,
    recoveryReefingEnabled,
    recoveryReefingDurationS: validated.recoveryReefingDurationS,
    recoveryReefingStartAreaFraction: validated.recoveryReefingStartAreaFraction,
    uncertaintySampleCount: validated.uncertaintySampleCount,
    uncertaintySeed,
    uncertaintyCorrelations: validateUncertaintyCorrelations(input.uncertaintyCorrelations),
  };
}

export function createLocalProjectSnapshot(input: {
  projectId: string;
  projectName: string;
  revision: number;
  savedAtIso?: string;
  inputs: EditableProjectInputs;
  topology?: LocalVehicleTopology;
  selectedMotorId?: string;
  selectedAerodynamicTableId?: string;
}): LocalProjectSnapshot {
  const sourceSelections = input.selectedMotorId === undefined && input.selectedAerodynamicTableId === undefined
    ? undefined
    : validateProjectSourceSelections(input);
  return {
    schema: LOCAL_PROJECT_SCHEMA_ID,
    schemaVersion: LOCAL_PROJECT_SCHEMA_VERSION,
    projectId: nonEmptyString(input.projectId, "projectId"),
    projectName: nonEmptyString(input.projectName, "projectName"),
    revision: integer(input.revision, "revision", 1),
    savedAtIso: isoDate(input.savedAtIso ?? new Date().toISOString(), "savedAtIso"),
    inputs: validateEditableProjectInputs(input.inputs),
    ...(input.topology === undefined ? {} : { topology: validateVehicleTopology(input.topology) }),
    ...(sourceSelections === undefined ? {} : sourceSelections),
  };
}

function validateSnapshot(value: unknown): LocalProjectSnapshot {
  const snapshot = objectValue(value, "Local project snapshot");
  if (snapshot.schema !== LOCAL_PROJECT_SCHEMA_ID) throw new Error("Unsupported local project schema.");
  if (snapshot.schemaVersion !== LOCAL_PROJECT_SCHEMA_VERSION) throw new Error("Unsupported local project schema version.");
  return createLocalProjectSnapshot({
    projectId: nonEmptyString(snapshot.projectId, "projectId"),
    projectName: nonEmptyString(snapshot.projectName, "projectName"),
    revision: integer(snapshot.revision, "revision", 1),
    savedAtIso: isoDate(snapshot.savedAtIso, "savedAtIso"),
    inputs: validateEditableProjectInputs(snapshot.inputs),
    ...(snapshot.topology === undefined ? {} : { topology: validateVehicleTopology(snapshot.topology) }),
    ...(snapshot.selectedMotorId === undefined && snapshot.selectedAerodynamicTableId === undefined
      ? {}
      : validateProjectSourceSelections(snapshot)),
  });
}

export function serializeLocalProjectSnapshot(snapshot: LocalProjectSnapshot): string {
  return `${JSON.stringify(validateSnapshot(snapshot), null, 2)}\n`;
}

export function parseLocalProjectSnapshot(serialized: string): LocalProjectSnapshot {
  try {
    return validateSnapshot(JSON.parse(serialized));
  } catch (error) {
    throw new Error(`Could not read local project snapshot: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}

export function projectInputFingerprint(inputs: EditableProjectInputs): string {
  return JSON.stringify(validateEditableProjectInputs(inputs));
}

export function projectConfigurationFingerprint(input: Readonly<{
  inputs: EditableProjectInputs;
  topology: LocalVehicleTopology;
  selectedMotorId?: string;
  selectedAerodynamicTableId?: string;
}>): string {
  const sourceSelections = validateProjectSourceSelections(input);
  return JSON.stringify({
    inputs: validateEditableProjectInputs(input.inputs),
    topology: validateVehicleTopology(input.topology),
    ...sourceSelections,
  });
}

const inputLabels: Readonly<Record<keyof EditableProjectInputs, string>> = {
  lengthMm: "airframe length",
  diameterMm: "outer diameter",
  noseLengthMm: "nose length",
  noseProfile: "nose profile",
  finCount: "fin count",
  finRootChordMm: "fin root chord",
  finTipChordMm: "fin tip chord",
  finSweepMm: "fin sweep",
  finSpanMm: "fin span",
  finThicknessMm: "fin thickness",
  payloadMassKg: "payload mass",
  material: "airframe material",
  thrustN: "motor thrust",
  burnTimeS: "burn duration",
  dragCoefficient: "drag coefficient",
  launchSiteName: "launch-site name",
  launchLatitudeDeg: "launch-site latitude",
  launchLongitudeDeg: "launch-site longitude",
  launchAltitudeM: "launch altitude",
  earthRotationEnabled: "Earth rotation correction",
  normalGravityEnabled: "WGS84 normal gravity",
  normalForceModel: "relation normal-force model",
  inducedDragModel: "induced-drag polar model",
  inducedDragFactor: "induced-drag factor",
  terrainModel: "terrain contact model",
  terrainEastSlopePercent: "terrain east slope",
  terrainNorthSlopePercent: "terrain north slope",
  windSpeedMps: "wind speed",
  windAzimuthDeg: "wind azimuth",
  windProfileLayers: "altitude-dependent wind profile",
  turbulenceScale: "turbulence RMS scale",
  weatherSeed: "weather replay seed",
  relativeHumidityPercent: "relative humidity",
  surfacePressureHpa: "surface pressure",
  surfaceTemperatureC: "surface temperature",
  launchRailEnabled: "launch rail constraint",
  launchRailLengthM: "effective rail travel",
  launchRailInclinationDeg: "launch rail inclination",
  launchRailAzimuthDeg: "launch rail azimuth",
  launchRailFrictionAccelerationMps2: "effective guide friction acceleration",
  launchRailTipOffPitchRateDegS: "rail-exit pitch tip-off rate",
  launchRailTipOffYawRateDegS: "rail-exit yaw tip-off rate",
  recoveryEnabled: "recovery system",
  recoveryDelayS: "recovery delay",
  recoveryInflationTimeS: "recovery inflation time",
  recoveryDeploymentTrigger: "recovery deployment trigger",
  recoveryDeploymentAltitudeM: "recovery deployment altitude",
  recoveryDeploymentTimeS: "recovery deployment time",
  recoveryDiameterM: "canopy diameter",
  recoveryMassKg: "recovery packed mass",
  recoveryDeploymentSuccessProbability: "recovery deployment reliability assumption",
  recoveryReefingEnabled: "recovery reefing schedule",
  recoveryReefingDurationS: "recovery reefing duration",
  recoveryReefingStartAreaFraction: "initial reefed canopy area",
  uncertaintySampleCount: "uncertainty scenario count",
  uncertaintySeed: "uncertainty replay seed",
  uncertaintyCorrelations: "uncertainty correlation model",
};

export function describeProjectInputChanges(previous: EditableProjectInputs, current: EditableProjectInputs): string {
  const before = validateEditableProjectInputs(previous);
  const after = validateEditableProjectInputs(current);
  const changed = (Object.keys(inputLabels) as Array<keyof EditableProjectInputs>)
    .filter((key) => key === "uncertaintyCorrelations" || key === "windProfileLayers"
      ? JSON.stringify(before[key] ?? []) !== JSON.stringify(after[key] ?? [])
      : before[key] !== after[key])
    .map((key) => inputLabels[key]);
  if (changed.length === 0) return "No input changes";
  if (changed.length <= 2) return `Changed ${changed.join(" and ")}`;
  return `Changed ${changed.slice(0, 2).join(", ")} +${changed.length - 2} more`;
}

export function describeProjectConfigurationChanges(
  previousInputs: EditableProjectInputs,
  currentInputs: EditableProjectInputs,
  previousTopology: LocalVehicleTopology | undefined,
  currentTopology: LocalVehicleTopology,
  previousSelections?: Partial<ProjectSourceSelections>,
  currentSelections?: Partial<ProjectSourceSelections>,
): string {
  const inputLabel = describeProjectInputChanges(previousInputs, currentInputs);
  const topologyChanged = previousTopology === undefined
    ? true
    : JSON.stringify(validateVehicleTopology(previousTopology)) !== JSON.stringify(validateVehicleTopology(currentTopology));
  const beforeSelections = validateProjectSourceSelections(previousSelections);
  const afterSelections = validateProjectSourceSelections(currentSelections);
  const changedSources = [
    beforeSelections.selectedMotorId !== afterSelections.selectedMotorId ? "motor source" : "",
    beforeSelections.selectedAerodynamicTableId !== afterSelections.selectedAerodynamicTableId ? "aerodynamic source" : "",
  ].filter(Boolean);
  const labels: string[] = [];
  if (inputLabel !== "No input changes") labels.push(inputLabel);
  if (topologyChanged) labels.push("vehicle topology");
  labels.push(...changedSources);
  if (labels.length === 0) return "No input changes";
  if (labels.length === 1 && labels[0] !== "No input changes") {
    return labels[0].startsWith("Changed ") ? labels[0] : `Changed ${labels[0]}`;
  }
  return labels[0].startsWith("Changed ")
    ? `${labels[0]} + ${labels.slice(1).join(" + ")}`
    : `Changed ${labels.join(" + ")}`;
}

export function createEmptyProjectHistory(projectId: string): LocalProjectHistory {
  return {
    schema: LOCAL_PROJECT_HISTORY_SCHEMA_ID,
    schemaVersion: LOCAL_PROJECT_SCHEMA_VERSION,
    projectId: nonEmptyString(projectId, "projectId"),
    entries: [],
  };
}

function validateHistory(value: unknown): LocalProjectHistory {
  const history = objectValue(value, "Local project history");
  if (history.schema !== LOCAL_PROJECT_HISTORY_SCHEMA_ID) throw new Error("Unsupported local project history schema.");
  if (history.schemaVersion !== LOCAL_PROJECT_SCHEMA_VERSION) throw new Error("Unsupported local project history schema version.");
  const projectId = nonEmptyString(history.projectId, "projectId");
  if (!Array.isArray(history.entries)) throw new Error("History entries must be an array.");
  const ids = new Set<string>();
  let priorRevision = 0;
  let priorTime = 0;
  const entries = history.entries.map((value, index) => {
    const entry = objectValue(value, `History entry ${index + 1}`);
    const id = nonEmptyString(entry.id, "history entry id");
    if (ids.has(id)) throw new Error(`Duplicate history entry id: ${id}.`);
    ids.add(id);
    const snapshot = validateSnapshot(entry.snapshot);
    if (snapshot.projectId !== projectId) throw new Error("History snapshot project does not match history project.");
    const time = Date.parse(snapshot.savedAtIso);
    if (snapshot.revision <= priorRevision || time < priorTime) throw new Error("History entries must have increasing revisions and timestamps.");
    priorRevision = snapshot.revision;
    priorTime = time;
    return { id, label: nonEmptyString(entry.label, "history entry label"), snapshot };
  });
  return { schema: LOCAL_PROJECT_HISTORY_SCHEMA_ID, schemaVersion: LOCAL_PROJECT_SCHEMA_VERSION, projectId, entries };
}

export function appendProjectHistory(
  history: LocalProjectHistory,
  snapshot: LocalProjectSnapshot,
  label: string,
  options: Readonly<{ maxEntries?: number; allowDuplicate?: boolean }> = {},
): LocalProjectHistory {
  const current = validateHistory(history);
  const validSnapshot = validateSnapshot(snapshot);
  if (validSnapshot.projectId !== current.projectId) throw new Error("Snapshot project does not match history project.");
  const maxEntries = integer(options.maxEntries ?? DEFAULT_LOCAL_HISTORY_LIMIT, "maxEntries", 1);
  const duplicate = current.entries.at(-1)?.snapshot;
  if (!options.allowDuplicate && duplicate && JSON.stringify({
    inputs: validateEditableProjectInputs(duplicate.inputs),
    topology: duplicate.topology === undefined ? null : validateVehicleTopology(duplicate.topology),
    ...validateProjectSourceSelections(duplicate),
  }) === JSON.stringify({
    inputs: validSnapshot.inputs,
    topology: validSnapshot.topology === undefined ? null : validateVehicleTopology(validSnapshot.topology),
    ...validateProjectSourceSelections(validSnapshot),
  })) return current;
  const last = current.entries.at(-1)?.snapshot;
  if (last && (validSnapshot.revision <= last.revision || Date.parse(validSnapshot.savedAtIso) < Date.parse(last.savedAtIso))) {
    throw new Error("New history snapshots must have increasing revisions and timestamps.");
  }
  const entry = { id: `${validSnapshot.revision}-${validSnapshot.savedAtIso}`, label: nonEmptyString(label, "history entry label"), snapshot: validSnapshot };
  return { ...current, entries: [...current.entries, entry].slice(-maxEntries) };
}

export function serializeLocalProjectHistory(history: LocalProjectHistory): string {
  return `${JSON.stringify(validateHistory(history), null, 2)}\n`;
}

export function parseLocalProjectHistory(serialized: string): LocalProjectHistory {
  try {
    return validateHistory(JSON.parse(serialized));
  } catch (error) {
    throw new Error(`Could not read local project history: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}
