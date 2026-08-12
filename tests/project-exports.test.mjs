import assert from "node:assert/strict";
import test from "node:test";

import {
  KESTREL_EXPORT_MODEL_VERSION,
  KESTREL_PROJECT_SCHEMA_ID,
  createEngineeringReportMarkdown,
  createFlightTraceCsv,
  createParameterSweepCsv,
  createStageFlightTraceCsv,
  createUncertaintyCsv,
  createKestrelProjectJson,
  parseKestrelProjectJson,
  createRocketOpenScad,
  createRocketProfileDxf,
  createRocketStl,
} from "../lib/export/project-exports.ts";
import { analyzeLandingFootprint, computeStageFlightForceBudget, computeStructuralScreen, createEngineeringDesignReview, createStageInterfaceLoadReview, createStageStructuralReview, runUncertaintyAnalysis } from "../lib/physics/index.ts";

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

const componentRecord = {
  id: "nose-ogive",
  name: "Ogive nose",
  kind: "nose",
  parameters: { kind: "nose", lengthMm: 180, profile: "ogive" },
  provenance: {
    sourceName: "RocketWorks fixture",
    sourceKind: "project-authored",
    dataVersion: "0.1",
    licenseIdentifier: "MIT",
    attribution: "Original fixture",
    validationStatus: "project-authored-unvalidated",
  },
};

const portableConfiguration = {
  editableInputs: {
    lengthMm: 710,
    diameterMm: 54,
    noseLengthMm: 180,
    noseProfile: "ogive",
    finCount: 3,
    finRootChordMm: 130,
    finTipChordMm: 55,
    finSweepMm: 45,
    finSpanMm: 75,
    finThicknessMm: 3,
    payloadMassKg: 0.16,
    material: "kraft",
    thrustN: 22,
    burnTimeS: 1.65,
    dragCoefficient: 0.52,
    launchAltitudeM: 80,
    windSpeedMps: 4,
    relativeHumidityPercent: 60,
    surfacePressureHpa: 1004,
    surfaceTemperatureC: 15,
    launchRailEnabled: true,
    launchRailLengthM: 1.2,
    recoveryEnabled: true,
    recoveryDelayS: 0,
    recoveryDeploymentTrigger: "apogee",
    recoveryDeploymentAltitudeM: 150,
    recoveryDeploymentTimeS: 8,
    recoveryDiameterM: 0.45,
    recoveryMassKg: 0.06,
    recoveryDeploymentSuccessProbability: 0.9,
  },
  topology: {
    schema: "dev.kestrel-lab.local-vehicle-topology",
    schemaVersion: 1,
    vehicleId: "arc54",
    components: [{
      id: "avionics",
      name: "Avionics bay",
      stageId: "sustainer",
      enabled: true,
      kind: "pointMass",
      axialPositionM: 0.4,
      radialOffsetM: 0.01,
      azimuthDeg: 90,
      massKg: 0.2,
    }],
    stages: [{
      id: "sustainer",
      name: "Sustainer",
      role: "core",
      attachment: "serial",
      enabled: true,
      repeatCount: 1,
      repeatRadiusM: 0,
      thrustCantAngleDeg: 0,
      thrustCantAzimuthDeg: 0,
      ignitionDelayS: 0,
      separationDelayS: 0.1,
      ignitionFailure: false,
    }],
  },
  selectedMotorId: "synthetic",
  selectedAerodynamicTableId: "constant",
  motorLibrary: [],
  aerodynamicLibrary: [],
  componentLibrary: [componentRecord],
};

