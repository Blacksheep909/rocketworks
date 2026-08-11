import assert from "node:assert/strict";
import test from "node:test";
import {
  createAerodynamicCoefficientTable,
  sampleAerodynamicPolar,
} from "../lib/physics/index.ts";
import { createAerodynamicPolarCsv } from "../lib/export/project-exports.ts";

const provenance = {
  sourceName: "Polar regression surface",
  sourceKind: "user-supplied",
  dataVersion: "polar-test-1",
  licenseIdentifier: "CC0-1.0",
  validationStatus: "user-supplied-unvalidated",
};

function volume(base, sideslipWeight, angleWeight) {
  return {
    values: [0, 1].map((sideslipIndex) =>
      [0, 1].map((angleIndex) =>
        [0, 1].map((reynoldsIndex) =>
          [0, 1].map(
            (machIndex) => base + sideslipIndex * sideslipWeight + angleIndex * angleWeight + reynoldsIndex * 0.01 + machIndex * 0.01,
          ),
        ),
      ),
    ),
  };
}

function table(overrides = {}) {
  return createAerodynamicCoefficientTable({
    id: "polar-table",
    name: "Polar table",
    machPoints: [0, 1],
    reynoldsPoints: [1e5, 1e7],
    dragCoefficient: { values: [[0.4, 0.4], [0.4, 0.4]], absoluteUncertainty: [[0.01, 0.01], [0.01, 0.01]] },
    normalForceSlopePerRad: { values: [[2, 2], [2, 2]] },
    centerOfPressureXM: { values: [[0.5, 0.5], [0.5, 0.5]] },
    provenance,
    ...overrides,
  });
}

test("polar sampler uses direct force volumes and keeps fixed flight condition visible", () => {
  const model = table({
    angleOfAttackPointsRad: [-0.2, 0.2],
    sideslipPointsRad: [-0.1, 0.1],
    forceCoefficientBodyByAngle: {
      axial: volume(-0.8, 0, 0),
      normal: volume(-1, 0, 2),
      side: volume(0, 0, 0),
    },
  });
  const result = sampleAerodynamicPolar(model, {
    mach: 0,
    reynoldsNumber: 1e5,
    sideslipRad: 0,
    angleOfAttackPointsRad: [-0.2, 0, 0.2],
  });

  assert.equal(result.status, "assessed");
  assert.equal(result.points.length, 3);
  assert.equal(result.mach, 0);
  assert.equal(result.reynoldsNumber, 1e5);
  assert.equal(result.points[0].normalForceCoefficient, -1);
  assert.equal(result.points[2].normalForceCoefficient, 1);
  assert.equal(result.points[1].axialForceCoefficient, -0.8);
  assert.equal(result.points[1].sideForceCoefficient, 0);
  assert.ok(result.points[1].dragCoefficientUncertainty !== null);
});

test("legacy table polar falls back to small-angle normal force with an explicit warning", () => {
  const result = sampleAerodynamicPolar(table(), {
    angleOfAttackPointsRad: [-0.1, 0, 0.1],
  });

  assert.equal(result.status, "assessed");
  assert.equal(result.points[0].normalForceCoefficient, -0.2);
  assert.equal(result.points[2].normalForceCoefficient, 0.2);
  assert.equal(result.points[1].axialForceCoefficient, -0.4);
  assert.ok(result.warnings.some((warning) => warning.includes("small-angle normal-force")));
});

test("polar sampler reports unsupported samples and rejects unsafe sample declarations", () => {
  const model = table({
    angleOfAttackPointsRad: [-0.1, 0.1],
    sideslipPointsRad: [-0.05, 0.05],
    dragCoefficientByAngle: volume(0.4, 0.01, 0.1),
    outOfRangePolicy: "clamp-with-warning",
  });
  const result = sampleAerodynamicPolar(model, {
    angleOfAttackPointsRad: [-0.1, 0, 0.1],
    sideslipRad: 0.2,
  });
  assert.equal(result.status, "review");
  assert.ok(result.warnings.some((warning) => warning.includes("outside the declared coefficient domain")));
  assert.throws(
    () => sampleAerodynamicPolar(model, { angleOfAttackPointsRad: [0, 0.1, 0.05] }),
    /strictly increasing/,
  );
});

test("polar CSV retains fixed-condition provenance and nullable coefficient fields", () => {
  const result = sampleAerodynamicPolar(table(), {
    mach: 0.25,
    reynoldsNumber: 1e6,
    sideslipRad: 0,
    angleOfAttackPointsRad: [-0.1, 0, 0.1],
  });
  const csv = createAerodynamicPolarCsv(result);
  assert.equal(csv, createAerodynamicPolarCsv(result));
  assert.match(csv, /^# RocketWorks aerodynamic polar export,1\r\n/);
  assert.match(csv, /# model_version,rocketworks-aero-polar-0\.1\.0/);
  assert.match(csv, /# mach,0\.25/);
  assert.match(csv, /# sideslip_deg,0/);
  assert.match(csv, /angle_of_attack_deg,sideslip_deg,drag_coefficient,normal_force_coefficient/);
  assert.match(csv, /-5\.729577951308232,0,0\.4,-0\.2,-0\.4,,0\.5,-0\.5,0\.01/);
  assert.doesNotMatch(csv, /NaN|Infinity/);
});
