import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeSphericalSeparationEnvelope,
  estimateSphericalEnvelopeRadiusM,
} from "../lib/physics/index.ts";

const point = (timeS, x) => ({
  timeS,
  positionWorldM: { x, y: 0, z: 0 },
  velocityWorldMps: { x: 0, y: 0, z: 0 },
});

test("component geometry produces a deterministic conservative spherical bound", () => {
  const radius = estimateSphericalEnvelopeRadiusM({
    centerOfMassM: { x: 0.5, y: 0, z: 0 },
    components: [
      {
        originM: { x: 0, y: 0, z: 0 },
        component: {
          id: "body",
          name: "Body",
          stageId: "core",
          kind: "axisymmetric",
          densityKgM3: 900,
          stations: [
            { xM: 0, outerRadiusM: 0.1 },
            { xM: 1, outerRadiusM: 0.1 },
          ],
        },
      },
      {
        originM: { x: 1.2, y: 0, z: 0 },
        component: {
          id: "payload",
          name: "Payload",
          stageId: "core",
          kind: "pointMass",
          massKg: 0.1,
          positionM: { x: 0, y: 0, z: 0 },
        },
      },
    ],
  });
  assert.equal(radius, 0.7);
});

test("spherical envelope clearance subtracts both bounds and labels potential overlap", () => {
  const result = analyzeSphericalSeparationEnvelope({
    bodies: [
      {
        id: "retained",
        label: "Retained",
        releaseTimeS: 0,
        envelopeRadiusM: 0.6,
        trace: [point(0, 0), point(1, 0)],
      },
      {
        id: "booster",
        label: "Booster",
        releaseTimeS: 0,
        envelopeRadiusM: 0.6,
        trace: [point(0, 1), point(1, 1)],
      },
    ],
  });
  assert.equal(result.envelopeStatus, "assessed");
  assert.ok(Math.abs(result.minimumEnvelopeClearanceM + 0.2) < 1e-12);
  assert.equal(result.closestEnvelopePair?.firstBodyId, "retained");
  assert.equal(result.closestEnvelopePair?.secondBodyId, "booster");
  assert.equal(result.closestEnvelopePair?.timeS, 0);
  assert.ok(Math.abs((result.closestEnvelopePair?.clearanceM ?? 0) + 0.2) < 1e-12);
  assert.equal(result.closestEnvelopePair?.radiusSumM, 1.2);
  assert.equal(result.pairs[0].potentialOverlap, true);
  assert.ok(result.warnings.some((warning) => warning.includes("Potential spherical-envelope overlap")));
});

test("missing geometry remains explicit and invalid radii fail", () => {
  const partial = analyzeSphericalSeparationEnvelope({
    bodies: [
      { id: "retained", releaseTimeS: 0, envelopeRadiusM: 0.5, trace: [point(0, 0), point(1, 0)] },
      { id: "booster-a", releaseTimeS: 0, envelopeRadiusM: 0.5, trace: [point(0, 2), point(1, 2)] },
      { id: "booster-b", releaseTimeS: 0, trace: [point(0, 4), point(1, 4)] },
    ],
  });
  assert.equal(partial.envelopeStatus, "partial");
  assert.equal(partial.pairs.filter((pair) => pair.status === "assessed").length, 1);

  assert.throws(
    () => analyzeSphericalSeparationEnvelope({
      bodies: [
        { id: "a", releaseTimeS: 0, envelopeRadiusM: -0.1, trace: [point(0, 0)] },
        { id: "b", releaseTimeS: 0, envelopeRadiusM: 0.1, trace: [point(0, 1)] },
      ],
    }),
    /radius.*non-negative/,
  );
  assert.throws(
    () => analyzeSphericalSeparationEnvelope({ bodies: [{ id: "only", releaseTimeS: 0, trace: [point(0, 0)] }] }),
    /at least two bodies/,
  );
});
