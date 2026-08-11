import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_QUATERNION,
  simulateSeparatedBodyFlight,
} from "../lib/physics/index.ts";

function properties(massKg, x, inertia = 0.08) {
  return {
    massKg,
    centerOfMassM: { x, y: 0, z: 0 },
    inertiaAtCenterKgM2: [
      [inertia, 0, 0],
      [0, inertia, 0],
      [0, 0, inertia],
    ],
  };
}

test("separated-body preview preserves release offset and angular-rate velocity", () => {
  const result = simulateSeparatedBodyFlight({
    stageId: "booster",
    stageName: "Booster",
    releaseState: {
      timeS: 1,
      positionWorldM: { x: 4, y: 2, z: 100 },
      velocityWorldMps: { x: 3, y: 0, z: 20 },
      orientationBodyToWorld: IDENTITY_QUATERNION,
      angularVelocityBodyRadS: { x: 0, y: 1, z: 0 },
    },
    stageMassProperties: properties(2, 2),
    parentCenterOfMassBodyM: { x: 1, y: 0, z: 0 },
    durationS: 10,
    timeStepS: 0.02,
  });

  assert.equal(result.modelVersion, "kestrel-separated-body-flight-0.5.0");
  assert.equal(result.validationStatus, "analytical-component-checks-only");
  assert.deepEqual(result.releasePositionWorldM, { x: 5, y: 2, z: 100 });
  assert.deepEqual(result.releaseVelocityWorldMps, { x: 3, y: 0, z: 19 });
  assert.deepEqual(result.retainedBodyDeltaVBodyMps, { x: 0, y: 0, z: 0 });
  assert.deepEqual(result.retainedBodyDeltaVWorldMps, { x: 0, y: 0, z: 0 });
  assert.deepEqual(result.detachedBodyDeltaVBodyMps, { x: 0, y: 0, z: 0 });
  assert.deepEqual(result.detachedBodyDeltaVWorldMps, { x: 0, y: 0, z: 0 });
  assert.equal(result.separationImpulseModel, "not-modeled");
  assert.equal(result.trace[0].recoveryDragN, 0);
  assert.equal(result.trace[0].recoveryEffectiveAreaM2, 0);
  assert.ok(result.trace.length > 1);
  assert.ok(result.maxAltitudeAglM > 100);
  assert.ok(result.impactTimeS !== null);
  assert.ok(result.warnings.some((warning) => warning.includes("ballistic")));
});

test("separated-body preview applies bounded isotropic point drag when a basis is supplied", () => {
  const input = {
    stageId: "booster",
    stageName: "Booster",
    releaseState: {
      timeS: 1,
      positionWorldM: { x: 0, y: 0, z: 100 },
      velocityWorldMps: { x: 0, y: 0, z: 20 },
      orientationBodyToWorld: IDENTITY_QUATERNION,
      angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    },
    stageMassProperties: properties(2, 0),
    parentCenterOfMassBodyM: { x: 0, y: 0, z: 0 },
    durationS: 10,
    timeStepS: 0.02,
  };
  const ballistic = simulateSeparatedBodyFlight(input);
  const drag = simulateSeparatedBodyFlight({
    ...input,
    referenceAreaM2: 0.01,
    dragCoefficient: 0.6,
  });

  assert.equal(drag.referenceAreaM2, 0.01);
  assert.equal(drag.dragCoefficient, 0.6);
  assert.ok(drag.maxSpeedMps < ballistic.maxSpeedMps);
  assert.ok(drag.warnings.some((warning) => warning.includes("isotropic point drag")));
  assert.ok(drag.assumptions.some((assumption) => assumption.includes("reference area")));
});

test("separated-body preview propagates a stage recovery canopy after branch apogee", () => {
  const input = {
    stageId: "upper-01",
    stageName: "Upper stage 1",
    releaseState: {
      timeS: 1,
      positionWorldM: { x: 0, y: 0, z: 100 },
      velocityWorldMps: { x: 0, y: 0, z: 20 },
      orientationBodyToWorld: IDENTITY_QUATERNION,
      angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    },
    stageMassProperties: properties(2, 0),
    parentCenterOfMassBodyM: { x: 0, y: 0, z: 0 },
    durationS: 60,
    timeStepS: 0.02,
  };
  const ballistic = simulateSeparatedBodyFlight(input);
  const recovery = simulateSeparatedBodyFlight({
    ...input,
    recoveryDevices: [{
      id: "upper-01-recovery",
      name: "Upper stage recovery canopy",
      dragCoefficient: 0.75,
      referenceAreaM2: 0.5,
      deploymentDelayS: 0,
      inflationTimeS: 0.2,
    }],
  });

  assert.equal(recovery.recoveryModelVersion, "kestrel-recovery-loads-0.2.0");
  assert.ok(recovery.simulation.events.some((event) => event.id === "recovery-upper-01-recovery-apogee-command"));
  assert.ok(recovery.trace.some((point) => point.recoveryDragN > 0));
  assert.ok(recovery.trace.some((point) => point.recoveryEffectiveAreaM2 > 0));
  assert.ok(recovery.impactTimeS !== null);
  assert.ok(ballistic.impactTimeS !== null);
  assert.ok(recovery.impactTimeS > ballistic.impactTimeS);
  assert.ok(recovery.warnings.some((warning) => warning.includes("Detached recovery devices")));
  assert.ok(recovery.assumptions.some((assumption) => assumption.includes("recovery loads")));
});

