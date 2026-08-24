import assert from "node:assert/strict";
import test from "node:test";
import {
  COUPLED_MULTI_BODY_FLIGHT_MODEL_VERSION,
  standardAtmosphere,
  simulateCoupledMultiBodyFlight,
} from "../lib/physics/index.ts";

function body(overrides = {}) {
  return {
    id: "booster-1",
    label: "Booster 1",
    massKg: 1.2,
    releaseTimeS: 0.25,
    releasePositionWorldM: { x: 0, y: 0, z: 120 },
    releaseVelocityWorldMps: { x: 0, y: 0, z: 30 },
    ...overrides,
  };
}

test("shared-grid multi-body propagation aligns releases and reports pairwise motion", () => {
  const input = {
    bodies: [
      body(),
      body({
        id: "booster-2",
        label: "Booster 2",
        releaseTimeS: 0,
        releasePositionWorldM: { x: 2, y: 0, z: 120 },
        releaseVelocityWorldMps: { x: -2, y: 0, z: 30 },
        velocityAdjustment: {
          deltaVWorldMps: { x: 0.5, y: 0, z: 0 },
          sourceEventId: "staging-booster-separation",
        },
      }),
    ],
    durationS: 4,
    timeStepS: 0.1,
  };
  const result = simulateCoupledMultiBodyFlight(input);
  assert.equal(result.modelVersion, COUPLED_MULTI_BODY_FLIGHT_MODEL_VERSION);
  assert.equal(result.validationStatus, "analytical-component-checks-only");
  assert.equal(result.status, "assessed");
  assert.equal(result.startTimeS, 0);
  assert.equal(result.endTimeS, 4);
  assert.equal(result.stepCount, 40);
  assert.equal(result.trajectories.length, 2);
  assert.ok(result.trajectories[0].trace.some((point) => point.timeS === 0.25));
  assert.ok(result.trajectories[1].trace.some((point) => point.timeS === 0));
  assert.deepEqual(result.trajectories[1].velocityAdjustmentWorldMps, { x: 0.5, y: 0, z: 0 });
  assert.deepEqual(result.trajectories[1].releaseVelocityWorldMps, { x: -1.5, y: 0, z: 30 });
  assert.ok(result.pairwise);
  assert.equal(result.pairwise.bodies.length, 2);
  assert.equal(result.pairwise.pairs.length, 1);
  assert.ok(Number.isFinite(result.minimumDistanceM));
  assert.ok(result.warnings.some((warning) => warning.includes("shared mission-time grid")));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("fourth-order Runge")));
});

test("shared-grid applies exact-time world and body-frame velocity impulses", () => {
  const worldFrame = simulateCoupledMultiBodyFlight({
    bodies: [body({
      releaseTimeS: 0,
      releasePositionWorldM: { x: 0, y: 0, z: 100 },
      releaseVelocityWorldMps: { x: 0, y: 0, z: 0 },
    })],
    durationS: 1,
    timeStepS: 0.1,
    velocityImpulseEvents: [{
      id: "world-kick",
      bodyId: "booster-1",
      timeS: 0.5,
      deltaVWorldMps: { x: 4, y: 0, z: 0 },
      sourceEventId: "separation-world",
    }],
  });
  const worldBoundary = worldFrame.trajectories[0].trace.find((point) => point.timeS === 0.5);
  assert.ok(worldBoundary);
  assert.ok(Math.abs(worldBoundary.velocityWorldMps.x - 4) < 1e-10);
  assert.equal(worldFrame.appliedVelocityImpulseEvents.length, 1);
  assert.deepEqual(worldFrame.appliedVelocityImpulseEvents[0].deltaVWorldMps, { x: 4, y: 0, z: 0 });
  assert.ok(worldFrame.assumptions.some((assumption) => assumption.includes("exact shared-grid boundaries")));

  const quarterTurn = Math.SQRT1_2;
  const bodyFrame = simulateCoupledMultiBodyFlight({
    bodies: [body({
      releaseTimeS: 0,
      releasePositionWorldM: { x: 0, y: 0, z: 100 },
      releaseVelocityWorldMps: { x: 0, y: 0, z: 0 },
      rigidBody: {
        orientationBodyToWorld: { w: quarterTurn, x: 0, y: 0, z: quarterTurn },
        inertiaBodyKgM2: [
          [0.02, 0, 0],
          [0, 0.02, 0],
          [0, 0, 0.02],
        ],
      },
    })],
    durationS: 1,
    timeStepS: 0.1,
    velocityImpulseEvents: [{
      id: "body-kick",
      bodyId: "booster-1",
      timeS: 0.5,
      deltaVBodyMps: { x: 4, y: 0, z: 0 },
    }],
  });
  const bodyBoundary = bodyFrame.trajectories[0].trace.find((point) => point.timeS === 0.5);
  assert.ok(bodyBoundary);
  assert.ok(Math.abs(bodyBoundary.velocityWorldMps.x) < 1e-10);
  assert.ok(Math.abs(bodyBoundary.velocityWorldMps.y - 4) < 1e-10);
  assert.ok(Math.abs(bodyFrame.appliedVelocityImpulseEvents[0].deltaVWorldMps.y - 4) < 1e-10);
});

