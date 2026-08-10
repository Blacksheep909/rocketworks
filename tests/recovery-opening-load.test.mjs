import assert from "node:assert/strict";
import test from "node:test";

import {
  RECOVERY_OPENING_LOAD_MODEL_VERSION,
  estimateRecoveryOpeningLoad,
} from "../lib/physics/recovery-opening-load.ts";

const input = (overrides = {}) => ({
  trace: [
    { timeS: 0, dynamicPressurePa: 100 },
    { timeS: 1, dynamicPressurePa: 200 },
    { timeS: 2, dynamicPressurePa: 100 },
  ],
  commandTimeS: 0,
  deploymentDelayS: 0.5,
  inflationTimeS: 1,
  dragCoefficient: 2,
  referenceAreaM2: 3,
  ...overrides,
});

test("opening-load screen interpolates q, integrates drag, and reports a force-rate proxy", () => {
  const result = estimateRecoveryOpeningLoad(input());
  assert.equal(result.modelVersion, RECOVERY_OPENING_LOAD_MODEL_VERSION);
  assert.equal(result.coverage, "assessed");
  assert.equal(result.inflationStartTimeS, 0.5);
  assert.equal(result.inflationEndTimeS, 1.5);
  assert.equal(result.peakTimeS, 1);
  assert.equal(result.peakDynamicPressurePa, 200);
  assert.equal(result.peakQuasiSteadyDragN, 1200);
  assert.equal(result.inflationImpulseNs, 1050);
  assert.equal(result.openingLoadRateNps, 1200);
  assert.equal(result.assessedDurationS, 1);
  assert.ok(result.warnings.some((warning) => warning.includes("opening shock")));
});

test("opening-load screen reports partial and unavailable trace coverage explicitly", () => {
  const partial = estimateRecoveryOpeningLoad(input({
    trace: [
      { timeS: 0.75, dynamicPressurePa: 150 },
      { timeS: 1, dynamicPressurePa: 200 },
    ],
  }));
  assert.equal(partial.coverage, "partial");
  assert.ok(partial.peakQuasiSteadyDragN !== null);
  assert.ok(partial.warnings.some((warning) => warning.includes("partially covers")));

  const unavailable = estimateRecoveryOpeningLoad(input({
    trace: [
      { timeS: 3, dynamicPressurePa: 150 },
      { timeS: 4, dynamicPressurePa: 200 },
    ],
  }));
  assert.equal(unavailable.coverage, "unavailable");
  assert.equal(unavailable.peakQuasiSteadyDragN, null);
  assert.equal(unavailable.inflationImpulseNs, null);
});

test("opening-load screen rejects invalid traces and inputs", () => {
  assert.throws(() => estimateRecoveryOpeningLoad(input({ trace: [] })), /trace cannot be empty/);
  assert.throws(() => estimateRecoveryOpeningLoad(input({ dragCoefficient: 0 })), /drag coefficient/);
  assert.throws(() => estimateRecoveryOpeningLoad(input({ referenceAreaM2: -1 })), /reference area/);
  assert.throws(() => estimateRecoveryOpeningLoad(input({
    trace: [
      { timeS: 1, dynamicPressurePa: 1 },
      { timeS: 0, dynamicPressurePa: 1 },
    ],
  })), /chronological/);
  const instant = estimateRecoveryOpeningLoad(input({ inflationTimeS: 0 }));
  assert.equal(instant.openingLoadRateNps, null);
  assert.ok(instant.warnings.some((warning) => warning.includes("force-rate proxy")));
});