test("detached recovery supports a root-found descending altitude trigger", () => {
  const input = {
    stageId: "upper-01",
    stageName: "Upper stage 1",
    releaseState: {
      timeS: 1,
      positionWorldM: { x: 0, y: 0, z: 100 },
      velocityWorldMps: { x: 0, y: 0, z: 20 },
      orientationBodyToWorld: IDENTITY_QUATERNION,
      angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    },
    stageMassProperties: properties(2, 0),
    parentCenterOfMassBodyM: { x: 0, y: 0, z: 0 },
    durationS: 60,
    timeStepS: 0.02,
    recoveryDevices: [{
      id: "upper-01-recovery",
      name: "Upper stage recovery canopy",
      dragCoefficient: 0.75,
      referenceAreaM2: 0.5,
      deploymentDelayS: 0,
      inflationTimeS: 0,
    }],
    recoveryDeploymentTrigger: "altitude",
    recoveryDeploymentAltitudeAglM: 120,
  };
  const result = simulateSeparatedBodyFlight(input);
  const event = result.simulation.events.find((candidate) => candidate.id === "recovery-upper-01-recovery-altitude-command");
  assert.ok(event);
  assert.ok(event.timeS > input.releaseState.timeS);
  assert.match(event.label, /descent through 120 m AGL/);
  assert.equal(result.recoveryDeploymentTrigger, "altitude");
  assert.equal(result.recoveryDeploymentAltitudeAglM, 120);
  assert.ok(result.trace.some((point) => point.recoveryDragN > 0));
  assert.equal(result.warnings.some((warning) => warning.includes("trigger was not reached")), false);
});

test("detached recovery supports a mission-time trigger and clamps before-release schedules", () => {
  const input = {
    stageId: "booster",
    stageName: "Booster",
    releaseState: {
      timeS: 3,
      positionWorldM: { x: 0, y: 0, z: 50 },
      velocityWorldMps: { x: 0, y: 0, z: 0 },
      orientationBodyToWorld: IDENTITY_QUATERNION,
      angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    },
    stageMassProperties: properties(1, 0),
    parentCenterOfMassBodyM: { x: 0, y: 0, z: 0 },
    durationS: 20,
    timeStepS: 0.02,
    recoveryDevices: [{
      id: "booster-recovery",
      name: "Booster recovery canopy",
      dragCoefficient: 0.75,
      referenceAreaM2: 0.5,
      deploymentDelayS: 0,
      inflationTimeS: 0,
    }],
    recoveryDeploymentTrigger: "time",
    recoveryDeploymentTimeS: 2,
  };
  const result = simulateSeparatedBodyFlight(input);
  const event = result.simulation.events.find((candidate) => candidate.id === "recovery-booster-recovery-scheduled-command");
  assert.ok(event);
  assert.ok(event.timeS > 3 && event.timeS < 3.000001);
  assert.match(event.label, /mission time 2\.00 s/);
  assert.equal(result.recoveryDeploymentTrigger, "time");
  assert.equal(result.recoveryDeploymentTimeS, 2);
});

test("detached recovery surfaces an unreached trigger instead of implying deployment", () => {
  const result = simulateSeparatedBodyFlight({
    stageId: "booster",
    stageName: "Booster",
    releaseState: {
      timeS: 1,
      positionWorldM: { x: 0, y: 0, z: 20 },
      velocityWorldMps: { x: 0, y: 0, z: -1 },
      orientationBodyToWorld: IDENTITY_QUATERNION,
      angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    },
    stageMassProperties: properties(1, 0),
    parentCenterOfMassBodyM: { x: 0, y: 0, z: 0 },
    durationS: 5,
    timeStepS: 0.02,
    recoveryDevices: [{
      id: "booster-recovery",
      name: "Booster recovery canopy",
      dragCoefficient: 0.75,
      referenceAreaM2: 0.5,
      deploymentDelayS: 0,
      inflationTimeS: 0,
    }],
    recoveryDeploymentTrigger: "time",
    recoveryDeploymentTimeS: 30,
  });
  assert.equal(result.trace.some((point) => point.recoveryDragN > 0), false);
  assert.ok(result.warnings.some((warning) => warning.includes("trigger was not reached")));
});

