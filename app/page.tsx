"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { LandingFootprintChart } from "./landing-footprint-chart.tsx";
import { Rocket3DViewport } from "./rocket-3d-viewport.tsx";
import { FlightTrajectoryViewport } from "./flight-trajectory-viewport.tsx";
import type { RocketPreviewComponentInstance } from "../lib/visualization/rocket-preview-3d.ts";
import {
  createEngineeringReportMarkdown,
  createAerodynamicPolarCsv,
  createFlightTraceCsv,
  createParameterSweepCsv,
  createStageFlightTraceCsv,
  createCoupledMultiBodyTraceCsv,
  createStageFlightComparisonCsv,
  createPhysicsBenchmarkCsv,
  createSeparatedBodyTraceCsv,
  createUncertaintyCsv,
  createKestrelProjectJson,
  parseKestrelProjectJson,
  createRocketOpenScad,
  createRocketProfileDxf,
  createRocketStl,
  type JsonValue,
  type RocketCadGeometry,
  type RocketCadStageGeometry,
} from "../lib/export/project-exports.ts";
import { createFlightPathGeoJson } from "../lib/export/flight-path-geojson.ts";
import {
  analyzeRecoveryLandingDispersion,
  createPlanarTerrainSurface,
  ASCENT_DRIFT_MODEL_VERSION,
  createAerodynamicCoefficientTable,
  sampleAerodynamicPolar,
  computeStaticStability,
  analyzeVerticalFlightUncertainty,
  analyzeStageFlightUncertainty,
  motorThrustScaleFactorKey,
  createApogeeRecoveryDeploymentEvent,
  createAltitudeRecoveryDeploymentEvent,
  createScheduledRecoveryDeploymentEvent,
  createLaunchEnvironmentModel,
  addCompactPackageInertia,
  launchRailDirectionFromAngles,
  launchRailOrientationFromAngles,
  verticalLaunchOrientationBodyToEnu,
  interpolateWind,
  createMotorDataRecord,
  createMultiStageVehicleModel,
  failStageIgnition,
  stageFlightPreviewInitialState,
  exportMotorRaspEng,
  exportMotorMassFlowCsv,
  exportMotorThrustCsv,
  importMotorRaspEng,
  importMotorRaspEngBatch,
  importMotorThrustCsv,
  parseMotorMassFlowCsv,
  combineMassProperties,
  determinant,
  magnitude,
  multiplyMatrices,
  rotationAboutX,
  transpose,
  transformMassProperties,
  createVehicleAssemblyModel,
  analyzeAttachedAeroInterference,
  createStageFlightComparison,
  createAttachedAeroComponentEnvelope,
  createAttachedAeroInterferenceBody,
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
  analyzeVerticalFlightConvergence,
  createEngineeringDesignReview,
  createStageStructuralReview,
  createStageInterfaceLoadReview,
  computeStructuralScreen,
  estimateRecoveryOpeningLoad,
  estimateSphericalEnvelopeRadiusM,
  resolveStageAerodynamicTable,
  type DesignOptimizationResult,
  type AerodynamicCoefficientTableDefinition,
  type AerodynamicCoefficientTableModel,
  type AerodynamicPolarResult,
  type CoefficientSurface,
  type LandingDispersionResult,
  type LandingAscentDriftSummary,
  type UncertaintyAnalysisResult,
  type VerticalFlightConfig,
  type VerticalFlightConvergenceDiagnostic,
  type VerticalFlightResult,
  type FlightDataComparisonResult,
  type FlightDataSeries,
  type FlightDataTraceSource,
  type PhysicsBenchmarkSuiteResult,
  type EngineeringDesignReviewResult,
  type VehicleComponent,
  type Matrix3,
  type MotorDataRecord,
  type StageFlightPreviewResult,
  type StageFlightComparisonResult,
  type ReleasedBodyDragModel,
  type RelativeAeroInteractionOptions,
  type StageFlightUncertaintyResult,
  type CoupledMultiBodyContactOptions,
  type CoupledMultiBodyGravityOptions,
  type RigidBodyIntegrationMethod,
  type VerticalFlightSweepParameterKey,
  type VerticalFlightSweepResult,
  type RocketStage,
  type StageAerodynamicRegime,
  type LaunchEnvironmentProvider,
  type VehicleAssemblyEvaluation,
  type AttachedAeroInterferenceBody,
  type AttachedAeroInterferenceResult,
  type StateTriggeredRigidBodyEvent,
  type ScheduledRigidBodyEvent,
  type RocketStageInstance,
  type StructuralMaterialModel,
  type StructuralScreenResult,
  type StageStructuralReviewResult,
  type StageInterfaceLoadResult,
  type SeparationDynamicsResult,
  type CoupledSeparationImpulseResult,
  type RecoveryReefingStage,
  type TerrainSurface,
  type WindLayer,
  type NormalForceModelKind,
  type InducedDragModelKind,
} from "../lib/physics/index.ts";
import {
  createPreviewWindProfile,
  PREVIEW_WIND_PROFILE_MODEL_VERSION,
} from "../lib/physics/preview-wind-profile.ts";
import {
  DEFAULT_UNCERTAINTY_SAMPLE_COUNT,
  DEFAULT_UNCERTAINTY_SEED,
  DEFAULT_WEATHER_SEED,
  LOCAL_PROJECT_HISTORY_STORAGE_KEY,
  LOCAL_PROJECT_STORAGE_KEY,
  appendProjectHistory,
  createEmptyProjectHistory,
  createLocalProjectSnapshot,
  describeProjectConfigurationChanges,
  parseLocalProjectHistory,
  parseLocalProjectSnapshot,
  projectConfigurationFingerprint,
  serializeLocalProjectHistory,
  serializeLocalProjectSnapshot,
  type EditableProjectInputs,
  type LocalProjectHistory,
  type LocalProjectSnapshot,
  type NoseProfile,
  type ProjectWindLayer,
  type ProjectUncertaintyCorrelation,
  type ProjectTerrainModel,
  type RecoveryDeploymentTrigger,
} from "../lib/project/project-state.ts";
import {
  DEFAULT_CUSTOM_MATERIAL_PROFILE,
  resolveCustomMaterialProfile,
  type CustomMaterialProfile,
} from "../lib/project/material-profile.ts";
import {
  EXPERIENCE_MODE_STORAGE_KEY,
  PROJECT_TEMPLATES,
  type ExperienceMode,
  type ProjectTemplate,
} from "../lib/project/templates.ts";
import {
  LOCAL_MOTOR_LIBRARY_STORAGE_KEY,
  LOCAL_MOTOR_SELECTION_STORAGE_KEY,
  parseLocalMotorLibrary,
  serializeLocalMotorLibrary,
  upsertLocalMotorRecord,
} from "../lib/project/motor-library-state.ts";
import {
  LOCAL_VEHICLE_TOPOLOGY_STORAGE_KEY,
  createDefaultVehicleTopology,
  createStagePlan,
  duplicateVehicleStageTopology,
  parseVehicleTopology,
  removeVehicleStageTopology,
  serializeVehicleTopology,
  stageThrustAxisBody,
  stageThrustAxisWithGimbal,
  type LocalVehicleTopology,
  type VehicleStageAttachment,
  type VehicleStagePlan,
  type VehicleStageRecoveryTrigger,
  type VehicleStageRole,
  type VehicleStageSeparationImpulseBodyNs,
  type VehicleTopologyComponentPlan,
} from "../lib/project/vehicle-topology.ts";
import {
  LOCAL_AERODYNAMIC_LIBRARY_STORAGE_KEY,
  LOCAL_AERODYNAMIC_SELECTION_STORAGE_KEY,
  parseLocalAerodynamicLibrary,
  serializeLocalAerodynamicLibrary,
  upsertLocalAerodynamicTable,
} from "../lib/project/aero-library-state.ts";
import {
  LOCAL_COMPONENT_LIBRARY_STORAGE_KEY,
  parseLocalComponentLibrary,
  serializeLocalComponentLibrary,
  upsertLocalComponentRecord,
  type ComponentPresetKind,
  type ComponentPresetParameters,
  type LocalComponentRecord,
} from "../lib/project/component-library-state.ts";
import {
  LOCAL_FLIGHT_DATA_STORAGE_KEY,
  createLocalFlightDataSnapshot,
  parseLocalFlightDataSnapshot,
  serializeLocalFlightDataSnapshot,
} from "../lib/project/flight-data-state.ts";
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
import {
  createDefaultUiPreferences,
  UI_PREFERENCES_LEGACY_STORAGE_KEYS,
  parseUiPreferences,
  serializeUiPreferences,
  UI_PREFERENCES_STORAGE_KEY,
  type UiDesignView,
} from "../lib/project/ui-preferences.ts";
import { getUiCopy, type UiCopy, type UiLocale } from "../lib/project/ui-copy.ts";

type ComponentKey = "nose" | "body" | "fins" | "mount" | "recovery";
type ViewKey = "design" | "flight";
type DesignViewKey = UiDesignView;
type MaterialKey = "kraft" | "fiberglass" | "carbon" | "custom";
type FlightDataPersistenceState = "none" | "saved" | "restored" | "session-only";
type ExportFormat = "project" | "flight-csv" | "stage-flight-csv" | "stage-flight-comparison-csv" | "separated-body-csv" | "coupled-body-csv" | "flight-path-geojson" | "sweep-csv" | "uncertainty-csv" | "benchmark-csv" | "aero-polar-csv" | "report" | "dxf" | "stl" | "openscad";
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

const DEFAULT_PROJECT_NAME = "ARC 54";

function namedProjectFingerprint(
  inputs: EditableProjectInputs,
  topology: LocalVehicleTopology,
  selectedMotorId: string,
  selectedAerodynamicTableId: string,
  projectName: string,
): string {
  return JSON.stringify([
    projectConfigurationFingerprint({
      inputs,
      topology,
      selectedMotorId,
      selectedAerodynamicTableId,
    }),
    projectName,
  ]);
}

function projectFileStem(value: string): string {
  const stem = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (stem || "rocketworks-project").slice(0, 48);
}

function publicModelVersion(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/^kestrel-/i, "rocketworks-");
}

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

type UncertaintyCorrelationDefinition = Readonly<{
  key: string;
  label: string;
  scope: string;
}>;

const UNCERTAINTY_CORRELATION_DEFINITIONS: readonly UncertaintyCorrelationDefinition[] = [
  { key: "dryMassScale", label: "Dry mass", scope: "vertical + coupled" },
  { key: "propellantMassScale", label: "Propellant mass", scope: "coupled" },
  { key: "dragCoefficientScale", label: "Drag coefficient", scope: "vertical + coupled" },
  { key: "coefficientUncertaintyScale", label: "Aero table uncertainty", scope: "coupled" },
  { key: "directForceCoefficientScale", label: "Direct force coefficients", scope: "coupled" },
  { key: "directMomentCoefficientScale", label: "Direct moment coefficients", scope: "coupled" },
  { key: "thrustScale", label: "Delivered thrust", scope: "vertical + coupled" },
  { key: "windScale", label: "Wind profile", scope: "vertical + coupled + landing" },
  { key: "ignitionDelayOffsetS", label: "Ignition delay", scope: "coupled" },
  { key: "separationImpulseScale", label: "Separation impulse", scope: "coupled" },
  { key: "alignmentOffsetRad", label: "Launch alignment", scope: "coupled" },
  { key: "railFrictionScale", label: "Guide friction", scope: "coupled" },
  { key: "railTipOffScale", label: "Rail-exit tip-off", scope: "coupled" },
  { key: "recoveryDragAreaScale", label: "Vertical recovery area", scope: "vertical" },
  { key: "recoveryInflationTimeScale", label: "Recovery inflation time", scope: "vertical + coupled" },
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

type ComponentPresetDraft = {
  name: string;
  description: string;
  sourceName: string;
  dataVersion: string;
  licenseIdentifier: string;
  attribution: string;
  sourceUrl: string;
};

const defaultComponentPresetDraft: ComponentPresetDraft = {
  name: "Reusable component",
  description: "Project-authored RocketWorks component preset.",
  sourceName: "RocketWorks project",
  dataVersion: "0.1",
  licenseIdentifier: "MIT",
  attribution: "Original project-authored geometry",
  sourceUrl: "",
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

function componentPresetKindLabel(kind: ComponentPresetKind): string {
  return kind === "nose"
    ? "Nose cone"
    : kind === "airframe"
      ? "Airframe"
      : kind === "fin-set"
        ? "Fin set"
        : kind === "recovery"
          ? "Recovery"
          : kind === "point-mass"
            ? "Equipment mass"
            : "Cylindrical pod";
}

function componentPresetSummary(record: LocalComponentRecord): string {
  const parameters = record.parameters;
  if (parameters.kind === "nose") return `${parameters.profile} · ${parameters.lengthMm.toFixed(0)} mm`;
  if (parameters.kind === "airframe") return `${parameters.diameterMm.toFixed(0)} × ${parameters.lengthMm.toFixed(0)} mm · ${parameters.material}`;
  if (parameters.kind === "fin-set") return `${parameters.count} fins · ${parameters.rootChordMm.toFixed(0)} mm root · ${parameters.spanMm.toFixed(0)} mm span`;
  if (parameters.kind === "point-mass") {
    const inertiaLabel = parameters.inertiaAtCenterKgM2 === undefined ? "" : " · local inertia";
    return `${parameters.massKg.toFixed(3)} kg · X ${parameters.axialPositionM.toFixed(2)} m · radial ${parameters.radialOffsetM.toFixed(3)} m${inertiaLabel}`;
  }
  if (parameters.kind === "cylindrical-pod") return `${(parameters.diameterM * 1000).toFixed(0)} × ${(parameters.lengthM * 1000).toFixed(0)} mm · ${parameters.densityKgM3.toFixed(0)} kg/m³`;
  const trigger = parameters.deploymentTrigger === "altitude"
    ? `descent ${parameters.deploymentAltitudeM.toFixed(0)} m`
    : parameters.deploymentTrigger === "time"
      ? `time ${parameters.deploymentTimeS.toFixed(1)} s`
      : "apogee";
  return `${(parameters.diameterM * 1000).toFixed(0)} mm canopy · ${trigger} · ${parameters.delayS.toFixed(1)} s delay · ${parameters.reefingEnabled ? "reefed" : "full open"}`;
}

type BrowserMaterialModel = StructuralMaterialModel & Readonly<{
  densityKgM3: number;
  wallThicknessM: number;
  modelVersion?: string;
  validationStatus?: string;
}>;

const BROWSER_MATERIAL_MODEL_VERSION =
  "rocketworks-representative-materials-0.1.0";
const BROWSER_MATERIAL_VALIDATION_STATUS =
  "representative-preview-unvalidated";

const materialModels: Record<
  Exclude<MaterialKey, "custom">,
  BrowserMaterialModel
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
    modelVersion: BROWSER_MATERIAL_MODEL_VERSION,
    validationStatus: BROWSER_MATERIAL_VALIDATION_STATUS,
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
    modelVersion: BROWSER_MATERIAL_MODEL_VERSION,
    validationStatus: BROWSER_MATERIAL_VALIDATION_STATUS,
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
    modelVersion: BROWSER_MATERIAL_MODEL_VERSION,
    validationStatus: BROWSER_MATERIAL_VALIDATION_STATUS,
  },
};

function resolveBrowserMaterialModel(
  material: MaterialKey,
  customMaterial: CustomMaterialProfile,
): BrowserMaterialModel {
  return material === "custom"
    ? resolveCustomMaterialProfile(customMaterial)
    : materialModels[material];
}

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
    siteName?: string;
    latitudeDeg?: number;
    longitudeDeg?: number;
    windAzimuthDeg?: number;
    windProfileLayers?: readonly ProjectWindLayer[];
    seed?: string;
    windScale?: number;
    directionOffsetRad?: number;
    turbulenceScale?: number;
    earthRotationEnabled?: boolean;
    normalGravityEnabled?: boolean;
    relativeHumidityPercent?: number;
    surfacePressureHpa?: number;
    surfaceTemperatureC?: number;
  }> = {},
) {
  const turbulenceScale = options.turbulenceScale ?? 1;
  const customWindProfile = options.windProfileLayers && options.windProfileLayers.length > 0
    ? options.windProfileLayers.map((layer) => ({ ...layer }))
    : null;
  const windScale = options.windScale ?? 1;
  const directionOffsetRad = options.directionOffsetRad ?? 0;
  const profileAngleRad = customWindProfile
    ? directionOffsetRad
    : ((options.windAzimuthDeg ?? 0) * Math.PI) / 180 + directionOffsetRad;
  const rotateWindProfile = (layers: readonly WindLayer[]) => layers.map((layer) => ({
    altitudeM: layer.altitudeM,
    eastMps: (layer.eastMps * Math.cos(profileAngleRad) - layer.northMps * Math.sin(profileAngleRad)) * windScale,
    northMps: (layer.eastMps * Math.sin(profileAngleRad) + layer.northMps * Math.cos(profileAngleRad)) * windScale,
    upMps: (layer.upMps ?? 0) * windScale,
  }));
  const meanWindProfile = customWindProfile
    ? rotateWindProfile(customWindProfile)
    : createPreviewWindProfile(windSpeed, {
        ...options,
        windAzimuthRad: ((options.windAzimuthDeg ?? 0) * Math.PI) / 180,
      });
  const referenceWindSpeedMps = customWindProfile
    ? interpolateWind([...meanWindProfile], 500).horizontalSpeedMps
    : windSpeed * windScale;
  const siteAtmosphere = standardAtmosphere(launchAltitude);
  const relativeHumidityFraction = options.relativeHumidityPercent === undefined
    ? undefined
    : options.relativeHumidityPercent / 100;
  const surfacePressureHpa = options.surfacePressureHpa ?? siteAtmosphere.pressurePa / 100;
  const surfaceTemperatureC = options.surfaceTemperatureC ?? siteAtmosphere.temperatureK - 273.15;
  return createLaunchEnvironmentModel({
    site: {
      name: options.siteName ?? "ARC 54 synthetic range",
      latitudeDeg: options.latitudeDeg ?? -36.85,
      longitudeDeg: options.longitudeDeg ?? 174.76,
      elevationM: launchAltitude,
      datum: "WGS84",
      timeZone: "Pacific/Auckland",
    },
    provenance: {
      sourceName: customWindProfile ? "RocketWorks local wind profile" : "ARC 54 browser input",
      sourceKind: customWindProfile ? "user-supplied" : "synthetic",
      dataVersion: customWindProfile ? "user-wind-profile-v1" : PREVIEW_WIND_PROFILE_MODEL_VERSION,
      licenseIdentifier: customWindProfile ? "user-declared" : "CC0-1.0",
      attribution: customWindProfile
        ? "User-supplied altitude-dependent mean-wind layers"
        : "Original RocketWorks synthetic environment",
      validationStatus: customWindProfile ? "user-supplied-unvalidated" : "synthetic-unvalidated",
    },
    meanWindProfile,
    surfaceObservation: {
      stationPressurePa: surfacePressureHpa * 100,
      temperatureK: surfaceTemperatureC + 273.15,
      ...(relativeHumidityFraction === undefined ? {} : { relativeHumidityFraction }),
    },
    turbulence: {
      seed: options.seed ?? "arc54-weather-v1",
      rmsVelocityMps: {
        longitudinal: referenceWindSpeedMps * 0.12 * turbulenceScale,
        lateral: referenceWindSpeedMps * 0.1 * turbulenceScale,
        vertical: referenceWindSpeedMps * 0.06 * turbulenceScale,
      },
      lengthScaleM: { longitudinal: 80, lateral: 50, vertical: 30 },
      minimumWavelengthM: 3,
      maximumWavelengthM: 800,
      modeCount: 24,
      minimumAdvectionSpeedMps: 0.5,
    },
    earthRotation: {
      enabled: options.earthRotationEnabled ?? false,
    },
    gravityModel: options.normalGravityEnabled ? "wgs84-normal" : "standard",
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
  customMaterial = DEFAULT_CUSTOM_MATERIAL_PROFILE,
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
  customMaterial?: CustomMaterialProfile;
  payloadMassKg: number;
  motorMassKg?: number;
  recoveryMassKg?: number;
}): VehicleComponent[] {
  const radiusM = diameterM / 2;
  const airframe = resolveBrowserMaterialModel(material, customMaterial);
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

type StageGeometryContext = Readonly<{
  lengthM: number;
  diameterM: number;
  noseLengthM: number;
}>;

type StagePreviewGeometry = Readonly<{
  bodyLengthM: number;
  diameterM: number;
  noseLengthM: number;
  defaultBodyLengthM: number;
  defaultDiameterM: number;
  defaultNoseLengthM: number;
}>;

function stagePreviewGeometry(stage: VehicleStagePlan, inputs: StageGeometryContext): StagePreviewGeometry {
  const roleScale = stageScaleForRole(stage.role);
  const defaultBodyLengthM = inputs.lengthM * roleScale;
  const defaultDiameterM = inputs.diameterM * (stage.role === "core" ? 1 : stage.role === "booster" ? 0.8 : 0.72);
  const defaultNoseLengthM = inputs.noseLengthM * roleScale;
  const allowOverride = stage.role !== "core";
  return {
    bodyLengthM: allowOverride ? stage.bodyLengthM ?? defaultBodyLengthM : defaultBodyLengthM,
    diameterM: allowOverride ? stage.diameterM ?? defaultDiameterM : defaultDiameterM,
    noseLengthM: allowOverride ? stage.noseLengthM ?? defaultNoseLengthM : defaultNoseLengthM,
    defaultBodyLengthM,
    defaultDiameterM,
    defaultNoseLengthM,
  };
}

function stageEnvelopeLengthM(stage: VehicleStagePlan, inputs: StageGeometryContext): number {
  const geometry = stagePreviewGeometry(stage, inputs);
  return geometry.noseLengthM + geometry.bodyLengthM;
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
  inputs: StageGeometryContext,
): readonly StagePlacement[] {
  const placementById = new Map<string, StagePlacement>();
  return stages.map((stage) => {
    const parentTranslationXM = stage.parentStageId
      ? placementById.get(stage.parentStageId)?.translationXM ?? 0
      : 0;
    const translationXM = stage.role === "core"
        ? 0
        : stage.attachment === "serial"
        ? parentTranslationXM - stageEnvelopeLengthM(stage, inputs)
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

function createCadStageParts(
  stages: readonly VehicleStagePlan[],
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
  }>,
): readonly RocketCadStageGeometry[] {
  return createStagePlacements(stages, inputs).flatMap((placement) => {
    const stageGeometry = stagePreviewGeometry(placement.stage, inputs);
    const lengthOverrideScale = stageGeometry.bodyLengthM / Math.max(stageGeometry.defaultBodyLengthM, 1e-9);
    const diameterOverrideScale = stageGeometry.diameterM / Math.max(stageGeometry.defaultDiameterM, 1e-9);
    const stageScale = stageScaleForRole(placement.stage.role);
    const finScale = placement.stage.role === "core" ? 1 : stageScale * lengthOverrideScale;
    const spanScale = placement.stage.role === "core"
      ? 1
      : stageScale * Math.min(lengthOverrideScale, diameterOverrideScale);
    return Array.from({ length: placement.instanceCount }, (_, instanceIndex) => {
      const angle = placement.stage.attachment === "parallel"
        ? (instanceIndex * 2 * Math.PI) / Math.max(placement.instanceCount, 1)
        : 0;
      return {
        id: placement.instanceCount > 1
          ? `${placement.stage.id}-instance-${instanceIndex + 1}`
          : placement.stage.id,
        name: placement.instanceCount > 1
          ? `${placement.stage.name} ${instanceIndex + 1}`
          : placement.stage.name,
        axialOffsetM: placement.translationXM,
        radialOffsetYM: placement.stage.attachment === "parallel"
          ? placement.stage.repeatRadiusM * Math.cos(angle)
          : 0,
        radialOffsetZM: placement.stage.attachment === "parallel"
          ? placement.stage.repeatRadiusM * Math.sin(angle)
          : 0,
        noseLengthM: stageGeometry.noseLengthM,
        noseProfile: inputs.noseProfile,
        bodyLengthM: stageGeometry.bodyLengthM,
        diameterM: stageGeometry.diameterM,
        finCount: inputs.finCount,
        finRootChordM: inputs.finRootChordM * finScale,
        finTipChordM: inputs.finTipChordM * finScale,
        finSweepM: inputs.finSweepM * finScale,
        finSpanM: inputs.finSpanM * spanScale,
        finThicknessM: inputs.finThicknessM,
      } satisfies RocketCadStageGeometry;
    });
  });
}

function rotateInertiaAboutX(inertia: Matrix3, angleRad: number): Matrix3 {
  const rotation = rotationAboutX(angleRad);
  return multiplyMatrices(multiplyMatrices(rotation, inertia), transpose(rotation));
}

function topologyComponentToVehicleComponent(
  plan: VehicleTopologyComponentPlan,
): VehicleComponent {
  const azimuthRad = (plan.azimuthDeg * Math.PI) / 180;
  const positionM = {
    x: plan.axialPositionM,
    y: plan.radialOffsetM * Math.cos(azimuthRad),
    z: plan.radialOffsetM * Math.sin(azimuthRad),
  };
  const id = `topology-${plan.id}`;
  if (plan.kind === "pointMass") {
    const localInertia = plan.inertiaAtCenterKgM2;
    const inertiaAtCenterKgM2: Matrix3 | undefined = localInertia === undefined
      ? undefined
      : [
          [localInertia.x, 0, 0],
          [0, localInertia.y, 0],
          [0, 0, localInertia.z],
        ];
    const rotatedInertia = inertiaAtCenterKgM2 === undefined
      ? undefined
      : rotateInertiaAboutX(inertiaAtCenterKgM2, azimuthRad);
    return {
      id,
      name: plan.name,
      stageId: plan.stageId,
      kind: "pointMass",
      enabled: plan.enabled,
      massKg: plan.massKg!,
      positionM,
      ...(rotatedInertia === undefined ? {} : { inertiaAtCenterKgM2: rotatedInertia }),
    };
  }
  const radiusM = plan.diameterM! / 2;
  return {
    id,
    name: plan.name,
    stageId: plan.stageId,
    kind: "axisymmetric",
    enabled: plan.enabled,
    densityKgM3: plan.densityKgM3!,
    wallThicknessM: plan.wallThicknessM!,
    positionM,
    stations: [
      { xM: 0, outerRadiusM: radiusM },
      { xM: plan.lengthM!, outerRadiusM: radiusM },
    ],
  };
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
  const rotateLocalTransverse = (position: { y: number; z: number }) => ({
    y: position.y * Math.cos(angle) - position.z * Math.sin(angle),
    z: position.y * Math.sin(angle) + position.z * Math.cos(angle),
  });
  const idSuffix = placement.instanceCount > 1 ? `-instance-${instanceIndex + 1}` : "";
  if (component.kind === "axisymmetric") {
    const position = component.positionM ?? { x: 0, y: 0, z: 0 };
    const localTransverse = rotateLocalTransverse(position);
    return {
      ...component,
      id: `${component.id}${idSuffix}`,
      positionM: {
        x: position.x + placement.translationXM,
        y: localTransverse.y + radialTranslation.y,
        z: localTransverse.z + radialTranslation.z,
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
  const localTransverse = rotateLocalTransverse(component.positionM);
  const rotatedInertia = component.inertiaAtCenterKgM2 === undefined
    ? undefined
    : rotateInertiaAboutX(component.inertiaAtCenterKgM2, angle);
  return {
    ...component,
    id: `${component.id}${idSuffix}`,
    positionM: {
      x: component.positionM.x + placement.translationXM,
      y: localTransverse.y + radialTranslation.y,
      z: localTransverse.z + radialTranslation.z,
    },
    ...(rotatedInertia === undefined ? {} : { inertiaAtCenterKgM2: rotatedInertia }),
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
    customMaterial?: CustomMaterialProfile;
    payloadMassKg: number;
    recoveryMassKg: number;
    motorMassKgByStageId?: Readonly<Record<string, number>>;
  }>,
  topologyComponents: readonly VehicleTopologyComponentPlan[] = [],
): VehicleComponent[] {
  return createStagePlacements(stages, inputs).flatMap((placement) => {
    const stageComponents = makeAssemblyStageComponents(placement.stage, baseComponents, inputs, topologyComponents);
    return Array.from({ length: placement.instanceCount }, (_, instanceIndex) =>
      stageComponents.map((component) => placeStageComponent(component, placement, instanceIndex)),
    ).flat();
  });
}

function createAttachedAeroReviewBodies({
  topology,
  assembly,
  componentCatalog,
  lengthM,
  diameterM,
  noseLengthM,
}: Readonly<{
  topology: LocalVehicleTopology;
  assembly: VehicleAssemblyEvaluation;
  componentCatalog: ReadonlyMap<string, VehicleComponent>;
  lengthM: number;
  diameterM: number;
  noseLengthM: number;
}>): readonly AttachedAeroInterferenceBody[] {
  const placements = createStagePlacements(topology.stages, { lengthM, diameterM, noseLengthM });
  const groups = new Map<string, {
    stage: VehicleStagePlan;
    stageInstanceIndex: number;
    centerYM: number;
    centerZM: number;
    components: NonNullable<ReturnType<typeof createAttachedAeroComponentEnvelope>>[];
  }>();
  for (const placement of placements) {
    if (!placement.stage.enabled) continue;
    for (let stageInstanceIndex = 0; stageInstanceIndex < placement.instanceCount; stageInstanceIndex += 1) {
      const angle = placement.stage.attachment === "parallel"
        ? (stageInstanceIndex * 2 * Math.PI) / Math.max(placement.instanceCount, 1)
        : 0;
      const key = `${placement.stage.id}:${stageInstanceIndex}`;
      groups.set(key, {
        stage: placement.stage,
        stageInstanceIndex,
        centerYM: placement.stage.attachment === "parallel"
          ? placement.stage.repeatRadiusM * Math.cos(angle)
          : 0,
        centerZM: placement.stage.attachment === "parallel"
          ? placement.stage.repeatRadiusM * Math.sin(angle)
          : 0,
        components: [],
      });
    }
  }
  for (const instance of assembly.componentInstances) {
    const group = groups.get(`${instance.stageId}:${instance.stageInstanceIndex}`);
    const component = componentCatalog.get(instance.sourceComponentId);
    if (!group || !component) continue;
    const envelope = createAttachedAeroComponentEnvelope(component, instance.transform);
    if (envelope) group.components.push(envelope);
  }
  return [...groups.values()].map((group) => createAttachedAeroInterferenceBody({
    id: group.stageInstanceIndex > 0 || group.stage.repeatCount > 1
      ? `${group.stage.id}-instance-${group.stageInstanceIndex + 1}`
      : group.stage.id,
    label: group.stageInstanceIndex > 0 || group.stage.repeatCount > 1
      ? `${group.stage.name} ${group.stageInstanceIndex + 1}`
      : group.stage.name,
    stageId: group.stage.id,
    stageRole: group.stage.role,
    stageAttachment: group.stage.attachment,
    stageInstanceIndex: group.stageInstanceIndex,
    centerYM: group.centerYM,
    centerZM: group.centerZM,
    components: group.components,
  }));
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
  const unrotateLocalTransverse = (position: { y: number; z: number }) => ({
    y: position.y * Math.cos(angle) + position.z * Math.sin(angle),
    z: -position.y * Math.sin(angle) + position.z * Math.cos(angle),
  });
  if (component.kind === "axisymmetric") {
    const position = component.positionM ?? { x: 0, y: 0, z: 0 };
    const localTransverse = unrotateLocalTransverse({
      y: position.y - radialTranslation.y,
      z: position.z - radialTranslation.z,
    });
    return {
      ...component,
      positionM: {
        x: position.x - placement.translationXM,
        y: localTransverse.y,
        z: localTransverse.z,
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
  const localTransverse = unrotateLocalTransverse({
    y: component.positionM.y - radialTranslation.y,
    z: component.positionM.z - radialTranslation.z,
  });
  return {
    ...component,
    positionM: {
      x: component.positionM.x - placement.translationXM,
      y: localTransverse.y,
      z: localTransverse.z,
    },
  };
}

function createSeparationEnvelopeRadiusMap({
  topology,
  assembly,
  stageComponents,
  lengthM,
  diameterM,
  noseLengthM,
}: Readonly<{
  topology: LocalVehicleTopology;
  assembly: VehicleAssemblyEvaluation;
  stageComponents: readonly VehicleComponent[];
  lengthM: number;
  diameterM: number;
  noseLengthM: number;
}>): Readonly<Record<string, number>> {
  const placements = new Map(
    createStagePlacements(topology.stages, { lengthM, diameterM, noseLengthM }).map((placement) => [placement.stage.id, placement]),
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
    customMaterial?: CustomMaterialProfile;
    payloadMassKg: number;
    recoveryMassKg: number;
    motorMassKgByStageId?: Readonly<Record<string, number>>;
  }>,
  topologyComponents: readonly VehicleTopologyComponentPlan[] = [],
): VehicleComponent[] {
  if (stage.role === "core") return baseComponents.map((component) => ({ ...component, stageId: stage.id }));
  const stageGeometry = stagePreviewGeometry(stage, inputs);
  const lengthOverrideScale = stageGeometry.bodyLengthM / Math.max(stageGeometry.defaultBodyLengthM, 1e-9);
  const diameterOverrideScale = stageGeometry.diameterM / Math.max(stageGeometry.defaultDiameterM, 1e-9);
  const stageScale = stageScaleForRole(stage.role);
  const generated = makeDesignComponents({
    lengthM: stageGeometry.bodyLengthM,
    diameterM: stageGeometry.diameterM,
    noseLengthM: stageGeometry.noseLengthM,
    noseProfile: inputs.noseProfile,
    finCount: inputs.finCount,
    finRootChordM: inputs.finRootChordM * stageScale * lengthOverrideScale,
    finTipChordM: inputs.finTipChordM * stageScale * lengthOverrideScale,
    finSweepM: inputs.finSweepM * stageScale * lengthOverrideScale,
    finSpanM: inputs.finSpanM * stageScale * Math.min(lengthOverrideScale, diameterOverrideScale),
    finThicknessM: inputs.finThicknessM,
    material: inputs.material,
    customMaterial: inputs.customMaterial,
    payloadMassKg: stage.role === "payload" ? inputs.payloadMassKg * 0.7 : inputs.payloadMassKg * 0.18,
    recoveryMassKg: inputs.recoveryMassKg * stageScale,
    motorMassKg: inputs.motorMassKgByStageId?.[stage.id] ?? 0.16,
  });
  const allowedKinds = stage.role === "booster"
    ? new Set(["body", "fins", "motor"])
    : stage.role === "payload"
      ? new Set(["nose", "body", "payload", "recovery"])
      : new Set(["nose", "body", "fins", "motor", "payload"]);
  const generatedComponents = generated
    .filter((component) => allowedKinds.has(component.id))
    .map((component) => ({ ...component, id: `${stage.id}-${component.id}`, stageId: stage.id }));
  const customComponents = topologyComponents
    .filter((component) => component.stageId === stage.id)
    .map(topologyComponentToVehicleComponent);
  return [...generatedComponents, ...customComponents];
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
  launchRailFrictionAccelerationMps2,
  launchRailTipOffPitchRateDegS,
  launchRailTipOffYawRateDegS,
  coupledMutualGravityEnabled,
  coupledGravitySofteningRadiusM,
  coupledContactEnabled,
  coupledContactStiffnessNPerM,
  coupledContactDampingNsPerM,
  coupledContactMaximumNormalForceN,
  releasedBodyDragModel,
  relativeAeroInteractionEnabled,
  relativeAeroWakeHalfAngleDeg,
  relativeAeroWakeRecoveryDistanceBodyDiameters,
  relativeAeroPeakVelocityDeficitFraction,
  relativeAeroMaximumVelocityDeficitFraction,
  separationContactStoppingDistanceM,
  separationContactCoefficientOfRestitution,
  recoveryEnabled,
  recoveryDelay,
  recoveryInflationTime,
  recoveryDeploymentTrigger,
  recoveryDeploymentAltitudeM,
  recoveryDeploymentTimeS,
  recoveryDiameter,
  recoveryReefingEnabled,
  recoveryReefingDurationS,
  recoveryReefingStartAreaFraction,
  sixDofIntegrationMethod,
  normalForceModel,
  inducedDragModel,
  inducedDragFactor,
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
  launchRailFrictionAccelerationMps2: number;
  launchRailTipOffPitchRateDegS: number;
  launchRailTipOffYawRateDegS: number;
  coupledMutualGravityEnabled: boolean;
  coupledGravitySofteningRadiusM: number;
  coupledContactEnabled: boolean;
  coupledContactStiffnessNPerM: number;
  coupledContactDampingNsPerM: number;
  coupledContactMaximumNormalForceN: number;
  releasedBodyDragModel: ReleasedBodyDragModel;
  relativeAeroInteractionEnabled: boolean;
  relativeAeroWakeHalfAngleDeg: number;
  relativeAeroWakeRecoveryDistanceBodyDiameters: number;
  relativeAeroPeakVelocityDeficitFraction: number;
  relativeAeroMaximumVelocityDeficitFraction: number;
  separationContactStoppingDistanceM: number;
  separationContactCoefficientOfRestitution: number;
  recoveryEnabled: boolean;
  recoveryDelay: number;
  recoveryInflationTime: number;
  recoveryDeploymentTrigger: RecoveryDeploymentTrigger;
  recoveryDeploymentAltitudeM: number;
  recoveryDeploymentTimeS: number;
  recoveryDiameter: number;
  recoveryReefingEnabled: boolean;
  recoveryReefingDurationS: number;
  recoveryReefingStartAreaFraction: number;
  sixDofIntegrationMethod: RigidBodyIntegrationMethod;
  normalForceModel: NormalForceModelKind;
  inducedDragModel: InducedDragModelKind;
  inducedDragFactor: number;
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
    diameterM,
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
        ...(stage.gimbalSchedule && stage.gimbalSchedule.length > 0
          ? {
              thrustAxisSchedule: stage.gimbalSchedule.map((point) => ({
                timeS: point.timeS,
                axisBody: stageThrustAxisWithGimbal(
                  stage,
                  instance.stageInstanceIndex,
                  point.pitchDeg,
                  point.yawDeg,
                ),
              })),
            }
          : {}),
        ...(stage.gimbalResponseTimeS !== undefined
          ? { gimbalResponseTimeS: stage.gimbalResponseTimeS }
          : {}),
        ...(stage.throttleSchedule && stage.throttleSchedule.length > 0
          ? {
              throttleSchedule: stage.throttleSchedule.map((point) => ({
                timeS: point.timeS,
                throttleFraction: point.throttleFraction,
              })),
            }
          : {}),
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
          ...(stage.separationImpulseBodyNs
            ? { separationImpulseBodyNs: stage.separationImpulseBodyNs }
            : {}),
        };
      });
    const stageRecoveryDevices = stage.recovery?.enabled && stage.role !== "payload"
      ? [
          {
            id: `${stage.id}-recovery`,
            name: `${stage.name} recovery canopy`,
            dragCoefficient: BROWSER_RECOVERY_DRAG_COEFFICIENT,
            referenceAreaM2: Math.PI * (stage.recovery.diameterM / 2) ** 2,
            deploymentDelayS: stage.recovery.deploymentDelayS,
            inflationTimeS: stage.recovery.inflationTimeS ?? 1.2,
          },
        ]
      : undefined;
    return {
      id: stage.id,
      name: stage.name,
      structuralMassProperties,
      motors,
      ...(physicalInstances.length > 1 ? { instances: physicalInstances } : {}),
      separationDeltaVBodyMps: stage.separationDeltaVBodyMps ?? 0,
      ...(stage.separationImpulseBodyNs
        ? { separationImpulseBodyNs: stage.separationImpulseBodyNs }
        : {}),
      ...(stageRecoveryDevices ? {
        recoveryDevices: stageRecoveryDevices,
        recoveryDeploymentTrigger: stage.recovery?.deploymentTrigger ?? "apogee",
        recoveryDeploymentAltitudeAglM: stage.recovery?.deploymentAltitudeAglM ?? 150,
        recoveryDeploymentTimeS: stage.recovery?.deploymentTimeS ?? 8,
      } : {}),
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
      normalForceModel,
      inducedDragModel,
      inducedDragFactor,
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
      ...(plan?.separationImpulseBodyNs
        ? { separationImpulseBodyNs: plan.separationImpulseBodyNs }
        : {}),
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
          inflationTimeS: recoveryInflationTime,
          reefingStages: createBrowserRecoveryReefingStages({
            recoveryReefingEnabled,
            recoveryReefingDurationS,
            recoveryReefingStartAreaFraction,
          }),
        },
      ]
    : [];
  if (recoveryDevices.length > 0) {
    if (recoveryDeploymentTrigger === "time") {
      events.push(createScheduledRecoveryDeploymentEvent({
        deviceId: "main",
        timeS: recoveryDeploymentTimeS,
        label: `Main recovery command at ${recoveryDeploymentTimeS.toFixed(2)} s`,
      }));
    } else {
      stateEvents.push(recoveryDeploymentTrigger === "altitude"
        ? createAltitudeRecoveryDeploymentEvent({
            deviceId: "main",
            altitudeAglM: recoveryDeploymentAltitudeM,
            direction: "falling",
            label: `Main recovery command on descent through ${recoveryDeploymentAltitudeM.toFixed(0)} m AGL`,
          })
        : createApogeeRecoveryDeploymentEvent({
            deviceId: "main",
            label: "Main recovery command after apogee",
          }));
    }
  }
  const relativeAeroInteraction: RelativeAeroInteractionOptions = {
    enabled: relativeAeroInteractionEnabled,
    wakeHalfAngleDeg: relativeAeroWakeHalfAngleDeg,
    wakeRecoveryDistanceBodyDiameters: relativeAeroWakeRecoveryDistanceBodyDiameters,
    peakVelocityDeficitFraction: relativeAeroPeakVelocityDeficitFraction,
    maximumVelocityDeficitFraction: relativeAeroMaximumVelocityDeficitFraction,
  };
  return {
    retainedMassProperties,
    components,
    stages,
    missionSerialStageIds: stages
      .filter((stage) => stageById.get(stage.id)?.attachment !== "parallel")
      .map((stage) => stage.id),
    regimes,
    initiallyIgnitedStageIds,
    durationS: Math.max(12, maximumMotorBurnDurationS * (stages.length + 2) + 8),
    timeStepS: 0.02,
    integration: { method: sixDofIntegrationMethod },
    environmentAt,
    alwaysActiveGeometryStageIds: [...geometryStageIds],
    separationTransitionWindowS: 0.2,
    launchRail: launchRailEnabled
      ? {
          directionWorld: launchRailDirectionFromAngles(launchRailInclinationDeg, launchRailAzimuthDeg),
          lengthM: launchRailLengthM,
          guideFrictionAccelerationMps2: launchRailFrictionAccelerationMps2,
          tipOffAngularVelocityBodyRadS: {
            x: 0,
            y: (launchRailTipOffPitchRateDegS * Math.PI) / 180,
            z: (launchRailTipOffYawRateDegS * Math.PI) / 180,
          },
        }
      : undefined,
    launchRailMaximumSteps: 250_000,
    initialState,
    events,
    stateEvents,
    recoveryDevices,
    separationEnvelopeRadiiM,
    coupledMultiBodyGravity: coupledMutualGravityEnabled
      ? {
          enabled: true,
          softeningRadiusM: coupledGravitySofteningRadiusM,
        }
      : ({ enabled: false } satisfies CoupledMultiBodyGravityOptions),
    coupledMultiBodyContact: coupledContactEnabled
      ? {
          enabled: true,
          stiffnessNPerM: coupledContactStiffnessNPerM,
          dampingNsPerM: coupledContactDampingNsPerM,
          maximumNormalForceN: coupledContactMaximumNormalForceN,
        }
      : ({ enabled: false } satisfies CoupledMultiBodyContactOptions),
    releasedBodyDragModel,
    relativeAeroInteraction,
    separationContactLoad: {
      stoppingDistanceM: separationContactStoppingDistanceM,
      coefficientOfRestitution: separationContactCoefficientOfRestitution,
    },
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
  windProfileLayers,
  relativeHumidityPercent,
  surfacePressureHpa,
  surfaceTemperatureC,
  recoveryEnabled,
  recoveryDelay,
  recoveryInflationTime,
  recoveryDeploymentTrigger,
  recoveryDeploymentAltitudeM,
  recoveryDeploymentTimeS,
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
  windProfileLayers?: readonly ProjectWindLayer[];
  relativeHumidityPercent: number;
  surfacePressureHpa: number;
  surfaceTemperatureC: number;
  recoveryEnabled: boolean;
  recoveryDelay: number;
  recoveryInflationTime: number;
  recoveryDeploymentTrigger: RecoveryDeploymentTrigger;
  recoveryDeploymentAltitudeM: number;
  recoveryDeploymentTimeS: number;
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
      inflationTimeS: recoveryInflationTime,
      deploymentTrigger: recoveryDeploymentTrigger,
      deploymentAltitudeAglM: recoveryDeploymentAltitudeM,
      deploymentTimeS: recoveryDeploymentTimeS,
      reefingStages: createBrowserRecoveryReefingStages({
        recoveryReefingEnabled,
        recoveryReefingDurationS,
        recoveryReefingStartAreaFraction,
      }),
    },
    environment: {
      launchAltitudeM: launchAltitude,
      windProfile: windProfileLayers && windProfileLayers.length > 0
        ? windProfileLayers.map((layer) => ({ ...layer }))
        : createPreviewWindProfile(windSpeed, {
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
            key: "recoveryInflationTimeScale" as const,
            label: "Recovery inflation time",
            distribution: { kind: "triangular" as const, minimum: 0.7, mode: 1, maximum: 1.4 },
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
                    { key: "recoveryInflationTimeScale" as const, label: "Recovery inflation time", distribution: { kind: "triangular" as const, minimum: 0.7, mode: 1, maximum: 1.4 } },
                    { key: "recoveryDeploymentSuccess" as const, label: "Recovery deployment", distribution: { kind: "bernoulli" as const, successProbability: inputs.recoveryDeploymentSuccessProbability } },
                    { key: "recoveryDelayS" as const, label: "Recovery delay offset", distribution: { kind: "normal" as const, mean: 0, standardDeviation: 0.18, minimum: -0.3, maximum: 0.5 } },
                  ]
                : []),
            ],
            correlations: filterUncertaintyCorrelations(
              inputs.uncertaintyCorrelations ?? [],
              ["dryMassScale", "propellantMassScale", "dragCoefficientScale", "thrustScale", "windScale", ...(inputs.recoveryEnabled ? ["recoveryDragAreaScale", "recoveryInflationTimeScale", "recoveryDeploymentSuccess", "recoveryDelayS"] : [])],
            ),
          },
        }
      : {}),
  });
}

type LandingPredictionInputs = Parameters<typeof createFlightConfig>[0] & Readonly<{
  launchSiteName: string;
  launchLatitudeDeg: number;
  launchLongitudeDeg: number;
  terrainModel: ProjectTerrainModel;
  terrainEastSlopePercent: number;
  terrainNorthSlopePercent: number;
  earthRotationEnabled?: boolean;
  normalGravityEnabled?: boolean;
  turbulenceScale: number;
  weatherSeed: string;
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
    name: inputs.launchSiteName,
    latitudeDeg: inputs.launchLatitudeDeg,
    longitudeDeg: inputs.launchLongitudeDeg,
    elevationM: inputs.launchAltitude,
    datum: "WGS84" as const,
    timeZone: "Pacific/Auckland",
  };
  const terrain: TerrainSurface = inputs.terrainModel === "planar"
    ? createPlanarTerrainSurface({
        name: "Planar local ENU terrain",
        eastSlope: inputs.terrainEastSlopePercent / 100,
        northSlope: inputs.terrainNorthSlopePercent / 100,
      })
    : createPlanarTerrainSurface({ name: "Flat launch surface" });
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
            key: "recoveryInflationTimeScale",
            label: "Canopy inflation time",
            distribution: { kind: "triangular" as const, minimum: 0.7, mode: 1, maximum: 1.4 },
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
    terrain,
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
          windProfileLayers: inputs.windProfileLayers,
          seed: `${inputs.weatherSeed}-landing-${sampleIndex}`,
          windScale: values.windScale,
          directionOffsetRad: values.windDirectionOffsetRad,
          // Keep the persisted Flight-inspector scale as the nominal envelope;
          // the landing analysis factor is a bounded scenario perturbation.
          turbulenceScale: inputs.turbulenceScale * values.turbulenceScale,
          earthRotationEnabled: inputs.earthRotationEnabled,
          normalGravityEnabled: inputs.normalGravityEnabled,
          relativeHumidityPercent: inputs.relativeHumidityPercent,
          surfacePressureHpa: inputs.surfacePressureHpa,
          surfaceTemperatureC: inputs.surfaceTemperatureC,
          siteName: inputs.launchSiteName,
          latitudeDeg: inputs.launchLatitudeDeg,
          longitudeDeg: inputs.launchLongitudeDeg,
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
        terrain,
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
              inflationTimeS:
                inputs.recoveryInflationTime * values.recoveryInflationTimeScale,
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

function nearestTraceSampleIndex(
  trace: readonly { timeS: number }[],
  targetTimeS: number,
): number {
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  trace.forEach((point, index) => {
    const distance = Math.abs(point.timeS - targetTimeS);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function FlightChart({
  result,
  selectedTimeS = null,
  onSelectionChange,
  copy,
}: {
  result: VerticalFlightResult;
  selectedTimeS?: number | null;
  onSelectionChange?: (timeS: number | null) => void;
  copy: UiCopy;
}) {
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
  const activeHoverIndex = selectedTimeS === null ? hoverIndex : nearestTraceSampleIndex(trace, selectedTimeS);
  const hoverPoint = activeHoverIndex === null ? null : trace[activeHoverIndex] ?? null;
  const scrubIndex = Math.min(Math.max(activeHoverIndex ?? 0, 0), Math.max(trace.length - 1, 0));

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

      if (activeHoverIndex !== null && coordinates[activeHoverIndex]) {
        const point = coordinates[activeHoverIndex]!;
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
  }, [activeHoverIndex, definition.color, definition.unit, maxTimeS, metric, result.events, trace]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (trace.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const paddingLeft = 60;
    const paddingRight = 60;
    const usableWidth = Math.max(1, bounds.width - paddingLeft - paddingRight);
    const normalizedX = Math.max(0, Math.min(1, (event.clientX - bounds.left - paddingLeft) / usableWidth));
    const targetTimeS = normalizedX * maxTimeS;
    const nearestIndex = nearestTraceSampleIndex(trace, targetTimeS);
    setHoverIndex(nearestIndex);
    onSelectionChange?.(null);
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
          onPointerLeave={() => { setHoverIndex(null); onSelectionChange?.(null); }}
        />
        {hoverPoint && (
          <div className="stage-flight-hover" aria-live="polite">
            <span>{definition.label}</span>
            <strong>{formatFlightMetric(flightMetricValue(hoverPoint, metric), metric)} {definition.unit}</strong>
            <small>t {hoverPoint.timeS.toFixed(2)} s · altitude {hoverPoint.altitudeAglM.toFixed(1)} m</small>
          </div>
        )}
      </div>
      <div className="stage-flight-profile-scrubber">
        <label htmlFor="vertical-flight-trace-scrubber">{copy.traceSample}</label>
        <input
          id="vertical-flight-trace-scrubber"
          type="range"
          min={0}
          max={Math.max(trace.length - 1, 0)}
          step={1}
          value={scrubIndex}
          aria-valuetext={hoverPoint ? `${copy.traceSample} ${scrubIndex + 1} ${copy.traceOf} ${trace.length}, ${hoverPoint.timeS.toFixed(2)} ${copy.traceSeconds}` : copy.traceNoSelection}
          onChange={(event) => { setHoverIndex(Number(event.target.value)); onSelectionChange?.(null); }}
        />
        <output aria-live="polite">
          {hoverPoint ? `t ${hoverPoint.timeS.toFixed(2)} s · ${formatFlightMetric(flightMetricValue(hoverPoint, metric), metric)} ${definition.unit}` : copy.traceNoSelection}
        </output>
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

function formatStageFlightComparisonValue(
  value: number | null,
  metric: StageFlightComparisonResult["metrics"][number],
): string {
  return value === null
    ? "—"
    : `${value.toFixed(metric.decimals)} ${metric.unit}`;
}

function formatStageFlightComparisonDelta(
  value: number | null,
  metric: StageFlightComparisonResult["metrics"][number],
): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(metric.decimals)} ${metric.unit}`;
}

function StageFlightComparisonCard({
  current,
  reference,
  referenceFingerprint,
  currentFingerprint,
  resultIsCurrent,
  running,
  onPin,
  onClear,
}: {
  current: StageFlightPreviewResult;
  reference: StageFlightPreviewResult | null;
  referenceFingerprint: string | null;
  currentFingerprint: string | null;
  resultIsCurrent: boolean;
  running: boolean;
  onPin: () => void;
  onClear: () => void;
}) {
  const exactReference = resultIsCurrent && reference !== null && referenceFingerprint !== null && referenceFingerprint === currentFingerprint;
  const currentLabel = resultIsCurrent ? "Current result" : "Last result / rerun required";
  const comparison = reference === null ? null : createStageFlightComparison(reference, current);
  return (
    <section className="flight-comparison-card stage-flight-run-comparison-card" aria-labelledby="stage-flight-run-comparison-title">
      <div className="flight-comparison-heading">
        <div>
          <span className="eyebrow">Coupled design delta</span>
          <h4 id="stage-flight-run-comparison-title">Staged run comparison</h4>
          <p>Pin a coupled or staged preview, change the vehicle or environment, then rerun to inspect the output delta without losing the original decision point.</p>
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
      {comparison ? (
        <>
          <div className="flight-comparison-table" role="table" aria-label="Coupled staged flight run comparison">
            <div className="flight-comparison-row flight-comparison-row-header" role="row">
              <span role="columnheader">Metric</span>
              <span role="columnheader">Reference</span>
              <span role="columnheader">{currentLabel}</span>
              <span role="columnheader">Delta</span>
            </div>
            {comparison.metrics.map((metric) => (
              <div className="flight-comparison-row" role="row" key={metric.key}>
                <span role="cell">{metric.label}</span>
                <span role="cell">{formatStageFlightComparisonValue(metric.reference, metric)}</span>
                <span role="cell">{formatStageFlightComparisonValue(metric.current, metric)}</span>
                <strong className={metric.delta === null ? "" : metric.delta > 0 ? "positive" : metric.delta < 0 ? "negative" : "neutral"} role="cell">
                  {formatStageFlightComparisonDelta(metric.delta, metric)}
                </strong>
              </div>
            ))}
          </div>
          <p className="flight-comparison-note">{comparison.warnings[0]} The delta is current minus reference; a stale result is labeled explicitly until the current inputs are simulated. This comparison does not add validation or flight-safety evidence.</p>
        </>
      ) : (
        <div className="flight-comparison-empty">
          <strong>Keep a staged design decision visible</strong>
          <span>Pin the current coupled preview before trying a stage, motor, separation, recovery, or environment change.</span>
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
  persistenceState,
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
  persistenceState: FlightDataPersistenceState;
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
          <p>Load a simple SI CSV log to inspect model residuals against measured altitude, velocity, or acceleration. Optional positive one-sigma columns add normalized residuals for uncertainty-aware review. Choose the vertical or coupled 6DOF trace; the imported log is kept locally in this browser.</p>
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
      {series && persistenceState !== "none" && (
        <div className={`flight-data-persistence flight-data-persistence-${persistenceState}`} role="status">
          {persistenceState === "restored"
            ? "Restored from this browser"
            : persistenceState === "saved"
              ? "Saved locally in this browser"
              : "Session-only · local browser storage is unavailable"}
        </div>
      )}
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
              <span role="columnheader">Normalized RMSE</span>
              <span role="columnheader">σ coverage</span>
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
                  <span role="cell">{summary.rootMeanSquareNormalizedResidual === null ? "Not supplied" : `${summary.rootMeanSquareNormalizedResidual.toFixed(2)} σ`}</span>
                  <span role="cell">{summary.uncertaintySampleCount > 0 ? `${(summary.uncertaintyCoverageFraction * 100).toFixed(0)}%` : "None"}</span>
                </div>
              );
            })}
          </div>
          {comparison.warnings.length > 0 && <div className="flight-data-warnings"><strong>Coverage notes</strong>{comparison.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
          <p className="flight-data-note">Residuals are simulated minus measured and use linear interpolation between trace samples. Normalized residuals divide by supplied one-sigma measurement uncertainty; they are diagnostic, not an acceptance test, validation, certification, or flight-safety evidence.</p>
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
            <span>{publicModelVersion(result.modelVersion)}</span>
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
  | "centerOfPressure"
  | "centerOfMass"
  | "staticMargin"
  | "attitudeTilt"
  | "angularRate"
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
  { key: "centerOfPressure", label: "CP", unit: "m", color: "#f8b84e" },
  { key: "centerOfMass", label: "CG", unit: "m", color: "#7dd3fc" },
  { key: "staticMargin", label: "Static margin", unit: "cal", color: "#58d68d" },
  { key: "attitudeTilt", label: "Attitude tilt", unit: "deg", color: "#fb7185" },
  { key: "angularRate", label: "Angular rate", unit: "deg/s", color: "#c084fc" },
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
  if (key === "centerOfPressure") return point.centerOfPressureXM ?? 0;
  if (key === "centerOfMass") return point.centerOfMassXM ?? 0;
  if (key === "staticMargin") return point.staticMarginCalibers ?? 0;
  if (key === "attitudeTilt") return ((point.attitudeTiltRad ?? 0) * 180) / Math.PI;
  if (key === "angularRate") return ((point.angularRateRadS ?? 0) * 180) / Math.PI;
  if (key === "mass") return point.massKg;
  return point.thrustN;
}

function stageFlightMetricUnavailable(
  point: StageFlightPreviewResult["trace"][number],
  key: StageFlightMetricKey,
): boolean {
  if (key === "centerOfPressure") return point.centerOfPressureXM === null || point.centerOfPressureXM === undefined;
  if (key === "centerOfMass") return point.centerOfMassXM === null || point.centerOfMassXM === undefined;
  if (key === "staticMargin") return point.staticMarginCalibers === null || point.staticMarginCalibers === undefined;
  if (key === "attitudeTilt") return point.attitudeTiltRad === null || point.attitudeTiltRad === undefined;
  if (key === "angularRate") return point.angularRateRadS === null || point.angularRateRadS === undefined;
  return false;
}

function formatStageFlightMetric(value: number, key: StageFlightMetricKey): string {
  if (key === "mass") return value.toFixed(3);
  if (key === "mach") return value.toFixed(3);
  if (key === "angleOfAttack" || key === "sideslip") return value.toFixed(2);
  if (key === "dynamicPressure") return value.toFixed(0);
  if (key === "recoveryArea") return value.toFixed(3);
  if (key === "centerOfPressure" || key === "centerOfMass" || key === "staticMargin") return value.toFixed(3);
  if (key === "attitudeTilt" || key === "angularRate") return value.toFixed(2);
  if (key === "aerodynamicMoment" || key === "aerodynamicDampingMoment") return value.toFixed(3);
  if (key === "thrust") return value.toFixed(1);
  if (key === "drag") return value.toFixed(1);
  return value.toFixed(1);
}

function formatStageFlightPointMetric(
  point: StageFlightPreviewResult["trace"][number],
  key: StageFlightMetricKey,
): string {
  return stageFlightMetricUnavailable(point, key)
    ? "Unavailable"
    : formatStageFlightMetric(stageFlightMetricValue(point, key), key);
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

function formatWorldVector(
  value: Readonly<{ x: number; y: number; z: number }> | null,
  decimals = 1,
): string {
  if (!value) return "Not assessed";
  return `(${value.x.toFixed(decimals)}, ${value.y.toFixed(decimals)}, ${value.z.toFixed(decimals)}) m/s`;
}

function formatVectorMagnitude(
  value: Readonly<{ deltaVMagnitudeMps: number }> | null,
  decimals = 1,
): string {
  return value === null ? "Not assessed" : `${value.deltaVMagnitudeMps.toFixed(decimals)} m/s`;
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

function StageFlightProfileChart({
  result,
  selectedTimeS = null,
  onSelectionChange,
  copy,
}: {
  result: StageFlightPreviewResult;
  selectedTimeS?: number | null;
  onSelectionChange?: (timeS: number | null) => void;
  copy: UiCopy;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [metric, setMetric] = useState<StageFlightMetricKey>("altitude");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const trace = result.trace;
  const definition = STAGE_FLIGHT_METRICS.find((item) => item.key === metric)!;
  const maxTimeS = Math.max(trace.at(-1)?.timeS ?? 0, 1);
  const metricValues = trace.map((point) => stageFlightMetricValue(point, metric));
  const peakValue = metricValues.length > 0 ? Math.max(...metricValues) : 0;
  const activeHoverIndex = selectedTimeS === null ? hoverIndex : nearestTraceSampleIndex(trace, selectedTimeS);
  const hoverPoint = activeHoverIndex === null ? null : trace[activeHoverIndex] ?? null;
  const scrubIndex = Math.min(Math.max(activeHoverIndex ?? 0, 0), Math.max(trace.length - 1, 0));
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

      if (activeHoverIndex !== null && coordinates[activeHoverIndex]) {
        const point = coordinates[activeHoverIndex]!;
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
  }, [activeHoverIndex, definition.color, definition.unit, maxTimeS, metric, result.events, trace]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (trace.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const paddingLeft = 52;
    const paddingRight = 52;
    const usableWidth = Math.max(1, bounds.width - paddingLeft - paddingRight);
    const normalizedX = Math.max(0, Math.min(1, (event.clientX - bounds.left - paddingLeft) / usableWidth));
    const targetTimeS = normalizedX * maxTimeS;
    const nearestIndex = nearestTraceSampleIndex(trace, targetTimeS);
    setHoverIndex(nearestIndex);
    onSelectionChange?.(null);
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
          onPointerLeave={() => { setHoverIndex(null); onSelectionChange?.(null); }}
        />
        {hoverPoint && (
          <div className="stage-flight-hover" aria-live="polite">
            <span>{hoverPoint.timeS.toFixed(2)} s</span>
            <strong>{formatStageFlightPointMetric(hoverPoint, metric)} {definition.unit}</strong>
            <small>{hoverPoint.attachedStageIds.join(" + ") || "No attached stage"}</small>
          </div>
        )}
      </div>
      <div className="stage-flight-profile-scrubber">
        <label htmlFor="stage-flight-trace-scrubber">{copy.traceSample}</label>
        <input
          id="stage-flight-trace-scrubber"
          type="range"
          min={0}
          max={Math.max(trace.length - 1, 0)}
          step={1}
          value={scrubIndex}
          aria-valuetext={hoverPoint ? `${copy.traceSample} ${scrubIndex + 1} ${copy.traceOf} ${trace.length}, ${hoverPoint.timeS.toFixed(2)} ${copy.traceSeconds}` : copy.traceNoSelection}
          onChange={(event) => { setHoverIndex(Number(event.target.value)); onSelectionChange?.(null); }}
        />
        <output aria-live="polite">
          {hoverPoint ? `t ${hoverPoint.timeS.toFixed(2)} s · ${formatStageFlightPointMetric(hoverPoint, metric)} ${definition.unit}` : copy.traceNoSelection}
        </output>
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

function MotorThrustCurveChart({ record }: { record: MotorDataRecord }) {
  const width = 620;
  const height = 232;
  const padding = { left: 46, right: 20, top: 24, bottom: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = record.thrustCurve;
  const maximumTime = Math.max(points.at(-1)?.timeS ?? 1, 1e-9);
  const maximumThrust = Math.max(...points.map((point) => point.thrustN), 1e-9);
  const xFor = (value: number) => padding.left + (value / maximumTime) * plotWidth;
  const yFor = (value: number) => padding.top + (1 - value / maximumThrust) * plotHeight;
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(point.timeS).toFixed(2)} ${yFor(point.thrustN).toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${xFor(points.at(-1)?.timeS ?? maximumTime).toFixed(2)} ${yFor(0).toFixed(2)} L${xFor(points[0]?.timeS ?? 0).toFixed(2)} ${yFor(0).toFixed(2)} Z`;
  const peak = points.reduce((candidate, point) => point.thrustN > candidate.thrustN ? point : candidate, points[0]!);
  const sourceStatus = record.provenance.validationStatus === "certified-test-data" ? "SOURCE-LABELED" : "REVIEW REQUIRED";
  return (
    <section className="motor-performance" aria-labelledby="motor-performance-title">
      <div className="motor-performance-heading">
        <div>
          <span className="eyebrow">Performance view</span>
          <h3 id="motor-performance-title">Thrust profile</h3>
          <p>{record.manufacturer} - {record.designation}. The curve is linearly interpolated for the preview and integrated with the trapezoidal rule; this view does not certify a motor or reproduce its test conditions.</p>
        </div>
        <span className={`motor-performance-status ${record.provenance.validationStatus === "certified-test-data" ? "source" : "review"}`}>{sourceStatus}</span>
      </div>
      <div className="motor-performance-metrics">
        <div><span>Impulse</span><strong>{record.metrics.totalImpulseNs.toFixed(1)} <small>N s</small></strong></div>
        <div><span>Peak thrust</span><strong>{record.metrics.peakThrustN.toFixed(1)} <small>N</small></strong></div>
        <div><span>Burn time</span><strong>{record.metrics.burnDurationS.toFixed(2)} <small>s</small></strong></div>
        <div><span>Specific impulse</span><strong>{record.metrics.specificImpulseS.toFixed(1)} <small>s</small></strong></div>
      </div>
      <div className="motor-performance-plot" role="img" aria-label={`${record.designation} thrust from ignition to burnout`}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <title>{record.designation} thrust curve</title>
          <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} />
          <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} />
          <line className="motor-performance-zero" x1={padding.left} y1={yFor(0)} x2={width - padding.right} y2={yFor(0)} />
          <path className="motor-performance-area" d={areaPath} />
          <path className="motor-performance-line" d={linePath} />
          <circle className="motor-performance-peak" cx={xFor(peak.timeS)} cy={yFor(peak.thrustN)} r="3" />
          <text x={padding.left} y={13}>{maximumThrust.toFixed(1)} N</text>
          <text x={padding.left} y={height - padding.bottom + 19}>0 s</text>
          <text x={width - padding.right} y={height - padding.bottom + 19} textAnchor="end">{maximumTime.toFixed(2)} s</text>
          <text x={xFor(peak.timeS)} y={Math.max(18, yFor(peak.thrustN) - 9)} textAnchor="middle">peak</text>
        </svg>
      </div>
      <small className="motor-performance-note">{record.massFlowHistoryKgS ? "Measured mass-flow history is retained separately from thrust and is not inferred from this curve. " : "No measured mass-flow history is attached. "}{record.provenance.sourceName} / {record.provenance.licenseIdentifier} / {record.provenance.validationStatus}</small>
    </section>
  );
}

function AerodynamicPolarChart({ model }: { model: AerodynamicCoefficientTableModel }) {
  const [mach, setMach] = useState(() => 0.5 * (model.machRange[0] + model.machRange[1]));
  const reynoldsLogMinimum = Math.log10(model.reynoldsRange[0]);
  const reynoldsLogMaximum = Math.log10(model.reynoldsRange[1]);
  const [reynoldsLog10, setReynoldsLog10] = useState(() => 0.5 * (reynoldsLogMinimum + reynoldsLogMaximum));
  const sideslipRangeRad = model.sideslipRangeRad ?? [(-5 * Math.PI) / 180, (5 * Math.PI) / 180];
  const [sideslipDeg, setSideslipDeg] = useState(() => {
    const defaultRad = Math.max(sideslipRangeRad[0], Math.min(sideslipRangeRad[1], 0));
    return (defaultRad * 180) / Math.PI;
  });
  const boundedMach = Math.max(model.machRange[0], Math.min(model.machRange[1], mach));
  const boundedReynoldsLog10 = Math.max(reynoldsLogMinimum, Math.min(reynoldsLogMaximum, reynoldsLog10));
  const boundedSideslipDeg = Math.max((sideslipRangeRad[0] * 180) / Math.PI, Math.min((sideslipRangeRad[1] * 180) / Math.PI, sideslipDeg));
  const polarState = useMemo<{ result: AerodynamicPolarResult | null; error: string }>(() => {
    try {
      return {
        result: sampleAerodynamicPolar(model, {
          mach: boundedMach,
          reynoldsNumber: 10 ** boundedReynoldsLog10,
          sideslipRad: (boundedSideslipDeg * Math.PI) / 180,
        }),
        error: "",
      };
    } catch (error) {
      return {
        result: null,
        error: error instanceof Error ? error.message : "Unable to sample aerodynamic polar.",
      };
    }
  }, [boundedMach, boundedReynoldsLog10, boundedSideslipDeg, model]);
  const polar = polarState.result;
  const width = 620;
  const height = 230;
  const padding = { left: 42, right: 20, top: 22, bottom: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const series = [
    { id: "normal", label: "Normal coefficient", color: "#2f9fff", read: (point: AerodynamicPolarResult["points"][number]) => point.normalForceCoefficient },
    { id: "drag", label: "Drag coefficient", color: "#ff9b6a", read: (point: AerodynamicPolarResult["points"][number]) => point.dragCoefficient },
  ] as const;
  const allValues = polar ? series.flatMap((entry) => polar.points.map(entry.read)) : [];
  const minimumY = allValues.length > 0 ? Math.min(...allValues) : -1;
  const maximumY = allValues.length > 0 ? Math.max(...allValues) : 1;
  const yPadding = Math.max((maximumY - minimumY) * 0.12, 0.05);
  const yMinimum = minimumY - yPadding;
  const yMaximum = maximumY + yPadding;
  const xMinimum = polar?.points[0]?.angleOfAttackRad ?? -0.2;
  const xMaximum = polar?.points.at(-1)?.angleOfAttackRad ?? 0.2;
  const xFor = (value: number) => padding.left + ((value - xMinimum) / Math.max(xMaximum - xMinimum, 1e-9)) * plotWidth;
  const yFor = (value: number) => padding.top + (1 - (value - yMinimum) / Math.max(yMaximum - yMinimum, 1e-9)) * plotHeight;
  const pathFor = (read: (point: AerodynamicPolarResult["points"][number]) => number) =>
    polar?.points.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(point.angleOfAttackRad).toFixed(2)} ${yFor(read(point)).toFixed(2)}`).join(" ") ?? "";
  return (
    <section className="aerodynamic-polar" aria-labelledby="aerodynamic-polar-title">
      <div className="aerodynamic-polar-heading">
        <div>
          <span className="eyebrow">Coefficient polar</span>
          <h4 id="aerodynamic-polar-title">Angle-of-attack response</h4>
          <p>Sampled at fixed Mach, Reynolds number, and sideslip. The chart shows the supplied direct force volume when available, otherwise the declared small-angle proxy.</p>
        </div>
        <span className={`uncertainty-status uncertainty-status-${polar?.status ?? "not-assessed"}`}>{polar?.status === "assessed" ? "SAMPLED" : polar?.status === "review" ? "DOMAIN REVIEW" : "NOT ASSESSED"}</span>
      </div>
      <div className="aerodynamic-polar-controls">
        <label htmlFor="aerodynamic-polar-mach">Mach <input id="aerodynamic-polar-mach" type="range" min={model.machRange[0]} max={model.machRange[1]} step="0.01" value={boundedMach} onChange={(event) => setMach(Number(event.target.value))} /><output>{boundedMach.toFixed(2)}</output></label>
        <label htmlFor="aerodynamic-polar-reynolds">log10 Reynolds <input id="aerodynamic-polar-reynolds" type="range" min={reynoldsLogMinimum} max={reynoldsLogMaximum} step="0.01" value={boundedReynoldsLog10} onChange={(event) => setReynoldsLog10(Number(event.target.value))} /><output>{boundedReynoldsLog10.toFixed(2)}</output></label>
        <label htmlFor="aerodynamic-polar-sideslip">Sideslip (deg) <input id="aerodynamic-polar-sideslip" type="range" min={(sideslipRangeRad[0] * 180) / Math.PI} max={(sideslipRangeRad[1] * 180) / Math.PI} step="0.1" value={boundedSideslipDeg} onChange={(event) => setSideslipDeg(Number(event.target.value))} /><output>{boundedSideslipDeg.toFixed(1)}°</output></label>
      </div>
      {polarState.error ? (
        <p className="aerodynamic-polar-error" role="alert">{polarState.error}</p>
      ) : (
        <div className="aerodynamic-polar-plot" role="img" aria-label="Aerodynamic normal and drag coefficient polar">
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <title>Normal and drag coefficient by angle of attack</title>
            <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} />
            <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} />
            {polar && yMinimum < 0 && yMaximum > 0 && <line className="aerodynamic-polar-zero" x1={padding.left} y1={yFor(0)} x2={width - padding.right} y2={yFor(0)} />}
            {polar && xMinimum < 0 && xMaximum > 0 && <line className="aerodynamic-polar-zero" x1={xFor(0)} y1={padding.top} x2={xFor(0)} y2={height - padding.bottom} />}
            <text x={padding.left} y={13}>{yMaximum.toFixed(2)}</text>
            <text x={padding.left} y={height - padding.bottom + 19}>{yMinimum.toFixed(2)}</text>
            <text x={padding.left} y={height - 7}>α {((xMinimum * 180) / Math.PI).toFixed(0)}°</text>
            <text x={width - padding.right} y={height - 7} textAnchor="end">{((xMaximum * 180) / Math.PI).toFixed(0)}°</text>
            {polar && series.map((entry) => <path key={entry.id} d={pathFor(entry.read)} stroke={entry.color} />)}
          </svg>
          <div className="aerodynamic-polar-legend">{series.map((entry) => <span key={entry.id}><i style={{ background: entry.color }} />{entry.label}</span>)}</div>
        </div>
      )}
      {polar?.warnings[0] && <p className="aerodynamic-polar-note">{polar.warnings[0]}</p>}
      <small className="aerodynamic-polar-model">{polar ? `${publicModelVersion(polar.modelVersion)} / table ${publicModelVersion(polar.tableModelVersion)}` : "Polar sampling unavailable"}</small>
    </section>
  );
}

function AerodynamicTableInspector({ table }: { table: AerodynamicCoefficientTableDefinition }) {
  const availableSurfaces = AERODYNAMIC_INSPECTOR_SURFACES.filter(
    (definition) => definition.read(table) !== undefined,
  );
  const [surfaceId, setSurfaceId] = useState<AerodynamicInspectorSurfaceId>("dragCoefficient");
  const selectedSurface = availableSurfaces.find((definition) => definition.id === surfaceId) ?? availableSurfaces[0];
  const tableModel = useMemo(() => createAerodynamicCoefficientTable(table), [table]);
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
      <AerodynamicPolarChart model={tableModel} />
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
  const [selectedTopologyComponentId, setSelectedTopologyComponentId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
  const [view, setView] = useState<ViewKey>("design");
  const [designView, setDesignView] = useState<DesignViewKey>(() => createDefaultUiPreferences().designView);
  const [designAzimuthDeg, setDesignAzimuthDeg] = useState(() => createDefaultUiPreferences().designAzimuthDeg);
  const [reducedMotion, setReducedMotion] = useState(() => createDefaultUiPreferences().reducedMotion);
  const [highContrast, setHighContrast] = useState(() => createDefaultUiPreferences().highContrast);
  const [locale, setLocale] = useState<UiLocale>(() => createDefaultUiPreferences().locale);
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
  const [launchSiteName, setLaunchSiteName] = useState("ARC 54 synthetic range");
  const [launchLatitudeDeg, setLaunchLatitudeDeg] = useState(-36.85);
  const [launchLongitudeDeg, setLaunchLongitudeDeg] = useState(174.76);
  const [launchAltitude, setLaunchAltitude] = useState(80);
  const [earthRotationEnabled, setEarthRotationEnabled] = useState(false);
  const [normalGravityEnabled, setNormalGravityEnabled] = useState(false);
  const [normalForceModel, setNormalForceModel] = useState<NormalForceModelKind>("low-speed");
  const [inducedDragModel, setInducedDragModel] = useState<InducedDragModelKind>("disabled");
  const [inducedDragFactor, setInducedDragFactor] = useState(0);
  const [terrainModel, setTerrainModel] = useState<ProjectTerrainModel>("flat");
  const [terrainEastSlopePercent, setTerrainEastSlopePercent] = useState(0);
  const [terrainNorthSlopePercent, setTerrainNorthSlopePercent] = useState(0);
  const [windSpeed, setWindSpeed] = useState(4);
  const [windAzimuthDeg, setWindAzimuthDeg] = useState(0);
  const [windProfileLayers, setWindProfileLayers] = useState<ProjectWindLayer[]>([]);
  const [turbulenceScale, setTurbulenceScale] = useState(1);
  const [weatherSeed, setWeatherSeed] = useState(DEFAULT_WEATHER_SEED);
  const [relativeHumidityPercent, setRelativeHumidityPercent] = useState(60);
  const [surfacePressureHpa, setSurfacePressureHpa] = useState(1004);
  const [surfaceTemperatureC, setSurfaceTemperatureC] = useState(15);
  const [launchRailEnabled, setLaunchRailEnabled] = useState(true);
  const [launchRailLengthM, setLaunchRailLengthM] = useState(1.2);
  const [launchRailInclinationDeg, setLaunchRailInclinationDeg] = useState(0);
  const [launchRailAzimuthDeg, setLaunchRailAzimuthDeg] = useState(0);
  const [launchRailFrictionAccelerationMps2, setLaunchRailFrictionAccelerationMps2] = useState(0);
  const [launchRailTipOffPitchRateDegS, setLaunchRailTipOffPitchRateDegS] = useState(0);
  const [launchRailTipOffYawRateDegS, setLaunchRailTipOffYawRateDegS] = useState(0);
  const [coupledMutualGravityEnabled, setCoupledMutualGravityEnabled] = useState(false);
  const [coupledGravitySofteningRadiusM, setCoupledGravitySofteningRadiusM] = useState(0.02);
  const [coupledContactEnabled, setCoupledContactEnabled] = useState(false);
  const [coupledContactStiffnessNPerM, setCoupledContactStiffnessNPerM] = useState(50_000);
  const [coupledContactDampingNsPerM, setCoupledContactDampingNsPerM] = useState(100);
  const [coupledContactMaximumNormalForceN, setCoupledContactMaximumNormalForceN] = useState(1_000_000);
  const [releasedBodyDragModel, setReleasedBodyDragModel] = useState<ReleasedBodyDragModel>("isotropic-point");
  const [relativeAeroInteractionEnabled, setRelativeAeroInteractionEnabled] = useState(true);
  const [relativeAeroWakeHalfAngleDeg, setRelativeAeroWakeHalfAngleDeg] = useState(8);
  const [relativeAeroWakeRecoveryDistanceBodyDiameters, setRelativeAeroWakeRecoveryDistanceBodyDiameters] = useState(30);
  const [relativeAeroPeakVelocityDeficitFraction, setRelativeAeroPeakVelocityDeficitFraction] = useState(0.5);
  const [relativeAeroMaximumVelocityDeficitFraction, setRelativeAeroMaximumVelocityDeficitFraction] = useState(0.7);
  const [separationContactStoppingDistanceM, setSeparationContactStoppingDistanceM] = useState(0.01);
  const [separationContactCoefficientOfRestitution, setSeparationContactCoefficientOfRestitution] = useState(0);
  const [sixDofIntegrationMethod, setSixDofIntegrationMethod] = useState<RigidBodyIntegrationMethod>("fixed-rk4");
  const [recoveryEnabled, setRecoveryEnabled] = useState(true);
  const [recoveryDelay, setRecoveryDelay] = useState(0);
  const [recoveryInflationTime, setRecoveryInflationTime] = useState(1.2);
  const [recoveryDeploymentTrigger, setRecoveryDeploymentTrigger] = useState<RecoveryDeploymentTrigger>("apogee");
  const [recoveryDeploymentAltitudeM, setRecoveryDeploymentAltitudeM] = useState(150);
  const [recoveryDeploymentTimeS, setRecoveryDeploymentTimeS] = useState(8);
  const [recoveryDiameter, setRecoveryDiameter] = useState(0.45);
  const [recoveryMass, setRecoveryMass] = useState(0.06);
  const [recoveryDeploymentSuccessProbability, setRecoveryDeploymentSuccessProbability] = useState(0.9);
  const [recoveryReefingEnabled, setRecoveryReefingEnabled] = useState(false);
  const [recoveryReefingDurationS, setRecoveryReefingDurationS] = useState(3);
  const [recoveryReefingStartAreaFraction, setRecoveryReefingStartAreaFraction] = useState(0.35);
  const [customMaterial, setCustomMaterial] = useState<CustomMaterialProfile>(DEFAULT_CUSTOM_MATERIAL_PROFILE);
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
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const accessibilityCloseRef = useRef<HTMLButtonElement>(null);
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
  const [componentLibraryOpen, setComponentLibraryOpen] = useState(false);
  const componentLibraryCloseRef = useRef<HTMLButtonElement>(null);
  const [componentRecords, setComponentRecords] = useState<LocalComponentRecord[]>([]);
  const [componentPresetDraft, setComponentPresetDraft] = useState<ComponentPresetDraft>(defaultComponentPresetDraft);
  const [componentImportJson, setComponentImportJson] = useState("");
  const [componentError, setComponentError] = useState("");
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
  const uiPreferenceWriteFailedRef = useRef(false);
  const [storageReady, setStorageReady] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");
  const uiCopy = getUiCopy(locale);
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };
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
      ...(material === "custom" ? { customMaterial } : {}),
      thrustN: thrust,
      burnTimeS: burnTime,
      dragCoefficient,
      launchSiteName,
      launchLatitudeDeg,
      launchLongitudeDeg,
      launchAltitudeM: launchAltitude,
      earthRotationEnabled,
      normalGravityEnabled,
      normalForceModel,
      inducedDragModel,
      inducedDragFactor,
      terrainModel,
      terrainEastSlopePercent,
      terrainNorthSlopePercent,
      windSpeedMps: windSpeed,
      windAzimuthDeg,
      windProfileLayers,
      turbulenceScale,
      weatherSeed,
      relativeHumidityPercent,
      surfacePressureHpa,
      surfaceTemperatureC,
      launchRailEnabled,
      launchRailLengthM,
      launchRailInclinationDeg,
      launchRailAzimuthDeg,
      launchRailFrictionAccelerationMps2,
      launchRailTipOffPitchRateDegS,
      launchRailTipOffYawRateDegS,
      recoveryEnabled,
      recoveryDelayS: recoveryDelay,
      recoveryInflationTimeS: recoveryInflationTime,
      recoveryDeploymentTrigger,
      recoveryDeploymentAltitudeM,
      recoveryDeploymentTimeS,
      recoveryDiameterM: recoveryDiameter,
      recoveryMassKg: recoveryMass,
      recoveryDeploymentSuccessProbability,
      recoveryReefingEnabled,
      recoveryReefingDurationS,
      recoveryReefingStartAreaFraction,
      uncertaintySampleCount,
      uncertaintySeed,
      uncertaintyCorrelations,
      coupledMutualGravityEnabled,
      coupledGravitySofteningRadiusM,
      coupledContactEnabled,
      coupledContactStiffnessNPerM,
      coupledContactDampingNsPerM,
      coupledContactMaximumNormalForceN,
      releasedBodyDragModel,
      relativeAeroInteractionEnabled,
      relativeAeroWakeHalfAngleDeg,
      relativeAeroWakeRecoveryDistanceBodyDiameters,
      relativeAeroPeakVelocityDeficitFraction,
      relativeAeroMaximumVelocityDeficitFraction,
      separationContactStoppingDistanceM,
      separationContactCoefficientOfRestitution,
      sixDofIntegrationMethod,
    }),
    [burnTime, coupledContactDampingNsPerM, coupledContactEnabled, coupledContactMaximumNormalForceN, coupledContactStiffnessNPerM, coupledGravitySofteningRadiusM, coupledMutualGravityEnabled, customMaterial, diameter, dragCoefficient, earthRotationEnabled, finCount, finRootChord, finSpan, finSweep, finThickness, finTipChord, inducedDragFactor, inducedDragModel, launchAltitude, launchLatitudeDeg, launchLongitudeDeg, launchRailAzimuthDeg, launchRailEnabled, launchRailFrictionAccelerationMps2, launchRailInclinationDeg, launchRailLengthM, launchRailTipOffPitchRateDegS, launchRailTipOffYawRateDegS, launchSiteName, length, material, normalForceModel, normalGravityEnabled, noseLength, noseProfile, payloadMass, recoveryDelay, recoveryDeploymentAltitudeM, recoveryDeploymentTimeS, recoveryDeploymentTrigger, recoveryDeploymentSuccessProbability, recoveryDiameter, recoveryEnabled, recoveryInflationTime, recoveryMass, recoveryReefingDurationS, recoveryReefingEnabled, recoveryReefingStartAreaFraction, releasedBodyDragModel, relativeAeroInteractionEnabled, relativeAeroMaximumVelocityDeficitFraction, relativeAeroPeakVelocityDeficitFraction, relativeAeroWakeHalfAngleDeg, relativeAeroWakeRecoveryDistanceBodyDiameters, relativeHumidityPercent, separationContactCoefficientOfRestitution, separationContactStoppingDistanceM, sixDofIntegrationMethod, surfacePressureHpa, surfaceTemperatureC, terrainEastSlopePercent, terrainModel, terrainNorthSlopePercent, thrust, turbulenceScale, uncertaintyCorrelations, uncertaintySampleCount, uncertaintySeed, weatherSeed, windAzimuthDeg, windProfileLayers, windSpeed],
  );
  const initialInputsRef = useRef(editableInputs);
  const stageMotorMassKgById = useMemo(
    () => createStageMotorMassMap(vehicleTopology.stages, selectedMotorId, userMotorRecords),
    [selectedMotorId, userMotorRecords, vehicleTopology.stages],
  );
  const vehicleComponents = useMemo(
    () => {
      const coreStageId = vehicleTopology.stages[0]?.id ?? "sustainer";
      const baseComponents = makeDesignComponents({
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
        customMaterial,
        payloadMassKg: payloadMass,
        recoveryMassKg: recoveryMass,
        motorMassKg: stageMotorMassKgById[coreStageId] ?? 0.16,
      });
      return [
        ...baseComponents,
        ...(vehicleTopology.components ?? [])
          .filter((component) => component.stageId === coreStageId)
          .map(topologyComponentToVehicleComponent),
      ];
    },
    [customMaterial, diameter, finCount, finRootChord, finSpan, finSweep, finThickness, finTipChord, length, material, noseLength, noseProfile, payloadMass, recoveryMass, stageMotorMassKgById, vehicleTopology.components, vehicleTopology.stages],
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
      customMaterial,
      payloadMassKg: payloadMass,
      recoveryMassKg: recoveryMass,
      motorMassKgByStageId: stageMotorMassKgById,
    }, vehicleTopology.components ?? []),
    [customMaterial, diameter, finCount, finRootChord, finSpan, finSweep, finThickness, finTipChord, length, material, noseLength, noseProfile, payloadMass, recoveryMass, stageMotorMassKgById, vehicleComponents, vehicleTopology.components, vehicleTopology.stages],
  );
  const assemblyDefinition = useMemo(() => {
    const placements = createStagePlacements(vehicleTopology.stages, {
      lengthM: length / 1000,
      diameterM: diameter / 1000,
      noseLengthM: noseLength / 1000,
    });
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
        customMaterial,
        payloadMassKg: payloadMass,
        recoveryMassKg: recoveryMass,
        motorMassKgByStageId: stageMotorMassKgById,
      }, vehicleTopology.components ?? []);
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
  }, [customMaterial, diameter, finCount, finRootChord, finSpan, finSweep, finThickness, finTipChord, length, material, noseLength, noseProfile, payloadMass, recoveryMass, stageMotorMassKgById, vehicleComponents, vehicleTopology.components, vehicleTopology.stages]);
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
  const attachedAeroInterference = useMemo<AttachedAeroInterferenceResult>(() => {
    const bodies = createAttachedAeroReviewBodies({
      topology: vehicleTopology,
      assembly,
      componentCatalog: assemblyComponentCatalog,
      lengthM: length / 1000,
      diameterM: diameter / 1000,
      noseLengthM: noseLength / 1000,
    });
    return analyzeAttachedAeroInterference({ bodies });
  }, [assembly, assemblyComponentCatalog, diameter, length, noseLength, vehicleTopology]);
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
        analysisOptions: {
          coupledMultiBodyGravity: {
            enabled: coupledMutualGravityEnabled,
            softeningRadiusM: coupledGravitySofteningRadiusM,
          },
          coupledMultiBodyContact: {
            enabled: coupledContactEnabled,
            stiffnessNPerM: coupledContactStiffnessNPerM,
            dampingNsPerM: coupledContactDampingNsPerM,
            maximumNormalForceN: coupledContactMaximumNormalForceN,
          },
          releasedBodyDragModel,
          separationContactLoad: {
            stoppingDistanceM: separationContactStoppingDistanceM,
            coefficientOfRestitution: separationContactCoefficientOfRestitution,
          },
          sixDofIntegrationMethod,
        },
      }),
    [coupledContactDampingNsPerM, coupledContactEnabled, coupledContactMaximumNormalForceN, coupledContactStiffnessNPerM, coupledGravitySofteningRadiusM, coupledMutualGravityEnabled, editableInputs, previewMotor, releasedBodyDragModel, selectedAerodynamicTableDefinition, selectedAerodynamicTableId, selectedMotorId, separationContactCoefficientOfRestitution, separationContactStoppingDistanceM, sixDofIntegrationMethod, vehicleTopology],
  );
  const previewEnvironment = useMemo(
    () => createPreviewEnvironment(launchAltitude, windSpeed, { siteName: launchSiteName, latitudeDeg: launchLatitudeDeg, longitudeDeg: launchLongitudeDeg, windAzimuthDeg, windProfileLayers, turbulenceScale, earthRotationEnabled, normalGravityEnabled, seed: weatherSeed, relativeHumidityPercent, surfacePressureHpa, surfaceTemperatureC }),
    [earthRotationEnabled, launchAltitude, launchLatitudeDeg, launchLongitudeDeg, launchSiteName, normalGravityEnabled, relativeHumidityPercent, surfacePressureHpa, surfaceTemperatureC, turbulenceScale, weatherSeed, windAzimuthDeg, windProfileLayers, windSpeed],
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
      windProfileLayers,
      relativeHumidityPercent,
      surfacePressureHpa,
      surfaceTemperatureC,
      recoveryEnabled,
      recoveryDelay,
      recoveryInflationTime,
      recoveryDeploymentTrigger,
      recoveryDeploymentAltitudeM,
      recoveryDeploymentTimeS,
      recoveryDiameter,
      recoveryReefingEnabled,
      recoveryReefingDurationS,
      recoveryReefingStartAreaFraction,
      motorRecord: previewMotor,
      aerodynamicTable: selectedAerodynamicTable,
    }),
  );
  const [verticalConvergence, setVerticalConvergence] =
    useState<VerticalFlightConvergenceDiagnostic | null>(null);
  const [verticalConvergenceFingerprint, setVerticalConvergenceFingerprint] =
    useState<string | null>(null);
  const [lastRunFingerprint, setLastRunFingerprint] = useState<string | null>(
    () => simulationFingerprint,
  );
  const [comparisonReference, setComparisonReference] = useState<VerticalFlightResult | null>(null);
  const [comparisonReferenceFingerprint, setComparisonReferenceFingerprint] = useState<string | null>(null);
  const [selectedFlightEventTimeS, setSelectedFlightEventTimeS] = useState<number | null>(null);
  const [flightDataSeries, setFlightDataSeries] = useState<FlightDataSeries | null>(null);
  const [flightDataError, setFlightDataError] = useState("");
  const [flightDataPersistenceState, setFlightDataPersistenceState] = useState<FlightDataPersistenceState>("none");
  const [flightDataTimeOffsetS, setFlightDataTimeOffsetS] = useState(0);
  const [flightDataTraceSource, setFlightDataTraceSource] = useState<FlightDataTraceSource>("vertical-1d");
  const [stageFlightResult, setStageFlightResult] =
    useState<StageFlightPreviewResult | null>(null);
  const [stageFlightFingerprint, setStageFlightFingerprint] = useState<string | null>(
    null,
  );
  const [stageComparisonReference, setStageComparisonReference] =
    useState<StageFlightPreviewResult | null>(null);
  const [stageComparisonReferenceFingerprint, setStageComparisonReferenceFingerprint] =
    useState<string | null>(null);
  const [selectedStageEventTimeS, setSelectedStageEventTimeS] = useState<number | null>(null);
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
      windProfileLayers,
      relativeHumidityPercent,
      surfacePressureHpa,
      surfaceTemperatureC,
      recoveryEnabled,
      recoveryDelay,
      recoveryInflationTime,
      recoveryDeploymentTrigger,
      recoveryDeploymentAltitudeM,
      recoveryDeploymentTimeS,
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
          launchSiteName,
          launchLatitudeDeg,
          launchLongitudeDeg,
          launchAltitude,
          terrainModel,
          terrainEastSlopePercent,
          terrainNorthSlopePercent,
          windSpeed,
          windAzimuthDeg,
          windProfileLayers,
          turbulenceScale,
          weatherSeed,
          relativeHumidityPercent,
          surfacePressureHpa,
          surfaceTemperatureC,
          recoveryEnabled,
          recoveryDelay,
          recoveryInflationTime,
          recoveryDeploymentTrigger,
          recoveryDeploymentAltitudeM,
          recoveryDeploymentTimeS,
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
  const verticalConvergenceIsCurrent =
    verticalConvergence !== null &&
    isSimulationFingerprintCurrent(
      verticalConvergenceFingerprint,
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
      inflationTimeS: recoveryInflationTime,
      dragCoefficient: BROWSER_RECOVERY_DRAG_COEFFICIENT,
      referenceAreaM2: Math.PI * (recoveryDiameter / 2) ** 2,
    });
  }, [recoveryDelay, recoveryDiameter, recoveryEnabled, recoveryInflationTime, stageFlightIsCurrent, stageFlightResult, stageRecoveryCommandEvent]);
  const stageFlightTrajectorySeries = useMemo(() => {
    if (!stageFlightResult) return [];
    const retainedTrace = stageFlightResult.rail?.trace ?? stageFlightResult.simulation?.trace ?? [];
    const series = retainedTrace.length > 0
      ? [{ id: "retained-vehicle", label: "Retained vehicle", trace: retainedTrace, color: "#2f9fff" }]
      : [];
    const released = stageFlightResult.coupledMultiBodyFlight?.trajectories ?? [];
    return [
      ...series,
      ...released.map((trajectory, index) => ({
        id: trajectory.id,
        label: trajectory.label,
        trace: trajectory.trace,
        color: ["#ff7043", "#b58cff", "#45d6b0", "#e9c46a"][index % 4],
      })),
    ];
  }, [stageFlightResult]);
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
      material: resolveBrowserMaterialModel(material, customMaterial),
      flightResultCurrent: resultIsCurrent,
    });
  }, [customMaterial, flutterFlightCondition, mass, material, previewMotor, result.maxDynamicPressurePa, resultIsCurrent, staticStability.staticMarginCalibers, structuralBody, structuralFins]);
  const stageStructuralReview = useMemo<StageStructuralReviewResult>(() => {
    const stages = vehicleTopology.stages
      .filter((stage) => stage.enabled)
      .map((stage) => {
        const stageComponentsForFirstInstance = stageFlightComponents.filter((component) => {
          if (component.stageId !== stage.id) return false;
          return !/-instance-\d+$/.test(component.id) || /-instance-1$/.test(component.id);
        });
        const body = stageComponentsForFirstInstance.find(
          (component): component is Extract<VehicleComponent, { kind: "axisymmetric" }> => {
            const baseId = component.id.replace(/-instance-\d+$/, "");
            return component.kind === "axisymmetric" && (baseId === "body" || baseId.endsWith("-body"));
          },
        ) ?? null;
        const fins = stageComponentsForFirstInstance.find(
          (component): component is Extract<VehicleComponent, { kind: "finSet" }> => {
            const baseId = component.id.replace(/-instance-\d+$/, "");
            return component.kind === "finSet" && (baseId === "fins" || baseId.endsWith("-fins"));
          },
        ) ?? null;
        const stageInstances = assembly.componentInstances.filter(
          (instance) => instance.stageId === stage.id && instance.stageInstanceIndex === 0,
        );
        const totalMassKg = stageInstances.reduce(
          (total, instance) => total + instance.massProperties.massKg,
          0,
        );
        const motorInstances = stageInstances.filter(
          (instance) => instance.sourceComponentId === "motor" || instance.sourceComponentId.endsWith("-motor"),
        ).length;
        const stageMotor = userMotorRecords.find((record) => record.id === stage.motorId) ?? previewMotor;
        const peakThrustN = stage.role === "payload"
          ? 0
          : stageMotor.metrics.peakThrustN * Math.max(1, motorInstances);
        const instanceCount = stage.attachment === "parallel" ? stage.repeatCount : 1;
        if (!body) {
          return {
            id: stage.id,
            label: stage.name,
            role: stage.role,
            instanceCount,
            screen: null,
            unavailableReason: "No axisymmetric body geometry was available for the first physical instance.",
          };
        }
        if (!(totalMassKg > 0)) {
          return {
            id: stage.id,
            label: stage.name,
            role: stage.role,
            instanceCount,
            screen: null,
            unavailableReason: "No positive assembly mass was available for the first physical instance.",
          };
        }
        try {
          return {
            id: stage.id,
            label: stage.name,
            role: stage.role,
            instanceCount,
            screen: computeStructuralScreen({
              body,
              fins,
              totalMassKg,
              peakThrustN,
              maxDynamicPressurePa: result.maxDynamicPressurePa,
              maxAirspeedMps: flutterFlightCondition.maxAirspeedMps,
              flutterAtmosphere: flutterFlightCondition.atmosphere,
              flutterSafetyFactor: 1.25,
              staticMarginCalibers: stage.role === "core" ? staticStability.staticMarginCalibers : null,
              material: resolveBrowserMaterialModel(material, customMaterial),
              flightResultCurrent: resultIsCurrent,
            }),
          };
        } catch (error) {
          return {
            id: stage.id,
            label: stage.name,
            role: stage.role,
            instanceCount,
            screen: null,
            unavailableReason: error instanceof Error ? error.message : "The stage structural screen failed to evaluate.",
          };
        }
      });
    return createStageStructuralReview(stages);
  }, [assembly.componentInstances, customMaterial, flutterFlightCondition, material, previewMotor, result.maxDynamicPressurePa, resultIsCurrent, stageFlightComponents, staticStability.staticMarginCalibers, userMotorRecords, vehicleTopology.stages]);
  const stageInterfaceLoadReview = useMemo<StageInterfaceLoadResult>(() => {
    const stageById = new Map(vehicleTopology.stages.map((stage) => [stage.id, stage]));
    const isRetainedComponent = (instance: VehicleAssemblyEvaluation["componentInstances"][number]) =>
      instance.sourceComponentId === "recovery" || instance.sourceComponentId === "payload";
    const retainedMassKg = assembly.componentInstances.reduce((total, instance) => {
      const stage = stageById.get(instance.stageId);
      return stage?.role === "core" && isRetainedComponent(instance)
        ? total + instance.massProperties.massKg
        : total;
    }, 0);
    const stages = vehicleTopology.stages
      .filter((stage) => stage.enabled)
      .map((stage) => {
        const stageInstances = assembly.componentInstances.filter(
          (instance) => instance.stageId === stage.id,
        );
        const stageMassKg = stageInstances.reduce((total, instance) => {
          if (stage.role === "core" && isRetainedComponent(instance)) return total;
          return total + instance.massProperties.massKg;
        }, 0);
        const motorMountCount = stageInstances.filter(
          (instance) => instance.sourceComponentId === "motor" || instance.sourceComponentId.endsWith("-motor"),
        ).length;
        const stageMotor = userMotorRecords.find((record) => record.id === stage.motorId) ?? previewMotor;
        const structuralStage = stageStructuralReview.stages.find(
          (candidate) => candidate.id === stage.id,
        );
        const screen = structuralStage?.screen ?? null;
        return {
          id: stage.id,
          label: stage.name,
          parentStageId: stage.parentStageId ?? null,
          attachment: stage.attachment,
          repeatCount: stage.repeatCount,
          repeatRadiusM: stage.repeatRadiusM,
          thrustCantAngleDeg: stage.thrustCantAngleDeg,
          thrustCantAzimuthDeg: stage.thrustCantAzimuthDeg,
          stageMassKg,
          peakThrustN: stage.role === "payload"
            ? 0
            : stageMotor.metrics.peakThrustN * motorMountCount,
          sectionAreaM2: screen?.geometry.minimumSectionAreaM2 ?? null,
          allowableCompressionPa: screen?.material.allowableCompressionPa ?? null,
          requiredFactorOfSafety: screen?.loads.requiredFactorOfSafety ?? 1.5,
        };
      });
    const trace = stageFlightIsCurrent && stageFlightResult
      ? stageFlightResult.trace.map((point) => ({
          timeS: point.timeS,
          axialAccelerationMps2: point.axialAccelerationMps2,
          attachedStageIds: point.attachedStageIds,
        }))
      : undefined;
    return createStageInterfaceLoadReview({
      stages,
      retainedMassKg,
      ...(trace ? { trace } : {}),
    });
  }, [assembly.componentInstances, previewMotor, stageFlightIsCurrent, stageFlightResult, stageStructuralReview, userMotorRecords, vehicleTopology.stages]);
  const engineeringReview = useMemo<EngineeringDesignReviewResult>(() => {
    const stageFlightConfigured =
      vehicleTopology.stages.filter((stage) => stage.enabled).length > 1;
    return createEngineeringDesignReview({
      thrustToWeight:
        mass > 0
          ? previewMotor.metrics.peakThrustN / (mass * 9.80665)
          : null,
      staticMarginCalibers: staticStability.staticMarginCalibers,
      staticAerodynamicsModelVersion: staticStability.modelVersion,
      attachedAeroInterference,
      structural: structuralScreen,
      stageStructural: stageFlightConfigured ? stageStructuralReview : null,
      stageInterfaceLoads: stageFlightConfigured ? stageInterfaceLoadReview : null,
      stageMassRatio: stageFlightConfigured && stageFlightIsCurrent
        ? stageFlightResult?.massRatio ?? null
        : null,
      stageVectorBudget: stageFlightConfigured && stageFlightIsCurrent
        ? stageFlightResult?.vectorBudget ?? null
        : null,
      verticalFlightCurrent: resultIsCurrent,
      verticalFlightModelVersion: result.modelVersion,
      stageFlightConfigured,
      stageFlightCurrent: stageFlightResult === null ? null : stageFlightIsCurrent,
      stageFlightModelVersion: stageFlightResult?.modelVersion ?? null,
      stageEventAllocationStatus: stageFlightResult?.eventAllocation.status ?? null,
      stageConvergenceStatus: stageFlightResult?.convergence.status ?? null,
      separationImpulseReviewCount:
        stageFlightResult === null
          ? null
          : stageFlightResult.separationImpulseSolutions.filter(
              (solution) => solution.status !== "balanced",
            ).length,
    });
  }, [
    mass,
    previewMotor.metrics.peakThrustN,
    result.modelVersion,
    resultIsCurrent,
    stageFlightIsCurrent,
    stageFlightResult,
    attachedAeroInterference,
    stageInterfaceLoadReview,
    staticStability.modelVersion,
    staticStability.staticMarginCalibers,
    structuralScreen,
    stageStructuralReview,
    vehicleTopology.stages,
  ]);

  const selectedComponent = components.find((component) => component.id === selected)!;
  const topologyStageParts = useMemo(
    () => createCadStageParts(vehicleTopology.stages, {
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
    }),
    [diameter, finCount, finRootChord, finSpan, finSweep, finThickness, finTipChord, length, noseLength, noseProfile, vehicleTopology.stages],
  );
  const topologyComponentMarkers = useMemo(() => {
    const placements = createStagePlacements(vehicleTopology.stages, {
      lengthM: length / 1000,
      diameterM: diameter / 1000,
      noseLengthM: noseLength / 1000,
    });
    const placementByStageId = new Map(placements.map((placement) => [placement.stage.id, placement]));
    return vehicleTopology.components.flatMap((component) => {
      if (!component.enabled) return [];
      const placement = placementByStageId.get(component.stageId);
      if (!placement || !placement.stage.enabled) return [];
      return Array.from({ length: placement.instanceCount }, (_, instanceIndex) => {
        const instanceAngle = placement.stage.attachment === "parallel"
          ? (instanceIndex * 2 * Math.PI) / Math.max(placement.instanceCount, 1)
          : 0;
        const componentAzimuthRad = (component.azimuthDeg * Math.PI) / 180 + instanceAngle;
        return {
          id: `${component.id}-instance-${instanceIndex + 1}`,
          name: placement.instanceCount > 1 ? `${component.name} ${instanceIndex + 1}` : component.name,
          kind: component.kind,
          stageId: component.stageId,
          axialPositionM: placement.translationXM + component.axialPositionM,
          radialPositionM: (placement.stage.attachment === "parallel" ? placement.stage.repeatRadiusM * Math.cos(instanceAngle) : 0) + component.radialOffsetM * Math.cos(componentAzimuthRad),
        };
      });
    });
  }, [diameter, length, noseLength, vehicleTopology.components, vehicleTopology.stages]);
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
  const twoDCoreNosePx = Math.max(72, Math.min(160, noseLength * 0.66));
  const twoDCoreBodyPx = Math.min(520, 280 + length / 4);
  const twoDCoreLengthM = Math.max((noseLength + length) / 1000, 1e-6);
  const twoDPxPerM = (twoDCoreNosePx + twoDCoreBodyPx) / twoDCoreLengthM;
  const twoDCoreDiameterM = Math.max(diameter / 1000, 1e-6);
  const twoDCoreStageId = vehicleTopology.stages[0]?.id;
  const modelWarning =
    result.warnings.find((item) => item.severity !== "info") ??
    result.warnings[0];
  const activeStageCount = vehicleTopology.stages.filter((stage) => stage.enabled).length;
  const configurationRevision = projectHistory.entries.at(-1)?.snapshot.revision ?? 0;
  const configurationId = `A-${String(configurationRevision + 1).padStart(2, "0")}`;
  const readinessLabel =
    engineeringReview.overallStatus === "nominal"
      ? "NOMINAL"
      : engineeringReview.overallStatus === "not-assessed"
        ? "NOT ASSESSED"
        : "REVIEW";
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
      let restoredTopology: LocalVehicleTopology | null = null;
      let restoredHistory = createEmptyProjectHistory("arc54");
      let restoredMotorRecords: MotorDataRecord[] = [];
      let restoredAerodynamicTables: AerodynamicCoefficientTableDefinition[] = [];
      let restoredMotorSelection = "synthetic";
      let restoredAerodynamicSelection = "constant";
      let restoredUiPreferences = createDefaultUiPreferences();
      const problems: string[] = [];
      const selectionWarnings: string[] = [];
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
        restoredMotorRecords = serialized ? parseLocalMotorLibrary(serialized) : [];
        setUserMotorRecords(restoredMotorRecords);
        const storedSelection = window.localStorage.getItem(LOCAL_MOTOR_SELECTION_STORAGE_KEY);
        if (storedSelection?.trim()) restoredMotorSelection = storedSelection;
      } catch {
        problems.push("the local motor library");
      }
      try {
        const serialized = window.localStorage.getItem(LOCAL_FLIGHT_DATA_STORAGE_KEY);
        if (serialized) {
          const snapshot = parseLocalFlightDataSnapshot(serialized);
          const restoredSeries = parseFlightDataCsv(snapshot.csv, snapshot.sourceName);
          setFlightDataSeries(restoredSeries);
          setFlightDataPersistenceState("restored");
          setFlightDataError("");
        }
      } catch {
        problems.push("the measured flight data");
      }
      try {
        const serialized = window.localStorage.getItem(LOCAL_AERODYNAMIC_LIBRARY_STORAGE_KEY);
        restoredAerodynamicTables = serialized ? parseLocalAerodynamicLibrary(serialized) : [];
        setAerodynamicTableDefinitions(restoredAerodynamicTables);
        const storedSelection = window.localStorage.getItem(LOCAL_AERODYNAMIC_SELECTION_STORAGE_KEY);
        if (storedSelection?.trim()) restoredAerodynamicSelection = storedSelection;
      } catch {
        problems.push("the local aerodynamic library");
      }
      try {
        const serialized = window.localStorage.getItem(LOCAL_COMPONENT_LIBRARY_STORAGE_KEY);
        setComponentRecords(serialized ? parseLocalComponentLibrary(serialized) : []);
      } catch {
        problems.push("the local component library");
      }
      try {
        const serialized = window.localStorage.getItem(LOCAL_VEHICLE_TOPOLOGY_STORAGE_KEY);
        if (serialized) {
          const parsedTopology = parseVehicleTopology(serialized);
          topologyRef.current = parsedTopology;
          setVehicleTopology(parsedTopology);
          restoredTopology = parsedTopology;
        }
      } catch {
        problems.push("the vehicle topology");
      }
      try {
        const serialized = [
          UI_PREFERENCES_STORAGE_KEY,
          ...UI_PREFERENCES_LEGACY_STORAGE_KEYS,
        ]
          .map((key) => window.localStorage.getItem(key))
          .find((value): value is string => Boolean(value));
        if (serialized) restoredUiPreferences = parseUiPreferences(serialized);
      } catch {
        problems.push("the display preferences");
      }
      const storedMode = window.localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY);
      if (storedMode === "beginner" || storedMode === "expert") setExperienceMode(storedMode);
      setDesignView(restoredUiPreferences.designView);
      setDesignAzimuthDeg(restoredUiPreferences.designAzimuthDeg);
      setReducedMotion(restoredUiPreferences.reducedMotion);
      setHighContrast(restoredUiPreferences.highContrast);
      setLocale(restoredUiPreferences.locale);
      if (restoredSnapshot?.selectedMotorId) restoredMotorSelection = restoredSnapshot.selectedMotorId;
      if (restoredSnapshot?.selectedAerodynamicTableId) restoredAerodynamicSelection = restoredSnapshot.selectedAerodynamicTableId;
      const motorSelectionAvailable = restoredMotorSelection === "synthetic" || restoredMotorRecords.some((record) => record.id === restoredMotorSelection);
      const effectiveMotorSelection = motorSelectionAvailable ? restoredMotorSelection : "synthetic";
      if (!motorSelectionAvailable) {
        selectionWarnings.push(`Selected motor ${restoredMotorSelection} is not available on this device; synthetic preview selected.`);
      }
      const aerodynamicSelectionAvailable = restoredAerodynamicSelection === "constant" || restoredAerodynamicTables.some((table) => table.id === restoredAerodynamicSelection);
      const effectiveAerodynamicSelection = aerodynamicSelectionAvailable ? restoredAerodynamicSelection : "constant";
      if (!aerodynamicSelectionAvailable) {
        selectionWarnings.push(`Selected aerodynamic table ${restoredAerodynamicSelection} is not available on this device; constant drag selected.`);
      }
      setSelectedMotorId(effectiveMotorSelection);
      setSelectedAerodynamicTableId(effectiveAerodynamicSelection);
      try {
        window.localStorage.setItem(LOCAL_MOTOR_SELECTION_STORAGE_KEY, effectiveMotorSelection);
        window.localStorage.setItem(LOCAL_AERODYNAMIC_SELECTION_STORAGE_KEY, effectiveAerodynamicSelection);
      } catch {
        selectionWarnings.push("source selections could not be refreshed in local storage");
      }
      if (restoredSnapshot?.projectId === "arc54") {
        const inputs = restoredSnapshot.inputs;
        setProjectName(restoredSnapshot.projectName);
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
        setCustomMaterial(inputs.customMaterial ?? DEFAULT_CUSTOM_MATERIAL_PROFILE);
        setThrust(inputs.thrustN);
        setBurnTime(inputs.burnTimeS);
        setDragCoefficient(inputs.dragCoefficient);
        setLaunchSiteName(inputs.launchSiteName);
        setLaunchLatitudeDeg(inputs.launchLatitudeDeg);
        setLaunchLongitudeDeg(inputs.launchLongitudeDeg);
        setLaunchAltitude(inputs.launchAltitudeM);
        setEarthRotationEnabled(inputs.earthRotationEnabled ?? false);
        setNormalGravityEnabled(inputs.normalGravityEnabled ?? false);
        setNormalForceModel(inputs.normalForceModel ?? "low-speed");
        setInducedDragModel(inputs.inducedDragModel ?? "disabled");
        setInducedDragFactor(inputs.inducedDragFactor ?? 0);
        setTerrainModel(inputs.terrainModel);
        setTerrainEastSlopePercent(inputs.terrainEastSlopePercent);
        setTerrainNorthSlopePercent(inputs.terrainNorthSlopePercent);
        setWindSpeed(inputs.windSpeedMps);
        setWindAzimuthDeg(inputs.windAzimuthDeg);
        setWindProfileLayers([...(inputs.windProfileLayers ?? [])]);
        setTurbulenceScale(inputs.turbulenceScale);
        setWeatherSeed(inputs.weatherSeed);
        setRelativeHumidityPercent(inputs.relativeHumidityPercent);
        setSurfacePressureHpa(inputs.surfacePressureHpa);
        setSurfaceTemperatureC(inputs.surfaceTemperatureC);
        setLaunchRailEnabled(inputs.launchRailEnabled);
        setLaunchRailLengthM(inputs.launchRailLengthM);
        setLaunchRailInclinationDeg(inputs.launchRailInclinationDeg);
        setLaunchRailAzimuthDeg(inputs.launchRailAzimuthDeg);
        setLaunchRailFrictionAccelerationMps2(inputs.launchRailFrictionAccelerationMps2);
        setLaunchRailTipOffPitchRateDegS(inputs.launchRailTipOffPitchRateDegS);
        setLaunchRailTipOffYawRateDegS(inputs.launchRailTipOffYawRateDegS);
        setRecoveryEnabled(inputs.recoveryEnabled);
        setRecoveryDelay(inputs.recoveryDelayS);
        setRecoveryInflationTime(inputs.recoveryInflationTimeS);
        setRecoveryDeploymentTrigger(inputs.recoveryDeploymentTrigger);
        setRecoveryDeploymentAltitudeM(inputs.recoveryDeploymentAltitudeM);
        setRecoveryDeploymentTimeS(inputs.recoveryDeploymentTimeS);
        setRecoveryDiameter(inputs.recoveryDiameterM);
        setRecoveryMass(inputs.recoveryMassKg);
        setRecoveryDeploymentSuccessProbability(inputs.recoveryDeploymentSuccessProbability);
        setRecoveryReefingEnabled(inputs.recoveryReefingEnabled);
        setRecoveryReefingDurationS(inputs.recoveryReefingDurationS);
        setRecoveryReefingStartAreaFraction(inputs.recoveryReefingStartAreaFraction);
        setUncertaintySampleCount(inputs.uncertaintySampleCount);
        setUncertaintySeed(inputs.uncertaintySeed);
        setUncertaintyCorrelations([...(inputs.uncertaintyCorrelations ?? [])]);
        setCoupledMutualGravityEnabled(inputs.coupledMutualGravityEnabled ?? false);
        setCoupledGravitySofteningRadiusM(inputs.coupledGravitySofteningRadiusM ?? 0.02);
        setCoupledContactEnabled(inputs.coupledContactEnabled ?? false);
        setCoupledContactStiffnessNPerM(inputs.coupledContactStiffnessNPerM ?? 50_000);
        setCoupledContactDampingNsPerM(inputs.coupledContactDampingNsPerM ?? 100);
        setCoupledContactMaximumNormalForceN(inputs.coupledContactMaximumNormalForceN ?? 1_000_000);
        setReleasedBodyDragModel(inputs.releasedBodyDragModel ?? "isotropic-point");
        setRelativeAeroInteractionEnabled(inputs.relativeAeroInteractionEnabled ?? true);
        setRelativeAeroWakeHalfAngleDeg(inputs.relativeAeroWakeHalfAngleDeg ?? 8);
        setRelativeAeroWakeRecoveryDistanceBodyDiameters(inputs.relativeAeroWakeRecoveryDistanceBodyDiameters ?? 30);
        setRelativeAeroPeakVelocityDeficitFraction(inputs.relativeAeroPeakVelocityDeficitFraction ?? 0.5);
        setRelativeAeroMaximumVelocityDeficitFraction(inputs.relativeAeroMaximumVelocityDeficitFraction ?? 0.7);
        setSeparationContactStoppingDistanceM(inputs.separationContactStoppingDistanceM ?? 0.01);
        setSeparationContactCoefficientOfRestitution(inputs.separationContactCoefficientOfRestitution ?? 0);
        setSixDofIntegrationMethod(inputs.sixDofIntegrationMethod ?? "fixed-rk4");
        if (restoredSnapshot.topology) {
          restoredTopology = restoredSnapshot.topology;
          topologyRef.current = restoredSnapshot.topology;
          setVehicleTopology(restoredSnapshot.topology);
        }
        lastSavedInputsRef.current = inputs;
        lastSavedFingerprintRef.current = namedProjectFingerprint(
          inputs,
          restoredTopology ?? topologyRef.current,
          restoredMotorSelection,
          restoredAerodynamicSelection,
          restoredSnapshot.projectName,
        );
        revisionRef.current = restoredSnapshot.revision;
      } else if (problems.length > 0) {
        lastSavedInputsRef.current = initialInputsRef.current;
        lastSavedFingerprintRef.current = namedProjectFingerprint(
          initialInputsRef.current,
          restoredTopology ?? topologyRef.current,
          restoredMotorSelection,
          restoredAerodynamicSelection,
          DEFAULT_PROJECT_NAME,
        );
      }
      const latestHistoryRevision = restoredHistory.entries.at(-1)?.snapshot.revision ?? 0;
      revisionRef.current = Math.max(revisionRef.current, latestHistoryRevision);
      historyRef.current = restoredHistory;
      setProjectHistory(restoredHistory);
      if (problems.length > 0 || selectionWarnings.length > 0) {
        const persistenceMessage = problems.length > 0
          ? `Could not read ${problems.join(" or ")}. Defaults are active; the unreadable browser record was left untouched.`
          : "";
        setSaveError([persistenceMessage, ...selectionWarnings].filter(Boolean).join(" "));
        setToast(problems.length > 0 ? "Local project data needs attention" : "Source selection updated");
      }
      setSaved(Boolean(restoredSnapshot) && selectionWarnings.length === 0);
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(
        UI_PREFERENCES_STORAGE_KEY,
        serializeUiPreferences({
          ...createDefaultUiPreferences(),
          designView,
          designAzimuthDeg,
          reducedMotion,
          highContrast,
          locale,
        }),
      );
    } catch {
      if (!uiPreferenceWriteFailedRef.current) {
        uiPreferenceWriteFailedRef.current = true;
        notify("Display preferences are session-only");
      }
    }
  }, [designAzimuthDeg, designView, highContrast, locale, reducedMotion, storageReady]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!storageReady || shareHydratedRef.current) return;
    shareHydratedRef.current = true;
    const hash = window.location.hash;
    if (!hash.startsWith(PROJECT_SHARE_HASH_PREFIX)) return;
    const importTimer = window.setTimeout(() => {
      try {
        const shared = decodeProjectShare(hash);
        const inputs = shared.editableInputs;
        setProjectName(shared.projectName);
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
        setCustomMaterial(inputs.customMaterial ?? DEFAULT_CUSTOM_MATERIAL_PROFILE);
        setThrust(inputs.thrustN);
        setBurnTime(inputs.burnTimeS);
        setDragCoefficient(inputs.dragCoefficient);
        setLaunchSiteName(inputs.launchSiteName);
        setLaunchLatitudeDeg(inputs.launchLatitudeDeg);
        setLaunchLongitudeDeg(inputs.launchLongitudeDeg);
        setLaunchAltitude(inputs.launchAltitudeM);
        setEarthRotationEnabled(inputs.earthRotationEnabled ?? false);
        setNormalGravityEnabled(inputs.normalGravityEnabled ?? false);
        setNormalForceModel(inputs.normalForceModel ?? "low-speed");
        setInducedDragModel(inputs.inducedDragModel ?? "disabled");
        setInducedDragFactor(inputs.inducedDragFactor ?? 0);
        setTerrainModel(inputs.terrainModel);
        setTerrainEastSlopePercent(inputs.terrainEastSlopePercent);
        setTerrainNorthSlopePercent(inputs.terrainNorthSlopePercent);
        setWindSpeed(inputs.windSpeedMps);
        setWindAzimuthDeg(inputs.windAzimuthDeg);
        setWindProfileLayers([...(inputs.windProfileLayers ?? [])]);
        setTurbulenceScale(inputs.turbulenceScale);
        setWeatherSeed(inputs.weatherSeed);
        setRelativeHumidityPercent(inputs.relativeHumidityPercent);
        setSurfacePressureHpa(inputs.surfacePressureHpa);
        setSurfaceTemperatureC(inputs.surfaceTemperatureC);
        setLaunchRailEnabled(inputs.launchRailEnabled);
        setLaunchRailLengthM(inputs.launchRailLengthM);
        setLaunchRailInclinationDeg(inputs.launchRailInclinationDeg);
        setLaunchRailAzimuthDeg(inputs.launchRailAzimuthDeg);
        setLaunchRailFrictionAccelerationMps2(inputs.launchRailFrictionAccelerationMps2);
        setLaunchRailTipOffPitchRateDegS(inputs.launchRailTipOffPitchRateDegS);
        setLaunchRailTipOffYawRateDegS(inputs.launchRailTipOffYawRateDegS);
        setRecoveryEnabled(inputs.recoveryEnabled);
        setRecoveryDelay(inputs.recoveryDelayS);
        setRecoveryInflationTime(inputs.recoveryInflationTimeS);
        setRecoveryDeploymentTrigger(inputs.recoveryDeploymentTrigger);
        setRecoveryDeploymentAltitudeM(inputs.recoveryDeploymentAltitudeM);
        setRecoveryDeploymentTimeS(inputs.recoveryDeploymentTimeS);
        setRecoveryDiameter(inputs.recoveryDiameterM);
        setRecoveryMass(inputs.recoveryMassKg);
        setRecoveryDeploymentSuccessProbability(inputs.recoveryDeploymentSuccessProbability);
        setRecoveryReefingEnabled(inputs.recoveryReefingEnabled);
        setRecoveryReefingDurationS(inputs.recoveryReefingDurationS);
        setRecoveryReefingStartAreaFraction(inputs.recoveryReefingStartAreaFraction);
        setUncertaintySampleCount(inputs.uncertaintySampleCount);
        setUncertaintySeed(inputs.uncertaintySeed);
        setUncertaintyCorrelations([...(inputs.uncertaintyCorrelations ?? [])]);
        setCoupledMutualGravityEnabled(inputs.coupledMutualGravityEnabled ?? false);
        setCoupledGravitySofteningRadiusM(inputs.coupledGravitySofteningRadiusM ?? 0.02);
        setCoupledContactEnabled(inputs.coupledContactEnabled ?? false);
        setCoupledContactStiffnessNPerM(inputs.coupledContactStiffnessNPerM ?? 50_000);
        setCoupledContactDampingNsPerM(inputs.coupledContactDampingNsPerM ?? 100);
        setCoupledContactMaximumNormalForceN(inputs.coupledContactMaximumNormalForceN ?? 1_000_000);
        setReleasedBodyDragModel(inputs.releasedBodyDragModel ?? "isotropic-point");
        setRelativeAeroInteractionEnabled(inputs.relativeAeroInteractionEnabled ?? true);
        setRelativeAeroWakeHalfAngleDeg(inputs.relativeAeroWakeHalfAngleDeg ?? 8);
        setRelativeAeroWakeRecoveryDistanceBodyDiameters(inputs.relativeAeroWakeRecoveryDistanceBodyDiameters ?? 30);
        setRelativeAeroPeakVelocityDeficitFraction(inputs.relativeAeroPeakVelocityDeficitFraction ?? 0.5);
        setRelativeAeroMaximumVelocityDeficitFraction(inputs.relativeAeroMaximumVelocityDeficitFraction ?? 0.7);
        setSeparationContactStoppingDistanceM(inputs.separationContactStoppingDistanceM ?? 0.01);
        setSeparationContactCoefficientOfRestitution(inputs.separationContactCoefficientOfRestitution ?? 0);
        setSixDofIntegrationMethod(inputs.sixDofIntegrationMethod ?? "fixed-rk4");
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
    const fingerprint = namedProjectFingerprint(
      editableInputs,
      vehicleTopology,
      selectedMotorId,
      selectedAerodynamicTableId,
      projectName,
    );
    if (fingerprint === lastSavedFingerprintRef.current) {
      setSaved(true);
      return;
    }
    setSaved(false);
    const timer = window.setTimeout(() => {
      try {
        const previous = lastSavedInputsRef.current;
        const previousTopology = historyRef.current.entries.at(-1)?.snapshot.topology;
        const previousSnapshot = historyRef.current.entries.at(-1)?.snapshot;
        const lastTimestamp = historyRef.current.entries.at(-1)?.snapshot.savedAtIso;
        const savedAtIso = nextLocalSaveTime(lastTimestamp);
        const snapshot = createLocalProjectSnapshot({
          projectId: "arc54",
          projectName,
          revision: revisionRef.current + 1,
          savedAtIso,
          inputs: editableInputs,
          topology: vehicleTopology,
          selectedMotorId,
          selectedAerodynamicTableId,
        });
        const label = previous
          ? projectName !== previousSnapshot?.projectName
            ? `Renamed project to ${projectName}`
            : describeProjectConfigurationChanges(
                previous,
                editableInputs,
                previousTopology,
                vehicleTopology,
                previousSnapshot,
                { selectedMotorId, selectedAerodynamicTableId },
              )
          : "Initial local snapshot";
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
  }, [editableInputs, projectName, selectedAerodynamicTableId, selectedMotorId, storageReady, vehicleTopology]);

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
    if (!componentLibraryOpen) return;
    componentLibraryCloseRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setComponentLibraryOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [componentLibraryOpen]);

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
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable=\"true\"]")) return;
      if (event.key === "1" || event.key === "2" || event.key === "3") {
        event.preventDefault();
        setView("design");
        setDesignView(event.key === "1" ? "2d" : event.key === "2" ? "3d-skeleton" : "3d-final");
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

  useEffect(() => {
    if (!accessibilityOpen) return;
    accessibilityCloseRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setAccessibilityOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [accessibilityOpen]);

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
  const pinStageComparisonReference = () => {
    if (!stageFlightResult || !stageFlightIsCurrent) {
      notify("Run the current coupled preview before pinning a staged reference");
      return;
    }
    setStageComparisonReference(stageFlightResult);
    setStageComparisonReferenceFingerprint(stageFlightFingerprint ?? simulationFingerprint);
    notify("Current coupled preview pinned as staged comparison reference");
  };
  const clearStageComparisonReference = () => {
    setStageComparisonReference(null);
    setStageComparisonReferenceFingerprint(null);
    notify("Staged comparison reference cleared");
  };
  const importFlightData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      const csv = await file.text();
      const series = parseFlightDataCsv(csv, file.name);
      let persistenceState: FlightDataPersistenceState = "saved";
      try {
        const snapshot = createLocalFlightDataSnapshot({ sourceName: file.name, csv });
        window.localStorage.setItem(LOCAL_FLIGHT_DATA_STORAGE_KEY, serializeLocalFlightDataSnapshot(snapshot));
      } catch {
        persistenceState = "session-only";
      }
      setFlightDataSeries(series);
      setFlightDataError("");
      setFlightDataPersistenceState(persistenceState);
      notify(persistenceState === "saved"
        ? `Loaded ${series.samples.length} measured samples · saved locally`
        : `Loaded ${series.samples.length} measured samples for this session`);
    } catch (error) {
      setFlightDataError(error instanceof Error ? error.message : "Unable to import flight data CSV.");
    }
  };
  const clearFlightData = () => {
    setFlightDataSeries(null);
    setFlightDataError("");
    setFlightDataPersistenceState("none");
    setFlightDataTimeOffsetS(0);
    try {
      window.localStorage.removeItem(LOCAL_FLIGHT_DATA_STORAGE_KEY);
    } catch {
      setFlightDataError("Measured flight data cleared for this session, but the browser could not update local storage.");
    }
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
      `${projectFileStem(projectName)}-${traceSource}-flight-data-residuals.csv`,
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
    setSelectedFlightEventTimeS(null);
    setSelectedStageEventTimeS(null);
    setStageFlightError("");
    setSweepResult(null);
    setSweepError("");
  };
  const updateCustomMaterial = <K extends keyof CustomMaterialProfile>(key: K, value: CustomMaterialProfile[K]) => {
    setCustomMaterial((current) => ({ ...current, [key]: value }));
    markChanged();
  };
  const enableCustomWindProfile = () => {
    const angleRad = (windAzimuthDeg * Math.PI) / 180;
    const eastMps = windSpeed * Math.cos(angleRad);
    const northMps = windSpeed * Math.sin(angleRad);
    setWindProfileLayers([
      { altitudeM: 0, eastMps, northMps, upMps: 0 },
      { altitudeM: 500, eastMps, northMps, upMps: 0 },
      { altitudeM: 2_000, eastMps: eastMps * 1.4, northMps: northMps * 1.4, upMps: 0 },
    ]);
    markChanged();
  };
  const resetWindProfile = () => {
    setWindProfileLayers([]);
    markChanged();
  };
  const addWindProfileLayer = () => {
    if (windProfileLayers.length >= 32) return;
    const last = windProfileLayers.at(-1);
    const altitudeM = Math.min(50_000, (last?.altitudeM ?? 0) + 500);
    setWindProfileLayers((current) => [
      ...current,
      {
        altitudeM,
        eastMps: last?.eastMps ?? windSpeed,
        northMps: last?.northMps ?? 0,
        upMps: last?.upMps ?? 0,
      },
    ]);
    markChanged();
  };
  const updateWindProfileLayer = (
    index: number,
    key: keyof ProjectWindLayer,
    value: number,
  ) => {
    if (!Number.isFinite(value)) return;
    setWindProfileLayers((current) => current.map((layer, layerIndex) => {
      if (layerIndex !== index) return layer;
      if (key !== "altitudeM") {
        const bounds: Readonly<Record<Exclude<keyof ProjectWindLayer, "altitudeM">, readonly [number, number]>> = {
          eastMps: [-200, 200],
          northMps: [-200, 200],
          upMps: [-100, 100],
        };
        const [minimum, maximum] = bounds[key];
        return { ...layer, [key]: Math.min(maximum, Math.max(minimum, value)) };
      }
      const lowerBound = index === 0 ? -500 : current[index - 1]!.altitudeM + 1;
      const upperBound = index === current.length - 1 ? 50_000 : current[index + 1]!.altitudeM - 1;
      return { ...layer, altitudeM: Math.min(upperBound, Math.max(lowerBound, value)) };
    }));
    markChanged();
  };
  const removeWindProfileLayer = (index: number) => {
    if (windProfileLayers.length <= 2) {
      resetWindProfile();
      return;
    }
    setWindProfileLayers((current) => current.filter((_, layerIndex) => layerIndex !== index));
    markChanged();
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
    setCustomMaterial(inputs.customMaterial ?? DEFAULT_CUSTOM_MATERIAL_PROFILE);
    setThrust(inputs.thrustN);
    setBurnTime(inputs.burnTimeS);
    setDragCoefficient(inputs.dragCoefficient);
    setLaunchSiteName(inputs.launchSiteName);
    setLaunchLatitudeDeg(inputs.launchLatitudeDeg);
    setLaunchLongitudeDeg(inputs.launchLongitudeDeg);
    setLaunchAltitude(inputs.launchAltitudeM);
    setEarthRotationEnabled(inputs.earthRotationEnabled ?? false);
    setNormalGravityEnabled(inputs.normalGravityEnabled ?? false);
    setNormalForceModel(inputs.normalForceModel ?? "low-speed");
    setInducedDragModel(inputs.inducedDragModel ?? "disabled");
    setInducedDragFactor(inputs.inducedDragFactor ?? 0);
    setTerrainModel(inputs.terrainModel);
    setTerrainEastSlopePercent(inputs.terrainEastSlopePercent);
    setTerrainNorthSlopePercent(inputs.terrainNorthSlopePercent);
    setWindSpeed(inputs.windSpeedMps);
    setWindAzimuthDeg(inputs.windAzimuthDeg);
    setWindProfileLayers([...(inputs.windProfileLayers ?? [])]);
    setTurbulenceScale(inputs.turbulenceScale);
    setWeatherSeed(inputs.weatherSeed);
    setRelativeHumidityPercent(inputs.relativeHumidityPercent);
    setSurfacePressureHpa(inputs.surfacePressureHpa);
    setSurfaceTemperatureC(inputs.surfaceTemperatureC);
    setLaunchRailEnabled(inputs.launchRailEnabled);
    setLaunchRailLengthM(inputs.launchRailLengthM);
    setLaunchRailInclinationDeg(inputs.launchRailInclinationDeg);
    setLaunchRailAzimuthDeg(inputs.launchRailAzimuthDeg);
    setLaunchRailFrictionAccelerationMps2(inputs.launchRailFrictionAccelerationMps2);
    setLaunchRailTipOffPitchRateDegS(inputs.launchRailTipOffPitchRateDegS);
    setLaunchRailTipOffYawRateDegS(inputs.launchRailTipOffYawRateDegS);
    setRecoveryEnabled(inputs.recoveryEnabled);
    setRecoveryDelay(inputs.recoveryDelayS);
    setRecoveryInflationTime(inputs.recoveryInflationTimeS);
    setRecoveryDeploymentTrigger(inputs.recoveryDeploymentTrigger);
    setRecoveryDeploymentAltitudeM(inputs.recoveryDeploymentAltitudeM);
    setRecoveryDeploymentTimeS(inputs.recoveryDeploymentTimeS);
    setRecoveryDiameter(inputs.recoveryDiameterM);
    setRecoveryMass(inputs.recoveryMassKg);
    setRecoveryDeploymentSuccessProbability(inputs.recoveryDeploymentSuccessProbability);
    setRecoveryReefingEnabled(inputs.recoveryReefingEnabled);
    setRecoveryReefingDurationS(inputs.recoveryReefingDurationS);
    setRecoveryReefingStartAreaFraction(inputs.recoveryReefingStartAreaFraction);
    setUncertaintySampleCount(inputs.uncertaintySampleCount);
    setUncertaintySeed(inputs.uncertaintySeed);
    setUncertaintyCorrelations([...(inputs.uncertaintyCorrelations ?? [])]);
    setCoupledMutualGravityEnabled(inputs.coupledMutualGravityEnabled ?? false);
    setCoupledGravitySofteningRadiusM(inputs.coupledGravitySofteningRadiusM ?? 0.02);
    setCoupledContactEnabled(inputs.coupledContactEnabled ?? false);
    setCoupledContactStiffnessNPerM(inputs.coupledContactStiffnessNPerM ?? 50_000);
    setCoupledContactDampingNsPerM(inputs.coupledContactDampingNsPerM ?? 100);
    setCoupledContactMaximumNormalForceN(inputs.coupledContactMaximumNormalForceN ?? 1_000_000);
    setReleasedBodyDragModel(inputs.releasedBodyDragModel ?? "isotropic-point");
    setRelativeAeroInteractionEnabled(inputs.relativeAeroInteractionEnabled ?? true);
    setRelativeAeroWakeHalfAngleDeg(inputs.relativeAeroWakeHalfAngleDeg ?? 8);
    setRelativeAeroWakeRecoveryDistanceBodyDiameters(inputs.relativeAeroWakeRecoveryDistanceBodyDiameters ?? 30);
    setRelativeAeroPeakVelocityDeficitFraction(inputs.relativeAeroPeakVelocityDeficitFraction ?? 0.5);
    setRelativeAeroMaximumVelocityDeficitFraction(inputs.relativeAeroMaximumVelocityDeficitFraction ?? 0.7);
    setSeparationContactStoppingDistanceM(inputs.separationContactStoppingDistanceM ?? 0.01);
    setSeparationContactCoefficientOfRestitution(inputs.separationContactCoefficientOfRestitution ?? 0);
    setSixDofIntegrationMethod(inputs.sixDofIntegrationMethod ?? "fixed-rk4");
  };
  const persistCheckpoint = (
    inputs: EditableProjectInputs,
    label: string,
    allowDuplicate = true,
    topology = vehicleTopology,
    sourceSelections = { selectedMotorId, selectedAerodynamicTableId },
    projectNameOverride = projectName,
  ) => {
    const lastTimestamp = historyRef.current.entries.at(-1)?.snapshot.savedAtIso;
    const snapshot = createLocalProjectSnapshot({
      projectId: "arc54",
      projectName: projectNameOverride,
      revision: revisionRef.current + 1,
      savedAtIso: nextLocalSaveTime(lastTimestamp),
      inputs,
      topology,
      ...sourceSelections,
    });
    const nextHistory = appendProjectHistory(historyRef.current, snapshot, label, { allowDuplicate });
    window.localStorage.setItem(LOCAL_PROJECT_STORAGE_KEY, serializeLocalProjectSnapshot(snapshot));
    window.localStorage.setItem(LOCAL_PROJECT_HISTORY_STORAGE_KEY, serializeLocalProjectHistory(nextHistory));
    revisionRef.current = snapshot.revision;
    historyRef.current = nextHistory;
    setProjectHistory(nextHistory);
    lastSavedInputsRef.current = inputs;
    lastSavedFingerprintRef.current = namedProjectFingerprint(
      inputs,
      topology,
      sourceSelections.selectedMotorId,
      sourceSelections.selectedAerodynamicTableId,
      projectNameOverride,
    );
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
      const topology = source.topology ?? topologyRef.current;
      const sourceMotorSelection = source.selectedMotorId ?? selectedMotorId;
      const sourceAerodynamicSelection = source.selectedAerodynamicTableId ?? selectedAerodynamicTableId;
      setProjectName(source.projectName);
      if (source.topology) {
        persistVehicleTopology(source.topology);
      }
      const motorAvailable = sourceMotorSelection === "synthetic" || userMotorRecords.some((record) => record.id === sourceMotorSelection);
      const aerodynamicAvailable = sourceAerodynamicSelection === "constant" || aerodynamicTableDefinitions.some((table) => table.id === sourceAerodynamicSelection);
      const effectiveMotorSelection = motorAvailable ? sourceMotorSelection : "synthetic";
      const effectiveAerodynamicSelection = aerodynamicAvailable ? sourceAerodynamicSelection : "constant";
      setSelectedMotorId(effectiveMotorSelection);
      setSelectedAerodynamicTableId(effectiveAerodynamicSelection);
      window.localStorage.setItem(LOCAL_MOTOR_SELECTION_STORAGE_KEY, effectiveMotorSelection);
      window.localStorage.setItem(LOCAL_AERODYNAMIC_SELECTION_STORAGE_KEY, effectiveAerodynamicSelection);
      persistCheckpoint(
        source.inputs,
        `Restored revision ${source.revision}`,
        true,
        topology,
        { selectedMotorId: effectiveMotorSelection, selectedAerodynamicTableId: effectiveAerodynamicSelection },
        source.projectName,
      );
      applyEditableInputs(source.inputs);
      setHistoryOpen(false);
      const sourceNote = source.topology ? " with vehicle topology" : " (legacy topology retained)";
      const selectionNote = motorAvailable && aerodynamicAvailable ? "" : "; unavailable source selections fell back";
      notify(`Restored revision ${source.revision}${sourceNote}${selectionNote}`);
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
  const persistComponentRecords = (records: LocalComponentRecord[]) => {
    window.localStorage.setItem(LOCAL_COMPONENT_LIBRARY_STORAGE_KEY, serializeLocalComponentLibrary(records));
    setComponentRecords(records);
  };
  const currentComponentPreset = (): Readonly<{
    kind: ComponentPresetKind;
    parameters: ComponentPresetParameters;
  }> | null => {
    const topologyComponent = selectedTopologyComponentId
      ? vehicleTopology.components.find((component) => component.id === selectedTopologyComponentId)
      : undefined;
    if (topologyComponent?.kind === "pointMass") {
      return {
        kind: "point-mass",
        parameters: {
          kind: "point-mass",
          massKg: topologyComponent.massKg!,
          axialPositionM: topologyComponent.axialPositionM,
          radialOffsetM: topologyComponent.radialOffsetM,
          azimuthDeg: topologyComponent.azimuthDeg,
          ...(topologyComponent.inertiaAtCenterKgM2 === undefined ? {} : { inertiaAtCenterKgM2: topologyComponent.inertiaAtCenterKgM2 }),
        },
      };
    }
    if (topologyComponent?.kind === "cylindricalPod") {
      return {
        kind: "cylindrical-pod",
        parameters: {
          kind: "cylindrical-pod",
          lengthM: topologyComponent.lengthM!,
          diameterM: topologyComponent.diameterM!,
          wallThicknessM: topologyComponent.wallThicknessM!,
          densityKgM3: topologyComponent.densityKgM3!,
          axialPositionM: topologyComponent.axialPositionM,
          radialOffsetM: topologyComponent.radialOffsetM,
          azimuthDeg: topologyComponent.azimuthDeg,
        },
      };
    }
    if (selected === "nose") {
      return { kind: "nose", parameters: { kind: "nose", lengthMm: noseLength, profile: noseProfile } };
    }
    if (selected === "body") {
      return {
        kind: "airframe",
        parameters: {
          kind: "airframe",
          lengthMm: length,
          diameterMm: diameter,
          material,
          ...(material === "custom" ? { customMaterial } : {}),
        },
      };
    }
    if (selected === "fins") {
      return {
        kind: "fin-set",
        parameters: {
          kind: "fin-set",
          count: finCount,
          rootChordMm: finRootChord,
          tipChordMm: finTipChord,
          sweepMm: finSweep,
          spanMm: finSpan,
          thicknessMm: finThickness,
        },
      };
    }
    if (selected === "recovery") {
      return {
        kind: "recovery",
        parameters: {
          kind: "recovery",
          massKg: recoveryMass,
          diameterM: recoveryDiameter,
          delayS: recoveryDelay,
          deploymentTrigger: recoveryDeploymentTrigger,
          deploymentAltitudeM: recoveryDeploymentAltitudeM,
          deploymentTimeS: recoveryDeploymentTimeS,
          deploymentSuccessProbability: recoveryDeploymentSuccessProbability,
          reefingEnabled: recoveryReefingEnabled,
          reefingDurationS: recoveryReefingDurationS,
          reefingStartAreaFraction: recoveryReefingStartAreaFraction,
        },
      };
    }
    return null;
  };
  const saveCurrentComponentPreset = () => {
    try {
      const current = currentComponentPreset();
      if (!current) throw new Error("Select a core component or custom topology component before saving a preset.");
      const name = componentPresetDraft.name.trim();
      if (!name) throw new Error("Component preset name cannot be empty.");
      const id = `component-${current.kind}-${projectFileStem(name)}`;
      const record: LocalComponentRecord = {
        id,
        name,
        kind: current.kind,
        description: componentPresetDraft.description.trim() || undefined,
        parameters: current.parameters,
        provenance: {
          sourceName: componentPresetDraft.sourceName.trim(),
          sourceKind: "project-authored",
          dataVersion: componentPresetDraft.dataVersion.trim(),
          licenseIdentifier: componentPresetDraft.licenseIdentifier.trim(),
          attribution: componentPresetDraft.attribution.trim(),
          ...(componentPresetDraft.sourceUrl.trim() ? { sourceUrl: componentPresetDraft.sourceUrl.trim() } : {}),
          validationStatus: "project-authored-unvalidated",
        },
      };
      const next = upsertLocalComponentRecord(componentRecords, record);
      persistComponentRecords(next);
      setComponentError("");
      notify(`${record.name} saved to the component library`);
    } catch (error) {
      setComponentError(error instanceof Error ? error.message : "Unable to save component preset");
    }
  };
  const applyComponentPreset = (record: LocalComponentRecord) => {
    const parameters = record.parameters;
    if (parameters.kind === "nose") {
      setNoseLength(parameters.lengthMm);
      setNoseProfile(parameters.profile);
      setSelected("nose");
    } else if (parameters.kind === "airframe") {
      setLength(parameters.lengthMm);
      setDiameter(parameters.diameterMm);
      setMaterial(parameters.material);
      setCustomMaterial(parameters.customMaterial ?? DEFAULT_CUSTOM_MATERIAL_PROFILE);
      setSelected("body");
    } else if (parameters.kind === "fin-set") {
      setFinCount(parameters.count);
      setFinRootChord(parameters.rootChordMm);
      setFinTipChord(parameters.tipChordMm);
      setFinSweep(parameters.sweepMm);
      setFinSpan(parameters.spanMm);
      setFinThickness(parameters.thicknessMm);
      setSelected("fins");
    } else if (parameters.kind === "recovery") {
      setRecoveryMass(parameters.massKg);
      setRecoveryDiameter(parameters.diameterM);
      setRecoveryDelay(parameters.delayS);
      setRecoveryDeploymentTrigger(parameters.deploymentTrigger);
      setRecoveryDeploymentAltitudeM(parameters.deploymentAltitudeM);
      setRecoveryDeploymentTimeS(parameters.deploymentTimeS);
      setRecoveryDeploymentSuccessProbability(parameters.deploymentSuccessProbability);
      setRecoveryReefingEnabled(parameters.reefingEnabled);
      setRecoveryReefingDurationS(parameters.reefingDurationS);
      setRecoveryReefingStartAreaFraction(parameters.reefingStartAreaFraction);
      setRecoveryEnabled(true);
      setSelected("recovery");
    } else {
      addTopologyComponentFromPreset(parameters);
      setTopologyOpen(true);
      setComponentLibraryOpen(false);
      return;
    }
    markChanged();
    setComponentLibraryOpen(false);
    notify(`${record.name} applied; rerun the estimate`);
  };
  const importComponentLibrary = () => {
    try {
      const records = parseLocalComponentLibrary(componentImportJson);
      persistComponentRecords(records);
      setComponentImportJson("");
      setComponentError("");
      notify(`${records.length} component preset${records.length === 1 ? "" : "s"} imported`);
    } catch (error) {
      setComponentError(error instanceof Error ? error.message : "Unable to import component library");
    }
  };
  const removeComponentPreset = (id: string) => {
    try {
      persistComponentRecords(componentRecords.filter((record) => record.id !== id));
      notify("Component preset removed from this device");
    } catch (error) {
      setComponentError(error instanceof Error ? error.message : "Unable to remove component preset");
    }
  };
  const selectedComponentPreset = currentComponentPreset();
  const persistAerodynamicTables = (records: AerodynamicCoefficientTableDefinition[]) => {
    window.localStorage.setItem(
      LOCAL_AERODYNAMIC_LIBRARY_STORAGE_KEY,
      serializeLocalAerodynamicLibrary(records),
    );
    setAerodynamicTableDefinitions(records);
  };
  const selectMotor = (id: string) => {
    setSelectedMotorId(id);
    window.localStorage.setItem(LOCAL_MOTOR_SELECTION_STORAGE_KEY, id);
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
      const isThrustCsv = /^time_s\s*,\s*thrust_n$/i.test(firstContentLine);
      const records = isThrustCsv
        ? [importMotorThrustCsv(draft.csv, {
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
          })]
        : (() => {
            const batch = importMotorRaspEngBatch(draft.csv, {
              idPrefix: draft.id.trim(),
              description: draft.description.trim() || undefined,
              provenance,
            });
            if (!massFlowHistoryKgS) return batch;
            if (batch.length !== 1) {
              throw new Error("Measured mass-flow CSV can only be attached to one RASP/ENG record; clear it before importing a batch.");
            }
            return [importMotorRaspEng(draft.csv, {
              id: draft.id.trim(),
              description: draft.description.trim() || undefined,
              ...measuredMassFlow,
              provenance,
            })];
          })();
      let nextRecords = userMotorRecords;
      for (const record of records) nextRecords = upsertLocalMotorRecord(nextRecords, record);
      persistMotorRecords(nextRecords);
      const selectedRecord = records[0]!;
      setSelectedMotorId(selectedRecord.id);
      window.localStorage.setItem(LOCAL_MOTOR_SELECTION_STORAGE_KEY, selectedRecord.id);
      setMotorError("");
      notify(records.length === 1
        ? `${selectedRecord.manufacturer} ${selectedRecord.designation} imported; rerun the estimate`
        : `${records.length} RASP motors imported; ${selectedRecord.designation} selected; rerun the estimate`);
    } catch (error) {
      setMotorError(error instanceof Error ? error.message : "Unable to import motor curve");
    }
  };
  const removeUserMotor = (id: string) => {
    try {
      const nextRecords = userMotorRecords.filter((record) => record.id !== id);
      persistMotorRecords(nextRecords);
      if (selectedMotorId === id) {
        setSelectedMotorId("synthetic");
        window.localStorage.setItem(LOCAL_MOTOR_SELECTION_STORAGE_KEY, "synthetic");
      }
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
  const duplicateTopologyStage = (sourceStageId: string) => {
    try {
      if (vehicleTopology.stages.length >= 8) throw new Error("Vehicle topology already contains the maximum of 8 stages.");
      const next = duplicateVehicleStageTopology(vehicleTopology, sourceStageId);
      const duplicated = next.stages.at(-1);
      const copiedComponents = next.components.length - vehicleTopology.components.length;
      persistVehicleTopology(next);
      notify(`${duplicated?.name ?? "Stage"} duplicated${copiedComponents > 0 ? ` with ${copiedComponents} component${copiedComponents === 1 ? "" : "s"}` : ""}`);
    } catch (error) {
      setTopologyError(error instanceof Error ? error.message : `Unable to duplicate ${sourceStageId}`);
    }
  };
  const addTopologyComponent = (kind: VehicleTopologyComponentPlan["kind"]) => {
    try {
      const baseId = kind === "pointMass" ? "equipment" : "pod";
      let index = 1;
      while (vehicleTopology.components.some((component) => component.id === `${baseId}-${String(index).padStart(2, "0")}`)) index += 1;
      const stageId = vehicleTopology.stages.find((stage) => stage.enabled)?.id ?? vehicleTopology.stages[0]?.id;
      if (!stageId) throw new Error("Add a stage before placing a custom component.");
      const component: VehicleTopologyComponentPlan = kind === "pointMass"
        ? {
            id: `${baseId}-${String(index).padStart(2, "0")}`,
            name: `Equipment ${index}`,
            stageId,
            enabled: true,
            kind,
            axialPositionM: 0.35,
            radialOffsetM: 0,
            azimuthDeg: 0,
            massKg: 0.2,
          }
        : {
            id: `${baseId}-${String(index).padStart(2, "0")}`,
            name: `Cylindrical pod ${index}`,
            stageId,
            enabled: true,
            kind,
            axialPositionM: 0.35,
            radialOffsetM: 0,
            azimuthDeg: 0,
            lengthM: 0.25,
            diameterM: 0.05,
            wallThicknessM: 0.001,
            densityKgM3: 850,
          };
      persistVehicleTopology({ ...vehicleTopology, components: [...vehicleTopology.components, component] });
      notify(`${component.name} added to ${vehicleTopology.stages.find((stage) => stage.id === stageId)?.name ?? "stage"}`);
    } catch (error) {
      setTopologyError(error instanceof Error ? error.message : "Unable to add custom component");
    }
  };
  const addTopologyComponentFromPreset = (
    parameters: Extract<ComponentPresetParameters, { kind: "point-mass" | "cylindrical-pod" }>,
  ) => {
    try {
      if (vehicleTopology.components.length >= 64) {
        throw new Error("Vehicle topology already contains the maximum of 64 components.");
      }
      const baseId = parameters.kind === "point-mass" ? "equipment" : "pod";
      let index = 1;
      while (vehicleTopology.components.some((component) => component.id === `${baseId}-${String(index).padStart(2, "0")}`)) index += 1;
      const stageId = vehicleTopology.stages.find((stage) => stage.enabled)?.id ?? vehicleTopology.stages[0]?.id;
      if (!stageId) throw new Error("Add a stage before placing a custom component.");
      const component: VehicleTopologyComponentPlan = parameters.kind === "point-mass"
        ? {
            id: `${baseId}-${String(index).padStart(2, "0")}`,
            name: `Equipment ${index}`,
            stageId,
            enabled: true,
            kind: "pointMass",
            axialPositionM: parameters.axialPositionM,
            radialOffsetM: parameters.radialOffsetM,
            azimuthDeg: parameters.azimuthDeg,
            massKg: parameters.massKg,
            ...(parameters.inertiaAtCenterKgM2 === undefined ? {} : { inertiaAtCenterKgM2: parameters.inertiaAtCenterKgM2 }),
          }
        : {
            id: `${baseId}-${String(index).padStart(2, "0")}`,
            name: `Cylindrical pod ${index}`,
            stageId,
            enabled: true,
            kind: "cylindricalPod",
            axialPositionM: parameters.axialPositionM,
            radialOffsetM: parameters.radialOffsetM,
            azimuthDeg: parameters.azimuthDeg,
            lengthM: parameters.lengthM,
            diameterM: parameters.diameterM,
            wallThicknessM: parameters.wallThicknessM,
            densityKgM3: parameters.densityKgM3,
          };
      persistVehicleTopology({ ...vehicleTopology, components: [...vehicleTopology.components, component] });
      setSelectedTopologyComponentId(component.id);
      setSelected("body");
      notify(`${component.name} added from component library`);
    } catch (error) {
      setTopologyError(error instanceof Error ? error.message : "Unable to add preset component");
    }
  };
  const updateTopologyComponent = (id: string, patch: Partial<VehicleTopologyComponentPlan>): boolean => {
    try {
      const nextComponents = vehicleTopology.components.map((component) => component.id === id ? { ...component, ...patch } : component);
      persistVehicleTopology({ ...vehicleTopology, components: nextComponents });
      return true;
    } catch (error) {
      setTopologyError(error instanceof Error ? error.message : "Unable to update custom component");
      return false;
    }
  };
  const updateTopologyComponentInertia = (
    id: string,
    axis: "x" | "y" | "z",
    value: number,
  ): boolean => {
    const component = vehicleTopology.components.find((candidate) => candidate.id === id);
    if (!component || component.kind !== "pointMass") return false;
    const current = component.inertiaAtCenterKgM2 ?? { x: 0, y: 0, z: 0 };
    return updateTopologyComponent(id, {
      inertiaAtCenterKgM2: { ...current, [axis]: value },
    });
  };
  const removeTopologyComponent = (id: string) => {
    try {
      const component = vehicleTopology.components.find((candidate) => candidate.id === id);
      persistVehicleTopology({ ...vehicleTopology, components: vehicleTopology.components.filter((candidate) => candidate.id !== id) });
      if (selectedTopologyComponentId === id) setSelectedTopologyComponentId(null);
      notify(`${component?.name ?? "Custom component"} removed`);
    } catch (error) {
      setTopologyError(error instanceof Error ? error.message : "Unable to remove custom component");
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
  const updateTopologyDimension = (
    id: string,
    key: "bodyLengthM" | "diameterM" | "noseLengthM",
    value: number | string,
  ): boolean => {
    const normalized = typeof value === "string" ? value.trim() : value;
    if (normalized === "") return updateTopologyStage(id, { [key]: undefined });
    const numericValue = typeof normalized === "number" ? normalized : Number(normalized);
    if (!Number.isFinite(numericValue)) {
      setTopologyError(`${key} must be a finite number or left blank for the role default.`);
      return false;
    }
    return updateTopologyStage(id, { [key]: numericValue });
  };
  const addTopologyGimbalPoint = (stage: VehicleStagePlan): boolean => {
    const schedule = stage.gimbalSchedule ?? [];
    if (schedule.length >= 32) {
      setTopologyError("A gimbal schedule may contain at most 32 points.");
      return false;
    }
    const lastTimeS = schedule.at(-1)?.timeS ?? -1;
    return updateTopologyStage(stage.id, {
      gimbalSchedule: [
        ...schedule,
        { timeS: Math.max(0, lastTimeS + 1), pitchDeg: 0, yawDeg: 0 },
      ],
    });
  };
  const updateTopologyGimbalPoint = (
    stage: VehicleStagePlan,
    index: number,
    patch: Partial<NonNullable<VehicleStagePlan["gimbalSchedule"]>[number]>,
  ): boolean => {
    const schedule = stage.gimbalSchedule ?? [];
    if (!schedule[index]) return false;
    return updateTopologyStage(stage.id, {
      gimbalSchedule: schedule.map((point, pointIndex) =>
        pointIndex === index ? { ...point, ...patch } : point,
      ),
    });
  };
  const removeTopologyGimbalPoint = (stage: VehicleStagePlan, index: number): boolean => {
    const schedule = stage.gimbalSchedule ?? [];
    if (!schedule[index]) return false;
    const nextSchedule = schedule.filter((_, pointIndex) => pointIndex !== index);
    return updateTopologyStage(stage.id, {
      ...(nextSchedule.length > 0 ? { gimbalSchedule: nextSchedule } : { gimbalSchedule: undefined }),
    });
  };
  const addTopologyThrottlePoint = (stage: VehicleStagePlan): boolean => {
    const schedule = stage.throttleSchedule ?? [];
    if (schedule.length >= 32) {
      setTopologyError("A throttle schedule may contain at most 32 points.");
      return false;
    }
    const lastTimeS = schedule.at(-1)?.timeS ?? -1;
    return updateTopologyStage(stage.id, {
      throttleSchedule: [
        ...schedule,
        { timeS: Math.max(0, lastTimeS + 1), throttleFraction: 1 },
      ],
    });
  };
  const updateTopologyThrottlePoint = (
    stage: VehicleStagePlan,
    index: number,
    patch: Partial<NonNullable<VehicleStagePlan["throttleSchedule"]>[number]>,
  ): boolean => {
    const schedule = stage.throttleSchedule ?? [];
    if (!schedule[index]) return false;
    return updateTopologyStage(stage.id, {
      throttleSchedule: schedule.map((point, pointIndex) =>
        pointIndex === index ? { ...point, ...patch } : point,
      ),
    });
  };
  const removeTopologyThrottlePoint = (stage: VehicleStagePlan, index: number): boolean => {
    const schedule = stage.throttleSchedule ?? [];
    if (!schedule[index]) return false;
    const nextSchedule = schedule.filter((_, pointIndex) => pointIndex !== index);
    return updateTopologyStage(stage.id, {
      ...(nextSchedule.length > 0 ? { throttleSchedule: nextSchedule } : { throttleSchedule: undefined }),
    });
  };
  const updateTopologySeparationImpulse = (
    stage: VehicleStagePlan,
    axis: keyof VehicleStageSeparationImpulseBodyNs,
    value: number,
  ): boolean => {
    const current = stage.separationImpulseBodyNs ?? { x: 0, y: 0, z: 0 };
    const next = { ...current, [axis]: value } as VehicleStageSeparationImpulseBodyNs;
    const hasImpulse = Math.hypot(next.x, next.y, next.z) > 1e-9;
    return updateTopologyStage(stage.id, {
      separationDeltaVBodyMps: 0,
      ...(hasImpulse ? { separationImpulseBodyNs: next } : { separationImpulseBodyNs: undefined }),
    });
  };
  const clearTopologySeparationImpulse = (stage: VehicleStagePlan): boolean =>
    updateTopologyStage(stage.id, { separationImpulseBodyNs: undefined });
  const updateTopologyRecovery = (
    stage: VehicleStagePlan,
    patch: Partial<NonNullable<VehicleStagePlan["recovery"]>>,
  ): boolean => updateTopologyStage(stage.id, {
    recovery: {
      enabled: stage.recovery?.enabled ?? false,
      diameterM: stage.recovery?.diameterM ?? 0.45,
      deploymentDelayS: stage.recovery?.deploymentDelayS ?? 0,
      deploymentTrigger: stage.recovery?.deploymentTrigger ?? "apogee",
      deploymentAltitudeAglM: stage.recovery?.deploymentAltitudeAglM ?? 150,
      deploymentTimeS: stage.recovery?.deploymentTimeS ?? 8,
      ...patch,
    },
  });
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
    try {
      const removed = vehicleTopology.stages.find((stage) => stage.id === id);
      const rehomedCount = vehicleTopology.components.filter((component) => component.stageId === id).length;
      persistVehicleTopology(removeVehicleStageTopology(vehicleTopology, id));
      notify(`${removed?.name ?? "Stage"} removed${rehomedCount > 0 ? ` · ${rehomedCount} component${rehomedCount === 1 ? "" : "s"} rehomed to core` : ""}`);
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
        projectName,
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
      setProjectName(imported.projectName);
      applyEditableInputs(imported.editableInputs);
      persistVehicleTopology(imported.topology);
      persistMotorRecords([...imported.motorLibrary]);
      persistAerodynamicTables([...imported.aerodynamicLibrary]);
      persistComponentRecords([...imported.componentLibrary]);
      setSelectedMotorId(imported.selectedMotorId);
      setSelectedAerodynamicTableId(imported.selectedAerodynamicTableId);
      window.localStorage.setItem(LOCAL_MOTOR_SELECTION_STORAGE_KEY, imported.selectedMotorId);
      window.localStorage.setItem(
        LOCAL_AERODYNAMIC_SELECTION_STORAGE_KEY,
        imported.selectedAerodynamicTableId,
      );
      markChanged();
      persistCheckpoint(
        imported.editableInputs,
        `Imported project: ${imported.projectName}`,
        true,
        imported.topology,
        { selectedMotorId: imported.selectedMotorId, selectedAerodynamicTableId: imported.selectedAerodynamicTableId },
        imported.projectName,
      );
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
      if ((format === "stage-flight-csv" || format === "stage-flight-comparison-csv" || format === "separated-body-csv" || format === "coupled-body-csv" || format === "flight-path-geojson") && !stageFlightIsCurrent) {
        throw new Error("Rerun the coupled 6DOF preview before exporting its trace for this design.");
      }
      if (format === "stage-flight-comparison-csv" && !stageComparisonReference) {
        throw new Error("Pin a staged comparison reference before exporting its delta.");
      }
      if (format === "benchmark-csv" && !benchmarkResult) {
        throw new Error("Run the deterministic physics benchmarks before exporting their evidence.");
      }
      const generatedAtIso = new Date().toISOString();
      const fileStem = projectFileStem(projectName);
      const cadGeometry: RocketCadGeometry = {
        projectName,
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
        stageParts: createCadStageParts(vehicleTopology.stages, {
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
        }),
      };
      let filename: string;
      let mediaType: string;
      let content: string;
      if (format === "project") {
        filename = `${fileStem}.rocketworks.json`;
        mediaType = "application/json;charset=utf-8";
        content = createKestrelProjectJson({
          projectId: "arc54",
          projectName,
          generatedAtIso,
          applicationVersion: "rocketworks-browser-0.1.0",
          vehicle: {
            geometry: cadGeometry,
            material,
            ...(material === "custom" ? { customMaterial } : {}),
            materialModel: resolveBrowserMaterialModel(material, customMaterial),
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
            verticalConvergence: verticalConvergenceIsCurrent ? verticalConvergence : null,
            stageFlight: stageFlightResult,
            verticalSweep: sweepResult,
            freshness: {
              modelVersion: SIMULATION_FRESHNESS_MODEL_VERSION,
              verticalFlight: resultIsCurrent ? "current" : "stale",
              verticalConvergence: verticalConvergence === null
                ? "not-run"
                : verticalConvergenceIsCurrent
                  ? "current"
                  : "stale",
              stageFlight: stageFlightResult === null
                ? "not-run"
                : stageFlightIsCurrent
                  ? "current"
                  : "stale",
            },
          } as unknown as JsonValue,
          analyses: {
            benchmarkSuite: benchmarkResult,
            uncertainty,
            structural: structuralScreen,
            stageStructural: stageStructuralReview,
            stageInterfaceLoads: stageInterfaceLoadReview,
            attachedAeroInterference,
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
              componentLibrary: componentRecords,
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
        filename = `${fileStem}-flight-trace.csv`;
        mediaType = "text/csv;charset=utf-8";
        content = createFlightTraceCsv(result.trace);
      } else if (format === "stage-flight-csv") {
        if (!stageFlightResult) throw new Error("Run the staged preview before exporting its trace.");
        filename = `${fileStem}-stage-flight-trace.csv`;
        mediaType = "text/csv;charset=utf-8";
        content = createStageFlightTraceCsv(stageFlightResult.trace);
      } else if (format === "stage-flight-comparison-csv") {
        if (!stageFlightResult || !stageComparisonReference) {
          throw new Error("Run the staged preview and pin a reference before exporting its comparison.");
        }
        filename = `${fileStem}-stage-flight-comparison.csv`;
        mediaType = "text/csv;charset=utf-8";
        content = createStageFlightComparisonCsv(
          createStageFlightComparison(stageComparisonReference, stageFlightResult),
          {
            referenceFingerprint: stageComparisonReferenceFingerprint ?? undefined,
            currentFingerprint: stageFlightFingerprint ?? simulationFingerprint,
          },
        );
      } else if (format === "separated-body-csv") {
        if (!stageFlightResult || stageFlightResult.separatedBodies.length === 0) {
          throw new Error("Run a staged preview with at least one released body before exporting detached traces.");
        }
        filename = `${fileStem}-separated-body-traces.csv`;
        mediaType = "text/csv;charset=utf-8";
        content = createSeparatedBodyTraceCsv(stageFlightResult.separatedBodies);
      } else if (format === "coupled-body-csv") {
        if (!stageFlightResult?.coupledMultiBodyFlight) {
          throw new Error("Run a staged preview with released bodies before exporting the shared coupled trace.");
        }
        filename = `${fileStem}-coupled-body-traces.csv`;
        mediaType = "text/csv;charset=utf-8";
        content = createCoupledMultiBodyTraceCsv(stageFlightResult.coupledMultiBodyFlight);
      } else if (format === "flight-path-geojson") {
        if (!stageFlightResult) throw new Error("Run the staged preview before exporting its flight path.");
        filename = `${fileStem}-flight-path.geojson`;
        mediaType = "application/geo+json;charset=utf-8";
        content = createFlightPathGeoJson({
          projectName,
          generatedAtIso,
          sourceModelVersion: stageFlightResult.modelVersion,
          launchSite: {
            name: previewEnvironment.definition.site.name,
            latitudeDeg: previewEnvironment.definition.site.latitudeDeg,
            longitudeDeg: previewEnvironment.definition.site.longitudeDeg,
            elevationM: previewEnvironment.definition.site.elevationM,
          },
          series: stageFlightTrajectorySeries.map((entry) => ({
            id: entry.id,
            label: entry.label,
            trace: entry.trace.map((sample) => ({
              timeS: sample.timeS,
              positionWorldM: sample.positionWorldM,
              ...("speedMps" in sample && typeof sample.speedMps === "number" ? { speedMps: sample.speedMps } : {}),
              ...("altitudeAglM" in sample && typeof sample.altitudeAglM === "number" ? { altitudeAglM: sample.altitudeAglM } : {}),
            })),
            ...(entry.id === "retained-vehicle" ? {} : {
              releaseTimeS: stageFlightResult.coupledMultiBodyFlight?.trajectories.find(
                (trajectory) => trajectory.id === entry.id,
              )?.releaseTimeS,
            }),
          })),
          events: stageFlightResult.events.map((event) => ({
            id: event.id,
            label: event.label,
            timeS: event.timeS,
            kind: event.kind,
          })),
        });
      } else if (format === "sweep-csv") {
        if (!sweepResult) throw new Error("Run a parameter sweep before exporting its table.");
        filename = `${fileStem}-parameter-sweep.csv`;
        mediaType = "text/csv;charset=utf-8";
        content = createParameterSweepCsv(sweepResult.result);
      } else if (format === "uncertainty-csv") {
        filename = `${fileStem}-uncertainty-samples.csv`;
        mediaType = "text/csv;charset=utf-8";
        content = createUncertaintyCsv(uncertainty);
      } else if (format === "benchmark-csv") {
        if (!benchmarkResult) throw new Error("Run the deterministic physics benchmarks before exporting their evidence.");
        filename = `${fileStem}-physics-benchmarks.csv`;
        mediaType = "text/csv;charset=utf-8";
        content = createPhysicsBenchmarkCsv(benchmarkResult);
      } else if (format === "report") {
        filename = `${fileStem}-engineering-report.md`;
        mediaType = "text/markdown;charset=utf-8";
        content = createEngineeringReportMarkdown({
          projectName,
          generatedAtIso,
          selectedMotorId,
          selectedAerodynamicTableId,
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
            materialLabel: resolveBrowserMaterialModel(material, customMaterial).label,
            materialModelVersion:
              resolveBrowserMaterialModel(material, customMaterial).modelVersion
              ?? BROWSER_MATERIAL_MODEL_VERSION,
            materialValidationStatus:
              resolveBrowserMaterialModel(material, customMaterial).validationStatus
              ?? BROWSER_MATERIAL_VALIDATION_STATUS,
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
            latitudeDeg: previewEnvironment.definition.site.latitudeDeg,
            longitudeDeg: previewEnvironment.definition.site.longitudeDeg,
            elevationM: previewEnvironment.definition.site.elevationM,
            meanWindAt500Mps: Math.hypot(
              environmentAt500M.meanWindWorldMps.x,
              environmentAt500M.meanWindWorldMps.y,
            ),
            windAzimuthDeg,
            windProfileLayerCount: previewEnvironment.definition.meanWindProfile?.length ?? 0,
            windProfileSource: windProfileLayers.length > 0 ? "user-supplied" : "synthetic",
            turbulenceScale,
            weatherSeed,
            surfacePressureHpa,
            surfaceTemperatureC,
            relativeHumidityPercent,
            normalForceModel: stageFlightIsCurrent
              ? stageFlightResult?.normalForceModel ?? normalForceModel
              : normalForceModel,
            inducedDragModel: stageFlightIsCurrent
              ? stageFlightResult?.inducedDragModel ?? inducedDragModel
              : inducedDragModel,
            inducedDragFactor: stageFlightIsCurrent
              ? stageFlightResult?.inducedDragFactor ?? inducedDragFactor
              : inducedDragFactor,
            modelVersion: previewEnvironment.modelVersion,
            validationStatus: previewEnvironment.validationStatus,
            provenance: `${previewEnvironment.definition.provenance.sourceName} · ${previewEnvironment.definition.provenance.licenseIdentifier} · ${previewEnvironment.definition.provenance.validationStatus}`,
          },
          recovery: {
            enabled: recoveryEnabled,
            deploymentTrigger: recoveryDeploymentTrigger,
            deploymentAltitudeAglM: recoveryDeploymentAltitudeM,
            deploymentTimeS: recoveryDeploymentTimeS,
            deploymentDelayS: recoveryDelay,
            inflationTimeS: recoveryInflationTime,
            reefingEnabled: recoveryReefingEnabled,
            reefingDurationS: recoveryReefingDurationS,
            reefingStartAreaFraction: recoveryReefingStartAreaFraction,
          },
          flight: result,
          verticalConvergence: verticalConvergenceIsCurrent ? verticalConvergence : null,
          stageFlight: stageFlightIsCurrent ? stageFlightResult : null,
          stageFlightComparison: stageFlightIsCurrent && stageFlightResult && stageComparisonReference
            ? createStageFlightComparison(stageComparisonReference, stageFlightResult)
            : null,
          benchmarkSuite: benchmarkResult,
          stageUncertainty: stageUncertaintyIsCurrent ? stageUncertainty : null,
          uncertainty,
          landing: landingPrediction,
          structural: structuralScreen,
          stageStructural: stageStructuralReview,
          stageInterfaceLoads: stageInterfaceLoadReview,
          attachedAeroInterference,
          designReview: engineeringReview,
        });
      } else if (format === "aero-polar-csv") {
        if (!selectedAerodynamicTable) {
          throw new Error("Select a provenance-qualified aerodynamic table before exporting its polar.");
        }
        filename = `${fileStem}-aerodynamic-polar.csv`;
        mediaType = "text/csv;charset=utf-8";
        content = createAerodynamicPolarCsv(sampleAerodynamicPolar(selectedAerodynamicTable));
      } else if (format === "dxf") {
        filename = `${fileStem}-side-profile.dxf`;
        mediaType = "application/dxf;charset=utf-8";
        content = createRocketProfileDxf(cadGeometry);
      } else if (format === "stl") {
        filename = `${fileStem}-reference-mesh.stl`;
        mediaType = "model/stl;charset=utf-8";
        content = createRocketStl(cadGeometry);
      } else {
        filename = `${fileStem}-parametric.scad`;
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
      launchSiteName,
      launchLatitudeDeg,
      launchLongitudeDeg,
      launchAltitude,
      terrainModel,
      terrainEastSlopePercent,
      terrainNorthSlopePercent,
      windSpeed,
      windAzimuthDeg,
      windProfileLayers,
      turbulenceScale,
      weatherSeed,
      relativeHumidityPercent,
      surfacePressureHpa,
      surfaceTemperatureC,
      recoveryEnabled,
      recoveryDelay,
      recoveryInflationTime,
      recoveryDeploymentTrigger,
      recoveryDeploymentAltitudeM,
      recoveryDeploymentTimeS,
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
        const nextConfig = createFlightConfig(inputs);
        const nextResult = simulateVerticalFlight(nextConfig);
        const nextConvergence = analyzeVerticalFlightConvergence({
          config: nextConfig,
          baseResult: nextResult,
        });
        setResult(nextResult);
        setSelectedFlightEventTimeS(null);
        setVerticalConvergence(nextConvergence);
        setVerticalConvergenceFingerprint(runFingerprint);
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
            launchRailFrictionAccelerationMps2,
            launchRailTipOffPitchRateDegS,
            launchRailTipOffYawRateDegS,
            coupledMutualGravityEnabled,
            coupledGravitySofteningRadiusM,
            coupledContactEnabled,
            coupledContactStiffnessNPerM,
            coupledContactDampingNsPerM,
            coupledContactMaximumNormalForceN,
            releasedBodyDragModel,
            relativeAeroInteractionEnabled,
            relativeAeroWakeHalfAngleDeg,
            relativeAeroWakeRecoveryDistanceBodyDiameters,
            relativeAeroPeakVelocityDeficitFraction,
            relativeAeroMaximumVelocityDeficitFraction,
            separationContactStoppingDistanceM,
            separationContactCoefficientOfRestitution,
            normalForceModel,
            inducedDragModel,
            inducedDragFactor,
            recoveryEnabled,
            recoveryDelay,
            recoveryInflationTime,
            recoveryDeploymentTrigger,
            recoveryDeploymentAltitudeM,
            recoveryDeploymentTimeS,
            recoveryDiameter,
            recoveryReefingEnabled,
            recoveryReefingDurationS,
            recoveryReefingStartAreaFraction,
            sixDofIntegrationMethod,
            aerodynamicTable: selectedAerodynamicTable,
            aerodynamicTableModels,
          }),
        );
        setStageFlightResult(nextResult);
        setSelectedStageEventTimeS(null);
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
          launchRailFrictionAccelerationMps2,
          launchRailTipOffPitchRateDegS,
          launchRailTipOffYawRateDegS,
          coupledMutualGravityEnabled,
          coupledGravitySofteningRadiusM,
          coupledContactEnabled,
          coupledContactStiffnessNPerM,
          coupledContactDampingNsPerM,
          coupledContactMaximumNormalForceN,
          releasedBodyDragModel,
          relativeAeroInteractionEnabled,
          relativeAeroWakeHalfAngleDeg,
          relativeAeroWakeRecoveryDistanceBodyDiameters,
          relativeAeroPeakVelocityDeficitFraction,
          relativeAeroMaximumVelocityDeficitFraction,
          separationContactStoppingDistanceM,
          separationContactCoefficientOfRestitution,
          normalForceModel,
          inducedDragModel,
          inducedDragFactor,
          recoveryEnabled,
          recoveryDelay,
          recoveryInflationTime,
          recoveryDeploymentTrigger,
          recoveryDeploymentAltitudeM,
          recoveryDeploymentTimeS,
          recoveryDiameter,
          recoveryReefingEnabled,
          recoveryReefingDurationS,
          recoveryReefingStartAreaFraction,
          sixDofIntegrationMethod,
          aerodynamicTable: selectedAerodynamicTable,
          aerodynamicTableModels,
        });
        const motorFactorDefinitions = Array.from(
          new Map(
            baseInput.stages
              .flatMap((stage) => [
                ...stage.motors,
                ...(stage.instances ?? []).flatMap((instance) => instance.motors),
              ])
              .map((motor) => [motor.id, motor] as const),
          ).values(),
        ).map((motor) => ({
          key: motorThrustScaleFactorKey(motor.id),
          label: `${motor.name} thrust`,
          distribution: { kind: "normal" as const, mean: 1, standardDeviation: 0.04, minimum: 0.85, maximum: 1.15 },
        }));
        const aerodynamicUncertaintyAvailable =
          Boolean(selectedAerodynamicTable?.uncertaintyAvailable) ||
          vehicleTopology.stages.some(
            (stage) =>
              stage.aerodynamicTableId !== undefined &&
              aerodynamicTableModels[stage.aerodynamicTableId]?.uncertaintyAvailable === true,
          );
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
          ...motorFactorDefinitions,
          {
            key: "dragCoefficientScale" as const,
            label: "Drag coefficient",
            distribution: { kind: "triangular" as const, minimum: 0.9, mode: 1, maximum: 1.1 },
          },
          ...(aerodynamicUncertaintyAvailable
            ? [
                {
                  key: "coefficientUncertaintyScale" as const,
                  label: "Aero table uncertainty (common sigma)",
                  distribution: { kind: "normal" as const, mean: 0, standardDeviation: 1, minimum: -2, maximum: 2 },
                },
              ]
            : []),
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
                  key: "recoveryInflationTimeScale" as const,
                  label: "Recovery inflation time",
                  distribution: { kind: "triangular" as const, minimum: 0.7, mode: 1, maximum: 1.4 },
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
          ...(stageFlightResult.separationContactLoad
            ? [
                {
                  key: "contactStoppingDistanceScale" as const,
                  label: "Contact stopping distance",
                  distribution: { kind: "triangular" as const, minimum: 0.5, mode: 1, maximum: 2 },
                },
                ...(separationContactCoefficientOfRestitution > 0
                  ? [
                      {
                        key: "contactRestitutionScale" as const,
                        label: "Contact restitution",
                        distribution: {
                          kind: "triangular" as const,
                          minimum: 0.75,
                          mode: 1,
                          maximum: Math.min(1.25, 1 / separationContactCoefficientOfRestitution),
                        },
                      },
                    ]
                  : []),
              ]
            : []),
          {
            key: "alignmentOffsetRad" as const,
            label: "Launch alignment",
            distribution: { kind: "normal" as const, mean: 0, standardDeviation: 0.0015, minimum: -0.005, maximum: 0.005 },
          },
          ...(launchRailEnabled
            ? [
                {
                  key: "railFrictionScale" as const,
                  label: "Guide friction",
                  distribution: { kind: "triangular" as const, minimum: 0.5, mode: 1, maximum: 1.5 },
                },
                {
                  key: "railTipOffScale" as const,
                  label: "Rail-exit tip-off",
                  distribution: { kind: "triangular" as const, minimum: 0.5, mode: 1, maximum: 1.5 },
                },
              ]
            : []),
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
          windProfileLayers,
          relativeHumidityPercent,
          surfacePressureHpa,
          surfaceTemperatureC,
          recoveryEnabled,
          recoveryDelay,
          recoveryInflationTime,
          recoveryDeploymentTrigger,
          recoveryDeploymentAltitudeM,
          recoveryDeploymentTimeS,
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
          windProfileLayers,
          relativeHumidityPercent,
          surfacePressureHpa,
          surfaceTemperatureC,
          recoveryEnabled,
          recoveryDelay,
          recoveryInflationTime,
          recoveryDeploymentTrigger,
          recoveryDeploymentAltitudeM,
          recoveryDeploymentTimeS,
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
    { id: "view-2d", label: "Show 2D design view", description: "Switch to the orthographic vehicle profile", shortcut: "1", run: () => { setView("design"); setDesignView("2d"); } },
    { id: "view-3d-skeleton", label: "Show 3D skeleton view", description: "Switch to the low-ink structural display model", shortcut: "2", run: () => { setView("design"); setDesignView("3d-skeleton"); } },
    { id: "view-3d-final", label: "Show 3D final view", description: "Switch to the shaded display model", shortcut: "3", run: () => { setView("design"); setDesignView("3d-final"); } },
    { id: "run-estimate", label: "Run vertical estimate", description: "Propagate the current vehicle through the preliminary vertical model", shortcut: "R", run: simulate },
    { id: "run-sweep", label: "Run parameter sweep", description: "Evaluate a bounded one-variable trade study", shortcut: "S", run: runSweep },
    { id: "run-staged", label: activeStageCount > 1 ? "Run staged 6DOF preview" : "Run coupled 6DOF preview", description: activeStageCount > 1 ? "Propagate the active stage graph and event transitions" : "Propagate the current vehicle through the coupled rigid-body preview", run: runStageAwareEstimate },
    { id: "run-benchmarks", label: "Run physics benchmarks", description: "Check deterministic SI anchors and closed-form regression fixtures", run: runPhysicsBenchmarks },
    { id: "open-topology", label: "Edit stages and boosters", description: "Open the serial, parallel, and radial topology editor", run: () => setTopologyOpen(true) },
    { id: "open-motors", label: "Open motor library", description: "Review or import a provenance-qualified user motor curve", run: () => setMotorLibraryOpen(true) },
    { id: "open-aero", label: "Open aerodynamic data", description: "Review or import Mach-Reynolds coefficient tables", run: () => setAerodynamicLibraryOpen(true) },
    { id: "open-components", label: "Open component library", description: "Reuse attributed geometry, recovery, equipment, and pod presets", run: () => setComponentLibraryOpen(true) },
    { id: "open-templates", label: "Choose a project template", description: "Start from a beginner, high-power, weather, or diagnostic setup", run: () => setTemplatesOpen(true) },
    { id: "open-history", label: "Open local project history", description: "Restore a validated device-local checkpoint", run: () => setHistoryOpen(true) },
    { id: "open-export", label: "Open artifact center", description: "Export project JSON, traces, reports, and CAD references", run: () => setExportOpen(true) },
    { id: "share-design", label: "Copy design share link", description: "Share validated inputs and stage topology without embedding local library data", run: () => { void copyProjectShare(); } },
    { id: "import-project", label: "Import RocketWorks project", description: "Restore a portable project document and its validated user libraries", run: () => setProjectImportRequested(true) },
    { id: "open-accessibility", label: uiCopy.openAccessibility, description: "Adjust motion and contrast without changing engineering inputs", run: () => setAccessibilityOpen(true) },
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
    <main
      className="app-shell"
      lang={locale}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-high-contrast={highContrast ? "true" : "false"}
    >
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
          <span className="brand-mark" aria-hidden="true">R</span>
          <div><strong>RocketWorks</strong><span>{uiCopy.brandTagline}</span></div>
        </div>
        <div className="project-title">
          <button className="quiet-button" aria-label="Go back to projects">‹</button>
          <div><strong>{projectName} / Vehicle 01</strong><span><i className="live-dot" />{saveError ? "Review required" : saved ? "Saved locally" : "Saving changes…"}</span></div>
        </div>
        <div className="top-actions">
          <div className="mission-chip" aria-label="Mission status"><span>MISSION</span><strong>RKW-01</strong><em>PRELIMINARY · REV 01</em></div>
          <button className="quiet-button command-button" onClick={openCommandPalette} aria-haspopup="dialog" aria-expanded={commandOpen}>
            <span>{uiCopy.searchActions}</span><kbd>⌘ K</kbd>
          </button>
          <button
            className="quiet-button accessibility-button"
            onClick={() => setAccessibilityOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={accessibilityOpen}
            aria-label={uiCopy.openAccessibility}
          >
            <span aria-hidden="true">◌</span><span>{uiCopy.display}</span>
          </button>
          <div className="mode-switch" role="group" aria-label={uiCopy.experienceMode}>
            <button className={experienceMode === "beginner" ? "active" : ""} onClick={() => changeExperienceMode("beginner")}>{uiCopy.beginner}</button>
            <button className={experienceMode === "expert" ? "active" : ""} onClick={() => changeExperienceMode("expert")}>{uiCopy.expert}</button>
          </div>
          <button className="secondary-button" onClick={() => setTemplatesOpen(true)}>{uiCopy.templates}</button>
          <button className="secondary-button" onClick={() => setExportOpen(true)}>{uiCopy.export}</button>
          <button className="primary-button" onClick={simulate}>{uiCopy.runEstimate}</button>
        </div>
      </header>

      <aside className="component-panel">
        <div className="panel-heading">
           <div><span className="eyebrow">{uiCopy.vehicle}</span><h1 className="project-name-heading"><label className="sr-only" htmlFor="project-name">Project name</label><input id="project-name" className="project-name-input" type="text" maxLength={80} value={projectName} onChange={(event) => { setProjectName(event.target.value.slice(0, 80)); markChanged(); }} onBlur={() => setProjectName((current) => current.trim() || DEFAULT_PROJECT_NAME)} /></h1></div>
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
           <span>{uiCopy.componentsAndStages}</span>
           <button onClick={() => setTopologyOpen(true)}>{uiCopy.add}</button>
        </div>
        <nav className="component-list" aria-label="Rocket components">
          {components.map((component) => (
            <button
              className={selected === component.id ? "component active" : "component"}
              key={component.id}
              onClick={() => { setSelectedTopologyComponentId(null); setSelected(component.id); setView("design"); }}
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
          <div className="segmented-control" aria-label={uiCopy.workspaceView}>
            <button className={view === "design" ? "active" : ""} onClick={() => setView("design")}>{uiCopy.design}</button>
            <button className={view === "flight" ? "active" : ""} onClick={() => setView("flight")}>{uiCopy.flight}</button>
          </div>
          <div className="workspace-status" aria-label="Current vehicle context">
            <i className="status-pulse" aria-hidden="true" />
            <span>FLIGHT DESIGN / MISSION CONTROL / DESIGN LOOP</span><strong>{projectName} / SUSTAINER</strong>
          </div>
          <div className="mission-rack" aria-label="Mission telemetry">
            <div><span>CONFIG</span><strong>{configurationId}</strong></div>
            <div><span>STAGES</span><strong>{String(activeStageCount).padStart(2, "0")}</strong></div>
            <div className={engineeringReview.overallStatus === "nominal" ? "readout-ok" : "readout-warn"}>
              <span>CHECK</span><strong>{readinessLabel}</strong>
            </div>
            <div className={resultIsCurrent ? "readout-ok" : "readout-warn"}>
              <span>MODEL</span><strong>{resultIsCurrent ? "CURRENT" : "STALE"}</strong>
            </div>
          </div>
          <div className="view-tools">
            {view === "design" ? (
              <div className="design-view-toggle design-view-mode" role="group" aria-label={uiCopy.designVisualizationMode}>
                <button type="button" className={designView === "2d" ? "active" : ""} aria-pressed={designView === "2d"} aria-keyshortcuts="1" onClick={() => setDesignView("2d")} title="Orthographic side profile · press 1">{uiCopy.twoD}</button>
                <button type="button" className={designView === "3d-skeleton" ? "active" : ""} aria-pressed={designView === "3d-skeleton"} aria-keyshortcuts="2" onClick={() => setDesignView("3d-skeleton")} title="Low-ink structural wireframe · press 2">{uiCopy.threeDSkeleton}</button>
                <button type="button" className={designView === "3d-final" ? "active" : ""} aria-pressed={designView === "3d-final"} aria-keyshortcuts="3" onClick={() => setDesignView("3d-final")} title="Shaded display model · press 3">{uiCopy.threeDFinal}</button>
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
              <button className="primary-button" onClick={() => setTemplatesOpen(true)}>{uiCopy.chooseTemplate}</button>
              <button className="quiet-button" onClick={() => setGuideOpen((open) => !open)} aria-expanded={guideOpen} aria-controls="beginner-guide-detail">{guideOpen ? uiCopy.hideGuide : uiCopy.showGuide}</button>
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
            <div className="design-canvas design-canvas-2d">
              <div className="canvas-grid" />
              <div className="viewport-mode-badge topology-2d-mode-badge" aria-live="polite">
                <span>TOPOLOGY PROFILE</span>
                <strong>{activeStageCount} STAGE{activeStageCount === 1 ? "" : "S"}</strong>
              </div>
              <aside className="view-azimuth-rail" aria-label="2D viewing angle">
                <span className="view-azimuth-kicker">{uiCopy.twoDView}</span>
                <input
                  id="design-azimuth"
                  className="view-azimuth-slider"
                  type="range"
                  min={0}
                  max={359}
                  step={1}
                  value={designAzimuthDeg}
                  onChange={(event) => setDesignAzimuthDeg(Number(event.target.value))}
                   aria-label={`${uiCopy.twoDView} ${uiCopy.azimuth.toLowerCase()}`}
                  aria-orientation="vertical"
                />
                <output className="view-azimuth-readout" htmlFor="design-azimuth" aria-live="polite">{designAzimuthDeg}°</output>
                 <small>{uiCopy.azimuth}</small>
              </aside>
              <div className="dimension dimension-top"><span /><strong>{designLength} mm</strong><span /></div>
              <div className="rocket-assembly-orbit" style={{ transform: `perspective(960px) rotateY(${designAzimuthDeg}deg)` }}>
               <div className="rocket-assembly" aria-label={`${uiCopy.sideProfile} of the ${projectName} rocket at ${designAzimuthDeg} degrees ${uiCopy.azimuth.toLowerCase()}`}>
                  {topologyStageParts.map((part) => {
                    const stageId = part.id.replace(/-instance-\d+$/, "");
                    const stage = vehicleTopology.stages.find((candidate) => candidate.id === stageId);
                    if (!stage || stage.id === twoDCoreStageId || !stage.enabled) return null;
                    const noseWidthPx = Math.max(20, part.noseLengthM * twoDPxPerM);
                    const bodyWidthPx = Math.max(28, part.bodyLengthM * twoDPxPerM);
                    const bodyHeightPx = Math.max(20, Math.min(54, 58 * part.diameterM / twoDCoreDiameterM));
                    const finExtraPx = Math.min(18, part.finSpanM * twoDPxPerM * 0.28);
                    const profileHeightPx = bodyHeightPx + finExtraPx * 2;
                    return (
                      <button
                        className="topology-stage-profile"
                        key={part.id}
                        type="button"
                        style={{
                          left: `${twoDCoreNosePx + part.axialOffsetM * twoDPxPerM}px`,
                          top: `calc(50% + ${part.radialOffsetYM * twoDPxPerM - profileHeightPx / 2}px)`,
                          width: `${noseWidthPx + bodyWidthPx + 24}px`,
                          height: `${profileHeightPx}px`,
                        }}
                        aria-label={`${part.name} stage profile`}
                        onClick={() => { setTopologyOpen(true); notify(`${part.name} selected in vehicle topology`); }}
                      >
                        <span className={`topology-stage-profile-nose topology-stage-profile-nose-${part.noseProfile ?? "ogive"}`} style={{ width: `${noseWidthPx}px`, height: `${bodyHeightPx}px` }} />
                        <span className="topology-stage-profile-body" style={{ width: `${bodyWidthPx}px`, height: `${bodyHeightPx}px` }}><span>{part.name}</span></span>
                        <span className="topology-stage-profile-tail" style={{ height: `${bodyHeightPx}px` }} />
                        <i className="topology-stage-profile-fin topology-stage-profile-fin-top" style={{ bottom: `calc(50% + ${bodyHeightPx / 2 - 1}px)`, height: `${Math.max(8, finExtraPx)}px` }} />
                        <i className="topology-stage-profile-fin topology-stage-profile-fin-bottom" style={{ top: `calc(50% + ${bodyHeightPx / 2 - 1}px)`, height: `${Math.max(8, finExtraPx)}px` }} />
                      </button>
                    );
                  })}
                  {topologyComponentMarkers.map((marker) => {
                    const markerSizePx = marker.kind === "cylindricalPod" ? 10 : 7;
                    return (
                      <button
                        className={`topology-component-marker topology-component-marker-${marker.kind}`}
                        key={marker.id}
                        type="button"
                        style={{
                          left: `${twoDCoreNosePx + marker.axialPositionM * twoDPxPerM - markerSizePx / 2}px`,
                          top: `calc(50% + ${marker.radialPositionM * twoDPxPerM - markerSizePx / 2}px)`,
                          width: `${markerSizePx}px`,
                          height: `${markerSizePx}px`,
                        }}
                        aria-label={`${marker.name} custom component`}
                        title={`${marker.name} · open vehicle topology`}
                        onClick={() => {
                          setSelectedTopologyComponentId(marker.id.replace(/-instance-\d+$/, ""));
                          setTopologyOpen(true);
                          notify(`${marker.name} selected in vehicle topology`);
                        }}
                      />
                    );
                  })}
                  <div className={`rocket-nose rocket-nose-${noseProfile}`} style={{ width: `${twoDCoreNosePx}px` }} />
                  <div className="rocket-body" style={{ width: `${twoDCoreBodyPx}px` }}>
                    <div className="body-label">{projectName}</div><div className="body-band" /><div className="body-seam" />
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
              </div>
              <div className="centerline" />
               <div className="canvas-caption"><span>{uiCopy.sideProfile}</span><span>{designAzimuthDeg}° {uiCopy.azimuth.toLowerCase()}</span><span>{activeStageCount > 1 ? `${activeStageCount} stage profiles` : "Core profile"}</span><span>{uiCopy.dimensionsMillimetres}</span></div>
            </div>
          ) : (
            <div className="design-canvas design-canvas-3d">
              <div className="canvas-grid" />
              <div className="viewport-mode-badge" aria-live="polite">
                <span>DISPLAY MODE</span>
                <strong>{designView === "3d-skeleton" ? "3D SKELETON" : "3D FINAL"}</strong>
              </div>
              <Rocket3DViewport
                renderMode={designView === "3d-skeleton" ? "skeleton" : "final"}
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
                  setSelectedTopologyComponentId(null);
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
                  const topologyComponent = componentId.startsWith("topology-")
                    ? vehicleTopology.components.find((component) => `topology-${component.id}` === componentId)
                    : undefined;
                  if (topologyComponent) {
                    setSelectedTopologyComponentId(topologyComponent.id);
                    setSelected("body");
                    setView("design");
                    setToast(`${topologyComponent.name} selected · edit it in vehicle topology`);
                    window.setTimeout(() => setToast(""), 2600);
                    return;
                  }
                  setSelectedTopologyComponentId(null);
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
                <span className="model-badge">{publicModelVersion(result.modelVersion)}</span>
                <span className="model-badge model-badge-source" title={publicModelVersion(result.aerodynamicModelVersion) || "Explicit constant drag coefficient"}>
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
            {verticalConvergence && verticalConvergenceIsCurrent && (
              <section className="vertical-flight-convergence" aria-labelledby="vertical-flight-convergence-title">
                <div className="vertical-flight-convergence-heading">
                  <div>
                    <span className="eyebrow">Numerical check</span>
                    <h3 id="vertical-flight-convergence-title">Vertical integration-step convergence</h3>
                    <p>Replays the same fast model at half the step size to expose numerical sensitivity. This is a heuristic check, not validation, certification, or a flight-safety gate.</p>
                  </div>
                  <span className={`uncertainty-status uncertainty-status-${verticalConvergence.status}`}>
                    {verticalConvergence.status === "converged" ? "Step-stable heuristic" : verticalConvergence.status === "watch" ? "Step sensitivity watch" : "Not assessed"}
                  </span>
                </div>
                <div className="vertical-flight-convergence-grid">
                  <div><span>Step pair</span><strong>{verticalConvergence.baseTimeStepS.toFixed(3)} → {verticalConvergence.refinedTimeStepS.toFixed(3)} s</strong><small>coarse → half-step</small></div>
                  <div><span>Apogee shift</span><strong>{formatRelativeDifference(verticalConvergence.apogeeRelativeDifference)}</strong><small>relative difference</small></div>
                  <div><span>Peak speed shift</span><strong>{formatRelativeDifference(verticalConvergence.maxSpeedRelativeDifference)}</strong><small>relative difference</small></div>
                  <div><span>Peak q shift</span><strong>{formatRelativeDifference(verticalConvergence.maxDynamicPressureRelativeDifference)}</strong><small>relative difference</small></div>
                  <div><span>Apogee timing</span><strong>{formatAbsoluteDifference(verticalConvergence.apogeeTimeDifferenceS, "s")}</strong><small>absolute difference</small></div>
                  <div><span>Event timing</span><strong>{formatAbsoluteDifference(verticalConvergence.maximumEventTimeDifferenceS, "s")}</strong><small>{verticalConvergence.eventSetsMatch === false ? "event sets differ" : "maximum event delta"}</small></div>
                </div>
                {verticalConvergence.warnings.length > 0 && (
                  <ul className="vertical-flight-convergence-warnings">
                    {verticalConvergence.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                )}
                <small className="vertical-flight-convergence-model">{publicModelVersion(verticalConvergence.modelVersion)} · {verticalConvergence.validationStatus}</small>
              </section>
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
                <div className="stage-flight-model-options">
                  <div className="field-group">
                    <label htmlFor="released-body-force-model">Released-body force model</label>
                    <select
                      id="released-body-force-model"
                      value={coupledMutualGravityEnabled ? "mutual-gravity" : "shared-environment"}
                      onChange={(event) => {
                        setCoupledMutualGravityEnabled(event.target.value === "mutual-gravity");
                        markChanged();
                      }}
                    >
                      <option value="shared-environment">Shared environment only</option>
                      <option value="mutual-gravity">Include mutual point-mass gravity</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label htmlFor="released-body-drag-model">Released-body aerodynamics</label>
                    <select
                      id="released-body-drag-model"
                      value={releasedBodyDragModel}
                      onChange={(event) => {
                        setReleasedBodyDragModel(event.target.value as ReleasedBodyDragModel);
                        markChanged();
                      }}
                    >
                      <option value="isotropic-point">Isotropic point drag (baseline)</option>
                      <option value="attitude-projected-area">Projected-area + static aero loads (preview)</option>
                      <option value="coefficient-table">Validated coefficient-table loads</option>
                    </select>
                    <small>Projected mode blends geometry CdA with bounded normal force and moments. Coefficient-table mode queries the selected source at live Mach, Reynolds, angle, and sideslip; direct body-axis force/moment volumes take precedence when supplied.</small>
                  </div>
                  <div className="field-group">
                    <label htmlFor="released-body-relative-flow-mode">Released-body wake interaction</label>
                    <select
                      id="released-body-relative-flow-mode"
                      value={relativeAeroInteractionEnabled ? "enabled" : "disabled"}
                      onChange={(event) => {
                        setRelativeAeroInteractionEnabled(event.target.value === "enabled");
                        markChanged();
                      }}
                    >
                      <option value="enabled">Enabled (post-trace diagnostic)</option>
                      <option value="disabled">Disabled</option>
                    </select>
                    <small>Reports directed finite-wake overlap between the retained vehicle and released bodies. It never feeds a force or moment back into the trajectory.</small>
                  </div>
                  {relativeAeroInteractionEnabled && (
                    <>
                      <NumberField
                        id="released-body-wake-angle"
                        label="Wake half-angle"
                        value={relativeAeroWakeHalfAngleDeg}
                        unit="deg"
                        min={0}
                        max={45}
                        step={0.5}
                        slider
                        onChange={(value) => {
                          setRelativeAeroWakeHalfAngleDeg(value);
                          markChanged();
                        }}
                      />
                      <NumberField
                        id="released-body-wake-length"
                        label="Wake recovery distance"
                        value={relativeAeroWakeRecoveryDistanceBodyDiameters}
                        unit="body Ø"
                        min={1}
                        max={1_000}
                        step={1}
                        slider
                        onChange={(value) => {
                          setRelativeAeroWakeRecoveryDistanceBodyDiameters(value);
                          markChanged();
                        }}
                      />
                      <NumberField
                        id="released-body-wake-peak-deficit"
                        label="Peak velocity deficit"
                        value={relativeAeroPeakVelocityDeficitFraction * 100}
                        unit="%"
                        min={0}
                        max={relativeAeroMaximumVelocityDeficitFraction * 100}
                        step={1}
                        slider
                        onChange={(value) => {
                          setRelativeAeroPeakVelocityDeficitFraction(Math.min(value / 100, relativeAeroMaximumVelocityDeficitFraction));
                          markChanged();
                        }}
                      />
                      <NumberField
                        id="released-body-wake-max-deficit"
                        label="Maximum velocity deficit"
                        value={relativeAeroMaximumVelocityDeficitFraction * 100}
                        unit="%"
                        min={relativeAeroPeakVelocityDeficitFraction * 100}
                        max={99}
                        step={1}
                        slider
                        onChange={(value) => {
                          setRelativeAeroMaximumVelocityDeficitFraction(Math.max(value / 100, relativeAeroPeakVelocityDeficitFraction));
                          markChanged();
                        }}
                      />
                      <p className="field-help">The cone is a bounded wake-recovery proxy: wider angles and longer recovery distances increase geometric exposure, while the deficit values only scale the reported dynamic-pressure reduction. Tune against appropriately licensed wind-tunnel, CFD, or measured-flight evidence; these settings are not calibrated coefficients.</p>
                    </>
                  )}
                  {coupledMutualGravityEnabled && (
                    <NumberField
                      id="released-body-softening"
                      label="Close-approach softening radius"
                      value={coupledGravitySofteningRadiusM}
                      unit="m"
                      min={0}
                      max={1}
                      step={0.001}
                      onChange={(value) => {
                        setCoupledGravitySofteningRadiusM(value);
                        markChanged();
                      }}
                    />
                  )}
                  <div className="field-group">
                    <label htmlFor="released-body-contact-mode">Released-body envelope contact</label>
                    <select
                      id="released-body-contact-mode"
                      value={coupledContactEnabled ? "enabled" : "disabled"}
                      onChange={(event) => {
                        setCoupledContactEnabled(event.target.value === "enabled");
                        markChanged();
                      }}
                    >
                      <option value="disabled">Disabled (diagnostic screen only)</option>
                      <option value="enabled">Enabled (bounded normal force)</option>
                    </select>
                    <small>Applies equal-and-opposite spherical-envelope forces only between active released bodies with positive geometry radii.</small>
                  </div>
                  {coupledContactEnabled && (
                    <>
                      <NumberField
                        id="released-body-contact-stiffness"
                        label="Contact normal stiffness"
                        value={coupledContactStiffnessNPerM}
                        unit="N/m"
                        min={1}
                        max={1_000_000}
                        step={100}
                        slider
                        onChange={(value) => {
                          setCoupledContactStiffnessNPerM(value);
                          markChanged();
                        }}
                      />
                      <NumberField
                        id="released-body-contact-damping"
                        label="Contact closing-speed damping"
                        value={coupledContactDampingNsPerM}
                        unit="N/(m/s)"
                        min={0}
                        max={10_000}
                        step={10}
                        slider
                        onChange={(value) => {
                          setCoupledContactDampingNsPerM(value);
                          markChanged();
                        }}
                      />
                      <NumberField
                        id="released-body-contact-force-cap"
                        label="Maximum normal force"
                        value={coupledContactMaximumNormalForceN}
                        unit="N"
                        min={1}
                        max={5_000_000}
                        step={1_000}
                        slider
                        onChange={(value) => {
                          setCoupledContactMaximumNormalForceN(value);
                          markChanged();
                        }}
                      />
                    </>
                  )}
                  <NumberField
                    id="separation-contact-stopping-distance"
                    label="Contact stopping distance"
                    value={separationContactStoppingDistanceM}
                    unit="m"
                    min={0.0001}
                    max={0.25}
                    step={0.0001}
                    slider
                    onChange={(value) => {
                      setSeparationContactStoppingDistanceM(value);
                      markChanged();
                    }}
                  />
                  <NumberField
                    id="separation-contact-restitution"
                    label="Contact restitution"
                    value={separationContactCoefficientOfRestitution}
                    unit="e"
                    min={0}
                    max={1}
                    step={0.01}
                    slider
                    onChange={(value) => {
                      setSeparationContactCoefficientOfRestitution(value);
                      markChanged();
                    }}
                  />
                  <p className="field-help">The default track propagates released bodies in a common atmosphere and wind without inventing body-to-body forces. Mutual gravity is an opt-in point-mass extension; a non-zero softening radius regularizes close approaches and is not a contact or collision model.</p>
                  <p className="field-help">The envelope-contact branch is an opt-in bounded force feedback model for detached bodies. Retained-vehicle contact, friction, off-centre moments, deformation, plume interaction, and aerodynamic interference remain outside the solver.</p>
                  <p className="field-help">Contact stopping distance and restitution still feed only the post-trace compliance scenario. They estimate normal impulse and force scales after a potential envelope crossing; they never apply contact forces to the flight trajectory.</p>
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
                    <section className={`stage-mass-ratio-card stage-mass-ratio-${stageFlightResult.massRatio.overallStatus}`} aria-labelledby="stage-mass-ratio-title">
                      <div className="stage-mass-ratio-heading">
                        <div>
                          <span className="eyebrow">Staging performance</span>
                          <h4 id="stage-mass-ratio-title">Stage mass-ratio diagnostic</h4>
                          <p>Uses supplied stage mass properties and thrust-curve impulse for an ideal rocket-equation proxy. Downstream payload, gravity, drag, steering, residuals, and staging losses are excluded.</p>
                        </div>
                        <span className={`uncertainty-status uncertainty-status-${stageFlightResult.massRatio.overallStatus}`}>
                          {stageFlightResult.massRatio.overallStatus === "assessed" ? "ASSESSED PROXY" : stageFlightResult.massRatio.overallStatus === "review" ? "REVIEW" : "NOT ASSESSED"}
                        </span>
                      </div>
                      <div className="stage-mass-ratio-grid">
                        <div><span>Stages assessed</span><strong>{stageFlightResult.massRatio.assessedStageCount} / {stageFlightResult.massRatio.stages.length}</strong><small>logical stage rows</small></div>
                        <div><span>Ideal Δv sum</span><strong>{stageFlightResult.massRatio.totalIdealDeltaVMps === null ? "Not assessed" : `${stageFlightResult.massRatio.totalIdealDeltaVMps.toFixed(1)} m/s`}</strong><small>stage-only proxy</small></div>
                        <div><span>Model</span><strong>{publicModelVersion(stageFlightResult.massRatio.modelVersion)}</strong><small>{stageFlightResult.massRatio.validationStatus}</small></div>
                      </div>
                      <div className="stage-mass-ratio-list">
                        {stageFlightResult.massRatio.stages.map((stage) => (
                          <div className={`stage-mass-ratio-row stage-mass-ratio-row-${stage.status}`} key={stage.stageId}>
                            <div>
                              <strong>{stage.stageName}</strong>
                              <small>{stage.instanceCount} instance{stage.instanceCount === 1 ? "" : "s"} · full {stage.fullStageMassKg.toFixed(3)} kg · burnout {stage.burnoutStageMassKg.toFixed(3)} kg</small>
                            </div>
                            <div><span>R</span><strong>{stage.massRatio === null ? "—" : stage.massRatio.toFixed(2)}</strong></div>
                            <div><span>Ideal Δv</span><strong>{stage.idealDeltaVMps === null ? "—" : `${stage.idealDeltaVMps.toFixed(1)} m/s`}</strong></div>
                          </div>
                        ))}
                      </div>
                      <p className="stage-mass-ratio-note">{stageFlightResult.massRatio.warnings[0] ?? "Analytical ideal-rocket-equation diagnostic only; do not interpret as flight-safe performance."}</p>
                    </section>
                    <section className={`mission-mass-ratio-card stage-mass-ratio-card stage-mass-ratio-${stageFlightResult.missionMassRatio.overallStatus}`} aria-labelledby="mission-mass-ratio-title">
                      <div className="stage-mass-ratio-heading">
                        <div>
                          <span className="eyebrow">Mission stack</span>
                          <h4 id="mission-mass-ratio-title">Serial-stack mass-ratio preview</h4>
                          <p>Carries the retained payload and later serial-stage mass through each burn so downstream loading is visible. Parallel and booster stages remain explicitly excluded when the topology cannot be reduced to one serial stack.</p>
                        </div>
                        <span className={`uncertainty-status uncertainty-status-${stageFlightResult.missionMassRatio.overallStatus}`}>
                          {stageFlightResult.missionMassRatio.overallStatus === "assessed" ? "SERIAL PROXY" : stageFlightResult.missionMassRatio.overallStatus === "review" ? "REVIEW" : "NOT ASSESSED"}
                        </span>
                      </div>
                      <div className="stage-mass-ratio-grid">
                        <div><span>Retained payload</span><strong>{stageFlightResult.missionMassRatio.retainedPayloadMassKg.toFixed(3)} kg</strong><small>payload + recovery mass</small></div>
                        <div><span>Serial stages assessed</span><strong>{stageFlightResult.missionMassRatio.assessedStageCount} / {stageFlightResult.missionMassRatio.stages.length}</strong><small>burn-order rows</small></div>
                        <div><span>Ideal delta-v sum</span><strong>{stageFlightResult.missionMassRatio.totalIdealDeltaVMps === null ? "Not assessed" : `${stageFlightResult.missionMassRatio.totalIdealDeltaVMps.toFixed(1)} m/s`}</strong><small>serial-stack proxy</small></div>
                      </div>
                      <div className="mission-mass-ratio-list">
                        {stageFlightResult.missionMassRatio.stages.map((stage) => (
                          <div className={`mission-mass-ratio-row stage-mass-ratio-row-${stage.status}`} key={stage.stageId}>
                            <div>
                              <strong>{stage.sequenceIndex + 1}. {stage.stageName}</strong>
                              <small>upper stack {stage.upperStackMassKg.toFixed(3)} kg · burn {stage.initialAttachedMassKg.toFixed(3)} → {stage.burnoutAttachedMassKg.toFixed(3)} kg</small>
                            </div>
                            <div><span>R</span><strong>{stage.massRatio === null ? "—" : stage.massRatio.toFixed(2)}</strong></div>
                            <div><span>Ideal delta-v</span><strong>{stage.idealDeltaVMps === null ? "—" : `${stage.idealDeltaVMps.toFixed(1)} m/s`}</strong></div>
                          </div>
                        ))}
                      </div>
                      {stageFlightResult.missionMassRatio.excludedStageIds.length > 0 && <p className="stage-mass-ratio-note">Excluded topology stages: {stageFlightResult.missionMassRatio.excludedStageIds.join(", ")}. Their parallel burn/separation coupling remains in the trajectory preview rather than this serial composition diagnostic.</p>}
                      <p className="stage-mass-ratio-note">{stageFlightResult.missionMassRatio.warnings[0] ?? "Analytical serial-stack diagnostic only; do not interpret as flight-safe performance."}</p>
                      <small className="stage-mass-ratio-model">{publicModelVersion(stageFlightResult.missionMassRatio.modelVersion)} · {stageFlightResult.missionMassRatio.validationStatus}</small>
                    </section>
                    <section className={`stage-force-budget-card stage-force-budget-${stageFlightResult.forceBudget.status}`} aria-labelledby="stage-force-budget-title">
                      <div className="stage-force-budget-heading">
                        <div>
                          <span className="eyebrow">Trace accounting</span>
                          <h4 id="stage-force-budget-title">Force impulse budget</h4>
                          <p>Integrates the recorded scalar thrust, aerodynamic drag, recovery drag, and aerodynamic-force magnitudes so the force story is visible alongside the trajectory.</p>
                        </div>
                        <span className={`uncertainty-status uncertainty-status-${stageFlightResult.forceBudget.status}`}>
                          {stageFlightResult.forceBudget.status === "assessed" ? "ASSESSED TRACE" : "NOT ASSESSED"}
                        </span>
                      </div>
                      <div className="stage-force-budget-grid">
                        <div><span>Thrust impulse</span><strong>{stageFlightResult.forceBudget.thrustImpulseNs === null ? "Not assessed" : `${stageFlightResult.forceBudget.thrustImpulseNs.toFixed(1)} N·s`}</strong><small>trapezoidal trace integral</small></div>
                        <div><span>Combined drag impulse</span><strong>{stageFlightResult.forceBudget.combinedDragImpulseNs === null ? "Not assessed" : `${stageFlightResult.forceBudget.combinedDragImpulseNs.toFixed(1)} N·s`}</strong><small>aero + recovery</small></div>
                        <div><span>Drag / thrust equivalent</span><strong>{stageFlightResult.forceBudget.dragToThrustVelocityEquivalentRatio === null ? "Not assessed" : `${(stageFlightResult.forceBudget.dragToThrustVelocityEquivalentRatio * 100).toFixed(1)}%`}</strong><small>force/mass scalar ratio</small></div>
                        <div><span>Peak dynamic pressure</span><strong>{stageFlightResult.forceBudget.peakDynamicPressurePa === null ? "Not assessed" : `${stageFlightResult.forceBudget.peakDynamicPressurePa.toFixed(0)} Pa`}</strong><small>recorded trace maximum</small></div>
                      </div>
                      {stageFlightResult.forceBudget.stages.length > 0 && (
                        <div className="stage-force-budget-list">
                          {stageFlightResult.forceBudget.stages.map((stage) => (
                            <div className="stage-force-budget-row" key={stage.stageId}>
                              <div><strong>{stage.stageName}</strong><small>{stage.activeDurationS.toFixed(2)} s active · peak {stage.peakThrustN.toFixed(1)} N</small></div>
                              <div><span>Thrust</span><strong>{stage.thrustImpulseNs.toFixed(1)} N·s</strong></div>
                              <div><span>Drag</span><strong>{stage.combinedDragImpulseNs.toFixed(1)} N·s</strong></div>
                              <div><span>Peak q</span><strong>{stage.peakDynamicPressurePa === null ? "—" : `${stage.peakDynamicPressurePa.toFixed(0)} Pa`}</strong></div>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="stage-force-budget-note">{stageFlightResult.forceBudget.warnings[0] ?? "Scalar trace accounting only; velocity-equivalent values are not vector delta-v or mission loss terms."}</p>
                      <small className="stage-force-budget-model">{publicModelVersion(stageFlightResult.forceBudget.modelVersion)} · {stageFlightResult.forceBudget.validationStatus}</small>
                    </section>
                    <section className={`stage-vector-budget-card stage-vector-budget-${stageFlightResult.vectorBudget.closureStatus}`} aria-labelledby="stage-vector-budget-title">
                      <div className="stage-vector-budget-heading">
                        <div>
                          <span className="eyebrow">World-frame accounting</span>
                          <h4 id="stage-vector-budget-title">Vector impulse budget</h4>
                          <p>Integrates the recorded thrust, aerodynamic, gravity, and recovery force vectors in ENU coordinates, then checks them against the observed velocity change.</p>
                        </div>
                        <span className={`uncertainty-status uncertainty-status-${stageFlightResult.vectorBudget.closureStatus}`}>
                          {stageFlightResult.vectorBudget.closureStatus === "closed" ? "CLOSED TRACE" : stageFlightResult.vectorBudget.closureStatus === "review" ? "CLOSURE REVIEW" : "NOT ASSESSED"}
                        </span>
                      </div>
                      <div className="stage-vector-budget-grid">
                        <div><span>Thrust contribution</span><strong>{formatVectorMagnitude(stageFlightResult.vectorBudget.thrust)}</strong><small>world-frame ∫F/m dt</small></div>
                        <div><span>Aerodynamic contribution</span><strong>{formatVectorMagnitude(stageFlightResult.vectorBudget.aerodynamic)}</strong><small>drag + normal force</small></div>
                        <div><span>Gravity contribution</span><strong>{formatVectorMagnitude(stageFlightResult.vectorBudget.gravity)}</strong><small>world-frame ∫F/m dt</small></div>
                        <div><span>Recovery contribution</span><strong>{formatVectorMagnitude(stageFlightResult.vectorBudget.recovery)}</strong><small>canopy force only</small></div>
                        <div><span>Observed velocity change</span><strong>{formatWorldVector(stageFlightResult.vectorBudget.observedVelocityChangeWorldMps)}</strong><small>trace endpoints</small></div>
                        <div><span>Accounted velocity change</span><strong>{formatWorldVector(stageFlightResult.vectorBudget.accountedVelocityChangeWorldMps)}</strong><small>continuous + event Δv</small></div>
                        <div><span>Closure residual</span><strong>{stageFlightResult.vectorBudget.closureResidualMagnitudeMps === null ? "Not assessed" : `${stageFlightResult.vectorBudget.closureResidualMagnitudeMps.toFixed(3)} m/s`}</strong><small>tolerance {stageFlightResult.vectorBudget.closureToleranceMps.toFixed(3)} m/s</small></div>
                        <div><span>Discrete event Δv</span><strong>{formatWorldVector(stageFlightResult.vectorBudget.eventDeltaVWorldMps)}</strong><small>{stageFlightResult.vectorBudget.eventCount} applied event{stageFlightResult.vectorBudget.eventCount === 1 ? "" : "s"}</small></div>
                      </div>
                      <div className="stage-vector-budget-vectors">
                        <div><span>Thrust vector</span><strong>{formatWorldVector(stageFlightResult.vectorBudget.thrust?.deltaVWorldMps ?? null)}</strong></div>
                        <div><span>Aero vector</span><strong>{formatWorldVector(stageFlightResult.vectorBudget.aerodynamic?.deltaVWorldMps ?? null)}</strong></div>
                        <div><span>Gravity vector</span><strong>{formatWorldVector(stageFlightResult.vectorBudget.gravity?.deltaVWorldMps ?? null)}</strong></div>
                        <div><span>Recovery vector</span><strong>{formatWorldVector(stageFlightResult.vectorBudget.recovery?.deltaVWorldMps ?? null)}</strong></div>
                      </div>
                      <p className="stage-vector-budget-note">{stageFlightResult.vectorBudget.warnings[0] ?? "World-frame vector accounting only; this is not a validated mission delta-v or flight-safety result."}</p>
                      <small className="stage-vector-budget-model">{publicModelVersion(stageFlightResult.vectorBudget.modelVersion)} / {stageFlightResult.vectorBudget.validationStatus}</small>
                    </section>
                    <section className={`stage-loss-budget-card stage-loss-budget-${stageFlightResult.missionLossBudget.status}`} aria-labelledby="stage-loss-budget-title">
                      <div className="stage-loss-budget-heading">
                        <div>
                          <span className="eyebrow">Mission performance screen</span>
                          <h4 id="stage-loss-budget-title">Thrust-axis loss accounting</h4>
                          <p>Projects recorded gravity, aerodynamic, recovery, and event contributions onto the local thrust direction so steering dispersion and opposing components are visible without claiming a validated mission budget.</p>
                        </div>
                        <span className={`uncertainty-status uncertainty-status-${stageFlightResult.missionLossBudget.status}`}>
                          {stageFlightResult.missionLossBudget.status === "assessed" ? "AXIS COVERED" : stageFlightResult.missionLossBudget.status === "partial" ? "PARTIAL AXIS" : "NOT ASSESSED"}
                        </span>
                      </div>
                      <div className="stage-loss-budget-grid">
                        <div><span>Thrust impulse equivalent</span><strong>{stageFlightResult.missionLossBudget.thrustImpulseEquivalentMps === null ? "Not assessed" : `${stageFlightResult.missionLossBudget.thrustImpulseEquivalentMps.toFixed(2)} m/s`}</strong><small>∫‖F thrust‖/m dt</small></div>
                        <div><span>Net thrust Δv</span><strong>{stageFlightResult.missionLossBudget.netThrustDeltaVMagnitudeMps === null ? "Not assessed" : `${stageFlightResult.missionLossBudget.netThrustDeltaVMagnitudeMps.toFixed(2)} m/s`}</strong><small>magnitude of vector integral</small></div>
                        <div><span>Steering dispersion</span><strong>{stageFlightResult.missionLossBudget.steeringDispersionMps === null ? "Not assessed" : `${stageFlightResult.missionLossBudget.steeringDispersionMps.toFixed(2)} m/s`}</strong><small>scalar–vector gap</small></div>
                        <div><span>Thrust-axis coverage</span><strong>{(stageFlightResult.missionLossBudget.thrustAxisCoverageFraction * 100).toFixed(1)}%</strong><small>{stageFlightResult.missionLossBudget.thrustAxisSampleCount} active-axis samples</small></div>
                      </div>
                      <div className="stage-loss-budget-components">
                        <div><span>Gravity opposition</span><strong>{stageFlightResult.missionLossBudget.gravity === null ? "Not assessed" : `${stageFlightResult.missionLossBudget.gravity.opposingMps.toFixed(2)} m/s`}</strong><small>positive opposing projection</small></div>
                        <div><span>Aero opposition</span><strong>{stageFlightResult.missionLossBudget.aerodynamic === null ? "Not assessed" : `${stageFlightResult.missionLossBudget.aerodynamic.opposingMps.toFixed(2)} m/s`}</strong><small>drag + normal force</small></div>
                        <div><span>Recovery opposition</span><strong>{stageFlightResult.missionLossBudget.recovery === null ? "Not assessed" : `${stageFlightResult.missionLossBudget.recovery.opposingMps.toFixed(2)} m/s`}</strong><small>canopy/load component</small></div>
                        <div><span>Event opposition</span><strong>{stageFlightResult.missionLossBudget.discreteEvents === null ? "Not projected" : `${stageFlightResult.missionLossBudget.discreteEvents.opposingMps.toFixed(2)} m/s`}</strong><small>{stageFlightResult.missionLossBudget.projectedEventCount} / {stageFlightResult.missionLossBudget.eventCount} events projected</small></div>
                      </div>
                      <p className="stage-loss-budget-note">{stageFlightResult.missionLossBudget.warnings[0] ?? "Analytical thrust-axis projection only; do not interpret as mission performance or flight-safety evidence."}</p>
                      <small className="stage-loss-budget-model">{publicModelVersion(stageFlightResult.missionLossBudget.modelVersion)} / {stageFlightResult.missionLossBudget.validationStatus}</small>
                    </section>
                    <section className={`stage-delta-v-bridge-card stage-delta-v-bridge-${stageFlightResult.missionDeltaVBridge.status}`} aria-labelledby="stage-delta-v-bridge-title">
                      <div className="stage-delta-v-bridge-heading">
                        <div>
                          <span className="eyebrow">Composition comparison</span>
                          <h4 id="stage-delta-v-bridge-title">Ideal-to-trace delta-v bridge</h4>
                          <p>Lines up the serial-stack ideal composition preview with the recorded thrust integral so topology and mass-model differences are visible without treating the gap as achieved performance.</p>
                        </div>
                        <span className={`uncertainty-status uncertainty-status-${stageFlightResult.missionDeltaVBridge.status}`}>
                          {stageFlightResult.missionDeltaVBridge.status === "assessed" ? "COMPARISON READY" : stageFlightResult.missionDeltaVBridge.status === "partial" ? "PARTIAL COMPARISON" : "NOT ASSESSED"}
                        </span>
                      </div>
                      <div className="stage-delta-v-bridge-grid">
                        <div><span>Ideal serial-stack Δv</span><strong>{stageFlightResult.missionDeltaVBridge.idealSerialStackDeltaVMps === null ? "Not assessed" : `${stageFlightResult.missionDeltaVBridge.idealSerialStackDeltaVMps.toFixed(2)} m/s`}</strong><small>downstream-mass composition</small></div>
                        <div><span>Trace thrust integral</span><strong>{stageFlightResult.missionDeltaVBridge.traceThrustImpulseEquivalentMps === null ? "Not assessed" : `${stageFlightResult.missionDeltaVBridge.traceThrustImpulseEquivalentMps.toFixed(2)} m/s`}</strong><small>∫‖F thrust‖/m dt</small></div>
                        <div><span>Signed ideal → trace gap</span><strong>{stageFlightResult.missionDeltaVBridge.idealToTraceGapMps === null ? "Not assessed" : `${stageFlightResult.missionDeltaVBridge.idealToTraceGapMps.toFixed(2)} m/s`}</strong><small>ideal minus trace</small></div>
                        <div><span>Trace / ideal</span><strong>{stageFlightResult.missionDeltaVBridge.traceToIdealFraction === null ? "Not defined" : `${(stageFlightResult.missionDeltaVBridge.traceToIdealFraction * 100).toFixed(1)}%`}</strong><small>scalar comparison only</small></div>
                        <div><span>Ideal → net-vector gap</span><strong>{stageFlightResult.missionDeltaVBridge.idealToNetThrustGapMps === null ? "Not assessed" : `${stageFlightResult.missionDeltaVBridge.idealToNetThrustGapMps.toFixed(2)} m/s`}</strong><small>vector magnitude comparison</small></div>
                        <div><span>Thrust-axis coverage</span><strong>{(stageFlightResult.missionDeltaVBridge.thrustAxisCoverageFraction * 100).toFixed(1)}%</strong><small>{stageFlightResult.missionDeltaVBridge.serialStageCount} serial / {stageFlightResult.missionDeltaVBridge.excludedStageCount} excluded</small></div>
                      </div>
                      <p className="stage-delta-v-bridge-note">{stageFlightResult.missionDeltaVBridge.warnings[0] ?? "Analytical composition-to-trace comparison only; do not interpret as mission performance or flight-safety evidence."}</p>
                      <small className="stage-delta-v-bridge-model">{publicModelVersion(stageFlightResult.missionDeltaVBridge.modelVersion)} / {stageFlightResult.missionDeltaVBridge.validationStatus}</small>
                    </section>
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
                        <small className="recovery-opening-load-model">{publicModelVersion(stageRecoveryOpeningLoad.modelVersion)} · {stageRecoveryOpeningLoad.validationStatus}</small>
                      </section>
                    )}
                    {stageFlightResult.rail && (
                      <div className="stage-flight-rail" aria-label="Launch rail handoff">
                        <div><span>RAIL CONSTRAINT</span><strong>{stageFlightResult.rail.freeFlight ? "Released to free flight" : "No rail exit"}</strong></div>
                        <div><span>GUIDE LOSS</span><strong>{stageFlightResult.rail.guideFrictionAccelerationMps2.toFixed(2)} m/s²</strong><small>effective axial</small></div>
                        <div><span>TIP-OFF RATE</span><strong>{(magnitude(stageFlightResult.rail.tipOffAngularVelocityBodyRadS) * 180 / Math.PI).toFixed(2)} deg/s</strong><small>release boundary</small></div>
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
                            <p>Configured cluster availability, retained failed-motor propellant, and individual thrust-curve peak spread at pad initialization. This is a deterministic preview check, not a hardware-health, synchronized net-force, or ignition-probability estimate.</p>
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
                                <div><span>Available peak sum</span><strong>{diagnostic.peakCurveThrustN.toFixed(1)} N</strong></div>
                                <div><span>Peak spread</span><strong>{diagnostic.peakCurveSpreadN === null ? "not assessed" : `${diagnostic.peakCurveSpreadN.toFixed(1)} N`}</strong></div>
                                <div><span>Spread fraction</span><strong>{diagnostic.peakCurveSpreadFraction === null ? "not assessed" : `${(diagnostic.peakCurveSpreadFraction * 100).toFixed(1)}%`}</strong></div>
                              </div>
                              {diagnostic.motorPeakThrusts.length > 1 && (
                                <div className="stage-flight-cluster-motor-peaks" aria-label={`${diagnostic.stageName} individual thrust-curve peaks`}>
                                  {diagnostic.motorPeakThrusts.map((motor, index) => (
                                    <div key={`${diagnostic.stageId}-${motor.id}-${index}`}>
                                      <span>{motor.name}</span>
                                      <strong>{motor.peakThrustN.toFixed(1)} N{motor.ignitionFailure ? " · failed" : ""}</strong>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <p>{diagnostic.note}</p>
                            </article>
                          ))}
                        </div>
                      </section>
                    )}
                    <section className="stage-event-allocation" aria-labelledby="stage-event-allocation-title">
                      <div className="stage-event-allocation-heading">
                        <div>
                          <span className="eyebrow">Mission sequencing</span>
                          <h4 id="stage-event-allocation-title">Event allocator</h4>
                          <p>Resolves simultaneous rail, separation, ignition, failure, and recovery transitions with explicit semantic priorities. It never changes trigger predicates or claims flight validation.</p>
                        </div>
                        <span className={`stage-event-allocation-status stage-event-allocation-status-${stageFlightResult.eventAllocation.status}`}>
                          {stageFlightResult.eventAllocation.status}
                        </span>
                      </div>
                      <div className="stage-event-allocation-grid">
                        <div><span>Declared events</span><strong>{stageFlightResult.eventAllocation.orderedEventIds.length}</strong><small>stable allocation order</small></div>
                        <div><span>Simultaneous groups</span><strong>{stageFlightResult.eventAllocation.sameTimeGroups.length}</strong><small>time-hint groups</small></div>
                        <div><span>Dependencies</span><strong>{stageFlightResult.eventAllocation.dependencies.length}</strong><small>explicit ordering edges</small></div>
                        <div><span>Allocator</span><strong>{publicModelVersion(stageFlightResult.eventAllocation.modelVersion)}</strong><small>{stageFlightResult.eventAllocation.validationStatus}</small></div>
                      </div>
                      {stageFlightResult.eventAllocation.sameTimeGroups.length > 0 && (
                        <div className="stage-event-allocation-groups">
                          {stageFlightResult.eventAllocation.sameTimeGroups.slice(0, 4).map((group) => (
                            <div key={`${group.timeS}-${group.eventIds.join("|")}`}><span>{group.timeS.toFixed(3)} s</span><strong>{group.eventIds.join(" → ")}</strong></div>
                          ))}
                        </div>
                      )}
                      {stageFlightResult.eventAllocation.warnings.length > 0 && (
                        <ul className="stage-event-allocation-warnings">
                          {stageFlightResult.eventAllocation.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}
                        </ul>
                      )}
                    </section>
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
                    {stageFlightResult.simulation?.integration && (
                      <section className="stage-flight-convergence" aria-labelledby="stage-flight-integrator-title">
                        <div className="stage-flight-convergence-heading">
                          <div>
                            <span className="eyebrow">Numerical method</span>
                            <h4 id="stage-flight-integrator-title">6DOF integrator diagnostics</h4>
                            <p>Reports the actual free-flight integrator used for this run. Adaptive error is a numerical truncation estimate only; it does not validate the loads or flight model.</p>
                          </div>
                          <span className="uncertainty-status uncertainty-status-assessed">
                            {stageFlightResult.simulation.integration.method === "adaptive-rk4-step-doubling" ? "ADAPTIVE" : "FIXED RK4"}
                          </span>
                        </div>
                        <div className="stage-flight-convergence-grid">
                          <div><span>Accepted internal steps</span><strong>{stageFlightResult.simulation.integration.acceptedStepCount}</strong><small>free-flight propagation</small></div>
                          <div><span>Rejected steps</span><strong>{stageFlightResult.simulation.integration.rejectedStepCount}</strong><small>tolerance retries</small></div>
                          <div><span>Accepted step range</span><strong>{stageFlightResult.simulation.integration.minimumAcceptedStepS === null ? "—" : `${stageFlightResult.simulation.integration.minimumAcceptedStepS.toExponential(2)} → ${stageFlightResult.simulation.integration.maximumAcceptedStepS!.toExponential(2)} s`}</strong><small>internal span</small></div>
                          <div><span>Max normalized error</span><strong>{stageFlightResult.simulation.integration.maximumNormalizedError === null ? "Not estimated" : stageFlightResult.simulation.integration.maximumNormalizedError.toFixed(3)}</strong><small>{stageFlightResult.simulation.integration.method === "adaptive-rk4-step-doubling" ? "accepted-step estimate" : "fixed-step mode"}</small></div>
                        </div>
                      </section>
                    )}
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
                              <div><span>Closing speed at closest pair</span><strong>{stageFlightResult.multiBodySeparation.closestPair?.closingSpeedMps === null || stageFlightResult.multiBodySeparation.closestPair?.closingSpeedMps === undefined ? "Not estimated" : `${stageFlightResult.multiBodySeparation.closestPair.closingSpeedMps.toFixed(2)} m/s`}</strong><small>kinematic telemetry only</small></div>
                              <div><span>Analysis start</span><strong>{stageFlightResult.multiBodySeparation.releaseTimeS.toFixed(2)} s</strong><small>earliest body release</small></div>
                            </div>
                            {stageFlightResult.multiBodySeparation.warnings.length > 0 && (
                              <ul className="stage-multi-body-separation-warnings">
                                {stageFlightResult.multiBodySeparation.warnings.slice(0, 2).map((warning) => <li key={warning}>{warning}</li>)}
                              </ul>
                            )}
                          </div>
                        )}
                        {stageFlightResult.coupledMultiBodyFlight && (
                          <div className="stage-coupled-multi-body-flight">
                            <div className="stage-coupled-multi-body-flight-heading">
                              <div>
                                <span className="eyebrow">Shared-grid propagation</span>
                                <h5>Coupled detached-body flight</h5>
                                  <p>Runs every released body together on one mission-time grid with shared gravity, atmosphere, and wind queries. Bodies may opt into an explicit quaternion/inertia state and bounded spherical-envelope contact; retained-vehicle contact, plume, and aerodynamic interference remain out of scope.</p>
                              </div>
                              <span className={`stage-coupled-multi-body-flight-status stage-coupled-multi-body-flight-status-${stageFlightResult.coupledMultiBodyFlight.status}`}>
                                {stageFlightResult.coupledMultiBodyFlight.status}
                              </span>
                            </div>
                            <div className="stage-coupled-multi-body-flight-grid">
                              <div><span>Propagated bodies</span><strong>{stageFlightResult.coupledMultiBodyFlight.trajectories.length}</strong><small>shared mission track</small></div>
                              <div><span>Integration steps</span><strong>{stageFlightResult.coupledMultiBodyFlight.stepCount}</strong><small>{stageFlightResult.coupledMultiBodyFlight.timeStepS.toFixed(3)} s effective step</small></div>
                               <div><span>Minimum COM separation</span><strong>{stageFlightResult.coupledMultiBodyFlight.minimumDistanceM === null ? "Not assessed" : `${stageFlightResult.coupledMultiBodyFlight.minimumDistanceM.toFixed(2)} m`}</strong><small>{stageFlightResult.coupledMultiBodyFlight.closestPair ? `closest at ${stageFlightResult.coupledMultiBodyFlight.closestPair.timeS.toFixed(2)} s` : "no pairwise overlap"}</small></div>
                               <div><span>Rigid-body states</span><strong>{stageFlightResult.coupledMultiBodyFlight.rigidBodyCount}</strong><small>{stageFlightResult.coupledMultiBodyFlight.rigidBodyCount > 0 ? "attitude + angular-rate traces" : "point-mass translation"}</small></div>
                              <div><span>Detached aero mode</span><strong>{stageFlightResult.releasedBodyDragModel === "coefficient-table" ? "Coefficient table" : stageFlightResult.releasedBodyDragModel === "attitude-projected-area" ? "Projected area" : "Isotropic point"}</strong><small>selected released-body contract</small></div>
                               <div><span>Coupled integrator</span><strong>{stageFlightResult.coupledMultiBodyFlight.integration.method === "adaptive-rk4-step-doubling" ? "Adaptive RK4" : "Fixed RK4"}</strong><small>{stageFlightResult.coupledMultiBodyFlight.integration.acceptedStepCount} accepted · {stageFlightResult.coupledMultiBodyFlight.integration.rejectedStepCount} rejected</small></div>
                              <div><span>Released-body force model</span><strong>{stageFlightResult.coupledMultiBodyFlight.mutualGravity.enabled ? "Mutual gravity" : "Shared environment"}</strong><small>{stageFlightResult.coupledMultiBodyFlight.mutualGravity.enabled && stageFlightResult.coupledMultiBodyFlight.mutualGravity.softeningRadiusM > 0 ? `ε ${stageFlightResult.coupledMultiBodyFlight.mutualGravity.softeningRadiusM.toFixed(3)} m` : "point-path coupling"}</small></div>
                              <div><span>Release window</span><strong>{stageFlightResult.coupledMultiBodyFlight.startTimeS.toFixed(2)} → {stageFlightResult.coupledMultiBodyFlight.endTimeS.toFixed(2)} s</strong><small>{publicModelVersion(stageFlightResult.coupledMultiBodyFlight.modelVersion)}</small></div>
                            </div>
                            <div className="stage-coupled-multi-body-flight-drag-summary">
                              <span>Attitude-dependent drag</span>
                              <strong>{stageFlightResult.coupledMultiBodyFlight.trajectories.filter((trajectory) => trajectory.attitudeDependentDrag && trajectory.aerodynamicBasis === undefined).length} bodies</strong>
                              <small>{stageFlightResult.coupledMultiBodyFlight.trajectories.some((trajectory) => trajectory.attitudeDependentDrag && trajectory.aerodynamicBasis === undefined) ? "Incidence-aware CdA diagnostics are retained on the shared trace." : "Isotropic point-drag baseline is active unless a static aero basis is supplied."}</small>
                            </div>
                            {stageFlightResult.coupledMultiBodyFlight.contact.enabled && (
                              <div className="stage-coupled-multi-body-flight-contact-summary">
                                <span>Envelope contact diagnostics</span>
                                <strong>{stageFlightResult.coupledMultiBodyFlight.contact.maximumPenetrationM === null ? "No overlap" : `${(stageFlightResult.coupledMultiBodyFlight.contact.maximumPenetrationM * 1000).toFixed(1)} mm max penetration`}</strong>
                                <small>{stageFlightResult.coupledMultiBodyFlight.contact.maximumNormalForceNObserved === null ? "No normal force applied" : `${stageFlightResult.coupledMultiBodyFlight.contact.maximumNormalForceNObserved.toFixed(1)} N peak normal force · ${publicModelVersion(stageFlightResult.coupledMultiBodyFlight.contact.modelVersion)}`}</small>
                              </div>
                            )}
                            <div className="stage-coupled-multi-body-flight-aero-summary">
                              <span>Static aerodynamic loads</span>
                              <strong>{stageFlightResult.coupledMultiBodyFlight.aerodynamicBodyCount} bodies</strong>
                              <small>{stageFlightResult.coupledMultiBodyFlight.trajectories.reduce((total, trajectory) => total + trajectory.trace.filter((point) => point.aerodynamicNormalForceN !== undefined).length, 0)} normal-force samples · bounded CP moments and supplied rate damping remain analytical checks.</small>
                            </div>
                            <div className="stage-coupled-multi-body-flight-list">
                              {stageFlightResult.coupledMultiBodyFlight.trajectories.map((trajectory) => (
                                <div key={trajectory.id}>
                                  <span>{trajectory.label}</span>
                                  <strong>{trajectory.maxAltitudeAglM.toFixed(1)} m peak · {trajectory.maxSpeedMps.toFixed(1)} m/s</strong>
                                  <small>{trajectory.impactTimeS === null ? "No ground crossing in window" : `Ground crossing ${trajectory.impactTimeS.toFixed(2)} s`} · {Math.hypot(trajectory.velocityAdjustmentWorldMps.x, trajectory.velocityAdjustmentWorldMps.y, trajectory.velocityAdjustmentWorldMps.z) > 1e-9 ? `event correction ${Math.hypot(trajectory.velocityAdjustmentWorldMps.x, trajectory.velocityAdjustmentWorldMps.y, trajectory.velocityAdjustmentWorldMps.z).toFixed(4)} m/s` : "baseline release velocity"}</small>
                                </div>
                              ))}
                            </div>
                            {stageFlightResult.coupledMultiBodyFlight.warnings.length > 0 && (
                              <ul className="stage-coupled-multi-body-flight-warnings">
                                {stageFlightResult.coupledMultiBodyFlight.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}
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
                              <div><span>Measured impulses</span><strong>{stageFlightResult.separationDynamics.filter((audit) => audit.retainedImpulseBodyNs !== null).length}</strong><small>source vectors retained</small></div>
                              <div><span>Model</span><strong>{publicModelVersion(stageFlightResult.separationDynamics[0].modelVersion)}</strong><small>conservation audit only</small></div>
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
                              <div><span>Model</span><strong>{publicModelVersion(stageFlightResult.separationImpulseSolutions[0].modelVersion)}</strong><small>event-level only</small></div>
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
                              <div><span>Closing speed at closest approach</span><strong>{stageFlightResult.separationEnvelope.closestEnvelopePair?.closingSpeedMps === null || stageFlightResult.separationEnvelope.closestEnvelopePair?.closingSpeedMps === undefined ? "Not estimated" : `${stageFlightResult.separationEnvelope.closestEnvelopePair.closingSpeedMps.toFixed(2)} m/s`}</strong><small>kinematic telemetry only</small></div>
                              <div><span>Overlap screen</span><strong>{stageFlightResult.separationEnvelope.closestEnvelopePair && stageFlightResult.separationEnvelope.closestEnvelopePair.clearanceM <= 0 ? "Potential overlap" : stageFlightResult.separationEnvelope.envelopeStatus === "not-assessed" ? "Not assessed" : "No overlap in assessed path"}</strong><small>not a collision solver</small></div>
                            </div>
                            {stageFlightResult.separationEnvelope.warnings.length > 0 && (
                              <ul className="stage-separation-envelope-warnings">
                                {stageFlightResult.separationEnvelope.warnings.slice(0, 2).map((warning) => <li key={warning}>{warning}</li>)}
                              </ul>
                            )}
                          </div>
                        )}
                        {stageFlightResult.separationContact && (
                          <div className="stage-separation-contact">
                            <div className="stage-separation-contact-heading">
                              <div>
                                <span className="eyebrow">Relative kinematics / review screen</span>
                                <h5>Potential contact and relative-load screen</h5>
                                <p>Root-finds first fixed-envelope contact on the shared released-body paths and reports centre-of-mass closing kinematics plus a relative kinetic-energy proxy. It does not apply contact forces or predict structural loads.</p>
                              </div>
                              <span className={`stage-separation-contact-status stage-separation-contact-status-${stageFlightResult.separationContact.contactStatus}`}>
                                {stageFlightResult.separationContact.contactStatus}
                              </span>
                            </div>
                            <div className="stage-separation-contact-grid">
                              <div><span>Assessed pairs</span><strong>{stageFlightResult.separationContact.assessedPairCount} / {stageFlightResult.separationContact.pairs.length}</strong><small>{stageFlightResult.separationContact.status} geometry coverage</small></div>
                              <div><span>Potential contact pairs</span><strong>{stageFlightResult.separationContact.contactPairCount}</strong><small>{stageFlightResult.separationContact.contactStatus === "contact-detected" ? "fixed-envelope crossing" : "no crossing in assessed paths"}</small></div>
                              <div><span>First contact</span><strong>{stageFlightResult.separationContact.firstContactPair ? `${stageFlightResult.separationContact.firstContactPair.firstBodyId} / ${stageFlightResult.separationContact.firstContactPair.secondBodyId}` : "Not detected"}</strong><small>{stageFlightResult.separationContact.firstContactPair ? `at ${stageFlightResult.separationContact.firstContactPair.timeS.toFixed(2)} s` : "requires two geometry bounds"}</small></div>
                              <div><span>Closing speed at contact</span><strong>{stageFlightResult.separationContact.firstContactPair?.closingSpeedMps === null || stageFlightResult.separationContact.firstContactPair?.closingSpeedMps === undefined ? "Not estimated" : `${stageFlightResult.separationContact.firstContactPair.closingSpeedMps.toFixed(2)} m/s`}</strong><small>centre-of-mass kinematics</small></div>
                              <div><span>Relative COM energy</span><strong>{stageFlightResult.separationContact.firstContactPair?.relativeKineticEnergyJ === null || stageFlightResult.separationContact.firstContactPair?.relativeKineticEnergyJ === undefined ? "Not available" : `${stageFlightResult.separationContact.firstContactPair.relativeKineticEnergyJ.toFixed(2)} J`}</strong><small>reduced-mass proxy only</small></div>
                              <div><span>Minimum clearance</span><strong>{stageFlightResult.separationContact.minimumClearanceM === null ? "Not assessed" : `${stageFlightResult.separationContact.minimumClearanceM.toFixed(2)} m`}</strong><small>{stageFlightResult.separationContact.closestPair ? `at ${stageFlightResult.separationContact.closestPair.timeS.toFixed(2)} s` : "no geometry-qualified pair"}</small></div>
                            </div>
                            {stageFlightResult.separationContact.warnings.length > 0 && (
                              <ul className="stage-separation-contact-warnings">
                                {stageFlightResult.separationContact.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}
                              </ul>
                            )}
                          </div>
                        )}
                        {stageFlightResult.separationContactLoad && (
                          <div className={`stage-separation-contact-load stage-separation-contact-load-${stageFlightResult.separationContactLoad.status}`}>
                            <div className="stage-separation-contact-load-heading">
                              <div>
                                <span className="eyebrow">Compliance scenario</span>
                                <h5>Contact impulse and force-scale estimate</h5>
                                <p>Applies the selected stopping distance and restitution to detected envelope contacts. This is a post-trace normal compliance scenario; it never feeds forces back into the flight path.</p>
                              </div>
                              <span className="stage-separation-contact-load-status">{stageFlightResult.separationContactLoad.status}</span>
                            </div>
                            <div className="stage-separation-contact-load-grid">
                              <div><span>Contact pairs assessed</span><strong>{stageFlightResult.separationContactLoad.assessedPairCount} / {stageFlightResult.separationContactLoad.contactPairCount}</strong><small>positive closing speed + mass</small></div>
                              <div><span>Stopping distance</span><strong>{(stageFlightResult.separationContactLoad.stoppingDistanceM * 1000).toFixed(1)} mm</strong><small>scenario input</small></div>
                              <div><span>Restitution</span><strong>{stageFlightResult.separationContactLoad.coefficientOfRestitution.toFixed(2)}</strong><small>normal e</small></div>
                              <div><span>Maximum normal impulse</span><strong>{stageFlightResult.separationContactLoad.maximumNormalImpulseNs === null ? "Not assessed" : `${stageFlightResult.separationContactLoad.maximumNormalImpulseNs.toFixed(2)} N·s`}</strong><small>J = (1 + e) μ vₙ</small></div>
                              <div><span>Peak force scale</span><strong>{stageFlightResult.separationContactLoad.maximumLinearStopPeakForceN === null ? "Not assessed" : `${stageFlightResult.separationContactLoad.maximumLinearStopPeakForceN.toFixed(1)} N`}</strong><small>linear compliance 2Eₙ/d</small></div>
                              <div><span>Absorbed normal energy</span><strong>{stageFlightResult.separationContactLoad.maximumAbsorbedNormalEnergyJ === null ? "Not assessed" : `${stageFlightResult.separationContactLoad.maximumAbsorbedNormalEnergyJ.toFixed(2)} J`}</strong><small>after rebound allowance</small></div>
                            </div>
                            <div className="stage-separation-contact-load-list">
                              {stageFlightResult.separationContactLoad.pairs.filter((pair) => pair.contactStatus === "contact-detected").map((pair) => (
                                <div key={`${pair.firstBodyId}-${pair.secondBodyId}`}>
                                  <strong>{pair.firstBodyLabel} / {pair.secondBodyLabel}</strong>
                                  <span>{pair.averageAbsorptionForceN === null ? "Not assessed" : `${pair.averageAbsorptionForceN.toFixed(1)} N avg absorption`} · {pair.linearStopPeakForceN === null ? "no peak scale" : `${pair.linearStopPeakForceN.toFixed(1)} N linear-stop scale`}</span>
                                </div>
                              ))}
                            </div>
                            <p className="stage-separation-contact-load-note">{stageFlightResult.separationContactLoad.warnings[0] ?? "Compliance scenario only; not a structural or flight-safety result."}</p>
                            <small className="stage-separation-contact-load-model">{publicModelVersion(stageFlightResult.separationContactLoad.modelVersion)} · {stageFlightResult.separationContactLoad.validationStatus}</small>
                          </div>
                        )}
                        {stageFlightResult.relativeAeroInteraction && (
                          <div className={`stage-relative-aero-interaction stage-relative-aero-interaction-${stageFlightResult.relativeAeroInteraction.status}`}>
                            <div className="stage-relative-aero-interaction-heading">
                              <div>
                                <span className="eyebrow">Relative flow / wake review</span>
                                <h5>Released-body aerodynamic interaction screen</h5>
                                <p>Checks directed finite wake-cone overlap on the released-body traces and estimates a bounded velocity-deficit / dynamic-pressure proxy. It is post-processing only and never changes the flight path.</p>
                              </div>
                              <span className="stage-relative-aero-interaction-status">{stageFlightResult.relativeAeroInteraction.status}</span>
                            </div>
                            <div className="stage-relative-aero-interaction-grid">
                              <div><span>Directed pairs assessed</span><strong>{stageFlightResult.relativeAeroInteraction.assessedPairCount} / {stageFlightResult.relativeAeroInteraction.pairs.length}</strong><small>source → target directions</small></div>
                              <div><span>Wake overlaps</span><strong>{stageFlightResult.relativeAeroInteraction.exposedPairCount}</strong><small>geometry-qualified directions</small></div>
                              <div><span>Peak proxy deficit</span><strong>{stageFlightResult.relativeAeroInteraction.maximumVelocityDeficitFraction === null ? "Not assessed" : `${(stageFlightResult.relativeAeroInteraction.maximumVelocityDeficitFraction * 100).toFixed(1)}%`}</strong><small>bounded diagnostic</small></div>
                              <div><span>Max q reduction proxy</span><strong>{stageFlightResult.relativeAeroInteraction.maximumEstimatedDynamicPressureDeltaPa === null ? "Not available" : `${stageFlightResult.relativeAeroInteraction.maximumEstimatedDynamicPressureDeltaPa.toFixed(0)} Pa`}</strong><small>environment provider required</small></div>
                              <div><span>Wake geometry</span><strong>{stageFlightResult.relativeAeroInteraction.configuration.wakeHalfAngleDeg.toFixed(1)}° · {stageFlightResult.relativeAeroInteraction.configuration.wakeRecoveryDistanceBodyDiameters.toFixed(0)} body Ø</strong><small>saved proxy settings</small></div>
                              <div><span>Deficit bounds</span><strong>{(stageFlightResult.relativeAeroInteraction.configuration.peakVelocityDeficitFraction * 100).toFixed(0)}–{(stageFlightResult.relativeAeroInteraction.configuration.maximumVelocityDeficitFraction * 100).toFixed(0)}%</strong><small>peak → hard cap</small></div>
                            </div>
                            {stageFlightResult.relativeAeroInteraction.pairs.some((pair) => pair.exposedSampleCount > 0) && (
                              <div className="stage-relative-aero-interaction-list">
                                {stageFlightResult.relativeAeroInteraction.pairs
                                  .filter((pair) => pair.exposedSampleCount > 0)
                                  .sort((left, right) => (right.peakVelocityDeficitFraction ?? 0) - (left.peakVelocityDeficitFraction ?? 0))
                                  .slice(0, 3)
                                  .map((pair) => (
                                    <div key={`${pair.sourceBodyId}-${pair.targetBodyId}`}>
                                      <strong>{pair.sourceBodyLabel} → {pair.targetBodyLabel}</strong>
                                      <span>{(pair.exposureCoverageFraction * 100).toFixed(0)}% samples exposed · peak {(pair.peakVelocityDeficitFraction! * 100).toFixed(1)}% · min clearance {pair.minimumWakeClearanceM === null ? "—" : `${pair.minimumWakeClearanceM.toFixed(2)} m`}</span>
                                    </div>
                                  ))}
                              </div>
                            )}
                            {stageFlightResult.relativeAeroInteraction.warnings.length > 0 && (
                              <ul className="stage-relative-aero-interaction-warnings">
                                {stageFlightResult.relativeAeroInteraction.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}
                              </ul>
                            )}
                            <small className="stage-relative-aero-interaction-model">{publicModelVersion(stageFlightResult.relativeAeroInteraction.modelVersion)} · {stageFlightResult.relativeAeroInteraction.validationStatus}</small>
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
                                <div><span>Drag basis</span><strong>{body.referenceAreaM2 !== undefined && body.dragCoefficient !== undefined ? `Cd ${body.dragCoefficient.toFixed(3)} · ${body.referenceAreaM2.toFixed(4)} m²${body.aerodynamicBasis ? " · static aero" : ""}` : "Gravity only"}</strong><small>{body.aerodynamicBasis ? "projected drag + static normal force / CP moment" : body.referenceAreaM2 !== undefined && body.dragCoefficient !== undefined ? "isotropic point drag" : "no detached-stage aero basis"}</small></div>
                                {body.recoveryModelVersion && <div><span>Recovery command</span><strong>{body.recoveryDeploymentTrigger === "altitude" ? `Descent ${body.recoveryDeploymentAltitudeAglM ?? 150} m AGL` : body.recoveryDeploymentTrigger === "time" ? `Mission ${body.recoveryDeploymentTimeS ?? 8} s` : "Branch apogee"}</strong><small>{body.recoveryModelVersion}</small></div>}
                                {body.clearance && (
                                  <div><span>Min COM separation</span><strong>{body.clearance.minimumDistanceM === null ? "Not assessed" : `${body.clearance.minimumDistanceM.toFixed(2)} m`}</strong><small>{body.clearance.minimumDistanceTimeS === null ? body.clearance.status : `closest at ${body.clearance.minimumDistanceTimeS.toFixed(2)} s · ${body.clearance.status}`}</small></div>
                                )}
                                <div><span>Spherical envelope</span><strong>{body.envelopeRadiusM === undefined ? "Not assessed" : `${body.envelopeRadiusM.toFixed(2)} m`}</strong><small>fixed conservative radius</small></div>
                                <div><span>Model</span><strong>{body.validationStatus}</strong></div>
                              </div>
                              <p className="stage-separated-body-note">{body.aerodynamicBasis ? "Projected drag plus bounded static normal-force / CP-moment path." : body.referenceAreaM2 !== undefined && body.dragCoefficient !== undefined ? "Isotropic point-drag path." : "Gravity-only path."} {body.separationImpulseModel === "mass-ratio-linear-momentum" ? "The detached dV uses an instantaneous equal-and-opposite linear-momentum impulse based on the event delta-v and mass ratio." : "No detached-body impulse was supplied, so the branch starts from the pre-event release velocity."} Direct aerodynamic tables, fin interference, unsteady flow, separation mechanism dynamics, plume interaction, collision, and clearance remain outside this preview. {body.recoveryModelVersion ? "The selected recovery trigger and effective-area loads are included; canopy-line and opening-shock dynamics remain outside the model." : "No detached recovery device is configured."}</p>
                            </article>
                          ))}
                        </div>
                      </section>
                    )}
                    <StageFlightProfileChart result={stageFlightResult} selectedTimeS={selectedStageEventTimeS} onSelectionChange={setSelectedStageEventTimeS} copy={uiCopy} />
                    <FlightTrajectoryViewport
                      series={stageFlightTrajectorySeries}
                      events={stageFlightResult.events.map((event) => ({
                        id: event.id,
                        label: event.label,
                        timeS: event.timeS,
                        kind: event.kind,
                      }))}
                      selectedTimeS={selectedStageEventTimeS}
                      onSelectionChange={setSelectedStageEventTimeS}
                    />
                    <StageFlightComparisonCard
                      current={stageFlightResult}
                      reference={stageComparisonReference}
                      referenceFingerprint={stageComparisonReferenceFingerprint}
                      currentFingerprint={stageFlightFingerprint}
                      resultIsCurrent={stageFlightIsCurrent}
                      running={stageFlightRunning}
                      onPin={pinStageComparisonReference}
                      onClear={clearStageComparisonReference}
                    />
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
                        <button
                          className={`stage-flight-event${selectedStageEventTimeS === event.timeS ? " selected" : ""}`}
                          key={`${event.id}-${event.timeS}`}
                          type="button"
                          aria-pressed={selectedStageEventTimeS === event.timeS}
                          onClick={() => setSelectedStageEventTimeS(event.timeS)}
                        >
                          <span>{event.timeS.toFixed(2)} s</span>
                          <strong>{event.label}</strong>
                          {event.detachedStageInstanceIds.length > 0 && <small>released copies · {event.detachedStageInstanceIds.join(" + ")}</small>}
                          <small>{event.attachedStageIdsBefore.join(" + ")} → {event.attachedStageIdsAfter.join(" + ")}</small>
                          {event.separationDeltaVBodyMps && event.detachedStageIds.length > 0 && <small>retained dV +X {event.separationDeltaVBodyMps.x.toFixed(2)} m/s · world ({event.separationDeltaVWorldMps?.x.toFixed(2)}, {event.separationDeltaVWorldMps?.y.toFixed(2)}, {event.separationDeltaVWorldMps?.z.toFixed(2)}) m/s</small>}
                          {event.separationImpulseBodyNs && event.detachedStageIds.length > 0 && <small>measured retained impulse ({event.separationImpulseBodyNs.x.toFixed(1)}, {event.separationImpulseBodyNs.y.toFixed(1)}, {event.separationImpulseBodyNs.z.toFixed(1)}) N·s</small>}
                        </button>
                      ))}
                    </div>
                    <div className="stage-flight-status">
                      <span>MODEL STATUS</span>
                      <strong>{stageFlightResult.validationStatus}</strong>
                      <small>{publicModelVersion(stageFlightResult.stagingModelVersion)} · {publicModelVersion(stageFlightResult.aerodynamicsModelVersion)} · normal force {stageFlightResult.normalForceModel} · induced drag {stageFlightResult.inducedDragModel}{stageFlightResult.recoveryModelVersion ? ` · ${publicModelVersion(stageFlightResult.recoveryModelVersion)}` : ""}{stageFlightResult.rail ? ` · ${publicModelVersion(stageFlightResult.rail.modelVersion)}` : ""}</small>
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
              {running ? <div className="chart-loading"><Skeleton height={260} borderRadius={12} /></div> : <FlightChart result={result} selectedTimeS={selectedFlightEventTimeS} onSelectionChange={setSelectedFlightEventTimeS} copy={uiCopy} />}
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
              persistenceState={flightDataPersistenceState}
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
                    <span>Recovery-phase drift · {landingPrediction.footprint.terrainName} · local WGS84 tangent plane · {launchSiteName}</span>
                  </div>
                  <span>{landingPrediction.footprint.sampleCount} seeded scenarios</span>
                </div>
                <div className="landing-layout">
                  <LandingFootprintChart footprint={landingPrediction.footprint} />
                  <div className="landing-metrics">
                    <div>
                      <span>Mean impact</span>
                      <strong>{landingPrediction.footprint.meanImpact.eastM.toFixed(0)} m E · {landingPrediction.footprint.meanImpact.northM.toFixed(0)} m N</strong>
                      <small>{landingPrediction.footprint.meanImpact.positionWgs84.latitudeDeg.toFixed(5)}°, {landingPrediction.footprint.meanImpact.positionWgs84.longitudeDeg.toFixed(5)}° · terrain {landingPrediction.footprint.meanImpact.terrainElevationM.toFixed(1)} m</small>
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
                        <small>{publicModelVersion(landingPrediction.ascentDrift.modelVersion)} · scenario-specific horizontal state</small>
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
                  <p>Seed {landingPrediction.seed} · includes a scenario-specific ascent wind-drag handoff plus mean wind, deterministic turbulence, canopy-area, mass, direction, delay, and a Bernoulli deployment-outcome assumption. The selected terrain is a local analytical surface; obstacles, canopy pendulum motion, and range constraints remain omitted. Not a flight-safety corridor.</p>
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
                  <button
                    className={`event-item event-item-button${selectedFlightEventTimeS === event.timeS ? " selected" : ""}`}
                    key={`${event.type}-${event.timeS}`}
                    type="button"
                    aria-pressed={selectedFlightEventTimeS === event.timeS}
                    onClick={() => setSelectedFlightEventTimeS(event.timeS)}
                  >
                    <i />
                    <strong>{event.label}</strong>
                    <span>{event.timeS.toFixed(2)} s</span>
                    <small>{event.altitudeAglM.toFixed(0)} m AGL</small>
                  </button>
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
                <NumberField id="nose-length" label="Nose length" value={noseLength} unit="mm" min={40} max={600} slider onChange={(value) => { setNoseLength(value); markChanged(); }} />
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
                <NumberField id="length" label="Airframe length" value={length} unit="mm" min={200} max={1600} slider onChange={changeAirframeLength} />
                <NumberField id="diameter" label="Outer diameter" value={diameter} unit="mm" min={20} max={200} slider onChange={(value) => { setDiameter(value); markChanged(); }} />
                  <div className="field-group">
                    <label htmlFor="material">Airframe material model</label>
                    <select id="material" value={material} onChange={(event) => { setMaterial(event.target.value as MaterialKey); markChanged(); }}>
                    {Object.entries(materialModels).map(([key, model]) => <option value={key} key={key}>{model.label}</option>)}
                      <option value="custom">{customMaterial.label || "Custom engineering material"}</option>
                    </select>
                  </div>
                {material === "custom" && (
                  <div className="custom-material-panel">
                    <div className="field-group">
                      <label htmlFor="custom-material-label">Profile name</label>
                      <input
                        id="custom-material-label"
                        type="text"
                        value={customMaterial.label}
                        maxLength={120}
                        onChange={(event) => updateCustomMaterial("label", event.target.value)}
                      />
                    </div>
                    <NumberField id="custom-material-density" label="Density" value={customMaterial.densityKgM3} unit="kg/m³" min={50} max={20_000} step={10} slider onChange={(value) => updateCustomMaterial("densityKgM3", value)} />
                    <NumberField id="custom-material-wall" label="Wall thickness" value={customMaterial.wallThicknessMm} unit="mm" min={0.1} max={20} step={0.1} slider onChange={(value) => updateCustomMaterial("wallThicknessMm", value)} />
                    <NumberField id="custom-material-youngs" label="Young's modulus" value={customMaterial.youngsModulusGPa} unit="GPa" min={0.01} max={500} step={0.1} slider onChange={(value) => updateCustomMaterial("youngsModulusGPa", value)} />
                    <NumberField id="custom-material-poisson" label="Poisson ratio" value={customMaterial.poissonRatio} unit="ν" min={0} max={0.49} step={0.01} slider onChange={(value) => updateCustomMaterial("poissonRatio", value)} />
                    <NumberField id="custom-material-compression" label="Compression allowable" value={customMaterial.allowableCompressionMPa} unit="MPa" min={0.01} max={2_000} step={1} slider onChange={(value) => updateCustomMaterial("allowableCompressionMPa", value)} />
                    <NumberField id="custom-material-bending" label="Bending allowable" value={customMaterial.allowableBendingMPa} unit="MPa" min={0.01} max={2_000} step={1} slider onChange={(value) => updateCustomMaterial("allowableBendingMPa", value)} />
                    <NumberField id="custom-material-shear" label="Shear allowable" value={customMaterial.allowableShearMPa} unit="MPa" min={0.01} max={2_000} step={1} slider onChange={(value) => updateCustomMaterial("allowableShearMPa", value)} />
                    <p className="field-help">User-authored values feed the independent mass and preliminary structural screens. Record source, test method, laminate direction, and allowables separately; this profile is unvalidated and never becomes flight-safety evidence.</p>
                  </div>
                )}
                <NumberField id="payload-mass" label="Payload + avionics allowance" value={payloadMass} unit="kg" min={0.001} max={20} step={0.01} slider onChange={(value) => { setPayloadMass(value); markChanged(); }} />
              </>
            )}
            {selected === "fins" && (
              <>
                <NumberField id="fin-count" label="Fin count" value={finCount} unit="fins" min={2} max={12} step={1} slider onChange={(value) => { setFinCount(Math.round(value)); markChanged(); }} />
                <NumberField id="fin-root-chord" label="Root chord" value={finRootChord} unit="mm" min={20} max={Math.min(500, length)} slider onChange={changeFinRootChord} />
                <NumberField id="fin-tip-chord" label="Tip chord" value={finTipChord} unit="mm" min={5} max={Math.min(300, finRootChord)} slider onChange={changeFinTipChord} />
                <NumberField id="fin-sweep" label="Sweep" value={finSweep} unit="mm" min={0} max={Math.min(300, Math.max(0, finRootChord - finTipChord))} slider onChange={changeFinSweep} />
                <NumberField id="fin-span" label="Span" value={finSpan} unit="mm" min={5} max={300} slider onChange={(value) => { setFinSpan(value); markChanged(); }} />
                <NumberField id="fin-thickness" label="Thickness" value={finThickness} unit="mm" min={0.2} max={20} step={0.1} slider onChange={(value) => { setFinThickness(value); markChanged(); }} />
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
                <NumberField id="recovery-mass" label="Packed recovery mass" value={recoveryMass} unit="kg" min={0.005} max={2} step={0.005} slider onChange={(value) => { setRecoveryMass(value); markChanged(); }} />
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
            <button className="library-button component-library-launch" type="button" onClick={() => setComponentLibraryOpen(true)}>
              <span><strong>Component library</strong><small>Save or reuse attributed geometry and recovery presets</small></span>
              <em>{componentRecords.length} saved · Manage</em>
            </button>
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
                  <div><span>1st bending mode</span><strong>{structuralScreen.bendingMode.frequencyHz.toFixed(1)} Hz</strong><small>{structuralScreen.bendingMode.boundaryCondition === "cantilever" ? "cantilever equivalent" : "simply-supported equivalent"}</small></div>
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
                <p className="structural-screen-note">Analytical component checks only. The first bending mode is a uniform Euler–Bernoulli equivalent-beam trend, and the NACA-TN-4197-style fin flutter screen is preliminary; body-fin coupling, transonic effects, joints, local buckling, axial-load softening, damping, and manufacturing effects are not modeled{resultIsCurrent ? "." : "; rerun the flight estimate before using dynamic-pressure and flutter trends."}</p>
              </div>
            )}
            {stageStructuralReview.stages.length > 1 && (
              <div className={`stage-structural-review-card stage-structural-review-${stageStructuralReview.overallStatus}`}>
                <div className="stage-structural-review-heading">
                  <div>
                    <span>STAGE-AWARE STRUCTURAL REVIEW</span>
                    <strong>{stageStructuralReview.overallStatus === "pass" ? "ALL STAGES NOMINAL" : "STAGE REVIEW REQUIRED"}</strong>
                  </div>
                  <small>{publicModelVersion(stageStructuralReview.modelVersion)}</small>
                </div>
                <div className="stage-structural-review-counts">
                  <div><span>Stage rows</span><strong>{stageStructuralReview.stages.length}</strong></div>
                  <div><span>Pass</span><strong>{stageStructuralReview.counts.pass}</strong></div>
                  <div><span>Review / missing</span><strong>{stageStructuralReview.counts.review + stageStructuralReview.counts.unavailable}</strong></div>
                </div>
                <div className="stage-structural-review-list">
                  {stageStructuralReview.stages.map((stage) => (
                    <div className={`stage-structural-review-row stage-structural-review-row-${stage.status}`} key={stage.id}>
                      <span>{stage.status === "pass" ? "✓" : stage.status === "review" ? "!" : "—"}</span>
                      <div>
                        <strong>{stage.label}</strong>
                        <small>{stage.role ?? "stage"} · {stage.instanceCount} instance{stage.instanceCount === 1 ? "" : "s"} · checks {stage.checkCounts.pass}/{stage.checkCounts.review}/{stage.checkCounts.unavailable} pass/review/missing</small>
                      </div>
                      <em>{stage.weakestFactorOfSafety === null ? "Not assessed" : `FoS ${stage.weakestFactorOfSafety.toFixed(2)}×`}</em>
                    </div>
                  ))}
                </div>
                <p className="stage-structural-review-note">Independent stage rows use the current component screen and a first-instance mass/thrust proxy. Stage interfaces, load transfer, fasteners, local joints, cluster imbalance, and manufacturing allowables remain outside scope.</p>
              </div>
            )}
            {stageInterfaceLoadReview.interfaces.length > 0 && (
              <div className={`stage-interface-load-card stage-interface-load-${stageInterfaceLoadReview.overallStatus}`}>
                <div className="stage-interface-load-heading">
                  <div>
                    <span>STAGE-INTERFACE AXIAL LOAD PATH</span>
                    <strong>{stageInterfaceLoadReview.overallStatus === "assessed" ? "SERIAL PROXY ASSESSED" : "LOAD PATH REVIEW REQUIRED"}</strong>
                  </div>
                  <small>{publicModelVersion(stageInterfaceLoadReview.modelVersion)}</small>
                </div>
                <div className="stage-interface-load-counts">
                  <div><span>Interfaces</span><strong>{stageInterfaceLoadReview.interfaces.length}</strong></div>
                  <div><span>Pass</span><strong>{stageInterfaceLoadReview.counts.pass}</strong></div>
                  <div><span>Review / missing</span><strong>{stageInterfaceLoadReview.counts.review + stageInterfaceLoadReview.counts.unavailable}</strong></div>
                </div>
                <div className="stage-interface-load-summary">
                  <span>Stack {stageInterfaceLoadReview.totalStackMassKg.toFixed(3)} kg</span>
                  <span>Peak {stageInterfaceLoadReview.peakThrustN.toFixed(1)} N</span>
                  <span>{stageInterfaceLoadReview.accelerationBasis === "trace-peak-with-baseline" ? `Trace peak ${stageInterfaceLoadReview.tracePeakAxialAccelerationMps2?.toFixed(2) ?? "—"} m/s²` : "Peak-thrust baseline"}</span>
                  <span>Axial {stageInterfaceLoadReview.effectiveAxialAccelerationMps2 === null ? "—" : `${stageInterfaceLoadReview.effectiveAxialAccelerationMps2.toFixed(2)} m/s²`}</span>
                </div>
                <div className="stage-interface-load-list">
                  {stageInterfaceLoadReview.interfaces.map((interfaceLoad) => (
                    <div className={`stage-interface-load-row stage-interface-load-row-${interfaceLoad.status}`} key={interfaceLoad.id}>
                      <span>{interfaceLoad.status === "pass" ? "✓" : interfaceLoad.status === "review" ? "!" : "—"}</span>
                      <div>
                        <strong>{interfaceLoad.parentLabel ?? "Missing parent"} → {interfaceLoad.childLabel}</strong>
                        <small>{interfaceLoad.attachment} · {interfaceLoad.axialDemandN === null ? "demand unavailable" : `demand ${interfaceLoad.axialDemandN.toFixed(1)} N`} · {interfaceLoad.detail}</small>
                      </div>
                      <em>{interfaceLoad.factorOfSafety === null ? "Unavailable" : `FoS ${interfaceLoad.factorOfSafety.toFixed(2)}×`}</em>
                    </div>
                  ))}
                </div>
                {stageInterfaceLoadReview.parallelAudits.length > 0 && (
                  <div className="stage-parallel-load-audit">
                    <div className="stage-parallel-load-heading">
                      <div>
                        <span>PARALLEL / RADIAL FORCE-SCALE AUDIT</span>
                        <strong>{stageInterfaceLoadReview.parallelAudits.filter((audit) => audit.status === "screened").length}/{stageInterfaceLoadReview.parallelAudits.length} EQUAL-SHARE SCREENED</strong>
                      </div>
                      <small>Per-instance load scales</small>
                    </div>
                    <div className="stage-interface-load-list">
                      {stageInterfaceLoadReview.parallelAudits.map((audit) => (
                        <div className={`stage-interface-load-row stage-parallel-load-row-${audit.status}`} key={`parallel-${audit.id}`}>
                          <span>{audit.status === "screened" ? "~" : "—"}</span>
                          <div>
                            <strong>{audit.parentLabel ?? "Missing parent"} → {audit.childLabel}</strong>
                            <small>
                              {audit.instanceCount} instance{audit.instanceCount === 1 ? "" : "s"} · share {audit.loadShareFraction === null ? "—" : `${(audit.loadShareFraction * 100).toFixed(1)}%`} · axial {audit.perInstanceAxialDemandN === null ? "—" : `${audit.perInstanceAxialDemandN.toFixed(1)} N / instance`} · radial thrust {audit.perInstanceRadialThrustN === null ? "—" : `${audit.perInstanceRadialThrustN.toFixed(1)} N`} · eccentric moment {audit.perInstanceEccentricMomentNm === null ? "—" : `${audit.perInstanceEccentricMomentNm.toFixed(2)} N·m`}
                            </small>
                          </div>
                          <em>{audit.status === "screened" ? `Resultant ${audit.symmetricResultantRadialThrustN?.toFixed(2) ?? "—"} N` : "Unavailable"}</em>
                        </div>
                      ))}
                    </div>
                    <p className="stage-parallel-load-note">Equal-share radial placement is a force-scale audit only. Symmetric resultant cancellation does not remove per-instance joint loads; radial capacity, bending, fasteners, local eccentricity, and transient response remain unmodeled.</p>
                  </div>
                )}
                <p className="stage-interface-load-note">{stageInterfaceLoadReview.accelerationBasis === "trace-peak-with-baseline" ? "Current staged trace informs the axial acceleration envelope; the peak-thrust baseline is retained when larger. " : "Bounded common-acceleration screen only. "}Connector geometry, fasteners, bending, transient loads, radial joints, staging impulse, and local failure modes are not modeled.</p>
              </div>
            )}
            <div className={`attached-aero-card attached-aero-${attachedAeroInterference.overallStatus}`}>
              <div className="attached-aero-heading">
                <div>
                  <span>ATTACHED-FLOW GEOMETRY SCREEN</span>
                  <strong>
                    {attachedAeroInterference.overallStatus === "screened"
                      ? "CLEARANCE SCREENED"
                      : attachedAeroInterference.overallStatus === "watch"
                        ? "WATCH ITEMS PRESENT"
                        : attachedAeroInterference.overallStatus === "review"
                          ? "INTERFERENCE REVIEW REQUIRED"
                          : "NOT ASSESSED"}
                  </strong>
                </div>
                <small>{publicModelVersion(attachedAeroInterference.modelVersion)}</small>
              </div>
              <div className="attached-aero-counts">
                <div><span>Bodies assessed</span><strong>{attachedAeroInterference.assessedBodyCount}/{attachedAeroInterference.bodyCount}</strong></div>
                <div><span>Pairs screened</span><strong>{attachedAeroInterference.pairCount}</strong></div>
                <div><span>Watch / overlap</span><strong>{attachedAeroInterference.nearPairCount} / {attachedAeroInterference.overlapPairCount}</strong></div>
              </div>
              {attachedAeroInterference.pairs.length > 0 && (
                <div className="attached-aero-list">
                  {attachedAeroInterference.pairs.slice(0, 4).map((pair) => (
                    <div className={`attached-aero-row attached-aero-row-${pair.status}`} key={pair.id}>
                      <span>{pair.status === "clear" ? "✓" : pair.status === "near" ? "!" : "×"}</span>
                      <div>
                        <strong>{pair.upstreamLabel} ↔ {pair.downstreamLabel}</strong>
                        <small>{pair.detail} · axial overlap {(pair.axialOverlapM * 1000).toFixed(0)} mm</small>
                      </div>
                      <em>{pair.status.toUpperCase()}</em>
                    </div>
                  ))}
                </div>
              )}
              <p className="attached-aero-note">{attachedAeroInterference.warnings[0]} No drag, lift, moment, or trajectory correction is applied by this screen.</p>
            </div>
            <div className={`engineering-review-card engineering-review-${engineeringReview.overallStatus}`}>
              <div className="engineering-review-heading">
                <div>
                  <span>ENGINEERING DESIGN REVIEW</span>
                  <strong>
                    {engineeringReview.overallStatus === "nominal"
                      ? "NOMINAL POLICY CHECKS"
                      : engineeringReview.overallStatus === "review"
                        ? "REVIEW REQUIRED"
                        : "NOT ASSESSED"}
                  </strong>
                </div>
                <small>{publicModelVersion(engineeringReview.modelVersion)}</small>
              </div>
              <div className="engineering-review-counts">
                <div><span>Pass</span><strong>{engineeringReview.counts.pass}</strong></div>
                <div><span>Review</span><strong>{engineeringReview.counts.review}</strong></div>
                <div><span>Unavailable</span><strong>{engineeringReview.counts.unavailable}</strong></div>
              </div>
              <div className="engineering-review-findings">
                {engineeringReview.findings.slice(0, 6).map((finding) => (
                  <div className={`engineering-review-finding engineering-review-finding-${finding.status}`} key={finding.id}>
                    <span>{finding.status === "pass" ? "✓" : finding.status === "review" ? "!" : "—"}</span>
                    <div>
                      <strong>{finding.label}</strong>
                      <small>{finding.summary} {finding.action}</small>
                    </div>
                  </div>
                ))}
              </div>
              <p className="engineering-review-note">{engineeringReview.warnings[0]} Results carry their own model versions and assumptions; this surface does not certify the vehicle.</p>
            </div>
            {experienceMode === "expert" ? (
              <>
                <div className="property-section-label">
                  <span>Low-speed static aerodynamics</span>
                  <small>{publicModelVersion(staticStability.modelVersion)}</small>
                </div>
                <div className="mass-properties-card stability-properties-card">
                  <div><span>Center of pressure</span><strong>{centerOfPressureMm.toFixed(0)} mm</strong></div>
                  <div><span>Static margin</span><strong>{staticStability.staticMarginCalibers.toFixed(2)} cal</strong></div>
                  <div><span>Normal-force slope</span><strong>{staticStability.normalForceSlopePerRad.toFixed(2)} /rad</strong></div>
                  <div><span>Fineness ratio</span><strong>{staticStability.finenessRatio.toFixed(1)}</strong></div>
                </div>
                <div className="property-section-label">
                  <span>Assembly graph</span>
                  <small>{publicModelVersion(assembly.modelVersion)}</small>
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
            <NumberField id="thrust" label="Average thrust" value={thrust} unit="N" min={1} max={5000} step={0.5} slider onChange={(value) => { setThrust(value); markChanged(); }} />
            <NumberField id="burn-time" label="Burn time" value={burnTime} unit="s" min={0.1} max={30} step={0.05} slider onChange={(value) => { setBurnTime(value); markChanged(); }} />
            <NumberField id="drag" label="Drag coefficient" value={dragCoefficient} unit="Cd" min={0.1} max={2} step={0.01} slider onChange={(value) => { setDragCoefficient(value); markChanged(); }} />
            <div className="field-group">
              <label htmlFor="launch-site-name">Launch site</label>
              <input id="launch-site-name" type="text" maxLength={120} value={launchSiteName} onChange={(event) => { setLaunchSiteName(event.target.value || "ARC 54 synthetic range"); markChanged(); }} />
            </div>
            <NumberField id="launch-latitude" label="Latitude (WGS84)" value={launchLatitudeDeg} unit="deg" min={-90} max={90} step={0.0001} onChange={(value) => { setLaunchLatitudeDeg(value); markChanged(); }} />
            <NumberField id="launch-longitude" label="Longitude (WGS84)" value={launchLongitudeDeg} unit="deg" min={-180} max={180} step={0.0001} onChange={(value) => { setLaunchLongitudeDeg(value); markChanged(); }} />
            <NumberField id="launch-altitude" label="Launch-site altitude" value={launchAltitude} unit="m" min={-400} max={10000} step={10} onChange={(value) => { setLaunchAltitude(value); markChanged(); }} />
            <div className="field-group earth-rotation-control-group">
              <label htmlFor="earth-rotation">Earth rotation correction</label>
              <select id="earth-rotation" value={earthRotationEnabled ? "enabled" : "disabled"} onChange={(event) => { setEarthRotationEnabled(event.target.value === "enabled"); markChanged(); }}>
                <option value="disabled">Disabled - non-rotating ENU</option>
                <option value="enabled">Enabled - local Coriolis</option>
              </select>
            </div>
            <p className="field-help">When enabled, the coupled 6DOF path adds the WGS84 Earth-rate Coriolis acceleration in the launch-site ENU frame. It is an analytical preview, not an independently flight-validated correction; the default gravity remains the effective launch-site scalar model.</p>
            <div className="field-group gravity-model-control-group">
              <label htmlFor="gravity-model">Gravity model</label>
              <select id="gravity-model" value={normalGravityEnabled ? "wgs84-normal" : "standard"} onChange={(event) => { setNormalGravityEnabled(event.target.value === "wgs84-normal"); markChanged(); }}>
                <option value="standard">Standard scalar - compatibility</option>
                <option value="wgs84-normal">WGS84 normal - latitude aware</option>
              </select>
            </div>
            <p className="field-help">WGS84 normal gravity uses the launch latitude and an explicit second-order height expansion. It improves site-level fidelity but remains an analytical, unvalidated approximation rather than a geoid or local gravimetry solution.</p>
            <div className="field-group normal-force-model-control-group">
              <label htmlFor="normal-force-model">Relation normal-force model</label>
              <select id="normal-force-model" value={normalForceModel} onChange={(event) => { setNormalForceModel(event.target.value as NormalForceModelKind); markChanged(); }}>
                <option value="low-speed">Low-speed baseline - compatibility</option>
                <option value="prandtl-glauert">Prandtl-Glauert - subsonic trend</option>
                <option value="supersonic-linearized">Linearized supersonic - Ackeret trend</option>
              </select>
            </div>
            <p className="field-help">This affects relation-based normal force in the coupled 6DOF preview only. User force/moment tables remain authoritative; the analytical trend leaves a deliberate transonic gap and is not flight validated.</p>
            <div className="field-group induced-drag-model-control-group">
              <label htmlFor="induced-drag-model">Relation induced-drag polar</label>
              <select id="induced-drag-model" value={inducedDragModel} onChange={(event) => { setInducedDragModel(event.target.value as InducedDragModelKind); markChanged(); }}>
                <option value="disabled">Disabled - compatibility</option>
                <option value="quadratic-normal-force">Quadratic normal-force drag</option>
              </select>
            </div>
            {inducedDragModel === "quadratic-normal-force" && <NumberField id="induced-drag-factor" label="Induced-drag factor (k)" value={inducedDragFactor} unit="k" min={0} max={10} step={0.01} slider onChange={(value) => { setInducedDragFactor(value); markChanged(); }} />}
            <p className="field-help">Optional relation-only drag polar: C<sub>D</sub> = C<sub>D0</sub> + k C<sub>N</sub><sup>2</sup>. The factor is caller-authored because fin interference and reference-area conventions need vehicle-specific evidence. Direct force/moment tables bypass this term; it remains an unvalidated engineering preview.</p>
            <div className="field-group terrain-control-group">
              <label htmlFor="terrain-model">Landing surface</label>
              <select id="terrain-model" value={terrainModel} onChange={(event) => { setTerrainModel(event.target.value as ProjectTerrainModel); markChanged(); }}>
                <option value="flat">Flat launch surface</option>
                <option value="planar">Planar local ENU terrain</option>
              </select>
            </div>
            {terrainModel === "planar" && <>
              <NumberField id="terrain-east-slope" label="Terrain east slope" value={terrainEastSlopePercent} unit="%" min={-100} max={100} step={0.1} slider onChange={(value) => { setTerrainEastSlopePercent(value); markChanged(); }} />
              <NumberField id="terrain-north-slope" label="Terrain north slope" value={terrainNorthSlopePercent} unit="%" min={-100} max={100} step={0.1} slider onChange={(value) => { setTerrainNorthSlopePercent(value); markChanged(); }} />
              <p className="field-help">Landing dispersion root-finds impact against an infinite plane in the local ENU frame. Slopes are rise/run percentages relative to the launch-pad origin; this is not a surveyed elevation model.</p>
            </>}
            <div className="wind-profile-editor" id="wind-profile-editor">
              <div className="wind-profile-editor-heading">
                <div>
                  <span>Altitude-dependent wind</span>
                  <small>{windProfileLayers.length === 0 ? "Synthetic 3-layer preview" : `${windProfileLayers.length} user layers`}</small>
                </div>
                {windProfileLayers.length === 0 ? (
                  <button className="quiet-button" type="button" onClick={enableCustomWindProfile}>Use custom layers</button>
                ) : (
                  <button className="quiet-button" type="button" onClick={resetWindProfile}>Use synthetic</button>
                )}
              </div>
              {windProfileLayers.length > 0 && (
                <>
                  <div className="wind-profile-table-wrap">
                    <table className="wind-profile-table">
                      <caption>Mean wind in local ENU coordinates</caption>
                      <thead><tr><th scope="col">AGL</th><th scope="col">East</th><th scope="col">North</th><th scope="col">Up</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                      <tbody>
                        {windProfileLayers.map((layer, index) => (
                          <tr key={`${layer.altitudeM}-${index}`}>
                            <td><input aria-label={`Wind layer ${index + 1} altitude`} type="number" min={-500} max={50_000} step={10} value={layer.altitudeM} onChange={(event) => updateWindProfileLayer(index, "altitudeM", Number(event.target.value))} /><span>m</span></td>
                            <td><input aria-label={`Wind layer ${index + 1} east component`} type="number" min={-200} max={200} step={0.1} value={layer.eastMps} onChange={(event) => updateWindProfileLayer(index, "eastMps", Number(event.target.value))} /><span>m/s</span></td>
                            <td><input aria-label={`Wind layer ${index + 1} north component`} type="number" min={-200} max={200} step={0.1} value={layer.northMps} onChange={(event) => updateWindProfileLayer(index, "northMps", Number(event.target.value))} /><span>m/s</span></td>
                            <td><input aria-label={`Wind layer ${index + 1} up component`} type="number" min={-100} max={100} step={0.1} value={layer.upMps} onChange={(event) => updateWindProfileLayer(index, "upMps", Number(event.target.value))} /><span>m/s</span></td>
                            <td><button className="icon-button" type="button" aria-label={`Remove wind layer ${index + 1}`} onClick={() => removeWindProfileLayer(index)}>×</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="quiet-button wind-profile-add" type="button" onClick={addWindProfileLayer} disabled={windProfileLayers.length >= 32}>+ Add altitude layer</button>
                  <p className="field-help">Layers are linearly interpolated and clamped outside the supplied altitude range. East, north, and up are local ENU components; the wind-azimuth input is ignored while custom layers are active. User data remain unvalidated.</p>
                </>
              )}
            </div>
            <NumberField id="surface-pressure" label="Pad pressure" value={surfacePressureHpa} unit="hPa" min={20} max={1100} step={0.1} slider onChange={(value) => { setSurfacePressureHpa(value); markChanged(); }} />
            <NumberField id="surface-temperature" label="Pad temperature" value={surfaceTemperatureC} unit="°C" min={-90} max={70} step={0.5} slider onChange={(value) => { setSurfaceTemperatureC(value); markChanged(); }} />
            <NumberField id="wind-speed" label="Wind at 500 m" value={windSpeed} unit="m/s" min={0} max={80} step={0.5} slider onChange={(value) => { setWindSpeed(value); markChanged(); }} />
            <NumberField id="wind-azimuth" label="Wind azimuth · east toward north" value={windAzimuthDeg} unit="deg" min={-180} max={180} step={1} slider onChange={(value) => { setWindAzimuthDeg(value); markChanged(); }} />
            <NumberField id="turbulence-scale" label="Turbulence RMS scale" value={turbulenceScale} unit="×" min={0} max={3} step={0.05} slider onChange={(value) => { setTurbulenceScale(value); markChanged(); }} />
            <div className="field-group">
              <label htmlFor="weather-seed">Weather replay seed</label>
              <input id="weather-seed" type="text" maxLength={80} value={weatherSeed} onChange={(event) => { setWeatherSeed(event.target.value.slice(0, 80)); markChanged(); }} onBlur={() => setWeatherSeed((current) => current.trim() || DEFAULT_WEATHER_SEED)} />
            </div>
            <NumberField id="relative-humidity" label="Relative humidity" value={relativeHumidityPercent} unit="%" min={0} max={100} step={1} slider onChange={(value) => { setRelativeHumidityPercent(value); markChanged(); }} />
            <p className="field-help">The site label and WGS84 coordinates flow into landing-zone provenance and exported reports. Pressure and temperature anchor the launch-site profile; wind azimuth uses the local ENU frame (0° east, +90° north); turbulence scale multiplies the deterministic RMS envelope, and the seed makes the generated field replayable. Humidity couples to water-vapor pressure, virtual temperature, density, and sound speed. These are user observations and assumptions, not a live weather feed.</p>
            <div className="field-group rail-control-group">
              <label htmlFor="launch-rail-enabled">Launch rail constraint</label>
              <select id="launch-rail-enabled" value={launchRailEnabled ? "enabled" : "disabled"} onChange={(event) => { setLaunchRailEnabled(event.target.value === "enabled"); markChanged(); }}>
                <option value="enabled">Enabled · angled rail handoff</option>
                <option value="disabled">Disabled · unconstrained start</option>
              </select>
            </div>
            {launchRailEnabled && <>
              <NumberField id="launch-rail-length" label="Effective rail travel" value={launchRailLengthM} unit="m" min={0.25} max={12} step={0.05} slider onChange={(value) => { setLaunchRailLengthM(value); markChanged(); }} />
              <NumberField id="launch-rail-inclination" label="Inclination from vertical" value={launchRailInclinationDeg} unit="deg" min={0} max={30} step={0.1} slider onChange={(value) => { setLaunchRailInclinationDeg(value); markChanged(); }} />
              <NumberField id="launch-rail-azimuth" label="Azimuth · east toward north" value={launchRailAzimuthDeg} unit="deg" min={-180} max={180} step={1} slider onChange={(value) => { setLaunchRailAzimuthDeg(value); markChanged(); }} />
              <NumberField id="launch-rail-friction" label="Effective guide friction" value={launchRailFrictionAccelerationMps2} unit="m/s²" min={0} max={50} step={0.1} slider onChange={(value) => { setLaunchRailFrictionAccelerationMps2(value); markChanged(); }} />
              <NumberField id="launch-rail-tipoff-pitch" label="Rail-exit pitch tip-off" value={launchRailTipOffPitchRateDegS} unit="deg/s" min={-180} max={180} step={1} slider onChange={(value) => { setLaunchRailTipOffPitchRateDegS(value); markChanged(); }} />
              <NumberField id="launch-rail-tipoff-yaw" label="Rail-exit yaw tip-off" value={launchRailTipOffYawRateDegS} unit="deg/s" min={-180} max={180} step={1} slider onChange={(value) => { setLaunchRailTipOffYawRateDegS(value); markChanged(); }} />
              <p className="rail-provenance">The staged preview holds attitude and lateral motion on a fixed ENU rail, then hands the exact release state to free flight. Inclination is measured from +up; azimuth is 0° east and 90° north. Friction is an effective axial loss, while tip-off is an authored body-frame angular-rate approximation; guide-button geometry, binding, transient torque, and launcher motion remain outside scope.</p>
            </>}
            <div className="field-group">
              <label htmlFor="recovery-enabled">Recovery model</label>
              <select id="recovery-enabled" value={recoveryEnabled ? "enabled" : "disabled"} onChange={(event) => { setRecoveryEnabled(event.target.value === "enabled"); markChanged(); }}>
                <option value="enabled">450 mm primary parachute</option>
                <option value="disabled">Ballistic descent</option>
              </select>
            </div>
            {recoveryEnabled && <div className="field-group">
              <label htmlFor="recovery-deployment-trigger">Primary recovery trigger</label>
              <select id="recovery-deployment-trigger" value={recoveryDeploymentTrigger} onChange={(event) => { setRecoveryDeploymentTrigger(event.target.value as RecoveryDeploymentTrigger); markChanged(); }}>
                <option value="apogee">At apogee</option>
                <option value="altitude">Descending through altitude</option>
                <option value="time">At mission time</option>
              </select>
            </div>}
            {recoveryEnabled && recoveryDeploymentTrigger === "altitude" && <NumberField id="recovery-deployment-altitude" label="Deployment altitude" value={recoveryDeploymentAltitudeM} unit="m AGL" min={0} max={10000} step={5} slider onChange={(value) => { setRecoveryDeploymentAltitudeM(value); markChanged(); }} />}
            {recoveryEnabled && recoveryDeploymentTrigger === "time" && <NumberField id="recovery-deployment-time" label="Deployment mission time" value={recoveryDeploymentTimeS} unit="s" min={0} max={180} step={0.1} slider onChange={(value) => { setRecoveryDeploymentTimeS(value); markChanged(); }} />}
            {recoveryEnabled && <NumberField id="recovery-delay" label="Deployment delay after trigger" value={recoveryDelay} unit="s" min={0} max={30} step={0.1} slider onChange={(value) => { setRecoveryDelay(value); markChanged(); }} />}
            {recoveryEnabled && <NumberField id="recovery-inflation-time" label="Canopy inflation time" value={recoveryInflationTime} unit="s" min={0} max={30} step={0.1} slider onChange={(value) => { setRecoveryInflationTime(value); markChanged(); }} />}
            {recoveryEnabled && <NumberField id="recovery-diameter" label="Canopy diameter" value={recoveryDiameter} unit="m" min={0.1} max={3} step={0.01} slider onChange={(value) => { setRecoveryDiameter(value); markChanged(); }} />}
            {recoveryEnabled && <NumberField id="recovery-deployment-success" label="Deployment success assumption" value={recoveryDeploymentSuccessProbability * 100} unit="%" min={0} max={100} step={1} slider onChange={(value) => { setRecoveryDeploymentSuccessProbability(value / 100); markChanged(); }} />}
            {recoveryEnabled && <div className="field-group">
              <label htmlFor="recovery-reefing">Canopy opening schedule</label>
              <select id="recovery-reefing" value={recoveryReefingEnabled ? "reefed" : "full-open"} onChange={(event) => { setRecoveryReefingEnabled(event.target.value === "reefed"); markChanged(); }}>
                <option value="full-open">Full open after inflation</option>
                <option value="reefed">Start reefed, then open</option>
              </select>
            </div>}
            {recoveryEnabled && recoveryReefingEnabled && <>
              <NumberField id="recovery-reefing-start-area" label="Initial reefed canopy area" value={recoveryReefingStartAreaFraction * 100} unit="%" min={5} max={100} step={1} slider onChange={(value) => { setRecoveryReefingStartAreaFraction(value / 100); markChanged(); }} />
              <NumberField id="recovery-reefing-duration" label="Reefing duration" value={recoveryReefingDurationS} unit="s" min={0.1} max={30} step={0.1} slider onChange={(value) => { setRecoveryReefingDurationS(value); markChanged(); }} />
              <p className="recovery-provenance">The preview multiplies canopy drag area from the initial fraction to 100% with a piecewise-linear schedule after inflation. Reefing lines, fabric dynamics, loads, and hardware are not modeled.</p>
            </>}
            {recoveryEnabled && <p className="recovery-provenance">The primary device can command at apogee, on descent through a target AGL altitude, or at a mission time, then waits the configured delay before a smooth effective-area inflation ramp. Landing dispersion samples deployment as a Bernoulli outcome. A failed deployment uses ballistic descent with body drag; these are modeling assumptions, not hardware reliability evidence.</p>}
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
                  <small>{publicModelVersion(previewMotor.modelVersion)}</small>
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
                  <small>{publicModelVersion(selectedAerodynamicTable?.modelVersion) || "constant-Cd"}</small>
                </div>
                <div className="mass-properties-card stability-properties-card">
                  <div><span>Source</span><strong>{selectedAerodynamicTable?.name ?? "Constant Cd"}</strong></div>
                  <div><span>Mach range</span><strong>{selectedAerodynamicTable ? `${selectedAerodynamicTable.machRange[0].toFixed(2)}–${selectedAerodynamicTable.machRange[1].toFixed(2)}` : "fixed"}</strong></div>
                  <div><span>Reynolds range</span><strong>{selectedAerodynamicTable ? `${selectedAerodynamicTable.reynoldsRange[0].toExponential(1)}–${selectedAerodynamicTable.reynoldsRange[1].toExponential(1)}` : "fixed"}</strong></div>
                  <div><span>Angular axes</span><strong>{selectedAerodynamicTable?.angleOfAttackRangeRad ? "AoA + sideslip" : "not supplied"}</strong></div>
                  <div><span>Force / moment DB</span><strong>{selectedAerodynamicTable?.forceMomentDatabaseAvailable ? "direct body axes" : "relation fallback"}</strong></div>
                  <div><span>Relation normal force</span><strong>{normalForceModel === "low-speed" ? "Low-speed baseline" : normalForceModel === "prandtl-glauert" ? "Prandtl-Glauert" : "Linearized supersonic"}</strong></div>
                  <div><span>Validation</span><strong>{selectedAerodynamicTable?.validationStatus ?? "analytical preview"}</strong></div>
                </div>
                <p className="motor-provenance">Coefficient tables now drive both the fast vertical estimate and topology-aware 6DOF preview when selected. Out-of-range queries remain visible as warnings, and table data are never promoted to flight certification.</p>
                <div className="field-group">
                  <label htmlFor="six-dof-integration-method">6DOF integration method</label>
                  <select id="six-dof-integration-method" value={sixDofIntegrationMethod} onChange={(event) => { setSixDofIntegrationMethod(event.target.value as RigidBodyIntegrationMethod); markChanged(); }}>
                    <option value="fixed-rk4">Fixed RK4 · compatibility default</option>
                    <option value="adaptive-rk4-step-doubling">Adaptive RK4 · step-doubling error estimate</option>
                  </select>
                </div>
                <p className="field-help">Adaptive mode controls numerical truncation error with internal step refinement and keeps event boundaries exact. It does not detect inaccurate loads, omitted discontinuities, or model-form error; rerun the preview after changing this setting.</p>
                <div className="property-section-label">
                  <span>Flight environment</span>
                  <small>{publicModelVersion(previewEnvironment.modelVersion)}</small>
                </div>
                <div className="mass-properties-card stability-properties-card">
                  <div><span>Launch site</span><strong>{previewEnvironment.definition.site.name}</strong></div>
                  <div><span>WGS84 coordinates</span><strong>{previewEnvironment.definition.site.latitudeDeg.toFixed(5)}°, {previewEnvironment.definition.site.longitudeDeg.toFixed(5)}°</strong></div>
                  <div><span>Altitude reference</span><strong>{environmentAt500M.altitudeAslM.toFixed(0)} m ASL at 500 m AGL</strong></div>
                  <div><span>Earth rotation</span><strong>{earthRotationEnabled ? "Coriolis enabled" : "Disabled"}</strong></div>
                  <div><span>Gravity model</span><strong>{normalGravityEnabled ? "WGS84 normal" : "Standard scalar"}</strong></div>
                  <div><span>Mean wind at 500 m</span><strong>{Math.hypot(environmentAt500M.meanWindWorldMps.x, environmentAt500M.meanWindWorldMps.y).toFixed(1)} m/s</strong></div>
                  <div><span>Wind azimuth input</span><strong>{windAzimuthDeg.toFixed(0)}° ENU</strong></div>
                  <div><span>Mean-wind source</span><strong>{windProfileLayers.length > 0 ? `User layers · ${windProfileLayers.length}` : "Synthetic · 3 layers"}</strong></div>
                  <div><span>Pad pressure</span><strong>{(environmentAtPad.atmosphere.pressurePa / 100).toFixed(1)} hPa</strong></div>
                  <div><span>Pad temperature</span><strong>{(environmentAtPad.atmosphere.temperatureK - 273.15).toFixed(1)} °C</strong></div>
                  <div><span>Relative humidity</span><strong>{relativeHumidityPercent.toFixed(0)}% · coupled</strong></div>
                  <div><span>Air density @ 500 m</span><strong>{environmentAt500M.atmosphere.densityKgM3.toFixed(3)} kg/m³</strong></div>
                  <div><span>Sound speed @ 500 m</span><strong>{environmentAt500M.atmosphere.speedOfSoundMps.toFixed(1)} m/s</strong></div>
                  <div><span>Turbulence RMS L / T / V</span><strong>{(previewEnvironment.definition.turbulence?.rmsVelocityMps.longitudinal ?? 0).toFixed(2)} / {(previewEnvironment.definition.turbulence?.rmsVelocityMps.lateral ?? 0).toFixed(2)} / {(previewEnvironment.definition.turbulence?.rmsVelocityMps.vertical ?? 0).toFixed(2)} m/s</strong></div>
                  <div><span>Turbulence scale / seed</span><strong>{turbulenceScale.toFixed(2)}× · {weatherSeed}</strong></div>
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
        <div className={(view === "design" ? engineeringReview.overallStatus === "nominal" : modelWarning.severity === "info") ? "check-card good" : "check-card warn"}>
          <span>{(view === "design" ? engineeringReview.overallStatus === "nominal" : modelWarning.severity === "info") ? "✓" : "!"}</span>
          <div>
            <strong>{view === "design" ? engineeringReview.primaryFinding?.label ?? "Engineering design review" : modelWarning.title}</strong>
            <p>{view === "design" ? engineeringReview.primaryFinding ? `${engineeringReview.primaryFinding.summary} ${engineeringReview.primaryFinding.action}` : "No engineering review items are available yet." : modelWarning.explanation}</p>
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
                  role="combobox"
                  aria-expanded="true"
                  aria-autocomplete="list"
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
      {accessibilityOpen && (
        <div
          className="export-backdrop accessibility-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAccessibilityOpen(false);
          }}
        >
          <section
            className="export-dialog accessibility-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="accessibility-title"
            aria-describedby="accessibility-description"
          >
            <div className="export-heading">
              <div>
                <span className="eyebrow">{uiCopy.accessibilityEyebrow}</span>
                <h2 id="accessibility-title">{uiCopy.accessibilityTitle}</h2>
                <p id="accessibility-description">{uiCopy.accessibilityDescription}</p>
              </div>
              <button
                ref={accessibilityCloseRef}
                className="export-close"
                aria-label={`${uiCopy.close} ${uiCopy.display.toLowerCase()}`}
                onClick={() => setAccessibilityOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="accessibility-language">
              <label htmlFor="ui-locale">{uiCopy.interfaceLanguage}</label>
              <select id="ui-locale" value={locale} onChange={(event) => setLocale(event.target.value as UiLocale)}>
                <option value="en">{uiCopy.english}</option>
                <option value="es">{uiCopy.spanish}</option>
              </select>
            </div>
            <div className="accessibility-options">
              <label className="accessibility-option">
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(event) => setReducedMotion(event.target.checked)}
                />
                <span>
                  <strong>{uiCopy.reduceMotionTitle}</strong>
                  <small>{uiCopy.reduceMotionDescription}</small>
                </span>
              </label>
              <label className="accessibility-option">
                <input
                  type="checkbox"
                  checked={highContrast}
                  onChange={(event) => setHighContrast(event.target.checked)}
                />
                <span>
                  <strong>{uiCopy.highContrastTitle}</strong>
                  <small>{uiCopy.highContrastDescription}</small>
                </span>
              </label>
            </div>
            <div className="accessibility-shortcuts" aria-label={uiCopy.keyboardAccess}>
              <span><kbd>⌘ K</kbd><small>{uiCopy.searchActions}</small></span>
              <span><kbd>1</kbd><small>{uiCopy.twoD}</small></span>
              <span><kbd>2</kbd><small>{uiCopy.threeDSkeleton}</small></span>
              <span><kbd>3</kbd><small>{uiCopy.threeDFinal}</small></span>
              <span><kbd>Esc</kbd><small>{uiCopy.close}</small></span>
            </div>
            <p className="accessibility-note">{uiCopy.accessibilityNote}</p>
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
      {componentLibraryOpen && (
        <div
          className="export-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setComponentLibraryOpen(false);
          }}
        >
          <section
            className="export-dialog component-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="component-library-title"
            aria-describedby="component-library-description"
          >
            <div className="export-heading">
              <div>
                <span className="eyebrow">Design data center</span>
                <h2 id="component-library-title">Component library</h2>
                <p id="component-library-description">Save reusable nose, airframe, fin-set, recovery, equipment-mass, and cylindrical-pod configurations with explicit provenance. Presets stay on this device unless you export or include them in a portable project file.</p>
              </div>
              <button
                ref={componentLibraryCloseRef}
                className="export-close"
                aria-label="Close component library"
                onClick={() => setComponentLibraryOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="component-library-current">
              <div>
                <span className="eyebrow">Current selection</span>
                <strong>{selectedComponentPreset ? componentPresetKindLabel(selectedComponentPreset.kind) : "Motor mount"}</strong>
                <small>{selectedComponentPreset ? "Save the current values as a reusable preset." : "Motor data is managed in the motor library."}</small>
              </div>
              <button className="primary-button" type="button" disabled={!selectedComponentPreset} onClick={saveCurrentComponentPreset}>Save current component</button>
            </div>
            <div className="component-library-list" aria-label="Saved component presets">
              {componentRecords.length === 0 ? (
                <div className="component-library-empty"><strong>No component presets yet</strong><span>Save the current design selection to create your first reusable part.</span></div>
              ) : componentRecords.map((record) => (
                <article className="component-record" key={record.id}>
                  <div className="component-record-main">
                    <span className="motor-record-badge user">{componentPresetKindLabel(record.kind)}</span>
                    <div><strong>{record.name}</strong><small>{componentPresetSummary(record)} · {record.provenance.sourceName}</small></div>
                  </div>
                  <div className="component-record-actions">
                    <span>{record.provenance.licenseIdentifier} · {record.provenance.validationStatus}</span>
                    <button type="button" onClick={() => applyComponentPreset(record)}>Use preset</button>
                    <button type="button" onClick={() => downloadTextArtifact(`${record.id}.json`, "application/json;charset=utf-8", serializeLocalComponentLibrary([record]))}>JSON</button>
                    <button type="button" className="danger-button" onClick={() => removeComponentPreset(record.id)}>Remove</button>
                  </div>
                </article>
              ))}
            </div>
            <div className="component-preset-fields">
              <div className="motor-import-heading"><div><span className="eyebrow">Preset metadata</span><h3>Save provenance</h3></div><span>{componentRecords.length} / 32 saved</span></div>
              <div className="motor-import-fields">
                <label>Preset name<input value={componentPresetDraft.name} onChange={(event) => setComponentPresetDraft((draft) => ({ ...draft, name: event.target.value }))} /></label>
                <label>Source name<input value={componentPresetDraft.sourceName} onChange={(event) => setComponentPresetDraft((draft) => ({ ...draft, sourceName: event.target.value }))} /></label>
                <label>Data version<input value={componentPresetDraft.dataVersion} onChange={(event) => setComponentPresetDraft((draft) => ({ ...draft, dataVersion: event.target.value }))} /></label>
                <label>License / permission<input value={componentPresetDraft.licenseIdentifier} onChange={(event) => setComponentPresetDraft((draft) => ({ ...draft, licenseIdentifier: event.target.value }))} /></label>
                <label>Attribution<input value={componentPresetDraft.attribution} onChange={(event) => setComponentPresetDraft((draft) => ({ ...draft, attribution: event.target.value }))} /></label>
                <label>Source URL (optional)<input inputMode="url" value={componentPresetDraft.sourceUrl} onChange={(event) => setComponentPresetDraft((draft) => ({ ...draft, sourceUrl: event.target.value }))} /></label>
              </div>
              <label className="component-description-field">Description (optional)<input value={componentPresetDraft.description} onChange={(event) => setComponentPresetDraft((draft) => ({ ...draft, description: event.target.value }))} /></label>
              {componentError && <p className="motor-import-error" role="alert">{componentError}</p>}
              <div className="motor-import-actions"><button className="primary-button" type="button" disabled={!selectedComponentPreset} onClick={saveCurrentComponentPreset}>Validate and save current values</button><span>Strict schema · project-authored-unvalidated</span></div>
            </div>
            <div className="component-import-section">
              <div className="motor-import-heading"><div><span className="eyebrow">Portable exchange</span><h3>Import a component library</h3></div><span>JSON schema v1</span></div>
              <label className="motor-csv-field">Component library JSON <small>Use JSON exported from RocketWorks. Imported records replace the current device-local component presets.</small><textarea value={componentImportJson} onChange={(event) => setComponentImportJson(event.target.value)} spellCheck={false} placeholder="Paste a component-library JSON document…" /></label>
              <div className="motor-import-actions"><button className="primary-button" type="button" disabled={!componentImportJson.trim()} onClick={importComponentLibrary}>Validate and import library</button><span>Max 32 records · source and license metadata required</span></div>
            </div>
            <div className="history-notice">
              <span>DATA BOUNDARY</span>
              <p>Presets store editable geometry, topology placement, and recovery inputs, not third-party CAD, motor databases, or simulation engines. Validation checks the schema and numeric bounds; they remain engineering-preview inputs and are never certification evidence.</p>
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
            <MotorThrustCurveChart record={previewMotor} />
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
                    {record.massFlowHistoryKgS && <button onClick={() => downloadTextArtifact(`${record.id}-mass-flow.csv`, "text/csv;charset=utf-8", exportMotorMassFlowCsv(record))}>Flow</button>}
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
                <label>Identifier / batch prefix<input value={motorImportDraft.id} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, id: event.target.value }))} /></label>
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
              <label className="motor-csv-field">Thrust curve CSV or RASP .eng <small>CSV Required header: time_s,thrust_n · RASP accepts one or multiple header blocks: designation diameter_mm length_mm delays propellant_g total_g manufacturer · SI thrust rows</small><textarea value={motorImportDraft.csv} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, csv: event.target.value }))} spellCheck={false} /></label>
              <label className="motor-csv-field motor-mass-flow-field">Measured mass-flow CSV (optional) <small>Header: time_s,mass_flow_kg_s · positive propellant outflow in kg/s · independent from thrust</small><textarea value={motorImportDraft.massFlowCsv} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, massFlowCsv: event.target.value }))} spellCheck={false} placeholder="time_s,mass_flow_kg_s\n0,0\n0.50,0.12\n1.00,0" /></label>
              {motorError && <p className="motor-import-error" role="alert">{motorError}</p>}
              <div className="motor-import-actions"><button className="primary-button" onClick={importUserMotor}>Validate and save motor(s)</button><span>Strict parser · max 2 MB · batch IDs use the prefix with numeric suffixes · user-supplied-unvalidated</span></div>
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
            <section className="topology-components" aria-labelledby="topology-components-title">
              <div className="topology-components-heading">
                <div>
                  <span className="eyebrow">Mass properties</span>
                  <h3 id="topology-components-title">Custom component instances</h3>
                  <p>Place equipment mass or a simple cylindrical pod inside any stage. These primitives update mass, CG, inertia, assembly preview, and exports.</p>
                </div>
                <div className="topology-add-actions">
                  <button onClick={() => addTopologyComponent("pointMass")} disabled={vehicleTopology.components.length >= 64}>+ Equipment mass</button>
                  <button onClick={() => addTopologyComponent("cylindricalPod")} disabled={vehicleTopology.components.length >= 64}>+ Cylindrical pod</button>
                </div>
              </div>
              {vehicleTopology.components.length === 0 ? (
                <div className="topology-components-empty">No custom components yet. Add avionics, ballast, a camera, or a bounded pod primitive to make the assembly mass model yours.</div>
              ) : (
                <div className="topology-components-list" aria-label="Custom topology components">
                  {vehicleTopology.components.map((component, index) => (
                    <article className={selectedTopologyComponentId === component.id ? "topology-component-card active selected" : component.enabled ? "topology-component-card active" : "topology-component-card"} key={component.id}>
                      <div className="topology-component-heading">
                        <div><span className="topology-component-index">C{String(index + 1).padStart(2, "0")}</span><strong>{component.name}</strong><small>{component.kind === "pointMass" ? "POINT MASS" : "CYLINDRICAL POD"} · {vehicleTopology.stages.find((stage) => stage.id === component.stageId)?.name ?? "Unknown stage"}</small></div>
                        <label className="topology-enabled"><input type="checkbox" checked={component.enabled} onChange={(event) => updateTopologyComponent(component.id, { enabled: event.target.checked })} /> Enabled</label>
                      </div>
                      <div className="topology-component-fields">
                        <label>Component name<input value={component.name} onChange={(event) => updateTopologyComponent(component.id, { name: event.target.value })} /></label>
                        <label>Stage<select value={component.stageId} onChange={(event) => updateTopologyComponent(component.id, { stageId: event.target.value })}>{vehicleTopology.stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></label>
                        <TopologyNumberField id={`${component.id}-axial`} label="Axial position (m)" value={component.axialPositionM} min={0} max={10} step={0.01} disabled={!component.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyComponent(component.id, { axialPositionM: value }); }} />
                        <TopologyNumberField id={`${component.id}-radial`} label="Radial offset (m)" value={component.radialOffsetM} min={0} max={2} step={0.005} disabled={!component.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyComponent(component.id, { radialOffsetM: value }); }} />
                        <TopologyNumberField id={`${component.id}-azimuth`} label="Azimuth (deg)" value={component.azimuthDeg} min={-180} max={180} step={1} disabled={!component.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyComponent(component.id, { azimuthDeg: value }); }} />
                        {component.kind === "pointMass" ? (
                          <>
                            <TopologyNumberField id={`${component.id}-mass`} label="Mass (kg)" value={component.massKg ?? 0.2} min={0.001} max={100} step={0.001} disabled={!component.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyComponent(component.id, { massKg: value }); }} />
                            <details className="topology-component-inertia">
                              <summary>Advanced local inertia (kg m²)</summary>
                              <div className="topology-component-inertia-fields">
                                <TopologyNumberField id={`${component.id}-inertia-x`} label="Ixx local" value={component.inertiaAtCenterKgM2?.x ?? 0} min={0} max={100} step={0.0001} disabled={!component.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyComponentInertia(component.id, "x", value); }} />
                                <TopologyNumberField id={`${component.id}-inertia-y`} label="Iyy local" value={component.inertiaAtCenterKgM2?.y ?? 0} min={0} max={100} step={0.0001} disabled={!component.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyComponentInertia(component.id, "y", value); }} />
                                <TopologyNumberField id={`${component.id}-inertia-z`} label="Izz local" value={component.inertiaAtCenterKgM2?.z ?? 0} min={0} max={100} step={0.0001} disabled={!component.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyComponentInertia(component.id, "z", value); }} />
                              </div>
                              <small>Principal moments at the equipment CG; products of inertia are assumed zero.</small>
                            </details>
                          </>
                        ) : (
                          <>
                            <TopologyNumberField id={`${component.id}-length`} label="Pod length (m)" value={component.lengthM ?? 0.25} min={0.01} max={5} step={0.01} disabled={!component.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyComponent(component.id, { lengthM: value }); }} />
                            <TopologyNumberField id={`${component.id}-diameter`} label="Pod diameter (m)" value={component.diameterM ?? 0.05} min={0.005} max={2} step={0.001} disabled={!component.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyComponent(component.id, { diameterM: value }); }} />
                            <TopologyNumberField id={`${component.id}-wall`} label="Wall thickness (m)" value={component.wallThicknessM ?? 0.001} min={0.0001} max={Math.max(0.0001, (component.diameterM ?? 0.05) / 2)} step={0.0001} disabled={!component.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyComponent(component.id, { wallThicknessM: value }); }} />
                            <TopologyNumberField id={`${component.id}-density`} label="Density (kg/m³)" value={component.densityKgM3 ?? 850} min={1} max={20000} step={1} disabled={!component.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyComponent(component.id, { densityKgM3: value }); }} />
                          </>
                        )}
                      </div>
                      <div className="topology-component-footer"><span>Local stage frame · X forward · radial placement rotates with repeated booster instances</span><div className="topology-component-actions"><button className="secondary-button" type="button" aria-pressed={selectedTopologyComponentId === component.id} onClick={() => { setSelectedTopologyComponentId(component.id); notify(`${component.name} selected for component library`); }}>{selectedTopologyComponentId === component.id ? "Selected for library" : "Select for library"}</button><button className="danger-button" type="button" onClick={() => removeTopologyComponent(component.id)}>Remove</button></div></div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <div className="topology-list" aria-label="Vehicle stages">
              {vehicleTopology.stages.map((stage, index) => (
                <article className={stage.enabled ? "topology-stage active" : "topology-stage"} key={stage.id}>
                  <div className="topology-stage-index"><span>{String(index + 1).padStart(2, "0")}</span><small>{stage.attachment === "parallel" ? "PARALLEL" : "SERIAL"}</small></div>
                  <div className="topology-stage-body">
                    <div className="topology-stage-heading"><div><strong>{stage.name}</strong><small>{stage.role} · {stage.repeatCount > 1 ? `${stage.repeatCount} radial instances` : "single instance"}</small></div><label className="topology-enabled"><input type="checkbox" checked={stage.enabled} onChange={(event) => updateTopologyStage(stage.id, { enabled: event.target.checked })} /> Enabled</label></div>
                    <div className="topology-stage-fields">
                      <label>Stage name<input value={stage.name} onChange={(event) => updateTopologyStage(stage.id, { name: event.target.value })} /></label>
                      <TopologyNumberField id={`${stage.id}-body-length`} label="Body length (m)" value={stage.bodyLengthM ?? ""} placeholder={stage.role === "core" ? "core input" : "role default"} min={0.05} max={10} step={0.01} disabled={stage.role === "core"} onChange={(value) => updateTopologyDimension(stage.id, "bodyLengthM", value)} />
                      <TopologyNumberField id={`${stage.id}-diameter`} label="Diameter (m)" value={stage.diameterM ?? ""} placeholder={stage.role === "core" ? "core input" : "role default"} min={0.02} max={2} step={0.001} disabled={stage.role === "core"} onChange={(value) => updateTopologyDimension(stage.id, "diameterM", value)} />
                      <TopologyNumberField id={`${stage.id}-nose-length`} label="Nose length (m)" value={stage.noseLengthM ?? ""} placeholder={stage.role === "core" ? "core input" : "role default"} min={0.01} max={3} step={0.01} disabled={stage.role === "core"} onChange={(value) => updateTopologyDimension(stage.id, "noseLengthM", value)} />
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
                      <TopologyNumberField id={`${stage.id}-repeat-count`} label="Repeat count" value={stage.repeatCount} min={1} max={8} step={1} onChange={(value) => { if (typeof value === "number") updateTopologyStage(stage.id, { repeatCount: value }); }} />
                      <TopologyNumberField id={`${stage.id}-repeat-radius`} label="Radial radius (m)" value={stage.repeatRadiusM} min={0} max={2} step={0.01} onChange={(value) => { if (typeof value === "number") updateTopologyStage(stage.id, { repeatRadiusM: value }); }} />
                      <TopologyNumberField id={`${stage.id}-motor-cant`} label="Motor cant (deg)" value={stage.thrustCantAngleDeg} min={0} max={15} step={0.1} disabled={stage.role === "payload"} onChange={(value) => { if (typeof value === "number") updateTopologyStage(stage.id, { thrustCantAngleDeg: value }); }} />
                      <TopologyNumberField id={`${stage.id}-cant-azimuth`} label="Cant azimuth (deg)" value={stage.thrustCantAzimuthDeg} min={-180} max={180} step={1} disabled={stage.role === "payload"} onChange={(value) => { if (typeof value === "number") updateTopologyStage(stage.id, { thrustCantAzimuthDeg: value }); }} />
                      {stage.role !== "payload" && <details className="topology-gimbal-editor">
                        <summary>Gimbal schedule {stage.gimbalSchedule && stage.gimbalSchedule.length > 0 ? `· ${stage.gimbalSchedule.length} points` : "· fixed axis"}</summary>
                        <p>Motor-local commanded offsets are linearly interpolated between points. Pitch and yaw are bounded to ±15°. Optional first-order response adds a deterministic vector lag for actuator feel; rate limits, servo saturation, and control-loop coupling remain outside the preview.</p>
                        <label className="topology-failure-toggle"><input type="checkbox" checked={stage.gimbalResponseTimeS !== undefined} disabled={!stage.gimbalSchedule || stage.gimbalSchedule.length === 0} onChange={(event) => updateTopologyStage(stage.id, { gimbalResponseTimeS: event.target.checked ? 0.15 : undefined })} /> First-order actuator response</label>
                        <TopologyNumberField id={`${stage.id}-gimbal-response`} label="Response time (s)" value={stage.gimbalResponseTimeS ?? 0.15} min={0.01} max={10} step={0.01} disabled={stage.gimbalResponseTimeS === undefined || !stage.gimbalSchedule || stage.gimbalSchedule.length === 0} onChange={(value) => { if (typeof value === "number") updateTopologyStage(stage.id, { gimbalResponseTimeS: value }); }} />
                        {(stage.gimbalSchedule ?? []).map((point, pointIndex) => <div className="topology-gimbal-point" key={`${stage.id}-gimbal-${pointIndex}`}>
                          <span className="topology-gimbal-index">{String(pointIndex + 1).padStart(2, "0")}</span>
                          <TopologyNumberField id={`${stage.id}-gimbal-${pointIndex}-time`} label="Time (s)" value={point.timeS} min={0} max={120} step={0.01} onChange={(value) => { if (typeof value === "number") updateTopologyGimbalPoint(stage, pointIndex, { timeS: value }); }} />
                          <TopologyNumberField id={`${stage.id}-gimbal-${pointIndex}-pitch`} label="Pitch offset (°)" value={point.pitchDeg} min={-15} max={15} step={0.1} onChange={(value) => { if (typeof value === "number") updateTopologyGimbalPoint(stage, pointIndex, { pitchDeg: value }); }} />
                          <TopologyNumberField id={`${stage.id}-gimbal-${pointIndex}-yaw`} label="Yaw offset (°)" value={point.yawDeg} min={-15} max={15} step={0.1} onChange={(value) => { if (typeof value === "number") updateTopologyGimbalPoint(stage, pointIndex, { yawDeg: value }); }} />
                          <button className="danger-button topology-gimbal-remove" type="button" onClick={() => removeTopologyGimbalPoint(stage, pointIndex)}>Remove</button>
                        </div>)}
                        <button className="secondary-button" type="button" onClick={() => addTopologyGimbalPoint(stage)}>Add gimbal point</button>
                      </details>}
                      {stage.role !== "payload" && <details className="topology-throttle-editor">
                        <summary>Throttle schedule {stage.throttleSchedule && stage.throttleSchedule.length > 0 ? `· ${stage.throttleSchedule.length} points` : "· full curve"}</summary>
                        <p>Motor-local commands scale the supplied thrust curve from 0–100%. Points are linearly interpolated; propellant depletion follows the delivered impulse, while motor burn timing stays tied to the supplied curve.</p>
                        {(stage.throttleSchedule ?? []).map((point, pointIndex) => <div className="topology-throttle-point" key={`${stage.id}-throttle-${pointIndex}`}>
                          <span className="topology-gimbal-index">{String(pointIndex + 1).padStart(2, "0")}</span>
                          <TopologyNumberField id={`${stage.id}-throttle-${pointIndex}-time`} label="Time (s)" value={point.timeS} min={0} max={120} step={0.01} onChange={(value) => { if (typeof value === "number") updateTopologyThrottlePoint(stage, pointIndex, { timeS: value }); }} />
                          <TopologyNumberField id={`${stage.id}-throttle-${pointIndex}-fraction`} label="Throttle (%)" value={point.throttleFraction * 100} min={0} max={100} step={1} onChange={(value) => { if (typeof value === "number") updateTopologyThrottlePoint(stage, pointIndex, { throttleFraction: value / 100 }); }} />
                          <button className="danger-button topology-gimbal-remove" type="button" onClick={() => removeTopologyThrottlePoint(stage, pointIndex)}>Remove</button>
                        </div>)}
                        <button className="secondary-button" type="button" onClick={() => addTopologyThrottlePoint(stage)}>Add throttle point</button>
                      </details>}
                    </div>
                    <div className="topology-stage-events">
                      <TopologyNumberField id={`${stage.id}-ignition-delay`} label="Ignition delay (s)" value={stage.ignitionDelayS} min={0} max={120} step={0.01} onChange={(value) => { if (typeof value === "number") updateTopologyStage(stage.id, { ignitionDelayS: value }); }} />
                      <TopologyNumberField id={`${stage.id}-separation-delay`} label="Separation delay (s)" value={stage.separationDelayS} min={0} max={120} step={0.01} disabled={stage.role === "core"} onChange={(value) => { if (typeof value === "number") updateTopologyStage(stage.id, { separationDelayS: value }); }} />
                      <TopologyNumberField id={`${stage.id}-separation-dv`} label="Separation dV (+X, m/s)" value={stage.separationDeltaVBodyMps ?? 0} min={0} max={30} step={0.01} disabled={stage.role === "core"} onChange={(value) => { if (typeof value === "number") updateTopologyStage(stage.id, { separationDeltaVBodyMps: value, ...(value > 0 ? { separationImpulseBodyNs: undefined } : {}) }); }} />
                      {stage.role !== "core" && stage.role !== "payload" && <details className="topology-separation-impulse-editor">
                        <summary>Measured separation impulse {stage.separationImpulseBodyNs ? "· active" : "· not configured"}</summary>
                        <p>Optional retained-body impulse in the stage body frame. RocketWorks converts it to dV using the live post-separation mass and keeps the measurement visible in the event audit.</p>
                        <div className="topology-separation-impulse-fields">
                          <TopologyNumberField id={`${stage.id}-separation-impulse-x`} label="Impulse X (N·s)" value={stage.separationImpulseBodyNs?.x ?? 0} min={-5000} max={5000} step={0.1} onChange={(value) => { if (typeof value === "number") updateTopologySeparationImpulse(stage, "x", value); }} />
                          <TopologyNumberField id={`${stage.id}-separation-impulse-y`} label="Impulse Y (N·s)" value={stage.separationImpulseBodyNs?.y ?? 0} min={-5000} max={5000} step={0.1} onChange={(value) => { if (typeof value === "number") updateTopologySeparationImpulse(stage, "y", value); }} />
                          <TopologyNumberField id={`${stage.id}-separation-impulse-z`} label="Impulse Z (N·s)" value={stage.separationImpulseBodyNs?.z ?? 0} min={-5000} max={5000} step={0.1} onChange={(value) => { if (typeof value === "number") updateTopologySeparationImpulse(stage, "z", value); }} />
                        </div>
                        {stage.separationImpulseBodyNs && <button className="secondary-button" type="button" onClick={() => clearTopologySeparationImpulse(stage)}>Clear measured impulse</button>}
                      </details>}
                      {stage.role !== "core" && stage.role !== "payload" && <>
                        <label className="topology-failure-toggle"><input type="checkbox" checked={stage.recovery?.enabled ?? false} onChange={(event) => updateTopologyRecovery(stage, { enabled: event.target.checked })} /> Detached recovery</label>
                        <TopologyNumberField id={`${stage.id}-recovery-diameter`} label="Canopy diameter (m)" value={stage.recovery?.diameterM ?? 0.45} min={0.05} max={3} step={0.01} disabled={!stage.recovery?.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyRecovery(stage, { diameterM: value }); }} />
                        <label>Recovery trigger<select value={stage.recovery?.deploymentTrigger ?? "apogee"} disabled={!stage.recovery?.enabled} onChange={(event) => updateTopologyRecovery(stage, { deploymentTrigger: event.target.value as VehicleStageRecoveryTrigger })}>
                          <option value="apogee">Branch apogee</option>
                          <option value="altitude">Descending altitude</option>
                          <option value="time">Mission time</option>
                        </select></label>
                        {stage.recovery?.deploymentTrigger === "altitude" && <TopologyNumberField id={`${stage.id}-recovery-altitude`} label="Trigger altitude (m AGL)" value={stage.recovery.deploymentAltitudeAglM ?? 150} min={0} max={100000} step={5} disabled={!stage.recovery.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyRecovery(stage, { deploymentAltitudeAglM: value }); }} />}
                        {stage.recovery?.deploymentTrigger === "time" && <TopologyNumberField id={`${stage.id}-recovery-time`} label="Trigger mission time (s)" value={stage.recovery.deploymentTimeS ?? 8} min={0} max={180} step={0.1} disabled={!stage.recovery.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyRecovery(stage, { deploymentTimeS: value }); }} />}
                        <TopologyNumberField id={`${stage.id}-recovery-delay`} label="Recovery delay (s)" value={stage.recovery?.deploymentDelayS ?? 0} min={0} max={60} step={0.1} disabled={!stage.recovery?.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyRecovery(stage, { deploymentDelayS: value }); }} />
                        <TopologyNumberField id={`${stage.id}-recovery-inflation`} label="Inflation time (s)" value={stage.recovery?.inflationTimeS ?? 1.2} min={0} max={30} step={0.1} disabled={!stage.recovery?.enabled} onChange={(value) => { if (typeof value === "number") updateTopologyRecovery(stage, { inflationTimeS: value }); }} />
                      </>}
                      <label>Failed motors (1-based)<input type="text" inputMode="text" placeholder={stageMotorInstanceCount(stage) > 1 ? "e.g. 1, 3" : "none"} value={topologyFailureDrafts[stage.id] ?? stage.failedMotorInstanceIndices.map((index) => index + 1).join(", ")} disabled={stage.role === "payload"} onChange={(event) => { setTopologyFailureDrafts((current) => ({ ...current, [stage.id]: event.target.value })); setTopologyError(""); }} onBlur={() => { const value = topologyFailureDrafts[stage.id]; if (value === undefined) return; if (updateTopologyMotorFailures(stage, value)) { setTopologyFailureDrafts((current) => { const next = { ...current }; delete next[stage.id]; return next; }); } }} /></label>
                      <label className="topology-failure-toggle"><input type="checkbox" checked={stage.ignitionFailure} onChange={(event) => updateTopologyStage(stage.id, { ignitionFailure: event.target.checked })} /> Force ignition failure in preview</label>
                    </div>
                    <div className="topology-stage-footer"><span>{stage.motorId ? `Motor · ${userMotorRecords.find((record) => record.id === stage.motorId)?.designation ?? "unavailable (global fallback)"}` : `Motor · global ${previewMotor.designation}`} · {stage.ignitionFailure ? "Preview ignition failure armed" : `${stage.repeatCount > 1 ? `Equal radial placement · ${stage.repeatRadiusM.toFixed(2)} m radius` : "No radial repetition"} · ignition +${stage.ignitionDelayS.toFixed(2)} s`}{(stage.separationDeltaVBodyMps ?? 0) > 0 ? ` · separation +${(stage.separationDeltaVBodyMps ?? 0).toFixed(2)} m/s` : ""}{stage.separationImpulseBodyNs ? ` · measured impulse ${Math.hypot(stage.separationImpulseBodyNs.x, stage.separationImpulseBodyNs.y, stage.separationImpulseBodyNs.z).toFixed(1)} N·s` : ""}{stage.recovery?.enabled ? ` · detached recovery Ø${stage.recovery.diameterM.toFixed(2)} m · ${stage.recovery.deploymentTrigger === "altitude" ? `descent ${stage.recovery.deploymentAltitudeAglM ?? 150} m` : stage.recovery.deploymentTrigger === "time" ? `time ${stage.recovery.deploymentTimeS ?? 8} s` : "branch apogee"}` : ""}{stage.failedMotorInstanceIndices.length > 0 ? ` · failed motor${stage.failedMotorInstanceIndices.length > 1 ? "s" : ""} ${stage.failedMotorInstanceIndices.map((index) => index + 1).join(", ")}` : ""}{stage.thrustCantAngleDeg > 0 ? ` · cant ${stage.thrustCantAngleDeg.toFixed(1)}° @ ${stage.thrustCantAzimuthDeg.toFixed(0)}°` : ""}{stage.gimbalSchedule && stage.gimbalSchedule.length > 0 ? ` · gimbal ${stage.gimbalSchedule.length} points` : ""}{stage.gimbalResponseTimeS !== undefined ? ` · response ${stage.gimbalResponseTimeS.toFixed(2)} s` : ""}{stage.throttleSchedule && stage.throttleSchedule.length > 0 ? ` · throttle ${stage.throttleSchedule.length} points` : ""}</span><div className="topology-stage-actions"><button className="secondary-button" onClick={() => duplicateTopologyStage(stage.id)}>Duplicate</button>{stage.role !== "core" && <button className="danger-button" onClick={() => removeTopologyStage(stage.id)}>Remove stage</button>}</div></div>
                  </div>
                </article>
              ))}
            </div>
            <div className="history-notice">
              <span>MODEL BOUNDARY</span>
              <p>Topology changes update analytical assembly mass, centre of gravity, inertia, instance counts, and stage-level aerodynamic source assignments. Repeated physical copies can separate independently in the retained-body event model. A regime with one available table uses it; combined stages with conflicting or unavailable tables fall back to the global source with an explicit warning. Coupled separation clearance, aerodynamic interference, and flight-safety validation remain outside this retained-body model; the staged preview exposes an independent trajectory for detached bodies, carries stage recovery with an apogee, descending-altitude, or mission-time command when configured, and otherwise uses bounded isotropic point drag or the gravity-only fallback.</p>
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
                <p id="history-description">Autosave records validated inputs, vehicle topology, and source selections in this browser. Restore any checkpoint without deleting newer entries.</p>
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
                <h2 id="export-title">Export {projectName}</h2>
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
              {benchmarkResult && <button onClick={() => exportArtifact("benchmark-csv")}>
                <span className="export-extension">CSV</span>
                <span><strong>Physics benchmark evidence</strong><small>Deterministic SI anchors and closed-form fixture results with model identity, tolerances, assumptions, and regression-only status.</small></span>
                <em>↓</em>
              </button>}
              {stageFlightResult && <button onClick={() => exportArtifact("stage-flight-csv")}>
                <span className="export-extension">CSV</span>
                <span><strong>Staged 6DOF trace</strong><small>Attached-stage topology, mass, thrust, altitude, and speed at each integration sample; convergence is retained in project JSON and the engineering report.</small></span>
                <em>↓</em>
              </button>}
              {stageFlightResult && stageFlightIsCurrent && stageComparisonReference && <button onClick={() => exportArtifact("stage-flight-comparison-csv")}>
                <span className="export-extension">CSV</span>
                <span><strong>Staged run comparison</strong><small>Current-minus-reference deltas for coupled metrics, sampled events, released bodies, and exact run fingerprints.</small></span>
                <em>↓</em>
              </button>}
              {stageFlightResult?.separatedBodies.length ? <button onClick={() => exportArtifact("separated-body-csv")}>
                <span className="export-extension">CSV</span>
                <span><strong>Released-body traces</strong><small>One flat SI-unit table for every detached stage, including release provenance, attitude-aware aero loads, recovery drag, and model versions.</small></span>
                <em>↓</em>
              </button> : null}
              {stageFlightResult?.coupledMultiBodyFlight && <button onClick={() => exportArtifact("coupled-body-csv")}>
                <span className="export-extension">CSV</span>
                <span><strong>Shared coupled traces</strong><small>Common-grid released-body positions, accelerations, and optional spherical-envelope contact force diagnostics.</small></span>
                <em>↓</em>
              </button>}
              {stageFlightResult && <button onClick={() => exportArtifact("flight-path-geojson")}>
                <span className="export-extension">GEO</span>
                <span><strong>Flight path</strong><small>WGS84 GeoJSON with retained/released paths, sample times, and event markers for GIS review.</small></span>
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
              {selectedAerodynamicTable && <button onClick={() => exportArtifact("aero-polar-csv")}>
                <span className="export-extension">CSV</span>
                <span><strong>Coefficient polar</strong><small>Fixed-condition angle-of-attack samples with model identity, uncertainty, applicability, and explicit legacy fallback metadata.</small></span>
                <em>↓</em>
              </button>}
              <button onClick={() => exportArtifact("dxf")}>
                <span className="export-extension">DXF</span>
                <span><strong>CAD side profile</strong><small>R12 millimetre airframe and fin outlines with centerline, CG, and CP layers.</small></span>
                <em>↓</em>
              </button>
              <button onClick={() => exportArtifact("stl")}>
                <span className="export-extension">STL</span>
                <span><strong>Reference mesh</strong><small>Triangulated millimetre nose, airframe, nozzle, and radial-fin mesh for CAD inspection and fit studies.</small></span>
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
              <p>STL is a triangulated reference mesh in millimetres for inspection and fit studies; it is not a toleranced solid, slicer toolpath, structural evidence, or manufacturing approval.</p>
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
          <p>Propagates bounded mass, thrust, drag, recovery-area, wind, ignition-delay, separation-impulse, contact-load scenario, launch-alignment, guide-friction, and rail-exit tip-off assumptions through staging, launch-rail constraints, topology aerodynamics, and the coupled rigid-body run.{hasDirectForceMomentDatabase ? " Direct force and static-moment coefficient databases receive separate bounded scales when present." : ""}</p>
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
            <span>{result.method} · n={result.successfulSampleCount}/{result.requestedSampleCount} · {publicModelVersion(result.adapterVersion)}</span>
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
            {result.metrics.maxContactNormalImpulseNs && (
              <UncertaintyMetric label="Contact impulse P05 / P50 / P95" summary={result.metrics.maxContactNormalImpulseNs} unit="N·s" decimals={2} />
            )}
            {result.metrics.maxContactLinearStopPeakForceN && (
              <UncertaintyMetric label="Contact force scale P05 / P50 / P95" summary={result.metrics.maxContactLinearStopPeakForceN} unit="N" decimals={1} />
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
          <NumberField id="correlation-coefficient" label="Latent coefficient" value={coefficient} unit="ρ" min={-0.998} max={0.998} step={0.05} slider onChange={setCoefficient} />
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
            <p>{publicModelVersion(result.modelVersion)} · {result.result.parameterKey} varied independently · {result.warnings[2]}</p>
          </div>
        </>
      ) : (
        <div className="sweep-empty"><strong>Inspect sensitivity before changing the design</strong><p>Run {steps || DEFAULT_SWEEP_STEPS} deterministic rows to see how {definition.label.toLowerCase()} moves apogee, peak dynamic pressure, and impact speed.</p></div>
      )}
    </section>
  );
}

function TopologyNumberField({
  id,
  label,
  value,
  placeholder,
  min,
  max,
  step,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  value: number | "";
  placeholder?: string;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number | string) => void;
}) {
  const sliderValue = typeof value === "number" && Number.isFinite(value) ? value : min;
  return (
    <label className="topology-number-field">
      <span>{label}</span>
      <input
        id={`${id}-slider`}
        className="topology-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        disabled={disabled}
        aria-label={`${label} slider`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="topology-number-input">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={label}
          onChange={(event) => {
            const raw = event.target.value;
            onChange(raw === "" ? "" : Number(raw));
          }}
        />
      </div>
    </label>
  );
}

function NumberField({
  id, label, value, unit, min, max, step, slider = false, onChange,
}: {
  id: string; label: string; value: number; unit: string; min: number; max: number;
  step?: number; slider?: boolean; onChange: (value: number) => void;
}) {
  return (
    <div className="field-group">
      <label htmlFor={id}>{label}</label>
      {slider && (
        <input
          id={`${id}-slider`}
          className="field-slider"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={`${label} slider`}
        />
      )}
      <div className="input-with-unit">
        <input id={id} type="number" min={min} max={max} step={step} value={value} onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }} />
        <span>{unit}</span>
      </div>
    </div>
  );
}
