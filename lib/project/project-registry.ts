import {
  parseLocalProjectHistory,
  parseLocalProjectSnapshot,
  type LocalProjectHistory,
  type LocalProjectSnapshot,
} from "./project-state.ts";

/**
 * The registry is deliberately device-local. It is a small index of project
 * documents stored in this browser; it is not an account, sync, or
 * collaboration protocol.
 */
export const LOCAL_PROJECT_REGISTRY_SCHEMA_ID = "dev.kestrel-lab.local-project-registry";
export const LOCAL_PROJECT_REGISTRY_SCHEMA_VERSION = 1;
export const LOCAL_PROJECT_REGISTRY_STORAGE_KEY = "kestrel.project.workspace-registry.v1";
export const LOCAL_PROJECT_REGISTRY_LIMIT = 24;

export type LocalProjectRecord = Readonly<{
  projectId: string;
  projectName: string;
  createdAtIso: string;
  updatedAtIso: string;
  snapshot: LocalProjectSnapshot;
  history: LocalProjectHistory;
}>;

export type LocalProjectRegistry = Readonly<{
  schema: typeof LOCAL_PROJECT_REGISTRY_SCHEMA_ID;
  schemaVersion: typeof LOCAL_PROJECT_REGISTRY_SCHEMA_VERSION;
  activeProjectId: string;
  projects: ReadonlyArray<LocalProjectRecord>;
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function projectId(value: unknown, label = "projectId"): string {
  const normalized = nonEmptyString(value, label, 64);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new Error(`${label} must use letters, numbers, dots, dashes, or underscores.`);
  }
  return normalized;
}

