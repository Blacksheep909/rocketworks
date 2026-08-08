import assert from "node:assert/strict";
import test from "node:test";
import { computeStaticStability } from "../lib/physics/index.ts";

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

const cone = {
  id: "nose",
  name: "Conical nose",
  stageId: "sustainer",
  kind: "axisymmetric",
  densityKgM3: 1000,
  stations: [
    { xM: 0, outerRadiusM: 0 },
    { xM: 0.3, outerRadiusM: 0.05 },
  ],
};

test("slender-body cone has slope two and CP at two-thirds length", () => {
  const result = computeStaticStability({
    components: [cone],
    centerOfMassXM: 0.1,
  });

  close(result.normalForceSlopePerRad, 2, 1e-12, "cone normal-force slope");
  close(result.centerOfPressureXM, 0.2, 1e-12, "cone CP");
  close(result.staticMarginCalibers, 1, 1e-12, "cone static margin");
});

test("constant-diameter tube contributes no normal-force slope", () => {
  const tube = {
    id: "tube",
    name: "Tube",
    stageId: "sustainer",
    kind: "axisymmetric",
    densityKgM3: 1000,
    positionM: { x: 0.3, y: 0, z: 0 },
    stations: [
      { xM: 0, outerRadiusM: 0.05 },
      { xM: 0.7, outerRadiusM: 0.05 },
    ],
  };
  const result = computeStaticStability({
    components: [cone, tube],
    centerOfMassXM: 0.1,
  });

  assert.equal(result.contributions.length, 1);
  assert.equal(result.contributions[0].id, "nose");
  close(result.centerOfPressureXM, 0.2, 1e-12, "unchanged CP");
});

test("fin-set slope and CP match the documented closed-form relation", () => {
  const finSet = {
    id: "fins",
    name: "Fin set",
    stageId: "sustainer",
    kind: "finSet",
    count: 4,
    axialPositionM: 0.8,
    bodyRadiusM: 0.05,
    rootChordM: 0.2,
    tipChordM: 0.1,
    sweepM: 0.06,
    spanM: 0.1,
    thicknessM: 0.003,
    densityKgM3: 600,
  };
  const result = computeStaticStability({
    components: [finSet],
    centerOfMassXM: 0.5,
    referenceDiameterM: 0.1,
  });
  const midChordLine = Math.hypot(0.1, 0.06 + 0.1 / 2 - 0.2 / 2);
  const expectedSlope =
    (1 + 0.05 / 0.15) *
    4 *
    4 *
    (0.1 / 0.1) ** 2 /
    (1 + Math.sqrt(1 + (2 * midChordLine / 0.3) ** 2));
  const expectedCp =
    0.8 +
    (0.06 / 3) * ((0.2 + 2 * 0.1) / 0.3) +
    (1 / 6) * (0.2 + 0.1 - (0.2 * 0.1) / 0.3);

  close(result.normalForceSlopePerRad, expectedSlope, 1e-12, "fin slope");
  close(result.centerOfPressureXM, expectedCp, 1e-12, "fin CP");
});

test("vehicle CP is the normal-force-slope weighted contribution location", () => {
  const fins = {
    id: "fins",
    name: "Fin set",
    stageId: "sustainer",
    kind: "finSet",
    count: 3,
    axialPositionM: 0.75,
    bodyRadiusM: 0.05,
    rootChordM: 0.2,
    tipChordM: 0.08,
    sweepM: 0.05,
    spanM: 0.1,
    thicknessM: 0.003,
    densityKgM3: 600,
  };
  const result = computeStaticStability({
    components: [cone, fins],
    centerOfMassXM: 0.4,
  });
  const weighted = result.contributions.reduce(
    (sum, contribution) =>
      sum +
      contribution.normalForceSlopePerRad * contribution.centerOfPressureXM,
    0,
  ) / result.normalForceSlopePerRad;

  close(result.centerOfPressureXM, weighted, 1e-12, "weighted CP");
  assert.ok(result.staticMarginCalibers > 0);
});

test("Mach and atypical fin count produce explicit applicability warnings", () => {
  const result = computeStaticStability({
    components: [
      cone,
      {
        id: "fins",
        name: "Fin set",
        stageId: "sustainer",
        kind: "finSet",
        count: 5,
        axialPositionM: 0.7,
        bodyRadiusM: 0.05,
        rootChordM: 0.2,
        tipChordM: 0.1,
        sweepM: 0.04,
        spanM: 0.1,
        thicknessM: 0.003,
        densityKgM3: 600,
      },
    ],
    centerOfMassXM: 0.4,
    mach: 0.8,
  });

  assert.ok(result.warnings.some((warning) => warning.severity === "unsupported"));
  assert.ok(
    result.warnings.some((warning) =>
      warning.title.includes("Fin-count"),
    ),
  );
});

test("stage filtering changes the active aerodynamic configuration", () => {
  const boosterNose = {
    ...cone,
    id: "booster-nose",
    name: "Booster nose",
    stageId: "booster",
    positionM: { x: 1, y: 0, z: 0 },
  };
  const result = computeStaticStability({
    components: [cone, boosterNose],
    centerOfMassXM: 0.1,
    activeStageIds: ["sustainer"],
  });

  assert.equal(result.contributions.length, 1);
  assert.equal(result.contributions[0].id, "nose");
});

