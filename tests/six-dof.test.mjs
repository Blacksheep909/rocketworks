import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_QUATERNION,
  angularMomentumWorldNms,
  magnitude,
  quaternionFromAxisAngle,
  quaternionMagnitude,
  rotateBodyToWorld,
  rotationalKineticEnergyJ,
  stepRigidBodyAdaptive,
  simulateRigidBody6D,
} from "../lib/physics/index.ts";

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

function baseState(overrides = {}) {
  return {
    timeS: 0,
    positionWorldM: { x: 0, y: 0, z: 0 },
    velocityWorldMps: { x: 0, y: 0, z: 0 },
    orientationBodyToWorld: IDENTITY_QUATERNION,
    angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

const diagonalBody = {
  massKg: 2,
  inertiaBodyKgM2: [
    [2, 0, 0],
    [0, 3, 0],
    [0, 0, 4],
  ],
};

test("axis-angle quaternion rotates a body vector into the world frame", () => {
  const orientation = quaternionFromAxisAngle(
    { x: 0, y: 0, z: 1 },
    Math.PI / 2,
  );
  const rotated = rotateBodyToWorld(orientation, { x: 1, y: 0, z: 0 });

  close(rotated.x, 0, 1e-12, "rotated x");
  close(rotated.y, 1, 1e-12, "rotated y");
  close(rotated.z, 0, 1e-12, "rotated z");
});

test("constant world force matches closed-form translation", () => {
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState(),
    durationS: 2,
    timeStepS: 0.05,
    loads: () => ({ forceWorldN: { x: 4, y: 0, z: 0 } }),
  });

  close(result.finalState.velocityWorldMps.x, 4, 1e-11, "velocity");
  close(result.finalState.positionWorldM.x, 4, 1e-11, "position");
  close(result.finalState.timeS, 2, 1e-15, "final time");
});

test("adaptive RK4 step-doubling converges against a refined reference", () => {
  const loads = (state) => ({
    forceWorldN: {
      x: 6 * Math.sin(state.timeS * 7),
      y: 2 * Math.cos(state.timeS * 3),
      z: 1.5 * Math.sin(state.timeS * 11),
    },
    momentBodyNm: {
      x: 0.4 * Math.sin(state.timeS * 5),
      y: 0.25 * Math.cos(state.timeS * 4),
      z: 0.3 * Math.sin(state.timeS * 6),
    },
  });
  const adaptive = stepRigidBodyAdaptive(
    baseState({
      angularVelocityBodyRadS: { x: 0.2, y: -0.1, z: 0.15 },
    }),
    diagonalBody,
    2,
    loads,
    {
      relativeTolerance: 1e-9,
      absoluteTolerance: 1e-11,
      maximumStepS: 0.35,
    },
  );
  const reference = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState({
      angularVelocityBodyRadS: { x: 0.2, y: -0.1, z: 0.15 },
    }),
    durationS: 2,
    timeStepS: 0.0005,
    loads,
  });

  close(adaptive.state.positionWorldM.x, reference.finalState.positionWorldM.x, 2e-8, "adaptive x");
  close(adaptive.state.positionWorldM.y, reference.finalState.positionWorldM.y, 2e-8, "adaptive y");
  close(adaptive.state.positionWorldM.z, reference.finalState.positionWorldM.z, 2e-8, "adaptive z");
  close(adaptive.state.angularVelocityBodyRadS.x, reference.finalState.angularVelocityBodyRadS.x, 2e-8, "adaptive angular x");
  assert.ok(adaptive.acceptedStepCount > 0);
  assert.ok(adaptive.rejectedStepCount > 0);
  assert.ok(adaptive.maximumNormalizedError <= 1);
  assert.equal(adaptive.state.timeS, 2);
});

