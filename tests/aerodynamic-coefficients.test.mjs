import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_QUATERNION,
  createAerodynamicCoefficientTable,
  createMultiStageVehicleModel,
  createPreliminaryRocketLoadModel,
  createStageAwareAerodynamicsModel,
  dynamicViscosityAirPaS,
  initializeMultiStageState,
  reynoldsNumber,
  simulateRigidBody6D,
  standardAtmosphere,
} from "../lib/physics/index.ts";

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

const provenance = {
  sourceName: "Synthetic regression surface",
  sourceKind: "user-supplied",
  dataVersion: "test-1",
  licenseIdentifier: "CC0-1.0",
  sourceUrl: "https://example.test/aero",
  validationStatus: "user-supplied-unvalidated",
};

function table(overrides = {}) {
  return createAerodynamicCoefficientTable({
    id: "regression-table",
    name: "Regression table",
    machPoints: [0, 1],
    reynoldsPoints: [1e5, 1e7],
    dragCoefficient: {
      values: [
        [0.4, 0.6],
        [0.8, 1.0],
      ],
      absoluteUncertainty: [
        [0.01, 0.02],
        [0.03, 0.04],
      ],
    },
    normalForceSlopePerRad: {
      values: [
        [2, 4],
        [6, 8],
      ],
      absoluteUncertainty: [
        [0.1, 0.1],
        [0.3, 0.3],
      ],
    },
    centerOfPressureXM: {
      values: [
        [0.5, 0.7],
        [0.9, 1.1],
      ],
      absoluteUncertainty: [
        [0.01, 0.01],
        [0.03, 0.03],
      ],
    },
    dampingDerivativeBody: {
      roll: { values: [[-0.5, -0.7], [-0.9, -1.1]] },
      pitch: {
        values: [[-1, -2], [-3, -4]],
        absoluteUncertainty: [[0.1, 0.2], [0.3, 0.4]],
      },
      yaw: { values: [[-1.5, -1.7], [-1.9, -2.1]] },
    },
    provenance,
    ...overrides,
  });
}

function volume(base, sideslipWeight, angleOfAttackWeight, reynoldsWeight, machWeight) {
  return {
    values: [0, 1].map((sideslipIndex) =>
      [0, 1].map((angleOfAttackIndex) =>
        [0, 1].map((reynoldsIndex) =>
          [0, 1].map(
            (machIndex) =>
              base +
              sideslipIndex * sideslipWeight +
              angleOfAttackIndex * angleOfAttackWeight +
              reynoldsIndex * reynoldsWeight +
              machIndex * machWeight,
          ),
        ),
      ),
    ),
  };
}

