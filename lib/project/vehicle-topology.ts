export const LOCAL_VEHICLE_TOPOLOGY_SCHEMA_ID = "dev.kestrel-lab.local-vehicle-topology";
export const LOCAL_VEHICLE_TOPOLOGY_SCHEMA_VERSION = 1;
export const LOCAL_VEHICLE_TOPOLOGY_STORAGE_KEY = "kestrel.project.arc54.vehicle-topology.v1";
export const MAX_VEHICLE_STAGES = 8;

export type VehicleStageRole = "core" | "upper" | "booster" | "payload";
export type VehicleStageAttachment = "serial" | "parallel";

/** Optional recovery hardware carried by a detachable stage. */
export type VehicleStageRecoveryPlan = Readonly<{
  enabled: boolean;
  diameterM: number;
  deploymentDelayS: number;
}>;

export type VehicleStagePlan = Readonly<{
  id: string;
  name: string;
  role: VehicleStageRole;
  attachment: VehicleStageAttachment;
  parentStageId?: string;
  motorId?: string;
  aerodynamicTableId?: string;
  /** Optional body-length override for generated preview geometry, in metres. */
  bodyLengthM?: number;
  /** Optional outer-diameter override for generated preview geometry, in metres. */
  diameterM?: number;
  /** Optional nose-length override for generated preview geometry, in metres. */
  noseLengthM?: number;
  enabled: boolean;
  repeatCount: number;
  repeatRadiusM: number;
  thrustCantAngleDeg: number;
  thrustCantAzimuthDeg: number;
  ignitionDelayS: number;
  separationDelayS: number;
  /** Retained-body axial separation delta-v in m/s (+X nose direction). */
  separationDeltaVBodyMps?: number;
  ignitionFailure: boolean;
  /** Zero-based radial motor instance indices that are configured not to ignite. */
  failedMotorInstanceIndices: readonly number[];
  /** Optional recovery canopy carried by this stage after separation. */
  recovery?: VehicleStageRecoveryPlan;
}>;

export type VehicleThrustAxis = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

/**
 * Derive a unit body-frame thrust axis from the topology editor's bounded
 * cant controls. Radial instances rotate the requested azimuth with their
 * placement so identical booster settings remain symmetric.
 */
export function stageThrustAxisBody(
  stage: Pick<VehicleStagePlan, "repeatCount" | "thrustCantAngleDeg" | "thrustCantAzimuthDeg">,
  instanceIndex = 0,
): VehicleThrustAxis {
  const cantAngleRad = (stage.thrustCantAngleDeg * Math.PI) / 180;
  if (!(cantAngleRad > 0)) return { x: -1, y: 0, z: 0 };
  const instanceAzimuthRad = (2 * Math.PI * instanceIndex) / Math.max(stage.repeatCount, 1);
  const azimuthRad = (stage.thrustCantAzimuthDeg * Math.PI) / 180 + instanceAzimuthRad;
  const transverse = Math.sin(cantAngleRad);
  return {
    x: -Math.cos(cantAngleRad),
    y: transverse * Math.cos(azimuthRad),
    z: transverse * Math.sin(azimuthRad),
  };
}

export type LocalVehicleTopology = Readonly<{
  schema: typeof LOCAL_VEHICLE_TOPOLOGY_SCHEMA_ID;
  schemaVersion: typeof LOCAL_VEHICLE_TOPOLOGY_SCHEMA_VERSION;
  vehicleId: string;
  stages: ReadonlyArray<VehicleStagePlan>;
}>;

