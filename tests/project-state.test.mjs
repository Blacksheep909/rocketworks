import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LOCAL_HISTORY_LIMIT,
  LOCAL_PROJECT_HISTORY_SCHEMA_ID,
  LOCAL_PROJECT_SCHEMA_ID,
  appendProjectHistory,
  createEmptyProjectHistory,
  createLocalProjectSnapshot,
  describeProjectConfigurationChanges,
  describeProjectInputChanges,
  parseLocalProjectHistory,
  parseLocalProjectSnapshot,
  projectInputFingerprint,
  projectConfigurationFingerprint,
  serializeLocalProjectHistory,
  serializeLocalProjectSnapshot,
  validateEditableProjectInputs,
} from "../lib/project/project-state.ts";
import {
  createDefaultVehicleTopology,
  createStagePlan,
} from "../lib/project/vehicle-topology.ts";

const inputs = {
  lengthMm: 710,
  diameterMm: 54,
  payloadMassKg: 0.16,
  material: "kraft",
  thrustN: 22,
  burnTimeS: 1.65,
  dragCoefficient: 0.52,
  launchAltitudeM: 80,
  windSpeedMps: 4,
  recoveryEnabled: true,
  recoveryDelayS: 0,
  recoveryInflationTimeS: 1.2,
  recoveryDeploymentTrigger: "apogee",
  recoveryDeploymentAltitudeM: 150,
  recoveryDeploymentTimeS: 8,
  recoveryDiameterM: 0.45,
  surfacePressureHpa: 1004,
  surfaceTemperatureC: 15,
};

function snapshot(revision, overrides = {}, topology) {
  return createLocalProjectSnapshot({
    projectId: "arc54",
    projectName: "ARC 54",
    revision,
    savedAtIso: new Date(Date.UTC(2026, 7, 1, 0, 0, revision)).toISOString(),
    inputs: { ...inputs, ...overrides },
    ...(topology === undefined ? {} : { topology }),
  });
}

test("local project snapshots round-trip through a strict versioned schema", () => {
  const source = snapshot(1);
  const serialized = serializeLocalProjectSnapshot(source);
  assert.ok(serialized.endsWith("\n"));
  assert.deepEqual(parseLocalProjectSnapshot(serialized), source);
  assert.equal(source.inputs.launchRailEnabled, true);
  assert.equal(source.inputs.launchRailLengthM, 1.2);
  assert.equal(source.inputs.launchRailInclinationDeg, 0);
  assert.equal(source.inputs.launchRailAzimuthDeg, 0);
  assert.equal(source.inputs.launchRailFrictionAccelerationMps2, 0);
  assert.equal(source.inputs.launchRailTipOffPitchRateDegS, 0);
  assert.equal(source.inputs.launchRailTipOffYawRateDegS, 0);
  assert.equal(source.inputs.windAzimuthDeg, 0);
  assert.equal(source.inputs.launchSiteName, "ARC 54 synthetic range");
  assert.equal(source.inputs.launchLatitudeDeg, -36.85);
  assert.equal(source.inputs.launchLongitudeDeg, 174.76);
  assert.deepEqual(source.inputs.windProfileLayers, []);
  assert.equal(source.inputs.turbulenceScale, 1);
  assert.equal(source.inputs.weatherSeed, "arc54-weather-v1");
  assert.equal(source.inputs.noseLengthMm, 180);
  assert.equal(source.inputs.noseProfile, "ogive");
  assert.equal(source.inputs.finCount, 3);
  assert.equal(source.inputs.recoveryMassKg, 0.06);
  assert.equal(source.inputs.recoveryDeploymentSuccessProbability, 0.9);
  assert.equal(source.inputs.recoveryInflationTimeS, 1.2);
  assert.equal(source.inputs.recoveryDeploymentTrigger, "apogee");
  assert.equal(source.inputs.recoveryDeploymentAltitudeM, 150);
  assert.equal(source.inputs.recoveryDeploymentTimeS, 8);
  assert.equal(source.inputs.recoveryReefingEnabled, false);
  assert.equal(source.inputs.recoveryReefingDurationS, 3);
  assert.equal(source.inputs.recoveryReefingStartAreaFraction, 0.35);
  assert.equal(source.inputs.relativeHumidityPercent, 60);
  assert.equal(source.inputs.surfacePressureHpa, 1004);
  assert.equal(source.inputs.surfaceTemperatureC, 15);
  assert.equal(source.inputs.terrainModel, "flat");
  assert.equal(source.inputs.terrainEastSlopePercent, 0);
  assert.equal(source.inputs.terrainNorthSlopePercent, 0);
  assert.equal(JSON.parse(serialized).schema, LOCAL_PROJECT_SCHEMA_ID);
  assert.equal(projectInputFingerprint(source.inputs), projectInputFingerprint({ ...inputs }));
});

