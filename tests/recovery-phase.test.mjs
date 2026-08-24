import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyRecoveryPhase,
  createRecoveryPhaseSamples,
  createRecoveryPhaseSpans,
} from "../lib/visualization/recovery-phase.ts";

function sample(timeS, recoveryDeployed, recoveryInflationFraction, recoveryReefingFraction = 1) {
  return {
    timeS,
    recoveryDeployed,
    recoveryInflationFraction,
    recoveryReefingFraction,
  };
}

test("recovery phase classification follows the recorded effective-area flags", () => {
  assert.equal(classifyRecoveryPhase(sample(0, false, 0)), "ballistic");
  assert.equal(classifyRecoveryPhase(sample(1, true, 0)), "deployment-delay");
  assert.equal(classifyRecoveryPhase(sample(2, true, 0.5)), "inflating");
  assert.equal(classifyRecoveryPhase(sample(3, true, 1, 0.5)), "reefing");
  assert.equal(classifyRecoveryPhase(sample(4, true, 1, 1)), "inflated");
});

test("recovery phase samples are finite, clamped, and time ordered", () => {
  const samples = createRecoveryPhaseSamples([
    sample(2, true, 1.4, -0.2),
    sample(Number.NaN, true, 0.5),
    sample(0, false, 0),
  ], true);
  assert.deepEqual(samples.map((entry) => entry.timeS), [0, 2]);
  assert.equal(samples[1].inflationFraction, 1);
  assert.equal(samples[1].reefingFraction, 0);
  assert.deepEqual(createRecoveryPhaseSamples([sample(0, false, 0)], false), []);
});

test("adjacent recovery samples collapse into display spans", () => {
  const samples = createRecoveryPhaseSamples([
    sample(0, false, 0),
    sample(1, false, 0),
    sample(2, true, 0),
    sample(3, true, 0.5),
    sample(4, true, 1, 0.4),
    sample(5, true, 1, 1),
  ], true);
  assert.deepEqual(createRecoveryPhaseSpans(samples), [
    { phase: "ballistic", startTimeS: 0, endTimeS: 2, sampleCount: 2 },
    { phase: "deployment-delay", startTimeS: 2, endTimeS: 3, sampleCount: 1 },
    { phase: "inflating", startTimeS: 3, endTimeS: 4, sampleCount: 1 },
    { phase: "reefing", startTimeS: 4, endTimeS: 5, sampleCount: 1 },
    { phase: "inflated", startTimeS: 5, endTimeS: 5, sampleCount: 1 },
  ]);
});

