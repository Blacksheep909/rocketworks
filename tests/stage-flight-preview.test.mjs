import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeStageFlightUncertainty,
  createApogeeRecoveryDeploymentEvent,
  createScheduledRecoveryDeploymentEvent,
  createScheduledStageIgnitionEvent,
  createScheduledStageSeparationEvent,
  computeStageMassRatio,
  computeStageFlightForceBudget,
  createStageFlightVariant,
  simulateStageFlightPreview,
} from "../lib/physics/index.ts";

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
  { timeS: 1, thrustN: 30 },
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

const stages = [
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
];

const components = [
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
    id: "booster-body",
    name: "Booster body",
    stageId: "booster",
    kind: "axisymmetric",
    densityKgM3: 800,
    wallThicknessM: 0.001,
    positionM: { x: 0.8, y: 0, z: 0 },
    stations: [
      { xM: 0, outerRadiusM: 0.04 },
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

const regimes = [
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
];

test("stage-flight force budget integrates scalar trace magnitudes and stage windows", () => {
  const result = computeStageFlightForceBudget([
    { timeS: 0, massKg: 2, thrustN: 10, dragN: 1, recoveryDragN: 0, aerodynamicForceN: 2, dynamicPressurePa: 0, speedMps: 0, attachedStageIds: ["booster"] },
    { timeS: 1, massKg: 2, thrustN: 20, dragN: 3, recoveryDragN: 1, aerodynamicForceN: 4, dynamicPressurePa: 100, speedMps: 10, attachedStageIds: ["booster"] },
    { timeS: 2, massKg: 1, thrustN: 0, dragN: 1, recoveryDragN: 0, aerodynamicForceN: 1, dynamicPressurePa: 50, speedMps: 4, attachedStageIds: [] },
  ], { stageLabels: { booster: "Booster" } });

  assert.equal(result.status, "assessed");
  assert.equal(result.timeSpanS, 2);
  assert.equal(result.thrustImpulseNs, 25);
  assert.equal(result.aerodynamicDragImpulseNs, 4);
  assert.equal(result.recoveryDragImpulseNs, 1);
  assert.equal(result.combinedDragImpulseNs, 5);
  assert.equal(result.aerodynamicForceImpulseNs, 5.5);
  assert.equal(result.peakDynamicPressurePa, 100);
  assert.equal(result.peakSpeedMps, 10);
  assert.equal(result.stages[0].stageName, "Booster");
  assert.equal(result.stages[0].activeDurationS, 2);
  assert.match(result.warnings.join(" "), /scalar magnitudes/);
});

test("stage-flight force budget rejects malformed traces and keeps insufficient coverage explicit", () => {
  assert.equal(computeStageFlightForceBudget([]).status, "not-assessed");
  assert.throws(
    () => computeStageFlightForceBudget([
      { timeS: 1, massKg: 1, thrustN: 0, dragN: 0, recoveryDragN: 0 },
      { timeS: 0, massKg: 1, thrustN: 0, dragN: 0, recoveryDragN: 0 },
    ]),
    /non-decreasing/,
  );
  assert.throws(
    () => computeStageFlightForceBudget([
      { timeS: 0, massKg: 0, thrustN: 0, dragN: 0, recoveryDragN: 0 },
    ]),
    /mass must be positive/,
  );
});

test("stage-flight adapter couples staging, topology aerodynamics, and 6DOF events", () => {
  const result = simulateStageFlightPreview({
    retainedMassProperties: properties(0.4, 0.2),
    components,
    stages,
    regimes,
    initiallyIgnitedStageIds: ["booster"],
    durationS: 2.5,
    timeStepS: 0.05,
    integration: { method: "adaptive-rk4-step-doubling" },
    launchAltitudeM: 0,
    events: [
      createScheduledStageSeparationEvent({
        stageId: "booster",
        timeS: 1,
        separationDeltaVBodyMps: { x: 0.1, y: 0, z: 0 },
      }),
      createScheduledStageIgnitionEvent({ stageId: "upper", timeS: 1 }),
    ],
  });

  assert.equal(result.modelVersion, "kestrel-stage-flight-preview-0.19.0");
  assert.equal(result.validationStatus, "mathematical-regression-tests-only");
  assert.equal(result.simulation?.integration.method, "adaptive-rk4-step-doubling");
  assert.ok((result.simulation?.integration.acceptedStepCount ?? 0) > 0);
  assert.equal(result.massRatio.overallStatus, "assessed");
  assert.equal(result.massRatio.stages.length, 2);
  assert.ok(result.massRatio.totalIdealDeltaVMps > 0);
  assert.equal(result.forceBudget.status, "assessed");
  assert.equal(result.forceBudget.sampleCount, result.trace.length);
  assert.ok((result.forceBudget.thrustImpulseNs ?? 0) > 0);
  assert.ok((result.forceBudget.thrustVelocityEquivalentMps ?? 0) > 0);
  assert.ok(result.forceBudget.stages.some((stage) => stage.stageId === "booster"));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("velocity-equivalent accounting")));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("Tsiolkovsky")));
  assert.equal(result.events.length, 2);
  assert.equal(result.eventAllocation.status, "watch");
  assert.equal(result.eventAllocation.sameTimeGroups.length, 1);
  assert.equal(result.events[0].missionKind, "separation");
  assert.equal(result.events[1].missionKind, "ignition");
  assert.deepEqual(result.events[0].attachedStageIdsBefore, ["booster", "upper"]);
  assert.deepEqual(result.events[0].attachedStageIdsAfter, ["upper"]);
  assert.deepEqual(result.events[0].detachedStageIds, ["booster"]);
  assert.deepEqual(result.events[0].separationDeltaVBodyMps, { x: 0.1, y: 0, z: 0 });
  assert.ok(result.events[0].separationDeltaVWorldMps);
  assert.ok(Math.abs(Math.hypot(
    result.events[0].separationDeltaVWorldMps.x,
    result.events[0].separationDeltaVWorldMps.y,
    result.events[0].separationDeltaVWorldMps.z,
  ) - 0.1) < 1e-12);
  assert.deepEqual(result.events[1].attachedStageIdsAfter, ["upper"]);
  assert.deepEqual(result.events[1].detachedStageIds, []);
  assert.ok(result.maxAltitudeAglM > 0);
  assert.ok(result.maxSpeedMps > 0);
  assert.ok(result.trace.every((point) => Number.isFinite(point.mach) && Number.isFinite(point.angleOfAttackRad) && Number.isFinite(point.sideslipRad) && Number.isFinite(point.dynamicPressurePa) && Number.isFinite(point.dragN) && Number.isFinite(point.aerodynamicForceN) && Number.isFinite(point.aerodynamicMomentNm) && Number.isFinite(point.aerodynamicDampingMomentNm)));
  assert.ok(result.trace.some((point) => point.dynamicPressurePa > 0));
  assert.ok(result.trace.some((point) => point.attachedStageIds.includes("booster")));
  assert.ok(result.trace.some((point) => !point.attachedStageIds.includes("booster")));
  assert.ok(["converged", "watch"].includes(result.convergence.status));
  assert.equal(result.convergence.baseTimeStepS, 0.05);
  assert.equal(result.convergence.refinedTimeStepS, 0.025);
  assert.ok(Number.isFinite(result.convergence.maximumRelativeDifference));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("separated bodies")));
  assert.equal(result.separatedBodies.length, 1);
  assert.equal(result.separationDynamics.length, 1);
  assert.ok(["balanced", "review", "unavailable"].includes(result.separationDynamics[0].status));
  assert.ok(Number.isFinite(result.separationDynamics[0].linearMomentumResidualMagnitudeKgMps));
  assert.equal(result.separationImpulseSolutions.length, 1);
  assert.ok(["balanced", "review", "unavailable"].includes(result.separationImpulseSolutions[0].status));
  assert.equal(result.separationImpulseSolutions[0].correctionModel, "minimum-norm-linear-and-angular-impulse");
  assert.ok(result.multiBodySeparation);
  assert.equal(result.multiBodySeparation.bodies.length, 2);
  assert.equal(result.multiBodySeparation.pairs.length, 1);
  assert.ok(["assessed", "partial", "not-assessed"].includes(result.multiBodySeparation.status));
  assert.ok(result.separationEnvelope);
  assert.equal(result.separationEnvelope.bodies.length, 2);
  assert.ok(["assessed", "partial", "not-assessed"].includes(result.separationEnvelope.envelopeStatus));
  assert.ok(result.coupledMultiBodyFlight);
  assert.equal(result.coupledMultiBodyFlight.trajectories.length, 1);
  assert.equal(result.coupledMultiBodyFlight.pairwise, null);
  assert.equal(result.coupledMultiBodyFlight.status, "assessed");
  assert.ok(result.assumptions.some((assumption) => assumption.includes("shared mission-time grid")));
  assert.equal(result.separatedBodies[0].stageId, "booster");
  assert.equal(result.separatedBodies[0].releaseTimeS, 1);
  assert.deepEqual(result.separatedBodies[0].retainedBodyDeltaVBodyMps, { x: 0.1, y: 0, z: 0 });
  assert.equal(result.separatedBodies[0].separationImpulseModel, "mass-ratio-linear-momentum");
  assert.ok(Math.abs(result.separatedBodies[0].detachedBodyDeltaVBodyMps.x + 0.1 * 1.05 / 0.7) < 1e-12);
  assert.ok(result.separatedBodies[0].warnings.some((warning) => warning.includes("equal-and-opposite")));
  assert.ok(result.separatedBodies[0].warnings.some((warning) => warning.includes("ballistic")));
  assert.deepEqual(result.clusterDiagnostics, []);
});

