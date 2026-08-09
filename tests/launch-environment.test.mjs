import assert from "node:assert/strict";
import test from "node:test";

import {
  createLaunchEnvironmentModel,
  standardAtmosphere,
} from "../lib/physics/index.ts";

const provenance = {
  sourceName: "Synthetic environment fixture",
  sourceKind: "synthetic",
  dataVersion: "fixture-1",
  licenseIdentifier: "CC0-1.0",
  attribution: "Kestrel Lab test fixture",
  validationStatus: "synthetic-unvalidated",
};

function definition(overrides = {}) {
  return {
    site: {
      name: "Test range",
      latitudeDeg: -36.85,
      longitudeDeg: 174.76,
      elevationM: 100,
      datum: "WGS84",
      timeZone: "Pacific/Auckland",
    },
    provenance,
    meanWindProfile: [
      { altitudeM: 0, eastMps: 10, northMps: 0, upMps: 0 },
      { altitudeM: 1000, eastMps: 20, northMps: 10, upMps: 2 },
    ],
    ...overrides,
  };
}

test("standard environment preserves atmosphere and interpolates mean ENU wind", () => {
  const model = createLaunchEnvironmentModel(definition());
  const state = model.at({ timeS: 0, positionWorldM: { x: 0, y: 0, z: 500 } });
  const expected = standardAtmosphere(600);
  assert.deepEqual(state.atmosphere, expected);
  assert.deepEqual(state.meanWindWorldMps, { x: 15, y: 5, z: 1 });
  assert.deepEqual(state.windWorldMps, state.meanWindWorldMps);
  assert.equal(state.altitudeAglM, 500);
  assert.equal(state.altitudeAslM, 600);
});

test("surface observation exactly anchors site pressure and temperature", () => {
  const model = createLaunchEnvironmentModel(definition({
    surfaceObservation: {
      stationPressurePa: 99_500,
      temperatureK: 293.15,
      relativeHumidityFraction: 0.7,
    },
  }));
  const atSite = model.at({ timeS: 0, positionWorldM: { x: 0, y: 0, z: 0 } });
  const dryModel = createLaunchEnvironmentModel(definition({
    surfaceObservation: {
      stationPressurePa: 99_500,
      temperatureK: 293.15,
    },
  }));
  const dryAtSite = dryModel.at({ timeS: 0, positionWorldM: { x: 0, y: 0, z: 0 } });
  assert.ok(Math.abs(atSite.atmosphere.pressurePa - 99_500) < 1e-9);
  assert.ok(Math.abs(atSite.atmosphere.temperatureK - 293.15) < 1e-12);
  assert.equal(atSite.atmosphere.relativeHumidityFraction, 0.7);
  assert.ok((atSite.atmosphere.waterVaporPartialPressurePa ?? 0) > 0);
  assert.ok((atSite.atmosphere.virtualTemperatureK ?? 0) > atSite.atmosphere.temperatureK);
  assert.ok(atSite.atmosphere.densityKgM3 < dryAtSite.atmosphere.densityKgM3);
  assert.ok(atSite.atmosphere.speedOfSoundMps > dryAtSite.atmosphere.speedOfSoundMps);
  assert.ok(model.warnings.some((warning) => /Relative humidity.*coupled/.test(warning)));
  assert.ok(model.assumptions.some((assumption) => assumption.includes("held constant")));
});

test("zero humidity preserves dry-air atmosphere while exposing explicit diagnostics", () => {
  const dry = createLaunchEnvironmentModel(definition({
    surfaceObservation: { stationPressurePa: 99_500, temperatureK: 293.15 },
  })).at({ timeS: 0, positionWorldM: { x: 0, y: 0, z: 0 } });
  const zeroHumidity = createLaunchEnvironmentModel(definition({
    surfaceObservation: {
      stationPressurePa: 99_500,
      temperatureK: 293.15,
      relativeHumidityFraction: 0,
    },
  })).at({ timeS: 0, positionWorldM: { x: 0, y: 0, z: 0 } });
  assert.equal(zeroHumidity.atmosphere.relativeHumidityFraction, 0);
  assert.equal(zeroHumidity.atmosphere.waterVaporPartialPressurePa, 0);
  assert.ok(Math.abs(zeroHumidity.atmosphere.densityKgM3 - dry.atmosphere.densityKgM3) < 1e-12);
  assert.ok(Math.abs(zeroHumidity.atmosphere.speedOfSoundMps - dry.atmosphere.speedOfSoundMps) < 1e-12);
});

test("one-minus-cosine gust is zero at endpoints and reaches peak at midpoint", () => {
  const model = createLaunchEnvironmentModel(definition({
    meanWindProfile: [],
    gustEvents: [{
      id: "crosswind",
      startTimeS: 2,
      durationS: 4,
      peakDeltaWindWorldMps: { x: 1, y: -3, z: 0.5 },
      minimumAltitudeAglM: 10,
      maximumAltitudeAglM: 100,
    }],
  }));
  const query = (timeS, z = 50) => model.at({ timeS, positionWorldM: { x: 0, y: 0, z } });
  assert.deepEqual(query(2).discreteGustWindWorldMps, { x: 0, y: 0, z: 0 });
  assert.deepEqual(query(4).discreteGustWindWorldMps, { x: 1, y: -3, z: 0.5 });
  const end = query(6).discreteGustWindWorldMps;
  assert.ok(Math.abs(end.x) < 1e-15 && Math.abs(end.y) < 1e-15 && Math.abs(end.z) < 1e-15);
  assert.deepEqual(query(4, 5).discreteGustWindWorldMps, { x: 0, y: 0, z: 0 });
  assert.deepEqual(query(4).activeGustIds, ["crosswind"]);
});

