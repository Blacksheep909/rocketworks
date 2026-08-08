import assert from "node:assert/strict";
import test from "node:test";

import {
  createImpulseBasedPropellantModel,
  createMotorDataRecord,
  createMotorLibrary,
  createMultiStageVehicleModel,
  estimateMotorImpulseClass,
  exportMotorThrustCsv,
  importMotorThrustCsv,
  motorRecordToImpulseBasedMotor,
  motorRecordToMultiStageMotor,
} from "../lib/physics/index.ts";

const provenance = {
  sourceName: "Synthetic regression fixture",
  sourceKind: "synthetic",
  dataVersion: "fixture-1",
  licenseIdentifier: "CC0-1.0",
  attribution: "Kestrel Lab test fixture",
  validationStatus: "synthetic-unvalidated",
};

function input(overrides = {}) {
  return {
    id: "fixture.C10",
    manufacturer: "Fixture Motors",
    designation: "C10-0",
    diameterM: 0.024,
    lengthM: 0.07,
    launchMassKg: 0.06,
    dryMassKg: 0.04,
    thrustCurve: [
      { timeS: 0, thrustN: 0 },
      { timeS: 1, thrustN: 20 },
      { timeS: 2, thrustN: 0 },
    ],
    ejectionDelaysS: [5, 0, 3],
    provenance,
    ...overrides,
  };
}

test("motor record derives impulse, thrust, class, propellant mass, and Isp", () => {
  const record = createMotorDataRecord(input());
  assert.equal(record.metrics.totalImpulseNs, 20);
  assert.equal(record.metrics.burnDurationS, 2);
  assert.equal(record.metrics.averageThrustN, 10);
  assert.equal(record.metrics.peakThrustN, 20);
  assert.ok(Math.abs(record.metrics.propellantMassKg - 0.02) < 1e-15);
  assert.ok(Math.abs(record.metrics.specificImpulseS - 20 / (0.02 * 9.80665)) < 1e-12);
  assert.equal(record.metrics.impulseClassEstimate, "D");
  assert.equal(record.metrics.percentOfClassMaximum, 100);
  assert.deepEqual(record.ejectionDelaysS, [0, 3, 5]);
  assert.match(record.warnings[0], /not marked as certified test data/);
  assert.match(record.warnings[1], /not a certification claim/);
});

test("impulse classes cover fractional A through O without certification semantics", () => {
  const cases = [
    [0.3125, "1/8A"],
    [0.3125001, "1/4A"],
    [0.625, "1/4A"],
    [1.25, "1/2A"],
    [1.250001, "A"],
    [2.5, "A"],
    [5, "B"],
    [10, "C"],
    [320, "H"],
    [40_960, "O"],
    [40_961, "above-O"],
  ];
  for (const [impulse, expected] of cases) {
    assert.equal(estimateMotorImpulseClass(impulse).classEstimate, expected);
  }
  assert.throws(() => estimateMotorImpulseClass(0), /positive finite/);
});

test("strict CSV import accepts comments and round-trips curve values", () => {
  const metadata = input();
  delete metadata.thrustCurve;
  const record = importMotorThrustCsv(
    "\uFEFF# user export\r\ntime_s, thrust_n\r\n0,0\r\n1,2.0e1\r\n2,0\r\n",
    metadata,
  );
  assert.equal(record.metrics.totalImpulseNs, 20);
  assert.equal(exportMotorThrustCsv(record), "time_s,thrust_n\n0,0\n1,20\n2,0");
});

test("motor mass properties use the declared local geometry", () => {
  const record = createMotorDataRecord(input({
    propellantGeometry: { lengthM: 0.04, aftInsetM: 0.01 },
    dryCgFromAftM: 0.04,
  }));
  assert.deepEqual(record.dryMassPropertiesLocal.centerOfMassM, { x: 0.04, y: 0, z: 0 });
  assert.deepEqual(record.propellantMassPropertiesLocal.centerOfMassM, { x: 0.03, y: 0, z: 0 });
  const radius = 0.012;
  assert.ok(Math.abs(record.dryMassPropertiesLocal.inertiaAtCenterKgM2[0][0] - 0.5 * 0.04 * radius ** 2) < 1e-15);
});

test("record adapter drives the shared impulse-based mass model", () => {
  const record = createMotorDataRecord(input());
  const motor = motorRecordToImpulseBasedMotor(record, {
    id: "placed-motor",
    ignitionTimeS: 0.5,
    originBodyM: { x: 1, y: 0.1, z: -0.2 },
  });
  assert.deepEqual(motor.dryMassProperties.centerOfMassM, { x: 1.035, y: 0.1, z: -0.2 });
  const model = createImpulseBasedPropellantModel({
    fixedVehicleMassProperties: {
      massKg: 1,
      centerOfMassM: { x: 0, y: 0, z: 0 },
      inertiaAtCenterKgM2: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    },
    motors: [motor],
  });
  assert.equal(model.evaluate(0).motors[0].status, "waiting");
  assert.equal(model.evaluate(1.5).motors[0].deliveredImpulseNs, 10);
});

