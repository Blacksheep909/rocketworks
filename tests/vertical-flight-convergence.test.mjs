import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeVerticalFlightConvergence,
  makeConstantThrustCurve,
  simulateVerticalFlight,
} from "../lib/physics/index.ts";

const baseConfig = {
  vehicle: {
    dryMassKg: 0.42,
    propellantMassKg: 0.08,
    referenceAreaM2: Math.PI * 0.027 ** 2,
    dragCoefficient: 0.52,
  },
  motor: { thrustCurve: makeConstantThrustCurve(24, 1.6) },
  recovery: {
    enabled: true,
    dragAreaM2: Math.PI * 0.22 ** 2,
    dragCoefficient: 0.75,
    deploymentDelayAfterApogeeS: 0.4,
  },
  environment: {
    launchAltitudeM: 80,
    windProfile: [{ altitudeM: 0, eastMps: 4, northMps: 0, upMps: 0 }],
  },
  integration: { timeStepS: 0.04, maxTimeS: 120 },
};

test("vertical convergence replay is deterministic and reports the step pair", () => {
  const baseResult = simulateVerticalFlight(baseConfig);
  const first = analyzeVerticalFlightConvergence({ baseResult, config: baseConfig });
  const second = analyzeVerticalFlightConvergence({ baseResult, config: baseConfig });

  assert.deepEqual(first, second);
  assert.equal(first.modelVersion, "rocketworks-vertical-convergence-0.1.0");
  assert.equal(first.validationStatus, "engineering-preview-unvalidated");
  assert.equal(first.baseTimeStepS, 0.04);
  assert.equal(first.refinedTimeStepS, 0.02);
  assert.ok(["converged", "watch"].includes(first.status));
  assert.equal(first.eventSetsMatch, true);
  assert.ok(Number.isFinite(first.maximumRelativeDifference));
  assert.ok(Number.isFinite(first.maximumEventTimeDifferenceS));
  assert.ok(first.assumptions.some((assumption) => assumption.includes("not validation")));
});

test("vertical convergence can expose a deliberately strict watch threshold", () => {
  const result = analyzeVerticalFlightConvergence({
    config: baseConfig,
    relativeTolerance: 0,
    timeToleranceS: 0,
  });
  assert.equal(result.status, "watch");
  assert.ok(result.warnings.some((warning) => warning.includes("half-step replay")));
});

test("vertical convergence rejects an invalid base step before replay", () => {
  assert.throws(
    () => analyzeVerticalFlightConvergence({
      config: {
        ...baseConfig,
        integration: { timeStepS: 0.2, maxTimeS: 120 },
      },
    }),
    /base time step must be greater than 0 and at most 0.1/,
  );
});
