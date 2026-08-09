import {
  applyRelativeHumidityToAtmosphere,
  gravityAtAltitude,
  reynoldsNumber,
  standardAtmosphere,
} from "./atmosphere.ts";
import type { AerodynamicCoefficientTableModel } from "./aerodynamic-coefficients.ts";
import {
  interpolateWind,
  propellantFractionConsumed,
  thrustAt,
  totalImpulse,
  validateThrustCurve,
  validateWindProfile,
  type ThrustPoint,
  type WindLayer,
} from "./curves.ts";

export const VERTICAL_MODEL_VERSION = "kestrel-vertical-0.2.1-alpha";
export const VERTICAL_MODEL_STATUS = "engineering-preview-unvalidated";

export type FlightEventType =
  | "ignition"
  | "liftoff"
  | "burnout"
  | "apogee"
  | "recovery_deploy"
  | "ground_impact"
  | "no_liftoff";

export type FlightEvent = {
  type: FlightEventType;
  timeS: number;
  altitudeAglM: number;
  velocityMps: number;
  label: string;
};

export type ModelWarning = {
  code: string;
  severity: "info" | "warning" | "error";
  title: string;
  explanation: string;
};

export type VerticalFlightConfig = {
  vehicle: {
    dryMassKg: number;
    propellantMassKg: number;
    referenceAreaM2: number;
    dragCoefficient: number;
  };
  aerodynamics?: {
    coefficientTable: AerodynamicCoefficientTableModel;
    referenceLengthM: number;
  };
  motor: {
    thrustCurve: ThrustPoint[];
  };
  recovery?: {
    enabled: boolean;
    dragAreaM2: number;
    dragCoefficient: number;
    deploymentDelayAfterApogeeS: number;
  };
  environment?: {
    launchAltitudeM?: number;
    windProfile?: WindLayer[];
    relativeHumidityFraction?: number;
  };
  integration?: {
    timeStepS?: number;
    maxTimeS?: number;
  };
  initialState?: {
    altitudeAglM?: number;
    velocityMps?: number;
  };
};

export type FlightTracePoint = {
  timeS: number;
  altitudeAglM: number;
  velocityMps: number;
  accelerationMps2: number;
  massKg: number;
  thrustN: number;
  densityKgM3: number;
  mach: number;
  dynamicPressurePa: number;
  horizontalWindMps: number;
  recoveryDeployed: boolean;
};

export type VerticalFlightResult = {
  modelVersion: string;
  validationStatus: string;
  apogeeM: number;
  maxSpeedMps: number;
  maxMach: number;
  maxDynamicPressurePa: number;
  timeToApogeeS: number;
  totalFlightTimeS: number;
  impactSpeedMps: number | null;
  thrustToWeightAtIgnition: number;
  totalImpulseNs: number;
  aerodynamicCoefficientBasis?: "constant" | "mach-reynolds-table";
  aerodynamicModelVersion?: string;
  events: FlightEvent[];
  warnings: ModelWarning[];
  trace: FlightTracePoint[];
  assumptions: string[];
};

type State = { altitudeAglM: number; velocityMps: number };

function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }
}

function validateConfig(config: VerticalFlightConfig) {
  assertPositive(config.vehicle.dryMassKg, "Dry mass");
  if (
    !Number.isFinite(config.vehicle.propellantMassKg) ||
    config.vehicle.propellantMassKg < 0
  ) {
    throw new Error("Propellant mass must be finite and non-negative.");
  }
  assertPositive(config.vehicle.referenceAreaM2, "Reference area");
  assertPositive(config.vehicle.dragCoefficient, "Drag coefficient");
  if (config.aerodynamics) {
    assertPositive(config.aerodynamics.referenceLengthM, "Aerodynamic reference length");
  }
  validateThrustCurve(config.motor.thrustCurve);
  validateWindProfile(config.environment?.windProfile ?? []);
  if (
    config.environment?.relativeHumidityFraction !== undefined &&
    (!Number.isFinite(config.environment.relativeHumidityFraction) ||
      config.environment.relativeHumidityFraction < 0 ||
      config.environment.relativeHumidityFraction > 1)
  ) {
    throw new Error("Relative humidity fraction must be from 0 through 1.");
  }
  if (config.recovery?.enabled) {
    assertPositive(config.recovery.dragAreaM2, "Recovery drag area");
    assertPositive(config.recovery.dragCoefficient, "Recovery drag coefficient");
    if (config.recovery.deploymentDelayAfterApogeeS < 0) {
      throw new Error("Recovery deployment delay cannot be negative.");
    }
  }
}

