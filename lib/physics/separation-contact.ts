import {
  addVectors,
  dot,
  magnitude,
  scaleVector,
  subtractVectors,
  type Vector3,
} from "./linear-algebra.ts";
import type { SeparationClearanceTracePoint } from "./separation-clearance.ts";

/**
 * RocketWorks clean-room contact and relative-load screen.
 *
 * This module deliberately stays on the analytical side of the boundary. It
 * treats each released body as a fixed sphere and interpolates its supplied
 * centre-of-mass trace piecewise linearly. It can therefore expose the first
 * potential envelope contact, relative closing kinematics, and centre-of-mass
 * relative kinetic energy without pretending to solve contact mechanics.
 */
export const SEPARATION_CONTACT_MODEL_VERSION =
  "rocketworks-separation-contact-0.1.0";
export const SEPARATION_CONTACT_STATUS =
  "analytical-component-checks-only" as const;

export type SeparationContactTracePoint = Readonly<
  SeparationClearanceTracePoint & {
    /** Optional point mass used only for the relative kinetic-energy proxy. */
    massKg?: number | null;
  }
>;

export type SeparationContactBody = Readonly<{
  id: string;
  label?: string;
  releaseTimeS: number;
  trace: readonly SeparationContactTracePoint[];
  /** Fixed conservative spherical bound around the body's COM. */
  envelopeRadiusM?: number | null;
  /** Optional constant fallback mass when trace samples do not carry mass. */
  massKg?: number | null;
}>;

export type SeparationContactPair = Readonly<{
  firstBodyId: string;
  firstBodyLabel: string;
  secondBodyId: string;
  secondBodyLabel: string;
  status: "assessed" | "not-assessed";
  contactStatus: "contact-detected" | "no-contact" | "not-assessed";
  envelopeRadiusSumM: number | null;
  minimumClearanceM: number | null;
  minimumClearanceTimeS: number | null;
  firstContactTimeS: number | null;
  relativeSpeedAtFirstContactMps: number | null;
  closingSpeedAtFirstContactMps: number | null;
  reducedMassKg: number | null;
  relativeKineticEnergyAtFirstContactJ: number | null;
  potentialContact: boolean | null;
}>;

