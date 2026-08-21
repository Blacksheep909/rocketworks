import {
  LOCAL_SIMULATION_REFERENCE_SCHEMA_ID,
  LOCAL_SIMULATION_REFERENCE_SCHEMA_VERSION,
  createStagedSimulationReference,
  createVerticalSimulationReference,
  type LocalStagedSimulationReference,
  type LocalVerticalSimulationReference,
} from "./simulation-reference.ts";
import type { StageFlightPreviewResult } from "../physics/stage-flight-preview.ts";
import type { VerticalFlightResult } from "../physics/vertical-flight.ts";

/**
 * A small browser-local catalog for completed simulation decisions. It is
 * deliberately separate from editable project inputs and from the single
 * pinned comparison reference, so deleting a catalog entry never changes a
 * design or its current comparison state.
 */
export const LOCAL_SIMULATION_RUN_LIBRARY_SCHEMA_ID =
  "dev.kestrel-lab.local-simulation-run-library";
export const LOCAL_SIMULATION_RUN_LIBRARY_SCHEMA_VERSION = 1;
export const LOCAL_SIMULATION_RUN_LIBRARY_STORAGE_PREFIX =
  "kestrel.project.simulation-runs";
export const LOCAL_SIMULATION_RUN_LIBRARY_LIMIT = 8;
export const LOCAL_SIMULATION_RUN_LIBRARY_MAX_SERIALIZED_LENGTH = 4_500_000;

export type SimulationRunKind = "vertical" | "staged";

export type LocalVerticalSimulationRun = Readonly<{
  id: string;
  label: string;
  kind: "vertical";
  reference: LocalVerticalSimulationReference;
}>;

export type LocalStagedSimulationRun = Readonly<{
  id: string;
  label: string;
  kind: "staged";
  reference: LocalStagedSimulationReference;
}>;

export type LocalSimulationRun = LocalVerticalSimulationRun | LocalStagedSimulationRun;

export type LocalSimulationRunLibrary = Readonly<{
  schema: typeof LOCAL_SIMULATION_RUN_LIBRARY_SCHEMA_ID;
  schemaVersion: typeof LOCAL_SIMULATION_RUN_LIBRARY_SCHEMA_VERSION;
  projectId: string;
  projectName: string;
  runs: readonly LocalSimulationRun[];
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

function projectId(value: unknown, label = "simulation run projectId"): string {
  const normalized = nonEmptyString(value, label, 64);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new Error(`${label} contains unsupported characters`);
  }
  return normalized;
}

function runId(value: unknown): string {
  const normalized = nonEmptyString(value, "simulation run id", 64);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new Error("simulation run id contains unsupported characters");
  }
  return normalized;
}

function referenceFromValue(
  value: unknown,
  kind: SimulationRunKind,
): LocalVerticalSimulationReference | LocalStagedSimulationReference {
  const reference = objectValue(value, "simulation run reference");
  if (reference.schema !== LOCAL_SIMULATION_REFERENCE_SCHEMA_ID) {
    throw new Error("Unsupported simulation reference schema in simulation run");
  }
  if (reference.schemaVersion !== LOCAL_SIMULATION_REFERENCE_SCHEMA_VERSION) {
    throw new Error("Unsupported simulation reference schema version in simulation run");
  }
  if (reference.kind !== kind) {
    throw new Error(`Simulation run reference kind must be ${kind}`);
  }
  if (kind === "vertical") {
    return createVerticalSimulationReference({
      projectId: reference.projectId as string,
      projectName: reference.projectName as string,
      fingerprint: reference.fingerprint as string,
      savedAtIso: reference.savedAtIso as string,
      result: reference.result as VerticalFlightResult,
    });
  }
  return createStagedSimulationReference({
    projectId: reference.projectId as string,
    projectName: reference.projectName as string,
    fingerprint: reference.fingerprint as string,
    savedAtIso: reference.savedAtIso as string,
    result: reference.result as StageFlightPreviewResult,
  });
}

function validateRun(
  value: unknown,
  expectedProjectId: string,
): LocalSimulationRun {
  const record = objectValue(value, "simulation run");
  const id = runId(record.id);
  const label = nonEmptyString(record.label, "simulation run label", 120);
  if (record.kind !== "vertical" && record.kind !== "staged") {
    throw new Error("simulation run kind must be vertical or staged");
  }
  const reference = referenceFromValue(record.reference, record.kind);
  if (reference.projectId !== expectedProjectId) {
    throw new Error("simulation run project scope does not match its library");
  }
  return record.kind === "vertical"
    ? { id, label, kind: "vertical", reference: reference as LocalVerticalSimulationReference }
    : { id, label, kind: "staged", reference: reference as LocalStagedSimulationReference };
}