export function simulateVerticalFlight(
  config: VerticalFlightConfig,
): VerticalFlightResult {
  validateConfig(config);
  const timeStepS = config.integration?.timeStepS ?? 0.02;
  const maxTimeS = config.integration?.maxTimeS ?? 180;
  if (timeStepS <= 0 || timeStepS > 0.1) {
    throw new Error("Integration time step must be greater than 0 and at most 0.1 s.");
  }

  const launchAltitudeM = config.environment?.launchAltitudeM ?? 0;
  const windProfile = config.environment?.windProfile ?? [];
  const relativeHumidityFraction = config.environment?.relativeHumidityFraction;
  const thrustCurve = config.motor.thrustCurve;
  const burnoutTimeS = thrustCurve.at(-1)!.timeS;
  const launchMassKg =
    config.vehicle.dryMassKg + config.vehicle.propellantMassKg;
  const ignitionThrustN = thrustAt(thrustCurve, 0);
  const ignitionGravity = gravityAtAltitude(launchAltitudeM);
  const thrustToWeightAtIgnition =
    ignitionThrustN / (launchMassKg * ignitionGravity);
  const events: FlightEvent[] = [
    {
      type: "ignition",
      timeS: 0,
      altitudeAglM: config.initialState?.altitudeAglM ?? 0,
      velocityMps: config.initialState?.velocityMps ?? 0,
      label: "Motor ignition",
    },
  ];
  const trace: FlightTracePoint[] = [];
  const warnings: ModelWarning[] = [];
  let state: State = {
    altitudeAglM: config.initialState?.altitudeAglM ?? 0,
    velocityMps: config.initialState?.velocityMps ?? 0,
  };
  let timeS = 0;
  let liftedOff = state.altitudeAglM > 0;
  let burnoutRecorded = false;
  let apogeeRecorded = false;
  let recoveryDeployed = false;
  let scheduledRecoveryTimeS: number | null = null;
  let apogeeM = state.altitudeAglM;
  let timeToApogeeS = 0;
  let maxSpeedMps = Math.abs(state.velocityMps);
  let maxMach = 0;
  let maxDynamicPressurePa = 0;
  let impactSpeedMps: number | null = null;
  const aerodynamicApplicabilityWarnings = new Map<string, ModelWarning>();
  let aerodynamicFallbackWarning: string | null = null;

  const sample = (
    sampleTimeS: number,
    sampleState: State,
    chuteDeployed: boolean,
  ) => {
    const dryAtmosphere = standardAtmosphere(
      launchAltitudeM + Math.max(0, sampleState.altitudeAglM),
    );
    const atmosphere = relativeHumidityFraction === undefined
      ? dryAtmosphere
      : applyRelativeHumidityToAtmosphere(
          dryAtmosphere,
          relativeHumidityFraction,
        );
    const consumed = propellantFractionConsumed(thrustCurve, sampleTimeS);
    const massKg =
      config.vehicle.dryMassKg +
      config.vehicle.propellantMassKg * (1 - consumed);
    const thrustN = thrustAt(thrustCurve, sampleTimeS);
    const wind = interpolateWind(windProfile, sampleState.altitudeAglM);
    const relativeVerticalMps = sampleState.velocityMps - wind.upMps;
    const dynamicPressurePa =
      0.5 * atmosphere.densityKgM3 * relativeVerticalMps * relativeVerticalMps;
    const mach = Math.abs(relativeVerticalMps) / atmosphere.speedOfSoundMps;
    let bodyDragCoefficient = config.vehicle.dragCoefficient;
    if (config.aerodynamics) {
      try {
        const queryReynoldsNumber = reynoldsNumber({
          densityKgM3: atmosphere.densityKgM3,
          speedMps: Math.abs(relativeVerticalMps),
          referenceLengthM: config.aerodynamics.referenceLengthM,
          dynamicViscosityPaS: atmosphere.dynamicViscosityPaS,
        });
        const evaluation = config.aerodynamics.coefficientTable.evaluate({
          mach,
          reynoldsNumber: queryReynoldsNumber,
        });
        bodyDragCoefficient = evaluation.dragCoefficient;
        for (const issue of evaluation.applicability) {
          if (!aerodynamicApplicabilityWarnings.has(issue.code)) {
            aerodynamicApplicabilityWarnings.set(issue.code, {
              code: issue.code,
              severity: issue.severity === "info" ? "info" : "warning",
              title: "Aerodynamic coefficient table applicability",
              explanation: issue.explanation,
            });
          }
        }
      } catch (error) {
        bodyDragCoefficient = config.vehicle.dragCoefficient;
        if (aerodynamicFallbackWarning === null) {
          aerodynamicFallbackWarning = error instanceof Error
            ? error.message
            : "The aerodynamic coefficient table could not be evaluated.";
        }
      }
    }
    const bodyCdA =
      bodyDragCoefficient * config.vehicle.referenceAreaM2;
    const recoveryCdA =
      chuteDeployed && config.recovery?.enabled
        ? config.recovery.dragCoefficient * config.recovery.dragAreaM2
        : 0;
    const dragN =
      -Math.sign(relativeVerticalMps) *
      dynamicPressurePa *
      (bodyCdA + recoveryCdA);
    const gravityMps2 = gravityAtAltitude(
      launchAltitudeM + Math.max(0, sampleState.altitudeAglM),
    );
    const unconstrainedAccelerationMps2 =
      (thrustN + dragN - massKg * gravityMps2) / massKg;
    const onPad =
      sampleState.altitudeAglM <= 0 &&
      sampleState.velocityMps <= 0 &&
      unconstrainedAccelerationMps2 <= 0;

    return {
      derivative: {
        altitudeAglM: onPad ? 0 : sampleState.velocityMps,
        velocityMps: onPad ? 0 : unconstrainedAccelerationMps2,
      },
      trace: {
        timeS: sampleTimeS,
        altitudeAglM: Math.max(0, sampleState.altitudeAglM),
        velocityMps: sampleState.velocityMps,
        accelerationMps2: onPad ? 0 : unconstrainedAccelerationMps2,
        massKg,
        thrustN,
        densityKgM3: atmosphere.densityKgM3,
        mach,
        dynamicPressurePa,
        horizontalWindMps: wind.horizontalSpeedMps,
        recoveryDeployed: chuteDeployed,
      } satisfies FlightTracePoint,
    };
  };

  const add = (base: State, derivative: State, multiplier: number): State => ({
    altitudeAglM: base.altitudeAglM + derivative.altitudeAglM * multiplier,
    velocityMps: base.velocityMps + derivative.velocityMps * multiplier,
  });

  trace.push(sample(timeS, state, recoveryDeployed).trace);

  while (timeS < maxTimeS) {
    if (
      scheduledRecoveryTimeS !== null &&
      !recoveryDeployed &&
      timeS >= scheduledRecoveryTimeS
    ) {
      recoveryDeployed = true;
      events.push({
        type: "recovery_deploy",
        timeS,
        altitudeAglM: state.altitudeAglM,
        velocityMps: state.velocityMps,
        label: "Recovery device deployed",
      });
    }

    const k1 = sample(timeS, state, recoveryDeployed).derivative;
    const k2 = sample(
      timeS + timeStepS / 2,
      add(state, k1, timeStepS / 2),
      recoveryDeployed,
    ).derivative;
    const k3 = sample(
      timeS + timeStepS / 2,
      add(state, k2, timeStepS / 2),
      recoveryDeployed,
    ).derivative;
    const k4 = sample(
      timeS + timeStepS,
      add(state, k3, timeStepS),
      recoveryDeployed,
    ).derivative;

    const nextState: State = {
      altitudeAglM:
        state.altitudeAglM +
        (timeStepS / 6) *
          (k1.altitudeAglM +
            2 * k2.altitudeAglM +
            2 * k3.altitudeAglM +
            k4.altitudeAglM),
      velocityMps:
        state.velocityMps +
        (timeStepS / 6) *
          (k1.velocityMps +
            2 * k2.velocityMps +
            2 * k3.velocityMps +
            k4.velocityMps),
    };
    const nextTimeS = timeS + timeStepS;

    if (!liftedOff && nextState.altitudeAglM > 0.01) {
      liftedOff = true;
      events.push({
        type: "liftoff",
        timeS: nextTimeS,
        altitudeAglM: nextState.altitudeAglM,
        velocityMps: nextState.velocityMps,
        label: "Vehicle cleared the pad",
      });
    }
    if (!burnoutRecorded && nextTimeS >= burnoutTimeS) {
      burnoutRecorded = true;
      events.push({
        type: "burnout",
        timeS: burnoutTimeS,
        altitudeAglM: Math.max(0, nextState.altitudeAglM),
        velocityMps: nextState.velocityMps,
        label: "Motor burnout",
      });
    }
    if (
      liftedOff &&
      !apogeeRecorded &&
      state.velocityMps > 0 &&
      nextState.velocityMps <= 0
    ) {
      const fraction =
        state.velocityMps / (state.velocityMps - nextState.velocityMps);
      timeToApogeeS = timeS + fraction * timeStepS;
      apogeeM =
        state.altitudeAglM +
        fraction * (nextState.altitudeAglM - state.altitudeAglM);
      apogeeRecorded = true;
      events.push({
        type: "apogee",
        timeS: timeToApogeeS,
        altitudeAglM: apogeeM,
        velocityMps: 0,
        label: "Apogee",
      });
      if (config.recovery?.enabled) {
        scheduledRecoveryTimeS =
          timeToApogeeS + config.recovery.deploymentDelayAfterApogeeS;
        if (scheduledRecoveryTimeS <= nextTimeS) {
          recoveryDeployed = true;
          events.push({
            type: "recovery_deploy",
            timeS: scheduledRecoveryTimeS,
            altitudeAglM: apogeeM,
            velocityMps: 0,
            label: "Recovery device deployed",
          });
        }
      }
    }

    timeS = nextTimeS;
    state = nextState;
    const current = sample(timeS, state, recoveryDeployed).trace;
    trace.push(current);
    apogeeM = Math.max(apogeeM, current.altitudeAglM);
    maxSpeedMps = Math.max(maxSpeedMps, Math.abs(current.velocityMps));
    maxMach = Math.max(maxMach, current.mach);
    maxDynamicPressurePa = Math.max(
      maxDynamicPressurePa,
      current.dynamicPressurePa,
    );

    if (liftedOff && timeS > burnoutTimeS && state.altitudeAglM <= 0) {
      state.altitudeAglM = 0;
      impactSpeedMps = Math.abs(state.velocityMps);
      events.push({
        type: "ground_impact",
        timeS,
        altitudeAglM: 0,
        velocityMps: state.velocityMps,
        label: "Ground impact",
      });
      break;
    }
    if (!liftedOff && timeS > burnoutTimeS + 1) {
      events.push({
        type: "no_liftoff",
        timeS,
        altitudeAglM: 0,
        velocityMps: 0,
        label: "No liftoff",
      });
      break;
    }
  }

  if (!liftedOff) {
    warnings.push({
      code: "NO_LIFTOFF",
      severity: "error",
      title: "The vehicle did not leave the pad",
      explanation:
        "Motor thrust never produced positive upward acceleration for this launch mass.",
    });
  } else if (thrustToWeightAtIgnition < 3) {
    warnings.push({
      code: "LOW_THRUST_TO_WEIGHT",
      severity: "warning",
      title: "Low initial thrust-to-weight ratio",
      explanation:
        "Slow initial acceleration can increase sensitivity to wind and launcher geometry.",
    });
  }
  if (aerodynamicFallbackWarning !== null) {
    warnings.push({
      code: "AERODYNAMIC_TABLE_FALLBACK",
      severity: "warning",
      title: "Aerodynamic table fallback",
      explanation: `${aerodynamicFallbackWarning} The explicit constant Cd input was used for the affected samples.`,
    });
  }
  warnings.push(...aerodynamicApplicabilityWarnings.values());
  if (maxMach > 0.75 && !config.aerodynamics) {
    warnings.push({
      code: "CONSTANT_CD_TRANSONIC",
      severity: "warning",
      title: "Constant drag coefficient used near transonic speed",
      explanation:
        "This preview does not yet vary drag coefficient with Mach or Reynolds number.",
    });
  }
  if (windProfile.some((layer) => Math.hypot(layer.eastMps, layer.northMps) > 0)) {
    warnings.push({
      code: "CROSSWIND_NOT_COUPLED",
      severity: "info",
      title: "Crosswind is reported but not dynamically coupled",
      explanation:
        "Horizontal wind interpolation is ready for the future 6-DOF model; this 1D solver only couples vertical air motion.",
    });
  }
  if (relativeHumidityFraction !== undefined) {
    warnings.push({
      code: "HUMID_AIR_CORRECTION",
      severity: "info",
      title: "Moist-air correction is active",
      explanation:
        "Density and speed of sound use a constant-relative-humidity ideal-mixture approximation; condensation, phase change, and humidity-dependent viscosity are not modeled.",
    });
  }
  warnings.push({
    code: "MODEL_UNVALIDATED",
    severity: "info",
    title: "Engineering-preview model",
    explanation:
      "The solver has analytical regression tests but has not completed experimental or independent simulator validation.",
  });

  return {
    modelVersion: VERTICAL_MODEL_VERSION,
    validationStatus: VERTICAL_MODEL_STATUS,
    apogeeM,
    maxSpeedMps,
    maxMach,
    maxDynamicPressurePa,
    timeToApogeeS,
    totalFlightTimeS: timeS,
    impactSpeedMps,
    thrustToWeightAtIgnition,
    totalImpulseNs: totalImpulse(thrustCurve),
    aerodynamicCoefficientBasis: config.aerodynamics
      ? "mach-reynolds-table"
      : "constant",
    aerodynamicModelVersion: config.aerodynamics?.coefficientTable.modelVersion,
    events,
    warnings,
    trace,
    assumptions: [
      "One-dimensional vertical translation",
      "U.S. Standard Atmosphere 1976 through 20 km",
      config.aerodynamics
        ? "Drag coefficient is interpolated from the supplied Mach-Reynolds table"
        : "User-supplied drag coefficient is constant with Mach and Reynolds number",
      "Thrust curve is linearly interpolated",
      "Propellant depletion is proportional to delivered impulse",
      ...(relativeHumidityFraction !== undefined
        ? ["Relative humidity is applied to the standard atmosphere as a constant-altitude-profile ideal-mixture correction."]
        : ["Dry-air density and speed of sound are used when no relative humidity is supplied."]),
      "Rigid vehicle with no attitude, stability, or structural dynamics",
    ],
  };
}
