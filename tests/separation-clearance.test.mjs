import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeMultiBodySeparation,
  analyzeSeparationClearance,
} from "../lib/physics/index.ts";

const point = (timeS, x, velocityX = 1) => ({
  timeS,
  positionWorldM: { x, y: 0, z: 10 + timeS },
  velocityWorldMps: { x: velocityX, y: 0, z: 1 },
});

test("separation clearance interpolates the retained path and preserves the closest sample", () => {
  const result = analyzeSeparationClearance({
    releaseTimeS: 1,
    retainedTrace: [point(0, 0), point(1, 1), point(2, 2), point(3, 3)],
    detachedTrace: [point(1, 2, 0), point(1.5, 2.5, 0), point(2, 3, 0), point(3, 5, 0)],
  });

  assert.equal(result.modelVersion, "kestrel-separation-clearance-0.2.0");
  assert.equal(result.validationStatus, "analytical-component-checks-only");
  assert.equal(result.status, "assessed");
  assert.equal(result.sampleCount, 4);
  assert.equal(result.matchedSampleCount, 4);
  assert.equal(result.releaseDistanceM, 1);
  assert.equal(result.minimumDistanceM, 1);
  assert.equal(result.minimumDistanceTimeS, 1);
  assert.equal(result.finalDistanceM, 2);
  assert.equal(result.relativeVelocityAtReleaseMps, 1);
  assert.ok(result.warnings.some((warning) => warning.toLowerCase().includes("center-of-mass")));
});

test("separation clearance reports partial trajectory overlap without extrapolation", () => {
  const result = analyzeSeparationClearance({
    releaseTimeS: 1,
    retainedTrace: [point(0, 0), point(1, 0), point(2, 0)],
    detachedTrace: [point(1, 1), point(2, 1), point(3, 1)],
  });

  assert.equal(result.status, "partial");
  assert.equal(result.sampleCount, 3);
  assert.equal(result.matchedSampleCount, 2);
  assert.ok(result.warnings.some((warning) => warning.includes("coverage matched 2 of 3")));
});

test("separation clearance catches a closest approach between integration samples", () => {
  const result = analyzeSeparationClearance({
    releaseTimeS: 0,
    retainedTrace: [point(0, -1), point(2, 1)],
    detachedTrace: [point(0, 1, -1), point(2, -1, -1)],
  });

  assert.equal(result.status, "assessed");
  assert.equal(result.minimumDistanceM, 0);
  assert.equal(result.minimumDistanceTimeS, 1);
  assert.equal(result.releaseDistanceM, 2);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("continuous closest approach")));
});

test("separation clearance rejects malformed trajectories and non-finite release time", () => {
  assert.throws(
    () => analyzeSeparationClearance({
      releaseTimeS: 0,
      retainedTrace: [point(0, 0), point(-1, 1)],
      detachedTrace: [point(0, 1)],
    }),
    /times must be non-decreasing/,
  );
  assert.throws(
    () => analyzeSeparationClearance({
      releaseTimeS: Number.NaN,
      retainedTrace: [point(0, 0)],
      detachedTrace: [point(0, 1)],
    }),
    /release time must be finite/,
  );
});

test("multi-body separation checks every pair and reports the closest path", () => {
  const result = analyzeMultiBodySeparation({
    bodies: [
      {
        id: "retained",
        label: "Retained vehicle",
        releaseTimeS: 0,
        trace: [point(0, 0), point(1, 0), point(2, 0), point(3, 0)],
      },
      {
        id: "booster-a",
        label: "Booster A",
        releaseTimeS: 1,
        trace: [point(1, 2), point(2, 3), point(3, 4)],
      },
      {
        id: "booster-b",
        label: "Booster B",
        releaseTimeS: 1.5,
        trace: [point(1.5, 0.5), point(2, 0.5), point(3, 0.5)],
      },
    ],
  });

  assert.equal(result.modelVersion, "kestrel-multi-body-separation-0.2.0");
  assert.equal(result.validationStatus, "analytical-component-checks-only");
  assert.equal(result.status, "assessed");
  assert.equal(result.bodies.length, 3);
  assert.equal(result.pairs.length, 3);
  assert.equal(result.minimumDistanceM, 0.5);
  assert.deepEqual(result.closestPair, {
    firstBodyId: "retained",
    secondBodyId: "booster-b",
    timeS: 1.5,
    distanceM: 0.5,
  });
  assert.ok(result.assumptions.some((assumption) => assumption.includes("later of its two release times")));
});

test("multi-body separation marks incomplete overlap and rejects invalid body sets", () => {
  const partial = analyzeMultiBodySeparation({
    bodies: [
      { id: "retained", releaseTimeS: 0, trace: [point(0, 0), point(1, 0)] },
      { id: "detached", releaseTimeS: 1, trace: [point(1, 1), point(2, 1)] },
    ],
  });
  assert.equal(partial.status, "partial");
  assert.ok(partial.warnings.some((warning) => warning.includes("pair checks")));

  assert.throws(
    () => analyzeMultiBodySeparation({
      bodies: [
        { id: "same", releaseTimeS: 0, trace: [point(0, 0)] },
        { id: "same", releaseTimeS: 0, trace: [point(0, 1)] },
      ],
    }),
    /ids must be unique/,
  );
  assert.throws(
    () => analyzeMultiBodySeparation({ bodies: [{ id: "only", releaseTimeS: 0, trace: [point(0, 0)] }] }),
    /at least two bodies/,
  );
});
