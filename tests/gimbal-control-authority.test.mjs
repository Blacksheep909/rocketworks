import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeGimbalControlAuthority,
  GIMBAL_CONTROL_AUTHORITY_MODEL_VERSION,
  MAX_GIMBAL_DEFLECTION_DEG,
} from "../lib/physics/index.ts";

const massProperties = {
  massKg: 2,
  centerOfMassM: { x: 0.5, y: 0, z: 0 },
  inertiaAtCenterKgM2: [
    [0.1, 0, 0],
    [0, 0.2, 0],
    [0, 0, 0.2],
  ],
};

function motor(overrides = {}) {
  return {
    id: "main-motor",
    name: "Main motor",
    thrustN: 100,
    thrustAxisBody: { x: -1, y: 0, z: 0 },
    thrustApplicationPointBodyM: { x: 0, y: 0, z: 0 },
    gimbalConfigured: true,
    responseTimeS: 0.15,
    ...overrides,
  };
}

test("gimbal authority reports conservative force, moment, and angular acceleration bounds", () => {
  const result = analyzeGimbalControlAuthority([
    {
      timeS: 0,
      massProperties,
      motors: [motor()],
      aerodynamicMomentBodyNm: { x: 0, y: 0, z: 4 },
    },
    {
      timeS: 1,
      massProperties,
      motors: [motor({ thrustN: 80 })],
      aerodynamicMomentBodyNm: { x: 0, y: 0, z: 2 },
    },
  ]);

  assert.equal(result.modelVersion, GIMBAL_CONTROL_AUTHORITY_MODEL_VERSION);
  assert.equal(result.status, "available");
  assert.equal(result.maxDeflectionDeg, MAX_GIMBAL_DEFLECTION_DEG);
  assert.equal(result.activeGimbalCoverageFraction, 1);
  assert.ok((result.peakControlForceN ?? 0) > 0);
  assert.ok((result.peakControlMomentNm ?? 0) > 0);
  assert.ok((result.peakControlAngularAccelerationRadS2 ?? 0) > 0);
  assert.equal(result.maximumConfiguredResponseTimeS, 0.15);
  assert.ok((result.minimumControlToAerodynamicMomentRatio ?? 0) > 0);
  assert.equal(result.samples.length, 2);
  assert.equal(
    result.samples[0].controlMomentNm / result.samples[0].aerodynamicMomentNm,
    result.samples[0].controlToAerodynamicMomentRatio,
  );
});

test("gimbal authority stays explicit when no schedule or no positive thrust is present", () => {
  const noSchedule = analyzeGimbalControlAuthority([{
    timeS: 0,
    massProperties,
    motors: [motor({ gimbalConfigured: false })],
  }]);
  assert.equal(noSchedule.status, "not-assessed");
  assert.equal(noSchedule.peakControlMomentNm, null);
  assert.match(noSchedule.warnings[0], /No motor carries a configured gimbal schedule/);

  const noThrust = analyzeGimbalControlAuthority([{
    timeS: 0,
    massProperties,
    motors: [motor({ thrustN: 0 })],
  }]);
  assert.equal(noThrust.status, "watch");
  assert.equal(noThrust.activeGimbalCoverageFraction, 0);
  assert.match(noThrust.warnings[0], /no trace sample has positive thrust/);
});

test("gimbal authority rejects invalid actuator inputs and time order", () => {
  assert.throws(
    () => analyzeGimbalControlAuthority([{
      timeS: 0,
      massProperties,
      motors: [motor({ thrustN: -1 })],
    }]),
    /cannot be negative/,
  );
  assert.throws(
    () => analyzeGimbalControlAuthority([
      { timeS: 1, massProperties, motors: [motor()] },
      { timeS: 0, massProperties, motors: [motor()] },
    ]),
    /non-decreasing/,
  );
  assert.throws(
    () => analyzeGimbalControlAuthority([{
      timeS: 0,
      massProperties,
      motors: [motor({ thrustAxisBody: { x: 0, y: 0, z: 0 } })],
    }]),
    /non-zero magnitude/,
  );
});
