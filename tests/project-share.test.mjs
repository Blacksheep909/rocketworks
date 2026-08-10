import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECT_SHARE_HASH_PREFIX,
  decodeProjectShare,
  encodeProjectShare,
} from "../lib/project/project-share.ts";
import { createDefaultVehicleTopology } from "../lib/project/vehicle-topology.ts";

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
  windAzimuthDeg: 0,
  relativeHumidityPercent: 60,
  surfacePressureHpa: 1004,
  surfaceTemperatureC: 15,
  launchRailEnabled: true,
  launchRailLengthM: 1.2,
  launchRailInclinationDeg: 0,
  launchRailAzimuthDeg: 0,
  recoveryEnabled: true,
  recoveryDelayS: 0,
  recoveryDiameterM: 0.45,
  recoveryMassKg: 0.06,
  recoveryDeploymentSuccessProbability: 0.9,
};

test("project share links round-trip validated design configuration deterministically", () => {
  const source = {
    projectName: "ARC 54 / flight review",
    editableInputs: inputs,
    topology: createDefaultVehicleTopology(),
    selectedMotorId: "synthetic",
    selectedAerodynamicTableId: "constant",
  };
  const first = encodeProjectShare(source);
  const second = encodeProjectShare(source);
  assert.equal(first, second);
  assert.ok(first.startsWith(PROJECT_SHARE_HASH_PREFIX));
  assert.deepEqual(decodeProjectShare(first), {
    ...source,
    editableInputs: {
      ...inputs,
      noseLengthMm: 180,
      noseProfile: "ogive",
      finCount: 3,
      finRootChordMm: 130,
      finTipChordMm: 55,
      finSweepMm: 45,
      finSpanMm: 75,
      finThicknessMm: 3,
      launchRailLengthM: 1.2,
      launchRailInclinationDeg: 0,
      launchRailAzimuthDeg: 0,
      recoveryMassKg: 0.06,
      recoveryDeploymentSuccessProbability: 0.9,
      recoveryReefingEnabled: false,
      recoveryReefingDurationS: 3,
      recoveryReefingStartAreaFraction: 0.35,
      uncertaintySampleCount: 48,
      uncertaintySeed: "arc54-preview-v1",
      uncertaintyCorrelations: [],
    },
  });
});

test("project share decoder accepts a full URL and rejects tampered payloads", () => {
  const hash = encodeProjectShare({
    projectName: "ARC 54",
    editableInputs: inputs,
    topology: createDefaultVehicleTopology(),
    selectedMotorId: "synthetic",
    selectedAerodynamicTableId: "constant",
  });
  const fullUrl = `https://kestrel.example/design${hash}`;
  assert.equal(decodeProjectShare(fullUrl).projectName, "ARC 54");
  assert.throws(() => decodeProjectShare(`${hash.slice(0, -1)}x`), /Could not read RocketWorks share link|payload/);
  assert.throws(() => decodeProjectShare("#kestrel-share=not-base64!"), /payload/);
});

test("project share encoder keeps external library data out of the payload", () => {
  const hash = encodeProjectShare({
    projectName: "ARC 54",
    editableInputs: inputs,
    topology: createDefaultVehicleTopology(),
    selectedMotorId: "user-motor-01",
    selectedAerodynamicTableId: "wind-tunnel-01",
  });
  const restored = decodeProjectShare(hash);
  assert.equal(restored.selectedMotorId, "user-motor-01");
  assert.equal(restored.selectedAerodynamicTableId, "wind-tunnel-01");
  assert.equal(JSON.stringify(restored).includes("thrustCurve"), false);
  assert.equal(JSON.stringify(restored).includes("coefficientTable"), false);
});
