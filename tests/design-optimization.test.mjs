import assert from "node:assert/strict";
import test from "node:test";

import {
  DESIGN_OPTIMIZATION_MODEL_VERSION,
  makeConstantThrustCurve,
  optimizeVerticalFlightDesign,
  runDesignOptimization,
} from "../lib/physics/index.ts";

function parabolaOptimization(seed = "parabola-seed") {
  return runDesignOptimization({
    seed,
    populationSize: 24,
    generations: 18,
    variables: [{ key: "x", label: "Coordinate", minimum: 0, maximum: 1, initial: 0.9 }],
    objectives: [{ metricKey: "error", label: "Squared error", direction: "minimize" }],
    constraints: [],
    evaluator: ({ x }) => ({ error: (x - 0.3) ** 2 }),
  });
}

test("seeded optimization is exactly reproducible and converges on a smooth optimum", () => {
  const first = parabolaOptimization();
  const replay = parabolaOptimization();
  const changed = parabolaOptimization("changed-seed");

  assert.deepEqual(first, replay);
  assert.notDeepEqual(first.candidates, changed.candidates);
  assert.equal(first.modelVersion, DESIGN_OPTIMIZATION_MODEL_VERSION);
  assert.equal(first.evaluationCount, 24 * 19);
  const recommended = first.paretoFront.find(
    (candidate) => candidate.id === first.recommendedCandidateId,
  );
  assert.ok(recommended);
  assert.ok(Math.abs(recommended.variables.x - 0.3) < 0.01);
  assert.ok(recommended.metrics.error < 1e-4);
});

test("constraint dominance rejects an objectively attractive infeasible region", () => {
  const result = runDesignOptimization({
    seed: "constraint-seed",
    populationSize: 28,
    generations: 16,
    variables: [{ key: "x", label: "Coordinate", minimum: 0, maximum: 1 }],
    objectives: [{ metricKey: "x", label: "Coordinate", direction: "maximize" }],
    constraints: [{
      metricKey: "x",
      label: "Coordinate cap",
      relation: "less-than-or-equal",
      limit: 0.4,
    }],
    evaluator: ({ x }) => ({ x }),
  });
  const recommended = result.paretoFront.find(
    (candidate) => candidate.id === result.recommendedCandidateId,
  );

  assert.ok(recommended?.feasible);
  assert.ok(recommended.variables.x <= 0.4 + 1e-12);
  assert.ok(recommended.variables.x > 0.38);
  assert.ok(result.candidates.every((candidate) => candidate.feasible));
});

test("multi-objective search retains a diverse Pareto tradeoff set", () => {
  const result = runDesignOptimization({
    seed: "pareto-seed",
    populationSize: 32,
    generations: 12,
    variables: [{ key: "x", label: "Coordinate", minimum: 0, maximum: 1 }],
    objectives: [
      { metricKey: "left", label: "Left distance", direction: "minimize", weight: 2 },
      { metricKey: "right", label: "Right distance", direction: "minimize", weight: 1 },
    ],
    evaluator: ({ x }) => ({ left: x ** 2, right: (1 - x) ** 2 }),
  });

  assert.ok(result.paretoFront.length >= 20);
  assert.ok(Math.min(...result.paretoFront.map((candidate) => candidate.variables.x)) < 0.1);
  assert.ok(Math.max(...result.paretoFront.map((candidate) => candidate.variables.x)) > 0.9);
  assert.ok(result.paretoFront.every((candidate) => candidate.tradeoffScore !== null));
});

test("vertical-flight adapter exposes physical metrics and respects safety constraints", () => {
  const baseConfig = {
    vehicle: {
      dryMassKg: 0.42,
      propellantMassKg: 0.06,
      referenceAreaM2: Math.PI * (0.054 / 2) ** 2,
      dragCoefficient: 0.52,
    },
    motor: { thrustCurve: makeConstantThrustCurve(22, 1.6) },
    recovery: {
      enabled: true,
      dragAreaM2: Math.PI * (0.45 / 2) ** 2,
      dragCoefficient: 0.75,
      deploymentDelayAfterApogeeS: 0,
    },
    environment: { launchAltitudeM: 80 },
    integration: { timeStepS: 0.02, maxTimeS: 180 },
  };
  const result = optimizeVerticalFlightDesign({
    baseConfig,
    seed: "vertical-design-seed",
    populationSize: 16,
    generations: 6,
    variables: [
      { key: "thrustScale", label: "Motor thrust scale", minimum: 0.8, maximum: 1.2, initial: 1 },
      { key: "recoveryDragAreaScale", label: "Recovery area scale", minimum: 0.7, maximum: 1.5, initial: 1 },
    ],
    objectives: [
      { metricKey: "apogeeM", label: "Apogee", direction: "maximize", weight: 2 },
      { metricKey: "impactSpeedMps", label: "Impact speed", direction: "minimize", weight: 1 },
    ],
    constraints: [
      { metricKey: "liftedOff", label: "Liftoff", relation: "greater-than-or-equal", limit: 1 },
      { metricKey: "completedFlight", label: "Completed flight", relation: "greater-than-or-equal", limit: 1 },
      { metricKey: "impactSpeedMps", label: "Impact speed limit", relation: "less-than-or-equal", limit: 15 },
    ],
  });

  assert.ok(result.paretoFront.length > 0);
  assert.ok(result.paretoFront.every((candidate) => candidate.metrics.liftedOff === 1));
  assert.ok(result.paretoFront.every((candidate) => candidate.metrics.completedFlight === 1));
  assert.ok(result.paretoFront.every((candidate) => candidate.metrics.impactSpeedMps <= 15));
  assert.ok(result.paretoFront.every((candidate) => candidate.metrics.apogeeM > 0));
});

test("invalid bounds, search sizes, weights, and evaluator outputs fail explicitly", () => {
  const base = {
    seed: "validation-seed",
    populationSize: 8,
    generations: 1,
    variables: [{ key: "x", label: "X", minimum: 0, maximum: 1 }],
    objectives: [{ metricKey: "score", label: "Score", direction: "minimize" }],
    evaluator: ({ x }) => ({ score: x }),
  };
  assert.throws(() => runDesignOptimization({ ...base, seed: "" }), /seed/);
  assert.throws(() => runDesignOptimization({ ...base, populationSize: 7 }), /population size/);
  assert.throws(() => runDesignOptimization({ ...base, variables: [{ ...base.variables[0], maximum: 0 }] }), /maximum/);
  assert.throws(() => runDesignOptimization({ ...base, objectives: [{ ...base.objectives[0], weight: 0 }] }), /weight/);
  assert.throws(() => runDesignOptimization({ ...base, evaluator: () => ({ other: 1 }) }), /omitted required metric/);
  assert.throws(() => runDesignOptimization({ ...base, evaluator: () => ({ score: Number.NaN }) }), /must be finite/);
});
