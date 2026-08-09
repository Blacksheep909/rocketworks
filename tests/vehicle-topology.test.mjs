import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_VEHICLE_TOPOLOGY_SCHEMA_ID,
  MAX_VEHICLE_STAGES,
  createDefaultVehicleTopology,
  createStagePlan,
  parseVehicleTopology,
  serializeVehicleTopology,
  stageThrustAxisBody,
  validateVehicleTopology,
} from "../lib/project/vehicle-topology.ts";

test("default topology is a strict versioned single-core plan", () => {
  const topology = createDefaultVehicleTopology();
  assert.equal(topology.schema, LOCAL_VEHICLE_TOPOLOGY_SCHEMA_ID);
  assert.equal(topology.stages[0].role, "core");
  assert.equal(topology.stages[0].ignitionDelayS, 0);
  assert.equal(topology.stages[0].separationDelayS, 0.1);
  assert.equal(topology.stages[0].ignitionFailure, false);
  assert.equal(topology.stages[0].thrustCantAngleDeg, 0);
  assert.equal(topology.stages[0].thrustCantAzimuthDeg, 0);
  assert.equal(topology.stages[0].motorId, undefined);
  assert.deepEqual(parseVehicleTopology(serializeVehicleTopology(topology)), topology);
});

test("serial upper stages and repeated parallel boosters validate in order", () => {
  const topology = {
    ...createDefaultVehicleTopology(),
    stages: [
      createStagePlan({ id: "sustainer", name: "Sustainer", role: "core", attachment: "serial" }),
      createStagePlan({ id: "upper-01", name: "Upper stage 1", role: "upper", attachment: "serial", parentStageId: "sustainer", motorId: "user.motor-01", aerodynamicTableId: "user.aero-01" }),
      createStagePlan({ id: "booster-01", name: "Booster set 1", role: "booster", attachment: "parallel", parentStageId: "sustainer", repeatCount: 3, repeatRadiusM: 0.12, thrustCantAngleDeg: 4.5, thrustCantAzimuthDeg: 90 }),
    ],
  };
  const validated = validateVehicleTopology(topology);
  assert.equal(validated.stages[2].repeatCount, 3);
  assert.equal(validated.stages[2].parentStageId, "sustainer");
  assert.equal(validated.stages[1].motorId, "user.motor-01");
  assert.equal(validated.stages[1].aerodynamicTableId, "user.aero-01");
  assert.equal(validated.stages[2].thrustCantAngleDeg, 4.5);
  assert.equal(validated.stages[2].thrustCantAzimuthDeg, 90);
});

test("topology rejects unsafe structure edits explicitly", () => {
  const base = createDefaultVehicleTopology();
  assert.throws(() => validateVehicleTopology({ ...base, stages: [] }), /requires 1/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], role: "upper" }] }), /first vehicle stage/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], id: "bad id" }] }), /may contain only/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], ignitionDelayS: -1 }] }), /ignitionDelayS/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], separationDelayS: 121 }] }), /separationDelayS/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], thrustCantAngleDeg: 16 }] }), /thrustCantAngleDeg/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], thrustCantAzimuthDeg: 181 }] }), /thrustCantAzimuthDeg/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], ignitionFailure: "yes" }] }), /ignitionFailure/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], motorId: "bad motor" }] }), /motorId/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], aerodynamicTableId: "bad table" }] }), /aerodynamicTableId/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [...base.stages, { ...base.stages[0], id: "booster", role: "booster", attachment: "parallel", parentStageId: "missing" }] }), /parent must appear earlier/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: Array.from({ length: MAX_VEHICLE_STAGES + 1 }, (_, index) => ({ ...base.stages[0], id: index === 0 ? "sustainer" : `stage-${index}`, role: index === 0 ? "core" : "upper", parentStageId: index === 0 ? undefined : "sustainer" })) }), /requires 1 through/);
});

test("canted thrust axes stay unit length and rotate with radial instances", () => {
  const stage = createStagePlan({
    id: "booster",
    name: "Booster",
    role: "booster",
    attachment: "parallel",
    parentStageId: "sustainer",
    repeatCount: 4,
    thrustCantAngleDeg: 6,
    thrustCantAzimuthDeg: 0,
  });
  const axes = Array.from({ length: 4 }, (_, index) => stageThrustAxisBody(stage, index));
  for (const axis of axes) {
    assert.ok(Math.abs(Math.hypot(axis.x, axis.y, axis.z) - 1) < 1e-12);
  }
  assert.ok(Math.abs(axes[0].y + axes[2].y) < 1e-12);
  assert.ok(Math.abs(axes[0].z) < 1e-12);
  assert.ok(Math.abs(axes[2].z) < 1e-12);
  assert.ok(Math.abs(axes[1].y) < 1e-12);
  assert.ok(Math.abs(axes[3].y) < 1e-12);
  assert.ok(axes[1].z > 0);
  assert.ok(axes[3].z < 0);
});
