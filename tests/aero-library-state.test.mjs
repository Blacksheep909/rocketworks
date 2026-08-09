import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_AERODYNAMIC_LIBRARY_LIMIT,
  parseLocalAerodynamicLibrary,
  serializeLocalAerodynamicLibrary,
  upsertLocalAerodynamicTable,
} from "../lib/project/aero-library-state.ts";

const provenance = {
  sourceName: "Regression fixture",
  sourceKind: "user-supplied",
  dataVersion: "fixture-1",
  licenseIdentifier: "CC0-1.0",
  attribution: "Original test fixture",
  validationStatus: "user-supplied-unvalidated",
};

function definition(overrides = {}) {
  return {
    id: "fixture-aero",
    name: "Fixture Mach-Reynolds table",
    machPoints: [0, 1],
    reynoldsPoints: [1e5, 1e6],
    dragCoefficient: { values: [[0.5, 0.6], [0.45, 0.55]] },
    normalForceSlopePerRad: { values: [[4, 3.8], [4.2, 4]] },
    centerOfPressureXM: { values: [[0.5, 0.52], [0.49, 0.51]] },
    provenance,
    outOfRangePolicy: "clamp-with-warning",
    ...overrides,
  };
}

test("aerodynamic library round-trips validated coefficient definitions", () => {
  const serialized = serializeLocalAerodynamicLibrary([definition()]);
  const parsed = parseLocalAerodynamicLibrary(serialized);
  assert.deepEqual(parsed, [definition()]);
});

test("aerodynamic library rejects malformed grids, provenance, and duplicates", () => {
  assert.throws(
    () => parseLocalAerodynamicLibrary(JSON.stringify({
      schema: "dev.kestrel-lab.local-aerodynamic-library",
      schemaVersion: 1,
      records: [definition({ machPoints: [0, 0] })],
    })),
    /strictly increasing/,
  );
  assert.throws(
    () => serializeLocalAerodynamicLibrary([definition({ provenance: { ...provenance, licenseIdentifier: "" } })]),
    /license identifier/,
  );
  assert.throws(
    () => serializeLocalAerodynamicLibrary([definition(), definition()]),
    /identifiers must be unique/,
  );
});

test("aerodynamic library upsert replaces by stable id and enforces its bound", () => {
  const updated = definition({ name: "Updated table" });
  assert.equal(upsertLocalAerodynamicTable([definition()], updated)[0].name, "Updated table");
  const records = Array.from({ length: LOCAL_AERODYNAMIC_LIBRARY_LIMIT }, (_, index) =>
    definition({ id: `table-${index}` }),
  );
  assert.throws(
    () => upsertLocalAerodynamicTable(records, definition({ id: "overflow" })),
    /at most 8 records/,
  );
});
