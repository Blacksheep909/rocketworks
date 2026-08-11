import assert from "node:assert/strict";
import test from "node:test";
import {
  createEngineeringDesignReview,
  createStageInterfaceLoadReview,
  createStageStructuralReview,
} from "../lib/physics/index.ts";

const structural = {
  modelVersion: "structural-test-0.1.0",
  validationStatus: "analytical-component-checks-only",
  overallStatus: "review",
  material: {
    label: "Test material",
    youngsModulusPa: 70e9,
    poissonRatio: 0.3,
    allowableCompressionPa: 200e6,
    allowableBendingPa: 200e6,
    allowableShearPa: 100e6,
  },
  geometry: {
    bodyLengthM: 1,
    minimumOuterDiameterM: 0.1,
    wallThicknessM: 0.002,
    minimumSectionAreaM2: 0.0006,
    minimumSecondMomentM4: 0.000001,
    slendernessRatio: 100,
    finPlanformAreaM2: 0.01,
  },
  loads: {
    peakThrustN: 100,
    weightN: 20,
    axialCompressionN: 120,
    dynamicPressurePa: 10000,
    designNormalForceCoefficient: 1.2,
    requiredFactorOfSafety: 1.5,
  },
  finFlutter: null,
  checks: {
    axialStress: {
      id: "axial-stress",
      label: "Axial compression stress",
      status: "review",
      demand: 300e6,
      capacity: 200e6,
      factorOfSafety: 0.67,
      unit: "Pa",
      detail: "test axial detail",
    },
    eulerBuckling: {
      id: "euler-buckling",
      label: "Euler column buckling",
      status: "pass",
      demand: 120,
      capacity: 1000,
      factorOfSafety: 8.33,
      unit: "N",
      detail: "test Euler detail",
    },
    finBending: {
      id: "fin-bending",
      label: "Fin-root bending stress",
      status: "unavailable",
      demand: null,
      capacity: null,
      factorOfSafety: null,
      unit: "Pa",
      detail: "test fin detail",
    },
    finShear: {
      id: "fin-shear",
      label: "Fin-root shear stress",
      status: "pass",
      demand: 100,
      capacity: 1000,
      factorOfSafety: 10,
      unit: "Pa",
      detail: "test shear detail",
    },
    finFlutter: {
      id: "fin-flutter",
      label: "Fin flutter margin",
      status: "unavailable",
      demand: null,
      capacity: null,
      factorOfSafety: null,
      unit: "m/s",
      detail: "test flutter detail",
    },
    staticMargin: {
      id: "static-margin",
      label: "Static margin review",
      status: "pass",
      demand: 1,
      capacity: 1.5,
      factorOfSafety: 1.5,
      unit: "cal",
      detail: "test static detail",
    },
  },
  assumptions: [],
  warnings: [],
};

test("engineering design review is nominal only when current checks pass", () => {
  const result = createEngineeringDesignReview({
    thrustToWeight: 4,
    staticMarginCalibers: 1.5,
    staticAerodynamicsModelVersion: "static-aero-test-0.1.0",
    verticalFlightCurrent: true,
    verticalFlightModelVersion: "vertical-test-0.1.0",
    stageFlightConfigured: false,
  });

  assert.equal(result.overallStatus, "nominal");
  assert.equal(result.counts.pass, 3);
  assert.equal(result.counts.review, 0);
  assert.equal(result.counts.unavailable, 0);
  assert.ok(result.primaryFinding);
  assert.ok(result.findings.every((finding) => finding.status === "pass"));
  assert.equal(result.validationStatus, "analytical-review-aggregation-only");
});

test("engineering design review ranks critical, stale, and staged findings", () => {
  const result = createEngineeringDesignReview({
    thrustToWeight: 2,
    staticMarginCalibers: 0,
    structural,
    verticalFlightCurrent: false,
    stageFlightConfigured: true,
    stageFlightCurrent: false,
    stageEventAllocationStatus: "invalid",
    stageConvergenceStatus: "watch",
    separationImpulseReviewCount: 2,
  });

  assert.equal(result.overallStatus, "review");
  assert.ok(result.counts.review > 0);
  assert.ok(result.primaryFinding);
  assert.equal(result.primaryFinding.severity, "critical");
  assert.ok(result.findings.some((finding) => finding.id === "structural-axial-stress"));
  assert.ok(result.findings.some((finding) => finding.id === "staging-event-allocation"));
  assert.ok(result.findings.some((finding) => finding.id === "staging-separation-impulse"));
  assert.ok(result.warnings.some((warning) => warning.includes("not flight-safety")));
});