test("stage mass-ratio branch exposes ideal rocket-equation diagnostics", () => {
  const result = computeStageMassRatio({ stages });
  assert.equal(result.overallStatus, "assessed");
  assert.equal(result.stages.length, 2);
  assert.equal(result.stages[0].fullStageMassKg, 0.8);
  assert.equal(result.stages[0].burnoutStageMassKg, 0.6);
  assert.ok(Math.abs(result.stages[0].massRatio - (0.8 / 0.6)) < 1e-12);
  assert.ok(result.stages[0].effectiveSpecificImpulseS > 0);
  assert.ok(result.stages[0].idealDeltaVMps > 0);
  assert.ok(result.totalIdealDeltaVMps > result.stages[0].idealDeltaVMps);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("Tsiolkovsky")));
});

test("stage mass-ratio branch keeps missing propellant evidence unavailable", () => {
  const result = computeStageMassRatio({
    stages: [{
      ...stages[0],
      id: "dry-stage",
      name: "Dry stage",
      motors: [{
        ...stages[0].motors[0],
        id: "dry-motor",
        initialPropellantMassProperties: properties(0, 1.3),
      }],
    }],
  });
  assert.equal(result.overallStatus, "review");
  assert.equal(result.stages[0].status, "unavailable");
  assert.equal(result.stages[0].massRatio, null);
  assert.ok(result.warnings.some((warning) => warning.includes("No positive initial propellant")));
});