const ID_PATTERN = /^[A-Za-z0-9_.-]+$/;
const ROLES = new Set<VehicleStageRole>(["core", "upper", "booster", "payload"]);
const ATTACHMENTS = new Set<VehicleStageAttachment>(["serial", "parallel"]);

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function validString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function validStage(value: unknown, index: number): VehicleStagePlan {
  const stage = objectValue(value, `Stage ${index + 1}`);
  const id = validString(stage.id, `Stage ${index + 1} id`);
  if (!ID_PATTERN.test(id)) throw new Error(`Stage ${id} id may contain only letters, numbers, underscores, and hyphens.`);
  const name = validString(stage.name, `Stage ${id} name`);
  if (!ROLES.has(stage.role as VehicleStageRole)) throw new Error(`Stage ${id} role is invalid.`);
  if (!ATTACHMENTS.has(stage.attachment as VehicleStageAttachment)) throw new Error(`Stage ${id} attachment is invalid.`);
  if (typeof stage.enabled !== "boolean") throw new Error(`Stage ${id} enabled must be boolean.`);
  if (!Number.isInteger(stage.repeatCount) || (stage.repeatCount as number) < 1 || (stage.repeatCount as number) > 8) {
    throw new Error(`Stage ${id} repeatCount must be an integer from 1 through 8.`);
  }
  if (typeof stage.repeatRadiusM !== "number" || !Number.isFinite(stage.repeatRadiusM) || stage.repeatRadiusM < 0 || stage.repeatRadiusM > 2) {
    throw new Error(`Stage ${id} repeatRadiusM must be a finite value from 0 through 2 m.`);
  }
  const thrustCantAngleDeg = stage.thrustCantAngleDeg ?? 0;
  if (typeof thrustCantAngleDeg !== "number" || !Number.isFinite(thrustCantAngleDeg) || thrustCantAngleDeg < 0 || thrustCantAngleDeg > 15) {
    throw new Error(`Stage ${id} thrustCantAngleDeg must be a finite value from 0 through 15 degrees.`);
  }
  const thrustCantAzimuthDeg = stage.thrustCantAzimuthDeg ?? 0;
  if (typeof thrustCantAzimuthDeg !== "number" || !Number.isFinite(thrustCantAzimuthDeg) || thrustCantAzimuthDeg < -180 || thrustCantAzimuthDeg > 180) {
    throw new Error(`Stage ${id} thrustCantAzimuthDeg must be a finite value from -180 through 180 degrees.`);
  }
  if (stage.parentStageId !== undefined && (typeof stage.parentStageId !== "string" || !ID_PATTERN.test(stage.parentStageId))) {
    throw new Error(`Stage ${id} parentStageId is invalid.`);
  }
  if (stage.motorId !== undefined && (typeof stage.motorId !== "string" || !ID_PATTERN.test(stage.motorId))) {
    throw new Error(`Stage ${id} motorId is invalid.`);
  }
  if (stage.aerodynamicTableId !== undefined && (typeof stage.aerodynamicTableId !== "string" || !ID_PATTERN.test(stage.aerodynamicTableId))) {
    throw new Error(`Stage ${id} aerodynamicTableId is invalid.`);
  }
  const bodyLengthM = stage.bodyLengthM;
  if (bodyLengthM !== undefined && (typeof bodyLengthM !== "number" || !Number.isFinite(bodyLengthM) || bodyLengthM < 0.05 || bodyLengthM > 10)) {
    throw new Error(`Stage ${id} bodyLengthM must be a finite value from 0.05 through 10 m.`);
  }
  const diameterM = stage.diameterM;
  if (diameterM !== undefined && (typeof diameterM !== "number" || !Number.isFinite(diameterM) || diameterM < 0.02 || diameterM > 2)) {
    throw new Error(`Stage ${id} diameterM must be a finite value from 0.02 through 2 m.`);
  }
  const noseLengthM = stage.noseLengthM;
  if (noseLengthM !== undefined && (typeof noseLengthM !== "number" || !Number.isFinite(noseLengthM) || noseLengthM < 0.01 || noseLengthM > 3)) {
    throw new Error(`Stage ${id} noseLengthM must be a finite value from 0.01 through 3 m.`);
  }
  if (bodyLengthM !== undefined && noseLengthM !== undefined && noseLengthM > bodyLengthM * 2) {
    throw new Error(`Stage ${id} noseLengthM cannot exceed twice bodyLengthM.`);
  }
  const ignitionDelayS = stage.ignitionDelayS ?? 0;
  if (typeof ignitionDelayS !== "number" || !Number.isFinite(ignitionDelayS) || ignitionDelayS < 0 || ignitionDelayS > 120) {
    throw new Error(`Stage ${id} ignitionDelayS must be a finite value from 0 through 120 s.`);
  }
  const separationDelayS = stage.separationDelayS ?? 0.1;
  if (typeof separationDelayS !== "number" || !Number.isFinite(separationDelayS) || separationDelayS < 0 || separationDelayS > 120) {
    throw new Error(`Stage ${id} separationDelayS must be a finite value from 0 through 120 s.`);
  }
  const separationDeltaVBodyMps = stage.separationDeltaVBodyMps ?? 0;
  if (typeof separationDeltaVBodyMps !== "number" || !Number.isFinite(separationDeltaVBodyMps) || separationDeltaVBodyMps < 0 || separationDeltaVBodyMps > 30) {
    throw new Error(`Stage ${id} separationDeltaVBodyMps must be a finite value from 0 through 30 m/s.`);
  }
  const ignitionFailure = stage.ignitionFailure ?? false;
  if (typeof ignitionFailure !== "boolean") throw new Error(`Stage ${id} ignitionFailure must be boolean.`);
  const failedMotorInstanceIndices = stage.failedMotorInstanceIndices ?? [];
  if (!Array.isArray(failedMotorInstanceIndices)) {
    throw new Error(`Stage ${id} failedMotorInstanceIndices must be an array.`);
  }
  if (stage.role === "payload" && failedMotorInstanceIndices.length > 0) {
    throw new Error(`Payload stage ${id} cannot configure failed motors.`);
  }
  const motorInstanceCount = stage.attachment === "parallel" ? stage.repeatCount as number : 1;
  const failedMotorSet = new Set<number>();
  for (const value of failedMotorInstanceIndices) {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= motorInstanceCount) {
      throw new Error(`Stage ${id} failedMotorInstanceIndices must contain unique motor indices from 0 through ${motorInstanceCount - 1}.`);
    }
    if (failedMotorSet.has(value as number)) {
      throw new Error(`Stage ${id} failedMotorInstanceIndices must not contain duplicates.`);
    }
    failedMotorSet.add(value as number);
  }
  const recoveryValue = stage.recovery;
  let recovery: VehicleStageRecoveryPlan | undefined;
  if (recoveryValue !== undefined) {
    const recoveryObject = objectValue(recoveryValue, `Stage ${id} recovery`);
    const enabled = recoveryObject.enabled ?? false;
    if (typeof enabled !== "boolean") throw new Error(`Stage ${id} recovery enabled must be boolean.`);
    const recoveryDiameterM = recoveryObject.diameterM ?? 0.45;
    if (
      typeof recoveryDiameterM !== "number" ||
      !Number.isFinite(recoveryDiameterM) ||
      recoveryDiameterM < 0.05 ||
      recoveryDiameterM > 3
    ) {
      throw new Error(`Stage ${id} recovery diameterM must be a finite value from 0.05 through 3 m.`);
    }
    const deploymentDelayS = recoveryObject.deploymentDelayS ?? 0;
    if (
      typeof deploymentDelayS !== "number" ||
      !Number.isFinite(deploymentDelayS) ||
      deploymentDelayS < 0 ||
      deploymentDelayS > 60
    ) {
      throw new Error(`Stage ${id} recovery deploymentDelayS must be a finite value from 0 through 60 s.`);
    }
    recovery = { enabled, diameterM: recoveryDiameterM, deploymentDelayS };
  }
  return {
    id,
    name,
    role: stage.role as VehicleStageRole,
    attachment: stage.attachment as VehicleStageAttachment,
    ...(stage.parentStageId ? { parentStageId: stage.parentStageId } : {}),
    ...(stage.motorId ? { motorId: stage.motorId } : {}),
    ...(stage.aerodynamicTableId ? { aerodynamicTableId: stage.aerodynamicTableId } : {}),
    ...(bodyLengthM === undefined ? {} : { bodyLengthM }),
    ...(diameterM === undefined ? {} : { diameterM }),
    ...(noseLengthM === undefined ? {} : { noseLengthM }),
    enabled: stage.enabled,
    repeatCount: stage.repeatCount as number,
    repeatRadiusM: stage.repeatRadiusM,
    thrustCantAngleDeg,
    thrustCantAzimuthDeg,
    ignitionDelayS,
    separationDelayS,
    separationDeltaVBodyMps,
    ignitionFailure,
    failedMotorInstanceIndices: [...failedMotorSet].sort((left, right) => left - right),
    ...(recovery ? { recovery } : {}),
  };
}