test("velocity impulse events reject ambiguous frames and invalid timing", () => {
  const input = { bodies: [body({ releaseTimeS: 0.25 })], durationS: 1, timeStepS: 0.1 };
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      ...input,
      velocityImpulseEvents: [{ bodyId: "booster-1", timeS: 0.5 }],
    }),
    /exactly one frame/,
  );
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      ...input,
      velocityImpulseEvents: [{ bodyId: "booster-1", timeS: 0.1, deltaVWorldMps: { x: 1, y: 0, z: 0 } }],
    }),
    /before body release/,
  );
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      ...input,
      velocityImpulseEvents: [{ bodyId: "booster-1", timeS: 0.5, deltaVBodyMps: { x: 1, y: 0, z: 0 } }],
    }),
    /requires a rigid-body state/,
  );
});

test("shared-grid propagator applies isotropic drag and terminates at ground impact", () => {
  const ballistic = simulateCoupledMultiBodyFlight({
    bodies: [body({ releaseTimeS: 0, releasePositionWorldM: { x: 0, y: 0, z: 0 }, releaseVelocityWorldMps: { x: 0, y: 0, z: -5 } })],
    durationS: 5,
    timeStepS: 0.05,
  });
  const drag = simulateCoupledMultiBodyFlight({
    bodies: [body({
      releaseTimeS: 0,
      releasePositionWorldM: { x: 0, y: 0, z: 120 },
      releaseVelocityWorldMps: { x: 0, y: 0, z: 30 },
      referenceAreaM2: 0.02,
      dragCoefficient: 0.8,
    })],
    durationS: 20,
    timeStepS: 0.05,
  });
  assert.equal(ballistic.trajectories[0].impactTimeS, 0);
  assert.ok(drag.trajectories[0].impactTimeS !== null);
  const ballisticFlight = simulateCoupledMultiBodyFlight({
    bodies: [body({
      releaseTimeS: 0,
      releasePositionWorldM: { x: 0, y: 0, z: 120 },
      releaseVelocityWorldMps: { x: 0, y: 0, z: 30 },
    })],
    durationS: 20,
    timeStepS: 0.05,
  });
  assert.ok(drag.trajectories[0].maxSpeedMps < ballisticFlight.trajectories[0].maxSpeedMps);
  assert.ok(drag.warnings.some((warning) => warning.includes("Ground crossings")));
});

test("shared-grid propagator validates identifiers, drag pairs, and mission horizon", () => {
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      bodies: [body({ id: "" })],
      durationS: 1,
      timeStepS: 0.1,
    }),
    /body id cannot be empty/,
  );
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      bodies: [body({ referenceAreaM2: 0.02 })],
      durationS: 1,
      timeStepS: 0.1,
    }),
    /drag requires area and coefficient together/,
  );
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      bodies: [body({ releaseTimeS: 2 })],
      durationS: 1,
      timeStepS: 0.1,
    }),
    /releases after mission end/,
  );
});