test("stage-flight adapter couples retained recovery loads and apogee command telemetry", () => {
  const result = simulateStageFlightPreview({
    retainedMassProperties: properties(0.4, 0.2),
    components,
    stages,
    regimes,
    initiallyIgnitedStageIds: ["booster"],
    durationS: 4,
    timeStepS: 0.05,
    launchAltitudeM: 0,
    recoveryDevices: [
      {
        id: "main",
        name: "Main canopy",
        dragCoefficient: 0.75,
        referenceAreaM2: 0.2,
        inflationTimeS: 0,
      },
    ],
    stateEvents: [createApogeeRecoveryDeploymentEvent({ deviceId: "main" })],
  });

  assert.equal(result.recoveryModelVersion, "kestrel-recovery-loads-0.2.0");
  assert.ok(result.events.some((event) => event.id === "recovery-main-apogee-command"));
  assert.ok(result.trace.every((point) => Number.isFinite(point.recoveryDragN) && Number.isFinite(point.recoveryEffectiveAreaM2)));
  assert.ok(result.trace.some((point) => point.recoveryEffectiveAreaM2 > 0));
  assert.ok(result.trace.some((point) => point.recoveryDragN > 0));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("Retained-vehicle recovery devices are coupled")));
  assert.ok(result.warnings.some((warning) => warning.includes("Opening shock")));
});

