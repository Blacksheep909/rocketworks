import assert from "node:assert/strict";
import test from "node:test";

import {
  ASCENT_DRIFT_MODEL_VERSION,
  LANDING_FOOTPRINT_MODEL_VERSION,
  analyzeLandingFootprint,
  analyzeRecoveryLandingDispersion,
  createLaunchEnvironmentModel,
  estimateAscentWindDrift,
  localEnuOffsetToWgs84,
  simulateRecoveryDescent,
  standardAtmosphere,
} from "../lib/physics/index.ts";

const site = {
  name: "Landing test range",
  latitudeDeg: 0,
  longitudeDeg: 0,
  elevationM: 0,
  datum: "WGS84",
  timeZone: "UTC",
};

const provenance = {
  sourceName: "Synthetic landing fixture",
  sourceKind: "synthetic",
  dataVersion: "fixture-1",
  licenseIdentifier: "CC0-1.0",
  attribution: "Kestrel Lab test fixture",
  validationStatus: "synthetic-unvalidated",
};

function environment(eastMps = 0, northMps = 0) {
  return createLaunchEnvironmentModel({
    site,
    provenance,
    meanWindProfile: [
      { altitudeM: 0, eastMps, northMps, upMps: 0 },
      { altitudeM: 2000, eastMps, northMps, upMps: 0 },
    ],
  });
}

function descent(overrides = {}) {
  const model = environment();
  return simulateRecoveryDescent({
    massKg: 1,
    initialTimeS: 0,
    initialPositionWorldM: { x: 0, y: 0, z: 100 },
    initialVelocityWorldMps: { x: 0, y: 0, z: 0 },
    environmentAt: model.at,
    ballisticDragCoefficient: 0.5,
    ballisticReferenceAreaM2: 0.01,
    recovery: {
      dragCoefficient: 1.5,
      referenceAreaM2: 0.5,
      deploymentDelayS: 0,
      inflationTimeS: 0,
    },
    integration: { timeStepS: 0.02, maximumDurationS: 120, traceIntervalS: 0.2 },
    ...overrides,
  });
}

test("near-vacuum ballistic descent agrees with constant-gravity free fall", () => {
  const model = environment();
  const result = simulateRecoveryDescent({
    massKg: 1,
    initialTimeS: 0,
    initialPositionWorldM: { x: 0, y: 0, z: 100 },
    initialVelocityWorldMps: { x: 0, y: 0, z: 0 },
    environmentAt: model.at,
    ballisticDragCoefficient: 1,
    ballisticReferenceAreaM2: 1e-12,
    integration: { timeStepS: 0.005, maximumDurationS: 20, traceIntervalS: 1 },
  });
  const expectedTimeS = Math.sqrt((2 * 100) / 9.80665);
  const expectedSpeedMps = 9.80665 * expectedTimeS;
  assert.equal(result.landed, true);
  assert.ok(Math.abs(result.descentDurationS - expectedTimeS) < 0.002);
  assert.ok(Math.abs(result.impactSpeedMps - expectedSpeedMps) < 0.03);
  assert.ok(Math.abs(result.impactPositionWorldM.x) < 1e-12);
  assert.ok(Math.abs(result.impactPositionWorldM.y) < 1e-12);
});

test("inflated canopy approaches the documented terminal-speed relation", () => {
  const result = descent({
    initialPositionWorldM: { x: 0, y: 0, z: 1000 },
    integration: { timeStepS: 0.02, maximumDurationS: 600, traceIntervalS: 1 },
  });
  const density = standardAtmosphere(0).densityKgM3;
  const expectedTerminalMps = Math.sqrt(
    (2 * 1 * 9.80665) / (density * (0.5 * 0.01 + 1.5 * 0.5)),
  );
  assert.equal(result.landed, true);
  assert.ok(Math.abs(Math.abs(result.impactVelocityWorldMps.z) - expectedTerminalMps) < 0.08);
  assert.equal(result.trace.at(-1).phase, "inflated");
});

test("wind-relative vector drag produces downwind recovery drift", () => {
  const model = environment(8, -2);
  const result = descent({ environmentAt: model.at });
  assert.ok(result.impactPositionWorldM.x > 20);
  assert.ok(result.impactPositionWorldM.y < -5);
  assert.ok(result.maximumHorizontalDistanceM > 20);
  assert.ok(result.trace.some((point) => point.windWorldMps.x === 8));
});