test("project checkpoints can carry validated vehicle topology and fingerprint it", () => {
  const topology = {
    ...createDefaultVehicleTopology(),
    stages: [
      ...createDefaultVehicleTopology().stages,
      createStagePlan({
        id: "upper-01",
        name: "Upper stage 1",
        role: "upper",
        attachment: "serial",
        parentStageId: "sustainer",
        bodyLengthM: 0.42,
        diameterM: 0.044,
        noseLengthM: 0.12,
        gimbalSchedule: [{ timeS: 0, pitchDeg: 0, yawDeg: 0 }],
        gimbalResponseTimeS: 0.25,
        throttleSchedule: [
          { timeS: 0, throttleFraction: 0.7 },
          { timeS: 1.2, throttleFraction: 1 },
        ],
      }),
    ],
  };
  const source = createLocalProjectSnapshot({
    ...snapshot(1, {}, topology),
    selectedMotorId: "user.motor-01",
    selectedAerodynamicTableId: "wind-tunnel-01",
  });
  assert.deepEqual(parseLocalProjectSnapshot(serializeLocalProjectSnapshot(source)), source);
  assert.equal(source.topology?.stages.length, 2);
  assert.equal(source.topology?.stages[1].bodyLengthM, 0.42);
  assert.equal(source.topology?.stages[1].gimbalResponseTimeS, 0.25);
  assert.deepEqual(source.topology?.stages[1].throttleSchedule, [
    { timeS: 0, throttleFraction: 0.7 },
    { timeS: 1.2, throttleFraction: 1 },
  ]);
  assert.equal(source.selectedMotorId, "user.motor-01");
  assert.equal(source.selectedAerodynamicTableId, "wind-tunnel-01");
  assert.equal(
    projectConfigurationFingerprint({
      inputs: source.inputs,
      topology,
      selectedMotorId: source.selectedMotorId,
      selectedAerodynamicTableId: source.selectedAerodynamicTableId,
    }),
    projectConfigurationFingerprint({
      inputs: { ...inputs },
      topology,
      selectedMotorId: "user.motor-01",
      selectedAerodynamicTableId: "wind-tunnel-01",
    }),
  );
  assert.match(
    describeProjectConfigurationChanges(inputs, inputs, undefined, topology),
    /vehicle topology/,
  );
  assert.match(
    describeProjectConfigurationChanges(
      inputs,
      inputs,
      topology,
      topology,
      { selectedMotorId: "synthetic", selectedAerodynamicTableId: "constant" },
      { selectedMotorId: source.selectedMotorId, selectedAerodynamicTableId: source.selectedAerodynamicTableId },
    ),
    /motor source \+ aerodynamic source/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...source, topology: { ...topology, stages: [] } }),
    /requires 1 through/,
  );
});