test("stage-flight adapter carries configured recovery into detached branches", () => {
  const stagesWithRecovery = stages.map((stage) => stage.id === "booster"
    ? {
        ...stage,
        recoveryDevices: [{
          id: "booster-recovery",
          name: "Booster recovery canopy",
          dragCoefficient: 0.75,
          referenceAreaM2: 0.3,
          deploymentDelayS: 0,
          inflationTimeS: 0.1,
        }],
        recoveryDeploymentTrigger: "time",
        recoveryDeploymentAltitudeAglM: 120,
        recoveryDeploymentTimeS: 2,
      }
    : stage);
  const result = simulateStageFlightPreview({
    retainedMassProperties: properties(0.4, 0.2),
    components,
    stages: stagesWithRecovery,
    regimes,
    initiallyIgnitedStageIds: ["booster"],
    durationS: 8,
    timeStepS: 0.05,
    launchAltitudeM: 0,
    initialState: {
      positionWorldM: { x: 0, y: 0, z: 100 },
      velocityWorldMps: { x: 0, y: 0, z: 20 },
    },
    events: [createScheduledStageSeparationEvent({
      stageId: "booster",
      timeS: 1,
      separationDeltaVBodyMps: { x: 0.1, y: 0, z: 0 },
    })],
  });

  assert.equal(result.separatedBodies.length, 1);
  assert.equal(result.separatedBodies[0].recoveryModelVersion, "kestrel-recovery-loads-0.2.0");
  assert.equal(result.separatedBodies[0].recoveryDeploymentTrigger, "time");
  assert.ok(result.separatedBodies[0].simulation.events.some((event) => event.id === "recovery-booster-recovery-scheduled-command"));
  assert.ok(result.separatedBodies[0].trace.some((point) => point.recoveryDragN > 0));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("Detached recovery commands")));
});

