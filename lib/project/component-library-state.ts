export const LOCAL_COMPONENT_LIBRARY_SCHEMA_ID =
  "dev.kestrel-lab.local-component-library";
export const LOCAL_COMPONENT_LIBRARY_SCHEMA_VERSION = 1;
export const LOCAL_COMPONENT_LIBRARY_STORAGE_KEY =
  "kestrel.project.arc54.component-library.v1";
export const LOCAL_COMPONENT_LIBRARY_LIMIT = 32;

export type ComponentPresetKind = "nose" | "airframe" | "fin-set" | "recovery";

export type ComponentPresetParameters =
  | Readonly<{
      kind: "nose";
      lengthMm: number;
      profile: "ogive" | "conical" | "elliptical";
    }>
  | Readonly<{
      kind: "airframe";
      lengthMm: number;
      diameterMm: number;
      material: "kraft" | "fiberglass" | "carbon";
    }>
  | Readonly<{
      kind: "fin-set";
      count: number;
      rootChordMm: number;
      tipChordMm: number;
      sweepMm: number;
      spanMm: number;
      thicknessMm: number;
    }>
  | Readonly<{
      kind: "recovery";
      massKg: number;
      diameterM: number;
      delayS: number;
      deploymentSuccessProbability: number;
      reefingEnabled: boolean;
      reefingDurationS: number;
      reefingStartAreaFraction: number;
    }>;

export type ComponentPresetProvenance = Readonly<{
  sourceName: string;
  sourceKind: "project-authored" | "user-supplied" | "original-template";
  dataVersion: string;
  licenseIdentifier: string;
  attribution: string;
  sourceUrl?: string;
  validationStatus:
    | "project-authored-unvalidated"
    | "user-supplied-unvalidated"
    | "original-preview-unvalidated";
}>;

export type LocalComponentRecord = Readonly<{
  id: string;
  name: string;
  kind: ComponentPresetKind;
  description?: string;
  parameters: ComponentPresetParameters;
  provenance: ComponentPresetProvenance;
}>;

