/**
 * RocketWorks preliminary airframe bending-mode screen.
 *
 * This is an independent Euler–Bernoulli equivalent-beam calculation. It is
 * intended to expose a useful dynamic-readiness trend, not to replace a finite
 * element model or experimental modal survey.
 */
export const STRUCTURAL_DYNAMICS_MODEL_VERSION =
  "rocketworks-structural-dynamics-0.1.0";
export const STRUCTURAL_DYNAMICS_VALIDATION_STATUS =
  "analytical-component-checks-only" as const;

export type StructuralBeamBoundaryCondition =
  | "cantilever"
  | "simply-supported";

export type StructuralBendingModeInput = Readonly<{
  lengthM: number;
  bendingStiffnessNm2: number;
  distributedMassKgPerM: number;
  boundaryCondition?: StructuralBeamBoundaryCondition;
}>;

export type StructuralBendingModeResult = Readonly<{
  modelVersion: typeof STRUCTURAL_DYNAMICS_MODEL_VERSION;
  validationStatus: typeof STRUCTURAL_DYNAMICS_VALIDATION_STATUS;
  boundaryCondition: StructuralBeamBoundaryCondition;
  betaL: number;
  lengthM: number;
  bendingStiffnessNm2: number;
  distributedMassKgPerM: number;
  angularFrequencyRadS: number;
  frequencyHz: number;
  periodS: number;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

const CANTILEVER_FIRST_ROOT = 1.875104068711961;
const SIMPLY_SUPPORTED_FIRST_ROOT = Math.PI;

function positiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive and finite`);
  }
}

/**
 * Estimate the first transverse bending mode of a uniform equivalent beam.
 *
 * For the first mode, Euler–Bernoulli theory gives
 *
 *   omega_1 = (beta L)^2 sqrt(E I / (mu L^4))
 *   f_1     = omega_1 / (2 pi)
 *
 * where `mu` is distributed mass per length. The caller supplies the already
 * selected effective `E I` and `mu` so the structural screen can disclose
 * exactly which section and mass approximation it used.
 */
export function computeStructuralBendingMode(
  input: StructuralBendingModeInput,
): StructuralBendingModeResult {
  const boundaryCondition = input.boundaryCondition ?? "cantilever";
  if (
    boundaryCondition !== "cantilever" &&
    boundaryCondition !== "simply-supported"
  ) {
    throw new Error("structural beam boundary condition is unsupported");
  }
  positiveFinite(input.lengthM, "structural beam length");
  positiveFinite(input.bendingStiffnessNm2, "structural beam bending stiffness");
  positiveFinite(input.distributedMassKgPerM, "structural beam distributed mass");

  const betaL = boundaryCondition === "cantilever"
    ? CANTILEVER_FIRST_ROOT
    : SIMPLY_SUPPORTED_FIRST_ROOT;
  const angularFrequencyRadS = betaL ** 2 * Math.sqrt(
    input.bendingStiffnessNm2 /
      (input.distributedMassKgPerM * input.lengthM ** 4),
  );
  const frequencyHz = angularFrequencyRadS / (2 * Math.PI);
  const periodS = 1 / frequencyHz;

  return {
    modelVersion: STRUCTURAL_DYNAMICS_MODEL_VERSION,
    validationStatus: STRUCTURAL_DYNAMICS_VALIDATION_STATUS,
    boundaryCondition,
    betaL,
    lengthM: input.lengthM,
    bendingStiffnessNm2: input.bendingStiffnessNm2,
    distributedMassKgPerM: input.distributedMassKgPerM,
    angularFrequencyRadS,
    frequencyHz,
    periodS,
    assumptions: [
      `Uniform Euler–Bernoulli equivalent beam with ${boundaryCondition} first-mode root beta L=${betaL.toFixed(6)}.`,
      "Bending stiffness uses the weakest supplied airframe section and the selected Young's modulus.",
      "Distributed mass uses the modeled airframe shell mass divided by the station span.",
    ],
    warnings: [
      "This is a preliminary modal screen, not a finite-element result, ground-vibration test, or flight-safety assessment.",
      "Shear deformation, rotary inertia, axial-load softening, joints, couplers, payload and propellant slosh, damping, and aerodynamic forcing are not modeled.",
    ],
  };
}