test("coupled stage-flight uncertainty is seeded, bounded, and non-mutating", () => {
  const baseInput = {
    retainedMassProperties: properties(0.4, 0.2),
    components,
    stages,
    regimes,
    initiallyIgnitedStageIds: ["booster"],
    durationS: 2.5,
    timeStepS: 0.1,
    launchAltitudeM: 0,
  };
  const factors = [
    {
      key: "thrustScale",
      label: "Delivered thrust",
      distribution: { kind: "uniform", minimum: 0.95, maximum: 1.05 },
    },
    {
      key: "dragCoefficientScale",
      label: "Drag coefficient",
      distribution: { kind: "triangular", minimum: 0.9, mode: 1, maximum: 1.1 },
    },
    {
      key: "directForceCoefficientScale",
      label: "Direct force coefficients",
      distribution: { kind: "uniform", minimum: 0.95, maximum: 1.05 },
    },
    {
      key: "directMomentCoefficientScale",
      label: "Direct moment coefficients",
      distribution: { kind: "uniform", minimum: 0.95, maximum: 1.05 },
    },
  ];
  const first = analyzeStageFlightUncertainty({
    baseInput,
    factors,
    seed: "stage-flight-fixture",
    sampleCount: 6,
  });
  const second = analyzeStageFlightUncertainty({
    baseInput,
    factors,
    seed: "stage-flight-fixture",
    sampleCount: 6,
  });

  assert.equal(first.adapterVersion, "kestrel-stage-flight-uncertainty-0.5.0");
  assert.equal(first.requestedSampleCount, 6);
  assert.equal(first.successfulSampleCount, 6);
  assert.deepEqual(first.samples, second.samples);
  assert.ok(first.metrics.maxAltitudeAglM.p50 !== null);
  assert.ok(first.metrics.maxDynamicPressurePa.p95 !== null);
  assert.equal(baseInput.stages[0].motors[0].thrustCurve[1].thrustN, 30);

  const variant = createStageFlightVariant(baseInput, {
    dryMassScale: 1.1,
    propellantMassScale: 0.9,
    thrustScale: 1.05,
    dragCoefficientScale: 1.2,
    directForceCoefficientScale: 1.1,
    directMomentCoefficientScale: 0.9,
    windScale: 1.1,
  });
  assert.equal(variant.stages[0].structuralMassProperties.massKg, 0.55);
  assert.ok(Math.abs(variant.stages[0].motors[0].initialPropellantMassProperties.massKg - 0.18) < 1e-12);
  assert.equal(variant.stages[0].motors[0].thrustCurve[1].thrustN, 31.5);
  assert.equal(variant.dragCoefficientScale, 1.2);
  assert.equal(variant.directForceCoefficientScale, 1.1);
  assert.equal(variant.directMomentCoefficientScale, 0.9);

  const recoveryBase = {
    ...baseInput,
    recoveryDevices: [
      {
        id: "main",
        name: "Main canopy",
        dragCoefficient: 0.75,
        referenceAreaM2: 0.2,
      },
    ],
  };
  const recoveryVariant = createStageFlightVariant(recoveryBase, {
    recoveryAreaScale: 1.25,
  });
  assert.equal(recoveryVariant.recoveryDevices[0].referenceAreaM2, 0.25);
  assert.equal(recoveryBase.recoveryDevices[0].referenceAreaM2, 0.2);
  const failedRecoveryVariant = createStageFlightVariant(recoveryBase, {
    recoveryDeploymentSuccess: 0,
  });
  assert.ok(failedRecoveryVariant.events.some((event) => event.id === "uncertainty-main-recovery-failure"));
  assert.ok(failedRecoveryVariant.events[0].timeS > 0);
  const recoveryUncertainty = analyzeStageFlightUncertainty({
    baseInput: {
      ...recoveryBase,
      events: [createScheduledRecoveryDeploymentEvent({ deviceId: "main", timeS: 0.5 })],
    },
    factors: [
      {
        key: "recoveryAreaScale",
        label: "Recovery area",
        distribution: { kind: "uniform", minimum: 0.9, maximum: 1.1 },
      },
      {
        key: "recoveryDeploymentSuccess",
        label: "Recovery deployment",
        distribution: { kind: "bernoulli", successProbability: 0.5 },
      },
    ],
    seed: "recovery-area-fixture",
    sampleCount: 4,
  });
  assert.equal(recoveryUncertainty.failedSampleCount, 0);
  assert.ok(recoveryUncertainty.metrics.maxRecoveryDragN.p95 !== null);

  const providerVariant = createStageFlightVariant(
    {
      ...baseInput,
      environmentAt: () => ({
        meanWindWorldMps: { x: 1, y: 2, z: 3 },
        turbulenceWindWorldMps: { x: 0.1, y: 0.2, z: 0.3 },
        discreteGustWindWorldMps: { x: 0.4, y: 0.5, z: 0.6 },
        windWorldMps: { x: 1.5, y: 2.7, z: 3.9 },
      }),
    },
    { windScale: 2 },
  );
  assert.deepEqual(providerVariant.environmentAt({}), {
    meanWindWorldMps: { x: 2, y: 4, z: 6 },
    turbulenceWindWorldMps: { x: 0.2, y: 0.4, z: 0.6 },
    discreteGustWindWorldMps: { x: 0.8, y: 1, z: 1.2 },
    windWorldMps: { x: 3, y: 5.4, z: 7.8 },
  });
});

test("stage-flight uncertainty perturbs event timing, separation impulse, and alignment without mutating the base", () => {
  const separationEvent = {
    id: "staging-booster-separation",
    label: "sample separation",
    timeS: 0.5,
    separationDeltaVBodyMps: { x: 2, y: 0, z: 0 },
    apply: (state) => ({
      ...state,
      velocityWorldMps: {
        ...state.velocityWorldMps,
        x: state.velocityWorldMps.x + 2,
      },
    }),
  };
  const ignitionEvent = {
    id: "staging-upper-ignition-after-booster-burnout",
    label: "sample ignition",
    direction: "rising",
    value: (state) => state.timeS,
    apply: (state) => state,
  };
  const baseInput = {
    retainedMassProperties: properties(0.4, 0.2),
    components,
    stages,
    regimes,
    initiallyIgnitedStageIds: ["booster"],
    durationS: 2.5,
    timeStepS: 0.1,
    launchAltitudeM: 0,
    initialState: {
      orientationBodyToWorld: { w: 1, x: 0, y: 0, z: 0 },
    },
    events: [separationEvent],
    stateEvents: [ignitionEvent],
  };
  const variant = createStageFlightVariant(baseInput, {
    ignitionDelayOffsetS: 0.15,
    separationImpulseScale: 1.5,
    alignmentOffsetRad: 0.01,
  });

  assert.equal(baseInput.stages[0].motors[0].ignitionDelayS, undefined);
  assert.equal(baseInput.events[0].separationDeltaVBodyMps.x, 2);
  assert.equal(variant.stages[0].motors[0].ignitionDelayS, 0.15);
  assert.equal(variant.events[0].separationDeltaVBodyMps.x, 3);
  const after = variant.events[0].apply({
    timeS: 0,
    positionWorldM: { x: 0, y: 0, z: 0 },
    velocityWorldMps: { x: 0, y: 0, z: 0 },
    orientationBodyToWorld: { w: 1, x: 0, y: 0, z: 0 },
    angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
  });
  assert.equal(after.velocityWorldMps.x, 3);
  assert.ok(Math.abs(variant.stateEvents[0].value({ timeS: 1 }) - 0.85) < 1e-12);
  assert.notDeepEqual(
    variant.initialState.orientationBodyToWorld,
    baseInput.initialState.orientationBodyToWorld,
  );
  assert.ok(variant.additionalWarnings.some((warning) => warning.includes("launch-alignment")));
  assert.ok(variant.additionalAssumptions.some((assumption) => assumption.includes("Event uncertainty factors")));
});

