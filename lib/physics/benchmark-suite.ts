import {
  gravityAtAltitude,
  standardAtmosphere,
} from "./atmosphere.ts";
import { totalImpulse } from "./curves.ts";
import { computeStaticStability } from "./static-aerodynamics.ts";

export const BENCHMARK_SUITE_MODEL_VERSION =
  "kestrel-physics-benchmark-suite-0.1.0";
export const BENCHMARK_SUITE_STATUS =
  "mathematical-regression-tests-only" as const;

export type PhysicsBenchmarkCase = Readonly<{
  id: string;
  label: string;
  metric: string;
  unit: string;
  observed: number;
  expected: number;
  absoluteError: number;
  relativeError: number;
  tolerance: number;
  passed: boolean;
  method: string;
}>;

export type PhysicsBenchmarkSuiteResult = Readonly<{
  modelVersion: typeof BENCHMARK_SUITE_MODEL_VERSION;
  validationStatus: typeof BENCHMARK_SUITE_STATUS;
  status: "pass" | "fail";
  passedCount: number;
  totalCount: number;
  cases: readonly PhysicsBenchmarkCase[];
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

function compareCase(input: Readonly<{
  id: string;
  label: string;
  metric: string;
  unit: string;
  observed: number;
  expected: number;
  tolerance: number;
  method: string;
}>): PhysicsBenchmarkCase {
  if (![input.observed, input.expected, input.tolerance].every(Number.isFinite)) {
    throw new Error(`${input.id} benchmark values must be finite`);
  }
  if (input.tolerance < 0) throw new Error(`${input.id} benchmark tolerance must be non-negative`);
  const absoluteError = Math.abs(input.observed - input.expected);
  const relativeError = Math.abs(input.expected) > 1e-15
    ? absoluteError / Math.abs(input.expected)
    : absoluteError;
  return {
    ...input,
    absoluteError,
    relativeError,
    passed: absoluteError <= input.tolerance,
  };
}

/**
 * Run deterministic closed-form and standards-reference checks against the
 * original Kestrel Lab calculation modules. These checks are regression and
 * evidence tooling; they do not constitute flight validation or certification.
 */
export function runPhysicsBenchmarkSuite(): PhysicsBenchmarkSuiteResult {
  const seaLevel = standardAtmosphere(0);
  const thrustCurveImpulse = totalImpulse([
    { timeS: 0, thrustN: 0 },
    { timeS: 1, thrustN: 10 },
    { timeS: 2, thrustN: 0 },
  ]);
  const coneStability = computeStaticStability({
    centerOfMassXM: 0.2,
    referenceDiameterM: 0.1,
    components: [
      {
        id: "benchmark-cone",
        name: "Benchmark cone",
        stageId: "core",
        kind: "axisymmetric",
        densityKgM3: 1000,
        wallThicknessM: 0.001,
        stations: [
          { xM: 0, outerRadiusM: 0 },
          { xM: 0.3, outerRadiusM: 0.05 },
        ],
      },
    ],
  });

  const cases = [
    compareCase({
      id: "atmosphere-sea-level-pressure",
      label: "U.S. Standard Atmosphere sea-level pressure",
      metric: "pressure",
      unit: "Pa",
      observed: seaLevel.pressurePa,
      expected: 101325,
      tolerance: 0.01,
      method: "1976 standard-atmosphere sea-level anchor",
    }),
    compareCase({
      id: "atmosphere-sea-level-density",
      label: "U.S. Standard Atmosphere sea-level density",
      metric: "density",
      unit: "kg/m³",
      observed: seaLevel.densityKgM3,
      expected: 1.225000018124288,
      tolerance: 1e-9,
      method: "ideal-gas density from the sea-level pressure and temperature anchors",
    }),
    compareCase({
      id: "gravity-sea-level",
      label: "Standard gravity at sea level",
      metric: "gravity",
      unit: "m/s²",
      observed: gravityAtAltitude(0),
      expected: 9.80665,
      tolerance: 1e-12,
      method: "standard-gravity spherical-radius relation",
    }),
    compareCase({
      id: "triangular-thrust-impulse",
      label: "Triangular thrust-curve impulse",
      metric: "total impulse",
      unit: "N·s",
      observed: thrustCurveImpulse,
      expected: 10,
      tolerance: 1e-12,
      method: "trapezoidal integration of a 0–10–0 N, 2 s curve",
    }),
    compareCase({
      id: "cone-center-of-pressure",
      label: "Slender cone center of pressure",
      metric: "center of pressure",
      unit: "m from tip",
      observed: coneStability.centerOfPressureXM,
      expected: 0.2,
      tolerance: 1e-12,
      method: "closed-form normal-force contribution for a 0.3 m cone",
    }),
  ] as const;
  const passedCount = cases.filter((benchmark) => benchmark.passed).length;
  const status = passedCount === cases.length ? "pass" : "fail";
  return {
    modelVersion: BENCHMARK_SUITE_MODEL_VERSION,
    validationStatus: BENCHMARK_SUITE_STATUS,
    status,
    passedCount,
    totalCount: cases.length,
    cases,
    warnings: [
      "These checks exercise deterministic equations and regression fixtures; a passing suite is not experimental validation, certification, or a flight-safety assessment.",
      ...(status === "fail" ? ["One or more benchmark cases exceeded their declared tolerance; inspect model changes before using downstream results."] : []),
    ],
    assumptions: [
      "Reference values are SI anchors and closed-form published relations, not a substitute for instrumented flight data.",
      "The suite uses fixed inputs and no user or manufacturer data.",
      "Tolerance checks compare absolute error; relative error is reported for review.",
    ],
  };
}
