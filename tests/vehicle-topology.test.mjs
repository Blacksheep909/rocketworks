import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_VEHICLE_TOPOLOGY_SCHEMA_ID,
  MAX_VEHICLE_COMPONENTS,
  MAX_VEHICLE_STAGES,
  createDefaultVehicleTopology,
  createStagePlan,
  duplicateVehicleStageTopology,
  parseVehicleTopology,
  removeVehicleStageTopology,
  serializeVehicleTopology,
  stageThrustAxisBody,
  stageThrustAxisWithGimbal,
  validateVehicleTopology,
} from "../lib/project/vehicle-topology.ts";

test("default topology is a strict versioned single-core plan", () => {
  const topology = createDefaultVehicleTopology();
  assert.equal(topology.schema, LOCAL_VEHICLE_TOPOLOGY_SCHEMA_ID);
  assert.equal(topology.stages[0].role, "core");
  assert.equal(topology.stages[0].ignitionDelayS, 0);
  assert.equal(topology.stages[0].separationDelayS, 0.1);
  assert.equal(topology.stages[0].separationDeltaVBodyMps, 0);
  assert.equal(topology.stages[0].ignitionFailure, false);
  assert.deepEqual(topology.stages[0].failedMotorInstanceIndices, []);
  assert.equal(topology.stages[0].thrustCantAngleDeg, 0);
  assert.equal(topology.stages[0].thrustCantAzimuthDeg, 0);
  assert.equal(topology.stages[0].motorId, undefined);
  assert.deepEqual(topology.components, []);
  assert.deepEqual(parseVehicleTopology(serializeVehicleTopology(topology)), topology);
});

test("bounded equipment and cylindrical pod components validate and round-trip", () => {
  const topology = {
    ...createDefaultVehicleTopology(),
    stages: [
      createStagePlan({ id: "sustainer", name: "Sustainer", role: "core", attachment: "serial" }),
      createStagePlan({ id: "upper-01", name: "Upper stage", role: "upper", attachment: "serial", parentStageId: "sustainer" }),
    ],
    components: [
      {
        id: "avionics",
        name: "Avionics bay",
        stageId: "sustainer",
        enabled: true,
        kind: "pointMass",
        axialPositionM: 0.42,
        radialOffsetM: 0.018,
        azimuthDeg: 45,
        massKg: 0.24,
        inertiaAtCenterKgM2: { x: 0.00002, y: 0.0014, z: 0.0018 },
      },
      {
        id: "camera-pod",
        name: "Camera pod",
        stageId: "upper-01",
        enabled: true,
        kind: "cylindricalPod",
        axialPositionM: 0.08,
        radialOffsetM: 0.07,
        azimuthDeg: -90,
        lengthM: 0.25,
        diameterM: 0.06,
        wallThicknessM: 0.001,
        densityKgM3: 850,
      },
    ],
  };
  const validated = validateVehicleTopology(topology);
  assert.equal(validated.components[0].massKg, 0.24);
  assert.deepEqual(validated.components[0].inertiaAtCenterKgM2, { x: 0.00002, y: 0.0014, z: 0.0018 });
  assert.equal(validated.components[1].diameterM, 0.06);
  assert.deepEqual(parseVehicleTopology(serializeVehicleTopology(validated)), validated);
  assert.deepEqual(validateVehicleTopology({ ...topology, components: undefined }).components, []);
  assert.throws(() => validateVehicleTopology({ ...topology, components: [{ ...topology.components[0], stageId: "missing" }] }), /unknown stage/);
  assert.throws(() => validateVehicleTopology({ ...topology, components: [{ ...topology.components[0], id: "avionics" }, { ...topology.components[0], id: "avionics" }] }), /Duplicate topology component/);
  assert.throws(() => validateVehicleTopology({ ...topology, components: [{ ...topology.components[1], wallThicknessM: 0.04 }] }), /wallThicknessM/);
  assert.throws(() => validateVehicleTopology({ ...topology, components: [{ ...topology.components[0], inertiaAtCenterKgM2: { x: -1, y: 0, z: 0 } }] }), /inertia x/);
  assert.throws(() => validateVehicleTopology({ ...topology, components: [{ ...topology.components[0], inertiaAtCenterKgM2: { x: 0, y: 101, z: 0 } }] }), /inertia y/);
  assert.throws(() => validateVehicleTopology({ ...topology, components: Array.from({ length: MAX_VEHICLE_COMPONENTS + 1 }, (_, index) => ({ ...topology.components[0], id: `equipment-${index}` })) }), /components must contain/);
});

