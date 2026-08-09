import assert from "node:assert/strict";
import test from "node:test";
import {
  magnitude,
  quaternionFromAxisAngle,
  launchRailDirectionFromAngles,
  launchRailOrientationFromAngles,
  rotateBodyToWorld,
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

test("rail angle helpers resolve ENU direction and aligned launch attitude", () => {
  const direction = launchRailDirectionFromAngles(15, 90);
  close(direction.x, 0, 1e-15, "east component");
  close(direction.y, Math.sin(15 * Math.PI / 180), 1e-15, "north component");
  close(direction.z, Math.cos(15 * Math.PI / 180), 1e-15, "up component");
  close(magnitude(direction), 1, 1e-15, "rail direction magnitude");
  const noseDirection = rotateBodyToWorld(
    launchRailOrientationFromAngles(15, 90),
    { x: -1, y: 0, z: 0 },
  );
  close(noseDirection.x, direction.x, 1e-12, "attitude east component");
  close(noseDirection.y, direction.y, 1e-12, "attitude north component");
  close(noseDirection.z, direction.z, 1e-12, "attitude up component");
});

test("angled rail handoff preserves the configured world direction", () => {
  const inclinationDeg = 10;
  const azimuthDeg = -35;
  const direction = launchRailDirectionFromAngles(inclinationDeg, azimuthDeg);
  const result = launch({
    initialState: verticalState({
      orientationBodyToWorld: launchRailOrientationFromAngles(inclinationDeg, azimuthDeg),
    }),
    rail: { directionWorld: direction, lengthM: 1 },
    loads: () => ({
      forceWorldN: { x: direction.x * 4, y: direction.y * 4, z: direction.z * 4 },
    }),
  });
  const exit = result.events.find((event) => event.type === "rail_exit");
  close(exit.state.positionWorldM.x, direction.x, 1e-12, "angled exit east position");
  close(exit.state.positionWorldM.y, direction.y, 1e-12, "angled exit north position");
  close(exit.state.positionWorldM.z, direction.z, 1e-12, "angled exit up position");
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

test("scheduled and root-found discrete events survive rail release", () => {
  const result = launch({
    events: [{
      id: "scheduled-marker",
      label: "Scheduled marker",
      timeS: 0.5,
      apply: (state) => ({
        ...state,
        discreteState: { ...(state.discreteState ?? {}), scheduled: true },
      }),
    }],
    stateEvents: [{
      id: "root-marker",
      label: "Root marker",
      direction: "rising",
      value: (state) => state.timeS - 0.75,
      apply: (state) => ({
        ...state,
        discreteState: { ...(state.discreteState ?? {}), rooted: true },
      }),
    }],
  });

  assert.ok(result.events.some((event) => event.type === "rail_exit"));
  assert.deepEqual(
    result.appliedEvents.map((event) => event.id),
    ["scheduled-marker", "root-marker"],
  );
  assert.equal(result.freeFlight.trace[0].discreteState.scheduled, true);
  assert.equal(result.freeFlight.trace[0].discreteState.rooted, true);
});

test("scheduled events after rail exit remain in free flight", () => {
  const result = launch({
    rail: { directionWorld: { x: 0, y: 0, z: 1 }, lengthM: 0.1 },
    durationS: 1,
    timeStepS: 0.05,
    events: [{
      id: "post-rail-marker",
      label: "Post-rail marker",
      timeS: 0.5,
      apply: (state) => ({
        ...state,
        discreteState: { ...(state.discreteState ?? {}), postRail: true },
      }),
    }],
  });

  const exit = result.events.find((event) => event.type === "rail_exit");
  assert.ok(exit.timeS < 0.5);
  assert.equal(result.appliedEvents[0].id, "post-rail-marker");
  assert.equal(result.appliedEvents[0].kind, "scheduled");
  assert.equal(result.appliedEvents[0].stateBefore.discreteState?.postRail, undefined);
  assert.equal(result.finalState.discreteState?.postRail, true);
});

test("rail reversal is stopped and exposed instead of returning a negative guide state", () => {
  const result = launch({
    rail: { directionWorld: { x: 0, y: 0, z: 1 }, lengthM: 10 },
    loads: (state) => ({
      forceWorldN: {
        x: 0,
        y: 0,
        z: state.discreteState?.reverse === true ? -10 : 4,
      },
    }),
    events: [{
      id: "reverse-load",
      label: "Reverse load",
      timeS: 0.5,
      apply: (state) => ({
        ...state,
        discreteState: { ...(state.discreteState ?? {}), reverse: true },
      }),
    }],
  });

  assert.equal(result.freeFlight, null);
  assert.ok(result.events.some((event) => event.type === "rail_reversal"));
  assert.ok(result.finalState.positionWorldM.z >= -1e-12);
  assert.ok(result.warnings.some((warning) => warning.includes("lost positive rail travel")));
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
