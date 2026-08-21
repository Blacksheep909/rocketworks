import type { StageFlightPreviewResult } from "../physics/stage-flight-preview.ts";
import type { VerticalFlightResult } from "../physics/vertical-flight.ts";

/**
 * A browser-local comparison reference is deliberately separate from project
 * inputs, checkpoints, and workspace backups. It keeps the completed result
 * needed for a review delta, but never changes the engineering state or
 * implies cloud synchronization.
 */
export const LOCAL_SIMULATION_REFERENCE_SCHEMA_ID =
  "dev.kestrel-lab.local-simulation-reference";
export const LOCAL_SIMULATION_REFERENCE_SCHEMA_VERSION = 1;
export const LOCAL_SIMULATION_REFERENCE_STORAGE_PREFIX =
  "kestrel.project.simulation-reference";
export const LOCAL_SIMULATION_REFERENCE_MAX_SERIALIZED_LENGTH = 4_000_000;

export type SimulationReferenceKind = "vertical" | "staged";

export type LocalSimulationReference<T extends object> = Readonly<{
  schema: typeof LOCAL_SIMULATION_REFERENCE_SCHEMA_ID;
  schemaVersion: typeof LOCAL_SIMULATION_REFERENCE_SCHEMA_VERSION;
  projectId: string;
  projectName: string;
  kind: SimulationReferenceKind;
  savedAtIso: string;
  fingerprint: string;
  result: T;
}>;

export type LocalVerticalSimulationReference = LocalSimulationReference<VerticalFlightResult>;
export type LocalStagedSimulationReference = LocalSimulationReference<StageFlightPreviewResult>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (value.length > maximumLength) {
    throw new Error(`${label} must be ${maximumLength} characters or fewer`);
  }
  return value;
}

function isoDate(value: unknown, label: string): string {
  const normalized = nonEmptyString(value, label, 80);
  if (Number.isNaN(Date.parse(normalized)) || new Date(normalized).toISOString() !== normalized) {
    throw new Error(`${label} must be a canonical ISO 8601 UTC timestamp`);
  }
  return normalized;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
  return value;
}

function finiteOrNull(value: unknown, label: string): number | null {
  if (value === null) return null;
  return finiteNumber(value, label);
}

function arrayValue(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function validateVerticalResult(value: unknown): VerticalFlightResult {
  const result = objectValue(value, "vertical simulation reference result");
  finiteNumber(result.apogeeM, "vertical reference apogeeM");
  finiteNumber(result.maxSpeedMps, "vertical reference maxSpeedMps");
  finiteNumber(result.maxDynamicPressurePa, "vertical reference maxDynamicPressurePa");
  finiteNumber(result.timeToApogeeS, "vertical reference timeToApogeeS");
  finiteNumber(result.totalFlightTimeS, "vertical reference totalFlightTimeS");
  finiteOrNull(result.impactSpeedMps, "vertical reference impactSpeedMps");
  arrayValue(result.trace, "vertical reference trace");
  arrayValue(result.events, "vertical reference events");
  nonEmptyString(result.modelVersion, "vertical reference modelVersion", 200);
  nonEmptyString(result.validationStatus, "vertical reference validationStatus", 120);
  return value as VerticalFlightResult;
}

function validateStagedResult(value: unknown): StageFlightPreviewResult {
  const result = objectValue(value, "staged simulation reference result");
  finiteNumber(result.maxAltitudeAglM, "staged reference maxAltitudeAglM");
  finiteNumber(result.maxSpeedMps, "staged reference maxSpeedMps");
  finiteNumber(result.timeToApogeeS, "staged reference timeToApogeeS");
  arrayValue(result.trace, "staged reference trace");
  arrayValue(result.events, "staged reference events");
  arrayValue(result.separatedBodies, "staged reference separatedBodies");
  nonEmptyString(result.modelVersion, "staged reference modelVersion", 200);
  nonEmptyString(result.validationStatus, "staged reference validationStatus", 120);
  return value as StageFlightPreviewResult;
}

function validateReference<T extends object>(
  value: unknown,
  kind: SimulationReferenceKind,
): LocalSimulationReference<T> {
  const reference = objectValue(value, "simulation reference");
  if (reference.schema !== LOCAL_SIMULATION_REFERENCE_SCHEMA_ID) {
    throw new Error("Unsupported simulation reference schema");
  }
  if (reference.schemaVersion !== LOCAL_SIMULATION_REFERENCE_SCHEMA_VERSION) {
    throw new Error("Unsupported simulation reference schema version");
  }
  if (reference.kind !== kind) {
    throw new Error(`Simulation reference kind must be ${kind}`);
  }
  const projectId = nonEmptyString(reference.projectId, "simulation reference projectId", 64);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)) {
    throw new Error("simulation reference projectId contains unsupported characters");
  }
  const projectName = nonEmptyString(reference.projectName, "simulation reference projectName", 120);
  const savedAtIso = isoDate(reference.savedAtIso, "simulation reference savedAtIso");
  const fingerprint = nonEmptyString(reference.fingerprint, "simulation reference fingerprint", 1_000_000);
  const result = kind === "vertical"
    ? validateVerticalResult(reference.result)
    : validateStagedResult(reference.result);
  return {
    schema: LOCAL_SIMULATION_REFERENCE_SCHEMA_ID,
    schemaVersion: LOCAL_SIMULATION_REFERENCE_SCHEMA_VERSION,
    projectId,
    projectName,
    kind,
    savedAtIso,
    fingerprint,
    result: result as T,
  };
}

