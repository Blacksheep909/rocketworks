import { standardAtmosphere } from "./atmosphere.ts";
import {
  interpolateWind,
  validateWindProfile,
  type WindLayer,
} from "./curves.ts";
import type { LaunchEnvironmentProvider } from "./launch-environment.ts";
import {
  ZERO_VECTOR,
  addVectors,
  cross,
  magnitude,
  scaleVector,
  subtractVectors,
  type Vector3,
} from "./linear-algebra.ts";
import {
  rotateWorldToBody,
  type RigidBodyLoads,
  type RigidBodyState,
  type ScheduledRigidBodyEvent,
  type StateEventDirection,
  type StateTriggeredRigidBodyEvent,
} from "./six-dof.ts";
import {
  evaluateRecoveryReefing,
  validateRecoveryReefingStages,
  type RecoveryReefingStage,
} from "./recovery-reefing.ts";

export const RECOVERY_SYSTEM_MODEL_VERSION =
  "kestrel-recovery-loads-0.2.0";

export type RecoveryDevice = Readonly<{
  id: string;
  name: string;
  dragCoefficient: number;
  referenceAreaM2: number;
  deploymentDelayS?: number;
  inflationTimeS?: number;
  reefingStages?: readonly RecoveryReefingStage[];
  applicationPointBodyM?: Vector3;
  maximumModelMach?: number;
}>;

export type RecoveryDevicePhase =
  | "stowed"
  | "failed"
  | "delayed"
  | "inflating"
  | "reefing"
  | "inflated";

export type RecoveryApplicabilityIssue = Readonly<{
  deviceId: string;
  code:
    | "INFLATION_APPROXIMATION"
    | "REEFING_APPROXIMATION"
    | "MACH_LIMIT_EXCEEDED"
    | "CANOPY_INTERACTION_OMITTED";
  severity: "info" | "caution" | "unsupported";
  explanation: string;
}>;

export type RecoveryDeviceEvaluation = Readonly<{
  id: string;
  name: string;
  phase: RecoveryDevicePhase;
  commandTimeS: number | null;
  inflationStartTimeS: number | null;
  inflationFraction: number;
  reefingFraction: number;
  reefingStageIndex: number | null;
  effectiveAreaM2: number;
  dragN: number;
  forceWorldN: Vector3;
  momentBodyNm: Vector3;
}>;

export type RecoverySystemEvaluation = Readonly<{
  loads: RigidBodyLoads;
  altitudeAglM: number;
  altitudeAslM: number;
  densityKgM3: number;
  environmentModelVersion: string | null;
  windWorldMps: Vector3;
  meanWindWorldMps: Vector3;
  turbulenceWindWorldMps: Vector3;
  discreteGustWindWorldMps: Vector3;
  activeGustIds: readonly string[];
  airRelativeVelocityWorldMps: Vector3;
  airspeedMps: number;
  mach: number;
  devices: readonly RecoveryDeviceEvaluation[];
  applicability: readonly RecoveryApplicabilityIssue[];
}>;

export type RecoverySystemModel = Readonly<{
  modelVersion: string;
  validationStatus: "analytical-component-checks-only";
  evaluate: (state: RigidBodyState) => RecoverySystemEvaluation;
  loads: (state: RigidBodyState) => RigidBodyLoads;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

function validateDeviceId(deviceId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(deviceId)) {
    throw new Error(
      "recovery device identifiers may contain only letters, numbers, underscores, and hyphens",
    );
  }
}

