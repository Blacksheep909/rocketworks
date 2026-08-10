import assert from "node:assert/strict";
import test from "node:test";

import {
  IDENTITY_QUATERNION,
  allocateMissionEventPlan,
  simulateRigidBody6D,
} from "../lib/physics/index.ts";

const body = {
  massKg: 1,
  inertiaBodyKgM2: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
};

function state() {
  return {
    timeS: 0,
    positionWorldM: { x: 0, y: 0, z: 0 },
    velocityWorldMps: { x: 0, y: 0, z: 0 },
    orientationBodyToWorld: IDENTITY_QUATERNION,
    angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
  };
}

test("allocates same-time events by semantic priority and dependency", () => {
  const plan = allocateMissionEventPlan([
    { id: "ignite", label: "Ignition", kind: "ignition", timeS: 2, dependsOn: ["separate"] },
    { id: "recover", label: "Recovery", kind: "recovery", timeS: 2, mutualExclusionKey: "command" },
    { id: "separate", label: "Separation", kind: "separation", timeS: 2, mutualExclusionKey: "command" },
  ]);

  assert.equal(plan.allocation.status, "watch");
  assert.deepEqual(plan.allocation.orderedEventIds, ["separate", "ignite", "recover"]);
  assert.equal(plan.allocation.sameTimeGroups.length, 1);
  assert.match(plan.allocation.warnings[0], /Simultaneous event group/);
  assert.match(plan.allocation.warnings.join(" "), /Mutually exclusive event group/);
});

test("rejects missing dependencies and cycles without inventing an order", () => {
  const missing = allocateMissionEventPlan([
    { id: "a", label: "A", dependsOn: ["missing"] },
  ]);
  assert.equal(missing.allocation.status, "invalid");
  assert.match(missing.allocation.warnings.join(" "), /missing event/);

  const cycle = allocateMissionEventPlan([
    { id: "a", label: "A", dependsOn: ["b"] },
    { id: "b", label: "B", dependsOn: ["a"] },
  ]);
  assert.equal(cycle.allocation.status, "invalid");
  assert.match(cycle.allocation.warnings.join(" "), /cycle/);
});

test("6DOF accepts unsorted scheduled declarations and retains allocation telemetry", () => {
  const applied = [];
  const result = simulateRigidBody6D({
    body,
    initialState: state(),
    durationS: 3,
    timeStepS: 0.1,
    events: [
      {
        id: "recovery",
        label: "Recovery command",
        kind: "recovery",
        timeS: 2,
        apply: (value) => { applied.push("recovery"); return value; },
      },
      {
        id: "separation",
        label: "Separation",
        kind: "separation",
        timeS: 1,
        apply: (value) => { applied.push("separation"); return value; },
      },
    ],
  });

  assert.deepEqual(applied, ["separation", "recovery"]);
  assert.equal(result.eventAllocation.status, "allocated");
  assert.deepEqual(result.events.map((event) => event.missionKind), ["separation", "recovery"]);
  assert.deepEqual(result.events.map((event) => event.priority), [10, 40]);
});
