import assert from "node:assert/strict";
import test from "node:test";

import {
  RELATIVE_AERO_CALIBRATION_ADAPTER_VERSION,
  RELATIVE_AERO_INTERACTION_MODEL_VERSION,
  analyzeRelativeAeroInteraction,
  calibrateRelativeAeroInteraction,
  createRelativeAeroCalibrationCsv,
  parseRelativeAeroCalibrationCsv,
} from "../lib/physics/index.ts";

const environmentAt = () => ({
  windWorldMps: { x: 0, y: 0, z: 0 },
  atmosphere: { densityKgM3: 1.2 },
});

const sourceTrace = [
  { timeS: 0, positionWorldM: { x: 0, y: 0, z: 100 }, velocityWorldMps: { x: 50, y: 0, z: 0 } },
  { timeS: 1, positionWorldM: { x: 10, y: 0, z: 100 }, velocityWorldMps: { x: 50, y: 0, z: 0 } },
];

const bodies = [
  {
    id: "source",
    releaseTimeS: 0,
    referenceAreaM2: Math.PI / 4,
    envelopeRadiusM: 0.5,
    trace: sourceTrace,
  },
  {
    id: "target",
    releaseTimeS: 0,
    referenceAreaM2: Math.PI / 4,
    envelopeRadiusM: 0.5,
    trace: [
      { timeS: 0, positionWorldM: { x: 5, y: 0, z: 100 }, velocityWorldMps: { x: 50, y: 0, z: 0 } },
      { timeS: 1, positionWorldM: { x: 30, y: 0, z: 100 }, velocityWorldMps: { x: 50, y: 0, z: 0 } },
    ],
  },
];

const options = {
  enabled: true,
  wakeHalfAngleDeg: 8,
  wakeRecoveryDistanceBodyDiameters: 30,
  peakVelocityDeficitFraction: 0.5,
  maximumVelocityDeficitFraction: 0.7,
};

const nominal = analyzeRelativeAeroInteraction({ bodies, environmentAt, options });
const nominalPair = nominal.pairs.find((pair) => pair.sourceBodyId === "source" && pair.targetBodyId === "target");
assert.ok(nominalPair);

function calibrationInput(overrides = {}) {
  return {
    bodies,
    environmentAt,
    options,
    evidence: {
      sourceName: "wake-tunnel-fixture.csv",
      observations: [{
        sourceBodyId: "source",
        targetBodyId: "target",
        exposureCoverageFraction: nominalPair.exposureCoverageFraction,
        peakVelocityDeficitFraction: nominalPair.peakVelocityDeficitFraction,
        maximumEstimatedDynamicPressureDeltaPa: nominalPair.maximumEstimatedDynamicPressureDeltaPa,
        exposureCoverageUncertainty: 0.05,
        peakVelocityDeficitUncertainty: 0.05,
        dynamicPressureDeltaUncertainty: 50,
      }],
    },
    seed: "relative-aero-calibration-seed",
    populationSize: 8,
    generations: 1,
    variables: [
      { key: "wakeHalfAngleDeg", label: "Wake half-angle", minimum: 4, maximum: 12, initial: 8 },
      { key: "wakeRecoveryDistanceBodyDiameters", label: "Wake recovery distance", minimum: 20, maximum: 40, initial: 30 },
      { key: "peakVelocityDeficitFraction", label: "Peak deficit", minimum: 0.4, maximum: 0.6, initial: 0.5 },
      { key: "maximumVelocityDeficitFraction", label: "Maximum deficit", minimum: 0.7, maximum: 0.8, initial: 0.7 },
    ],
    objectives: [
      { metricKey: "weightedResidualRmse", label: "Weighted residual RMSE", direction: "minimize" },
      { metricKey: "peakVelocityDeficitRmse", label: "Peak deficit RMSE", direction: "minimize" },
    ],
    constraints: [
      { metricKey: "matchedObservationFraction", label: "Evidence coverage", relation: "greater-than-or-equal", limit: 1 },
      { metricKey: "simulationFailure", label: "Simulation failures", relation: "less-than-or-equal", limit: 0 },
    ],
    ...overrides,
  };
}

test("relative-flow calibration is deterministic and keeps pair metrics visible", () => {
  const first = calibrateRelativeAeroInteraction(calibrationInput());
  const replay = calibrateRelativeAeroInteraction(calibrationInput());

  assert.deepEqual(first, replay);
  assert.equal(first.adapterVersion, RELATIVE_AERO_CALIBRATION_ADAPTER_VERSION);
  assert.equal(first.modelVersion, RELATIVE_AERO_INTERACTION_MODEL_VERSION);
  assert.equal(first.sourceName, "wake-tunnel-fixture.csv");
  assert.equal(first.observationCount, 1);
  assert.equal(first.result.evaluationCount, 16);
  assert.ok(first.result.paretoFront.length > 0);
  assert.ok(first.result.paretoFront.every((candidate) => candidate.feasible));
  assert.ok(first.result.paretoFront.every((candidate) => Number.isFinite(candidate.metrics.weightedResidualRmse)));
  assert.ok(first.assumptions.some((assumption) => assumption.includes("directed source")));
  assert.ok(first.warnings.some((warning) => warning.includes("force")));
});

test("relative-flow evidence CSV parses strict pair metrics and exports Pareto rows", () => {
  const csv = [
    "source_body_id,target_body_id,exposure_coverage_fraction,peak_velocity_deficit_fraction,dynamic_pressure_delta_pa,exposure_sigma,peak_deficit_sigma,q_delta_sigma_pa",
    "source,target,1,0.4166666667,989.5833,0.05,0.05,50",
  ].join("\n");
  const evidence = parseRelativeAeroCalibrationCsv(csv, "fixture.csv");
  assert.equal(evidence.sourceName, "fixture.csv");
  assert.equal(evidence.observations[0].sourceBodyId, "source");
  assert.equal(evidence.observations[0].maximumEstimatedDynamicPressureDeltaPa, 989.5833);

  const result = calibrateRelativeAeroInteraction(calibrationInput({ evidence }));
  const exported = createRelativeAeroCalibrationCsv(result);
  assert.match(exported, /# adapter_version,rocketworks-relative-aero-calibration-0\.1\.0/);
  assert.match(exported, /candidate_id,evaluation_index,feasible/);
  assert.match(exported, /wake_half_angle_deg/);
});

test("relative-flow calibration rejects malformed evidence and unsafe bounds", () => {
  assert.throws(
    () => parseRelativeAeroCalibrationCsv("source_body_id,target_body_id\nsource,target\n"),
    /at least one supported measured metric/,
  );
  assert.throws(
    () => calibrateRelativeAeroInteraction(calibrationInput({
      evidence: {
        sourceName: "duplicate.csv",
        observations: [
          { sourceBodyId: "source", targetBodyId: "target", exposureCoverageFraction: 0.5 },
          { sourceBodyId: "source", targetBodyId: "target", exposureCoverageFraction: 0.5 },
        ],
      },
    })),
    /duplicate pair/,
  );
  assert.throws(
    () => calibrateRelativeAeroInteraction(calibrationInput({
      variables: [{ key: "wakeHalfAngleDeg", label: "Angle", minimum: 0, maximum: 46 }],
    })),
    /must remain between 0 and 45/,
  );
  assert.throws(
    () => calibrateRelativeAeroInteraction(calibrationInput({
      evidence: { sourceName: "bad.csv", observations: [{ sourceBodyId: "source", targetBodyId: "target", peakVelocityDeficitFraction: 1 }] },
    })),
    /from 0 through less than 1/,
  );
});