export type LocalComponentLibraryDocument = Readonly<{
  schema: typeof LOCAL_COMPONENT_LIBRARY_SCHEMA_ID;
  schemaVersion: typeof LOCAL_COMPONENT_LIBRARY_SCHEMA_VERSION;
  records: ReadonlyArray<LocalComponentRecord>;
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string, maximumLength = 160): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value.trim().length > maximumLength) {
    throw new Error(`${label} must be at most ${maximumLength} characters.`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function positiveNumber(value: unknown, label: string, maximum: number): number {
  const number = finiteNumber(value, label);
  if (!(number > 0) || number > maximum) {
    throw new Error(`${label} must be greater than zero and at most ${maximum}.`);
  }
  return number;
}

function nonNegativeNumber(value: unknown, label: string, maximum: number): number {
  const number = finiteNumber(value, label);
  if (number < 0 || number > maximum) {
    throw new Error(`${label} must be between zero and ${maximum}.`);
  }
  return number;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return number;
}

function oneOf<T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of ${allowed.join(", ")}.`);
  }
  return value as T;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function validateParameters(value: unknown, expectedKind: ComponentPresetKind): ComponentPresetParameters {
  const parameters = objectValue(value, "component parameters");
  const kind = oneOf(parameters.kind, "component parameters kind", [
    "nose",
    "airframe",
    "fin-set",
    "recovery",
  ] as const);
  if (kind !== expectedKind) {
    throw new Error(`component parameters kind ${kind} does not match record kind ${expectedKind}.`);
  }
  if (kind === "nose") {
    return {
      kind,
      lengthMm: positiveNumber(parameters.lengthMm, "nose lengthMm", 5_000),
      profile: oneOf(parameters.profile, "nose profile", ["ogive", "conical", "elliptical"] as const),
    };
  }
  if (kind === "airframe") {
    return {
      kind,
      lengthMm: positiveNumber(parameters.lengthMm, "airframe lengthMm", 5_000),
      diameterMm: positiveNumber(parameters.diameterMm, "airframe diameterMm", 1_000),
      material: oneOf(parameters.material, "airframe material", ["kraft", "fiberglass", "carbon"] as const),
    };
  }
  if (kind === "fin-set") {
    const rootChordMm = positiveNumber(parameters.rootChordMm, "fin rootChordMm", 1_000);
    const tipChordMm = positiveNumber(parameters.tipChordMm, "fin tipChordMm", 1_000);
    if (tipChordMm > rootChordMm) throw new Error("fin tipChordMm cannot exceed rootChordMm.");
    return {
      kind,
      count: integer(parameters.count, "fin count", 2, 12),
      rootChordMm,
      tipChordMm,
      sweepMm: nonNegativeNumber(parameters.sweepMm, "fin sweepMm", 1_000),
      spanMm: positiveNumber(parameters.spanMm, "fin spanMm", 1_000),
      thicknessMm: positiveNumber(parameters.thicknessMm, "fin thicknessMm", 100),
    };
  }
  return {
    kind,
    massKg: positiveNumber(parameters.massKg, "recovery massKg", 20),
    diameterM: positiveNumber(parameters.diameterM, "recovery diameterM", 10),
    delayS: nonNegativeNumber(parameters.delayS, "recovery delayS", 60),
    deploymentSuccessProbability: (() => {
      const probability = finiteNumber(
        parameters.deploymentSuccessProbability,
        "recovery deploymentSuccessProbability",
      );
      if (probability < 0 || probability > 1) {
        throw new Error("recovery deploymentSuccessProbability must be between zero and one.");
      }
      return probability;
    })(),
    reefingEnabled: booleanValue(parameters.reefingEnabled, "recovery reefingEnabled"),
    reefingDurationS: positiveNumber(parameters.reefingDurationS, "recovery reefingDurationS", 60),
    reefingStartAreaFraction: (() => {
      const fraction = finiteNumber(parameters.reefingStartAreaFraction, "recovery reefingStartAreaFraction");
      if (fraction < 0.05 || fraction > 1) {
        throw new Error("recovery reefingStartAreaFraction must be between 0.05 and one.");
      }
      return fraction;
    })(),
  };
}

function validateProvenance(value: unknown): ComponentPresetProvenance {
  const provenance = objectValue(value, "component provenance");
  const sourceUrl = provenance.sourceUrl === undefined
    ? undefined
    : nonEmptyString(provenance.sourceUrl, "component provenance sourceUrl", 500);
  return {
    sourceName: nonEmptyString(provenance.sourceName, "component provenance sourceName"),
    sourceKind: oneOf(provenance.sourceKind, "component provenance sourceKind", [
      "project-authored",
      "user-supplied",
      "original-template",
    ] as const),
    dataVersion: nonEmptyString(provenance.dataVersion, "component provenance dataVersion", 80),
    licenseIdentifier: nonEmptyString(provenance.licenseIdentifier, "component provenance licenseIdentifier", 120),
    attribution: nonEmptyString(provenance.attribution, "component provenance attribution", 500),
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
    validationStatus: oneOf(provenance.validationStatus, "component provenance validationStatus", [
      "project-authored-unvalidated",
      "user-supplied-unvalidated",
      "original-preview-unvalidated",
    ] as const),
  };
}

export function validateLocalComponentRecord(value: unknown, label = "component record"): LocalComponentRecord {
  const record = objectValue(value, label);
  const id = nonEmptyString(record.id, `${label} id`, 64);
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error(`${label} id contains unsupported characters.`);
  }
  const kind = oneOf(record.kind, `${label} kind`, ["nose", "airframe", "fin-set", "recovery"] as const);
  return {
    id,
    name: nonEmptyString(record.name, `${label} name`, 120),
    kind,
    ...(record.description === undefined
      ? {}
      : { description: nonEmptyString(record.description, `${label} description`, 500) }),
    parameters: validateParameters(record.parameters, kind),
    provenance: validateProvenance(record.provenance),
  };
}

export function validateLocalComponentRecords(value: unknown): LocalComponentRecord[] {
  if (!Array.isArray(value)) throw new Error("component library records must be an array.");
  if (value.length > LOCAL_COMPONENT_LIBRARY_LIMIT) {
    throw new Error(`component library may contain at most ${LOCAL_COMPONENT_LIBRARY_LIMIT} records.`);
  }
  const records = value.map((record, index) => validateLocalComponentRecord(record, `component record ${index + 1}`));
  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`component library contains duplicate id ${record.id}.`);
    ids.add(record.id);
  }
  return records;
}

function validateDocument(value: unknown): LocalComponentLibraryDocument {
  const document = objectValue(value, "Component library document");
  if (document.schema !== LOCAL_COMPONENT_LIBRARY_SCHEMA_ID) throw new Error("Unsupported component library schema.");
  if (document.schemaVersion !== LOCAL_COMPONENT_LIBRARY_SCHEMA_VERSION) throw new Error("Unsupported component library schema version.");
  return {
    schema: LOCAL_COMPONENT_LIBRARY_SCHEMA_ID,
    schemaVersion: LOCAL_COMPONENT_LIBRARY_SCHEMA_VERSION,
    records: validateLocalComponentRecords(document.records),
  };
}

export function serializeLocalComponentLibrary(records: readonly LocalComponentRecord[]): string {
  const document: LocalComponentLibraryDocument = {
    schema: LOCAL_COMPONENT_LIBRARY_SCHEMA_ID,
    schemaVersion: LOCAL_COMPONENT_LIBRARY_SCHEMA_VERSION,
    records: validateLocalComponentRecords(records),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseLocalComponentLibrary(serialized: string): LocalComponentRecord[] {
  try {
    return validateDocument(JSON.parse(serialized)).records.slice();
  } catch (error) {
    throw new Error(`Could not read local component library: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}

export function upsertLocalComponentRecord(
  records: readonly LocalComponentRecord[],
  next: LocalComponentRecord,
): LocalComponentRecord[] {
  const validated = validateLocalComponentRecord(next);
  return validateLocalComponentRecords([
    ...records.filter((record) => record.id !== validated.id),
    validated,
  ]);
}
