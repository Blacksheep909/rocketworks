import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeRelativeAeroInteraction,
  RELATIVE_AERO_INTERACTION_MODEL_VERSION,
} from "../lib/physics/index.ts";

const environmentAt = () => ({
  windWorldMps: { x: 0, y: 0, z: 0 },
  atmosphere: { densityKgM3: 1.2, speedOfSoundMps: 340 },
});

function body(id, trace, overrides = {}) {
  return {
    id,
    releaseTimeS: 0,
    referenceAreaM2: Math.PI / 4,
    envelopeRadiusM: 0.5,
    trace,
    ...overrides,
  };
}

const sourceTrace = [
  { timeS: 0, positionWorldM: { x: 0, y: 0, z: 100 }, velocityWorldMps: { x: 50, y: 0, z: 0 } },
  { timeS: 1, positionWorldM: { x: 10, y: 0, z: 100 }, velocityWorldMps: { x: 50, y: 0, z: 0 } },
];

test("relative-flow interaction detects directed wake exposure and dynamic-pressure proxy", () => {
  const result = analyzeRelativeAeroInteraction({
    environmentAt,
    bodies: [
      body("source", sourceTrace, { label: "Source" }),
      body("target", [
        { timeS: 0, positionWorldM: { x: 5, y: 0, z: 100 }, velocityWorldMps: { x: 50, y: 0, z: 0 } },
        { timeS: 1, positionWorldM: { x: 30, y: 0, z: 100 }, velocityWorldMps: { x: 50, y: 0, z: 0 } },
      ], { label: "Target" }),
    ],
  });

  assert.equal(result.modelVersion, RELATIVE_AERO_INTERACTION_MODEL_VERSION);
  assert.deepEqual(result.configuration, {
    enabled: true,
    wakeHalfAngleDeg: 8,
    wakeRecoveryDistanceBodyDiameters: 30,
    peakVelocityDeficitFraction: 0.5,
    maximumVelocityDeficitFraction: 0.7,
  });
  assert.equal(result.status, "assessed");
  assert.equal(result.assessedPairCount, 2);
  assert.equal(result.exposedPairCount, 1);
  const sourceToTarget = result.pairs.find((pair) => pair.sourceBodyId === "source" && pair.targetBodyId === "target");
  assert.equal(sourceToTarget?.exposedSampleCount, 2);
  assert.equal(sourceToTarget?.exposureCoverageFraction, 1);
  assert.ok(Math.abs(sourceToTarget?.peakVelocityDeficitFraction - (5 / 12)) < 1e-12);
  assert.ok(Math.abs(sourceToTarget?.maximumEstimatedDynamicPressureDeltaPa - 989.5833333333334) < 1e-9);
  assert.ok(result.warnings.some((warning) => warning.includes("wake cones overlap")));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("dynamic-pressure")));
});

test("relative-flow interaction keeps lateral paths assessed without false exposure", () => {
  const result = analyzeRelativeAeroInteraction({
    bodies: [
      body("source", sourceTrace),
      body("offset", [
        { timeS: 0, positionWorldM: { x: 5, y: 10, z: 100 }, velocityWorldMps: { x: 50, y: 0, z: 0 } },
        { timeS: 1, positionWorldM: { x: 30, y: 10, z: 100 }, velocityWorldMps: { x: 50, y: 0, z: 0 } },
      ]),
    ],
  });
  const sourceToOffset = result.pairs.find((pair) => pair.sourceBodyId === "source" && pair.targetBodyId === "offset");
  assert.equal(result.status, "assessed");
  assert.equal(result.exposedPairCount, 0);
  assert.equal(sourceToOffset?.exposedSampleCount, 0);
  assert.ok((sourceToOffset?.minimumWakeClearanceM ?? 0) > 0);
});

test("relative-flow interaction reports missing geometry and disabled analysis explicitly", () => {
  const missingGeometry = analyzeRelativeAeroInteraction({
    bodies: [
      body("source", sourceTrace, { referenceAreaM2: undefined, envelopeRadiusM: undefined }),
      body("target", sourceTrace),
      body("third", sourceTrace.map((point) => ({
        ...point,
        positionWorldM: { ...point.positionWorldM, y: 10 },
      }))),
    ],
  });
  assert.equal(missingGeometry.status, "partial");
  assert.equal(missingGeometry.assessedPairCount, 2);
  assert.ok(missingGeometry.warnings.some((warning) => warning.includes("without a positive reference area")));

  const disabled = analyzeRelativeAeroInteraction({
    options: { enabled: false },
    bodies: [body("source", sourceTrace), body("target", sourceTrace)],
  });
  assert.equal(disabled.status, "not-assessed");
  assert.equal(disabled.pairs.length, 0);
  assert.equal(disabled.configuration.enabled, false);
  assert.ok(disabled.warnings.some((warning) => warning.includes("disabled")));
});