test("opt-in mutual gravity exchanges equal-and-opposite point-mass acceleration", () => {
  const makeMass = (id, x) => body({
    id,
    massKg: 1e9,
    releaseTimeS: 0,
    releasePositionWorldM: { x, y: 0, z: 100 },
    releaseVelocityWorldMps: { x: 0, y: 0, z: 0 },
  });
  const result = simulateCoupledMultiBodyFlight({
    bodies: [makeMass("left", -1), makeMass("right", 1)],
    durationS: 1,
    timeStepS: 0.05,
    mutualGravity: { enabled: true },
  });
  assert.equal(result.mutualGravity.enabled, true);
  assert.equal(result.mutualGravity.softeningRadiusM, 0);
  assert.ok(result.trajectories[0].trace[0].accelerationWorldMps2.x > 0);
  assert.ok(result.trajectories[1].trace[0].accelerationWorldMps2.x < 0);
  const leftFinal = result.trajectories[0].trace.at(-1).positionWorldM.x;
  const rightFinal = result.trajectories[1].trace.at(-1).positionWorldM.x;
  assert.ok(leftFinal > -1);
  assert.ok(rightFinal < 1);
  assert.ok(Math.abs(leftFinal + rightFinal) < 1e-9);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("point-mass gravity")));
});

test("mutual gravity exposes singularity and softening controls explicitly", () => {
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      bodies: [
        body({ id: "same-a", releaseTimeS: 0 }),
        body({ id: "same-b", releaseTimeS: 0 }),
      ],
      durationS: 1,
      timeStepS: 0.1,
      mutualGravity: { enabled: true },
    }),
    /singularity/,
  );
  const softened = simulateCoupledMultiBodyFlight({
    bodies: [
      body({ id: "same-a", releaseTimeS: 0 }),
      body({ id: "same-b", releaseTimeS: 0 }),
    ],
    durationS: 0.2,
    timeStepS: 0.1,
    mutualGravity: { enabled: true, softeningRadiusM: 0.5 },
  });
  assert.equal(softened.mutualGravity.softeningRadiusM, 0.5);
  assert.ok(softened.warnings.some((warning) => warning.includes("softening radius")));
});

test("opt-in envelope contact applies bounded equal-and-opposite normal force", () => {
  const result = simulateCoupledMultiBodyFlight({
    bodies: [
      body({
        id: "contact-left",
        releaseTimeS: 0,
        releasePositionWorldM: { x: -0.4, y: 0, z: 100 },
        releaseVelocityWorldMps: { x: 0, y: 0, z: 0 },
        envelopeRadiusM: 0.5,
      }),
      body({
        id: "contact-right",
        releaseTimeS: 0,
        releasePositionWorldM: { x: 0.4, y: 0, z: 100 },
        releaseVelocityWorldMps: { x: 0, y: 0, z: 0 },
        envelopeRadiusM: 0.5,
      }),
    ],
    durationS: 0.1,
    timeStepS: 0.01,
    contact: {
      enabled: true,
      stiffnessNPerM: 100,
      dampingNsPerM: 10,
      maximumNormalForceN: 1_000,
    },
  });
  assert.equal(result.contact.enabled, true);
  assert.equal(result.contact.contactPairCount, 1);
  assert.ok(result.contact.contactSampleCount > 0);
  assert.ok(result.contact.maximumPenetrationM > 0);
  assert.ok(result.contact.maximumNormalForceNObserved > 0);
  const initialLeft = result.trajectories[0].trace[0];
  const initialRight = result.trajectories[1].trace[0];
  assert.equal(initialLeft.contactPairCount, 1);
  assert.equal(initialRight.contactPairCount, 1);
  assert.ok(initialLeft.contactForceWorldN.x < 0);
  assert.ok(initialRight.contactForceWorldN.x > 0);
  assert.ok(Math.abs(initialLeft.contactForceWorldN.x + initialRight.contactForceWorldN.x) < 1e-12);
  const finalLeft = result.trajectories[0].trace.at(-1).positionWorldM.x;
  const finalRight = result.trajectories[1].trace.at(-1).positionWorldM.x;
  assert.ok(finalRight - finalLeft > 0.8);
  assert.ok(result.warnings.some((warning) => warning.includes("spherical-envelope contact solver")));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("F_n = min")));
});

