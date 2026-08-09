import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LOCAL_HISTORY_LIMIT,
  LOCAL_PROJECT_HISTORY_SCHEMA_ID,
  LOCAL_PROJECT_SCHEMA_ID,
  appendProjectHistory,
  createEmptyProjectHistory,
  createLocalProjectSnapshot,
  describeProjectInputChanges,
  parseLocalProjectHistory,
  parseLocalProjectSnapshot,
  projectInputFingerprint,
  serializeLocalProjectHistory,
  serializeLocalProjectSnapshot,
} from "../lib/project/project-state.ts";

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
  recoveryDiameterM: 0.45,
  surfacePressureHpa: 1004,
  surfaceTemperatureC: 15,
};

function snapshot(revision, overrides = {}) {
  return createLocalProjectSnapshot({
    projectId: "arc54",
    projectName: "ARC 54",
    revision,
    savedAtIso: new Date(Date.UTC(2026, 7, 1, 0, 0, revision)).toISOString(),
    inputs: { ...inputs, ...overrides },
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
  assert.equal(source.inputs.noseLengthMm, 180);
  assert.equal(source.inputs.noseProfile, "ogive");
  assert.equal(source.inputs.finCount, 3);
  assert.equal(source.inputs.recoveryMassKg, 0.06);
  assert.equal(source.inputs.recoveryDeploymentSuccessProbability, 0.9);
  assert.equal(source.inputs.recoveryReefingEnabled, false);
  assert.equal(source.inputs.recoveryReefingDurationS, 3);
  assert.equal(source.inputs.recoveryReefingStartAreaFraction, 0.35);
  assert.equal(source.inputs.relativeHumidityPercent, 60);
  assert.equal(source.inputs.surfacePressureHpa, 1004);
  assert.equal(source.inputs.surfaceTemperatureC, 15);
  assert.equal(JSON.parse(serialized).schema, LOCAL_PROJECT_SCHEMA_ID);
  assert.equal(projectInputFingerprint(source.inputs), projectInputFingerprint({ ...inputs }));
});

test("legacy snapshots receive explicit surface-weather defaults", () => {
  const legacy = snapshot(1, { relativeHumidityPercent: undefined, surfacePressureHpa: undefined, surfaceTemperatureC: undefined });
  assert.equal(legacy.inputs.relativeHumidityPercent, 60);
  assert.equal(legacy.inputs.surfacePressureHpa, 1004);
  assert.equal(legacy.inputs.surfaceTemperatureC, 15);
  assert.equal(legacy.inputs.recoveryReefingEnabled, false);
  assert.equal(legacy.inputs.recoveryReefingDurationS, 3);
  assert.equal(legacy.inputs.recoveryReefingStartAreaFraction, 0.35);
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
    () => createLocalProjectSnapshot({ ...snapshot(1), inputs: { ...inputs, recoveryDeploymentSuccessProbability: 1.1 } }),
    /recoveryDeploymentSuccessProbability/,
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
  assert.equal(JSON.parse(serializeLocalProjectHistory(history)).schema, LOCAL_PROJECT_HISTORY_SCHEMA_ID);
  assert.deepEqual(parseLocalProjectHistory(serializeLocalProjectHistory(history)), history);
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
