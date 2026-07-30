import assert from "node:assert/strict";
import test from "node:test";
import {
  axisymmetricMassProperties,
  combineMassProperties,
  computeVehicleMassProperties,
  finSetMassProperties,
  rotationAboutX,
  transformMassProperties,
} from "../lib/physics/index.ts";

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

test("hollow cylinder matches closed-form mass, CG, and inertia", () => {
  const length = 0.8;
  const outerRadius = 0.05;
  const innerRadius = 0.046;
  const density = 1250;
  const result = axisymmetricMassProperties({
    id: "tube",
    name: "Tube",
    stageId: "sustainer",
    kind: "axisymmetric",
    densityKgM3: density,
    wallThicknessM: outerRadius - innerRadius,
    stations: [
      { xM: 0, outerRadiusM: outerRadius },
      { xM: length, outerRadiusM: outerRadius },
    ],
  });
  const mass = density * Math.PI * (outerRadius ** 2 - innerRadius ** 2) * length;
  const axial = 0.5 * mass * (outerRadius ** 2 + innerRadius ** 2);
  const transverse =
    (mass / 12) * (3 * (outerRadius ** 2 + innerRadius ** 2) + length ** 2);

  close(result.massKg, mass, 1e-12, "mass");
  close(result.centerOfMassM.x, length / 2, 1e-12, "CG");
  close(result.inertiaAtCenterKgM2[0][0], axial, 1e-12, "axial inertia");
  close(result.inertiaAtCenterKgM2[1][1], transverse, 1e-12, "transverse inertia");
});

test("solid cone matches closed-form mass, CG, and inertia", () => {
  const length = 0.3;
  const radius = 0.06;
  const density = 900;
  const result = axisymmetricMassProperties({
    id: "cone",
    name: "Cone",
    stageId: "sustainer",
    kind: "axisymmetric",
    densityKgM3: density,
    stations: [
      { xM: 0, outerRadiusM: radius },
      { xM: length, outerRadiusM: 0 },
    ],
  });
  const mass = (density * Math.PI * radius ** 2 * length) / 3;
  const axial = (3 / 10) * mass * radius ** 2;
  const transverse = (3 / 80) * mass * (4 * radius ** 2 + length ** 2);

  close(result.massKg, mass, 1e-12, "mass");
  close(result.centerOfMassM.x, length / 4, 1e-12, "CG from cone base");
  close(result.inertiaAtCenterKgM2[0][0], axial, 1e-12, "axial inertia");
  close(result.inertiaAtCenterKgM2[1][1], transverse, 1e-12, "transverse inertia");
});

test("parallel-axis composition matches two equal point masses", () => {
  const combined = combineMassProperties([
    {
      massKg: 2,
      centerOfMassM: { x: -1, y: 0, z: 0 },
      inertiaAtCenterKgM2: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    },
    {
      massKg: 2,
      centerOfMassM: { x: 1, y: 0, z: 0 },
      inertiaAtCenterKgM2: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    },
  ]);

  close(combined.massKg, 4, 1e-12, "combined mass");
  close(combined.centerOfMassM.x, 0, 1e-12, "combined CG");
  close(combined.inertiaAtCenterKgM2[0][0], 0, 1e-12, "Ixx");
  close(combined.inertiaAtCenterKgM2[1][1], 4, 1e-12, "Iyy");
  close(combined.inertiaAtCenterKgM2[2][2], 4, 1e-12, "Izz");
});

test("rigid rotation preserves principal moments and rotates the center", () => {
  const result = transformMassProperties(
    {
      massKg: 1,
      centerOfMassM: { x: 0, y: 2, z: 0 },
      inertiaAtCenterKgM2: [[1, 0, 0], [0, 2, 0], [0, 0, 3]],
    },
    { rotation: rotationAboutX(Math.PI / 2) },
  );

  close(result.centerOfMassM.y, 0, 1e-12, "rotated y");
  close(result.centerOfMassM.z, 2, 1e-12, "rotated z");
  close(result.inertiaAtCenterKgM2[1][1], 3, 1e-12, "rotated Iyy");
  close(result.inertiaAtCenterKgM2[2][2], 2, 1e-12, "rotated Izz");
});

test("symmetric fin set has expected mass and zero transverse CG", () => {
  const count = 4;
  const root = 0.12;
  const tip = 0.06;
  const span = 0.08;
  const thickness = 0.003;
  const density = 600;
  const result = finSetMassProperties({
    id: "fins",
    name: "Fins",
    stageId: "sustainer",
    kind: "finSet",
    count,
    axialPositionM: 0.7,
    bodyRadiusM: 0.027,
    rootChordM: root,
    tipChordM: tip,
    sweepM: 0.04,
    spanM: span,
    thicknessM: thickness,
    densityKgM3: density,
  });
  const expectedMass = count * density * ((root + tip) * span / 2) * thickness;

  close(result.massKg, expectedMass, 1e-12, "fin-set mass");
  close(result.centerOfMassM.y, 0, 1e-12, "fin-set CG y");
  close(result.centerOfMassM.z, 0, 1e-12, "fin-set CG z");
});

test("stage filtering excludes inactive-stage components", () => {
  const components = [
    {
      id: "booster",
      name: "Booster ballast",
      stageId: "booster",
      kind: "pointMass",
      massKg: 1,
      positionM: { x: 1, y: 0, z: 0 },
    },
    {
      id: "sustainer",
      name: "Sustainer ballast",
      stageId: "sustainer",
      kind: "pointMass",
      massKg: 2,
      positionM: { x: 0, y: 0, z: 0 },
    },
  ];
  const result = computeVehicleMassProperties(components, {
    activeStageIds: ["sustainer"],
  });

  close(result.massKg, 2, 1e-12, "filtered mass");
  assert.equal(result.componentCount, 1);
  assert.deepEqual(result.activeStageIds, ["sustainer"]);
});