test("legacy snapshots receive explicit surface-weather defaults", () => {
  const legacy = snapshot(1, { relativeHumidityPercent: undefined, surfacePressureHpa: undefined, surfaceTemperatureC: undefined });
  assert.equal(legacy.inputs.relativeHumidityPercent, 60);
  assert.equal(legacy.inputs.surfacePressureHpa, 1004);
  assert.equal(legacy.inputs.surfaceTemperatureC, 15);
  assert.equal(legacy.inputs.windAzimuthDeg, 0);
  assert.equal(legacy.inputs.launchSiteName, "ARC 54 synthetic range");
  assert.equal(legacy.inputs.launchLatitudeDeg, -36.85);
  assert.equal(legacy.inputs.launchLongitudeDeg, 174.76);
  assert.equal(legacy.inputs.recoveryReefingEnabled, false);
  assert.equal(legacy.inputs.recoveryReefingDurationS, 3);
  assert.equal(legacy.inputs.recoveryReefingStartAreaFraction, 0.35);
  assert.equal(legacy.inputs.recoveryDeploymentTrigger, "apogee");
  assert.equal(legacy.inputs.recoveryDeploymentAltitudeM, 150);
  assert.equal(legacy.inputs.recoveryDeploymentTimeS, 8);
  assert.equal(legacy.inputs.recoveryInflationTimeS, 1.2);
  assert.equal(legacy.inputs.uncertaintySampleCount, 48);
  assert.equal(legacy.inputs.uncertaintySeed, "arc54-preview-v1");
  assert.equal(legacy.inputs.turbulenceScale, 1);
  assert.equal(legacy.inputs.weatherSeed, "arc54-weather-v1");
  assert.deepEqual(legacy.inputs.uncertaintyCorrelations, []);
});

test("project snapshots preserve the opt-in Earth rotation control", () => {
  const source = snapshot(1, { earthRotationEnabled: true });
  assert.equal(source.inputs.earthRotationEnabled, true);
  assert.deepEqual(parseLocalProjectSnapshot(serializeLocalProjectSnapshot(source)), source);
  assert.equal(snapshot(2).inputs.earthRotationEnabled, undefined);
  assert.throws(
    () => snapshot(3, { earthRotationEnabled: "yes" }),
    /earthRotationEnabled/,
  );
});

test("project snapshots preserve the opt-in normal-gravity control", () => {
  const source = snapshot(1, { normalGravityEnabled: true });
  assert.equal(source.inputs.normalGravityEnabled, true);
  assert.deepEqual(parseLocalProjectSnapshot(serializeLocalProjectSnapshot(source)), source);
  assert.equal(snapshot(2).inputs.normalGravityEnabled, undefined);
  assert.throws(
    () => snapshot(3, { normalGravityEnabled: "yes" }),
    /normalGravityEnabled/,
  );
});

test("project snapshots preserve the relation normal-force model", () => {
  const projectInputs = { ...inputs, normalForceModel: "supersonic-linearized" };
  const snapshot = createLocalProjectSnapshot({
    projectId: "arc54",
    projectName: "Compressibility fixture",
    revision: 1,
    savedAtIso: "2026-01-01T00:00:00.000Z",
    inputs: projectInputs,
  });
  const parsed = parseLocalProjectSnapshot(serializeLocalProjectSnapshot(snapshot));
  assert.equal(parsed.inputs.normalForceModel, "supersonic-linearized");
  assert.throws(
    () => validateEditableProjectInputs({ ...projectInputs, normalForceModel: "unknown" }),
    /normalForceModel must/,
  );
});