test("stage-flight adapter spawns one separated-body branch per repeated physical copy", () => {
  const repeatedBooster = {
    ...stages[0],
    instances: [
      {
        id: "booster-1",
        name: "Booster 1",
        structuralMassProperties: properties(0.5, 1.1),
        motors: [motor("booster-1-motor", 1.3)],
      },
      {
        id: "booster-2",
        name: "Booster 2",
        structuralMassProperties: properties(0.5, 1.1),
        motors: [motor("booster-2-motor", 1.3)],
      },
    ],
  };
  const result = simulateStageFlightPreview({
    retainedMassProperties: properties(0.4, 0.2),
    components: [
      ...components.filter((component) => component.stageId === "booster"),
      { ...components.find((component) => component.id === "upper-body"), id: "retained-body", stageId: "retained" },
      { ...components.find((component) => component.id === "upper-fins"), id: "retained-fins", stageId: "retained" },
    ],
    stages: [repeatedBooster],
    regimes: [
      { id: "booster-only", label: "Booster", activeStageIds: ["booster"], dragCoefficient: 0.65 },
      { id: "retained-only", label: "Retained payload", activeStageIds: [], dragCoefficient: 0.5 },
    ],
    initiallyIgnitedStageIds: ["booster"],
    alwaysActiveGeometryStageIds: ["retained"],
    durationS: 2.5,
    timeStepS: 0.05,
    launchAltitudeM: 0,
    initialState: {
      positionWorldM: { x: 0, y: 0, z: 100 },
      velocityWorldMps: { x: 0, y: 0, z: 20 },
    },
    events: [
      createScheduledStageSeparationEvent({ stageId: "booster", instanceId: "booster-1", timeS: 1 }),
      createScheduledStageSeparationEvent({ stageId: "booster", instanceId: "booster-2", timeS: 1.4 }),
    ],
  });

  assert.equal(result.separatedBodies.length, 2);
  assert.deepEqual(result.separatedBodies.map((body) => body.instanceId), ["booster-1", "booster-2"]);
  assert.deepEqual(result.events[0].detachedStageIds, []);
  assert.deepEqual(result.events[0].detachedStageInstanceIds, ["booster-1"]);
  assert.deepEqual(result.events[1].detachedStageIds, ["booster"]);
  assert.deepEqual(result.events[1].detachedStageInstanceIds, ["booster-2"]);
});

