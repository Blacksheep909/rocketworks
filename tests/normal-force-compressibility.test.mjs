import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateNormalForceModel,
  LINEARIZED_SUPERSONIC_MIN_MACH,
  PRANDTL_GLAUERT_MAX_MACH,
} from "../lib/physics/index.ts";

test("low-speed normal-force model preserves the compatibility factor", () => {
  const result = evaluateNormalForceModel({ model: "low-speed", mach: 0.6 });
  assert.equal(result.factor, 1);
  assert.equal(result.applied, true);
  assert.equal(result.regime, "low-speed");
});

test("Prandtl-Glauert trend increases subsonic slope and stops before transonic flow", () => {
  const result = evaluateNormalForceModel({ model: "prandtl-glauert", mach: 0.6 });
  assert.ok(result.factor > 1);
  assert.equal(result.factor, 1 / Math.sqrt(1 - 0.6 ** 2));
  assert.equal(result.regime, "subsonic-linearized");
  assert.equal(result.issue, null);

  const gap = evaluateNormalForceModel({
    model: "prandtl-glauert",
    mach: PRANDTL_GLAUERT_MAX_MACH,
  });
  assert.equal(gap.applied, false);
  assert.equal(gap.regime, "transonic-gap");
  assert.equal(gap.issue?.code, "NORMAL_FORCE_MODEL_DOMAIN");
});

test("linearized supersonic trend follows normalized Ackeret factor", () => {
  const mach = 2;
  const result = evaluateNormalForceModel({ model: "supersonic-linearized", mach });
  assert.equal(result.factor, 2 / Math.sqrt(mach ** 2 - 1));
  assert.equal(result.regime, "supersonic-linearized");
  assert.equal(result.applied, true);

  const gap = evaluateNormalForceModel({
    model: "supersonic-linearized",
    mach: LINEARIZED_SUPERSONIC_MIN_MACH,
  });
  assert.equal(gap.applied, false);
  assert.equal(gap.regime, "transonic-gap");
  assert.equal(gap.issue?.code, "NORMAL_FORCE_MODEL_DOMAIN");
});

test("normal-force model rejects invalid Mach and identifiers", () => {
  assert.throws(
    () => evaluateNormalForceModel({ model: "low-speed", mach: -0.1 }),
    /finite and non-negative/,
  );
  assert.throws(
    () => evaluateNormalForceModel({ model: "unknown", mach: 0.2 }),
    /normal-force model must/,
  );
});