test("ascent wind-drag handoff is deterministic and follows the supplied wind", () => {
  const model = environment(8, -2);
  const trace = [
    { timeS: 0, altitudeAglM: 0, velocityMps: 0, massKg: 1.2 },
    { timeS: 1, altitudeAglM: 45, velocityMps: 70, massKg: 1.05 },
    { timeS: 2, altitudeAglM: 100, velocityMps: 0, massKg: 1 },
  ];
  const input = {
    trace,
    apogeeTimeS: 2,
    environmentAt: model.at,
    dragCoefficient: 0.5,
    referenceAreaM2: 0.01,
    integration: { timeStepS: 0.01 },
  };
  const first = estimateAscentWindDrift(input);
  const replay = estimateAscentWindDrift(input);
  assert.deepEqual(first, replay);
  assert.equal(first.modelVersion, ASCENT_DRIFT_MODEL_VERSION);
  assert.equal(first.validationStatus, "engineering-preview-unvalidated");
  assert.ok(first.positionWorldM.x > 0);
  assert.ok(first.positionWorldM.y < 0);
  assert.ok(first.velocityWorldMps.x > 0);
  assert.ok(first.velocityWorldMps.y < 0);
  assert.ok(first.maximumHorizontalDistanceM >= Math.hypot(first.positionWorldM.x, first.positionWorldM.y));
  assert.ok(first.assumptions.some((assumption) => assumption.includes("one-dimensional trace")));
  assert.ok(first.warnings.some((warning) => warning.includes("6DOF")));
});

test("deployment delay and smooth inflation remain visible in the trace", () => {
  const result = descent({
    recovery: {
      dragCoefficient: 1.5,
      referenceAreaM2: 0.5,
      deploymentDelayS: 1,
      inflationTimeS: 2,
    },
    integration: { timeStepS: 0.02, maximumDurationS: 120, traceIntervalS: 0.1 },
  });
  assert.ok(result.trace.some((point) => point.phase === "deployment-delay"));
  assert.ok(result.trace.some((point) => point.phase === "inflating"));
  assert.ok(result.trace.some((point) => point.phase === "inflated"));
  const inflatingAreas = result.trace
    .filter((point) => point.phase === "inflating")
    .map((point) => point.effectiveDragAreaM2);
  assert.ok(Math.min(...inflatingAreas) >= 0.005);
  assert.ok(Math.max(...inflatingAreas) < 0.755);
});

test("local ENU conversion uses WGS84 curvature at the equator", () => {
  const east = localEnuOffsetToWgs84(site, 1000, 0);
  const expectedLongitudeDeg = (1000 / 6_378_137) * (180 / Math.PI);
  assert.ok(Math.abs(east.longitudeDeg - expectedLongitudeDeg) < 1e-12);
  assert.equal(east.latitudeDeg, 0);
  const north = localEnuOffsetToWgs84(site, 0, 1000);
  assert.ok(north.latitudeDeg > east.latitudeDeg);
  assert.equal(north.longitudeDeg, 0);
});

test("footprint covariance, ellipse, hull, and geodetic mean match a symmetric fixture", () => {
  const impacts = [
    { id: "ne", eastM: 10, northM: 5, impactSpeedMps: 6, descentDurationS: 20 },
    { id: "nw", eastM: -10, northM: 5, impactSpeedMps: 7, descentDurationS: 21 },
    { id: "sw", eastM: -10, northM: -5, impactSpeedMps: 8, descentDurationS: 22 },
    { id: "se", eastM: 10, northM: -5, impactSpeedMps: 9, descentDurationS: 23 },
  ];
  const result = analyzeLandingFootprint({ site, impacts });
  assert.equal(result.modelVersion, LANDING_FOOTPRINT_MODEL_VERSION);
  assert.equal(result.meanImpact.eastM, 0);
  assert.equal(result.meanImpact.northM, 0);
  assert.equal(result.meanImpact.positionWgs84.latitudeDeg, 0);
  assert.equal(result.meanImpact.positionWgs84.longitudeDeg, 0);
  assert.ok(Math.abs(result.covarianceM2.eastEast - 400 / 3) < 1e-12);
  assert.ok(Math.abs(result.covarianceM2.northNorth - 100 / 3) < 1e-12);
  assert.equal(result.covarianceM2.eastNorth, 0);
  assert.equal(result.convexHull.length, 4);
  const ellipse95 = result.confidenceEllipses.find((ellipse) => ellipse.probability === 0.95);
  assert.ok(ellipse95);
  assert.ok(Math.abs(ellipse95.semiMajorM / ellipse95.semiMinorM - 2) < 1e-12);
  assert.equal(ellipse95.majorAxisAngleDegFromEast, 0);
  assert.equal(result.impactSpeedMps.p50, 7.5);
});