test("project snapshots preserve the opt-in induced-drag polar", () => {
  const projectInputs = {
    ...inputs,
    inducedDragModel: "quadratic-normal-force",
    inducedDragFactor: 0.75,
  };
  const source = createLocalProjectSnapshot({
    projectId: "arc54",
    projectName: "Induced drag fixture",
    revision: 1,
    savedAtIso: "2026-01-01T00:00:00.000Z",
    inputs: projectInputs,
  });
  const parsed = parseLocalProjectSnapshot(serializeLocalProjectSnapshot(source));
  assert.equal(parsed.inputs.inducedDragModel, "quadratic-normal-force");
  assert.equal(parsed.inputs.inducedDragFactor, 0.75);
  assert.throws(
    () => validateEditableProjectInputs({ ...projectInputs, inducedDragModel: "unknown" }),
    /inducedDragModel must/,
  );
  assert.throws(
    () => validateEditableProjectInputs({ ...projectInputs, inducedDragFactor: 10.1 }),
    /inducedDragFactor must/,
  );
});

test("project snapshots preserve coupled-flight contract settings and legacy defaults remain absent", () => {
  const source = snapshot(1, {
    coupledMutualGravityEnabled: true,
    coupledGravitySofteningRadiusM: 0.08,
    coupledContactEnabled: true,
    coupledContactStiffnessNPerM: 75_000,
    coupledContactDampingNsPerM: 125,
    coupledContactMaximumNormalForceN: 250_000,
    releasedBodyDragModel: "coefficient-table",
    relativeAeroInteractionEnabled: false,
    relativeAeroWakeHalfAngleDeg: 12,
    relativeAeroWakeRecoveryDistanceBodyDiameters: 48,
    relativeAeroPeakVelocityDeficitFraction: 0.45,
    relativeAeroMaximumVelocityDeficitFraction: 0.72,
    separationContactStoppingDistanceM: 0.025,
    separationContactCoefficientOfRestitution: 0.35,
    sixDofIntegrationMethod: "adaptive-rk4-step-doubling",
  });
  const parsed = parseLocalProjectSnapshot(serializeLocalProjectSnapshot(source));
  assert.equal(parsed.inputs.coupledMutualGravityEnabled, true);
  assert.equal(parsed.inputs.coupledGravitySofteningRadiusM, 0.08);
  assert.equal(parsed.inputs.coupledContactEnabled, true);
  assert.equal(parsed.inputs.coupledContactStiffnessNPerM, 75_000);
  assert.equal(parsed.inputs.coupledContactDampingNsPerM, 125);
  assert.equal(parsed.inputs.coupledContactMaximumNormalForceN, 250_000);
  assert.equal(parsed.inputs.releasedBodyDragModel, "coefficient-table");
  assert.equal(parsed.inputs.relativeAeroInteractionEnabled, false);
  assert.equal(parsed.inputs.relativeAeroWakeHalfAngleDeg, 12);
  assert.equal(parsed.inputs.relativeAeroWakeRecoveryDistanceBodyDiameters, 48);
  assert.equal(parsed.inputs.relativeAeroPeakVelocityDeficitFraction, 0.45);
  assert.equal(parsed.inputs.relativeAeroMaximumVelocityDeficitFraction, 0.72);
  assert.equal(parsed.inputs.separationContactStoppingDistanceM, 0.025);
  assert.equal(parsed.inputs.separationContactCoefficientOfRestitution, 0.35);
  assert.equal(parsed.inputs.sixDofIntegrationMethod, "adaptive-rk4-step-doubling");
  assert.equal(snapshot(2).inputs.coupledMutualGravityEnabled, undefined);
  assert.equal(snapshot(2).inputs.releasedBodyDragModel, undefined);
});

