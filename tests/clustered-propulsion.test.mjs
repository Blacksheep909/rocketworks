import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_QUATERNION,
  createClusteredPropulsionModel,
  createImpulseBasedPropellantModel,
  createPreliminaryRocketLoadModel,
  magnitude,
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

function properties(massKg, centerOfMassM) {
  return {
    massKg,
    centerOfMassM,
    inertiaAtCenterKgM2: [
      [0.01, 0, 0],
      [0, 0.01, 0],
      [0, 0, 0.01],
    ],
  };
}

function motor(id, y, ignitionTimeS = 0, thrustCurve = triangle) {
  return {
    id,
    name: `Motor ${id}`,
    ignitionTimeS,
    thrustCurve,
    dryMassProperties: properties(0.1, { x: 1, y, z: 0 }),
    initialPropellantMassProperties: properties(0.1, { x: 1, y, z: 0 }),
  };
}

function massModel({ secondIgnitionS = 0, thrustCurve = triangle } = {}) {
  return createImpulseBasedPropellantModel({
    fixedVehicleMassProperties: properties(2, { x: 0, y: 0, z: 0 }),
    motors: [
      motor("left", 0.1, 0, thrustCurve),
      motor("right", -0.1, secondIgnitionS, thrustCurve),
    ],
  });
}

