import assert from "node:assert/strict";
import test from "node:test";
import {
  DETACHED_BODY_AERODYNAMICS_MODEL_VERSION,
  evaluateDetachedBodyAerodynamics,
  validateDetachedBodyAerodynamicBasis,
} from "../lib/physics/index.ts";

const identity = { w: 1, x: 0, y: 0, z: 0 };

test("detached-body relation path applies normal force, CP moment, and damping", () => {
  const result = evaluateDetachedBodyAerodynamics({
    basis: {
      referenceAreaM2: 0.01,
      dragCoefficient: 0.5,
      normalForceSlopePerRad: 4,
      centerOfPressureMinusCenterOfMassM: 0.3,
      dampingDerivativeBody: { x: 0, y: -0.8, z: -0.8 },
      dampingReferenceLengthBodyM: { x: 0.1, y: 0.5, z: 0.5 },
    },
    densityKgM3: 1.2,
    speedOfSoundMps: 340,
    relativeAirVelocityWorldMps: { x: -50, y: 5, z: 0 },
    orientationBodyToWorld: identity,
    angularVelocityBodyRadS: { x: 0, y: 1, z: 0 },
  });

  assert.equal(result.modelVersion, DETACHED_BODY_AERODYNAMICS_MODEL_VERSION);
  assert.equal(result.validationStatus, "analytical-component-checks-only");
  assert.equal(result.normalForceApplied, true);
  assert.ok(result.normalForceN > 0);
  assert.ok(result.dragN > 0);
  assert.ok(result.aerodynamicStaticMomentBodyNm.z < 0);
  assert.ok(result.aerodynamicDampingMomentBodyNm.y < 0);
  assert.ok(result.aerodynamicForceWorldN.y < 0);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("CP-to-CG")));
});

test("detached-body relation path keeps non-forward flow outside normal-force domain", () => {
  const result = evaluateDetachedBodyAerodynamics({
    basis: {
      referenceAreaM2: 0.01,
      dragCoefficient: 0.5,
      normalForceSlopePerRad: 4,
      centerOfPressureMinusCenterOfMassM: 0.3,
    },
    densityKgM3: 1.2,
    speedOfSoundMps: 340,
    relativeAirVelocityWorldMps: { x: 30, y: 2, z: 0 },
    orientationBodyToWorld: identity,
  });

  assert.equal(result.normalForceApplied, false);
  assert.equal(result.normalForceN, 0);
  assert.equal(result.aerodynamicStaticMomentBodyNm.z, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("normal force")));
});

test("projected-area detached basis retains incidence diagnostics and finite zero-speed output", () => {
  const basis = {
    referenceAreaM2: 0.01,
    dragCoefficient: 0.5,
    normalForceSlopePerRad: 3,
    centerOfPressureMinusCenterOfMassM: 0.2,
    attitudeDependentDrag: {
      axialReferenceAreaM2: 0.01,
      crossflowReferenceAreaM2: 0.025,
      axialDragCoefficient: 0.5,
      crossflowDragCoefficient: 1.1,
    },
  };
  const result = evaluateDetachedBodyAerodynamics({
    basis,
    densityKgM3: 1.2,
    speedOfSoundMps: 340,
    relativeAirVelocityWorldMps: { x: 0, y: 0, z: 0 },
    orientationBodyToWorld: identity,
  });

  validateDetachedBodyAerodynamicBasis(basis);
  assert.equal(result.status, "not-assessed");
  assert.equal(result.projectedIncidenceRad, 0);
  for (const value of [result.dragN, result.normalForceN, result.dynamicPressurePa, result.effectiveDragCoefficient]) {
    assert.ok(Number.isFinite(value));
  }
  assert.deepEqual(result.aerodynamicForceWorldN, { x: 0, y: 0, z: 0 });
});

test("detached-body basis rejects a normal-force slope without a CP lever arm", () => {
  assert.throws(
    () => validateDetachedBodyAerodynamicBasis({
      referenceAreaM2: 0.01,
      dragCoefficient: 0.5,
      normalForceSlopePerRad: 3,
    }),
    /CP-to-CG offset/,
  );
});
