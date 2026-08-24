import assert from "node:assert/strict";
import test from "node:test";
import {
  STAGE_FLIGHT_SWEEP_ADAPTER_VERSION,
  STAGE_FLIGHT_PREVIEW_MODEL_VERSION,
  sweepStageFlight,
} from "../lib/physics/index.ts";
import { createStageFlightSweepCsv } from "../lib/export/project-exports.ts";

function properties(massKg, x, inertia = 0.02) {
  return {
    massKg,
    centerOfMassM: { x, y: 0, z: 0 },
    inertiaAtCenterKgM2: [
      [inertia, 0, 0],
      [0, inertia, 0],
      [0, 0, inertia],
    ],
  };
}

const thrustCurve = [
  { timeS: 0, thrustN: 0 },
  { timeS: 1, thrustN: 30 },
  { timeS: 2, thrustN: 0 },
];

function motor(id, x) {
  return {
    id,
    name: id,
    thrustCurve,
    dryMassProperties: properties(0.1, x),
    initialPropellantMassProperties: properties(0.2, x),
    thrustApplicationPointBodyM: { x, y: 0, z: 0 },
  };
}

const baseInput = {
  retainedMassProperties: properties(0.4, 0.2),
  components: [
    {
      id: "stage-body",
      name: "Stage body",
      stageId: "core",
      kind: "axisymmetric",
      densityKgM3: 800,
      wallThicknessM: 0.001,
      positionM: { x: 0.2, y: 0, z: 0 },
      stations: [
        { xM: 0, outerRadiusM: 0.03 },
        { xM: 0.6, outerRadiusM: 0.03 },
      ],
    },
    {
      id: "stage-fins",
      name: "Stage fins",
      stageId: "core",
      kind: "finSet",
      count: 3,
      axialPositionM: 0.55,
      bodyRadiusM: 0.03,
      rootChordM: 0.16,
      tipChordM: 0.07,
      sweepM: 0.04,
      spanM: 0.07,
      thicknessM: 0.002,
      densityKgM3: 600,
    },
  ],
  stages: [
    {
      id: "core",
      name: "Core",
      structuralMassProperties: properties(0.5, 0.4),
      motors: [motor("core-motor", 0.4)],
    },
  ],
  regimes: [
    {
      id: "core",
      label: "Core",
      activeStageIds: ["core"],
      dragCoefficient: 0.6,
    },
  ],
  initiallyIgnitedStageIds: ["core"],
  durationS: 2.5,
  timeStepS: 0.05,
};

test("staged parameter sweep re-runs the coupled preview with deterministic rows", () => {
  const first = sweepStageFlight({
    baseInput,
    parameterKey: "thrustScale",
    minimum: 0.8,
    maximum: 1.2,
    steps: 5,
  });
  const second = sweepStageFlight({
    baseInput,
    parameterKey: "thrustScale",
    minimum: 0.8,
    maximum: 1.2,
    steps: 5,
  });

  assert.equal(first.adapterVersion, STAGE_FLIGHT_SWEEP_ADAPTER_VERSION);
  assert.equal(first.modelVersion, STAGE_FLIGHT_PREVIEW_MODEL_VERSION);
  assert.equal(first.result.samples.length, 5);
  assert.equal(first.result.samples.filter((sample) => sample.error === null).length, 5);
  assert.deepEqual(first.result.samples, second.result.samples);
  assert.equal(first.result.samples[0].value, 0.8);
  assert.equal(first.result.samples.at(-1).value, 1.2);
  assert.ok(first.result.samples[0].outputs.maxAltitudeAglM < first.result.samples.at(-1).outputs.maxAltitudeAglM);
  assert.ok(first.assumptions.some((assumption) => assumption.includes("same staged 6DOF")));
  assert.match(first.warnings.at(-1), /not validation/);
  const csv = createStageFlightSweepCsv(first);
  assert.match(csv, /# RocketWorks staged parameter sweep export,1/);
  assert.match(csv, new RegExp(`# model_version,${STAGE_FLIGHT_PREVIEW_MODEL_VERSION}`));
  assert.match(csv, /parameter_key,parameter_value,maxAltitudeAglM/);
  assert.equal(csv.split("\r\n").filter((row) => row.startsWith("thrustScale,")).length, 5);
});

test("staged sweep enforces the declared analytical range and row count", () => {
  assert.throws(
    () => sweepStageFlight({ baseInput, parameterKey: "thrustScale", minimum: 0.1, maximum: 1.2, steps: 5 }),
    /must remain between 0.75 and 1.3/,
  );
  assert.throws(
    () => sweepStageFlight({ baseInput, parameterKey: "alignmentOffsetRad", minimum: -0.02, maximum: 0, steps: 5 }),
    /must remain between -0.01 and 0.01/,
  );
  assert.throws(
    () => sweepStageFlight({ baseInput, parameterKey: "dryMassScale", minimum: 0.9, maximum: 1.1, steps: 1 }),
    /steps must be an integer from 2 through 1000/,
  );
});
