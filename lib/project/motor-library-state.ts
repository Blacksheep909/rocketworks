import {
  createMotorLibrary,
  createMotorDataRecord,
  type MotorDataInput,
  type MotorDataRecord,
} from "../physics/motor-data.ts";

export const LOCAL_MOTOR_LIBRARY_SCHEMA_ID = "dev.kestrel-lab.local-motor-library";
export const LOCAL_MOTOR_LIBRARY_SCHEMA_VERSION = 1;
export const LOCAL_MOTOR_LIBRARY_STORAGE_KEY = "kestrel.project.arc54.motor-library.v1";
export const LOCAL_MOTOR_LIBRARY_LIMIT = 24;

export type LocalMotorLibraryDocument = Readonly<{
  schema: typeof LOCAL_MOTOR_LIBRARY_SCHEMA_ID;
  schemaVersion: typeof LOCAL_MOTOR_LIBRARY_SCHEMA_VERSION;
  records: ReadonlyArray<MotorDataInput>;
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function inputFromRecord(record: MotorDataRecord): MotorDataInput {
  return {
    id: record.id,
    manufacturer: record.manufacturer,
    designation: record.designation,
    description: record.description,
    diameterM: record.diameterM,
    lengthM: record.lengthM,
    launchMassKg: record.launchMassKg,
    dryMassKg: record.dryMassKg,
    thrustCurve: record.thrustCurve,
    massFlowHistoryKgS: record.massFlowHistoryKgS,
    ejectionDelaysS: record.ejectionDelaysS,
    propellantGeometry: record.propellantGeometry,
    dryCgFromAftM: record.dryCgFromAftM,
    provenance: record.provenance,
  };
}

function validateDocument(value: unknown): LocalMotorLibraryDocument {
  const document = objectValue(value, "Motor library document");
  if (document.schema !== LOCAL_MOTOR_LIBRARY_SCHEMA_ID) throw new Error("Unsupported motor library schema.");
  if (document.schemaVersion !== LOCAL_MOTOR_LIBRARY_SCHEMA_VERSION) throw new Error("Unsupported motor library schema version.");
  if (!Array.isArray(document.records)) throw new Error("Motor library records must be an array.");
  if (document.records.length > LOCAL_MOTOR_LIBRARY_LIMIT) throw new Error(`Motor library may contain at most ${LOCAL_MOTOR_LIBRARY_LIMIT} records.`);
  const records = document.records.map((record) => inputFromRecord(createMotorDataRecord(record as MotorDataInput)));
  createMotorLibrary(records.map((record) => createMotorDataRecord(record)));
  return { schema: LOCAL_MOTOR_LIBRARY_SCHEMA_ID, schemaVersion: LOCAL_MOTOR_LIBRARY_SCHEMA_VERSION, records };
}

export function serializeLocalMotorLibrary(records: readonly MotorDataRecord[]): string {
  if (records.length > LOCAL_MOTOR_LIBRARY_LIMIT) throw new Error(`Motor library may contain at most ${LOCAL_MOTOR_LIBRARY_LIMIT} records.`);
  const document: LocalMotorLibraryDocument = {
    schema: LOCAL_MOTOR_LIBRARY_SCHEMA_ID,
    schemaVersion: LOCAL_MOTOR_LIBRARY_SCHEMA_VERSION,
    records: records.map(inputFromRecord),
  };
  return `${JSON.stringify(validateDocument(document), null, 2)}\n`;
}

export function parseLocalMotorLibrary(serialized: string): MotorDataRecord[] {
  try {
    const document = validateDocument(JSON.parse(serialized));
    return document.records.map((record) => createMotorDataRecord(record));
  } catch (error) {
    throw new Error(`Could not read local motor library: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}

export function upsertLocalMotorRecord(
  records: readonly MotorDataRecord[],
  next: MotorDataRecord,
): MotorDataRecord[] {
  const withoutExisting = records.filter((record) => record.id !== next.id);
  const merged = [...withoutExisting, next];
  if (merged.length > LOCAL_MOTOR_LIBRARY_LIMIT) throw new Error(`Motor library may contain at most ${LOCAL_MOTOR_LIBRARY_LIMIT} records.`);
  return createMotorLibrary(merged).records.slice();
}
