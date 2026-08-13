import assert from "node:assert/strict";
import test from "node:test";

import {
  SEPARATION_CONTACT_MODEL_VERSION,
  analyzeSeparationContact,
} from "../lib/physics/index.ts";

function point(timeS, x, velocityX, massKg) {
  return {
    timeS,
    positionWorldM: { x, y: 0, z: 0 },
    ...(velocityX === null ? {} : { velocityWorldMps: { x: velocityX, y: 0, z: 0 } }),
    ...(massKg === undefined ? {} : { massKg }),
  };
}

test("contact screen root-finds first envelope contact and relative energy", () => {
  const result = analyzeSeparationContact({
    bodies: [
      {
        id: "retained",
        label: "Retained",
        releaseTimeS: 0,
        envelopeRadiusM: 0.5,
        massKg: 2,
        trace: [point(0, 0, 0), point(1, 0, 0)],
      },
      {
        id: "booster",
        label: "Booster",
        releaseTimeS: 0,
        envelopeRadiusM: 0.5,
        massKg: 3,
        trace: [point(0, 3, -4), point(1, -1, -4)],
      },
    ],
  });
  assert.equal(result.modelVersion, SEPARATION_CONTACT_MODEL_VERSION);
  assert.equal(result.status, "assessed");
  assert.equal(result.contactStatus, "contact-detected");
  assert.equal(result.assessedPairCount, 1);
  assert.equal(result.contactPairCount, 1);
  assert.ok(Math.abs((result.pairs[0].firstContactTimeS ?? 0) - 0.5) < 1e-12);
  assert.ok(Math.abs((result.pairs[0].closingSpeedAtFirstContactMps ?? 0) - 4) < 1e-12);
  assert.ok(Math.abs((result.pairs[0].reducedMassKg ?? 0) - 1.2) < 1e-12);
  assert.ok(Math.abs((result.pairs[0].relativeKineticEnergyAtFirstContactJ ?? 0) - 9.6) < 1e-12);
  assert.equal(result.firstContactPair?.firstBodyId, "retained");
  assert.equal(result.firstContactPair?.secondBodyId, "booster");
  assert.ok(Math.abs((result.closestPair?.clearanceM ?? 0) + 1) < 1e-12);
  assert.ok(result.warnings.some((warning) => warning.includes("not a contact")));
});

test("contact screen distinguishes a clean pass and partial geometry coverage", () => {
  const result = analyzeSeparationContact({
    bodies: [
      {
        id: "retained",
        releaseTimeS: 0,
        envelopeRadiusM: 0.5,
        trace: [point(0, 0, 0), point(1, 0, 0)],
      },
      {
        id: "booster",
        releaseTimeS: 0,
        envelopeRadiusM: 0.5,
        trace: [point(0, 3, 0), point(1, 3, 0)],
      },
      {
        id: "payload",
        releaseTimeS: 0,
        trace: [point(0, 6, 0), point(1, 6, 0)],
      },
    ],
  });
  assert.equal(result.status, "partial");
  assert.equal(result.contactStatus, "partial");
  assert.equal(result.assessedPairCount, 1);
  assert.equal(result.contactPairCount, 0);
  assert.equal(result.minimumClearanceM, 2);
  assert.equal(result.firstContactPair, null);
  assert.equal(result.pairs.find((pair) => pair.secondBodyId === "payload")?.status, "not-assessed");
});

test("contact screen keeps missing masses explicit and validates inputs", () => {
  const result = analyzeSeparationContact({
    bodies: [
      {
        id: "a",
        releaseTimeS: 0,
        envelopeRadiusM: 0.5,
        trace: [point(0, 0, 0), point(1, 0, 0)],
      },
      {
        id: "b",
        releaseTimeS: 0,
        envelopeRadiusM: 0.5,
        trace: [point(0, 0.5, -1), point(1, -0.5, -1)],
      },
    ],
  });
  assert.equal(result.contactStatus, "contact-detected");
  assert.equal(result.pairs[0].relativeKineticEnergyAtFirstContactJ, null);
  assert.ok(result.warnings.some((warning) => warning.includes("kinetic energy is unavailable")));

  const positionOnly = analyzeSeparationContact({
    bodies: [
      { id: "a", releaseTimeS: 0, envelopeRadiusM: 0.5, trace: [point(0, 0, null), point(1, 0, null)] },
      { id: "b", releaseTimeS: 0, envelopeRadiusM: 0.5, trace: [point(0, 2, null), point(1, 0, null)] },
    ],
  });
  assert.ok(Math.abs((positionOnly.pairs[0].relativeSpeedAtFirstContactMps ?? 0) - 2) < 1e-12);
  assert.ok(Math.abs((positionOnly.pairs[0].closingSpeedAtFirstContactMps ?? 0) - 2) < 1e-12);

  assert.throws(
    () => analyzeSeparationContact({
      bodies: [
        { id: "a", releaseTimeS: 0, envelopeRadiusM: -1, trace: [point(0, 0, 0)] },
        { id: "b", releaseTimeS: 0, envelopeRadiusM: 1, trace: [point(0, 2, 0)] },
      ],
    }),
    /radius.*non-negative/,
  );
  assert.throws(
    () => analyzeSeparationContact({
      bodies: [
        { id: "a", releaseTimeS: 0, trace: [point(0, 0, 0)] },
        { id: "a", releaseTimeS: 0, trace: [point(0, 1, 0)] },
      ],
    }),
    /duplicate/,
  );
});
