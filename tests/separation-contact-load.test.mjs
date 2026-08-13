import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeSeparationContact,
  analyzeSeparationContactLoad,
  SEPARATION_CONTACT_LOAD_MODEL_VERSION,
} from "../lib/physics/index.ts";

function point(timeS, x, velocityX, massKg) {
  return {
    timeS,
    positionWorldM: { x, y: 0, z: 0 },
    velocityWorldMps: { x: velocityX, y: 0, z: 0 },
    massKg,
  };
}

function contactResult() {
  return analyzeSeparationContact({
    bodies: [
      {
        id: "retained",
        label: "Retained",
        releaseTimeS: 0,
        envelopeRadiusM: 0.5,
        massKg: 2,
        trace: [point(0, 0, 0, 2), point(1, 0, 0, 2)],
      },
      {
        id: "booster",
        label: "Booster",
        releaseTimeS: 0,
        envelopeRadiusM: 0.5,
        massKg: 3,
        trace: [point(0, 3, -4, 3), point(1, -1, -4, 3)],
      },
    ],
  });
}

test("contact-load screen derives normal impulse and compliance force scales", () => {
  const result = analyzeSeparationContactLoad(contactResult(), {
    stoppingDistanceM: 0.1,
    coefficientOfRestitution: 0.25,
  });

  assert.equal(result.modelVersion, SEPARATION_CONTACT_LOAD_MODEL_VERSION);
  assert.equal(result.status, "assessed");
  assert.equal(result.assessedPairCount, 1);
  assert.equal(result.contactPairCount, 1);
  const pair = result.pairs[0];
  assert.equal(pair.reducedMassKg, 1.2);
  assert.equal(pair.normalIncidentEnergyJ, 9.6);
  assert.equal(pair.normalImpulseNs, 6);
  assert.equal(pair.reboundSpeedMps, 1);
  assert.equal(pair.absorbedNormalEnergyJ, 9);
  assert.equal(pair.reboundNormalEnergyJ, 0.6);
  assert.equal(pair.averageAbsorptionForceN, 90);
  assert.ok(Math.abs((pair.linearStopPeakForceN ?? 0) - 192) < 1e-12);
  assert.ok(Math.abs((result.maximumLinearStopPeakForceN ?? 0) - 192) < 1e-12);
  assert.ok(result.warnings.some((warning) => warning.includes("not a contact solver")));
});

test("contact-load screen keeps tangential energy separate from normal load", () => {
  const contact = analyzeSeparationContact({
    bodies: [
      {
        id: "a",
        releaseTimeS: 0,
        envelopeRadiusM: 0.5,
        massKg: 2,
        trace: [point(0, 0, 0, 2), point(1, 0, 0, 2)],
      },
      {
        id: "b",
        releaseTimeS: 0,
        envelopeRadiusM: 0.5,
        massKg: 2,
        trace: [
          { timeS: 0, positionWorldM: { x: 1.2, y: 0, z: 0 }, velocityWorldMps: { x: -2, y: 2, z: 0 }, massKg: 2 },
          { timeS: 1, positionWorldM: { x: -0.8, y: 2, z: 0 }, velocityWorldMps: { x: -2, y: 2, z: 0 }, massKg: 2 },
        ],
      },
    ],
  });
  const result = analyzeSeparationContactLoad(contact, { stoppingDistanceM: 0.2 });
  const pair = result.pairs[0];
  assert.equal(pair.status, "assessed");
  assert.ok((pair.totalRelativeKineticEnergyJ ?? 0) > (pair.normalIncidentEnergyJ ?? 0));
  assert.ok((pair.tangentialKineticEnergyJ ?? 0) > 0);
});

test("contact-load screen discloses no-contact, sparse mass, and invalid scenarios", () => {
  const noContact = analyzeSeparationContact({
    bodies: [
      { id: "a", releaseTimeS: 0, envelopeRadiusM: 0.5, massKg: 1, trace: [point(0, 0, 0, 1), point(1, 0, 0, 1)] },
      { id: "b", releaseTimeS: 0, envelopeRadiusM: 0.5, massKg: 1, trace: [point(0, 3, 0, 1), point(1, 3, 0, 1)] },
    ],
  });
  const result = analyzeSeparationContactLoad(noContact);
  assert.equal(result.status, "not-assessed");
  assert.equal(result.maximumNormalImpulseNs, null);
  assert.throws(
    () => analyzeSeparationContactLoad(noContact, { stoppingDistanceM: 0 }),
    /stopping distance.*positive/,
  );
  assert.throws(
    () => analyzeSeparationContactLoad(noContact, { coefficientOfRestitution: 1.1 }),
    /coefficient of restitution.*between 0 and 1/,
  );
});