const turbulence = {
  seed: "environment-seed",
  rmsVelocityMps: { longitudinal: 2, lateral: 1.5, vertical: 1 },
  lengthScaleM: { longitudinal: 80, lateral: 40, vertical: 25 },
  minimumWavelengthM: 2,
  maximumWavelengthM: 1000,
  modeCount: 48,
  minimumAdvectionSpeedMps: 0.5,
};

test("seeded turbulence is repeatable and seed-sensitive", () => {
  const first = createLaunchEnvironmentModel(definition({ turbulence }));
  const replay = createLaunchEnvironmentModel(definition({ turbulence }));
  const changed = createLaunchEnvironmentModel(definition({ turbulence: { ...turbulence, seed: "different" } }));
  const query = { timeS: 3.2, positionWorldM: { x: 15, y: -4, z: 200 } };
  assert.deepEqual(first.at(query).turbulenceWindWorldMps, replay.at(query).turbulenceWindWorldMps);
  assert.notDeepEqual(first.at(query).turbulenceWindWorldMps, changed.at(query).turbulenceWindWorldMps);
});

test("frozen turbulence translates exactly with constant mean wind", () => {
  const model = createLaunchEnvironmentModel(definition({
    meanWindProfile: [{ altitudeM: 0, eastMps: 10, northMps: 0 }],
    turbulence,
  }));
  const first = model.at({ timeS: 1, positionWorldM: { x: 20, y: 0, z: 0 } });
  const translated = model.at({ timeS: 3, positionWorldM: { x: 40, y: 0, z: 0 } });
  assert.deepEqual(first.turbulenceWindWorldMps, translated.turbulenceWindWorldMps);
});

test("spectral synthesis reproduces configured component RMS over space", () => {
  const model = createLaunchEnvironmentModel(definition({
    meanWindProfile: [{ altitudeM: 0, eastMps: 10, northMps: 0 }],
    turbulence,
  }));
  const samples = Array.from({ length: 20_000 }, (_, index) =>
    model.at({ timeS: 0, positionWorldM: { x: (index / 19_999) * 50_000, y: 0, z: 0 } }).turbulenceWindWorldMps,
  );
  const rms = (key) => Math.sqrt(samples.reduce((sum, sample) => sum + sample[key] ** 2, 0) / samples.length);
  assert.ok(Math.abs(rms("x") - 2) < 0.04);
  assert.ok(Math.abs(rms("y") - 1.5) < 0.04);
  assert.ok(Math.abs(rms("z") - 1) < 0.04);
});

test("zero turbulence intensity produces exactly zero gust", () => {
  const model = createLaunchEnvironmentModel(definition({
    turbulence: { ...turbulence, rmsVelocityMps: { longitudinal: 0, lateral: 0, vertical: 0 } },
  }));
  assert.deepEqual(
    model.at({ timeS: 10, positionWorldM: { x: 3, y: 2, z: 1 } }).turbulenceWindWorldMps,
    { x: 0, y: 0, z: 0 },
  );
});

test("invalid site, provenance, observations, turbulence, gusts, and queries fail", () => {
  assert.throws(() => createLaunchEnvironmentModel(definition({ site: { ...definition().site, latitudeDeg: 91 } })), /latitude/);
  assert.throws(() => createLaunchEnvironmentModel(definition({ provenance: { ...provenance, licenseIdentifier: "" } })), /license identifier/);
  assert.throws(() => createLaunchEnvironmentModel(definition({ provenance: { ...provenance, sourceKind: "synthetic", validationStatus: "observed-unverified" } })), /incompatible/);
  assert.throws(() => createLaunchEnvironmentModel(definition({ surfaceObservation: { stationPressurePa: 0, temperatureK: 280 } })), /station pressure/);
  assert.throws(() => createLaunchEnvironmentModel(definition({ turbulence: { ...turbulence, seed: "" } })), /seed/);
  assert.throws(() => createLaunchEnvironmentModel(definition({ turbulence: { ...turbulence, modeCount: 2 } })), /mode count/);
  assert.throws(() => createLaunchEnvironmentModel(definition({ gustEvents: [{ id: "bad id", startTimeS: 0, durationS: 1, peakDeltaWindWorldMps: { x: 1, y: 0, z: 0 } }] })), /gust identifiers/);
  assert.throws(() => createLaunchEnvironmentModel(definition({ gustEvents: [{ id: "bad-altitude", startTimeS: 0, durationS: 1, peakDeltaWindWorldMps: { x: 1, y: 0, z: 0 }, maximumAltitudeAglM: Infinity }] })), /altitude limits/);
  const model = createLaunchEnvironmentModel(definition());
  assert.throws(() => model.at({ timeS: Number.NaN, positionWorldM: { x: 0, y: 0, z: 0 } }), /must be finite/);
  assert.throws(() => model.at({ timeS: 0, positionWorldM: { x: 0, y: 0, z: 20_000 } }), /supports altitudes/);
});