test("project snapshots reject invalid coupled-flight contract settings", () => {
  assert.throws(
    () => snapshot(1, { coupledGravitySofteningRadiusM: 1.01 }),
    /coupledGravitySofteningRadiusM must be/,
  );
  assert.throws(
    () => snapshot(1, { coupledContactEnabled: "yes" }),
    /coupledContactEnabled must be/,
  );
  assert.throws(
    () => snapshot(1, { coupledContactStiffnessNPerM: 0 }),
    /coupledContactStiffnessNPerM must be/,
  );
  assert.throws(
    () => snapshot(1, { coupledContactDampingNsPerM: -1 }),
    /coupledContactDampingNsPerM must be/,
  );
  assert.throws(
    () => snapshot(1, { coupledContactMaximumNormalForceN: 1e10 + 1 }),
    /coupledContactMaximumNormalForceN must be/,
  );
  assert.throws(
    () => snapshot(1, { releasedBodyDragModel: "unsupported" }),
    /releasedBodyDragModel must be/,
  );
  assert.throws(
    () => snapshot(1, { relativeAeroInteractionEnabled: "yes" }),
    /relativeAeroInteractionEnabled must be/,
  );
  assert.throws(
    () => snapshot(1, { relativeAeroWakeHalfAngleDeg: 45.1 }),
    /relativeAeroWakeHalfAngleDeg/,
  );
  assert.throws(
    () => snapshot(1, { relativeAeroPeakVelocityDeficitFraction: 0.8, relativeAeroMaximumVelocityDeficitFraction: 0.7 }),
    /cannot exceed/,
  );
  assert.throws(
    () => snapshot(1, { separationContactStoppingDistanceM: 0 }),
    /separationContactStoppingDistanceM must be/,
  );
  assert.throws(
    () => snapshot(1, { separationContactCoefficientOfRestitution: 1.01 }),
    /separationContactCoefficientOfRestitution must be/,
  );
  assert.throws(
    () => snapshot(1, { sixDofIntegrationMethod: "euler" }),
    /sixDofIntegrationMethod must be/,
  );
});

test("custom material profiles persist only when selected and remain bounded", () => {
  const customMaterial = {
    label: "Test laminate",
    densityKgM3: 1_280,
    wallThicknessMm: 1.1,
    youngsModulusGPa: 32,
    poissonRatio: 0.28,
    allowableCompressionMPa: 90,
    allowableBendingMPa: 84,
    allowableShearMPa: 26,
  };
  const custom = validateEditableProjectInputs({
    ...inputs,
    material: "custom",
    customMaterial,
  });
  assert.deepEqual(custom.customMaterial, customMaterial);
  const parsed = parseLocalProjectSnapshot(serializeLocalProjectSnapshot(snapshot(3, {
    material: "custom",
    customMaterial,
  })));
  assert.deepEqual(parsed.inputs.customMaterial, customMaterial);
  assert.equal(snapshot(4).inputs.customMaterial, undefined);
  assert.throws(
    () => validateEditableProjectInputs({
      ...inputs,
      material: "custom",
      customMaterial: { ...customMaterial, wallThicknessMm: 0.01 },
    }),
    /wallThicknessMm must be a finite number/,
  );
  assert.throws(
    () => validateEditableProjectInputs({
      ...inputs,
      material: "custom",
      customMaterial: { ...customMaterial, label: "" },
    }),
    /label must be a non-empty string/,
  );
});

test("project snapshots persist bounded uncertainty dependence assumptions", () => {
  const source = snapshot(1, {
    uncertaintyCorrelations: [
      { firstParameterKey: "dryMassScale", secondParameterKey: "thrustScale", coefficient: 0.35 },
    ],
  });
  assert.deepEqual(parseLocalProjectSnapshot(serializeLocalProjectSnapshot(source)), source);
  assert.equal(describeProjectInputChanges(inputs, source.inputs), "Changed uncertainty correlation model");
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(2), inputs: { ...inputs, uncertaintyCorrelations: [{ firstParameterKey: "dryMassScale", secondParameterKey: "dryMassScale", coefficient: 0.2 }] } }),
    /cannot be correlated with itself/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(2), inputs: { ...inputs, uncertaintyCorrelations: [{ firstParameterKey: "dryMassScale", secondParameterKey: "thrustScale", coefficient: 0.999 }] } }),
    /strictly between/,
  );
});

