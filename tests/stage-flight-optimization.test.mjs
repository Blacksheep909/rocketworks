import assert from "node:assert/strict";
import test from "node:test";

import {
  STAGE_FLIGHT_OPTIMIZATION_ADAPTER_VERSION,
  STAGE_FLIGHT_PREVIEW_MODEL_VERSION,
  optimizeStageFlightDesign,
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
      motors: [
        {
          id: "core-motor",
          name: "Core motor",
          thrustCurve,
          dryMassProperties: properties(0.1, 0.4),
          initialPropellantMassProperties: properties(0.2, 0.4),
          thrustApplicationPointBodyM: { x: 0.4, y: 0, z: 0 },
        },
      ],
    },
  ],
  regimes: [
    {
      id: "core",
      label: "Core",
      activeStageIds: ["core"],
      dragCoefficient: 0.6,
    },
  ],
  initiallyIgnitedStageIds: ["core"],
  durationS: 2.5,
  timeStepS: 0.05,
};

function nominalInput(overrides = {}) {
  return {
    baseInput,
    seed: "stage-optimizer-seed",
    populationSize: 8,
    generations: 1,
    variables: [
      {
        key: "thrustScale",
        label: "Delivered thrust",
        minimum: 0.85,
        maximum: 1.15,
        initial: 1,
      },
    ],
    objectives: [
      {
        metricKey: "maxAltitudeAglM",
        label: "Peak altitude",
        direction: "maximize",
      },
    ],
    constraints: [
      {
        metricKey: "converged",
        label: "Numerical convergence",
        relation: "greater-than-or-equal",
        limit: 0,
      },
    ],
    ...overrides,
  };
}

test("staged optimizer is deterministic and exposes nominal candidate metrics", () => {
  const first = optimizeStageFlightDesign(nominalInput());
  const replay = optimizeStageFlightDesign(nominalInput());

  assert.deepEqual(first, replay);
  assert.equal(first.adapterVersion, STAGE_FLIGHT_OPTIMIZATION_ADAPTER_VERSION);
  assert.equal(first.modelVersion, STAGE_FLIGHT_PREVIEW_MODEL_VERSION);
  assert.equal(first.robustness, null);
  assert.equal(first.result.evaluationCount, 16);
  assert.ok(first.result.paretoFront.length > 0);
  assert.ok(first.result.paretoFront.every((candidate) => Number.isFinite(candidate.metrics.maxAltitudeAglM)));
  assert.ok(first.assumptions.some((assumption) => assumption.includes("global optimum")));
  assert.ok(first.warnings.some((warning) => warning.includes("flight-safety")));
});

test("staged optimizer ranks finite-sample robust metrics", () => {
  const result = optimizeStageFlightDesign(nominalInput({
    seed: "stage-robust-optimizer-seed",
    objectives: [
      {
        metricKey: "robustMaxAltitudeP05M",
        label: "Robust altitude floor",
        direction: "maximize",
      },
      {
        metricKey: "robustMaxDynamicPressureP95Pa",
        label: "Robust peak q",
        direction: "minimize",
      },
    ],
    constraints: [
      {
        metricKey: "robustFailureRate",
        label: "Scenario failure rate",
        relation: "less-than-or-equal",
        limit: 0.5,
      },
    ],
    robustness: {
      sampleCount: 8,
      seed: "stage-scenarios",
      factors: [
        {
          key: "thrustScale",
          label: "Delivered thrust",
          distribution: { kind: "uniform", minimum: 0.95, maximum: 1.05 },
        },
      ],
    },
  }));

  assert.equal(result.robustness?.sampleCount, 8);
  assert.ok(result.result.paretoFront.length > 0);
  assert.ok(result.result.paretoFront.every((candidate) =>
    Number.isFinite(candidate.metrics.robustMaxAltitudeP05M) &&
    Number.isFinite(candidate.metrics.robustMaxDynamicPressureP95Pa) &&
    candidate.metrics.robustFailureRate <= 0.5,
  ));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("8 seeded uncertainty scenarios")));
});

test("staged optimizer rejects unsupported and unbounded variables", () => {
  assert.throws(
    () => optimizeStageFlightDesign(nominalInput({
      variables: [{ key: "unknown-factor", label: "Unknown", minimum: 0, maximum: 1 }],
    })),
    /not supported/,
  );
  assert.throws(
    () => optimizeStageFlightDesign(nominalInput({
      variables: [{ key: "thrustScale", label: "Thrust", minimum: 0.5, maximum: 1.1 }],
    })),
    /must remain between 0.75 and 1.3/,
  );
  assert.throws(
    () => optimizeStageFlightDesign(nominalInput({
      robustness: { sampleCount: 4, seed: "too-small", factors: [{ key: "thrustScale", label: "Thrust", distribution: { kind: "uniform", minimum: 0.9, maximum: 1.1 } }] },
    })),
    /sample count/,
  );
});
