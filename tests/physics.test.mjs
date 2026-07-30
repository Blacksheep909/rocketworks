import assert from "node:assert/strict";
import test from "node:test";

import {
  impulseThrough,
  interpolateWind,
  makeConstantThrustCurve,
  simulateVerticalFlight,
  standardAtmosphere,
  totalImpulse,
} from "../lib/physics/index.ts";

function closeTo(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, received ${actual}`,
  );
}

test("standard atmosphere reproduces sea-level reference conditions", () => {
  const state = standardAtmosphere(0);
  closeTo(state.temperatureK, 288.15, 1e-9, "temperature");
  closeTo(state.pressurePa, 101_325, 1e-6, "pressure");
  closeTo(state.densityKgM3, 1.225, 0.0001, "density");
  closeTo(state.speedOfSoundMps, 340.294, 0.01, "speed of sound");
});

test("standard atmosphere reproduces the 11 km geopotential boundary", () => {
  const state = standardAtmosphere(11_019.0678);
  closeTo(state.geopotentialAltitudeM, 11_000, 0.01, "geopotential altitude");
  closeTo(state.temperatureK, 216.65, 0.001, "temperature");
  closeTo(state.pressurePa, 22_632.06, 0.5, "pressure");
  closeTo(state.densityKgM3, 0.36392, 0.0001, "density");
});

test("thrust curve integration preserves triangular impulse", () => {
  const curve = [
    { timeS: 0, thrustN: 0 },
    { timeS: 1, thrustN: 10 },
    { timeS: 2, thrustN: 0 },
  ];
  closeTo(totalImpulse(curve), 10, 1e-12, "total impulse");
  closeTo(impulseThrough(curve, 1), 5, 1e-12, "partial impulse");
});

test("wind profile interpolation returns three-axis values", () => {
  const wind = interpolateWind(
    [
      { altitudeM: 0, eastMps: 2, northMps: 0, upMps: 0 },
      { altitudeM: 1000, eastMps: 6, northMps: 8, upMps: 2 },
    ],
    500,
  );
  closeTo(wind.eastMps, 4, 1e-12, "east wind");
  closeTo(wind.northMps, 4, 1e-12, "north wind");
  closeTo(wind.upMps, 1, 1e-12, "vertical wind");
  closeTo(wind.horizontalSpeedMps, Math.hypot(4, 4), 1e-12, "wind speed");
});

test("RK4 ascent agrees with the constant-acceleration analytical case", () => {
  const result = simulateVerticalFlight({
    vehicle: {
      dryMassKg: 2,
      propellantMassKg: 0,
      referenceAreaM2: 1e-12,
      dragCoefficient: 0.5,
    },
    motor: { thrustCurve: makeConstantThrustCurve(20, 2) },
    integration: { timeStepS: 0.01, maxTimeS: 20 },
  });
  const atOneSecond = result.trace.find(
    (point) => Math.abs(point.timeS - 1) < 0.000001,
  );
  assert.ok(atOneSecond, "trace contains the 1.0 s state");
  const accelerationMps2 = 10 - 9.80665;
  closeTo(
    atOneSecond.velocityMps,
    accelerationMps2,
    0.001,
    "velocity at 1 s",
  );
  closeTo(
    atOneSecond.altitudeAglM,
    0.5 * accelerationMps2,
    0.001,
    "altitude at 1 s",
  );
});

test("flight events are chronological and include recovery deployment", () => {
  const result = simulateVerticalFlight({
    vehicle: {
      dryMassKg: 0.5,
      propellantMassKg: 0.08,
      referenceAreaM2: Math.PI * Math.pow(0.054 / 2, 2),
      dragCoefficient: 0.52,
    },
    motor: { thrustCurve: makeConstantThrustCurve(22, 1.65) },
    recovery: {
      enabled: true,
      dragAreaM2: 0.16,
      dragCoefficient: 0.75,
      deploymentDelayAfterApogeeS: 0,
    },
    integration: { timeStepS: 0.02, maxTimeS: 180 },
  });

  const eventTypes = result.events.map((event) => event.type);
  assert.deepEqual(eventTypes, [
    "ignition",
    "liftoff",
    "burnout",
    "apogee",
    "recovery_deploy",
    "ground_impact",
  ]);
  for (let index = 1; index < result.events.length; index += 1) {
    assert.ok(result.events[index].timeS >= result.events[index - 1].timeS);
  }
  assert.ok(result.impactSpeedMps !== null);
  assert.ok(result.impactSpeedMps < 10);
});

test("insufficient thrust produces an explainable no-liftoff result", () => {
  const result = simulateVerticalFlight({
    vehicle: {
      dryMassKg: 1,
      propellantMassKg: 0,
      referenceAreaM2: 0.002,
      dragCoefficient: 0.5,
    },
    motor: { thrustCurve: makeConstantThrustCurve(1, 1) },
    integration: { timeStepS: 0.02, maxTimeS: 10 },
  });
  assert.equal(result.events.at(-1).type, "no_liftoff");
  assert.ok(result.warnings.some((warning) => warning.code === "NO_LIFTOFF"));
  assert.equal(result.apogeeM, 0);
});

test("recovery drag reduces impact speed", () => {
  const base = {
    vehicle: {
      dryMassKg: 0.5,
      propellantMassKg: 0.08,
      referenceAreaM2: Math.PI * Math.pow(0.054 / 2, 2),
      dragCoefficient: 0.52,
    },
    motor: { thrustCurve: makeConstantThrustCurve(22, 1.65) },
    integration: { timeStepS: 0.02, maxTimeS: 180 },
  };
  const ballistic = simulateVerticalFlight(base);
  const recovered = simulateVerticalFlight({
    ...base,
    recovery: {
      enabled: true,
      dragAreaM2: 0.16,
      dragCoefficient: 0.75,
      deploymentDelayAfterApogeeS: 0,
    },
  });
  assert.ok(ballistic.impactSpeedMps !== null);
  assert.ok(recovered.impactSpeedMps !== null);
  assert.ok(recovered.impactSpeedMps < ballistic.impactSpeedMps * 0.5);
});