test("stage duplication preserves configuration and copies authored components", () => {
  const topology = {
    ...createDefaultVehicleTopology(),
    stages: [
      createStagePlan({ id: "sustainer", name: "Sustainer", role: "core", attachment: "serial" }),
      createStagePlan({ id: "upper-01", name: "Upper stage 1", role: "upper", attachment: "serial", parentStageId: "sustainer", repeatCount: 1, ignitionDelayS: 2.5 }),
      createStagePlan({ id: "booster-01", name: "Booster set 1", role: "booster", attachment: "parallel", parentStageId: "upper-01", repeatCount: 2, repeatRadiusM: 0.12 }),
    ],
    components: [{
      id: "camera",
      name: "Camera",
      stageId: "upper-01",
      enabled: true,
      kind: "pointMass",
      axialPositionM: 0.22,
      radialOffsetM: 0.01,
      azimuthDeg: 10,
      massKg: 0.08,
    }],
  };
  const duplicated = duplicateVehicleStageTopology(topology, "upper-01");
  const duplicate = duplicated.stages.at(-1);
  assert.equal(duplicate.role, "upper");
  assert.equal(duplicate.parentStageId, "sustainer");
  assert.equal(duplicate.ignitionDelayS, 2.5);
  assert.equal(duplicated.components.length, 2);
  assert.equal(duplicated.components[1].stageId, duplicate.id);
  assert.notEqual(duplicated.components[1].id, "camera");
  assert.deepEqual(parseVehicleTopology(serializeVehicleTopology(duplicated)), duplicated);
  assert.throws(() => duplicateVehicleStageTopology(topology, "missing"), /unknown stage/);
});

test("removing a stage rehomes authored components and child stages to the core", () => {
  const topology = {
    ...createDefaultVehicleTopology(),
    stages: [
      createStagePlan({ id: "sustainer", name: "Sustainer", role: "core", attachment: "serial" }),
      createStagePlan({ id: "upper-01", name: "Upper stage 1", role: "upper", attachment: "serial", parentStageId: "sustainer" }),
      createStagePlan({ id: "payload-01", name: "Payload bay", role: "payload", attachment: "serial", parentStageId: "upper-01" }),
    ],
    components: [{
      id: "payload-camera",
      name: "Payload camera",
      stageId: "upper-01",
      enabled: true,
      kind: "pointMass",
      axialPositionM: 0.2,
      radialOffsetM: 0,
      azimuthDeg: 0,
      massKg: 0.08,
    }],
  };
  const removed = removeVehicleStageTopology(topology, "upper-01");
  assert.deepEqual(removed.stages.map((stage) => stage.id), ["sustainer", "payload-01"]);
  assert.equal(removed.stages[1].parentStageId, "sustainer");
  assert.equal(removed.components[0].stageId, "sustainer");
  assert.throws(() => removeVehicleStageTopology(topology, "sustainer"), /cannot be removed/);
  assert.throws(() => removeVehicleStageTopology(topology, "missing"), /unknown stage/);
});

test("serial upper stages and repeated parallel boosters validate in order", () => {
  const topology = {
    ...createDefaultVehicleTopology(),
    stages: [
      createStagePlan({ id: "sustainer", name: "Sustainer", role: "core", attachment: "serial" }),
      createStagePlan({ id: "upper-01", name: "Upper stage 1", role: "upper", attachment: "serial", parentStageId: "sustainer", motorId: "user.motor-01", aerodynamicTableId: "user.aero-01" }),
      createStagePlan({ id: "booster-01", name: "Booster set 1", role: "booster", attachment: "parallel", parentStageId: "sustainer", repeatCount: 3, repeatRadiusM: 0.12, thrustCantAngleDeg: 4.5, thrustCantAzimuthDeg: 90, failedMotorInstanceIndices: [2, 0] }),
    ],
  };
  const validated = validateVehicleTopology(topology);
  assert.equal(validated.stages[2].repeatCount, 3);
  assert.equal(validated.stages[2].parentStageId, "sustainer");
  assert.equal(validated.stages[1].motorId, "user.motor-01");
  assert.equal(validated.stages[1].aerodynamicTableId, "user.aero-01");
  const geometryTopology = validateVehicleTopology({
    ...topology,
    stages: topology.stages.map((stage) => stage.id === "upper-01"
      ? { ...stage, bodyLengthM: 0.9, diameterM: 0.11, noseLengthM: 0.2 }
      : stage),
  });
  assert.equal(geometryTopology.stages[1].bodyLengthM, 0.9);
  assert.equal(geometryTopology.stages[1].diameterM, 0.11);
  assert.equal(geometryTopology.stages[1].noseLengthM, 0.2);
  assert.equal(validated.stages[2].thrustCantAngleDeg, 4.5);
  assert.equal(validated.stages[2].thrustCantAzimuthDeg, 90);
  const deltaVTopology = validateVehicleTopology({
    ...topology,
    stages: topology.stages.map((stage) => stage.id === "upper-01" ? { ...stage, separationDeltaVBodyMps: 2.5 } : stage),
  });
  assert.equal(deltaVTopology.stages[1].separationDeltaVBodyMps, 2.5);
  assert.deepEqual(validated.stages[2].failedMotorInstanceIndices, [0, 2]);
});

