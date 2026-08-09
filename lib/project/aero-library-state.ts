import {
  createAerodynamicCoefficientTable,
  type AerodynamicCoefficientTableDefinition,
  type CoefficientSurface,
} from "../physics/aerodynamic-coefficients.ts";

export const LOCAL_AERODYNAMIC_LIBRARY_SCHEMA_ID =
  "dev.kestrel-lab.local-aerodynamic-library";
export const LOCAL_AERODYNAMIC_LIBRARY_SCHEMA_VERSION = 1;
export const LOCAL_AERODYNAMIC_LIBRARY_STORAGE_KEY =
  "kestrel.project.arc54.aerodynamic-library.v1";
export const LOCAL_AERODYNAMIC_SELECTION_STORAGE_KEY =
  "kestrel.project.arc54.aerodynamic-selection.v1";
export const LOCAL_AERODYNAMIC_LIBRARY_LIMIT = 8;

export type LocalAerodynamicLibraryDocument = Readonly<{
  schema: typeof LOCAL_AERODYNAMIC_LIBRARY_SCHEMA_ID;
  schemaVersion: typeof LOCAL_AERODYNAMIC_LIBRARY_SCHEMA_VERSION;
  records: ReadonlyArray<AerodynamicCoefficientTableDefinition>;
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function finiteNumberArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }
  return value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function coefficientSurface(value: unknown, label: string): CoefficientSurface {
  const surface = objectValue(value, label);
  if (!Array.isArray(surface.values) || surface.values.length === 0) {
    throw new Error(`${label}.values must be a non-empty array.`);
  }
  const values = surface.values.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length === 0) {
      throw new Error(`${label}.values[${rowIndex}] must be a non-empty array.`);
    }
    return row.map((entry, columnIndex) =>
      finiteNumber(entry, `${label}.values[${rowIndex}][${columnIndex}]`),
    );
  });
  let absoluteUncertainty: number[][] | undefined;
  if (surface.absoluteUncertainty !== undefined) {
    if (!Array.isArray(surface.absoluteUncertainty)) {
      throw new Error(`${label}.absoluteUncertainty must be an array.`);
    }
    absoluteUncertainty = surface.absoluteUncertainty.map((row, rowIndex) => {
      if (!Array.isArray(row) || row.length === 0) {
        throw new Error(`${label}.absoluteUncertainty[${rowIndex}] must be a non-empty array.`);
      }
      return row.map((entry, columnIndex) =>
        finiteNumber(
          entry,
          `${label}.absoluteUncertainty[${rowIndex}][${columnIndex}]`,
        ),
      );
    });
  }
  return absoluteUncertainty ? { values, absoluteUncertainty } : { values };
}

function provenance(value: unknown): AerodynamicCoefficientTableDefinition["provenance"] {
  const source = objectValue(value, "aerodynamic table provenance");
  const sourceKind = source.sourceKind;
  if (
    sourceKind !== "wind-tunnel" &&
    sourceKind !== "cfd" &&
    sourceKind !== "flight-test" &&
    sourceKind !== "published-analysis" &&
    sourceKind !== "user-supplied"
  ) {
    throw new Error("aerodynamic table provenance source kind is invalid.");
  }
  const validationStatus = source.validationStatus;
  if (
    validationStatus !== "user-supplied-unvalidated" &&
    validationStatus !== "published-data-unverified" &&
    validationStatus !== "independently-benchmarked"
  ) {
    throw new Error("aerodynamic table provenance validation status is invalid.");
  }
  const parsed: AerodynamicCoefficientTableDefinition["provenance"] = {
    sourceName: nonEmptyString(source.sourceName, "aerodynamic table source name"),
    sourceKind,
    dataVersion: nonEmptyString(source.dataVersion, "aerodynamic table data version"),
    licenseIdentifier: nonEmptyString(
      source.licenseIdentifier,
      "aerodynamic table license identifier",
    ),
    validationStatus,
    ...(source.sourceUrl !== undefined
      ? { sourceUrl: nonEmptyString(source.sourceUrl, "aerodynamic table source URL") }
      : {}),
    ...(source.attribution !== undefined
      ? { attribution: nonEmptyString(source.attribution, "aerodynamic table attribution") }
      : {}),
  };
  return parsed;
}

