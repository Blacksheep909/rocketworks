import assert from "node:assert/strict";
import test from "node:test";

import {
  createVehicleAssemblyModel,
  rotationAboutX,
} from "../lib/physics/index.ts";

function pointComponent(id, stageId, massKg, positionM = { x: 0, y: 0, z: 0 }) {
  return { id, name: id, stageId, kind: "pointMass", massKg, positionM };
}

function componentNode(id, stageId, massKg, extras = {}) {
  return {
    id,
    name: id,
    kind: "component",
    component: pointComponent(`${id}-part`, stageId, massKg),
    ...extras,
  };
}

test("serial stages combine mass and preserve active topology", () => {
  const model = createVehicleAssemblyModel({
    id: "serial-vehicle",
    name: "Serial vehicle",
    stages: [
      {
        id: "booster",
        name: "Booster",
        role: "core",
        attachment: "serial",
        children: [componentNode("booster-shell", "ignored", 2, { transform: { translationM: { x: 0, y: 0, z: 0 } } })],
      },
      {
        id: "sustainer",
        name: "Sustainer",
        role: "upper",
        attachment: "serial",
        parentStageId: "booster",
        transform: { translationM: { x: 2, y: 0, z: 0 } },
        children: [componentNode("sustainer-shell", "ignored", 1)],
      },
    ],
  });
  const full = model.evaluate();
  assert.equal(full.massProperties.massKg, 3);
  assert.equal(full.massProperties.centerOfMassM.x, 2 / 3);
  assert.deepEqual(full.activeStageIds, ["booster", "sustainer"]);
  assert.equal(full.componentInstances[1].stageId, "sustainer");

  const upperOnly = model.evaluate({ activeStageIds: ["sustainer"] });
  assert.equal(upperOnly.massProperties.massKg, 1);
  assert.equal(upperOnly.massProperties.centerOfMassM.x, 2);
  assert.deepEqual(upperOnly.activeStageIds, ["sustainer"]);
});

test("symmetric radial boosters cancel transverse center of mass", () => {
  const model = createVehicleAssemblyModel({
    id: "radial-vehicle",
    name: "Radial vehicle",
    stages: [
      {
        id: "core",
        name: "Core",
        role: "core",
        attachment: "serial",
        children: [componentNode("core-mass", "core", 2)],
      },
      {
        id: "strap-ons",
        name: "Strap-on boosters",
        role: "booster",
        attachment: "parallel",
        parentStageId: "core",
        repeat: { count: 4, radiusM: 1 },
        children: [componentNode("booster-mass", "strap-ons", 1)],
      },
    ],
  });
  const result = model.evaluate();
  assert.equal(result.massProperties.massKg, 6);
  assert.ok(Math.abs(result.massProperties.centerOfMassM.y) < 1e-15);
  assert.ok(Math.abs(result.massProperties.centerOfMassM.z) < 1e-15);
  assert.equal(result.stages[1].instanceCount, 4);
  assert.equal(result.stages[1].componentInstanceCount, 4);
  assert.ok(result.massProperties.inertiaAtCenterKgM2[0][0] > 3.99);
  assert.match(result.warnings[0], /off-axis structural instances/);
});

test("nested pod patterns expand into concrete component instances", () => {
  const model = createVehicleAssemblyModel({
    id: "pod-vehicle",
    name: "Pod vehicle",
    stages: [
      {
        id: "core",
        name: "Core",
        role: "core",
        attachment: "serial",
        children: [
          componentNode("core-shell", "core", 1),
          {
            id: "pods",
            name: "Avionics pods",
            kind: "group",
            role: "pod",
            repeat: { count: 3, radiusM: 0.2, angularOffsetRad: Math.PI / 6 },
            transform: { translationM: { x: 0.5, y: 0, z: 0 } },
            children: [componentNode("pod-electronics", "core", 0.1)],
          },
        ],
      },
    ],
  });
  const result = model.evaluate();
  assert.equal(result.componentInstances.length, 4);
  assert.ok(Math.abs(result.massProperties.massKg - 1.3) < 1e-12);
  assert.ok(Math.abs(result.massProperties.centerOfMassM.x - 0.15 / 1.3) < 1e-12);
  assert.equal(new Set(result.componentInstances.map((instance) => instance.instanceId)).size, 4);
});

test("radial motor cluster expands unique normalized mounts", () => {
  const model = createVehicleAssemblyModel({
    id: "cluster-vehicle",
    name: "Cluster vehicle",
    stages: [
      {
        id: "core",
        name: "Core",
        role: "core",
        attachment: "serial",
        children: [
          componentNode("structure", "core", 1),
          {
            id: "cluster",
            name: "Four-motor cluster",
            kind: "group",
            role: "motor-cluster",
            repeat: { count: 4, radiusM: 0.1 },
            children: [
              {
                id: "motor-mount",
                name: "Motor mount",
                kind: "motor",
                motorId: "motor",
                thrustApplicationPointM: { x: 0.8, y: 0, z: 0 },
                thrustAxis: { x: 2, y: 0, z: 0 },
              },
            ],
          },
        ],
      },
    ],
  });
  const result = model.evaluate();
  assert.equal(result.motorMounts.length, 4);
  assert.equal(new Set(result.motorMounts.map((mount) => mount.motorId)).size, 4);
  for (const mount of result.motorMounts) {
    assert.equal(mount.thrustAxisBody.x, 1);
    assert.ok(Math.abs(Math.hypot(mount.thrustApplicationPointBodyM.y, mount.thrustApplicationPointBodyM.z) - 0.1) < 1e-12);
  }
  assert.equal(result.stages[0].motorMountCount, 4);
});

