import assert from "node:assert/strict";
import test from "node:test";

import {
  createStagedSimulationReviewExport,
  createVerticalSimulationReviewExport,
  MAX_SIMULATION_REVIEW_EXPORT_LENGTH,
  parseSimulationReviewExport,
  parseStagedSimulationReviewExport,
  parseVerticalSimulationReviewExport,
  SIMULATION_REVIEW_EXPORT_MODEL_VERSION,
  SIMULATION_REVIEW_EXPORT_REVIEW_BOUNDARY,
  SIMULATION_REVIEW_EXPORT_SCHEMA,
} from "../lib/export/simulation-review-exports.ts";
import {
  createStagedSimulationReference,
  createVerticalSimulationReference,
} from "../lib/project/simulation-reference.ts";

const verticalResult = {
  apogeeM: 812.4,
  maxSpeedMps: 148.2,
  maxDynamicPressurePa: 11_480,
  timeToApogeeS: 7.3,
  totalFlightTimeS: 32.8,
  impactSpeedMps: 6.4,
  trace: [],
  events: [],
  modelVersion: "rocketworks-vertical-test-0.1.0",
  validationStatus: "engineering-preview-unvalidated",
};

const stagedResult = {
  maxAltitudeAglM: 804.1,
  maxSpeedMps: 151.7,
  timeToApogeeS: 7.1,
  trace: [],
  events: [],
  separatedBodies: [],
  modelVersion: "rocketworks-stage-test-0.1.0",
  validationStatus: "engineering-preview-unvalidated",
};

function verticalReference() {
  return createVerticalSimulationReference({
    projectId: "arc54",
    projectName: "ARC 54",
    fingerprint: "normalized-config-1",
    savedAtIso: "2026-08-21T10:00:00.000Z",
    result: verticalResult,
  });
}

function stagedReference() {
  return createStagedSimulationReference({
    projectId: "arc54",
    projectName: "ARC 54",
    fingerprint: "normalized-config-2",
    savedAtIso: "2026-08-21T10:01:00.000Z",
    result: stagedResult,
  });
}

test("vertical simulation review exports preserve the validated reference envelope", () => {
  const reference = verticalReference();
  const serialized = createVerticalSimulationReviewExport(reference);
  const parsed = parseVerticalSimulationReviewExport(serialized);
  assert.equal(parsed.schema, SIMULATION_REVIEW_EXPORT_SCHEMA);
  assert.equal(parsed.exportModelVersion, SIMULATION_REVIEW_EXPORT_MODEL_VERSION);
  assert.equal(parsed.reviewBoundary, SIMULATION_REVIEW_EXPORT_REVIEW_BOUNDARY);
  assert.deepEqual(parsed.reference, reference);
  assert.deepEqual(parseSimulationReviewExport(serialized).reference, reference);
  assert.match(serialized, /"schema":"rocketworks\.simulation-review"/);
});

test("staged simulation review exports remain kind-safe and deterministic", () => {
  const reference = stagedReference();
  const first = createStagedSimulationReviewExport(reference);
  const second = createStagedSimulationReviewExport(reference);
  assert.equal(first, second);
  assert.deepEqual(parseStagedSimulationReviewExport(first).reference, reference);
  assert.throws(
    () => parseVerticalSimulationReviewExport(first),
    /reference must be vertical/,
  );
});

test("simulation review parser rejects tampered envelopes and oversized handoffs", () => {
  const serialized = createVerticalSimulationReviewExport(verticalReference());
  assert.throws(
    () => parseSimulationReviewExport(serialized.replace(SIMULATION_REVIEW_EXPORT_MODEL_VERSION, "other-model")),
    /Unsupported simulation review export model/,
  );
  assert.throws(
    () => parseSimulationReviewExport(serialized.replace(SIMULATION_REVIEW_EXPORT_REVIEW_BOUNDARY, "not review metadata")),
    /boundary is not recognized/,
  );
  assert.throws(
    () => parseSimulationReviewExport(`${serialized}${"x".repeat(MAX_SIMULATION_REVIEW_EXPORT_LENGTH)}`),
    /exceeds the portable size limit/,
  );
  assert.throws(
    () => parseSimulationReviewExport(serialized.replace('"kind":"vertical"', '"kind":"other"')),
    /reference kind must be vertical or staged/,
  );
});