test("contact options reject unsafe stiffness, damping, and force caps", () => {
  const options = { enabled: true };
  assert.throws(
    () => simulateCoupledMultiBodyFlight({ bodies: [body()], durationS: 1, timeStepS: 0.1, contact: { ...options, stiffnessNPerM: 0 } }),
    /contact stiffness/,
  );
  assert.throws(
    () => simulateCoupledMultiBodyFlight({ bodies: [body()], durationS: 1, timeStepS: 0.1, contact: { ...options, dampingNsPerM: -1 } }),
    /contact damping/,
  );
  assert.throws(
    () => simulateCoupledMultiBodyFlight({ bodies: [body()], durationS: 1, timeStepS: 0.1, contact: { ...options, maximumNormalForceN: 1e11 } }),
    /maximum force/,
  );
});

test("opt-in wake feedback reduces eligible target flow and retains bounded provenance", () => {
  const makeWakeBody = (id, x) => body({
    id,
    label: id,
    releaseTimeS: 0,
    releasePositionWorldM: { x, y: 0, z: 120 },
    releaseVelocityWorldMps: { x: 50, y: 0, z: 0 },
    referenceAreaM2: 0.02,
    dragCoefficient: 0.6,
  });
  const baseline = simulateCoupledMultiBodyFlight({
    bodies: [makeWakeBody("wake-source", 0), makeWakeBody("wake-target", 0.4)],
    durationS: 0.2,
    timeStepS: 0.05,
  });
  const feedback = simulateCoupledMultiBodyFlight({
    bodies: [makeWakeBody("wake-source", 0), makeWakeBody("wake-target", 0.4)],
    durationS: 0.2,
    timeStepS: 0.05,
    relativeAeroForceFeedback: { enabled: true },
  });
  assert.equal(baseline.relativeAeroForceFeedback.enabled, false);
  assert.equal(feedback.relativeAeroForceFeedback.enabled, true);
  assert.equal(feedback.relativeAeroForceFeedback.modelVersion, "rocketworks-coupled-multi-body-relative-aero-0.1.0");
  assert.ok(feedback.relativeAeroForceFeedback.exposedSampleCount > 0);
  assert.ok(feedback.relativeAeroForceFeedback.affectedBodyCount >= 1);
  assert.ok(feedback.relativeAeroForceFeedback.maximumObservedVelocityDeficitFraction > 0);
  const targetInitial = feedback.trajectories[1].trace[0];
  assert.equal(targetInitial.relativeWakeSourceCount, 1);
  assert.ok(targetInitial.relativeWakeDeficitFraction > 0);
  assert.ok(targetInitial.relativeAirSpeedMps < 50);
  assert.equal(baseline.trajectories[1].trace[0].relativeAirSpeedMps, undefined);
  assert.ok(feedback.warnings.some((warning) => warning.includes("analytical sensitivity")));
  assert.ok(feedback.assumptions.some((assumption) => assumption.includes("strongest") && assumption.includes("wake")));
});

test("wake feedback rejects unbounded geometry and deficit controls", () => {
  const input = {
    bodies: [body({ releaseTimeS: 0 })],
    durationS: 1,
    timeStepS: 0.1,
  };
  assert.throws(
    () => simulateCoupledMultiBodyFlight({ ...input, relativeAeroForceFeedback: { enabled: true, wakeHalfAngleDeg: 46 } }),
    /wake half-angle/,
  );
  assert.throws(
    () => simulateCoupledMultiBodyFlight({ ...input, relativeAeroForceFeedback: { enabled: true, peakVelocityDeficitFraction: 0.8, maximumVelocityDeficitFraction: 0.7 } }),
    /peak deficit/,
  );
});

