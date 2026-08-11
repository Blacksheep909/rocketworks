import {
  geopotentialToGeometricAltitude,
  gravityAtAltitude,
  standardAtmosphere,
} from "./atmosphere.ts";
import { totalImpulse } from "./curves.ts";
import {
  IDENTITY_QUATERNION,
  angularMomentumWorldNms,
  quaternionFromAxisAngle,
  quaternionMagnitude,
  rotationalKineticEnergyJ,
  simulateRigidBody6D,
} from "./six-dof.ts";
import { magnitude, subtractVectors } from "./linear-algebra.ts";
import { computeStaticStability } from "./static-aerodynamics.ts";
import {
  computeStructuralScreen,
  type StructuralMaterialModel,
} from "./structural-screen.ts";

export const BENCHMARK_SUITE_MODEL_VERSION =
  "kestrel-physics-benchmark-suite-0.4.0";
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
 * original RocketWorks calculation modules. These checks are regression and
 * evidence tooling; they do not constitute flight validation or certification.
 */
export function runPhysicsBenchmarkSuite(): PhysicsBenchmarkSuiteResult {
  const seaLevel = standardAtmosphere(0);
  const atmosphere32Km = standardAtmosphere(
    geopotentialToGeometricAltitude(32_000),
  );
  const atmosphereUpperBoundary = standardAtmosphere(
    geopotentialToGeometricAltitude(84_852),
  );
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
  const benchmarkBody = {
    massKg: 2,
    inertiaBodyKgM2: [
      [2, 0, 0],
      [0, 3, 0],
      [0, 0, 4],
    ],
  } as const;
  const constantForceResult = simulateRigidBody6D({
    body: benchmarkBody,
    initialState: {
      timeS: 0,
      positionWorldM: { x: 0, y: 0, z: 0 },
      velocityWorldMps: { x: 0, y: 0, z: 0 },
      orientationBodyToWorld: IDENTITY_QUATERNION,
      angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    },
    durationS: 2,
    timeStepS: 0.05,
    loads: () => ({ forceWorldN: { x: 4, y: 0, z: 0 } }),
  });
  const torqueFreeInitialState = {
    timeS: 0,
    positionWorldM: { x: 0, y: 0, z: 0 },
    velocityWorldMps: { x: 0, y: 0, z: 0 },
    orientationBodyToWorld: quaternionFromAxisAngle(
      { x: 1, y: 2, z: -1 },
      0.7,
    ),
    angularVelocityBodyRadS: { x: 0.3, y: 0.7, z: 1.1 },
  } as const;
  const torqueFreeInitialEnergy = rotationalKineticEnergyJ(
    benchmarkBody.inertiaBodyKgM2,
    torqueFreeInitialState.angularVelocityBodyRadS,
  );
  const torqueFreeInitialMomentum = angularMomentumWorldNms(
    torqueFreeInitialState,
    benchmarkBody.inertiaBodyKgM2,
  );
  const torqueFreeResult = simulateRigidBody6D({
    body: benchmarkBody,
    initialState: torqueFreeInitialState,
    durationS: 2,
    timeStepS: 0.001,
  });
  const torqueFreeFinalEnergy = rotationalKineticEnergyJ(
    benchmarkBody.inertiaBodyKgM2,
    torqueFreeResult.finalState.angularVelocityBodyRadS,
  );
  const torqueFreeFinalMomentum = angularMomentumWorldNms(
    torqueFreeResult.finalState,
    benchmarkBody.inertiaBodyKgM2,
  );
  const torqueFreeMomentumError = magnitude(
    subtractVectors(torqueFreeFinalMomentum, torqueFreeInitialMomentum),
  );
  const torqueResult = simulateRigidBody6D({
    body: benchmarkBody,
    initialState: {
      timeS: 0,
      positionWorldM: { x: 0, y: 0, z: 0 },
      velocityWorldMps: { x: 0, y: 0, z: 0 },
      orientationBodyToWorld: IDENTITY_QUATERNION,
      angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    },
    durationS: 1,
    timeStepS: 0.002,
    loads: () => ({ momentBodyNm: { x: 2, y: 0, z: 0 } }),
  });

  const structuralMaterial: StructuralMaterialModel = {
    label: "Benchmark isotropic laminate",
    youngsModulusPa: 70e9,
    poissonRatio: 0.3,
    allowableCompressionPa: 200e6,
    allowableBendingPa: 200e6,
    allowableShearPa: 100e6,
  };
  const structuralBody = {
    id: "benchmark-structural-body",
    name: "Benchmark structural body",
    stageId: "core",
    kind: "axisymmetric",
    densityKgM3: 1200,
    wallThicknessM: 0.002,
    stations: [
      { xM: 0, outerRadiusM: 0.05 },
      { xM: 1, outerRadiusM: 0.05 },
    ],
  } as const;
  const structuralFins = {
    id: "benchmark-structural-fins",
    name: "Benchmark structural fins",
    stageId: "core",
    kind: "finSet",
    count: 3,
    axialPositionM: 0.7,
    bodyRadiusM: 0.05,
    rootChordM: 0.18,
    tipChordM: 0.1,
    sweepM: 0.04,
    spanM: 0.08,
    thicknessM: 0.004,
    densityKgM3: 1600,
  } as const;
  const structuralMassKg = 2;
  const structuralPeakThrustN = 100;
  const structuralGravityMps2 = 9.80665;
  const structuralDynamicPressurePa = 12_000;
  const structuralAirspeedMps = 120;
  const innerRadiusM =
    structuralBody.stations[0].outerRadiusM - structuralBody.wallThicknessM;
  const shellAreaM2 =
    Math.PI * (structuralBody.stations[0].outerRadiusM ** 2 - innerRadiusM ** 2);
  const shellSecondMomentM4 =
    (Math.PI / 4) *
    (structuralBody.stations[0].outerRadiusM ** 4 - innerRadiusM ** 4);
  const structuralAxialCompressionN =
    structuralPeakThrustN + structuralMassKg * structuralGravityMps2;
  const structuralEulerLoadN =
    (Math.PI ** 2 * structuralMaterial.youngsModulusPa * shellSecondMomentM4) /
    structuralBody.stations[1].xM ** 2;
  const structuralScreen = computeStructuralScreen({
    body: structuralBody,
    fins: structuralFins,
    totalMassKg: structuralMassKg,
    peakThrustN: structuralPeakThrustN,
    maxDynamicPressurePa: structuralDynamicPressurePa,
    maxAirspeedMps: structuralAirspeedMps,
    flutterAtmosphere: seaLevel,
    flutterSafetyFactor: 1.25,
    staticMarginCalibers: 1.5,
    material: structuralMaterial,
    flightResultCurrent: true,
    designNormalForceCoefficient: 1.2,
  });
  const flutter = structuralScreen.finFlutter;
  const flutterPressurePa = flutter?.conditions.pressurePa ?? null;
  const flutterSpeedOfSoundMps = flutter?.conditions.speedOfSoundMps ?? null;
  const flutterPredictedSpeedMps = flutter?.predictedFlutterSpeedMps ?? null;
  if (
    !flutter ||
    flutterPressurePa === null ||
    flutterSpeedOfSoundMps === null ||
    flutterPredictedSpeedMps === null
  ) {
    throw new Error("structural benchmark flutter fixture did not produce a speed");
  }
  const flutterDynamicFactor = flutterPressurePa / 101_325;
  const flutterD =
    (24 * flutter.geometry.epsilon * 1.4 * 101_325) / Math.PI;
  const flutterF =
    (flutterD * flutter.geometry.aspectRatio ** 3) /
    (flutter.geometry.thicknessRatio ** 3 * (flutter.geometry.aspectRatio + 2)) *
    ((flutter.geometry.taperRatio + 1) / 2) *
    flutterDynamicFactor;
  const flutterExpectedSpeedMps =
    flutterSpeedOfSoundMps *
    Math.sqrt(flutter.material.shearModulusPa / flutterF);
  const finPlanformAreaM2 =
    ((structuralFins.rootChordM + structuralFins.tipChordM) / 2) * structuralFins.spanM;
  const finForcePerFinN =
    (structuralDynamicPressurePa * finPlanformAreaM2 * 1.2) /
    structuralFins.count;
  const finRootMomentNm = finForcePerFinN * structuralFins.spanM * 0.5;
  const finRootSectionModulusM3 =
    (structuralFins.rootChordM * structuralFins.thicknessM ** 2) / 6;
  const finRootBendingStressPa = finRootMomentNm / finRootSectionModulusM3;
  const structuralBodyMassKg = structuralScreen.geometry.structuralMassKg;
  const structuralBendingFrequencyHz =
    structuralScreen.bendingMode.frequencyHz;
  const structuralBendingExpectedHz =
    structuralScreen.bendingMode.betaL ** 2 / (2 * Math.PI) * Math.sqrt(
      (structuralMaterial.youngsModulusPa * shellSecondMomentM4) /
        ((structuralBodyMassKg / structuralBody.stations[1].xM) *
          structuralBody.stations[1].xM ** 4),
    );

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
      id: "atmosphere-32km-pressure",
      label: "U.S. Standard Atmosphere 32 km pressure",
      metric: "pressure",
      unit: "Pa",
      observed: atmosphere32Km.pressurePa,
      expected: 868.02,
      tolerance: 0.01,
      method: "COESA 1976 positive-lapse layer anchor at 32 km geopotential altitude",
    }),
    compareCase({
      id: "atmosphere-upper-boundary-temperature",
      label: "U.S. Standard Atmosphere 84.852 km temperature",
      metric: "temperature",
      unit: "K",
      observed: atmosphereUpperBoundary.temperatureK,
      expected: 186.946,
      tolerance: 1e-6,
      method: "COESA 1976 upper implemented hydrostatic layer boundary",
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
    compareCase({
      id: "six-dof-constant-force-velocity",
      label: "6DOF constant-force translation",
      metric: "final velocity",
      unit: "m/s",
      observed: constantForceResult.finalState.velocityWorldMps.x,
      expected: 4,
      tolerance: 1e-11,
      method: "RK4 translation with 4 N force on a 2 kg rigid body for 2 s",
    }),
    compareCase({
      id: "six-dof-torque-free-energy",
      label: "6DOF torque-free rotational energy",
      metric: "rotational energy",
      unit: "J",
      observed: torqueFreeFinalEnergy,
      expected: torqueFreeInitialEnergy,
      tolerance: 2e-11,
      method: "asymmetric rigid-body Euler equations with no applied moment",
    }),
    compareCase({
      id: "six-dof-torque-free-angular-momentum",
      label: "6DOF torque-free world angular momentum",
      metric: "momentum error",
      unit: "N·m·s",
      observed: torqueFreeMomentumError,
      expected: 0,
      tolerance: 2e-10,
      method: "world-frame angular-momentum conservation under torque-free rotation",
    }),
    compareCase({
      id: "six-dof-quaternion-normalization",
      label: "6DOF unit quaternion normalization",
      metric: "quaternion norm",
      unit: "1",
      observed: quaternionMagnitude(torqueResult.finalState.orientationBodyToWorld),
      expected: 1,
      tolerance: 1e-14,
      method: "constant principal-axis moment with normalized attitude state",
    }),
    compareCase({
      id: "structural-shell-area",
      label: "Thin-wall circular shell area",
      metric: "minimum shell area",
      unit: "m^2",
      observed: structuralScreen.geometry.minimumSectionAreaM2,
      expected: shellAreaM2,
      tolerance: 1e-16,
      method: "closed-form pi (r_outer^2 - r_inner^2) section anchor",
    }),
    compareCase({
      id: "structural-axial-stress",
      label: "Airframe axial compression stress",
      metric: "axial stress",
      unit: "Pa",
      observed: structuralScreen.checks.axialStress.demand!,
      expected: structuralAxialCompressionN / shellAreaM2,
      tolerance: 1e-8,
      method: "peak thrust plus weight divided by the thin-wall shell area",
    }),
    compareCase({
      id: "structural-euler-buckling",
      label: "Pinned-column Euler critical load",
      metric: "critical load",
      unit: "N",
      observed: structuralScreen.checks.eulerBuckling.capacity!,
      expected: structuralEulerLoadN,
      tolerance: 1e-6,
      method: "pi^2 E I / (K L)^2 with K=1 and the circular shell second moment",
    }),
    compareCase({
      id: "structural-first-bending-frequency",
      label: "Equivalent airframe first bending frequency",
      metric: "frequency",
      unit: "Hz",
      observed: structuralBendingFrequencyHz,
      expected: structuralBendingExpectedHz,
      tolerance: 1e-12,
      method: "Euler–Bernoulli cantilever first root with weakest EI and modeled shell distributed mass",
    }),
    compareCase({
      id: "fin-root-bending-stress",
      label: "Uniform-span fin-root bending stress",
      metric: "root bending stress",
      unit: "Pa",
      observed: structuralScreen.checks.finBending.demand!,
      expected: finRootBendingStressPa,
      tolerance: 1e-6,
      method: "equal per-fin dynamic-pressure load times half-span over rectangular section modulus",
    }),
    compareCase({
      id: "fin-flutter-speed",
      label: "Preliminary fin flutter speed",
      metric: "predicted flutter speed",
      unit: "m/s",
      observed: flutterPredictedSpeedMps,
      expected: flutterExpectedSpeedMps,
      tolerance: 1e-10,
      method: "NACA-TN-4197-style thin-fin relation with local standard-atmosphere pressure",
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
