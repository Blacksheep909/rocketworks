import assert from "node:assert/strict";
import test from "node:test";

import {
  compareFlightDataToTrace,
  createFlightDataComparisonCsv,
  parseFlightDataCsv,
} from "../lib/physics/index.ts";

const trace = [
  { timeS: 0, altitudeAglM: 0, velocityMps: 0, accelerationMps2: 10 },
  { timeS: 1, altitudeAglM: 5, velocityMps: 10, accelerationMps2: 10 },
  { timeS: 2, altitudeAglM: 20, velocityMps: 20, accelerationMps2: 10 },
];

test("flight-data CSV parses supported SI columns and comments", () => {
  const series = parseFlightDataCsv(
    "# Kestrel test log\ntime_s,altitude_m,velocity_mps\n0,0,0\n1,4,9\n2,19,18\n",
    "instrumented.csv",
  );
  assert.equal(series.sourceName, "instrumented.csv");
  assert.deepEqual(series.samples[1], { timeS: 1, altitudeM: 4, velocityMps: 9 });
});

test("flight-data comparison linearly interpolates residuals with explicit sign", () => {
  const result = compareFlightDataToTrace(trace, {
    sourceName: "fixture",
    samples: [
      { timeS: 0.5, altitudeM: 2, velocityMps: 4 },
      { timeS: 1.5, altitudeM: 12, velocityMps: 14 },
    ],
  });
  assert.equal(result.matchedSampleCount, 2);
  assert.equal(result.unmatchedSampleCount, 0);
  assert.equal(result.metrics.altitudeM.sampleCount, 2);
  assert.equal(result.metrics.altitudeM.meanResidual, 0.5);
  assert.equal(result.metrics.velocityMps.meanResidual, 1);
  assert.equal(result.metrics.velocityMps.rootMeanSquareError, 1);
  assert.equal(result.rows.length, 2);
  const csv = createFlightDataComparisonCsv(result);
  assert.match(csv, /# model_version,kestrel-flight-data-comparison-0\.1\.0/);
  assert.match(csv, /time_s,simulation_time_s,altitude_measured_m/);
  assert.match(csv, /0\.5,0\.5,2,2\.5,0\.5/);
  assert.match(csv, /\r\n$/);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("simulated minus measured")));
});

test("flight-data comparison retains coverage warnings and supports time offsets", () => {
  const result = compareFlightDataToTrace(
    trace,
    { sourceName: "offset fixture", samples: [{ timeS: -1, altitudeM: 0 }, { timeS: 0, altitudeM: 5 }] },
    { timeOffsetS: 1 },
  );
  assert.equal(result.matchedSampleCount, 2);
  assert.equal(result.timeOffsetS, 1);
  assert.equal(result.metrics.altitudeM.meanResidual, 0);
  assert.equal(result.warnings.length, 0);
});

test("flight-data parser rejects missing metrics and non-monotonic time", () => {
  assert.throws(
    () => parseFlightDataCsv("time_s,temperature_c\n0,20\n1,21\n"),
    /needs altitude, velocity, or acceleration|supported metric/,
  );
  assert.throws(
    () => parseFlightDataCsv("time_s,altitude_m\n0,0\n0,1\n"),
    /increase strictly/,
  );
});