function mounts(axisLeft = { x: -1, y: 0, z: 0 }, axisRight = axisLeft) {
  return [
    {
      motorId: "left",
      thrustApplicationPointBodyM: { x: 1.1, y: 0.1, z: 0 },
      thrustAxisBody: axisLeft,
    },
    {
      motorId: "right",
      thrustApplicationPointBodyM: { x: 1.1, y: -0.1, z: 0 },
      thrustAxisBody: axisRight,
    },
  ];
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

test("symmetric axial motor cluster doubles force and cancels moment", () => {
  const model = createClusteredPropulsionModel({
    massModel: massModel(),
    mounts: mounts(),
  });
  const result = model.evaluate(state(0.5));

  close(result.totalThrustN, 10, 1e-15, "summed scalar thrust");
  close(result.netThrustForceBodyN.x, -10, 1e-15, "axial force");
  close(result.netThrustForceBodyN.y, 0, 1e-15, "transverse force");
  close(magnitude(result.netThrustMomentBodyNm), 0, 1e-15, "net moment");
});

test("delayed second motor exposes the expected asymmetric yaw moment", () => {
  const model = createClusteredPropulsionModel({
    massModel: massModel({ secondIgnitionS: 1 }),
    mounts: mounts(),
  });
  const result = model.evaluate(state(0.5));
  const activeMotor = result.motors[0];
  const expectedMomentZ =
    -activeMotor.leverArmFromCenterOfMassBodyM.y * activeMotor.forceBodyN.x;

  close(result.totalThrustN, 5, 1e-15, "single active thrust");
  close(result.netThrustForceBodyN.x, -5, 1e-15, "single active force");
  close(
    result.netThrustMomentBodyNm.z,
    expectedMomentZ,
    1e-14,
    "asymmetric live-CG moment",
  );
  assert.ok(result.netThrustMomentBodyNm.z > 0.5);
  close(result.motors[1].thrustN, 0, 1e-15, "delayed motor thrust");
});

test("canted axes are normalized and symmetric transverse force cancels", () => {
  const model = createClusteredPropulsionModel({
    massModel: massModel(),
    mounts: mounts(
      { x: -2, y: 0.2, z: 0 },
      { x: -2, y: -0.2, z: 0 },
    ),
  });
  const result = model.evaluate(state(0.5));
  const oneMotorAxialForce = (-5 * 2) / Math.hypot(2, 0.2);

  close(
    result.netThrustForceBodyN.x,
    2 * oneMotorAxialForce,
    1e-14,
    "canted axial force",
  );
  close(result.netThrustForceBodyN.y, 0, 1e-15, "canted transverse force");
  close(magnitude(result.motors[0].thrustAxisBody), 1, 1e-15, "unit axis");
});

test("thrust moment uses the instantaneous combined center of mass", () => {
  const model = createClusteredPropulsionModel({
    massModel: massModel(),
    mounts: mounts({ x: 0, y: -1, z: 0 }, { x: 0, y: -1, z: 0 }),
  });
  const result = model.evaluate(state(0.5));
  const contribution = result.motors[0];
  const expectedMomentZ =
    contribution.leverArmFromCenterOfMassBodyM.x *
    contribution.forceBodyN.y;

  close(contribution.momentBodyNm.z, expectedMomentZ, 1e-15, "live-CG moment");
  assert.ok(result.centerOfMassBodyM.x > 0);
});

test("off-axis cluster moment rotates the coupled rigid body", () => {
  const constantCurve = [
    { timeS: 0, thrustN: 10 },
    { timeS: 1, thrustN: 10 },
    { timeS: 1.000001, thrustN: 0 },
  ];
  const changingMass = massModel({ secondIgnitionS: 2, thrustCurve: constantCurve });
  const propulsion = createClusteredPropulsionModel({
    massModel: changingMass,
    mounts: mounts(),
  });
  const result = simulateRigidBody6D({
    body: changingMass.body,
    initialState: state(),
    durationS: 0.1,
    timeStepS: 0.001,
    loads: propulsion.loads,
  });

  assert.ok(result.finalState.angularVelocityBodyRadS.z > 0);
  assert.ok(result.finalState.velocityWorldMps.x < 0);
});

test("rocket load model preserves clustered force, moment, and diagnostics", () => {
  const changingMass = massModel({ secondIgnitionS: 1 });
  const propulsion = createClusteredPropulsionModel({
    massModel: changingMass,
    mounts: mounts(),
  });
  const loads = createPreliminaryRocketLoadModel({
    body: changingMass.body,
    propulsion: propulsion.evaluate,
    referenceAreaM2: 0.01,
    dragCoefficient: 0.5,
    normalForceSlopePerRad: 2,
    centerOfPressureMinusCenterOfMassM: 0.2,
  }).evaluate(state(0.5));
  const expectedMomentZ = propulsion.evaluate(state(0.5)).netThrustMomentBodyNm.z;

  close(loads.diagnostics.thrustN, 5, 1e-15, "diagnostic thrust");
  close(loads.diagnostics.propulsionForceBodyN.x, -5, 1e-15, "diagnostic force");
  close(
    loads.diagnostics.propulsionMomentBodyNm.z,
    expectedMomentZ,
    1e-14,
    "diagnostic moment",
  );
  close(loads.loads.forceBodyN.x, -5, 1e-15, "combined body force");
  close(loads.loads.momentBodyNm.z, expectedMomentZ, 1e-14, "combined body moment");
});

test("missing, duplicate, unknown, and invalid motor mounts fail explicitly", () => {
  const changingMass = massModel();
  assert.throws(
    () =>
      createClusteredPropulsionModel({
        massModel: changingMass,
        mounts: mounts().slice(0, 1),
      }),
    /missing: right/,
  );
  assert.throws(
    () =>
      createClusteredPropulsionModel({
        massModel: changingMass,
        mounts: [...mounts(), { ...mounts()[0] }],
      }),
    /only one thrust mount/,
  );
  assert.throws(
    () =>
      createClusteredPropulsionModel({
        massModel: changingMass,
        mounts: [...mounts(), {
          motorId: "unknown",
          thrustApplicationPointBodyM: { x: 0, y: 0, z: 0 },
          thrustAxisBody: { x: -1, y: 0, z: 0 },
        }],
      }),
    /unknown: unknown/,
  );
  assert.throws(
    () =>
      createClusteredPropulsionModel({
        massModel: changingMass,
        mounts: mounts({ x: 0, y: 0, z: 0 }),
      }),
    /non-zero vector/,
  );
});

test("rocket load model rejects ambiguous or invalid propulsion providers", () => {
  const changingMass = massModel();
  const propulsion = createClusteredPropulsionModel({
    massModel: changingMass,
    mounts: mounts(),
  });
  const base = {
    body: changingMass.body,
    referenceAreaM2: 0.01,
    dragCoefficient: 0.5,
    normalForceSlopePerRad: 2,
    centerOfPressureMinusCenterOfMassM: 0.2,
  };
  assert.throws(
    () =>
      createPreliminaryRocketLoadModel({
        ...base,
        thrustCurve: triangle,
        propulsion: propulsion.evaluate,
      }),
    /exactly one/,
  );
  const invalid = createPreliminaryRocketLoadModel({
    ...base,
    propulsion: () => ({
      totalThrustN: 1,
      netThrustForceBodyN: { x: Number.NaN, y: 0, z: 0 },
      netThrustMomentBodyNm: { x: 0, y: 0, z: 0 },
      centerOfMassBodyM: { x: 0, y: 0, z: 0 },
      motors: [],
    }),
  });
  assert.throws(() => invalid.evaluate(state()), /invalid force/);
});
