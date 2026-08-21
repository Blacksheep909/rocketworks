import assert from "node:assert/strict";
import test from "node:test";
import {
  DETACHED_BODY_AERODYNAMICS_MODEL_VERSION,
  createAerodynamicCoefficientTable,
  evaluateDetachedBodyAerodynamics,
  validateDetachedBodyAerodynamicBasis,
} from "../lib/physics/index.ts";

const identity = { w: 1, x: 0, y: 0, z: 0 };

const provenance = {
  sourceName: "Detached-body synthetic force/moment table",
  sourceKind: "user-supplied",
  dataVersion: "detached-test-1",
  licenseIdentifier: "CC0-1.0",
  validationStatus: "user-supplied-unvalidated",
};

function volume(value) {
  return {
    values: [0, 1].map(() =>
      [0, 1].map(() =>
        [0, 1].map(() => [value, value]),
      ),
    ),
  };
}

function directTable() {
  return createAerodynamicCoefficientTable({
    id: "detached-force-moment",
    name: "Detached force/moment regression table",
    machPoints: [0, 1],
    reynoldsPoints: [1e5, 1e7],
    angleOfAttackPointsRad: [-0.25, 0.25],
    sideslipPointsRad: [-0.2, 0.2],
    dragCoefficient: { values: [[0.6, 0.6], [0.6, 0.6]] },
    normalForceSlopePerRad: { values: [[3, 3], [3, 3]] },
    centerOfPressureXM: { values: [[0.7, 0.7], [0.7, 0.7]] },
    forceCoefficientBodyByAngle: {
      axial: volume(0.8),
      normal: volume(0.2),
      side: volume(0.1),
    },
    momentCoefficientBodyByAngle: {
      roll: volume(0.02),
      pitch: volume(-0.03),
      yaw: volume(0.04),
    },
    provenance,
  });
}

function scalarUncertaintyTable() {
  return createAerodynamicCoefficientTable({
    id: "detached-scalar-uncertainty",
    name: "Detached scalar uncertainty regression table",
    machPoints: [0, 1],
    reynoldsPoints: [1e5, 1e7],
    dragCoefficient: {
      values: [[0.6, 0.6], [0.6, 0.6]],
      absoluteUncertainty: [[0.1, 0.1], [0.1, 0.1]],
    },
    normalForceSlopePerRad: {
      values: [[3, 3], [3, 3]],
      absoluteUncertainty: [[0.5, 0.5], [0.5, 0.5]],
    },
    centerOfPressureXM: {
      values: [[0.7, 0.7], [0.7, 0.7]],
      absoluteUncertainty: [[0.02, 0.02], [0.02, 0.02]],
    },
    provenance,
  });
}

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

test("detached-body force/moment tables apply direct resultants with Reynolds provenance", () => {
  const table = directTable();
  const result = evaluateDetachedBodyAerodynamics({
    basis: {
      referenceAreaM2: 0.02,
      dragCoefficient: 0.6,
      coefficientTable: table,
      referenceLengthM: 1,
      centerOfMassXM: 0.3,
      momentReferenceLengthBodyM: { x: 0.5, y: 1, z: 1 },
      coefficientUncertaintyScale: 0,
    },
    densityKgM3: 1.2,
    speedOfSoundMps: 340,
    dynamicViscosityPaS: 1.8e-5,
    relativeAirVelocityWorldMps: { x: -50, y: 5, z: 2 },
    orientationBodyToWorld: identity,
  });

  assert.equal(result.coefficientBasis, "mach-reynolds-force-moment-table");
  assert.equal(result.directForceApplied, true);
  assert.equal(result.directMomentApplied, true);
  assert.equal(result.normalForceApplied, true);
  assert.deepEqual(result.directForceCoefficientBody, { x: 0.8, y: 0.2, z: 0.1 });
  assert.deepEqual(result.directMomentCoefficientBody, { x: 0.02, y: -0.03, z: 0.04 });
  assert.ok(result.reynoldsNumber > 1e5 && result.reynoldsNumber < 1e7);
  assert.equal(result.coefficientProvenance?.sourceName, provenance.sourceName);
  assert.ok(result.coefficientApplicability.some((issue) => issue.code === "FORCE_MOMENT_DATABASE_PRESENT"));
  assert.ok(result.dragN > 0);
  assert.ok(result.aerodynamicStaticMomentBodyNm.y < 0);
  assert.ok(result.warnings.some((warning) => warning.includes("Direct body-axis force")));
});

test("detached-body scalar uncertainty channels override the common fallback", () => {
  const result = evaluateDetachedBodyAerodynamics({
    basis: {
      referenceAreaM2: 0.02,
      dragCoefficient: 0.6,
      coefficientTable: scalarUncertaintyTable(),
      referenceLengthM: 1,
      centerOfMassXM: 0.3,
      coefficientUncertaintyScale: 1.25,
      coefficientUncertaintyScales: {
        dragCoefficient: 1,
        normalForceSlopePerRad: 0,
        centerOfPressureXM: -1,
      },
    },
    densityKgM3: 1.2,
    speedOfSoundMps: 340,
    dynamicViscosityPaS: 1.8e-5,
    relativeAirVelocityWorldMps: { x: -50, y: 5, z: 0 },
    orientationBodyToWorld: identity,
  });

  assert.equal(result.effectiveDragCoefficient, 0.7);
  assert.equal(result.normalForceApplied, true);
  assert.ok(result.assumptions.some((assumption) => assumption.includes("Independent signed-sigma uncertainty channels")));
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
