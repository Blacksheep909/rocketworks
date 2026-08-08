import assert from "node:assert/strict";
import test from "node:test";
import {
  magnitude,
  quaternionFromAxisAngle,
  simulateRailGuidedLaunch,
  verticalLaunchOrientationBodyToEnu,
} from "../lib/physics/index.ts";

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

const body = {
  massKg: 2,
  inertiaBodyKgM2: [
    [0.2, 0, 0],
    [0, 0.5, 0],
    [0, 0, 0.5],
  ],
};

function verticalState(overrides = {}) {
  return {
    timeS: 0,
    positionWorldM: { x: 0, y: 0, z: 0 },
    velocityWorldMps: { x: 0, y: 0, z: 0 },
    orientationBodyToWorld: verticalLaunchOrientationBodyToEnu(),
    angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

function launch(overrides = {}) {
  return simulateRailGuidedLaunch({
    body,
    initialState: verticalState(),
    loads: () => ({ forceWorldN: { x: 0, y: 0, z: 4 } }),
    rail: { directionWorld: { x: 0, y: 0, z: 1 }, lengthM: 1 },
    durationS: 2,
    timeStepS: 0.05,
    ...overrides,
  });
}

test("pad support prevents motion when axial force is non-positive", () => {
  const result = launch({
    loads: () => ({ forceWorldN: { x: 0, y: 0, z: -10 } }),
    durationS: 1,
  });

  assert.equal(result.events.at(-1).type, "no_liftoff");
  assert.equal(result.freeFlight, null);
  close(result.finalState.positionWorldM.z, 0, 1e-15, "pad position");
  close(result.finalState.velocityWorldMps.z, 0, 1e-15, "pad velocity");
  close(result.railTrace[0].railReactionWorldN.z, 10, 1e-15, "pad reaction");
});

test("constant acceleration exits at the analytical time and hands off exactly", () => {
  const result = launch();
  const exit = result.events.find((event) => event.type === "rail_exit");

  close(exit.timeS, 1, 2e-12, "rail-exit time");
  close(exit.distanceAlongRailM, 1, 1e-15, "rail-exit distance");
  close(exit.speedAlongRailMps, 2, 2e-12, "rail-exit speed");
  assert.ok(result.freeFlight);
  close(result.freeFlight.trace[0].positionWorldM.z, 1, 1e-15, "handoff position");
  close(result.freeFlight.trace[0].velocityWorldMps.z, 2, 2e-12, "handoff velocity");
  close(result.finalState.positionWorldM.z, 4, 2e-11, "free-flight position");
  close(result.finalState.velocityWorldMps.z, 4, 2e-11, "free-flight velocity");
});

test("rail reaction cancels transverse force without changing axial acceleration", () => {
  const result = launch({
    loads: () => ({ forceWorldN: { x: 3, y: -2, z: 4 } }),
    durationS: 0.1,
    rail: { directionWorld: { x: 0, y: 0, z: 1 }, lengthM: 10 },
  });
  const initial = result.railTrace[0];

  close(initial.constrainedAxialAccelerationMps2, 2, 1e-15, "axial acceleration");
  close(initial.railReactionWorldN.x, -3, 1e-15, "x reaction");
  close(initial.railReactionWorldN.y, 2, 1e-15, "y reaction");
  close(initial.railReactionWorldN.z, 0, 1e-15, "z reaction");
  close(result.finalState.positionWorldM.x, 0, 1e-15, "constrained x");
  close(result.finalState.positionWorldM.y, 0, 1e-15, "constrained y");
});

test("rail holds attitude and angular rate until exit, then releases torque", () => {
  const result = launch({
    loads: () => ({
      forceWorldN: { x: 0, y: 0, z: 4 },
      momentBodyNm: { x: 0, y: 0.5, z: 0 },
    }),
  });
  const exit = result.events.find((event) => event.type === "rail_exit");

  close(magnitude(exit.state.angularVelocityBodyRadS), 0, 1e-15, "exit angular rate");
  assert.deepEqual(
    exit.state.orientationBodyToWorld,
    verticalLaunchOrientationBodyToEnu(),
  );
  assert.ok(magnitude(result.finalState.angularVelocityBodyRadS) > 0.9);
});

test("liftoff time is root-found for a smoothly changing axial load", () => {
  const result = launch({
    body: { ...body, massKg: 1 },
    loads: (state) => ({
      forceWorldN: { x: 0, y: 0, z: 4 * state.timeS - 1 },
    }),
    rail: { directionWorld: { x: 0, y: 0, z: 1 }, lengthM: 10 },
    durationS: 0.5,
    timeStepS: 0.1,
  });
  const liftoff = result.events.find((event) => event.type === "liftoff");

  close(liftoff.timeS, 0.25, 2e-12, "liftoff time");
});

test("scheduled force step uses exact left and right limits on the pad", () => {
  const result = launch({
    loads: (state) => ({
      forceWorldN:
        state.timeS < 0.5
          ? { x: 0, y: 0, z: 0 }
          : { x: 0, y: 0, z: 4 },
    }),
    rail: { directionWorld: { x: 0, y: 0, z: 1 }, lengthM: 0.25 },
    scheduledTimesS: [0.5],
    timeStepS: 0.3,
  });
  const liftoff = result.events.find((event) => event.type === "liftoff");
  const exit = result.events.find((event) => event.type === "rail_exit");

  close(liftoff.timeS, 0.5, 2e-12, "scheduled liftoff");
  close(exit.timeS, 1, 2e-12, "scheduled rail exit");
});

test("misaligned attitude and off-axis initial position are rejected", () => {
  assert.throws(
    () =>
      launch({
        initialState: verticalState({
          orientationBodyToWorld: quaternionFromAxisAngle(
            { x: 0, y: 1, z: 0 },
            Math.PI / 4,
          ),
        }),
      }),
    /align/,
  );
  assert.throws(
    () =>
      launch({
        initialState: verticalState({
          positionWorldM: { x: 0.01, y: 0, z: 0 },
        }),
        rail: {
          originWorldM: { x: 0, y: 0, z: 0 },
          directionWorld: { x: 0, y: 0, z: 1 },
          lengthM: 1,
        },
      }),
    /axis/,
  );
});