test("coupled point-mass propagation consumes optional environment rotation acceleration", () => {
  const result = simulateCoupledMultiBodyFlight({
    bodies: [body({ releaseTimeS: 0, releasePositionWorldM: { x: 0, y: 0, z: 100 } })],
    durationS: 0.1,
    timeStepS: 0.1,
    environmentAt: ({ positionWorldM }) => ({
      modelVersion: "rotation-fixture",
      validationStatus: "engineering-preview-unvalidated",
      timeS: 0,
      altitudeAglM: positionWorldM.z,
      altitudeAslM: positionWorldM.z,
      atmosphere: standardAtmosphere(positionWorldM.z),
      gravityAccelerationMps2: 9.5,
      gravityModel: "fixture-gravity",
      meanWindWorldMps: { x: 0, y: 0, z: 0 },
      turbulenceWindWorldMps: { x: 0, y: 0, z: 0 },
      discreteGustWindWorldMps: { x: 0, y: 0, z: 0 },
      windWorldMps: { x: 0, y: 0, z: 0 },
      activeGustIds: [],
      earthRotationAccelerationWorldMps2: { x: 0.25, y: -0.5, z: 0.75 },
      earthRotationEnabled: true,
      provenance: {
        sourceName: "fixture",
        sourceKind: "synthetic",
        dataVersion: "1",
        licenseIdentifier: "CC0-1.0",
        attribution: "fixture",
        validationStatus: "synthetic-unvalidated",
      },
    }),
  });
  const initial = result.trajectories[0].trace[0];
  assert.equal(initial.accelerationWorldMps2.x, 0.25);
  assert.equal(initial.accelerationWorldMps2.y, -0.5);
  assert.equal(initial.accelerationWorldMps2.z, -8.75);
  assert.ok(result.assumptions.some((assumption) => /Earth rotation|rotation/i.test(assumption)));
});

test("opt-in released rigid bodies propagate attitude and body-frame torque", () => {
  const result = simulateCoupledMultiBodyFlight({
    bodies: [body({
      id: "spin-body",
      releaseTimeS: 0.25,
      releasePositionWorldM: { x: 0, y: 0, z: 120 },
      releaseVelocityWorldMps: { x: 0, y: 0, z: 30 },
      rigidBody: {
        orientationBodyToWorld: { w: 1, x: 0, y: 0, z: 0 },
        angularVelocityBodyRadS: { x: 0, y: 0, z: 1 },
        inertiaBodyKgM2: [
          [2, 0, 0],
          [0, 3, 0],
          [0, 0, 4],
        ],
        loads: () => ({
          momentBodyNm: { x: 2, y: 0, z: 0 },
        }),
      },
    })],
    durationS: 1.25,
    timeStepS: 0.05,
  });
  assert.equal(result.rigidBodyCount, 1);
  assert.equal(result.status, "assessed");
  const releasePoint = result.trajectories[0].trace.find((point) => point.timeS === 0.25);
  assert.ok(releasePoint?.orientationBodyToWorld);
  const finalPoint = result.trajectories[0].trace.at(-1);
  assert.ok(finalPoint.orientationBodyToWorld);
  assert.ok(finalPoint.angularVelocityBodyRadS);
  assert.ok(finalPoint.orientationBodyToWorld.z > 0.35);
  assert.ok(finalPoint.angularVelocityBodyRadS.x > 0.9);
  assert.ok(finalPoint.angularVelocityBodyRadS.z > 0.9);
  assert.ok(result.warnings.some((warning) => warning.includes("rigid-body attitude state")));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("Euler angular momentum")));
});

