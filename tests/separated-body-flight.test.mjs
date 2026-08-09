import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_QUATERNION,
  simulateSeparatedBodyFlight,
} from "../lib/physics/index.ts";

function properties(massKg, x, inertia = 0.08) {
  return {
    massKg,
    centerOfMassM: { x, y: 0, z: 0 },
    inertiaAtCenterKgM2: [
      [inertia, 0, 0],
      [0, inertia, 0],
      [0, 0, inertia],
    ],
  };
}

test("separated-body preview preserves release offset and angular-rate velocity", () => {
  const result = simulateSeparatedBodyFlight({
    stageId: "booster",
    stageName: "Booster",
    releaseState: {
      timeS: 1,
      positionWorldM: { x: 4, y: 2, z: 100 },
      velocityWorldMps: { x: 3, y: 0, z: 20 },
      orientationBodyToWorld: IDENTITY_QUATERNION,
      angularVelocityBodyRadS: { x: 0, y: 1, z: 0 },
    },
    stageMassProperties: properties(2, 2),
    parentCenterOfMassBodyM: { x: 1, y: 0, z: 0 },
    durationS: 10,
    timeStepS: 0.02,
  });

  assert.equal(result.modelVersion, "kestrel-separated-body-flight-0.1.1");
  assert.equal(result.validationStatus, "analytical-component-checks-only");
  assert.deepEqual(result.releasePositionWorldM, { x: 5, y: 2, z: 100 });
  assert.deepEqual(result.releaseVelocityWorldMps, { x: 3, y: 0, z: 19 });
  assert.deepEqual(result.retainedBodyDeltaVBodyMps, { x: 0, y: 0, z: 0 });
  assert.deepEqual(result.retainedBodyDeltaVWorldMps, { x: 0, y: 0, z: 0 });
  assert.ok(result.trace.length > 1);
  assert.ok(result.maxAltitudeAglM > 100);
  assert.ok(result.impactTimeS !== null);
  assert.ok(result.warnings.some((warning) => warning.includes("ballistic")));
});

test("separated-body preview reports retained-body release delta-v without impulsing the branch", () => {
  const result = simulateSeparatedBodyFlight({
    stageId: "booster",
    stageName: "Booster",
    releaseState: {
      timeS: 1,
      positionWorldM: { x: 0, y: 0, z: 10 },
      velocityWorldMps: { x: 0, y: 0, z: 5 },
      orientationBodyToWorld: IDENTITY_QUATERNION,
      angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    },
    stageMassProperties: properties(1, 0),
    parentCenterOfMassBodyM: { x: 0, y: 0, z: 0 },
    durationS: 2,
    timeStepS: 0.02,
    retainedBodyDeltaVBodyMps: { x: 2, y: 0, z: 0 },
  });

  assert.deepEqual(result.retainedBodyDeltaVBodyMps, { x: 2, y: 0, z: 0 });
  assert.deepEqual(result.retainedBodyDeltaVWorldMps, { x: 2, y: 0, z: 0 });
  assert.deepEqual(result.releaseVelocityWorldMps, { x: 0, y: 0, z: 5 });
  assert.ok(result.assumptions.some((assumption) => assumption.includes("pre-event release state")));
});

test("separated-body preview rejects a non-positive horizon", () => {
  assert.throws(
    () => simulateSeparatedBodyFlight({
      stageId: "booster",
      stageName: "Booster",
      releaseState: {
        timeS: 1,
        positionWorldM: { x: 0, y: 0, z: 10 },
        velocityWorldMps: { x: 0, y: 0, z: 0 },
        orientationBodyToWorld: IDENTITY_QUATERNION,
        angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
      },
      stageMassProperties: properties(1, 0),
      parentCenterOfMassBodyM: { x: 0, y: 0, z: 0 },
      durationS: 1,
      timeStepS: 0.05,
    }),
    /duration must extend beyond release time/,
  );
});