export function validateVehicleTopology(value: unknown): LocalVehicleTopology {
  const topology = objectValue(value, "Vehicle topology");
  if (topology.schema !== LOCAL_VEHICLE_TOPOLOGY_SCHEMA_ID) throw new Error("Unsupported vehicle topology schema.");
  if (topology.schemaVersion !== LOCAL_VEHICLE_TOPOLOGY_SCHEMA_VERSION) throw new Error("Unsupported vehicle topology schema version.");
  const vehicleId = validString(topology.vehicleId, "Vehicle topology vehicleId");
  if (!ID_PATTERN.test(vehicleId)) throw new Error("Vehicle topology vehicleId is invalid.");
  if (!Array.isArray(topology.stages) || topology.stages.length < 1 || topology.stages.length > MAX_VEHICLE_STAGES) {
    throw new Error(`Vehicle topology requires 1 through ${MAX_VEHICLE_STAGES} stages.`);
  }
  const stages = topology.stages.map(validStage);
  const ids = new Set<string>();
  for (const [index, stage] of stages.entries()) {
    if (ids.has(stage.id)) throw new Error(`Duplicate vehicle stage identifier ${stage.id}.`);
    ids.add(stage.id);
    if (index === 0 && stage.role !== "core") throw new Error("The first vehicle stage must have the core role.");
    if (stage.attachment === "parallel" && !stage.parentStageId) throw new Error(`Parallel stage ${stage.id} requires a parent stage.`);
    if (stage.parentStageId && !ids.has(stage.parentStageId)) throw new Error(`Stage ${stage.id} parent must appear earlier in the topology.`);
  }
  return { schema: LOCAL_VEHICLE_TOPOLOGY_SCHEMA_ID, schemaVersion: LOCAL_VEHICLE_TOPOLOGY_SCHEMA_VERSION, vehicleId, stages };
}