test("opt-in rigid-body properties provider propagates changing mass and retains telemetry", () => {
  const result = simulateCoupledMultiBodyFlight({
    bodies: [body({
      id: "burning-body",
      massKg: 2,
      releaseTimeS: 0,
      releasePositionWorldM: { x: 0, y: 0, z: 500 },
      releaseVelocityWorldMps: { x: 0, y: 0, z: 0 },
      rigidBody: {
        orientationBodyToWorld: { w: 1, x: 0, y: 0, z: 0 },
        inertiaBodyKgM2: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        propertiesAt: (state) => ({
          massKg: 2 - 0.5 * state.timeS,
          inertiaBodyKgM2: [
            [1 + state.timeS, 0, 0],
            [0, 1 + state.timeS, 0],
            [0, 0, 1 + state.timeS],
          ],
          inertiaRateBodyKgM2PerS: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
        }),
        loads: () => ({ forceWorldN: { x: 8, y: 0, z: 0 } }),
      },
    })],
    durationS: 1,
    timeStepS: 0.05,
  });
  assert.equal(result.dynamicMassBodyCount, 1);
  const initial = result.trajectories[0].trace[0];
  const final = result.trajectories[0].trace.at(-1);
  assert.equal(initial.massKg, 2);
  assert.equal(final.massKg, 1.5);
  assert.ok(final.velocityWorldMps.x > 4.1);
  assert.ok(result.warnings.some((warning) => warning.includes("time-varying mass/inertia")));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("changing mass property")));
});

test("detached-body aerodynamic basis adds normal force, CP moment, and trace diagnostics", () => {
  const result = simulateCoupledMultiBodyFlight({
    bodies: [body({
      id: "aero-body",
      releaseTimeS: 0,
      releasePositionWorldM: { x: 0, y: 0, z: 120 },
      releaseVelocityWorldMps: { x: -40, y: 4, z: 0 },
      aerodynamicBasis: {
        referenceAreaM2: 0.01,
        dragCoefficient: 0.5,
        normalForceSlopePerRad: 4,
        centerOfPressureMinusCenterOfMassM: 0.3,
      },
      rigidBody: {
        orientationBodyToWorld: { w: 1, x: 0, y: 0, z: 0 },
        angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
        inertiaBodyKgM2: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
      },
    })],
    durationS: 0.4,
    timeStepS: 0.05,
  });

  assert.equal(result.aerodynamicBodyCount, 1);
  assert.equal(result.trajectories[0].aerodynamicBasis.normalForceSlopePerRad, 4);
  const initial = result.trajectories[0].trace[0];
  const final = result.trajectories[0].trace.at(-1);
  assert.equal(initial.aerodynamicModelVersion, "rocketworks-detached-body-aerodynamics-0.3.0");
  assert.ok(initial.aerodynamicAngleOfAttackRad > 0);
  assert.ok(initial.aerodynamicNormalForceN > 0);
  assert.equal(initial.aerodynamicNormalForceApplied, true);
  assert.ok(initial.aerodynamicStaticMomentBodyNm.z < 0);
  assert.ok(final.angularVelocityBodyRadS.z < 0);
  assert.ok(result.warnings.some((warning) => warning.includes("static aerodynamic load basis")));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("CP-to-CG lever arm")));
});

test("rigid-body released-body inputs reject invalid inertia and non-finite loads", () => {
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      bodies: [body({
        releaseTimeS: 0,
        rigidBody: {
          orientationBodyToWorld: { w: 1, x: 0, y: 0, z: 0 },
          inertiaBodyKgM2: [
            [1, 0, 0],
            [0, 0, 0],
            [0, 0, 1],
          ],
        },
      })],
      durationS: 1,
      timeStepS: 0.1,
    }),
    /positive definite/,
  );
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      bodies: [body({
        releaseTimeS: 0,
        rigidBody: {
          orientationBodyToWorld: { w: 1, x: 0, y: 0, z: 0 },
          inertiaBodyKgM2: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
          loads: () => ({ momentBodyNm: { x: Number.NaN, y: 0, z: 0 } }),
        },
      })],
      durationS: 1,
      timeStepS: 0.1,
    }),
    /body moment must contain finite coordinates/,
  );
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      bodies: [body({
        releaseTimeS: 0,
        aerodynamicBasis: {
          referenceAreaM2: 0.01,
          dragCoefficient: 0.5,
          normalForceSlopePerRad: 3,
          centerOfPressureMinusCenterOfMassM: 0.2,
        },
      })],
      durationS: 1,
      timeStepS: 0.1,
    }),
    /aerodynamic basis requires a rigid-body state/,
  );
});

