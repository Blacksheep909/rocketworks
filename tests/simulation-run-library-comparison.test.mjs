import assert from "node:assert/strict";
import test from "node:test";

import {
  SIMULATION_RUN_LIBRARY_COMPARISON_MODEL_VERSION,
  createSimulationRunLibraryComparison,
  createSimulationRunLibraryComparisonCsv,
} from "../lib/project/simulation-run-library-comparison.ts";
import {
  appendLocalSimulationRun,
  createLocalSimulationRunLibrary,
  createStagedSimulationRun,
  createVerticalSimulationRun,
} from "../lib/project/simulation-run-library.ts";

function verticalResult(overrides = {}) {
  return {
    modelVersion: "vertical-comparison-fixture-v1",
    validationStatus: "engineering-preview-unvalidated",
    apogeeM: 120,
    maxSpeedMps: 42,
    maxMach: 0.12,
    maxDynamicPressurePa: 800,
    timeToApogeeS: 8,
    totalFlightTimeS: 32,
    impactSpeedMps: 7,
    thrustToWeightAtIgnition: 3,
    totalImpulseNs: 44,
    events: [],
    warnings: [],
    trace: [],
    assumptions: [],
    ...overrides,
  };
}

function stagedResult(overrides = {}) {
  return {
    modelVersion: "staged-comparison-fixture-v1",
    validationStatus: "engineering-preview-unvalidated",
    maxAltitudeAglM: 900,
    maxSpeedMps: 180,
    timeToApogeeS: 22,
    trace: [
      {
        timeS: 0,
        altitudeAglM: 0,
        speedMps: 0,
        velocityWorldMps: { x: 0, y: 0, z: 0 },
        mach: 0.2,
        angleOfAttackRad: 0,
        sideslipRad: 0,
        dynamicPressurePa: 300,
        dragN: 0,
        centerOfPressureXM: 0.5,
        centerOfMassXM: 0.4,
        staticMarginCalibers: 1,
        normalForceSlopePerRad: 2,
        orientationBodyToWorld: { w: 1, x: 0, y: 0, z: 0 },
        angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
        attitudeTiltRad: 0.1,
        angularRateRadS: 0.4,
        thrustForceWorldN: { x: 0, y: 0, z: 0 },
        aerodynamicForceWorldN: { x: 0, y: 0, z: 0 },
        gravityForceWorldN: { x: 0, y: 0, z: 0 },
        recoveryForceWorldN: { x: 0, y: 0, z: 0 },
        recoveryDragN: 0,
        recoveryEffectiveAreaM2: 0,
        massKg: 1,
        thrustN: 0,
        axialAccelerationMps2: 0,
        attachedStageIds: ["core"],
      },
      {
        timeS: 1,
        altitudeAglM: 100,
        speedMps: 180,
        velocityWorldMps: { x: 0, y: 0, z: 180 },
        mach: 0.6,
        angleOfAttackRad: 0,
        sideslipRad: 0,
        dynamicPressurePa: 900,
        dragN: 2,
        centerOfPressureXM: 0.5,
        centerOfMassXM: 0.4,
        staticMarginCalibers: 1,
        normalForceSlopePerRad: 2,
        orientationBodyToWorld: { w: 1, x: 0, y: 0, z: 0 },
        angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
        attitudeTiltRad: 0.4,
        angularRateRadS: 1.2,
        thrustForceWorldN: { x: 0, y: 0, z: 0 },
        aerodynamicForceWorldN: { x: 0, y: 0, z: 0 },
        gravityForceWorldN: { x: 0, y: 0, z: 0 },
        recoveryForceWorldN: { x: 0, y: 0, z: 0 },
        recoveryDragN: 0,
        recoveryEffectiveAreaM2: 0,
        massKg: 1,
        thrustN: 0,
        axialAccelerationMps2: 0,
        attachedStageIds: ["core"],
      },
    ],
    events: [{ id: "rail", label: "Rail release", kind: "rail", timeS: 1, attachedStageIdsBefore: ["core"], attachedStageIdsAfter: ["core"], detachedStageIds: [], attachedStageInstanceIdsBefore: ["core-instance-1"], attachedStageInstanceIdsAfter: ["core-instance-1"], detachedStageInstanceIds: [], missionKind: "rail", priority: 1 }],
    separatedBodies: [{ id: "booster-1" }],
    massRatio: {},
    missionMassRatio: {},
    forceBudget: {},
    vectorBudget: {},
    missionLossBudget: {},
    missionDeltaVBridge: {},
    separationDynamics: [],
    separationImpulseSolutions: [],
    multiBodySeparation: null,
    separationEnvelope: null,
    separationContact: null,
    separationContactLoad: null,
    relativeAeroInteraction: null,
    coupledMultiBodyFlight: null,
    convergence: {},
    eventAllocation: {},
    warnings: [],
    assumptions: [],
    ...overrides,
  };
}

