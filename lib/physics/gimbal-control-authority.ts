import {
  cross,
  dot,
  magnitude,
  scaleVector,
  solveMatrix3,
  subtractVectors,
  type Vector3,
} from "./linear-algebra.ts";
import type { MassProperties } from "./mass-properties.ts";

/**
 * Versioned, post-trace screen for the bounded effect of thrust-vector
 * actuators. This is intentionally an envelope, not a flight controller.
 */
export const GIMBAL_CONTROL_AUTHORITY_MODEL_VERSION =
  "rocketworks-gimbal-control-authority-0.1.0";
export const GIMBAL_CONTROL_AUTHORITY_VALIDATION_STATUS =
  "analytical-actuator-envelope" as const;
export const MAX_GIMBAL_DEFLECTION_DEG = 15;

export type GimbalControlAuthorityStatus =
  | "available"
  | "watch"
  | "not-assessed";

export type GimbalControlAuthorityMotorInput = Readonly<{
  id: string;
  name: string;
  thrustN: number;
  thrustAxisBody: Vector3;
  thrustApplicationPointBodyM: Vector3;
  /** True when the motor has a configured, bounded thrust-axis schedule. */
  gimbalConfigured: boolean;
  /** Optional first-order actuator response time retained for context only. */
  responseTimeS?: number;
}>;

export type GimbalControlAuthoritySampleInput = Readonly<{
  timeS: number;
  massProperties: MassProperties;
  motors: readonly GimbalControlAuthorityMotorInput[];
  /** Static plus rate-damping aerodynamic moment in the body frame. */
  aerodynamicMomentBodyNm?: Vector3 | null;
}>;

export type GimbalControlAuthorityMotorContribution = Readonly<{
  motorId: string;
  motorName: string;
  thrustN: number;
  maxDeflectionDeg: number;
  controlForceN: number;
  controlMomentNm: number;
  controlAngularAccelerationRadS2: number;
}>;

export type GimbalControlAuthoritySample = Readonly<{
  timeS: number;
  activeMotorCount: number;
  gimballedMotorCount: number;
  controlForceN: number;
  controlMomentNm: number;
  controlAngularAccelerationRadS2: number;
  aerodynamicMomentNm: number | null;
  controlToAerodynamicMomentRatio: number | null;
  motorContributions: readonly GimbalControlAuthorityMotorContribution[];
}>;