test("logical separation balances one impulse across all detached copies", () => {
  const repeatedBooster = {
    ...stages[0],
    instances: [
      {
        id: "booster-1",
        name: "Booster 1",
        structuralMassProperties: properties(0.5, 1.1),
        motors: [motor("booster-1-motor", 1.3)],
      },
      {
        id: "booster-2",
        name: "Booster 2",
        structuralMassProperties: properties(0.5, 1.1),
        motors: [motor("booster-2-motor", 1.3)],
      },
    ],
  };
  const result = simulateStageFlightPreview({
    retainedMassProperties: properties(0.4, 0.2),
    components: [
      ...components.filter((component) => component.stageId === "booster"),
      { ...components.find((component) => component.id === "upper-body"), id: "retained-body", stageId: "retained" },
      { ...components.find((component) => component.id === "upper-fins"), id: "retained-fins", stageId: "retained" },
    ],
    stages: [repeatedBooster],
    regimes: [
      { id: "booster-only", label: "Booster", activeStageIds: ["booster"], dragCoefficient: 0.65 },
      { id: "retained-only", label: "Retained payload", activeStageIds: [], dragCoefficient: 0.5 },
    ],
    initiallyIgnitedStageIds: ["booster"],
    alwaysActiveGeometryStageIds: ["retained"],
    durationS: 2.5,
    timeStepS: 0.05,
    launchAltitudeM: 0,
    events: [
      createScheduledStageSeparationEvent({
        stageId: "booster",
        timeS: 1,
        separationDeltaVBodyMps: { x: 0.2, y: 0, z: 0 },
      }),
    ],
  });

  assert.equal(result.separatedBodies.length, 2);
  assert.ok(result.separatedBodies.every((body) => body.separationImpulseModel === "mass-ratio-linear-momentum"));
  assert.ok(result.separatedBodies.every((body) => Math.abs(body.detachedBodyDeltaVBodyMps.x + 0.2 * 0.4 / 1.4) < 1e-12));
  assert.deepEqual(result.separatedBodies[0].detachedBodyDeltaVBodyMps, result.separatedBodies[1].detachedBodyDeltaVBodyMps);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("combined detached mass")));
});

test("stage-flight adapter supplies detached-stage geometry and coefficient to the drag branch", () => {
  const result = simulateStageFlightPreview({
    retainedMassProperties: properties(0.4, 0.2),
    components,
    stages,
    regimes: [
      ...regimes,
      {
        id: "booster-only",
        label: "Booster",
        activeStageIds: ["booster"],
        dragCoefficient: 0.72,
      },
    ],
    initiallyIgnitedStageIds: ["booster"],
    durationS: 2.5,
    timeStepS: 0.05,
    launchAltitudeM: 0,
    events: [
      createScheduledStageSeparationEvent({
        stageId: "booster",
        timeS: 1,
      }),
      createScheduledStageIgnitionEvent({ stageId: "upper", timeS: 1 }),
    ],
  });

  assert.equal(result.separatedBodies.length, 1);
  assert.ok(Math.abs(result.separatedBodies[0].referenceAreaM2 - Math.PI * 0.04 ** 2) < 1e-12);
  assert.equal(result.separatedBodies[0].dragCoefficient, 0.72);
  assert.ok(result.separatedBodies[0].warnings.some((warning) => warning.includes("isotropic point drag")));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("bounded isotropic point drag")));
});

test("stage-flight adapter exposes configured cluster failure diagnostics", () => {
  const clusterStage = {
    ...stages[0],
    motors: [
      motor("booster-motor-1", 1.3),
      { ...motor("booster-motor-2", 1.3), ignitionFailure: true },
    ],
  };
  const result = simulateStageFlightPreview({
    retainedMassProperties: properties(0.4, 0.2),
    components: components.filter((component) => component.stageId === "booster"),
    stages: [clusterStage],
    regimes: [{ id: "cluster-only", label: "Cluster only", activeStageIds: ["booster"], dragCoefficient: 0.65 }],
    initiallyIgnitedStageIds: ["booster"],
    durationS: 0.5,
    timeStepS: 0.05,
    launchAltitudeM: 0,
  });

  assert.equal(result.clusterDiagnostics.length, 1);
  assert.equal(result.clusterDiagnostics[0].stageId, "booster");
  assert.equal(result.clusterDiagnostics[0].motorCount, 2);
  assert.equal(result.clusterDiagnostics[0].activeMotorCount, 1);
  assert.equal(result.clusterDiagnostics[0].failedMotorCount, 1);
  assert.equal(result.clusterDiagnostics[0].status, "watch");
  assert.equal(result.clusterDiagnostics[0].failedPropellantMassKg, 0.2);
  assert.match(result.clusterDiagnostics[0].note, /partial cluster failure/i);
});

