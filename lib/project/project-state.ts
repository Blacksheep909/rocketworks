export const LOCAL_PROJECT_SCHEMA_ID = "dev.kestrel-lab.local-project";
export const LOCAL_PROJECT_SCHEMA_VERSION = 1;
export const LOCAL_PROJECT_HISTORY_SCHEMA_ID = "dev.kestrel-lab.local-project-history";
export const LOCAL_PROJECT_STORAGE_KEY = "kestrel.project.arc54.current.v1";
export const LOCAL_PROJECT_HISTORY_STORAGE_KEY = "kestrel.project.arc54.history.v1";
export const DEFAULT_LOCAL_HISTORY_LIMIT = 40;

export type ProjectMaterial = "kraft" | "fiberglass" | "carbon";

export type EditableProjectInputs = Readonly<{
  lengthMm: number;
  diameterMm: number;
  payloadMassKg: number;
  material: ProjectMaterial;
  thrustN: number;
  burnTimeS: number;
  dragCoefficient: number;
  launchAltitudeM: number;
  windSpeedMps: number;
  launchRailEnabled: boolean;
  launchRailLengthM: number;
  recoveryEnabled: boolean;
  recoveryDelayS: number;
  recoveryDiameterM: number;
  recoveryDeploymentSuccessProbability: number;
}>;

export type LocalProjectSnapshot = Readonly<{
  schema: typeof LOCAL_PROJECT_SCHEMA_ID;
  schemaVersion: typeof LOCAL_PROJECT_SCHEMA_VERSION;
  projectId: string;
  projectName: string;
  revision: number;
  savedAtIso: string;
  inputs: EditableProjectInputs;
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

const numericRanges: Readonly<Record<keyof Omit<EditableProjectInputs, "material" | "recoveryEnabled" | "launchRailEnabled">, readonly [number, number]>> = {
  lengthMm: [200, 1600],
  diameterMm: [20, 200],
  payloadMassKg: [0.001, 20],
  thrustN: [1, 5000],
  burnTimeS: [0.1, 30],
  dragCoefficient: [0.1, 2],
  launchAltitudeM: [-400, 10000],
  windSpeedMps: [0, 80],
  launchRailLengthM: [0.25, 12],
  recoveryDelayS: [0, 30],
  recoveryDiameterM: [0.1, 3],
  recoveryDeploymentSuccessProbability: [0, 1],
};

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
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
    const candidate = input[key] ?? (
      key === "launchRailLengthM"
        ? 1.2
        : key === "recoveryDeploymentSuccessProbability"
          ? 0.9
          : undefined
    );
    if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < minimum || candidate > maximum) {
      throw new Error(`${key} must be a finite number from ${minimum} to ${maximum}.`);
    }
    validated[key] = candidate;
  }
  if (input.material !== "kraft" && input.material !== "fiberglass" && input.material !== "carbon") {
    throw new Error("material must be kraft, fiberglass, or carbon.");
  }
  if (typeof input.recoveryEnabled !== "boolean") {
    throw new Error("recoveryEnabled must be boolean.");
  }
  const launchRailEnabled = input.launchRailEnabled === undefined ? true : input.launchRailEnabled;
  if (typeof launchRailEnabled !== "boolean") {
    throw new Error("launchRailEnabled must be boolean.");
  }
  return {
    lengthMm: validated.lengthMm,
    diameterMm: validated.diameterMm,
    payloadMassKg: validated.payloadMassKg,
    material: input.material,
    thrustN: validated.thrustN,
    burnTimeS: validated.burnTimeS,
    dragCoefficient: validated.dragCoefficient,
    launchAltitudeM: validated.launchAltitudeM,
    windSpeedMps: validated.windSpeedMps,
    launchRailEnabled,
    launchRailLengthM: validated.launchRailLengthM,
    recoveryEnabled: input.recoveryEnabled,
    recoveryDelayS: validated.recoveryDelayS,
    recoveryDiameterM: validated.recoveryDiameterM,
    recoveryDeploymentSuccessProbability: validated.recoveryDeploymentSuccessProbability,
  };
}

export function createLocalProjectSnapshot(input: {
  projectId: string;
  projectName: string;
  revision: number;
  savedAtIso?: string;
  inputs: EditableProjectInputs;
}): LocalProjectSnapshot {
  return {
    schema: LOCAL_PROJECT_SCHEMA_ID,
    schemaVersion: LOCAL_PROJECT_SCHEMA_VERSION,
    projectId: nonEmptyString(input.projectId, "projectId"),
    projectName: nonEmptyString(input.projectName, "projectName"),
    revision: integer(input.revision, "revision", 1),
    savedAtIso: isoDate(input.savedAtIso ?? new Date().toISOString(), "savedAtIso"),
    inputs: validateEditableProjectInputs(input.inputs),
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

const inputLabels: Readonly<Record<keyof EditableProjectInputs, string>> = {
  lengthMm: "airframe length",
  diameterMm: "outer diameter",
  payloadMassKg: "payload mass",
  material: "airframe material",
  thrustN: "motor thrust",
  burnTimeS: "burn duration",
  dragCoefficient: "drag coefficient",
  launchAltitudeM: "launch altitude",
  windSpeedMps: "wind speed",
  launchRailEnabled: "launch rail constraint",
  launchRailLengthM: "effective rail travel",
  recoveryEnabled: "recovery system",
  recoveryDelayS: "recovery delay",
  recoveryDiameterM: "canopy diameter",
  recoveryDeploymentSuccessProbability: "recovery deployment reliability assumption",
};

export function describeProjectInputChanges(previous: EditableProjectInputs, current: EditableProjectInputs): string {
  const before = validateEditableProjectInputs(previous);
  const after = validateEditableProjectInputs(current);
  const changed = (Object.keys(inputLabels) as Array<keyof EditableProjectInputs>)
    .filter((key) => before[key] !== after[key])
    .map((key) => inputLabels[key]);
  if (changed.length === 0) return "No input changes";
  if (changed.length <= 2) return `Changed ${changed.join(" and ")}`;
  return `Changed ${changed.slice(0, 2).join(", ")} +${changed.length - 2} more`;
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
  const duplicate = current.entries.at(-1)?.snapshot.inputs;
  if (!options.allowDuplicate && duplicate && projectInputFingerprint(duplicate) === projectInputFingerprint(validSnapshot.inputs)) return current;
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