test("project snapshots validate and persist custom ENU wind layers", () => {
  const profile = [
    { altitudeM: 0, eastMps: 3, northMps: 1, upMps: 0 },
    { altitudeM: 500, eastMps: 5, northMps: 2, upMps: 0.1 },
    { altitudeM: 2_000, eastMps: 8, northMps: 4, upMps: -0.2 },
  ];
  const source = snapshot(1, { windProfileLayers: profile });
  assert.deepEqual(parseLocalProjectSnapshot(serializeLocalProjectSnapshot(source)).inputs.windProfileLayers, profile);
  assert.equal(describeProjectInputChanges(inputs, source.inputs), "Changed altitude-dependent wind profile");
  assert.throws(
    () => snapshot(2, { windProfileLayers: [{ altitudeM: 0, eastMps: 1, northMps: 0, upMps: 0 }] }),
    /at least two layers/,
  );
  assert.throws(
    () => snapshot(2, { windProfileLayers: [{ altitudeM: 500, eastMps: 1, northMps: 0, upMps: 0 }, { altitudeM: 0, eastMps: 1, northMps: 0, upMps: 0 }] }),
    /strictly increasing/,
  );
  assert.throws(
    () => snapshot(2, { windProfileLayers: [{ altitudeM: 0, eastMps: 201, northMps: 0, upMps: 0 }, { altitudeM: 500, eastMps: 1, northMps: 0, upMps: 0 }] }),
    /eastMps/,
  );
});

test("invalid, unsupported, and out-of-range snapshots fail explicitly", () => {
  assert.throws(() => parseLocalProjectSnapshot("not json"), /Could not read local project snapshot/);
  assert.throws(
    () => parseLocalProjectSnapshot(JSON.stringify({ ...snapshot(1), schemaVersion: 2 })),
    /Unsupported local project schema version/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, diameterMm: 500 } }),
    /diameterMm/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, launchRailLengthM: 12.1 } }),
    /launchRailLengthM/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, launchRailInclinationDeg: 30.1 } }),
    /launchRailInclinationDeg/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, launchRailAzimuthDeg: 180.1 } }),
    /launchRailAzimuthDeg/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, launchRailFrictionAccelerationMps2: 50.1 } }),
    /launchRailFrictionAccelerationMps2/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, launchRailTipOffPitchRateDegS: 1146 } }),
    /launchRailTipOffPitchRateDegS/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, windAzimuthDeg: 180.1 } }),
    /windAzimuthDeg/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, turbulenceScale: 3.1 } }),
    /turbulenceScale/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, weatherSeed: "" } }),
    /weatherSeed/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, launchLatitudeDeg: 90.1 } }),
    /launchLatitudeDeg/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, launchLongitudeDeg: -180.1 } }),
    /launchLongitudeDeg/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, launchSiteName: "" } }),
    /launchSiteName/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, recoveryDeploymentSuccessProbability: 1.1 } }),
    /recoveryDeploymentSuccessProbability/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, recoveryDeploymentTrigger: "unknown" } }),
    /recoveryDeploymentTrigger/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, recoveryDeploymentAltitudeM: -1 } }),
    /recoveryDeploymentAltitudeM/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, recoveryReefingEnabled: "yes" } }),
    /recoveryReefingEnabled/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, recoveryReefingStartAreaFraction: 0.01 } }),
    /recoveryReefingStartAreaFraction/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, relativeHumidityPercent: 100.1 } }),
    /relativeHumidityPercent/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, surfacePressureHpa: 10 } }),
    /surfacePressureHpa/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, surfaceTemperatureC: -91 } }),
    /surfaceTemperatureC/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, uncertaintySampleCount: 15 } }),
    /uncertaintySampleCount/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, uncertaintySampleCount: 513 } }),
    /uncertaintySampleCount/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, uncertaintySeed: "" } }),
    /uncertaintySeed/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, noseProfile: "parabolic" } }),
    /noseProfile/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, finCount: 3.5 } }),
    /finCount/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, finSweepMm: 100, finTipChordMm: 80 } }),
    /finSweepMm plus finTipChordMm/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), selectedMotorId: "" }),
    /selectedMotorId/,
  );
  assert.throws(
    () => createLocalProjectSnapshot({ ...snapshot(1), selectedAerodynamicTableId: "" }),
    /selectedAerodynamicTableId/,
  );
});