test("seeded recovery dispersion is reproducible and exposes sensitivity samples", () => {
  const analyze = () => analyzeRecoveryLandingDispersion({
    site,
    seed: "landing-dispersion-seed",
    sampleCount: 12,
    parameters: [
      { key: "eastWindMps", label: "East wind", distribution: { kind: "uniform", minimum: 3, maximum: 9 } },
      { key: "areaScale", label: "Canopy area", distribution: { kind: "triangular", minimum: 0.8, mode: 1, maximum: 1.2 } },
    ],
    descentForSample: (values) => {
      const model = environment(values.eastWindMps, 0);
      return descent({
        environmentAt: model.at,
        recovery: {
          dragCoefficient: 1.5,
          referenceAreaM2: 0.5 * values.areaScale,
          deploymentDelayS: 0,
          inflationTimeS: 0.5,
        },
      });
    },
  });
  const first = analyze();
  const replay = analyze();
  assert.deepEqual(first, replay);
  assert.equal(first.uncertainty.successfulSampleCount, 12);
  assert.equal(first.footprint.sampleCount, 12);
  assert.ok(first.footprint.radialDistanceM.p95 > first.footprint.radialDistanceM.p50);
  assert.equal(
    first.uncertainty.sensitivityByMetric.impactEastM[0].parameterKey,
    "eastWindMps",
  );
});

test("deployment reliability scenarios branch to ballistic descent and remain explicit", () => {
  const result = analyzeRecoveryLandingDispersion({
    site,
    seed: "deployment-reliability",
    sampleCount: 20,
    parameters: [
      { key: "deploymentSuccess", label: "Recovery deployment", distribution: { kind: "bernoulli", successProbability: 0.75 } },
    ],
    deploymentScenario: { parameterKey: "deploymentSuccess" },
    descentForSample: (values) => values.deploymentSuccess === 1
      ? descent()
      : descent({ recovery: undefined }),
  });
  assert.equal(result.uncertainty.failedSampleCount, 0);
  assert.equal(result.deploymentScenario.successfulSampleCount, 15);
  assert.equal(result.deploymentScenario.failedSampleCount, 5);
  assert.equal(result.deploymentScenario.unclassifiedSampleCount, 0);
  assert.equal(result.deploymentScenario.observedSuccessRate, 0.75);
  assert.ok(result.deploymentScenario.wilson95.lower < 0.75);
  assert.ok(result.deploymentScenario.wilson95.upper > 0.75);
  assert.ok(result.warnings.some((warning) => warning.includes("ballistic descent")));
});

test("landing dispersion records the ascent handoff model and scope", () => {
  const result = analyzeRecoveryLandingDispersion({
    site,
    seed: "ascent-handoff",
    sampleCount: 6,
    parameters: [
      { key: "fixtureScale", label: "Fixture scale", distribution: { kind: "uniform", minimum: 0.99, maximum: 1.01 } },
    ],
    ascentDrift: {
      modelVersion: ASCENT_DRIFT_MODEL_VERSION,
      label: "Ascent drift wind-drag proxy",
      description: "Scenario-specific horizontal state is integrated to apogee.",
    },
    descentForSample: () => descent(),
  });
  assert.deepEqual(result.ascentDrift, {
    modelVersion: ASCENT_DRIFT_MODEL_VERSION,
    label: "Ascent drift wind-drag proxy",
    description: "Scenario-specific horizontal state is integrated to apogee.",
  });
  assert.ok(result.assumptions.some((assumption) => assumption.includes("integrated to apogee")));
  assert.ok(result.warnings.some((warning) => warning.includes("prescribed vertical trace")));
});

test("invalid descent, geodesy, and footprint inputs fail explicitly", () => {
  assert.throws(
    () => estimateAscentWindDrift({
      trace: [{ timeS: 0, altitudeAglM: 0, velocityMps: 0, massKg: 1 }],
      apogeeTimeS: 0,
      environmentAt: environment().at,
      dragCoefficient: 0.5,
      referenceAreaM2: 0.01,
    }),
    /at least two/,
  );
  assert.throws(
    () => estimateAscentWindDrift({
      trace: [
        { timeS: 0, altitudeAglM: 0, velocityMps: 0, massKg: 1 },
        { timeS: 0, altitudeAglM: 10, velocityMps: 1, massKg: 1 },
      ],
      apogeeTimeS: 0,
      environmentAt: environment().at,
      dragCoefficient: 0.5,
      referenceAreaM2: 0.01,
    }),
    /strictly increasing/,
  );
  assert.throws(() => descent({ massKg: 0 }), /mass/);
  assert.throws(() => descent({ initialPositionWorldM: { x: 0, y: 0, z: 0 } }), /above ground/);
  assert.throws(() => descent({ integration: { timeStepS: 1 } }), /time step/);
  assert.throws(() => localEnuOffsetToWgs84(site, 100_001, 0), /100 km/);
  assert.throws(
    () => analyzeLandingFootprint({ site, impacts: [{ id: "one", eastM: 0, northM: 0, impactSpeedMps: 1, descentDurationS: 1 }] }),
    /at least three/,
  );
});