export function createDefaultVehicleTopology(): LocalVehicleTopology {
  return {
    schema: LOCAL_VEHICLE_TOPOLOGY_SCHEMA_ID,
    schemaVersion: LOCAL_VEHICLE_TOPOLOGY_SCHEMA_VERSION,
    vehicleId: "arc54",
    stages: [{
      id: "sustainer",
      name: "Sustainer",
      role: "core",
      attachment: "serial",
      enabled: true,
      repeatCount: 1,
      repeatRadiusM: 0,
      thrustCantAngleDeg: 0,
      thrustCantAzimuthDeg: 0,
      ignitionDelayS: 0,
      separationDelayS: 0.1,
      separationDeltaVBodyMps: 0,
      ignitionFailure: false,
      failedMotorInstanceIndices: [],
    }],
  };
}

export function serializeVehicleTopology(topology: LocalVehicleTopology): string {
  return `${JSON.stringify(validateVehicleTopology(topology), null, 2)}\n`;
}

export function parseVehicleTopology(serialized: string): LocalVehicleTopology {
  try {
    return validateVehicleTopology(JSON.parse(serialized));
  } catch (error) {
    throw new Error(`Could not read vehicle topology: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}

export function createStagePlan(input: Readonly<{
  id: string;
  name: string;
  role: VehicleStageRole;
  attachment: VehicleStageAttachment;
  parentStageId?: string;
  motorId?: string;
  aerodynamicTableId?: string;
  bodyLengthM?: number;
  diameterM?: number;
  noseLengthM?: number;
  repeatCount?: number;
  repeatRadiusM?: number;
  thrustCantAngleDeg?: number;
  thrustCantAzimuthDeg?: number;
  ignitionDelayS?: number;
  separationDelayS?: number;
  separationDeltaVBodyMps?: number;
  ignitionFailure?: boolean;
  failedMotorInstanceIndices?: readonly number[];
  recovery?: VehicleStageRecoveryPlan;
}>): VehicleStagePlan {
  return validStage({
    ...input,
    enabled: true,
    repeatCount: input.repeatCount ?? 1,
    repeatRadiusM: input.repeatRadiusM ?? 0,
    thrustCantAngleDeg: input.thrustCantAngleDeg ?? 0,
    thrustCantAzimuthDeg: input.thrustCantAzimuthDeg ?? 0,
    ignitionDelayS: input.ignitionDelayS ?? 0,
    separationDelayS: input.separationDelayS ?? 0.1,
    separationDeltaVBodyMps: input.separationDeltaVBodyMps ?? 0,
    ignitionFailure: input.ignitionFailure ?? false,
    failedMotorInstanceIndices: input.failedMotorInstanceIndices ?? [],
  }, 0);
}