test("relative-flow interaction validates bounds and preserves the no-provider boundary", () => {
  assert.throws(
    () => analyzeRelativeAeroInteraction({
      options: { wakeHalfAngleDeg: 46 },
      bodies: [body("a", sourceTrace), body("b", sourceTrace)],
    }),
    /half-angle/,
  );
  assert.throws(
    () => analyzeRelativeAeroInteraction({
      options: { peakVelocityDeficitFraction: 0.8, maximumVelocityDeficitFraction: 0.7 },
      bodies: [body("a", sourceTrace), body("b", sourceTrace)],
    }),
    /cannot exceed/,
  );
  const result = analyzeRelativeAeroInteraction({
    options: {
      wakeHalfAngleDeg: 12,
      wakeRecoveryDistanceBodyDiameters: 40,
      peakVelocityDeficitFraction: 0.4,
      maximumVelocityDeficitFraction: 0.65,
    },
    bodies: [body("source", sourceTrace), body("target", sourceTrace.map((point) => ({
      ...point,
      positionWorldM: { ...point.positionWorldM, x: point.positionWorldM.x + 5 },
    })))],
  });
  const pair = result.pairs.find((candidate) => candidate.sourceBodyId === "source" && candidate.targetBodyId === "target");
  assert.equal(result.configuration.wakeHalfAngleDeg, 12);
  assert.equal(result.configuration.wakeRecoveryDistanceBodyDiameters, 40);
  assert.equal(result.configuration.peakVelocityDeficitFraction, 0.4);
  assert.equal(result.configuration.maximumVelocityDeficitFraction, 0.65);
  assert.equal(pair?.maximumEstimatedDynamicPressureDeltaPa, null);
  assert.ok(result.warnings.some((warning) => warning.includes("dynamic-pressure deltas remain unavailable")));
});

test("relative-flow interaction queries directed relative-body database diagnostics without changing the trace", () => {
  const database = {
    id: "separation-fixture",
    name: "Separation fixture",
    machPoints: [0, 1],
    axialSeparationPointsBodyDiameters: [0, 30],
    lateralSeparationPointsBodyDiameters: [0, 2],
    axialForceCoefficientDelta: {
      values: [
        [[0.1, 0.1], [0.1, 0.1]],
        [[0.1, 0.1], [0.1, 0.1]],
      ],
    },
    normalForceCoefficientDelta: {
      values: [
        [[0.02, 0.02], [0.02, 0.02]],
        [[0.02, 0.02], [0.02, 0.02]],
      ],
    },
    pitchMomentCoefficientDelta: {
      values: [
        [[0.01, 0.01], [0.01, 0.01]],
        [[0.01, 0.01], [0.01, 0.01]],
      ],
    },
    momentReferenceLengthM: 1,
    provenance: {
      sourceName: "Synthetic separation fixture",
      sourceKind: "user-supplied",
      dataVersion: "fixture-1",
      licenseIdentifier: "CC0-1.0",
      validationStatus: "user-supplied-unvalidated",
    },
  };
  const sourceBefore = structuredClone(sourceTrace);
  const result = analyzeRelativeAeroInteraction({
    environmentAt,
    options: {
      databaseBindings: [{ sourceBodyId: "source", targetBodyId: "target", database }],
    },
    bodies: [
      body("source", sourceTrace),
      body("target", sourceTrace.map((point) => ({
        ...point,
        positionWorldM: { ...point.positionWorldM, x: point.positionWorldM.x + 5 },
      }))),
    ],
  });
  const pair = result.pairs.find((candidate) => candidate.sourceBodyId === "source" && candidate.targetBodyId === "target");
  assert.equal(result.databasePairCount, 1);
  assert.equal(result.databaseSampleCount, 2);
  assert.equal(result.databaseBindings[0]?.databaseId, "separation-fixture");
  assert.equal(pair?.databaseId, "separation-fixture");
  assert.equal(pair?.databaseSampleCount, 2);
  assert.equal(pair?.databaseCoverageFraction, 1);
  assert.ok((pair?.maximumDatabaseForceDeltaN ?? 0) > 0);
  assert.ok((pair?.maximumDatabaseMomentDeltaNm ?? 0) > 0);
  assert.ok(result.warnings.some((warning) => warning.includes("source-declared diagnostic deltas")));
  assert.deepEqual(sourceTrace, sourceBefore);
});
