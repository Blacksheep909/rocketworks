"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { LandingFootprintChart } from "./landing-footprint-chart.tsx";
import { Rocket3DViewport } from "./rocket-3d-viewport.tsx";
import type { RocketPreviewComponentInstance } from "../lib/visualization/rocket-preview-3d.ts";
import {
  createEngineeringReportMarkdown,
  createFlightTraceCsv,
  createParameterSweepCsv,
  createStageFlightTraceCsv,
  createUncertaintyCsv,
  createKestrelProjectJson,
  parseKestrelProjectJson,
  createRocketOpenScad,
  createRocketProfileDxf,
  type JsonValue,
  type RocketCadGeometry,
} from "../lib/export/project-exports.ts";
import {
  analyzeRecoveryLandingDispersion,
  ASCENT_DRIFT_MODEL_VERSION,
  createAerodynamicCoefficientTable,
  computeStaticStability,
  analyzeVerticalFlightUncertainty,
  analyzeStageFlightUncertainty,
  createApogeeRecoveryDeploymentEvent,
  createLaunchEnvironmentModel,
  addCompactPackageInertia,
  launchRailDirectionFromAngles,
  launchRailOrientationFromAngles,
  verticalLaunchOrientationBodyToEnu,
  createMotorDataRecord,
  createMultiStageVehicleModel,
  failStageIgnition,
  stageFlightPreviewInitialState,
  exportMotorRaspEng,
  exportMotorThrustCsv,
  importMotorRaspEng,
  importMotorThrustCsv,
  parseMotorMassFlowCsv,
  combineMassProperties,
  determinant,
  transformMassProperties,
  createVehicleAssemblyModel,
  simulateStageFlightPreview,
  makeConstantThrustCurve,
  optimizeVerticalFlightDesign,
  sweepVerticalFlight,
  simulateRecoveryDescent,
  validateRecoveryReefingStages,
  estimateAscentWindDrift,
  standardAtmosphere,
  simulateVerticalFlight,
  compareFlightDataToTrace,
  compareFlightDataToStageTrace,
  createFlightDataComparisonCsv,
  parseFlightDataCsv,
  runPhysicsBenchmarkSuite,
  computeStructuralScreen,
  estimateRecoveryOpeningLoad,
  estimateSphericalEnvelopeRadiusM,
  resolveStageAerodynamicTable,
  type DesignOptimizationResult,
  type AerodynamicCoefficientTableDefinition,
  type AerodynamicCoefficientTableModel,
  type CoefficientSurface,
  type LandingDispersionResult,
  type LandingAscentDriftSummary,
  type UncertaintyAnalysisResult,
  type VerticalFlightConfig,
  type VerticalFlightResult,
  type FlightDataComparisonResult,
  type FlightDataSeries,
  type FlightDataTraceSource,
  type PhysicsBenchmarkSuiteResult,
  type VehicleComponent,
  type MotorDataRecord,
  type StageFlightPreviewResult,
  type StageFlightUncertaintyResult,
  type VerticalFlightSweepParameterKey,
  type VerticalFlightSweepResult,
  type RocketStage,
  type StageAerodynamicRegime,
  type LaunchEnvironmentProvider,
  type VehicleAssemblyEvaluation,
  type StateTriggeredRigidBodyEvent,
  type ScheduledRigidBodyEvent,
  type RocketStageInstance,
  type StructuralMaterialModel,
  type StructuralScreenResult,
  type SeparationDynamicsResult,
  type CoupledSeparationImpulseResult,
  type RecoveryReefingStage,
} from "../lib/physics/index.ts";
import {
  createPreviewWindProfile,
  PREVIEW_WIND_PROFILE_MODEL_VERSION,
} from "../lib/physics/preview-wind-profile.ts";
import {
  DEFAULT_UNCERTAINTY_SAMPLE_COUNT,
  DEFAULT_UNCERTAINTY_SEED,
  LOCAL_PROJECT_HISTORY_STORAGE_KEY,
  LOCAL_PROJECT_STORAGE_KEY,
  appendProjectHistory,
  createEmptyProjectHistory,
  createLocalProjectSnapshot,
  describeProjectInputChanges,
  parseLocalProjectHistory,
  parseLocalProjectSnapshot,
  projectInputFingerprint,
  serializeLocalProjectHistory,
  serializeLocalProjectSnapshot,
  type EditableProjectInputs,
  type LocalProjectHistory,
  type LocalProjectSnapshot,
  type NoseProfile,
  type ProjectUncertaintyCorrelation,
} from "../lib/project/project-state.ts";
import {
  EXPERIENCE_MODE_STORAGE_KEY,
  PROJECT_TEMPLATES,
  type ExperienceMode,
  type ProjectTemplate,
} from "../lib/project/templates.ts";
import {
  LOCAL_MOTOR_LIBRARY_STORAGE_KEY,
  parseLocalMotorLibrary,
  serializeLocalMotorLibrary,
  upsertLocalMotorRecord,
} from "../lib/project/motor-library-state.ts";
import {
  LOCAL_VEHICLE_TOPOLOGY_STORAGE_KEY,
  createDefaultVehicleTopology,
  createStagePlan,
  parseVehicleTopology,
  serializeVehicleTopology,
  stageThrustAxisBody,
  type LocalVehicleTopology,
  type VehicleStageAttachment,
  type VehicleStagePlan,
  type VehicleStageRole,
} from "../lib/project/vehicle-topology.ts";
import {
  LOCAL_AERODYNAMIC_LIBRARY_STORAGE_KEY,
  LOCAL_AERODYNAMIC_SELECTION_STORAGE_KEY,
  parseLocalAerodynamicLibrary,
  serializeLocalAerodynamicLibrary,
  upsertLocalAerodynamicTable,
} from "../lib/project/aero-library-state.ts";
import {
  decodeProjectShare,
  encodeProjectShare,
  PROJECT_SHARE_HASH_PREFIX,
} from "../lib/project/project-share.ts";
import {
  createSimulationFingerprint,
  isSimulationFingerprintCurrent,
  SIMULATION_FRESHNESS_MODEL_VERSION,
} from "../lib/project/simulation-freshness.ts";

type ComponentKey = "nose" | "body" | "fins" | "mount" | "recovery";
type ViewKey = "design" | "flight";
type DesignViewKey = "2d" | "3d";
type MaterialKey = "kraft" | "fiberglass" | "carbon";
type ExportFormat = "project" | "flight-csv" | "stage-flight-csv" | "sweep-csv" | "uncertainty-csv" | "report" | "dxf" | "openscad";
type OptimizationPreview = Readonly<{
  result: DesignOptimizationResult;
  baseThrustN: number;
  baseRecoveryDiameterM: number;
  mode: "nominal" | "robust";
}>;

type CommandAction = Readonly<{
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  run: () => void;
}>;

type SweepParameterDefinition = Readonly<{
  key: VerticalFlightSweepParameterKey;
  label: string;
  unit: string;
  minimum: number;
  maximum: number;
  step: number;
  precision: number;
}>;

const SWEEP_PARAMETER_DEFINITIONS: readonly SweepParameterDefinition[] = [
  {
    key: "thrustScale",
    label: "Delivered thrust",
    unit: "×",
    minimum: 0.75,
    maximum: 1.3,
    step: 0.01,
    precision: 2,
  },
  {
    key: "dryMassScale",
    label: "Dry mass",
    unit: "×",
    minimum: 0.9,
    maximum: 1.1,
    step: 0.01,
    precision: 2,
  },
  {
    key: "dragCoefficientScale",
    label: "Drag coefficient",
    unit: "×",
    minimum: 0.8,
    maximum: 1.2,
    step: 0.01,
    precision: 2,
  },
  {
    key: "windScale",
    label: "Wind profile",
    unit: "×",
    minimum: 0,
    maximum: 2,
    step: 0.01,
    precision: 2,
  },
  {
    key: "recoveryDelayS",
    label: "Recovery delay",
    unit: "s",
    minimum: 0,
    maximum: 5,
    step: 0.1,
    precision: 1,
  },
];

const DEFAULT_SWEEP_STEPS = 9;
const BROWSER_RECOVERY_DRAG_COEFFICIENT = 0.75;
const BROWSER_RECOVERY_INFLATION_TIME_S = 1.2;

type UncertaintyCorrelationDefinition = Readonly<{
  key: string;
  label: string;
  scope: string;
}>;

const UNCERTAINTY_CORRELATION_DEFINITIONS: readonly UncertaintyCorrelationDefinition[] = [
  { key: "dryMassScale", label: "Dry mass", scope: "vertical + coupled" },
  { key: "propellantMassScale", label: "Propellant mass", scope: "coupled" },
  { key: "dragCoefficientScale", label: "Drag coefficient", scope: "vertical + coupled" },
  { key: "directForceCoefficientScale", label: "Direct force coefficients", scope: "coupled" },
  { key: "directMomentCoefficientScale", label: "Direct moment coefficients", scope: "coupled" },
  { key: "thrustScale", label: "Delivered thrust", scope: "vertical + coupled" },
  { key: "windScale", label: "Wind profile", scope: "vertical + coupled + landing" },
  { key: "ignitionDelayOffsetS", label: "Ignition delay", scope: "coupled" },
  { key: "separationImpulseScale", label: "Separation impulse", scope: "coupled" },
  { key: "alignmentOffsetRad", label: "Launch alignment", scope: "coupled" },
  { key: "recoveryDragAreaScale", label: "Vertical recovery area", scope: "vertical" },
  { key: "recoveryAreaScale", label: "Coupled recovery area", scope: "coupled + landing" },
  { key: "recoveryDeploymentSuccess", label: "Recovery deployment", scope: "vertical + coupled + landing" },
  { key: "recoveryDelayS", label: "Vertical recovery delay", scope: "vertical" },
  { key: "launchAltitudeOffsetM", label: "Launch altitude offset", scope: "vertical" },
  { key: "windDirectionOffsetRad", label: "Wind direction offset", scope: "landing" },
  { key: "turbulenceScale", label: "Turbulence intensity", scope: "landing" },
  { key: "descentMassScale", label: "Descent mass", scope: "landing" },
  { key: "deploymentDelayOffsetS", label: "Deployment delay offset", scope: "landing" },
];

function filterUncertaintyCorrelations(
  correlations: readonly ProjectUncertaintyCorrelation[],
  parameterKeys: readonly string[],
): ProjectUncertaintyCorrelation[] {
  const allowed = new Set(parameterKeys);
  return correlations.filter(
    (correlation) => allowed.has(correlation.firstParameterKey) && allowed.has(correlation.secondParameterKey),
  );
}

function sweepParameterDefinition(
  key: VerticalFlightSweepParameterKey,
): SweepParameterDefinition {
  const definition = SWEEP_PARAMETER_DEFINITIONS.find((item) => item.key === key);
  if (!definition) throw new Error(`Unknown sweep parameter: ${key}`);
  return definition;
}

type MotorImportDraft = {
  id: string;
  manufacturer: string;
  designation: string;
  description: string;
  diameterMm: string;
  lengthMm: string;
  launchMassKg: string;
  dryMassKg: string;
  sourceName: string;
  dataVersion: string;
  licenseIdentifier: string;
  attribution: string;
  sourceUrl: string;
  csv: string;
  massFlowCsv: string;
};

const defaultMotorImportDraft: MotorImportDraft = {
  id: "user.motor-01",
  manufacturer: "User supplied",
  designation: "Test curve 01",
  description: "User-supplied thrust curve imported into RocketWorks.",
  diameterMm: "29",
  lengthMm: "95",
  launchMassKg: "0.16",
  dryMassKg: "0.10",
  sourceName: "User test or published data",
  dataVersion: "1",
  licenseIdentifier: "User supplied",
  attribution: "Provided by the project owner",
  sourceUrl: "",
  csv: "time_s,thrust_n\n0,0\n0.10,18\n0.80,18\n1.00,0",
  massFlowCsv: "",
};

type AerodynamicTableImportDraft = {
  json: string;
};

const defaultAerodynamicTableImportDraft: AerodynamicTableImportDraft = {
  json: JSON.stringify(
    {
      id: "user-aero-table-01",
      name: "Example Mach-Reynolds surface",
      machPoints: [0, 0.6, 1.2, 2],
      reynoldsPoints: [100000, 1000000, 10000000],
      dragCoefficient: {
        values: [
          [0.48, 0.5, 0.58, 0.7],
          [0.44, 0.46, 0.54, 0.66],
          [0.4, 0.42, 0.5, 0.62],
        ],
        absoluteUncertainty: [
          [0.04, 0.04, 0.05, 0.06],
          [0.03, 0.03, 0.04, 0.05],
          [0.03, 0.03, 0.04, 0.05],
        ],
      },
      normalForceSlopePerRad: {
        values: [
          [4.2, 4.1, 3.9, 3.6],
          [4.4, 4.3, 4.1, 3.8],
          [4.6, 4.5, 4.3, 4.0],
        ],
      },
      centerOfPressureXM: {
        values: [
          [0.56, 0.57, 0.58, 0.6],
          [0.55, 0.56, 0.57, 0.59],
          [0.54, 0.55, 0.56, 0.58],
        ],
      },
      outOfRangePolicy: "clamp-with-warning",
      provenance: {
        sourceName: "RocketWorks example surface",
        sourceKind: "user-supplied",
        dataVersion: "example-1",
        licenseIdentifier: "CC0-1.0",
        attribution: "Original RocketWorks example data; replace before engineering use",
        validationStatus: "user-supplied-unvalidated",
      },
    },
    null,
    2,
  ),
};

function downloadTextArtifact(
  filename: string,
  mediaType: string,
  content: string,
) {
  const url = URL.createObjectURL(new Blob([content], { type: mediaType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function nextLocalSaveTime(lastTimestamp?: string): string {
  return new Date(
    Math.max(Date.now(), lastTimestamp ? Date.parse(lastTimestamp) : 0),
  ).toISOString();
}

const components: Array<{
  id: ComponentKey;
  name: string;
  detail: string;
  marker: string;
}> = [
  { id: "nose", name: "Nose cone", detail: "Ogive · 180 mm", marker: "01" },
  { id: "body", name: "Airframe", detail: "54 × 710 mm", marker: "02" },
  { id: "fins", name: "Fin set", detail: "3 trapezoidal", marker: "03" },
  { id: "mount", name: "Motor mount", detail: "29 mm", marker: "04" },
  { id: "recovery", name: "Recovery", detail: "450 mm chute", marker: "05" },
];

const materialModels: Record<
  MaterialKey,
  StructuralMaterialModel & Readonly<{ densityKgM3: number; wallThicknessM: number }>
> = {
  kraft: {
    label: "Kraft phenolic",
    densityKgM3: 850,
    wallThicknessM: 0.0012,
    youngsModulusPa: 3.0e9,
    poissonRatio: 0.30,
    allowableCompressionPa: 20e6,
    allowableBendingPa: 20e6,
    allowableShearPa: 8e6,
  },
  fiberglass: {
    label: "Fiberglass",
    densityKgM3: 1850,
    wallThicknessM: 0.001,
    youngsModulusPa: 20e9,
    poissonRatio: 0.30,
    allowableCompressionPa: 80e6,
    allowableBendingPa: 80e6,
    allowableShearPa: 35e6,
  },
  carbon: {
    label: "Carbon composite",
    densityKgM3: 1550,
    wallThicknessM: 0.0008,
    youngsModulusPa: 45e9,
    poissonRatio: 0.27,
    allowableCompressionPa: 180e6,
    allowableBendingPa: 180e6,
    allowableShearPa: 70e6,
  },
};

function resolveStageMotorMassKg(
  stage: VehicleStagePlan,
  selectedMotorId: string,
  userMotorRecords: readonly MotorDataRecord[],
): number {
  const motorId = stage.motorId ?? selectedMotorId;
  return userMotorRecords.find((record) => record.id === motorId)?.launchMassKg ?? 0.16;
}

function createStageMotorMassMap(
  stages: readonly VehicleStagePlan[],
  selectedMotorId: string,
  userMotorRecords: readonly MotorDataRecord[],
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    stages.map((stage) => [
      stage.id,
      resolveStageMotorMassKg(stage, selectedMotorId, userMotorRecords),
    ]),
  );
}

function createPreviewEnvironment(
  launchAltitude: number,
  windSpeed: number,
  options: Readonly<{
    windAzimuthDeg?: number;
    seed?: string;
    windScale?: number;
    directionOffsetRad?: number;
    turbulenceScale?: number;
    relativeHumidityPercent?: number;
    surfacePressureHpa?: number;
    surfaceTemperatureC?: number;
  }> = {},
) {
  const turbulenceScale = options.turbulenceScale ?? 1;
  const siteAtmosphere = standardAtmosphere(launchAltitude);
  const relativeHumidityFraction = options.relativeHumidityPercent === undefined
    ? undefined
    : options.relativeHumidityPercent / 100;
  const surfacePressureHpa = options.surfacePressureHpa ?? siteAtmosphere.pressurePa / 100;
  const surfaceTemperatureC = options.surfaceTemperatureC ?? siteAtmosphere.temperatureK - 273.15;
  return createLaunchEnvironmentModel({
    site: {
      name: "ARC 54 synthetic range",
      latitudeDeg: -36.85,
      longitudeDeg: 174.76,
      elevationM: launchAltitude,
      datum: "WGS84",
      timeZone: "Pacific/Auckland",
    },
    provenance: {
      sourceName: "ARC 54 browser input",
      sourceKind: "synthetic",
      dataVersion: PREVIEW_WIND_PROFILE_MODEL_VERSION,
      licenseIdentifier: "CC0-1.0",
      attribution: "Original RocketWorks synthetic environment",
      validationStatus: "synthetic-unvalidated",
    },
    meanWindProfile: createPreviewWindProfile(windSpeed, {
      ...options,
      windAzimuthRad: ((options.windAzimuthDeg ?? 0) * Math.PI) / 180,
    }),
    surfaceObservation: {
      stationPressurePa: surfacePressureHpa * 100,
      temperatureK: surfaceTemperatureC + 273.15,
      ...(relativeHumidityFraction === undefined ? {} : { relativeHumidityFraction }),
    },
    turbulence: {
      seed: options.seed ?? "arc54-weather-v1",
      rmsVelocityMps: {
        longitudinal: windSpeed * 0.12 * turbulenceScale,
        lateral: windSpeed * 0.1 * turbulenceScale,
        vertical: windSpeed * 0.06 * turbulenceScale,
      },
      lengthScaleM: { longitudinal: 80, lateral: 50, vertical: 30 },
      minimumWavelengthM: 3,
      maximumWavelengthM: 800,
      modeCount: 24,
      minimumAdvectionSpeedMps: 0.5,
    },
  });
}

function makeDesignComponents({
  lengthM,
  diameterM,
  noseLengthM = 0.18,
  noseProfile = "ogive",
  finCount = 3,
  finRootChordM = 0.13,
  finTipChordM = 0.055,
  finSweepM = 0.045,
  finSpanM = 0.075,
  finThicknessM = 0.003,
  material,
  payloadMassKg,
  motorMassKg = 0.16,
  recoveryMassKg = 0.06,
}: {
  lengthM: number;
  diameterM: number;
  noseLengthM?: number;
  noseProfile?: NoseProfile;
  finCount?: number;
  finRootChordM?: number;
  finTipChordM?: number;
  finSweepM?: number;
  finSpanM?: number;
  finThicknessM?: number;
  material: MaterialKey;
  payloadMassKg: number;
  motorMassKg?: number;
  recoveryMassKg?: number;
}): VehicleComponent[] {
  const radiusM = diameterM / 2;
  const airframe = materialModels[material];
  const noseStations = noseProfile === "conical"
    ? [
        { xM: 0, outerRadiusM: 0 },
        { xM: noseLengthM, outerRadiusM: radiusM },
      ]
    : noseProfile === "elliptical"
      ? [
          { xM: 0, outerRadiusM: 0 },
          { xM: noseLengthM * 0.5, outerRadiusM: radiusM * Math.SQRT1_2 },
          { xM: noseLengthM, outerRadiusM: radiusM },
        ]
      : [
          { xM: 0, outerRadiusM: 0 },
          { xM: noseLengthM * 0.35, outerRadiusM: radiusM * 0.62 },
          { xM: noseLengthM, outerRadiusM: radiusM },
        ];
  return [
    {
      id: "nose",
      name: "Nose cone",
      stageId: "sustainer",
      kind: "axisymmetric",
      densityKgM3: 1150,
      wallThicknessM: 0.002,
      stations: noseStations,
    },
    {
      id: "body",
      name: "Airframe",
      stageId: "sustainer",
      kind: "axisymmetric",
      densityKgM3: airframe.densityKgM3,
      wallThicknessM: Math.min(airframe.wallThicknessM, radiusM),
      positionM: { x: noseLengthM, y: 0, z: 0 },
      stations: [
        { xM: 0, outerRadiusM: radiusM },
        { xM: lengthM, outerRadiusM: radiusM },
      ],
    },
    {
      id: "fins",
      name: "Fin set",
      stageId: "sustainer",
      kind: "finSet",
      count: finCount,
      axialPositionM: noseLengthM + Math.max(0, lengthM - finRootChordM),
      bodyRadiusM: radiusM,
      rootChordM: finRootChordM,
      tipChordM: finTipChordM,
      sweepM: finSweepM,
      spanM: finSpanM,
      thicknessM: finThicknessM,
      densityKgM3: 600,
    },
    {
      id: "motor",
      name: "Motor and mount allowance",
      stageId: "sustainer",
      kind: "pointMass",
      massKg: motorMassKg,
      positionM: {
        x: noseLengthM + Math.max(0, lengthM - 0.09),
        y: 0,
        z: 0,
      },
    },
    {
      id: "recovery",
      name: "Recovery allowance",
      stageId: "sustainer",
      kind: "pointMass",
      massKg: recoveryMassKg,
      positionM: {
        x: noseLengthM + Math.min(0.09, lengthM * 0.2),
        y: 0,
        z: 0,
      },
    },
    {
      id: "payload",
      name: "Payload and avionics allowance",
      stageId: "sustainer",
      kind: "pointMass",
      massKg: payloadMassKg,
      positionM: {
        x: noseLengthM + Math.min(0.22, lengthM * 0.38),
        y: 0,
        z: 0,
      },
    },
  ];
}

function stageScaleForRole(role: VehicleStageRole): number {
  return role === "core" ? 1 : role === "booster" ? 0.72 : role === "payload" ? 0.48 : 0.62;
}

function stageEnvelopeLengthM(role: VehicleStageRole, lengthM: number, noseLengthM: number): number {
  return noseLengthM * stageScaleForRole(role) + lengthM * stageScaleForRole(role);
}

function stageMotorInstanceCount(stage: Pick<VehicleStagePlan, "attachment" | "repeatCount">): number {
  return stage.attachment === "parallel" ? stage.repeatCount : 1;
}

function parseFailedMotorInstanceInput(
  value: string,
  stage: Pick<VehicleStagePlan, "attachment" | "repeatCount">,
): readonly number[] {
  const normalized = value.trim();
  if (!normalized) return [];
  const instanceCount = stageMotorInstanceCount(stage);
  const indices = normalized.split(",").map((token) => {
    if (!/^\d+$/.test(token.trim())) {
      throw new Error("Failed motors must be a comma-separated list such as 1, 3.");
    }
    const oneBasedIndex = Number(token.trim());
    if (!Number.isInteger(oneBasedIndex) || oneBasedIndex < 1 || oneBasedIndex > instanceCount) {
      throw new Error(`Failed motor numbers must be between 1 and ${instanceCount} for this stage.`);
    }
    return oneBasedIndex - 1;
  });
  if (new Set(indices).size !== indices.length) {
    throw new Error("Failed motor numbers must be unique.");
  }
  return [...indices].sort((left, right) => left - right);
}

type StagePlacement = Readonly<{
  stage: VehicleStagePlan;
  translationXM: number;
  instanceCount: number;
}>;

function createStagePlacements(
  stages: readonly VehicleStagePlan[],
  lengthM: number,
  noseLengthM = 0.18,
): readonly StagePlacement[] {
  const placementById = new Map<string, StagePlacement>();
  return stages.map((stage) => {
    const parentTranslationXM = stage.parentStageId
      ? placementById.get(stage.parentStageId)?.translationXM ?? 0
      : 0;
    const translationXM = stage.role === "core"
        ? 0
        : stage.attachment === "serial"
        ? parentTranslationXM - stageEnvelopeLengthM(stage.role, lengthM, noseLengthM)
        : parentTranslationXM;
    const placement = {
      stage,
      translationXM,
      instanceCount: stage.attachment === "parallel" ? stage.repeatCount : 1,
    } satisfies StagePlacement;
    placementById.set(stage.id, placement);
    return placement;
  });
}

function placeStageComponent(
  component: VehicleComponent,
  placement: StagePlacement,
  instanceIndex: number,
): VehicleComponent {
  const angle = placement.stage.attachment === "parallel"
    ? (instanceIndex * 2 * Math.PI) / Math.max(placement.instanceCount, 1)
    : 0;
  const radialTranslation = placement.stage.attachment === "parallel"
    ? {
        y: placement.stage.repeatRadiusM * Math.cos(angle),
        z: placement.stage.repeatRadiusM * Math.sin(angle),
      }
    : { y: 0, z: 0 };
  const idSuffix = placement.instanceCount > 1 ? `-instance-${instanceIndex + 1}` : "";
  if (component.kind === "axisymmetric") {
    const position = component.positionM ?? { x: 0, y: 0, z: 0 };
    return {
      ...component,
      id: `${component.id}${idSuffix}`,
      positionM: {
        x: position.x + placement.translationXM,
        y: position.y + radialTranslation.y,
        z: position.z + radialTranslation.z,
      },
    };
  }
  if (component.kind === "finSet") {
    return {
      ...component,
      id: `${component.id}${idSuffix}`,
      axialPositionM: component.axialPositionM + placement.translationXM,
      angularOffsetRad: (component.angularOffsetRad ?? 0) + angle,
    };
  }
  return {
    ...component,
    id: `${component.id}${idSuffix}`,
    positionM: {
      x: component.positionM.x + placement.translationXM,
      y: component.positionM.y + radialTranslation.y,
      z: component.positionM.z + radialTranslation.z,
    },
  };
}

function makePlacedStageComponents(
  stages: readonly VehicleStagePlan[],
  baseComponents: readonly VehicleComponent[],
  inputs: Readonly<{
    lengthM: number;
    diameterM: number;
    noseLengthM: number;
    noseProfile: NoseProfile;
    finCount: number;
    finRootChordM: number;
    finTipChordM: number;
    finSweepM: number;
    finSpanM: number;
    finThicknessM: number;
    material: MaterialKey;
    payloadMassKg: number;
    recoveryMassKg: number;
    motorMassKgByStageId?: Readonly<Record<string, number>>;
  }>,
): VehicleComponent[] {
  return createStagePlacements(stages, inputs.lengthM, inputs.noseLengthM).flatMap((placement) => {
    const stageComponents = makeAssemblyStageComponents(placement.stage, baseComponents, inputs);
    return Array.from({ length: placement.instanceCount }, (_, instanceIndex) =>
      stageComponents.map((component) => placeStageComponent(component, placement, instanceIndex)),
    ).flat();
  });
}

function unplaceComponentForEnvelope(
  component: VehicleComponent,
  placement: StagePlacement,
  stageInstanceIndex: number,
): VehicleComponent {
  const angle = placement.stage.attachment === "parallel"
    ? (stageInstanceIndex * 2 * Math.PI) / Math.max(placement.instanceCount, 1)
    : 0;
  const radialTranslation = placement.stage.attachment === "parallel"
    ? {
        y: placement.stage.repeatRadiusM * Math.cos(angle),
        z: placement.stage.repeatRadiusM * Math.sin(angle),
      }
    : { y: 0, z: 0 };
  if (component.kind === "axisymmetric") {
    const position = component.positionM ?? { x: 0, y: 0, z: 0 };
    return {
      ...component,
      positionM: {
        x: position.x - placement.translationXM,
        y: position.y - radialTranslation.y,
        z: position.z - radialTranslation.z,
      },
    };
  }
  if (component.kind === "finSet") {
    return {
      ...component,
      axialPositionM: component.axialPositionM - placement.translationXM,
      angularOffsetRad: (component.angularOffsetRad ?? 0) - angle,
    };
  }
  return {
    ...component,
    positionM: {
      x: component.positionM.x - placement.translationXM,
      y: component.positionM.y - radialTranslation.y,
      z: component.positionM.z - radialTranslation.z,
    },
  };
}

function createSeparationEnvelopeRadiusMap({
  topology,
  assembly,
  stageComponents,
  lengthM,
  noseLengthM,
}: Readonly<{
  topology: LocalVehicleTopology;
  assembly: VehicleAssemblyEvaluation;
  stageComponents: readonly VehicleComponent[];
  lengthM: number;
  noseLengthM: number;
}>): Readonly<Record<string, number>> {
  const placements = new Map(
    createStagePlacements(topology.stages, lengthM, noseLengthM).map((placement) => [placement.stage.id, placement]),
  );
  const stageById = new Map(topology.stages.map((stage) => [stage.id, stage]));
  const normalizedStageComponents = stageComponents.flatMap((component) => {
    const placement = placements.get(component.stageId);
    if (!placement) return [];
    const match = component.id.match(/-instance-(\d+)$/);
    const stageInstanceIndex = match ? Number(match[1]) - 1 : 0;
    return [[
      component.id,
      unplaceComponentForEnvelope(component, placement, stageInstanceIndex),
    ] as const];
  });
  const componentsById = new Map(normalizedStageComponents);
  const componentsByBaseId = new Map(
    normalizedStageComponents.map(([id, component]) => [id.replace(/-instance-\d+$/, ""), component]),
  );
  const groups = new Map<string, Array<{
    component: VehicleComponent;
    originM: { x: number; y: number; z: number };
    centerOfMassM: { x: number; y: number; z: number };
    massProperties: VehicleAssemblyEvaluation["componentInstances"][number]["massProperties"];
  }>>();
  const add = (
    key: string,
    component: VehicleComponent,
    instance: VehicleAssemblyEvaluation["componentInstances"][number],
  ) => {
    const existing = groups.get(key);
    const member = {
      component,
      originM: instance.transform.translationM,
      centerOfMassM: instance.massProperties.centerOfMassM,
      massProperties: instance.massProperties,
    };
    if (existing) existing.push(member);
    else groups.set(key, [member]);
  };
  for (const instance of assembly.componentInstances) {
    const stage = stageById.get(instance.stageId);
    const placement = placements.get(instance.stageId);
    if (!stage || !placement) continue;
    const sourceComponent =
      componentsById.get(instance.sourceComponentId) ??
      componentsByBaseId.get(instance.sourceComponentId);
    if (!sourceComponent) continue;
    const retained =
      stage.role === "payload" ||
      sourceComponent.id === "recovery" ||
      sourceComponent.id === "payload";
    if (retained) {
      add("retained-vehicle", sourceComponent, instance);
      continue;
    }
    const instanceId = placement.instanceCount > 1
      ? `${stage.id}-instance-${instance.stageInstanceIndex + 1}`
      : stage.id;
    add(`${stage.id}/${instanceId}`, sourceComponent, instance);
  }
  const radii: Record<string, number> = {};
  for (const [key, members] of groups) {
    if (members.length === 0) continue;
    const massProperties = combineMassProperties(members.map((member) => member.massProperties));
    const radius = estimateSphericalEnvelopeRadiusM({
      centerOfMassM: massProperties.centerOfMassM,
      components: members.map(({ component, originM, centerOfMassM }) => ({
        component,
        originM,
        centerOfMassM,
      })),
    });
    if (radius !== null && Number.isFinite(radius)) radii[key] = radius;
  }
  return radii;
}

function makeAssemblyStageComponents(
  stage: VehicleStagePlan,
  baseComponents: readonly VehicleComponent[],
  inputs: Readonly<{
    lengthM: number;
    diameterM: number;
    noseLengthM: number;
    noseProfile: NoseProfile;
    finCount: number;
    finRootChordM: number;
    finTipChordM: number;
    finSweepM: number;
    finSpanM: number;
    finThicknessM: number;
    material: MaterialKey;
    payloadMassKg: number;
    recoveryMassKg: number;
    motorMassKgByStageId?: Readonly<Record<string, number>>;
  }>,
): VehicleComponent[] {
  if (stage.role === "core") return baseComponents.map((component) => ({ ...component, stageId: stage.id }));
  const stageScale = stageScaleForRole(stage.role);
  const generated = makeDesignComponents({
    lengthM: inputs.lengthM * stageScale,
    diameterM: inputs.diameterM * (stage.role === "booster" ? 0.8 : 0.72),
    noseLengthM: inputs.noseLengthM * stageScale,
    noseProfile: inputs.noseProfile,
    finCount: inputs.finCount,
    finRootChordM: inputs.finRootChordM * stageScale,
    finTipChordM: inputs.finTipChordM * stageScale,
    finSweepM: inputs.finSweepM * stageScale,
    finSpanM: inputs.finSpanM * stageScale,
    finThicknessM: inputs.finThicknessM,
    material: inputs.material,
    payloadMassKg: stage.role === "payload" ? inputs.payloadMassKg * 0.7 : inputs.payloadMassKg * 0.18,
    recoveryMassKg: inputs.recoveryMassKg * stageScale,
    motorMassKg: inputs.motorMassKgByStageId?.[stage.id] ?? 0.16,
  });
  const allowedKinds = stage.role === "booster"
    ? new Set(["body", "fins", "motor"])
    : stage.role === "payload"
      ? new Set(["nose", "body", "payload", "recovery"])
      : new Set(["nose", "body", "fins", "motor", "payload"]);
  return generated
    .filter((component) => allowedKinds.has(component.id))
    .map((component) => ({ ...component, id: `${stage.id}-${component.id}`, stageId: stage.id }));
}

function createStageFlightPreviewInputs({
  topology,
  assembly,
  stageComponents,
  lengthM,
  noseLengthM,
  diameterM,
  motor,
  userMotorRecords,
  dragCoefficient,
  environmentAt,
  launchRailEnabled,
  launchRailLengthM,
  launchRailInclinationDeg,
  launchRailAzimuthDeg,
  recoveryEnabled,
  recoveryDelay,
  recoveryDiameter,
  recoveryReefingEnabled,
  recoveryReefingDurationS,
  recoveryReefingStartAreaFraction,
  aerodynamicTable,
  aerodynamicTableModels,
}: {
  topology: LocalVehicleTopology;
  assembly: VehicleAssemblyEvaluation;
  stageComponents: readonly VehicleComponent[];
  lengthM: number;
  noseLengthM: number;
  diameterM: number;
  motor: MotorDataRecord;
  userMotorRecords: readonly MotorDataRecord[];
  dragCoefficient: number;
  environmentAt: LaunchEnvironmentProvider;
  launchRailEnabled: boolean;
  launchRailLengthM: number;
  launchRailInclinationDeg: number;
  launchRailAzimuthDeg: number;
  recoveryEnabled: boolean;
  recoveryDelay: number;
  recoveryDiameter: number;
  recoveryReefingEnabled: boolean;
  recoveryReefingDurationS: number;
  recoveryReefingStartAreaFraction: number;
  aerodynamicTable?: AerodynamicCoefficientTableModel | null;
  aerodynamicTableModels?: Readonly<Record<string, AerodynamicCoefficientTableModel>>;
}): Parameters<typeof simulateStageFlightPreview>[0] {
  const stageById = new Map(topology.stages.map((stage) => [stage.id, stage]));
  const activeStages = topology.stages.filter((stage) => stage.enabled);
  const motorAssignmentWarnings: string[] = [];
  const stageFailureWarnings: string[] = [];
  const aerodynamicAssignmentWarnings: string[] = [];
  const separationEnvelopeRadiiM = createSeparationEnvelopeRadiusMap({
    topology,
    assembly,
    stageComponents,
    lengthM,
    noseLengthM,
  });
  const motorAssignmentAssumptions = [
    "A stage without an explicit motor assignment uses the current global motor selection.",
  ];
  const motorForStage = (stage: VehicleStagePlan): MotorDataRecord => {
    if (!stage.motorId) return motor;
    const assigned = userMotorRecords.find((record) => record.id === stage.motorId);
    if (assigned) return assigned;
    motorAssignmentWarnings.push(
      `${stage.name} references unavailable motor ${stage.motorId}; the global motor selection was used for this preview.`,
    );
    return motor;
  };
  const isMotorInstance = (instance: VehicleAssemblyEvaluation["componentInstances"][number]) =>
    instance.sourceComponentId === "motor" || instance.sourceComponentId.endsWith("-motor");
  const isRetainedComponent = (instance: VehicleAssemblyEvaluation["componentInstances"][number]) =>
    instance.sourceComponentId === "recovery" || instance.sourceComponentId === "payload";
  const retainedInstances = assembly.componentInstances.filter((instance) => {
    const stage = stageById.get(instance.stageId);
    return stage?.role === "payload" || isRetainedComponent(instance);
  });
  const rawRetainedMassProperties = combineMassProperties(
    retainedInstances.map((instance) => instance.massProperties),
  );
  if (!(rawRetainedMassProperties.massKg > 0)) {
    throw new Error("Stage preview needs a positive retained payload or recovery mass.");
  }
  const rawRetainedInertia = rawRetainedMassProperties.inertiaAtCenterKgM2;
  const retainedInertiaLeadingMinor2 =
    rawRetainedInertia[0][0] * rawRetainedInertia[1][1] -
    rawRetainedInertia[0][1] * rawRetainedInertia[1][0];
  const retainedInertiaIsPositiveDefinite =
    rawRetainedInertia[0][0] > 0 &&
    retainedInertiaLeadingMinor2 > 0 &&
    determinant(rawRetainedInertia) > 0;
  const retainedMassProperties = retainedInertiaIsPositiveDefinite
    ? rawRetainedMassProperties
    : addCompactPackageInertia(rawRetainedMassProperties, {
        radiusM: Math.max(0.004, Math.min(diameterM * 0.35, 0.03)),
        lengthM: Math.max(0.04, Math.min(lengthM * 0.18, 0.25)),
      });
  const retainedInertiaWarning = retainedInertiaIsPositiveDefinite
    ? null
    : "The retained payload/recovery allowance is represented by collinear point masses, so this 6DOF preview adds a bounded compact-package shape inertia placeholder; detailed retained geometry is not modeled.";

  const propulsivePlans = activeStages.filter((stage) => stage.role !== "payload");
  const stages: RocketStage[] = propulsivePlans.map((stage) => {
    const stageMotor = motorForStage(stage);
    const assemblyInstances = assembly.componentInstances.filter((instance) => instance.stageId === stage.id);
    if (stage.failedMotorInstanceIndices.length > 0) {
      stageFailureWarnings.push(
        `${stage.name} motor instance failure is configured for motor ${stage.failedMotorInstanceIndices.map((index) => index + 1).join(", ")}; failed motors retain propellant and do not contribute thrust.`,
      );
    }
    const isStructuralInstance = (instance: VehicleAssemblyEvaluation["componentInstances"][number]) =>
      !isMotorInstance(instance) && !isRetainedComponent(instance);
    const structuralMassProperties = combineMassProperties(
      assemblyInstances
        .filter(isStructuralInstance)
        .map((instance) => instance.massProperties),
    );
    if (!(structuralMassProperties.massKg > 0)) {
      throw new Error(`${stage.name} needs a positive structural mass for the stage preview.`);
    }
    const createStageMotor = (
      instance: VehicleAssemblyEvaluation["componentInstances"][number],
      index: number,
    ) => {
      const center = instance.massProperties.centerOfMassM;
      const originBodyM = {
        x: center.x - (stageMotor.dryCgFromAftM ?? stageMotor.lengthM / 2),
        y: center.y,
        z: center.z,
      };
      return {
        id: `${stage.id}-preview-motor-${instance.stageInstanceIndex}-${index}`,
        name: `${stage.name} / ${stageMotor.designation}`,
        thrustCurve: stageMotor.thrustCurve,
        dryMassProperties: transformMassProperties(stageMotor.dryMassPropertiesLocal, {
          rotation: instance.transform.rotation,
          translationM: originBodyM,
        }),
        initialPropellantMassProperties: transformMassProperties(
          stageMotor.propellantMassPropertiesLocal,
          { rotation: instance.transform.rotation, translationM: originBodyM },
        ),
        thrustApplicationPointBodyM: originBodyM,
        thrustAxisBody: stageThrustAxisBody(stage, instance.stageInstanceIndex),
        ignitionFailure: stage.failedMotorInstanceIndices.includes(instance.stageInstanceIndex),
      };
    };
    const motors = assemblyInstances
      .filter(isMotorInstance)
      .map(createStageMotor);
    if (motors.length === 0) {
      throw new Error(`${stage.name} has no motor instance for the stage preview.`);
    }
    const groupedInstances = new Map<number, typeof assemblyInstances>();
    for (const instance of assemblyInstances) {
      const group = groupedInstances.get(instance.stageInstanceIndex);
      if (group) group.push(instance);
      else groupedInstances.set(instance.stageInstanceIndex, [instance]);
    }
    const physicalInstances: RocketStageInstance[] = [...groupedInstances.entries()]
      .sort(([left], [right]) => left - right)
      .map(([stageInstanceIndex, group]) => {
        const instanceStructuralComponents = group.filter(isStructuralInstance);
        const instanceStructuralMassProperties = combineMassProperties(
          instanceStructuralComponents.map((instance) => instance.massProperties),
        );
        if (!(instanceStructuralMassProperties.massKg > 0)) {
          throw new Error(`${stage.name} instance ${stageInstanceIndex + 1} needs a positive structural mass.`);
        }
        const instanceMotors = group.filter(isMotorInstance).map(createStageMotor);
        if (instanceMotors.length === 0) {
          throw new Error(`${stage.name} instance ${stageInstanceIndex + 1} has no motor instance.`);
        }
        return {
          id: `${stage.id}-instance-${stageInstanceIndex + 1}`,
          name: `${stage.name} ${stageInstanceIndex + 1}`,
          structuralMassProperties: instanceStructuralMassProperties,
          motors: instanceMotors,
          separationDeltaVBodyMps: stage.separationDeltaVBodyMps ?? 0,
        };
      });
    return {
      id: stage.id,
      name: stage.name,
      structuralMassProperties,
      motors,
      ...(physicalInstances.length > 1 ? { instances: physicalInstances } : {}),
      separationDeltaVBodyMps: stage.separationDeltaVBodyMps ?? 0,
    };
  });
  if (stages.length === 0) throw new Error("Enable at least one propulsive stage before running a stage preview.");
  const maximumMotorBurnDurationS = propulsivePlans.reduce(
    (maximum, stage) => Math.max(maximum, motorForStage(stage).metrics.burnDurationS),
    motor.metrics.burnDurationS,
  );

  const stageIds = stages.map((stage) => stage.id);
  const stageIdSet = new Set(stageIds);
  const geometryStageIds = new Set<string>(["retained"]);
  activeStages
    .filter((stage) => !stageIdSet.has(stage.id))
    .forEach((stage) => geometryStageIds.add(stage.id));
  const components = stageComponents
    .filter((component) => stageById.get(component.stageId)?.enabled !== false)
    .map((component) => {
      if (
        stageById.get(component.stageId)?.role === "core" &&
        (component.id === "recovery" || component.id === "payload")
      ) {
        return { ...component, stageId: "retained" };
      }
      return component;
    });
  const regimes: StageAerodynamicRegime[] = [];
  for (let mask = 0; mask < 2 ** stageIds.length; mask += 1) {
    const activeStageIds = stageIds.filter((_, index) => (mask & (1 << index)) !== 0);
    const resolvedAerodynamicTable = resolveStageAerodynamicTable({
      activeStageIds,
      stages: topology.stages,
      aerodynamicTableModels: aerodynamicTableModels ?? {},
      globalTable: aerodynamicTable ?? null,
    });
    aerodynamicAssignmentWarnings.push(...resolvedAerodynamicTable.warnings);
    const regimeTable = resolvedAerodynamicTable.table;
    regimes.push({
      id: `preview-${activeStageIds.join("-") || "retained"}`,
      label: activeStageIds.length > 0 ? `${activeStageIds.join(" + ")} topology` : "Retained payload topology",
      activeStageIds,
      ...(regimeTable
        ? {
            coefficientTable: regimeTable,
            coefficientTableDesignPoint: {
              mach: (regimeTable.machRange[0] + regimeTable.machRange[1]) / 2,
              reynoldsNumber: Math.sqrt(
                regimeTable.reynoldsRange[0] * regimeTable.reynoldsRange[1],
              ),
            },
          }
        : { dragCoefficient }),
    });
  }
  const staging = createMultiStageVehicleModel({ retainedMassProperties, stages });
  const initialStage = stages[0]!;
  const initiallyIgnitedStageIds = stages.filter((stage, index) => {
    const plan = stageById.get(stage.id);
    return index === 0 || plan?.attachment === "parallel" || plan?.role === "booster";
  }).map((stage) => stage.id);
  const launchOrientation = launchRailEnabled
    ? launchRailOrientationFromAngles(launchRailInclinationDeg, launchRailAzimuthDeg)
    : verticalLaunchOrientationBodyToEnu();
  const initialState = stages
    .filter((stage) => stageById.get(stage.id)?.ignitionFailure)
    .reduce((state, stage) => {
      stageFailureWarnings.push(`${stage.name} ignition failure is configured at pad initialization for this preview.`);
      return failStageIgnition(state, stage.id);
    }, {
      ...stageFlightPreviewInitialState(),
      orientationBodyToWorld: launchOrientation,
    });
  const stateEvents: StateTriggeredRigidBodyEvent[] = [];
  const events: ScheduledRigidBodyEvent[] = [];
  const hasSeparationEvent = (stageId: string, instanceId?: string) =>
    stateEvents.some(
      (event) => event.id === `staging-${stageId}${instanceId ? `-${instanceId}` : ""}-burnout-separation`,
    );
  const scheduleBurnoutSeparations = (stage: RocketStage, plan?: VehicleStagePlan) => {
    const instanceIds = staging.stageInstanceIds(stage.id);
    const separationInput = (instanceId?: string) => ({
      stageId: stage.id,
      ...(instanceId ? { instanceId } : {}),
      delayS: plan?.separationDelayS ?? 0.1,
      separationDeltaVBodyMps: plan?.separationDeltaVBodyMps ?? 0,
    });
    if (instanceIds.length > 1) {
      instanceIds.forEach((instanceId) => {
        if (!hasSeparationEvent(stage.id, instanceId)) {
          stateEvents.push(staging.createBurnoutSeparationEvent(separationInput(instanceId)));
        }
      });
      return;
    }
    if (!hasSeparationEvent(stage.id)) {
      stateEvents.push(staging.createBurnoutSeparationEvent(separationInput()));
    }
  };
  let serialSourceId = initialStage.id;
  for (const stage of stages.slice(1)) {
    const plan = stageById.get(stage.id);
    if (plan?.attachment === "parallel" || plan?.role === "booster") {
      scheduleBurnoutSeparations(stage, plan);
      continue;
    }
    scheduleBurnoutSeparations(stage, plan);
    const sourceInstanceIds = staging.stageInstanceIds(serialSourceId);
    const targetInstanceIds = staging.stageInstanceIds(stage.id);
    if (sourceInstanceIds.length > 1 && sourceInstanceIds.length === targetInstanceIds.length) {
      targetInstanceIds.forEach((targetInstanceId, index) => {
        stateEvents.push(staging.createBurnoutIgnitionEvent({
          sourceStageId: serialSourceId,
          sourceInstanceId: sourceInstanceIds[index],
          targetStageId: stage.id,
          targetInstanceId,
          delayS: plan?.ignitionDelayS ?? 0,
        }));
      });
    } else if (targetInstanceIds.length > 1) {
      targetInstanceIds.forEach((targetInstanceId) => {
        stateEvents.push(staging.createBurnoutIgnitionEvent({
          sourceStageId: serialSourceId,
          targetStageId: stage.id,
          targetInstanceId,
          delayS: plan?.ignitionDelayS ?? 0,
        }));
      });
    } else {
      stateEvents.push(staging.createBurnoutIgnitionEvent({
        sourceStageId: serialSourceId,
        targetStageId: stage.id,
        delayS: plan?.ignitionDelayS ?? 0,
      }));
    }
    serialSourceId = stage.id;
  }
  for (const stage of stages) {
    const plan = stageById.get(stage.id);
    if (plan?.role === "booster" || plan?.attachment === "parallel") {
      scheduleBurnoutSeparations(stage, plan);
    }
  }
  const recoveryDevices = recoveryEnabled
    ? [
        {
          id: "main",
          name: "Main recovery canopy",
          dragCoefficient: BROWSER_RECOVERY_DRAG_COEFFICIENT,
          referenceAreaM2: Math.PI * (recoveryDiameter / 2) ** 2,
          deploymentDelayS: recoveryDelay,
          inflationTimeS: BROWSER_RECOVERY_INFLATION_TIME_S,
          reefingStages: createBrowserRecoveryReefingStages({
            recoveryReefingEnabled,
            recoveryReefingDurationS,
            recoveryReefingStartAreaFraction,
          }),
        },
      ]
    : [];
  if (recoveryDevices.length > 0) {
    stateEvents.push(
      createApogeeRecoveryDeploymentEvent({
        deviceId: "main",
        label: "Main recovery command at apogee",
      }),
    );
  }
  return {
    retainedMassProperties,
    components,
    stages,
    regimes,
    initiallyIgnitedStageIds,
    durationS: Math.max(12, maximumMotorBurnDurationS * (stages.length + 2) + 8),
    timeStepS: 0.02,
    environmentAt,
    alwaysActiveGeometryStageIds: [...geometryStageIds],
    separationTransitionWindowS: 0.2,
    launchRail: launchRailEnabled
      ? {
          directionWorld: launchRailDirectionFromAngles(launchRailInclinationDeg, launchRailAzimuthDeg),
          lengthM: launchRailLengthM,
        }
      : undefined,
    launchRailMaximumSteps: 250_000,
    initialState,
    events,
    stateEvents,
    recoveryDevices,
    separationEnvelopeRadiiM,
    additionalWarnings: [
      ...(retainedInertiaWarning ? [retainedInertiaWarning] : []),
      ...motorAssignmentWarnings,
      ...stageFailureWarnings,
      ...aerodynamicAssignmentWarnings,
    ],
    additionalAssumptions: motorAssignmentAssumptions,
  };
}

type BrowserRecoveryReefingInputs = Readonly<{
  recoveryReefingEnabled: boolean;
  recoveryReefingDurationS: number;
  recoveryReefingStartAreaFraction: number;
}>;

function createBrowserRecoveryReefingStages(
  input: BrowserRecoveryReefingInputs,
): readonly RecoveryReefingStage[] | undefined {
  if (!input.recoveryReefingEnabled) return undefined;
  return validateRecoveryReefingStages(
    [
      { timeFromInflationS: 0, areaFraction: input.recoveryReefingStartAreaFraction },
      { timeFromInflationS: input.recoveryReefingDurationS, areaFraction: 1 },
    ],
    "browser recovery reefing schedule",
  );
}

function createFlightConfig({
  mass,
  diameter,
  dragCoefficient,
  thrust,
  burnTime,
  launchAltitude,
  windSpeed,
  windAzimuthDeg,
  relativeHumidityPercent,
  surfacePressureHpa,
  surfaceTemperatureC,
  recoveryEnabled,
  recoveryDelay,
  recoveryDiameter,
  recoveryReefingEnabled,
  recoveryReefingDurationS,
  recoveryReefingStartAreaFraction,
  motorRecord,
  aerodynamicTable,
}: {
  mass: number;
  diameter: number;
  dragCoefficient: number;
  thrust: number;
  burnTime: number;
  launchAltitude: number;
  windSpeed: number;
  windAzimuthDeg: number;
  relativeHumidityPercent: number;
  surfacePressureHpa: number;
  surfaceTemperatureC: number;
  recoveryEnabled: boolean;
  recoveryDelay: number;
  recoveryDiameter: number;
  recoveryReefingEnabled: boolean;
  recoveryReefingDurationS: number;
  recoveryReefingStartAreaFraction: number;
  motorRecord?: MotorDataRecord;
  aerodynamicTable?: AerodynamicCoefficientTableModel | null;
}): VerticalFlightConfig {
  const motor = motorRecord ?? createPreviewMotorRecord({ mass, thrust, burnTime });
  const propellantMassKg = motor.metrics.propellantMassKg;
  const launchMassKg = mass;
  if (!(propellantMassKg > 0 && propellantMassKg < launchMassKg)) {
    throw new Error("Selected motor propellant mass must remain below the vehicle launch mass.");
  }
  return {
    vehicle: {
      dryMassKg: launchMassKg - propellantMassKg,
      propellantMassKg,
      referenceAreaM2: Math.PI * Math.pow(diameter / 2000, 2),
      dragCoefficient,
    },
    ...(aerodynamicTable
      ? {
          aerodynamics: {
            coefficientTable: aerodynamicTable,
            referenceLengthM: diameter / 1000,
          },
        }
      : {}),
    motor: { thrustCurve: [...motor.thrustCurve] },
    recovery: {
      enabled: recoveryEnabled,
      dragAreaM2: Math.PI * Math.pow(recoveryDiameter / 2, 2),
      dragCoefficient: BROWSER_RECOVERY_DRAG_COEFFICIENT,
      deploymentDelayAfterApogeeS: recoveryDelay,
      reefingStages: createBrowserRecoveryReefingStages({
        recoveryReefingEnabled,
        recoveryReefingDurationS,
        recoveryReefingStartAreaFraction,
      }),
    },
    environment: {
      launchAltitudeM: launchAltitude,
      windProfile: createPreviewWindProfile(windSpeed, {
        windAzimuthRad: (windAzimuthDeg * Math.PI) / 180,
      }),
      surfaceObservation: {
        stationPressurePa: surfacePressureHpa * 100,
        temperatureK: surfaceTemperatureC + 273.15,
        relativeHumidityFraction: relativeHumidityPercent / 100,
      },
    },
    integration: { timeStepS: 0.02, maxTimeS: 180 },
  };
}

function createPreviewMotorRecord({
  mass,
  thrust,
  burnTime,
}: {
  mass: number;
  thrust: number;
  burnTime: number;
}) {
  const propellantMassKg = Math.min(mass * 0.14, 0.08);
  return createMotorDataRecord({
    id: "kestrel.synthetic-preview",
    manufacturer: "RocketWorks",
    designation: "Synthetic preview",
    description: "Parametric browser-preview motor; not a commercial or certified motor.",
    diameterM: 0.029,
    lengthM: 0.095,
    launchMassKg: 0.16,
    dryMassKg: 0.16 - propellantMassKg,
    thrustCurve: makeConstantThrustCurve(thrust, burnTime),
    provenance: {
      sourceName: "ARC 54 browser input",
      sourceKind: "synthetic",
      dataVersion: "preview-1",
      licenseIdentifier: "CC0-1.0",
      attribution: "Original RocketWorks synthetic curve",
      validationStatus: "synthetic-unvalidated",
    },
  });
}

function createFlightResult(inputs: Parameters<typeof createFlightConfig>[0]) {
  return simulateVerticalFlight(createFlightConfig(inputs));
}

type BrowserUncertaintyInputs = Parameters<typeof createFlightConfig>[0] & Readonly<{
  recoveryDeploymentSuccessProbability: number;
}>;

function createUncertaintyResult(
  inputs: BrowserUncertaintyInputs,
  uncertaintyCorrelations: readonly ProjectUncertaintyCorrelation[] = [],
  sampleCount = DEFAULT_UNCERTAINTY_SAMPLE_COUNT,
  seed = DEFAULT_UNCERTAINTY_SEED,
): UncertaintyAnalysisResult {
  const factors = [
    {
      key: "dryMassScale" as const,
      label: "Dry mass",
      distribution: { kind: "triangular" as const, minimum: 0.97, mode: 1, maximum: 1.03 },
    },
    {
      key: "propellantMassScale" as const,
      label: "Propellant mass",
      distribution: { kind: "triangular" as const, minimum: 0.95, mode: 1, maximum: 1.05 },
    },
    {
      key: "dragCoefficientScale" as const,
      label: "Drag coefficient",
      distribution: { kind: "triangular" as const, minimum: 0.9, mode: 1, maximum: 1.1 },
    },
    {
      key: "thrustScale" as const,
      label: "Delivered thrust",
      distribution: { kind: "normal" as const, mean: 1, standardDeviation: 0.04, minimum: 0.85, maximum: 1.15 },
    },
    {
      key: "windScale" as const,
      label: "Wind profile",
      distribution: { kind: "uniform" as const, minimum: 0.8, maximum: 1.2 },
    },
    ...(inputs.recoveryEnabled
      ? [
          {
            key: "recoveryDragAreaScale" as const,
            label: "Recovery area",
            distribution: { kind: "triangular" as const, minimum: 0.8, mode: 1, maximum: 1.2 },
          },
          {
            key: "recoveryDeploymentSuccess" as const,
            label: "Recovery deployment",
            distribution: { kind: "bernoulli" as const, successProbability: inputs.recoveryDeploymentSuccessProbability },
          },
          {
            key: "recoveryDelayS" as const,
            label: "Recovery delay offset",
            distribution: { kind: "normal" as const, mean: 0, standardDeviation: 0.18, minimum: -0.3, maximum: 0.5 },
          },
        ]
      : []),
  ];
  return analyzeVerticalFlightUncertainty({
    baseConfig: createFlightConfig(inputs),
    seed,
    sampleCount,
    factors,
    correlations: filterUncertaintyCorrelations(uncertaintyCorrelations, factors.map((factor) => factor.key)),
    thresholds: [
      { id: "low-apogee", metric: "apogeeM", comparison: "less-than", value: 250 },
      ...(inputs.recoveryEnabled
        ? [{ id: "recovery-deployed", metric: "recoveryDeployed", comparison: "greater-than-or-equal" as const, value: 1 }]
        : []),
    ],
  });
}

function createSweepResult(
  inputs: Parameters<typeof createFlightConfig>[0],
  parameterKey: VerticalFlightSweepParameterKey,
  minimum: number,
  maximum: number,
  steps: number,
): VerticalFlightSweepResult {
  return sweepVerticalFlight({
    baseConfig: createFlightConfig(inputs),
    parameterKey,
    minimum,
    maximum,
    steps,
  });
}

function createOptimizationResult(
  inputs: Parameters<typeof createFlightConfig>[0] & Readonly<{
    uncertaintyCorrelations?: readonly ProjectUncertaintyCorrelation[];
    recoveryDeploymentSuccessProbability: number;
  }>,
  mode: "nominal" | "robust" = "nominal",
): DesignOptimizationResult {
  const robust = mode === "robust";
  const variables = [
    {
      key: "thrustScale" as const,
      label: "Motor thrust scale",
      minimum: 0.75,
      maximum: 1.3,
      initial: 1,
    },
    ...(inputs.recoveryEnabled
      ? [
          {
            key: "recoveryDragAreaScale" as const,
            label: "Recovery area scale",
            minimum: 0.65,
            maximum: 1.8,
            initial: 1,
          },
          {
            key: "recoveryDelayS" as const,
            label: "Recovery delay",
            minimum: 0,
            maximum: 5,
            initial: Math.min(5, inputs.recoveryDelay),
          },
        ]
      : []),
  ];
  return optimizeVerticalFlightDesign({
    baseConfig: createFlightConfig(inputs),
    seed: "arc54-optimizer-v1",
    populationSize: 16,
    generations: 8,
    variables,
    objectives: [
      { metricKey: "apogeeM", label: "Apogee", direction: "maximize", weight: 0.55 },
      { metricKey: "maxDynamicPressurePa", label: "Maximum dynamic pressure", direction: "minimize", weight: 0.15 },
      ...(inputs.recoveryEnabled
        ? [{ metricKey: "impactSpeedMps" as const, label: "Impact speed", direction: "minimize" as const, weight: 0.3 }]
        : []),
      ...(robust
        ? [
            { metricKey: "robustApogeeP05M" as const, label: "Robust apogee floor", direction: "maximize" as const, weight: 0.3 },
            { metricKey: "robustMaxDynamicPressureP95Pa" as const, label: "Robust maximum dynamic pressure", direction: "minimize" as const, weight: 0.2 },
            ...(inputs.recoveryEnabled
              ? [{ metricKey: "robustImpactSpeedP95Mps" as const, label: "Robust impact speed", direction: "minimize" as const, weight: 0.2 }]
              : []),
          ]
        : []),
    ],
    constraints: [
      { metricKey: "liftedOff", label: "Vehicle lifts off", relation: "greater-than-or-equal", limit: 1 },
      { metricKey: "completedFlight", label: "Simulation reaches impact", relation: "greater-than-or-equal", limit: 1 },
      { metricKey: "thrustToWeightAtIgnition", label: "Ignition thrust-to-weight", relation: "greater-than-or-equal", limit: 3 },
      { metricKey: "maxMach", label: "Preview-model Mach applicability", relation: "less-than-or-equal", limit: 0.85 },
      { metricKey: "maxDynamicPressurePa", label: "Dynamic-pressure guardrail", relation: "less-than-or-equal", limit: 25_000 },
      ...(inputs.recoveryEnabled
        ? [{ metricKey: "impactSpeedMps" as const, label: "Impact-speed guardrail", relation: "less-than-or-equal" as const, limit: 15 }]
        : []),
      ...(robust
        ? [
            { metricKey: "robustFailureRate" as const, label: "Robust scenario failure rate", relation: "less-than-or-equal" as const, limit: 0.25 },
            { metricKey: "robustMaxDynamicPressureP95Pa" as const, label: "Robust dynamic-pressure guardrail", relation: "less-than-or-equal" as const, limit: 30_000 },
            ...(inputs.recoveryEnabled
              ? [{ metricKey: "robustImpactSpeedP95Mps" as const, label: "Robust impact-speed guardrail", relation: "less-than-or-equal" as const, limit: 18 }]
              : []),
          ]
        : []),
    ],
    ...(robust
      ? {
          robustness: {
            sampleCount: 12,
            seed: "arc54-optimizer-robust-v1",
            factors: [
              { key: "dryMassScale" as const, label: "Dry mass", distribution: { kind: "triangular" as const, minimum: 0.97, mode: 1, maximum: 1.03 } },
              { key: "propellantMassScale" as const, label: "Propellant mass", distribution: { kind: "triangular" as const, minimum: 0.95, mode: 1, maximum: 1.05 } },
              { key: "dragCoefficientScale" as const, label: "Drag coefficient", distribution: { kind: "triangular" as const, minimum: 0.9, mode: 1, maximum: 1.1 } },
              { key: "thrustScale" as const, label: "Delivered thrust", distribution: { kind: "normal" as const, mean: 1, standardDeviation: 0.04, minimum: 0.85, maximum: 1.15 } },
              { key: "windScale" as const, label: "Wind profile", distribution: { kind: "uniform" as const, minimum: 0.8, maximum: 1.2 } },
              ...(inputs.recoveryEnabled
                ? [
                    { key: "recoveryDragAreaScale" as const, label: "Recovery area", distribution: { kind: "triangular" as const, minimum: 0.8, mode: 1, maximum: 1.2 } },
                    { key: "recoveryDeploymentSuccess" as const, label: "Recovery deployment", distribution: { kind: "bernoulli" as const, successProbability: inputs.recoveryDeploymentSuccessProbability } },
                    { key: "recoveryDelayS" as const, label: "Recovery delay offset", distribution: { kind: "normal" as const, mean: 0, standardDeviation: 0.18, minimum: -0.3, maximum: 0.5 } },
                  ]
                : []),
            ],
            correlations: filterUncertaintyCorrelations(
              inputs.uncertaintyCorrelations ?? [],
              ["dryMassScale", "propellantMassScale", "dragCoefficientScale", "thrustScale", "windScale", ...(inputs.recoveryEnabled ? ["recoveryDragAreaScale", "recoveryDeploymentSuccess", "recoveryDelayS"] : [])],
            ),
          },
        }
      : {}),
  });
}

type LandingPredictionInputs = Parameters<typeof createFlightConfig>[0] & Readonly<{
  recoveryDeploymentSuccessProbability: number;
  uncertaintyCorrelations?: readonly ProjectUncertaintyCorrelation[];
}>;

const LANDING_ASCENT_DRIFT_SUMMARY: LandingAscentDriftSummary = {
  modelVersion: ASCENT_DRIFT_MODEL_VERSION,
  label: "Ascent drift wind-drag proxy",
  description: "Scenario-specific horizontal position and velocity are integrated from the vertical trace to apogee before recovery descent.",
};

function createLandingPrediction(
  inputs: LandingPredictionInputs,
  flightResult: VerticalFlightResult,
): LandingDispersionResult | null {
  if (!(flightResult.apogeeM > 0)) return null;
  const motor = inputs.motorRecord ?? createPreviewMotorRecord({
    mass: inputs.mass,
    thrust: inputs.thrust,
    burnTime: inputs.burnTime,
  });
  const launchMassKg = inputs.mass;
  const descentMassKg = launchMassKg - motor.metrics.propellantMassKg;
  const site = {
    name: "ARC 54 synthetic range",
    latitudeDeg: -36.85,
    longitudeDeg: 174.76,
    elevationM: inputs.launchAltitude,
    datum: "WGS84" as const,
    timeZone: "Pacific/Auckland",
  };
  const parameters = [
    {
      key: "windScale",
      label: "Mean wind magnitude",
      distribution: { kind: "uniform" as const, minimum: 0.72, maximum: 1.28 },
    },
    {
      key: "windDirectionOffsetRad",
      label: "Wind direction offset",
      distribution: {
        kind: "normal" as const,
        mean: 0,
        standardDeviation: (8 * Math.PI) / 180,
        minimum: (-22 * Math.PI) / 180,
        maximum: (22 * Math.PI) / 180,
      },
    },
    {
      key: "turbulenceScale",
      label: "Turbulence intensity",
      distribution: { kind: "triangular" as const, minimum: 0.65, mode: 1, maximum: 1.4 },
    },
    {
      key: "descentMassScale",
      label: "Descent mass",
      distribution: { kind: "triangular" as const, minimum: 0.97, mode: 1, maximum: 1.03 },
    },
    ...(inputs.recoveryEnabled
      ? [
          {
            key: "recoveryAreaScale",
            label: "Canopy drag area",
            distribution: { kind: "triangular" as const, minimum: 0.8, mode: 1, maximum: 1.2 },
          },
          {
            key: "deploymentDelayOffsetS",
            label: "Deployment delay",
            distribution: { kind: "normal" as const, mean: 0, standardDeviation: 0.18, minimum: -0.3, maximum: 0.5 },
          },
          {
            key: "recoveryDeploymentSuccess",
            label: "Recovery deployment success",
            distribution: { kind: "bernoulli" as const, successProbability: inputs.recoveryDeploymentSuccessProbability },
          },
        ]
      : []),
  ];
  return analyzeRecoveryLandingDispersion({
    site,
    seed: "arc54-landing-v1",
    sampleCount: 24,
    parameters,
    correlations: filterUncertaintyCorrelations(inputs.uncertaintyCorrelations ?? [], parameters.map((parameter) => parameter.key)),
    deploymentScenario: inputs.recoveryEnabled
      ? {
          parameterKey: "recoveryDeploymentSuccess",
          label: "Recovery deployment",
        }
      : undefined,
    ascentDrift: LANDING_ASCENT_DRIFT_SUMMARY,
    descentForSample: (values, sampleIndex) => {
      const environment = createPreviewEnvironment(
        inputs.launchAltitude,
        inputs.windSpeed,
        {
          windAzimuthDeg: inputs.windAzimuthDeg,
          seed: `arc54-landing-weather-${sampleIndex}`,
          windScale: values.windScale,
          directionOffsetRad: values.windDirectionOffsetRad,
          turbulenceScale: values.turbulenceScale,
          relativeHumidityPercent: inputs.relativeHumidityPercent,
          surfacePressureHpa: inputs.surfacePressureHpa,
          surfaceTemperatureC: inputs.surfaceTemperatureC,
        },
      );
      const ascentDrift = estimateAscentWindDrift({
        trace: flightResult.trace,
        apogeeTimeS: flightResult.timeToApogeeS,
        environmentAt: environment.at,
        dragCoefficient: inputs.dragCoefficient,
        referenceAreaM2: Math.PI * Math.pow(inputs.diameter / 2000, 2),
        integration: { timeStepS: 0.02 },
      });
      return simulateRecoveryDescent({
        massKg: descentMassKg * values.descentMassScale,
        initialTimeS: flightResult.timeToApogeeS,
        initialPositionWorldM: {
          x: ascentDrift.positionWorldM.x,
          y: ascentDrift.positionWorldM.y,
          z: flightResult.apogeeM,
        },
        initialVelocityWorldMps: {
          x: ascentDrift.velocityWorldMps.x,
          y: ascentDrift.velocityWorldMps.y,
          z: 0,
        },
        environmentAt: environment.at,
        ballisticDragCoefficient: inputs.dragCoefficient,
        ballisticReferenceAreaM2:
          Math.PI * Math.pow(inputs.diameter / 2000, 2),
        recovery: inputs.recoveryEnabled && values.recoveryDeploymentSuccess === 1
          ? {
              dragCoefficient: BROWSER_RECOVERY_DRAG_COEFFICIENT,
              referenceAreaM2:
                Math.PI * Math.pow(inputs.recoveryDiameter / 2, 2) *
                values.recoveryAreaScale,
              deploymentDelayS: Math.max(
                0,
                inputs.recoveryDelay + values.deploymentDelayOffsetS,
              ),
              inflationTimeS: BROWSER_RECOVERY_INFLATION_TIME_S,
              reefingStages: createBrowserRecoveryReefingStages(inputs),
            }
          : undefined,
        integration: {
          timeStepS: 0.05,
          maximumDurationS: 600,
          traceIntervalS: 2,
        },
      });
    },
  });
}

type FlightMetricKey =
  | "altitude"
  | "speed"
  | "acceleration"
  | "mass"
  | "thrust"
  | "dynamicPressure";

type FlightMetricDefinition = Readonly<{
  key: FlightMetricKey;
  label: string;
  unit: string;
  color: string;
}>;

const FLIGHT_METRICS: readonly FlightMetricDefinition[] = [
  { key: "altitude", label: "Altitude", unit: "m", color: "#2f9fff" },
  { key: "speed", label: "Speed", unit: "m/s", color: "#ff7043" },
  { key: "acceleration", label: "Acceleration", unit: "m/s²", color: "#f4a340" },
  { key: "mass", label: "Mass", unit: "kg", color: "#a5c7d8" },
  { key: "thrust", label: "Thrust", unit: "N", color: "#ffb36b" },
  { key: "dynamicPressure", label: "Dynamic pressure", unit: "Pa", color: "#a78bfa" },
];

function flightMetricValue(
  point: VerticalFlightResult["trace"][number],
  key: FlightMetricKey,
): number {
  if (key === "altitude") return point.altitudeAglM;
  if (key === "speed") return point.velocityMps;
  if (key === "acceleration") return point.accelerationMps2;
  if (key === "mass") return point.massKg;
  if (key === "thrust") return point.thrustN;
  return point.dynamicPressurePa;
}

function formatFlightMetric(value: number, key: FlightMetricKey): string {
  if (key === "mass") return value.toFixed(3);
  if (key === "acceleration") return value.toFixed(2);
  if (key === "dynamicPressure") return value.toFixed(0);
  if (key === "thrust") return value.toFixed(1);
  return value.toFixed(1);
}

function FlightChart({ result }: { result: VerticalFlightResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [metric, setMetric] = useState<FlightMetricKey>("altitude");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const trace = result.trace;
  const definition = FLIGHT_METRICS.find((item) => item.key === metric)!;
  const maxTimeS = Math.max(trace.at(-1)?.timeS ?? result.totalFlightTimeS, 1);
  const metricValues = trace.map((point) => flightMetricValue(point, metric));
  const peakValue = metricValues.reduce(
    (peak, value) => Math.max(peak, value),
    metricValues[0] ?? 0,
  );
  const hoverPoint = hoverIndex === null ? null : trace[hoverIndex] ?? null;

  const selectMetricByKeyboard = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % FLIGHT_METRICS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + FLIGHT_METRICS.length) % FLIGHT_METRICS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = FLIGHT_METRICS.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    setMetric(FLIGHT_METRICS[nextIndex]!.key);
    setHoverIndex(null);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || trace.length === 0) return;

    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const padding = { top: 26, right: 60, bottom: 30, left: 60 };
      const plotWidth = Math.max(1, width - padding.left - padding.right);
      const plotHeight = Math.max(1, height - padding.top - padding.bottom);
      const values = trace.map((point) => flightMetricValue(point, metric));
      const rawMinimum = values.reduce((minimum, value) => Math.min(minimum, value), values[0] ?? 0);
      const rawMaximum = values.reduce((maximum, value) => Math.max(maximum, value), values[0] ?? 1);
      const range = Math.max(rawMaximum - rawMinimum, 1e-9);
      const domainMinimum = metric === "acceleration"
        ? rawMinimum - range * 0.08
        : Math.min(0, rawMinimum);
      const domainMaximum = rawMaximum + range * 0.08;
      const xForTime = (timeS: number) =>
        padding.left + Math.max(0, Math.min(1, timeS / maxTimeS)) * plotWidth;
      const yForValue = (value: number) =>
        padding.top + plotHeight -
        ((value - domainMinimum) / Math.max(domainMaximum - domainMinimum, 1e-9)) * plotHeight;

      context.clearRect(0, 0, width, height);
      context.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
      context.lineWidth = 1;
      context.strokeStyle = "rgba(125, 158, 182, 0.16)";
      context.fillStyle = "#718795";
      for (let index = 0; index <= 4; index += 1) {
        const fraction = index / 4;
        const y = padding.top + plotHeight * fraction;
        const value = domainMaximum - (domainMaximum - domainMinimum) * fraction;
        context.beginPath();
        context.moveTo(padding.left, y);
        context.lineTo(width - padding.right, y);
        context.stroke();
        context.fillText(`${formatFlightMetric(value, metric)} ${definition.unit}`, 4, y + 3);
      }
      context.fillText("0 s", padding.left, height - 8);
      context.fillText(`${maxTimeS.toFixed(1)} s`, width - padding.right - 34, height - 8);

      const coordinates = trace.map((point) => ({
        x: xForTime(point.timeS),
        y: yForValue(flightMetricValue(point, metric)),
      }));
      const gradient = context.createLinearGradient(0, padding.top, 0, height);
      gradient.addColorStop(0, `${definition.color}45`);
      gradient.addColorStop(1, `${definition.color}04`);
      context.beginPath();
      context.moveTo(coordinates[0]!.x, padding.top + plotHeight);
      coordinates.forEach((point) => context.lineTo(point.x, point.y));
      context.lineTo(coordinates.at(-1)!.x, padding.top + plotHeight);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();
      context.beginPath();
      coordinates.forEach((point, index) =>
        index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
      );
      context.strokeStyle = definition.color;
      context.lineWidth = 2.2;
      context.lineJoin = "round";
      context.stroke();

      for (const event of result.events) {
        const x = xForTime(event.timeS);
        context.save();
        context.setLineDash([3, 4]);
        context.strokeStyle = event.type === "recovery_deploy"
          ? "rgba(167,139,250,.72)"
          : event.type === "burnout"
            ? "rgba(244,163,64,.72)"
            : "rgba(47,159,255,.62)";
        context.beginPath();
        context.moveTo(x, padding.top);
        context.lineTo(x, padding.top + plotHeight);
        context.stroke();
        context.restore();
      }

      if (hoverIndex !== null && coordinates[hoverIndex]) {
        const point = coordinates[hoverIndex]!;
        context.save();
        context.strokeStyle = "rgba(236,245,249,.52)";
        context.setLineDash([2, 3]);
        context.beginPath();
        context.moveTo(point.x, padding.top);
        context.lineTo(point.x, padding.top + plotHeight);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = definition.color;
        context.beginPath();
        context.arc(point.x, point.y, 4, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    };

    draw();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [definition.color, definition.unit, hoverIndex, maxTimeS, metric, result.events, trace]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (trace.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const paddingLeft = 60;
    const paddingRight = 60;
    const usableWidth = Math.max(1, bounds.width - paddingLeft - paddingRight);
    const normalizedX = Math.max(0, Math.min(1, (event.clientX - bounds.left - paddingLeft) / usableWidth));
    const targetTimeS = normalizedX * maxTimeS;
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    trace.forEach((point, index) => {
      const distance = Math.abs(point.timeS - targetTimeS);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setHoverIndex(nearestIndex);
  };

  if (trace.length === 0) {
    return <div className="stage-flight-profile-empty">No flight trace samples were returned for this run.</div>;
  }

  return (
    <section className="stage-flight-profile vertical-flight-profile" aria-labelledby="vertical-flight-profile-title">
      <div className="stage-flight-profile-heading">
        <div>
          <span className="eyebrow">Trace inspector</span>
          <h4 id="vertical-flight-profile-title">Vertical flight profile</h4>
          <p>Switch metrics, inspect event markers, and scrub the current numerical trace.</p>
        </div>
        <div className="stage-flight-profile-tabs" role="tablist" aria-label="Vertical flight trace metric">
          {FLIGHT_METRICS.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={metric === item.key}
              tabIndex={metric === item.key ? 0 : -1}
              className={metric === item.key ? "active" : ""}
              onClick={() => { setMetric(item.key); setHoverIndex(null); }}
              onKeyDown={(event) => selectMetricByKeyboard(event, index)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="stage-flight-profile-plot">
        <canvas
          ref={canvasRef}
          className="stage-flight-chart"
          aria-label={`${definition.label} over time`}
          role="img"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        />
        {hoverPoint && (
          <div className="stage-flight-hover" aria-live="polite">
            <span>{definition.label}</span>
            <strong>{formatFlightMetric(flightMetricValue(hoverPoint, metric), metric)} {definition.unit}</strong>
            <small>t {hoverPoint.timeS.toFixed(2)} s · altitude {hoverPoint.altitudeAglM.toFixed(1)} m</small>
          </div>
        )}
      </div>
      <div className="stage-flight-profile-footer">
        <span><i className="profile-key-line" style={{ background: definition.color }} />Peak {formatFlightMetric(peakValue, metric)} {definition.unit}</span>
        <span><i className="profile-key-event" />{result.events.length} events · {trace.length} samples</span>
      </div>
    </section>
  );
}

type FlightComparisonMetricKey =
  | "apogeeM"
  | "maxSpeedMps"
  | "maxDynamicPressurePa"
  | "timeToApogeeS"
  | "totalFlightTimeS"
  | "impactSpeedMps";

type FlightComparisonMetricDefinition = Readonly<{
  key: FlightComparisonMetricKey;
  label: string;
  unit: string;
  decimals: number;
  value: (result: VerticalFlightResult) => number | null;
}>;

const FLIGHT_COMPARISON_METRICS: readonly FlightComparisonMetricDefinition[] = [
  { key: "apogeeM", label: "Apogee", unit: "m", decimals: 1, value: (result) => result.apogeeM },
  { key: "maxSpeedMps", label: "Maximum speed", unit: "m/s", decimals: 1, value: (result) => result.maxSpeedMps },
  { key: "maxDynamicPressurePa", label: "Maximum q", unit: "Pa", decimals: 0, value: (result) => result.maxDynamicPressurePa },
  { key: "timeToApogeeS", label: "Time to apogee", unit: "s", decimals: 2, value: (result) => result.timeToApogeeS },
  { key: "totalFlightTimeS", label: "Total flight", unit: "s", decimals: 2, value: (result) => result.totalFlightTimeS },
  { key: "impactSpeedMps", label: "Impact speed", unit: "m/s", decimals: 1, value: (result) => result.impactSpeedMps },
];

function formatComparisonValue(
  value: number | null,
  definition: FlightComparisonMetricDefinition,
): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${value.toFixed(definition.decimals)} ${definition.unit}`;
}

function formatComparisonDelta(
  current: number | null,
  reference: number | null,
  definition: FlightComparisonMetricDefinition,
): string {
  if (current === null || reference === null || !Number.isFinite(current) || !Number.isFinite(reference)) {
    return "—";
  }
  const delta = current - reference;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(definition.decimals)} ${definition.unit}`;
}

function FlightComparisonCard({
  current,
  reference,
  referenceFingerprint,
  currentFingerprint,
  resultIsCurrent,
  running,
  onPin,
  onClear,
}: {
  current: VerticalFlightResult;
  reference: VerticalFlightResult | null;
  referenceFingerprint: string | null;
  currentFingerprint: string | null;
  resultIsCurrent: boolean;
  running: boolean;
  onPin: () => void;
  onClear: () => void;
}) {
  const exactReference = resultIsCurrent && reference !== null && referenceFingerprint !== null && referenceFingerprint === currentFingerprint;
  const currentLabel = resultIsCurrent ? "Current result" : "Last result · rerun required";
  return (
    <section className="flight-comparison-card" aria-labelledby="flight-comparison-title">
      <div className="flight-comparison-heading">
        <div>
          <span className="eyebrow">Design delta</span>
          <h4 id="flight-comparison-title">Run comparison</h4>
          <p>Pin a reference run, change the vehicle or environment, then rerun to see the numerical delta without losing the original trace.</p>
        </div>
        <div className="flight-comparison-actions">
          <span className={exactReference ? "flight-comparison-state same" : reference ? resultIsCurrent ? "flight-comparison-state ready" : "flight-comparison-state stale" : "flight-comparison-state empty"}>
            {exactReference ? "Reference = current" : reference ? resultIsCurrent ? "Delta ready" : "Rerun required" : "No reference pinned"}
          </span>
          <button type="button" onClick={onPin} disabled={running || !resultIsCurrent}>
            {reference ? "Replace reference" : "Pin current run"}
          </button>
          {reference && <button type="button" className="flight-comparison-clear" onClick={onClear}>Clear</button>}
        </div>
      </div>
      {reference ? (
        <>
          <div className="flight-comparison-table" role="table" aria-label="Vertical flight run comparison">
            <div className="flight-comparison-row flight-comparison-row-header" role="row">
              <span role="columnheader">Metric</span>
              <span role="columnheader">Reference</span>
              <span role="columnheader">{currentLabel}</span>
              <span role="columnheader">Delta</span>
            </div>
            {FLIGHT_COMPARISON_METRICS.map((definition) => {
              const referenceValue = definition.value(reference);
              const currentValue = definition.value(current);
              const delta = currentValue !== null && referenceValue !== null ? currentValue - referenceValue : null;
              return (
                <div className="flight-comparison-row" role="row" key={definition.key}>
                  <span role="cell">{definition.label}</span>
                  <span role="cell">{formatComparisonValue(referenceValue, definition)}</span>
                  <span role="cell">{formatComparisonValue(currentValue, definition)}</span>
                  <strong className={delta === null ? "" : delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral"} role="cell">
                    {formatComparisonDelta(currentValue, referenceValue, definition)}
                  </strong>
                </div>
              );
            })}
          </div>
          <p className="flight-comparison-note">Changes are computed from the deterministic vertical preview. A stale result is labeled explicitly until the current inputs are simulated; this comparison does not add validation or flight-safety evidence.</p>
        </>
      ) : (
        <div className="flight-comparison-empty">
          <strong>Keep a design decision visible</strong>
          <span>Pin the current estimate before trying a motor, geometry, recovery, or weather change.</span>
        </div>
      )}
    </section>
  );
}

const FLIGHT_DATA_METRIC_DISPLAY: Readonly<Record<"altitudeM" | "velocityMps" | "accelerationMps2", Readonly<{ label: string; unit: string; decimals: number }>>> = {
  altitudeM: { label: "Altitude", unit: "m", decimals: 2 },
  velocityMps: { label: "Velocity", unit: "m/s", decimals: 2 },
  accelerationMps2: { label: "Acceleration", unit: "m/s²", decimals: 2 },
};

function formatFlightDataMetric(value: number, metric: keyof typeof FLIGHT_DATA_METRIC_DISPLAY) {
  const definition = FLIGHT_DATA_METRIC_DISPLAY[metric];
  return `${value.toFixed(definition.decimals)} ${definition.unit}`;
}

function FlightDataComparisonCard({
  series,
  comparison,
  error,
  resultIsCurrent,
  traceSource,
  coupledTraceAvailable,
  onTraceSourceChange,
  timeOffsetS,
  onTimeOffsetChange,
  onExport,
  onImport,
  onClear,
}: {
  series: FlightDataSeries | null;
  comparison: FlightDataComparisonResult | null;
  error: string;
  resultIsCurrent: boolean;
  traceSource: FlightDataTraceSource;
  coupledTraceAvailable: boolean;
  onTraceSourceChange: (source: FlightDataTraceSource) => void;
  timeOffsetS: number;
  onTimeOffsetChange: (value: number) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  return (
    <section className="flight-data-card" aria-labelledby="flight-data-title">
      <div className="flight-data-heading">
        <div>
          <span className="eyebrow">Measured-data check</span>
          <h4 id="flight-data-title">Compare an instrumented flight</h4>
          <p>Load a simple SI CSV log to inspect model residuals against measured altitude, velocity, or acceleration. Choose the vertical or coupled 6DOF trace; the file stays in this browser session.</p>
        </div>
        <div className="flight-data-actions">
          <label className="flight-data-import-button">
            <input type="file" accept=".csv,text/csv" onChange={onImport} />
            {series ? "Replace CSV" : "Import CSV"}
          </label>
          {comparison && <button type="button" onClick={onExport}>Export residuals</button>}
          {series && <button type="button" className="flight-data-clear" onClick={onClear}>Clear</button>}
        </div>
      </div>
      {error && <div className="flight-data-error" role="alert">{error}</div>}
      {!series && !error && (
        <div className="flight-data-empty">
          <strong>Bring your own telemetry</strong>
          <span>Required column: <code>time_s</code>. Optional columns: <code>altitude_m</code>, <code>velocity_mps</code>, <code>acceleration_mps2</code>.</span>
        </div>
      )}
      {series && !comparison && !error && (
        <div className="flight-data-empty flight-data-stale">
          <strong>Rerun required</strong>
          <span>{resultIsCurrent ? "The imported log has no overlapping supported metrics." : "Rerun the current flight estimate before comparing measured data."}</span>
        </div>
      )}
      {series && (
        <div className="flight-data-controls">
          <label htmlFor="flight-data-trace-source">Compare against</label>
          <select id="flight-data-trace-source" value={traceSource} onChange={(event) => onTraceSourceChange(event.target.value as FlightDataTraceSource)}>
            <option value="vertical-1d">Vertical 1D estimate</option>
            <option value="coupled-6dof" disabled={!coupledTraceAvailable}>Coupled 6DOF trace{coupledTraceAvailable ? "" : " · run required"}</option>
          </select>
          <label htmlFor="flight-data-time-offset">Measured time offset</label>
          <input id="flight-data-time-offset" type="number" value={timeOffsetS} min={-600} max={600} step={0.01} onChange={(event) => onTimeOffsetChange(Number(event.target.value))} />
          <span>s</span>
          <small>Simulation time = measured time + offset</small>
        </div>
      )}
      {comparison && (
        <>
          <div className="flight-data-meta">
            <span><strong>{comparison.sourceName}</strong> · {comparison.matchedSampleCount}/{comparison.measuredSampleCount} samples matched</span>
            <span>{comparison.traceSource === "coupled-6dof" ? "coupled 6DOF" : "vertical 1D"} · time offset {comparison.timeOffsetS.toFixed(2)} s · {comparison.validationStatus}</span>
          </div>
          <div className="flight-data-table" role="table" aria-label="Measured flight data comparison">
            <div className="flight-data-row flight-data-row-header" role="row">
              <span role="columnheader">Metric</span>
              <span role="columnheader">Mean residual</span>
              <span role="columnheader">RMSE</span>
              <span role="columnheader">P95 |residual|</span>
            </div>
            {(Object.keys(FLIGHT_DATA_METRIC_DISPLAY) as Array<keyof typeof FLIGHT_DATA_METRIC_DISPLAY>).map((metric) => {
              const summary = comparison.metrics[metric];
              if (!summary) return null;
              const display = FLIGHT_DATA_METRIC_DISPLAY[metric];
              return (
                <div className="flight-data-row" role="row" key={metric}>
                  <span role="cell">{display.label} <small>n={summary.sampleCount}</small></span>
                  <strong role="cell" className={summary.meanResidual > 0 ? "positive" : summary.meanResidual < 0 ? "negative" : "neutral"}>{formatFlightDataMetric(summary.meanResidual, metric)}</strong>
                  <span role="cell">{formatFlightDataMetric(summary.rootMeanSquareError, metric)}</span>
                  <span role="cell">{formatFlightDataMetric(summary.p95AbsoluteResidual, metric)}</span>
                </div>
              );
            })}
          </div>
          {comparison.warnings.length > 0 && <div className="flight-data-warnings"><strong>Coverage notes</strong>{comparison.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
          <p className="flight-data-note">Residuals are simulated minus measured and use linear interpolation between trace samples. This is an engineering diagnostic, not validation, certification, or flight-safety evidence.</p>
        </>
      )}
    </section>
  );
}

function PhysicsBenchmarkCard({
  result,
  running,
  onRun,
}: {
  result: PhysicsBenchmarkSuiteResult | null;
  running: boolean;
  onRun: () => void;
}) {
  return (
    <section className="benchmark-card" aria-labelledby="benchmark-title">
      <div className="benchmark-heading">
        <div>
          <span className="eyebrow">Evidence lane</span>
          <h4 id="benchmark-title">Deterministic physics benchmarks</h4>
          <p>Re-run fixed SI anchors and closed-form fixtures against the original calculation modules before interpreting a design result.</p>
        </div>
        <button type="button" className="benchmark-run" onClick={onRun} disabled={running}>
          {running ? "Running…" : result ? "Run again" : "Run benchmarks"}
        </button>
      </div>
      {!result ? (
        <div className="benchmark-empty"><strong>Regression evidence is on demand</strong><span>These checks are mathematical regression signals, not experimental validation or flight-safety evidence.</span></div>
      ) : (
        <>
          <div className="benchmark-meta">
            <span className={`benchmark-status benchmark-status-${result.status}`}>{result.status === "pass" ? "All fixtures pass" : "Review failed fixtures"}</span>
            <strong>{result.passedCount}/{result.totalCount}</strong>
            <span>{result.modelVersion}</span>
          </div>
          <div className="benchmark-table" role="table" aria-label="Physics benchmark results">
            <div className="benchmark-row benchmark-row-header" role="row">
              <span role="columnheader">Fixture</span>
              <span role="columnheader">Observed</span>
              <span role="columnheader">Absolute error</span>
              <span role="columnheader">Tolerance</span>
            </div>
            {result.cases.map((benchmark) => (
              <div className="benchmark-row" role="row" key={benchmark.id}>
                <span role="cell"><strong>{benchmark.label}</strong><small>{benchmark.metric} · {benchmark.unit}</small></span>
                <span role="cell">{benchmark.observed.toFixed(Math.max(3, benchmark.expected === 0 ? 3 : 6))}</span>
                <span role="cell" className={benchmark.passed ? "benchmark-pass" : "benchmark-fail"}>{benchmark.absoluteError.toExponential(2)}</span>
                <span role="cell">{benchmark.tolerance.toExponential(1)}</span>
              </div>
            ))}
          </div>
          {result.warnings.map((warning) => <p className="benchmark-warning" key={warning}>{warning}</p>)}
        </>
      )}
    </section>
  );
}

type StageFlightMetricKey =
  | "altitude"
  | "speed"
  | "mach"
  | "angleOfAttack"
  | "sideslip"
  | "dynamicPressure"
  | "drag"
  | "aerodynamicForce"
  | "aerodynamicMoment"
  | "aerodynamicDampingMoment"
  | "recoveryDrag"
  | "recoveryArea"
  | "mass"
  | "thrust";

type StageFlightMetricDefinition = Readonly<{
  key: StageFlightMetricKey;
  label: string;
  unit: string;
  color: string;
}>;

const STAGE_FLIGHT_METRICS: readonly StageFlightMetricDefinition[] = [
  { key: "altitude", label: "Altitude", unit: "m", color: "#2f9fff" },
  { key: "speed", label: "Speed", unit: "m/s", color: "#ff7043" },
  { key: "mach", label: "Mach", unit: "M", color: "#b58cff" },
  { key: "angleOfAttack", label: "AoA", unit: "deg", color: "#ff9b71" },
  { key: "sideslip", label: "Sideslip", unit: "deg", color: "#86d8ff" },
  { key: "dynamicPressure", label: "Dynamic pressure", unit: "Pa", color: "#45d6b0" },
  { key: "drag", label: "Axial drag", unit: "N", color: "#e9c46a" },
  { key: "aerodynamicForce", label: "Aero force", unit: "N", color: "#f5c76b" },
  { key: "aerodynamicMoment", label: "Aero moment", unit: "N·m", color: "#f28f6f" },
  { key: "aerodynamicDampingMoment", label: "Damping moment", unit: "N·m", color: "#b58cff" },
  { key: "recoveryDrag", label: "Recovery drag", unit: "N", color: "#c084fc" },
  { key: "recoveryArea", label: "Canopy area", unit: "m²", color: "#60a5fa" },
  { key: "mass", label: "Mass", unit: "kg", color: "#a5c7d8" },
  { key: "thrust", label: "Thrust", unit: "N", color: "#f4a340" },
];

function stageFlightMetricValue(
  point: StageFlightPreviewResult["trace"][number],
  key: StageFlightMetricKey,
): number {
  if (key === "altitude") return point.altitudeAglM;
  if (key === "speed") return point.speedMps;
  if (key === "mach") return point.mach;
  if (key === "angleOfAttack") return (point.angleOfAttackRad * 180) / Math.PI;
  if (key === "sideslip") return (point.sideslipRad * 180) / Math.PI;
  if (key === "dynamicPressure") return point.dynamicPressurePa;
  if (key === "drag") return point.dragN;
  if (key === "aerodynamicForce") return point.aerodynamicForceN ?? 0;
  if (key === "aerodynamicMoment") return point.aerodynamicMomentNm ?? 0;
  if (key === "aerodynamicDampingMoment") return point.aerodynamicDampingMomentNm ?? 0;
  if (key === "recoveryDrag") return point.recoveryDragN;
  if (key === "recoveryArea") return point.recoveryEffectiveAreaM2;
  if (key === "mass") return point.massKg;
  return point.thrustN;
}

function formatStageFlightMetric(value: number, key: StageFlightMetricKey): string {
  if (key === "mass") return value.toFixed(3);
  if (key === "mach") return value.toFixed(3);
  if (key === "angleOfAttack" || key === "sideslip") return value.toFixed(2);
  if (key === "dynamicPressure") return value.toFixed(0);
  if (key === "recoveryArea") return value.toFixed(3);
  if (key === "aerodynamicMoment" || key === "aerodynamicDampingMoment") return value.toFixed(3);
  if (key === "thrust") return value.toFixed(1);
  if (key === "drag") return value.toFixed(1);
  return value.toFixed(1);
}

function formatOpeningLoadValue(
  value: number | null,
  decimals: number,
  unit: string,
): string {
  return value === null ? "Unavailable" : `${value.toFixed(decimals)} ${unit}`;
}

function formatSignedMetric(value: number, decimals = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}`;
}

function formatConvergenceStatus(
  status: UncertaintyAnalysisResult["convergence"]["status"],
): string {
  if (status === "converged") return "Converged heuristic";
  if (status === "watch") return "Watch sample stability";
  return "Insufficient samples";
}

function formatStageFlightConvergenceStatus(
  status: StageFlightPreviewResult["convergence"]["status"],
): string {
  if (status === "converged") return "Step-stable heuristic";
  if (status === "watch") return "Step sensitivity watch";
  return "Not assessed";
}

function formatRelativeDifference(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatAbsoluteDifference(value: number | null, unit: string, decimals = 2): string {
  return value === null ? "—" : `${value.toFixed(decimals)} ${unit}`;
}

function separationAuditStatus(
  audits: readonly SeparationDynamicsResult[],
): SeparationDynamicsResult["status"] {
  if (audits.some((audit) => audit.status === "review")) return "review";
  if (audits.length > 0 && audits.every((audit) => audit.status === "balanced")) return "balanced";
  return "unavailable";
}

function coupledImpulseStatus(
  solutions: readonly CoupledSeparationImpulseResult[],
): CoupledSeparationImpulseResult["status"] {
  if (solutions.some((solution) => solution.status === "review")) return "review";
  if (solutions.length > 0 && solutions.every((solution) => solution.status === "balanced")) return "balanced";
  return "unavailable";
}

function maximumNullableMetric(
  values: readonly (number | null)[],
): number | null {
  const finiteValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finiteValues.length > 0 ? Math.max(...finiteValues) : null;
}

function StageFlightProfileChart({ result }: { result: StageFlightPreviewResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [metric, setMetric] = useState<StageFlightMetricKey>("altitude");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const trace = result.trace;
  const definition = STAGE_FLIGHT_METRICS.find((item) => item.key === metric)!;
  const maxTimeS = Math.max(trace.at(-1)?.timeS ?? 0, 1);
  const metricValues = trace.map((point) => stageFlightMetricValue(point, metric));
  const peakValue = metricValues.length > 0 ? Math.max(...metricValues) : 0;
  const hoverPoint = hoverIndex === null ? null : trace[hoverIndex] ?? null;
  const summaryId = "stage-flight-profile-summary";
  const selectMetricByKeyboard = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % STAGE_FLIGHT_METRICS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + STAGE_FLIGHT_METRICS.length) % STAGE_FLIGHT_METRICS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = STAGE_FLIGHT_METRICS.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    setMetric(STAGE_FLIGHT_METRICS[nextIndex]!.key);
    setHoverIndex(null);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || trace.length === 0) return;

    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const padding = { top: 26, right: 52, bottom: 30, left: 52 };
      const plotWidth = Math.max(1, width - padding.left - padding.right);
      const plotHeight = Math.max(1, height - padding.top - padding.bottom);
      const values = trace.map((point) => stageFlightMetricValue(point, metric));
      const rawMinimum = Math.min(...values, 0);
      const rawMaximum = Math.max(...values, 1);
      const range = Math.max(rawMaximum - rawMinimum, 1e-9);
      const domainMinimum = metric === "mass"
        ? Math.max(0, rawMinimum - range * 0.06)
        : rawMinimum;
      const domainMaximum = rawMaximum + range * 0.08;
      const xForTime = (timeS: number) =>
        padding.left + Math.max(0, Math.min(1, timeS / maxTimeS)) * plotWidth;
      const yForValue = (value: number) =>
        padding.top + plotHeight -
        ((value - domainMinimum) / Math.max(domainMaximum - domainMinimum, 1e-9)) * plotHeight;

      context.clearRect(0, 0, width, height);
      context.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
      context.lineWidth = 1;
      context.strokeStyle = "rgba(125, 158, 182, 0.16)";
      context.fillStyle = "#718795";
      for (let index = 0; index <= 4; index += 1) {
        const fraction = index / 4;
        const y = padding.top + plotHeight * fraction;
        const value = domainMaximum - (domainMaximum - domainMinimum) * fraction;
        context.beginPath();
        context.moveTo(padding.left, y);
        context.lineTo(width - padding.right, y);
        context.stroke();
        context.fillText(`${formatStageFlightMetric(value, metric)} ${definition.unit}`, 4, y + 3);
      }

      context.fillStyle = "#718795";
      context.fillText("0 s", padding.left, height - 8);
      context.fillText(`${maxTimeS.toFixed(1)} s`, width - padding.right - 34, height - 8);

      const coordinates = trace.map((point) => ({
        x: xForTime(point.timeS),
        y: yForValue(stageFlightMetricValue(point, metric)),
      }));
      const gradient = context.createLinearGradient(0, padding.top, 0, height);
      gradient.addColorStop(0, `${definition.color}45`);
      gradient.addColorStop(1, `${definition.color}04`);
      context.beginPath();
      context.moveTo(coordinates[0]!.x, padding.top + plotHeight);
      coordinates.forEach((point) => context.lineTo(point.x, point.y));
      context.lineTo(coordinates.at(-1)!.x, padding.top + plotHeight);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();
      context.beginPath();
      coordinates.forEach((point, index) =>
        index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
      );
      context.strokeStyle = definition.color;
      context.lineWidth = 2.2;
      context.lineJoin = "round";
      context.stroke();

      for (const event of result.events) {
        const x = xForTime(event.timeS);
        context.save();
        context.setLineDash([3, 4]);
        context.strokeStyle = event.kind === "rail"
          ? "rgba(255,112,67,.72)"
          : event.kind === "scheduled"
            ? "rgba(244,163,64,.72)"
            : "rgba(47,159,255,.7)";
        context.beginPath();
        context.moveTo(x, padding.top);
        context.lineTo(x, padding.top + plotHeight);
        context.stroke();
        context.restore();
      }

      if (hoverIndex !== null && coordinates[hoverIndex]) {
        const point = coordinates[hoverIndex]!;
        context.save();
        context.strokeStyle = "rgba(236,245,249,.52)";
        context.setLineDash([2, 3]);
        context.beginPath();
        context.moveTo(point.x, padding.top);
        context.lineTo(point.x, padding.top + plotHeight);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = definition.color;
        context.beginPath();
        context.arc(point.x, point.y, 4, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    };

    draw();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [definition.color, definition.unit, hoverIndex, maxTimeS, metric, result.events, trace]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (trace.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const paddingLeft = 52;
    const paddingRight = 52;
    const usableWidth = Math.max(1, bounds.width - paddingLeft - paddingRight);
    const normalizedX = Math.max(0, Math.min(1, (event.clientX - bounds.left - paddingLeft) / usableWidth));
    const targetTimeS = normalizedX * maxTimeS;
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    trace.forEach((point, index) => {
      const distance = Math.abs(point.timeS - targetTimeS);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setHoverIndex(nearestIndex);
  };

  if (trace.length === 0) {
    return <div className="stage-flight-profile-empty">No staged trace samples were returned for this run.</div>;
  }

  return (
    <section className="stage-flight-profile" aria-labelledby="stage-flight-profile-title">
      <div className="stage-flight-profile-heading">
        <div>
          <span className="eyebrow">Trace inspector</span>
          <h4 id="stage-flight-profile-title">Stage flight profile</h4>
          <p>Read the retained-vehicle trace across rail release, staging events, and free flight, including attitude and aero-load envelopes.</p>
        </div>
        <div className="stage-flight-profile-tabs" role="tablist" aria-label="Stage flight trace metric">
          {STAGE_FLIGHT_METRICS.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={metric === item.key}
              className={metric === item.key ? "active" : ""}
              onKeyDown={(event) => selectMetricByKeyboard(event, index)}
              onClick={() => { setMetric(item.key); setHoverIndex(null); }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="stage-flight-profile-plot">
        <canvas
          ref={canvasRef}
          className="stage-flight-chart"
          role="img"
          aria-label={`${definition.label} over time for the staged flight preview`}
          aria-describedby={summaryId}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        />
        {hoverPoint && (
          <div className="stage-flight-hover" aria-live="polite">
            <span>{hoverPoint.timeS.toFixed(2)} s</span>
            <strong>{formatStageFlightMetric(stageFlightMetricValue(hoverPoint, metric), metric)} {definition.unit}</strong>
            <small>{hoverPoint.attachedStageIds.join(" + ") || "No attached stage"}</small>
          </div>
        )}
      </div>
      <div className="stage-flight-profile-footer">
        <span><i className="profile-key-line" style={{ background: definition.color }} />{definition.label} · peak {formatStageFlightMetric(peakValue, metric)} {definition.unit}</span>
        <span><i className="profile-key-event" />{result.events.length} event markers · {trace.length} samples</span>
      </div>
      <p className="sr-only" id={summaryId}>
        The staged flight trace contains {trace.length} samples over {maxTimeS.toFixed(2)} seconds. The selected {definition.label.toLowerCase()} reaches {formatStageFlightMetric(peakValue, metric)} {definition.unit}. Event markers include rail release and any accepted staging or failure transitions. This is an unvalidated engineering preview.
      </p>
    </section>
  );
}

type AerodynamicInspectorSurfaceId =
  | "dragCoefficient"
  | "normalForceSlopePerRad"
  | "centerOfPressureXM"
  | "rollDamping"
  | "pitchDamping"
  | "yawDamping";

type AerodynamicInspectorSurfaceDefinition = Readonly<{
  id: AerodynamicInspectorSurfaceId;
  label: string;
  unit: string;
  decimals: number;
  read: (table: AerodynamicCoefficientTableDefinition) => CoefficientSurface | undefined;
}>;

const AERODYNAMIC_INSPECTOR_SURFACES: readonly AerodynamicInspectorSurfaceDefinition[] = [
  {
    id: "dragCoefficient",
    label: "Drag coefficient (Cd)",
    unit: "dimensionless",
    decimals: 3,
    read: (table) => table.dragCoefficient,
  },
  {
    id: "normalForceSlopePerRad",
    label: "Normal-force slope (Cα)",
    unit: "1 / rad",
    decimals: 2,
    read: (table) => table.normalForceSlopePerRad,
  },
  {
    id: "centerOfPressureXM",
    label: "Center of pressure (xCP)",
    unit: "m from reference",
    decimals: 3,
    read: (table) => table.centerOfPressureXM,
  },
  {
    id: "rollDamping",
    label: "Roll damping derivative (Clp)",
    unit: "1 / rad",
    decimals: 4,
    read: (table) => table.dampingDerivativeBody?.roll,
  },
  {
    id: "pitchDamping",
    label: "Pitch damping derivative (Cmq)",
    unit: "1 / rad",
    decimals: 4,
    read: (table) => table.dampingDerivativeBody?.pitch,
  },
  {
    id: "yawDamping",
    label: "Yaw damping derivative (Cnr)",
    unit: "1 / rad",
    decimals: 4,
    read: (table) => table.dampingDerivativeBody?.yaw,
  },
];

function formatAerodynamicInspectorValue(value: number, definition: AerodynamicInspectorSurfaceDefinition) {
  return `${value.toFixed(definition.decimals)} ${definition.unit}`;
}

function AerodynamicTableInspector({ table }: { table: AerodynamicCoefficientTableDefinition }) {
  const availableSurfaces = AERODYNAMIC_INSPECTOR_SURFACES.filter(
    (definition) => definition.read(table) !== undefined,
  );
  const [surfaceId, setSurfaceId] = useState<AerodynamicInspectorSurfaceId>("dragCoefficient");
  const selectedSurface = availableSurfaces.find((definition) => definition.id === surfaceId) ?? availableSurfaces[0];
  if (!selectedSurface) return null;
  const surface = selectedSurface.read(table);
  if (!surface) return null;
  const hasUncertainty = surface.absoluteUncertainty !== undefined;
  const hasAngularVolume =
    table.angleOfAttackPointsRad !== undefined &&
    table.sideslipPointsRad !== undefined &&
    [
      table.dragCoefficientByAngle,
      table.normalForceSlopePerRadByAngle,
      table.centerOfPressureXMByAngle,
      table.dampingDerivativeBodyByAngle,
      table.forceCoefficientBodyByAngle,
      table.momentCoefficientBodyByAngle,
    ].some((value) => value !== undefined);
  const hasForceMomentDatabase =
    table.forceCoefficientBodyByAngle !== undefined ||
    table.momentCoefficientBodyByAngle !== undefined;
  return (
    <section className="aerodynamic-inspector" aria-labelledby="aerodynamic-inspector-title">
      <div className="aerodynamic-inspector-heading">
        <div>
          <span className="eyebrow">Inspectable surface</span>
          <h3 id="aerodynamic-inspector-title">{table.name}</h3>
          <p>Review the supplied Mach / Reynolds grid before it drives a flight estimate. Rows are Reynolds points; columns are Mach points.{hasAngularVolume ? " This record also carries optional angle-of-attack and sideslip volumes for the consuming flight condition." : ""}{hasForceMomentDatabase ? " Direct body-axis force/moment coefficients are also available to the 6DOF load path." : ""}</p>
        </div>
        <span className="model-badge">{table.provenance.validationStatus}</span>
      </div>
      <div className="aerodynamic-inspector-controls">
        <label htmlFor="aerodynamic-inspector-surface">Surface
          <select id="aerodynamic-inspector-surface" value={selectedSurface.id} onChange={(event) => setSurfaceId(event.target.value as AerodynamicInspectorSurfaceId)}>
            {availableSurfaces.map((definition) => <option key={definition.id} value={definition.id}>{definition.label}</option>)}
          </select>
        </label>
        <div><span>Interpolation</span><strong>{hasAngularVolume ? "α / β linear · Mach linear · log10 Reynolds" : "Mach linear · log10 Reynolds"}</strong></div>
        <div><span>6DOF source</span><strong>{hasForceMomentDatabase ? "Direct force / moment volumes" : "Drag / normal / CP relation"}</strong></div>
        <div><span>Uncertainty</span><strong>{hasUncertainty ? "absolute grid supplied" : "not supplied"}</strong></div>
      </div>
      <div className="aerodynamic-inspector-grid" role="region" aria-label={`${selectedSurface.label} Mach Reynolds grid`} tabIndex={0}>
        <table>
          <caption>{selectedSurface.label} · {selectedSurface.unit}{hasUncertainty ? " · cells include ± uncertainty" : ""}</caption>
          <thead>
            <tr>
              <th scope="col">Re \ Mach</th>
              {table.machPoints.map((mach) => <th scope="col" key={mach}>M {mach.toFixed(2)}</th>)}
            </tr>
          </thead>
          <tbody>
            {table.reynoldsPoints.map((reynolds, rowIndex) => (
              <tr key={reynolds}>
                <th scope="row">{reynolds.toExponential(1)}</th>
                {surface.values[rowIndex].map((value, columnIndex) => {
                  const uncertainty = surface.absoluteUncertainty?.[rowIndex]?.[columnIndex];
                  return (
                    <td key={`${reynolds}-${table.machPoints[columnIndex]}`} aria-label={`Reynolds ${reynolds}, Mach ${table.machPoints[columnIndex]}: ${formatAerodynamicInspectorValue(value, selectedSurface)}${uncertainty === undefined ? "" : ` plus or minus ${uncertainty.toFixed(selectedSurface.decimals)}`}`}>
                      <strong>{value.toFixed(selectedSurface.decimals)}</strong>
                      {uncertainty !== undefined && <small>±{uncertainty.toFixed(selectedSurface.decimals)}</small>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="aerodynamic-inspector-meta">
        <div><span>Mach domain</span><strong>{table.machPoints[0].toFixed(2)} → {table.machPoints.at(-1)?.toFixed(2)}</strong></div>
        <div><span>Reynolds domain</span><strong>{table.reynoldsPoints[0].toExponential(1)} → {table.reynoldsPoints.at(-1)?.toExponential(1)}</strong></div>
        <div><span>Angle axes</span><strong>{hasAngularVolume ? `α ${((table.angleOfAttackPointsRad![0] * 180) / Math.PI).toFixed(1)}° → ${((table.angleOfAttackPointsRad!.at(-1)! * 180) / Math.PI).toFixed(1)}° · β ${((table.sideslipPointsRad![0] * 180) / Math.PI).toFixed(1)}° → ${((table.sideslipPointsRad!.at(-1)! * 180) / Math.PI).toFixed(1)}°` : "not supplied"}</strong></div>
        <div><span>Out-of-range policy</span><strong>{table.outOfRangePolicy === "clamp-with-warning" ? "Clamp + warning" : "Reject query"}</strong></div>
        <div><span>Source</span><strong>{table.provenance.sourceName} · {table.provenance.dataVersion}</strong></div>
      </div>
      <p className="aerodynamic-inspector-note">This inspector shows exactly the supplied cells and declared absolute uncertainty. Validation checks the document shape and provenance; it does not certify aerodynamic accuracy, reference conventions, or source licensing.</p>
    </section>
  );
}

export default function Home() {
  const [selected, setSelected] = useState<ComponentKey>("body");
  const [view, setView] = useState<ViewKey>("design");
  const [designView, setDesignView] = useState<DesignViewKey>("2d");
  const [length, setLength] = useState(710);
  const [diameter, setDiameter] = useState(54);
  const [noseLength, setNoseLength] = useState(180);
  const [noseProfile, setNoseProfile] = useState<NoseProfile>("ogive");
  const [finCount, setFinCount] = useState(3);
  const [finRootChord, setFinRootChord] = useState(130);
  const [finTipChord, setFinTipChord] = useState(55);
  const [finSweep, setFinSweep] = useState(45);
  const [finSpan, setFinSpan] = useState(75);
  const [finThickness, setFinThickness] = useState(3);
  const [payloadMass, setPayloadMass] = useState(0.16);
  const [material, setMaterial] = useState<MaterialKey>("kraft");
  const [thrust, setThrust] = useState(22);
  const [burnTime, setBurnTime] = useState(1.65);
  const [dragCoefficient, setDragCoefficient] = useState(0.52);
  const [launchAltitude, setLaunchAltitude] = useState(80);
  const [windSpeed, setWindSpeed] = useState(4);
  const [windAzimuthDeg, setWindAzimuthDeg] = useState(0);
  const [relativeHumidityPercent, setRelativeHumidityPercent] = useState(60);
  const [surfacePressureHpa, setSurfacePressureHpa] = useState(1004);
  const [surfaceTemperatureC, setSurfaceTemperatureC] = useState(15);
  const [launchRailEnabled, setLaunchRailEnabled] = useState(true);
  const [launchRailLengthM, setLaunchRailLengthM] = useState(1.2);
  const [launchRailInclinationDeg, setLaunchRailInclinationDeg] = useState(0);
  const [launchRailAzimuthDeg, setLaunchRailAzimuthDeg] = useState(0);
  const [recoveryEnabled, setRecoveryEnabled] = useState(true);
  const [recoveryDelay, setRecoveryDelay] = useState(0);
  const [recoveryDiameter, setRecoveryDiameter] = useState(0.45);
  const [recoveryMass, setRecoveryMass] = useState(0.06);
  const [recoveryDeploymentSuccessProbability, setRecoveryDeploymentSuccessProbability] = useState(0.9);
  const [recoveryReefingEnabled, setRecoveryReefingEnabled] = useState(false);
  const [recoveryReefingDurationS, setRecoveryReefingDurationS] = useState(3);
  const [recoveryReefingStartAreaFraction, setRecoveryReefingStartAreaFraction] = useState(0.35);
  const [uncertaintySampleCount, setUncertaintySampleCount] = useState(DEFAULT_UNCERTAINTY_SAMPLE_COUNT);
  const [uncertaintySeed, setUncertaintySeed] = useState(DEFAULT_UNCERTAINTY_SEED);
  const [uncertaintyCorrelations, setUncertaintyCorrelations] = useState<ProjectUncertaintyCorrelation[]>([]);
  const [running, setRunning] = useState(false);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<PhysicsBenchmarkSuiteResult | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimization, setOptimization] = useState<OptimizationPreview | null>(null);
  const [optimizationMode, setOptimizationMode] = useState<"nominal" | "robust">("nominal");
  const [sweepParameter, setSweepParameter] =
    useState<VerticalFlightSweepParameterKey>("thrustScale");
  const [sweepMinimum, setSweepMinimum] = useState(0.75);
  const [sweepMaximum, setSweepMaximum] = useState(1.3);
  const [sweepSteps, setSweepSteps] = useState(DEFAULT_SWEEP_STEPS);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepResult, setSweepResult] =
    useState<VerticalFlightSweepResult | null>(null);
  const [sweepError, setSweepError] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportCloseRef = useRef<HTMLButtonElement>(null);
  const projectImportInputRef = useRef<HTMLInputElement>(null);
  const [projectImportRequested, setProjectImportRequested] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templatesCloseRef = useRef<HTMLButtonElement>(null);
  const [motorLibraryOpen, setMotorLibraryOpen] = useState(false);
  const motorLibraryCloseRef = useRef<HTMLButtonElement>(null);
  const [userMotorRecords, setUserMotorRecords] = useState<MotorDataRecord[]>([]);
  const [selectedMotorId, setSelectedMotorId] = useState("synthetic");
  const [motorImportDraft, setMotorImportDraft] = useState<MotorImportDraft>(defaultMotorImportDraft);
  const [motorError, setMotorError] = useState("");
  const [aerodynamicLibraryOpen, setAerodynamicLibraryOpen] = useState(false);
  const aerodynamicLibraryCloseRef = useRef<HTMLButtonElement>(null);
  const [aerodynamicInspectorId, setAerodynamicInspectorId] = useState<string | null>(null);
  const [aerodynamicTableDefinitions, setAerodynamicTableDefinitions] = useState<AerodynamicCoefficientTableDefinition[]>([]);
  const [selectedAerodynamicTableId, setSelectedAerodynamicTableId] = useState("constant");
  const [aerodynamicTableImportDraft, setAerodynamicTableImportDraft] = useState<AerodynamicTableImportDraft>(defaultAerodynamicTableImportDraft);
  const [aerodynamicTableError, setAerodynamicTableError] = useState("");
  const [topologyOpen, setTopologyOpen] = useState(false);
  const topologyCloseRef = useRef<HTMLButtonElement>(null);
  const [vehicleTopology, setVehicleTopology] = useState<LocalVehicleTopology>(() => createDefaultVehicleTopology());
  const topologyRef = useRef(vehicleTopology);
  const [topologyError, setTopologyError] = useState("");
  const [topologyFailureDrafts, setTopologyFailureDrafts] = useState<Record<string, string>>({});
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("beginner");
  const [guideOpen, setGuideOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyCloseRef = useRef<HTMLButtonElement>(null);
  const [projectHistory, setProjectHistory] = useState<LocalProjectHistory>(() =>
    createEmptyProjectHistory("arc54"),
  );
  const historyRef = useRef(projectHistory);
  const revisionRef = useRef(0);
  const lastSavedInputsRef = useRef<EditableProjectInputs | null>(null);
  const lastSavedFingerprintRef = useRef("");
  const shareHydratedRef = useRef(false);
  const [storageReady, setStorageReady] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");
  const editableInputs = useMemo<EditableProjectInputs>(
    () => ({
      lengthMm: length,
      diameterMm: diameter,
      noseLengthMm: noseLength,
      noseProfile,
      finCount,
      finRootChordMm: finRootChord,
      finTipChordMm: finTipChord,
      finSweepMm: finSweep,
      finSpanMm: finSpan,
      finThicknessMm: finThickness,
      payloadMassKg: payloadMass,
      material,
      thrustN: thrust,
      burnTimeS: burnTime,
      dragCoefficient,
      launchAltitudeM: launchAltitude,
      windSpeedMps: windSpeed,
      windAzimuthDeg,
      relativeHumidityPercent,
      surfacePressureHpa,
      surfaceTemperatureC,
      launchRailEnabled,
      launchRailLengthM,
      launchRailInclinationDeg,
      launchRailAzimuthDeg,
      recoveryEnabled,
      recoveryDelayS: recoveryDelay,
      recoveryDiameterM: recoveryDiameter,
      recoveryMassKg: recoveryMass,
      recoveryDeploymentSuccessProbability,
      recoveryReefingEnabled,
      recoveryReefingDurationS,
      recoveryReefingStartAreaFraction,
      uncertaintySampleCount,
      uncertaintySeed,
      uncertaintyCorrelations,
    }),
    [burnTime, diameter, dragCoefficient, finCount, finRootChord, finSpan, finSweep, finThickness, finTipChord, launchAltitude, launchRailAzimuthDeg, launchRailEnabled, launchRailInclinationDeg, launchRailLengthM, length, material, noseLength, noseProfile, payloadMass, recoveryDelay, recoveryDeploymentSuccessProbability, recoveryDiameter, recoveryEnabled, recoveryMass, recoveryReefingDurationS, recoveryReefingEnabled, recoveryReefingStartAreaFraction, relativeHumidityPercent, surfacePressureHpa, surfaceTemperatureC, thrust, uncertaintyCorrelations, uncertaintySampleCount, uncertaintySeed, windAzimuthDeg, windSpeed],
  );
  const initialInputsRef = useRef(editableInputs);
  const stageMotorMassKgById = useMemo(
    () => createStageMotorMassMap(vehicleTopology.stages, selectedMotorId, userMotorRecords),
    [selectedMotorId, userMotorRecords, vehicleTopology.stages],
  );
  const vehicleComponents = useMemo(
    () =>
      makeDesignComponents({
        lengthM: length / 1000,
        diameterM: diameter / 1000,
        noseLengthM: noseLength / 1000,
        noseProfile,
        finCount,
        finRootChordM: finRootChord / 1000,
        finTipChordM: finTipChord / 1000,
        finSweepM: finSweep / 1000,
        finSpanM: finSpan / 1000,
        finThicknessM: finThickness / 1000,
        material,
        payloadMassKg: payloadMass,
        recoveryMassKg: recoveryMass,
        motorMassKg: stageMotorMassKgById[vehicleTopology.stages[0]?.id ?? "sustainer"] ?? 0.16,
      }),
    [diameter, finCount, finRootChord, finSpan, finSweep, finThickness, finTipChord, length, material, noseLength, noseProfile, payloadMass, recoveryMass, stageMotorMassKgById, vehicleTopology.stages],
  );
  const stageFlightComponents = useMemo(
    () => makePlacedStageComponents(vehicleTopology.stages, vehicleComponents, {
      lengthM: length / 1000,
      diameterM: diameter / 1000,
      noseLengthM: noseLength / 1000,
      noseProfile,
      finCount,
      finRootChordM: finRootChord / 1000,
      finTipChordM: finTipChord / 1000,
      finSweepM: finSweep / 1000,
      finSpanM: finSpan / 1000,
      finThicknessM: finThickness / 1000,
      material,
      payloadMassKg: payloadMass,
      recoveryMassKg: recoveryMass,
      motorMassKgByStageId: stageMotorMassKgById,
    }),
    [diameter, finCount, finRootChord, finSpan, finSweep, finThickness, finTipChord, length, material, noseLength, noseProfile, payloadMass, recoveryMass, stageMotorMassKgById, vehicleComponents, vehicleTopology],
  );
  const assemblyDefinition = useMemo(() => {
    const placements = createStagePlacements(vehicleTopology.stages, length / 1000, noseLength / 1000);
    return {
      id: "arc54-assembly",
      name: "ARC 54 assembly",
      stages: placements.map(({ stage, translationXM }) => {
      const stageComponents = makeAssemblyStageComponents(stage, vehicleComponents, {
        lengthM: length / 1000,
        diameterM: diameter / 1000,
        noseLengthM: noseLength / 1000,
        noseProfile,
        finCount,
        finRootChordM: finRootChord / 1000,
        finTipChordM: finTipChord / 1000,
        finSweepM: finSweep / 1000,
        finSpanM: finSpan / 1000,
        finThicknessM: finThickness / 1000,
        material,
        payloadMassKg: payloadMass,
        recoveryMassKg: recoveryMass,
        motorMassKgByStageId: stageMotorMassKgById,
      });
      return {
        id: stage.id,
        name: stage.name,
        role: stage.role,
        attachment: stage.attachment,
        ...(stage.parentStageId ? { parentStageId: stage.parentStageId } : {}),
        enabled: stage.enabled,
        transform: { translationM: { x: translationXM, y: 0, z: 0 } },
        ...(stage.repeatCount > 1 ? {
          repeat: {
            count: stage.repeatCount,
            radiusM: stage.repeatRadiusM,
            rotateInstances: true,
          },
        } : {}),
        children: stageComponents.map((component) => ({
          id: `assembly-${component.id}`,
          name: component.name,
          kind: "component" as const,
          component,
        })),
      };
      }),
    };
  }, [diameter, finCount, finRootChord, finSpan, finSweep, finThickness, finTipChord, length, material, noseLength, noseProfile, payloadMass, recoveryMass, stageMotorMassKgById, vehicleComponents, vehicleTopology]);
  const assembly = useMemo(
    () => createVehicleAssemblyModel(assemblyDefinition).evaluate(),
    [assemblyDefinition],
  );
  const assemblyComponentCatalog = useMemo(() => {
    const catalog = new Map<string, VehicleComponent>();
    for (const stage of assemblyDefinition.stages) {
      for (const child of stage.children) {
        if (child.kind === "component") catalog.set(child.component.id, child.component);
      }
    }
    return catalog;
  }, [assemblyDefinition]);
  const previewComponentInstances = useMemo<readonly RocketPreviewComponentInstance[]>(() => {
    const stagesById = new Map(vehicleTopology.stages.map((stage) => [stage.id, stage]));
    return assembly.componentInstances.flatMap((instance) => {
      const component = assemblyComponentCatalog.get(instance.sourceComponentId);
      if (!component) return [];
      const stage = stagesById.get(instance.stageId);
      return [{
        id: instance.instanceId,
        sourceComponentId: instance.sourceComponentId,
        label: component.name,
        stageId: instance.stageId,
        ...(stage ? { stageLabel: stage.name, stageRole: stage.role } : {}),
        stageInstanceIndex: instance.stageInstanceIndex,
        component,
        transform: instance.transform,
      }];
    });
  }, [assembly.componentInstances, assemblyComponentCatalog, vehicleTopology.stages]);
  const massProperties = assembly.massProperties;
  const mass = massProperties.massKg;
  const syntheticMotor = useMemo(
    () => createPreviewMotorRecord({ mass, thrust, burnTime }),
    [burnTime, mass, thrust],
  );
  const previewMotor = useMemo(
    () => userMotorRecords.find((record) => record.id === selectedMotorId) ?? syntheticMotor,
    [selectedMotorId, syntheticMotor, userMotorRecords],
  );
  const selectedAerodynamicTableDefinition = useMemo(
    () =>
      aerodynamicTableDefinitions.find(
        (definition) => definition.id === selectedAerodynamicTableId,
      ) ?? null,
    [aerodynamicTableDefinitions, selectedAerodynamicTableId],
  );
  const selectedAerodynamicTable = useMemo(
    () =>
      selectedAerodynamicTableDefinition
        ? createAerodynamicCoefficientTable(selectedAerodynamicTableDefinition)
        : null,
    [selectedAerodynamicTableDefinition],
  );
  const aerodynamicTableModels = useMemo<Readonly<Record<string, AerodynamicCoefficientTableModel>>>(
    () => Object.fromEntries(
      aerodynamicTableDefinitions.map((definition) => [
        definition.id,
        createAerodynamicCoefficientTable(definition),
      ]),
    ),
    [aerodynamicTableDefinitions],
  );
  const simulationFingerprint = useMemo(
    () =>
      createSimulationFingerprint({
        inputs: editableInputs,
        topology: vehicleTopology,
        selectedMotorId,
        motor: previewMotor,
        selectedAerodynamicTableId,
        aerodynamicTable: selectedAerodynamicTableDefinition,
      }),
    [editableInputs, previewMotor, selectedAerodynamicTableDefinition, selectedAerodynamicTableId, selectedMotorId, vehicleTopology],
  );
  const previewEnvironment = useMemo(
    () => createPreviewEnvironment(launchAltitude, windSpeed, { windAzimuthDeg, relativeHumidityPercent, surfacePressureHpa, surfaceTemperatureC }),
    [launchAltitude, relativeHumidityPercent, surfacePressureHpa, surfaceTemperatureC, windAzimuthDeg, windSpeed],
  );
  const environmentAtPad = useMemo(
    () => previewEnvironment.at({ timeS: 0, positionWorldM: { x: 0, y: 0, z: 0 } }),
    [previewEnvironment],
  );
  const environmentAt500M = useMemo(
    () =>
      previewEnvironment.at({
        timeS: 0,
        positionWorldM: { x: 0, y: 0, z: 500 },
      }),
    [previewEnvironment],
  );
  const staticStability = useMemo(
    () =>
      computeStaticStability({
        components: vehicleComponents,
        centerOfMassXM: massProperties.centerOfMassM.x,
      }),
    [massProperties.centerOfMassM.x, vehicleComponents],
  );
  const [result, setResult] = useState<VerticalFlightResult>(() =>
    createFlightResult({
      mass,
      diameter,
      dragCoefficient,
      thrust,
      burnTime,
      launchAltitude,
      windSpeed,
      windAzimuthDeg,
      relativeHumidityPercent,
      surfacePressureHpa,
      surfaceTemperatureC,
      recoveryEnabled,
      recoveryDelay,
      recoveryDiameter,
      recoveryReefingEnabled,
      recoveryReefingDurationS,
      recoveryReefingStartAreaFraction,
      motorRecord: previewMotor,
      aerodynamicTable: selectedAerodynamicTable,
    }),
  );
  const [lastRunFingerprint, setLastRunFingerprint] = useState<string | null>(
    () => simulationFingerprint,
  );
  const [comparisonReference, setComparisonReference] = useState<VerticalFlightResult | null>(null);
  const [comparisonReferenceFingerprint, setComparisonReferenceFingerprint] = useState<string | null>(null);
  const [flightDataSeries, setFlightDataSeries] = useState<FlightDataSeries | null>(null);
  const [flightDataError, setFlightDataError] = useState("");
  const [flightDataTimeOffsetS, setFlightDataTimeOffsetS] = useState(0);
  const [flightDataTraceSource, setFlightDataTraceSource] = useState<FlightDataTraceSource>("vertical-1d");
  const [stageFlightResult, setStageFlightResult] =
    useState<StageFlightPreviewResult | null>(null);
  const [stageFlightFingerprint, setStageFlightFingerprint] = useState<string | null>(
    null,
  );
  const [stageFlightRunning, setStageFlightRunning] = useState(false);
  const [stageFlightError, setStageFlightError] = useState("");
  const [stageUncertainty, setStageUncertainty] = useState<StageFlightUncertaintyResult | null>(null);
  const [stageUncertaintyFingerprint, setStageUncertaintyFingerprint] = useState<string | null>(null);
  const [stageUncertaintyRunning, setStageUncertaintyRunning] = useState(false);
  const [stageUncertaintyError, setStageUncertaintyError] = useState("");
  const [uncertainty, setUncertainty] = useState<UncertaintyAnalysisResult>(() =>
    createUncertaintyResult({
      mass,
      diameter,
      dragCoefficient,
      thrust,
      burnTime,
      launchAltitude,
      windSpeed,
      windAzimuthDeg,
      relativeHumidityPercent,
      surfacePressureHpa,
      surfaceTemperatureC,
      recoveryEnabled,
      recoveryDelay,
      recoveryDiameter,
      recoveryReefingEnabled,
      recoveryReefingDurationS,
      recoveryReefingStartAreaFraction,
      recoveryDeploymentSuccessProbability,
      motorRecord: previewMotor,
      aerodynamicTable: selectedAerodynamicTable,
    }, uncertaintyCorrelations, uncertaintySampleCount, uncertaintySeed),
  );
  const [landingPrediction, setLandingPrediction] =
    useState<LandingDispersionResult | null>(() =>
      createLandingPrediction(
        {
          mass,
          diameter,
          dragCoefficient,
          thrust,
          burnTime,
          launchAltitude,
          windSpeed,
          windAzimuthDeg,
          relativeHumidityPercent,
          surfacePressureHpa,
          surfaceTemperatureC,
          recoveryEnabled,
          recoveryDelay,
          recoveryDiameter,
          recoveryReefingEnabled,
          recoveryReefingDurationS,
          recoveryReefingStartAreaFraction,
          recoveryDeploymentSuccessProbability,
          uncertaintyCorrelations,
          motorRecord: previewMotor,
        },
        result,
      ),
    );
  const resultIsCurrent = isSimulationFingerprintCurrent(
    lastRunFingerprint,
    simulationFingerprint,
  );
  const stageFlightIsCurrent =
    stageFlightResult !== null &&
    isSimulationFingerprintCurrent(stageFlightFingerprint, simulationFingerprint);
  const stageRecoveryCommandEvent = stageFlightResult?.events.find(
    (event) => event.id.includes("recovery") || event.label.toLowerCase().includes("recovery"),
  ) ?? null;
  const stageRecoveryOpeningLoad = useMemo(() => {
    if (!stageFlightResult || !stageFlightIsCurrent || !recoveryEnabled || !stageRecoveryCommandEvent) {
      return null;
    }
    return estimateRecoveryOpeningLoad({
      trace: stageFlightResult.trace.map((point) => ({
        timeS: point.timeS,
        dynamicPressurePa: point.dynamicPressurePa,
      })),
      commandTimeS: stageRecoveryCommandEvent.timeS,
      deploymentDelayS: recoveryDelay,
      inflationTimeS: BROWSER_RECOVERY_INFLATION_TIME_S,
      dragCoefficient: BROWSER_RECOVERY_DRAG_COEFFICIENT,
      referenceAreaM2: Math.PI * (recoveryDiameter / 2) ** 2,
    });
  }, [recoveryDelay, recoveryDiameter, recoveryEnabled, stageFlightIsCurrent, stageFlightResult, stageRecoveryCommandEvent]);
  const flightDataComparisonState = useMemo<{ comparison: FlightDataComparisonResult | null; error: string }>(() => {
    if (!flightDataSeries) return { comparison: null, error: "" };
    if (flightDataTraceSource === "coupled-6dof") {
      if (!stageFlightResult) return { comparison: null, error: "Run the coupled 6DOF preview before comparing measured data against that trace." };
      if (!stageFlightIsCurrent) return { comparison: null, error: "Rerun the current coupled 6DOF preview before comparing measured data." };
    } else if (!resultIsCurrent) {
      return { comparison: null, error: "" };
    }
    try {
      const comparison = flightDataTraceSource === "coupled-6dof"
        ? compareFlightDataToStageTrace(stageFlightResult!.trace, flightDataSeries, { timeOffsetS: flightDataTimeOffsetS })
        : compareFlightDataToTrace(result.trace, flightDataSeries, { timeOffsetS: flightDataTimeOffsetS });
      return { comparison, error: "" };
    } catch (error) {
      return { comparison: null, error: error instanceof Error ? error.message : "Unable to compare measured data." };
    }
  }, [flightDataSeries, flightDataTimeOffsetS, flightDataTraceSource, result, resultIsCurrent, stageFlightIsCurrent, stageFlightResult]);
  const structuralBody = vehicleComponents.find(
    (component): component is Extract<VehicleComponent, { kind: "axisymmetric" }> =>
      component.kind === "axisymmetric" && component.id === "body",
  ) ?? null;
  const structuralFins = vehicleComponents.find(
    (component): component is Extract<VehicleComponent, { kind: "finSet" }> =>
      component.kind === "finSet" && component.id === "fins",
  ) ?? null;
  const flutterFlightCondition = useMemo(() => {
    if (!resultIsCurrent || result.maxSpeedMps <= 0 || result.trace.length === 0) {
      return { maxAirspeedMps: null, atmosphere: null };
    }
    const maxSpeedPoint = result.trace.reduce((peak, point) =>
      Math.abs(point.velocityMps) > Math.abs(peak.velocityMps) ? point : peak,
    );
    return {
      maxAirspeedMps: result.maxSpeedMps,
      atmosphere: previewEnvironment.at({
        timeS: maxSpeedPoint.timeS,
        positionWorldM: { x: 0, y: 0, z: maxSpeedPoint.altitudeAglM },
      }).atmosphere,
    };
  }, [previewEnvironment, result, resultIsCurrent]);
  const structuralScreen = useMemo<StructuralScreenResult | null>(() => {
    if (!structuralBody) return null;
    return computeStructuralScreen({
      body: structuralBody,
      fins: structuralFins,
      totalMassKg: mass,
      peakThrustN: previewMotor.metrics.peakThrustN,
      maxDynamicPressurePa: result.maxDynamicPressurePa,
      maxAirspeedMps: flutterFlightCondition.maxAirspeedMps,
      flutterAtmosphere: flutterFlightCondition.atmosphere,
      flutterSafetyFactor: 1.25,
      staticMarginCalibers: staticStability.staticMarginCalibers,
      material: materialModels[material],
      flightResultCurrent: resultIsCurrent,
    });
  }, [flutterFlightCondition, mass, material, previewMotor, result.maxDynamicPressurePa, resultIsCurrent, staticStability.staticMarginCalibers, structuralBody, structuralFins]);

  const selectedComponent = components.find((component) => component.id === selected)!;
  const componentDetails: Readonly<Record<ComponentKey, string>> = {
    nose: `${noseProfile} · ${noseLength} mm`,
    body: `${diameter} × ${length} mm`,
    fins: `${finCount} fins · ${finSpan} mm span`,
    mount: `${Math.round(previewMotor.diameterM * 1000)} mm · ${previewMotor.designation}`,
    recovery: `${Math.round(recoveryDiameter * 1000)} mm chute · ${recoveryMass.toFixed(2)} kg packed`,
  };
  const designLength = length + noseLength;
  const centerOfMassMm = massProperties.centerOfMassM.x * 1000;
  const centerMarkerPercent = Math.min(
    96,
    Math.max(4, (centerOfMassMm / designLength) * 100),
  );
  const centerOfPressureMm = staticStability.centerOfPressureXM * 1000;
  const pressureMarkerPercent = Math.min(
    96,
    Math.max(4, (centerOfPressureMm / designLength) * 100),
  );
  const designWarning = useMemo(() => {
    const ratio = thrust / (mass * 9.80665);
    if (ratio < 3) {
      return {
        good: false,
        title: "Low launch thrust-to-weight ratio",
        explanation: "The current average-thrust estimate is below 3:1 at ignition.",
      };
    }
    if (diameter < 30) {
      return {
        good: false,
        title: "Structural review needed",
        explanation: "The small diameter requires a more detailed structural model.",
      };
    }
    const aerodynamicWarning =
      staticStability.warnings.find((item) => item.severity !== "info") ??
      staticStability.warnings[0];
    return {
      good: aerodynamicWarning.severity === "info",
      title: aerodynamicWarning.title,
      explanation: aerodynamicWarning.explanation,
    };
  }, [diameter, mass, staticStability.warnings, thrust]);
  const modelWarning =
    result.warnings.find((item) => item.severity !== "info") ??
    result.warnings[0];
  const activeStageCount = vehicleTopology.stages.filter((stage) => stage.enabled).length;
  const configurationRevision = projectHistory.entries.at(-1)?.snapshot.revision ?? 0;
  const configurationId = `A-${String(configurationRevision + 1).padStart(2, "0")}`;
  const readinessLabel = designWarning.good ? "NOMINAL" : "REVIEW";
  const burnoutEvent = result.events.find((event) => event.type === "burnout");
  const apogeeEvent = result.events.find((event) => event.type === "apogee");
  const recoveryEvent = result.events.find(
    (event) => event.type === "recovery_deploy",
  );
  const optimizationRecommendation =
    optimization?.result.paretoFront.find(
      (candidate) =>
        candidate.id === optimization.result.recommendedCandidateId,
    ) ?? null;
  const activeSweepDefinition = sweepParameterDefinition(sweepParameter);
  const primaryThresholdConvergence = uncertainty.convergence.thresholds[0] ?? null;
  const primaryRecoveryThreshold = uncertainty.thresholds.find((threshold) => threshold.id === "recovery-deployed") ?? null;
  const primaryRecoveryThresholdConvergence = uncertainty.convergence.thresholds.find((threshold) => threshold.thresholdId === "recovery-deployed") ?? null;
  const stageUncertaintyIsCurrent =
    stageUncertainty !== null &&
    isSimulationFingerprintCurrent(stageUncertaintyFingerprint, simulationFingerprint);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      let restoredSnapshot: LocalProjectSnapshot | null = null;
      let restoredHistory = createEmptyProjectHistory("arc54");
      const problems: string[] = [];
      try {
        const serialized = window.localStorage.getItem(LOCAL_PROJECT_STORAGE_KEY);
        if (serialized) restoredSnapshot = parseLocalProjectSnapshot(serialized);
      } catch {
        problems.push("the latest snapshot");
      }
      try {
        const serialized = window.localStorage.getItem(LOCAL_PROJECT_HISTORY_STORAGE_KEY);
        if (serialized) restoredHistory = parseLocalProjectHistory(serialized);
      } catch {
        problems.push("the checkpoint history");
      }
      try {
        const serialized = window.localStorage.getItem(LOCAL_MOTOR_LIBRARY_STORAGE_KEY);
        if (serialized) setUserMotorRecords(parseLocalMotorLibrary(serialized));
      } catch {
        problems.push("the local motor library");
      }
      try {
        const serialized = window.localStorage.getItem(LOCAL_AERODYNAMIC_LIBRARY_STORAGE_KEY);
        const restoredTables = serialized ? parseLocalAerodynamicLibrary(serialized) : [];
        setAerodynamicTableDefinitions(restoredTables);
        const storedSelection = window.localStorage.getItem(LOCAL_AERODYNAMIC_SELECTION_STORAGE_KEY);
        if (storedSelection === "constant" || restoredTables.some((table) => table.id === storedSelection)) {
          setSelectedAerodynamicTableId(storedSelection ?? "constant");
        }
      } catch {
        problems.push("the local aerodynamic library");
      }
      try {
        const serialized = window.localStorage.getItem(LOCAL_VEHICLE_TOPOLOGY_STORAGE_KEY);
        if (serialized) {
          const restoredTopology = parseVehicleTopology(serialized);
          topologyRef.current = restoredTopology;
          setVehicleTopology(restoredTopology);
        }
      } catch {
        problems.push("the vehicle topology");
      }
      const storedMode = window.localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY);
      if (storedMode === "beginner" || storedMode === "expert") setExperienceMode(storedMode);
      if (restoredSnapshot?.projectId === "arc54") {
        const inputs = restoredSnapshot.inputs;
        setLength(inputs.lengthMm);
        setDiameter(inputs.diameterMm);
        setNoseLength(inputs.noseLengthMm);
        setNoseProfile(inputs.noseProfile);
        setFinCount(inputs.finCount);
        setFinRootChord(inputs.finRootChordMm);
        setFinTipChord(inputs.finTipChordMm);
        setFinSweep(inputs.finSweepMm);
        setFinSpan(inputs.finSpanMm);
        setFinThickness(inputs.finThicknessMm);
        setPayloadMass(inputs.payloadMassKg);
        setMaterial(inputs.material);
        setThrust(inputs.thrustN);
        setBurnTime(inputs.burnTimeS);
        setDragCoefficient(inputs.dragCoefficient);
        setLaunchAltitude(inputs.launchAltitudeM);
        setWindSpeed(inputs.windSpeedMps);
        setWindAzimuthDeg(inputs.windAzimuthDeg);
        setRelativeHumidityPercent(inputs.relativeHumidityPercent);
        setSurfacePressureHpa(inputs.surfacePressureHpa);
        setSurfaceTemperatureC(inputs.surfaceTemperatureC);
        setLaunchRailEnabled(inputs.launchRailEnabled);
        setLaunchRailLengthM(inputs.launchRailLengthM);
        setLaunchRailInclinationDeg(inputs.launchRailInclinationDeg);
        setLaunchRailAzimuthDeg(inputs.launchRailAzimuthDeg);
        setRecoveryEnabled(inputs.recoveryEnabled);
        setRecoveryDelay(inputs.recoveryDelayS);
        setRecoveryDiameter(inputs.recoveryDiameterM);
        setRecoveryMass(inputs.recoveryMassKg);
        setRecoveryDeploymentSuccessProbability(inputs.recoveryDeploymentSuccessProbability);
        setRecoveryReefingEnabled(inputs.recoveryReefingEnabled);
        setRecoveryReefingDurationS(inputs.recoveryReefingDurationS);
        setRecoveryReefingStartAreaFraction(inputs.recoveryReefingStartAreaFraction);
        setUncertaintySampleCount(inputs.uncertaintySampleCount);
        setUncertaintySeed(inputs.uncertaintySeed);
        setUncertaintyCorrelations([...(inputs.uncertaintyCorrelations ?? [])]);
        lastSavedInputsRef.current = inputs;
        lastSavedFingerprintRef.current = projectInputFingerprint(inputs);
        revisionRef.current = restoredSnapshot.revision;
      } else if (problems.length > 0) {
        lastSavedInputsRef.current = initialInputsRef.current;
        lastSavedFingerprintRef.current = projectInputFingerprint(initialInputsRef.current);
      }
      const latestHistoryRevision = restoredHistory.entries.at(-1)?.snapshot.revision ?? 0;
      revisionRef.current = Math.max(revisionRef.current, latestHistoryRevision);
      historyRef.current = restoredHistory;
      setProjectHistory(restoredHistory);
      if (problems.length > 0) {
        setSaveError(`Could not read ${problems.join(" or ")}. Defaults are active; the unreadable browser record was left untouched.`);
        setToast("Local project data needs attention");
      }
      setSaved(Boolean(restoredSnapshot));
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!storageReady || shareHydratedRef.current) return;
    shareHydratedRef.current = true;
    const hash = window.location.hash;
    if (!hash.startsWith(PROJECT_SHARE_HASH_PREFIX)) return;
    const importTimer = window.setTimeout(() => {
      try {
        const shared = decodeProjectShare(hash);
        const inputs = shared.editableInputs;
        setLength(inputs.lengthMm);
        setDiameter(inputs.diameterMm);
        setNoseLength(inputs.noseLengthMm);
        setNoseProfile(inputs.noseProfile);
        setFinCount(inputs.finCount);
        setFinRootChord(inputs.finRootChordMm);
        setFinTipChord(inputs.finTipChordMm);
        setFinSweep(inputs.finSweepMm);
        setFinSpan(inputs.finSpanMm);
        setFinThickness(inputs.finThicknessMm);
        setPayloadMass(inputs.payloadMassKg);
        setMaterial(inputs.material);
        setThrust(inputs.thrustN);
        setBurnTime(inputs.burnTimeS);
        setDragCoefficient(inputs.dragCoefficient);
        setLaunchAltitude(inputs.launchAltitudeM);
        setWindSpeed(inputs.windSpeedMps);
        setWindAzimuthDeg(inputs.windAzimuthDeg);
        setRelativeHumidityPercent(inputs.relativeHumidityPercent);
        setSurfacePressureHpa(inputs.surfacePressureHpa);
        setSurfaceTemperatureC(inputs.surfaceTemperatureC);
        setLaunchRailEnabled(inputs.launchRailEnabled);
        setLaunchRailLengthM(inputs.launchRailLengthM);
        setLaunchRailInclinationDeg(inputs.launchRailInclinationDeg);
        setLaunchRailAzimuthDeg(inputs.launchRailAzimuthDeg);
        setRecoveryEnabled(inputs.recoveryEnabled);
        setRecoveryDelay(inputs.recoveryDelayS);
        setRecoveryDiameter(inputs.recoveryDiameterM);
        setRecoveryMass(inputs.recoveryMassKg);
        setRecoveryDeploymentSuccessProbability(inputs.recoveryDeploymentSuccessProbability);
        setRecoveryReefingEnabled(inputs.recoveryReefingEnabled);
        setRecoveryReefingDurationS(inputs.recoveryReefingDurationS);
        setRecoveryReefingStartAreaFraction(inputs.recoveryReefingStartAreaFraction);
        setUncertaintySampleCount(inputs.uncertaintySampleCount);
        setUncertaintySeed(inputs.uncertaintySeed);
        setUncertaintyCorrelations([...(inputs.uncertaintyCorrelations ?? [])]);
        topologyRef.current = shared.topology;
        setVehicleTopology(shared.topology);
        window.localStorage.setItem(
          LOCAL_VEHICLE_TOPOLOGY_STORAGE_KEY,
          serializeVehicleTopology(shared.topology),
        );
        const motorAvailable =
          shared.selectedMotorId === "synthetic" ||
          userMotorRecords.some((record) => record.id === shared.selectedMotorId);
        const aerodynamicTableAvailable =
          shared.selectedAerodynamicTableId === "constant" ||
          aerodynamicTableDefinitions.some((table) => table.id === shared.selectedAerodynamicTableId);
        setSelectedMotorId(motorAvailable ? shared.selectedMotorId : "synthetic");
        setSelectedAerodynamicTableId(
          aerodynamicTableAvailable ? shared.selectedAerodynamicTableId : "constant",
        );
        window.localStorage.setItem(
          LOCAL_AERODYNAMIC_SELECTION_STORAGE_KEY,
          aerodynamicTableAvailable ? shared.selectedAerodynamicTableId : "constant",
        );
        setStageFlightResult(null);
        setStageFlightError("");
        setSweepResult(null);
        setSweepError("");
        setSaved(false);
        setSaveError(
          [
            !motorAvailable && shared.selectedMotorId !== "synthetic"
              ? `Referenced motor ${shared.selectedMotorId} is not available on this device; synthetic preview selected.`
              : "",
            !aerodynamicTableAvailable && shared.selectedAerodynamicTableId !== "constant"
              ? `Referenced aerodynamic table ${shared.selectedAerodynamicTableId} is not available on this device; constant drag selected.`
              : "",
          ].filter(Boolean).join(" "),
        );
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
        setView("design");
        setSelected("body");
        setToast(`Shared ${shared.projectName} design loaded; rerun estimates to refresh results`);
        window.setTimeout(() => setToast(""), 2200);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Unable to read RocketWorks share link");
        setToast("Shared design link could not be loaded");
        window.setTimeout(() => setToast(""), 2200);
      }
    }, 0);
    return () => window.clearTimeout(importTimer);
  }, [aerodynamicTableDefinitions, storageReady, userMotorRecords]);

  useEffect(() => {
    if (!storageReady) return;
    const fingerprint = projectInputFingerprint(editableInputs);
    if (fingerprint === lastSavedFingerprintRef.current) {
      setSaved(true);
      return;
    }
    setSaved(false);
    const timer = window.setTimeout(() => {
      try {
        const previous = lastSavedInputsRef.current;
        const lastTimestamp = historyRef.current.entries.at(-1)?.snapshot.savedAtIso;
        const savedAtIso = nextLocalSaveTime(lastTimestamp);
        const snapshot = createLocalProjectSnapshot({
          projectId: "arc54",
          projectName: "ARC 54",
          revision: revisionRef.current + 1,
          savedAtIso,
          inputs: editableInputs,
        });
        const label = previous ? describeProjectInputChanges(previous, editableInputs) : "Initial local snapshot";
        const nextHistory = appendProjectHistory(historyRef.current, snapshot, label);
        window.localStorage.setItem(LOCAL_PROJECT_STORAGE_KEY, serializeLocalProjectSnapshot(snapshot));
        window.localStorage.setItem(LOCAL_PROJECT_HISTORY_STORAGE_KEY, serializeLocalProjectHistory(nextHistory));
        revisionRef.current = snapshot.revision;
        historyRef.current = nextHistory;
        setProjectHistory(nextHistory);
        lastSavedInputsRef.current = editableInputs;
        lastSavedFingerprintRef.current = fingerprint;
        setSaveError("");
        setSaved(true);
      } catch {
        setSaveError("This browser could not save the project locally. Export a project document before leaving this page.");
        setSaved(false);
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [editableInputs, storageReady]);

  useEffect(() => {
    if (!exportOpen) return;
    exportCloseRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setExportOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [exportOpen]);

  useEffect(() => {
    if (!projectImportRequested) return;
    const importTimer = window.setTimeout(() => {
      projectImportInputRef.current?.click();
      setProjectImportRequested(false);
    }, 0);
    return () => window.clearTimeout(importTimer);
  }, [projectImportRequested]);

  useEffect(() => {
    if (!historyOpen) return;
    historyCloseRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setHistoryOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [historyOpen]);

  useEffect(() => {
    if (!templatesOpen) return;
    templatesCloseRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setTemplatesOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [templatesOpen]);

  useEffect(() => {
    if (!motorLibraryOpen) return;
    motorLibraryCloseRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMotorLibraryOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [motorLibraryOpen]);

  useEffect(() => {
    if (!aerodynamicLibraryOpen) return;
    aerodynamicLibraryCloseRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setAerodynamicLibraryOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [aerodynamicLibraryOpen]);

  useEffect(() => {
    if (!topologyOpen) return;
    topologyCloseRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setTopologyOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [topologyOpen]);

  useEffect(() => {
    const openOnShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandQuery("");
        setCommandIndex(0);
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", openOnShortcut);
    return () => window.removeEventListener("keydown", openOnShortcut);
  }, []);

  useEffect(() => {
    if (!commandOpen) return;
    commandInputRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [commandOpen]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };
  const runPhysicsBenchmarks = () => {
    if (benchmarkRunning) return;
    setBenchmarkRunning(true);
    window.setTimeout(() => {
      try {
        const nextResult = runPhysicsBenchmarkSuite();
        setBenchmarkResult(nextResult);
        notify(`${nextResult.passedCount}/${nextResult.totalCount} physics benchmarks passed`);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Physics benchmark run failed");
      } finally {
        setBenchmarkRunning(false);
      }
    }, 0);
  };
  const pinComparisonReference = () => {
    if (!resultIsCurrent) {
      notify("Run the current vertical estimate before pinning a reference");
      return;
    }
    setComparisonReference(result);
    setComparisonReferenceFingerprint(lastRunFingerprint ?? simulationFingerprint);
    notify("Current vertical estimate pinned as comparison reference");
  };
  const clearComparisonReference = () => {
    setComparisonReference(null);
    setComparisonReferenceFingerprint(null);
    notify("Comparison reference cleared");
  };
  const importFlightData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      const series = parseFlightDataCsv(await file.text(), file.name);
      setFlightDataSeries(series);
      setFlightDataError("");
      notify(`Loaded ${series.samples.length} measured samples`);
    } catch (error) {
      setFlightDataSeries(null);
      setFlightDataError(error instanceof Error ? error.message : "Unable to import flight data CSV.");
    }
  };
  const clearFlightData = () => {
    setFlightDataSeries(null);
    setFlightDataError("");
    setFlightDataTimeOffsetS(0);
    notify("Measured flight data cleared");
  };
  const exportFlightDataComparison = () => {
    if (!flightDataComparisonState.comparison) {
      notify("Import measured data and rerun the current estimate before exporting residuals");
      return;
    }
    const traceSource = flightDataComparisonState.comparison.traceSource === "coupled-6dof"
      ? "coupled-6dof"
      : "vertical-1d";
    downloadTextArtifact(
      `arc-54-${traceSource}-flight-data-residuals.csv`,
      "text/csv;charset=utf-8",
      createFlightDataComparisonCsv(flightDataComparisonState.comparison),
    );
    notify("Measured-data residuals exported");
  };
  const openCommandPalette = () => {
    setCommandQuery("");
    setCommandIndex(0);
    setCommandOpen(true);
  };
  const markChanged = () => {
    setSaved(false);
    setStageFlightResult(null);
    setStageFlightError("");
    setSweepResult(null);
    setSweepError("");
  };
  const changeAirframeLength = (value: number) => {
    const nextLength = Math.min(1600, Math.max(200, value));
    const nextRoot = Math.min(finRootChord, nextLength);
    const nextTip = Math.min(finTipChord, nextRoot);
    setLength(nextLength);
    setFinRootChord(nextRoot);
    setFinTipChord(nextTip);
    setFinSweep(Math.min(finSweep, Math.max(0, nextRoot - nextTip)));
    markChanged();
  };
  const changeFinRootChord = (value: number) => {
    const nextRoot = Math.min(length, Math.max(20, value));
    const nextTip = Math.min(finTipChord, nextRoot);
    setFinRootChord(nextRoot);
    setFinTipChord(nextTip);
    setFinSweep(Math.min(finSweep, Math.max(0, nextRoot - nextTip)));
    markChanged();
  };
  const changeFinTipChord = (value: number) => {
    const nextTip = Math.min(finRootChord, Math.max(5, value));
    setFinTipChord(nextTip);
    setFinSweep(Math.min(finSweep, Math.max(0, finRootChord - nextTip)));
    markChanged();
  };
  const changeFinSweep = (value: number) => {
    setFinSweep(Math.min(Math.max(0, value), Math.max(0, finRootChord - finTipChord)));
    markChanged();
  };
  const applyEditableInputs = (inputs: EditableProjectInputs) => {
    setLength(inputs.lengthMm);
    setDiameter(inputs.diameterMm);
    setNoseLength(inputs.noseLengthMm);
    setNoseProfile(inputs.noseProfile);
    setFinCount(inputs.finCount);
    setFinRootChord(inputs.finRootChordMm);
    setFinTipChord(inputs.finTipChordMm);
    setFinSweep(inputs.finSweepMm);
    setFinSpan(inputs.finSpanMm);
    setFinThickness(inputs.finThicknessMm);
    setPayloadMass(inputs.payloadMassKg);
    setMaterial(inputs.material);
    setThrust(inputs.thrustN);
    setBurnTime(inputs.burnTimeS);
    setDragCoefficient(inputs.dragCoefficient);
    setLaunchAltitude(inputs.launchAltitudeM);
    setWindSpeed(inputs.windSpeedMps);
    setWindAzimuthDeg(inputs.windAzimuthDeg);
    setRelativeHumidityPercent(inputs.relativeHumidityPercent);
    setSurfacePressureHpa(inputs.surfacePressureHpa);
    setSurfaceTemperatureC(inputs.surfaceTemperatureC);
    setLaunchRailEnabled(inputs.launchRailEnabled);
    setLaunchRailLengthM(inputs.launchRailLengthM);
    setLaunchRailInclinationDeg(inputs.launchRailInclinationDeg);
    setLaunchRailAzimuthDeg(inputs.launchRailAzimuthDeg);
    setRecoveryEnabled(inputs.recoveryEnabled);
    setRecoveryDelay(inputs.recoveryDelayS);
    setRecoveryDiameter(inputs.recoveryDiameterM);
    setRecoveryMass(inputs.recoveryMassKg);
    setRecoveryDeploymentSuccessProbability(inputs.recoveryDeploymentSuccessProbability);
    setRecoveryReefingEnabled(inputs.recoveryReefingEnabled);
    setRecoveryReefingDurationS(inputs.recoveryReefingDurationS);
    setRecoveryReefingStartAreaFraction(inputs.recoveryReefingStartAreaFraction);
    setUncertaintySampleCount(inputs.uncertaintySampleCount);
    setUncertaintySeed(inputs.uncertaintySeed);
    setUncertaintyCorrelations([...(inputs.uncertaintyCorrelations ?? [])]);
  };
  const persistCheckpoint = (
    inputs: EditableProjectInputs,
    label: string,
    allowDuplicate = true,
  ) => {
    const lastTimestamp = historyRef.current.entries.at(-1)?.snapshot.savedAtIso;
    const snapshot = createLocalProjectSnapshot({
      projectId: "arc54",
      projectName: "ARC 54",
      revision: revisionRef.current + 1,
      savedAtIso: nextLocalSaveTime(lastTimestamp),
      inputs,
    });
    const nextHistory = appendProjectHistory(historyRef.current, snapshot, label, { allowDuplicate });
    window.localStorage.setItem(LOCAL_PROJECT_STORAGE_KEY, serializeLocalProjectSnapshot(snapshot));
    window.localStorage.setItem(LOCAL_PROJECT_HISTORY_STORAGE_KEY, serializeLocalProjectHistory(nextHistory));
    revisionRef.current = snapshot.revision;
    historyRef.current = nextHistory;
    setProjectHistory(nextHistory);
    lastSavedInputsRef.current = inputs;
    lastSavedFingerprintRef.current = projectInputFingerprint(inputs);
    setSaveError("");
    setSaved(true);
    return snapshot;
  };
  const createManualCheckpoint = () => {
    try {
      persistCheckpoint(editableInputs, "Manual checkpoint");
      notify("Local checkpoint created");
    } catch {
      setSaveError("This browser could not create the checkpoint. Export a project document before leaving this page.");
    }
  };
  const restoreCheckpoint = (source: LocalProjectSnapshot) => {
    try {
      persistCheckpoint(source.inputs, `Restored revision ${source.revision}`);
      applyEditableInputs(source.inputs);
      setHistoryOpen(false);
      notify(`Restored revision ${source.revision}`);
    } catch {
      setSaveError("This browser could not restore that checkpoint. The current design was not changed.");
    }
  };
  const changeExperienceMode = (mode: ExperienceMode) => {
    setExperienceMode(mode);
    try {
      window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, mode);
    } catch {
      notify("Mode changed for this session only");
    }
  };
  const applyTemplate = (template: ProjectTemplate) => {
    try {
      applyEditableInputs(template.inputs);
      persistCheckpoint(template.inputs, `Loaded template: ${template.name}`);
      setSelected("body");
      setView("design");
      setTemplatesOpen(false);
      setGuideOpen(false);
      notify(`${template.name} template loaded`);
    } catch {
      setSaveError("This browser could not load the template. The current design was not changed.");
    }
  };
  const persistMotorRecords = (records: MotorDataRecord[]) => {
    window.localStorage.setItem(LOCAL_MOTOR_LIBRARY_STORAGE_KEY, serializeLocalMotorLibrary(records));
    setUserMotorRecords(records);
  };
  const persistAerodynamicTables = (records: AerodynamicCoefficientTableDefinition[]) => {
    window.localStorage.setItem(
      LOCAL_AERODYNAMIC_LIBRARY_STORAGE_KEY,
      serializeLocalAerodynamicLibrary(records),
    );
    setAerodynamicTableDefinitions(records);
  };
  const selectMotor = (id: string) => {
    setSelectedMotorId(id);
    setStageFlightResult(null);
    setStageFlightError("");
    setSweepResult(null);
    setSweepError("");
    setMotorLibraryOpen(false);
    setMotorError("");
    notify(id === "synthetic" ? "Synthetic preview selected; rerun the estimate" : "Motor selected; rerun the estimate");
  };
  const importUserMotor = () => {
    try {
      const draft = motorImportDraft;
      const provenance = {
        sourceName: draft.sourceName.trim(),
        sourceKind: "user-supplied" as const,
        dataVersion: draft.dataVersion.trim(),
        licenseIdentifier: draft.licenseIdentifier.trim(),
        attribution: draft.attribution.trim(),
        sourceUrl: draft.sourceUrl.trim() || undefined,
        validationStatus: "user-supplied-unvalidated" as const,
      };
      const massFlowHistoryKgS = draft.massFlowCsv.trim()
        ? parseMotorMassFlowCsv(draft.massFlowCsv)
        : undefined;
      const measuredMassFlow = massFlowHistoryKgS ? { massFlowHistoryKgS } : {};
      const firstContentLine = draft.csv
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("#") && !line.startsWith(";")) ?? "";
      const record = /^time_s\s*,\s*thrust_n$/i.test(firstContentLine)
        ? importMotorThrustCsv(draft.csv, {
            id: draft.id.trim(),
            manufacturer: draft.manufacturer.trim(),
            designation: draft.designation.trim(),
            description: draft.description.trim() || undefined,
            diameterM: Number(draft.diameterMm) / 1000,
            lengthM: Number(draft.lengthMm) / 1000,
            launchMassKg: Number(draft.launchMassKg),
            dryMassKg: Number(draft.dryMassKg),
            ...measuredMassFlow,
            provenance,
          })
        : importMotorRaspEng(draft.csv, {
            id: draft.id.trim(),
            description: draft.description.trim() || undefined,
            ...measuredMassFlow,
            provenance,
          });
      const nextRecords = upsertLocalMotorRecord(userMotorRecords, record);
      persistMotorRecords(nextRecords);
      setSelectedMotorId(record.id);
      setMotorError("");
      notify(`${record.manufacturer} ${record.designation} imported; rerun the estimate`);
    } catch (error) {
      setMotorError(error instanceof Error ? error.message : "Unable to import motor curve");
    }
  };
  const removeUserMotor = (id: string) => {
    try {
      const nextRecords = userMotorRecords.filter((record) => record.id !== id);
      persistMotorRecords(nextRecords);
      if (selectedMotorId === id) setSelectedMotorId("synthetic");
      notify("User motor removed from this device");
    } catch (error) {
      setMotorError(error instanceof Error ? error.message : "Unable to remove motor");
    }
  };
  const selectAerodynamicTable = (id: string) => {
    if (id !== "constant" && !aerodynamicTableDefinitions.some((table) => table.id === id)) {
      setAerodynamicTableError("That aerodynamic table is no longer available on this device.");
      return;
    }
    setSelectedAerodynamicTableId(id);
    window.localStorage.setItem(LOCAL_AERODYNAMIC_SELECTION_STORAGE_KEY, id);
    setStageFlightResult(null);
    setStageFlightError("");
    setAerodynamicLibraryOpen(false);
    setAerodynamicTableError("");
    notify(id === "constant" ? "Constant drag source selected; rerun the 6DOF preview" : "Coefficient table selected; rerun the 6DOF preview");
  };
  const importAerodynamicTable = () => {
    try {
      const parsed = JSON.parse(aerodynamicTableImportDraft.json) as unknown;
      const nextTables = upsertLocalAerodynamicTable(aerodynamicTableDefinitions, parsed as AerodynamicCoefficientTableDefinition);
      const nextTable = nextTables.find((table) => table.id === (parsed as { id?: unknown }).id);
      persistAerodynamicTables(nextTables);
      if (nextTable) selectAerodynamicTable(nextTable.id);
      setAerodynamicTableImportDraft({ json: defaultAerodynamicTableImportDraft.json });
      setAerodynamicTableError("");
      notify(`${nextTable?.name ?? "Aerodynamic table"} imported; rerun the 6DOF preview`);
    } catch (error) {
      setAerodynamicTableError(error instanceof Error ? error.message : "Unable to import aerodynamic table");
    }
  };
  const removeAerodynamicTable = (id: string) => {
    try {
      const nextTables = aerodynamicTableDefinitions.filter((table) => table.id !== id);
      persistAerodynamicTables(nextTables);
      if (aerodynamicInspectorId === id) setAerodynamicInspectorId(null);
      if (selectedAerodynamicTableId === id) selectAerodynamicTable("constant");
      notify("Aerodynamic table removed from this device");
    } catch (error) {
      setAerodynamicTableError(error instanceof Error ? error.message : "Unable to remove aerodynamic table");
    }
  };
  const persistVehicleTopology = (next: LocalVehicleTopology) => {
    const serialized = serializeVehicleTopology(next);
    window.localStorage.setItem(LOCAL_VEHICLE_TOPOLOGY_STORAGE_KEY, serialized);
    topologyRef.current = next;
    setVehicleTopology(next);
    setStageFlightResult(null);
    setStageFlightError("");
    setTopologyError("");
  };
  const addTopologyStage = (role: Exclude<VehicleStageRole, "core">) => {
    try {
      const baseId = role === "booster" ? "booster" : role === "upper" ? "upper" : "payload";
      let index = 1;
      while (vehicleTopology.stages.some((stage) => stage.id === `${baseId}-${String(index).padStart(2, "0")}`)) index += 1;
      const id = `${baseId}-${String(index).padStart(2, "0")}`;
      const stage = createStagePlan({
        id,
        name: role === "booster" ? `Booster set ${index}` : role === "upper" ? `Upper stage ${index}` : `Payload stage ${index}`,
        role,
        attachment: role === "booster" ? "parallel" : "serial",
        parentStageId: "sustainer",
        repeatCount: role === "booster" ? 2 : 1,
        repeatRadiusM: role === "booster" ? 0.09 : 0,
      });
      persistVehicleTopology({ ...vehicleTopology, stages: [...vehicleTopology.stages, stage] });
      notify(`${stage.name} added`);
    } catch (error) {
      setTopologyError(error instanceof Error ? error.message : "Unable to add stage");
    }
  };
  const updateTopologyStage = (id: string, patch: Partial<VehicleStagePlan>): boolean => {
    try {
      const nextStages = vehicleTopology.stages.map((stage) => stage.id === id ? { ...stage, ...patch } : stage);
      persistVehicleTopology({ ...vehicleTopology, stages: nextStages });
      return true;
    } catch (error) {
      setTopologyError(error instanceof Error ? error.message : "Unable to update stage");
      return false;
    }
  };
  const updateTopologyMotorFailures = (stage: VehicleStagePlan, value: string): boolean => {
    try {
      return updateTopologyStage(stage.id, {
        failedMotorInstanceIndices: parseFailedMotorInstanceInput(value, stage),
      });
    } catch (error) {
      setTopologyError(error instanceof Error ? error.message : "Unable to update motor failure configuration");
      return false;
    }
  };
  const removeTopologyStage = (id: string) => {
    if (id === "sustainer") {
      setTopologyError("The core sustainer cannot be removed.");
      return;
    }
    try {
      const nextStages = vehicleTopology.stages
        .filter((stage) => stage.id !== id)
        .map((stage) => stage.parentStageId === id ? { ...stage, parentStageId: "sustainer" } : stage);
      persistVehicleTopology({ ...vehicleTopology, stages: nextStages });
      notify("Stage removed from vehicle topology");
    } catch (error) {
      setTopologyError(error instanceof Error ? error.message : "Unable to remove stage");
    }
  };
  const openProjectImport = () => {
    projectImportInputRef.current?.click();
  };
  const copyProjectShare = async () => {
    try {
      const hash = encodeProjectShare({
        projectName: "ARC 54",
        editableInputs,
        topology: vehicleTopology,
        selectedMotorId,
        selectedAerodynamicTableId,
      });
      const shareUrl = `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const fallback = document.createElement("textarea");
        fallback.value = shareUrl;
        fallback.setAttribute("readonly", "true");
        fallback.style.position = "fixed";
        fallback.style.opacity = "0";
        document.body.appendChild(fallback);
        fallback.select();
        const copied = document.execCommand("copy");
        fallback.remove();
        if (!copied) throw new Error("clipboard access is unavailable");
      }
      notify("Design share link copied");
      setExportOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to create design share link");
      notify("Design share link could not be copied");
    }
  };
  const importProjectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      if (file.size > 10_000_000) {
        throw new Error("RocketWorks project files must be 10 MB or smaller.");
      }
      const imported = parseKestrelProjectJson(await file.text());
      applyEditableInputs(imported.editableInputs);
      persistVehicleTopology(imported.topology);
      persistMotorRecords([...imported.motorLibrary]);
      persistAerodynamicTables([...imported.aerodynamicLibrary]);
      setSelectedMotorId(imported.selectedMotorId);
      setSelectedAerodynamicTableId(imported.selectedAerodynamicTableId);
      window.localStorage.setItem(
        LOCAL_AERODYNAMIC_SELECTION_STORAGE_KEY,
        imported.selectedAerodynamicTableId,
      );
      markChanged();
      persistCheckpoint(imported.editableInputs, `Imported project: ${imported.projectName}`);
      setSelected("body");
      setView("design");
      setGuideOpen(false);
      setExportOpen(false);
      if (imported.warnings.length > 0) {
        setSaveError(imported.warnings.join(" "));
        notify(`Imported ${imported.projectName} with review notes`);
      } else {
        setSaveError("");
        notify(`${imported.projectName} imported; rerun estimates to refresh results`);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to import RocketWorks project");
      notify("Project import failed; the current design was not changed");
    }
  };
  const exportArtifact = (format: ExportFormat) => {
    try {
      if ((format === "flight-csv" || format === "uncertainty-csv" || format === "report") && !resultIsCurrent) {
        throw new Error("Run the vertical estimate again before exporting simulation results for this design.");
      }
      if (format === "stage-flight-csv" && !stageFlightIsCurrent) {
        throw new Error("Rerun the coupled 6DOF preview before exporting its trace for this design.");
      }
      const generatedAtIso = new Date().toISOString();
      const cadGeometry: RocketCadGeometry = {
        projectName: "ARC 54",
        noseLengthM: noseLength / 1000,
        noseProfile,
        bodyLengthM: length / 1000,
        diameterM: diameter / 1000,
        finCount,
        finRootChordM: finRootChord / 1000,
        finTipChordM: finTipChord / 1000,
        finSweepM: finSweep / 1000,
        finSpanM: finSpan / 1000,
        finThicknessM: finThickness / 1000,
        centerOfMassXM: massProperties.centerOfMassM.x,
        centerOfPressureXM: staticStability.centerOfPressureXM,
      };
      let filename: string;
      let mediaType: string;
      let content: string;
      if (format === "project") {
        filename = "arc-54.rocketworks.json";
        mediaType = "application/json;charset=utf-8";
        content = createKestrelProjectJson({
          projectId: "arc54",
          projectName: "ARC 54",
          generatedAtIso,
          applicationVersion: "rocketworks-browser-0.1.0",
          vehicle: {
            geometry: cadGeometry,
            material,
            payloadMassKg: payloadMass,
            massProperties,
            staticStability,
            assembly: {
              modelVersion: assembly.modelVersion,
              validationStatus: assembly.validationStatus,
              activeStageIds: assembly.activeStageIds,
              componentCount: assembly.componentInstances.length,
              motorMountCount: assembly.motorMounts.length,
              topology: vehicleTopology,
            },
          } as unknown as JsonValue,
          simulations: {
            verticalFlight: result,
            stageFlight: stageFlightResult,
            verticalSweep: sweepResult,
            freshness: {
              modelVersion: SIMULATION_FRESHNESS_MODEL_VERSION,
              verticalFlight: resultIsCurrent ? "current" : "stale",
              stageFlight: stageFlightResult === null
                ? "not-run"
                : stageFlightIsCurrent
                  ? "current"
                  : "stale",
            },
          } as unknown as JsonValue,
          analyses: {
            uncertainty,
            structural: structuralScreen,
            optimization: optimization
              ? {
                  modelVersion: optimization.result.modelVersion,
                  validationStatus: optimization.result.validationStatus,
                  seed: optimization.result.seed,
                  evaluationCount: optimization.result.evaluationCount,
                  recommendedCandidateId:
                    optimization.result.recommendedCandidateId,
                  paretoFront: optimization.result.paretoFront.map(
                    (candidate) => ({
                      id: candidate.id,
                      variables: candidate.variables,
                      metrics: candidate.metrics,
                      constraints: candidate.constraints,
                      tradeoffScore: candidate.tradeoffScore,
                    }),
                  ),
                }
              : null,
            landing: landingPrediction
              ? {
                  modelVersion: landingPrediction.modelVersion,
                  validationStatus: landingPrediction.validationStatus,
                  seed: landingPrediction.seed,
                  footprint: landingPrediction.footprint,
                  ascentDrift: landingPrediction.ascentDrift,
                  deploymentScenario: landingPrediction.deploymentScenario,
                  failedScenarioCount:
                    landingPrediction.uncertainty.failedSampleCount,
                }
              : null,
          } as unknown as JsonValue,
          configuration: {
            editableInputs,
            topology: vehicleTopology,
            selectedMotorId,
            selectedAerodynamicTableId,
            motorLibrary: userMotorRecords,
            aerodynamicLibrary: aerodynamicTableDefinitions,
          } as unknown as JsonValue,
          provenance: {
            motor: previewMotor.provenance,
            environment: previewEnvironment.definition.provenance,
            aerodynamics: selectedAerodynamicTableDefinition
              ? {
                  source: selectedAerodynamicTableDefinition,
                  modelVersion: selectedAerodynamicTable?.modelVersion,
                  validationStatus: selectedAerodynamicTable?.validationStatus,
                }
              : {
                  source: "constant-drag-coefficient-input",
                  dragCoefficient,
                  validationStatus: "engineering-preview-unvalidated",
                },
            cleanRoomImplementation: true,
          } as unknown as JsonValue,
        });
      } else if (format === "flight-csv") {
        filename = "arc-54-flight-trace.csv";
        mediaType = "text/csv;charset=utf-8";
        content = createFlightTraceCsv(result.trace);
      } else if (format === "stage-flight-csv") {
        if (!stageFlightResult) throw new Error("Run the staged preview before exporting its trace.");
        filename = "arc-54-stage-flight-trace.csv";
        mediaType = "text/csv;charset=utf-8";
        content = createStageFlightTraceCsv(stageFlightResult.trace);
      } else if (format === "sweep-csv") {
        if (!sweepResult) throw new Error("Run a parameter sweep before exporting its table.");
        filename = "arc-54-parameter-sweep.csv";
        mediaType = "text/csv;charset=utf-8";
        content = createParameterSweepCsv(sweepResult.result);
      } else if (format === "uncertainty-csv") {
        filename = "arc-54-uncertainty-samples.csv";
        mediaType = "text/csv;charset=utf-8";
        content = createUncertaintyCsv(uncertainty);
      } else if (format === "report") {
        filename = "arc-54-engineering-report.md";
        mediaType = "text/markdown;charset=utf-8";
        content = createEngineeringReportMarkdown({
          projectName: "ARC 54",
          generatedAtIso,
          vehicle: {
             lengthM: (length + noseLength) / 1000,
            diameterM: diameter / 1000,
            massKg: mass,
            centerOfMassXM: massProperties.centerOfMassM.x,
            centerOfPressureXM: staticStability.centerOfPressureXM,
            staticMarginCalibers: staticStability.staticMarginCalibers,
            axialInertiaKgM2:
              massProperties.inertiaAtCenterKgM2[0][0],
            pitchInertiaKgM2:
              massProperties.inertiaAtCenterKgM2[1][1],
            massModelVersion: assembly.modelVersion,
            aerodynamicModelVersion: staticStability.modelVersion,
          },
          motor: {
            designation: `${previewMotor.manufacturer} ${previewMotor.designation}`,
            totalImpulseNs: previewMotor.metrics.totalImpulseNs,
            peakThrustN: previewMotor.metrics.peakThrustN,
            averageThrustN: previewMotor.metrics.averageThrustN,
            specificImpulseS: previewMotor.metrics.specificImpulseS,
            depletionSource: previewMotor.massFlowHistoryKgS
              ? "measured-mass-flow"
              : "impulse-proportional",
            measuredMassFlowKg: previewMotor.metrics.measuredMassFlowKg,
            provenance: `${previewMotor.provenance.sourceName} · ${previewMotor.provenance.licenseIdentifier} · ${previewMotor.provenance.validationStatus}`,
          },
          environment: {
            siteName: previewEnvironment.definition.site.name,
            elevationM: previewEnvironment.definition.site.elevationM,
            meanWindAt500Mps: Math.hypot(
              environmentAt500M.meanWindWorldMps.x,
              environmentAt500M.meanWindWorldMps.y,
            ),
            windAzimuthDeg,
            surfacePressureHpa,
            surfaceTemperatureC,
            relativeHumidityPercent,
            modelVersion: previewEnvironment.modelVersion,
            validationStatus: previewEnvironment.validationStatus,
            provenance: `${previewEnvironment.definition.provenance.sourceName} · ${previewEnvironment.definition.provenance.licenseIdentifier} · ${previewEnvironment.definition.provenance.validationStatus}`,
          },
          recovery: {
            enabled: recoveryEnabled,
            reefingEnabled: recoveryReefingEnabled,
            reefingDurationS: recoveryReefingDurationS,
            reefingStartAreaFraction: recoveryReefingStartAreaFraction,
          },
          flight: result,
          stageFlight: stageFlightIsCurrent ? stageFlightResult : null,
          stageUncertainty: stageUncertaintyIsCurrent ? stageUncertainty : null,
          uncertainty,
          landing: landingPrediction,
          structural: structuralScreen,
        });
      } else if (format === "dxf") {
        filename = "arc-54-side-profile.dxf";
        mediaType = "application/dxf;charset=utf-8";
        content = createRocketProfileDxf(cadGeometry);
      } else {
        filename = "arc-54-parametric.scad";
        mediaType = "text/plain;charset=utf-8";
        content = createRocketOpenScad(cadGeometry);
      }
      downloadTextArtifact(filename, mediaType, content);
      notify(`${filename} exported`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to export artifact");
    }
  };
  const simulate = () => {
    const inputs = {
      mass,
      diameter,
      dragCoefficient,
      thrust,
      burnTime,
      launchAltitude,
      windSpeed,
      windAzimuthDeg,
      relativeHumidityPercent,
      surfacePressureHpa,
      surfaceTemperatureC,
      recoveryEnabled,
      recoveryDelay,
      recoveryDiameter,
      recoveryReefingEnabled,
      recoveryReefingDurationS,
      recoveryReefingStartAreaFraction,
      recoveryDeploymentSuccessProbability,
      motorRecord: previewMotor,
      aerodynamicTable: selectedAerodynamicTable,
    };
    const runFingerprint = simulationFingerprint;
    setRunning(true);
    setView("flight");
    window.setTimeout(() => {
      try {
        const nextResult = createFlightResult(inputs);
        setResult(nextResult);
        setUncertainty(createUncertaintyResult(inputs, uncertaintyCorrelations, uncertaintySampleCount, uncertaintySeed));
        setLandingPrediction(createLandingPrediction({ ...inputs, uncertaintyCorrelations }, nextResult));
        setLastRunFingerprint(runFingerprint);
        setOptimization(null);
        setSweepResult(null);
        setSweepError("");
        notify("Model run complete");
      } catch (error) {
        notify(error instanceof Error ? error.message : "Unable to run the model");
      } finally {
        setRunning(false);
      }
    }, 520);
  };
  const runStageAwareEstimate = () => {
    if (activeStageCount < 1) {
      notify("Add an enabled stage before running a coupled preview");
      setTopologyOpen(true);
      return;
    }
    setStageFlightRunning(true);
    setStageFlightError("");
    setStageUncertainty(null);
    setStageUncertaintyFingerprint(null);
    setStageUncertaintyError("");
    setView("flight");
    const runFingerprint = simulationFingerprint;
    window.setTimeout(() => {
      try {
        const nextResult = simulateStageFlightPreview(
          createStageFlightPreviewInputs({
            topology: vehicleTopology,
            assembly,
            stageComponents: stageFlightComponents,
            lengthM: length / 1000,
            noseLengthM: noseLength / 1000,
            diameterM: diameter / 1000,
            motor: previewMotor,
            userMotorRecords,
            dragCoefficient,
            environmentAt: previewEnvironment.at,
            launchRailEnabled,
            launchRailLengthM,
            launchRailInclinationDeg,
            launchRailAzimuthDeg,
            recoveryEnabled,
            recoveryDelay,
            recoveryDiameter,
            recoveryReefingEnabled,
            recoveryReefingDurationS,
            recoveryReefingStartAreaFraction,
            aerodynamicTable: selectedAerodynamicTable,
            aerodynamicTableModels,
          }),
        );
        setStageFlightResult(nextResult);
        setStageFlightFingerprint(runFingerprint);
        notify(activeStageCount > 1 ? "Stage-aware 6DOF preview complete" : "Coupled 6DOF preview complete");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to run the staged preview";
        setStageFlightError(message);
        notify(message);
      } finally {
        setStageFlightRunning(false);
      }
    }, 30);
  };
  const runStageUncertainty = () => {
    if (!stageFlightResult || !stageFlightIsCurrent) {
      notify("Run the current coupled preview before propagating its uncertainty");
      return;
    }
    setStageUncertaintyRunning(true);
    setStageUncertaintyError("");
    setView("flight");
    const runFingerprint = simulationFingerprint;
    window.setTimeout(() => {
      try {
        const baseInput = createStageFlightPreviewInputs({
          topology: vehicleTopology,
          assembly,
          stageComponents: stageFlightComponents,
          lengthM: length / 1000,
          noseLengthM: noseLength / 1000,
          diameterM: diameter / 1000,
          motor: previewMotor,
          userMotorRecords,
          dragCoefficient,
          environmentAt: previewEnvironment.at,
          launchRailEnabled,
          launchRailLengthM,
          launchRailInclinationDeg,
          launchRailAzimuthDeg,
          recoveryEnabled,
          recoveryDelay,
          recoveryDiameter,
          recoveryReefingEnabled,
          recoveryReefingDurationS,
          recoveryReefingStartAreaFraction,
          aerodynamicTable: selectedAerodynamicTable,
          aerodynamicTableModels,
        });
        const factors = [
          {
            key: "dryMassScale" as const,
            label: "Dry mass",
            distribution: { kind: "triangular" as const, minimum: 0.97, mode: 1, maximum: 1.03 },
          },
          {
            key: "propellantMassScale" as const,
            label: "Propellant mass",
            distribution: { kind: "triangular" as const, minimum: 0.95, mode: 1, maximum: 1.05 },
          },
          {
            key: "thrustScale" as const,
            label: "Delivered thrust",
            distribution: { kind: "normal" as const, mean: 1, standardDeviation: 0.04, minimum: 0.88, maximum: 1.12 },
          },
          {
            key: "dragCoefficientScale" as const,
            label: "Drag coefficient",
            distribution: { kind: "triangular" as const, minimum: 0.9, mode: 1, maximum: 1.1 },
          },
          ...(selectedAerodynamicTable?.forceMomentDatabaseAvailable
            ? [
                {
                  key: "directForceCoefficientScale" as const,
                  label: "Direct force coefficients",
                  distribution: { kind: "triangular" as const, minimum: 0.9, mode: 1, maximum: 1.1 },
                },
                {
                  key: "directMomentCoefficientScale" as const,
                  label: "Direct moment coefficients",
                  distribution: { kind: "triangular" as const, minimum: 0.9, mode: 1, maximum: 1.1 },
                },
              ]
            : []),
          ...(recoveryEnabled
            ? [
                {
                  key: "recoveryAreaScale" as const,
                  label: "Recovery area",
                  distribution: { kind: "triangular" as const, minimum: 0.8, mode: 1, maximum: 1.2 },
                },
                {
                  key: "recoveryDeploymentSuccess" as const,
                  label: "Recovery deployment",
                  distribution: { kind: "bernoulli" as const, successProbability: recoveryDeploymentSuccessProbability },
                },
              ]
            : []),
          {
            key: "windScale" as const,
            label: "Wind profile",
            distribution: { kind: "uniform" as const, minimum: 0.8, maximum: 1.2 },
          },
          {
            key: "ignitionDelayOffsetS" as const,
            label: "Ignition delay",
            distribution: { kind: "normal" as const, mean: 0, standardDeviation: 0.06, minimum: -0.12, maximum: 0.25 },
          },
          {
            key: "separationImpulseScale" as const,
            label: "Separation impulse",
            distribution: { kind: "triangular" as const, minimum: 0.8, mode: 1, maximum: 1.2 },
          },
          {
            key: "alignmentOffsetRad" as const,
            label: "Launch alignment",
            distribution: { kind: "normal" as const, mean: 0, standardDeviation: 0.0015, minimum: -0.005, maximum: 0.005 },
          },
        ];
        const nextResult = analyzeStageFlightUncertainty({
          baseInput,
          seed: "arc54-coupled-uncertainty-v1",
          sampleCount: 16,
          factors,
          correlations: filterUncertaintyCorrelations(uncertaintyCorrelations, factors.map((factor) => factor.key)),
        });
        setStageUncertainty(nextResult);
        setStageUncertaintyFingerprint(runFingerprint);
        notify("Coupled dispersion analysis complete");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to run coupled dispersion";
        setStageUncertaintyError(message);
        notify(message);
      } finally {
        setStageUncertaintyRunning(false);
      }
    }, 30);
  };
  const changeSweepParameter = (parameterKey: VerticalFlightSweepParameterKey) => {
    const definition = sweepParameterDefinition(parameterKey);
    setSweepParameter(parameterKey);
    setSweepMinimum(definition.minimum);
    setSweepMaximum(definition.maximum);
    setSweepResult(null);
    setSweepError("");
  };
  const changeSweepMinimum = (value: number) => {
    setSweepMinimum(value);
    setSweepResult(null);
    setSweepError("");
  };
  const changeSweepMaximum = (value: number) => {
    setSweepMaximum(value);
    setSweepResult(null);
    setSweepError("");
  };
  const changeSweepSteps = (value: number) => {
    setSweepSteps(value);
    setSweepResult(null);
    setSweepError("");
  };
  const runSweep = () => {
    setSweepRunning(true);
    setSweepError("");
    setView("flight");
    window.setTimeout(() => {
      try {
        if (!Number.isInteger(sweepSteps) || sweepSteps < 2 || sweepSteps > 25) {
          throw new Error("Sweep steps must be an integer from 2 through 25 in the browser preview.");
        }
        const inputs = {
          mass,
          diameter,
          dragCoefficient,
          thrust,
          burnTime,
          launchAltitude,
          windSpeed,
          windAzimuthDeg,
          relativeHumidityPercent,
          surfacePressureHpa,
          surfaceTemperatureC,
          recoveryEnabled,
          recoveryDelay,
          recoveryDiameter,
          recoveryReefingEnabled,
          recoveryReefingDurationS,
          recoveryReefingStartAreaFraction,
          motorRecord: previewMotor,
          aerodynamicTable: selectedAerodynamicTable,
        };
        setSweepResult(
          createSweepResult(
            inputs,
            sweepParameter,
            sweepMinimum,
            sweepMaximum,
            sweepSteps,
          ),
        );
        notify("Parameter sweep complete");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to run parameter sweep";
        setSweepError(message);
        notify(message);
      } finally {
        setSweepRunning(false);
      }
    }, 20);
  };
  const optimize = (mode: "nominal" | "robust" = optimizationMode) => {
    setOptimizing(true);
    setOptimizationMode(mode);
    setView("flight");
    window.setTimeout(() => {
      try {
        const inputs = {
          mass,
          diameter,
          dragCoefficient,
          thrust,
          burnTime,
          launchAltitude,
          windSpeed,
          windAzimuthDeg,
          relativeHumidityPercent,
          surfacePressureHpa,
          surfaceTemperatureC,
          recoveryEnabled,
          recoveryDelay,
          recoveryDiameter,
          recoveryReefingEnabled,
          recoveryReefingDurationS,
          recoveryReefingStartAreaFraction,
          recoveryDeploymentSuccessProbability,
          uncertaintyCorrelations,
          motorRecord: previewMotor,
          aerodynamicTable: selectedAerodynamicTable,
        };
        setOptimization({
          result: createOptimizationResult(inputs, mode),
          baseThrustN: thrust,
          baseRecoveryDiameterM: recoveryDiameter,
          mode,
        });
        notify(mode === "robust" ? "Robust design tradeoffs ready" : "Design tradeoffs ready");
      } catch (error) {
        notify(error instanceof Error ? error.message : "Unable to optimize design");
      } finally {
        setOptimizing(false);
      }
    }, 20);
  };
  const applyOptimizationRecommendation = () => {
    if (!optimization?.result.recommendedCandidateId) return;
    const candidate = optimization.result.paretoFront.find(
      (item) => item.id === optimization.result.recommendedCandidateId,
    );
    if (!candidate) return;
    setThrust(
      optimization.baseThrustN * (candidate.variables.thrustScale ?? 1),
    );
    if (candidate.variables.recoveryDragAreaScale !== undefined) {
      setRecoveryDiameter(
        optimization.baseRecoveryDiameterM *
          Math.sqrt(candidate.variables.recoveryDragAreaScale),
      );
    }
    if (candidate.variables.recoveryDelayS !== undefined) {
      setRecoveryDelay(candidate.variables.recoveryDelayS);
    }
    setOptimization(null);
    markChanged();
    notify("Recommendation applied; rerun the estimate to review it");
  };
  const commandActions: readonly CommandAction[] = [
    { id: "run-estimate", label: "Run vertical estimate", description: "Propagate the current vehicle through the preliminary vertical model", shortcut: "R", run: simulate },
    { id: "run-sweep", label: "Run parameter sweep", description: "Evaluate a bounded one-variable trade study", shortcut: "S", run: runSweep },
    { id: "run-staged", label: activeStageCount > 1 ? "Run staged 6DOF preview" : "Run coupled 6DOF preview", description: activeStageCount > 1 ? "Propagate the active stage graph and event transitions" : "Propagate the current vehicle through the coupled rigid-body preview", run: runStageAwareEstimate },
    { id: "run-benchmarks", label: "Run physics benchmarks", description: "Check deterministic SI anchors and closed-form regression fixtures", run: runPhysicsBenchmarks },
    { id: "open-topology", label: "Edit stages and boosters", description: "Open the serial, parallel, and radial topology editor", run: () => setTopologyOpen(true) },
    { id: "open-motors", label: "Open motor library", description: "Review or import a provenance-qualified user motor curve", run: () => setMotorLibraryOpen(true) },
    { id: "open-aero", label: "Open aerodynamic data", description: "Review or import Mach-Reynolds coefficient tables", run: () => setAerodynamicLibraryOpen(true) },
    { id: "open-templates", label: "Choose a project template", description: "Start from a beginner, high-power, weather, or diagnostic setup", run: () => setTemplatesOpen(true) },
    { id: "open-history", label: "Open local project history", description: "Restore a validated device-local checkpoint", run: () => setHistoryOpen(true) },
    { id: "open-export", label: "Open artifact center", description: "Export project JSON, traces, reports, and CAD references", run: () => setExportOpen(true) },
    { id: "share-design", label: "Copy design share link", description: "Share validated inputs and stage topology without embedding local library data", run: () => { void copyProjectShare(); } },
    { id: "import-project", label: "Import RocketWorks project", description: "Restore a portable project document and its validated user libraries", run: () => setProjectImportRequested(true) },
    { id: "toggle-mode", label: experienceMode === "beginner" ? "Switch to expert mode" : "Switch to beginner mode", description: "Change how much of the workbench is exposed", run: () => changeExperienceMode(experienceMode === "beginner" ? "expert" : "beginner") },
  ];
  const filteredCommandActions = commandActions.filter((action) =>
    `${action.label} ${action.description}`.toLowerCase().includes(commandQuery.trim().toLowerCase()),
  );
  const activeCommandIndex = Math.min(
    commandIndex,
    Math.max(filteredCommandActions.length - 1, 0),
  );
  const executeCommand = (action: CommandAction) => {
    setCommandOpen(false);
    setCommandQuery("");
    setCommandIndex(0);
    action.run();
  };
  const handleCommandKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCommandIndex((current) => Math.min(current + 1, Math.max(filteredCommandActions.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCommandIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const action = filteredCommandActions[activeCommandIndex];
      if (action) executeCommand(action);
    }
  };

  return (
    <main className="app-shell">
      <input
        ref={projectImportInputRef}
        className="sr-only"
        type="file"
        accept=".json,application/json"
        aria-label="Import RocketWorks project document"
        onChange={importProjectFile}
      />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">K</span>
          <div><strong>RocketWorks</strong><span>Aerospace workbench · Mission systems</span></div>
        </div>
        <div className="project-title">
          <button className="quiet-button" aria-label="Go back to projects">‹</button>
          <div><strong>ARC 54 / Vehicle 01</strong><span><i className="live-dot" />{saveError ? "Review required" : saved ? "Saved locally" : "Saving changes…"}</span></div>
        </div>
        <div className="top-actions">
          <div className="mission-chip" aria-label="Mission status"><span>MISSION</span><strong>KST-01</strong><em>PRELIMINARY · REV 01</em></div>
          <button className="quiet-button command-button" onClick={openCommandPalette} aria-haspopup="dialog" aria-expanded={commandOpen}>
            <span>Search actions</span><kbd>⌘ K</kbd>
          </button>
          <div className="mode-switch" role="group" aria-label="Experience mode">
            <button className={experienceMode === "beginner" ? "active" : ""} onClick={() => changeExperienceMode("beginner")}>Beginner</button>
            <button className={experienceMode === "expert" ? "active" : ""} onClick={() => changeExperienceMode("expert")}>Expert</button>
          </div>
          <button className="secondary-button" onClick={() => setTemplatesOpen(true)}>Templates</button>
          <button className="secondary-button" onClick={() => setExportOpen(true)}>Export</button>
          <button className="primary-button" onClick={simulate}>Run estimate</button>
        </div>
      </header>

      <aside className="component-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">Vehicle</span><h1>ARC 54</h1></div>
          <button className="icon-button" aria-label="Open local project history" onClick={() => setHistoryOpen(true)}>···</button>
        </div>
        <div className="design-summary">
          <div><span>Length</span><strong>{designLength} mm</strong></div>
          <div><span>Mass</span><strong>{Math.round(mass * 1000)} g</strong></div>
          <div><span>CG from tip</span><strong>{Math.round(centerOfMassMm)} mm</strong></div>
          <div><span>Static margin</span><strong>{staticStability.staticMarginCalibers.toFixed(1)} cal</strong></div>
        </div>
        <div className="stage-summary" aria-label="Vehicle stage hierarchy">
          <span className="stage-index">{vehicleTopology.stages.length > 1 ? `${vehicleTopology.stages.length} stages` : "Stage 01"}</span>
          <span><strong>{vehicleTopology.stages[0]?.name ?? "Sustainer"}</strong><small>{assembly.componentInstances.length} placed parts · {vehicleTopology.stages.filter((stage) => stage.enabled).length} active · {vehicleTopology.stages.some((stage) => stage.attachment === "parallel") ? "parallel capable" : "serial topology"}</small></span>
          <em>{vehicleTopology.stages.filter((stage) => stage.enabled).length} active</em>
        </div>
        <div className="component-list-heading">
          <span>Components & stages</span>
          <button onClick={() => setTopologyOpen(true)}>+ Add</button>
        </div>
        <nav className="component-list" aria-label="Rocket components">
          {components.map((component) => (
            <button
              className={selected === component.id ? "component active" : "component"}
              key={component.id}
              onClick={() => { setSelected(component.id); setView("design"); }}
            >
              <span className="component-marker">{component.marker}</span>
              <span><strong>{component.name}</strong><small>{componentDetails[component.id]}</small></span>
              <span className="chevron">›</span>
            </button>
          ))}
        </nav>
        <div className="compliance-note">
          <span className="status-dot" />
          <div>
            <strong>Independent implementation</strong>
            <p>Original UI and calculation code. No third-party rocket engine.</p>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <div className="workspace-toolbar">
          <div className="segmented-control" aria-label="Workspace view">
            <button className={view === "design" ? "active" : ""} onClick={() => setView("design")}>Design</button>
            <button className={view === "flight" ? "active" : ""} onClick={() => setView("flight")}>Flight</button>
          </div>
          <div className="workspace-status" aria-label="Current vehicle context">
            <i className="status-pulse" aria-hidden="true" />
            <span>FLIGHT DESIGN / MISSION CONTROL / DESIGN LOOP</span><strong>ARC 54 / SUSTAINER</strong>
          </div>
          <div className="mission-rack" aria-label="Mission telemetry">
            <div><span>CONFIG</span><strong>{configurationId}</strong></div>
            <div><span>STAGES</span><strong>{String(activeStageCount).padStart(2, "0")}</strong></div>
            <div className={designWarning.good ? "readout-ok" : "readout-warn"}>
              <span>CHECK</span><strong>{readinessLabel}</strong>
            </div>
            <div className={resultIsCurrent ? "readout-ok" : "readout-warn"}>
              <span>MODEL</span><strong>{resultIsCurrent ? "CURRENT" : "STALE"}</strong>
            </div>
          </div>
          <div className="view-tools">
            {view === "design" ? (
              <div className="design-view-toggle" aria-label="Design visualization mode">
                <button className={designView === "2d" ? "active" : ""} onClick={() => setDesignView("2d")}>2D</button>
                <button className={designView === "3d" ? "active" : ""} onClick={() => setDesignView("3d")}>3D</button>
              </div>
            ) : (
              <span>Results workspace</span>
            )}
          </div>
        </div>

        {experienceMode === "beginner" && (
          <section className="beginner-guide" aria-labelledby="beginner-guide-title">
            <div className="beginner-guide-copy">
              <span className="eyebrow">Guided workspace</span>
              <h2 id="beginner-guide-title">Build, check, then estimate</h2>
              <p>Start with a template, watch the live CG/CP markers, and run a clearly qualified preview. RocketWorks will explain what each result means.</p>
            </div>
            <div className="beginner-guide-actions">
              <button className="primary-button" onClick={() => setTemplatesOpen(true)}>Choose a template</button>
              <button className="quiet-button" onClick={() => setGuideOpen((open) => !open)} aria-expanded={guideOpen} aria-controls="beginner-guide-detail">{guideOpen ? "Hide guide" : "How to read CG / CP"}</button>
            </div>
            {guideOpen && (
              <div className="beginner-guide-detail" id="beginner-guide-detail">
                <div><span>01</span><strong>CG</strong><p>Centre of gravity: where the current mass model balances.</p></div>
                <div><span>02</span><strong>CP</strong><p>Centre of pressure: the low-speed aerodynamic force location.</p></div>
                <div><span>03</span><strong>Margin</strong><p>The distance between them, shown in body diameters. It is a model result, not a safety certificate.</p></div>
              </div>
            )}
          </section>
        )}

        {view === "design" ? (
          designView === "2d" ? (
            <div className="design-canvas">
              <div className="canvas-grid" />
              <div className="dimension dimension-top"><span /><strong>{designLength} mm</strong><span /></div>
              <div className="rocket-assembly" aria-label="Side profile of the ARC 54 rocket">
                <div className={`rocket-nose rocket-nose-${noseProfile}`} style={{ width: `${Math.max(72, Math.min(160, noseLength * 0.66))}px` }} />
                <div className="rocket-body" style={{ width: `${Math.min(520, 280 + length / 4)}px` }}>
                  <div className="body-label">ARC 54</div><div className="body-band" /><div className="body-seam" />
                </div>
                <div className="rocket-tail">
                  <div className="fin fin-top" /><div className="fin fin-bottom" /><div className="nozzle" />
                </div>
                <div className="cg-marker" style={{ left: `${centerMarkerPercent}%` }}>
                  <span>CG</span>
                </div>
                <div className="cp-marker" style={{ left: `${pressureMarkerPercent}%` }}>
                  <span>CP</span>
                </div>
              </div>
              <div className="centerline" />
              <div className="canvas-caption"><span>Side profile</span><span>Dimensions in millimetres</span></div>
            </div>
          ) : (
            <div className="design-canvas design-canvas-3d">
              <div className="canvas-grid" />
              <Rocket3DViewport
                noseLengthM={noseLength / 1000}
                noseProfile={noseProfile}
                bodyLengthM={length / 1000}
                bodyDiameterM={diameter / 1000}
                finCount={finCount}
                finRootChordM={finRootChord / 1000}
                finTipChordM={finTipChord / 1000}
                finSweepM={finSweep / 1000}
                finSpanM={finSpan / 1000}
                finThicknessM={finThickness / 1000}
                centerOfMassXM={massProperties.centerOfMassM.x}
                centerOfPressureXM={staticStability.centerOfPressureXM}
                componentInstances={previewComponentInstances}
                highlightSurface={
                  selected === "nose"
                    ? "nose"
                    : selected === "body"
                      ? "skin"
                      : selected === "fins"
                        ? "fin"
                        : selected === "mount"
                          ? "nozzle"
                          : selected === "recovery"
                            ? "accent"
                            : null
                }
                onSurfaceSelect={(surface) => {
                  const component: ComponentKey =
                    surface === "nose"
                      ? "nose"
                      : surface === "fin"
                        ? "fins"
                        : surface === "nozzle" || surface === "rear"
                          ? "mount"
                          : "body";
                  setSelected(component);
                  setView("design");
                }}
                onComponentSelect={(componentId) => {
                  const component: ComponentKey =
                    componentId === "nose" || componentId.endsWith("-nose")
                      ? "nose"
                      : componentId === "fins" || componentId.endsWith("-fins")
                        ? "fins"
                        : componentId === "motor" || componentId.endsWith("-motor")
                          ? "mount"
                          : componentId === "recovery" || componentId.endsWith("-recovery")
                            ? "recovery"
                            : "body";
                  setSelected(component);
                  setView("design");
                }}
                onStageSelect={(stageId) => {
                  const stage = vehicleTopology.stages.find((candidate) => candidate.id === stageId);
                  if (stage) {
                    setToast(`${stage.name} selected in the display model`);
                    window.setTimeout(() => setToast(""), 2200);
                  }
                }}
              />
            </div>
          )
        ) : (
          <div className="flight-view">
            <div className="flight-heading">
              <div><span className="eyebrow">Preliminary estimate</span><h2>Vertical flight profile</h2></div>
              <div className="flight-heading-badges">
                <span className="model-badge">{result.modelVersion}</span>
                <span className="model-badge model-badge-source" title={result.aerodynamicModelVersion ?? "Explicit constant drag coefficient"}>
                  {result.aerodynamicCoefficientBasis === "mach-reynolds-angle-table"
                    ? "CD α/β TABLE"
                    : result.aerodynamicCoefficientBasis === "mach-reynolds-table"
                      ? "CD TABLE"
                      : "CD CONSTANT"}
                </span>
              </div>
            </div>
            {!resultIsCurrent && (
              <div className="stale-result-banner" role="status">
                <span>RERUN REQUIRED</span>
                <div>
                  <strong>This flight profile is from an earlier configuration</strong>
                  <p>Vehicle, motor, weather, recovery, rail, topology, or aerodynamic-table inputs changed after the last vertical estimate. Recalculate before interpreting or exporting these results.</p>
                </div>
                <button className="secondary-button" onClick={simulate} disabled={running}>{running ? "Running…" : "Rerun estimate"}</button>
              </div>
            )}
            {activeStageCount > 0 && (
              <section className="stage-flight-card" aria-labelledby="stage-flight-title">
                <div className="stage-flight-heading">
                  <div>
                    <span className="eyebrow">{activeStageCount > 1 ? "Topology-aware preview" : "Coupled dynamics preview"}</span>
                    <h3 id="stage-flight-title">{activeStageCount > 1 ? "6DOF staging run" : "6DOF ascent run"}</h3>
                    <p>{activeStageCount > 1 ? "Uses the active stage graph, live mass properties, topology-specific aerodynamics, and explicit event transitions." : "Propagates the current single-stage vehicle with live mass properties, preliminary aerodynamic loads, launch environment, and optional rail handoff."}</p>
                  </div>
                  <button className="primary-button" onClick={runStageAwareEstimate} disabled={stageFlightRunning}>
                    {stageFlightRunning ? "Propagating…" : stageFlightResult ? (activeStageCount > 1 ? "Rerun staged preview" : "Rerun 6DOF preview") : (activeStageCount > 1 ? "Run staged preview" : "Run 6DOF preview")}
                  </button>
                </div>
                {stageFlightError && <div className="stage-flight-error" role="alert">{stageFlightError}</div>}
                {stageFlightResult && !stageFlightIsCurrent && (
                  <div className="stale-result-banner stage-stale-result-banner" role="status">
                    <span>RERUN REQUIRED</span>
                    <div>
                      <strong>This coupled trace is from an earlier configuration</strong>
                      <p>The active vehicle, motor, environment, rail, stage graph, or aerodynamic table changed after this run. Rerun the coupled preview before using its trace or export.</p>
                    </div>
                    <button className="secondary-button" onClick={runStageAwareEstimate} disabled={stageFlightRunning}>{stageFlightRunning ? "Propagating…" : "Rerun 6DOF"}</button>
                  </div>
                )}
                {stageFlightResult ? (
                  <>
                    <div className="stage-flight-metrics">
                      <div><span>Peak altitude</span><strong>{stageFlightResult.maxAltitudeAglM.toFixed(0)} m</strong></div>
                      <div><span>Peak speed</span><strong>{stageFlightResult.maxSpeedMps.toFixed(1)} m/s</strong></div>
                      <div><span>Apogee estimate</span><strong>{stageFlightResult.timeToApogeeS.toFixed(1)} s</strong></div>
                      <div><span>Events applied</span><strong>{stageFlightResult.events.length}</strong></div>
                      {stageFlightResult.recoveryModelVersion && (
                        <div><span>Peak recovery drag</span><strong>{Math.max(0, ...stageFlightResult.trace.map((point) => point.recoveryDragN)).toFixed(1)} N</strong><small>retained vehicle load</small></div>
                      )}
                    </div>
                    {stageRecoveryOpeningLoad && (
                      <section className="recovery-opening-load-card" aria-labelledby="recovery-opening-load-title">
                        <div className="recovery-opening-load-heading">
                          <div>
                            <span className="eyebrow">Recovery load screen</span>
                            <h4 id="recovery-opening-load-title">Opening-load estimate</h4>
                            <p>Quasi-steady envelope over the commanded inflation window. Opening shock, snatch force, lines, fabric, canopy geometry, and structural response are not modeled.</p>
                          </div>
                          <span className={`uncertainty-status uncertainty-status-${stageRecoveryOpeningLoad.coverage}`}>
                            {stageRecoveryOpeningLoad.coverage === "assessed" ? "ASSESSED WINDOW" : stageRecoveryOpeningLoad.coverage === "partial" ? "PARTIAL WINDOW" : "NOT ASSESSED"}
                          </span>
                        </div>
                        <div className="recovery-opening-load-grid">
                          <div>
                            <span>Peak q during inflation</span>
                            <strong>{formatOpeningLoadValue(stageRecoveryOpeningLoad.peakDynamicPressurePa, 0, "Pa")}</strong>
                            <small>{stageRecoveryOpeningLoad.peakTimeS === null ? "No overlapping trace" : `at ${stageRecoveryOpeningLoad.peakTimeS.toFixed(2)} s`}</small>
                          </div>
                          <div>
                            <span>Peak quasi-steady drag</span>
                            <strong>{formatOpeningLoadValue(stageRecoveryOpeningLoad.peakQuasiSteadyDragN, 1, "N")}</strong>
                            <small>Cd · A screen</small>
                          </div>
                          <div>
                            <span>Inflation impulse</span>
                            <strong>{formatOpeningLoadValue(stageRecoveryOpeningLoad.inflationImpulseNs, 1, "N·s")}</strong>
                            <small>trapezoidal q · Cd · A</small>
                          </div>
                          <div>
                            <span>Load-rate proxy</span>
                            <strong>{formatOpeningLoadValue(stageRecoveryOpeningLoad.openingLoadRateNps, 1, "N/s")}</strong>
                            <small>peak drag / inflation time</small>
                          </div>
                        </div>
                        {stageRecoveryOpeningLoad.warnings.length > 0 && (
                          <ul className="recovery-opening-load-notes">
                            {stageRecoveryOpeningLoad.warnings.slice(0, 2).map((warning) => <li key={warning}>{warning}</li>)}
                          </ul>
                        )}
                        <small className="recovery-opening-load-model">{stageRecoveryOpeningLoad.modelVersion} · {stageRecoveryOpeningLoad.validationStatus}</small>
                      </section>
                    )}
                    {stageFlightResult.rail && (
                      <div className="stage-flight-rail" aria-label="Launch rail handoff">
                        <div><span>RAIL CONSTRAINT</span><strong>{stageFlightResult.rail.freeFlight ? "Released to free flight" : "No rail exit"}</strong></div>
                        <div><span>TRAVEL</span><strong>{stageFlightResult.rail.events.find((event) => event.type === "rail_exit")?.distanceAlongRailM.toFixed(2) ?? launchRailLengthM.toFixed(2)} m</strong></div>
                        <div><span>EXIT SPEED</span><strong>{stageFlightResult.rail.events.find((event) => event.type === "rail_exit")?.speedAlongRailMps.toFixed(1) ?? "—"} m/s</strong></div>
                        <div><span>HANDOFF</span><strong>{stageFlightResult.rail.events.find((event) => event.type === "rail_exit")?.timeS.toFixed(2) ?? "—"} s</strong></div>
                      </div>
                    )}
                    {stageFlightResult.clusterDiagnostics.length > 0 && (
                      <section className="stage-flight-clusters" aria-labelledby="stage-flight-clusters-title">
                        <div className="stage-flight-clusters-heading">
                          <div>
                            <span className="eyebrow">Propulsion readiness</span>
                            <h4 id="stage-flight-clusters-title">Motor-state diagnostics</h4>
                            <p>Configured cluster availability and retained failed-motor propellant at pad initialization. This is a deterministic preview check, not a hardware-health or ignition-probability estimate.</p>
                          </div>
                          <span className="stage-flight-clusters-count">{stageFlightResult.clusterDiagnostics.length} cluster{stageFlightResult.clusterDiagnostics.length === 1 ? "" : "s"}</span>
                        </div>
                        <div className="stage-flight-cluster-list">
                          {stageFlightResult.clusterDiagnostics.map((diagnostic) => (
                            <article className={`stage-flight-cluster stage-flight-cluster-${diagnostic.status}`} key={diagnostic.stageId}>
                              <div className="stage-flight-cluster-title">
                                <div><strong>{diagnostic.stageName}</strong><span>{diagnostic.activeMotorCount} / {diagnostic.motorCount} motors available</span></div>
                                <em>{diagnostic.status}</em>
                              </div>
                              <div className="stage-flight-cluster-grid">
                                <div><span>Failed</span><strong>{diagnostic.failedMotorCount}</strong></div>
                                <div><span>Attached propellant</span><strong>{diagnostic.attachedPropellantMassKg.toFixed(3)} kg</strong></div>
                                <div><span>Retained by failures</span><strong>{diagnostic.failedPropellantMassKg.toFixed(3)} kg</strong></div>
                              </div>
                              <p>{diagnostic.note}</p>
                            </article>
                          ))}
                        </div>
                      </section>
                    )}
                    <section className="stage-flight-convergence" aria-labelledby="stage-flight-convergence-title">
                      <div className="stage-flight-convergence-heading">
                        <div>
                          <span className="eyebrow">Numerical check</span>
                          <h4 id="stage-flight-convergence-title">Integration-step convergence</h4>
                          <p>Reruns the same coupled model at half the step size. This checks numerical sensitivity; it is not validation, certification, or a flight-safety gate.</p>
                        </div>
                        <span className={`uncertainty-status uncertainty-status-${stageFlightResult.convergence.status}`}>
                          {formatStageFlightConvergenceStatus(stageFlightResult.convergence.status)}
                        </span>
                      </div>
                      <div className="stage-flight-convergence-grid">
                        <div><span>Step pair</span><strong>{stageFlightResult.convergence.baseTimeStepS.toFixed(3)} → {stageFlightResult.convergence.refinedTimeStepS.toFixed(3)} s</strong><small>coarse → half-step</small></div>
                        <div><span>Peak altitude shift</span><strong>{formatRelativeDifference(stageFlightResult.convergence.maxAltitudeRelativeDifference)}</strong><small>relative difference</small></div>
                        <div><span>Peak speed shift</span><strong>{formatRelativeDifference(stageFlightResult.convergence.maxSpeedRelativeDifference)}</strong><small>relative difference</small></div>
                        <div><span>Apogee timing</span><strong>{formatAbsoluteDifference(stageFlightResult.convergence.apogeeTimeDifferenceS, "s")}</strong><small>absolute difference</small></div>
                        <div><span>Final position</span><strong>{formatAbsoluteDifference(stageFlightResult.convergence.finalPositionDifferenceM, "m")}</strong><small>state-vector difference</small></div>
                        <div><span>Event timing</span><strong>{formatAbsoluteDifference(stageFlightResult.convergence.maximumEventTimeDifferenceS, "s")}</strong><small>maximum shared-event delta</small></div>
                      </div>
                      {stageFlightResult.convergence.warnings.length > 0 && (
                        <ul className="stage-flight-convergence-warnings">
                          {stageFlightResult.convergence.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                        </ul>
                      )}
                    </section>
                    {stageFlightResult.separatedBodies.length > 0 && (
                      <section className="stage-separated-bodies" aria-labelledby="stage-separated-bodies-title">
                        <div className="stage-separated-bodies-heading">
                          <div>
                            <span className="eyebrow">Flight dynamics / discard branch</span>
                            <h4 id="stage-separated-bodies-title">Separated trajectories</h4>
                            <p>Released stages are carried from the exact event state into an independent ballistic-capable preview. When configured, the branch receives the equal-and-opposite linear-momentum delta-v implied by the retained and detached masses; a stage-specific area and coefficient add isotropic point drag. This remains an analytical component check, not an aerodynamic clearance or range-safety result.</p>
                          </div>
                          <span className="stage-separated-bodies-badge">{stageFlightResult.separatedBodies.length} bod{stageFlightResult.separatedBodies.length === 1 ? "y" : "ies"}</span>
                        </div>
                        {stageFlightResult.multiBodySeparation && (
                          <div className="stage-multi-body-separation">
                            <div className="stage-multi-body-separation-heading">
                              <div>
                                <span className="eyebrow">Pairwise path diagnostic</span>
                                <h5>Multi-body COM separation</h5>
                                <p>Checks every retained/detached and detached/detached center-of-mass path pair from the later release time. A separate conservative spherical-envelope screen below adds geometry bounds when the component geometry is available; neither view is a contact or range-safety solver.</p>
                              </div>
                              <span className={`stage-multi-body-separation-status stage-multi-body-separation-status-${stageFlightResult.multiBodySeparation.status}`}>
                                {stageFlightResult.multiBodySeparation.status}
                              </span>
                            </div>
                            <div className="stage-multi-body-separation-grid">
                              <div><span>Pair checks</span><strong>{stageFlightResult.multiBodySeparation.pairs.length}</strong><small>{stageFlightResult.multiBodySeparation.bodies.length} propagated bodies</small></div>
                              <div><span>Closest pair</span><strong>{stageFlightResult.multiBodySeparation.closestPair ? `${stageFlightResult.multiBodySeparation.closestPair.firstBodyId} / ${stageFlightResult.multiBodySeparation.closestPair.secondBodyId}` : "Not assessed"}</strong><small>{stageFlightResult.multiBodySeparation.closestPair ? `at ${stageFlightResult.multiBodySeparation.closestPair.timeS.toFixed(2)} s` : "no overlapping post-release samples"}</small></div>
                              <div><span>Minimum COM separation</span><strong>{stageFlightResult.multiBodySeparation.minimumDistanceM === null ? "Not assessed" : `${stageFlightResult.multiBodySeparation.minimumDistanceM.toFixed(2)} m`}</strong><small>center-to-center path distance</small></div>
                              <div><span>Analysis start</span><strong>{stageFlightResult.multiBodySeparation.releaseTimeS.toFixed(2)} s</strong><small>earliest body release</small></div>
                            </div>
                            {stageFlightResult.multiBodySeparation.warnings.length > 0 && (
                              <ul className="stage-multi-body-separation-warnings">
                                {stageFlightResult.multiBodySeparation.warnings.slice(0, 2).map((warning) => <li key={warning}>{warning}</li>)}
                              </ul>
                            )}
                          </div>
                        )}
                          {stageFlightResult.separationDynamics.length > 0 && (
                            <div className="stage-separation-dynamics">
                            <div className="stage-separation-dynamics-heading">
                              <div>
                                <span className="eyebrow">Event handoff diagnostic</span>
                                <h5>Separation impulse audit</h5>
                                <p>Checks the instantaneous retained/detached handoff for linear momentum balance and exposes any first-order angular impulse that the current branch does not synthesize.</p>
                              </div>
                              <span className={`stage-separation-dynamics-status stage-separation-dynamics-status-${separationAuditStatus(stageFlightResult.separationDynamics)}`}>
                                {separationAuditStatus(stageFlightResult.separationDynamics)}
                              </span>
                            </div>
                            <div className="stage-separation-dynamics-grid">
                              <div><span>Audited events</span><strong>{stageFlightResult.separationDynamics.length}</strong><small>{stageFlightResult.separationDynamics.filter((audit) => audit.status === "balanced").length} balanced</small></div>
                              <div><span>Maximum momentum residual</span><strong>{(() => { const value = maximumNullableMetric(stageFlightResult.separationDynamics.map((audit) => audit.linearMomentumResidualMagnitudeKgMps)); return value === null ? "Not assessed" : `${value.toExponential(2)} kg·m/s`; })()}</strong><small>instantaneous audit</small></div>
                              <div><span>Maximum angular impulse</span><strong>{(() => { const value = maximumNullableMetric(stageFlightResult.separationDynamics.map((audit) => audit.angularImpulseResidualMagnitudeKgM2PerS)); return value === null ? "Not assessed" : `${value.toExponential(2)} kg·m²/s`; })()}</strong><small>unmodeled first-order term</small></div>
                              <div><span>Model</span><strong>{stageFlightResult.separationDynamics[0].modelVersion}</strong><small>conservation audit only</small></div>
                            </div>
                            {stageFlightResult.separationDynamics.some((audit) => audit.status !== "balanced") && (
                              <ul className="stage-separation-dynamics-warnings">
                                {[...new Set(stageFlightResult.separationDynamics.flatMap((audit) => audit.warnings))].slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}
                              </ul>
                            )}
                          </div>
                        )}
                        {stageFlightResult.separationImpulseSolutions.length > 0 && (
                          <div className="stage-separation-impulse-solver">
                            <div className="stage-separation-impulse-solver-heading">
                              <div>
                                <span className="eyebrow">Coupled event diagnostic</span>
                                <h5>Momentum-balanced impulse allocation</h5>
                                <p>Distributes a minimum-norm detached-body correction across the supplied point-mass moment arms. The proposed correction is review telemetry only; it is not applied to the active flight branches.</p>
                              </div>
                              <span className={`stage-separation-impulse-solver-status stage-separation-impulse-solver-status-${coupledImpulseStatus(stageFlightResult.separationImpulseSolutions)}`}>
                                {coupledImpulseStatus(stageFlightResult.separationImpulseSolutions)}
                              </span>
                            </div>
                            <div className="stage-separation-impulse-solver-grid">
                              <div><span>Release events</span><strong>{stageFlightResult.separationImpulseSolutions.length}</strong><small>{stageFlightResult.separationImpulseSolutions.filter((solution) => solution.status === "balanced").length} balanced</small></div>
                              <div><span>Max correction</span><strong>{(() => { const value = maximumNullableMetric(stageFlightResult.separationImpulseSolutions.map((solution) => solution.maximumCorrectionMps)); return value === null ? "Not assessed" : `${value.toFixed(4)} m/s`; })()}</strong><small>minimum-norm proposal</small></div>
                              <div><span>Angular residual</span><strong>{(() => { const value = maximumNullableMetric(stageFlightResult.separationImpulseSolutions.map((solution) => solution.angularImpulseResidualMagnitudeKgM2PerS)); return value === null ? "Not assessed" : `${value.toExponential(2)} kg·m²/s`; })()}</strong><small>after proposed correction</small></div>
                              <div><span>Model</span><strong>{stageFlightResult.separationImpulseSolutions[0].modelVersion}</strong><small>event-level only</small></div>
                            </div>
                            {stageFlightResult.separationImpulseSolutions.some((solution) => solution.status !== "balanced") && (
                              <ul className="stage-separation-impulse-solver-warnings">
                                {[...new Set(stageFlightResult.separationImpulseSolutions.flatMap((solution) => solution.warnings))].slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}
                              </ul>
                            )}
                          </div>
                        )}
                        {stageFlightResult.separationEnvelope && (
                          <div className="stage-separation-envelope">
                            <div className="stage-separation-envelope-heading">
                              <div>
                                <span className="eyebrow">Geometry-bound screen</span>
                                <h5>Spherical-envelope clearance</h5>
                                <p>Subtracts fixed conservative component bounds from the sampled center-of-mass separation. A non-positive result is a potential-overlap diagnostic, not proof of contact.</p>
                              </div>
                              <span className={`stage-separation-envelope-status stage-separation-envelope-status-${stageFlightResult.separationEnvelope.envelopeStatus}`}>
                                {stageFlightResult.separationEnvelope.envelopeStatus}
                              </span>
                            </div>
                            <div className="stage-separation-envelope-grid">
                              <div><span>Geometry-bounded bodies</span><strong>{stageFlightResult.separationEnvelope.bodies.filter((body) => body.envelopeRadiusM !== null).length} / {stageFlightResult.separationEnvelope.bodies.length}</strong><small>fixed spherical bounds</small></div>
                              <div><span>Minimum envelope clearance</span><strong>{stageFlightResult.separationEnvelope.minimumEnvelopeClearanceM === null ? "Not assessed" : `${stageFlightResult.separationEnvelope.minimumEnvelopeClearanceM.toFixed(2)} m`}</strong><small>{stageFlightResult.separationEnvelope.closestEnvelopePair ? `at ${stageFlightResult.separationEnvelope.closestEnvelopePair.timeS.toFixed(2)} s` : "no geometry-qualified pair"}</small></div>
                              <div><span>Closest envelope pair</span><strong>{stageFlightResult.separationEnvelope.closestEnvelopePair ? `${stageFlightResult.separationEnvelope.closestEnvelopePair.firstBodyId} / ${stageFlightResult.separationEnvelope.closestEnvelopePair.secondBodyId}` : "Not assessed"}</strong><small>{stageFlightResult.separationEnvelope.closestEnvelopePair ? `${stageFlightResult.separationEnvelope.closestEnvelopePair.radiusSumM.toFixed(2)} m radius sum` : "supply component bounds"}</small></div>
                              <div><span>Overlap screen</span><strong>{stageFlightResult.separationEnvelope.closestEnvelopePair && stageFlightResult.separationEnvelope.closestEnvelopePair.clearanceM <= 0 ? "Potential overlap" : stageFlightResult.separationEnvelope.envelopeStatus === "not-assessed" ? "Not assessed" : "No overlap in assessed path"}</strong><small>not a collision solver</small></div>
                            </div>
                            {stageFlightResult.separationEnvelope.warnings.length > 0 && (
                              <ul className="stage-separation-envelope-warnings">
                                {stageFlightResult.separationEnvelope.warnings.slice(0, 2).map((warning) => <li key={warning}>{warning}</li>)}
                              </ul>
                            )}
                          </div>
                        )}
                        <div className="stage-separated-body-grid">
                          {stageFlightResult.separatedBodies.map((body) => (
                            <article className="stage-separated-body" key={`${body.stageId}-${body.instanceId ?? "logical"}-${body.releaseTimeS}`}>
                              <div className="stage-separated-body-title">
                                <span>{body.stageName}</span>
                                <strong>{body.impactTimeS === null ? "No impact in window" : `Impact ${body.impactTimeS.toFixed(2)} s`}</strong>
                              </div>
                              {body.instanceId && <small className="stage-separated-body-instance">Physical copy · {body.instanceId}</small>}
                              <div className="stage-separated-body-metrics">
                                <div><span>Release</span><strong>{body.releaseTimeS.toFixed(2)} s</strong></div>
                                <div><span>Retained dV</span><strong>+X {body.retainedBodyDeltaVBodyMps.x.toFixed(2)} m/s</strong><small>body frame</small></div>
                                <div><span>Detached dV</span><strong>{body.detachedBodyDeltaVBodyMps.x.toFixed(2)} m/s</strong><small>{body.separationImpulseModel === "mass-ratio-linear-momentum" ? "mass-ratio impulse · body +X" : "not supplied"}</small></div>
                                <div><span>Peak altitude</span><strong>{body.maxAltitudeAglM.toFixed(1)} m</strong></div>
                                <div><span>Peak speed</span><strong>{body.maxSpeedMps.toFixed(1)} m/s</strong></div>
                                <div><span>Drag basis</span><strong>{body.referenceAreaM2 !== undefined && body.dragCoefficient !== undefined ? `Cd ${body.dragCoefficient.toFixed(3)} · ${body.referenceAreaM2.toFixed(4)} m²` : "Gravity only"}</strong><small>{body.referenceAreaM2 !== undefined && body.dragCoefficient !== undefined ? "isotropic point drag" : "no detached-stage aero basis"}</small></div>
                                {body.clearance && (
                                  <div><span>Min COM separation</span><strong>{body.clearance.minimumDistanceM === null ? "Not assessed" : `${body.clearance.minimumDistanceM.toFixed(2)} m`}</strong><small>{body.clearance.minimumDistanceTimeS === null ? body.clearance.status : `closest at ${body.clearance.minimumDistanceTimeS.toFixed(2)} s · ${body.clearance.status}`}</small></div>
                                )}
                                <div><span>Spherical envelope</span><strong>{body.envelopeRadiusM === undefined ? "Not assessed" : `${body.envelopeRadiusM.toFixed(2)} m`}</strong><small>fixed conservative radius</small></div>
                                <div><span>Model</span><strong>{body.validationStatus}</strong></div>
                              </div>
                              <p className="stage-separated-body-note">{body.referenceAreaM2 !== undefined && body.dragCoefficient !== undefined ? "Isotropic point-drag path." : "Gravity-only path."} {body.separationImpulseModel === "mass-ratio-linear-momentum" ? "The detached dV uses an instantaneous equal-and-opposite linear-momentum impulse based on the event delta-v and mass ratio." : "No detached-body impulse was supplied, so the branch starts from the pre-event release velocity."} Lift, attitude-dependent aero torque, separation mechanism dynamics, plume interaction, collision, clearance, and recovery remain outside this preview.</p>
                            </article>
                          ))}
                        </div>
                      </section>
                    )}
                    <StageFlightProfileChart result={stageFlightResult} />
                    {activeStageCount === 1 && (
                      <section className="stage-flight-comparison" aria-labelledby="stage-flight-comparison-title">
                        <div className="stage-flight-comparison-heading">
                          <div>
                            <span className="eyebrow">Cross-model diagnostic</span>
                            <h4 id="stage-flight-comparison-title">Vertical vs coupled preview</h4>
                            <p>Compare the automatic 1D estimate with the explicit single-stage 6DOF run. Differences are diagnostic, not validation evidence.</p>
                          </div>
                          <span>same project inputs</span>
                        </div>
                        <div className="stage-flight-comparison-grid">
                          <div><span>Apogee delta</span><strong>{formatSignedMetric(stageFlightResult.maxAltitudeAglM - result.apogeeM, 0)} m</strong><small>6DOF minus 1D</small></div>
                          <div><span>Peak-speed delta</span><strong>{formatSignedMetric(stageFlightResult.maxSpeedMps - result.maxSpeedMps)} m/s</strong><small>6DOF minus 1D</small></div>
                          <div><span>Apogee-time delta</span><strong>{formatSignedMetric(stageFlightResult.timeToApogeeS - result.timeToApogeeS)} s</strong><small>6DOF minus 1D</small></div>
                        </div>
                        <p className="stage-flight-comparison-note">The models use different force and constraint pathways: the 1D result is the primary vertical estimate, while the coupled run includes attitude, environment, aerodynamic-load, and optional rail adapters. Both remain unvalidated engineering previews.</p>
                      </section>
                    )}
                    <div className="stage-flight-events" aria-label="Staged flight events">
                      {stageFlightResult.events.length === 0 ? (
                        <span className="stage-flight-empty">No rail, staging, failure, or recovery transitions were reached in this run.</span>
                      ) : stageFlightResult.events.map((event) => (
                        <div key={`${event.id}-${event.timeS}`}>
                          <span>{event.timeS.toFixed(2)} s</span>
                          <strong>{event.label}</strong>
                          {event.detachedStageInstanceIds.length > 0 && <small>released copies · {event.detachedStageInstanceIds.join(" + ")}</small>}
                          <small>{event.attachedStageIdsBefore.join(" + ")} → {event.attachedStageIdsAfter.join(" + ")}</small>
                          {event.separationDeltaVBodyMps && event.detachedStageIds.length > 0 && <small>retained dV +X {event.separationDeltaVBodyMps.x.toFixed(2)} m/s · world ({event.separationDeltaVWorldMps?.x.toFixed(2)}, {event.separationDeltaVWorldMps?.y.toFixed(2)}, {event.separationDeltaVWorldMps?.z.toFixed(2)}) m/s</small>}
                        </div>
                      ))}
                    </div>
                    <div className="stage-flight-status">
                      <span>MODEL STATUS</span>
                      <strong>{stageFlightResult.validationStatus}</strong>
                      <small>{stageFlightResult.stagingModelVersion} · {stageFlightResult.aerodynamicsModelVersion}{stageFlightResult.recoveryModelVersion ? ` · ${stageFlightResult.recoveryModelVersion}` : ""}{stageFlightResult.rail ? ` · ${stageFlightResult.rail.modelVersion}` : ""}</small>
                    </div>
                    <div className="stage-flight-warnings" role="note">
                      <span>WARNINGS</span>
                      <ul>{stageFlightResult.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}</ul>
                    </div>
                    <StageFlightUncertaintyCard
                      result={stageUncertainty}
                      running={stageUncertaintyRunning}
                      error={stageUncertaintyError}
                      current={stageFlightIsCurrent}
                      resultCurrent={stageUncertaintyIsCurrent}
                      hasDirectForceMomentDatabase={Boolean(selectedAerodynamicTable?.forceMomentDatabaseAvailable)}
                      onRun={runStageUncertainty}
                    />
                  </>
                ) : (
                  <div className="stage-flight-empty">Run the staged preview to propagate ignition, burnout, and separation events through the retained vehicle.</div>
                )}
              </section>
            )}
            <div className="metric-grid">
              <div className="metric"><span>Apogee</span><strong>{running ? <Skeleton width={86} /> : `${result.apogeeM.toFixed(0)} m`}</strong><small>Above launch point</small></div>
              <div className="metric"><span>Maximum speed</span><strong>{running ? <Skeleton width={96} /> : `${result.maxSpeedMps.toFixed(1)} m/s`}</strong><small>{result.maxMach.toFixed(2)} Mach</small></div>
              <div className="metric"><span>Time to apogee</span><strong>{running ? <Skeleton width={74} /> : `${result.timeToApogeeS.toFixed(1)} s`}</strong><small>{result.totalFlightTimeS.toFixed(1)} s total flight</small></div>
              <div className="metric"><span>Thrust / weight</span><strong>{running ? <Skeleton width={62} /> : `${result.thrustToWeightAtIgnition.toFixed(1)} : 1`}</strong><small>{result.totalImpulseNs.toFixed(1)} N·s impulse</small></div>
            </div>
            <div className="chart-card">
              <div className="chart-title">
                <div><strong>Flight trace</strong><span>Switch metrics and inspect the estimated trajectory over time</span></div>
                <span className="legend"><i /> Max q {Math.round(result.maxDynamicPressurePa)} Pa</span>
              </div>
              {running ? <div className="chart-loading"><Skeleton height={260} borderRadius={12} /></div> : <FlightChart result={result} />}
            </div>
            <FlightComparisonCard
              current={result}
              reference={comparisonReference}
              referenceFingerprint={comparisonReferenceFingerprint}
              currentFingerprint={lastRunFingerprint}
              resultIsCurrent={resultIsCurrent}
              running={running}
              onPin={pinComparisonReference}
              onClear={clearComparisonReference}
            />
            <FlightDataComparisonCard
              series={flightDataSeries}
              comparison={flightDataComparisonState.comparison}
              error={flightDataError || flightDataComparisonState.error}
              resultIsCurrent={resultIsCurrent}
              traceSource={flightDataTraceSource}
              coupledTraceAvailable={stageFlightResult !== null && stageFlightIsCurrent}
              onTraceSourceChange={setFlightDataTraceSource}
              timeOffsetS={flightDataTimeOffsetS}
              onTimeOffsetChange={(value) => { setFlightDataTimeOffsetS(Number.isFinite(value) ? value : 0); }}
              onExport={exportFlightDataComparison}
              onImport={importFlightData}
              onClear={clearFlightData}
            />
            <PhysicsBenchmarkCard
              result={benchmarkResult}
              running={benchmarkRunning}
              onRun={runPhysicsBenchmarks}
            />
            <div className="uncertainty-card">
              <div className="event-card-heading">
                <div>
                  <strong>Dispersion envelope</strong>
                  <span>Seeded input-uncertainty propagation</span>
                </div>
                <div className="uncertainty-card-heading-meta">
                  <span>{uncertainty.successfulSampleCount}/{uncertainty.requestedSampleCount} scenarios</span>
                  <span>{uncertainty.method} · n={uncertainty.successfulSampleCount}</span>
                  <strong className={`uncertainty-status uncertainty-status-${uncertainty.convergence.status}`}>{formatConvergenceStatus(uncertainty.convergence.status)}</strong>
                </div>
              </div>
              <UncertaintySettingsEditor
                sampleCount={uncertaintySampleCount}
                seed={uncertaintySeed}
                isCurrent={resultIsCurrent}
                onSampleCountChange={(value) => {
                  setUncertaintySampleCount(value);
                  markChanged();
                }}
                onSeedChange={(value) => {
                  setUncertaintySeed(value);
                  markChanged();
                }}
              />
              <div className="uncertainty-grid">
                <UncertaintyMetric
                  label="Apogee P05 / P50 / P95"
                  summary={uncertainty.metrics.apogeeM}
                  unit="m"
                />
                <UncertaintyMetric
                  label="Max speed P05 / P50 / P95"
                  summary={uncertainty.metrics.maxSpeedMps}
                  unit="m/s"
                  decimals={1}
                />
                {recoveryEnabled && (
                  <UncertaintyMetric
                    label="Impact speed P05 / P50 / P95"
                    summary={uncertainty.metrics.impactSpeedMps}
                    unit="m/s"
                    decimals={1}
                  />
                )}
                <div className="uncertainty-driver">
                  <span>Primary apogee driver</span>
                  <strong>{uncertainty.sensitivityByMetric.apogeeM?.[0]?.parameterLabel ?? "Unavailable"}</strong>
                  <small>
                    Spearman ρ {uncertainty.sensitivityByMetric.apogeeM?.[0]?.spearmanRho?.toFixed(2) ?? "—"}
                  </small>
                </div>
                {recoveryEnabled && primaryRecoveryThreshold && (
                  <div className="uncertainty-driver">
                    <span>Recovery deployment scenarios</span>
                    <strong>{primaryRecoveryThreshold.probability === null ? "Unavailable" : `${(primaryRecoveryThreshold.probability * 100).toFixed(0)}%`}</strong>
                    <small>{primaryRecoveryThreshold.validSampleCount} valid samples · Wilson {primaryRecoveryThreshold.wilson95 === null ? "—" : `${(primaryRecoveryThreshold.wilson95.lower * 100).toFixed(0)}–${(primaryRecoveryThreshold.wilson95.upper * 100).toFixed(0)}%`}</small>
                  </div>
                )}
                </div>
                <UncertaintySensitivityList result={uncertainty} />
                <div className="uncertainty-convergence" aria-label="Uncertainty convergence diagnostic">
                  <div>
                    <span>Split-sample stability</span>
                    <strong className={`uncertainty-status uncertainty-status-${uncertainty.convergence.status}`}>{formatConvergenceStatus(uncertainty.convergence.status)}</strong>
                    <small>Max quantile shift {uncertainty.convergence.maximumRelativeQuantileShift === null ? "—" : `${(uncertainty.convergence.maximumRelativeQuantileShift * 100).toFixed(0)}%`} · {uncertainty.convergence.lowerHalfSampleCount}/{uncertainty.convergence.upperHalfSampleCount} generated samples per half</small>
                  </div>
                  {primaryThresholdConvergence && (
                    <div>
                      <span>Threshold-rate stability</span>
                      <strong className={`uncertainty-status uncertainty-status-${primaryThresholdConvergence.status}`}>{formatConvergenceStatus(primaryThresholdConvergence.status)}</strong>
                      <small>Half-rate shift {primaryThresholdConvergence.halfProbabilityShift === null ? "—" : `${(primaryThresholdConvergence.halfProbabilityShift * 100).toFixed(0)}%`} · Wilson width {primaryThresholdConvergence.wilson95Width === null ? "—" : `${(primaryThresholdConvergence.wilson95Width * 100).toFixed(0)}%`}</small>
                    </div>
                  )}
                  {recoveryEnabled && primaryRecoveryThresholdConvergence && (
                    <div>
                      <span>Recovery-rate stability</span>
                      <strong className={`uncertainty-status uncertainty-status-${primaryRecoveryThresholdConvergence.status}`}>{formatConvergenceStatus(primaryRecoveryThresholdConvergence.status)}</strong>
                      <small>Half-rate shift {primaryRecoveryThresholdConvergence.halfProbabilityShift === null ? "—" : `${(primaryRecoveryThresholdConvergence.halfProbabilityShift * 100).toFixed(0)}%`} · Wilson width {primaryRecoveryThresholdConvergence.wilson95Width === null ? "—" : `${(primaryRecoveryThresholdConvergence.wilson95Width * 100).toFixed(0)}%`}</small>
                    </div>
                  )}
                </div>
                <div className="uncertainty-disclaimer">
                  <span>MODEL UNCERTAINTY</span>
                  <p>{uncertainty.correlations.length === 0 ? "Assumed independent input distributions" : `${uncertainty.correlations.length} Gaussian-copula correlation pair${uncertainty.correlations.length === 1 ? "" : "s"} declared`} · seed {uncertainty.seed} · convergence is a heuristic finite-sample check, not validation, certification, or a flight-safety assessment.</p>
                </div>
            </div>
            <UncertaintyCorrelationEditor
              correlations={uncertaintyCorrelations}
              onChange={(next) => {
                setUncertaintyCorrelations(next);
                markChanged();
              }}
            />
            <ParameterSweepCard
              parameter={sweepParameter}
              definition={activeSweepDefinition}
              minimum={sweepMinimum}
              maximum={sweepMaximum}
              steps={sweepSteps}
              running={sweepRunning}
              result={sweepResult}
              error={sweepError}
              onParameterChange={changeSweepParameter}
              onMinimumChange={changeSweepMinimum}
              onMaximumChange={changeSweepMaximum}
              onStepsChange={changeSweepSteps}
              onRun={runSweep}
            />
            <div className="optimization-card">
              <div className="event-card-heading">
                <div>
                  <strong>Design optimization</strong>
                  <span>Constraint-aware Pareto tradeoffs</span>
                </div>
                <span>
                  {optimization
                    ? `${optimization.result.paretoFront.length} Pareto candidates · ${optimization.mode === "robust" ? "robust screen" : "nominal"}`
                    : "Deterministic preview"}
                </span>
              </div>
              {optimizing ? (
                <div className="optimization-loading" aria-live="polite">
                  <Skeleton height={86} borderRadius={5} />
                  <span>Evaluating bounded design candidates…</span>
                </div>
              ) : optimization && optimizationRecommendation ? (
                <>
                  <div className="optimization-summary">
                    {optimization.mode === "robust" ? (
                      <>
                        <div>
                          <span>Robust apogee floor</span>
                          <strong>{(optimizationRecommendation.metrics.robustApogeeP05M ?? 0).toFixed(0)} m P05</strong>
                        </div>
                        <div>
                          <span>Robust maximum q</span>
                          <strong>{Math.round(optimizationRecommendation.metrics.robustMaxDynamicPressureP95Pa ?? 0)} Pa P95</strong>
                        </div>
                        <div>
                          <span>{recoveryEnabled ? "Robust impact speed" : "Scenario failures"}</span>
                          <strong>{recoveryEnabled ? `${(optimizationRecommendation.metrics.robustImpactSpeedP95Mps ?? 0).toFixed(1)} m/s P95` : `${((optimizationRecommendation.metrics.robustFailureRate ?? 0) * 100).toFixed(0)}%`}</strong>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span>Compromise apogee</span>
                          <strong>{optimizationRecommendation.metrics.apogeeM.toFixed(0)} m</strong>
                        </div>
                        <div>
                          <span>Impact speed</span>
                          <strong>{optimizationRecommendation.metrics.impactSpeedMps.toFixed(1)} m/s</strong>
                        </div>
                        <div>
                          <span>Maximum q</span>
                          <strong>{Math.round(optimizationRecommendation.metrics.maxDynamicPressurePa)} Pa</strong>
                        </div>
                      </>
                    )}
                    <div>
                      <span>Search effort</span>
                      <strong>{optimization.result.evaluationCount} runs</strong>
                    </div>
                  </div>
                  <div className="optimization-candidates" aria-label="Leading Pareto design candidates">
                    {optimization.result.paretoFront.slice(0, 3).map((candidate, index) => (
                      <div className={index === 0 ? "optimization-candidate recommended" : "optimization-candidate"} key={candidate.id}>
                        <span>{index === 0 ? "Compromise" : `Tradeoff ${index + 1}`}</span>
                        <strong>{(optimization.baseThrustN * (candidate.variables.thrustScale ?? 1)).toFixed(1)} N motor</strong>
                        <small>
                          {candidate.variables.recoveryDragAreaScale === undefined
                            ? "Ballistic descent"
                            : `${Math.round(optimization.baseRecoveryDiameterM * Math.sqrt(candidate.variables.recoveryDragAreaScale) * 1000)} mm canopy`} · {optimization.mode === "robust"
                              ? `${(candidate.metrics.robustApogeeP05M ?? 0).toFixed(0)} m floor · ${((candidate.metrics.robustFailureRate ?? 0) * 100).toFixed(0)}% failures`
                              : `${candidate.metrics.apogeeM.toFixed(0)} m apogee`}
                        </small>
                      </div>
                    ))}
                  </div>
                  <div className="optimization-actions">
                    <button onClick={applyOptimizationRecommendation}>Apply compromise</button>
                    <button onClick={() => optimize(optimization.mode)}>Run again</button>
                    {optimization.mode === "nominal" && <button onClick={() => optimize("robust")}>Try robust screen</button>}
                  </div>
                </>
              ) : optimization ? (
                <div className="optimization-empty">
                  <strong>No feasible candidate found</strong>
                  <p>Widen the design bounds or review the Mach, dynamic-pressure, thrust-to-weight, and impact-speed guardrails.</p>
                  <button onClick={() => optimize(optimization.mode)}>Retry search</button>
                  {optimization.mode === "nominal" && <button onClick={() => optimize("robust")}>Try robust screen</button>}
                </div>
              ) : (
                <div className="optimization-empty">
                  <strong>Explore motor and recovery tradeoffs</strong>
                  <p>Compare bounded motor and recovery tradeoffs. Your current design is not changed until you apply a recommendation. The robust screen repeats each candidate across a seeded uncertainty ensemble.</p>
                  <button onClick={() => optimize("nominal")}>Find better designs</button>
                  <button onClick={() => optimize("robust")}>Find robust designs</button>
                </div>
              )}
              <div className="optimization-disclaimer">
                <span>UNVALIDATED SEARCH</span>
                <p>{optimization?.mode === "robust" ? "Seed arc54-optimizer-robust-v1 · 12 finite Latin-hypercube uncertainty scenarios per candidate. Quantiles are a screening aid, not a reliability guarantee." : "Seed arc54-optimizer-v1 · evolutionary search cannot prove a global optimum and may exploit model error."} Independently validate before manufacturing or flight.</p>
              </div>
            </div>
            {landingPrediction && (
              <div className="landing-card">
                <div className="event-card-heading">
                  <div>
                    <strong>Landing footprint</strong>
                    <span>Recovery-phase drift · local WGS84 tangent plane</span>
                  </div>
                  <span>{landingPrediction.footprint.sampleCount} seeded scenarios</span>
                </div>
                <div className="landing-layout">
                  <LandingFootprintChart footprint={landingPrediction.footprint} />
                  <div className="landing-metrics">
                    <div>
                      <span>Mean impact</span>
                      <strong>{landingPrediction.footprint.meanImpact.eastM.toFixed(0)} m E · {landingPrediction.footprint.meanImpact.northM.toFixed(0)} m N</strong>
                      <small>{landingPrediction.footprint.meanImpact.positionWgs84.latitudeDeg.toFixed(5)}°, {landingPrediction.footprint.meanImpact.positionWgs84.longitudeDeg.toFixed(5)}°</small>
                    </div>
                    <div>
                      <span>Radial distance P50 / P95</span>
                      <strong>{landingPrediction.footprint.radialDistanceM.p50.toFixed(0)} / {landingPrediction.footprint.radialDistanceM.p95.toFixed(0)} m</strong>
                      <small>{landingPrediction.footprint.radialDistanceM.maximum.toFixed(0)} m maximum sample</small>
                    </div>
                    <div>
                      <span>Impact speed P50 / P95</span>
                      <strong>{landingPrediction.footprint.impactSpeedMps.p50.toFixed(1)} / {landingPrediction.footprint.impactSpeedMps.p95.toFixed(1)} m/s</strong>
                      <small>{landingPrediction.uncertainty.failedSampleCount} failed scenarios retained</small>
                    </div>
                    <div className="landing-convergence">
                      <span>Sample stability</span>
                      <strong>{formatConvergenceStatus(landingPrediction.uncertainty.convergence.status)}</strong>
                      <small>Max quantile shift {landingPrediction.uncertainty.convergence.maximumRelativeQuantileShift === null ? "—" : `${(landingPrediction.uncertainty.convergence.maximumRelativeQuantileShift * 100).toFixed(0)}%`} · split-sample heuristic</small>
                    </div>
                    {landingPrediction.ascentDrift && (
                      <div className="landing-ascent-drift">
                        <span>Ascent-to-apogee handoff</span>
                        <strong>Wind-drag proxy included</strong>
                        <small>{landingPrediction.ascentDrift.modelVersion} · scenario-specific horizontal state</small>
                      </div>
                    )}
                    {landingPrediction.deploymentScenario && (
                      <div className="landing-reliability">
                        <span>{landingPrediction.deploymentScenario.label}</span>
                        <strong>{landingPrediction.deploymentScenario.failedSampleCount} / {landingPrediction.deploymentScenario.successfulSampleCount + landingPrediction.deploymentScenario.failedSampleCount} failed</strong>
                        <small>Observed {landingPrediction.deploymentScenario.observedSuccessRate === null ? "—" : `${(landingPrediction.deploymentScenario.observedSuccessRate * 100).toFixed(0)}%`} success · assumed {(landingPrediction.deploymentScenario.assumedSuccessProbability * 100).toFixed(0)}% · 95% range {landingPrediction.deploymentScenario.wilson95 ? `${(landingPrediction.deploymentScenario.wilson95.lower * 100).toFixed(0)}–${(landingPrediction.deploymentScenario.wilson95.upper * 100).toFixed(0)}%` : "—"}</small>
                      </div>
                    )}
                    <div className="landing-reefing">
                      <span>Canopy opening schedule</span>
                      <strong>{recoveryReefingEnabled ? `${(recoveryReefingStartAreaFraction * 100).toFixed(0)}% → 100%` : "Full open after inflation"}</strong>
                      <small>{recoveryReefingEnabled ? `${recoveryReefingDurationS.toFixed(1)} s piecewise-linear area ramp` : "No reefing schedule"}</small>
                    </div>
                    <div>
                      <span>95% covariance ellipse</span>
                      <strong>{landingPrediction.footprint.confidenceEllipses[2].semiMajorM.toFixed(0)} × {landingPrediction.footprint.confidenceEllipses[2].semiMinorM.toFixed(0)} m</strong>
                      <small>{landingPrediction.footprint.confidenceEllipses[2].majorAxisAngleDegFromEast.toFixed(0)}° from east</small>
                    </div>
                  </div>
                </div>
                <div className="landing-disclaimer">
                  <span>RECOVERY PHASE ONLY</span>
                  <p>Seed {landingPrediction.seed} · includes a scenario-specific ascent wind-drag handoff plus mean wind, deterministic turbulence, canopy-area, mass, direction, delay, and a Bernoulli deployment-outcome assumption. Terrain, obstacles, canopy pendulum motion, and range constraints are omitted. Not a flight-safety corridor.</p>
                </div>
              </div>
            )}
            <div className="event-card">
              <div className="event-card-heading">
                <div><strong>Flight events</strong><span>Detected by the numerical model</span></div>
                <span>{result.events.length} events</span>
              </div>
              <div className="event-timeline">
                {result.events.map((event) => (
                  <div className="event-item" key={`${event.type}-${event.timeS}`}>
                    <i />
                    <strong>{event.label}</strong>
                    <span>{event.timeS.toFixed(2)} s</span>
                    <small>{event.altitudeAglM.toFixed(0)} m AGL</small>
                  </div>
                ))}
              </div>
            </div>
            <div className="configuration-card">
              <div className="event-card-heading">
                <div><strong>Configuration timeline</strong><span>Current single-stage run · topology-aware handoff</span></div>
                <span>Sustainer</span>
              </div>
              <div className="configuration-timeline">
                <div className="configuration-state active">
                  <span>01 · Powered</span>
                  <strong>Sustainer attached</strong>
                  <small>0.00–{(burnoutEvent?.timeS ?? burnTime).toFixed(2)} s · Cd {dragCoefficient.toFixed(2)}</small>
                </div>
                <div className="configuration-arrow" aria-hidden="true">→</div>
                <div className="configuration-state">
                  <span>02 · Coast</span>
                  <strong>Dry motor retained</strong>
                  <small>{(burnoutEvent?.timeS ?? burnTime).toFixed(2)}–{(apogeeEvent?.timeS ?? result.timeToApogeeS).toFixed(2)} s · live CG</small>
                </div>
                <div className="configuration-arrow" aria-hidden="true">→</div>
                <div className="configuration-state">
                  <span>03 · {recoveryEnabled ? "Recovery" : "Descent"}</span>
                  <strong>{recoveryEnabled ? "Canopy commanded" : "Ballistic configuration"}</strong>
                  <small>{recoveryEnabled ? `${(recoveryEvent?.timeS ?? result.timeToApogeeS + recoveryDelay).toFixed(2)} s · deployment model` : "No recovery load"}</small>
                </div>
              </div>
              <p className="configuration-note">No separation occurs in this estimate. Multi-stage 6DOF runs switch mass, inertia, propulsion, CP, reference area, and drag by exact attached-stage topology.</p>
            </div>
            <div className="assumption-strip">
              <strong>Model assumptions</strong>
              {result.assumptions.slice(0, 4).map((assumption) => <span key={assumption}>{assumption}</span>)}
            </div>
          </div>
        )}
      </section>

      <aside className="inspector">
        <div className="inspector-heading">
          <span className="eyebrow">{view === "design" ? "Inspector" : "Simulation"}</span>
          <h2>{view === "design" ? selectedComponent.name : "Launch model"}</h2>
          <p>{view === "design" ? "Edit the selected component. Changes are reflected in the workspace." : "Inputs for the preliminary vertical-flight estimate."}</p>
        </div>
        {view === "design" ? (
          <>
            {selected === "nose" && (
              <>
                <NumberField id="nose-length" label="Nose length" value={noseLength} unit="mm" min={40} max={600} onChange={(value) => { setNoseLength(value); markChanged(); }} />
                <div className="field-group">
                  <label htmlFor="nose-profile">Nose profile</label>
                  <select id="nose-profile" value={noseProfile} onChange={(event) => { setNoseProfile(event.target.value as NoseProfile); markChanged(); }}>
                    <option value="ogive">Tangent ogive</option>
                    <option value="conical">Conical</option>
                    <option value="elliptical">Elliptical</option>
                  </select>
                </div>
                <div className="component-note">
                  <span>GEOMETRY COUPLING</span>
                  <p>Profile stations feed the independent mass integral and low-speed static-aerodynamics estimate. Transonic and separated-flow behavior remain outside this preview.</p>
                </div>
              </>
            )}
            {selected === "body" && (
              <>
                <NumberField id="length" label="Airframe length" value={length} unit="mm" min={200} max={1600} onChange={changeAirframeLength} />
                <NumberField id="diameter" label="Outer diameter" value={diameter} unit="mm" min={20} max={200} onChange={(value) => { setDiameter(value); markChanged(); }} />
                <div className="field-group">
                  <label htmlFor="material">Airframe material model</label>
                  <select id="material" value={material} onChange={(event) => { setMaterial(event.target.value as MaterialKey); markChanged(); }}>
                    {Object.entries(materialModels).map(([key, model]) => <option value={key} key={key}>{model.label}</option>)}
                  </select>
                </div>
                <NumberField id="payload-mass" label="Payload + avionics allowance" value={payloadMass} unit="kg" min={0.001} max={20} step={0.01} onChange={(value) => { setPayloadMass(value); markChanged(); }} />
              </>
            )}
            {selected === "fins" && (
              <>
                <NumberField id="fin-count" label="Fin count" value={finCount} unit="fins" min={2} max={12} step={1} onChange={(value) => { setFinCount(Math.round(value)); markChanged(); }} />
                <NumberField id="fin-root-chord" label="Root chord" value={finRootChord} unit="mm" min={20} max={Math.min(500, length)} onChange={changeFinRootChord} />
                <NumberField id="fin-tip-chord" label="Tip chord" value={finTipChord} unit="mm" min={5} max={Math.min(300, finRootChord)} onChange={changeFinTipChord} />
                <NumberField id="fin-sweep" label="Sweep" value={finSweep} unit="mm" min={0} max={Math.min(300, Math.max(0, finRootChord - finTipChord))} onChange={changeFinSweep} />
                <NumberField id="fin-span" label="Span" value={finSpan} unit="mm" min={5} max={300} onChange={(value) => { setFinSpan(value); markChanged(); }} />
                <NumberField id="fin-thickness" label="Thickness" value={finThickness} unit="mm" min={0.2} max={20} step={0.1} onChange={(value) => { setFinThickness(value); markChanged(); }} />
                <div className="component-note">
                  <span>FIN VALIDATION</span>
                  <p>Fin count, planform, and thickness are included in the mass and static-normal-force model. Structural attachment, flutter, and local stress are not modeled.</p>
                </div>
              </>
            )}
            {selected === "mount" && (
              <>
                <div className="mass-properties-card component-readout-card">
                  <div><span>Selected motor</span><strong>{previewMotor.designation}</strong></div>
                  <div><span>Case diameter</span><strong>{(previewMotor.diameterM * 1000).toFixed(0)} mm</strong></div>
                  <div><span>Launch mass</span><strong>{previewMotor.launchMassKg.toFixed(3)} kg</strong></div>
                  <div><span>Motor provenance</span><strong>{previewMotor.provenance.validationStatus}</strong></div>
                </div>
                <button className="library-button" onClick={() => setMotorLibraryOpen(true)}>
                  <span><strong>Change motor data</strong><small>Open the provenance-qualified local library</small></span>
                  <em>Manage</em>
                </button>
                <div className="component-note">
                  <span>MOUNT SCOPE</span>
                  <p>Motor mass properties and thrust curve are coupled to the selected stage. Retention hardware, case fit, and structural loads require a separate design review.</p>
                </div>
              </>
            )}
            {selected === "recovery" && (
              <>
                <NumberField id="recovery-mass" label="Packed recovery mass" value={recoveryMass} unit="kg" min={0.005} max={2} step={0.005} onChange={(value) => { setRecoveryMass(value); markChanged(); }} />
                <div className="mass-properties-card component-readout-card">
                  <div><span>Canopy diameter</span><strong>{(recoveryDiameter * 1000).toFixed(0)} mm</strong></div>
                  <div><span>Deployment delay</span><strong>{recoveryDelay.toFixed(1)} s</strong></div>
                  <div><span>Success assumption</span><strong>{(recoveryDeploymentSuccessProbability * 100).toFixed(0)}%</strong></div>
                  <div><span>Reefing</span><strong>{recoveryReefingEnabled ? `${(recoveryReefingStartAreaFraction * 100).toFixed(0)}% → 100%` : "Full open"}</strong></div>
                  <div><span>Model state</span><strong>{recoveryEnabled ? "Enabled" : "Ballistic"}</strong></div>
                </div>
                <div className="component-note">
                  <span>RECOVERY SCOPE</span>
                  <p>Canopy diameter, timing, opening schedule, and deployment assumption are configured in the Flight workspace. Packed mass is included in CG, inertia, and every subsequent estimate.</p>
                </div>
              </>
            )}
            <div className="mass-properties-card">
              <div><span>Computed mass</span><strong>{mass.toFixed(3)} kg</strong></div>
              <div><span>CG from nose</span><strong>{centerOfMassMm.toFixed(0)} mm</strong></div>
              <div><span>Axial inertia</span><strong>{massProperties.inertiaAtCenterKgM2[0][0].toFixed(5)} kg·m²</strong></div>
              <div><span>Pitch inertia</span><strong>{massProperties.inertiaAtCenterKgM2[1][1].toFixed(5)} kg·m²</strong></div>
            </div>
            {structuralScreen && (
              <div className={`structural-screen-card structural-screen-${structuralScreen.overallStatus}`}>
                <div className="structural-screen-heading">
                  <div>
                    <span>STRUCTURAL SCREEN</span>
                    <strong>{structuralScreen.overallStatus === "pass" ? "PRELIMINARY PASS" : "REVIEW REQUIRED"}</strong>
                  </div>
                  <small>{structuralScreen.material.label}</small>
                </div>
                <div className="structural-screen-grid">
                  <div><span>Axial demand</span><strong>{structuralScreen.loads.axialCompressionN.toFixed(1)} N</strong></div>
                  <div><span>Euler reserve</span><strong>{structuralScreen.checks.eulerBuckling.factorOfSafety === null ? "—" : `${structuralScreen.checks.eulerBuckling.factorOfSafety.toFixed(1)}×`}</strong></div>
                  <div><span>Fin-root reserve</span><strong>{structuralScreen.checks.finBending.factorOfSafety === null ? "—" : `${structuralScreen.checks.finBending.factorOfSafety.toFixed(1)}×`}</strong></div>
                  <div><span>Flutter-safe speed</span><strong>{structuralScreen.finFlutter?.safeAirspeedMps === null || structuralScreen.finFlutter?.safeAirspeedMps === undefined ? "—" : `${structuralScreen.finFlutter.safeAirspeedMps.toFixed(1)} m/s`}</strong></div>
                  <div><span>Static margin</span><strong>{staticStability.staticMarginCalibers.toFixed(2)} cal</strong></div>
                </div>
                <div className="structural-screen-checks">
                  {Object.values(structuralScreen.checks).map((check) => (
                    <div className={`structural-check-row structural-check-${check.status}`} key={check.id}>
                      <span>{check.status === "pass" ? "✓" : check.status === "review" ? "!" : "—"}</span>
                      <div><strong>{check.label}</strong><small>{check.factorOfSafety === null ? "Unavailable" : `FoS ${check.factorOfSafety.toFixed(2)}×`} · {check.detail}</small></div>
                    </div>
                  ))}
                </div>
                <p className="structural-screen-note">Analytical component checks only. The NACA-TN-4197-style fin flutter screen is preliminary; body-fin coupling, transonic effects, joints, local buckling, vibration, and manufacturing effects are not modeled{resultIsCurrent ? "." : "; rerun the flight estimate before using dynamic-pressure and flutter trends."}</p>
              </div>
            )}
            {experienceMode === "expert" ? (
              <>
                <div className="property-section-label">
                  <span>Low-speed static aerodynamics</span>
                  <small>{staticStability.modelVersion}</small>
                </div>
                <div className="mass-properties-card stability-properties-card">
                  <div><span>Center of pressure</span><strong>{centerOfPressureMm.toFixed(0)} mm</strong></div>
                  <div><span>Static margin</span><strong>{staticStability.staticMarginCalibers.toFixed(2)} cal</strong></div>
                  <div><span>Normal-force slope</span><strong>{staticStability.normalForceSlopePerRad.toFixed(2)} /rad</strong></div>
                  <div><span>Fineness ratio</span><strong>{staticStability.finenessRatio.toFixed(1)}</strong></div>
                </div>
                <div className="property-section-label">
                  <span>Assembly graph</span>
                  <small>{assembly.modelVersion}</small>
                </div>
                <div className="mass-properties-card stability-properties-card">
                  <div><span>Active stages</span><strong>{assembly.activeStageIds.length}</strong></div>
                  <div><span>Placed instances</span><strong>{assembly.componentInstances.length}</strong></div>
                  <div><span>Motor mounts</span><strong>{assembly.motorMounts.length}</strong></div>
                  <div><span>Topology</span><strong>{assembly.stages[0]?.attachment ?? "—"}</strong></div>
                </div>
              </>
            ) : (
              <div className="mode-hint">
                <span className="mode-hint-label">BEGINNER VIEW</span>
                <strong>Keep the first pass focused</strong>
                <p>CG, CP, and static margin are already visible in the summary and design check. Switch to Expert when you want the underlying slopes, fineness ratio, and assembly graph.</p>
                <button className="quiet-button" onClick={() => changeExperienceMode("expert")}>Show expert details</button>
              </div>
            )}
          </>
        ) : (
          <>
            <NumberField id="thrust" label="Average thrust" value={thrust} unit="N" min={1} max={5000} step={0.5} onChange={(value) => { setThrust(value); markChanged(); }} />
            <NumberField id="burn-time" label="Burn time" value={burnTime} unit="s" min={0.1} max={30} step={0.05} onChange={(value) => { setBurnTime(value); markChanged(); }} />
            <NumberField id="drag" label="Drag coefficient" value={dragCoefficient} unit="Cd" min={0.1} max={2} step={0.01} onChange={(value) => { setDragCoefficient(value); markChanged(); }} />
            <NumberField id="launch-altitude" label="Launch-site altitude" value={launchAltitude} unit="m" min={-400} max={10000} step={10} onChange={(value) => { setLaunchAltitude(value); markChanged(); }} />
            <NumberField id="surface-pressure" label="Pad pressure" value={surfacePressureHpa} unit="hPa" min={20} max={1100} step={0.1} onChange={(value) => { setSurfacePressureHpa(value); markChanged(); }} />
            <NumberField id="surface-temperature" label="Pad temperature" value={surfaceTemperatureC} unit="°C" min={-90} max={70} step={0.5} onChange={(value) => { setSurfaceTemperatureC(value); markChanged(); }} />
            <NumberField id="wind-speed" label="Wind at 500 m" value={windSpeed} unit="m/s" min={0} max={80} step={0.5} onChange={(value) => { setWindSpeed(value); markChanged(); }} />
            <NumberField id="wind-azimuth" label="Wind azimuth · east toward north" value={windAzimuthDeg} unit="deg" min={-180} max={180} step={1} onChange={(value) => { setWindAzimuthDeg(value); markChanged(); }} />
            <NumberField id="relative-humidity" label="Relative humidity" value={relativeHumidityPercent} unit="%" min={0} max={100} step={1} onChange={(value) => { setRelativeHumidityPercent(value); markChanged(); }} />
            <p className="field-help">Pressure and temperature anchor the launch-site profile; wind azimuth uses the local ENU frame (0° east, +90° north); humidity couples to water-vapor pressure, virtual temperature, density, and sound speed. These are user observations, not a live weather feed.</p>
            <div className="field-group rail-control-group">
              <label htmlFor="launch-rail-enabled">Launch rail constraint</label>
              <select id="launch-rail-enabled" value={launchRailEnabled ? "enabled" : "disabled"} onChange={(event) => { setLaunchRailEnabled(event.target.value === "enabled"); markChanged(); }}>
                <option value="enabled">Enabled · angled rail handoff</option>
                <option value="disabled">Disabled · unconstrained start</option>
              </select>
            </div>
            {launchRailEnabled && <>
              <NumberField id="launch-rail-length" label="Effective rail travel" value={launchRailLengthM} unit="m" min={0.25} max={12} step={0.05} onChange={(value) => { setLaunchRailLengthM(value); markChanged(); }} />
              <NumberField id="launch-rail-inclination" label="Inclination from vertical" value={launchRailInclinationDeg} unit="deg" min={0} max={30} step={0.1} onChange={(value) => { setLaunchRailInclinationDeg(value); markChanged(); }} />
              <NumberField id="launch-rail-azimuth" label="Azimuth · east toward north" value={launchRailAzimuthDeg} unit="deg" min={-180} max={180} step={1} onChange={(value) => { setLaunchRailAzimuthDeg(value); markChanged(); }} />
              <p className="rail-provenance">The staged preview holds attitude and lateral motion on a fixed ENU rail, then hands the exact release state to free flight. Inclination is measured from +up; azimuth is 0° east and 90° north. Guide hardware, friction, tip-off, and launcher motion are not modeled.</p>
            </>}
            <div className="field-group">
              <label htmlFor="recovery-enabled">Recovery model</label>
              <select id="recovery-enabled" value={recoveryEnabled ? "enabled" : "disabled"} onChange={(event) => { setRecoveryEnabled(event.target.value === "enabled"); markChanged(); }}>
                <option value="enabled">450 mm parachute at apogee</option>
                <option value="disabled">Ballistic descent</option>
              </select>
            </div>
            {recoveryEnabled && <NumberField id="recovery-delay" label="Deployment delay" value={recoveryDelay} unit="s" min={0} max={30} step={0.1} onChange={(value) => { setRecoveryDelay(value); markChanged(); }} />}
            {recoveryEnabled && <NumberField id="recovery-diameter" label="Canopy diameter" value={recoveryDiameter} unit="m" min={0.1} max={3} step={0.01} onChange={(value) => { setRecoveryDiameter(value); markChanged(); }} />}
            {recoveryEnabled && <NumberField id="recovery-deployment-success" label="Deployment success assumption" value={recoveryDeploymentSuccessProbability * 100} unit="%" min={0} max={100} step={1} onChange={(value) => { setRecoveryDeploymentSuccessProbability(value / 100); markChanged(); }} />}
            {recoveryEnabled && <div className="field-group">
              <label htmlFor="recovery-reefing">Canopy opening schedule</label>
              <select id="recovery-reefing" value={recoveryReefingEnabled ? "reefed" : "full-open"} onChange={(event) => { setRecoveryReefingEnabled(event.target.value === "reefed"); markChanged(); }}>
                <option value="full-open">Full open after inflation</option>
                <option value="reefed">Start reefed, then open</option>
              </select>
            </div>}
            {recoveryEnabled && recoveryReefingEnabled && <>
              <NumberField id="recovery-reefing-start-area" label="Initial reefed canopy area" value={recoveryReefingStartAreaFraction * 100} unit="%" min={5} max={100} step={1} onChange={(value) => { setRecoveryReefingStartAreaFraction(value / 100); markChanged(); }} />
              <NumberField id="recovery-reefing-duration" label="Reefing duration" value={recoveryReefingDurationS} unit="s" min={0.1} max={30} step={0.1} onChange={(value) => { setRecoveryReefingDurationS(value); markChanged(); }} />
              <p className="recovery-provenance">The preview multiplies canopy drag area from the initial fraction to 100% with a piecewise-linear schedule after inflation. Reefing lines, fabric dynamics, loads, and hardware are not modeled.</p>
            </>}
            {recoveryEnabled && <p className="recovery-provenance">Landing dispersion samples this as a Bernoulli outcome. A failed deployment uses ballistic descent with body drag; the percentage is a modeling assumption, not hardware reliability evidence.</p>}
            <button className="library-button" onClick={() => setAerodynamicLibraryOpen(true)}>
              <span><strong>Aerodynamic data</strong><small>{selectedAerodynamicTable?.name ?? "Constant drag coefficient"}</small></span>
              <em>{aerodynamicTableDefinitions.length} saved · Manage</em>
            </button>
            <button className="library-button" onClick={() => setMotorLibraryOpen(true)}>
              <span><strong>Motor library</strong><small>{previewMotor.manufacturer} · {previewMotor.designation}</small></span>
              <em>{userMotorRecords.length} saved · Manage</em>
            </button>
            {experienceMode === "expert" ? (
              <>
                <div className="property-section-label">
                  <span>Motor data</span>
                  <small>{previewMotor.modelVersion}</small>
                </div>
                <div className="mass-properties-card stability-properties-card">
                  <div><span>Impulse band</span><strong>{previewMotor.metrics.impulseClassEstimate} · estimate</strong></div>
                  <div><span>Total impulse</span><strong>{previewMotor.metrics.totalImpulseNs.toFixed(1)} N·s</strong></div>
                  <div><span>Peak thrust</span><strong>{previewMotor.metrics.peakThrustN.toFixed(1)} N</strong></div>
                  <div><span>Calculated Isp</span><strong>{previewMotor.metrics.specificImpulseS.toFixed(1)} s</strong></div>
                  <div><span>Depletion source</span><strong>{previewMotor.massFlowHistoryKgS ? "Measured mass flow" : "Impulse-proportional"}</strong></div>
                </div>
                <p className="motor-provenance">Synthetic preview curve · CC0-1.0 · unvalidated. Letter class is an impulse-band estimate, not motor certification.</p>
                <div className="property-section-label">
                  <span>6DOF aerodynamic source</span>
                  <small>{selectedAerodynamicTable?.modelVersion ?? "constant-Cd"}</small>
                </div>
                <div className="mass-properties-card stability-properties-card">
                  <div><span>Source</span><strong>{selectedAerodynamicTable?.name ?? "Constant Cd"}</strong></div>
                  <div><span>Mach range</span><strong>{selectedAerodynamicTable ? `${selectedAerodynamicTable.machRange[0].toFixed(2)}–${selectedAerodynamicTable.machRange[1].toFixed(2)}` : "fixed"}</strong></div>
                  <div><span>Reynolds range</span><strong>{selectedAerodynamicTable ? `${selectedAerodynamicTable.reynoldsRange[0].toExponential(1)}–${selectedAerodynamicTable.reynoldsRange[1].toExponential(1)}` : "fixed"}</strong></div>
                  <div><span>Angular axes</span><strong>{selectedAerodynamicTable?.angleOfAttackRangeRad ? "AoA + sideslip" : "not supplied"}</strong></div>
                  <div><span>Force / moment DB</span><strong>{selectedAerodynamicTable?.forceMomentDatabaseAvailable ? "direct body axes" : "relation fallback"}</strong></div>
                  <div><span>Validation</span><strong>{selectedAerodynamicTable?.validationStatus ?? "analytical preview"}</strong></div>
                </div>
                <p className="motor-provenance">Coefficient tables now drive both the fast vertical estimate and topology-aware 6DOF preview when selected. Out-of-range queries remain visible as warnings, and table data are never promoted to flight certification.</p>
                <div className="property-section-label">
                  <span>Flight environment</span>
                  <small>{previewEnvironment.modelVersion}</small>
                </div>
                <div className="mass-properties-card stability-properties-card">
                  <div><span>Altitude reference</span><strong>{environmentAt500M.altitudeAslM.toFixed(0)} m ASL at 500 m AGL</strong></div>
                  <div><span>Mean wind at 500 m</span><strong>{Math.hypot(environmentAt500M.meanWindWorldMps.x, environmentAt500M.meanWindWorldMps.y).toFixed(1)} m/s</strong></div>
                  <div><span>Wind azimuth input</span><strong>{windAzimuthDeg.toFixed(0)}° ENU</strong></div>
                  <div><span>Pad pressure</span><strong>{(environmentAtPad.atmosphere.pressurePa / 100).toFixed(1)} hPa</strong></div>
                  <div><span>Pad temperature</span><strong>{(environmentAtPad.atmosphere.temperatureK - 273.15).toFixed(1)} °C</strong></div>
                  <div><span>Relative humidity</span><strong>{relativeHumidityPercent.toFixed(0)}% · coupled</strong></div>
                  <div><span>Air density @ 500 m</span><strong>{environmentAt500M.atmosphere.densityKgM3.toFixed(3)} kg/m³</strong></div>
                  <div><span>Sound speed @ 500 m</span><strong>{environmentAt500M.atmosphere.speedOfSoundMps.toFixed(1)} m/s</strong></div>
                  <div><span>Turbulence RMS L / T / V</span><strong>{(windSpeed * 0.12).toFixed(2)} / {(windSpeed * 0.1).toFixed(2)} / {(windSpeed * 0.06).toFixed(2)} m/s</strong></div>
                  <div><span>Replay seed</span><strong>arc54-weather-v1</strong></div>
                </div>
                <p className="motor-provenance">Synthetic deterministic Dryden-shaped environment · CC0-1.0 · unvalidated. The current 1D chart reports the mean profile only; the landing footprint now adds a versioned horizontal ascent-drift proxy, while the 6DOF load APIs remain the coupled-motion path.</p>
              </>
            ) : (
              <div className="mode-hint">
                <span className="mode-hint-label">BEGINNER VIEW</span>
                <strong>Essential flight inputs only</strong>
                <p>The estimate uses a synthetic motor curve and deterministic weather model. Expert mode reveals impulse, Isp, turbulence, and replay provenance.</p>
                <button className="quiet-button" onClick={() => changeExperienceMode("expert")}>Show expert details</button>
              </div>
            )}
            <button className="optimizer-button" onClick={() => optimize()} disabled={optimizing}>{optimizing ? "Searching tradeoffs…" : "Optimize design"}</button>
            <button className="full-run-button" onClick={simulate}>Recalculate flight</button>
          </>
        )}
        <div className={(view === "design" ? designWarning.good : modelWarning.severity === "info") ? "check-card good" : "check-card warn"}>
          <span>{(view === "design" ? designWarning.good : modelWarning.severity === "info") ? "✓" : "!"}</span>
          <div>
            <strong>{view === "design" ? designWarning.title : modelWarning.title}</strong>
            <p>{view === "design" ? designWarning.explanation : modelWarning.explanation}</p>
          </div>
        </div>
        <div className="inspector-footnote">
          <strong>{view === "design" ? staticStability.validationStatus : result.validationStatus}</strong>
          <p>{view === "design" ? "Static aerodynamics are low-speed and small-angle only. Transonic behavior, damping, viscous effects, and experimental validation remain outstanding." : "Analytical regression tests pass. Experimental and independent benchmark validation are still required; do not use these results for flight-safety decisions."}</p>
        </div>
      </aside>
      {commandOpen && (
        <div
          className="export-backdrop command-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCommandOpen(false);
          }}
        >
          <section className="command-dialog" role="dialog" aria-modal="true" aria-labelledby="command-title">
            <div className="command-search">
              <span className="command-mark" aria-hidden="true">⌘</span>
              <div>
                <strong id="command-title">Command search</strong>
                <input
                  ref={commandInputRef}
                  value={commandQuery}
                  onChange={(event) => { setCommandQuery(event.target.value); setCommandIndex(0); }}
                  onKeyDown={handleCommandKeyDown}
                  placeholder="Search mission actions…"
                  aria-label="Search mission actions"
                  aria-controls="command-list"
                  aria-activedescendant={filteredCommandActions[activeCommandIndex] ? `command-${filteredCommandActions[activeCommandIndex].id}` : undefined}
                />
              </div>
              <button className="command-close" onClick={() => setCommandOpen(false)} aria-label="Close command search">Esc</button>
            </div>
            <div className="command-list" id="command-list" role="listbox" aria-label="Available mission actions">
              {filteredCommandActions.length === 0 ? (
                <div className="command-empty"><strong>No matching actions</strong><span>Try “estimate”, “sweep”, “stage”, or “export”.</span></div>
              ) : filteredCommandActions.map((action, index) => (
                <button
                  className="command-item"
                  id={`command-${action.id}`}
                  key={action.id}
                  role="option"
                  aria-selected={index === activeCommandIndex}
                  onMouseEnter={() => setCommandIndex(index)}
                  onClick={() => executeCommand(action)}
                >
                  <span className="command-item-icon" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <span><strong>{action.label}</strong><small>{action.description}</small></span>
                  {action.shortcut ? <kbd>{action.shortcut}</kbd> : <em>↵</em>}
                </button>
              ))}
            </div>
            <div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Run</span><span><kbd>Esc</kbd> Close</span></div>
          </section>
        </div>
      )}
      {templatesOpen && (
        <div
          className="export-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTemplatesOpen(false);
          }}
        >
          <section
            className="export-dialog templates-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="templates-title"
            aria-describedby="templates-description"
          >
            <div className="export-heading">
              <div>
                <span className="eyebrow">Launch library</span>
                <h2 id="templates-title">Start from a template</h2>
                <p id="templates-description">Each template is an original RocketWorks configuration. Loading one replaces the current editable inputs and creates a recoverable local checkpoint.</p>
              </div>
              <button
                ref={templatesCloseRef}
                className="export-close"
                aria-label="Close template library"
                onClick={() => setTemplatesOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="template-grid">
              {PROJECT_TEMPLATES.map((template) => (
                <article className="template-card" key={template.id}>
                  <div className="template-card-heading">
                    <span>{template.eyebrow}</span>
                    <small>{template.audience}</small>
                  </div>
                  <h3>{template.name}</h3>
                  <p>{template.description}</p>
                  <div className="template-specs">
                    <span>{template.inputs.lengthMm + template.inputs.noseLengthMm} mm overall</span>
                    <span>{template.inputs.diameterMm} mm diameter</span>
                    <span>{template.inputs.recoveryEnabled ? `${Math.round(template.inputs.recoveryDiameterM * 1000)} mm recovery` : "Ballistic descent"}</span>
                  </div>
                  <ul>
                    {template.focus.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                  <button className="primary-button" onClick={() => applyTemplate(template)}>Load template</button>
                </article>
              ))}
            </div>
            <div className="history-notice">
              <span>PREVIEW DATA</span>
              <p>Template values are educational starting points. They are not motor certification, structural evidence, range approval, or flight-safety guidance.</p>
            </div>
          </section>
        </div>
      )}
      {motorLibraryOpen && (
        <div
          className="export-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMotorLibraryOpen(false);
          }}
        >
          <section
            className="export-dialog motor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="motor-library-title"
            aria-describedby="motor-library-description"
          >
            <div className="export-heading">
              <div>
                <span className="eyebrow">Data center</span>
                <h2 id="motor-library-title">Motor library</h2>
                <p id="motor-library-description">Use the synthetic preview or add a user-supplied thrust curve with explicit provenance. Records stay on this device and are never treated as certification.</p>
              </div>
              <button
                ref={motorLibraryCloseRef}
                className="export-close"
                aria-label="Close motor library"
                onClick={() => setMotorLibraryOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="motor-library-list" aria-label="Available motors">
              <article className={selectedMotorId === "synthetic" ? "motor-record active" : "motor-record"}>
                <div className="motor-record-main">
                  <span className="motor-record-badge">SYNTHETIC</span>
                  <div><strong>RocketWorks · Synthetic preview</strong><small>Parametric browser curve · not a commercial motor</small></div>
                </div>
                <div className="motor-record-actions">
                  <span>CC0-1.0 · unvalidated</span>
                  <button onClick={() => selectMotor("synthetic")}>{selectedMotorId === "synthetic" ? "Selected" : "Use motor"}</button>
                </div>
              </article>
              {userMotorRecords.map((record) => (
                <article className={selectedMotorId === record.id ? "motor-record active" : "motor-record"} key={record.id}>
                  <div className="motor-record-main">
                    <span className="motor-record-badge user">USER</span>
                    <div><strong>{record.manufacturer} · {record.designation}</strong><small>{record.metrics.totalImpulseNs.toFixed(2)} N·s · {record.metrics.burnDurationS.toFixed(2)} s · {record.massFlowHistoryKgS ? "measured flow · " : ""}{record.provenance.sourceName}</small></div>
                  </div>
                  <div className="motor-record-actions">
                    <span>{record.provenance.licenseIdentifier} · {record.provenance.validationStatus}</span>
                    <button onClick={() => downloadTextArtifact(`${record.id}.csv`, "text/csv;charset=utf-8", exportMotorThrustCsv(record))}>CSV</button>
                    <button onClick={() => downloadTextArtifact(`${record.id}.eng`, "text/plain;charset=utf-8", exportMotorRaspEng(record))}>ENG</button>
                    <button onClick={() => selectMotor(record.id)}>{selectedMotorId === record.id ? "Selected" : "Use motor"}</button>
                    <button className="danger-button" onClick={() => removeUserMotor(record.id)}>Remove</button>
                  </div>
                </article>
              ))}
            </div>
            <div className="motor-import-section">
              <div className="motor-import-heading"><div><span className="eyebrow">User-supplied data</span><h3>Import a thrust curve</h3></div><span>{userMotorRecords.length} / 24 saved</span></div>
              <div className="motor-import-fields">
                <label>Identifier<input value={motorImportDraft.id} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, id: event.target.value }))} /></label>
                <label>Manufacturer<input value={motorImportDraft.manufacturer} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, manufacturer: event.target.value }))} /></label>
                <label>Designation<input value={motorImportDraft.designation} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, designation: event.target.value }))} /></label>
                <label>Diameter (mm)<input inputMode="decimal" value={motorImportDraft.diameterMm} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, diameterMm: event.target.value }))} /></label>
                <label>Length (mm)<input inputMode="decimal" value={motorImportDraft.lengthMm} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, lengthMm: event.target.value }))} /></label>
                <label>Launch mass (kg)<input inputMode="decimal" value={motorImportDraft.launchMassKg} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, launchMassKg: event.target.value }))} /></label>
                <label>Dry mass (kg)<input inputMode="decimal" value={motorImportDraft.dryMassKg} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, dryMassKg: event.target.value }))} /></label>
                <label>Data version<input value={motorImportDraft.dataVersion} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, dataVersion: event.target.value }))} /></label>
              </div>
              <div className="motor-import-fields motor-import-provenance">
                <label>Source name<input value={motorImportDraft.sourceName} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, sourceName: event.target.value }))} /></label>
                <label>License / permission<input value={motorImportDraft.licenseIdentifier} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, licenseIdentifier: event.target.value }))} /></label>
                <label>Attribution<input value={motorImportDraft.attribution} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, attribution: event.target.value }))} /></label>
                <label>Source URL (optional)<input inputMode="url" value={motorImportDraft.sourceUrl} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, sourceUrl: event.target.value }))} /></label>
              </div>
              <label className="motor-description-field">Description (optional)<input value={motorImportDraft.description} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, description: event.target.value }))} /></label>
              <label className="motor-csv-field">Thrust curve CSV or RASP .eng <small>CSV Required header: time_s,thrust_n · RASP header: designation diameter_mm length_mm delays propellant_g total_g manufacturer · SI thrust rows</small><textarea value={motorImportDraft.csv} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, csv: event.target.value }))} spellCheck={false} /></label>
              <label className="motor-csv-field motor-mass-flow-field">Measured mass-flow CSV (optional) <small>Header: time_s,mass_flow_kg_s · positive propellant outflow in kg/s · independent from thrust</small><textarea value={motorImportDraft.massFlowCsv} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, massFlowCsv: event.target.value }))} spellCheck={false} placeholder="time_s,mass_flow_kg_s\n0,0\n0.50,0.12\n1.00,0" /></label>
              {motorError && <p className="motor-import-error" role="alert">{motorError}</p>}
              <div className="motor-import-actions"><button className="primary-button" onClick={importUserMotor}>Validate and save motor</button><span>Strict parser · max 2 MB · user-supplied-unvalidated</span></div>
            </div>
            <div className="history-notice">
              <span>DATA BOUNDARY</span>
              <p>RocketWorks stores the curve and provenance metadata locally. It does not download, bundle, or infer third-party motor databases, and it does not upgrade user-supplied data to certified status.</p>
            </div>
          </section>
        </div>
      )}
      {aerodynamicLibraryOpen && (
        <div
          className="export-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAerodynamicLibraryOpen(false);
          }}
        >
          <section
            className="export-dialog aerodynamic-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="aerodynamic-library-title"
            aria-describedby="aerodynamic-library-description"
          >
            <div className="export-heading">
              <div>
                <span className="eyebrow">Data center</span>
                <h2 id="aerodynamic-library-title">Aerodynamic data</h2>
                <p id="aerodynamic-library-description">Import a rectangular Mach–Reynolds coefficient surface with explicit axes, uncertainty, and provenance. The selected table is used by both the nominal vertical estimate and the topology-aware 6DOF preview.</p>
              </div>
              <button
                ref={aerodynamicLibraryCloseRef}
                className="export-close"
                aria-label="Close aerodynamic data library"
                onClick={() => { setAerodynamicLibraryOpen(false); setAerodynamicInspectorId(null); }}
              >
                ×
              </button>
            </div>
            <div className="aerodynamic-library-list" aria-label="Available aerodynamic coefficient tables">
              <article className={selectedAerodynamicTableId === "constant" ? "aerodynamic-record active" : "aerodynamic-record"}>
                <div className="aerodynamic-record-main">
                  <span className="motor-record-badge">CONSTANT</span>
                  <div><strong>Explicit drag coefficient</strong><small>Current Cd input · vertical estimate and fallback 6DOF source</small></div>
                </div>
                <div className="aerodynamic-record-actions">
                  <span>Analytical preview · unvalidated</span>
                  <button onClick={() => selectAerodynamicTable("constant")}>{selectedAerodynamicTableId === "constant" ? "Selected" : "Use source"}</button>
                </div>
              </article>
              {aerodynamicTableDefinitions.map((table) => (
                <article className={selectedAerodynamicTableId === table.id ? "aerodynamic-record active" : "aerodynamic-record"} key={table.id}>
                  <div className="aerodynamic-record-main">
                    <span className="motor-record-badge user">TABLE</span>
                    <div><strong>{table.name}</strong><small>M {table.machPoints[0]}–{table.machPoints.at(-1)} · Re {table.reynoldsPoints[0].toExponential(1)}–{table.reynoldsPoints.at(-1)?.toExponential(1)}{table.angleOfAttackPointsRad && table.sideslipPointsRad ? ` · α/β ${table.angleOfAttackPointsRad.length}×${table.sideslipPointsRad.length}` : ""}{table.forceCoefficientBodyByAngle || table.momentCoefficientBodyByAngle ? " · force/moment DB" : ""} · {table.provenance.sourceName}</small></div>
                  </div>
                  <div className="aerodynamic-record-actions">
                    <span>{table.provenance.licenseIdentifier} · {table.provenance.validationStatus}</span>
                    <button onClick={() => downloadTextArtifact(`${table.id}.json`, "application/json;charset=utf-8", `${JSON.stringify(table, null, 2)}\n`)}>JSON</button>
                    <button onClick={() => setAerodynamicInspectorId(table.id)} aria-controls="aerodynamic-inspector">Inspect</button>
                    <button onClick={() => selectAerodynamicTable(table.id)}>{selectedAerodynamicTableId === table.id ? "Selected" : "Use table"}</button>
                    <button className="danger-button" onClick={() => removeAerodynamicTable(table.id)}>Remove</button>
                  </div>
                </article>
              ))}
            </div>
            {aerodynamicInspectorId && (() => {
              const inspectedTable = aerodynamicTableDefinitions.find((table) => table.id === aerodynamicInspectorId);
              return inspectedTable ? <AerodynamicTableInspector table={inspectedTable} /> : null;
            })()}
            <div className="aerodynamic-import-section">
              <div className="motor-import-heading"><div><span className="eyebrow">User-supplied data</span><h3>Import a coefficient table</h3></div><span>{aerodynamicTableDefinitions.length} / 8 saved</span></div>
              <label className="motor-csv-field">JSON table definition <small>Rows are Reynolds points; columns are Mach points. Optional angular and direct force/moment volumes use sideslip × angle-of-attack × Reynolds × Mach order. SI lengths, finite coefficient surfaces, and provenance are required.</small><textarea value={aerodynamicTableImportDraft.json} onChange={(event) => setAerodynamicTableImportDraft({ json: event.target.value })} spellCheck={false} /></label>
              {aerodynamicTableError && <p className="motor-import-error" role="alert">{aerodynamicTableError}</p>}
              <div className="motor-import-actions"><button className="primary-button" onClick={importAerodynamicTable}>Validate and save table</button><span>Strict schema · max 8 tables · user-supplied-unvalidated</span></div>
            </div>
            <div className="history-notice">
              <span>MODEL BOUNDARY</span>
              <p>Tables are interpolated in Mach and log10 Reynolds number exactly as supplied. When provided, angle-of-attack and sideslip volumes are linearly interpolated and query limits remain visible. RocketWorks validates the document shape and provenance but does not certify aerodynamic accuracy or source licensing.</p>
            </div>
          </section>
        </div>
      )}
      {topologyOpen && (
        <div
          className="export-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTopologyOpen(false);
          }}
        >
          <section
            className="export-dialog topology-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="topology-title"
            aria-describedby="topology-description"
          >
            <div className="export-heading">
              <div>
                <span className="eyebrow">Vehicle architecture</span>
                <h2 id="topology-title">Stages, boosters & clusters</h2>
                <p id="topology-description">Build an assembly topology from serial stages, parallel booster sets, repeated radial instances, and bounded motor cant. Mass and inertia update through the shared analytical assembly model; repeated physical copies can now carry independent burnout and separation state while the logical stage remains the aerodynamic regime key.</p>
              </div>
              <button
                ref={topologyCloseRef}
                className="export-close"
                aria-label="Close vehicle topology editor"
                onClick={() => setTopologyOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="topology-toolbar">
              <div><strong>{vehicleTopology.stages.length} / 8 stages</strong><span>First stage is the required core sustainer.</span></div>
              <div className="topology-add-actions">
                <button onClick={() => addTopologyStage("upper")} disabled={vehicleTopology.stages.length >= 8}>+ Upper stage</button>
                <button onClick={() => addTopologyStage("booster")} disabled={vehicleTopology.stages.length >= 8}>+ Booster set</button>
                <button onClick={() => addTopologyStage("payload")} disabled={vehicleTopology.stages.length >= 8}>+ Payload bay</button>
              </div>
            </div>
            {topologyError && <p className="topology-error" role="alert">{topologyError}</p>}
            <div className="topology-list" aria-label="Vehicle stages">
              {vehicleTopology.stages.map((stage, index) => (
                <article className={stage.enabled ? "topology-stage active" : "topology-stage"} key={stage.id}>
                  <div className="topology-stage-index"><span>{String(index + 1).padStart(2, "0")}</span><small>{stage.attachment === "parallel" ? "PARALLEL" : "SERIAL"}</small></div>
                  <div className="topology-stage-body">
                    <div className="topology-stage-heading"><div><strong>{stage.name}</strong><small>{stage.role} · {stage.repeatCount > 1 ? `${stage.repeatCount} radial instances` : "single instance"}</small></div><label className="topology-enabled"><input type="checkbox" checked={stage.enabled} onChange={(event) => updateTopologyStage(stage.id, { enabled: event.target.checked })} /> Enabled</label></div>
                    <div className="topology-stage-fields">
                      <label>Stage name<input value={stage.name} onChange={(event) => updateTopologyStage(stage.id, { name: event.target.value })} /></label>
                      <label>Role<select value={stage.role} disabled={stage.role === "core"} onChange={(event) => {
                        const role = event.target.value as VehicleStageRole;
                        updateTopologyStage(stage.id, { role, attachment: role === "booster" ? "parallel" : "serial", repeatCount: role === "booster" ? Math.max(2, stage.repeatCount) : 1, repeatRadiusM: role === "booster" ? Math.max(0.09, stage.repeatRadiusM) : 0 });
                      }}><option value="core">Core</option><option value="upper">Upper</option><option value="booster">Booster</option><option value="payload">Payload</option></select></label>
                      <label>Motor assignment<select value={stage.motorId ?? "__global__"} onChange={(event) => updateTopologyStage(stage.id, { motorId: event.target.value === "__global__" ? undefined : event.target.value })}>
                        <option value="__global__">Global · {previewMotor.designation}</option>
                        {userMotorRecords.map((record) => <option value={record.id} key={record.id}>{record.manufacturer} · {record.designation}</option>)}
                        {stage.motorId && !userMotorRecords.some((record) => record.id === stage.motorId) && <option value={stage.motorId}>Unavailable · fallback</option>}
                      </select></label>
                      <label>Aero table<select value={stage.aerodynamicTableId ?? "__global__"} onChange={(event) => updateTopologyStage(stage.id, { aerodynamicTableId: event.target.value === "__global__" ? undefined : event.target.value })}>
                        <option value="__global__">Global · {selectedAerodynamicTable?.name ?? "constant Cd"}</option>
                        {aerodynamicTableDefinitions.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}
                        {stage.aerodynamicTableId && !aerodynamicTableDefinitions.some((table) => table.id === stage.aerodynamicTableId) && <option value={stage.aerodynamicTableId}>Unavailable · fallback</option>}
                      </select></label>
                      <label>Attachment<select value={stage.attachment} disabled={stage.role === "core"} onChange={(event) => updateTopologyStage(stage.id, { attachment: event.target.value as VehicleStageAttachment, parentStageId: event.target.value === "parallel" ? (stage.parentStageId ?? "sustainer") : stage.parentStageId })}><option value="serial">Serial</option><option value="parallel">Parallel</option></select></label>
                      <label>Parent stage<select value={stage.parentStageId ?? ""} disabled={stage.role === "core"} onChange={(event) => updateTopologyStage(stage.id, { parentStageId: event.target.value || undefined })}>{vehicleTopology.stages.slice(0, index).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select></label>
                      <label>Repeat count<input type="number" min="1" max="8" value={stage.repeatCount} onChange={(event) => updateTopologyStage(stage.id, { repeatCount: Number(event.target.value) })} /></label>
                      <label>Radial radius (m)<input type="number" min="0" max="2" step="0.01" value={stage.repeatRadiusM} onChange={(event) => updateTopologyStage(stage.id, { repeatRadiusM: Number(event.target.value) })} /></label>
                      <label>Motor cant (deg)<input type="number" min="0" max="15" step="0.1" value={stage.thrustCantAngleDeg} disabled={stage.role === "payload"} onChange={(event) => updateTopologyStage(stage.id, { thrustCantAngleDeg: Number(event.target.value) })} /></label>
                      <label>Cant azimuth (deg)<input type="number" min="-180" max="180" step="1" value={stage.thrustCantAzimuthDeg} disabled={stage.role === "payload"} onChange={(event) => updateTopologyStage(stage.id, { thrustCantAzimuthDeg: Number(event.target.value) })} /></label>
                    </div>
                    <div className="topology-stage-events">
                      <label>Ignition delay (s)<input type="number" min="0" max="120" step="0.01" value={stage.ignitionDelayS} onChange={(event) => updateTopologyStage(stage.id, { ignitionDelayS: Number(event.target.value) })} /></label>
                      <label>Separation delay (s)<input type="number" min="0" max="120" step="0.01" value={stage.separationDelayS} disabled={stage.role === "core"} onChange={(event) => updateTopologyStage(stage.id, { separationDelayS: Number(event.target.value) })} /></label>
                      <label>Separation dV (+X, m/s)<input type="number" min="0" max="30" step="0.01" value={stage.separationDeltaVBodyMps ?? 0} disabled={stage.role === "core"} onChange={(event) => updateTopologyStage(stage.id, { separationDeltaVBodyMps: Number(event.target.value) })} /></label>
                      <label>Failed motors (1-based)<input type="text" inputMode="text" placeholder={stageMotorInstanceCount(stage) > 1 ? "e.g. 1, 3" : "none"} value={topologyFailureDrafts[stage.id] ?? stage.failedMotorInstanceIndices.map((index) => index + 1).join(", ")} disabled={stage.role === "payload"} onChange={(event) => { setTopologyFailureDrafts((current) => ({ ...current, [stage.id]: event.target.value })); setTopologyError(""); }} onBlur={() => { const value = topologyFailureDrafts[stage.id]; if (value === undefined) return; if (updateTopologyMotorFailures(stage, value)) { setTopologyFailureDrafts((current) => { const next = { ...current }; delete next[stage.id]; return next; }); } }} /></label>
                      <label className="topology-failure-toggle"><input type="checkbox" checked={stage.ignitionFailure} onChange={(event) => updateTopologyStage(stage.id, { ignitionFailure: event.target.checked })} /> Force ignition failure in preview</label>
                    </div>
                    <div className="topology-stage-footer"><span>{stage.motorId ? `Motor · ${userMotorRecords.find((record) => record.id === stage.motorId)?.designation ?? "unavailable (global fallback)"}` : `Motor · global ${previewMotor.designation}`} · {stage.ignitionFailure ? "Preview ignition failure armed" : `${stage.repeatCount > 1 ? `Equal radial placement · ${stage.repeatRadiusM.toFixed(2)} m radius` : "No radial repetition"} · ignition +${stage.ignitionDelayS.toFixed(2)} s`}{(stage.separationDeltaVBodyMps ?? 0) > 0 ? ` · separation +${(stage.separationDeltaVBodyMps ?? 0).toFixed(2)} m/s` : ""}{stage.failedMotorInstanceIndices.length > 0 ? ` · failed motor${stage.failedMotorInstanceIndices.length > 1 ? "s" : ""} ${stage.failedMotorInstanceIndices.map((index) => index + 1).join(", ")}` : ""}{stage.thrustCantAngleDeg > 0 ? ` · cant ${stage.thrustCantAngleDeg.toFixed(1)}° @ ${stage.thrustCantAzimuthDeg.toFixed(0)}°` : ""}</span>{stage.role !== "core" && <button className="danger-button" onClick={() => removeTopologyStage(stage.id)}>Remove stage</button>}</div>
                  </div>
                </article>
              ))}
            </div>
            <div className="history-notice">
              <span>MODEL BOUNDARY</span>
              <p>Topology changes update analytical assembly mass, centre of gravity, inertia, instance counts, and stage-level aerodynamic source assignments. Repeated physical copies can separate independently in the retained-body event model. A regime with one available table uses it; combined stages with conflicting or unavailable tables fall back to the global source with an explicit warning. Coupled separation clearance, aerodynamic interference, and flight-safety validation remain outside this retained-body model; the staged preview exposes an independent ballistic-capable trajectory for detached bodies and uses isotropic point drag only when a stage-specific area and coefficient are available.</p>
            </div>
          </section>
        </div>
      )}
      {historyOpen && (
        <div
          className="export-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHistoryOpen(false);
          }}
        >
          <section
            className="export-dialog history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
            aria-describedby="history-description"
          >
            <div className="export-heading">
              <div>
                <span className="eyebrow">Device timeline</span>
                <h2 id="history-title">Local project history</h2>
                <p id="history-description">Autosave records validated input checkpoints in this browser. Restore any checkpoint without deleting newer entries.</p>
              </div>
              <button
                ref={historyCloseRef}
                className="export-close"
                aria-label="Close local project history"
                onClick={() => setHistoryOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="history-toolbar">
              <div>
                <strong>{projectHistory.entries.length} / 40 checkpoints</strong>
                <span>Newest changes are kept when the device timeline reaches its limit.</span>
              </div>
              <button className="secondary-button" onClick={createManualCheckpoint} disabled={!storageReady}>Create checkpoint</button>
            </div>
            {saveError && <p className="history-error" role="status">{saveError}</p>}
            <div className="history-list" aria-label="Saved local checkpoints">
              {projectHistory.entries.length === 0 ? (
                <div className="history-empty"><strong>No checkpoints yet</strong><span>Your first edit will create one automatically after 600 ms.</span></div>
              ) : (
                [...projectHistory.entries].reverse().map((entry) => (
                  <article className="history-entry" key={entry.id}>
                    <span className="history-revision">R{String(entry.snapshot.revision).padStart(2, "0")}</span>
                    <div>
                      <strong>{entry.label}</strong>
                      <span>{new Date(entry.snapshot.savedAtIso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                    </div>
                    <button onClick={() => restoreCheckpoint(entry.snapshot)}>Restore</button>
                  </article>
                ))
              )}
            </div>
            <div className="history-notice">
              <span>LOCAL ONLY</span>
              <p>This history stays on this device and browser profile. It is not cloud sync, collaboration, or a backup, and clearing site data can erase it. Export a RocketWorks project document for portable storage.</p>
            </div>
          </section>
        </div>
      )}
      {exportOpen && (
        <div
          className="export-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setExportOpen(false);
          }}
        >
          <section
            className="export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
            aria-describedby="export-description"
          >
            <div className="export-heading">
              <div>
                <span className="eyebrow">Artifact center</span>
                <h2 id="export-title">Export ARC 54</h2>
                <p id="export-description">Choose an open, inspectable format. Every artifact includes model identity or engineering limitations.</p>
              </div>
              <button
                ref={exportCloseRef}
                className="export-close"
                aria-label="Close export center"
                onClick={() => setExportOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="export-grid">
              <button className="export-import-option" onClick={() => { void copyProjectShare(); }}>
                <span className="export-extension">LINK</span>
                <span><strong>Share design link</strong><small>Copy validated inputs and stage topology into a browser URL. Local motor and aerodynamic libraries stay local.</small></span>
                <em>↗</em>
              </button>
              <button className="export-import-option" onClick={openProjectImport}>
                <span className="export-extension">OPEN</span>
                <span><strong>Import RocketWorks project</strong><small>Restore editable inputs, stage topology, user motors, and aerodynamic tables from a portable JSON document.</small></span>
                <em>↑</em>
              </button>
              <button onClick={() => exportArtifact("project")}>
                <span className="export-extension">JSON</span>
                <span><strong>RocketWorks project document</strong><small>Versioned geometry, models, simulation, uncertainty, landing results, and provenance.</small></span>
                <em>↓</em>
              </button>
              <button onClick={() => exportArtifact("flight-csv")}>
                <span className="export-extension">CSV</span>
                <span><strong>Flight trace</strong><small>SI-unit time history for plotting, analysis, and reproducible comparisons.</small></span>
                <em>↓</em>
              </button>
              <button onClick={() => exportArtifact("uncertainty-csv")}>
                <span className="export-extension">CSV</span>
                <span><strong>Uncertainty samples</strong><small>Every seeded scenario input, output, and retained error with method and ensemble metadata.</small></span>
                <em>↓</em>
              </button>
              {stageFlightResult && <button onClick={() => exportArtifact("stage-flight-csv")}>
                <span className="export-extension">CSV</span>
                <span><strong>Staged 6DOF trace</strong><small>Attached-stage topology, mass, thrust, altitude, and speed at each integration sample; convergence is retained in project JSON and the engineering report.</small></span>
                <em>↓</em>
              </button>}
              {sweepResult && <button onClick={() => exportArtifact("sweep-csv")}>
                <span className="export-extension">CSV</span>
                <span><strong>Parameter sweep table</strong><small>One-variable trade study with every output row and any retained evaluator errors.</small></span>
                <em>↓</em>
              </button>}
              <button onClick={() => exportArtifact("report")}>
                <span className="export-extension">MD</span>
                <span><strong>Engineering report</strong><small>Assumptions-first vehicle, motor, weather, flight, event, warning, and footprint summary.</small></span>
                <em>↓</em>
              </button>
              <button onClick={() => exportArtifact("dxf")}>
                <span className="export-extension">DXF</span>
                <span><strong>CAD side profile</strong><small>R12 millimetre airframe and fin outlines with centerline, CG, and CP layers.</small></span>
                <em>↓</em>
              </button>
              <button onClick={() => exportArtifact("openscad")}>
                <span className="export-extension">SCAD</span>
                <span><strong>Parametric 3D reference</strong><small>Original tangent-ogive, airframe, fin-set, and nozzle CSG source in millimetres.</small></span>
                <em>↓</em>
              </button>
            </div>
            <div className="export-warning">
              <span>ENGINEERING PREVIEW</span>
              <p>DXF and OpenSCAD outputs are reference geometry—not drawings, toleranced solids, structural evidence, certified parts, STL toolpaths, or manufacturing approval. Verify dimensions, fits, materials, wall thicknesses, and loads independently.</p>
            </div>
          </section>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function UncertaintyMetric({
  label,
  summary,
  unit,
  decimals = 0,
}: {
  label: string;
  summary: UncertaintyAnalysisResult["metrics"][string] | undefined;
  unit: string;
  decimals?: number;
}) {
  const format = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : value.toFixed(decimals);
  const low = summary?.p05 ?? null;
  const median = summary?.p50 ?? null;
  const high = summary?.p95 ?? null;
  const range = Math.max((high ?? 1) - (low ?? 0), 1e-9);
  const medianPosition = Math.max(0, Math.min(100, (((median ?? low ?? 0) - (low ?? 0)) / range) * 100));
  return (
    <div className="uncertainty-metric">
      <span>{label}</span>
      <strong>{format(low)} / {format(median)} / {format(high)} <small>{unit}</small></strong>
      <div className="uncertainty-band" aria-hidden="true"><i style={{ left: `${medianPosition}%` }} /></div>
    </div>
  );
}

function UncertaintySettingsEditor({
  sampleCount,
  seed,
  isCurrent,
  onSampleCountChange,
  onSeedChange,
}: {
  sampleCount: number;
  seed: string;
  isCurrent: boolean;
  onSampleCountChange: (value: number) => void;
  onSeedChange: (value: string) => void;
}) {
  return (
    <section className="uncertainty-settings-card" aria-labelledby="uncertainty-settings-title">
      <div className="uncertainty-settings-heading">
        <div>
          <strong id="uncertainty-settings-title">Analysis controls</strong>
          <span>Persisted vertical-flight ensemble settings</span>
        </div>
        <span className={isCurrent ? "uncertainty-settings-state current" : "uncertainty-settings-state stale"}>
          {isCurrent ? "Result matches inputs" : "Rerun required"}
        </span>
      </div>
      <div className="uncertainty-settings-form">
        <label htmlFor="uncertainty-sample-count">
          <span>Scenarios</span>
          <input
            id="uncertainty-sample-count"
            type="number"
            min={16}
            max={512}
            step={8}
            value={sampleCount}
            onChange={(event) => onSampleCountChange(Number(event.target.value))}
          />
        </label>
        <label htmlFor="uncertainty-seed">
          <span>Replay seed</span>
          <input
            id="uncertainty-seed"
            type="text"
            maxLength={80}
            value={seed}
            onChange={(event) => onSeedChange(event.target.value)}
          />
        </label>
      </div>
      <small className="uncertainty-settings-note">16–512 seeded Latin-hypercube scenarios. Larger ensembles improve tail resolution but take longer; the seed is part of the saved project and share link.</small>
    </section>
  );
}

function UncertaintySensitivityList({
  result,
  metricKey = "apogeeM",
  metricLabel = "Apogee",
}: {
  result: UncertaintyAnalysisResult;
  metricKey?: string;
  metricLabel?: string;
}) {
  const drivers = (result.sensitivityByMetric[metricKey] ?? [])
    .filter((item) => item.spearmanRho !== null)
    .slice(0, 4);
  if (drivers.length === 0) return null;
  const maximumMagnitude = Math.max(...drivers.map((item) => Math.abs(item.spearmanRho ?? 0)), 1e-9);
  return (
    <section className="uncertainty-sensitivity" aria-label={`${metricLabel} sensitivity drivers`}>
      <div className="uncertainty-sensitivity-heading">
        <div>
          <span>Driver ranking</span>
            <strong>{metricLabel === "Apogee" ? "Apogee sensitivity" : `${metricLabel} sensitivity`}</strong>
        </div>
        <small>Spearman ρ · monotonic association</small>
      </div>
      <div className="uncertainty-sensitivity-list">
        {drivers.map((item) => {
          const rho = item.spearmanRho ?? 0;
          const width = Math.max(4, (Math.abs(rho) / maximumMagnitude) * 100);
          return (
            <div className={rho < 0 ? "uncertainty-sensitivity-row negative" : "uncertainty-sensitivity-row"} key={item.parameterKey}>
              <span title={item.parameterLabel}>{item.parameterLabel}</span>
              <div className="uncertainty-sensitivity-track" aria-hidden="true"><i style={{ width: `${width}%` }} /></div>
              <strong>{rho >= 0 ? "+" : ""}{rho.toFixed(2)}</strong>
              <small>n={item.pairedSampleCount}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StageFlightUncertaintyCard({
  result,
  running,
  error,
  current,
  resultCurrent,
  hasDirectForceMomentDatabase,
  onRun,
}: {
  result: StageFlightUncertaintyResult | null;
  running: boolean;
  error: string;
  current: boolean;
  resultCurrent: boolean;
  hasDirectForceMomentDatabase: boolean;
  onRun: () => void;
}) {
  const primaryThreshold = result?.convergence.thresholds[0] ?? null;
  return (
    <section className="stage-flight-uncertainty" aria-labelledby="stage-flight-uncertainty-title">
      <div className="stage-flight-uncertainty-heading">
        <div>
          <span className="eyebrow">Coupled dispersion</span>
          <h4 id="stage-flight-uncertainty-title">6DOF uncertainty envelope</h4>
          <p>Propagates bounded mass, thrust, drag, recovery-area, wind, ignition-delay, separation-impulse, and launch-alignment assumptions through staging, launch-rail constraints, topology aerodynamics, and the coupled rigid-body run.{hasDirectForceMomentDatabase ? " Direct force and static-moment coefficient databases receive separate bounded scales when present." : ""}</p>
        </div>
        <button className="secondary-button" type="button" onClick={onRun} disabled={running || !current}>
          {running ? "Sampling…" : result ? "Rerun dispersion" : "Run dispersion"}
        </button>
      </div>
      {error && <div className="stage-flight-error" role="alert">{error}</div>}
      {!resultCurrent && result && (
        <div className="stale-result-banner stage-stale-result-banner" role="status">
          <span>RERUN REQUIRED</span>
          <div>
            <strong>This dispersion envelope is from an earlier configuration</strong>
            <p>Run the current coupled preview again before interpreting this uncertainty result.</p>
          </div>
        </div>
      )}
      {result ? (
        <>
          <div className="uncertainty-card-heading-meta stage-flight-uncertainty-meta">
            <span>{result.method} · n={result.successfulSampleCount}/{result.requestedSampleCount} · {result.adapterVersion}</span>
            <strong className={`uncertainty-status uncertainty-status-${result.convergence.status}`}>{formatConvergenceStatus(result.convergence.status)}</strong>
          </div>
          <div className="uncertainty-grid">
            <UncertaintyMetric label="Peak altitude P05 / P50 / P95" summary={result.metrics.maxAltitudeAglM} unit="m" />
            <UncertaintyMetric label="Peak speed P05 / P50 / P95" summary={result.metrics.maxSpeedMps} unit="m/s" decimals={1} />
            <UncertaintyMetric label="Maximum q P05 / P50 / P95" summary={result.metrics.maxDynamicPressurePa} unit="Pa" />
            <UncertaintyMetric label="Final speed P05 / P50 / P95" summary={result.metrics.finalSpeedMps} unit="m/s" decimals={1} />
            {result.metrics.maxRecoveryDragN && (
              <UncertaintyMetric label="Peak recovery drag P05 / P50 / P95" summary={result.metrics.maxRecoveryDragN} unit="N" decimals={1} />
            )}
            {result.metrics.maxRecoveryEffectiveAreaM2 && (
              <UncertaintyMetric label="Peak canopy area P05 / P50 / P95" summary={result.metrics.maxRecoveryEffectiveAreaM2} unit="m²" decimals={3} />
            )}
          </div>
          <UncertaintySensitivityList result={result} metricKey="maxAltitudeAglM" metricLabel="Peak altitude" />
          <div className="uncertainty-convergence" aria-label="Coupled uncertainty convergence diagnostic">
            <div>
              <span>Split-sample stability</span>
              <strong className={`uncertainty-status uncertainty-status-${result.convergence.status}`}>{formatConvergenceStatus(result.convergence.status)}</strong>
              <small>Max quantile shift {result.convergence.maximumRelativeQuantileShift === null ? "—" : `${(result.convergence.maximumRelativeQuantileShift * 100).toFixed(0)}%`} · {result.convergence.lowerHalfSampleCount}/{result.convergence.upperHalfSampleCount} samples per half</small>
            </div>
            {primaryThreshold && (
              <div>
                <span>Threshold-rate stability</span>
                <strong className={`uncertainty-status uncertainty-status-${primaryThreshold.status}`}>{formatConvergenceStatus(primaryThreshold.status)}</strong>
                <small>Half-rate shift {primaryThreshold.halfProbabilityShift === null ? "—" : `${(primaryThreshold.halfProbabilityShift * 100).toFixed(0)}%`}</small>
              </div>
            )}
          </div>
          <div className="uncertainty-disclaimer">
            <span>MODEL UNCERTAINTY</span>
            <p>{result.correlations.length === 0 ? "Independent seeded input distributions" : `${result.correlations.length} Gaussian-copula correlation pair${result.correlations.length === 1 ? "" : "s"} declared`} · failed samples remain visible · convergence is a finite-sample heuristic, not validation, certification, or a flight-safety assessment.</p>
          </div>
        </>
      ) : (
        <div className="stage-flight-empty">Run the current coupled preview first, then sample the uncertainty envelope without changing the saved design.</div>
      )}
    </section>
  );
}

function UncertaintyCorrelationEditor({
  correlations,
  onChange,
}: {
  correlations: readonly ProjectUncertaintyCorrelation[];
  onChange: (next: ProjectUncertaintyCorrelation[]) => void;
}) {
  const [firstParameterKey, setFirstParameterKey] = useState(UNCERTAINTY_CORRELATION_DEFINITIONS[0]!.key);
  const [secondParameterKey, setSecondParameterKey] = useState(UNCERTAINTY_CORRELATION_DEFINITIONS[3]!.key);
  const [coefficient, setCoefficient] = useState(0.35);
  const firstDefinition = UNCERTAINTY_CORRELATION_DEFINITIONS.find((definition) => definition.key === firstParameterKey);
  const secondDefinition = UNCERTAINTY_CORRELATION_DEFINITIONS.find((definition) => definition.key === secondParameterKey);
  const duplicate = correlations.some((correlation) =>
    [correlation.firstParameterKey, correlation.secondParameterKey].sort().join("\u0000") ===
      [firstParameterKey, secondParameterKey].sort().join("\u0000"),
  );
  const canAdd = firstParameterKey !== secondParameterKey && !duplicate && Number.isFinite(coefficient) && coefficient > -0.999 && coefficient < 0.999 && correlations.length < 24;
  const addCorrelation = () => {
    if (!canAdd) return;
    onChange([...correlations, { firstParameterKey, secondParameterKey, coefficient }]);
  };
  const labelFor = (key: string) => UNCERTAINTY_CORRELATION_DEFINITIONS.find((definition) => definition.key === key)?.label ?? key;
  return (
    <details className="uncertainty-correlation-card">
      <summary>
        <span>
          <strong>Dependence model</strong>
          <small>{correlations.length === 0 ? "Independent inputs · optional correlation pairs" : `${correlations.length} Gaussian-copula pair${correlations.length === 1 ? "" : "s"} declared`}</small>
        </span>
        <span className="uncertainty-correlation-summary-action">Configure</span>
      </summary>
      <div className="uncertainty-correlation-body">
        <p>Declare a pairwise relationship when two input assumptions should move together. RocketWorks validates the matrix and preserves each marginal distribution; this is not measured flight-data correlation.</p>
        {correlations.length > 0 ? (
          <div className="uncertainty-correlation-list" aria-label="Declared uncertainty correlations">
            {correlations.map((correlation) => (
              <div className="uncertainty-correlation-row" key={`${correlation.firstParameterKey}-${correlation.secondParameterKey}`}>
                <span><strong>{labelFor(correlation.firstParameterKey)}</strong><small>{labelFor(correlation.secondParameterKey)}</small></span>
                <strong>{correlation.coefficient > 0 ? "+" : ""}{correlation.coefficient.toFixed(2)}</strong>
                <button className="quiet-button" type="button" onClick={() => onChange(correlations.filter((candidate) => candidate !== correlation))}>Remove</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="uncertainty-correlation-empty">No dependence declared. Every supported factor is sampled independently.</div>
        )}
        <div className="uncertainty-correlation-form">
          <label htmlFor="correlation-first">First input<select id="correlation-first" value={firstParameterKey} onChange={(event) => setFirstParameterKey(event.target.value)}>{UNCERTAINTY_CORRELATION_DEFINITIONS.map((definition) => <option value={definition.key} key={definition.key}>{definition.label} · {definition.scope}</option>)}</select></label>
          <label htmlFor="correlation-second">Second input<select id="correlation-second" value={secondParameterKey} onChange={(event) => setSecondParameterKey(event.target.value)}>{UNCERTAINTY_CORRELATION_DEFINITIONS.map((definition) => <option value={definition.key} key={definition.key}>{definition.label} · {definition.scope}</option>)}</select></label>
          <NumberField id="correlation-coefficient" label="Latent coefficient" value={coefficient} unit="ρ" min={-0.998} max={0.998} step={0.05} onChange={setCoefficient} />
          <button className="secondary-button" type="button" onClick={addCorrelation} disabled={!canAdd}>Add pair</button>
        </div>
        <small className="uncertainty-correlation-hint" aria-live="polite">
          {firstParameterKey === secondParameterKey ? "Choose two different inputs." : duplicate ? "That pair is already declared." : firstDefinition && secondDefinition ? `${firstDefinition.label} ↔ ${secondDefinition.label} will be applied where both factors exist.` : "Choose a supported input pair."}
        </small>
      </div>
    </details>
  );
}

function ParameterSweepCard({
  parameter,
  definition,
  minimum,
  maximum,
  steps,
  running,
  result,
  error,
  onParameterChange,
  onMinimumChange,
  onMaximumChange,
  onStepsChange,
  onRun,
}: {
  parameter: VerticalFlightSweepParameterKey;
  definition: SweepParameterDefinition;
  minimum: number;
  maximum: number;
  steps: number;
  running: boolean;
  result: VerticalFlightSweepResult | null;
  error: string;
  onParameterChange: (value: VerticalFlightSweepParameterKey) => void;
  onMinimumChange: (value: number) => void;
  onMaximumChange: (value: number) => void;
  onStepsChange: (value: number) => void;
  onRun: () => void;
}) {
  const samples = result?.result.samples ?? [];
  const apogees = samples
    .map((sample) => sample.outputs?.apogeeM)
    .filter((value): value is number => typeof value === "number");
  const maxQ = samples
    .map((sample) => sample.outputs?.maxDynamicPressurePa)
    .filter((value): value is number => typeof value === "number");
  const apogeeMinimum = apogees.length > 0 ? Math.min(...apogees) : null;
  const apogeeMaximum = apogees.length > 0 ? Math.max(...apogees) : null;
  const apogeeRange =
    apogeeMinimum !== null && apogeeMaximum !== null
      ? Math.max(apogeeMaximum - apogeeMinimum, 1e-9)
      : 1;
  const maxQMinimum = maxQ.length > 0 ? Math.min(...maxQ) : null;
  const maxQMaximum = maxQ.length > 0 ? Math.max(...maxQ) : null;
  const successfulCount = samples.filter((sample) => sample.outputs !== null).length;
  const format = (value: number | null | undefined, decimals = 1) =>
    value === null || value === undefined ? "—" : value.toFixed(decimals);
  return (
    <section className="sweep-card" aria-labelledby="sweep-title">
      <div className="event-card-heading">
        <div>
          <strong id="sweep-title">Parameter sweep</strong>
          <span>One-variable trade study across the current design</span>
        </div>
        <span>{result ? `${successfulCount} / ${samples.length} rows` : "Ready to run"}</span>
      </div>
      <div className="sweep-controls">
        <label>Variable
          <select value={parameter} onChange={(event) => onParameterChange(event.target.value as VerticalFlightSweepParameterKey)}>
            {SWEEP_PARAMETER_DEFINITIONS.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
          </select>
        </label>
        <label>From
          <input type="number" value={minimum} step={definition.step} onChange={(event) => onMinimumChange(Number(event.target.value))} />
        </label>
        <label>To
          <input type="number" value={maximum} step={definition.step} onChange={(event) => onMaximumChange(Number(event.target.value))} />
        </label>
        <label>Steps
          <input type="number" min={2} max={25} step={1} value={steps} onChange={(event) => onStepsChange(Number(event.target.value))} />
        </label>
        <button className="primary-button" onClick={onRun} disabled={running}>
          {running ? "Sweeping…" : result ? "Rerun sweep" : "Run sweep"}
        </button>
      </div>
      {error && <p className="sweep-error" role="alert">{error}</p>}
      {result ? (
        <>
          <div className="sweep-summary">
            <div><span>Apogee range</span><strong>{format(apogeeMinimum, 0)}–{format(apogeeMaximum, 0)} m</strong></div>
            <div><span>Peak-q range</span><strong>{format(maxQMinimum, 0)}–{format(maxQMaximum, 0)} Pa</strong></div>
            <div><span>Parameter</span><strong>{definition.label} · {definition.unit}</strong></div>
          </div>
          <div className="sweep-plot" aria-label={`${definition.label} sweep apogee bars`}>
            {samples.map((sample, index) => {
              const apogee = sample.outputs?.apogeeM;
              const height = typeof apogee === "number" && apogeeMinimum !== null
                ? Math.max(5, ((apogee - apogeeMinimum) / apogeeRange) * 90 + 10)
                : 4;
              return (
                <div className={sample.error ? "sweep-bar failed" : "sweep-bar"} key={`${sample.value}-${index}`} title={`${sample.value.toFixed(definition.precision)} ${definition.unit} · ${format(apogee, 0)} m apogee`}>
                  <i style={{ height: `${height}%` }} />
                  <span>{sample.value.toFixed(definition.precision)}</span>
                </div>
              );
            })}
          </div>
          <div className="sweep-table-wrap">
            <table className="sweep-table">
              <caption>Parameter sweep output rows</caption>
              <thead><tr><th scope="col">{definition.label}</th><th scope="col">Apogee</th><th scope="col">Max q</th><th scope="col">Impact speed</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {samples.map((sample, index) => <tr key={`${sample.value}-${index}`}>
                  <th scope="row">{sample.value.toFixed(definition.precision)} {definition.unit}</th>
                  <td>{format(sample.outputs?.apogeeM, 0)} m</td>
                  <td>{format(sample.outputs?.maxDynamicPressurePa, 0)} Pa</td>
                  <td>{format(sample.outputs?.impactSpeedMps, 1)} m/s</td>
                  <td className={sample.error ? "sweep-status failed" : "sweep-status"}>{sample.error ?? "evaluated"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="sweep-disclaimer">
            <span>UNVALIDATED TRADE STUDY</span>
            <p>{result.modelVersion} · {result.result.parameterKey} varied independently · {result.warnings[2]}</p>
          </div>
        </>
      ) : (
        <div className="sweep-empty"><strong>Inspect sensitivity before changing the design</strong><p>Run {steps || DEFAULT_SWEEP_STEPS} deterministic rows to see how {definition.label.toLowerCase()} moves apogee, peak dynamic pressure, and impact speed.</p></div>
      )}
    </section>
  );
}

function NumberField({
  id, label, value, unit, min, max, step, onChange,
}: {
  id: string; label: string; value: number; unit: string; min: number; max: number;
  step?: number; onChange: (value: number) => void;
}) {
  return (
    <div className="field-group">
      <label htmlFor={id}>{label}</label>
      <div className="input-with-unit">
        <input id={id} type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <span>{unit}</span>
      </div>
    </div>
  );
}