test("history describes changes, suppresses autosave duplicates, and preserves manual duplicates", () => {
  let history = createEmptyProjectHistory("arc54");
  history = appendProjectHistory(history, snapshot(1), "Initial local snapshot");
  const duplicate = appendProjectHistory(history, snapshot(2), "No input changes");
  assert.equal(duplicate.entries.length, 1);
  history = appendProjectHistory(history, snapshot(2), "Manual checkpoint", { allowDuplicate: true });
  history = appendProjectHistory(history, snapshot(3, { diameterMm: 60, windSpeedMps: 6 }), "Edited");
  assert.equal(history.entries.length, 3);
  assert.equal(describeProjectInputChanges(inputs, history.entries[2].snapshot.inputs), "Changed outer diameter and wind speed");
  assert.equal(describeProjectInputChanges(inputs, { ...inputs, uncertaintySampleCount: 64 }), "Changed uncertainty scenario count");
  assert.equal(JSON.parse(serializeLocalProjectHistory(history)).schema, LOCAL_PROJECT_HISTORY_SCHEMA_ID);
  assert.deepEqual(parseLocalProjectHistory(serializeLocalProjectHistory(history)), history);
});

test("history keeps topology and source-only changes instead of suppressing them as input duplicates", () => {
  const topology = {
    ...createDefaultVehicleTopology(),
    stages: [
      ...createDefaultVehicleTopology().stages,
      createStagePlan({
        id: "upper-01",
        name: "Upper stage 1",
        role: "upper",
        attachment: "serial",
        parentStageId: "sustainer",
      }),
    ],
  };
  let history = appendProjectHistory(createEmptyProjectHistory("arc54"), snapshot(1), "Initial");
  history = appendProjectHistory(
    history,
    createLocalProjectSnapshot({ ...snapshot(2), topology }),
    "Changed vehicle topology",
  );
  assert.equal(history.entries.length, 2);
  history = appendProjectHistory(
    history,
    createLocalProjectSnapshot({ ...snapshot(3), selectedMotorId: "user.motor-01" }),
    "Changed motor source",
  );
  assert.equal(history.entries.length, 3);
});

test("history is bounded and rejects cross-project or non-monotonic records", () => {
  let history = createEmptyProjectHistory("arc54");
  for (let revision = 1; revision <= DEFAULT_LOCAL_HISTORY_LIMIT + 5; revision += 1) {
    history = appendProjectHistory(history, snapshot(revision, { thrustN: 22 + revision }), `Revision ${revision}`);
  }
  assert.equal(history.entries.length, DEFAULT_LOCAL_HISTORY_LIMIT);
  assert.equal(history.entries[0].snapshot.revision, 6);
  assert.throws(() => appendProjectHistory(history, snapshot(45, { thrustN: 70 }), "Old"), /increasing revisions/);
  assert.throws(
    () => appendProjectHistory(history, createLocalProjectSnapshot({ ...snapshot(46), projectId: "other" }), "Other"),
    /does not match/,
  );
});

test("malformed histories reject duplicate IDs and inconsistent projects", () => {
  const first = appendProjectHistory(createEmptyProjectHistory("arc54"), snapshot(1), "Initial");
  const raw = JSON.parse(serializeLocalProjectHistory(first));
  raw.entries.push(raw.entries[0]);
  assert.throws(() => parseLocalProjectHistory(JSON.stringify(raw)), /Duplicate history entry id/);
  raw.entries = [{ ...raw.entries[0], snapshot: { ...raw.entries[0].snapshot, projectId: "other" } }];
  assert.throws(() => parseLocalProjectHistory(JSON.stringify(raw)), /does not match/);
});
