import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_SIMULATION_REFERENCE_MAX_SERIALIZED_LENGTH,
  LOCAL_SIMULATION_REFERENCE_SCHEMA_ID,
  createStagedSimulationReference,
  createVerticalSimulationReference,
  parseStagedSimulationReference,
  parseVerticalSimulationReference,
  serializeStagedSimulationReference,
  serializeVerticalSimulationReference,
  simulationReferenceStorageKey,
} from "../lib/project/simulation-reference.ts";

function verticalResult(overrides = {}) {
  return {
    modelVersion: "vertical-fixture-v1",
    validationStatus: "engineering-preview-unvalidated",
    apogeeM: 120,
    maxSpeedMps: 42,
    maxMach: 0.12,
    maxDynamicPressurePa: 800,
    timeToApogeeS: 8,
    totalFlightTimeS: 32,
    impactSpeedMps: 7,
    thrustToWeightAtIgnition: 3,
    totalImpulseNs: 44,
    events: [],
    warnings: [],
    trace: [],
    assumptions: [],
    ...overrides,
  };
}

function stagedResult(overrides = {}) {
  return {
    modelVersion: "staged-fixture-v1",
    validationStatus: "engineering-preview-unvalidated",
    maxAltitudeAglM: 900,
    maxSpeedMps: 180,
    timeToApogeeS: 22,
    trace: [],
    events: [],
    separatedBodies: [],
    ...overrides,
  };
}

test("vertical simulation references round-trip with model and fingerprint provenance", () => {
  const reference = createVerticalSimulationReference({
    projectId: "arc54",
    projectName: "ARC 54",
    fingerprint: "fingerprint-v1",
    savedAtIso: "2026-08-21T09:00:00.000Z",
    result: verticalResult(),
  });
  const serialized = serializeVerticalSimulationReference(reference);
  assert.deepEqual(parseVerticalSimulationReference(serialized), reference);
  assert.equal(reference.schema, LOCAL_SIMULATION_REFERENCE_SCHEMA_ID);
  assert.equal(reference.kind, "vertical");
});

test("staged references round-trip independently and use project-scoped keys", () => {
  const reference = createStagedSimulationReference({
    projectId: "arc54-2",
    projectName: "ARC 54 Copy",
    fingerprint: "fingerprint-staged-v3",
    savedAtIso: "2026-08-21T09:01:00.000Z",
    result: stagedResult(),
  });
  const serialized = serializeStagedSimulationReference(reference);
  assert.deepEqual(parseStagedSimulationReference(serialized), reference);
  assert.equal(
    simulationReferenceStorageKey("arc54-2", "staged"),
    "kestrel.project.simulation-reference.arc54-2.staged.v1",
  );
  assert.notEqual(
    simulationReferenceStorageKey("arc54-2", "staged"),
    simulationReferenceStorageKey("arc54-2", "vertical"),
  );
});

test("simulation references reject stale, malformed, or oversized records", () => {
  assert.throws(
    () => parseVerticalSimulationReference(JSON.stringify({
      schema: LOCAL_SIMULATION_REFERENCE_SCHEMA_ID,
      schemaVersion: 1,
      projectId: "arc54",
      projectName: "ARC 54",
      kind: "vertical",
      savedAtIso: "2026-08-21T09:00:00.000Z",
      fingerprint: "fingerprint",
      result: verticalResult({ apogeeM: "bad" }),
    })),
    /apogeeM must be finite/,
  );
  assert.throws(
    () => createVerticalSimulationReference({
      projectId: "../unsafe",
      projectName: "ARC 54",
      fingerprint: "fingerprint",
      result: verticalResult(),
    }),
    /unsupported characters/,
  );
  assert.throws(
    () => parseStagedSimulationReference("x".repeat(LOCAL_SIMULATION_REFERENCE_MAX_SERIALIZED_LENGTH + 1)),
    /size limit/,
  );
  assert.throws(
    () => simulationReferenceStorageKey("arc54", "invalid"),
    /must be vertical|must be staged/,
  );
});
