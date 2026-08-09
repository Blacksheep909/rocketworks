import assert from "node:assert/strict";
import test from "node:test";

import {
  KESTREL_EXPORT_MODEL_VERSION,
  KESTREL_PROJECT_SCHEMA_ID,
  createEngineeringReportMarkdown,
  createFlightTraceCsv,
  createParameterSweepCsv,
  createStageFlightTraceCsv,
  createKestrelProjectJson,
  createRocketOpenScad,
  createRocketProfileDxf,
} from "../lib/export/project-exports.ts";
import { analyzeLandingFootprint, runUncertaintyAnalysis } from "../lib/physics/index.ts";

const trace = [
  {
    timeS: 0,
    altitudeAglM: 0,
    velocityMps: 0,
    accelerationMps2: 35,
    massKg: 0.58,
    thrustN: 22,
    densityKgM3: 1.225,
    mach: 0,
    dynamicPressurePa: 0,
    horizontalWindMps: 2,
    recoveryDeployed: false,
  },
  {
    timeS: 1.5,
    altitudeAglM: 30,
    velocityMps: 20,
    accelerationMps2: -5,
    massKg: 0.5,
    thrustN: 0,
    densityKgM3: 1.221,
    mach: 0.058,
    dynamicPressurePa: 244,
    horizontalWindMps: 2.2,
    recoveryDeployed: true,
  },
];

const geometry = {
  projectName: "ARC 54",
  noseLengthM: 0.18,
  bodyLengthM: 0.71,
  diameterM: 0.054,
  finCount: 3,
  finRootChordM: 0.13,
  finTipChordM: 0.055,
  finSweepM: 0.045,
  finSpanM: 0.075,
  finThicknessM: 0.003,
  centerOfMassXM: 0.532,
  centerOfPressureXM: 0.69,
};

test("versioned Kestrel project JSON is deterministic and clean-room qualified", () => {
  const input = {
    projectId: "arc54",
    projectName: "ARC 54",
    generatedAtIso: "2026-08-01T00:00:00.000Z",
    applicationVersion: "prototype-0.1",
    vehicle: { lengthM: 0.89, massKg: 0.58 },
    simulations: { modelVersion: "fixture", trace },
    analyses: { staticMarginCalibers: 2.1 },
    provenance: { source: "Synthetic fixture", license: "CC0-1.0" },
  };
  const first = createKestrelProjectJson(input);
  const replay = createKestrelProjectJson(input);
  assert.equal(first, replay);
  assert.ok(first.endsWith("\n"));
  const parsed = JSON.parse(first);
  assert.equal(parsed.schema, KESTREL_PROJECT_SCHEMA_ID);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.exportModelVersion, KESTREL_EXPORT_MODEL_VERSION);
  assert.match(parsed.cleanRoomNotice, /No OpenRocket source/);
  assert.deepEqual(parsed.vehicle, input.vehicle);
  assert.equal(parsed.simulations.trace[1].recoveryDeployed, true);
});

test("flight CSV has stable SI columns, CRLF rows, and boolean deployment state", () => {
  const csv = createFlightTraceCsv(trace);
  const rows = csv.trim().split("\r\n");
  assert.equal(rows.length, 3);
  assert.equal(rows[0], "time_s,altitude_agl_m,velocity_mps,acceleration_mps2,mass_kg,thrust_n,density_kg_m3,mach,dynamic_pressure_pa,horizontal_wind_mps,recovery_deployed");
  assert.equal(rows[1].split(",").length, 11);
  assert.ok(rows[1].endsWith(",false"));
  assert.ok(rows[2].endsWith(",true"));
  assert.match(rows[2], /^1\.5,30,20,-5,0\.5,0,1\.221,0\.058,244,2\.2,true$/);
});

test("staged flight CSV preserves attached-stage topology and SI values", () => {
  const csv = createStageFlightTraceCsv([
    { timeS: 0, altitudeAglM: 0, speedMps: 0, massKg: 1.2, thrustN: 30, attachedStageIds: ["booster", "upper"] },
    { timeS: 1, altitudeAglM: 42.5, speedMps: 28.2, massKg: 0.8, thrustN: 18, attachedStageIds: ["upper"] },
  ]);
  const rows = csv.trim().split("\r\n");
  assert.equal(rows[0], "time_s,altitude_agl_m,speed_mps,mass_kg,thrust_n,attached_stage_ids");
  assert.equal(rows[1], "0,0,0,1.2,30,booster|upper");
  assert.equal(rows[2], "1,42.5,28.2,0.8,18,upper");
});

