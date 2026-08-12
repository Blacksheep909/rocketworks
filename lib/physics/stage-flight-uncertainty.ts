import {
  runUncertaintyAnalysis,
  type ProbabilityDistribution,
  type ThresholdDefinition,
  type UncertaintyCorrelation,
  type UncertaintyAnalysisResult,
} from "./uncertainty-analysis.ts";
import type { LaunchEnvironmentProvider } from "./launch-environment.ts";
import { failRecoveryDevice } from "./recovery-system.ts";
import {
  addVectors,
  scaleMatrix,
  scaleVector,
  subtractVectors,
  magnitude,
  type Vector3,
} from "./linear-algebra.ts";
import type { MassProperties } from "./mass-properties.ts";
import type {
  MultiStageMotor,
  RocketStage,
  RocketStageInstance,
} from "./multi-stage.ts";
import {
  multiplyQuaternions,
  normalizeQuaternion,
  quaternionFromAxisAngle,
  rotateBodyToWorld,
  rotateWorldToBody,
  type ScheduledRigidBodyEvent,
  type StateTriggeredRigidBodyEvent,
} from "./six-dof.ts";
import { verticalLaunchOrientationBodyToEnu } from "./rocket-loads.ts";
import {
  simulateStageFlightPreview,
  type StageFlightPreviewInput,
} from "./stage-flight-preview.ts";

export const STAGE_FLIGHT_UNCERTAINTY_ADAPTER_VERSION =
  "kestrel-stage-flight-uncertainty-0.9.0";

/** Prefix used for independent thrust multipliers keyed by motor identifier. */
export const MOTOR_THRUST_SCALE_FACTOR_PREFIX = "motorThrustScale:";

export function motorThrustScaleFactorKey(
  motorId: string,
): `motorThrustScale:${string}` {
  const normalizedId = motorId.trim();
  if (!normalizedId) throw new Error("motor id must not be empty");
  return `${MOTOR_THRUST_SCALE_FACTOR_PREFIX}${normalizedId}` as `motorThrustScale:${string}`;
}

export type StageFlightUncertaintyFactorKey =
  | "dryMassScale"
  | "propellantMassScale"
  | "thrustScale"
  | "dragCoefficientScale"
  | "directForceCoefficientScale"
  | "directMomentCoefficientScale"
  | "coefficientUncertaintyScale"
  | "recoveryAreaScale"
  | "recoveryInflationTimeScale"
  | "recoveryDeploymentSuccess"
  | "windScale"
  | "ignitionDelayOffsetS"
  | "separationImpulseScale"
  | "alignmentOffsetRad"
  | `motorThrustScale:${string}`;

export type StageFlightUncertaintyFactor = {
  key: StageFlightUncertaintyFactorKey;
  label: string;
  distribution: ProbabilityDistribution;
};

export type StageFlightUncertaintyResult = UncertaintyAnalysisResult & {
  adapterVersion: string;
};

function positiveScale(value: number, key: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${key} must be positive and finite`);
  }
  return value;
}

function finiteOffset(value: number, key: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be finite`);
  }
  return value;
}

function scaleMassProperties(
  properties: MassProperties,
  scale: number,
): MassProperties {
  return {
    massKg: properties.massKg * scale,
    centerOfMassM: properties.centerOfMassM,
    inertiaAtCenterKgM2: scaleMatrix(properties.inertiaAtCenterKgM2, scale),
  };
}

function scaleMotor(
  motor: MultiStageMotor,
  dryMassScale: number,
  propellantMassScale: number,
  thrustScale: number,
  motorThrustScale: number,
  ignitionDelayOffsetS: number,
): MultiStageMotor {
  return {
    ...motor,
    ignitionDelayS: Math.max(0, (motor.ignitionDelayS ?? 0) + ignitionDelayOffsetS),
    dryMassProperties: scaleMassProperties(motor.dryMassProperties, dryMassScale),
    initialPropellantMassProperties: scaleMassProperties(
      motor.initialPropellantMassProperties,
      propellantMassScale,
    ),
    thrustCurve: motor.thrustCurve.map((point) => ({
      ...point,
      thrustN: point.thrustN * thrustScale * motorThrustScale,
    })),
  };
}

function collectMotorIds(stages: readonly RocketStage[]): Set<string> {
  const ids = new Set<string>();
  for (const stage of stages) {
    for (const motor of stage.motors) ids.add(motor.id);
    for (const instance of stage.instances ?? []) {
      for (const motor of instance.motors) ids.add(motor.id);
    }
  }
  return ids;
}

