import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_WORKSPACE_BACKUP_SCHEMA_ID,
  createLocalWorkspaceBackup,
  parseLocalWorkspaceBackup,
  serializeLocalWorkspaceBackup,
  validateLocalWorkspaceBackup,
} from "../lib/project/workspace-backup.ts";
import {
  appendProjectHistory,
  createEmptyProjectHistory,
  createLocalProjectSnapshot,
} from "../lib/project/project-state.ts";
import {
  createEmptyProjectRegistry,
  createLocalProjectRecord,
  upsertLocalProjectRecord,
} from "../lib/project/project-registry.ts";

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

function registry() {
  const snapshot = createLocalProjectSnapshot({
    projectId: "arc54",
    projectName: "ARC 54",
    revision: 1,
    savedAtIso: "2026-08-21T07:00:00.000Z",
    inputs,
  });
  const history = appendProjectHistory(
    createEmptyProjectHistory("arc54"),
    snapshot,
    "Initial local snapshot",
  );
  return upsertLocalProjectRecord(
    createEmptyProjectRegistry(),
    createLocalProjectRecord(snapshot, history),
  );
}

test("workspace backups round-trip the validated registry envelope", () => {
  const source = createLocalWorkspaceBackup(registry(), "2026-08-21T07:30:00.000Z");
  const serialized = serializeLocalWorkspaceBackup(source);
  const parsed = parseLocalWorkspaceBackup(serialized);
  assert.ok(serialized.endsWith("\n"));
  assert.equal(source.schema, LOCAL_WORKSPACE_BACKUP_SCHEMA_ID);
  assert.deepEqual(parsed, source);
  assert.equal(parsed.registry.projects[0].projectId, "arc54");
  assert.ok(parsed.notes.some((note) => note.includes("Cloud sync")));
});

test("workspace backups reject malformed identity and missing boundaries", () => {
  const source = createLocalWorkspaceBackup(registry(), "2026-08-21T07:30:00.000Z");
  assert.throws(
    () => validateLocalWorkspaceBackup({ ...source, source: "cloud" }),
    /Unsupported local workspace backup source/,
  );
  assert.throws(
    () => validateLocalWorkspaceBackup({ ...source, notes: [] }),
    /must disclose its handoff boundary/,
  );
  assert.throws(
    () => parseLocalWorkspaceBackup(JSON.stringify({ ...source, registry: { ...source.registry, activeProjectId: "missing" } })),
    /Could not read local workspace backup: Active project missing/,
  );
});