test("adaptive simulation preserves scheduled boundaries and exposes diagnostics", () => {
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState(),
    durationS: 2,
    timeStepS: 0.7,
    scheduledTimesS: [0.9],
    events: [
      {
        id: "adaptive-impulse",
        label: "Adaptive impulse",
        timeS: 0.9,
        apply: (state) => ({
          ...state,
          velocityWorldMps: { x: 3, y: 0, z: 0 },
        }),
      },
    ],
    integration: {
      method: "adaptive-rk4-step-doubling",
      adaptive: {
        relativeTolerance: 1e-8,
        absoluteTolerance: 1e-10,
        maximumStepS: 0.7,
      },
    },
  });
  const traceTimes = new Set(result.trace.map((state) => state.timeS));

  assert.ok(traceTimes.has(0.9));
  assert.equal(result.events[0].timeS, 0.9);
  assert.equal(result.finalState.timeS, 2);
  assert.equal(result.integration.method, "adaptive-rk4-step-doubling");
  assert.ok(result.integration.acceptedStepCount > 0);
  assert.ok(result.integration.minimumAcceptedStepS > 0);
  assert.ok(result.integration.maximumNormalizedError <= 1);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("Adaptive RK4")));
  assert.ok(result.warnings.some((warning) => warning.includes("truncation")));
});

test("adaptive integration rejects unsafe tolerance configuration", () => {
  assert.throws(
    () =>
      simulateRigidBody6D({
        body: diagonalBody,
        initialState: baseState(),
        durationS: 1,
        timeStepS: 0.1,
        integration: {
          method: "adaptive-rk4-step-doubling",
          adaptive: { relativeTolerance: 0 },
        },
      }),
    /relative tolerance must be positive/,
  );
  assert.throws(
    () =>
      stepRigidBodyAdaptive(baseState(), diagonalBody, 1, () => ({}), {
        minimumStepS: 0.2,
        maximumStepS: 0.1,
      }),
    /minimum step cannot exceed maximum step/,
  );
});

test("constant principal-axis torque matches angular acceleration and angle", () => {
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState(),
    durationS: 1,
    timeStepS: 0.002,
    loads: () => ({ momentBodyNm: { x: 2, y: 0, z: 0 } }),
  });
  const expected = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, 0.5);

  close(result.finalState.angularVelocityBodyRadS.x, 1, 1e-11, "angular velocity");
  close(Math.abs(result.finalState.orientationBodyToWorld.w), expected.w, 2e-8, "quaternion w");
  close(Math.abs(result.finalState.orientationBodyToWorld.x), expected.x, 2e-8, "quaternion x");
  close(quaternionMagnitude(result.finalState.orientationBodyToWorld), 1, 1e-14, "unit quaternion");
});

test("torque-free asymmetric rotation conserves energy and world angular momentum", () => {
  const initialState = baseState({
    orientationBodyToWorld: quaternionFromAxisAngle(
      { x: 1, y: 2, z: -1 },
      0.7,
    ),
    angularVelocityBodyRadS: { x: 0.3, y: 0.7, z: 1.1 },
  });
  const initialEnergy = rotationalKineticEnergyJ(
    diagonalBody.inertiaBodyKgM2,
    initialState.angularVelocityBodyRadS,
  );
  const initialMomentum = angularMomentumWorldNms(
    initialState,
    diagonalBody.inertiaBodyKgM2,
  );
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState,
    durationS: 2,
    timeStepS: 0.001,
  });
  const finalEnergy = rotationalKineticEnergyJ(
    diagonalBody.inertiaBodyKgM2,
    result.finalState.angularVelocityBodyRadS,
  );
  const finalMomentum = angularMomentumWorldNms(
    result.finalState,
    diagonalBody.inertiaBodyKgM2,
  );
  const momentumError = magnitude({
    x: finalMomentum.x - initialMomentum.x,
    y: finalMomentum.y - initialMomentum.y,
    z: finalMomentum.z - initialMomentum.z,
  });

  close(finalEnergy, initialEnergy, 2e-11, "rotational energy");
  close(momentumError, 0, 2e-10, "world angular momentum error");
  close(quaternionMagnitude(result.finalState.orientationBodyToWorld), 1, 1e-14, "unit quaternion");
});

