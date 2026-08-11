import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_COMPONENT_LIBRARY_LIMIT,
  LOCAL_COMPONENT_LIBRARY_SCHEMA_ID,
  LOCAL_COMPONENT_LIBRARY_SCHEMA_VERSION,
  parseLocalComponentLibrary,
  serializeLocalComponentLibrary,
  upsertLocalComponentRecord,
  validateLocalComponentRecord,
} from "../lib/project/component-library-state.ts";

const provenance = {
  sourceName: "RocketWorks project",
  sourceKind: "project-authored",
  dataVersion: "0.1",
  licenseIdentifier: "MIT",
  attribution: "Original project-authored geometry",
  validationStatus: "project-authored-unvalidated",
};

const nose = {
  id: "nose-ogive",
  name: "Ogive nose",
  kind: "nose",
  description: "A reusable nose profile.",
  parameters: { kind: "nose", lengthMm: 180, profile: "ogive" },
  provenance,
};

const finSet = {
  id: "fin-trapezoid",
  name: "Trapezoid fin set",
  kind: "fin-set",
  parameters: {
    kind: "fin-set",
    count: 3,
    rootChordMm: 150,
    tipChordMm: 70,
    sweepMm: 35,
    spanMm: 55,
    thicknessMm: 2,
  },
  provenance,
};

test("component presets round-trip with an explicit schema and normalized parameters", () => {
  const serialized = serializeLocalComponentLibrary([nose, finSet]);
  assert.match(serialized, new RegExp(LOCAL_COMPONENT_LIBRARY_SCHEMA_ID));
  assert.match(serialized, new RegExp(`"schemaVersion": ${LOCAL_COMPONENT_LIBRARY_SCHEMA_VERSION}`));
  assert.deepEqual(parseLocalComponentLibrary(serialized), [
    validateLocalComponentRecord(nose),
    validateLocalComponentRecord(finSet),
  ]);
});

test("component presets reject mismatched kinds, unsafe ranges, and missing provenance", () => {
  assert.throws(
    () => validateLocalComponentRecord({ ...nose, parameters: { ...nose.parameters, kind: "airframe" } }),
    /does not match record kind/,
  );
  assert.throws(
    () => validateLocalComponentRecord({ ...finSet, parameters: { ...finSet.parameters, tipChordMm: 200 } }),
    /tipChordMm cannot exceed/,
  );
  assert.throws(
    () => validateLocalComponentRecord({ ...nose, provenance: { ...provenance, licenseIdentifier: "" } }),
    /licenseIdentifier must be a non-empty string/,
  );
  assert.throws(
    () => validateLocalComponentRecord({ ...nose, id: "contains spaces" }),
    /unsupported characters/,
  );
});

test("component library upsert replaces by stable id and enforces the bound", () => {
  const replacement = { ...nose, name: "Updated ogive" };
  assert.deepEqual(upsertLocalComponentRecord([nose], replacement), [validateLocalComponentRecord(replacement)]);
  const tooMany = Array.from({ length: LOCAL_COMPONENT_LIBRARY_LIMIT }, (_, index) => ({
    ...nose,
    id: `nose-${index}`,
  }));
  assert.throws(
    () => upsertLocalComponentRecord(tooMany, { ...finSet, id: "fin-overflow" }),
    /at most 32 records/,
  );
});

test("component library parser rejects duplicate IDs and unsupported schema versions", () => {
  const serialized = serializeLocalComponentLibrary([nose]);
  const document = JSON.parse(serialized);
  assert.throws(
    () => parseLocalComponentLibrary(JSON.stringify({ ...document, schemaVersion: 99 })),
    /Unsupported component library schema version/,
  );
  assert.throws(
    () => parseLocalComponentLibrary(JSON.stringify({ ...document, records: [nose, nose] })),
    /duplicate id nose-ogive/,
  );
});
