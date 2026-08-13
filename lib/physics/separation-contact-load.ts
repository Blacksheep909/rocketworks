import type { SeparationContactPair, SeparationContactResult } from "./separation-contact.ts";

export const SEPARATION_CONTACT_LOAD_MODEL_VERSION =
  "rocketworks-separation-contact-load-0.1.0";
export const SEPARATION_CONTACT_LOAD_VALIDATION_STATUS =
  "analytical-compliance-scenario" as const;

export type SeparationContactLoadStatus = "assessed" | "partial" | "not-assessed";

export type SeparationContactLoadOptions = Readonly<{
  /** Effective normal stopping distance for the compliance scenario. */
  stoppingDistanceM?: number;
  /** One-dimensional normal coefficient of restitution, bounded [0, 1]. */
  coefficientOfRestitution?: number;
  additionalWarnings?: readonly string[];
}>;

export type SeparationContactLoadPair = Readonly<{
  firstBodyId: string;
  firstBodyLabel: string;
  secondBodyId: string;
  secondBodyLabel: string;
  contactStatus: SeparationContactPair["contactStatus"];
  status: "assessed" | "not-assessed";
  firstContactTimeS: number | null;
  closingSpeedMps: number | null;
  reducedMassKg: number | null;
  normalIncidentEnergyJ: number | null;
  totalRelativeKineticEnergyJ: number | null;
  tangentialKineticEnergyJ: number | null;
  coefficientOfRestitution: number;
  stoppingDistanceM: number;
  normalImpulseNs: number | null;
  reboundSpeedMps: number | null;
  absorbedNormalEnergyJ: number | null;
  reboundNormalEnergyJ: number | null;
  averageAbsorptionForceN: number | null;
  linearStopPeakForceN: number | null;
  note: string;
}>;

export type SeparationContactLoadResult = Readonly<{
  modelVersion: typeof SEPARATION_CONTACT_LOAD_MODEL_VERSION;
  validationStatus: typeof SEPARATION_CONTACT_LOAD_VALIDATION_STATUS;
  status: SeparationContactLoadStatus;
  stoppingDistanceM: number;
  coefficientOfRestitution: number;
  pairs: readonly SeparationContactLoadPair[];
  assessedPairCount: number;
  contactPairCount: number;
  maximumNormalImpulseNs: number | null;
  maximumAverageAbsorptionForceN: number | null;
  maximumLinearStopPeakForceN: number | null;
  maximumAbsorbedNormalEnergyJ: number | null;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

const DEFAULT_STOPPING_DISTANCE_M = 0.01;
const DEFAULT_COEFFICIENT_OF_RESTITUTION = 0;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (!(value > 0)) throw new Error(`${label} must be positive`);
}

function normalizeOptions(options: SeparationContactLoadOptions): Required<Pick<
  SeparationContactLoadOptions,
  "stoppingDistanceM" | "coefficientOfRestitution"
>> {
  const stoppingDistanceM = options.stoppingDistanceM ?? DEFAULT_STOPPING_DISTANCE_M;
  const coefficientOfRestitution = options.coefficientOfRestitution ?? DEFAULT_COEFFICIENT_OF_RESTITUTION;
  assertPositive(stoppingDistanceM, "contact-load stopping distance");
  assertFinite(coefficientOfRestitution, "contact-load coefficient of restitution");
  if (coefficientOfRestitution < 0 || coefficientOfRestitution > 1) {
    throw new Error("contact-load coefficient of restitution must be between 0 and 1");
  }
  return { stoppingDistanceM, coefficientOfRestitution };
}

function maximumNullable(values: readonly (number | null)[]): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finite.length > 0 ? Math.max(...finite) : null;
}

