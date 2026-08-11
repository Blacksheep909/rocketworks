import assert from "node:assert/strict";
import test from "node:test";
import {
  computeStageFlightVectorBudget,
} from "../lib/physics/index.ts";

const zero = { x: 0, y: 0, z: 0 };

function sample(timeS, velocityWorldMps, overrides = {}) {
  return {
    timeS,
    massKg: 2,
    velocityWorldMps,
    thrustForceWorldN: { x: 0, y: 0, z: 20 },
    aerodynamicForceWorldN: { x: -2, y: 0, z: 0 },
    gravityForceWorldN: { x: 0, y: 0, z: -10 },
    recoveryForceWorldN: zero,
    ...overrides,
  };
}

test("vector budget closes a constant world-frame force trace", () => {
  const result = computeStageFlightVectorBudget([
    sample(0, zero),
    sample(1, { x: -1, y: 0, z: 5 }),
  ]);

  assert.equal(result.status, "assessed");
  assert.equal(result.closureStatus, "closed");
  assert.deepEqual(result.thrust.deltaVWorldMps, { x: 0, y: 0, z: 10 });
  assert.deepEqual(result.aerodynamic.deltaVWorldMps, { x: -1, y: 0, z: 0 });
  assert.deepEqual(result.gravity.deltaVWorldMps, { x: 0, y: 0, z: -5 });
  assert.deepEqual(result.accountedVelocityChangeWorldMps, { x: -1, y: 0, z: 5 });
  assert.ok((result.closureResidualMagnitudeMps ?? Infinity) < 1e-12);
});

test("vector budget includes discrete event delta-v separately from force integration", () => {
  const result = computeStageFlightVectorBudget(
    [
      sample(0, zero),
      sample(1, { x: 2, y: 0, z: 5 }),
    ],
    [{ id: "separation", timeS: 0.5, deltaVWorldMps: { x: 3, y: 0, z: 0 } }],
  );

  assert.equal(result.eventCount, 1);
  assert.deepEqual(result.eventDeltaVWorldMps, { x: 3, y: 0, z: 0 });
  assert.deepEqual(result.observedVelocityChangeWorldMps, { x: 2, y: 0, z: 5 });
  assert.deepEqual(result.accountedVelocityChangeWorldMps, { x: 2, y: 0, z: 5 });
  assert.equal(result.closureStatus, "closed");
});

test("vector budget exposes a review closure when an event or constraint is omitted", () => {
  const result = computeStageFlightVectorBudget([
    sample(0, zero),
    sample(1, { x: 0, y: 0, z: 7 }),
  ]);

  assert.equal(result.closureStatus, "review");
  assert.ok(result.warnings.some((warning) => warning.includes("closure residual")));
});

test("vector budget rejects invalid trace and out-of-window event data", () => {
  assert.throws(
    () => computeStageFlightVectorBudget([
      sample(1, zero),
      sample(0, zero),
    ]),
    /sample times must be non-decreasing/,
  );
  assert.throws(
    () => computeStageFlightVectorBudget(
      [sample(0, zero), sample(1, zero)],
      [{ id: "late", timeS: 2, deltaVWorldMps: zero }],
    ),
    /outside the trace time span/,
  );
});