test("engineering design review keeps missing evidence visible", () => {
  const result = createEngineeringDesignReview({
    thrustToWeight: null,
    staticMarginCalibers: null,
    verticalFlightCurrent: null,
    stageFlightConfigured: false,
  });

  assert.equal(result.overallStatus, "review");
  assert.equal(result.counts.pass, 0);
  assert.equal(result.counts.review, 0);
  assert.equal(result.counts.unavailable, 3);
  assert.ok(result.findings.every((finding) => finding.status === "unavailable"));
});

test("engineering design review rejects invalid numeric inputs", () => {
  assert.throws(
    () => createEngineeringDesignReview({ thrustToWeight: Number.NaN }),
    /thrust-to-weight ratio must be finite/,
  );
  assert.throws(
    () => createEngineeringDesignReview({ separationImpulseReviewCount: -1 }),
    /separation review count cannot be negative/,
  );
});

test("stage structural review preserves stage-level gaps and ranks the weakest row", () => {
  const result = createStageStructuralReview([
    {
      id: "core",
      label: "Core stage",
      role: "core",
      instanceCount: 1,
      screen: structural,
    },
    {
      id: "booster",
      label: "Booster pair",
      role: "booster",
      instanceCount: 2,
      screen: null,
      unavailableReason: "No independent booster body screen was generated.",
    },
  ]);

  assert.equal(result.overallStatus, "review");
  assert.deepEqual(result.counts, { pass: 0, review: 1, unavailable: 1 });
  assert.equal(result.checkCounts.review, 1);
  assert.equal(result.checkCounts.unavailable, 2);
  assert.equal(result.weakestStage?.id, "core");
  assert.equal(result.stages.find((stage) => stage.id === "booster")?.instanceCount, 2);
  assert.match(result.warnings.join(" "), /interfaces/);
});

test("stage structural review validates stage identifiers and instance counts", () => {
  assert.throws(
    () => createStageStructuralReview([
      { id: "", label: "Bad", screen: null },
    ]),
    /id must be non-empty/,
  );
  assert.throws(
    () => createStageStructuralReview([
      { id: "stage", label: "Bad", instanceCount: 0, screen: null },
    ]),
    /instance count must be a positive integer/,
  );
});

test("engineering design review surfaces stage structural aggregate as a finding", () => {
  const stageStructural = createStageStructuralReview([
    { id: "core", label: "Core", role: "core", screen: structural },
  ]);
  const result = createEngineeringDesignReview({
    thrustToWeight: 4,
    staticMarginCalibers: 1.5,
    verticalFlightCurrent: true,
    stageStructural,
  });

  const finding = result.findings.find((candidate) => candidate.id === "structural-stage-review");
  assert.ok(finding);
  assert.equal(finding.status, "review");
  assert.match(finding.detail, /stage interfaces/);
});

test("engineering design review keeps incomplete mass-ratio evidence visible", () => {
  const result = createEngineeringDesignReview({
    stageMassRatio: {
      modelVersion: "rocketworks-stage-mass-ratio-0.1.0",
      validationStatus: "analytical-ideal-rocket-equation",
      overallStatus: "review",
      stages: [{ status: "unavailable" }],
      assessedStageCount: 0,
      totalIdealDeltaVMps: null,
      assumptions: [],
      warnings: [],
    },
  });
  const finding = result.findings.find((candidate) => candidate.id === "staging-mass-ratio");
  assert.ok(finding);
  assert.equal(finding.status, "review");
  assert.match(finding.action, /incomplete stage mass/);
});

