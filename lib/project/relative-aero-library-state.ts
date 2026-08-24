import {
  createRelativeAeroDatabase,
  type RelativeAeroDatabaseCoefficientGrid,
  type RelativeAeroDatabaseDefinition,
} from "../physics/relative-aero-database.ts";
import type { AerodynamicDataProvenance } from "../physics/aerodynamic-coefficients.ts";

/** Versioned, device-local storage for user-supplied relative-body tables. */
export const LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_ID =
  "dev.kestrel-lab.local-relative-aero-library";
export const LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_VERSION = 1;
export const LOCAL_RELATIVE_AERO_LIBRARY_STORAGE_KEY =
  "kestrel.project.arc54.relative-aero-library.v1";
export const LOCAL_RELATIVE_AERO_SELECTION_STORAGE_KEY =
  "kestrel.project.arc54.relative-aero-selection.v1";
export const LOCAL_RELATIVE_AERO_BINDING_MODE_STORAGE_KEY =
  "kestrel.project.arc54.relative-aero-binding-mode.v1";
export const LOCAL_RELATIVE_AERO_LIBRARY_LIMIT = 8;

export type LocalRelativeAeroLibraryDocument = Readonly<{
  schema: typeof LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_ID;
  schemaVersion: typeof LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_VERSION;
  records: ReadonlyArray<RelativeAeroDatabaseDefinition>;
}>;

export type RelativeAeroBindingMode =
  | "disabled"
  | "retained-to-detached"
  | "detached-to-retained"
  | "all-directed-pairs";

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

