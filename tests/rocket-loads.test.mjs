import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_QUATERNION,
  LAUNCH_ENVIRONMENT_MODEL_VERSION,
  createLaunchEnvironmentModel,
  createPreliminaryRocketLoadModel,
  rotateBodyToWorld,
  simulateRigidBody6D,
  standardAtmosphere,
  verticalLaunchOrientationBodyToEnu,
} from "../lib/physics/index.ts";

function gustEnvironment() {
  return createLaunchEnvironmentModel({
    site: {
      name: "Coupling fixture",
      latitudeDeg: 0,
      longitudeDeg: 0,
      elevationM: 250,
      datum: "WGS84",
      timeZone: "UTC",
    },
    provenance: {
      sourceName: "Synthetic coupling fixture",
      sourceKind: "synthetic",
      dataVersion: "fixture-1",
      licenseIdentifier: "CC0-1.0",
      attribution: "RocketWorks test fixture",
      validationStatus: "synthetic-unvalidated",
    },
    meanWindProfile: [],
    gustEvents: [{
      id: "east-gust",
      startTimeS: 0,
      durationS: 2,
      peakDeltaWindWorldMps: { x: 12, y: 0, z: 0 },
    }],
  });
}

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

const body = {
  massKg: 2,
  inertiaBodyKgM2: [
    [0.01, 0, 0],
    [0, 0.2, 0],
    [0, 0, 0.2],
  ],
};