test("parameter sweep CSV preserves rows, null outputs, and evaluator errors", () => {
  const csv = createParameterSweepCsv({
    parameterKey: "thrustScale",
    values: [0.8, 1.2],
    samples: [
      { value: 0.8, outputs: { apogeeM: 120, impactSpeedMps: null }, error: null },
      { value: 1.2, outputs: null, error: "no liftoff" },
    ],
  });
  const rows = csv.trim().split("\r\n");
  assert.equal(rows[0], "parameter_key,parameter_value,apogeeM,impactSpeedMps,error");
  assert.equal(rows[1], "thrustScale,0.8,120,,");
  assert.equal(rows[2], "thrustScale,1.2,,,no liftoff");
});

test("R12 DXF exports millimetre airframe, fins, centerline, CG, and CP layers", () => {
  const dxf = createRocketProfileDxf(geometry);
  assert.match(dxf, /AC1009/);
  assert.match(dxf, /Units: millimetres/);
  assert.match(dxf, /\r\nAIRFRAME\r\n/);
  assert.match(dxf, /\r\nFINS\r\n/);
  assert.match(dxf, /\r\nCENTERLINE\r\n/);
  assert.match(dxf, /\r\nCG\r\n/);
  assert.match(dxf, /\r\nCP\r\n/);
  assert.match(dxf, /\r\n10\r\n890\.000000\r\n/);
  assert.ok(dxf.endsWith("0\r\nEOF\r\n"));
});

