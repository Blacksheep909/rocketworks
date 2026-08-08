import assert from "node:assert/strict";
import test from "node:test";

import {
  createMotorDataRecord,
  importMotorThrustCsv,
} from "../lib/physics/motor-data.ts";
import {
  LOCAL_MOTOR_LIBRARY_SCHEMA_ID,
  LOCAL_MOTOR_LIBRARY_LIMIT,
  parseLocalMotorLibrary,
  serializeLocalMotorLibrary,
  upsertLocalMotorRecord,
} from "../lib/project/motor-library-state.ts";

function motor(id = "user.test-01") {
  return importMotorThrustCsv("time_s,thrust_n\n0,0\n0.1,20\n0.8,20\n1,0", {
    id,
    manufacturer: "User Lab",
    designation: "Test 01",
    diameterM: 0.029,
    lengthM: 0.095,
    launchMassKg: 0.16,
    dryMassKg: 0.1,
    provenance: {
      sourceName: "Bench record",
      sourceKind: "user-supplied",
      dataVersion: "2026-08",
      licenseIdentifier: "Project-owned",
      attribution: "Project owner",
      validationStatus: "user-supplied-unvalidated",
    },
  });
}

test("local motor records round-trip with schema and derived metrics rebuilt", () => {
  const record = motor();
  const serialized = serializeLocalMotorLibrary([record]);
  assert.ok(serialized.endsWith("\n"));
  assert.equal(JSON.parse(serialized).schema, LOCAL_MOTOR_LIBRARY_SCHEMA_ID);
  const restored = parseLocalMotorLibrary(serialized);
  assert.equal(restored[0].id, record.id);
  assert.equal(restored[0].metrics.totalImpulseNs, record.metrics.totalImpulseNs);
  assert.equal(restored[0].validationStatus, "engineering-preview-unvalidated");
  assert.equal(restored[0].provenance.validationStatus, "user-supplied-unvalidated");
});

test("local motor library rejects malformed schemas, duplicates, and excessive records", () => {
  const serialized = serializeLocalMotorLibrary([motor()]);
  assert.throws(() => parseLocalMotorLibrary(serialized.replace(LOCAL_MOTOR_LIBRARY_SCHEMA_ID, "other.schema")), /Unsupported motor library schema/);
  const raw = JSON.parse(serialized);
  raw.records.push(raw.records[0]);
  assert.throws(() => parseLocalMotorLibrary(JSON.stringify(raw)), /duplicate motor library identifier/);
  const many = Array.from({ length: LOCAL_MOTOR_LIBRARY_LIMIT + 1 }, (_, index) => motor(`user.test-${index}`));
  assert.throws(() => serializeLocalMotorLibrary(many), /at most/);
});

test("upsert replaces by stable ID and preserves a bounded library", () => {
  const first = motor();
  const replacement = createMotorDataRecord({
    ...first,
    designation: "Replacement",
    thrustCurve: first.thrustCurve,
  });
  const added = upsertLocalMotorRecord([], first);
  const replaced = upsertLocalMotorRecord(added, replacement);
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].designation, "Replacement");
});