function properties(massKg, x, inertia = 0.1) {
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

function rigidState(timeS = 0, overrides = {}) {
  return {
    timeS,
    positionWorldM: { x: 0, y: 0, z: 0 },
    velocityWorldMps: { x: -34, y: 0, z: 0 },
    orientationBodyToWorld: IDENTITY_QUATERNION,
    angularVelocityBodyRadS: { x: 0, y: 2, z: 0 },
    ...overrides,
  };
}

test("bilinear interpolation is linear in Mach and log10 Reynolds number", () => {
  const result = table().evaluate({ mach: 0.25, reynoldsNumber: 1e6 });

  close(result.dragCoefficient, 0.65, 1e-15, "drag coefficient");
  close(result.normalForceSlopePerRad, 4.5, 1e-15, "normal slope");
  close(result.centerOfPressureXM, 0.75, 1e-15, "center of pressure");
  close(result.dampingDerivativeBody.x, -0.75, 1e-15, "roll damping");
  close(result.dampingDerivativeBody.y, -2.25, 1e-15, "pitch damping");
  close(result.uncertainty.dragCoefficient, 0.0225, 1e-15, "Cd uncertainty");
  close(result.uncertainty.dampingDerivativeBody.y, 0.225, 1e-15, "damping uncertainty");
  assert.equal(result.applicability.at(-1).code, "COEFFICIENT_UNCERTAINTY_PRESENT");
});

test("table nodes and boundary values are reproduced exactly", () => {
  const model = table();
  const lower = model.evaluate({ mach: 0, reynoldsNumber: 1e5 });
  const upper = model.evaluate({ mach: 1, reynoldsNumber: 1e7 });

  close(lower.dragCoefficient, 0.4, 1e-15, "lower node");
  close(upper.dragCoefficient, 1, 1e-15, "upper node");
  assert.deepEqual(model.machRange, [0, 1]);
  assert.deepEqual(model.reynoldsRange, [1e5, 1e7]);
});

test("default out-of-range policy rejects rather than silently extrapolating", () => {
  const model = table();
  assert.throws(
    () => model.evaluate({ mach: 1.1, reynoldsNumber: 1e6 }),
    /outside table bounds/,
  );
  assert.throws(
    () => model.evaluate({ mach: 0.5, reynoldsNumber: 1e4 }),
    /outside table bounds/,
  );
});

test("clamp policy reports every unsupported axis excursion", () => {
  const result = table({ outOfRangePolicy: "clamp-with-warning" }).evaluate({
    mach: 1.2,
    reynoldsNumber: 1e4,
  });

  close(result.evaluatedMach, 1, 1e-15, "clamped Mach");
  close(result.evaluatedReynoldsNumber, 1e5, 1e-15, "clamped Reynolds");
  close(result.dragCoefficient, 0.6, 1e-15, "corner coefficient");
  assert.deepEqual(
    result.applicability.slice(0, 2).map((issue) => issue.code),
    ["MACH_ABOVE_TABLE", "REYNOLDS_BELOW_TABLE"],
  );
  assert.ok(result.applicability.slice(0, 2).every((issue) => issue.severity === "unsupported"));
});

test("angular coefficient volumes interpolate alpha and sideslip with explicit bounds", () => {
  const model = table({
    angleOfAttackPointsRad: [-0.2, 0.2],
    sideslipPointsRad: [-0.1, 0.1],
    dragCoefficientByAngle: volume(0.4, 0.1, 0.2, 0.05, 0.05),
    normalForceSlopePerRadByAngle: volume(2, 0.4, 0.8, 0.2, 0.1),
    centerOfPressureXMByAngle: volume(0.5, 0.1, 0.2, 0.05, 0.05),
  });
  const result = model.evaluate({
    mach: 0.5,
    reynoldsNumber: 1e6,
    angleOfAttackRad: 0,
    sideslipRad: 0,
  });
  close(result.dragCoefficient, 0.6, 1e-15, "angular drag coefficient");
  close(result.normalForceSlopePerRad, 2.75, 1e-15, "angular normal slope");
  close(result.centerOfPressureXM, 0.7, 1e-15, "angular center of pressure");
  assert.equal(result.modelVersion, "rocketworks-aero-angle-table-0.1.0");
  assert.deepEqual(result.evaluatedAngleOfAttackRad, 0);
  assert.deepEqual(result.evaluatedSideslipRad, 0);
  assert.deepEqual(model.angleOfAttackRangeRad, [-0.2, 0.2]);
  assert.deepEqual(model.sideslipRangeRad, [-0.1, 0.1]);

  assert.throws(
    () => model.evaluate({ mach: 0.5, reynoldsNumber: 1e6, angleOfAttackRad: 0.4, sideslipRad: 0 }),
    /outside table bounds/,
  );
  const clampedModel = table({
    angleOfAttackPointsRad: [-0.2, 0.2],
    sideslipPointsRad: [-0.1, 0.1],
    dragCoefficientByAngle: volume(0.4, 0.1, 0.2, 0.05, 0.05),
    normalForceSlopePerRadByAngle: volume(2, 0.4, 0.8, 0.2, 0.1),
    centerOfPressureXMByAngle: volume(0.5, 0.1, 0.2, 0.05, 0.05),
    outOfRangePolicy: "clamp-with-warning",
  });
  const clampedResult = clampedModel.evaluate({
    mach: 0.5,
    reynoldsNumber: 1e6,
    angleOfAttackRad: 0.4,
    sideslipRad: -0.3,
  });
  assert.equal(clampedResult.evaluatedAngleOfAttackRad, 0.2);
  assert.equal(clampedResult.evaluatedSideslipRad, -0.1);
  assert.deepEqual(
    clampedResult.applicability.slice(0, 2).map((issue) => issue.code),
    ["ANGLE_OF_ATTACK_ABOVE_TABLE", "SIDESLIP_BELOW_TABLE"],
  );
  assert.ok(Number.isFinite(clampedResult.dragCoefficient));
});

test("direct body-axis force and moment volumes expose normalized resultants", () => {
  const model = table({
    angleOfAttackPointsRad: [-0.2, 0.2],
    sideslipPointsRad: [-0.1, 0.1],
    forceCoefficientBodyByAngle: {
      axial: volume(0.8, 0.1, 0.2, 0.05, 0.05),
      normal: volume(-0.2, 0.1, 0.2, 0.05, 0.05),
      side: volume(0.1, -0.05, 0.1, 0.02, 0.01),
    },
    momentCoefficientBodyByAngle: {
      roll: volume(0.01, 0.01, 0.01, 0.005, 0.005),
      pitch: volume(-0.02, 0.01, 0.02, 0.005, 0.005),
      yaw: volume(0.03, -0.01, 0.01, 0.005, 0.005),
    },
  });
  const result = model.evaluate({
    mach: 0.5,
    reynoldsNumber: 1e6,
    angleOfAttackRad: 0,
    sideslipRad: 0,
  });
  assert.equal(result.modelVersion, "rocketworks-aero-force-moment-table-0.1.0");
  assert.equal(model.forceMomentDatabaseAvailable, true);
  close(result.forceCoefficientBody.x, 1, 1e-15, "axial coefficient");
  close(result.forceCoefficientBody.y, -0.0, 1e-15, "normal coefficient");
  close(result.forceCoefficientBody.z, 0.14, 1e-15, "side coefficient");
  close(result.momentCoefficientBody.x, 0.025, 1e-15, "roll coefficient");
  close(result.momentCoefficientBody.y, 0, 1e-15, "pitch coefficient");
  close(result.momentCoefficientBody.z, 0.035, 1e-15, "yaw coefficient");
  assert.ok(result.applicability.some((issue) => issue.code === "FORCE_MOMENT_DATABASE_PRESENT"));
});

test("Sutherland viscosity and Reynolds number match reference calculations", () => {
  const viscosity = dynamicViscosityAirPaS(288.15);
  close(viscosity, 1.7892976260350732e-5, 1e-17, "sea-level viscosity");
  const atmosphere = standardAtmosphere(0);
  close(atmosphere.dynamicViscosityPaS, viscosity, 1e-18, "atmosphere viscosity");
  close(
    atmosphere.kinematicViscosityM2S,
    viscosity / atmosphere.densityKgM3,
    1e-18,
    "kinematic viscosity",
  );
  close(
    reynoldsNumber({
      densityKgM3: 1.225,
      speedMps: 50,
      referenceLengthM: 1,
      dynamicViscosityPaS: viscosity,
    }),
    (1.225 * 50) / viscosity,
    1e-9,
    "Reynolds number",
  );
});

function integratedModels(coefficientTableOverrides = {}) {
  const coefficientTable = table({
    machPoints: [0, 0.5],
    reynoldsPoints: [1e4, 1e8],
    dragCoefficient: { values: [[0.5, 0.5], [0.5, 0.5]] },
    normalForceSlopePerRad: { values: [[3, 3], [3, 3]] },
    centerOfPressureXM: { values: [[0.75, 0.75], [0.75, 0.75]] },
    dampingDerivativeBody: {
      roll: { values: [[-1, -1], [-1, -1]] },
      pitch: { values: [[-2, -2], [-2, -2]] },
      yaw: { values: [[-3, -3], [-3, -3]] },
    },
    outOfRangePolicy: "clamp-with-warning",
    ...coefficientTableOverrides,
  });
  const staging = createMultiStageVehicleModel({
    retainedMassProperties: properties(1, 0.3),
    stages: [
      {
        id: "sustainer",
        name: "Sustainer",
        structuralMassProperties: properties(0.5, 0.6),
        motors: [
          {
            id: "motor",
            name: "Motor",
            thrustCurve: [
              { timeS: 0, thrustN: 0 },
              { timeS: 1, thrustN: 0.01 },
              { timeS: 2, thrustN: 0 },
            ],
            dryMassProperties: properties(0.1, 0.9),
            initialPropellantMassProperties: properties(0.1, 0.9),
            thrustApplicationPointBodyM: { x: 1, y: 0, z: 0 },
          },
        ],
      },
    ],
  });
  const components = [
    {
      id: "nose",
      name: "Nose",
      stageId: "sustainer",
      kind: "axisymmetric",
      densityKgM3: 700,
      stations: [
        { xM: 0, outerRadiusM: 0 },
        { xM: 0.2, outerRadiusM: 0.03 },
      ],
    },
    {
      id: "body",
      name: "Body",
      stageId: "sustainer",
      kind: "axisymmetric",
      densityKgM3: 700,
      wallThicknessM: 0.001,
      positionM: { x: 0.2, y: 0, z: 0 },
      stations: [
        { xM: 0, outerRadiusM: 0.03 },
        { xM: 0.8, outerRadiusM: 0.03 },
      ],
    },
    {
      id: "fins",
      name: "Fins",
      stageId: "sustainer",
      kind: "finSet",
      count: 3,
      axialPositionM: 0.75,
      bodyRadiusM: 0.03,
      rootChordM: 0.2,
      tipChordM: 0.08,
      sweepM: 0.04,
      spanM: 0.08,
      thicknessM: 0.002,
      densityKgM3: 500,
    },
  ];
  const aerodynamics = createStageAwareAerodynamicsModel({
    components,
    staging,
    regimes: [
      {
        id: "sustainer",
        label: "Sustainer",
        activeStageIds: ["sustainer"],
        coefficientTable,
        referenceLengthM: 1,
        dampingReferenceLengthBodyM: { x: 0.06, y: 1, z: 1 },
      },
    ],
  });
  const loads = createPreliminaryRocketLoadModel({
    body: staging.body,
    propulsion: staging.propulsion,
    aerodynamicsAt: aerodynamics.aerodynamicsAt,
  });
  return { staging, aerodynamics, loads, coefficientTable };
}

test("tabulated topology provider exposes Mach, Reynolds, provenance, and uncertainty", () => {
  const { staging, loads } = integratedModels();
  const current = initializeMultiStageState(rigidState(), ["sustainer"]);
  const result = loads.evaluate(current);

  assert.ok(result.diagnostics.reynoldsNumber > 1e6);
  close(result.diagnostics.dragCoefficient, 0.5, 1e-15, "tabulated Cd");
  close(result.diagnostics.normalForceSlopePerRad, 3, 1e-15, "tabulated CNa");
  close(result.diagnostics.centerOfPressureXM, 0.75, 1e-15, "tabulated CP");
  assert.equal(result.diagnostics.coefficientProvenance.sourceName, provenance.sourceName);
  assert.equal(result.diagnostics.aerodynamicModelVersion, "kestrel-stage-aware-aero-0.1.0");
  assert.deepEqual(staging.stageIds, ["sustainer"]);
  assert.ok(
    !result.diagnostics.applicability.some(
      (issue) => issue.code === "FIXED_DRAG_COEFFICIENT",
    ),
  );
});

test("stage-aware loads pass angle-of-attack and sideslip into angular coefficient volumes", () => {
  const angularOverrides = {
    angleOfAttackPointsRad: [-0.3, 0.3],
    sideslipPointsRad: [-0.3, 0.3],
    dragCoefficientByAngle: volume(0.6, 0.05, 0.1, 0.02, 0.01),
    normalForceSlopePerRadByAngle: volume(3, 0.2, 0.4, 0.1, 0.05),
    centerOfPressureXMByAngle: volume(0.75, 0.01, 0.02, 0.01, 0.01),
  };
  const { loads, coefficientTable } = integratedModels(angularOverrides);
  const current = initializeMultiStageState(
    rigidState(0, { velocityWorldMps: { x: -34, y: 5, z: 0 } }),
    ["sustainer"],
  );
  const result = loads.evaluate(current);
  const expected = coefficientTable.evaluate({
    mach: result.diagnostics.mach,
    reynoldsNumber: result.diagnostics.reynoldsNumber,
    angleOfAttackRad: result.diagnostics.angleOfAttackRad,
    sideslipRad: result.diagnostics.sideslipRad,
  });
  close(result.diagnostics.dragCoefficient, expected.dragCoefficient, 1e-12, "angular table drag");
  close(result.diagnostics.normalForceSlopePerRad, expected.normalForceSlopePerRad, 1e-12, "angular table normal slope");
  assert.equal(result.diagnostics.coefficientBasis, "mach-reynolds-angle-table");
  assert.ok(result.diagnostics.angleOfAttackRad > 0.1);
  assert.ok(result.diagnostics.sideslipRad > 0.1);
});

test("dimensionless pitch derivative produces the documented damping moment", () => {
  const { loads } = integratedModels();
  const current = initializeMultiStageState(rigidState(), ["sustainer"]);
  const result = loads.evaluate(current);
  const q = result.diagnostics.dynamicPressurePa;
  const area = result.diagnostics.referenceAreaM2;
  const expectedPitchMoment =
    (q * area * -2 * current.angularVelocityBodyRadS.y * 1 ** 2) /
    (2 * result.diagnostics.airspeedMps);

  close(
    result.diagnostics.aerodynamicDampingMomentBodyNm.y,
    expectedPitchMoment,
    1e-15,
    "pitch damping moment",
  );
  assert.ok(result.diagnostics.aerodynamicDampingMomentBodyNm.y < 0);
  assert.ok(
    !result.diagnostics.applicability.some(
      (issue) => issue.code === "AERODYNAMIC_DAMPING_OMITTED",
    ),
  );
});

test("incomplete or destabilizing damping inputs remain explainable", () => {
  const body = {
    massKg: 1,
    inertiaBodyKgM2: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  };
  const base = {
    body,
    thrustAtTimeS: () => 0,
  };
  const incomplete = createPreliminaryRocketLoadModel({
    ...base,
    aerodynamicsAt: () => ({
      referenceAreaM2: 0.01,
      dragCoefficient: 0.5,
      normalForceSlopePerRad: 2,
      centerOfPressureMinusCenterOfMassM: 0.2,
      dampingDerivativeBody: { x: -1, y: -1, z: -1 },
    }),
  });
  assert.throws(
    () => incomplete.evaluate(rigidState()),
    /derivatives and reference lengths/,
  );

  const destabilizing = createPreliminaryRocketLoadModel({
    ...base,
    aerodynamicsAt: () => ({
      referenceAreaM2: 0.01,
      dragCoefficient: 0.5,
      normalForceSlopePerRad: 2,
      centerOfPressureMinusCenterOfMassM: 0.2,
      dampingDerivativeBody: { x: -1, y: 0.1, z: -1 },
      dampingReferenceLengthBodyM: { x: 0.1, y: 1, z: 1 },
    }),
  }).evaluate(rigidState());
  assert.ok(
    destabilizing.diagnostics.applicability.some(
      (issue) => issue.code === "AERODYNAMIC_DAMPING_DESTABILIZING",
    ),
  );
});

test("coupled damping reduces angular speed in the 6DOF simulation", () => {
  const { staging, loads } = integratedModels();
  const initialState = initializeMultiStageState(rigidState(), ["sustainer"]);
  const damped = simulateRigidBody6D({
    body: staging.body,
    initialState,
    durationS: 0.2,
    timeStepS: 0.001,
    loads: loads.loads,
  });
  const undamped = simulateRigidBody6D({
    body: staging.body,
    initialState,
    durationS: 0.2,
    timeStepS: 0.001,
  });

  assert.ok(
    Math.abs(damped.finalState.angularVelocityBodyRadS.y) <
      Math.abs(undamped.finalState.angularVelocityBodyRadS.y),
  );
});

test("malformed grids and incomplete provenance fail explicitly", () => {
  assert.throws(
    () => table({ dragCoefficient: { values: [[0.5]] } }),
    /one row per Reynolds point/,
  );
  assert.throws(
    () => table({ machPoints: [0.5, 0.5] }),
    /strictly increasing/,
  );
  assert.throws(
    () => table({ provenance: { ...provenance, licenseIdentifier: "" } }),
    /requires source name/,
  );
  assert.throws(
    () => table({ angleOfAttackPointsRad: [-0.1, 0.1] }),
    /axes must be supplied together/,
  );
  assert.throws(
    () => table({
      angleOfAttackPointsRad: [-0.1, 0.1],
      sideslipPointsRad: [-0.1, 0.1],
      dragCoefficientByAngle: { values: [[[ [0.5, 0.5] ]]] },
    }),
    /ordered sideslip/,
  );
  assert.throws(
    () => dynamicViscosityAirPaS(0),
    /positive finite/,
  );
});