test("gimbal schedules validate, round-trip, and follow radial thrust bases", () => {
  const topology = {
    ...createDefaultVehicleTopology(),
    stages: [
      createStagePlan({ id: "sustainer", name: "Sustainer", role: "core", attachment: "serial" }),
      createStagePlan({
        id: "booster-01",
        name: "Booster set",
        role: "booster",
        attachment: "parallel",
        parentStageId: "sustainer",
        repeatCount: 2,
        repeatRadiusM: 0.12,
        separationImpulseBodyNs: { x: 2.5, y: -0.4, z: 0.2 },
        gimbalSchedule: [
          { timeS: 0, pitchDeg: 0, yawDeg: 0 },
          { timeS: 1.5, pitchDeg: 4, yawDeg: -2 },
        ],
        gimbalResponseTimeS: 0.35,
        throttleSchedule: [
          { timeS: 0, throttleFraction: 0.65 },
          { timeS: 1.5, throttleFraction: 1 },
        ],
      }),
    ],
  };
  const validated = validateVehicleTopology(topology);
  assert.deepEqual(validated.stages[1].gimbalSchedule, topology.stages[1].gimbalSchedule);
  assert.equal(validated.stages[1].gimbalResponseTimeS, 0.35);
  assert.deepEqual(validated.stages[1].throttleSchedule, topology.stages[1].throttleSchedule);
  assert.deepEqual(validated.stages[1].separationImpulseBodyNs, topology.stages[1].separationImpulseBodyNs);
  assert.deepEqual(parseVehicleTopology(serializeVehicleTopology(validated)), validated);
  const nominal = stageThrustAxisBody(validated.stages[1], 0);
  const gimballed = stageThrustAxisWithGimbal(validated.stages[1], 0, 4, -2);
  assert.ok(Math.abs(Math.hypot(gimballed.x, gimballed.y, gimballed.z) - 1) < 1e-12);
  assert.ok(gimballed.y !== nominal.y || gimballed.z !== nominal.z);
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "booster-01"
        ? { ...stage, gimbalSchedule: [{ timeS: 1, pitchDeg: 0, yawDeg: 0 }, { timeS: 1, pitchDeg: 1, yawDeg: 0 }] }
        : stage),
    }),
    /strictly increasing/,
  );
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "booster-01"
        ? { ...stage, gimbalSchedule: [{ timeS: 0, pitchDeg: 16, yawDeg: 0 }] }
        : stage),
    }),
    /pitchDeg/,
  );
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "booster-01"
        ? { ...stage, gimbalResponseTimeS: 0.2, gimbalSchedule: undefined }
        : stage),
    }),
    /requires a gimbalSchedule/,
  );
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "booster-01"
        ? { ...stage, gimbalResponseTimeS: 11 }
        : stage),
    }),
    /gimbalResponseTimeS/,
  );
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "booster-01"
        ? { ...stage, throttleSchedule: [{ timeS: 1, throttleFraction: 0.5 }, { timeS: 1, throttleFraction: 1 }] }
        : stage),
    }),
    /strictly increasing/,
  );
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "booster-01"
        ? { ...stage, throttleSchedule: [{ timeS: 0, throttleFraction: 1.01 }] }
        : stage),
    }),
    /throttleFraction/,
  );
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "booster-01"
        ? { ...stage, separationImpulseBodyNs: { x: 1, y: 0, z: 0 }, separationDeltaVBodyMps: 1 }
        : stage),
    }),
    /both separationDeltaVBodyMps and separationImpulseBodyNs/,
  );
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "booster-01"
        ? { ...stage, separationImpulseBodyNs: { x: 10001, y: 0, z: 0 } }
        : stage),
    }),
    /magnitude/,
  );
});

