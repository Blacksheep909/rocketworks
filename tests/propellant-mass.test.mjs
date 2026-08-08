import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_QUATERNION,
  createImpulseBasedPropellantModel,
  createPreliminaryRocketLoadModel,
  simulateRigidBody6D,
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

const fixed = {
  massKg: 2,
  centerOfMassM: { x: 0, y: 0, z: 0 },
  inertiaAtCenterKgM2: [
    [0.2, 0, 0],
    [0, 0.4, 0],
    [0, 0, 0.4],
  ],
};

const dry = {
  massKg: 1,
  centerOfMassM: { x: 2, y: 0, z: 0 },
  inertiaAtCenterKgM2: [
    [0.1, 0, 0],
    [0, 0.1, 0],
    [0, 0, 0.1],
  ],
};

const propellant = {
  massKg: 1,
  centerOfMassM: { x: 2, y: 0, z: 0 },
  inertiaAtCenterKgM2: [
    [0.05, 0, 0],
    [0, 0.2, 0],
    [0, 0, 0.2],
  ],
};

function model(overrides = {}) {
  return createImpulseBasedPropellantModel({
    fixedVehicleMassProperties: fixed,
    motors: [
      {
        id: "motor-a",
        name: "User motor A",
        ignitionTimeS: 0,
        thrustCurve: triangle,
        dryMassProperties: dry,
        initialPropellantMassProperties: propellant,
        ...overrides,
      },
    ],
  });
}

function rigidState(timeS, overrides = {}) {
  return {
    timeS,
    positionWorldM: { x: 0, y: 0, z: 0 },
    velocityWorldMps: { x: 0, y: 0, z: 0 },
    orientationBodyToWorld: IDENTITY_QUATERNION,
    angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

test("triangular curve produces analytical impulse-based depletion", () => {
  const result = model();
  const quarter = result.evaluate(0.5).motors[0];
  const midpoint = result.evaluate(1).motors[0];
  const burnout = result.evaluate(2).motors[0];

  close(quarter.totalImpulseNs, 10, 1e-15, "total impulse");
  close(quarter.deliveredImpulseNs, 1.25, 1e-15, "quarter impulse");
  close(quarter.remainingFraction, 0.875, 1e-15, "quarter remaining");
  close(quarter.propellantMassRateKgS, -0.5, 1e-15, "quarter mass rate");
  close(midpoint.remainingFraction, 0.5, 1e-15, "midpoint remaining");
  close(midpoint.propellantMassRateKgS, -1, 1e-15, "midpoint mass rate");
  close(burnout.propellantMassKg, 0, 1e-15, "burnout propellant");
  close(burnout.propellantMassRateKgS, 0, 1e-15, "burnout mass rate");
  assert.equal(burnout.status, "burned-out");
});

test("vehicle center of mass and inertia move as propellant is consumed", () => {
  const result = model();
  const initial = result.evaluate(0).massProperties;
  const burnout = result.evaluate(2).massProperties;

  close(initial.massKg, 4, 1e-15, "initial mass");
  close(initial.centerOfMassM.x, 1, 1e-15, "initial center of mass");
  close(initial.inertiaAtCenterKgM2[1][1], 4.7, 1e-12, "initial pitch inertia");
  close(burnout.massKg, 3, 1e-15, "burnout mass");
  close(burnout.centerOfMassM.x, 2 / 3, 1e-15, "burnout center of mass");
  close(
    burnout.inertiaAtCenterKgM2[1][1],
    0.5 + 8 / 3,
    1e-12,
    "burnout pitch inertia",
  );
});

test("analytical inertia rate matches centered finite differences", () => {
  const result = model();
  const timeS = 0.8;
  const stepS = 1e-5;
  const state = result.evaluate(timeS);
  const before = result.evaluate(timeS - stepS).massProperties;
  const after = result.evaluate(timeS + stepS).massProperties;

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const finiteDifference =
        (after.inertiaAtCenterKgM2[row][column] -
          before.inertiaAtCenterKgM2[row][column]) /
        (2 * stepS);
      close(
        state.inertiaRateBodyKgM2PerS[row][column],
        finiteDifference,
        2e-9,
        `inertia rate ${row},${column}`,
      );
    }
  }
});