test("integration lands exactly on scheduled discontinuity times", () => {
  const scheduledTimesS = [0.17, 0.43, 0.91];
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState(),
    durationS: 1,
    timeStepS: 0.2,
    scheduledTimesS,
  });
  const traceTimes = new Set(result.trace.map((state) => state.timeS));

  scheduledTimesS.forEach((time) => assert.ok(traceTimes.has(time)));
  assert.equal(result.finalState.timeS, 1);
});

test("scheduled load discontinuity uses left and right event limits", () => {
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState(),
    durationS: 1,
    timeStepS: 0.3,
    scheduledTimesS: [0.5],
    loads: (state) => ({
      forceWorldN:
        state.timeS < 0.5
          ? { x: 0, y: 0, z: 0 }
          : { x: 4, y: 0, z: 0 },
    }),
  });

  close(result.finalState.velocityWorldMps.x, 1, 1e-12, "post-event velocity");
  close(result.finalState.positionWorldM.x, 0.25, 1e-12, "post-event position");
});

test("prescribed inertia loss conserves principal-axis angular momentum", () => {
  const result = simulateRigidBody6D({
    body: (state) => ({
      massKg: 2 - 0.2 * state.timeS,
      inertiaBodyKgM2: [
        [2 - 0.5 * state.timeS, 0, 0],
        [0, 3 - 0.4 * state.timeS, 0],
        [0, 0, 4 - 0.3 * state.timeS],
      ],
      inertiaRateBodyKgM2PerS: [
        [-0.5, 0, 0],
        [0, -0.4, 0],
        [0, 0, -0.3],
      ],
    }),
    initialState: baseState({
      angularVelocityBodyRadS: { x: 1, y: 0, z: 0 },
    }),
    durationS: 1,
    timeStepS: 0.001,
  });

  close(
    (2 - 0.5 * result.finalState.timeS) *
      result.finalState.angularVelocityBodyRadS.x,
    2,
    2e-11,
    "principal-axis angular momentum",
  );
  close(result.finalState.angularVelocityBodyRadS.x, 4 / 3, 2e-11, "spin rate");
});

test("scheduled state-reset event applies an impulse exactly once", () => {
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState(),
    durationS: 1,
    timeStepS: 0.3,
    events: [
      {
        id: "separation-impulse",
        label: "Stage separation impulse",
        timeS: 0.5,
        apply: (state) => ({
          ...state,
          velocityWorldMps: { x: 2, y: 0, z: 0 },
        }),
      },
    ],
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].id, "separation-impulse");
  close(result.events[0].stateBefore.velocityWorldMps.x, 0, 1e-15, "pre-event velocity");
  close(result.events[0].stateAfter.velocityWorldMps.x, 2, 1e-15, "post-event velocity");
  close(result.finalState.velocityWorldMps.x, 2, 1e-15, "final velocity");
  close(result.finalState.positionWorldM.x, 1, 1e-12, "post-impulse translation");
});

test("same-time events apply deterministically in declared order", () => {
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState(),
    durationS: 1,
    timeStepS: 0.25,
    events: [
      {
        id: "first",
        label: "First reset",
        timeS: 0.5,
        apply: (state) => ({
          ...state,
          velocityWorldMps: { x: state.velocityWorldMps.x + 1, y: 0, z: 0 },
        }),
      },
      {
        id: "second",
        label: "Second reset",
        timeS: 0.5,
        apply: (state) => ({
          ...state,
          velocityWorldMps: { x: state.velocityWorldMps.x * 3, y: 0, z: 0 },
        }),
      },
    ],
  });

  assert.deepEqual(result.events.map((event) => event.id), ["first", "second"]);
  close(result.finalState.velocityWorldMps.x, 3, 1e-15, "ordered reset velocity");
});