test("adaptive shared-grid integration converges and reports internal step diagnostics", () => {
  const makeAdaptiveBody = () => body({
    id: "adaptive-body",
    releaseTimeS: 0,
    releasePositionWorldM: { x: 0, y: 0, z: 120 },
    releaseVelocityWorldMps: { x: 0, y: 0, z: 30 },
    rigidBody: {
      orientationBodyToWorld: { w: 1, x: 0, y: 0, z: 0 },
      angularVelocityBodyRadS: { x: 0, y: 0, z: 0.3 },
      inertiaBodyKgM2: [
        [2, 0, 0],
        [0, 3, 0],
        [0, 0, 4],
      ],
      loads: (state) => ({
        forceBodyN: { x: 4 * Math.sin(5 * state.timeS), y: 0, z: 0 },
        momentBodyNm: { x: 1.5 * Math.cos(3 * state.timeS), y: 0, z: 0 },
      }),
    },
  });
  const adaptive = simulateCoupledMultiBodyFlight({
    bodies: [makeAdaptiveBody()],
    durationS: 1.2,
    timeStepS: 0.2,
    integration: {
      method: "adaptive-rk4-step-doubling",
      adaptive: {
        relativeTolerance: 1e-8,
        absoluteTolerance: 1e-10,
        minimumStepS: 1e-7,
        maximumStepS: 0.2,
      },
    },
  });
  const reference = simulateCoupledMultiBodyFlight({
    bodies: [makeAdaptiveBody()],
    durationS: 1.2,
    timeStepS: 0.002,
  });
  const adaptiveFinal = adaptive.trajectories[0].trace.at(-1);
  const referenceFinal = reference.trajectories[0].trace.at(-1);
  assert.equal(adaptive.integration.method, "adaptive-rk4-step-doubling");
  assert.ok(adaptive.integration.acceptedStepCount > 0);
  assert.ok(adaptive.integration.rejectedStepCount > 0);
  assert.ok(adaptive.integration.maximumNormalizedError <= 1);
  assert.equal(adaptive.endTimeS, 1.2);
  assert.ok(Math.abs(adaptiveFinal.positionWorldM.x - referenceFinal.positionWorldM.x) < 1e-6);
  assert.ok(Math.abs(adaptiveFinal.angularVelocityBodyRadS.x - referenceFinal.angularVelocityBodyRadS.x) < 1e-6);
  assert.ok(adaptive.warnings.some((warning) => warning.includes("truncation only")));
  assert.ok(adaptive.assumptions.some((assumption) => assumption.includes("full RK4 step")));
});

test("adaptive shared-grid integration preserves exact delayed release boundaries", () => {
  const result = simulateCoupledMultiBodyFlight({
    bodies: [
      body({
        id: "adaptive-late",
        releaseTimeS: 0.25,
        rigidBody: {
          orientationBodyToWorld: { w: 1, x: 0, y: 0, z: 0 },
          inertiaBodyKgM2: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
        },
      }),
      body({ id: "adaptive-early", releaseTimeS: 0 }),
    ],
    durationS: 1,
    timeStepS: 0.3,
    integration: { method: "adaptive-rk4-step-doubling" },
  });
  assert.ok(result.trajectories[0].trace.some((point) => point.timeS === 0.25));
  assert.equal(result.integration.method, "adaptive-rk4-step-doubling");
  assert.ok(result.integration.minimumAcceptedStepS > 0);
});