export type SeparationContactResult = Readonly<{
  modelVersion: typeof SEPARATION_CONTACT_MODEL_VERSION;
  validationStatus: typeof SEPARATION_CONTACT_STATUS;
  bodies: readonly Readonly<{
    id: string;
    label: string;
    releaseTimeS: number;
    sampleCount: number;
    envelopeRadiusM: number | null;
    massKg: number | null;
  }>[];
  pairs: readonly SeparationContactPair[];
  assessedPairCount: number;
  contactPairCount: number;
  minimumClearanceM: number | null;
  closestPair: Readonly<{
    firstBodyId: string;
    secondBodyId: string;
    timeS: number;
    clearanceM: number;
  }> | null;
  firstContactPair: Readonly<{
    firstBodyId: string;
    secondBodyId: string;
    timeS: number;
    closingSpeedMps: number | null;
    relativeKineticEnergyJ: number | null;
  }> | null;
  status: "assessed" | "partial" | "not-assessed";
  contactStatus: "contact-detected" | "no-contact" | "partial" | "not-assessed";
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

const TIME_TOLERANCE_S = 1e-9;
const ROOT_TOLERANCE = 1e-10;

function assertFiniteVector(value: Vector3, label: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite coordinates`);
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

function normalizeOptionalNonNegative(
  value: number | null | undefined,
  label: string,
): number | null {
  if (value === undefined || value === null) return null;
  assertFiniteNonNegative(value, label);
  return value;
}

function normalizeOptionalMass(
  value: number | null | undefined,
  label: string,
): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return value;
}

function validateTrace(
  trace: readonly SeparationContactTracePoint[],
  label: string,
): void {
  if (trace.length === 0) throw new Error(`${label} cannot be empty`);
  let previousTime = -Infinity;
  trace.forEach((point, index) => {
    if (!Number.isFinite(point.timeS)) {
      throw new Error(`${label} sample ${index + 1} time must be finite`);
    }
    if (point.timeS < previousTime) {
      throw new Error(`${label} times must be non-decreasing`);
    }
    assertFiniteVector(point.positionWorldM, `${label} sample ${index + 1} position`);
    if (point.velocityWorldMps) {
      assertFiniteVector(point.velocityWorldMps, `${label} sample ${index + 1} velocity`);
    }
    if (point.massKg !== undefined && point.massKg !== null) {
      normalizeOptionalMass(point.massKg, `${label} sample ${index + 1} mass`);
    }
    previousTime = point.timeS;
  });
}

function collapseDuplicateTimes(
  trace: readonly SeparationContactTracePoint[],
): SeparationContactTracePoint[] {
  const collapsed: SeparationContactTracePoint[] = [];
  for (const point of trace) {
    const previous = collapsed.at(-1);
    if (previous && point.timeS === previous.timeS) {
      collapsed[collapsed.length - 1] = point;
    } else {
      collapsed.push(point);
    }
  }
  return collapsed;
}

function interpolatePoint(
  trace: readonly SeparationContactTracePoint[],
  timeS: number,
): SeparationContactTracePoint | null {
  if (
    timeS < trace[0]!.timeS - TIME_TOLERANCE_S ||
    timeS > trace.at(-1)!.timeS + TIME_TOLERANCE_S
  ) {
    return null;
  }
  if (timeS <= trace[0]!.timeS + TIME_TOLERANCE_S) return trace[0]!;
  if (timeS >= trace.at(-1)!.timeS - TIME_TOLERANCE_S) return trace.at(-1)!;

  let low = 0;
  let high = trace.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (trace[middle]!.timeS <= timeS) low = middle;
    else high = middle;
  }
  const before = trace[low]!;
  const after = trace[high]!;
  const durationS = after.timeS - before.timeS;
  if (durationS <= TIME_TOLERANCE_S) return after;
  const fraction = (timeS - before.timeS) / durationS;
  const interpolateVector = (a: Vector3, b: Vector3): Vector3 => ({
    x: a.x + (b.x - a.x) * fraction,
    y: a.y + (b.y - a.y) * fraction,
    z: a.z + (b.z - a.z) * fraction,
  });
  const massKg =
    before.massKg !== undefined &&
    before.massKg !== null &&
    after.massKg !== undefined &&
    after.massKg !== null
      ? before.massKg + (after.massKg - before.massKg) * fraction
      : undefined;
  return {
    timeS,
    positionWorldM: interpolateVector(before.positionWorldM, after.positionWorldM),
    ...(before.velocityWorldMps && after.velocityWorldMps
      ? { velocityWorldMps: interpolateVector(before.velocityWorldMps, after.velocityWorldMps) }
      : {}),
    ...(massKg !== undefined ? { massKg } : {}),
  };
}

function unionTimes(
  first: readonly SeparationContactTracePoint[],
  second: readonly SeparationContactTracePoint[],
  startTimeS: number,
  endTimeS: number,
): number[] {
  return [
    startTimeS,
    ...first.map((point) => point.timeS),
    ...second.map((point) => point.timeS),
    endTimeS,
  ]
    .filter(
      (timeS) =>
        timeS >= startTimeS - TIME_TOLERANCE_S &&
        timeS <= endTimeS + TIME_TOLERANCE_S,
    )
    .sort((left, right) => left - right)
    .reduce<number[]>((times, timeS) => {
      const previous = times.at(-1);
      if (previous === undefined || Math.abs(timeS - previous) > TIME_TOLERANCE_S) {
        times.push(timeS);
      }
      return times;
    }, []);
}

function clamped(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function relativeVelocity(
  first: SeparationContactTracePoint,
  second: SeparationContactTracePoint,
  intervalRelativeVelocity: Vector3,
): Vector3 {
  if (first.velocityWorldMps && second.velocityWorldMps) {
    return subtractVectors(second.velocityWorldMps, first.velocityWorldMps);
  }
  return intervalRelativeVelocity;
}

function closingSpeedMps(
  relativePositionM: Vector3,
  relativeVelocityMps: Vector3 | null,
): number | null {
  if (!relativeVelocityMps) return null;
  const distanceM = magnitude(relativePositionM);
  if (distanceM <= ROOT_TOLERANCE) return magnitude(relativeVelocityMps);
  return Math.max(0, -dot(relativePositionM, relativeVelocityMps) / distanceM);
}

function relativeMassAt(
  first: SeparationContactTracePoint,
  second: SeparationContactTracePoint,
  firstFallbackMassKg: number | null,
  secondFallbackMassKg: number | null,
): number | null {
  const firstMassKg = first.massKg ?? firstFallbackMassKg;
  const secondMassKg = second.massKg ?? secondFallbackMassKg;
  if (firstMassKg === null || secondMassKg === null) return null;
  if (!(firstMassKg > 0) || !(secondMassKg > 0)) return null;
  return (firstMassKg * secondMassKg) / (firstMassKg + secondMassKg);
}

type PairAnalysis = Readonly<{
  status: SeparationContactPair["status"];
  contactStatus: SeparationContactPair["contactStatus"];
  envelopeRadiusSumM: number | null;
  minimumClearanceM: number | null;
  minimumClearanceTimeS: number | null;
  firstContactTimeS: number | null;
  relativeSpeedAtFirstContactMps: number | null;
  closingSpeedAtFirstContactMps: number | null;
  reducedMassKg: number | null;
  relativeKineticEnergyAtFirstContactJ: number | null;
  potentialContact: boolean | null;
}>;

function analyzePair(
  first: SeparationContactBody & { envelopeRadiusM: number | null; massKg: number | null },
  second: SeparationContactBody & { envelopeRadiusM: number | null; massKg: number | null },
): PairAnalysis {
  const envelopeRadiusSumM =
    first.envelopeRadiusM !== null && second.envelopeRadiusM !== null
      ? first.envelopeRadiusM + second.envelopeRadiusM
      : null;
  const overlapStartS = Math.max(
    first.releaseTimeS,
    first.trace[0]!.timeS,
    second.releaseTimeS,
    second.trace[0]!.timeS,
  );
  const overlapEndS = Math.min(first.trace.at(-1)!.timeS, second.trace.at(-1)!.timeS);
  if (overlapStartS > overlapEndS + TIME_TOLERANCE_S || envelopeRadiusSumM === null) {
    return {
      status: "not-assessed",
      contactStatus: "not-assessed",
      envelopeRadiusSumM,
      minimumClearanceM: null,
      minimumClearanceTimeS: null,
      firstContactTimeS: null,
      relativeSpeedAtFirstContactMps: null,
      closingSpeedAtFirstContactMps: null,
      reducedMassKg: null,
      relativeKineticEnergyAtFirstContactJ: null,
      potentialContact: null,
    };
  }

  const times = unionTimes(first.trace, second.trace, overlapStartS, overlapEndS);
  let minimumClearanceM = Number.POSITIVE_INFINITY;
  let minimumClearanceTimeS: number | null = null;
  let firstContactTimeS: number | null = null;
  let firstContactRelativeSpeedMps: number | null = null;
  let firstContactClosingSpeedMps: number | null = null;
  let firstContactReducedMassKg: number | null = null;
  let firstContactRelativeKineticEnergyJ: number | null = null;

  const updateContact = (
    timeS: number,
    relativePositionM: Vector3,
    relativeVelocityMps: Vector3 | null,
    firstPoint: SeparationContactTracePoint,
    secondPoint: SeparationContactTracePoint,
  ): void => {
    if (firstContactTimeS !== null && timeS >= firstContactTimeS - TIME_TOLERANCE_S) return;
    const relativeSpeedMps = relativeVelocityMps ? magnitude(relativeVelocityMps) : null;
    const closingSpeed = closingSpeedMps(relativePositionM, relativeVelocityMps);
    const reducedMassKg = relativeMassAt(
      firstPoint,
      secondPoint,
      first.massKg,
      second.massKg,
    );
    const relativeKineticEnergyJ =
      reducedMassKg !== null && relativeSpeedMps !== null
        ? 0.5 * reducedMassKg * relativeSpeedMps ** 2
        : null;
    firstContactTimeS = timeS;
    firstContactRelativeSpeedMps = relativeSpeedMps;
    firstContactClosingSpeedMps = closingSpeed;
    firstContactReducedMassKg = reducedMassKg;
    firstContactRelativeKineticEnergyJ = relativeKineticEnergyJ;
  };

  for (let index = 0; index < times.length; index += 1) {
    const timeS = times[index]!;
    const firstPoint = interpolatePoint(first.trace, timeS);
    const secondPoint = interpolatePoint(second.trace, timeS);
    if (!firstPoint || !secondPoint) continue;
    const relativePositionM = subtractVectors(
      secondPoint.positionWorldM,
      firstPoint.positionWorldM,
    );
    const clearanceM = magnitude(relativePositionM) - envelopeRadiusSumM;
    if (clearanceM < minimumClearanceM) {
      minimumClearanceM = clearanceM;
      minimumClearanceTimeS = timeS;
    }
    const nextTimeS = times[index + 1];
    const nextFirstPoint = nextTimeS === undefined
      ? null
      : interpolatePoint(first.trace, nextTimeS);
    const nextSecondPoint = nextTimeS === undefined
      ? null
      : interpolatePoint(second.trace, nextTimeS);
    const intervalRelativeVelocityMps = nextTimeS !== undefined && nextTimeS > timeS + TIME_TOLERANCE_S && nextFirstPoint && nextSecondPoint
      ? scaleVector(
          subtractVectors(
            subtractVectors(nextSecondPoint.positionWorldM, nextFirstPoint.positionWorldM),
            relativePositionM,
          ),
          1 / (nextTimeS - timeS),
        )
      : null;
    if (clearanceM <= ROOT_TOLERANCE) {
      updateContact(
        timeS,
        relativePositionM,
        firstPoint.velocityWorldMps && secondPoint.velocityWorldMps
          ? subtractVectors(secondPoint.velocityWorldMps, firstPoint.velocityWorldMps)
          : intervalRelativeVelocityMps,
        firstPoint,
        secondPoint,
      );
    }
    if (nextTimeS === undefined || nextTimeS <= timeS + TIME_TOLERANCE_S || !nextFirstPoint || !nextSecondPoint || !intervalRelativeVelocityMps) continue;
    const nextRelativePositionM = subtractVectors(
      nextSecondPoint.positionWorldM,
      nextFirstPoint.positionWorldM,
    );
    const durationS = nextTimeS - timeS;
    const displacementM = subtractVectors(nextRelativePositionM, relativePositionM);
    const displacementSquared = dot(displacementM, displacementM);
    const closestFraction = displacementSquared <= ROOT_TOLERANCE
      ? 0
      : clamped(-dot(relativePositionM, displacementM) / displacementSquared, 0, 1);
    const closestPositionM = addVectors(
      relativePositionM,
      scaleVector(displacementM, closestFraction),
    );
    const closestClearanceM = magnitude(closestPositionM) - envelopeRadiusSumM;
    if (closestClearanceM < minimumClearanceM) {
      minimumClearanceM = closestClearanceM;
      minimumClearanceTimeS = timeS + closestFraction * durationS;
    }

    const quadraticA = displacementSquared;
    const quadraticB = 2 * dot(relativePositionM, displacementM);
    const quadraticC = dot(relativePositionM, relativePositionM) - envelopeRadiusSumM ** 2;
    let contactFraction: number | null = null;
    if (quadraticC <= ROOT_TOLERANCE) {
      contactFraction = 0;
    } else if (quadraticA > ROOT_TOLERANCE) {
      const discriminant = quadraticB ** 2 - 4 * quadraticA * quadraticC;
      if (discriminant >= -ROOT_TOLERANCE) {
        const root = Math.sqrt(Math.max(0, discriminant));
        const roots = [
          (-quadraticB - root) / (2 * quadraticA),
          (-quadraticB + root) / (2 * quadraticA),
        ].sort((left, right) => left - right);
        contactFraction = roots.find(
          (candidate) => candidate >= -ROOT_TOLERANCE && candidate <= 1 + ROOT_TOLERANCE,
        ) ?? null;
      }
    } else if (closestClearanceM <= ROOT_TOLERANCE) {
      contactFraction = closestFraction;
    }
    if (contactFraction !== null) {
      const boundedFraction = clamped(contactFraction, 0, 1);
      const contactTimeS = timeS + boundedFraction * durationS;
      const contactFirstPoint = interpolatePoint(first.trace, contactTimeS) ?? firstPoint;
      const contactSecondPoint = interpolatePoint(second.trace, contactTimeS) ?? secondPoint;
      const contactPositionM = addVectors(
        relativePositionM,
        scaleVector(displacementM, boundedFraction),
      );
      const contactVelocityMps = relativeVelocity(
        contactFirstPoint,
        contactSecondPoint,
        intervalRelativeVelocityMps,
      );
      updateContact(
        contactTimeS,
        contactPositionM,
        contactVelocityMps,
        contactFirstPoint,
        contactSecondPoint,
      );
    }
  }

  const assessed = Number.isFinite(minimumClearanceM);
  const contactDetected = firstContactTimeS !== null;
  return {
    status: assessed ? "assessed" : "not-assessed",
    contactStatus: assessed
      ? contactDetected
        ? "contact-detected"
        : "no-contact"
      : "not-assessed",
    envelopeRadiusSumM,
    minimumClearanceM: assessed ? minimumClearanceM : null,
    minimumClearanceTimeS: assessed ? minimumClearanceTimeS : null,
    firstContactTimeS,
    relativeSpeedAtFirstContactMps: firstContactRelativeSpeedMps,
    closingSpeedAtFirstContactMps: firstContactClosingSpeedMps,
    reducedMassKg: firstContactReducedMassKg,
    relativeKineticEnergyAtFirstContactJ: firstContactRelativeKineticEnergyJ,
    potentialContact: assessed ? contactDetected : null,
  };
}

/**
 * Finds potential fixed-envelope contact and relative COM energy for every
 * overlapping body pair. A non-positive clearance is a screening signal only;
 * no contact force, impulse distribution, rebound, or structural response is
 * applied to either trajectory.
 */
export function analyzeSeparationContact(
  input: Readonly<{ bodies: readonly SeparationContactBody[] }>,
): SeparationContactResult {
  if (input.bodies.length < 2) {
    throw new Error("separation contact screen requires at least two bodies");
  }
  const ids = new Set<string>();
  const bodies = input.bodies.map((body) => {
    if (!body.id.trim()) throw new Error("separation contact body id cannot be empty");
    if (ids.has(body.id)) throw new Error(`duplicate separation contact body id: ${body.id}`);
    ids.add(body.id);
    if (!Number.isFinite(body.releaseTimeS)) {
      throw new Error(`separation contact release time for ${body.id} must be finite`);
    }
    validateTrace(body.trace, `separation contact trace for ${body.id}`);
    return {
      ...body,
      label: body.label?.trim() || body.id,
      envelopeRadiusM: normalizeOptionalNonNegative(
        body.envelopeRadiusM,
        `separation contact radius for ${body.id}`,
      ),
      massKg: normalizeOptionalMass(body.massKg, `separation contact mass for ${body.id}`),
      trace: collapseDuplicateTimes(body.trace),
    };
  });
  const pairs: SeparationContactPair[] = [];
  for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
      const first = bodies[firstIndex]!;
      const second = bodies[secondIndex]!;
      const analysis = analyzePair(first, second);
      pairs.push({
        firstBodyId: first.id,
        firstBodyLabel: first.label,
        secondBodyId: second.id,
        secondBodyLabel: second.label,
        ...analysis,
      });
    }
  }
  const assessedPairs = pairs.filter((pair) => pair.status === "assessed");
  const contactPairs = pairs.filter((pair) => pair.potentialContact === true);
  const closestPair = assessedPairs.reduce<SeparationContactResult["closestPair"]>(
    (closest, pair) => {
      if (pair.minimumClearanceM === null || pair.minimumClearanceTimeS === null) return closest;
      if (!closest || pair.minimumClearanceM < closest.clearanceM) {
        return {
          firstBodyId: pair.firstBodyId,
          secondBodyId: pair.secondBodyId,
          timeS: pair.minimumClearanceTimeS,
          clearanceM: pair.minimumClearanceM,
        };
      }
      return closest;
    },
    null,
  );
  const firstContactPair = contactPairs.reduce<SeparationContactResult["firstContactPair"]>(
    (earliest, pair) => {
      if (pair.firstContactTimeS === null) return earliest;
      if (!earliest || pair.firstContactTimeS < earliest.timeS) {
        return {
          firstBodyId: pair.firstBodyId,
          secondBodyId: pair.secondBodyId,
          timeS: pair.firstContactTimeS,
          closingSpeedMps: pair.closingSpeedAtFirstContactMps,
          relativeKineticEnergyJ: pair.relativeKineticEnergyAtFirstContactJ,
        };
      }
      return earliest;
    },
    null,
  );
  const minimumClearanceM = closestPair?.clearanceM ?? null;
  const status: SeparationContactResult["status"] =
    assessedPairs.length === 0
      ? "not-assessed"
      : assessedPairs.length === pairs.length
        ? "assessed"
        : "partial";
  const contactStatus: SeparationContactResult["contactStatus"] =
    assessedPairs.length === 0
      ? "not-assessed"
      : contactPairs.length > 0
        ? "contact-detected"
        : assessedPairs.length === pairs.length
          ? "no-contact"
          : "partial";
  const warnings = [
    "This screen uses fixed spherical envelopes and piecewise-linear centre-of-mass interpolation; it is not a contact, collision, plume, aerodynamic-interference, structural-load, or flight-safety solver.",
    ...(status === "partial"
      ? ["Only overlapping pairs with two supplied spherical bounds were assessed."]
      : []),
    ...(status === "not-assessed"
      ? ["No pair had both supplied spherical bounds and an overlapping trace."]
      : []),
    ...(contactStatus === "contact-detected"
      ? ["At least one pair reaches non-positive fixed-envelope clearance; inspect separation geometry and mechanism dynamics independently."]
      : []),
    ...(contactPairs.some((pair) => pair.relativeKineticEnergyAtFirstContactJ === null)
      ? ["Relative kinetic energy is unavailable for at least one potential contact because a positive mass was not supplied for both bodies."]
      : []),
  ];
  const assumptions = [
    "Each body is represented by a fixed sphere centred at its simulated centre of mass; attitude, flex, propellant slosh, and geometry deformation are not resolved.",
    "Relative positions are interpolated piecewise linearly between supplied trace samples, so first contact is a kinematic root of the envelope boundary rather than a force-coupled event.",
    "Relative speed and closing speed are centre-of-mass kinematics; when trace velocities are missing, interval position slopes are used as a display-only fallback.",
    "The relative kinetic-energy value is 0.5 times reduced mass times relative COM speed squared. It is not an impact impulse, peak structural load, damage prediction, or certification result.",
    "No coefficient of restitution, contact duration, friction, rebound, angular impulse, plume interaction, aerodynamic interference, or range-safety response is assumed.",
  ];
  return {
    modelVersion: SEPARATION_CONTACT_MODEL_VERSION,
    validationStatus: SEPARATION_CONTACT_STATUS,
    bodies: bodies.map((body) => ({
      id: body.id,
      label: body.label,
      releaseTimeS: body.releaseTimeS,
      sampleCount: body.trace.length,
      envelopeRadiusM: body.envelopeRadiusM,
      massKg: body.massKg,
    })),
    pairs,
    assessedPairCount: assessedPairs.length,
    contactPairCount: contactPairs.length,
    minimumClearanceM,
    closestPair,
    firstContactPair,
    status,
    contactStatus,
    warnings,
    assumptions,
  };
}