function finiteVector(value: Vector3): boolean {
  return [value.x, value.y, value.z].every(Number.isFinite);
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

export function recoveryCommandTimeKey(deviceId: string): string {
  validateDeviceId(deviceId);
  return `recovery.${deviceId}.commandTimeS`;
}

export function recoveryFailureKey(deviceId: string): string {
  validateDeviceId(deviceId);
  return `recovery.${deviceId}.failed`;
}

export function commandRecoveryDevice(
  state: RigidBodyState,
  deviceId: string,
): RigidBodyState {
  return {
    ...state,
    discreteState: {
      ...(state.discreteState ?? {}),
      [recoveryCommandTimeKey(deviceId)]: state.timeS,
    },
  };
}

export function failRecoveryDevice(
  state: RigidBodyState,
  deviceId: string,
): RigidBodyState {
  return {
    ...state,
    discreteState: {
      ...(state.discreteState ?? {}),
      [recoveryFailureKey(deviceId)]: true,
    },
  };
}

export function createApogeeRecoveryDeploymentEvent(input: Readonly<{
  deviceId: string;
  label?: string;
}>): StateTriggeredRigidBodyEvent {
  validateDeviceId(input.deviceId);
  return {
    id: `recovery-${input.deviceId}-apogee-command`,
    label: input.label ?? `${input.deviceId} recovery command at apogee`,
    direction: "falling",
    value: (state) => state.velocityWorldMps.z,
    apply: (state) => commandRecoveryDevice(state, input.deviceId),
  };
}

export function createAltitudeRecoveryDeploymentEvent(input: Readonly<{
  deviceId: string;
  altitudeAglM: number;
  direction?: Extract<StateEventDirection, "rising" | "falling">;
  label?: string;
}>): StateTriggeredRigidBodyEvent {
  validateDeviceId(input.deviceId);
  if (!Number.isFinite(input.altitudeAglM)) {
    throw new Error("recovery deployment altitude must be finite");
  }
  return {
    id: `recovery-${input.deviceId}-altitude-command`,
    label:
      input.label ??
      `${input.deviceId} recovery command at ${input.altitudeAglM} m AGL`,
    direction: input.direction ?? "falling",
    value: (state) => state.positionWorldM.z - input.altitudeAglM,
    apply: (state) => commandRecoveryDevice(state, input.deviceId),
  };
}

export function createScheduledRecoveryDeploymentEvent(input: Readonly<{
  deviceId: string;
  timeS: number;
  label?: string;
}>): ScheduledRigidBodyEvent {
  validateDeviceId(input.deviceId);
  return {
    id: `recovery-${input.deviceId}-scheduled-command`,
    label: input.label ?? `${input.deviceId} scheduled recovery command`,
    timeS: input.timeS,
    apply: (state) => commandRecoveryDevice(state, input.deviceId),
  };
}

export function createScheduledRecoveryFailureEvent(input: Readonly<{
  deviceId: string;
  timeS: number;
  label?: string;
}>): ScheduledRigidBodyEvent {
  validateDeviceId(input.deviceId);
  return {
    id: `recovery-${input.deviceId}-failure`,
    label: input.label ?? `${input.deviceId} recovery failure`,
    timeS: input.timeS,
    apply: (state) => failRecoveryDevice(state, input.deviceId),
  };
}

export function createRecoverySystemModel(input: Readonly<{
  devices: readonly RecoveryDevice[];
  launchAltitudeM?: number;
  windProfile?: readonly WindLayer[];
  environmentAt?: LaunchEnvironmentProvider;
  centerOfMassBodyM?: (state: RigidBodyState) => Vector3;
}>): RecoverySystemModel {
  if (
    input.environmentAt &&
    (input.launchAltitudeM !== undefined || input.windProfile !== undefined)
  ) {
    throw new Error(
      "launch environment provider cannot be combined with launch altitude or wind profile",
    );
  }
  const launchAltitudeM = input.launchAltitudeM ?? 0;
  if (!Number.isFinite(launchAltitudeM)) {
    throw new Error("recovery launch altitude must be finite");
  }
  const windProfile = [...(input.windProfile ?? [])];
  validateWindProfile(windProfile);
  const devices = input.devices.map((device) => {
    validateDeviceId(device.id);
    if (!device.name.trim()) throw new Error("recovery devices must have names");
    assertPositive(device.dragCoefficient, `device ${device.id} drag coefficient`);
    assertPositive(device.referenceAreaM2, `device ${device.id} reference area`);
    assertNonNegative(
      device.deploymentDelayS ?? 0,
      `device ${device.id} deployment delay`,
    );
    assertNonNegative(
      device.inflationTimeS ?? 0,
      `device ${device.id} inflation time`,
    );
    const reefingStages = validateRecoveryReefingStages(
      device.reefingStages,
      `device ${device.id} reefing stages`,
    );
    if (
      device.applicationPointBodyM &&
      !finiteVector(device.applicationPointBodyM)
    ) {
      throw new Error(`device ${device.id} application point must be finite`);
    }
    if (device.maximumModelMach !== undefined) {
      assertPositive(device.maximumModelMach, `device ${device.id} maximum Mach`);
    }
    return { ...device, reefingStages };
  });
  if (new Set(devices.map((device) => device.id)).size !== devices.length) {
    throw new Error("recovery device identifiers must be unique");
  }

  const evaluate = (state: RigidBodyState): RecoverySystemEvaluation => {
    const providedEnvironment = input.environmentAt?.(state);
    const altitudeAglM =
      providedEnvironment?.altitudeAglM ?? state.positionWorldM.z;
    const altitudeAslM =
      providedEnvironment?.altitudeAslM ?? launchAltitudeM + altitudeAglM;
    const atmosphere =
      providedEnvironment?.atmosphere ?? standardAtmosphere(altitudeAslM);
    const wind = providedEnvironment
      ? null
      : interpolateWind(windProfile, altitudeAglM);
    const windWorldMps: Vector3 = providedEnvironment?.windWorldMps ?? {
      x: wind!.eastMps,
      y: wind!.northMps,
      z: wind!.upMps,
    };
    const meanWindWorldMps =
      providedEnvironment?.meanWindWorldMps ?? windWorldMps;
    const turbulenceWindWorldMps =
      providedEnvironment?.turbulenceWindWorldMps ?? ZERO_VECTOR;
    const discreteGustWindWorldMps =
      providedEnvironment?.discreteGustWindWorldMps ?? ZERO_VECTOR;
    const airRelativeVelocityWorldMps = subtractVectors(
      state.velocityWorldMps,
      windWorldMps,
    );
    const airspeedMps = magnitude(airRelativeVelocityWorldMps);
    const mach = airspeedMps / atmosphere.speedOfSoundMps;
    const dynamicPressurePa =
      0.5 * atmosphere.densityKgM3 * airspeedMps * airspeedMps;
    const centerOfMassBodyM = input.centerOfMassBodyM?.(state) ?? ZERO_VECTOR;
    if (!finiteVector(centerOfMassBodyM)) {
      throw new Error("recovery center-of-mass provider must return a finite vector");
    }
    const applicability: RecoveryApplicabilityIssue[] = [];
    const deviceEvaluations = devices.map(
      (device): RecoveryDeviceEvaluation => {
        const commandValue =
          state.discreteState?.[recoveryCommandTimeKey(device.id)];
        if (commandValue !== undefined && typeof commandValue !== "number") {
          throw new Error(
            `device ${device.id} recovery command time must be a finite number`,
          );
        }
        const commandTimeS =
          typeof commandValue === "number" ? commandValue : null;
        const failureValue =
          state.discreteState?.[recoveryFailureKey(device.id)];
        if (failureValue !== undefined && typeof failureValue !== "boolean") {
          throw new Error(
            `device ${device.id} recovery failure state must be boolean`,
          );
        }
        const failed = failureValue === true;
        const deploymentDelayS = device.deploymentDelayS ?? 0;
        const inflationTimeS = device.inflationTimeS ?? 0;
        const inflationStartTimeS =
          commandTimeS === null ? null : commandTimeS + deploymentDelayS;
        let phase: RecoveryDevicePhase = "stowed";
        let inflationFraction = 0;
        let reefingFraction = 1;
        let reefingStageIndex: number | null = null;
        if (failed) {
          phase = "failed";
        } else if (commandTimeS !== null && state.timeS < inflationStartTimeS!) {
          phase = "delayed";
        } else if (inflationStartTimeS !== null) {
          if (inflationTimeS === 0 || state.timeS >= inflationStartTimeS + inflationTimeS) {
            inflationFraction = 1;
            const reefing = evaluateRecoveryReefing(
              device.reefingStages,
              state.timeS - inflationStartTimeS,
            );
            reefingFraction = reefing.areaFraction;
            reefingStageIndex = reefing.stageIndex;
            phase = reefingFraction < 1 ? "reefing" : "inflated";
          } else {
            phase = "inflating";
            const linearFraction = Math.max(
              0,
              Math.min(1, (state.timeS - inflationStartTimeS) / inflationTimeS),
            );
            inflationFraction =
              linearFraction * linearFraction * (3 - 2 * linearFraction);
          }
        }
        const effectiveAreaM2 =
          device.referenceAreaM2 * inflationFraction * reefingFraction;
        const dragN =
          dynamicPressurePa * device.dragCoefficient * effectiveAreaM2;
        const forceWorldN =
          airspeedMps > 1e-12 && dragN > 0
            ? scaleVector(
                airRelativeVelocityWorldMps,
                -dragN / airspeedMps,
              )
            : ZERO_VECTOR;
        const forceBodyN = rotateWorldToBody(
          state.orientationBodyToWorld,
          forceWorldN,
        );
        const momentBodyNm = cross(
          subtractVectors(
            device.applicationPointBodyM ?? centerOfMassBodyM,
            centerOfMassBodyM,
          ),
          forceBodyN,
        );
        if (phase === "inflating") {
          applicability.push({
            deviceId: device.id,
            code: "INFLATION_APPROXIMATION",
            severity: "caution",
            explanation:
              "Canopy area follows a smooth prescribed ramp rather than coupled fabric and line dynamics.",
          });
        }
        if (phase === "reefing") {
          applicability.push({
            deviceId: device.id,
            code: "REEFING_APPROXIMATION",
            severity: "caution",
            explanation:
              "Effective canopy area follows the configured piecewise-linear reefing schedule; line, fabric, and opening-shock dynamics are not modeled.",
          });
        }
        if (
          inflationFraction > 0 &&
          device.maximumModelMach !== undefined &&
          mach > device.maximumModelMach
        ) {
          applicability.push({
            deviceId: device.id,
            code: "MACH_LIMIT_EXCEEDED",
            severity: "unsupported",
            explanation:
              "Recovery drag is being extrapolated above the configured Mach applicability limit.",
          });
        }
        return {
          id: device.id,
          name: device.name,
          phase,
          commandTimeS,
          inflationStartTimeS,
          inflationFraction,
          reefingFraction,
          reefingStageIndex,
          effectiveAreaM2,
          dragN,
          forceWorldN,
          momentBodyNm,
        };
      },
    );
    const activeDevices = deviceEvaluations.filter(
      (device) => device.inflationFraction > 0,
    );
    if (activeDevices.length > 1) {
      activeDevices.forEach((device) =>
        applicability.push({
          deviceId: device.id,
          code: "CANOPY_INTERACTION_OMITTED",
          severity: "caution",
          explanation:
            "Multiple canopy forces are summed without aerodynamic or line interaction.",
        }),
      );
    }
    const forceWorldN = deviceEvaluations.reduce(
      (sum, device) => addVectors(sum, device.forceWorldN),
      ZERO_VECTOR,
    );
    const momentBodyNm = deviceEvaluations.reduce(
      (sum, device) => addVectors(sum, device.momentBodyNm),
      ZERO_VECTOR,
    );
    return {
      loads: { forceWorldN, momentBodyNm },
      altitudeAglM,
      altitudeAslM,
      densityKgM3: atmosphere.densityKgM3,
      environmentModelVersion:
        providedEnvironment?.modelVersion ?? null,
      windWorldMps,
      meanWindWorldMps,
      turbulenceWindWorldMps,
      discreteGustWindWorldMps,
      activeGustIds: [...(providedEnvironment?.activeGustIds ?? [])],
      airRelativeVelocityWorldMps,
      airspeedMps,
      mach,
      devices: deviceEvaluations,
      applicability,
    };
  };

  return {
    modelVersion: RECOVERY_SYSTEM_MODEL_VERSION,
    validationStatus: "analytical-component-checks-only",
    evaluate,
    loads: (state) => evaluate(state).loads,
    assumptions: [
      "World x/y/z are east/north/up in a non-rotating local tangent frame",
      ...(input.environmentAt
        ? [
            "Atmosphere, mean wind, turbulence, and discrete gusts come from the supplied launch-environment provider",
          ]
        : []),
      "Recovery drag opposes the complete wind-relative velocity vector",
      "User-supplied drag coefficient and reference area remain constant",
      "Canopy inflation uses a prescribed smoothstep effective-area ramp",
      "When configured, reefing uses a prescribed piecewise-linear effective-area schedule after inflation",
      "Recovery force acts at the configured fixed body point or at the center of mass by default",
    ],
    warnings: [
      "This recovery model has analytical component checks only and is not flight-safety validated.",
      "Opening shock, line stretch, canopy geometry, wake effects, pendulum motion, and fluid-structure interaction are not modeled.",
      "Reefing stages are an effective-area approximation; they do not model reefing line mechanics, fabric porosity, opening shock, or structural loads.",
      "Deployment events command a device; configured delay and inflation time are deterministic and have no uncertainty.",
      "Drag coefficients and areas must match the actual canopy, reference convention, packing, and flight regime.",
    ],
  };
}
