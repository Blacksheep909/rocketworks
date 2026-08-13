import assert from "node:assert/strict";
import test from "node:test";

import {
  compareFlightDataToTrace,
  compareFlightDataToStageTrace,
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
    "# RocketWorks test log\ntime_s,altitude_m,velocity_mps,altitude_sigma_m,velocity_uncertainty_mps\n0,0,0,1,0.5\n1,4,9,1.2,0.6\n2,19,18,1.5,0.7\n",
    "instrumented.csv",
  );
  assert.equal(series.sourceName, "instrumented.csv");
  assert.deepEqual(series.samples[1], { timeS: 1, altitudeM: 4, velocityMps: 9, altitudeUncertaintyM: 1.2, velocityUncertaintyMps: 0.6 });
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
  assert.equal(result.metrics.velocityMps.uncertaintySampleCount, 0);
  assert.equal(result.metrics.velocityMps.rootMeanSquareNormalizedResidual, null);
  assert.equal(result.rows.length, 2);
  const csv = createFlightDataComparisonCsv(result);
  assert.match(csv, /# model_version,kestrel-flight-data-comparison-0\.2\.0/);
  assert.match(csv, /# trace_source,vertical-1d/);
  assert.match(csv, /time_s,simulation_time_s,altitude_measured_m/);
  assert.match(csv, /0\.5,0\.5,2,2\.5,0\.5/);
  assert.match(csv, /\r\n$/);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("simulated minus measured")));
});

test("flight-data comparison reports normalized residuals for supplied one-sigma channels", () => {
  const result = compareFlightDataToTrace(trace, {
    sourceName: "uncertainty fixture",
    samples: [
      { timeS: 0, altitudeM: 0, altitudeUncertaintyM: 1, velocityMps: 0, velocityUncertaintyMps: 1 },
      { timeS: 1, altitudeM: 4, altitudeUncertaintyM: 2, velocityMps: 9, velocityUncertaintyMps: 2 },
      { timeS: 2, altitudeM: 18, altitudeUncertaintyM: 4, velocityMps: 18, velocityUncertaintyMps: 4 },
    ],
  });

  assert.equal(result.metrics.altitudeM.uncertaintySampleCount, 3);
  assert.equal(result.metrics.altitudeM.uncertaintyCoverageFraction, 1);
  assert.equal(result.metrics.altitudeM.meanNormalizedResidual, 1 / 3);
  assert.equal(result.metrics.altitudeM.rootMeanSquareNormalizedResidual, Math.sqrt(1 / 6));
  assert.equal(result.metrics.velocityMps.meanNormalizedResidual, 1 / 3);
  assert.equal(result.rows[1].altitudeM?.uncertainty, 2);
  assert.equal(result.rows[1].altitudeM?.normalizedResidual, 0.5);
  const csv = createFlightDataComparisonCsv(result);
  assert.match(csv, /altitude_uncertainty_m,altitude_normalized_residual_sigma/);
  assert.match(csv, /velocity_uncertainty_mps,velocity_normalized_residual_sigma/);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("one-sigma")));
});

test("flight-data uncertainty coverage stays explicit when only some rows carry sigma", () => {
  const result = compareFlightDataToTrace(trace, {
    sourceName: "partial uncertainty fixture",
    samples: [
      { timeS: 0, altitudeM: 0, altitudeUncertaintyM: 1 },
      { timeS: 1, altitudeM: 4 },
      { timeS: 2, altitudeM: 18, altitudeUncertaintyM: 2 },
    ],
  });
  assert.equal(result.metrics.altitudeM.uncertaintySampleCount, 2);
  assert.equal(result.metrics.altitudeM.uncertaintyCoverageFraction, 2 / 3);
  assert.equal(result.metrics.altitudeM.meanNormalizedResidual, 0.5);
  assert.ok(result.warnings.some((warning) => warning.includes("uncertainty coverage")));
});

test("coupled comparison collapses event timestamps and derives diagnostic acceleration", () => {
  const result = compareFlightDataToStageTrace(
    [
      { timeS: 0, altitudeAglM: 0, speedMps: 0 },
      { timeS: 1, altitudeAglM: 10, speedMps: 10 },
      { timeS: 1, altitudeAglM: 11, speedMps: 12 },
      { timeS: 2, altitudeAglM: 22, speedMps: 20 },
    ],
    {
      sourceName: "coupled fixture",
      samples: [
        { timeS: 0, altitudeM: 0, velocityMps: 0, accelerationMps2: 12 },
        { timeS: 1, altitudeM: 11, velocityMps: 12, accelerationMps2: 10 },
        { timeS: 2, altitudeM: 22, velocityMps: 20, accelerationMps2: 8 },
      ],
    },
  );
  assert.equal(result.traceSource, "coupled-6dof");
  assert.equal(result.matchedSampleCount, 3);
  assert.equal(result.rows.length, 3);
  assert.equal(result.metrics.accelerationMps2?.rootMeanSquareError, 0);
  assert.equal(result.metrics.altitudeM?.rootMeanSquareError, 0);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("centered finite differences")));
  assert.match(createFlightDataComparisonCsv(result), /# trace_source,coupled-6dof/);
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
  assert.throws(
    () => parseFlightDataCsv("time_s,altitude_m,altitude_sigma_m\n0,0,0\n1,1,1\n"),
    /uncertainties must be positive/,
  );
  assert.throws(
    () => parseFlightDataCsv("time_s,altitude_sigma_m\n0,1\n1,1\n"),
    /needs altitude, velocity, or acceleration/,
  );
  assert.throws(
    () => compareFlightDataToTrace(trace, {
      sourceName: "invalid uncertainty fixture",
      samples: [{ timeS: 0, velocityMps: 0, altitudeUncertaintyM: 1 }, { timeS: 1, velocityMps: 1 }],
    }),
    /uncertainty requires altitude/,
  );
});