function state(overrides = {}) {
  return {
    timeS: 0,
    positionWorldM: { x: 0, y: 0, z: 0 },
    velocityWorldMps: { x: 0, y: 0, z: 0 },
    orientationBodyToWorld: IDENTITY_QUATERNION,
    angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

function loadModel(overrides = {}) {
  return createPreliminaryRocketLoadModel({
    body,
    thrustCurve: [
      { timeS: 0, thrustN: 0 },
      { timeS: 1, thrustN: 0 },
    ],
    referenceAreaM2: 0.01,
    dragCoefficient: 0.5,
    normalForceSlopePerRad: 2,
    centerOfPressureMinusCenterOfMassM: 0.2,
    ...overrides,
  });
}

test("vertical launch attitude maps the body nose direction to ENU up", () => {
  const noseWorld = rotateBodyToWorld(
    verticalLaunchOrientationBodyToEnu(),
    { x: -1, y: 0, z: 0 },
  );

  close(noseWorld.x, 0, 1e-12, "nose east");
  close(noseWorld.y, 0, 1e-12, "nose north");
  close(noseWorld.z, 1, 1e-12, "nose up");
});

test("stationary vehicle receives gravity and zero aerodynamic force", () => {
  const evaluation = loadModel().evaluate(state());

  close(evaluation.loads.forceWorldN.z, -2 * 9.80665, 1e-10, "gravity force");
  close(evaluation.loads.forceBodyN.x, 0, 1e-15, "body force x");
  close(evaluation.diagnostics.dynamicPressurePa, 0, 1e-15, "dynamic pressure");
  close(evaluation.diagnostics.dragN, 0, 1e-15, "drag");
  assert.ok(
    evaluation.diagnostics.applicability.some(
      (issue) => issue.code === "LOW_AIRSPEED",
    ),
  );
});

test("axial drag opposes nose-first air-relative velocity", () => {
  const evaluation = loadModel().evaluate(
    state({ velocityWorldMps: { x: -10, y: 0, z: 0 } }),
  );
  const expectedDrag =
    0.5 * evaluation.diagnostics.densityKgM3 * 10 ** 2 * 0.5 * 0.01;

  close(evaluation.diagnostics.dragN, expectedDrag, 1e-12, "drag magnitude");
  close(evaluation.loads.forceBodyN.x, expectedDrag, 1e-12, "drag direction");
  close(evaluation.diagnostics.angleOfAttackRad, 0, 1e-15, "angle of attack");
});

test("crossflow produces opposing normal force and an aft restoring moment", () => {
  const evaluation = loadModel().evaluate(
    state({ velocityWorldMps: { x: -50, y: 5, z: 0 } }),
  );

  assert.equal(evaluation.diagnostics.normalForceApplied, true);
  assert.ok(evaluation.loads.forceBodyN.y < 0);
  assert.ok(evaluation.loads.momentBodyNm.z < 0);
  close(
    evaluation.diagnostics.angleOfAttackRad,
    Math.atan2(5, 50),
    1e-12,
    "angle-of-attack magnitude",
  );
  close(
    evaluation.diagnostics.sideslipRad,
    Math.asin(5 / Math.sqrt(50 ** 2 + 5 ** 2)),
    1e-12,
    "positive sideslip",
  );
  close(
    evaluation.loads.momentBodyNm.z,
    0.2 * -evaluation.diagnostics.normalForceN,
    1e-10,
    "CP restoring moment",
  );
});

test("direct body-axis force and moment coefficients drive the 6DOF load result", () => {
  const model = createPreliminaryRocketLoadModel({
    body,
    thrustAtTimeS: () => 0,
    aerodynamicsAt: () => ({
      referenceAreaM2: 0.01,
      dragCoefficient: 0.5,
      normalForceSlopePerRad: 2,
      centerOfPressureMinusCenterOfMassM: 0.2,
      coefficientBasis: "mach-reynolds-force-moment-table",
      forceCoefficientBody: { x: 1, y: -0.2, z: 0.1 },
      momentCoefficientBody: { x: 0.01, y: -0.02, z: 0.03 },
      momentReferenceLengthBodyM: { x: 0.1, y: 1, z: 1 },
    }),
  });
  const evaluation = model.evaluate(
    state({ velocityWorldMps: { x: -50, y: 5, z: 0 } }),
  );
  const qS = evaluation.diagnostics.dynamicPressurePa * 0.01;
  close(evaluation.loads.forceBodyN.x, qS, 1e-10, "direct axial force");
  close(evaluation.loads.forceBodyN.y, -0.2 * qS, 1e-10, "direct normal force");
  close(evaluation.loads.forceBodyN.z, 0.1 * qS, 1e-10, "direct side force");
  close(evaluation.loads.momentBodyNm.x, 0.01 * qS * 0.1, 1e-12, "direct roll moment");
  close(evaluation.loads.momentBodyNm.y, -0.02 * qS, 1e-12, "direct pitch moment");
  close(evaluation.loads.momentBodyNm.z, 0.03 * qS, 1e-12, "direct yaw moment");
  assert.equal(evaluation.diagnostics.directForceApplied, true);
  assert.equal(evaluation.diagnostics.directMomentApplied, true);
  assert.equal(evaluation.diagnostics.coefficientBasis, "mach-reynolds-force-moment-table");
  assert.deepEqual(evaluation.diagnostics.aerodynamicForceBodyN, {
    x: qS,
    y: -0.2 * qS,
    z: 0.1 * qS,
  });
  assert.deepEqual(evaluation.diagnostics.aerodynamicStaticMomentBodyNm, {
    x: 0.01 * qS * 0.1,
    y: -0.02 * qS,
    z: 0.03 * qS,
  });
});

test("wind is subtracted from vehicle velocity in the ENU frame", () => {
  const evaluation = loadModel({
    windProfile: [
      { altitudeM: 0, eastMps: 5, northMps: 0 },
      { altitudeM: 1000, eastMps: 5, northMps: 0 },
    ],
  }).evaluate(state());

  close(evaluation.diagnostics.airRelativeVelocityWorldMps.x, -5, 1e-15, "relative east velocity");
  assert.ok(evaluation.loads.forceBodyN.x > 0);
});

test("launch environment drives atmosphere, gust wind, and load diagnostics", () => {
  const environment = gustEnvironment();
  const evaluation = loadModel({ environmentAt: environment.at }).evaluate(
    state({ timeS: 1, positionWorldM: { x: 0, y: 0, z: 50 } }),
  );

  assert.equal(
    evaluation.diagnostics.environmentModelVersion,
    LAUNCH_ENVIRONMENT_MODEL_VERSION,
  );
  assert.deepEqual(evaluation.diagnostics.meanWindWorldMps, { x: 0, y: 0, z: 0 });
  assert.deepEqual(evaluation.diagnostics.discreteGustWindWorldMps, { x: 12, y: 0, z: 0 });
  assert.deepEqual(evaluation.diagnostics.activeGustIds, ["east-gust"]);
  close(evaluation.diagnostics.altitudeAslM, 300, 1e-12, "environment ASL altitude");
  assert.ok(evaluation.diagnostics.dynamicPressurePa > 0);
});

test("opt-in Earth rotation enters world force and remains inspectable", () => {
  const environment = createLaunchEnvironmentModel({
    ...gustEnvironment().definition,
    gravityModel: "wgs84-normal",
    earthRotation: { enabled: true },
  });
  const current = state({
    positionWorldM: { x: 0, y: 0, z: 0 },
    velocityWorldMps: { x: 0, y: 0, z: 10 },
  });
  const evaluation = loadModel({ environmentAt: environment.at }).evaluate(current);
  const expected = environment.at(current).earthRotationAccelerationWorldMps2;
  assert.ok(expected);
  assert.equal(evaluation.diagnostics.earthRotationEnabled, true);
  assert.match(evaluation.diagnostics.earthRotationModelVersion, /earth-rotation/);
  assert.equal(evaluation.diagnostics.gravityModel, "wgs84-normal");
  assert.match(evaluation.diagnostics.gravityModelVersion, /wgs84-normal-gravity/);
  close(
    evaluation.diagnostics.earthRotationAccelerationWorldMps2.x,
    expected.x,
    1e-15,
    "Earth-rotation force east acceleration",
  );
  close(
    evaluation.loads.forceWorldN.x / body.massKg,
    expected.x,
    1e-15,
    "Earth-rotation world force",
  );
});

test("launch environment cannot be combined with legacy altitude or wind inputs", () => {
  const environment = gustEnvironment();
  assert.throws(
    () => loadModel({ environmentAt: environment.at, launchAltitudeM: 100 }),
    /cannot be combined/,
  );
});

test("normal force is disabled beyond its Mach applicability limit", () => {
  const evaluation = loadModel().evaluate(
    state({ velocityWorldMps: { x: -150, y: 5, z: 0 } }),
  );

  assert.ok(evaluation.diagnostics.mach > 0.3);
  assert.equal(evaluation.diagnostics.normalForceApplied, false);
  close(evaluation.diagnostics.normalForceN, 0, 1e-15, "normal force");
  assert.ok(
    evaluation.diagnostics.applicability.some(
      (issue) => issue.code === "MACH_LIMIT" && issue.severity === "unsupported",
    ),
  );
});

test("Prandtl-Glauert normal-force trend extends the relation path below transonic flow", () => {
  const evaluation = loadModel({ normalForceModel: "prandtl-glauert" }).evaluate(
    state({ velocityWorldMps: { x: -200, y: 8, z: 0 } }),
  );

  assert.ok(evaluation.diagnostics.mach < 0.8);
  assert.equal(evaluation.diagnostics.normalForceModel, "prandtl-glauert");
  assert.equal(evaluation.diagnostics.normalForceApplied, true);
  assert.ok(evaluation.diagnostics.normalForceModelFactor > 1);
  assert.ok(evaluation.diagnostics.normalForceN > 0);
  assert.equal(
    evaluation.diagnostics.applicability.some((issue) => issue.code === "MACH_LIMIT"),
    false,
  );
});

test("quadratic induced-drag polar increases relation drag and preserves direct-table authority", () => {
  const relation = loadModel({
    normalForceModel: "prandtl-glauert",
    inducedDragModel: "quadratic-normal-force",
    inducedDragFactor: 0.8,
  }).evaluate(
    state({ velocityWorldMps: { x: -200, y: 8, z: 0 } }),
  );
  assert.equal(relation.diagnostics.inducedDragModel, "quadratic-normal-force");
  assert.ok(relation.diagnostics.inducedDragCoefficient > 0);
  assert.ok(relation.diagnostics.effectiveDragCoefficient > relation.diagnostics.dragCoefficient);
  assert.ok(relation.diagnostics.applicability.some((issue) => issue.code === "INDUCED_DRAG_MODEL"));

  const direct = createPreliminaryRocketLoadModel({
    body,
    thrustAtTimeS: () => 0,
    inducedDragModel: "quadratic-normal-force",
    inducedDragFactor: 0.8,
    aerodynamicsAt: () => ({
      referenceAreaM2: 0.01,
      dragCoefficient: 0.5,
      normalForceSlopePerRad: 2,
      centerOfPressureMinusCenterOfMassM: 0.2,
      coefficientBasis: "mach-reynolds-force-moment-table",
      forceCoefficientBody: { x: 1, y: -0.2, z: 0.1 },
      momentCoefficientBody: { x: 0.01, y: -0.02, z: 0.03 },
      momentReferenceLengthBodyM: { x: 0.1, y: 1, z: 1 },
    }),
  }).evaluate(state({ velocityWorldMps: { x: -50, y: 5, z: 0 } }));
  assert.equal(direct.diagnostics.inducedDragCoefficient, 0);
  close(
    direct.diagnostics.effectiveDragCoefficient,
    direct.diagnostics.dragN / (direct.diagnostics.dynamicPressurePa * direct.diagnostics.referenceAreaM2),
    1e-12,
    "direct effective drag coefficient",
  );
  assert.ok(direct.diagnostics.applicability.some((issue) => issue.code === "INDUCED_DRAG_MODEL" && /authoritative/.test(issue.explanation)));
});

test("linearized supersonic normal-force trend remains explicit and leaves transonic flow unsupported", () => {
  const supersonic = loadModel({ normalForceModel: "supersonic-linearized" }).evaluate(
    state({ velocityWorldMps: { x: -700, y: 14, z: 0 } }),
  );

  assert.ok(supersonic.diagnostics.mach > 1.2);
  assert.equal(supersonic.diagnostics.normalForceModel, "supersonic-linearized");
  assert.equal(supersonic.diagnostics.normalForceApplied, true);
  assert.ok(supersonic.diagnostics.normalForceModelFactor > 0);
  assert.ok(supersonic.diagnostics.normalForceN > 0);

  const transonic = loadModel({ normalForceModel: "supersonic-linearized" }).evaluate(
    state({ velocityWorldMps: { x: -350, y: 8, z: 0 } }),
  );
  assert.ok(transonic.diagnostics.mach > 0.8 && transonic.diagnostics.mach < 1.2);
  assert.equal(transonic.diagnostics.normalForceApplied, false);
  assert.equal(transonic.diagnostics.normalForceN, 0);
  assert.ok(
    transonic.diagnostics.applicability.some(
      (issue) => issue.code === "NORMAL_FORCE_MODEL_DOMAIN" && issue.severity === "unsupported",
    ),
  );
});

test("atmosphere and gravity use launch altitude plus ENU up position", () => {
  const evaluation = loadModel({ launchAltitudeM: 500 }).evaluate(
    state({ positionWorldM: { x: 0, y: 0, z: 1000 } }),
  );
  const reference = standardAtmosphere(1500);

  close(evaluation.diagnostics.altitudeAslM, 1500, 1e-15, "ASL altitude");
  close(evaluation.diagnostics.densityKgM3, reference.densityKgM3, 1e-15, "density");
});

test("thrust and gravity coupling accelerates a vertical vehicle upward", () => {
  const model = loadModel({
    thrustCurve: [
      { timeS: 0, thrustN: 30 },
      { timeS: 1, thrustN: 30 },
      { timeS: 1.000001, thrustN: 0 },
    ],
  });
  const result = simulateRigidBody6D({
    body,
    initialState: state({
      orientationBodyToWorld: verticalLaunchOrientationBodyToEnu(),
    }),
    durationS: 0.1,
    timeStepS: 0.005,
    loads: model.loads,
  });

  assert.ok(result.finalState.positionWorldM.z > 0);
  assert.ok(result.finalState.velocityWorldMps.z > 0);
  close(result.finalState.positionWorldM.x, 0, 1e-12, "east position");
  close(result.finalState.positionWorldM.y, 0, 1e-12, "north position");
});
