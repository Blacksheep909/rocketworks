import assert from "node:assert/strict";
import test from "node:test";

import {
  makeConstantThrustCurve,
  sweepVerticalFlight,
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
    windProfile: [{ altitudeM: 0, eastMps: 4, northMps: 0 }],
  },
  integration: { timeStepS: 0.02, maxTimeS: 120 },
};

test("vertical-flight sweep evaluates bounded endpoints and stable metrics", () => {
  const input = {
    baseConfig,
    parameterKey: "thrustScale",
    minimum: 0.8,
    maximum: 1.2,
    steps: 5,
  };
  const first = sweepVerticalFlight(input);
  const second = sweepVerticalFlight(input);
  assert.deepEqual(first, second);
  assert.equal(first.result.values.length, 5);
  assert.equal(first.result.values[0], 0.8);
  assert.equal(first.result.values.at(-1), 1.2);
  assert.equal(first.result.samples.filter((sample) => sample.outputs).length, 5);
  assert.ok(first.result.samples[4].outputs.apogeeM > first.result.samples[0].outputs.apogeeM);
  assert.equal(first.validationStatus, "engineering-preview-unvalidated");
  assert.ok(first.warnings.some((warning) => warning.includes("flight-safety")));
});

test("vertical-flight sweep rejects physically unbounded UI ranges", () => {
  assert.throws(
    () => sweepVerticalFlight({
      baseConfig,
      parameterKey: "windScale",
      minimum: -0.1,
      maximum: 1,
      steps: 5,
    }),
    /windScale sweep must remain between/,
  );
  assert.throws(
    () => sweepVerticalFlight({
      baseConfig,
      parameterKey: "thrustScale",
      minimum: 0.8,
      maximum: 1.2,
      steps: 1,
    }),
    /steps must be an integer from 2 through 1000/,
  );
});