test("stage-flight adapter supports a single-stage coupled 6DOF preview", () => {
  const result = simulateStageFlightPreview({
    retainedMassProperties: properties(0.4, 0.2),
    components: components.filter((component) => component.stageId === "upper"),
    stages: [stages[1]],
    regimes: [regimes[1]],
    initiallyIgnitedStageIds: ["upper"],
    durationS: 2.5,
    timeStepS: 0.05,
    launchAltitudeM: 0,
  });

  assert.equal(result.validationStatus, "mathematical-regression-tests-only");
  assert.ok(result.simulation);
  assert.ok(result.maxAltitudeAglM > 0);
  assert.ok(result.maxSpeedMps > 0);
  assert.ok(result.trace.every((point) => point.attachedStageIds.includes("upper")));
  assert.equal(result.events.length, 0);
  assert.equal(result.separatedBodies.length, 0);
  assert.ok(Number.isFinite(result.convergence.finalPositionDifferenceM));
});

test("stage-flight adapter rejects unknown initial ignition stages", () => {
  assert.throws(
    () => simulateStageFlightPreview({
      retainedMassProperties: properties(0.4, 0.2),
      components,
      stages,
      regimes,
      initiallyIgnitedStageIds: ["missing"],
      durationS: 1,
      timeStepS: 0.05,
    }),
    /unknown stages/,
  );
});

test("stage-flight adapter preserves caller motor-assignment diagnostics", () => {
  const result = simulateStageFlightPreview({
    retainedMassProperties: properties(0.4, 0.2),
    components,
    stages,
    regimes,
    initiallyIgnitedStageIds: ["booster"],
    durationS: 1,
    timeStepS: 0.05,
    additionalWarnings: ["Upper stage motor record unavailable; global fallback used."],
    additionalAssumptions: ["Stage-specific motor data came from a local user library."],
  });
  assert.ok(result.warnings.includes("Upper stage motor record unavailable; global fallback used."));
  assert.ok(result.assumptions.includes("Stage-specific motor data came from a local user library."));
});

test("stage-flight adapter preserves initial discrete failure state", () => {
  const result = simulateStageFlightPreview({
    retainedMassProperties: properties(0.4, 0.2),
    components,
    stages,
    regimes,
    initiallyIgnitedStageIds: ["booster"],
    durationS: 0.5,
    timeStepS: 0.05,
    launchAltitudeM: 0,
    initialState: {
      positionWorldM: { x: 0, y: 0, z: 0 },
      velocityWorldMps: { x: 0, y: 0, z: 0 },
      orientationBodyToWorld: { w: 0.7071067811865476, x: 0, y: 0.7071067811865475, z: 0 },
      angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
      discreteState: { "staging.booster.ignitionFailed": true },
    },
  });

  assert.equal(result.trace[0].thrustN, 0);
  assert.ok(result.trace[0].attachedStageIds.includes("booster"));
});

test("stage-flight adapter preserves staged events across a launch-rail handoff", () => {
  const result = simulateStageFlightPreview({
    retainedMassProperties: properties(0.4, 0.2),
    components,
    stages,
    regimes,
    initiallyIgnitedStageIds: ["booster"],
    durationS: 2.5,
    timeStepS: 0.05,
    launchAltitudeM: 0,
    launchRail: {
      directionWorld: { x: 0, y: 0, z: 1 },
      lengthM: 0.01,
    },
    events: [
      createScheduledStageSeparationEvent({ stageId: "booster", timeS: 0.75 }),
    ],
  });

  assert.ok(result.rail);
  assert.ok(result.rail.events.some((event) => event.type === "rail_exit"));
  assert.ok(result.rail.freeFlight);
  assert.ok(result.rail.appliedEvents.some((event) => event.id === "staging-booster-separation"));
  assert.ok(result.events.some((event) => event.kind === "rail"));
  assert.ok(result.events.some((event) => event.id === "staging-booster-separation"));
  assert.ok(result.trace.some((point) => !point.attachedStageIds.includes("booster")));
  assert.equal(result.separatedBodies.length, 1);
  assert.equal(result.separatedBodies[0].stageId, "booster");
  assert.ok(result.assumptions.some((assumption) => assumption.includes("rail")));
  assert.ok(Number.isFinite(result.convergence.maximumEventTimeDifferenceS));
});
