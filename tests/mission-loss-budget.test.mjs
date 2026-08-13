import assert from "node:assert/strict";
import test from "node:test";
import {
  computeMissionLossBudget,
} from "../lib/physics/index.ts";

const zero = { x: 0, y: 0, z: 0 };

function sample(timeS, velocityWorldMps, overrides = {}) {
  return {
    timeS,
    massKg: 2,
    velocityWorldMps,
    thrustForceWorldN: { x: 0, y: 0, z: 20 },
    aerodynamicForceWorldN: { x: 0, y: 0, z: -2 },
    gravityForceWorldN: { x: 0, y: 0, z: -10 },
    recoveryForceWorldN: { x: 0, y: 0, z: 2 },
    ...overrides,
  };
}

test("mission loss screen projects opposing and assisting force components", () => {
  const result = computeMissionLossBudget([
    sample(0, zero),
    sample(1, { x: 0, y: 0, z: 5 }),
  ]);

  assert.equal(result.status, "assessed");
  assert.equal(result.thrustAxisCoverageFraction, 1);
  assert.equal(result.thrustImpulseEquivalentMps, 10);
  assert.deepEqual(result.netThrustDeltaVWorldMps, { x: 0, y: 0, z: 10 });
  assert.equal(result.netThrustDeltaVMagnitudeMps, 10);
  assert.equal(result.steeringDispersionMps, 0);
  assert.equal(result.gravity?.signedAlongThrustMps, -5);
  assert.equal(result.gravity?.opposingMps, 5);
  assert.equal(result.aerodynamic?.opposingMps, 1);
  assert.equal(result.recovery?.assistingMps, 1);
  assert.deepEqual(result.observedVelocityChangeWorldMps, { x: 0, y: 0, z: 5 });
  assert.ok(result.warnings.some((warning) => warning.includes("not a validated mission")));
});

test("mission loss screen reports steering dispersion from changing thrust direction", () => {
  const result = computeMissionLossBudget([
    sample(0, zero, {
      thrustForceWorldN: { x: 10, y: 0, z: 0 },
      aerodynamicForceWorldN: zero,
      gravityForceWorldN: zero,
      recoveryForceWorldN: zero,
    }),
    sample(1, { x: 5, y: 0, z: 5 }, {
      thrustForceWorldN: { x: 0, y: 0, z: 10 },
      aerodynamicForceWorldN: zero,
      gravityForceWorldN: zero,
      recoveryForceWorldN: zero,
    }),
  ]);

  assert.equal(result.thrustImpulseEquivalentMps, 5);
  assert.ok(Math.abs((result.netThrustDeltaVMagnitudeMps ?? 0) - Math.sqrt(12.5)) < 1e-12);
  assert.ok(Math.abs((result.steeringDispersionMps ?? 0) - (5 - Math.sqrt(12.5))) < 1e-12);
});

test("mission loss screen projects events only when an active thrust axis is available", () => {
  const result = computeMissionLossBudget(
    [
      sample(0, zero),
      sample(1, { x: 0, y: 0, z: 5 }),
    ],
    [
      { id: "separation", timeS: 0.5, deltaVWorldMps: { x: 0, y: 0, z: -2 } },
    ],
  );

  assert.equal(result.projectedEventCount, 1);
  assert.equal(result.unprojectedEventCount, 0);
  assert.equal(result.discreteEvents?.opposingMps, 2);
});

test("mission loss screen keeps sparse thrust and malformed inputs explicit", () => {
  assert.equal(computeMissionLossBudget([]).status, "not-assessed");
  const coast = computeMissionLossBudget([
    sample(0, zero, { thrustForceWorldN: zero }),
    sample(1, zero, { thrustForceWorldN: zero }),
  ]);
  assert.equal(coast.status, "partial");
  assert.equal(coast.thrustAxisSampleCount, 0);
  assert.equal(coast.thrustAxisCoverageFraction, 0);
  assert.ok(coast.warnings.some((warning) => warning.includes("zero-thrust")));
  assert.throws(
    () => computeMissionLossBudget([
      sample(1, zero),
      sample(0, zero),
    ]),
    /sample times must be non-decreasing/,
  );
  assert.throws(
    () => computeMissionLossBudget(
      [sample(0, zero), sample(1, zero)],
      [{ id: "late", timeS: 2, deltaVWorldMps: zero }],
    ),
    /outside the trace time span/,
  );
});
