import {
  LOCAL_PROJECT_REGISTRY_LIMIT,
  serializeLocalProjectRegistry,
  validateLocalProjectRegistry,
  type LocalProjectRegistry,
} from "./project-registry.ts";

export const LOCAL_WORKSPACE_BACKUP_SCHEMA_ID = "dev.kestrel-lab.local-workspace-backup";
export const LOCAL_WORKSPACE_BACKUP_SCHEMA_VERSION = 1;
export const LOCAL_WORKSPACE_BACKUP_MEDIA_TYPE = "application/json;charset=utf-8";

const WORKSPACE_BACKUP_SOURCE = "browser-local-project-registry" as const;
const WORKSPACE_BACKUP_NOTES = [
  "This backup contains validated project snapshots and checkpoint histories from one browser.",
  "Motor, aerodynamic, component, flight-data, and topology library records remain separate device-local sources; use a project JSON document for a complete single-project handoff.",
  "Cloud sync, accounts, conflict resolution, and multi-user collaboration are not part of this envelope.",
] as const;

export type LocalWorkspaceBackup = Readonly<{
  schema: typeof LOCAL_WORKSPACE_BACKUP_SCHEMA_ID;
  schemaVersion: typeof LOCAL_WORKSPACE_BACKUP_SCHEMA_VERSION;
  exportedAtIso: string;
  source: typeof WORKSPACE_BACKUP_SOURCE;
  registry: LocalProjectRegistry;
  notes: readonly string[];
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function isoDate(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO date.`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(`${label} must be a canonical ISO date.`);
  return normalized;
}

function noteList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error("Workspace backup notes must be an array.");
  if (value.length > 8) throw new Error("Workspace backup cannot contain more than 8 notes.");
  return value.map((note, index) => {
    if (typeof note !== "string" || note.trim().length === 0) {
      throw new Error(`Workspace backup note ${index + 1} must be a non-empty string.`);
    }
    const normalized = note.trim();
    if (normalized.length > 300) throw new Error(`Workspace backup note ${index + 1} is too long.`);
    return normalized;
  });
}

export function validateLocalWorkspaceBackup(value: unknown): LocalWorkspaceBackup {
  const backup = objectValue(value, "Local workspace backup");
  if (backup.schema !== LOCAL_WORKSPACE_BACKUP_SCHEMA_ID) throw new Error("Unsupported local workspace backup schema.");
  if (backup.schemaVersion !== LOCAL_WORKSPACE_BACKUP_SCHEMA_VERSION) throw new Error("Unsupported local workspace backup schema version.");
  if (backup.source !== WORKSPACE_BACKUP_SOURCE) throw new Error("Unsupported local workspace backup source.");
  const registry = validateLocalProjectRegistry(backup.registry);
  const notes = noteList(backup.notes);
  if (notes.length === 0) throw new Error("Workspace backup must disclose its handoff boundary.");
  return {
    schema: LOCAL_WORKSPACE_BACKUP_SCHEMA_ID,
    schemaVersion: LOCAL_WORKSPACE_BACKUP_SCHEMA_VERSION,
    exportedAtIso: isoDate(backup.exportedAtIso, "exportedAtIso"),
    source: WORKSPACE_BACKUP_SOURCE,
    registry,
    notes,
  };
}

export function createLocalWorkspaceBackup(
  registry: LocalProjectRegistry,
  exportedAtIso = new Date().toISOString(),
): LocalWorkspaceBackup {
  return validateLocalWorkspaceBackup({
    schema: LOCAL_WORKSPACE_BACKUP_SCHEMA_ID,
    schemaVersion: LOCAL_WORKSPACE_BACKUP_SCHEMA_VERSION,
    exportedAtIso,
    source: WORKSPACE_BACKUP_SOURCE,
    registry: validateLocalProjectRegistry(registry),
    notes: [...WORKSPACE_BACKUP_NOTES],
  });
}

/**
 * Merge a validated backup into the current browser-local project index.
 * Imported records replace records with the same project id; new records are
 * appended in backup order. The imported active project becomes active when
 * it exists, while the current active id is retained for an empty backup.
 * Nothing is silently dropped when the device-local capacity would be
 * exceeded.
 */
export function mergeLocalWorkspaceBackup(
  currentRegistry: LocalProjectRegistry,
  backup: LocalWorkspaceBackup,
): LocalProjectRegistry {
  const current = validateLocalProjectRegistry(currentRegistry);
  const imported = validateLocalWorkspaceBackup(backup);
  const projects = new Map(current.projects.map((record) => [record.projectId, record]));
  for (const record of imported.registry.projects) projects.set(record.projectId, record);
  if (projects.size > LOCAL_PROJECT_REGISTRY_LIMIT) {
    throw new Error(
      `Workspace backup merge would create ${projects.size} projects; the browser limit is ${LOCAL_PROJECT_REGISTRY_LIMIT}. Open or duplicate projects to make room before importing.`,
    );
  }
  const importedActiveIsPresent = imported.registry.projects.some(
    (record) => record.projectId === imported.registry.activeProjectId,
  );
  const currentActiveIsPresent = [...projects.values()].some(
    (record) => record.projectId === current.activeProjectId,
  );
  const activeProjectId = importedActiveIsPresent
    ? imported.registry.activeProjectId
    : currentActiveIsPresent
      ? current.activeProjectId
      : imported.registry.activeProjectId;
  return validateLocalProjectRegistry({
    ...current,
    activeProjectId,
    projects: [...projects.values()],
  });
}

export function serializeLocalWorkspaceBackup(backup: LocalWorkspaceBackup): string {
  const valid = validateLocalWorkspaceBackup(backup);
  // Reuse the registry serializer's validation semantics while keeping this
  // envelope as a standalone, readable JSON document.
  const registry = JSON.parse(serializeLocalProjectRegistry(valid.registry)) as LocalProjectRegistry;
  return `${JSON.stringify({ ...valid, registry }, null, 2)}\n`;
}

export function parseLocalWorkspaceBackup(serialized: string): LocalWorkspaceBackup {
  try {
    return validateLocalWorkspaceBackup(JSON.parse(serialized));
  } catch (error) {
    throw new Error(`Could not read local workspace backup: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}
