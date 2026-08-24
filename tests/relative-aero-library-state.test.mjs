import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_ID,
  parseLocalRelativeAeroLibrary,
  serializeLocalRelativeAeroLibrary,
  upsertLocalRelativeAeroDatabase,
} from "../lib/project/relative-aero-library-state.ts";

const provenance = {
  sourceName: "Synthetic relative-body fixture",
  sourceKind: "user-supplied",
  dataVersion: "fixture-1",
  licenseIdentifier: "CC0-1.0",
  attribution: "Original test data",
  validationStatus: "user-supplied-unvalidated",
};

function grid(value) {
  return {
    values: [
      [[value, value + 0.01], [value + 0.02, value + 0.03]],
      [[value + 0.04, value + 0.05], [value + 0.06, value + 0.07]],
    ],
  };
}

function definition(id = "fixture") {
  return {
    id,
    name: "Relative-body fixture",
    machPoints: [0, 1],
    axialSeparationPointsBodyDiameters: [-1, 10],
    lateralSeparationPointsBodyDiameters: [0, 2],
    axialForceCoefficientDelta: grid(0.1),
    normalForceCoefficientDelta: grid(0.02),
    pitchMomentCoefficientDelta: grid(0.01),
    referenceAreaM2: 0.012,
    momentReferenceLengthM: 0.4,
    outOfRangePolicy: "clamp-with-warning",
    provenance,
  };
}

test("relative aero library serializes and parses a strict versioned document", () => {
  const serialized = serializeLocalRelativeAeroLibrary([definition()]);
  const parsed = parseLocalRelativeAeroLibrary(serialized);
  assert.match(serialized, new RegExp(LOCAL_RELATIVE_AERO_LIBRARY_SCHEMA_ID));
  assert.deepEqual(parsed, [definition()]);
});

test("relative aero library upsert replaces by stable id and preserves bounded records", () => {
  const first = definition("first");
  const second = definition("second");
  const replaced = { ...first, name: "Updated fixture" };
  assert.deepEqual(upsertLocalRelativeAeroDatabase([first], replaced), [replaced]);
  assert.deepEqual(upsertLocalRelativeAeroDatabase([first], second).map((record) => record.id), ["first", "second"]);
});

test("relative aero library rejects malformed schemas, duplicate ids, and invalid grid shapes", () => {
  assert.throws(
    () => parseLocalRelativeAeroLibrary(JSON.stringify({ schema: "wrong", schemaVersion: 1, records: [] })),
    /Unsupported relative aerodynamic library schema/,
  );
  assert.throws(
    () => serializeLocalRelativeAeroLibrary([definition("same"), definition("same")]),
    /identifiers must be unique/,
  );
  assert.throws(
    () => serializeLocalRelativeAeroLibrary([{ ...definition(), axialForceCoefficientDelta: { values: [[[0]]] } }]),
    /lateral separation × axial separation × Mach/,
  );
});

test("relative aero library keeps provenance and unsupported policy explicit", () => {
  const parsed = parseLocalRelativeAeroLibrary(serializeLocalRelativeAeroLibrary([definition()]));
  assert.equal(parsed[0]?.provenance.validationStatus, "user-supplied-unvalidated");
  assert.equal(parsed[0]?.outOfRangePolicy, "clamp-with-warning");
  assert.equal(parsed[0]?.momentReferenceLengthM, 0.4);
});