function resolveMotorThrustScales(
  stages: readonly RocketStage[],
  values: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const knownMotorIds = collectMotorIds(stages);
  const scales: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith(MOTOR_THRUST_SCALE_FACTOR_PREFIX)) continue;
    const motorId = key.slice(MOTOR_THRUST_SCALE_FACTOR_PREFIX.length);
    if (!motorId) {
      throw new Error(`${MOTOR_THRUST_SCALE_FACTOR_PREFIX} must include a motor id`);
    }
    if (!knownMotorIds.has(motorId)) {
      throw new Error(`Unknown motor thrust scale factor motor id: ${motorId}`);
    }
    scales[motorId] = positiveScale(value, `${key} scale`);
  }
  return scales;
}

function scaleStageInstance(
  instance: RocketStageInstance,
  dryMassScale: number,
  propellantMassScale: number,
  thrustScale: number,
  motorThrustScales: Readonly<Record<string, number>>,
  ignitionDelayOffsetS: number,
  separationImpulseScale: number,
): RocketStageInstance {
  return {
    ...instance,
    ...(instance.separationDeltaVBodyMps !== undefined
      ? {
          separationDeltaVBodyMps:
            instance.separationDeltaVBodyMps * separationImpulseScale,
        }
      : {}),
    ...(instance.separationImpulseBodyNs !== undefined
      ? {
          separationImpulseBodyNs: scaleVector(
            instance.separationImpulseBodyNs,
            separationImpulseScale,
          ),
        }
      : {}),
    structuralMassProperties: scaleMassProperties(
      instance.structuralMassProperties,
      dryMassScale,
    ),
    motors: instance.motors.map((motor) =>
      scaleMotor(
        motor,
        dryMassScale,
        propellantMassScale,
        thrustScale,
        motorThrustScales[motor.id] ?? 1,
        ignitionDelayOffsetS,
      ),
    ),
  };
}

function scaleStage(
  stage: RocketStage,
  dryMassScale: number,
  propellantMassScale: number,
  thrustScale: number,
  motorThrustScales: Readonly<Record<string, number>>,
  ignitionDelayOffsetS: number,
  separationImpulseScale: number,
): RocketStage {
  return {
    ...stage,
    ...(stage.separationDeltaVBodyMps !== undefined
      ? {
          separationDeltaVBodyMps:
            stage.separationDeltaVBodyMps * separationImpulseScale,
        }
      : {}),
    ...(stage.separationImpulseBodyNs !== undefined
      ? {
          separationImpulseBodyNs: scaleVector(
            stage.separationImpulseBodyNs,
            separationImpulseScale,
          ),
        }
      : {}),
    structuralMassProperties: scaleMassProperties(
      stage.structuralMassProperties,
      dryMassScale,
    ),
    motors: stage.motors.map((motor) =>
      scaleMotor(
        motor,
        dryMassScale,
        propellantMassScale,
        thrustScale,
        motorThrustScales[motor.id] ?? 1,
        ignitionDelayOffsetS,
      ),
    ),
    ...(stage.instances
      ? {
          instances: stage.instances.map((instance) =>
            scaleStageInstance(
              instance,
              dryMassScale,
              propellantMassScale,
              thrustScale,
              motorThrustScales,
              ignitionDelayOffsetS,
              separationImpulseScale,
            ),
          ),
        }
      : {}),
  };
}

function scaleEventSeparationImpulse<
  T extends ScheduledRigidBodyEvent | StateTriggeredRigidBodyEvent,
>(event: T, scale: number): T {
  const configuredDeltaV = event.separationDeltaVBodyMps;
  const configuredImpulse = event.separationImpulseBodyNs;
  if (scale === 1 || (!configuredDeltaV && !configuredImpulse)) return event;
  const scaledDeltaV = configuredDeltaV
    ? scaleVector(configuredDeltaV, scale)
    : undefined;
  const scaledImpulse = configuredImpulse
    ? scaleVector(configuredImpulse, scale)
    : undefined;
  const originalApply = event.apply;
  return {
    ...event,
    ...(scaledDeltaV ? { separationDeltaVBodyMps: scaledDeltaV } : {}),
    ...(scaledImpulse ? { separationImpulseBodyNs: scaledImpulse } : {}),
    ...(originalApply
      ? {
          apply: (state: Parameters<NonNullable<T["apply"]>>[0]) => {
            const after = originalApply(state);
            const originalDeltaVBodyMps = configuredDeltaV ?? rotateWorldToBody(
              state.orientationBodyToWorld,
              subtractVectors(after.velocityWorldMps, state.velocityWorldMps),
            );
            const correctionBodyMps = scaleVector(
              originalDeltaVBodyMps,
              scale - 1,
            );
            return {
              ...after,
              velocityWorldMps: addVectors(
                after.velocityWorldMps,
                rotateBodyToWorld(
                  after.orientationBodyToWorld,
                  correctionBodyMps,
                ),
              ),
            };
          },
        }
      : {}),
  } as T;
}