function gridValues(value: unknown, label: string): number[][][] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label}.values must be a non-empty 3D grid.`);
  }
  return value.map((lateralLayer, lateralIndex) => {
    if (!Array.isArray(lateralLayer) || lateralLayer.length === 0) {
      throw new Error(`${label}.values[${lateralIndex}] must be a non-empty axial layer.`);
    }
    return lateralLayer.map((axialLayer, axialIndex) => {
      if (!Array.isArray(axialLayer) || axialLayer.length === 0) {
        throw new Error(
          `${label}.values[${lateralIndex}][${axialIndex}] must be a non-empty Mach row.`,
        );
      }
      return axialLayer.map((entry, machIndex) =>
        finiteNumber(
          entry,
          `${label}.values[${lateralIndex}][${axialIndex}][${machIndex}]`,
        ),
      );
    });
  });
}

function coefficientGrid(value: unknown, label: string): RelativeAeroDatabaseCoefficientGrid {
  const grid = objectValue(value, label);
  const values = gridValues(grid.values, label);
  const absoluteUncertainty = grid.absoluteUncertainty === undefined
    ? undefined
    : gridValues(grid.absoluteUncertainty, `${label}.absoluteUncertainty`);
  return absoluteUncertainty === undefined
    ? { values }
    : { values, absoluteUncertainty };
}

function provenance(value: unknown): AerodynamicDataProvenance {
  const source = objectValue(value, "relative aerodynamic database provenance");
  const sourceKind = source.sourceKind;
  if (
    sourceKind !== "wind-tunnel" &&
    sourceKind !== "cfd" &&
    sourceKind !== "flight-test" &&
    sourceKind !== "published-analysis" &&
    sourceKind !== "user-supplied"
  ) {
    throw new Error("relative aerodynamic database provenance source kind is invalid.");
  }
  const validationStatus = source.validationStatus;
  if (
    validationStatus !== "user-supplied-unvalidated" &&
    validationStatus !== "published-data-unverified" &&
    validationStatus !== "independently-benchmarked"
  ) {
    throw new Error("relative aerodynamic database provenance validation status is invalid.");
  }
  return {
    sourceName: nonEmptyString(source.sourceName, "relative aerodynamic database source name"),
    sourceKind,
    dataVersion: nonEmptyString(source.dataVersion, "relative aerodynamic database data version"),
    licenseIdentifier: nonEmptyString(
      source.licenseIdentifier,
      "relative aerodynamic database license identifier",
    ),
    validationStatus,
    ...(source.sourceUrl !== undefined
      ? { sourceUrl: nonEmptyString(source.sourceUrl, "relative aerodynamic database source URL") }
      : {}),
    ...(source.attribution !== undefined
      ? { attribution: nonEmptyString(source.attribution, "relative aerodynamic database attribution") }
      : {}),
  };
}

function definitionFromUnknown(value: unknown, index: number): RelativeAeroDatabaseDefinition {
  const record = objectValue(value, `Relative aerodynamic database ${index + 1}`);
  const definition: RelativeAeroDatabaseDefinition = {
    id: nonEmptyString(record.id, `Relative aerodynamic database ${index + 1} id`),
    name: nonEmptyString(record.name, `Relative aerodynamic database ${index + 1} name`),
    machPoints: finiteNumberArray(
      record.machPoints,
      `Relative aerodynamic database ${index + 1} Mach points`,
    ),
    axialSeparationPointsBodyDiameters: finiteNumberArray(
      record.axialSeparationPointsBodyDiameters,
      `Relative aerodynamic database ${index + 1} axial separation points`,
    ),
    lateralSeparationPointsBodyDiameters: finiteNumberArray(
      record.lateralSeparationPointsBodyDiameters,
      `Relative aerodynamic database ${index + 1} lateral separation points`,
    ),
    axialForceCoefficientDelta: coefficientGrid(
      record.axialForceCoefficientDelta,
      `Relative aerodynamic database ${index + 1} axial-force coefficient delta`,
    ),
    ...(record.normalForceCoefficientDelta !== undefined
      ? {
          normalForceCoefficientDelta: coefficientGrid(
            record.normalForceCoefficientDelta,
            `Relative aerodynamic database ${index + 1} normal-force coefficient delta`,
          ),
        }
      : {}),
    ...(record.sideForceCoefficientDelta !== undefined
      ? {
          sideForceCoefficientDelta: coefficientGrid(
            record.sideForceCoefficientDelta,
            `Relative aerodynamic database ${index + 1} side-force coefficient delta`,
          ),
        }
      : {}),
    ...(record.rollMomentCoefficientDelta !== undefined
      ? {
          rollMomentCoefficientDelta: coefficientGrid(
            record.rollMomentCoefficientDelta,
            `Relative aerodynamic database ${index + 1} roll-moment coefficient delta`,
          ),
        }
      : {}),
    ...(record.pitchMomentCoefficientDelta !== undefined
      ? {
          pitchMomentCoefficientDelta: coefficientGrid(
            record.pitchMomentCoefficientDelta,
            `Relative aerodynamic database ${index + 1} pitch-moment coefficient delta`,
          ),
        }
      : {}),
    ...(record.yawMomentCoefficientDelta !== undefined
      ? {
          yawMomentCoefficientDelta: coefficientGrid(
            record.yawMomentCoefficientDelta,
            `Relative aerodynamic database ${index + 1} yaw-moment coefficient delta`,
          ),
        }
      : {}),
    ...(record.referenceAreaM2 !== undefined
      ? {
          referenceAreaM2: finiteNumber(
            record.referenceAreaM2,
            `Relative aerodynamic database ${index + 1} reference area`,
          ),
        }
      : {}),
    ...(record.momentReferenceLengthM !== undefined
      ? {
          momentReferenceLengthM: finiteNumber(
            record.momentReferenceLengthM,
            `Relative aerodynamic database ${index + 1} moment reference length`,
          ),
        }
      : {}),
    ...(record.outOfRangePolicy !== undefined
      ? {
          outOfRangePolicy: record.outOfRangePolicy as "reject" | "clamp-with-warning",
        }
      : {}),
    provenance: provenance(record.provenance),
  };
  createRelativeAeroDatabase(definition);
  return definition;
}

function validateDocument(value: unknown): LocalRelativeAeroLibraryDocument {
  const document = objectValue(value, "Relative aerodynamic library document");
  if (document.schema !== LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_ID) {
    throw new Error("Unsupported relative aerodynamic library schema.");
  }
  if (document.schemaVersion !== LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_VERSION) {
    throw new Error("Unsupported relative aerodynamic library schema version.");
  }
  if (!Array.isArray(document.records)) {
    throw new Error("Relative aerodynamic library records must be an array.");
  }
  if (document.records.length > LOCAL_RELATIVE_AERO_LIBRARY_LIMIT) {
    throw new Error(
      `Relative aerodynamic library may contain at most ${LOCAL_RELATIVE_AERO_LIBRARY_LIMIT} records.`,
    );
  }
  const records = document.records.map((record, index) => definitionFromUnknown(record, index));
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    throw new Error("Relative aerodynamic database identifiers must be unique.");
  }
  return {
    schema: LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_ID,
    schemaVersion: LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_VERSION,
    records,
  };
}

export function serializeLocalRelativeAeroLibrary(
  records: readonly RelativeAeroDatabaseDefinition[],
): string {
  const document: LocalRelativeAeroLibraryDocument = {
    schema: LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_ID,
    schemaVersion: LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_VERSION,
    records,
  };
  return `${JSON.stringify(validateDocument(document), null, 2)}\n`;
}

export function parseLocalRelativeAeroLibrary(
  serialized: string,
): RelativeAeroDatabaseDefinition[] {
  try {
    return [...validateDocument(JSON.parse(serialized)).records];
  } catch (error) {
    throw new Error(
      `Could not read local relative aerodynamic library: ${error instanceof Error ? error.message : "invalid JSON"}`,
    );
  }
}

export function upsertLocalRelativeAeroDatabase(
  records: readonly RelativeAeroDatabaseDefinition[],
  next: RelativeAeroDatabaseDefinition,
): RelativeAeroDatabaseDefinition[] {
  const validated = definitionFromUnknown(next, 0);
  const merged = [...records.filter((record) => record.id !== validated.id), validated];
  if (merged.length > LOCAL_RELATIVE_AERO_LIBRARY_LIMIT) {
    throw new Error(
      `Relative aerodynamic library may contain at most ${LOCAL_RELATIVE_AERO_LIBRARY_LIMIT} records.`,
    );
  }
  return [...validateDocument({
    schema: LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_ID,
    schemaVersion: LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_VERSION,
    records: merged,
  }).records];
}
