import assert from "node:assert/strict";
import test from "node:test";
import { runPhysicsBenchmarkSuite } from "../lib/physics/index.ts";

test("physics benchmark suite passes deterministic standards and closed-form fixtures", () => {
  const result = runPhysicsBenchmarkSuite();

  assert.equal(result.modelVersion, "kestrel-physics-benchmark-suite-0.3.0");
  assert.equal(result.validationStatus, "mathematical-regression-tests-only");
  assert.equal(result.status, "pass");
  assert.equal(result.passedCount, result.totalCount);
  assert.equal(result.totalCount, 14);
  assert.ok(result.cases.every((benchmark) => benchmark.passed));
  assert.ok(result.cases.some((benchmark) => benchmark.id === "cone-center-of-pressure"));
  assert.ok(result.cases.some((benchmark) => benchmark.id === "six-dof-torque-free-angular-momentum"));
  assert.ok(result.cases.some((benchmark) => benchmark.id === "structural-euler-buckling"));
  assert.ok(result.cases.some((benchmark) => benchmark.id === "fin-flutter-speed"));
  assert.ok(result.warnings.some((warning) => warning.includes("not experimental validation")));
});

test("physics benchmark suite returns finite error diagnostics", () => {
  const result = runPhysicsBenchmarkSuite();
  for (const benchmark of result.cases) {
    assert.ok(Number.isFinite(benchmark.observed));
    assert.ok(Number.isFinite(benchmark.expected));
    assert.ok(Number.isFinite(benchmark.absoluteError));
    assert.ok(Number.isFinite(benchmark.relativeError));
    assert.ok(benchmark.tolerance >= 0);
  }
});