function offsetIgnitionTrigger(
  event: StateTriggeredRigidBodyEvent,
  offsetS: number,
): StateTriggeredRigidBodyEvent {
  if (offsetS === 0 || !event.id.includes("-ignition-after-")) return event;
  return {
    ...event,
    value: (state) => event.value(state) - offsetS,
    label: `${event.label} (sampled +${offsetS.toFixed(3)} s delay)`,
  };
}

function perturbInitialAlignment(
  base: StageFlightPreviewInput,
  offsetRad: number,
): StageFlightPreviewInput["initialState"] {
  if (offsetRad === 0) return base.initialState;
  const baseOrientation =
    base.initialState?.orientationBodyToWorld ?? verticalLaunchOrientationBodyToEnu();
  const bodyPitchOffset = quaternionFromAxisAngle(
    { x: 0, y: 1, z: 0 },
    offsetRad,
  );
  return {
    ...base.initialState,
    orientationBodyToWorld: normalizeQuaternion(
      multiplyQuaternions(baseOrientation, bodyPitchOffset),
    ),
  };
}

function scaleEnvironmentProvider(
  provider: LaunchEnvironmentProvider,
  windScale: number,
): LaunchEnvironmentProvider {
  if (windScale === 1) return provider;
  return (query) => {
    const state = provider(query);
    return {
      ...state,
      meanWindWorldMps: scaleVector(state.meanWindWorldMps, windScale),
      turbulenceWindWorldMps: scaleVector(
        state.turbulenceWindWorldMps,
        windScale,
      ),
      discreteGustWindWorldMps: scaleVector(
        state.discreteGustWindWorldMps,
        windScale,
      ),
      windWorldMps: scaleVector(state.windWorldMps, windScale),
    };
  };
}

/**
 * Creates a physically explicit variant of a coupled preview without
 * mutating the caller's topology, motor records, environment, or event list.
 * Dry and propellant mass scales apply to the corresponding structural and
 * motor mass properties; global and per-motor thrust scales are independent
 * inputs, allowing declared cluster imbalance to be sampled explicitly.
 */
