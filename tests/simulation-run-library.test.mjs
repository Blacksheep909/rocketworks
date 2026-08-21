import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_SIMULATION_RUN_LIBRARY_LIMIT,
  LOCAL_SIMULATION_RUN_LIBRARY_MAX_SERIALIZED_LENGTH,
  LOCAL_SIMULATION_RUN_LIBRARY_SCHEMA_ID,
  appendLocalSimulationRun,
  createLocalSimulationRunLibrary,
  createStagedSimulationRun,
  createVerticalSimulationRun,
  parseLocalSimulationRunLibrary,
  removeLocalSimulationRun,
  serializeLocalSimulationRunLibrary,
  simulationRunLibraryStorageKey,
} from "../lib/project/simulation-run-library.ts";

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

function verticalRun(id = "run-vertical-1", overrides = {}) {
  return createVerticalSimulationRun({
    id,
    label: "Baseline vertical",
    projectId: "arc54",
    projectName: "ARC 54",
    fingerprint: "fingerprint-v1",
    savedAtIso: "2026-08-21T09:00:00.000Z",
    result: verticalResult(overrides),
  });
}

test("simulation run libraries round-trip mixed vertical and staged records", () => {
  const vertical = verticalRun();
  const staged = createStagedSimulationRun({
    id: "run-staged-1",
    label: "Coupled separation check",
    projectId: "arc54",
    projectName: "ARC 54",
    fingerprint: "fingerprint-staged-v2",
    savedAtIso: "2026-08-21T09:01:00.000Z",
    result: stagedResult(),
  });
  const library = appendLocalSimulationRun(
    appendLocalSimulationRun(createLocalSimulationRunLibrary({ projectId: "arc54", projectName: "ARC 54" }), vertical),
    staged,
  );
  const serialized = serializeLocalSimulationRunLibrary(library);
  assert.deepEqual(parseLocalSimulationRunLibrary(serialized), library);
  assert.equal(library.schema, LOCAL_SIMULATION_RUN_LIBRARY_SCHEMA_ID);
  assert.equal(library.runs[0].kind, "staged");
  assert.equal(library.runs[1].reference.fingerprint, "fingerprint-v1");
  assert.equal(
    simulationRunLibraryStorageKey("arc54"),
    "kestrel.project.simulation-runs.arc54.v1",
  );
});

test("run library enforces project scope, duplicate ids, and capacity", () => {
  let library = createLocalSimulationRunLibrary({ projectId: "arc54", projectName: "ARC 54" });
  for (let index = 0; index < LOCAL_SIMULATION_RUN_LIBRARY_LIMIT; index += 1) {
    library = appendLocalSimulationRun(library, verticalRun(`run-${index}`));
  }
  assert.equal(library.runs.length, LOCAL_SIMULATION_RUN_LIBRARY_LIMIT);
  assert.throws(() => appendLocalSimulationRun(library, verticalRun("run-overflow")), /full/);
  assert.throws(() => appendLocalSimulationRun(library, verticalRun("run-0")), /already exists/);
  assert.throws(
    () => appendLocalSimulationRun(library, createStagedSimulationRun({
      id: "run-other-project",
      label: "Wrong project",
      projectId: "other",
      projectName: "Other",
      fingerprint: "fingerprint",
      result: stagedResult(),
    })),
    /project scope/,
  );
  const trimmed = removeLocalSimulationRun(library, "run-0");
  assert.equal(trimmed.runs.length, LOCAL_SIMULATION_RUN_LIBRARY_LIMIT - 1);
  assert.equal(trimmed.runs.some((run) => run.id === "run-0"), false);
});

test("run library rejects malformed, stale, and oversized envelopes", () => {
  const library = createLocalSimulationRunLibrary({
    projectId: "arc54",
    projectName: "ARC 54",
    runs: [verticalRun()],
  });
  const parsed = JSON.parse(serializeLocalSimulationRunLibrary(library));
  parsed.runs[0].reference.result.apogeeM = "bad";
  assert.throws(() => parseLocalSimulationRunLibrary(JSON.stringify(parsed)), /apogeeM must be finite/);
  const wrongKind = JSON.parse(serializeLocalSimulationRunLibrary(library));
  wrongKind.runs[0].reference.kind = "staged";
  assert.throws(() => parseLocalSimulationRunLibrary(JSON.stringify(wrongKind)), /reference kind must be vertical/);
  assert.throws(
    () => parseLocalSimulationRunLibrary(JSON.stringify({
      ...JSON.parse(serializeLocalSimulationRunLibrary(library)),
      projectId: "../unsafe",
    })),
    /unsupported characters/,
  );
  assert.throws(
    () => parseLocalSimulationRunLibrary("x".repeat(LOCAL_SIMULATION_RUN_LIBRARY_MAX_SERIALIZED_LENGTH + 1)),
    /size limit/,
  );
  assert.throws(
    () => createVerticalSimulationRun({
      id: "../unsafe",
      label: "Unsafe",
      projectId: "../unsafe",
      projectName: "ARC 54",
      fingerprint: "fingerprint",
      result: verticalResult(),
    }),
    /unsupported characters|non-empty string/,
  );
});