test("separated-body preview requires a complete drag basis", () => {
  assert.throws(
    () => simulateSeparatedBodyFlight({
      stageId: "booster",
      stageName: "Booster",
      releaseState: {
        timeS: 1,
        positionWorldM: { x: 0, y: 0, z: 10 },
        velocityWorldMps: { x: 0, y: 0, z: 5 },
        orientationBodyToWorld: IDENTITY_QUATERNION,
        angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
      },
      stageMassProperties: properties(1, 0),
      parentCenterOfMassBodyM: { x: 0, y: 0, z: 0 },
      durationS: 2,
      timeStepS: 0.02,
      referenceAreaM2: 0.01,
    }),
    /requires both reference area and drag coefficient/,
  );
});

test("separated-body preview reports retained-body release delta-v without impulsing when no detached impulse is supplied", () => {
  const result = simulateSeparatedBodyFlight({
    stageId: "booster",
    stageName: "Booster",
    releaseState: {
      timeS: 1,
      positionWorldM: { x: 0, y: 0, z: 10 },
      velocityWorldMps: { x: 0, y: 0, z: 5 },
      orientationBodyToWorld: IDENTITY_QUATERNION,
      angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    },
    stageMassProperties: properties(1, 0),
    parentCenterOfMassBodyM: { x: 0, y: 0, z: 0 },
    durationS: 2,
    timeStepS: 0.02,
    retainedBodyDeltaVBodyMps: { x: 2, y: 0, z: 0 },
  });

  assert.deepEqual(result.retainedBodyDeltaVBodyMps, { x: 2, y: 0, z: 0 });
  assert.deepEqual(result.retainedBodyDeltaVWorldMps, { x: 2, y: 0, z: 0 });
  assert.equal(result.separationImpulseModel, "not-modeled");
  assert.deepEqual(result.releaseVelocityWorldMps, { x: 0, y: 0, z: 5 });
  assert.ok(result.assumptions.some((assumption) => assumption.includes("pre-event release state")));
});

test("separated-body preview applies the supplied equal-and-opposite impulse", () => {
  const result = simulateSeparatedBodyFlight({
    stageId: "booster",
    stageName: "Booster",
    releaseState: {
      timeS: 1,
      positionWorldM: { x: 0, y: 0, z: 10 },
      velocityWorldMps: { x: 10, y: 0, z: 5 },
      orientationBodyToWorld: IDENTITY_QUATERNION,
      angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    },
    stageMassProperties: properties(2, 0),
    parentCenterOfMassBodyM: { x: 0, y: 0, z: 0 },
    durationS: 2,
    timeStepS: 0.02,
    retainedBodyDeltaVBodyMps: { x: 1, y: 0, z: 0 },
    detachedBodyDeltaVBodyMps: { x: -3, y: 0, z: 0 },
  });

  assert.equal(result.separationImpulseModel, "mass-ratio-linear-momentum");
  assert.deepEqual(result.detachedBodyDeltaVBodyMps, { x: -3, y: 0, z: 0 });
  assert.deepEqual(result.detachedBodyDeltaVWorldMps, { x: -3, y: 0, z: 0 });
  assert.deepEqual(result.releaseVelocityWorldMps, { x: 7, y: 0, z: 5 });
  assert.ok(result.warnings.some((warning) => warning.includes("equal-and-opposite")));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("linear momentum")));
});

test("separated-body preview rejects a non-positive horizon", () => {
  assert.throws(
    () => simulateSeparatedBodyFlight({
      stageId: "booster",
      stageName: "Booster",
      releaseState: {
        timeS: 1,
        positionWorldM: { x: 0, y: 0, z: 10 },
        velocityWorldMps: { x: 0, y: 0, z: 0 },
        orientationBodyToWorld: IDENTITY_QUATERNION,
        angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
      },
      stageMassProperties: properties(1, 0),
      parentCenterOfMassBodyM: { x: 0, y: 0, z: 0 },
      durationS: 1,
      timeStepS: 0.05,
    }),
    /duration must extend beyond release time/,
  );
});
