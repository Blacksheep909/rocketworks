import assert from "node:assert/strict";
import test from "node:test";

import {
  compareProjectSnapshots,
  PROJECT_DIFF_MODEL_VERSION,
} from "../lib/project/project-diff.ts";
import {
  createLocalProjectSnapshot,
} from "../lib/project/project-state.ts";
import { createDefaultVehicleTopology } from "../lib/project/vehicle-topology.ts";

const baseInputs = {
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

function snapshot(revision, overrides = {}) {
  return createLocalProjectSnapshot({
    projectId: "arc54",
    projectName: "ARC 54",
    revision,
    savedAtIso: `2026-08-21T09:0${revision}:00.000Z`,
    inputs: { ...baseInputs, ...overrides.inputs },
    topology: overrides.topology ?? createDefaultVehicleTopology(),
    selectedMotorId: overrides.selectedMotorId,
    selectedAerodynamicTableId: overrides.selectedAerodynamicTableId,
  });
}

test("project snapshot diffs expose signed before/after design review rows", () => {
  const diff = compareProjectSnapshots(
    snapshot(1),
    snapshot(2, {
      inputs: { diameterMm: 62, windSpeedMps: 8 },
      selectedMotorId: "motor.user-01",
    }),
  );
  assert.equal(diff.modelVersion, PROJECT_DIFF_MODEL_VERSION);
  assert.equal(diff.beforeRevision, 1);
  assert.equal(diff.afterRevision, 2);
  assert.equal(diff.changedCount, 3);
  assert.deepEqual(
    diff.rows.map((row) => [row.category, row.key, row.before, row.after]),
    [
      ["input", "diameterMm", "54", "62"],
      ["input", "windSpeedMps", "4", "8"],
      ["source", "selectedMotorId", "synthetic", "motor.user-01"],
    ],
  );
});

test("project snapshot diffs summarize topology and collection changes", () => {
  const topology = createDefaultVehicleTopology();
  const nextTopology = {
    ...topology,
    stages: topology.stages.map((stage) => ({ ...stage, repeatCount: 2 })),
    components: [
      ...topology.components,
      {
        id: "payload-01",
        name: "Payload",
        stageId: topology.stages[0].id,
        enabled: true,
        kind: "pointMass",
        axialPositionM: 0.2,
        radialOffsetM: 0,
        azimuthDeg: 0,
        massKg: 0.1,
      },
    ],
  };
  const diff = compareProjectSnapshots(
    snapshot(1, { inputs: { windProfileLayers: [] } }),
    snapshot(2, { inputs: { windProfileLayers: [{ altitudeM: 0, eastMps: 4, northMps: 0 }, { altitudeM: 100, eastMps: 6, northMps: 1 }] }, topology: nextTopology, selectedAerodynamicTableId: "table.user-01" }),
  );
  assert.equal(diff.changedCount, 3);
  assert.equal(diff.rows[0].key, "windProfileLayers");
  assert.match(diff.rows[0].after, /2 wind layers/);
  assert.equal(diff.rows[1].category, "topology");
  assert.match(diff.rows[1].after, /2 physical instances/);
  assert.deepEqual(diff.rows[2], {
    category: "source",
    key: "selectedAerodynamicTableId",
    label: "Aerodynamic source",
    before: "constant",
    after: "table.user-01",
  });
});

test("project snapshot diffs reject cross-project comparisons and preserve empty state", () => {
  const first = snapshot(1);
  const second = snapshot(2);
  assert.equal(compareProjectSnapshots(first, second).summary, "No configuration changes");
  assert.throws(
    () => compareProjectSnapshots(first, { ...second, projectId: "other" }),
    /same project/,
  );
});

test("project snapshot diffs retain project identity changes", () => {
  const diff = compareProjectSnapshots(
    snapshot(1),
    { ...snapshot(2), projectName: "ARC 54 Flight Article" },
  );
  assert.deepEqual(diff.rows, [{
    category: "identity",
    key: "projectName",
    label: "Project name",
    before: "ARC 54",
    after: "ARC 54 Flight Article",
  }]);
});