export function createStageFlightVariant(
  base: StageFlightPreviewInput,
  values: Readonly<Record<string, number>>,
): StageFlightPreviewInput {
  const dryMassScale = positiveScale(values.dryMassScale ?? 1, "dry mass scale");
  const propellantMassScale = positiveScale(
    values.propellantMassScale ?? 1,
    "propellant mass scale",
  );
  const thrustScale = positiveScale(values.thrustScale ?? 1, "thrust scale");
  const dragCoefficientScale = positiveScale(
    values.dragCoefficientScale ?? 1,
    "drag coefficient scale",
  );
  const directForceCoefficientScale = positiveScale(
    values.directForceCoefficientScale ?? 1,
    "direct force coefficient scale",
  );
  const directMomentCoefficientScale = positiveScale(
    values.directMomentCoefficientScale ?? 1,
    "direct moment coefficient scale",
  );
  const coefficientUncertaintyScale = finiteOffset(
    values.coefficientUncertaintyScale ?? 0,
    "coefficient uncertainty scale",
  );
  const recoveryAreaScale = positiveScale(
    values.recoveryAreaScale ?? 1,
    "recovery area scale",
  );
  const recoveryInflationTimeScale = positiveScale(
    values.recoveryInflationTimeScale ?? 1,
    "recovery inflation time scale",
  );
  const recoveryDeploymentSuccess = values.recoveryDeploymentSuccess ?? 1;
  if (recoveryDeploymentSuccess !== 0 && recoveryDeploymentSuccess !== 1) {
    throw new Error("recovery deployment success must be exactly 0 or 1");
  }
  const windScale = positiveScale(values.windScale ?? 1, "wind scale");
  const ignitionDelayOffsetS = finiteOffset(
    values.ignitionDelayOffsetS ?? 0,
    "ignition delay offset",
  );
  const separationImpulseScale = positiveScale(
    values.separationImpulseScale ?? 1,
    "separation impulse scale",
  );
  const alignmentOffsetRad = finiteOffset(
    values.alignmentOffsetRad ?? 0,
    "alignment offset",
  );
  const motorThrustScales = resolveMotorThrustScales(base.stages, values);
  const hasMotorFactors = Object.keys(motorThrustScales).length > 0;
  const hasEventFactors =
    Object.prototype.hasOwnProperty.call(values, "ignitionDelayOffsetS") ||
    Object.prototype.hasOwnProperty.call(values, "separationImpulseScale") ||
    Object.prototype.hasOwnProperty.call(values, "alignmentOffsetRad");
  const hasCoefficientUncertaintyFactor = Object.prototype.hasOwnProperty.call(
    values,
    "coefficientUncertaintyScale",
  );
  const initialTimeS = 0;
  const failureEvents = recoveryDeploymentSuccess === 0
    ? (base.recoveryDevices ?? []).map((device) => ({
        id: `uncertainty-${device.id}-recovery-failure`,
        label: `${device.name} failed deployment scenario`,
        timeS: initialTimeS + Math.min(1e-6, base.durationS / 2),
        apply: (state: Parameters<typeof failRecoveryDevice>[0]) =>
          failRecoveryDevice(state, device.id),
      }))
    : [];
  return {
    ...base,
    initialState: perturbInitialAlignment(base, alignmentOffsetRad),
    retainedMassProperties: scaleMassProperties(
      base.retainedMassProperties,
      dryMassScale,
    ),
    stages: base.stages.map((stage) =>
      scaleStage(
        stage,
        dryMassScale,
        propellantMassScale,
        thrustScale,
        motorThrustScales,
        ignitionDelayOffsetS,
        separationImpulseScale,
      ),
    ),
    windProfile: base.windProfile?.map((layer) => ({
      ...layer,
      eastMps: layer.eastMps * windScale,
      northMps: layer.northMps * windScale,
      upMps: (layer.upMps ?? 0) * windScale,
    })),
    environmentAt: base.environmentAt
      ? scaleEnvironmentProvider(base.environmentAt, windScale)
      : undefined,
    recoveryDevices: base.recoveryDevices?.map((device) => ({
      ...device,
      referenceAreaM2: device.referenceAreaM2 * recoveryAreaScale,
      ...(device.inflationTimeS !== undefined
        ? { inflationTimeS: device.inflationTimeS * recoveryInflationTimeScale }
        : {}),
    })),
    events: [
      ...(base.events ?? []),
      ...failureEvents,
    ]
      .map((event) => scaleEventSeparationImpulse(event, separationImpulseScale))
      .sort((left, right) => left.timeS - right.timeS || left.id.localeCompare(right.id)),
    stateEvents: base.stateEvents
      ?.map((event) =>
        offsetIgnitionTrigger(
          scaleEventSeparationImpulse(event, separationImpulseScale),
          ignitionDelayOffsetS,
        ),
      ),
    dragCoefficientScale,
    directForceCoefficientScale,
    directMomentCoefficientScale,
    ...(hasCoefficientUncertaintyFactor
      ? { coefficientUncertaintyScale }
      : {}),
    ...(hasEventFactors || hasMotorFactors || hasCoefficientUncertaintyFactor
      ? {
          additionalWarnings: [
            ...(base.additionalWarnings ?? []),
            ...(hasMotorFactors
              ? [
                  "Per-motor thrust factors are deterministic multipliers on declared motor identifiers; no measured motor-to-motor covariance, gimbal, or thrust-vector misalignment is implied.",
                ]
              : []),
            ...(ignitionDelayOffsetS !== 0
              ? [
                  "Sampled ignition-delay uncertainty shifts motor-local delays and ignition-after-burnout triggers; no measured timing distribution is implied.",
                ]
              : []),
            ...(separationImpulseScale !== 1
              ? [
                  "Sampled separation-impulse uncertainty rescales configured measured impulse vectors and legacy event delta-v annotations; mechanism compliance, plume interaction, and contact remain outside the model.",
                ]
              : []),
            ...(recoveryInflationTimeScale !== 1
              ? [
                  "Sampled recovery inflation-time uncertainty rescales the prescribed canopy-area ramp; line dynamics, fabric response, and opening shock remain outside the model.",
                ]
              : []),
            ...(alignmentOffsetRad !== 0
              ? [
                  "Sampled launch-alignment uncertainty is a body-frame pitch perturbation; launch-rail tolerance may reject out-of-alignment scenarios.",
                ]
              : []),
            ...(hasCoefficientUncertaintyFactor
              ? [
                  "Sampled aerodynamic coefficient uncertainty applies one common signed sigma to declared absolute table cells; empirical per-coefficient covariance and time correlation are not modeled.",
                ]
              : []),
          ],
          additionalAssumptions: [
            ...(base.additionalAssumptions ?? []),
            ...(hasMotorFactors
              ? [
                  "Each motorThrustScale:<id> factor applies to every topology entry with that motor identifier; repeated physical copies with distinct IDs can vary independently, while duplicate IDs share one sampled factor.",
                ]
              : []),
            ...(hasEventFactors
              ? [
                  "Event uncertainty factors are deterministic scenario perturbations sampled from caller-supplied distributions, not measured distributions or certification evidence.",
                ]
              : []),
            ...(hasCoefficientUncertaintyFactor
              ? [
                  "The coefficient uncertainty factor is a caller-supplied signed sigma, not a measured distribution or certification evidence; samples that make positive-only coefficients non-physical fail explicitly.",
                ]
              : []),
            ...(recoveryInflationTimeScale !== 1
              ? [
                  "Recovery inflation-time samples are deterministic scenario perturbations around the configured effective-area approximation, not measured deployment distributions.",
                ]
              : []),
            "The nominal topology, event list, and caller-owned records are not mutated; staged event closures are wrapped only inside the sampled variant.",
          ],
        }
      : {}),
  };
}

