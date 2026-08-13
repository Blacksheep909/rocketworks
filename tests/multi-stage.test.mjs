import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_QUATERNION,
  createMultiStageVehicleModel,
  createScheduledStageIgnitionEvent,
  createScheduledStageIgnitionFailureEvent,
  createScheduledStageSeparationEvent,
  failStageIgnition,
  igniteStage,
  initializeMultiStageState,
  separateStage,
  simulateRigidBody6D,
  stageIgnitionFailureKey,
  stageInstanceIgnitionTimeKey,
  stageInstanceSeparationKey,
  stageIgnitionTimeKey,
  stageSeparationKey,
  magnitude,
} from "../lib/physics/index.ts";

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

const triangle = [
  { timeS: 0, thrustN: 0 },
  { timeS: 1, thrustN: 10 },
  { timeS: 2, thrustN: 0 },
];

function properties(massKg, x, inertia = 0.05) {
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

function stage(id, x, scale = 1, motorOverrides = {}) {
  return {
    id,
    name: `${id} stage`,
    structuralMassProperties: properties(1 * scale, x),
    motors: [
      {
        id: `${id}-motor`,
        name: `${id} motor`,
        thrustCurve: triangle,
        dryMassProperties: properties(0.5 * scale, x),
        initialPropellantMassProperties: properties(0.5 * scale, x),
        thrustApplicationPointBodyM: { x: x + 0.1, y: 0, z: 0 },
        thrustAxisBody: { x: -1, y: 0, z: 0 },
        ...motorOverrides,
      },
    ],
  };
}

function model(stageOverrides = []) {
  const stages = [stage("booster", 2), stage("upper", 1, 0.5)];
  stageOverrides.forEach((override, index) => Object.assign(stages[index], override));
  return createMultiStageVehicleModel({
    retainedMassProperties: properties(1, 0),
    stages,
  });
}

function state(timeS = 0, overrides = {}) {
  return {
    timeS,
    positionWorldM: { x: 0, y: 0, z: 0 },
    velocityWorldMps: { x: 0, y: 0, z: 0 },
    orientationBodyToWorld: IDENTITY_QUATERNION,
    angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

function ignitedAtZero(timeS, stageId = "booster") {
  return {
    ...initializeMultiStageState(state(), [stageId]),
    timeS,
  };
}

test("attached stages contribute dry and propellant mass until separation", () => {
  const staging = model();
  const initial = staging.evaluate(initializeMultiStageState(state(), ["booster"]));
  const midpoint = staging.evaluate(ignitedAtZero(1));
  const separated = staging.evaluate(
    separateStage(ignitedAtZero(2), "booster"),
  );

  close(initial.massProperties.massKg, 4, 1e-15, "initial stack mass");
  close(midpoint.massProperties.massKg, 3.75, 1e-15, "mid-burn stack mass");
  close(midpoint.stages[0].propellantMassKg, 0.25, 1e-15, "remaining booster propellant");
  close(separated.massProperties.massKg, 2, 1e-15, "upper vehicle mass");
  assert.deepEqual(separated.attachedStageIds, ["upper"]);
  assert.equal(separated.stages[0].phase, "separated");
});

test("multi-stage evaluation can use measured motor mass flow", () => {
  const measuredStage = stage("measured", 2);
  measuredStage.motors[0].massFlowHistoryKgS = [
    { timeS: 0, massFlowKgS: 0 },
    { timeS: 0.5, massFlowKgS: 1 },
    { timeS: 1, massFlowKgS: 0 },
  ];
  const staging = createMultiStageVehicleModel({
    retainedMassProperties: properties(1, 0),
    stages: [measuredStage],
  });
  const initial = initializeMultiStageState(state(), ["measured"]);
  const evaluation = staging.evaluate(
    { ...initial, timeS: 0.25 },
  );
  const motorState = evaluation.stages[0].motors[0];
  close(motorState.remainingPropellantFraction, 0.875, 1e-15, "stage measured remaining fraction");
  close(motorState.propellantMassRateKgS, -0.5, 1e-15, "stage measured mass rate");
  assert.equal(motorState.depletionSource, "measured-mass-flow");
  assert.ok(staging.assumptions.some((assumption) => assumption.includes("measured mass-flow")));
});

test("stage mass-property lookup returns the detached body's live mass state", () => {
  const staging = model();
  const halfBurn = ignitedAtZero(1);
  const booster = staging.stageMassProperties(halfBurn, "booster");

  close(booster.massKg, 1.75, 1e-15, "half-burn booster mass");
  close(booster.centerOfMassM.x, 2, 1e-15, "booster centre of mass");
  assert.throws(
    () => staging.stageMassProperties(separateStage(halfBurn, "booster"), "booster"),
    /not attached/,
  );
});

test("burnout events root-find simultaneous separation and upper-stage ignition", () => {
  const staging = model();
  const initialState = initializeMultiStageState(state(), ["booster"]);
  const result = simulateRigidBody6D({
    body: staging.body,
    initialState,
    durationS: 3,
    timeStepS: 0.7,
    loads: staging.loads,
    stateEvents: [
      staging.createBurnoutSeparationEvent({ stageId: "booster" }),
      staging.createBurnoutIgnitionEvent({
        sourceStageId: "booster",
        targetStageId: "upper",
      }),
    ],
  });

  assert.equal(result.events.length, 2);
  close(result.events[0].timeS, 2, 2e-9, "separation time");
  close(result.events[1].timeS, 2, 2e-9, "upper ignition time");
  assert.equal(result.finalState.discreteState[stageSeparationKey("booster")], true);
  close(
    result.finalState.discreteState[stageIgnitionTimeKey("upper")],
    2,
    2e-9,
    "recorded upper ignition",
  );
  assert.equal(staging.evaluate(result.finalState).stages[1].phase, "burning");
});

test("burnout sequencing honors deterministic coast delays", () => {
  const staging = model();
  const result = simulateRigidBody6D({
    body: staging.body,
    initialState: initializeMultiStageState(state(), ["booster"]),
    durationS: 3,
    timeStepS: 0.6,
    stateEvents: [
      staging.createBurnoutSeparationEvent({ stageId: "booster", delayS: 0.2 }),
      staging.createBurnoutIgnitionEvent({
        sourceStageId: "booster",
        targetStageId: "upper",
        delayS: 0.4,
      }),
    ],
  });

  close(result.events[0].timeS, 2.2, 2e-9, "delayed separation");
  close(result.events[1].timeS, 2.4, 2e-9, "delayed ignition");
});

test("separation delta-v is applied in the retained body's current attitude", () => {
  const direct = separateStage(state(), "booster", { x: 2.5, y: 0, z: 0 });
  assert.deepEqual(direct.velocityWorldMps, { x: 2.5, y: 0, z: 0 });

  const staging = model([{ separationDeltaVBodyMps: 3.2 }]);
  const result = simulateRigidBody6D({
    body: staging.body,
    initialState: initializeMultiStageState(state(), ["booster"]),
    durationS: 3,
    timeStepS: 0.6,
    stateEvents: [staging.createBurnoutSeparationEvent({ stageId: "booster" })],
  });
  assert.equal(result.events.length, 1);
  close(result.events[0].stateAfter.velocityWorldMps.x, 3.2, 2e-9, "configured separation delta-v");
  assert.deepEqual(result.events[0].separationDeltaVBodyMps, { x: 3.2, y: 0, z: 0 });
});

test("multiple motors support delayed ignition and off-axis moments", () => {
  const clusteredStage = stage("cluster", 1);
  clusteredStage.motors = [
    {
      ...clusteredStage.motors[0],
      id: "left",
      thrustApplicationPointBodyM: { x: 1.1, y: 0.2, z: 0 },
    },
    {
      ...clusteredStage.motors[0],
      id: "right",
      ignitionDelayS: 0.5,
      thrustApplicationPointBodyM: { x: 1.1, y: -0.2, z: 0 },
    },
  ];
  const staging = createMultiStageVehicleModel({
    retainedMassProperties: properties(1, 0),
    stages: [clusteredStage],
  });
  const result = staging.evaluate(ignitedAtZero(0.25, "cluster"));

  assert.equal(result.stages[0].motors[0].phase, "burning");
  assert.equal(result.stages[0].motors[1].phase, "waiting");
  assert.ok(result.netThrustMomentBodyNm.z > 0);
});

test("motor-local gimbal schedules interpolate thrust direction and moment", () => {
  const gimballedStage = stage("gimbal", 1, 1, {
    thrustAxisSchedule: [
      { timeS: 0, axisBody: { x: -1, y: 0, z: 0 } },
      { timeS: 1, axisBody: { x: -1, y: 1, z: 0 } },
    ],
  });
  const staging = createMultiStageVehicleModel({
    retainedMassProperties: properties(1, 0),
    stages: [gimballedStage],
  });
  const midpoint = staging.evaluate(ignitedAtZero(0.5, "gimbal"));
  const motorState = midpoint.stages[0].motors[0];
  // Schedule samples are normalized first, then the interpolated direction is
  // normalized again so each commanded sample remains a unit thrust axis.
  const normalizedEndpoint = { x: -1 / Math.sqrt(2), y: 1 / Math.sqrt(2), z: 0 };
  const midpointAxis = {
    x: (-1 + normalizedEndpoint.x) / 2,
    y: normalizedEndpoint.y / 2,
    z: 0,
  };
  const midpointMagnitude = Math.sqrt(
    midpointAxis.x ** 2 + midpointAxis.y ** 2 + midpointAxis.z ** 2,
  );
  const expectedAxis = {
    x: midpointAxis.x / midpointMagnitude,
    y: midpointAxis.y / midpointMagnitude,
    z: 0,
  };
  close(magnitude(motorState.thrustAxisBody), 1, 1e-15, "gimbal axis magnitude");
  close(motorState.thrustAxisBody.x, expectedAxis.x, 1e-12, "interpolated gimbal x");
  close(motorState.thrustAxisBody.y, expectedAxis.y, 1e-12, "interpolated gimbal y");
  close(motorState.forceBodyN.x, 5 * expectedAxis.x, 1e-12, "gimballed force x");
  close(motorState.forceBodyN.y, 5 * expectedAxis.y, 1e-12, "gimballed force y");
  assert.ok(Math.abs(midpoint.netThrustMomentBodyNm.z) > 0);
  assert.ok(staging.assumptions.some((assumption) => assumption.includes("thrust-axis schedules")));
  assert.ok(staging.warnings.some((warning) => warning.includes("actuator dynamics")));
  assert.throws(
    () => createMultiStageVehicleModel({
      retainedMassProperties: properties(1, 0),
      stages: [stage("invalid-gimbal", 1, 1, {
        thrustAxisSchedule: [
          { timeS: 1, axisBody: { x: -1, y: 0, z: 0 } },
          { timeS: 1, axisBody: { x: -1, y: 1, z: 0 } },
        ],
      })],
    }),
    /strictly increasing/,
  );
});

test("gimbal response time applies a deterministic first-order vector lag", () => {
  const gimballedStage = stage("response", 1, 1, {
    thrustAxisSchedule: [
      { timeS: 0, axisBody: { x: -1, y: 1, z: 0 } },
      { timeS: 1, axisBody: { x: -1, y: 0, z: 0 } },
    ],
    gimbalResponseTimeS: 0.5,
  });
  const staging = createMultiStageVehicleModel({
    retainedMassProperties: properties(1, 0),
    stages: [gimballedStage],
  });
  const midpoint = staging.evaluate(ignitedAtZero(0.5, "response"));
  const motorState = midpoint.stages[0].motors[0];
  const command = { x: -1 / Math.sqrt(2), y: 1 / Math.sqrt(2), z: 0 };
  const decay = Math.exp(-1);
  const expectedUnnormalized = {
    x: command.x + (-1 - command.x) * decay,
    y: command.y * (1 - decay),
    z: 0,
  };
  const expectedMagnitude = magnitude(expectedUnnormalized);
  close(motorState.thrustAxisBody.x, expectedUnnormalized.x / expectedMagnitude, 1e-12, "lagged gimbal x");
  close(motorState.thrustAxisBody.y, expectedUnnormalized.y / expectedMagnitude, 1e-12, "lagged gimbal y");
  assert.ok(motorState.thrustAxisBody.y < command.y, "response should not instantly reach the commanded axis");
  assert.ok(staging.assumptions.some((assumption) => assumption.includes("first-order vector lag")));
  assert.ok(staging.warnings.some((warning) => warning.includes("first-order vector-lag approximation")));
  assert.throws(
    () => createMultiStageVehicleModel({
      retainedMassProperties: properties(1, 0),
      stages: [stage("invalid-response", 1, 1, {
        gimbalResponseTimeS: 0.2,
      })],
    }),
    /requires a thrust-axis schedule/,
  );
});

test("ignition failure leaves propellant intact and suppresses thrust", () => {
  const staging = model();
  const failed = failStageIgnition(
    igniteStage(state(), "booster"),
    "booster",
  );
  const result = staging.evaluate({ ...failed, timeS: 1 });

  assert.equal(result.stages[0].phase, "ignition-failed");
  close(result.stages[0].propellantMassKg, 0.5, 1e-15, "intact propellant");
  close(result.stages[0].thrustN, 0, 1e-15, "failed thrust");
  assert.equal(failed.discreteState[stageIgnitionFailureKey("booster")], true);
});

test("per-motor ignition failure preserves cluster propellant and trims burnout timing", () => {
  const clusteredStage = stage("cluster", 1);
  clusteredStage.motors = [
    { ...clusteredStage.motors[0], id: "active" },
    { ...clusteredStage.motors[0], id: "failed", ignitionFailure: true },
  ];
  const staging = createMultiStageVehicleModel({
    retainedMassProperties: properties(1, 0),
    stages: [clusteredStage],
  });
  const result = staging.evaluate(ignitedAtZero(0.5, "cluster"));

  assert.equal(result.stages[0].motors[0].phase, "burning");
  assert.equal(result.stages[0].motors[1].phase, "ignition-failed");
  close(result.stages[0].motors[1].propellantMassKg, 0.5, 1e-15, "failed motor propellant");
  close(result.stages[0].propellantMassKg, 0.9375, 1e-15, "cluster propellant");
  close(result.stages[0].thrustN, 5, 1e-15, "active motor thrust");
  close(staging.burnoutOffsetS("cluster"), 2, 1e-15, "active cluster burnout offset");
});

test("repeated physical stage instances can ignite and separate independently", () => {
  const first = stage("booster-a", 2, 1);
  const second = stage("booster-b", 2, 0.8);
  const repeated = {
    ...stage("booster", 2),
    instances: [
      {
        id: "booster-a",
        name: "booster A",
        structuralMassProperties: first.structuralMassProperties,
        motors: first.motors.map((motor) => ({ ...motor, id: "booster-a-motor" })),
      },
      {
        id: "booster-b",
        name: "booster B",
        structuralMassProperties: second.structuralMassProperties,
        motors: second.motors.map((motor) => ({ ...motor, id: "booster-b-motor" })),
      },
    ],
  };
  const staging = createMultiStageVehicleModel({
    retainedMassProperties: properties(1, 0),
    stages: [repeated],
  });

  assert.deepEqual(staging.stageInstanceIds("booster"), ["booster-a", "booster-b"]);
  const bothBurning = staging.evaluate({
    ...initializeMultiStageState(state(), ["booster"]),
    timeS: 1,
  });
  close(bothBurning.massProperties.massKg, 4.15, 1e-15, "repeated stack mass");
  assert.equal(bothBurning.stages[0].instances[0].phase, "burning");
  assert.equal(bothBurning.stages[0].instances[1].phase, "burning");
  assert.deepEqual(bothBurning.attachedStageInstanceIds, ["booster-a", "booster-b"]);

  const separatedState = separateStage(
    { ...initializeMultiStageState(state(), ["booster"]), timeS: 2 },
    "booster",
    { x: 0, y: 0, z: 0 },
    "booster-a",
  );
  const separated = staging.evaluate(separatedState);
  assert.equal(separated.stages[0].instances[0].phase, "separated");
  assert.equal(separated.stages[0].instances[1].attached, true);
  assert.deepEqual(separated.attachedStageInstanceIds, ["booster-b"]);
  close(staging.stageMassProperties(separatedState, "booster", "booster-b").massKg, 1.2, 1e-15, "remaining copy mass");
  assert.throws(
    () => staging.stageMassProperties(separatedState, "booster", "booster-a"),
    /booster instance booster-a is not attached/,
  );
  assert.equal(separatedState.discreteState[stageInstanceSeparationKey("booster", "booster-a")], true);
  assert.equal(
    staging.evaluate({ ...state(0.5), discreteState: { [stageInstanceIgnitionTimeKey("booster", "booster-a")]: 0.25 } })
      .stages[0].instances[0].phase,
    "burning",
  );
});

test("repeated stage burnout events target only their selected physical copy", () => {
  const first = stage("booster-a", 2, 1);
  const second = stage("booster-b", 2, 1);
  second.motors = second.motors.map((motor) => ({
    ...motor,
    id: "booster-b-motor",
    thrustCurve: [
      { timeS: 0, thrustN: 0 },
      { timeS: 1.5, thrustN: 10 },
      { timeS: 3, thrustN: 0 },
    ],
  }));
  const repeated = {
    ...stage("booster", 2),
    instances: [
      { id: "booster-a", name: "booster A", structuralMassProperties: first.structuralMassProperties, motors: first.motors.map((motor) => ({ ...motor, id: "booster-a-motor" })) },
      { id: "booster-b", name: "booster B", structuralMassProperties: second.structuralMassProperties, motors: second.motors },
    ],
  };
  const staging = createMultiStageVehicleModel({
    retainedMassProperties: properties(1, 0),
    stages: [repeated],
  });
  const result = simulateRigidBody6D({
    body: staging.body,
    initialState: initializeMultiStageState(state(), ["booster"]),
    durationS: 3.5,
    timeStepS: 0.6,
    stateEvents: [
      staging.createBurnoutSeparationEvent({ stageId: "booster", instanceId: "booster-a" }),
      staging.createBurnoutSeparationEvent({ stageId: "booster", instanceId: "booster-b" }),
    ],
  });

  assert.equal(result.events.length, 2);
  close(result.events[0].timeS, 2, 2e-9, "first copy separation");
  close(result.events[1].timeS, 3, 2e-9, "second copy separation");
  assert.equal(result.finalState.discreteState[stageInstanceSeparationKey("booster", "booster-a")], true);
  assert.equal(result.finalState.discreteState[stageInstanceSeparationKey("booster", "booster-b")], true);
  assert.deepEqual(staging.evaluate(result.events[0].stateAfter).attachedStageInstanceIds, ["booster-b"]);
  assert.deepEqual(staging.evaluate(result.finalState).attachedStageInstanceIds, []);
});

test("failed ignition cannot synthesize a later burnout transition", () => {
  const staging = model();
  const failed = failStageIgnition(
    igniteStage(state(), "booster"),
    "booster",
  );
  const result = simulateRigidBody6D({
    body: staging.body,
    initialState: failed,
    durationS: 3,
    timeStepS: 0.4,
    stateEvents: [
      staging.createBurnoutSeparationEvent({ stageId: "booster" }),
      staging.createBurnoutIgnitionEvent({
        sourceStageId: "booster",
        targetStageId: "upper",
      }),
    ],
  });

  assert.equal(result.events.length, 0);
  assert.equal(staging.evaluate(result.finalState).stages[0].phase, "ignition-failed");
  assert.equal(staging.evaluate(result.finalState).stages[1].phase, "waiting");
});

test("scheduled staging helpers apply exact state changes", () => {
  const staging = model();
  const events = [
    createScheduledStageIgnitionFailureEvent({ stageId: "upper", timeS: 0.5 }),
    createScheduledStageIgnitionEvent({ stageId: "upper", timeS: 0.5 }),
    createScheduledStageSeparationEvent({ stageId: "booster", timeS: 1 }),
  ];
  const result = simulateRigidBody6D({
    body: staging.body,
    initialState: state(),
    durationS: 1.1,
    timeStepS: 0.3,
    events,
  });

  assert.deepEqual(result.events.map((event) => event.timeS), [0.5, 0.5, 1]);
  assert.equal(staging.evaluate(result.finalState).stages[1].phase, "ignition-failed");
  assert.equal(staging.evaluate(result.finalState).stages[0].phase, "separated");
});

test("measured separation impulse converts at live retained mass and survives event telemetry", () => {
  const measuredStage = {
    ...stage("booster", 2),
    separationImpulseBodyNs: { x: 2, y: 1, z: 0 },
  };
  const staging = createMultiStageVehicleModel({
    retainedMassProperties: properties(1, 0),
    stages: [measuredStage],
  });
  const result = simulateRigidBody6D({
    body: staging.body,
    initialState: initializeMultiStageState(state(), ["booster"]),
    durationS: 2.2,
    timeStepS: 0.25,
    stateEvents: [staging.createBurnoutSeparationEvent({ stageId: "booster" })],
  });
  assert.equal(result.events.length, 1);
  const event = result.events[0];
  assert.deepEqual(event.separationImpulseBodyNs, { x: 2, y: 1, z: 0 });
  const retainedMassKg = staging.evaluate(event.stateAfter).massProperties.massKg;
  close(event.separationDeltaVBodyMps.x, 2 / retainedMassKg, 1e-12, "measured impulse retained x dV");
  close(event.separationDeltaVBodyMps.y, 1 / retainedMassKg, 1e-12, "measured impulse retained y dV");
  close(event.separationDeltaVBodyMps.z, 0, 1e-12, "measured impulse retained z dV");
  assert.ok(staging.warnings.some((warning) => warning.includes("measured") || warning.includes("actuator") || warning.includes("separation")));
});

test("inertia-rate expression matches a centered finite difference during burn", () => {
  const staging = model();
  const current = ignitedAtZero(0.8);
  const stepS = 1e-5;
  const value = staging.evaluate(current);
  const before = staging.evaluate({ ...current, timeS: current.timeS - stepS });
  const after = staging.evaluate({ ...current, timeS: current.timeS + stepS });

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      close(
        value.inertiaRateBodyKgM2PerS[row][column],
        (after.massProperties.inertiaAtCenterKgM2[row][column] -
          before.massProperties.inertiaAtCenterKgM2[row][column]) /
          (2 * stepS),
        3e-9,
        `inertia rate ${row},${column}`,
      );
    }
  }
});

test("coupled 6DOF flight switches to upper-stage mass and thrust", () => {
  const staging = model();
  const result = simulateRigidBody6D({
    body: staging.body,
    initialState: initializeMultiStageState(state(), ["booster"]),
    durationS: 2.5,
    timeStepS: 0.005,
    loads: staging.loads,
    stateEvents: [
      staging.createBurnoutSeparationEvent({ stageId: "booster" }),
      staging.createBurnoutIgnitionEvent({
        sourceStageId: "booster",
        targetStageId: "upper",
      }),
    ],
  });
  const final = staging.evaluate(result.finalState);

  assert.ok(result.finalState.velocityWorldMps.x < -2.5);
  assert.equal(final.stages[0].phase, "separated");
  assert.equal(final.stages[1].phase, "burning");
  close(final.massProperties.massKg, 1.96875, 2e-10, "upper-stage vehicle mass");
});

test("propulsion adapter preserves force, moment, and live center of mass", () => {
  const staging = model();
  const current = initializeMultiStageState(state(0.5), ["booster"]);
  const evaluated = staging.evaluate(current);
  const propulsion = staging.propulsion(current);

  close(propulsion.totalThrustN, evaluated.totalThrustN, 1e-15, "thrust");
  close(
    propulsion.centerOfMassBodyM.x,
    evaluated.massProperties.centerOfMassM.x,
    1e-15,
    "center of mass",
  );
  close(
    propulsion.netThrustMomentBodyNm.z,
    evaluated.netThrustMomentBodyNm.z,
    1e-15,
    "moment",
  );
});

test("invalid stage configurations and state transitions fail explicitly", () => {
  assert.throws(
    () =>
      createMultiStageVehicleModel({
        retainedMassProperties: properties(1, 0),
        stages: [],
      }),
    /at least one stage/,
  );
  assert.throws(
    () =>
      createMultiStageVehicleModel({
        retainedMassProperties: properties(1, 0),
        stages: [stage("duplicate", 1), stage("duplicate", 2)],
      }),
    /stage identifiers must be unique/,
  );
  assert.throws(
    () => igniteStage(separateStage(state(), "booster"), "booster"),
    /cannot ignite separated/,
  );
  assert.throws(
    () => model().evaluate({
      ...state(),
      discreteState: { [stageSeparationKey("booster")]: "yes" },
    }),
    /must be boolean/,
  );
  assert.throws(
    () => model().evaluate({
      ...state(),
      discreteState: { [stageIgnitionTimeKey("booster")]: Number.NaN },
    }),
    /finite number/,
  );
  assert.throws(
    () => model().evaluate({
      ...state(),
      discreteState: { [stageSeparationKey("booster")]: true },
    }),
    /flag and time/,
  );
  assert.throws(
    () => model().createBurnoutSeparationEvent({ stageId: "missing" }),
    /unknown stage/,
  );
  assert.throws(
    () => createMultiStageVehicleModel({
      retainedMassProperties: properties(1, 0),
      stages: [{ ...stage("invalid-dv", 0, 1, {}), separationDeltaVBodyMps: -1 }],
    }),
    /separation delta-v/,
  );
});