test("invalid inertia tensors fail with an explainable error", () => {
  assert.throws(
    () =>
      simulateRigidBody6D({
        body: {
          massKg: 1,
          inertiaBodyKgM2: [
            [1, 2, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
        },
        initialState: baseState(),
        durationS: 1,
        timeStepS: 0.1,
      }),
    /symmetric/,
  );
});

test("falling altitude event root-finds impact and terminates exactly", () => {
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState({
      positionWorldM: { x: 0, y: 0, z: 10 },
      velocityWorldMps: { x: 0, y: 0, z: -3 },
    }),
    durationS: 10,
    timeStepS: 2,
    stateEvents: [
      {
        id: "ground-impact",
        label: "Ground impact",
        direction: "falling",
        terminal: true,
        value: (state) => state.positionWorldM.z,
      },
    ],
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].kind, "state");
  assert.equal(result.termination?.id, "ground-impact");
  close(result.finalState.timeS, 10 / 3, 2e-9, "impact time");
  close(result.finalState.positionWorldM.z, 0, 3e-9, "impact altitude");
});

test("non-terminal apogee event resets state once and propagation continues", () => {
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState({
      velocityWorldMps: { x: 0, y: 0, z: 4 },
    }),
    durationS: 4,
    timeStepS: 0.7,
    loads: () => ({ forceWorldN: { x: 0, y: 0, z: -4 } }),
    stateEvents: [
      {
        id: "apogee-deployment",
        label: "Apogee deployment",
        direction: "falling",
        value: (state) => state.velocityWorldMps.z,
        apply: (state) => ({
          ...state,
          velocityWorldMps: { ...state.velocityWorldMps, z: -1 },
        }),
      },
    ],
  });

  assert.equal(result.events.length, 1);
  close(result.events[0].timeS, 2, 2e-9, "apogee time");
  close(result.events[0].stateBefore.positionWorldM.z, 4, 3e-9, "apogee altitude");
  close(result.finalState.velocityWorldMps.z, -5, 3e-9, "post-reset velocity");
  assert.equal(result.termination, null);
});

test("state-event direction filter distinguishes rising and falling crossings", () => {
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState({
      positionWorldM: { x: -1, y: 0, z: 0 },
      velocityWorldMps: { x: 1, y: 0, z: 0 },
    }),
    durationS: 2,
    timeStepS: 1.5,
    stateEvents: [
      {
        id: "rising-crossing",
        label: "Rising crossing",
        direction: "rising",
        value: (state) => state.positionWorldM.x,
      },
      {
        id: "falling-crossing",
        label: "Falling crossing",
        direction: "falling",
        value: (state) => state.positionWorldM.x,
      },
    ],
  });

  assert.deepEqual(result.events.map((event) => event.id), ["rising-crossing"]);
  close(result.events[0].timeS, 1, 2e-9, "rising crossing time");
});

test("same-time state events apply in declaration order", () => {
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState({
      positionWorldM: { x: -1, y: 0, z: 0 },
      velocityWorldMps: { x: 1, y: 0, z: 0 },
    }),
    durationS: 2,
    timeStepS: 1.5,
    stateEvents: [
      {
        id: "add",
        label: "Add velocity",
        direction: "rising",
        value: (state) => state.positionWorldM.x,
        apply: (state) => ({
          ...state,
          velocityWorldMps: { x: state.velocityWorldMps.x + 1, y: 0, z: 0 },
        }),
      },
      {
        id: "multiply",
        label: "Multiply velocity",
        direction: "rising",
        value: (state) => state.positionWorldM.x,
        apply: (state) => ({
          ...state,
          velocityWorldMps: { x: state.velocityWorldMps.x * 3, y: 0, z: 0 },
        }),
      },
    ],
  });

  assert.deepEqual(result.events.map((event) => event.id), ["add", "multiply"]);
  close(result.finalState.velocityWorldMps.x, 6, 1e-12, "ordered velocity");
  close(result.finalState.positionWorldM.x, 6, 1e-8, "ordered translation");
});

