export const LOCAL_FLIGHT_DATA_SCHEMA_ID = "dev.kestrel-lab.local-flight-data";
export const LOCAL_FLIGHT_DATA_SCHEMA_VERSION = 1;
export const LOCAL_FLIGHT_DATA_STORAGE_KEY = "kestrel.project.arc54.flight-data.v1";
export const MAX_LOCAL_FLIGHT_DATA_CSV_BYTES = 5_000_000;

export type LocalFlightDataSnapshot = Readonly<{
  schema: typeof LOCAL_FLIGHT_DATA_SCHEMA_ID;
  schemaVersion: typeof LOCAL_FLIGHT_DATA_SCHEMA_VERSION;
  sourceName: string;
  csv: string;
  savedAtIso: string;
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value.length > maximumLength) throw new Error(`${label} is too long.`);
  return value;
}

function isoDate(value: unknown, label: string): string {
  const date = nonEmptyString(value, label, 80);
  if (Number.isNaN(Date.parse(date)) || new Date(date).toISOString() !== date) {
    throw new Error(`${label} must be an ISO 8601 UTC timestamp.`);
  }
  return date;
}

function csvByteLength(csv: string) {
  return new TextEncoder().encode(csv).byteLength;
}

export function createLocalFlightDataSnapshot(input: Readonly<{
  sourceName: string;
  csv: string;
  savedAtIso?: string;
}>): LocalFlightDataSnapshot {
  const sourceName = nonEmptyString(input.sourceName, "Flight data source name", 180).trim();
  if (typeof input.csv !== "string" || input.csv.trim().length === 0) {
    throw new Error("Flight data CSV must be non-empty text.");
  }
  if (csvByteLength(input.csv) > MAX_LOCAL_FLIGHT_DATA_CSV_BYTES) {
    throw new Error("Flight data CSV exceeds the 5 MB local storage limit.");
  }
  const savedAtIso = input.savedAtIso ?? new Date().toISOString();
  isoDate(savedAtIso, "savedAtIso");
  return {
    schema: LOCAL_FLIGHT_DATA_SCHEMA_ID,
    schemaVersion: LOCAL_FLIGHT_DATA_SCHEMA_VERSION,
    sourceName,
    csv: input.csv,
    savedAtIso,
  };
}

export function parseLocalFlightDataSnapshot(serialized: string): LocalFlightDataSnapshot {
  if (typeof serialized !== "string" || serialized.length === 0) {
    throw new Error("Stored flight data is empty.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Stored flight data is not valid JSON.");
  }
  const value = objectValue(parsed, "Stored flight data");
  if (value.schema !== LOCAL_FLIGHT_DATA_SCHEMA_ID) {
    throw new Error("Stored flight data uses an unsupported schema.");
  }
  if (value.schemaVersion !== LOCAL_FLIGHT_DATA_SCHEMA_VERSION) {
    throw new Error("Stored flight data uses an unsupported schema version.");
  }
  return createLocalFlightDataSnapshot({
    sourceName: value.sourceName as string,
    csv: value.csv as string,
    savedAtIso: value.savedAtIso as string,
  });
}

export function serializeLocalFlightDataSnapshot(snapshot: LocalFlightDataSnapshot) {
  return JSON.stringify(snapshot);
}
