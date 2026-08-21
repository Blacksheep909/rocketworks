import assert from "node:assert/strict";
import test from "node:test";
import { runPhysicsBenchmarkSuite } from "../lib/physics/index.ts";
import { createPhysicsBenchmarkCsv } from "../lib/export/project-exports.ts";

test("physics benchmark suite passes deterministic standards and closed-form fixtures", () => {
  const result = runPhysicsBenchmarkSuite();

  assert.equal(result.modelVersion, "kestrel-physics-benchmark-suite-0.5.0");
  assert.equal(result.validationStatus, "mathematical-regression-tests-only");
  assert.equal(result.status, "pass");
  assert.equal(result.passedCount, result.totalCount);
  assert.equal(result.totalCount, 21);
  assert.ok(result.cases.every((benchmark) => benchmark.passed));
  assert.ok(result.cases.some((benchmark) => benchmark.id === "cone-center-of-pressure"));
  assert.ok(result.cases.some((benchmark) => benchmark.id === "six-dof-torque-free-angular-momentum"));
  assert.ok(result.cases.some((benchmark) => benchmark.id === "structural-euler-buckling"));
  assert.ok(result.cases.some((benchmark) => benchmark.id === "structural-first-bending-frequency"));
  assert.ok(result.cases.some((benchmark) => benchmark.id === "fin-flutter-speed"));
  assert.ok(result.cases.some((benchmark) => benchmark.id === "stage-interface-axial-demand"));
  assert.ok(result.cases.some((benchmark) => benchmark.id === "mission-mass-ratio-total-ideal-delta-v"));
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

test("physics benchmark evidence CSV preserves provenance and deterministic rows", () => {
  const result = runPhysicsBenchmarkSuite();
  const csv = createPhysicsBenchmarkCsv(result);

  assert.equal(csv, createPhysicsBenchmarkCsv(result));
  assert.match(csv, /# benchmark_model_version,kestrel-physics-benchmark-suite-0\.5\.0/);
  assert.match(csv, /# validation_status,mathematical-regression-tests-only/);
  assert.match(csv, /# result_status,pass/);
  assert.match(csv, /# passed_count,21/);
  assert.match(csv, /case_id,label,metric,unit,observed,expected,absolute_error,relative_error,tolerance,passed,method/);
  assert.match(csv, /atmosphere-sea-level-pressure/);
  assert.match(csv, /six-dof-torque-free-angular-momentum/);
  assert.match(csv, /stage-interface-axial-demand/);
  assert.match(csv, /These checks exercise deterministic equations/);
});