test("versioned RocketWorks project JSON is deterministic and clean-room qualified", () => {
  const input = {
    projectId: "arc54",
    projectName: "ARC 54",
    generatedAtIso: "2026-08-01T00:00:00.000Z",
    applicationVersion: "prototype-0.1",
    vehicle: { lengthM: 0.89, massKg: 0.58 },
    simulations: { modelVersion: "fixture", trace },
    analyses: { staticMarginCalibers: 2.1 },
    provenance: { source: "Synthetic fixture", license: "CC0-1.0" },
    configuration: portableConfiguration,
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
  const imported = parseKestrelProjectJson(first);
  assert.equal(imported.projectId, "arc54");
  assert.equal(imported.editableInputs.diameterMm, 54);
  assert.equal(imported.topology.stages[0].role, "core");
  assert.equal(imported.topology.components[0].id, "avionics");
  assert.equal(imported.selectedMotorId, "synthetic");
  assert.equal(imported.componentLibrary[0].id, "nose-ogive");
  assert.deepEqual(imported.warnings, []);
});

test("portable project import rejects documents without a validated configuration envelope", () => {
  const serialized = createKestrelProjectJson({
    projectId: "arc54",
    projectName: "ARC 54",
    generatedAtIso: "2026-08-01T00:00:00.000Z",
    applicationVersion: "prototype-0.1",
    vehicle: {},
    simulations: {},
    analyses: {},
    provenance: {},
  });
  assert.throws(() => parseKestrelProjectJson(serialized), /portable project configuration/);
});

test("portable project import makes missing source selections explicit", () => {
  const serialized = createKestrelProjectJson({
    projectId: "arc54",
    projectName: "ARC 54",
    generatedAtIso: "2026-08-01T00:00:00.000Z",
    applicationVersion: "prototype-0.1",
    vehicle: {},
    simulations: {},
    analyses: {},
    provenance: {},
    configuration: {
      ...portableConfiguration,
      selectedMotorId: "missing.motor",
      selectedAerodynamicTableId: "missing.table",
    },
  });
  const imported = parseKestrelProjectJson(serialized);
  assert.equal(imported.selectedMotorId, "synthetic");
  assert.equal(imported.selectedAerodynamicTableId, "constant");
  assert.equal(imported.warnings.length, 2);
});

test("flight CSV has stable SI columns, CRLF rows, and boolean deployment state", () => {
  const csv = createFlightTraceCsv(trace);
  const rows = csv.trim().split("\r\n");
  assert.equal(rows.length, 3);
  assert.equal(rows[0], "time_s,altitude_agl_m,velocity_mps,acceleration_mps2,mass_kg,thrust_n,density_kg_m3,mach,dynamic_pressure_pa,horizontal_wind_mps,recovery_deployed,recovery_reefing_fraction");
  assert.equal(rows[1].split(",").length, 12);
  assert.ok(rows[1].endsWith(",false,1"));
  assert.ok(rows[2].endsWith(",true,1"));
  assert.match(rows[2], /^1\.5,30,20,-5,0\.5,0,1\.221,0\.058,244,2\.2,true,1$/);
});

test("staged flight CSV preserves attached-stage topology and SI values", () => {
  const csv = createStageFlightTraceCsv([
    { timeS: 0, altitudeAglM: 0, speedMps: 0, mach: 0, angleOfAttackRad: 0, sideslipRad: 0, dynamicPressurePa: 0, dragN: 0, recoveryDragN: 0, recoveryEffectiveAreaM2: 0, massKg: 1.2, thrustN: 30, attachedStageIds: ["booster", "upper"] },
    { timeS: 1, altitudeAglM: 42.5, speedMps: 28.2, mach: 0.08, angleOfAttackRad: 0.02, sideslipRad: -0.01, dynamicPressurePa: 480, dragN: 2.5, recoveryDragN: 4.2, recoveryEffectiveAreaM2: 0.18, massKg: 0.8, thrustN: 18, attachedStageIds: ["upper"] },
  ]);
  const rows = csv.trim().split("\r\n");
  assert.equal(rows[0], "time_s,altitude_agl_m,speed_mps,mach,angle_of_attack_deg,sideslip_deg,dynamic_pressure_pa,drag_n,aerodynamic_force_n,aerodynamic_moment_nm,aerodynamic_damping_moment_nm,direct_force_applied,direct_moment_applied,coefficient_basis,recovery_drag_n,recovery_effective_area_m2,mass_kg,thrust_n,attached_stage_ids");
  assert.equal(rows[1], "0,0,0,0,0,0,0,0,0,0,0,false,false,,0,0,1.2,30,booster|upper");
  assert.equal(rows[2], "1,42.5,28.2,0.08,1.1459155902616465,-0.5729577951308232,480,2.5,0,0,0,false,false,,4.2,0.18,0.8,18,upper");
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

test("uncertainty CSV preserves provenance, stable columns, null outputs, and errors", () => {
  const analysis = {
    modelVersion: "kestrel-uncertainty-fixture",
    validationStatus: "engineering-preview-unvalidated",
    seed: "csv-replay-v1",
    method: "latin-hypercube",
    requestedSampleCount: 2,
    successfulSampleCount: 1,
    failedSampleCount: 1,
    parameters: [
      { key: "scale", label: "Scale", distribution: { kind: "uniform", minimum: 0.9, maximum: 1.1 } },
    ],
    correlations: [],
    samples: [
      { index: 0, inputs: { scale: 0.9, wind: 4 }, outputs: { z: 3, a: null }, error: null },
      { index: 1, inputs: { scale: 1.1 }, outputs: { a: 2.5, z: null }, error: "boom, now" },
    ],
  };
  const csv = createUncertaintyCsv(analysis);
  assert.equal(csv, createUncertaintyCsv(analysis));
  const rows = csv.trim().split("\r\n");
  assert.equal(rows[0], "# RocketWorks uncertainty sample export,1");
  assert.equal(rows[4], "# seed,csv-replay-v1");
  assert.equal(rows[10], "sample_index,scale,wind,a,z,error");
  assert.equal(rows[11], "0,0.9,4,,3,");
  assert.equal(rows[12], '1,1.1,,2.5,,"boom, now"');
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

test("ASCII STL export contains a triangulated reference mesh in millimetres", () => {
  const stl = createRocketStl(geometry);
  assert.match(stl, /^solid rocketworks_arc_54\n/);
  assert.match(stl, /facet normal /);
  assert.match(stl, /vertex 890\.000000/);
  assert.match(stl, /vertex 180\.000000 27\.000000/);
  assert.match(stl, /endsolid rocketworks_arc_54\n$/);
  assert.ok((stl.match(/facet normal /g) ?? []).length > 500);
  assert.equal(stl, createRocketStl(geometry));
  assert.doesNotMatch(stl, /NaN|Infinity/);
});

test("ASCII STL export can retain serial and radial stage-instance offsets", () => {
  const multiStage = createRocketStl({
    ...geometry,
    stageParts: [
      {
        id: "core",
        name: "Core",
        axialOffsetM: 0,
        radialOffsetYM: 0,
        radialOffsetZM: 0,
        noseLengthM: geometry.noseLengthM,
        bodyLengthM: geometry.bodyLengthM,
        diameterM: geometry.diameterM,
        finCount: geometry.finCount,
        finRootChordM: geometry.finRootChordM,
        finTipChordM: geometry.finTipChordM,
        finSweepM: geometry.finSweepM,
        finSpanM: geometry.finSpanM,
        finThicknessM: geometry.finThicknessM,
      },
      {
        id: "upper-instance-1",
        name: "Upper 1",
        axialOffsetM: -0.89,
        radialOffsetYM: 0.12,
        radialOffsetZM: 0,
        noseLengthM: 0.12,
        bodyLengthM: 0.42,
        diameterM: 0.038,
        finCount: 3,
        finRootChordM: 0.08,
        finTipChordM: 0.03,
        finSweepM: 0.02,
        finSpanM: 0.05,
        finThicknessM: 0.002,
      },
    ],
  });
  assert.match(multiStage, /vertex -890\.000000 120\.000000 0\.000000/);
  assert.ok(
    (multiStage.match(/facet normal /g) ?? []).length >
      (createRocketStl(geometry).match(/facet normal /g) ?? []).length,
  );
  assert.doesNotMatch(multiStage, /NaN|Infinity/);
});

test("DXF side-profile export emits topology-aware stage layers", () => {
  const dxf = createRocketProfileDxf({
    ...geometry,
    stageParts: [
      {
        id: "core",
        name: "Core",
        axialOffsetM: 0,
        radialOffsetYM: 0,
        radialOffsetZM: 0,
        noseLengthM: geometry.noseLengthM,
        bodyLengthM: geometry.bodyLengthM,
        diameterM: geometry.diameterM,
        finCount: geometry.finCount,
        finRootChordM: geometry.finRootChordM,
        finTipChordM: geometry.finTipChordM,
        finSweepM: geometry.finSweepM,
        finSpanM: geometry.finSpanM,
        finThicknessM: geometry.finThicknessM,
      },
      {
        id: "upper-instance-1",
        name: "Upper 1",
        axialOffsetM: -0.89,
        radialOffsetYM: 0.12,
        radialOffsetZM: 0.04,
        noseLengthM: 0.12,
        bodyLengthM: 0.42,
        diameterM: 0.038,
        finCount: 3,
        finRootChordM: 0.08,
        finTipChordM: 0.03,
        finSweepM: 0.02,
        finSpanM: 0.05,
        finThicknessM: 0.002,
      },
    ],
  });
  assert.match(dxf, /AIRFRAME_core/);
  assert.match(dxf, /FINS_upper-instance-1/);
  assert.match(dxf, /-890\.000000/);
  assert.match(dxf, /radial Z offset is projected out/);
  assert.doesNotMatch(dxf, /NaN|Infinity/);
});

test("OpenSCAD export emits uniquely named translated stage modules", () => {
  const scad = createRocketOpenScad({
    ...geometry,
    stageParts: [{
      id: "upper-instance-1",
      name: "Upper 1",
      axialOffsetM: -0.89,
      radialOffsetYM: 0.12,
      radialOffsetZM: 0.04,
      noseLengthM: 0.12,
      bodyLengthM: 0.42,
      diameterM: 0.038,
      finCount: 3,
      finRootChordM: 0.08,
      finTipChordM: 0.03,
      finSweepM: 0.02,
      finSpanM: 0.05,
      finThicknessM: 0.002,
    }],
  });
  assert.match(scad, /Multi-stage topology reference/);
  assert.match(scad, /module stage_upper_instance_1_1_assembly\(\)/);
  assert.match(scad, /translate\(\[-890,120,40\]\)/);
  assert.match(scad, /stage_upper_instance_1_1_fin_set/);
  assert.doesNotMatch(scad, /NaN|Infinity/);
});

test("CAD reference exports preserve the selected nose profile", () => {
  const conical = createRocketProfileDxf({ ...geometry, noseProfile: "conical" });
  const elliptical = createRocketOpenScad({ ...geometry, noseProfile: "elliptical" });
  assert.match(conical, /RocketWorks/);
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
  const structural = computeStructuralScreen({
    body: {
      id: "body",
      name: "Airframe",
      stageId: "sustainer",
      kind: "axisymmetric",
      densityKgM3: 850,
      wallThicknessM: 0.001,
      stations: [{ xM: 0, outerRadiusM: 0.027 }, { xM: 0.71, outerRadiusM: 0.027 }],
    },
    fins: {
      id: "fins",
      name: "Fin set",
      stageId: "sustainer",
      kind: "finSet",
      count: 3,
      axialPositionM: 0.58,
      bodyRadiusM: 0.027,
      rootChordM: 0.13,
      tipChordM: 0.055,
      sweepM: 0.045,
      spanM: 0.075,
      thicknessM: 0.003,
      densityKgM3: 600,
    },
    totalMassKg: 0.58,
    peakThrustN: 22,
    maxDynamicPressurePa: 1500,
    staticMarginCalibers: 2.93,
    material: {
      label: "Kraft phenolic",
      youngsModulusPa: 3e9,
      allowableCompressionPa: 20e6,
      allowableBendingPa: 20e6,
      allowableShearPa: 8e6,
    },
  });
  const designReview = createEngineeringDesignReview({
    thrustToWeight: 22 / (0.58 * 9.80665),
    staticMarginCalibers: 2.93,
    staticAerodynamicsModelVersion: "aero-fixture",
    structural,
    verticalFlightCurrent: true,
    verticalFlightModelVersion: "flight-fixture",
    stageFlightConfigured: true,
    stageFlightCurrent: true,
    stageFlightModelVersion: "stage-flight-fixture",
    stageEventAllocationStatus: "allocated",
    stageConvergenceStatus: "watch",
    separationImpulseReviewCount: 1,
  });
  const stageStructural = createStageStructuralReview([
    { id: "core", label: "Core", role: "core", screen: structural },
    { id: "booster", label: "Booster pair", role: "booster", instanceCount: 2, screen: null, unavailableReason: "Fixture geometry omitted." },
  ]);
  const stageInterfaceLoads = createStageInterfaceLoadReview({
    retainedMassKg: 0.08,
    stages: [
      { id: "core", label: "Core", attachment: "serial", stageMassKg: 0.5, peakThrustN: 22, sectionAreaM2: 0.0005, allowableCompressionPa: 20e6 },
      { id: "booster", label: "Booster pair", parentStageId: "core", attachment: "serial", stageMassKg: 0.2, peakThrustN: 10, sectionAreaM2: 0.0005, allowableCompressionPa: 20e6 },
    ],
  });
  const forceBudget = computeStageFlightForceBudget([
    { timeS: 0, massKg: 0.58, thrustN: 22, dragN: 1, recoveryDragN: 0, dynamicPressurePa: 0, speedMps: 0, attachedStageIds: ["booster"] },
    { timeS: 1, massKg: 0.56, thrustN: 18, dragN: 2, recoveryDragN: 0.2, dynamicPressurePa: 900, speedMps: 40, attachedStageIds: ["booster"] },
  ], { stageLabels: { booster: "Booster" } });
  const report = createEngineeringReportMarkdown({
    projectName: "ARC 54",
    generatedAtIso: "2026-08-01T00:00:00.000Z",
    selectedMotorId: "synthetic",
    selectedAerodynamicTableId: "constant",
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
      depletionSource: "measured-mass-flow",
      measuredMassFlowKg: 0.02,
      provenance: "Synthetic fixture · CC0-1.0",
    },
    environment: {
      siteName: "Test range",
      latitudeDeg: -36.85,
      longitudeDeg: 174.76,
      elevationM: 80,
      meanWindAt500Mps: 4.08,
      windAzimuthDeg: 35,
      windProfileLayerCount: 3,
      windProfileSource: "user-supplied",
      turbulenceScale: 1.2,
      weatherSeed: "report-weather-v1",
      surfacePressureHpa: 1004,
      surfaceTemperatureC: 15,
      relativeHumidityPercent: 60,
      modelVersion: "environment-fixture",
      validationStatus: "synthetic-unvalidated",
      provenance: "Synthetic fixture",
    },
    recovery: {
      enabled: true,
      deploymentTrigger: "altitude",
      deploymentAltitudeAglM: 180,
      deploymentDelayS: 0.5,
      reefingEnabled: true,
      reefingDurationS: 2,
      reefingStartAreaFraction: 0.25,
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
    verticalConvergence: {
      modelVersion: "rocketworks-vertical-convergence-0.1.0",
      validationStatus: "engineering-preview-unvalidated",
      status: "converged",
      baseTimeStepS: 0.02,
      refinedTimeStepS: 0.01,
      maximumRelativeDifference: 0.004,
      apogeeRelativeDifference: 0.002,
      maxSpeedRelativeDifference: 0.003,
      maxDynamicPressureRelativeDifference: 0.004,
      impactSpeedRelativeDifference: 0.001,
      apogeeTimeDifferenceS: 0.01,
      totalFlightTimeDifferenceS: 0.02,
      maximumEventTimeDifferenceS: 0.01,
      eventSetsMatch: true,
      relativeTolerance: 0.02,
      timeToleranceS: 0.05,
      assumptions: ["Half-step vertical fixture comparison."],
      warnings: [],
    },
    stageFlight: {
      modelVersion: "stage-flight-fixture",
      validationStatus: "mathematical-regression-tests-only",
      maxAltitudeAglM: 298,
      maxSpeedMps: 49.4,
      timeToApogeeS: 6.1,
      massRatio: {
        modelVersion: "rocketworks-stage-mass-ratio-0.1.0",
        validationStatus: "analytical-ideal-rocket-equation",
        overallStatus: "review",
        assessedStageCount: 1,
        totalIdealDeltaVMps: 120,
        stages: [{
          stageId: "booster",
          stageName: "Booster",
          instanceCount: 2,
          status: "assessed",
          structuralMassKg: 0.5,
          motorDryMassKg: 0.1,
          propellantMassKg: 0.2,
          fullStageMassKg: 0.8,
          burnoutStageMassKg: 0.6,
          massRatio: 1.333,
          propellantMassFraction: 0.25,
          totalImpulseNs: 30,
          effectiveSpecificImpulseS: 15.3,
          idealDeltaVMps: 120,
          note: "Fixture stage-only proxy.",
        }],
        assumptions: ["Fixture mass-ratio assumption."],
        warnings: ["Fixture mass-ratio warning."],
      },
      missionMassRatio: {
        modelVersion: "rocketworks-mission-mass-ratio-0.1.0",
        validationStatus: "analytical-serial-stack-preview",
        overallStatus: "review",
        retainedPayloadMassKg: 0.42,
        excludedStageIds: ["booster"],
        assessedStageCount: 1,
        totalIdealDeltaVMps: 95,
        stages: [{
          stageId: "upper",
          stageName: "Upper stage",
          sequenceIndex: 0,
          upperStackMassKg: 0.42,
          initialAttachedMassKg: 1.12,
          burnoutAttachedMassKg: 0.82,
          massRatio: 1.365,
          effectiveSpecificImpulseS: 182,
          idealDeltaVMps: 95,
          status: "assessed",
          note: "Fixture serial-stack proxy.",
        }],
        assumptions: ["Fixture serial-stack assumption."],
        warnings: ["Fixture serial-stack warning."],
      },
      forceBudget,
      eventAllocation: {
        modelVersion: "rocketworks-event-allocator-0.1.0",
        validationStatus: "analytical-event-ordering-checks-only",
        status: "allocated",
        orderedEventIds: [],
        priorityByEventId: {},
        dependencies: [],
        sameTimeGroups: [],
        warnings: [],
        assumptions: ["Fixture event allocation."],
      },
      clusterDiagnostics: [{ stageName: "Booster", activeMotorCount: 1, motorCount: 2, failedMotorCount: 1, failedPropellantMassKg: 0.2, peakCurveThrustN: 30, peakCurveSpreadN: null, peakCurveSpreadFraction: null, motorPeakThrusts: [], status: "watch" }],
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
      separatedBodies: [
        {
          stageId: "booster",
          stageName: "Booster",
          releaseTimeS: 4.2,
          impactTimeS: 11.8,
          maxAltitudeAglM: 182,
          maxSpeedMps: 41.6,
        },
      ],
      separationDynamics: [
        {
          modelVersion: "rocketworks-separation-dynamics-0.1.0",
          eventId: "booster-separation",
          status: "balanced",
          retainedMassKg: 0.58,
          detachedMassKg: 0.2,
          linearMomentumResidualMagnitudeKgMps: 0,
          angularImpulseResidualMagnitudeKgM2PerS: 0,
          assumptions: ["Instantaneous fixture audit."],
          warnings: [],
        },
      ],
      separationImpulseSolutions: [
        {
          modelVersion: "rocketworks-coupled-separation-impulse-0.1.0",
          eventId: "booster-separation",
          status: "review",
          maximumCorrectionMps: 0.012345,
          resolvedConstraintCount: 3,
          linearMomentumResidualMagnitudeKgMps: 0.000001,
          angularImpulseResidualMagnitudeKgM2PerS: 0.000002,
          assumptions: ["Impulse allocator fixture assumption."],
          warnings: ["Impulse allocator fixture warning."],
        },
      ],
      multiBodySeparation: {
        modelVersion: "kestrel-multi-body-separation-0.1.0",
        validationStatus: "analytical-component-checks-only",
        releaseTimeS: 0,
        bodies: [
          { id: "retained-vehicle", label: "Retained vehicle", releaseTimeS: 0, sampleCount: 8 },
          { id: "booster/logical-1", label: "Booster", releaseTimeS: 4.2, sampleCount: 5 },
        ],
        pairs: [],
        minimumDistanceM: 0.4,
        closestPair: {
          firstBodyId: "retained-vehicle",
          secondBodyId: "booster/logical-1",
          timeS: 4.2,
          distanceM: 0.4,
        },
        status: "partial",
        warnings: ["Pairwise fixture warning."],
        assumptions: ["Pairwise fixture assumption."],
      },
    },
    stageUncertainty: {
      ...uncertainty,
      adapterVersion: "kestrel-stage-flight-uncertainty-0.7.0",
      metrics: {
        ...uncertainty.metrics,
        maxAltitudeAglM: uncertainty.metrics.response,
        maxSpeedMps: uncertainty.metrics.response,
        maxDynamicPressurePa: uncertainty.metrics.response,
        finalSpeedMps: uncertainty.metrics.response,
      },
    },
    uncertainty,
    structural,
    stageStructural,
    stageInterfaceLoads,
    designReview,
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
  assert.match(report, /Site coordinates \(WGS84\): -36\.85000°, 174\.76000°/);
  assert.match(report, /Mean-wind profile: user-supplied \(3 altitude layers\)/);
  assert.match(report, /Turbulence RMS scale: 1\.20×/);
  assert.match(report, /Weather replay seed: `report-weather-v1`/);
  assert.match(report, /Pad pressure observation: 1004\.0 hPa/);
  assert.match(report, /Wind azimuth input: 35° ENU/);
  assert.match(report, /Relative humidity observation: 60%/);
  assert.match(report, /## Recovery configuration/);
  assert.match(report, /Command trigger: descending altitude/);
  assert.match(report, /Command altitude: 180\.0 m AGL/);
  assert.match(report, /Command delay after trigger: 0\.50 s/);
  assert.match(report, /Opening schedule: 25% to 100% over 2\.0 s/);
  assert.match(report, /Propellant depletion source: measured mass-flow history/);
  assert.match(report, /Integrated measured outflow: 0\.0200 kg/);
  assert.match(report, /Selected motor source ID: `synthetic`/);
  assert.match(report, /Selected aerodynamic source ID: `constant`/);
  assert.ok(report.indexOf("Not flight-safe or manufacturing-approved") < report.indexOf("## Vehicle summary"));
  assert.match(report, /\| Static margin \| 2\.93 calibres \|/);
  assert.match(report, /## Recovery landing footprint/);
  assert.match(report, /### Serial-stack mass-ratio preview/);
  assert.match(report, /Excluded topology stages \| booster/);
  assert.match(report, /## Preliminary structural screen/);
  assert.match(report, /## Stage-aware structural review/);
  assert.match(report, /## Stage-interface axial load path/);
  assert.match(report, /rocketworks-stage-interface-loads-0.2.0/);
  assert.match(report, /Acceleration basis: peak-thrust-common-acceleration/);
  assert.match(report, /Parallel\/radial interface solver|Interface rows/);
  assert.match(report, /Booster pair/);
  assert.match(report, /Fixture geometry omitted/);
  assert.match(report, /Euler column buckling/);
  assert.match(report, /Fin flutter margin/);
  assert.match(report, /## Engineering design review/);
  assert.match(report, /rocketworks-engineering-design-review-0.1.0/);
  assert.match(report, /Separation impulse proposals/);
  assert.match(report, /Separation impulse audit/);
  assert.match(report, /## Uncertainty analysis/);
  assert.match(report, /## Coupled 6DOF uncertainty/);
  assert.match(report, /kestrel-stage-flight-uncertainty-0.7.0/);
  assert.match(report, /## Coupled 6DOF preview/);
  assert.match(report, /### Stage mass-ratio diagnostic/);
  assert.match(report, /Fixture mass-ratio warning/);
  assert.match(report, /### Force impulse budget/);
  assert.match(report, /rocketworks-stage-flight-force-budget-0.1.0/);
  assert.match(report, /Drag \/ thrust velocity-equivalent ratio/);
  assert.match(report, /### Vertical integration-step convergence/);
  assert.match(report, /Heuristic status \| converged/);
  assert.match(report, /Step convergence \| watch/);
  assert.match(report, /Fixture convergence warning/);
  assert.match(report, /### Motor-state diagnostics/);
  assert.match(report, /\| Booster \| 1 \/ 2 \| 1 \| 0\.200 kg \| watch \|/);
  assert.match(report, /### Separated-body trajectories/);
  assert.match(report, /\| Booster \| 4\.20 s \| not configured \| not recorded \| not recorded \| not-modeled \| gravity only \| 11\.80 s \| 182\.0 m \| 41\.60 m\/s \|/);
  assert.match(report, /### Multi-body center-of-mass separation/);
  assert.match(report, /\| Minimum COM separation \| 0\.400 m \|/);
  assert.match(report, /Closest pair \| retained-vehicle \/ booster\/logical-1 at 4\.20 s/);
  assert.match(report, /Closing speed at closest pair \| not estimated/);
  assert.match(report, /Pairwise fixture warning/);
  assert.match(report, /### Coupled separation impulse allocation/);
  assert.match(report, /Impulse allocator fixture warning/);
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
    () => createUncertaintyCsv({
      modelVersion: "fixture",
      validationStatus: "preview",
      seed: "seed",
      method: "latin-hypercube",
      requestedSampleCount: 1,
      successfulSampleCount: 1,
      failedSampleCount: 0,
      parameters: [],
      correlations: [],
      samples: [{ index: 0, inputs: { scale: Number.NaN }, outputs: null, error: "bad" }],
    }),
    /must be finite/,
  );
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