test("delayed multiple motors expose shared boundary times and summed thrust", () => {
  const result = createImpulseBasedPropellantModel({
    fixedVehicleMassProperties: fixed,
    motors: [
      {
        id: "first",
        name: "First motor",
        ignitionTimeS: 0,
        thrustCurve: triangle,
        dryMassProperties: dry,
        initialPropellantMassProperties: propellant,
      },
      {
        id: "second",
        name: "Second motor",
        ignitionTimeS: 1.5,
        thrustCurve: triangle,
        dryMassProperties: { ...dry, centerOfMassM: { x: 3, y: 0, z: 0 } },
        initialPropellantMassProperties: {
          ...propellant,
          centerOfMassM: { x: 3, y: 0, z: 0 },
        },
      },
    ],
  });

  assert.deepEqual(result.scheduledTimesS, [0, 1, 1.5, 2, 2.5, 3.5]);
  close(result.thrustAtTimeS(2), 5, 1e-15, "overlap thrust");
  assert.equal(result.evaluate(1).motors[1].status, "waiting");
});

test("rigid-body coupling preserves angular momentum through depletion", () => {
  const constantCurve = [
    { timeS: 0, thrustN: 10 },
    { timeS: 1, thrustN: 10 },
    { timeS: 1.000001, thrustN: 0 },
  ];
  const massModel = model({ thrustCurve: constantCurve });
  const initialInertia = massModel.evaluate(0).massProperties.inertiaAtCenterKgM2[1][1];
  const result = simulateRigidBody6D({
    body: massModel.body,
    initialState: rigidState(0, {
      angularVelocityBodyRadS: { x: 0, y: 1, z: 0 },
    }),
    durationS: 0.9,
    timeStepS: 0.0005,
    scheduledTimesS: massModel.scheduledTimesS.filter(
      (time) => time > 0 && time < 0.9,
    ),
  });
  const finalInertia = massModel.evaluate(0.9).massProperties.inertiaAtCenterKgM2[1][1];

  close(
    finalInertia * result.finalState.angularVelocityBodyRadS.y,
    initialInertia,
    3e-9,
    "angular momentum",
  );
});

test("rocket load model consumes the same time-shifted thrust provider", () => {
  const massModel = model({ ignitionTimeS: 2 });
  const loads = createPreliminaryRocketLoadModel({
    body: massModel.body,
    thrustAtTimeS: massModel.thrustAtTimeS,
    referenceAreaM2: 0.01,
    dragCoefficient: 0.5,
    normalForceSlopePerRad: 2,
    centerOfPressureMinusCenterOfMassM: 0.2,
  });

  close(loads.evaluate(rigidState(1)).diagnostics.thrustN, 0, 1e-15, "pre-ignition thrust");
  close(loads.evaluate(rigidState(2.5)).diagnostics.thrustN, 5, 1e-15, "burning thrust");
});

test("zero-impulse curves and ambiguous thrust inputs fail explicitly", () => {
  assert.throws(
    () =>
      model({
        thrustCurve: [
          { timeS: 0, thrustN: 0 },
          { timeS: 1, thrustN: 0 },
        ],
      }),
    /positive total impulse/,
  );
  assert.throws(
    () =>
      createPreliminaryRocketLoadModel({
        body: { massKg: 1, inertiaBodyKgM2: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
        thrustCurve: triangle,
        thrustAtTimeS: () => 1,
        referenceAreaM2: 0.01,
        dragCoefficient: 0.5,
        normalForceSlopePerRad: 2,
        centerOfPressureMinusCenterOfMassM: 0.2,
      }),
    /exactly one/,
  );
});
