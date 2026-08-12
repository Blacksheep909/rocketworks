import assert from "node:assert/strict";
import test from "node:test";

import {
  IDENTITY_QUATERNION,
  auditSeparationDynamics,
  solveCoupledSeparationImpulse,
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

test("separation audit retains measured impulse provenance beside derived delta-v", () => {
  const result = auditSeparationDynamics({
    eventId: "measured-source",
    releaseState: state(),
    retainedStateAfter: { ...state(), velocityWorldMps: { x: 12, y: 0, z: 0 } },
    retainedMassPropertiesBefore: massProperties(4, { x: 0, y: 0, z: 0 }),
    retainedMassPropertiesAfter: massProperties(3, { x: -1 / 3, y: 0, z: 0 }),
    configuredRetainedDeltaVBodyMps: { x: 2, y: 0, z: 0 },
    configuredRetainedImpulseBodyNs: { x: 6, y: 0, z: 0 },
    detachedBodies: [{
      id: "booster/booster-1",
      massProperties: massProperties(1, { x: 1, y: 0, z: 0 }),
      deltaVBodyMps: { x: -6, y: 0, z: 0 },
    }],
  });
  assert.deepEqual(result.retainedImpulseBodyNs, { x: 6, y: 0, z: 0 });
  assert.deepEqual(result.retainedImpulseWorldNs, { x: 6, y: 0, z: 0 });
  assert.deepEqual(result.retainedDeltaVBodyMps, { x: 2, y: 0, z: 0 });
});

test("coupled separation impulse allocation can remove a point-mass angular residual", () => {
  const result = solveCoupledSeparationImpulse({
    eventId: "three-body-release",
    releaseState: state({ x: 0, y: 0, z: 0 }),
    retainedStateAfter: {
      ...state({ x: 1, y: 0, z: 0 }),
      timeS: 4,
    },
    retainedMassPropertiesBefore: massProperties(4, { x: 0, y: 0, z: 0 }),
    retainedMassPropertiesAfter: massProperties(1, { x: 0, y: 0, z: 0 }),
    configuredRetainedDeltaVBodyMps: { x: 1, y: 0, z: 0 },
    detachedBodies: [
      {
        id: "body-a",
        massProperties: massProperties(1, { x: 0, y: 1, z: 0 }),
        deltaVBodyMps: { x: -1 / 3, y: 0, z: 0 },
      },
      {
        id: "body-b",
        massProperties: massProperties(1, { x: 0, y: 0, z: 1 }),
        deltaVBodyMps: { x: -1 / 3, y: 0, z: 0 },
      },
      {
        id: "body-c",
        massProperties: massProperties(1, { x: 1, y: 0, z: 1 }),
        deltaVBodyMps: { x: -1 / 3, y: 0, z: 0 },
      },
    ],
  });

  assert.equal(result.modelVersion, "rocketworks-coupled-separation-impulse-0.2.0");
  assert.equal(result.status, "balanced");
  assert.equal(result.correctionModel, "minimum-norm-linear-and-angular-impulse");
  assert.equal(result.resolvedConstraintCount, 6);
  assert.ok((result.maximumCorrectionMps ?? 0) > 0);
  assert.ok((result.linearMomentumResidualMagnitudeKgMps ?? 1) < 1e-8);
  assert.ok((result.angularImpulseResidualMagnitudeKgM2PerS ?? 1) < 1e-8);
  assert.equal(result.detachedBodies.length, 3);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("minimum-norm")));
});

test("coupled separation impulse allocation remains unavailable without configured event delta-v", () => {
  const result = solveCoupledSeparationImpulse({
    eventId: "no-impulse",
    releaseState: state({ x: 0, y: 0, z: 0 }),
    retainedStateAfter: state({ x: 0, y: 0, z: 0 }),
    retainedMassPropertiesBefore: massProperties(2, { x: 0, y: 0, z: 0 }),
    retainedMassPropertiesAfter: massProperties(1, { x: 0, y: 0, z: 0 }),
    detachedBodies: [{
      id: "body-a",
      massProperties: massProperties(1, { x: 0, y: 1, z: 0 }),
    }],
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.correctionModel, "not-modeled");
  assert.equal(result.maximumCorrectionMps, null);
  assert.ok(result.warnings.some((warning) => /configured retained-body/i.test(warning)));
});
