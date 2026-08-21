import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_PROJECT_REGISTRY_LIMIT,
  LOCAL_PROJECT_REGISTRY_SCHEMA_ID,
  createEmptyProjectRegistry,
  createLocalProjectRecord,
  createProjectId,
  parseLocalProjectRegistry,
  removeLocalProjectRecord,
  serializeLocalProjectRegistry,
  setActiveLocalProject,
  upsertLocalProjectRecord,
  validateLocalProjectRegistry,
} from "../lib/project/project-registry.ts";
import {
  appendProjectHistory,
  createEmptyProjectHistory,
  createLocalProjectSnapshot,
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
  recoveryInflationTimeS: 1.2,
  recoveryDeploymentTrigger: "apogee",
  recoveryDeploymentAltitudeM: 150,
  recoveryDeploymentTimeS: 8,
  recoveryDiameterM: 0.45,
  surfacePressureHpa: 1004,
  surfaceTemperatureC: 15,
};

function snapshot(projectId, projectName, revision = 1) {
  return createLocalProjectSnapshot({
    projectId,
    projectName,
    revision,
    savedAtIso: new Date(Date.UTC(2026, 7, 1, 0, 0, revision)).toISOString(),
    inputs: { ...inputs },
  });
}

function record(projectId = "arc54", projectName = "ARC 54") {
  const source = snapshot(projectId, projectName);
  const history = appendProjectHistory(
    createEmptyProjectHistory(projectId),
    source,
    "Initial local snapshot",
  );
  return createLocalProjectRecord(source, history);
}

test("local project registry round-trips strict records", () => {
  const first = record();
  const second = record("weather-range", "Weather range");
  const registry = upsertLocalProjectRecord(
    upsertLocalProjectRecord(createEmptyProjectRegistry(), first),
    second,
  );
  assert.equal(registry.schema, LOCAL_PROJECT_REGISTRY_SCHEMA_ID);
  assert.equal(registry.activeProjectId, "weather-range");
  assert.deepEqual(parseLocalProjectRegistry(serializeLocalProjectRegistry(registry)), registry);
});

test("registry activation is explicit and rejects unknown projects", () => {
  const registry = upsertLocalProjectRecord(createEmptyProjectRegistry(), record());
  assert.equal(setActiveLocalProject(registry, "arc54").activeProjectId, "arc54");
  assert.throws(
    () => setActiveLocalProject(registry, "missing"),
    /not in the registry/,
  );
});

test("registry replacement preserves the original creation time", () => {
  const first = record();
  const registry = upsertLocalProjectRecord(createEmptyProjectRegistry(), first);
  const revisedSnapshot = snapshot("arc54", "ARC 54", 2);
  const revisedHistory = appendProjectHistory(
    first.history,
    revisedSnapshot,
    "Changed airframe length",
  );
  const revised = createLocalProjectRecord(revisedSnapshot, revisedHistory, "2026-08-01T00:00:01.000Z");
  const updated = upsertLocalProjectRecord(registry, revised);
  assert.equal(updated.projects[0].createdAtIso, first.createdAtIso);
  assert.equal(updated.projects[0].snapshot.revision, 2);
});

test("project ids are stable, readable, and unique", () => {
  assert.equal(createProjectId("Weather Range"), "weather-range");
  assert.equal(createProjectId("Weather Range", ["weather-range"]), "weather-range-2");
  assert.equal(createProjectId("!!!"), "project");
});

test("registry validation catches identity mismatches and capacity overflow", () => {
  const first = record();
  assert.throws(
    () => validateLocalProjectRegistry({
      ...createEmptyProjectRegistry(),
      activeProjectId: "arc54",
      projects: [{ ...first, projectName: "Wrong name" }],
    }),
    /project name does not match/,
  );
  const projects = Array.from({ length: LOCAL_PROJECT_REGISTRY_LIMIT + 1 }, (_, index) => {
    const id = `project-${index + 1}`;
    return record(id, `Project ${index + 1}`);
  });
  assert.throws(
    () => validateLocalProjectRegistry({
      ...createEmptyProjectRegistry("project-1"),
      projects,
    }),
    /cannot contain more than/,
  );
});

test("registry removal picks the newest remaining project when removing the active record", () => {
  const first = createLocalProjectRecord(
    snapshot("first", "First", 1),
    appendProjectHistory(
      createEmptyProjectHistory("first"),
      snapshot("first", "First", 1),
      "First",
    ),
  );
  const secondSnapshot = createLocalProjectSnapshot({
    projectId: "second",
    projectName: "Second",
    revision: 2,
    savedAtIso: "2026-08-21T09:00:00.000Z",
    inputs: { ...inputs },
  });
  const second = createLocalProjectRecord(
    secondSnapshot,
    appendProjectHistory(
      createEmptyProjectHistory("second"),
      secondSnapshot,
      "Second",
    ),
  );
  let registry = upsertLocalProjectRecord(createEmptyProjectRegistry("first"), first);
  registry = upsertLocalProjectRecord(registry, second);
  const removed = removeLocalProjectRecord(registry, "first");
  assert.deepEqual(removed.projects.map((record) => record.projectId), ["second"]);
  assert.equal(removed.activeProjectId, "second");
});

test("registry removal rejects unknown ids without changing the registry", () => {
  const source = record();
  const registry = upsertLocalProjectRecord(createEmptyProjectRegistry(), source);
  assert.throws(
    () => removeLocalProjectRecord(registry, "missing"),
    /Cannot remove local project missing/,
  );
  assert.equal(registry.projects.length, 1);
});
