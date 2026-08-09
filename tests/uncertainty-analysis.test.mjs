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

function sampleCorrelation(left, right) {
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const leftVariance = left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0);
  const rightVariance = right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0);
  return numerator / Math.sqrt(leftVariance * rightVariance);
}

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

test("opt-in Gaussian-copula correlations preserve marginals and deterministic LHS strata", () => {
  const sampleCount = 256;
  const result = runUncertaintyAnalysis({
    seed: "correlated-inputs",
    sampleCount,
    parameters: [
      { key: "mass", label: "Mass", distribution: { kind: "uniform", minimum: 0.9, maximum: 1.1 } },
      { key: "drag", label: "Drag", distribution: { kind: "uniform", minimum: 0.8, maximum: 1.2 } },
    ],
    correlations: [{ firstParameterKey: "mass", secondParameterKey: "drag", coefficient: 0.8 }],
    evaluator: ({ mass, drag }) => ({ mass, drag }),
  });
  assert.deepEqual(result, runUncertaintyAnalysis({
    seed: "correlated-inputs",
    sampleCount,
    parameters: [
      { key: "mass", label: "Mass", distribution: { kind: "uniform", minimum: 0.9, maximum: 1.1 } },
      { key: "drag", label: "Drag", distribution: { kind: "uniform", minimum: 0.8, maximum: 1.2 } },
    ],
    correlations: [{ firstParameterKey: "mass", secondParameterKey: "drag", coefficient: 0.8 }],
    evaluator: ({ mass, drag }) => ({ mass, drag }),
  }));
  assert.equal(result.correlations[0].coefficient, 0.8);
  assert.deepEqual(
    result.samples.map((sample) => Math.floor(((sample.inputs.mass - 0.9) / 0.2) * sampleCount)).sort((a, b) => a - b),
    Array.from({ length: sampleCount }, (_, index) => index),
  );
  assert.deepEqual(
    result.samples.map((sample) => Math.floor(((sample.inputs.drag - 0.8) / 0.4) * sampleCount)).sort((a, b) => a - b),
    Array.from({ length: sampleCount }, (_, index) => index),
  );
  assert.ok(sampleCorrelation(
    result.samples.map((sample) => sample.inputs.mass),
    result.samples.map((sample) => sample.inputs.drag),
  ) > 0.65);
  assert.ok(result.warnings.some((warning) => warning.includes("Gaussian copula")));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("preserving each declared marginal")));
});

test("inverse distributions recover central values", () => {
  close(inverseDistribution({ kind: "uniform", minimum: 2, maximum: 6 }, 0.5), 4, 1e-12, "uniform median");
  close(inverseDistribution({ kind: "triangular", minimum: 0, mode: 5, maximum: 10 }, 0.5), 5, 1e-12, "triangular median");
  assert.equal(inverseDistribution({ kind: "bernoulli", successProbability: 0.5 }, 0.25), 1);
  assert.equal(inverseDistribution({ kind: "bernoulli", successProbability: 0.5 }, 0.75), 0);
  close(inverseDistribution({ kind: "normal", mean: 8, standardDeviation: 2 }, 0.5), 8, 1e-7, "normal median");
});

