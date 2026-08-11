import {
  applyRelativeHumidityToAtmosphere,
  atmosphereFromSurfaceObservation,
  gravityAtAltitude,
  reynoldsNumber,
  standardAtmosphere,
  type SurfaceAtmosphereObservation,
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
import {
  evaluateRecoveryReefing,
  validateRecoveryReefingStages,
  type RecoveryReefingStage,
} from "./recovery-reefing.ts";

export const VERTICAL_MODEL_VERSION = "kestrel-vertical-0.3.0-alpha";
export const VERTICAL_MODEL_STATUS = "engineering-preview-unvalidated";

export type FlightEventType =
  | "ignition"
  | "liftoff"
  | "burnout"
  | "apogee"
  | "recovery_deploy"
  | "ground_impact"
  | "no_liftoff";

/** Trigger used to command the primary recovery device in the 1D preview. */
export type RecoveryDeploymentTrigger = "apogee" | "altitude" | "time";

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
    /** Defaults to apogee for backwards-compatible callers. */
    deploymentTrigger?: RecoveryDeploymentTrigger;
    /** Descending AGL trigger when deploymentTrigger is altitude. */
    deploymentAltitudeAglM?: number;
    /** Mission-time trigger when deploymentTrigger is time. */
    deploymentTimeS?: number;
    /** Optional effective-area schedule beginning when the recovery command is applied. */
    reefingStages?: readonly RecoveryReefingStage[];
  };
  environment?: {
    launchAltitudeM?: number;
    windProfile?: WindLayer[];
    surfaceObservation?: SurfaceAtmosphereObservation;
    /** Backward-compatible shorthand for a standard-atmosphere humidity correction. */
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
  recoveryReefingFraction: number;
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
  aerodynamicCoefficientBasis?:
    | "constant"
    | "mach-reynolds-table"
    | "mach-reynolds-angle-table";
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
  const surfaceObservation = config.environment?.surfaceObservation;
  if (surfaceObservation) {
    if (!Number.isFinite(surfaceObservation.stationPressurePa) || surfaceObservation.stationPressurePa <= 0) {
      throw new Error("Surface observation pressure must be positive and finite.");
    }
    if (!Number.isFinite(surfaceObservation.temperatureK) || surfaceObservation.temperatureK <= 0) {
      throw new Error("Surface observation temperature must be positive and finite.");
    }
    if (
      surfaceObservation.relativeHumidityFraction !== undefined &&
      (!Number.isFinite(surfaceObservation.relativeHumidityFraction) ||
        surfaceObservation.relativeHumidityFraction < 0 ||
        surfaceObservation.relativeHumidityFraction > 1)
    ) {
      throw new Error("Surface observation relative humidity must be from 0 through 1.");
    }
  }
  if (
    surfaceObservation?.relativeHumidityFraction !== undefined &&
    config.environment?.relativeHumidityFraction !== undefined &&
    surfaceObservation.relativeHumidityFraction !==
      config.environment.relativeHumidityFraction
  ) {
    throw new Error("Surface observation humidity and shorthand humidity must match.");
  }
  if (config.recovery?.enabled) {
    assertPositive(config.recovery.dragAreaM2, "Recovery drag area");
    assertPositive(config.recovery.dragCoefficient, "Recovery drag coefficient");
    if (config.recovery.deploymentDelayAfterApogeeS < 0) {
      throw new Error("Recovery deployment delay cannot be negative.");
    }
    const deploymentTrigger = config.recovery.deploymentTrigger ?? "apogee";
    if (deploymentTrigger !== "apogee" && deploymentTrigger !== "altitude" && deploymentTrigger !== "time") {
      throw new Error("Recovery deployment trigger must be apogee, altitude, or time.");
    }
    if (deploymentTrigger === "altitude" && (!Number.isFinite(config.recovery.deploymentAltitudeAglM) || config.recovery.deploymentAltitudeAglM! < 0)) {
      throw new Error("Recovery deployment altitude must be finite and non-negative.");
    }
    if (deploymentTrigger === "time" && (!Number.isFinite(config.recovery.deploymentTimeS) || config.recovery.deploymentTimeS! < 0)) {
      throw new Error("Recovery deployment time must be finite and non-negative.");
    }
  }
  validateRecoveryReefingStages(config.recovery?.reefingStages, "vertical recovery reefing stages");
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
  const surfaceObservation = config.environment?.surfaceObservation;
  const relativeHumidityFraction = config.environment?.relativeHumidityFraction;
  const effectiveSurfaceObservation = surfaceObservation
    ? {
        ...surfaceObservation,
        ...(surfaceObservation.relativeHumidityFraction === undefined &&
        relativeHumidityFraction !== undefined
          ? { relativeHumidityFraction }
          : {}),
      }
    : undefined;
  const humidityActive =
    effectiveSurfaceObservation?.relativeHumidityFraction !== undefined ||
    relativeHumidityFraction !== undefined;
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
  const recoveryTrigger = config.recovery?.deploymentTrigger ?? "apogee";
  const recoveryTriggerLabel = recoveryTrigger === "altitude"
    ? `Recovery device command on descent through ${(config.recovery?.deploymentAltitudeAglM ?? 0).toFixed(0)} m AGL`
    : recoveryTrigger === "time"
      ? `Recovery device command at ${(config.recovery?.deploymentTimeS ?? 0).toFixed(2)} s`
      : "Recovery device deployed after apogee";
  let apogeeM = state.altitudeAglM;
  let timeToApogeeS = 0;
  let maxSpeedMps = Math.abs(state.velocityMps);
  let maxMach = 0;
  let maxDynamicPressurePa = 0;
  let impactSpeedMps: number | null = null;
  const aerodynamicApplicabilityWarnings = new Map<string, ModelWarning>();
  let aerodynamicFallbackWarning: string | null = null;

  if (config.recovery?.enabled && recoveryTrigger === "time") {
    scheduledRecoveryTimeS =
      (config.recovery.deploymentTimeS ?? 0) +
      config.recovery.deploymentDelayAfterApogeeS;
  }

  const sample = (
    sampleTimeS: number,
    sampleState: State,
    chuteDeployed: boolean,
  ) => {
    const altitudeAslM = launchAltitudeM + Math.max(0, sampleState.altitudeAglM);
    const atmosphere = effectiveSurfaceObservation
      ? atmosphereFromSurfaceObservation(
          altitudeAslM,
          launchAltitudeM,
          effectiveSurfaceObservation,
        )
      : (() => {
          const dryAtmosphere = standardAtmosphere(altitudeAslM);
          return relativeHumidityFraction === undefined
            ? dryAtmosphere
            : applyRelativeHumidityToAtmosphere(
                dryAtmosphere,
                relativeHumidityFraction,
              );
        })();
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
          angleOfAttackRad: 0,
          sideslipRad: 0,
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
    const reefing =
      chuteDeployed && scheduledRecoveryTimeS !== null
        ? evaluateRecoveryReefing(
            config.recovery?.reefingStages,
            sampleTimeS - scheduledRecoveryTimeS,
          )
        : { areaFraction: 1, stageIndex: null };
    const recoveryCdA =
      chuteDeployed && config.recovery?.enabled
        ? config.recovery.dragCoefficient * config.recovery.dragAreaM2 * reefing.areaFraction
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
        recoveryReefingFraction: reefing.areaFraction,
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
        label: recoveryTriggerLabel,
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
        if (recoveryTrigger === "apogee") {
          scheduledRecoveryTimeS =
            timeToApogeeS + config.recovery.deploymentDelayAfterApogeeS;
          if (scheduledRecoveryTimeS <= nextTimeS) {
            recoveryDeployed = true;
            events.push({
              type: "recovery_deploy",
              timeS: scheduledRecoveryTimeS,
              altitudeAglM: apogeeM,
              velocityMps: 0,
              label: recoveryTriggerLabel,
            });
          }
        }
      }
    }

    if (
      config.recovery?.enabled &&
      recoveryTrigger === "altitude" &&
      scheduledRecoveryTimeS === null &&
      state.velocityMps < 0 &&
      state.altitudeAglM >= (config.recovery.deploymentAltitudeAglM ?? 0) &&
      nextState.altitudeAglM <= (config.recovery.deploymentAltitudeAglM ?? 0)
    ) {
      const targetAltitudeAglM = config.recovery.deploymentAltitudeAglM ?? 0;
      const altitudeDeltaM = state.altitudeAglM - nextState.altitudeAglM;
      const fraction = altitudeDeltaM > 0
        ? Math.max(0, Math.min(1, (state.altitudeAglM - targetAltitudeAglM) / altitudeDeltaM))
        : 0;
      const triggerTimeS = timeS + fraction * timeStepS;
      scheduledRecoveryTimeS =
        triggerTimeS + config.recovery.deploymentDelayAfterApogeeS;
      if (scheduledRecoveryTimeS <= nextTimeS) {
        recoveryDeployed = true;
        events.push({
          type: "recovery_deploy",
          timeS: scheduledRecoveryTimeS,
          altitudeAglM: targetAltitudeAglM,
          velocityMps: nextState.velocityMps,
          label: recoveryTriggerLabel,
        });
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
  if (config.recovery?.enabled && !recoveryDeployed) {
    warnings.push({
      code: "RECOVERY_TRIGGER_NOT_REACHED",
      severity: "warning",
      title: "Recovery trigger was not reached",
      explanation: `${recoveryTriggerLabel} did not occur before the trace ended; the recovery device remained stowed.`,
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
  if (humidityActive) {
    warnings.push({
      code: "HUMID_AIR_CORRECTION",
      severity: "info",
      title: "Moist-air correction is active",
      explanation:
        "Density and speed of sound use a constant-relative-humidity ideal-mixture approximation; condensation, phase change, and humidity-dependent viscosity are not modeled.",
    });
  }
  if (surfaceObservation) {
    warnings.push({
      code: "SURFACE_WEATHER_ANCHOR",
      severity: "info",
      title: "Surface weather anchor is active",
      explanation:
        "Pressure and temperature are anchored to the launch-site observation and then offset through the standard atmosphere profile; the observation is not a forecast or live weather feed.",
    });
  }
  if (config.recovery?.enabled && (config.recovery.reefingStages?.length ?? 0) > 0) {
    warnings.push({
      code: "RECOVERY_REEFING_APPROXIMATION",
      severity: "info",
      title: "Recovery reefing schedule is active",
      explanation:
        "The configured piecewise-linear effective-area schedule starts at recovery command time; canopy inflation dynamics, reefing lines, and hardware loads are not modeled.",
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
      ? config.aerodynamics.coefficientTable.angleOfAttackRangeRad === null
        ? "mach-reynolds-table"
        : "mach-reynolds-angle-table"
      : "constant",
    aerodynamicModelVersion: config.aerodynamics?.coefficientTable.modelVersion,
    events,
    warnings,
    trace,
    assumptions: [
      "One-dimensional vertical translation",
      "U.S. Standard Atmosphere 1976 hydrostatic layers through 84.852 km geopotential (about 86 km geometric)",
      config.aerodynamics
        ? config.aerodynamics.coefficientTable.angleOfAttackRangeRad === null
          ? "Drag coefficient is interpolated from the supplied Mach-Reynolds table"
          : "The supplied angular coefficient volume is evaluated at zero angle of attack and zero sideslip in this one-dimensional vertical solver"
        : "User-supplied drag coefficient is constant with Mach and Reynolds number",
      "Thrust curve is linearly interpolated",
      "Propellant depletion is proportional to delivered impulse",
      ...(config.recovery?.enabled && (config.recovery.reefingStages?.length ?? 0) > 0
        ? [
            "Recovery reefing multiplies canopy drag area with the supplied piecewise-linear schedule; the schedule begins at recovery command time in this one-dimensional solver.",
          ]
        : []),
      ...(humidityActive
        ? [effectiveSurfaceObservation
            ? "Relative humidity is applied after the surface pressure and temperature anchor as a constant-altitude-profile ideal-mixture correction."
            : "Relative humidity is applied to the standard atmosphere as a constant-altitude-profile ideal-mixture correction."]
        : ["Dry-air density and speed of sound are used when no relative humidity is supplied."]),
      ...(effectiveSurfaceObservation
        ? ["Surface pressure and temperature preserve their offsets from standard conditions through the altitude profile; no live weather assimilation is performed."]
        : []),
      "Rigid vehicle with no attitude, stability, or structural dynamics",
    ],
  };
}
