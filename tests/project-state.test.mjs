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
  assert.equal(JSON.parse(serialized).schema, LOCAL_PROJECT_SCHEMA_ID);
  assert.equal(projectInputFingerprint(source.inputs), projectInputFingerprint({ ...inputs }));
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