test("engineering design review surfaces vector-budget closure residuals", () => {
  const result = createEngineeringDesignReview({
    stageFlightConfigured: true,
    stageVectorBudget: {
      modelVersion: "rocketworks-stage-flight-vector-budget-0.1.0",
      closureStatus: "review",
      closureResidualMagnitudeMps: 2,
      closureToleranceMps: 0.5,
    },
  });

  const finding = result.findings.find((candidate) => candidate.id === "staging-vector-closure");
  assert.ok(finding);
  assert.equal(finding.status, "review");
  assert.match(finding.summary, /2\.000 m\/s/);
});

test("stage interface load review computes serial downstream demand and reserve", () => {
  const result = createStageInterfaceLoadReview({
    retainedMassKg: 0.2,
    stages: [
      {
        id: "core",
        label: "Core",
        attachment: "serial",
        stageMassKg: 1,
        peakThrustN: 30,
        sectionAreaM2: 0.002,
        allowableCompressionPa: 1e6,
      },
      {
        id: "upper",
        label: "Upper",
        parentStageId: "core",
        attachment: "serial",
        stageMassKg: 0.5,
        peakThrustN: 10,
        sectionAreaM2: 0.001,
        allowableCompressionPa: 2e6,
      },
    ],
  });

  assert.equal(result.modelVersion, "rocketworks-stage-interface-loads-0.1.0");
  assert.equal(result.validationStatus, "analytical-axial-load-path-proxy");
  assert.equal(result.overallStatus, "assessed");
  assert.deepEqual(result.counts, { pass: 1, review: 0, unavailable: 0 });
  assert.equal(result.totalStackMassKg, 1.7);
  assert.equal(result.interfaces.length, 1);
  assert.equal(result.interfaces[0].downstreamMassKg, 0.7);
  assert.equal(result.interfaces[0].sectionAreaM2, 0.001);
  assert.equal(result.interfaces[0].allowableCompressionPa, 1e6);
  assert.ok((result.interfaces[0].factorOfSafety ?? 0) > 1.5);
  assert.ok((result.interfaces[0].axialDemandN ?? 0) > 0);
  assert.match(result.warnings.join(" "), /does not model connector geometry/);
});

test("stage interface load review keeps parallel and missing capacity evidence unavailable", () => {
  const parallel = createStageInterfaceLoadReview({
    stages: [
      { id: "core", label: "Core", attachment: "serial", stageMassKg: 1, peakThrustN: 20 },
      { id: "booster", label: "Booster", parentStageId: "core", attachment: "parallel", stageMassKg: 0.5, peakThrustN: 10 },
    ],
  });
  assert.equal(parallel.overallStatus, "review");
  assert.equal(parallel.interfaces[0].status, "unavailable");
  assert.match(parallel.interfaces[0].reason ?? "", /radial/);

  const missingCapacity = createStageInterfaceLoadReview({
    stages: [
      { id: "core", label: "Core", attachment: "serial", stageMassKg: 1, peakThrustN: 20, sectionAreaM2: 0.001 },
      { id: "upper", label: "Upper", parentStageId: "core", attachment: "serial", stageMassKg: 0.5, peakThrustN: 10, sectionAreaM2: 0.001 },
    ],
  });
  assert.equal(missingCapacity.interfaces[0].status, "unavailable");
  assert.match(missingCapacity.interfaces[0].reason ?? "", /compression allowable/);
});

test("stage interface load review rejects malformed topology and surfaces a review finding", () => {
  assert.throws(
    () => createStageInterfaceLoadReview({
      stages: [
        { id: "a", label: "A", parentStageId: "b", attachment: "serial", stageMassKg: 1, peakThrustN: 0 },
        { id: "b", label: "B", parentStageId: "a", attachment: "serial", stageMassKg: 1, peakThrustN: 0 },
      ],
    }),
    /cycle/,
  );

  const stageInterfaceLoads = createStageInterfaceLoadReview({
    stages: [
      { id: "core", label: "Core", attachment: "serial", stageMassKg: 1, peakThrustN: 20 },
      { id: "upper", label: "Upper", parentStageId: "core", attachment: "serial", stageMassKg: 0.5, peakThrustN: 10 },
    ],
  });
  const review = createEngineeringDesignReview({ stageInterfaceLoads });
  const finding = review.findings.find((candidate) => candidate.id === "structural-stage-interface");
  assert.ok(finding);
  assert.equal(finding.status, "review");
  assert.match(finding.detail, /axial load-path proxy/);
});
