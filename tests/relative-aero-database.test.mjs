import test from "node:test";
import assert from "node:assert/strict";
import {
  createRelativeAeroDatabase,
  RELATIVE_AERO_DATABASE_MODEL_VERSION,
} from "../lib/physics/relative-aero-database.ts";

const provenance = {
  sourceName: "Synthetic relative-body fixture",
  sourceKind: "user-supplied",
  dataVersion: "fixture-1",
  licenseIdentifier: "CC0-1.0",
  validationStatus: "user-supplied-unvalidated",
};

function definition(overrides = {}) {
  return {
    id: "relative-fixture",
    name: "Relative fixture",
    machPoints: [0, 1],
    axialSeparationPointsBodyDiameters: [-1, 1],
    lateralSeparationPointsBodyDiameters: [0, 2],
    axialForceCoefficientDelta: {
      values: [
        [[0, 1], [2, 3]],
        [[4, 5], [6, 7]],
      ],
      absoluteUncertainty: [
        [[0.1, 0.2], [0.3, 0.4]],
        [[0.5, 0.6], [0.7, 0.8]],
      ],
    },
    normalForceCoefficientDelta: {
      values: [
        [[1, 1], [1, 1]],
        [[2, 2], [2, 2]],
      ],
    },
    pitchMomentCoefficientDelta: {
      values: [
        [[-1, -1], [-1, -1]],
        [[1, 1], [1, 1]],
      ],
    },
    referenceAreaM2: 0.02,
    momentReferenceLengthM: 0.5,
    provenance,
    ...overrides,
  };
}

test("relative aero database validates axes and performs trilinear interpolation", () => {
  const model = createRelativeAeroDatabase(definition());
  assert.equal(model.modelVersion, RELATIVE_AERO_DATABASE_MODEL_VERSION);
  assert.deepEqual(model.machRange, [0, 1]);
  assert.deepEqual(model.axialSeparationRangeBodyDiameters, [-1, 1]);
  assert.deepEqual(model.lateralSeparationRangeBodyDiameters, [0, 2]);
  assert.deepEqual(model.availableChannels, [
    "axialForceCoefficientDelta",
    "normalForceCoefficientDelta",
    "pitchMomentCoefficientDelta",
  ]);
  const result = model.evaluate({
    mach: 0.5,
    axialSeparationBodyDiameters: 0,
    lateralSeparationBodyDiameters: 1,
  });
  assert.equal(result.coefficients.axialForceCoefficientDelta, 3.5);
  assert.equal(result.uncertainty.axialForceCoefficientDelta, 0.45);
  assert.equal(result.coefficients.normalForceCoefficientDelta, 1.5);
  assert.equal(result.coefficients.pitchMomentCoefficientDelta, 0);
  assert.deepEqual(result.applicability, []);
});

test("relative aero database rejects out-of-range queries by default", () => {
  const model = createRelativeAeroDatabase(definition());
  assert.throws(
    () => model.evaluate({ mach: 1.2, axialSeparationBodyDiameters: 0, lateralSeparationBodyDiameters: 1 }),
    /outside table bounds/,
  );
});
test("relative aero database can clamp with explicit unsupported issues", () => {
  const model = createRelativeAeroDatabase(definition({ outOfRangePolicy: "clamp-with-warning" }));
  const result = model.evaluate({
    mach: 1.2,
    axialSeparationBodyDiameters: -2,
    lateralSeparationBodyDiameters: 3,
  });
  assert.equal(result.evaluatedMach, 1);
  assert.equal(result.evaluatedAxialSeparationBodyDiameters, -1);
  assert.equal(result.evaluatedLateralSeparationBodyDiameters, 2);
  assert.deepEqual(result.applicability.map((issue) => issue.code), [
    "MACH_ABOVE_DATABASE",
    "AXIAL_SEPARATION_BELOW_DATABASE",
    "LATERAL_SEPARATION_ABOVE_DATABASE",
  ]);
});

test("relative aero database requires shape, provenance, and moment reference validity", () => {
  assert.throws(
    () => createRelativeAeroDatabase(definition({
      axialForceCoefficientDelta: { values: [[[0, 1]]] },
    })),
    /ordered lateral separation/,
  );
  assert.throws(
    () => createRelativeAeroDatabase(definition({
      provenance: { ...provenance, licenseIdentifier: "" },
    })),
    /license identifier cannot be empty/,
  );
  assert.throws(
    () => createRelativeAeroDatabase(definition({ momentReferenceLengthM: undefined })),
    /moment channels require a moment reference length/,
  );
  assert.throws(
    () => createRelativeAeroDatabase(definition({
      axialForceCoefficientDelta: {
        values: [
          [[21, 0], [0, 0]],
          [[0, 0], [0, 0]],
        ],
      },
    })),
    /absolute magnitude at most/,
  );
});
