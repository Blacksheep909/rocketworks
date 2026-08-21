import {
  parseLocalSimulationRunLibrary,
  serializeLocalSimulationRunLibrary,
  validateLocalSimulationRunLibrary,
  type LocalSimulationRunLibrary,
} from "../project/simulation-run-library.ts";

/**
 * A portable catalog handoff for named local simulation runs. This envelope
 * carries validated result records only; it never contains editable project
 * inputs, user libraries, credentials, or a simulation engine.
 */
export const SIMULATION_RUN_LIBRARY_EXPORT_SCHEMA =
  "rocketworks.simulation-run-library";
export const SIMULATION_RUN_LIBRARY_EXPORT_SCHEMA_VERSION = 1;
export const SIMULATION_RUN_LIBRARY_EXPORT_MODEL_VERSION =
  "rocketworks-simulation-run-library-export-0.1.0";
export const SIMULATION_RUN_LIBRARY_EXPORT_REVIEW_BOUNDARY =
  "Simulation result handoff only; not validation, certification, or flight-safety evidence.";
export const MAX_SIMULATION_RUN_LIBRARY_EXPORT_LENGTH = 4_700_000;

export type SimulationRunLibraryExport = Readonly<{
  schema: typeof SIMULATION_RUN_LIBRARY_EXPORT_SCHEMA;
  schemaVersion: typeof SIMULATION_RUN_LIBRARY_EXPORT_SCHEMA_VERSION;
  exportModelVersion: typeof SIMULATION_RUN_LIBRARY_EXPORT_MODEL_VERSION;
  reviewBoundary: typeof SIMULATION_RUN_LIBRARY_EXPORT_REVIEW_BOUNDARY;
  exportedAtIso: string;
  sourceProjectId: string;
  sourceProjectName: string;
  library: LocalSimulationRunLibrary;
}>;

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
  return value.trim();
}

function isoDate(value: unknown, label: string): string {
  const normalized = nonEmptyString(value, label, 80);
  if (Number.isNaN(Date.parse(normalized)) || new Date(normalized).toISOString() !== normalized) {
    throw new Error(`${label} must be a canonical ISO 8601 UTC timestamp`);
  }
  return normalized;
}

function serializeEnvelope(envelope: SimulationRunLibraryExport): string {
  const serialized = `${JSON.stringify(envelope)}\n`;
  if (serialized.length > MAX_SIMULATION_RUN_LIBRARY_EXPORT_LENGTH) {
    throw new Error("simulation run library export exceeds the portable size limit");
  }
  return serialized;
}

function createEnvelope(
  library: LocalSimulationRunLibrary,
  exportedAtIso: string,
): SimulationRunLibraryExport {
  const validated = validateLocalSimulationRunLibrary(library);
  return {
    schema: SIMULATION_RUN_LIBRARY_EXPORT_SCHEMA,
    schemaVersion: SIMULATION_RUN_LIBRARY_EXPORT_SCHEMA_VERSION,
    exportModelVersion: SIMULATION_RUN_LIBRARY_EXPORT_MODEL_VERSION,
    reviewBoundary: SIMULATION_RUN_LIBRARY_EXPORT_REVIEW_BOUNDARY,
    exportedAtIso: isoDate(exportedAtIso, "exportedAtIso"),
    sourceProjectId: validated.projectId,
    sourceProjectName: validated.projectName,
    library: JSON.parse(serializeLocalSimulationRunLibrary(validated)) as LocalSimulationRunLibrary,
  };
}

export function createSimulationRunLibraryExport(
  library: LocalSimulationRunLibrary,
  exportedAtIso = new Date().toISOString(),
): string {
  return serializeEnvelope(createEnvelope(library, exportedAtIso));
}

function parseEnvelope(serialized: string): SimulationRunLibraryExport {
  if (typeof serialized !== "string" || serialized.length === 0) {
    throw new Error("simulation run library export must be text");
  }
  if (serialized.length > MAX_SIMULATION_RUN_LIBRARY_EXPORT_LENGTH) {
    throw new Error("simulation run library export exceeds the portable size limit");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("simulation run library export is not valid JSON");
  }
  const envelope = objectValue(parsed, "simulation run library export");
  if (envelope.schema !== SIMULATION_RUN_LIBRARY_EXPORT_SCHEMA) {
    throw new Error("Unsupported simulation run library export schema");
  }
  if (envelope.schemaVersion !== SIMULATION_RUN_LIBRARY_EXPORT_SCHEMA_VERSION) {
    throw new Error("Unsupported simulation run library export schema version");
  }
  if (envelope.exportModelVersion !== SIMULATION_RUN_LIBRARY_EXPORT_MODEL_VERSION) {
    throw new Error(`Unsupported simulation run library export model: ${String(envelope.exportModelVersion)}`);
  }
  if (envelope.reviewBoundary !== SIMULATION_RUN_LIBRARY_EXPORT_REVIEW_BOUNDARY) {
    throw new Error("Simulation run library export boundary is not recognized");
  }
  const exportedAtIso = isoDate(envelope.exportedAtIso, "exportedAtIso");
  const sourceProjectId = nonEmptyString(envelope.sourceProjectId, "sourceProjectId", 64);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sourceProjectId)) {
    throw new Error("sourceProjectId contains unsupported characters");
  }
  const sourceProjectName = nonEmptyString(envelope.sourceProjectName, "sourceProjectName", 120);
  const library = parseLocalSimulationRunLibrary(JSON.stringify(envelope.library));
  if (library.projectId !== sourceProjectId) {
    throw new Error("simulation run library export project scope does not match its source identity");
  }
  if (library.projectName !== sourceProjectName) {
    throw new Error("simulation run library export project name does not match its source identity");
  }
  return {
    schema: SIMULATION_RUN_LIBRARY_EXPORT_SCHEMA,
    schemaVersion: SIMULATION_RUN_LIBRARY_EXPORT_SCHEMA_VERSION,
    exportModelVersion: SIMULATION_RUN_LIBRARY_EXPORT_MODEL_VERSION,
    reviewBoundary: SIMULATION_RUN_LIBRARY_EXPORT_REVIEW_BOUNDARY,
    exportedAtIso,
    sourceProjectId,
    sourceProjectName,
    library,
  };
}

export function parseSimulationRunLibraryExport(
  serialized: string,
): SimulationRunLibraryExport {
  try {
    return parseEnvelope(serialized);
  } catch (error) {
    throw new Error(`Could not read simulation run library export: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}