test("node transforms rotate component mass properties before composition", () => {
  const model = createVehicleAssemblyModel({
    id: "rotated-vehicle",
    name: "Rotated vehicle",
    stages: [
      {
        id: "core",
        name: "Core",
        role: "core",
        attachment: "serial",
        children: [componentNode("rotated", "core", 1, {
          transform: { rotation: rotationAboutX(Math.PI / 2), translationM: { x: 1, y: 2, z: 3 } },
        })],
      },
    ],
  });
  assert.deepEqual(model.evaluate().massProperties.centerOfMassM, { x: 1, y: 2, z: 3 });
});

test("disabled nodes contribute neither mass nor motor mounts", () => {
  const model = createVehicleAssemblyModel({
    id: "disabled-vehicle",
    name: "Disabled vehicle",
    stages: [{
      id: "core",
      name: "Core",
      role: "core",
      attachment: "serial",
      children: [
        componentNode("enabled", "core", 1),
        componentNode("disabled", "core", 10, { enabled: false }),
        { id: "disabled-motor", name: "Disabled motor", kind: "motor", motorId: "m", enabled: false, thrustApplicationPointM: { x: 0, y: 0, z: 0 }, thrustAxis: { x: 1, y: 0, z: 0 } },
      ],
    }],
  });
  const result = model.evaluate();
  assert.equal(result.massProperties.massKg, 1);
  assert.equal(result.componentInstances.length, 1);
  assert.equal(result.motorMounts.length, 0);
});

test("invalid hierarchy, identifiers, patterns, and transforms fail explicitly", () => {
  assert.throws(() => createVehicleAssemblyModel({ id: "bad id", name: "Bad", stages: [] }), /identifiers/);
  assert.throws(() => createVehicleAssemblyModel({
    id: "bad-parent",
    name: "Bad parent",
    stages: [{ id: "boosters", name: "Boosters", role: "booster", attachment: "parallel", children: [componentNode("part", "boosters", 1)] }],
  }), /requires a parent/);
  assert.throws(() => createVehicleAssemblyModel({
    id: "bad-repeat",
    name: "Bad repeat",
    stages: [{ id: "core", name: "Core", role: "core", attachment: "serial", repeat: { count: 0, radiusM: 1 }, children: [componentNode("part", "core", 1)] }],
  }), /repeat count/);
  assert.throws(() => createVehicleAssemblyModel({
    id: "bad-rotation",
    name: "Bad rotation",
    stages: [{ id: "core", name: "Core", role: "core", attachment: "serial", transform: { rotation: [[1, 0, 0], [0, 2, 0], [0, 0, 1]] }, children: [componentNode("part", "core", 1)] }],
  }), /orthonormal/);
  assert.throws(() => createVehicleAssemblyModel({
    id: "bad-reflection",
    name: "Bad reflection",
    stages: [{ id: "core", name: "Core", role: "core", attachment: "serial", transform: { rotation: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]] }, children: [componentNode("part-reflected", "core", 1)] }],
  }), /determinant \+1/);
});

test("duplicate nodes, backward parents, cycles, and unknown active stages fail", () => {
  assert.throws(() => createVehicleAssemblyModel({
    id: "duplicates",
    name: "Duplicates",
    stages: [{ id: "core", name: "Core", role: "core", attachment: "serial", children: [componentNode("same", "core", 1), componentNode("same", "core", 1)] }],
  }), /duplicate assembly node/);

  assert.throws(() => createVehicleAssemblyModel({
    id: "backward",
    name: "Backward",
    stages: [
      { id: "upper", name: "Upper", role: "upper", attachment: "serial", parentStageId: "core", children: [componentNode("upper-part", "upper", 1)] },
      { id: "core", name: "Core", role: "core", attachment: "serial", children: [componentNode("core-part", "core", 1)] },
    ],
  }), /parent must appear earlier/);

  const cyclicGroup = { id: "cycle", name: "Cycle", kind: "group", role: "custom", children: [] };
  cyclicGroup.children.push(cyclicGroup);
  assert.throws(() => createVehicleAssemblyModel({
    id: "cycle-vehicle",
    name: "Cycle vehicle",
    stages: [{ id: "core", name: "Core", role: "core", attachment: "serial", children: [cyclicGroup] }],
  }), /cycle detected/);

  const valid = createVehicleAssemblyModel({
    id: "valid",
    name: "Valid",
    stages: [{ id: "core", name: "Core", role: "core", attachment: "serial", children: [componentNode("part", "core", 1)] }],
  });
  assert.throws(() => valid.evaluate({ activeStageIds: ["missing"] }), /unknown active stage/);
});
