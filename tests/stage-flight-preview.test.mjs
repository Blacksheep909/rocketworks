import assert from "node:assert/strict";
import test from "node:test";
import {
  createScheduledStageIgnitionEvent,
  createScheduledStageSeparationEvent,
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

test("stage-flight adapter couples staging, topology aerodynamics, and 6DOF events", () => {
  const result = simulateStageFlightPreview({
    retainedMassProperties: properties(0.4, 0.2),
    components,
    stages,
    regimes,
    initiallyIgnitedStageIds: ["booster"],
    durationS: 2.5,
    timeStepS: 0.05,
    launchAltitudeM: 0,
    events: [
      createScheduledStageSeparationEvent({ stageId: "booster", timeS: 1 }),
      createScheduledStageIgnitionEvent({ stageId: "upper", timeS: 1 }),
    ],
  });

  assert.equal(result.modelVersion, "kestrel-stage-flight-preview-0.4.1");
  assert.equal(result.validationStatus, "mathematical-regression-tests-only");
  assert.equal(result.events.length, 2);
  assert.deepEqual(result.events[0].attachedStageIdsBefore, ["booster", "upper"]);
  assert.deepEqual(result.events[0].attachedStageIdsAfter, ["upper"]);
  assert.deepEqual(result.events[1].attachedStageIdsAfter, ["upper"]);
  assert.ok(result.maxAltitudeAglM > 0);
  assert.ok(result.maxSpeedMps > 0);
  assert.ok(result.trace.every((point) => Number.isFinite(point.mach) && Number.isFinite(point.angleOfAttackRad) && Number.isFinite(point.sideslipRad) && Number.isFinite(point.dynamicPressurePa) && Number.isFinite(point.dragN)));
  assert.ok(result.trace.some((point) => point.dynamicPressurePa > 0));
  assert.ok(result.trace.some((point) => point.attachedStageIds.includes("booster")));
  assert.ok(result.trace.some((point) => !point.attachedStageIds.includes("booster")));
  assert.ok(["converged", "watch"].includes(result.convergence.status));
  assert.equal(result.convergence.baseTimeStepS, 0.05);
  assert.equal(result.convergence.refinedTimeStepS, 0.025);
  assert.ok(Number.isFinite(result.convergence.maximumRelativeDifference));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("separated bodies")));
  assert.equal(result.separatedBodies.length, 1);
  assert.equal(result.separatedBodies[0].stageId, "booster");
  assert.equal(result.separatedBodies[0].releaseTimeS, 1);
  assert.ok(result.separatedBodies[0].warnings.some((warning) => warning.includes("ballistic")));
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
