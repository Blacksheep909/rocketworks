import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeVerticalFlightUncertainty,
  inverseDistribution,
  makeConstantThrustCurve,
  runParameterSweep,
  runUncertaintyAnalysis,
} from "../lib/physics/index.ts";

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, received ${actual}`);
}

const parameters = [
  { key: "x", label: "Input X", distribution: { kind: "uniform", minimum: 0, maximum: 1 } },
  { key: "y", label: "Input Y", distribution: { kind: "triangular", minimum: -1, mode: 0, maximum: 1 } },
];

test("seeded Latin-hypercube analysis is exactly reproducible", () => {
  const config = {
    seed: "repeatable-seed",
    sampleCount: 32,
    parameters,
    evaluator: ({ x, y }) => ({ response: 3 * x - y }),
  };
  assert.deepEqual(runUncertaintyAnalysis(config), runUncertaintyAnalysis(config));
});

test("changing the seed changes generated samples", () => {
  const evaluate = (seed) => runUncertaintyAnalysis({
    seed,
    sampleCount: 12,
    parameters,
    evaluator: ({ x }) => ({ response: x }),
  });
  assert.notDeepEqual(evaluate("seed-a").samples, evaluate("seed-b").samples);
});

test("Latin hypercube occupies every equal-probability stratum", () => {
  const sampleCount = 20;
  const result = runUncertaintyAnalysis({
    seed: "strata",
    sampleCount,
    parameters: [parameters[0]],
    evaluator: ({ x }) => ({ response: x }),
  });
  const strata = result.samples.map((sample) => Math.floor(sample.inputs.x * sampleCount)).sort((a, b) => a - b);
  assert.deepEqual(strata, Array.from({ length: sampleCount }, (_, index) => index));
});

test("inverse distributions recover central values", () => {
  close(inverseDistribution({ kind: "uniform", minimum: 2, maximum: 6 }, 0.5), 4, 1e-12, "uniform median");
  close(inverseDistribution({ kind: "triangular", minimum: 0, mode: 5, maximum: 10 }, 0.5), 5, 1e-12, "triangular median");
  close(inverseDistribution({ kind: "normal", mean: 8, standardDeviation: 2 }, 0.5), 8, 1e-7, "normal median");
});

test("summaries use sample standard deviation and interpolated quantiles", () => {
  const result = runUncertaintyAnalysis({
    seed: "summary",
    method: "monte-carlo",
    sampleCount: 4,
    parameters: [parameters[0]],
    evaluator: (_inputs, index) => ({ response: index + 1 }),
  });
  const summary = result.metrics.response;
  close(summary.mean, 2.5, 1e-12, "mean");
  close(summary.sampleStandardDeviation, Math.sqrt(5 / 3), 1e-12, "sample standard deviation");
  close(summary.p50, 2.5, 1e-12, "median");
  close(summary.p05, 1.15, 1e-12, "p05");
  close(summary.p95, 3.85, 1e-12, "p95");
});

test("failed and missing outputs remain explicit", () => {
  const result = runUncertaintyAnalysis({
    seed: "failures",
    sampleCount: 6,
    parameters: [parameters[0]],
    evaluator: (_inputs, index) => {
      if (index === 2) throw new Error("synthetic failure");
      return { optional: index === 3 ? null : index };
    },
  });
  assert.equal(result.failedSampleCount, 1);
  assert.match(result.samples[2].error, /synthetic failure/);
  assert.equal(result.metrics.optional.count, 4);
  assert.equal(result.metrics.optional.missingCount, 1);
});

test("threshold probability includes a bounded Wilson interval", () => {
  const result = runUncertaintyAnalysis({
    seed: "threshold",
    sampleCount: 10,
    parameters: [parameters[0]],
    evaluator: (_inputs, index) => ({ response: index }),
    thresholds: [{ id: "high", metric: "response", comparison: "greater-than-or-equal", value: 5 }],
  });
  assert.equal(result.thresholds[0].probability, 0.5);
  assert.ok(result.thresholds[0].wilson95.lower < 0.5);
  assert.ok(result.thresholds[0].wilson95.upper > 0.5);
  assert.ok(result.thresholds[0].wilson95.lower >= 0 && result.thresholds[0].wilson95.upper <= 1);
});

test("Spearman sensitivity detects monotonic direction and ranks magnitude", () => {
  const result = runUncertaintyAnalysis({
    seed: "sensitivity",
    sampleCount: 128,
    parameters,
    evaluator: ({ x, y }) => ({ positive: x, negative: -x + 0.01 * y }),
  });
  assert.equal(result.sensitivityByMetric.positive[0].parameterKey, "x");
  close(result.sensitivityByMetric.positive[0].spearmanRho, 1, 1e-12, "positive rho");
  assert.ok(result.sensitivityByMetric.negative[0].spearmanRho < -0.99);
});

test("parameter sweep includes both endpoints", () => {
  const sweep = runParameterSweep({
    parameterKey: "drag",
    minimum: 0.4,
    maximum: 0.8,
    steps: 5,
    evaluator: ({ drag }) => ({ doubled: drag * 2 }),
  });
  assert.deepEqual(sweep.values, [0.4, 0.5, 0.6000000000000001, 0.7000000000000001, 0.8]);
  close(sweep.samples[4].outputs.doubled, 1.6, 1e-12, "sweep endpoint");
});

test("vertical-flight adapter propagates physical inputs into flight metrics", () => {
  const result = analyzeVerticalFlightUncertainty({
    baseConfig: {
      vehicle: { dryMassKg: 0.5, propellantMassKg: 0.05, referenceAreaM2: 0.0023, dragCoefficient: 0.5 },
      motor: { thrustCurve: makeConstantThrustCurve(22, 1.5) },
      recovery: { enabled: true, dragAreaM2: 0.15, dragCoefficient: 0.75, deploymentDelayAfterApogeeS: 0 },
      integration: { timeStepS: 0.04, maxTimeS: 100 },
    },
    seed: "vertical-adapter",
    sampleCount: 24,
    factors: [
      { key: "dryMassScale", label: "Dry mass", distribution: { kind: "uniform", minimum: 0.95, maximum: 1.05 } },
      { key: "thrustScale", label: "Thrust", distribution: { kind: "uniform", minimum: 0.9, maximum: 1.1 } },
    ],
  });
  assert.equal(result.failedSampleCount, 0);
  assert.equal(result.metrics.apogeeM.count, 24);
  assert.ok(result.metrics.apogeeM.p95 > result.metrics.apogeeM.p05);
  assert.ok(result.sensitivityByMetric.apogeeM.some((item) => item.parameterKey === "thrustScale" && item.spearmanRho > 0));
  assert.match(result.assumptions.at(-1), /not validation, certification/);
});

test("invalid distributions and unsafe sample counts are rejected", () => {
  assert.throws(() => runUncertaintyAnalysis({
    seed: "invalid",
    sampleCount: 1,
    parameters,
    evaluator: () => ({ response: 1 }),
  }), /Sample count/);
  assert.throws(() => runUncertaintyAnalysis({
    seed: "invalid",
    sampleCount: 4,
    parameters: [{ key: "x", label: "Bad", distribution: { kind: "uniform", minimum: 2, maximum: 1 } }],
    evaluator: () => ({ response: 1 }),
  }), /maximum must exceed/);
});
