import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_QUATERNION,
  createMultiStageVehicleModel,
  createAerodynamicCoefficientTable,
  createPreliminaryRocketLoadModel,
  createScheduledStageSeparationEvent,
  createStageAwareAerodynamicsModel,
  initializeMultiStageState,
  resolveStageAerodynamicTable,
  separateStage,
  simulateRigidBody6D,
} from "../lib/physics/index.ts";

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

function coefficientTable(id, drag = 0.5) {
  return createAerodynamicCoefficientTable({
    id,
    name: id,
    machPoints: [0, 1],
    reynoldsPoints: [1e5, 1e6],
    dragCoefficient: { values: [[drag, drag], [drag, drag]] },
    normalForceSlopePerRad: { values: [[4, 4], [4, 4]] },
    centerOfPressureXM: { values: [[0.5, 0.5], [0.5, 0.5]] },
    provenance: {
      sourceName: "Resolver fixture",
      sourceKind: "user-supplied",
      dataVersion: "fixture-1",
      licenseIdentifier: "CC0-1.0",
      attribution: "Original test fixture",
      validationStatus: "user-supplied-unvalidated",
    },
  });
}

function properties(massKg, x, inertia = 0.02) {
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

const thrustCurve = [
  { timeS: 0, thrustN: 0 },
  { timeS: 1, thrustN: 12 },
  { timeS: 2, thrustN: 0 },
];

function motor(id, x) {
  return {
    id,
    name: id,
    thrustCurve,
    dryMassProperties: properties(0.1, x),
    initialPropellantMassProperties: properties(0.2, x),
    thrustApplicationPointBodyM: { x, y: 0, z: 0 },
  };
}

function stagingModel() {
  return createMultiStageVehicleModel({
    retainedMassProperties: properties(0.4, 0.2),
    stages: [
      {
        id: "booster",
        name: "Booster",
        structuralMassProperties: properties(0.5, 1.1),
        motors: [motor("booster-motor", 1.3)],
      },
      {
        id: "upper",
        name: "Upper stage",
        structuralMassProperties: properties(0.35, 0.55),
        motors: [motor("upper-motor", 0.72)],
      },
    ],
  });
}

const components = [
  {
    id: "nose",
    name: "Upper nose",
    stageId: "upper",
    kind: "axisymmetric",
    densityKgM3: 800,
    stations: [
      { xM: 0, outerRadiusM: 0 },
      { xM: 0.2, outerRadiusM: 0.03 },
    ],
  },
  {
    id: "upper-body",
    name: "Upper body",
    stageId: "upper",
    kind: "axisymmetric",
    densityKgM3: 800,
    wallThicknessM: 0.001,
    positionM: { x: 0.2, y: 0, z: 0 },
    stations: [
      { xM: 0, outerRadiusM: 0.03 },
      { xM: 0.6, outerRadiusM: 0.03 },
    ],
  },
  {
    id: "upper-fins",
    name: "Upper fins",
    stageId: "upper",
    kind: "finSet",
    count: 3,
    axialPositionM: 0.62,
    bodyRadiusM: 0.03,
    rootChordM: 0.16,
    tipChordM: 0.07,
    sweepM: 0.04,
    spanM: 0.07,
    thicknessM: 0.002,
    densityKgM3: 600,
  },
  {
    id: "booster-transition",
    name: "Booster transition",
    stageId: "booster",
    kind: "axisymmetric",
    densityKgM3: 800,
    wallThicknessM: 0.001,
    positionM: { x: 0.8, y: 0, z: 0 },
    stations: [
      { xM: 0, outerRadiusM: 0.03 },
      { xM: 0.08, outerRadiusM: 0.04 },
      { xM: 0.6, outerRadiusM: 0.04 },
    ],
  },
  {
    id: "booster-fins",
    name: "Booster fins",
    stageId: "booster",
    kind: "finSet",
    count: 4,
    axialPositionM: 1.18,
    bodyRadiusM: 0.04,
    rootChordM: 0.2,
    tipChordM: 0.08,
    sweepM: 0.05,
    spanM: 0.09,
    thicknessM: 0.0025,
    densityKgM3: 600,
  },
];

function aeroModel(overrides = {}) {
  return createStageAwareAerodynamicsModel({
    components,
    staging: stagingModel(),
    regimes: [
      {
        id: "full-stack",
        label: "Full launch stack",
        activeStageIds: ["booster", "upper"],
        dragCoefficient: 0.65,
      },
      {
        id: "upper-only",
        label: "Upper stage",
        activeStageIds: ["upper"],
        dragCoefficient: 0.48,
      },
    ],
    separationTransitionWindowS: 0.1,
    ...overrides,
  });
}

function state(timeS = 0, overrides = {}) {
  return {
    timeS,
    positionWorldM: { x: 0, y: 0, z: 100 },
    velocityWorldMps: { x: -20, y: 0, z: 0 },
    orientationBodyToWorld: IDENTITY_QUATERNION,
    angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

function fullStackState(timeS = 0.5) {
  return {
    ...initializeMultiStageState(state(), ["booster"]),
    timeS,
  };
}

test("topology switch recomputes active geometry, CP, reference area, and margin", () => {
  const aerodynamics = aeroModel();
  const full = aerodynamics.evaluate(fullStackState());
  const upperState = { ...separateStage(fullStackState(2), "booster"), timeS: 2.2 };
  const upper = aerodynamics.evaluate(upperState);

  assert.equal(full.regimeId, "full-stack");
  assert.deepEqual(full.activeStageIds, ["booster", "upper"]);
  assert.equal(upper.regimeId, "upper-only");
  assert.deepEqual(upper.activeStageIds, ["upper"]);
  close(full.staticStability.referenceDiameterM, 0.08, 1e-15, "stack diameter");
  close(upper.staticStability.referenceDiameterM, 0.06, 1e-15, "upper diameter");
  assert.notEqual(
    full.staticStability.centerOfPressureXM,
    upper.staticStability.centerOfPressureXM,
  );
  assert.notEqual(
    full.staticStability.staticMarginCalibers,
    upper.staticStability.staticMarginCalibers,
  );
});

test("drag-only uncertainty scale applies to constant topology sources", () => {
  const nominal = aeroModel();
  const scaled = aeroModel({ dragCoefficientScale: 1.25 });
  close(nominal.evaluate(fullStackState()).dragCoefficient, 0.65, 1e-12, "nominal drag coefficient");
  close(scaled.evaluate(fullStackState()).dragCoefficient, 0.8125, 1e-12, "scaled drag coefficient");
  close(
    scaled.evaluate(fullStackState()).normalForceSlopePerRad,
    nominal.evaluate(fullStackState()).normalForceSlopePerRad,
    1e-12,
    "normal-force slope remains nominal",
  );
  assert.match(scaled.assumptions.join(" "), /drag-only scale/);
});

test("separation neighborhood is explicitly outside topology-model applicability", () => {
  const aerodynamics = aeroModel();
  const atSeparation = aerodynamics.evaluate(
    separateStage(fullStackState(2), "booster"),
  );
  const afterWindow = aerodynamics.evaluate({
    ...separateStage(fullStackState(2), "booster"),
    timeS: 2.100001,
  });

  assert.equal(atSeparation.applicability[0].code, "STAGE_SEPARATION_PROXIMITY");
  assert.equal(atSeparation.applicability[0].severity, "unsupported");
  assert.equal(afterWindow.applicability.length, 0);
});

test("dynamic rocket loads consume topology-specific area, drag, CP, and CG", () => {
  const staging = stagingModel();
  const aerodynamics = createStageAwareAerodynamicsModel({
    components,
    staging,
    regimes: [
      { id: "full", label: "Full", activeStageIds: ["booster", "upper"], dragCoefficient: 0.65 },
      { id: "upper", label: "Upper", activeStageIds: ["upper"], dragCoefficient: 0.48 },
    ],
  });
  const loads = createPreliminaryRocketLoadModel({
    body: staging.body,
    propulsion: staging.propulsion,
    aerodynamicsAt: aerodynamics.aerodynamicsAt,
  });
  const full = loads.evaluate(fullStackState());
  const upper = loads.evaluate({
    ...separateStage(fullStackState(2), "booster"),
    timeS: 2.2,
  });

  assert.equal(full.diagnostics.aerodynamicModelVersion, aerodynamics.modelVersion);
  assert.deepEqual(full.diagnostics.activeStageIds, ["booster", "upper"]);
  assert.deepEqual(upper.diagnostics.activeStageIds, ["upper"]);
  close(full.diagnostics.dragCoefficient, 0.65, 1e-15, "full Cd");
  close(upper.diagnostics.dragCoefficient, 0.48, 1e-15, "upper Cd");
  assert.ok(full.diagnostics.referenceAreaM2 > upper.diagnostics.referenceAreaM2);
  assert.notEqual(
    full.diagnostics.centerOfPressureMinusCenterOfMassM,
    upper.diagnostics.centerOfPressureMinusCenterOfMassM,
  );
});

test("drag force changes with the exact active-stage topology", () => {
  const staging = stagingModel();
  const aerodynamics = createStageAwareAerodynamicsModel({
    components,
    staging,
    regimes: [
      { id: "full", label: "Full", activeStageIds: ["booster", "upper"], dragCoefficient: 0.65 },
      { id: "upper", label: "Upper", activeStageIds: ["upper"], dragCoefficient: 0.48 },
    ],
  });
  const loads = createPreliminaryRocketLoadModel({
    body: staging.body,
    propulsion: staging.propulsion,
    aerodynamicsAt: aerodynamics.aerodynamicsAt,
  });
  const full = loads.evaluate(fullStackState()).diagnostics.dragN;
  const upper = loads.evaluate({
    ...separateStage(fullStackState(2), "booster"),
    timeS: 2.2,
  }).diagnostics.dragN;

  assert.ok(full > upper);
  close(
    full / upper,
    (0.65 * 0.08 ** 2) / (0.48 * 0.06 ** 2),
    1e-12,
    "drag area ratio",
  );
});

test("stage transition remains exact when coupled through the 6DOF event solver", () => {
  const staging = stagingModel();
  const aerodynamics = createStageAwareAerodynamicsModel({
    components,
    staging,
    regimes: [
      { id: "full", label: "Full", activeStageIds: ["booster", "upper"], dragCoefficient: 0.65 },
      { id: "upper", label: "Upper", activeStageIds: ["upper"], dragCoefficient: 0.48 },
    ],
  });
  const loads = createPreliminaryRocketLoadModel({
    body: staging.body,
    propulsion: staging.propulsion,
    aerodynamicsAt: aerodynamics.aerodynamicsAt,
  });
  const result = simulateRigidBody6D({
    body: staging.body,
    initialState: fullStackState(0),
    durationS: 1.2,
    timeStepS: 0.37,
    loads: loads.loads,
    events: [createScheduledStageSeparationEvent({ stageId: "booster", timeS: 1 })],
  });
  const event = result.events[0];

  close(event.timeS, 1, 1e-15, "event time");
  assert.equal(aerodynamics.evaluate(event.stateBefore).regimeId, "full");
  assert.equal(aerodynamics.evaluate(event.stateAfter).regimeId, "upper");
  assert.equal(
    loads.evaluate(event.stateAfter).diagnostics.applicability[0].code,
    "STAGE_SEPARATION_PROXIMITY",
  );
});

test("aerodynamic topology adapters require an exact regime", () => {
  const staging = stagingModel();
  const aerodynamics = createStageAwareAerodynamicsModel({
    components,
    staging,
    regimes: [
      { id: "full", label: "Full", activeStageIds: ["booster", "upper"], dragCoefficient: 0.6 },
    ],
  });
  assert.throws(
    () => aerodynamics.evaluate(separateStage(fullStackState(2), "booster")),
    /no aerodynamic regime/,
  );
});

test("always-active geometry remains present after all propulsive stages separate", () => {
  const staging = stagingModel();
  const retainedNose = { ...components[0], stageId: "payload" };
  const stageComponents = components.slice(1);
  const aerodynamics = createStageAwareAerodynamicsModel({
    components: [retainedNose, ...stageComponents],
    staging,
    alwaysActiveGeometryStageIds: ["payload"],
    regimes: [
      { id: "full", label: "Full", activeStageIds: ["booster", "upper"], dragCoefficient: 0.65 },
      { id: "upper", label: "Upper", activeStageIds: ["upper"], dragCoefficient: 0.48 },
      { id: "retained", label: "Retained payload", activeStageIds: [], dragCoefficient: 0.4 },
    ],
  });
  const afterBooster = separateStage(fullStackState(2), "booster");
  const afterUpper = separateStage({ ...afterBooster, timeS: 2.1 }, "upper");
  const result = aerodynamics.evaluate({ ...afterUpper, timeS: 2.2 });

  assert.deepEqual(result.activeStageIds, []);
  assert.deepEqual(result.activeGeometryStageIds, ["payload"]);
  assert.equal(result.regimeId, "retained");
});

test("dynamic and static aerodynamic inputs cannot be mixed", () => {
  const staging = stagingModel();
  const aerodynamics = aeroModel();
  assert.throws(
    () =>
      createPreliminaryRocketLoadModel({
        body: staging.body,
        propulsion: staging.propulsion,
        aerodynamicsAt: aerodynamics.aerodynamicsAt,
        referenceAreaM2: 0.01,
      }),
    /either one dynamic aerodynamics provider/,
  );
});

test("unknown stages, duplicate topologies, and invalid transition windows fail", () => {
  const staging = stagingModel();
  assert.throws(
    () =>
      createStageAwareAerodynamicsModel({
        components: [{ ...components[0], stageId: "ghost" }],
        staging,
        regimes: [{ id: "full", label: "Full", activeStageIds: ["booster", "upper"], dragCoefficient: 0.6 }],
      }),
    /unknown stages/,
  );
  assert.throws(
    () =>
      createStageAwareAerodynamicsModel({
        components,
        staging,
        regimes: [
          { id: "a", label: "A", activeStageIds: ["booster", "upper"], dragCoefficient: 0.6 },
          { id: "b", label: "B", activeStageIds: ["upper", "booster"], dragCoefficient: 0.7 },
        ],
      }),
    /multiple aerodynamic regimes/,
  );
  assert.throws(
    () => aeroModel({ separationTransitionWindowS: -1 }),
    /non-negative/,
  );
});

test("Mach-Reynolds coefficient tables propagate into topology-aware evaluations", () => {
  const staging = stagingModel();
  const coefficientTable = createAerodynamicCoefficientTable({
    id: "fixture-table",
    name: "Fixture table",
    machPoints: [0, 1],
    reynoldsPoints: [1e5, 1e6],
    dragCoefficient: {
      values: [[0.42, 0.62], [0.4, 0.6]],
      absoluteUncertainty: [[0.01, 0.01], [0.01, 0.01]],
    },
    normalForceSlopePerRad: { values: [[4, 3.8], [4.1, 3.9]] },
    centerOfPressureXM: { values: [[0.51, 0.53], [0.5, 0.52]] },
    outOfRangePolicy: "clamp-with-warning",
    provenance: {
      sourceName: "Regression fixture",
      sourceKind: "user-supplied",
      dataVersion: "fixture-1",
      licenseIdentifier: "CC0-1.0",
      attribution: "Original test fixture",
      validationStatus: "user-supplied-unvalidated",
    },
  });
  const aerodynamics = createStageAwareAerodynamicsModel({
    components,
    staging,
    regimes: [
      {
        id: "full-table",
        label: "Full table",
        activeStageIds: ["booster", "upper"],
        coefficientTable,
        coefficientTableDesignPoint: { mach: 0.5, reynoldsNumber: 1e6 },
      },
      { id: "upper", label: "Upper", activeStageIds: ["upper"], dragCoefficient: 0.48 },
    ],
  });
  const result = aerodynamics.evaluate(fullStackState());
  assert.equal(result.coefficientEvaluation?.modelVersion, coefficientTable.modelVersion);
  assert.equal(result.coefficientEvaluation?.validationStatus, "user-supplied-unvalidated");
  close(result.dragCoefficient, 0.5, 1e-12, "design-point drag coefficient");
  assert.equal(result.applicability[0]?.code, "COEFFICIENT_UNCERTAINTY_PRESENT");
});

test("stage aerodynamic assignments select isolated tables and warn on unsafe combinations", () => {
  const globalTable = coefficientTable("global", 0.5);
  const boosterTable = coefficientTable("booster-table", 0.72);
  const upperTable = coefficientTable("upper-table", 0.38);
  const stages = [
    { id: "booster", aerodynamicTableId: boosterTable.id },
    { id: "upper", aerodynamicTableId: upperTable.id },
  ];
  const models = {
    [boosterTable.id]: boosterTable,
    [upperTable.id]: upperTable,
  };

  const isolated = resolveStageAerodynamicTable({
    activeStageIds: ["booster"],
    stages,
    aerodynamicTableModels: models,
    globalTable,
  });
  assert.equal(isolated.table?.id, boosterTable.id);
  assert.deepEqual(isolated.warnings, []);

  const combined = resolveStageAerodynamicTable({
    activeStageIds: ["booster", "upper"],
    stages,
    aerodynamicTableModels: models,
    globalTable,
  });
  assert.equal(combined.table?.id, globalTable.id);
  assert.match(combined.warnings.join(" "), /multiple aerodynamic tables/);

  const unavailable = resolveStageAerodynamicTable({
    activeStageIds: ["booster"],
    stages: [{ id: "booster", aerodynamicTableId: "missing-table" }],
    aerodynamicTableModels: models,
    globalTable,
  });
  assert.equal(unavailable.table?.id, globalTable.id);
  assert.match(unavailable.warnings.join(" "), /unavailable aerodynamic table/);
});