function pairResult(
  pair: SeparationContactPair,
  options: Required<Pick<SeparationContactLoadOptions, "stoppingDistanceM" | "coefficientOfRestitution">>,
): SeparationContactLoadPair {
  const closingSpeedMps = pair.closingSpeedAtFirstContactMps;
  const reducedMassKg = pair.reducedMassKg;
  const totalRelativeKineticEnergyJ = pair.relativeKineticEnergyAtFirstContactJ;
  const normalIncidentEnergyJ = closingSpeedMps !== null && reducedMassKg !== null
    ? 0.5 * reducedMassKg * closingSpeedMps ** 2
    : null;
  const reboundSpeedMps = closingSpeedMps === null
    ? null
    : options.coefficientOfRestitution * closingSpeedMps;
  const normalImpulseNs = closingSpeedMps !== null && reducedMassKg !== null
    ? (1 + options.coefficientOfRestitution) * reducedMassKg * closingSpeedMps
    : null;
  const reboundNormalEnergyJ = normalIncidentEnergyJ === null
    ? null
    : options.coefficientOfRestitution ** 2 * normalIncidentEnergyJ;
  const absorbedNormalEnergyJ = normalIncidentEnergyJ === null
    ? null
    : Math.max(0, normalIncidentEnergyJ - reboundNormalEnergyJ!);
  const averageAbsorptionForceN = absorbedNormalEnergyJ === null
    ? null
    : absorbedNormalEnergyJ / options.stoppingDistanceM;
  const linearStopPeakForceN = normalIncidentEnergyJ === null
    ? null
    : (2 * normalIncidentEnergyJ) / options.stoppingDistanceM;
  const tangentialKineticEnergyJ = totalRelativeKineticEnergyJ === null || normalIncidentEnergyJ === null
    ? null
    : Math.max(0, totalRelativeKineticEnergyJ - normalIncidentEnergyJ);
  const assessed = pair.contactStatus === "contact-detected" &&
    closingSpeedMps !== null && reducedMassKg !== null && normalIncidentEnergyJ !== null;
  return {
    firstBodyId: pair.firstBodyId,
    firstBodyLabel: pair.firstBodyLabel,
    secondBodyId: pair.secondBodyId,
    secondBodyLabel: pair.secondBodyLabel,
    contactStatus: pair.contactStatus,
    status: assessed ? "assessed" : "not-assessed",
    firstContactTimeS: pair.firstContactTimeS,
    closingSpeedMps,
    reducedMassKg,
    normalIncidentEnergyJ,
    totalRelativeKineticEnergyJ,
    tangentialKineticEnergyJ,
    coefficientOfRestitution: options.coefficientOfRestitution,
    stoppingDistanceM: options.stoppingDistanceM,
    normalImpulseNs,
    reboundSpeedMps,
    absorbedNormalEnergyJ,
    reboundNormalEnergyJ,
    averageAbsorptionForceN,
    linearStopPeakForceN,
    note: assessed
      ? "Normal compliance scenario only; force values are not returned to the flight integrator."
      : pair.contactStatus !== "contact-detected"
        ? "No potential envelope contact was detected for this pair."
        : "Contact was detected, but positive closing speed and reduced mass were not both available.",
  };
}

/**
 * Convert the kinematic contact screen into an explicit compliance scenario.
 *
 * This model estimates normal impulse and force scales from a prescribed
 * effective stopping distance and coefficient of restitution. It is kept
 * separate from the flight propagator and never feeds a force back into it.
 */
export function analyzeSeparationContactLoad(
  contact: SeparationContactResult,
  options: SeparationContactLoadOptions = {},
): SeparationContactLoadResult {
  const normalized = normalizeOptions(options);
  const pairs = contact.pairs.map((pair) => pairResult(pair, normalized));
  const assessedPairCount = pairs.filter((pair) => pair.status === "assessed").length;
  const contactPairCount = pairs.filter((pair) => pair.contactStatus === "contact-detected").length;
  const warnings = [
    "This compliance scenario is a force-scale estimate, not a contact solver, structural-load result, or flight-safety determination.",
    "The prescribed stopping distance and coefficient of restitution are scenario assumptions; contact geometry, stiffness, damping, friction, rebound direction, angular impulse, deformation, and joint response are not identified.",
    ...(contactPairCount > assessedPairCount
      ? [`${contactPairCount - assessedPairCount} potential-contact pair(s) lack positive closing speed or reduced-mass coverage and remain not assessed.`]
      : []),
    ...(options.additionalWarnings ?? []),
  ];
  const status: SeparationContactLoadStatus = contact.status === "not-assessed"
    ? "not-assessed"
    : assessedPairCount === contactPairCount && contactPairCount > 0
      ? "assessed"
      : contactPairCount > 0
        ? "partial"
        : "not-assessed";
  return {
    modelVersion: SEPARATION_CONTACT_LOAD_MODEL_VERSION,
    validationStatus: SEPARATION_CONTACT_LOAD_VALIDATION_STATUS,
    status,
    stoppingDistanceM: normalized.stoppingDistanceM,
    coefficientOfRestitution: normalized.coefficientOfRestitution,
    pairs,
    assessedPairCount,
    contactPairCount,
    maximumNormalImpulseNs: maximumNullable(pairs.map((pair) => pair.normalImpulseNs)),
    maximumAverageAbsorptionForceN: maximumNullable(pairs.map((pair) => pair.averageAbsorptionForceN)),
    maximumLinearStopPeakForceN: maximumNullable(pairs.map((pair) => pair.linearStopPeakForceN)),
    maximumAbsorbedNormalEnergyJ: maximumNullable(pairs.map((pair) => pair.absorbedNormalEnergyJ)),
    warnings,
    assumptions: [
      "Normal incident energy uses 0.5 μ v_n² with the kinematic closing speed and reduced mass from the fixed-envelope contact screen.",
      "Normal impulse uses J = (1 + e) μ v_n for a one-dimensional coefficient-of-restitution scenario.",
      "Average absorption force divides absorbed normal energy by the prescribed stopping distance; the linear-stop peak force scale is 2 E_n / d for an idealized linear compliance path.",
      "Tangential relative kinetic energy is reported separately and is not converted into normal contact force or friction load.",
      "The scenario is explanatory telemetry only and does not alter retained or detached trajectories.",
    ],
  };
}
