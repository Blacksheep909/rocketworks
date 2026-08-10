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
  type ScheduledRigidBodyEvent,
  type StateTriggeredRigidBodyEvent,
} from "./six-dof.ts";
import { verticalLaunchOrientationBodyToEnu } from "./rocket-loads.ts";
import {
  simulateStageFlightPreview,
  type StageFlightPreviewInput,
} from "./stage-flight-preview.ts";

export const STAGE_FLIGHT_UNCERTAINTY_ADAPTER_VERSION =
  "kestrel-stage-flight-uncertainty-0.5.0";

export type StageFlightUncertaintyFactorKey =
  | "dryMassScale"
  | "propellantMassScale"
  | "thrustScale"
  | "dragCoefficientScale"
  | "directForceCoefficientScale"
  | "directMomentCoefficientScale"
  | "recoveryAreaScale"
  | "recoveryDeploymentSuccess"
  | "windScale"
  | "ignitionDelayOffsetS"
  | "separationImpulseScale"
  | "alignmentOffsetRad";

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
      thrustN: point.thrustN * thrustScale,
    })),
  };
}

function scaleStageInstance(
  instance: RocketStageInstance,
  dryMassScale: number,
  propellantMassScale: number,
  thrustScale: number,
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
  if (scale === 1 || !configuredDeltaV) return event;
  const scaledDeltaV = scaleVector(configuredDeltaV, scale);
  const correctionBodyMps = scaleVector(
    configuredDeltaV,
    scale - 1,
  );
  const originalApply = event.apply;
  return {
    ...event,
    separationDeltaVBodyMps: scaledDeltaV,
    ...(originalApply
      ? {
          apply: (state: Parameters<NonNullable<T["apply"]>>[0]) => {
            const after = originalApply(state);
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
 * motor mass properties; thrust and drag scales are independent inputs.
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
  const recoveryAreaScale = positiveScale(
    values.recoveryAreaScale ?? 1,
    "recovery area scale",
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
  const hasEventFactors =
    Object.prototype.hasOwnProperty.call(values, "ignitionDelayOffsetS") ||
    Object.prototype.hasOwnProperty.call(values, "separationImpulseScale") ||
    Object.prototype.hasOwnProperty.call(values, "alignmentOffsetRad");
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
    ...(hasEventFactors
      ? {
          additionalWarnings: [
            ...(base.additionalWarnings ?? []),
            ...(ignitionDelayOffsetS !== 0
              ? [
                  "Sampled ignition-delay uncertainty shifts motor-local delays and ignition-after-burnout triggers; no measured timing distribution is implied.",
                ]
              : []),
            ...(separationImpulseScale !== 1
              ? [
                  "Sampled separation-impulse uncertainty rescales annotated event velocity changes; mechanism compliance, plume interaction, and contact remain outside the model.",
                ]
              : []),
            ...(alignmentOffsetRad !== 0
              ? [
                  "Sampled launch-alignment uncertainty is a body-frame pitch perturbation; launch-rail tolerance may reject out-of-alignment scenarios.",
                ]
              : []),
          ],
          additionalAssumptions: [
            ...(base.additionalAssumptions ?? []),
            "Event uncertainty factors are deterministic scenario perturbations sampled from caller-supplied distributions, not measured distributions or certification evidence.",
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
