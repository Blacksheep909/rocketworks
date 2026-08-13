import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTITUDE_DEPENDENT_DRAG_MODEL_VERSION,
  evaluateAttitudeDependentDrag,
  simulateCoupledMultiBodyFlight,
} from "../lib/physics/index.ts";

const geometry = {
  axialReferenceAreaM2: 1,
  crossflowReferenceAreaM2: 4,
  axialDragCoefficient: 0.5,
  crossflowDragCoefficient: 1,
};

function environmentAt({ positionWorldM, velocityWorldMps }) {
  return {
    altitudeAslM: 100 + positionWorldM.z,
    windWorldMps: { x: 0, y: 0, z: 0 },
    atmosphere: { densityKgM3: 1.2 },
    gravityAccelerationMps2: 9.80665,
    ...(velocityWorldMps ? {} : {}),
  };
}

function rigidBody(orientationBodyToWorld) {
  return {
    orientationBodyToWorld,
    angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    inertiaBodyKgM2: [
      [0.1, 0, 0],
      [0, 0.1, 0],
      [0, 0, 0.1],
    ],
  };
}

test("projected-area drag transitions from axial to broadside CdA", () => {
  const axial = evaluateAttitudeDependentDrag({
    geometry,
    densityKgM3: 1.2,
    relativeAirVelocityWorldMps: { x: 10, y: 0, z: 0 },
    bodyAxisWorldM: { x: 1, y: 0, z: 0 },
  });
  const broadside = evaluateAttitudeDependentDrag({
    geometry,
    densityKgM3: 1.2,
    relativeAirVelocityWorldMps: { x: 10, y: 0, z: 0 },
    bodyAxisWorldM: { x: 0, y: 1, z: 0 },
  });
  const diagonal = evaluateAttitudeDependentDrag({
    geometry,
    densityKgM3: 1.2,
    relativeAirVelocityWorldMps: { x: 10, y: 0, z: 0 },
    bodyAxisWorldM: { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 },
  });
  assert.equal(axial.modelVersion, ATTITUDE_DEPENDENT_DRAG_MODEL_VERSION);
  assert.equal(axial.status, "assessed");
  assert.equal(axial.incidenceRad, 0);
  assert.equal(axial.effectiveReferenceAreaM2, 1);
  assert.equal(axial.effectiveDragCoefficient, 0.5);
  assert.equal(axial.dragForceWorldN.x, -30);
  assert.ok(broadside.incidenceRad > 1.5);
  assert.equal(broadside.effectiveReferenceAreaM2, 4);
  assert.equal(broadside.effectiveDragCoefficient, 1);
  assert.equal(broadside.dragForceWorldN.x, -240);
  assert.ok(Math.abs(diagonal.effectiveReferenceAreaM2 - 2.5) < 1e-12);
  assert.ok(Math.abs(diagonal.effectiveDragCoefficient - 0.9) < 1e-12);
  assert.ok(Math.abs(diagonal.dragForceWorldN.x + 135) < 1e-12);
});

test("projected-area drag keeps zero-speed diagnostics finite", () => {
  const result = evaluateAttitudeDependentDrag({
    geometry,
    densityKgM3: 1.2,
    relativeAirVelocityWorldMps: { x: 0, y: 0, z: 0 },
    bodyAxisWorldM: { x: 1, y: 0, z: 0 },
  });
  assert.equal(result.status, "not-assessed");
  assert.equal(result.relativeAirSpeedMps, 0);
  assert.equal(result.dynamicPressurePa, 0);
  assert.deepEqual(result.dragForceWorldN, { x: 0, y: 0, z: 0 });
  assert.ok(result.assumptions.length > 0);
});

test("shared-grid rigid-body propagation uses attitude drag and retains diagnostics", () => {
  const coupledGeometry = {
    axialReferenceAreaM2: 0.01,
    crossflowReferenceAreaM2: 0.02,
    axialDragCoefficient: 0.5,
    crossflowDragCoefficient: 1,
  };
  const baseBody = {
    id: "detached",
    label: "Detached stage",
    massKg: 1,
    releaseTimeS: 0,
    releasePositionWorldM: { x: 0, y: 0, z: 100 },
    releaseVelocityWorldMps: { x: 20, y: 0, z: 0 },
    attitudeDependentDrag: coupledGeometry,
  };
  const axial = simulateCoupledMultiBodyFlight({
    bodies: [{ ...baseBody, rigidBody: rigidBody({ w: 1, x: 0, y: 0, z: 0 }) }],
    durationS: 0.2,
    timeStepS: 0.1,
    environmentAt,
  });
  const broadside = simulateCoupledMultiBodyFlight({
    bodies: [{ ...baseBody, rigidBody: rigidBody({ w: Math.SQRT1_2, x: 0, y: 0, z: Math.SQRT1_2 }) }],
    durationS: 0.2,
    timeStepS: 0.1,
    environmentAt,
  });
  const axialPoint = axial.trajectories[0].trace[0];
  const broadsidePoint = broadside.trajectories[0].trace[0];
  assert.equal(axial.trajectories[0].attitudeDependentDrag.axialReferenceAreaM2, 0.01);
  assert.equal(axialPoint.aerodynamicDragModelVersion, ATTITUDE_DEPENDENT_DRAG_MODEL_VERSION);
  assert.ok(axialPoint.attitudeIncidenceRad < 1e-12);
  assert.ok(broadsidePoint.attitudeIncidenceRad > 1.5);
  assert.ok((broadsidePoint.aerodynamicDragN ?? 0) > (axialPoint.aerodynamicDragN ?? 0) * 3);
  assert.ok((broadsidePoint.effectiveReferenceAreaM2 ?? 0) > (axialPoint.effectiveReferenceAreaM2 ?? 0));
  assert.ok(
    broadside.trajectories[0].trace.at(-1).speedMps < axial.trajectories[0].trace.at(-1).speedMps,
  );
  assert.ok(axial.assumptions.some((assumption) => assumption.includes("Projected-area drag")));
  assert.ok(axial.warnings.some((warning) => warning.includes("projected-area attitude drag")));
});

test("attitude-dependent drag requires a rigid-body state", () => {
  assert.throws(
    () => simulateCoupledMultiBodyFlight({
      bodies: [{
        id: "point",
        massKg: 1,
        releaseTimeS: 0,
        releasePositionWorldM: { x: 0, y: 0, z: 10 },
        releaseVelocityWorldMps: { x: 1, y: 0, z: 0 },
        attitudeDependentDrag: geometry,
      }],
      durationS: 0.1,
      timeStepS: 0.1,
    }),
    /requires a rigid-body state/,
  );
});
