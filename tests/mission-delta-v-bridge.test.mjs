import assert from "node:assert/strict";
import test from "node:test";
import {
  computeMissionDeltaVBridge,
} from "../lib/physics/index.ts";

function missionMassRatio(overrides = {}) {
  return {
    modelVersion: "rocketworks-mission-mass-ratio-0.1.0",
    validationStatus: "analytical-serial-stack-preview",
    overallStatus: "assessed",
    retainedPayloadMassKg: 0.4,
    excludedStageIds: [],
    stages: [{ stageId: "upper", stageName: "Upper", sequenceIndex: 0 }],
    assessedStageCount: 1,
    totalIdealDeltaVMps: 100,
    assumptions: [],
    warnings: [],
    ...overrides,
  };
}

function lossBudget(overrides = {}) {
  return {
    modelVersion: "rocketworks-mission-loss-budget-0.1.0",
    validationStatus: "analytical-thrust-axis-projection",
    status: "assessed",
    sampleCount: 10,
    eventCount: 0,
    timeSpanS: 5,
    thrustAxisSampleCount: 10,
    thrustAxisCoverageS: 5,
    thrustAxisCoverageFraction: 1,
    thrustImpulseEquivalentMps: 80,
    netThrustDeltaVWorldMps: { x: 0, y: 0, z: 60 },
    netThrustDeltaVMagnitudeMps: 60,
    steeringDispersionMps: 20,
    gravity: null,
    aerodynamic: null,
    recovery: null,
    discreteEvents: null,
    projectedEventCount: 0,
    unprojectedEventCount: 0,
    observedVelocityChangeWorldMps: { x: 0, y: 0, z: 58 },
    assumptions: [],
    warnings: [],
    ...overrides,
  };
}

test("mission delta-v bridge compares ideal composition and trace metrics", () => {
  const result = computeMissionDeltaVBridge({
    missionMassRatio: missionMassRatio(),
    missionLossBudget: lossBudget(),
  });

  assert.equal(result.modelVersion, "rocketworks-mission-delta-v-bridge-0.1.0");
  assert.equal(result.status, "assessed");
  assert.equal(result.idealSerialStackDeltaVMps, 100);
  assert.equal(result.traceThrustImpulseEquivalentMps, 80);
  assert.equal(result.traceNetThrustDeltaVMagnitudeMps, 60);
  assert.equal(result.idealToTraceGapMps, 20);
  assert.equal(result.idealToNetThrustGapMps, 40);
  assert.equal(result.traceToIdealFraction, 0.8);
  assert.equal(result.netThrustToIdealFraction, 0.6);
  assert.equal(result.serialStageCount, 1);
  assert.equal(result.excludedStageCount, 0);
});

test("mission delta-v bridge remains partial when topology or coverage is incomplete", () => {
  const result = computeMissionDeltaVBridge({
    missionMassRatio: missionMassRatio({
      overallStatus: "review",
      excludedStageIds: ["booster"],
    }),
    missionLossBudget: lossBudget({
      status: "partial",
      thrustAxisCoverageFraction: 0.75,
    }),
  });

  assert.equal(result.status, "partial");
  assert.equal(result.excludedStageCount, 1);
  assert.equal(result.thrustAxisCoverageFraction, 0.75);
  assert.ok(result.warnings.some((warning) => warning.includes("excluded")));
  assert.ok(result.warnings.some((warning) => warning.includes("coverage status is partial")));
});

test("mission delta-v bridge does not invent a normalized ratio without an ideal value", () => {
  const result = computeMissionDeltaVBridge({
    missionMassRatio: missionMassRatio({
      overallStatus: "not-assessed",
      totalIdealDeltaVMps: null,
    }),
    missionLossBudget: lossBudget(),
  });

  assert.equal(result.status, "not-assessed");
  assert.equal(result.idealToTraceGapMps, null);
  assert.equal(result.traceToIdealFraction, null);
  assert.ok(result.warnings.some((warning) => warning.includes("unavailable")));
});

test("mission delta-v bridge rejects negative source metrics", () => {
  assert.throws(
    () => computeMissionDeltaVBridge({
      missionMassRatio: missionMassRatio({ totalIdealDeltaVMps: -1 }),
      missionLossBudget: lossBudget(),
    }),
    /ideal serial-stack delta-v cannot be negative/,
  );
});
