import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateInducedDrag,
  INDUCED_DRAG_MODEL_VERSION,
} from "../lib/physics/index.ts";

test("disabled induced drag preserves a zero contribution", () => {
  const result = evaluateInducedDrag({
    model: "disabled",
    normalForceCoefficient: 0.8,
    factor: 0.6,
  });
  assert.equal(result.inducedDragCoefficient, 0);
  assert.equal(result.applied, false);
  assert.equal(result.modelVersion, INDUCED_DRAG_MODEL_VERSION);
});

test("quadratic normal-force polar follows C_D,i = k C_N^2", () => {
  const result = evaluateInducedDrag({
    model: "quadratic-normal-force",
    normalForceCoefficient: -0.4,
    factor: 0.75,
  });
  assert.equal(result.inducedDragCoefficient, 0.75 * 0.4 ** 2);
  assert.equal(result.applied, true);
});

test("induced drag rejects invalid model and factor inputs", () => {
  assert.throws(
    () => evaluateInducedDrag({ model: "unknown", normalForceCoefficient: 0.1 }),
    /induced drag model must/,
  );
  assert.throws(
    () => evaluateInducedDrag({ model: "quadratic-normal-force", normalForceCoefficient: 0.1, factor: -0.1 }),
    /induced drag factor must/,
  );
});
