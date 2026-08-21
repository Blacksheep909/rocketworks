import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SIMULATION_RUN_LIBRARY_EXPORT_LENGTH,
  SIMULATION_RUN_LIBRARY_EXPORT_MODEL_VERSION,
  SIMULATION_RUN_LIBRARY_EXPORT_REVIEW_BOUNDARY,
  SIMULATION_RUN_LIBRARY_EXPORT_SCHEMA,
  createSimulationRunLibraryExport,
  parseSimulationRunLibraryExport,
} from "../lib/export/simulation-run-library-exports.ts";
import {
  appendLocalSimulationRun,
  createLocalSimulationRunLibrary,
  createStagedSimulationRun,
  createVerticalSimulationRun,
  serializeLocalSimulationRunLibrary,
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

function stagedResult() {
  return {
    modelVersion: "staged-fixture-v1",
    validationStatus: "engineering-preview-unvalidated",
    maxAltitudeAglM: 900,
    maxSpeedMps: 180,
    timeToApogeeS: 22,
    trace: [],
    events: [],
    separatedBodies: [],
  };
}

function library() {
  const vertical = createVerticalSimulationRun({
    id: "run-vertical-1",
    label: "Baseline vertical",
    projectId: "arc54",
    projectName: "ARC 54",
    fingerprint: "fingerprint-v1",
    savedAtIso: "2026-08-21T09:00:00.000Z",
    result: verticalResult(),
  });
  const staged = createStagedSimulationRun({
    id: "run-staged-1",
    label: "Separation review",
    projectId: "arc54",
    projectName: "ARC 54",
    fingerprint: "fingerprint-v2",
    savedAtIso: "2026-08-21T09:01:00.000Z",
    result: stagedResult(),
  });
  return appendLocalSimulationRun(
    appendLocalSimulationRun(createLocalSimulationRunLibrary({ projectId: "arc54", projectName: "ARC 54" }), vertical),
    staged,
  );
}

test("run-library exports round-trip deterministically with source identity", () => {
  const first = createSimulationRunLibraryExport(library(), "2026-08-21T10:00:00.000Z");
  const second = createSimulationRunLibraryExport(library(), "2026-08-21T10:00:00.000Z");
  assert.equal(first, second);
  const parsed = parseSimulationRunLibraryExport(first);
  assert.equal(parsed.schema, SIMULATION_RUN_LIBRARY_EXPORT_SCHEMA);
  assert.equal(parsed.exportModelVersion, SIMULATION_RUN_LIBRARY_EXPORT_MODEL_VERSION);
  assert.equal(parsed.reviewBoundary, SIMULATION_RUN_LIBRARY_EXPORT_REVIEW_BOUNDARY);
  assert.equal(parsed.sourceProjectId, "arc54");
  assert.equal(parsed.sourceProjectName, "ARC 54");
  assert.deepEqual(parsed.library, library());
});

test("run-library exports reject tampered envelopes and project mismatches", () => {
  const serialized = createSimulationRunLibraryExport(library(), "2026-08-21T10:00:00.000Z");
  assert.throws(
    () => parseSimulationRunLibraryExport(serialized.replace(SIMULATION_RUN_LIBRARY_EXPORT_MODEL_VERSION, "other-model")),
    /Unsupported simulation run library export model/,
  );
  assert.throws(
    () => parseSimulationRunLibraryExport(serialized.replace(SIMULATION_RUN_LIBRARY_EXPORT_REVIEW_BOUNDARY, "not a boundary")),
    /boundary is not recognized/,
  );
  assert.throws(
    () => parseSimulationRunLibraryExport(serialized.replace('"sourceProjectId":"arc54"', '"sourceProjectId":"other"')),
    /project scope does not match/,
  );
  const tampered = JSON.parse(serialized);
  const vertical = tampered.library.runs.find((run) => run.kind === "vertical");
  vertical.reference.result.apogeeM = "bad";
  assert.throws(() => parseSimulationRunLibraryExport(JSON.stringify(tampered)), /apogeeM must be finite/);
  assert.throws(
    () => parseSimulationRunLibraryExport(`${serialized}${"x".repeat(MAX_SIMULATION_RUN_LIBRARY_EXPORT_LENGTH)}`),
    /exceeds the portable size limit/,
  );
});

test("run-library exports stay bounded by the validated local library", () => {
  const source = library();
  const localSerialized = serializeLocalSimulationRunLibrary(source);
  const exported = createSimulationRunLibraryExport(source, "2026-08-21T10:00:00.000Z");
  assert.notEqual(exported, localSerialized);
  assert.ok(exported.length < MAX_SIMULATION_RUN_LIBRARY_EXPORT_LENGTH);
});