test("state crossing applies before a scheduled reset at the same boundary", () => {
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState({
      positionWorldM: { x: -1, y: 0, z: 0 },
      velocityWorldMps: { x: 1, y: 0, z: 0 },
    }),
    durationS: 2,
    timeStepS: 1.5,
    events: [
      {
        id: "scheduled-multiply",
        label: "Scheduled multiply",
        timeS: 1,
        apply: (state) => ({
          ...state,
          velocityWorldMps: { x: state.velocityWorldMps.x * 2, y: 0, z: 0 },
        }),
      },
    ],
    stateEvents: [
      {
        id: "crossing-add",
        label: "Crossing add",
        direction: "rising",
        value: (state) => state.positionWorldM.x,
        apply: (state) => ({
          ...state,
          velocityWorldMps: { x: state.velocityWorldMps.x + 1, y: 0, z: 0 },
        }),
      },
    ],
  });

  assert.deepEqual(result.events.map((event) => event.id), [
    "crossing-add",
    "scheduled-multiply",
  ]);
  close(result.finalState.velocityWorldMps.x, 4, 1e-12, "boundary reset order");
});

test("trigger-at-start event can terminate from an initial boundary", () => {
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState(),
    durationS: 5,
    timeStepS: 1,
    stateEvents: [
      {
        id: "initial-boundary",
        label: "Initial boundary",
        triggerAtStart: true,
        terminal: true,
        value: (state) => state.positionWorldM.z,
      },
    ],
  });

  assert.equal(result.termination?.id, "initial-boundary");
  close(result.finalState.timeS, 0, 1e-15, "initial termination time");
});

test("non-finite event values and time-changing resets fail explicitly", () => {
  assert.throws(
    () =>
      simulateRigidBody6D({
        body: diagonalBody,
        initialState: baseState({
          positionWorldM: { x: -1, y: 0, z: 0 },
          velocityWorldMps: { x: 1, y: 0, z: 0 },
        }),
        durationS: 2,
        timeStepS: 1,
        stateEvents: [
          {
            id: "invalid-surface",
            label: "Invalid surface",
            value: () => Number.NaN,
          },
        ],
      }),
    /non-finite/,
  );
  assert.throws(
    () =>
      simulateRigidBody6D({
        body: diagonalBody,
        initialState: baseState({
          positionWorldM: { x: -1, y: 0, z: 0 },
          velocityWorldMps: { x: 1, y: 0, z: 0 },
        }),
        durationS: 2,
        timeStepS: 1.5,
        stateEvents: [
          {
            id: "invalid-reset",
            label: "Invalid reset",
            direction: "rising",
            value: (state) => state.positionWorldM.x,
            apply: (state) => ({ ...state, timeS: state.timeS + 1 }),
          },
        ],
      }),
    /preserve its root-found time/,
  );
});

test("discrete state changes only at events and persists through RK4 stages", () => {
  const result = simulateRigidBody6D({
    body: diagonalBody,
    initialState: baseState({ discreteState: { recovery: "stowed" } }),
    durationS: 1,
    timeStepS: 0.3,
    events: [
      {
        id: "deploy",
        label: "Deploy recovery",
        timeS: 0.5,
        apply: (state) => ({
          ...state,
          discreteState: { ...state.discreteState, recovery: "deployed" },
        }),
      },
    ],
  });

  assert.equal(result.events[0].stateBefore.discreteState.recovery, "stowed");
  assert.equal(result.events[0].stateAfter.discreteState.recovery, "deployed");
  assert.equal(result.finalState.discreteState.recovery, "deployed");
});

test("invalid discrete-state values fail explicitly", () => {
  assert.throws(
    () =>
      simulateRigidBody6D({
        body: diagonalBody,
        initialState: baseState({
          discreteState: { invalid: Number.NaN },
        }),
        durationS: 1,
        timeStepS: 0.1,
      }),
    /booleans, finite numbers, or strings/,
  );
});