function definitionFromUnknown(value: unknown, index: number): AerodynamicCoefficientTableDefinition {
  const record = objectValue(value, `Aerodynamic table ${index + 1}`);
  const damping = record.dampingDerivativeBody;
  const definition: AerodynamicCoefficientTableDefinition = {
    id: nonEmptyString(record.id, `Aerodynamic table ${index + 1} id`),
    name: nonEmptyString(record.name, `Aerodynamic table ${index + 1} name`),
    machPoints: finiteNumberArray(record.machPoints, `Aerodynamic table ${index + 1} Mach points`),
    reynoldsPoints: finiteNumberArray(
      record.reynoldsPoints,
      `Aerodynamic table ${index + 1} Reynolds points`,
    ),
    dragCoefficient: coefficientSurface(
      record.dragCoefficient,
      `Aerodynamic table ${index + 1} drag coefficient`,
    ),
    normalForceSlopePerRad: coefficientSurface(
      record.normalForceSlopePerRad,
      `Aerodynamic table ${index + 1} normal-force slope`,
    ),
    centerOfPressureXM: coefficientSurface(
      record.centerOfPressureXM,
      `Aerodynamic table ${index + 1} center of pressure`,
    ),
    ...(damping !== undefined
      ? (() => {
          const dampingRecord = objectValue(
            damping,
            `Aerodynamic table ${index + 1} damping derivatives`,
          );
          return {
            dampingDerivativeBody: {
              roll: coefficientSurface(
                dampingRecord.roll,
                `Aerodynamic table ${index + 1} roll damping`,
              ),
              pitch: coefficientSurface(
                dampingRecord.pitch,
                `Aerodynamic table ${index + 1} pitch damping`,
              ),
              yaw: coefficientSurface(
                dampingRecord.yaw,
                `Aerodynamic table ${index + 1} yaw damping`,
              ),
            },
          };
        })()
      : {}),
    ...(record.outOfRangePolicy !== undefined
      ? { outOfRangePolicy: record.outOfRangePolicy as "reject" | "clamp-with-warning" }
      : {}),
    provenance: provenance(record.provenance),
  };
  createAerodynamicCoefficientTable(definition);
  return definition;
}

function validateDocument(value: unknown): LocalAerodynamicLibraryDocument {
  const document = objectValue(value, "Aerodynamic library document");
  if (document.schema !== LOCAL_AERODYNAMIC_LIBRARY_SCHEMA_ID) {
    throw new Error("Unsupported aerodynamic library schema.");
  }
  if (document.schemaVersion !== LOCAL_AERODYNAMIC_LIBRARY_SCHEMA_VERSION) {
    throw new Error("Unsupported aerodynamic library schema version.");
  }
  if (!Array.isArray(document.records)) {
    throw new Error("Aerodynamic library records must be an array.");
  }
  if (document.records.length > LOCAL_AERODYNAMIC_LIBRARY_LIMIT) {
    throw new Error(
      `Aerodynamic library may contain at most ${LOCAL_AERODYNAMIC_LIBRARY_LIMIT} records.`,
    );
  }
  const records = document.records.map((record, index) => definitionFromUnknown(record, index));
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    throw new Error("Aerodynamic library table identifiers must be unique.");
  }
  return {
    schema: LOCAL_AERODYNAMIC_LIBRARY_SCHEMA_ID,
    schemaVersion: LOCAL_AERODYNAMIC_LIBRARY_SCHEMA_VERSION,
    records,
  };
}

export function serializeLocalAerodynamicLibrary(
  records: readonly AerodynamicCoefficientTableDefinition[],
): string {
  const document: LocalAerodynamicLibraryDocument = {
    schema: LOCAL_AERODYNAMIC_LIBRARY_SCHEMA_ID,
    schemaVersion: LOCAL_AERODYNAMIC_LIBRARY_SCHEMA_VERSION,
    records,
  };
  return `${JSON.stringify(validateDocument(document), null, 2)}\n`;
}

export function parseLocalAerodynamicLibrary(
  serialized: string,
): AerodynamicCoefficientTableDefinition[] {
  try {
    return [...validateDocument(JSON.parse(serialized)).records];
  } catch (error) {
    throw new Error(
      `Could not read local aerodynamic library: ${error instanceof Error ? error.message : "invalid JSON"}`,
    );
  }
}

export function upsertLocalAerodynamicTable(
  records: readonly AerodynamicCoefficientTableDefinition[],
  next: AerodynamicCoefficientTableDefinition,
): AerodynamicCoefficientTableDefinition[] {
  const validated = definitionFromUnknown(next, 0);
  const merged = [...records.filter((record) => record.id !== validated.id), validated];
  if (merged.length > LOCAL_AERODYNAMIC_LIBRARY_LIMIT) {
    throw new Error(
      `Aerodynamic library may contain at most ${LOCAL_AERODYNAMIC_LIBRARY_LIMIT} records.`,
    );
  }
  return [...validateDocument({
    schema: LOCAL_AERODYNAMIC_LIBRARY_SCHEMA_ID,
    schemaVersion: LOCAL_AERODYNAMIC_LIBRARY_SCHEMA_VERSION,
    records: merged,
  }).records];
}
