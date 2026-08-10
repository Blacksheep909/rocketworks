import assert from "node:assert/strict";
import test from "node:test";

import { createMotorDataRecord } from "../lib/physics/index.ts";
import { createDefaultVehicleTopology } from "../lib/project/vehicle-topology.ts";
import {
  createSimulationFingerprint,
  isSimulationFingerprintCurrent,
} from "../lib/project/simulation-freshness.ts";

const inputs = {
  lengthMm: 710,
  diameterMm: 54,
  payloadMassKg: 0.16,
  material: "kraft",
  thrustN: 22,
  burnTimeS: 1.65,
  dragCoefficient: 0.52,
  launchAltitudeM: 80,
  windSpeedMps: 4,
  relativeHumidityPercent: 60,
  surfacePressureHpa: 1004,
  surfaceTemperatureC: 15,
  launchRailEnabled: true,
  launchRailLengthM: 1.2,
  recoveryEnabled: true,
  recoveryDelayS: 0,
  recoveryDiameterM: 0.45,
  recoveryDeploymentSuccessProbability: 0.9,
};

const motor = createMotorDataRecord({
  id: "fixture.motor",
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
  provenance: {
    sourceName: "Simulation freshness fixture",
    sourceKind: "synthetic",
    dataVersion: "fixture-1",
    licenseIdentifier: "CC0-1.0",
    attribution: "RocketWorks test fixture",
    validationStatus: "synthetic-unvalidated",
  },
});

function fingerprint(overrides = {}) {
  return createSimulationFingerprint({
    inputs,
    topology: createDefaultVehicleTopology(),
    selectedMotorId: "fixture.motor",
    motor,
    ...overrides,
  });
}

test("simulation fingerprints are stable across object key order", () => {
  const first = fingerprint();
  const reordered = createSimulationFingerprint({
    inputs: { ...inputs },
    topology: { ...createDefaultVehicleTopology(), stages: [...createDefaultVehicleTopology().stages] },
    selectedMotorId: "fixture.motor",
    motor: { ...motor },
  });
  assert.equal(first, reordered);
  assert.equal(isSimulationFingerprintCurrent(first, reordered), true);
});

test("simulation fingerprints change when a modeled input or motor changes", () => {
  const baseline = fingerprint();
  const windChanged = fingerprint({ inputs: { ...inputs, windSpeedMps: 8 } });
  const humidityChanged = fingerprint({ inputs: { ...inputs, relativeHumidityPercent: 80 } });
  const pressureChanged = fingerprint({ inputs: { ...inputs, surfacePressureHpa: 990 } });
  const temperatureChanged = fingerprint({ inputs: { ...inputs, surfaceTemperatureC: 28 } });
  const topologyChanged = fingerprint({
    topology: {
      ...createDefaultVehicleTopology(),
      stages: createDefaultVehicleTopology().stages.map((stage) => ({
        ...stage,
        ignitionFailure: true,
      })),
    },
  });
  const motorChanged = fingerprint({
    motor: {
      ...motor,
      thrustCurve: motor.thrustCurve.map((point) => ({ ...point, thrustN: point.thrustN * 1.1 })),
    },
  });
  const cantChanged = fingerprint({
    topology: {
      ...createDefaultVehicleTopology(),
      stages: createDefaultVehicleTopology().stages.map((stage) => ({
        ...stage,
        thrustCantAngleDeg: 4,
      })),
    },
  });
  const railAngleChanged = fingerprint({
    inputs: { ...inputs, launchRailInclinationDeg: 8 },
  });
  assert.notEqual(baseline, windChanged);
  assert.notEqual(baseline, humidityChanged);
  assert.notEqual(baseline, pressureChanged);
  assert.notEqual(baseline, temperatureChanged);
  assert.notEqual(baseline, topologyChanged);
  assert.notEqual(baseline, motorChanged);
  assert.notEqual(baseline, cantChanged);
  assert.notEqual(baseline, railAngleChanged);
  assert.equal(isSimulationFingerprintCurrent(baseline, windChanged), false);
  assert.equal(isSimulationFingerprintCurrent(null, baseline), false);
});

test("simulation fingerprints include the selected aerodynamic data source", () => {
  const baseline = fingerprint();
  const selectedTable = fingerprint({
    selectedAerodynamicTableId: "fixture-table",
    aerodynamicTable: {
      id: "fixture-table",
      name: "Fixture table",
      machPoints: [0, 1],
      reynoldsPoints: [1e5, 1e6],
      dragCoefficient: { values: [[0.4, 0.6], [0.4, 0.6]] },
      normalForceSlopePerRad: { values: [[4, 4], [4, 4]] },
      centerOfPressureXM: { values: [[0.5, 0.5], [0.5, 0.5]] },
      provenance: {
        sourceName: "Fixture",
        sourceKind: "user-supplied",
        dataVersion: "1",
        licenseIdentifier: "CC0-1.0",
        attribution: "Fixture",
        validationStatus: "user-supplied-unvalidated",
      },
    },
  });
  assert.notEqual(baseline, selectedTable);
  assert.equal(isSimulationFingerprintCurrent(baseline, selectedTable), false);
});