export function createVerticalSimulationReference(input: Readonly<{
  projectId: string;
  projectName: string;
  fingerprint: string;
  result: VerticalFlightResult;
  savedAtIso?: string;
}>): LocalVerticalSimulationReference {
  return validateReference({
    schema: LOCAL_SIMULATION_REFERENCE_SCHEMA_ID,
    schemaVersion: LOCAL_SIMULATION_REFERENCE_SCHEMA_VERSION,
    projectId: input.projectId,
    projectName: input.projectName,
    kind: "vertical",
    savedAtIso: input.savedAtIso ?? new Date().toISOString(),
    fingerprint: input.fingerprint,
    result: input.result,
  }, "vertical");
}

export function createStagedSimulationReference(input: Readonly<{
  projectId: string;
  projectName: string;
  fingerprint: string;
  result: StageFlightPreviewResult;
  savedAtIso?: string;
}>): LocalStagedSimulationReference {
  return validateReference({
    schema: LOCAL_SIMULATION_REFERENCE_SCHEMA_ID,
    schemaVersion: LOCAL_SIMULATION_REFERENCE_SCHEMA_VERSION,
    projectId: input.projectId,
    projectName: input.projectName,
    kind: "staged",
    savedAtIso: input.savedAtIso ?? new Date().toISOString(),
    fingerprint: input.fingerprint,
    result: input.result,
  }, "staged");
}

export function serializeVerticalSimulationReference(
  reference: LocalVerticalSimulationReference,
): string {
  return serializeSimulationReference(validateReference(reference, "vertical"));
}

export function serializeStagedSimulationReference(
  reference: LocalStagedSimulationReference,
): string {
  return serializeSimulationReference(validateReference(reference, "staged"));
}

function serializeSimulationReference<T extends object>(
  reference: LocalSimulationReference<T>,
): string {
  const serialized = `${JSON.stringify(reference)}\n`;
  if (serialized.length > LOCAL_SIMULATION_REFERENCE_MAX_SERIALIZED_LENGTH) {
    throw new Error("simulation reference is too large for browser-local persistence");
  }
  return serialized;
}

export function parseVerticalSimulationReference(
  serialized: string,
): LocalVerticalSimulationReference {
  try {
    if (serialized.length > LOCAL_SIMULATION_REFERENCE_MAX_SERIALIZED_LENGTH) {
      throw new Error("simulation reference exceeds the browser-local size limit");
    }
    return validateReference(JSON.parse(serialized), "vertical");
  } catch (error) {
    throw new Error(`Could not read vertical simulation reference: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}

export function parseStagedSimulationReference(
  serialized: string,
): LocalStagedSimulationReference {
  try {
    if (serialized.length > LOCAL_SIMULATION_REFERENCE_MAX_SERIALIZED_LENGTH) {
      throw new Error("simulation reference exceeds the browser-local size limit");
    }
    return validateReference(JSON.parse(serialized), "staged");
  } catch (error) {
    throw new Error(`Could not read staged simulation reference: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}

export function simulationReferenceStorageKey(
  projectId: string,
  kind: SimulationReferenceKind,
): string {
  if (kind !== "vertical" && kind !== "staged") {
    throw new Error("simulation reference kind must be vertical or staged");
  }
  const normalized = nonEmptyString(projectId, "simulation reference projectId", 64);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new Error("simulation reference projectId contains unsupported characters");
  }
  return `${LOCAL_SIMULATION_REFERENCE_STORAGE_PREFIX}.${normalized}.${kind}.v${LOCAL_SIMULATION_REFERENCE_SCHEMA_VERSION}`;
}
