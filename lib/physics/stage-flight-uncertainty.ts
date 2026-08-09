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
  simulateStageFlightPreview,
  type StageFlightPreviewInput,
} from "./stage-flight-preview.ts";

export const STAGE_FLIGHT_UNCERTAINTY_ADAPTER_VERSION =
  "kestrel-stage-flight-uncertainty-0.3.0";

export type StageFlightUncertaintyFactorKey =
  | "dryMassScale"
  | "propellantMassScale"
  | "thrustScale"
  | "dragCoefficientScale"
  | "recoveryAreaScale"
  | "recoveryDeploymentSuccess"
  | "windScale";

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
): MultiStageMotor {
  return {
    ...motor,
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
): RocketStageInstance {
  return {
    ...instance,
    structuralMassProperties: scaleMassProperties(
      instance.structuralMassProperties,
      dryMassScale,
    ),
    motors: instance.motors.map((motor) =>
      scaleMotor(motor, dryMassScale, propellantMassScale, thrustScale),
    ),
  };
}

function scaleStage(
  stage: RocketStage,
  dryMassScale: number,
  propellantMassScale: number,
  thrustScale: number,
): RocketStage {
  return {
    ...stage,
    structuralMassProperties: scaleMassProperties(
      stage.structuralMassProperties,
      dryMassScale,
    ),
    motors: stage.motors.map((motor) =>
      scaleMotor(motor, dryMassScale, propellantMassScale, thrustScale),
    ),
    ...(stage.instances
      ? {
          instances: stage.instances.map((instance) =>
            scaleStageInstance(
              instance,
              dryMassScale,
              propellantMassScale,
              thrustScale,
            ),
          ),
        }
      : {}),
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
  const recoveryAreaScale = positiveScale(
    values.recoveryAreaScale ?? 1,
    "recovery area scale",
  );
  const recoveryDeploymentSuccess = values.recoveryDeploymentSuccess ?? 1;
  if (recoveryDeploymentSuccess !== 0 && recoveryDeploymentSuccess !== 1) {
    throw new Error("recovery deployment success must be exactly 0 or 1");
  }
  const windScale = positiveScale(values.windScale ?? 1, "wind scale");
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
    retainedMassProperties: scaleMassProperties(
      base.retainedMassProperties,
      dryMassScale,
    ),
    stages: base.stages.map((stage) =>
      scaleStage(stage, dryMassScale, propellantMassScale, thrustScale),
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
    events: failureEvents.length > 0
      ? [...(base.events ?? []), ...failureEvents].sort((left, right) => left.timeS - right.timeS || left.id.localeCompare(right.id))
      : base.events,
    dragCoefficientScale,
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
