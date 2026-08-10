import assert from "node:assert/strict";
import test from "node:test";

import {
  computeFinFlutterScreen,
  standardAtmosphere,
} from "../lib/physics/index.ts";

const fins = {
  id: "fins",
  name: "Fin set",
  stageId: "sustainer",
  kind: "finSet",
  count: 3,
  axialPositionM: 0.78,
  bodyRadiusM: 0.03,
  rootChordM: 0.18,
  tipChordM: 0.06,
  sweepM: 0.04,
  spanM: 0.08,
  thicknessM: 0.003,
  densityKgM3: 600,
};

test("fin flutter screen reproduces the preliminary trapezoid relation", () => {
  const result = computeFinFlutterScreen({
    fins,
    material: { youngsModulusPa: 3e9, poissonRatio: 0.3 },
    maxAirspeedMps: 100,
    atmosphere: standardAtmosphere(0),
  });
  assert.equal(result.status, "pass");
  assert.ok(result.predictedFlutterSpeedMps !== null);
  assert.ok(result.safeAirspeedMps !== null);
  assert.ok(Math.abs(result.predictedFlutterSpeedMps - 194.49828098970633) < 1e-9);
  assert.ok(Math.abs(result.safeAirspeedMps - 155.59862479176508) < 1e-9);
  assert.ok(Math.abs(result.factorOfSafety - 1.9449828098970634) < 1e-12);
  assert.equal(result.geometry.aspectRatio, 0.6666666666666667);
  assert.match(result.warnings[0], /preliminary aeroelastic screen/i);
});

test("fin flutter screen marks a low margin and transonic condition for review", () => {
  const result = computeFinFlutterScreen({
    fins,
    material: { youngsModulusPa: 3e9 },
    maxAirspeedMps: 290,
    atmosphere: standardAtmosphere(0),
  });
  assert.equal(result.status, "review");
  assert.ok(result.factorOfSafety !== null && result.factorOfSafety < 1.25);
  assert.ok(result.conditions.mach !== null && result.conditions.mach > 0.8);
  assert.ok(result.warnings.some((warning) => /transonic/i.test(warning)));
  assert.ok(result.warnings.some((warning) => /screen target/i.test(warning)));
});

test("fin flutter screen keeps missing flight conditions visibly unavailable", () => {
  const result = computeFinFlutterScreen({
    fins,
    material: { youngsModulusPa: 3e9 },
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.predictedFlutterSpeedMps, null);
  assert.equal(result.factorOfSafety, null);
  assert.ok(result.warnings.some((warning) => /current maximum airspeed/i.test(warning)));
});
