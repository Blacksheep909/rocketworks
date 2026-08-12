import assert from "node:assert/strict";
import test from "node:test";

import {
  EARTH_ROTATION_RATE_RAD_S,
  evaluateEarthRotation,
  earthRotationAngularVelocityWorldRadS,
} from "../lib/physics/index.ts";

const zeroState = {
  positionWorldM: { x: 0, y: 0, z: 0 },
  velocityWorldMps: { x: 0, y: 0, z: 0 },
};

test("local Earth rotation exposes latitude-dependent ENU angular velocity", () => {
  assert.deepEqual(earthRotationAngularVelocityWorldRadS(0), {
    x: 0,
    y: EARTH_ROTATION_RATE_RAD_S,
    z: 0,
  });
  const pole = earthRotationAngularVelocityWorldRadS(90);
  assert.equal(pole.x, 0);
  assert.ok(Math.abs(pole.y) < 1e-19);
  assert.ok(Math.abs(pole.z - EARTH_ROTATION_RATE_RAD_S) < 1e-19);
});

test("disabled rotation is an exact zero correction", () => {
  const result = evaluateEarthRotation({
    latitudeDeg: -36.85,
    ...zeroState,
  });
  assert.equal(result.enabled, false);
  assert.deepEqual(result.accelerationWorldMps2, { x: 0, y: 0, z: 0 });
  assert.deepEqual(result.coriolisAccelerationWorldMps2, { x: 0, y: 0, z: 0 });
});

test("vertical equatorial velocity produces the expected westward Coriolis term", () => {
  const result = evaluateEarthRotation({
    latitudeDeg: 0,
    positionWorldM: { x: 0, y: 0, z: 0 },
    velocityWorldMps: { x: 0, y: 0, z: 10 },
    options: { enabled: true },
  });
  assert.ok(Math.abs(result.accelerationWorldMps2.x + 20 * EARTH_ROTATION_RATE_RAD_S) < 1e-15);
  assert.equal(result.accelerationWorldMps2.y, 0);
  assert.equal(result.accelerationWorldMps2.z, 0);
});

test("optional centrifugal gradient is separated from Coriolis telemetry", () => {
  const result = evaluateEarthRotation({
    latitudeDeg: 0,
    positionWorldM: { x: 0, y: 0, z: 1000 },
    velocityWorldMps: { x: 0, y: 0, z: 0 },
    options: { enabled: true, includeCentrifugalGradient: true },
  });
  assert.ok(Object.values(result.coriolisAccelerationWorldMps2).every((value) => Math.abs(value) < 1e-30));
  assert.ok(result.centrifugalGradientAccelerationWorldMps2.z > 0);
  assert.deepEqual(
    result.accelerationWorldMps2,
    result.centrifugalGradientAccelerationWorldMps2,
  );
});

test("Earth rotation rejects invalid latitude and state vectors", () => {
  assert.throws(() => earthRotationAngularVelocityWorldRadS(90.1), /latitude/);
  assert.throws(() => evaluateEarthRotation({ latitudeDeg: 0, ...zeroState, positionWorldM: { x: Infinity, y: 0, z: 0 } }), /position/);
  assert.throws(() => evaluateEarthRotation({ latitudeDeg: 0, ...zeroState, velocityWorldMps: { x: 0, y: NaN, z: 0 } }), /velocity/);
  assert.throws(() => evaluateEarthRotation({ latitudeDeg: 0, ...zeroState, options: { enabled: "yes" } }), /enabled option/);
  assert.throws(() => evaluateEarthRotation({ latitudeDeg: 0, ...zeroState, options: { includeCentrifugalGradient: "yes" } }), /centrifugal-gradient option/);
});