test("detachable stages can carry a bounded recovery plan", () => {
  const topology = {
    ...createDefaultVehicleTopology(),
    stages: [
      createStagePlan({ id: "sustainer", name: "Sustainer", role: "core", attachment: "serial" }),
      createStagePlan({
        id: "upper-01",
        name: "Upper stage 1",
        role: "upper",
        attachment: "serial",
        parentStageId: "sustainer",
        recovery: { enabled: true, diameterM: 0.8, deploymentDelayS: 2.5 },
      }),
    ],
  };
  const validated = validateVehicleTopology(topology);
  assert.deepEqual(validated.stages[1].recovery, {
    enabled: true,
    diameterM: 0.8,
    deploymentDelayS: 2.5,
    inflationTimeS: 1.2,
    deploymentTrigger: "apogee",
    deploymentAltitudeAglM: 150,
    deploymentTimeS: 8,
  });
  assert.deepEqual(parseVehicleTopology(serializeVehicleTopology(validated)), validated);
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "upper-01"
        ? { ...stage, recovery: { enabled: true, diameterM: 0.04, deploymentDelayS: 0 } }
        : stage),
    }),
    /recovery diameterM/,
  );
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "upper-01"
        ? { ...stage, recovery: { enabled: true, diameterM: 0.8, deploymentDelayS: 61 } }
        : stage),
    }),
    /recovery deploymentDelayS/,
  );
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "upper-01"
        ? { ...stage, recovery: { enabled: true, diameterM: 0.8, deploymentDelayS: 0, inflationTimeS: 31 } }
        : stage),
    }),
    /recovery inflationTimeS/,
  );
  const altitudeRecovery = validateVehicleTopology({
    ...topology,
    stages: topology.stages.map((stage) => stage.id === "upper-01"
      ? {
          ...stage,
          recovery: {
            enabled: true,
            diameterM: 0.8,
            deploymentDelayS: 1,
            deploymentTrigger: "altitude",
            deploymentAltitudeAglM: 120,
            deploymentTimeS: 8,
          },
        }
      : stage),
  });
  assert.equal(altitudeRecovery.stages[1].recovery.deploymentTrigger, "altitude");
  assert.equal(altitudeRecovery.stages[1].recovery.deploymentAltitudeAglM, 120);
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "upper-01"
        ? { ...stage, recovery: { enabled: true, deploymentTrigger: "bad" } }
        : stage),
    }),
    /deploymentTrigger/,
  );
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "upper-01"
        ? { ...stage, recovery: { enabled: true, deploymentTrigger: "altitude", deploymentAltitudeAglM: -1 } }
        : stage),
    }),
    /deploymentAltitudeAglM/,
  );
  assert.throws(
    () => validateVehicleTopology({
      ...topology,
      stages: topology.stages.map((stage) => stage.id === "upper-01"
        ? { ...stage, recovery: { enabled: true, deploymentTrigger: "time", deploymentTimeS: 181 } }
        : stage),
    }),
    /deploymentTimeS/,
  );
});

test("topology rejects unsafe structure edits explicitly", () => {
  const base = createDefaultVehicleTopology();
  assert.throws(() => validateVehicleTopology({ ...base, stages: [] }), /requires 1/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], role: "upper" }] }), /first vehicle stage/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], id: "bad id" }] }), /may contain only/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], ignitionDelayS: -1 }] }), /ignitionDelayS/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], separationDelayS: 121 }] }), /separationDelayS/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], separationDeltaVBodyMps: 31 }] }), /separationDeltaVBodyMps/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], thrustCantAngleDeg: 16 }] }), /thrustCantAngleDeg/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], thrustCantAzimuthDeg: 181 }] }), /thrustCantAzimuthDeg/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], ignitionFailure: "yes" }] }), /ignitionFailure/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], failedMotorInstanceIndices: [1] }] }), /failedMotorInstanceIndices/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], failedMotorInstanceIndices: [0, 0] }] }), /duplicates/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], id: "payload", name: "Payload", role: "payload", failedMotorInstanceIndices: [0] }] }), /cannot configure failed motors/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], motorId: "bad motor" }] }), /motorId/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], aerodynamicTableId: "bad table" }] }), /aerodynamicTableId/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], role: "upper", bodyLengthM: 0.04 }] }), /bodyLengthM/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], role: "upper", diameterM: 2.01 }] }), /diameterM/);
  assert.throws(() => validateVehicleTopology({ ...base, stages: [{ ...base.stages[0], role: "upper", bodyLengthM: 0.1, noseLengthM: 0.21 }] }), /noseLengthM cannot exceed twice/);
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
