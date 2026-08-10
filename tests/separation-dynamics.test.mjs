import assert from "node:assert/strict";
import test from "node:test";

import {
  IDENTITY_QUATERNION,
  auditSeparationDynamics,
} from "../lib/physics/index.ts";

const inertia = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function massProperties(massKg, centerOfMassM) {
  return { massKg, centerOfMassM, inertiaAtCenterKgM2: inertia };
}

function state(velocityWorldMps = { x: 10, y: 0, z: 0 }) {
  return {
    timeS: 4,
    positionWorldM: { x: 0, y: 0, z: 100 },
    velocityWorldMps,
    orientationBodyToWorld: IDENTITY_QUATERNION,
    angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
  };
}

test("separation audit confirms mass-ratio linear momentum balance", () => {
  const result = auditSeparationDynamics({
    eventId: "booster-separation",
    releaseState: state(),
    retainedStateAfter: { ...state(), velocityWorldMps: { x: 12, y: 0, z: 0 } },
    retainedMassPropertiesBefore: massProperties(4, { x: 0, y: 0, z: 0 }),
    retainedMassPropertiesAfter: massProperties(3, { x: -1 / 3, y: 0, z: 0 }),
    configuredRetainedDeltaVBodyMps: { x: 2, y: 0, z: 0 },
    detachedBodies: [{
      id: "booster/booster-1",
      massProperties: massProperties(1, { x: 1, y: 0, z: 0 }),
      deltaVBodyMps: { x: -6, y: 0, z: 0 },
    }],
  });
  assert.equal(result.status, "balanced");
  assert.equal(result.impulseModel, "mass-ratio-linear-momentum");
  assert.ok(result.linearMomentumResidualMagnitudeKgMps < 1e-12);
  assert.ok(result.angularImpulseResidualMagnitudeKgM2PerS < 1e-12);
  assert.deepEqual(result.expectedDetachedDeltaVWorldMps, { x: -6, y: -0, z: -0 });
  assert.deepEqual(result.detachedBodies[0].deltaVResidualWorldMps, { x: 0, y: 0, z: 0 });
});

test("separation audit distinguishes linear imbalance from angular impulse review", () => {
  const unbalanced = auditSeparationDynamics({
    eventId: "unbalanced",
    releaseState: state(),
    retainedStateAfter: { ...state(), velocityWorldMps: { x: 12, y: 0, z: 0 } },
    retainedMassPropertiesBefore: massProperties(4, { x: 0, y: 0, z: 0 }),
    retainedMassPropertiesAfter: massProperties(3, { x: -1 / 3, y: 0, z: 0 }),
    configuredRetainedDeltaVBodyMps: { x: 2, y: 0, z: 0 },
    detachedBodies: [{
      id: "booster/booster-1",
      massProperties: massProperties(1, { x: 1, y: 0, z: 0 }),
      deltaVBodyMps: { x: -5, y: 0, z: 0 },
    }],
  });
  assert.equal(unbalanced.status, "review");
  assert.ok(unbalanced.linearMomentumResidualMagnitudeKgMps > 0.9);
  assert.ok(unbalanced.warnings.some((warning) => /Linear momentum residual/i.test(warning)));

  const offAxis = auditSeparationDynamics({
    eventId: "off-axis",
    releaseState: state(),
    retainedStateAfter: { ...state(), velocityWorldMps: { x: 12, y: 0, z: 0 } },
    retainedMassPropertiesBefore: massProperties(4, { x: 0, y: 0, z: 0 }),
    retainedMassPropertiesAfter: massProperties(3, { x: -1 / 3, y: -0.1, z: 0 }),
    configuredRetainedDeltaVBodyMps: { x: 2, y: 0, z: 0 },
    detachedBodies: [{
      id: "booster/booster-1",
      massProperties: massProperties(1, { x: 1, y: 0.3, z: 0 }),
      deltaVBodyMps: { x: -6, y: 0, z: 0 },
    }],
  });
  assert.equal(offAxis.status, "review");
  assert.ok(offAxis.linearMomentumResidualMagnitudeKgMps < 1e-12);
  assert.ok(offAxis.angularImpulseResidualMagnitudeKgM2PerS > 1);
  assert.ok(offAxis.warnings.some((warning) => /angular impulse/i.test(warning)));
});

test("separation audit keeps missing impulse configuration explicitly unavailable", () => {
  const result = auditSeparationDynamics({
    eventId: "not-modeled",
    releaseState: state(),
    retainedStateAfter: state(),
    retainedMassPropertiesBefore: massProperties(4, { x: 0, y: 0, z: 0 }),
    retainedMassPropertiesAfter: massProperties(3, { x: -1 / 3, y: 0, z: 0 }),
    detachedBodies: [{
      id: "booster/booster-1",
      massProperties: massProperties(1, { x: 1, y: 0, z: 0 }),
    }],
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.impulseModel, "not-modeled");
  assert.equal(result.retainedDeltaVBodyMps, null);
  assert.ok(result.warnings.some((warning) => /unavailable/i.test(warning)));
});