test("OpenSCAD export contains parameterized tangent-ogive, body, fins, and nozzle", () => {
  const scad = createRocketOpenScad(geometry);
  assert.match(scad, /Units: millimetres/);
  assert.match(scad, /module nose\(\)/);
  assert.match(scad, /rotate_extrude/);
  assert.match(scad, /module airframe\(\)/);
  assert.match(scad, /cylinder\(h=710,r=27\)/);
  assert.match(scad, /module fin_set\(\)/);
  assert.match(scad, /for \(angle=\[0:120:240\]\)/);
  assert.match(scad, /linear_extrude\(height=3,center=true/);
  assert.match(scad, /module nozzle\(\)/);
  assert.match(scad, /Verify tolerances, wall thickness, fits, and structure/);
});

test("CAD reference exports preserve the selected nose profile", () => {
  const conical = createRocketProfileDxf({ ...geometry, noseProfile: "conical" });
  const elliptical = createRocketOpenScad({ ...geometry, noseProfile: "elliptical" });
  assert.match(conical, /Kestrel Lab/);
  assert.match(elliptical, /module nose\(\)/);
  assert.notEqual(conical, createRocketProfileDxf(geometry));
  assert.notEqual(elliptical, createRocketOpenScad(geometry));
});

test("engineering report leads with status and preserves calculations and limitations", () => {
  const footprint = analyzeLandingFootprint({
    site: {
      name: "Test range",
      latitudeDeg: -36.85,
      longitudeDeg: 174.76,
      elevationM: 80,
      datum: "WGS84",
    },
    impacts: [
      { id: "a", eastM: 100, northM: 10, impactSpeedMps: 6, descentDurationS: 20 },
      { id: "b", eastM: 120, northM: 20, impactSpeedMps: 7, descentDurationS: 21 },
      { id: "c", eastM: 110, northM: 5, impactSpeedMps: 8, descentDurationS: 22 },
    ],
  });
  const uncertainty = runUncertaintyAnalysis({
    seed: "report-uncertainty",
    sampleCount: 128,
    parameters: [{ key: "scale", label: "Scale", distribution: { kind: "uniform", minimum: 0.9, maximum: 1.1 } }],
    evaluator: () => ({ response: 10 }),
    thresholds: [{ id: "high", metric: "response", comparison: "greater-than-or-equal", value: 8 }],
  });
  const report = createEngineeringReportMarkdown({
    projectName: "ARC 54",
    generatedAtIso: "2026-08-01T00:00:00.000Z",
    vehicle: {
      lengthM: 0.89,
      diameterM: 0.054,
      massKg: 0.58,
      centerOfMassXM: 0.532,
      centerOfPressureXM: 0.69,
      staticMarginCalibers: 2.93,
      axialInertiaKgM2: 0.00025,
      pitchInertiaKgM2: 0.03435,
      massModelVersion: "mass-fixture",
      aerodynamicModelVersion: "aero-fixture",
    },
    motor: {
      designation: "Synthetic preview",
      totalImpulseNs: 36.3,
      peakThrustN: 22,
      averageThrustN: 22,
      specificImpulseS: 61.7,
      provenance: "Synthetic fixture · CC0-1.0",
    },
    environment: {
      siteName: "Test range",
      elevationM: 80,
      meanWindAt500Mps: 4.08,
      modelVersion: "environment-fixture",
      validationStatus: "synthetic-unvalidated",
      provenance: "Synthetic fixture",
    },
    flight: {
      modelVersion: "flight-fixture",
      validationStatus: "engineering-preview-unvalidated",
      apogeeM: 300,
      maxSpeedMps: 50,
      maxMach: 0.15,
      maxDynamicPressurePa: 1500,
      timeToApogeeS: 6,
      totalFlightTimeS: 35,
      impactSpeedMps: 7,
      thrustToWeightAtIgnition: 3.86,
      totalImpulseNs: 36.3,
      events: [{ type: "apogee", timeS: 6, altitudeAglM: 300, velocityMps: 0, label: "Apogee" }],
      warnings: [{ code: "PREVIEW", severity: "warning", title: "Preview only", explanation: "Not independently validated." }],
      trace,
      assumptions: ["Constant drag coefficient"],
    },
    stageFlight: {
      modelVersion: "stage-flight-fixture",
      validationStatus: "mathematical-regression-tests-only",
      maxAltitudeAglM: 298,
      maxSpeedMps: 49.4,
      timeToApogeeS: 6.1,
      convergence: {
        status: "watch",
        baseTimeStepS: 0.02,
        refinedTimeStepS: 0.01,
        maximumRelativeDifference: 0.031,
        apogeeTimeDifferenceS: 0.012,
        maximumEventTimeDifferenceS: 0.003,
        assumptions: ["Half-step fixture comparison."],
        warnings: ["Fixture convergence warning."],
      },
    },
    uncertainty,
    landing: {
      modelVersion: "landing-fixture",
      validationStatus: "engineering-preview-unvalidated",
      seed: "landing-seed",
      footprint,
      uncertainty,
      ascentDrift: {
        modelVersion: "kestrel-ascent-drift-0.1.0",
        label: "Ascent drift wind-drag proxy",
        description: "Scenario-specific horizontal state is integrated to apogee.",
      },
      deploymentScenario: {
        parameterKey: "deploymentSuccess",
        label: "Recovery deployment",
        assumedSuccessProbability: 0.96,
        successfulSampleCount: 23,
        failedSampleCount: 1,
        unclassifiedSampleCount: 0,
        observedSuccessRate: 23 / 24,
        wilson95: { lower: 0.75, upper: 0.99 },
      },
      assumptions: [],
      warnings: ["Recovery phase only."],
    },
  });
  assert.match(report, /^# ARC 54 — Preliminary Engineering Report/);
  assert.ok(report.indexOf("Not flight-safe or manufacturing-approved") < report.indexOf("## Vehicle summary"));
  assert.match(report, /\| Static margin \| 2\.93 calibres \|/);
  assert.match(report, /## Recovery landing footprint/);
  assert.match(report, /## Uncertainty analysis/);
  assert.match(report, /## Coupled 6DOF preview/);
  assert.match(report, /Step convergence \| watch/);
  assert.match(report, /Fixture convergence warning/);
  assert.match(report, /Convergence status: converged/);
  assert.match(report, /Threshold high convergence/);
  assert.match(report, /Landing uncertainty convergence/);
  assert.match(report, /Recovery deployment: 1 \/ 24 sampled failures/);
  assert.match(report, /assumed 96\.0%/);
  assert.match(report, /Ascent-to-recovery handoff: Ascent drift wind-drag proxy/);
  assert.match(report, /Scenario-specific horizontal state is integrated to apogee/);
  assert.match(report, /Recovery phase only/);
  assert.match(report, /does not embed OpenRocket source code/);
});

test("invalid project, trace, CAD, and report inputs fail explicitly", () => {
  assert.throws(
    () => createKestrelProjectJson({
      projectId: "bad id",
      projectName: "Bad",
      generatedAtIso: "2026-08-01T00:00:00Z",
      applicationVersion: "1",
      vehicle: {},
      simulations: {},
      analyses: {},
      provenance: {},
    }),
    /identifier/,
  );
  assert.throws(() => createFlightTraceCsv([]), /cannot be empty/);
  assert.throws(
    () => createFlightTraceCsv([{ ...trace[0], massKg: Number.NaN }]),
    /must be finite/,
  );
  assert.throws(() => createRocketProfileDxf({ ...geometry, diameterM: 0 }), /diameter/);
  assert.throws(
    () => createRocketOpenScad({ ...geometry, finSweepM: 0.1, finTipChordM: 0.1 }),
    /axial envelope/,
  );
});
