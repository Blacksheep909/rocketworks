import assert from "node:assert/strict";
import test from "node:test";

import {
  createStageFlightComparison,
  STAGE_FLIGHT_COMPARISON_MODEL_VERSION,
  STAGE_FLIGHT_COMPARISON_VALIDATION_STATUS,
} from "../lib/physics/index.ts";
import { createStageFlightComparisonCsv } from "../lib/export/project-exports.ts";

function run(overrides = {}) {
  return {
    maxAltitudeAglM: 1200,
    maxSpeedMps: 240,
    timeToApogeeS: 28.5,
    trace: Array.from({ length: 101 }, () => ({})),
    events: [{}, {}],
    separatedBodies: [{}],
    ...overrides,
  };
}

test("staged run comparison returns current-minus-reference deltas", () => {
  const result = createStageFlightComparison(
    run(),
    run({
      maxAltitudeAglM: 1325.5,
      maxSpeedMps: 231.25,
      timeToApogeeS: 30.25,
      trace: Array.from({ length: 121 }, () => ({})),
      events: [{}, {}, {}],
      separatedBodies: [{}, {}],
    }),
  );

  assert.equal(result.modelVersion, STAGE_FLIGHT_COMPARISON_MODEL_VERSION);
  assert.equal(result.validationStatus, STAGE_FLIGHT_COMPARISON_VALIDATION_STATUS);
  assert.deepEqual(
    result.metrics.map(({ key, reference, current, delta }) => ({ key, reference, current, delta })),
    [
      { key: "maxAltitudeAglM", reference: 1200, current: 1325.5, delta: 125.5 },
      { key: "maxSpeedMps", reference: 240, current: 231.25, delta: -8.75 },
      { key: "timeToApogeeS", reference: 28.5, current: 30.25, delta: 1.75 },
      { key: "traceSampleCount", reference: 101, current: 121, delta: 20 },
      { key: "eventCount", reference: 2, current: 3, delta: 1 },
      { key: "releasedBodyCount", reference: 1, current: 2, delta: 1 },
    ],
  );
  assert.ok(result.warnings.some((warning) => warning.includes("flight-safety")));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("current minus reference")));
});

test("staged run comparison keeps non-finite values unavailable", () => {
  const result = createStageFlightComparison(
    run({ maxSpeedMps: Number.NaN }),
    run({ maxSpeedMps: Number.POSITIVE_INFINITY }),
  );
  const metric = result.metrics.find(({ key }) => key === "maxSpeedMps");
  assert.deepEqual(metric && {
    reference: metric.reference,
    current: metric.current,
    delta: metric.delta,
  }, { reference: null, current: null, delta: null });
});

test("staged run comparison exports provenance, fingerprints, and signed CSV rows", () => {
  const comparison = createStageFlightComparison(
    run(),
    run({ maxAltitudeAglM: 1210 }),
  );
  const csv = createStageFlightComparisonCsv(comparison, {
    referenceFingerprint: "reference-v1",
    currentFingerprint: "current-v2",
  });
  assert.match(csv, /# comparison_model_version,rocketworks-stage-flight-comparison-0\.1\.0/);
  assert.match(csv, /# delta_semantics,current-minus-reference/);
  assert.match(csv, /# reference_fingerprint,reference-v1/);
  assert.match(csv, /# current_fingerprint,current-v2/);
  assert.match(csv, /metric_key,metric_label,unit,decimals,reference,current,delta_current_minus_reference/);
  assert.match(csv, /maxAltitudeAglM,Apogee,m,1,1200,1210,10/);
  assert.match(csv, /\r\n$/);
});