function finalStateVector(result: ReturnType<typeof simulateStageFlightPreview>): {
  positionWorldM: Vector3;
  velocityWorldMps: Vector3;
} {
  const state = result.rail?.finalState ?? result.simulation?.finalState;
  return {
    positionWorldM: state?.positionWorldM ?? { x: 0, y: 0, z: 0 },
    velocityWorldMps: state?.velocityWorldMps ?? { x: 0, y: 0, z: 0 },
  };
}

/**
 * Propagates independent input distributions through the coupled staging,
 * aerodynamic, rail, and 6DOF adapter. Each sample keeps its complete result
 * error-visible through the shared uncertainty analysis contract.
 */
export function analyzeStageFlightUncertainty({
  baseInput,
  factors,
  seed,
  sampleCount,
  thresholds,
  correlations,
}: {
  baseInput: StageFlightPreviewInput;
  factors: StageFlightUncertaintyFactor[];
  seed: string;
  sampleCount: number;
  thresholds?: ThresholdDefinition[];
  correlations?: readonly UncertaintyCorrelation[];
}): StageFlightUncertaintyResult {
  return {
    adapterVersion: STAGE_FLIGHT_UNCERTAINTY_ADAPTER_VERSION,
    ...runUncertaintyAnalysis({
    seed,
    method: "latin-hypercube",
    sampleCount,
    parameters: factors,
    thresholds,
    correlations,
    evaluator: (values) => {
      const result = simulateStageFlightPreview(
        createStageFlightVariant(baseInput, values),
      );
      const final = finalStateVector(result);
      const recoveryMetrics = result.recoveryModelVersion
        ? {
            maxRecoveryDragN: Math.max(
              0,
              ...result.trace.map((point) => point.recoveryDragN),
            ),
            maxRecoveryEffectiveAreaM2: Math.max(
              0,
              ...result.trace.map((point) => point.recoveryEffectiveAreaM2),
            ),
          }
        : {};
      const outputs: Record<string, number | null> = {
        maxAltitudeAglM: result.maxAltitudeAglM,
        maxSpeedMps: result.maxSpeedMps,
        timeToApogeeS: result.timeToApogeeS,
        maxDynamicPressurePa: Math.max(
          0,
          ...result.trace.map((point) => point.dynamicPressurePa),
        ),
        finalPositionM: magnitude(final.positionWorldM),
        finalSpeedMps: magnitude(final.velocityWorldMps),
        eventCount: result.events.length,
        separatedBodyCount: result.separatedBodies.length,
        converged: result.convergence.status === "converged" ? 1 : 0,
      };
      Object.assign(outputs, recoveryMetrics);
      return outputs;
    },
    }),
  };
}