function library() {
  const verticalA = createVerticalSimulationRun({
    id: "vertical-a",
    label: "Baseline, A",
    projectId: "arc54",
    projectName: "ARC 54",
    fingerprint: "fingerprint-a",
    savedAtIso: "2026-08-21T09:00:00.000Z",
    result: verticalResult(),
  });
  const verticalB = createVerticalSimulationRun({
    id: "vertical-b",
    label: "Wind case",
    projectId: "arc54",
    projectName: "ARC 54",
    fingerprint: "fingerprint-b",
    savedAtIso: "2026-08-21T09:01:00.000Z",
    result: verticalResult({ apogeeM: 95, warnings: [{ code: "watch", severity: "warning", title: "Watch", explanation: "fixture" }] }),
  });
  const staged = createStagedSimulationRun({
    id: "staged-a",
    label: "Separation, staged",
    projectId: "arc54",
    projectName: "ARC 54",
    fingerprint: "fingerprint-c",
    savedAtIso: "2026-08-21T09:02:00.000Z",
    result: stagedResult(),
  });
  return appendLocalSimulationRun(
    appendLocalSimulationRun(
      appendLocalSimulationRun(createLocalSimulationRunLibrary({ projectId: "arc54", projectName: "ARC 54" }), verticalA),
      verticalB,
    ),
    staged,
  );
}

test("run-library comparison keeps vertical and staged groups separate", () => {
  const comparison = createSimulationRunLibraryComparison(library(), ["vertical-a", "vertical-b", "staged-a"]);
  assert.equal(comparison.modelVersion, SIMULATION_RUN_LIBRARY_COMPARISON_MODEL_VERSION);
  assert.deepEqual(comparison.selectedRunIds, ["vertical-a", "vertical-b", "staged-a"]);
  assert.deepEqual(comparison.groups.map((group) => [group.kind, group.runs.map((run) => run.id)]), [
    ["vertical", ["vertical-a", "vertical-b"]],
    ["staged", ["staged-a"]],
  ]);
  assert.equal(comparison.groups[0].metrics.find((metric) => metric.key === "apogeeM").values.join(","), "120,95");
  assert.equal(comparison.groups[1].metrics.find((metric) => metric.key === "maxMach").values[0], 0.6);
  assert.match(comparison.warnings[0], /separate metric groups/);
});

test("run-library comparison is strict and deterministic", () => {
  const source = library();
  assert.throws(() => createSimulationRunLibraryComparison(source, ["vertical-a"]), /at least two/);
  assert.throws(() => createSimulationRunLibraryComparison(source, ["vertical-a", "vertical-a"]), /unique/);
  assert.throws(() => createSimulationRunLibraryComparison(source, ["vertical-a", "missing"]), /not present/);
  const comparison = createSimulationRunLibraryComparison(source, ["vertical-a", "vertical-b"]);
  const first = createSimulationRunLibraryComparisonCsv(comparison);
  const second = createSimulationRunLibraryComparisonCsv(comparison);
  assert.equal(first, second);
  assert.match(first, /record_type,kind,metric_key/);
  assert.match(first, /Baseline, A/);
  assert.match(first, /vertical-a/);
  assert.match(first, /apogeeM,Apogee,m/);
});