export type GimbalControlAuthorityResult = Readonly<{
  modelVersion: typeof GIMBAL_CONTROL_AUTHORITY_MODEL_VERSION;
  validationStatus: typeof GIMBAL_CONTROL_AUTHORITY_VALIDATION_STATUS;
  status: GimbalControlAuthorityStatus;
  sampleCount: number;
  activeGimbalSampleCount: number;
  activeGimbalCoverageFraction: number;
  maxDeflectionDeg: number;
  maximumConfiguredResponseTimeS: number | null;
  peakControlForceN: number | null;
  peakControlForceTimeS: number | null;
  peakControlMomentNm: number | null;
  peakControlMomentTimeS: number | null;
  peakControlAngularAccelerationRadS2: number | null;
  peakControlAngularAccelerationTimeS: number | null;
  minimumControlToAerodynamicMomentRatio: number | null;
  minimumControlToAerodynamicMomentRatioTimeS: number | null;
  samples: readonly GimbalControlAuthoritySample[];
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

const GIMBAL_DEFLECTION_RAD = (MAX_GIMBAL_DEFLECTION_DEG * Math.PI) / 180;
const GIMBAL_CORNER_VALUES = [-1, 0, 1] as const;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertFiniteVector(value: Vector3, label: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite x, y, and z components`);
  }
}

function normalize(value: Vector3, label: string): Vector3 {
  assertFiniteVector(value, label);
  const length = magnitude(value);
  if (!(length > 1e-12)) throw new Error(`${label} must have non-zero magnitude`);
  return scaleVector(value, 1 / length);
}

function localTransverseBases(axis: Vector3): Readonly<{
  pitchBasis: Vector3;
  yawBasis: Vector3;
}> {
  const reference = Math.abs(dot(axis, { x: 0, y: 0, z: 1 })) < 0.9
    ? { x: 0, y: 0, z: 1 }
    : { x: 0, y: 1, z: 0 };
  const pitchBasis = normalize(cross(axis, reference), "gimbal pitch basis");
  const yawBasis = normalize(cross(pitchBasis, axis), "gimbal yaw basis");
  return { pitchBasis, yawBasis };
}

function maxMotorEnvelope(
  motor: GimbalControlAuthorityMotorInput,
  massProperties: MassProperties,
): GimbalControlAuthorityMotorContribution | null {
  if (!motor.gimbalConfigured || !(motor.thrustN > 0)) return null;
  const axis = normalize(motor.thrustAxisBody, `${motor.id} thrust axis`);
  const applicationPoint = motor.thrustApplicationPointBodyM;
  assertFiniteVector(applicationPoint, `${motor.id} thrust application point`);
  const leverArm = subtractVectors(applicationPoint, massProperties.centerOfMassM);
  const { pitchBasis, yawBasis } = localTransverseBases(axis);
  const tangent = Math.tan(GIMBAL_DEFLECTION_RAD);
  let controlForceN = 0;
  let controlMomentNm = 0;
  let controlAngularAccelerationRadS2 = 0;
  for (const pitchSign of GIMBAL_CORNER_VALUES) {
    for (const yawSign of GIMBAL_CORNER_VALUES) {
      const commandAxis = normalize(
        {
          x: axis.x + pitchBasis.x * tangent * pitchSign + yawBasis.x * tangent * yawSign,
          y: axis.y + pitchBasis.y * tangent * pitchSign + yawBasis.y * tangent * yawSign,
          z: axis.z + pitchBasis.z * tangent * pitchSign + yawBasis.z * tangent * yawSign,
        },
        `${motor.id} commanded gimbal axis`,
      );
      const deltaForce = scaleVector(
        {
          x: commandAxis.x - axis.x,
          y: commandAxis.y - axis.y,
          z: commandAxis.z - axis.z,
        },
        motor.thrustN,
      );
      const deltaMoment = cross(leverArm, deltaForce);
      const deltaAngularAcceleration = solveMatrix3(
        massProperties.inertiaAtCenterKgM2,
        deltaMoment,
      );
      controlForceN = Math.max(controlForceN, magnitude(deltaForce));
      controlMomentNm = Math.max(controlMomentNm, magnitude(deltaMoment));
      controlAngularAccelerationRadS2 = Math.max(
        controlAngularAccelerationRadS2,
        magnitude(deltaAngularAcceleration),
      );
    }
  }
  return {
    motorId: motor.id,
    motorName: motor.name,
    thrustN: motor.thrustN,
    maxDeflectionDeg: MAX_GIMBAL_DEFLECTION_DEG,
    controlForceN,
    controlMomentNm,
    controlAngularAccelerationRadS2,
  };
}

function validateMassProperties(properties: MassProperties, label: string): void {
  assertFinite(properties.massKg, `${label} mass`);
  if (!(properties.massKg > 0)) throw new Error(`${label} mass must be positive`);
  assertFiniteVector(properties.centerOfMassM, `${label} center of mass`);
  properties.inertiaAtCenterKgM2.forEach((row, rowIndex) =>
    row.forEach((entry, columnIndex) =>
      assertFinite(entry, `${label} inertia [${rowIndex},${columnIndex}]`),
    ),
  );
}

function emptyResult(
  sampleCount: number,
  warnings: readonly string[],
): GimbalControlAuthorityResult {
  return {
    modelVersion: GIMBAL_CONTROL_AUTHORITY_MODEL_VERSION,
    validationStatus: GIMBAL_CONTROL_AUTHORITY_VALIDATION_STATUS,
    status: "not-assessed",
    sampleCount,
    activeGimbalSampleCount: 0,
    activeGimbalCoverageFraction: 0,
    maxDeflectionDeg: MAX_GIMBAL_DEFLECTION_DEG,
    maximumConfiguredResponseTimeS: null,
    peakControlForceN: null,
    peakControlForceTimeS: null,
    peakControlMomentNm: null,
    peakControlMomentTimeS: null,
    peakControlAngularAccelerationRadS2: null,
    peakControlAngularAccelerationTimeS: null,
    minimumControlToAerodynamicMomentRatio: null,
    minimumControlToAerodynamicMomentRatioTimeS: null,
    samples: [],
    assumptions: [
      "Only configured gimballed motors with positive instantaneous thrust contribute to the envelope.",
      "The reported bound independently combines each motor's maximum ±15° deflection corner; it is conservative and not a coordinated control-allocation result.",
      "Angular acceleration uses I·α = τ with the sampled center-of-mass inertia tensor.",
      "Aerodynamic comparison uses moment magnitudes only and is not a controller-gain, stability, or flight-safety margin.",
      "No rate limits, servo saturation, actuator faults, structural flexure, plume interaction, aerodynamic control derivatives, or closed-loop guidance are modeled.",
    ],
    warnings,
  };
}

/**
 * Analyze a staged trace using public rigid-body equations only. This is a
 * bounded actuator-effect screen and never feeds a force or moment back into
 * the flight integration.
 */
export function analyzeGimbalControlAuthority(
  samples: readonly GimbalControlAuthoritySampleInput[],
): GimbalControlAuthorityResult {
  const normalizedInputs = samples.map((sample, sampleIndex) => {
    assertFinite(sample.timeS, `gimbal authority sample ${sampleIndex + 1} time`);
    validateMassProperties(sample.massProperties, `gimbal authority sample ${sampleIndex + 1}`);
    const motorIds = new Set<string>();
    const motors = sample.motors.map((motor, motorIndex) => {
      if (!motor.id.trim()) throw new Error(`gimbal authority motor ${sampleIndex + 1}/${motorIndex + 1} id cannot be empty`);
      if (motorIds.has(motor.id)) throw new Error(`gimbal authority motor id ${motor.id} is duplicated in a sample`);
      motorIds.add(motor.id);
      if (!motor.name.trim()) throw new Error(`gimbal authority motor ${motor.id} name cannot be empty`);
      assertFinite(motor.thrustN, `${motor.id} thrust`);
      if (motor.thrustN < 0) throw new Error(`${motor.id} thrust cannot be negative`);
      assertFiniteVector(motor.thrustAxisBody, `${motor.id} thrust axis`);
      assertFiniteVector(motor.thrustApplicationPointBodyM, `${motor.id} thrust application point`);
      if (motor.responseTimeS !== undefined) {
        assertFinite(motor.responseTimeS, `${motor.id} gimbal response time`);
        if (motor.responseTimeS <= 0) throw new Error(`${motor.id} gimbal response time must be positive`);
      }
      return motor;
    });
    if (sample.aerodynamicMomentBodyNm !== undefined && sample.aerodynamicMomentBodyNm !== null) {
      assertFiniteVector(sample.aerodynamicMomentBodyNm, `gimbal authority sample ${sampleIndex + 1} aerodynamic moment`);
    }
    return { ...sample, motors };
  });
  for (let index = 1; index < normalizedInputs.length; index += 1) {
    if (normalizedInputs[index]!.timeS < normalizedInputs[index - 1]!.timeS) {
      throw new Error("gimbal authority sample times must be non-decreasing");
    }
  }
  if (normalizedInputs.length === 0) {
    return emptyResult(0, ["No staged trace samples were supplied, so gimbal authority is not assessed."]);
  }
  const configuredMotorCount = normalizedInputs.reduce(
    (count, sample) => count + sample.motors.filter((motor) => motor.gimbalConfigured).length,
    0,
  );
  if (configuredMotorCount === 0) {
    return emptyResult(
      normalizedInputs.length,
      ["No motor carries a configured gimbal schedule, so the actuator envelope is not assessed."],
    );
  }

  const resultSamples = normalizedInputs.map((sample): GimbalControlAuthoritySample => {
    const motorContributions = sample.motors
      .map((motor) => maxMotorEnvelope(motor, sample.massProperties))
      .filter((contribution): contribution is GimbalControlAuthorityMotorContribution => contribution !== null);
    const controlForceN = motorContributions.reduce((sum, motor) => sum + motor.controlForceN, 0);
    const controlMomentNm = motorContributions.reduce((sum, motor) => sum + motor.controlMomentNm, 0);
    const controlAngularAccelerationRadS2 = motorContributions.reduce(
      (sum, motor) => sum + motor.controlAngularAccelerationRadS2,
      0,
    );
    const aerodynamicMomentNm = sample.aerodynamicMomentBodyNm === undefined || sample.aerodynamicMomentBodyNm === null
      ? null
      : magnitude(sample.aerodynamicMomentBodyNm);
    const controlToAerodynamicMomentRatio = aerodynamicMomentNm !== null && aerodynamicMomentNm > 1e-12
      ? controlMomentNm / aerodynamicMomentNm
      : null;
    return {
      timeS: sample.timeS,
      activeMotorCount: sample.motors.filter((motor) => motor.thrustN > 0).length,
      gimballedMotorCount: motorContributions.length,
      controlForceN,
      controlMomentNm,
      controlAngularAccelerationRadS2,
      aerodynamicMomentNm,
      controlToAerodynamicMomentRatio,
      motorContributions,
    };
  });
  const activeGimbalSamples = resultSamples.filter((sample) => sample.gimballedMotorCount > 0);
  const peakBy = (
    select: (sample: GimbalControlAuthoritySample) => number,
  ): Readonly<{ value: number | null; timeS: number | null }> => {
    if (resultSamples.length === 0) return { value: null, timeS: null };
    const sample = resultSamples.reduce((best, current) => select(current) > select(best) ? current : best, resultSamples[0]!);
    return { value: select(sample), timeS: sample.timeS };
  };
  const peakForce = peakBy((sample) => sample.controlForceN);
  const peakMoment = peakBy((sample) => sample.controlMomentNm);
  const peakAngularAcceleration = peakBy((sample) => sample.controlAngularAccelerationRadS2);
  const ratioSamples = resultSamples.filter(
    (sample): sample is GimbalControlAuthoritySample & { controlToAerodynamicMomentRatio: number } =>
      sample.controlToAerodynamicMomentRatio !== null && sample.gimballedMotorCount > 0,
  );
  const minimumRatioSample = ratioSamples.length > 0
    ? ratioSamples.reduce((best, current) => current.controlToAerodynamicMomentRatio < best.controlToAerodynamicMomentRatio ? current : best, ratioSamples[0]!)
    : null;
  const maximumConfiguredResponseTimeS = normalizedInputs
    .flatMap((sample) => sample.motors)
    .map((motor) => motor.responseTimeS)
    .filter((value): value is number => value !== undefined)
    .reduce<number | null>((maximum, value) => maximum === null ? value : Math.max(maximum, value), null);
  const activeGimbalCoverageFraction = activeGimbalSamples.length / normalizedInputs.length;
  const warnings = [
    ...(activeGimbalSamples.length === 0
      ? ["Gimbal schedules are configured, but no trace sample has positive thrust through a gimballed motor; authority remains unavailable."]
      : []),
    ...(activeGimbalSamples.length > 0 && activeGimbalCoverageFraction < 1
      ? ["Gimballed positive-thrust coverage is intermittent; the envelope is only available over the reported active samples."]
      : []),
    ...(ratioSamples.length === 0 && activeGimbalSamples.length > 0
      ? ["No positive aerodynamic-moment sample was available, so a control-to-aerodynamic moment ratio was not assessed."]
      : []),
  ];
  return {
    modelVersion: GIMBAL_CONTROL_AUTHORITY_MODEL_VERSION,
    validationStatus: GIMBAL_CONTROL_AUTHORITY_VALIDATION_STATUS,
    status: activeGimbalSamples.length === 0 ? "watch" : "available",
    sampleCount: normalizedInputs.length,
    activeGimbalSampleCount: activeGimbalSamples.length,
    activeGimbalCoverageFraction,
    maxDeflectionDeg: MAX_GIMBAL_DEFLECTION_DEG,
    maximumConfiguredResponseTimeS,
    peakControlForceN: activeGimbalSamples.length > 0 ? peakForce.value : null,
    peakControlForceTimeS: activeGimbalSamples.length > 0 ? peakForce.timeS : null,
    peakControlMomentNm: activeGimbalSamples.length > 0 ? peakMoment.value : null,
    peakControlMomentTimeS: activeGimbalSamples.length > 0 ? peakMoment.timeS : null,
    peakControlAngularAccelerationRadS2: activeGimbalSamples.length > 0 ? peakAngularAcceleration.value : null,
    peakControlAngularAccelerationTimeS: activeGimbalSamples.length > 0 ? peakAngularAcceleration.timeS : null,
    minimumControlToAerodynamicMomentRatio: minimumRatioSample?.controlToAerodynamicMomentRatio ?? null,
    minimumControlToAerodynamicMomentRatioTimeS: minimumRatioSample?.timeS ?? null,
    samples: resultSamples,
    assumptions: [
      "Only configured gimballed motors with positive instantaneous thrust contribute to the envelope.",
      "The reported bound independently combines each motor's maximum ±15° deflection corner; it is conservative and not a coordinated control-allocation result.",
      "Angular acceleration uses I·α = τ with the sampled center-of-mass inertia tensor.",
      "Aerodynamic comparison uses moment magnitudes only and is not a controller-gain, stability, or flight-safety margin.",
      "No rate limits, servo saturation, actuator faults, structural flexure, plume interaction, aerodynamic control derivatives, or closed-loop guidance are modeled.",
    ],
    warnings,
  };
}