test("Bernoulli sampling preserves a deterministic deployment outcome rate", () => {
  const result = runUncertaintyAnalysis({
    seed: "bernoulli-recovery",
    sampleCount: 20,
    parameters: [{
      key: "deploymentSuccess",
      label: "Deployment success",
      distribution: { kind: "bernoulli", successProbability: 0.7 },
    }],
    evaluator: ({ deploymentSuccess }) => ({ deploymentSuccess }),
  });
  assert.equal(result.failedSampleCount, 0);
  assert.equal(result.metrics.deploymentSuccess.count, 20);
  assert.equal(result.samples.filter((sample) => sample.inputs.deploymentSuccess === 1).length, 14);
  assert.equal(result.samples.filter((sample) => sample.inputs.deploymentSuccess === 0).length, 6);
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

test("convergence diagnostics expose deterministic split-sample quantile stability", () => {
  const result = runUncertaintyAnalysis({
    seed: "convergence-stable",
    sampleCount: 32,
    parameters: [parameters[0]],
    evaluator: () => ({ response: 10 }),
  });
  assert.equal(result.convergence.method, "contiguous-halves");
  assert.equal(result.convergence.status, "converged");
  assert.equal(result.convergence.successfulSampleCount, 32);
  assert.equal(result.convergence.lowerHalfSampleCount, 16);
  assert.equal(result.convergence.upperHalfSampleCount, 16);
  assert.equal(result.convergence.metrics.response.maximumRelativeQuantileShift, 0);
  assert.equal(result.convergence.maximumRelativeQuantileShift, 0);
  assert.ok(result.convergence.assumptions.some((assumption) => assumption.includes("contiguous halves")));
});

test("convergence diagnostics flag small ensembles and threshold-rate uncertainty", () => {
  const result = runUncertaintyAnalysis({
    seed: "convergence-watch",
    sampleCount: 12,
    parameters: [parameters[0]],
    evaluator: (_inputs, index) => ({ response: index }),
    thresholds: [{ id: "high", metric: "response", comparison: "greater-than-or-equal", value: 6 }],
  });
  assert.equal(result.convergence.status, "insufficient-data");
  assert.equal(result.convergence.thresholds.length, 1);
  assert.equal(result.convergence.thresholds[0].lowerHalfValidSampleCount, 6);
  assert.equal(result.convergence.thresholds[0].upperHalfValidSampleCount, 6);
  assert.equal(result.convergence.thresholds[0].status, "insufficient-data");
  assert.ok(result.convergence.thresholds[0].wilson95Width > 0);
  assert.ok(result.convergence.warnings.some((warning) => warning.includes("32 successful samples")));
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

test("vertical uncertainty models recovery deployment outcomes and bounded delay offsets", () => {
  const result = analyzeVerticalFlightUncertainty({
    baseConfig: {
      vehicle: { dryMassKg: 0.42, propellantMassKg: 0.06, referenceAreaM2: 0.0023, dragCoefficient: 0.52 },
      motor: { thrustCurve: makeConstantThrustCurve(22, 1.6) },
      recovery: { enabled: true, dragAreaM2: 0.15, dragCoefficient: 0.75, deploymentDelayAfterApogeeS: 0.2 },
      environment: { launchAltitudeM: 80 },
      integration: { timeStepS: 0.02, maxTimeS: 180 },
    },
    seed: "vertical-recovery-outcomes",
    sampleCount: 32,
    factors: [
      { key: "recoveryDeploymentSuccess", label: "Recovery deployment", distribution: { kind: "bernoulli", successProbability: 0.75 } },
      { key: "recoveryDelayS", label: "Recovery delay offset", distribution: { kind: "normal", mean: 0, standardDeviation: 0.18, minimum: -0.3, maximum: 0.5 } },
    ],
    thresholds: [{ id: "recovery-deployed", metric: "recoveryDeployed", comparison: "greater-than-or-equal", value: 1 }],
  });
  assert.equal(result.failedSampleCount, 0);
  assert.equal(result.metrics.recoveryDeployed.count, 32);
  assert.equal(result.thresholds[0].validSampleCount, 32);
  assert.ok(result.thresholds[0].probability > 0.5 && result.thresholds[0].probability < 1);
  assert.ok(result.samples.some((sample) => sample.inputs.recoveryDeploymentSuccess === 0));
  assert.ok(result.samples.some((sample) => sample.inputs.recoveryDeploymentSuccess === 1));
  assert.equal(result.modelVersion, "kestrel-uncertainty-0.4.0");
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
  assert.throws(() => runUncertaintyAnalysis({
    seed: "invalid-bernoulli",
    sampleCount: 4,
    parameters: [{ key: "deployment", label: "Bad", distribution: { kind: "bernoulli", successProbability: 1.1 } }],
    evaluator: () => ({ response: 1 }),
  }), /success probability must be between/);
  assert.throws(() => runUncertaintyAnalysis({
    seed: "invalid-correlation",
    sampleCount: 4,
    parameters,
    correlations: [{ firstParameterKey: "x", secondParameterKey: "missing", coefficient: 0.2 }],
    evaluator: () => ({ response: 1 }),
  }), /unknown parameter/);
  assert.throws(() => runUncertaintyAnalysis({
    seed: "invalid-correlation-self",
    sampleCount: 4,
    parameters,
    correlations: [{ firstParameterKey: "x", secondParameterKey: "x", coefficient: 0.2 }],
    evaluator: () => ({ response: 1 }),
  }), /itself/);
  assert.throws(() => runUncertaintyAnalysis({
    seed: "invalid-correlation-matrix",
    sampleCount: 4,
    parameters: [
      ...parameters,
      { key: "z", label: "Input Z", distribution: { kind: "uniform", minimum: 0, maximum: 1 } },
    ],
    correlations: [
      { firstParameterKey: "x", secondParameterKey: "y", coefficient: 0.9 },
      { firstParameterKey: "x", secondParameterKey: "z", coefficient: 0.9 },
      { firstParameterKey: "y", secondParameterKey: "z", coefficient: -0.9 },
    ],
    evaluator: () => ({ response: 1 }),
  }), /positive-definite/);
});