export function validateLocalSimulationRunLibrary(value: unknown): LocalSimulationRunLibrary {
  const document = objectValue(value, "simulation run library");
  if (document.schema !== LOCAL_SIMULATION_RUN_LIBRARY_SCHEMA_ID) {
    throw new Error("Unsupported simulation run library schema");
  }
  if (document.schemaVersion !== LOCAL_SIMULATION_RUN_LIBRARY_SCHEMA_VERSION) {
    throw new Error("Unsupported simulation run library schema version");
  }
  const normalizedProjectId = projectId(document.projectId, "simulation run library projectId");
  const normalizedProjectName = nonEmptyString(document.projectName, "simulation run library projectName", 120);
  if (!Array.isArray(document.runs)) {
    throw new Error("simulation run library runs must be an array");
  }
  if (document.runs.length > LOCAL_SIMULATION_RUN_LIBRARY_LIMIT) {
    throw new Error(`Simulation run library may contain at most ${LOCAL_SIMULATION_RUN_LIBRARY_LIMIT} runs`);
  }
  const ids = new Set<string>();
  const runs = document.runs.map((entry) => {
    const run = validateRun(entry, normalizedProjectId);
    if (ids.has(run.id)) throw new Error(`simulation run id ${run.id} is duplicated`);
    ids.add(run.id);
    return run;
  });
  return {
    schema: LOCAL_SIMULATION_RUN_LIBRARY_SCHEMA_ID,
    schemaVersion: LOCAL_SIMULATION_RUN_LIBRARY_SCHEMA_VERSION,
    projectId: normalizedProjectId,
    projectName: normalizedProjectName,
    runs,
  };
}

export function createLocalSimulationRunLibrary(input: Readonly<{
  projectId: string;
  projectName: string;
  runs?: readonly LocalSimulationRun[];
}>): LocalSimulationRunLibrary {
  return validateLocalSimulationRunLibrary({
    schema: LOCAL_SIMULATION_RUN_LIBRARY_SCHEMA_ID,
    schemaVersion: LOCAL_SIMULATION_RUN_LIBRARY_SCHEMA_VERSION,
    projectId: input.projectId,
    projectName: input.projectName,
    runs: input.runs ?? [],
  });
}

export function createVerticalSimulationRun(input: Readonly<{
  id: string;
  label: string;
  projectId: string;
  projectName: string;
  fingerprint: string;
  result: VerticalFlightResult;
  savedAtIso?: string;
}>): LocalVerticalSimulationRun {
  return validateRun({
    id: input.id,
    label: input.label,
    kind: "vertical",
    reference: createVerticalSimulationReference({
      projectId: input.projectId,
      projectName: input.projectName,
      fingerprint: input.fingerprint,
      result: input.result,
      savedAtIso: input.savedAtIso,
    }),
  }, projectId(input.projectId)) as LocalVerticalSimulationRun;
}

export function createStagedSimulationRun(input: Readonly<{
  id: string;
  label: string;
  projectId: string;
  projectName: string;
  fingerprint: string;
  result: StageFlightPreviewResult;
  savedAtIso?: string;
}>): LocalStagedSimulationRun {
  return validateRun({
    id: input.id,
    label: input.label,
    kind: "staged",
    reference: createStagedSimulationReference({
      projectId: input.projectId,
      projectName: input.projectName,
      fingerprint: input.fingerprint,
      result: input.result,
      savedAtIso: input.savedAtIso,
    }),
  }, projectId(input.projectId)) as LocalStagedSimulationRun;
}

export function appendLocalSimulationRun(
  library: LocalSimulationRunLibrary,
  run: LocalSimulationRun,
): LocalSimulationRunLibrary {
  const current = validateLocalSimulationRunLibrary(library);
  const candidate = validateRun(run, current.projectId);
  if (current.runs.some((entry) => entry.id === candidate.id)) {
    throw new Error(`simulation run id ${candidate.id} already exists`);
  }
  if (current.runs.length >= LOCAL_SIMULATION_RUN_LIBRARY_LIMIT) {
    throw new Error(`Simulation run library is full at ${LOCAL_SIMULATION_RUN_LIBRARY_LIMIT} runs`);
  }
  return validateLocalSimulationRunLibrary({
    ...current,
    runs: [candidate, ...current.runs],
  });
}

export function removeLocalSimulationRun(
  library: LocalSimulationRunLibrary,
  id: string,
): LocalSimulationRunLibrary {
  const current = validateLocalSimulationRunLibrary(library);
  const normalizedId = runId(id);
  return validateLocalSimulationRunLibrary({
    ...current,
    runs: current.runs.filter((entry) => entry.id !== normalizedId),
  });
}

export function serializeLocalSimulationRunLibrary(
  library: LocalSimulationRunLibrary,
): string {
  const serialized = `${JSON.stringify(validateLocalSimulationRunLibrary(library), null, 2)}\n`;
  if (serialized.length > LOCAL_SIMULATION_RUN_LIBRARY_MAX_SERIALIZED_LENGTH) {
    throw new Error("simulation run library is too large for browser-local persistence");
  }
  return serialized;
}

export function parseLocalSimulationRunLibrary(
  serialized: string,
): LocalSimulationRunLibrary {
  try {
    if (typeof serialized !== "string" || serialized.length > LOCAL_SIMULATION_RUN_LIBRARY_MAX_SERIALIZED_LENGTH) {
      throw new Error("simulation run library exceeds the browser-local size limit");
    }
    return validateLocalSimulationRunLibrary(JSON.parse(serialized));
  } catch (error) {
    throw new Error(`Could not read local simulation run library: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}

export function simulationRunLibraryStorageKey(projectIdValue: string): string {
  return `${LOCAL_SIMULATION_RUN_LIBRARY_STORAGE_PREFIX}.${projectId(projectIdValue)}.v${LOCAL_SIMULATION_RUN_LIBRARY_SCHEMA_VERSION}`;
}
