import assert from "node:assert/strict";
import test from "node:test";

import {
  STAGE_FLIGHT_CALIBRATION_ADAPTER_VERSION,
  STAGE_FLIGHT_PREVIEW_MODEL_VERSION,
  calibrateStageFlightToData,
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

const baseInput = {
  retainedMassProperties: properties(0.4, 0.2),
  components: [
    {
      id: "stage-body",
      name: "Stage body",
      stageId: "core",
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
      id: "stage-fins",
      name: "Stage fins",
      stageId: "core",
      kind: "finSet",
      count: 3,
      axialPositionM: 0.55,
      bodyRadiusM: 0.03,
      rootChordM: 0.16,
      tipChordM: 0.07,
      sweepM: 0.04,
      spanM: 0.07,
      thicknessM: 0.002,
      densityKgM3: 600,
    },
  ],
  stages: [
    {
      id: "core",
      name: "Core",
      structuralMassProperties: properties(0.5, 0.4),
      motors: [{
        id: "core-motor",
        name: "Core motor",
        thrustCurve: [
          { timeS: 0, thrustN: 0 },
          { timeS: 1, thrustN: 30 },
          { timeS: 2, thrustN: 0 },
        ],
        dryMassProperties: properties(0.1, 0.4),
        initialPropellantMassProperties: properties(0.2, 0.4),
        thrustApplicationPointBodyM: { x: 0.4, y: 0, z: 0 },
      }],
    },
  ],
  regimes: [{ id: "core", label: "Core", activeStageIds: ["core"], dragCoefficient: 0.6 }],
  initiallyIgnitedStageIds: ["core"],
  durationS: 2.5,
  timeStepS: 0.05,
};

const nominal = simulateStageFlightPreview(baseInput);
const measuredSeries = {
  sourceName: "synthetic measured flight",
  samples: nominal.trace
    .filter((_, index) => index % 8 === 0)
    .map((point) => ({
      timeS: point.timeS,
      altitudeM: point.altitudeAglM,
      velocityMps: point.speedMps,
      altitudeUncertaintyM: 0.5,
      velocityUncertaintyMps: 0.2,
    })),
};

function calibrationInput(overrides = {}) {
  return {
    baseInput,
    series: measuredSeries,
    seed: "stage-calibration-seed",
    populationSize: 8,
    generations: 1,
    variables: [
      { key: "thrustScale", label: "Delivered thrust", minimum: 0.85, maximum: 1.15, initial: 1 },
      { key: "dragCoefficientScale", label: "Drag coefficient", minimum: 0.9, maximum: 1.1, initial: 1 },
    ],
    objectives: [
      { metricKey: "weightedResidualRmse", label: "Weighted residual RMSE", direction: "minimize" },
      { metricKey: "altitudeRmseM", label: "Altitude RMSE", direction: "minimize" },
    ],
    constraints: [
      { metricKey: "matchedSampleFraction", label: "Measured coverage", relation: "greater-than-or-equal", limit: 0.8 },
      { metricKey: "simulationFailure", label: "Simulation failures", relation: "less-than-or-equal", limit: 0 },
    ],
    ...overrides,
  };
}

test("staged telemetry calibration is deterministic and keeps residual metrics visible", () => {
  const first = calibrateStageFlightToData(calibrationInput());
  const replay = calibrateStageFlightToData(calibrationInput());

  assert.deepEqual(first, replay);
  assert.equal(first.adapterVersion, STAGE_FLIGHT_CALIBRATION_ADAPTER_VERSION);
  assert.equal(first.modelVersion, STAGE_FLIGHT_PREVIEW_MODEL_VERSION);
  assert.equal(first.sourceName, "synthetic measured flight");
  assert.equal(first.result.evaluationCount, 16);
  assert.ok(first.result.paretoFront.length > 0);
  assert.ok(first.result.paretoFront.every((candidate) => candidate.feasible));
  assert.ok(first.result.paretoFront.every((candidate) => Number.isFinite(candidate.metrics.weightedResidualRmse)));
  assert.ok(first.assumptions.some((assumption) => assumption.includes("one-sigma")));
  assert.ok(first.warnings.some((warning) => warning.includes("model validity")));
});

test("staged telemetry calibration validates offset and declared bounds", () => {
  assert.throws(
    () => calibrateStageFlightToData(calibrationInput({ timeOffsetS: 601 })),
    /time offset must be finite and between -600 and 600/,
  );
  assert.throws(
    () => calibrateStageFlightToData(calibrationInput({
      variables: [{ key: "thrustScale", label: "Thrust", minimum: 0.5, maximum: 1.1 }],
    })),
    /must remain between 0.75 and 1.3/,
  );
  assert.throws(
    () => calibrateStageFlightToData(calibrationInput({ series: { sourceName: "empty", samples: [] } })),
    /requires at least two measured samples/,
  );
});
