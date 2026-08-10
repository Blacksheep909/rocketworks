import assert from "node:assert/strict";
import test from "node:test";
import {
  COUPLED_MULTI_BODY_FLIGHT_MODEL_VERSION,
  simulateCoupledMultiBodyFlight,
} from "../lib/physics/index.ts";

function body(overrides = {}) {
  return {
    id: "booster-1",
    label: "Booster 1",
    massKg: 1.2,
    releaseTimeS: 0.25,
    releasePositionWorldM: { x: 0, y: 0, z: 120 },
    releaseVelocityWorldMps: { x: 0, y: 0, z: 30 },
    ...overrides,
  };
}

test("shared-grid multi-body propagation aligns releases and reports pairwise motion", () => {
  const input = {
    bodies: [
      body(),
      body({
        id: "booster-2",
        label: "Booster 2",
        releaseTimeS: 0,
        releasePositionWorldM: { x: 2, y: 0, z: 120 },
        releaseVelocityWorldMps: { x: -2, y: 0, z: 30 },
        velocityAdjustment: {
          deltaVWorldMps: { x: 0.5, y: 0, z: 0 },
          sourceEventId: "staging-booster-separation",
        },
      }),
    ],
    durationS: 4,
    timeStepS: 0.1,
  };
  const result = simulateCoupledMultiBodyFlight(input);
  assert.equal(result.modelVersion, COUPLED_MULTI_BODY_FLIGHT_MODEL_VERSION);
  assert.equal(result.validationStatus, "analytical-component-checks-only");
  assert.equal(result.status, "assessed");
  assert.equal(result.startTimeS, 0);
  assert.equal(result.endTimeS, 4);
  assert.equal(result.stepCount, 40);
  assert.equal(result.trajectories.length, 2);
  assert.ok(result.trajectories[0].trace.some((point) => point.timeS === 0.25));
  assert.ok(result.trajectories[1].trace.some((point) => point.timeS === 0));
  assert.deepEqual(result.trajectories[1].velocityAdjustmentWorldMps, { x: 0.5, y: 0, z: 0 });
  assert.deepEqual(result.trajectories[1].releaseVelocityWorldMps, { x: -1.5, y: 0, z: 30 });
  assert.ok(result.pairwise);
  assert.equal(result.pairwise.bodies.length, 2);
  assert.equal(result.pairwise.pairs.length, 1);
  assert.ok(Number.isFinite(result.minimumDistanceM));
  assert.ok(result.warnings.some((warning) => warning.includes("shared mission-time grid")));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("fourth-order Runge")));
});

test("shared-grid propagator applies isotropic drag and terminates at ground impact", () => {
  const ballistic = simulateCoupledMultiBodyFlight({
    bodies: [body({ releaseTimeS: 0, releasePositionWorldM: { x: 0, y: 0, z: 0 }, releaseVelocityWorldMps: { x: 0, y: 0, z: -5 } })],
    durationS: 5,
    timeStepS: 0.05,
  });
  const drag = simulateCoupledMultiBodyFlight({
    bodies: [body({
      releaseTimeS: 0,
      releasePositionWorldM: { x: 0, y: 0, z: 120 },
      releaseVelocityWorldMps: { x: 0, y: 0, z: 30 },
      referenceAreaM2: 0.02,
      dragCoefficient: 0.8,
    })],
    durationS: 20,
    timeStepS: 0.05,
  });
  assert.equal(ballistic.trajectories[0].impactTimeS, 0);
  assert.ok(drag.trajectories[0].impactTimeS !== null);
  const ballisticFlight = simulateCoupledMultiBodyFlight({
    bodies: [body({
      releaseTimeS: 0,
      releasePositionWorldM: { x: 0, y: 0, z: 120 },
      releaseVelocityWorldMps: { x: 0, y: 0, z: 30 },
    })],
    durationS: 20,
    timeStepS: 0.05,
  });
  assert.ok(drag.trajectories[0].maxSpeedMps < ballisticFlight.trajectories[0].maxSpeedMps);
  assert.ok(drag.warnings.some((warning) => warning.includes("Ground crossings")));
});

test("shared-grid propagator validates identifiers, drag pairs, and mission horizon", () => {
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      bodies: [body({ id: "" })],
      durationS: 1,
      timeStepS: 0.1,
    }),
    /body id cannot be empty/,
  );
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      bodies: [body({ referenceAreaM2: 0.02 })],
      durationS: 1,
      timeStepS: 0.1,
    }),
    /drag requires area and coefficient together/,
  );
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      bodies: [body({ releaseTimeS: 2 })],
      durationS: 1,
      timeStepS: 0.1,
    }),
    /releases after mission end/,
  );
});