function isoDate(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO date.`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(`${label} must be a canonical ISO date.`);
  return normalized;
}

function parseSnapshot(value: unknown, label: string): LocalProjectSnapshot {
  try {
    return parseLocalProjectSnapshot(JSON.stringify(value));
  } catch (error) {
    throw new Error(`${label} is invalid: ${error instanceof Error ? error.message : "invalid snapshot"}`);
  }
}

function parseHistory(value: unknown, label: string): LocalProjectHistory {
  try {
    return parseLocalProjectHistory(JSON.stringify(value));
  } catch (error) {
    throw new Error(`${label} is invalid: ${error instanceof Error ? error.message : "invalid history"}`);
  }
}

export function validateLocalProjectRecord(value: unknown, label = "Local project record"): LocalProjectRecord {
  const record = objectValue(value, label);
  const id = projectId(record.projectId, `${label} projectId`);
  const name = nonEmptyString(record.projectName, `${label} projectName`, 120);
  const snapshot = parseSnapshot(record.snapshot, `${label} snapshot`);
  const history = parseHistory(record.history, `${label} history`);
  if (snapshot.projectId !== id) throw new Error(`${label} snapshot project does not match projectId.`);
  if (history.projectId !== id) throw new Error(`${label} history project does not match projectId.`);
  if (snapshot.projectName !== name) throw new Error(`${label} snapshot project name does not match projectName.`);
  const createdAtIso = isoDate(record.createdAtIso, `${label} createdAtIso`);
  const updatedAtIso = isoDate(record.updatedAtIso, `${label} updatedAtIso`);
  if (Date.parse(updatedAtIso) < Date.parse(createdAtIso)) {
    throw new Error(`${label} updatedAtIso cannot precede createdAtIso.`);
  }
  if (Date.parse(updatedAtIso) < Date.parse(snapshot.savedAtIso)) {
    throw new Error(`${label} updatedAtIso cannot precede its snapshot.`);
  }
  return { projectId: id, projectName: name, createdAtIso, updatedAtIso, snapshot, history };
}

export function validateLocalProjectRegistry(value: unknown): LocalProjectRegistry {
  const registry = objectValue(value, "Local project registry");
  if (registry.schema !== LOCAL_PROJECT_REGISTRY_SCHEMA_ID) throw new Error("Unsupported local project registry schema.");
  if (registry.schemaVersion !== LOCAL_PROJECT_REGISTRY_SCHEMA_VERSION) throw new Error("Unsupported local project registry schema version.");
  const activeProjectId = projectId(registry.activeProjectId, "activeProjectId");
  if (!Array.isArray(registry.projects)) throw new Error("Local project registry projects must be an array.");
  if (registry.projects.length > LOCAL_PROJECT_REGISTRY_LIMIT) {
    throw new Error(`Local project registry cannot contain more than ${LOCAL_PROJECT_REGISTRY_LIMIT} projects.`);
  }
  const ids = new Set<string>();
  const projects = registry.projects.map((value, index) => {
    const record = validateLocalProjectRecord(value, `Local project ${index + 1}`);
    if (ids.has(record.projectId)) throw new Error(`Duplicate local project id: ${record.projectId}.`);
    ids.add(record.projectId);
    return record;
  });
  if (projects.length > 0 && !ids.has(activeProjectId)) {
    throw new Error(`Active project ${activeProjectId} is not present in the registry.`);
  }
  return {
    schema: LOCAL_PROJECT_REGISTRY_SCHEMA_ID,
    schemaVersion: LOCAL_PROJECT_REGISTRY_SCHEMA_VERSION,
    activeProjectId,
    projects,
  };
}

export function createEmptyProjectRegistry(activeProjectId = "arc54"): LocalProjectRegistry {
  return {
    schema: LOCAL_PROJECT_REGISTRY_SCHEMA_ID,
    schemaVersion: LOCAL_PROJECT_REGISTRY_SCHEMA_VERSION,
    activeProjectId: projectId(activeProjectId),
    projects: [],
  };
}

export function createLocalProjectRecord(
  snapshot: LocalProjectSnapshot,
  history: LocalProjectHistory,
  createdAtIso = snapshot.savedAtIso,
): LocalProjectRecord {
  const validSnapshot = parseSnapshot(snapshot, "Project snapshot");
  const validHistory = parseHistory(history, "Project history");
  const id = projectId(validSnapshot.projectId);
  const name = nonEmptyString(validSnapshot.projectName, "projectName", 120);
  if (validHistory.projectId !== id) throw new Error("Project history does not match project snapshot.");
  return validateLocalProjectRecord({
    projectId: id,
    projectName: name,
    createdAtIso,
    updatedAtIso: validSnapshot.savedAtIso,
    snapshot: validSnapshot,
    history: validHistory,
  });
}

export function upsertLocalProjectRecord(
  registry: LocalProjectRegistry,
  record: LocalProjectRecord,
): LocalProjectRegistry {
  const current = validateLocalProjectRegistry(registry);
  const validRecord = validateLocalProjectRecord(record);
  const existingIndex = current.projects.findIndex((item) => item.projectId === validRecord.projectId);
  if (existingIndex < 0 && current.projects.length >= LOCAL_PROJECT_REGISTRY_LIMIT) {
    throw new Error(`Local project registry is full (${LOCAL_PROJECT_REGISTRY_LIMIT} projects).`);
  }
  const projects = [...current.projects];
  if (existingIndex < 0) projects.push(validRecord);
  else projects[existingIndex] = {
    ...validRecord,
    createdAtIso: current.projects[existingIndex]!.createdAtIso,
  };
  return validateLocalProjectRegistry({ ...current, activeProjectId: validRecord.projectId, projects });
}

export function setActiveLocalProject(registry: LocalProjectRegistry, activeProjectId: string): LocalProjectRegistry {
  const current = validateLocalProjectRegistry(registry);
  const id = projectId(activeProjectId, "activeProjectId");
  if (current.projects.length > 0 && !current.projects.some((record) => record.projectId === id)) {
    throw new Error(`Cannot activate local project ${id}; it is not in the registry.`);
  }
  return validateLocalProjectRegistry({ ...current, activeProjectId: id });
}

export function createProjectId(projectName: string, existingIds: ReadonlyArray<string> = []): string {
  const base = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "project";
  const occupied = new Set(existingIds.map((id) => projectId(id)));
  if (!occupied.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base.slice(0, Math.max(1, 64 - String(suffix).length - 1))}-${suffix}`;
    if (!occupied.has(candidate)) return candidate;
  }
  throw new Error("Could not create a unique local project id.");
}

export function serializeLocalProjectRegistry(registry: LocalProjectRegistry): string {
  return `${JSON.stringify(validateLocalProjectRegistry(registry), null, 2)}\n`;
}

export function parseLocalProjectRegistry(serialized: string): LocalProjectRegistry {
  try {
    return validateLocalProjectRegistry(JSON.parse(serialized));
  } catch (error) {
    throw new Error(`Could not read local project registry: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}