test("record adapter drives the multi-stage propulsion model", () => {
  const record = createMotorDataRecord(input());
  const motor = motorRecordToMultiStageMotor(record, {
    id: "stage-motor",
    ignitionDelayS: 0.2,
    originBodyM: { x: 0.8, y: 0, z: 0 },
    thrustAxisBody: { x: 2, y: 0, z: 0 },
  });
  assert.deepEqual(motor.thrustAxisBody, { x: 1, y: 0, z: 0 });
  const model = createMultiStageVehicleModel({
    retainedMassProperties: {
      massKg: 0.1,
      centerOfMassM: { x: 1.5, y: 0, z: 0 },
      inertiaAtCenterKgM2: [[0.01, 0, 0], [0, 0.01, 0], [0, 0, 0.01]],
    },
    stages: [{
      id: "sustainer",
      name: "Sustainer",
      structuralMassProperties: {
        massKg: 1,
        centerOfMassM: { x: 0.4, y: 0, z: 0 },
        inertiaAtCenterKgM2: [[0.1, 0, 0], [0, 0.2, 0], [0, 0, 0.2]],
      },
      motors: [motor],
    }],
  });
  assert.equal(model.stageIds[0], "sustainer");
  assert.equal(model.burnoutOffsetS("sustainer"), 2.2);
});

test("motor library enforces unique IDs and supports physical/provenance filters", () => {
  const first = createMotorDataRecord(input());
  const second = createMotorDataRecord(input({
    id: "fixture.B4",
    designation: "B4-4",
    diameterM: 0.018,
    thrustCurve: [{ timeS: 0, thrustN: 0 }, { timeS: 1, thrustN: 10 }, { timeS: 2, thrustN: 0 }],
  }));
  const library = createMotorLibrary([first, second]);
  assert.equal(library.getById("fixture.C10"), first);
  assert.equal(library.getById("missing"), null);
  assert.deepEqual(library.search({ text: "b4" }).map((record) => record.id), ["fixture.B4"]);
  assert.deepEqual(library.search({ minimumImpulseNs: 15 }).map((record) => record.id), ["fixture.C10"]);
  assert.deepEqual(library.search({ maximumDiameterM: 0.02 }).map((record) => record.id), ["fixture.B4"]);
  assert.equal(library.search({ validationStatus: "certified-test-data" }).length, 0);
  assert.throws(() => createMotorLibrary([first, first]), /duplicate motor library/);
});

test("invalid metadata, curves, CSV, masses, and geometry fail explicitly", () => {
  assert.throws(() => createMotorDataRecord(input({ id: "bad id" })), /identifiers/);
  assert.throws(() => createMotorDataRecord(input({ dryMassKg: 0.06 })), /less than launch mass/);
  assert.throws(() => createMotorDataRecord(input({ thrustCurve: [{ timeS: 0.1, thrustN: 1 }, { timeS: 1, thrustN: 0 }] })), /begin at time 0/);
  assert.throws(() => createMotorDataRecord(input({ thrustCurve: [{ timeS: 0, thrustN: 1 }, { timeS: 1, thrustN: 1 }] })), /end with zero thrust/);
  assert.throws(() => createMotorDataRecord(input({ propellantGeometry: { lengthM: 0.07, aftInsetM: 0.01 } })), /within the motor case/);
  assert.throws(() => createMotorDataRecord(input({ provenance: { ...provenance, licenseIdentifier: "" } })), /license identifier/);
  assert.throws(() => createMotorDataRecord(input({ provenance: { ...provenance, sourceUrl: "file:///curve.csv" } })), /HTTP or HTTPS/);
  assert.throws(() => createMotorDataRecord(input({ provenance: { ...provenance, sourceKind: "synthetic", validationStatus: "certified-test-data" } })), /incompatible/);
  const metadata = input();
  delete metadata.thrustCurve;
  assert.throws(() => importMotorThrustCsv("time,thrust\n0,0\n1,0", metadata), /header/);
  assert.throws(() => importMotorThrustCsv("time_s,thrust_n\n0,0\n\"1\",2\n2,0", metadata), /quoted fields/);
  assert.throws(() => importMotorThrustCsv("time_s,thrust_n\n0,0\n1,comma\n2,0", metadata), /two decimal numbers/);
});
