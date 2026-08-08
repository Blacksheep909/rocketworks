"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { LandingFootprintChart } from "./landing-footprint-chart.tsx";
import { Rocket3DViewport } from "./rocket-3d-viewport.tsx";
import {
  createEngineeringReportMarkdown,
  createFlightTraceCsv,
  createKestrelProjectJson,
  createRocketOpenScad,
  createRocketProfileDxf,
  type JsonValue,
  type RocketCadGeometry,
} from "../lib/export/project-exports.ts";
import {
  analyzeRecoveryLandingDispersion,
  computeStaticStability,
  analyzeVerticalFlightUncertainty,
  createLaunchEnvironmentModel,
  createMotorDataRecord,
  exportMotorThrustCsv,
  importMotorThrustCsv,
  createVehicleAssemblyModel,
  makeConstantThrustCurve,
  optimizeVerticalFlightDesign,
  simulateRecoveryDescent,
  simulateVerticalFlight,
  type DesignOptimizationResult,
  type LandingDispersionResult,
  type UncertaintyAnalysisResult,
  type VerticalFlightConfig,
  type VerticalFlightResult,
  type VehicleComponent,
  type MotorDataRecord,
} from "../lib/physics/index.ts";
import {
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

type ComponentKey = "nose" | "body" | "fins" | "mount" | "recovery";
type ViewKey = "design" | "flight";
type DesignViewKey = "2d" | "3d";
type MaterialKey = "kraft" | "fiberglass" | "carbon";
type ExportFormat = "project" | "flight-csv" | "report" | "dxf" | "openscad";
type OptimizationPreview = Readonly<{
  result: DesignOptimizationResult;
  baseThrustN: number;
  baseRecoveryDiameterM: number;
}>;

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
};

const defaultMotorImportDraft: MotorImportDraft = {
  id: "user.motor-01",
  manufacturer: "User supplied",
  designation: "Test curve 01",
  description: "User-supplied thrust curve imported into Kestrel Lab.",
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
  Readonly<{ label: string; densityKgM3: number; wallThicknessM: number }>
> = {
  kraft: { label: "Kraft phenolic", densityKgM3: 850, wallThicknessM: 0.0012 },
  fiberglass: { label: "Fiberglass", densityKgM3: 1850, wallThicknessM: 0.001 },
  carbon: { label: "Carbon composite", densityKgM3: 1550, wallThicknessM: 0.0008 },
};

function createPreviewWindProfile(
  windSpeed: number,
  options: Readonly<{ windScale?: number; directionOffsetRad?: number }> = {},
) {
  const windScale = options.windScale ?? 1;
  const directionOffsetRad = options.directionOffsetRad ?? 0;
  const cosine = Math.cos(directionOffsetRad);
  const sine = Math.sin(directionOffsetRad);
  return [
    { altitudeM: 0, eastMps: windSpeed * 0.5, northMps: 0, upMps: 0 },
    { altitudeM: 500, eastMps: windSpeed, northMps: windSpeed * 0.2, upMps: 0 },
    { altitudeM: 2000, eastMps: windSpeed * 1.4, northMps: windSpeed * 0.4, upMps: 0 },
  ].map((layer) => ({
    ...layer,
    eastMps: (layer.eastMps * cosine - layer.northMps * sine) * windScale,
    northMps: (layer.eastMps * sine + layer.northMps * cosine) * windScale,
    upMps: layer.upMps * windScale,
  }));
}

function createPreviewEnvironment(
  launchAltitude: number,
  windSpeed: number,
  options: Readonly<{
    seed?: string;
    windScale?: number;
    directionOffsetRad?: number;
    turbulenceScale?: number;
  }> = {},
) {
  const turbulenceScale = options.turbulenceScale ?? 1;
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
      dataVersion: "preview-1",
      licenseIdentifier: "CC0-1.0",
      attribution: "Original Kestrel Lab synthetic environment",
      validationStatus: "synthetic-unvalidated",
    },
    meanWindProfile: createPreviewWindProfile(windSpeed, options),
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
  material,
  payloadMassKg,
}: {
  lengthM: number;
  diameterM: number;
  material: MaterialKey;
  payloadMassKg: number;
}): VehicleComponent[] {
  const noseLengthM = 0.18;
  const radiusM = diameterM / 2;
  const airframe = materialModels[material];
  return [
    {
      id: "nose",
      name: "Nose cone",
      stageId: "sustainer",
      kind: "axisymmetric",
      densityKgM3: 1150,
      wallThicknessM: 0.002,
      stations: [
        { xM: 0, outerRadiusM: 0 },
        { xM: noseLengthM * 0.35, outerRadiusM: radiusM * 0.62 },
        { xM: noseLengthM, outerRadiusM: radiusM },
      ],
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
      count: 3,
      axialPositionM: noseLengthM + Math.max(0, lengthM - 0.13),
      bodyRadiusM: radiusM,
      rootChordM: 0.13,
      tipChordM: 0.055,
      sweepM: 0.045,
      spanM: 0.075,
      thicknessM: 0.003,
      densityKgM3: 600,
    },
    {
      id: "motor",
      name: "Motor and mount allowance",
      stageId: "sustainer",
      kind: "pointMass",
      massKg: 0.16,
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
      massKg: 0.06,
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

function createFlightConfig({
  mass,
  diameter,
  dragCoefficient,
  thrust,
  burnTime,
  launchAltitude,
  windSpeed,
  recoveryEnabled,
  recoveryDelay,
  recoveryDiameter,
  motorRecord,
}: {
  mass: number;
  diameter: number;
  dragCoefficient: number;
  thrust: number;
  burnTime: number;
  launchAltitude: number;
  windSpeed: number;
  recoveryEnabled: boolean;
  recoveryDelay: number;
  recoveryDiameter: number;
  motorRecord?: MotorDataRecord;
}): VerticalFlightConfig {
  const motor = motorRecord ?? createPreviewMotorRecord({ mass, thrust, burnTime });
  const propellantMassKg = motor.metrics.propellantMassKg;
  const motorMassDeltaKg = motorRecord ? motor.launchMassKg - 0.16 : 0;
  const launchMassKg = mass + motorMassDeltaKg;
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
    motor: { thrustCurve: [...motor.thrustCurve] },
    recovery: {
      enabled: recoveryEnabled,
      dragAreaM2: Math.PI * Math.pow(recoveryDiameter / 2, 2),
      dragCoefficient: 0.75,
      deploymentDelayAfterApogeeS: recoveryDelay,
    },
    environment: {
      launchAltitudeM: launchAltitude,
      windProfile: createPreviewWindProfile(windSpeed),
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
    manufacturer: "Kestrel Lab",
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
      attribution: "Original Kestrel Lab synthetic curve",
      validationStatus: "synthetic-unvalidated",
    },
  });
}

function createFlightResult(inputs: Parameters<typeof createFlightConfig>[0]) {
  return simulateVerticalFlight(createFlightConfig(inputs));
}

function createUncertaintyResult(
  inputs: Parameters<typeof createFlightConfig>[0],
): UncertaintyAnalysisResult {
  return analyzeVerticalFlightUncertainty({
    baseConfig: createFlightConfig(inputs),
    seed: "arc54-preview-v1",
    sampleCount: 48,
    factors: [
      {
        key: "dryMassScale",
        label: "Dry mass",
        distribution: { kind: "triangular", minimum: 0.97, mode: 1, maximum: 1.03 },
      },
      {
        key: "dragCoefficientScale",
        label: "Drag coefficient",
        distribution: { kind: "triangular", minimum: 0.9, mode: 1, maximum: 1.1 },
      },
      {
        key: "thrustScale",
        label: "Delivered thrust",
        distribution: { kind: "normal", mean: 1, standardDeviation: 0.04, minimum: 0.85, maximum: 1.15 },
      },
      {
        key: "windScale",
        label: "Wind profile",
        distribution: { kind: "uniform", minimum: 0.8, maximum: 1.2 },
      },
    ],
    thresholds: [
      { id: "low-apogee", metric: "apogeeM", comparison: "less-than", value: 250 },
    ],
  });
}

function createOptimizationResult(
  inputs: Parameters<typeof createFlightConfig>[0],
): DesignOptimizationResult {
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
    ],
  });
}

function createLandingPrediction(
  inputs: Parameters<typeof createFlightConfig>[0],
  flightResult: VerticalFlightResult,
): LandingDispersionResult | null {
  if (!(flightResult.apogeeM > 0)) return null;
  const motor = inputs.motorRecord ?? createPreviewMotorRecord({
    mass: inputs.mass,
    thrust: inputs.thrust,
    burnTime: inputs.burnTime,
  });
  const launchMassKg = inputs.mass + (inputs.motorRecord ? inputs.motorRecord.launchMassKg - 0.16 : 0);
  const descentMassKg = launchMassKg - motor.metrics.propellantMassKg;
  const site = {
    name: "ARC 54 synthetic range",
    latitudeDeg: -36.85,
    longitudeDeg: 174.76,
    elevationM: inputs.launchAltitude,
    datum: "WGS84" as const,
    timeZone: "Pacific/Auckland",
  };
  return analyzeRecoveryLandingDispersion({
    site,
    seed: "arc54-landing-v1",
    sampleCount: 24,
    parameters: [
      {
        key: "windScale",
        label: "Mean wind magnitude",
        distribution: { kind: "uniform", minimum: 0.72, maximum: 1.28 },
      },
      {
        key: "windDirectionOffsetRad",
        label: "Wind direction offset",
        distribution: {
          kind: "normal",
          mean: 0,
          standardDeviation: (8 * Math.PI) / 180,
          minimum: (-22 * Math.PI) / 180,
          maximum: (22 * Math.PI) / 180,
        },
      },
      {
        key: "turbulenceScale",
        label: "Turbulence intensity",
        distribution: { kind: "triangular", minimum: 0.65, mode: 1, maximum: 1.4 },
      },
      {
        key: "descentMassScale",
        label: "Descent mass",
        distribution: { kind: "triangular", minimum: 0.97, mode: 1, maximum: 1.03 },
      },
      ...(inputs.recoveryEnabled
        ? [
            {
              key: "recoveryAreaScale",
              label: "Canopy drag area",
              distribution: {
                kind: "triangular" as const,
                minimum: 0.8,
                mode: 1,
                maximum: 1.2,
              },
            },
            {
              key: "deploymentDelayOffsetS",
              label: "Deployment delay",
              distribution: {
                kind: "normal" as const,
                mean: 0,
                standardDeviation: 0.18,
                minimum: -0.3,
                maximum: 0.5,
              },
            },
          ]
        : []),
    ],
    descentForSample: (values, sampleIndex) => {
      const environment = createPreviewEnvironment(
        inputs.launchAltitude,
        inputs.windSpeed,
        {
          seed: `arc54-landing-weather-${sampleIndex}`,
          windScale: values.windScale,
          directionOffsetRad: values.windDirectionOffsetRad,
          turbulenceScale: values.turbulenceScale,
        },
      );
      return simulateRecoveryDescent({
        massKg: descentMassKg * values.descentMassScale,
        initialTimeS: flightResult.timeToApogeeS,
        initialPositionWorldM: { x: 0, y: 0, z: flightResult.apogeeM },
        initialVelocityWorldMps: { x: 0, y: 0, z: 0 },
        environmentAt: environment.at,
        ballisticDragCoefficient: inputs.dragCoefficient,
        ballisticReferenceAreaM2:
          Math.PI * Math.pow(inputs.diameter / 2000, 2),
        recovery: inputs.recoveryEnabled
          ? {
              dragCoefficient: 0.75,
              referenceAreaM2:
                Math.PI * Math.pow(inputs.recoveryDiameter / 2, 2) *
                values.recoveryAreaScale,
              deploymentDelayS: Math.max(
                0,
                inputs.recoveryDelay + values.deploymentDelayOffsetS,
              ),
              inflationTimeS: 1.2,
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

function FlightChart({ result }: { result: VerticalFlightResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, bounds.width * ratio);
    canvas.height = Math.max(1, bounds.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);

    const width = bounds.width;
    const height = bounds.height;
    const padding = { top: 22, right: 18, bottom: 28, left: 42 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const maxTime = Math.max(result.totalFlightTimeS, 1);
    const maxAltitude = Math.max(result.apogeeM, 1);

    context.clearRect(0, 0, width, height);
    context.font = "11px ui-monospace, SFMono-Regular, Consolas, monospace";
    context.fillStyle = "#83919e";
    context.strokeStyle = "rgba(125, 158, 182, 0.16)";

    for (let index = 0; index <= 4; index += 1) {
      const y = padding.top + (plotHeight / 4) * index;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
      context.fillText(`${Math.round(maxAltitude * (1 - index / 4))} m`, 2, y + 4);
    }

    const coordinates = result.trace.map((point) => ({
      x: padding.left + (point.timeS / maxTime) * plotWidth,
      y:
        padding.top +
        plotHeight -
        (point.altitudeAglM / maxAltitude) * plotHeight,
    }));
    const gradient = context.createLinearGradient(0, padding.top, 0, height);
    gradient.addColorStop(0, "rgba(47, 159, 255, 0.28)");
    gradient.addColorStop(1, "rgba(47, 159, 255, 0.01)");
    context.beginPath();
    context.moveTo(coordinates[0].x, padding.top + plotHeight);
    coordinates.forEach((point) => context.lineTo(point.x, point.y));
    context.lineTo(coordinates.at(-1)?.x ?? width, padding.top + plotHeight);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();
    context.beginPath();
    coordinates.forEach((point, index) =>
      index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
    );
    context.strokeStyle = "#2f9fff";
    context.lineWidth = 2.4;
    context.lineJoin = "round";
    context.stroke();
    context.fillStyle = "#83919e";
    context.fillText("0 s", padding.left, height - 7);
    context.fillText(`${maxTime.toFixed(1)} s`, width - padding.right - 36, height - 7);
  }, [result]);

  return (
    <canvas
      ref={canvasRef}
      className="flight-chart"
      aria-label="Estimated altitude over time"
      role="img"
    />
  );
}

export default function Home() {
  const [selected, setSelected] = useState<ComponentKey>("body");
  const [view, setView] = useState<ViewKey>("design");
  const [designView, setDesignView] = useState<DesignViewKey>("2d");
  const [length, setLength] = useState(710);
  const [diameter, setDiameter] = useState(54);
  const [payloadMass, setPayloadMass] = useState(0.16);
  const [material, setMaterial] = useState<MaterialKey>("kraft");
  const [thrust, setThrust] = useState(22);
  const [burnTime, setBurnTime] = useState(1.65);
  const [dragCoefficient, setDragCoefficient] = useState(0.52);
  const [launchAltitude, setLaunchAltitude] = useState(80);
  const [windSpeed, setWindSpeed] = useState(4);
  const [recoveryEnabled, setRecoveryEnabled] = useState(true);
  const [recoveryDelay, setRecoveryDelay] = useState(0);
  const [recoveryDiameter, setRecoveryDiameter] = useState(0.45);
  const [running, setRunning] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimization, setOptimization] = useState<OptimizationPreview | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportCloseRef = useRef<HTMLButtonElement>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templatesCloseRef = useRef<HTMLButtonElement>(null);
  const [motorLibraryOpen, setMotorLibraryOpen] = useState(false);
  const motorLibraryCloseRef = useRef<HTMLButtonElement>(null);
  const [userMotorRecords, setUserMotorRecords] = useState<MotorDataRecord[]>([]);
  const [selectedMotorId, setSelectedMotorId] = useState("synthetic");
  const [motorImportDraft, setMotorImportDraft] = useState<MotorImportDraft>(defaultMotorImportDraft);
  const [motorError, setMotorError] = useState("");
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
  const [storageReady, setStorageReady] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");
  const editableInputs = useMemo<EditableProjectInputs>(
    () => ({
      lengthMm: length,
      diameterMm: diameter,
      payloadMassKg: payloadMass,
      material,
      thrustN: thrust,
      burnTimeS: burnTime,
      dragCoefficient,
      launchAltitudeM: launchAltitude,
      windSpeedMps: windSpeed,
      recoveryEnabled,
      recoveryDelayS: recoveryDelay,
      recoveryDiameterM: recoveryDiameter,
    }),
    [burnTime, diameter, dragCoefficient, launchAltitude, length, material, payloadMass, recoveryDelay, recoveryDiameter, recoveryEnabled, thrust, windSpeed],
  );
  const initialInputsRef = useRef(editableInputs);
  const vehicleComponents = useMemo(
    () =>
      makeDesignComponents({
        lengthM: length / 1000,
        diameterM: diameter / 1000,
        material,
        payloadMassKg: payloadMass,
      }),
    [diameter, length, material, payloadMass],
  );
  const assembly = useMemo(
    () =>
      createVehicleAssemblyModel({
        id: "arc54-assembly",
        name: "ARC 54 assembly",
        stages: [
          {
            id: "sustainer",
            name: "Sustainer",
            role: "core",
            attachment: "serial",
            children: vehicleComponents.map((component) => ({
              id: `assembly-${component.id}`,
              name: component.name,
              kind: "component" as const,
              component,
            })),
          },
        ],
      }).evaluate(),
    [vehicleComponents],
  );
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
  const previewEnvironment = useMemo(
    () => createPreviewEnvironment(launchAltitude, windSpeed),
    [launchAltitude, windSpeed],
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
      recoveryEnabled,
      recoveryDelay,
      recoveryDiameter,
      motorRecord: previewMotor,
    }),
  );
  const [uncertainty, setUncertainty] = useState<UncertaintyAnalysisResult>(() =>
    createUncertaintyResult({
      mass,
      diameter,
      dragCoefficient,
      thrust,
      burnTime,
      launchAltitude,
      windSpeed,
      recoveryEnabled,
      recoveryDelay,
      recoveryDiameter,
      motorRecord: previewMotor,
    }),
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
          recoveryEnabled,
          recoveryDelay,
          recoveryDiameter,
          motorRecord: previewMotor,
        },
        result,
      ),
    );

  const selectedComponent = components.find((component) => component.id === selected)!;
  const designLength = length + 180;
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
      const storedMode = window.localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY);
      if (storedMode === "beginner" || storedMode === "expert") setExperienceMode(storedMode);
      if (restoredSnapshot?.projectId === "arc54") {
        const inputs = restoredSnapshot.inputs;
        setLength(inputs.lengthMm);
        setDiameter(inputs.diameterMm);
        setPayloadMass(inputs.payloadMassKg);
        setMaterial(inputs.material);
        setThrust(inputs.thrustN);
        setBurnTime(inputs.burnTimeS);
        setDragCoefficient(inputs.dragCoefficient);
        setLaunchAltitude(inputs.launchAltitudeM);
        setWindSpeed(inputs.windSpeedMps);
        setRecoveryEnabled(inputs.recoveryEnabled);
        setRecoveryDelay(inputs.recoveryDelayS);
        setRecoveryDiameter(inputs.recoveryDiameterM);
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

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };
  const markChanged = () => setSaved(false);
  const applyEditableInputs = (inputs: EditableProjectInputs) => {
    setLength(inputs.lengthMm);
    setDiameter(inputs.diameterMm);
    setPayloadMass(inputs.payloadMassKg);
    setMaterial(inputs.material);
    setThrust(inputs.thrustN);
    setBurnTime(inputs.burnTimeS);
    setDragCoefficient(inputs.dragCoefficient);
    setLaunchAltitude(inputs.launchAltitudeM);
    setWindSpeed(inputs.windSpeedMps);
    setRecoveryEnabled(inputs.recoveryEnabled);
    setRecoveryDelay(inputs.recoveryDelayS);
    setRecoveryDiameter(inputs.recoveryDiameterM);
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
  const selectMotor = (id: string) => {
    setSelectedMotorId(id);
    setMotorLibraryOpen(false);
    setMotorError("");
    notify(id === "synthetic" ? "Synthetic preview selected; rerun the estimate" : "Motor selected; rerun the estimate");
  };
  const importUserMotor = () => {
    try {
      const draft = motorImportDraft;
      const record = importMotorThrustCsv(draft.csv, {
        id: draft.id.trim(),
        manufacturer: draft.manufacturer.trim(),
        designation: draft.designation.trim(),
        description: draft.description.trim() || undefined,
        diameterM: Number(draft.diameterMm) / 1000,
        lengthM: Number(draft.lengthMm) / 1000,
        launchMassKg: Number(draft.launchMassKg),
        dryMassKg: Number(draft.dryMassKg),
        provenance: {
          sourceName: draft.sourceName.trim(),
          sourceKind: "user-supplied",
          dataVersion: draft.dataVersion.trim(),
          licenseIdentifier: draft.licenseIdentifier.trim(),
          attribution: draft.attribution.trim(),
          sourceUrl: draft.sourceUrl.trim() || undefined,
          validationStatus: "user-supplied-unvalidated",
        },
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
  const exportArtifact = (format: ExportFormat) => {
    try {
      const generatedAtIso = new Date().toISOString();
      const cadGeometry: RocketCadGeometry = {
        projectName: "ARC 54",
        noseLengthM: 0.18,
        bodyLengthM: length / 1000,
        diameterM: diameter / 1000,
        finCount: 3,
        finRootChordM: Math.min(0.13, (length / 1000) * 0.45),
        finTipChordM: Math.min(0.055, (length / 1000) * 0.18),
        finSweepM: Math.min(0.045, (length / 1000) * 0.14),
        finSpanM: 0.075,
        finThicknessM: 0.003,
        centerOfMassXM: massProperties.centerOfMassM.x,
        centerOfPressureXM: staticStability.centerOfPressureXM,
      };
      let filename: string;
      let mediaType: string;
      let content: string;
      if (format === "project") {
        filename = "arc-54.kestrel.json";
        mediaType = "application/json;charset=utf-8";
        content = createKestrelProjectJson({
          projectId: "arc54",
          projectName: "ARC 54",
          generatedAtIso,
          applicationVersion: "kestrel-lab-prototype-0.1.0",
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
            },
          } as unknown as JsonValue,
          simulations: {
            verticalFlight: result,
          } as unknown as JsonValue,
          analyses: {
            uncertainty,
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
                  failedScenarioCount:
                    landingPrediction.uncertainty.failedSampleCount,
                }
              : null,
          } as unknown as JsonValue,
          provenance: {
            motor: previewMotor.provenance,
            environment: previewEnvironment.definition.provenance,
            cleanRoomImplementation: true,
          } as unknown as JsonValue,
        });
      } else if (format === "flight-csv") {
        filename = "arc-54-flight-trace.csv";
        mediaType = "text/csv;charset=utf-8";
        content = createFlightTraceCsv(result.trace);
      } else if (format === "report") {
        filename = "arc-54-engineering-report.md";
        mediaType = "text/markdown;charset=utf-8";
        content = createEngineeringReportMarkdown({
          projectName: "ARC 54",
          generatedAtIso,
          vehicle: {
            lengthM: (length + 180) / 1000,
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
            provenance: `${previewMotor.provenance.sourceName} · ${previewMotor.provenance.licenseIdentifier} · ${previewMotor.provenance.validationStatus}`,
          },
          environment: {
            siteName: previewEnvironment.definition.site.name,
            elevationM: previewEnvironment.definition.site.elevationM,
            meanWindAt500Mps: Math.hypot(
              environmentAt500M.meanWindWorldMps.x,
              environmentAt500M.meanWindWorldMps.y,
            ),
            modelVersion: previewEnvironment.modelVersion,
            validationStatus: previewEnvironment.validationStatus,
            provenance: `${previewEnvironment.definition.provenance.sourceName} · ${previewEnvironment.definition.provenance.licenseIdentifier} · ${previewEnvironment.definition.provenance.validationStatus}`,
          },
          flight: result,
          landing: landingPrediction,
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
    setRunning(true);
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
          recoveryEnabled,
          recoveryDelay,
          recoveryDiameter,
          motorRecord: previewMotor,
        };
        const nextResult = createFlightResult(inputs);
        setResult(nextResult);
        setUncertainty(createUncertaintyResult(inputs));
        setLandingPrediction(createLandingPrediction(inputs, nextResult));
        setOptimization(null);
        notify("Model run complete");
      } catch (error) {
        notify(error instanceof Error ? error.message : "Unable to run the model");
      } finally {
        setRunning(false);
      }
    }, 520);
  };
  const optimize = () => {
    setOptimizing(true);
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
          recoveryEnabled,
          recoveryDelay,
          recoveryDiameter,
          motorRecord: previewMotor,
        };
        setOptimization({
          result: createOptimizationResult(inputs),
          baseThrustN: thrust,
          baseRecoveryDiameterM: recoveryDiameter,
        });
        notify("Design tradeoffs ready");
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">K</span>
          <div><strong>Kestrel Lab</strong><span>Aerospace workbench</span></div>
        </div>
        <div className="project-title">
          <button className="quiet-button" aria-label="Go back to projects">‹</button>
          <div><strong>ARC 54</strong><span><i className="live-dot" />{saveError ? "Local save unavailable" : saved ? "Saved locally" : "Saving changes…"}</span></div>
        </div>
        <div className="top-actions">
          <div className="mission-chip" aria-label="Mission status"><span>MISSION</span><strong>KST-01</strong><em>PRELIMINARY</em></div>
          <button className="quiet-button command-button" onClick={() => notify("Command search is planned next")}>
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
          <span className="stage-index">Stage 01</span>
          <span><strong>Sustainer</strong><small>{assembly.componentInstances.length} placed parts · serial topology</small></span>
          <em>Active</em>
        </div>
        <div className="component-list-heading">
          <span>Components</span>
          <button onClick={() => notify("Component library is coming next")}>+ Add</button>
        </div>
        <nav className="component-list" aria-label="Rocket components">
          {components.map((component) => (
            <button
              className={selected === component.id ? "component active" : "component"}
              key={component.id}
              onClick={() => { setSelected(component.id); setView("design"); }}
            >
              <span className="component-marker">{component.marker}</span>
              <span><strong>{component.name}</strong><small>{component.detail}</small></span>
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
            <span>DESIGN LOOP</span><strong>ARC 54 / SUSTAINER</strong>
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
              <p>Start with a template, watch the live CG/CP markers, and run a clearly qualified preview. Kestrel Lab will explain what each result means.</p>
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
                <div className="rocket-nose" />
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
                noseLengthM={0.18}
                bodyLengthM={length / 1000}
                bodyDiameterM={diameter / 1000}
                centerOfMassXM={massProperties.centerOfMassM.x}
                centerOfPressureXM={staticStability.centerOfPressureXM}
              />
            </div>
          )
        ) : (
          <div className="flight-view">
            <div className="flight-heading">
              <div><span className="eyebrow">Preliminary estimate</span><h2>Vertical flight profile</h2></div>
              <span className="model-badge">{result.modelVersion}</span>
            </div>
            <div className="metric-grid">
              <div className="metric"><span>Apogee</span><strong>{running ? <Skeleton width={86} /> : `${result.apogeeM.toFixed(0)} m`}</strong><small>Above launch point</small></div>
              <div className="metric"><span>Maximum speed</span><strong>{running ? <Skeleton width={96} /> : `${result.maxSpeedMps.toFixed(1)} m/s`}</strong><small>{result.maxMach.toFixed(2)} Mach</small></div>
              <div className="metric"><span>Time to apogee</span><strong>{running ? <Skeleton width={74} /> : `${result.timeToApogeeS.toFixed(1)} s`}</strong><small>{result.totalFlightTimeS.toFixed(1)} s total flight</small></div>
              <div className="metric"><span>Thrust / weight</span><strong>{running ? <Skeleton width={62} /> : `${result.thrustToWeightAtIgnition.toFixed(1)} : 1`}</strong><small>{result.totalImpulseNs.toFixed(1)} N·s impulse</small></div>
            </div>
            <div className="chart-card">
              <div className="chart-title">
                <div><strong>Altitude</strong><span>Estimated trajectory over time</span></div>
                <span className="legend"><i /> Max q {Math.round(result.maxDynamicPressurePa)} Pa</span>
              </div>
              {running ? <div className="chart-loading"><Skeleton height={260} borderRadius={12} /></div> : <FlightChart result={result} />}
            </div>
            <div className="uncertainty-card">
              <div className="event-card-heading">
                <div>
                  <strong>Dispersion envelope</strong>
                  <span>Seeded input-uncertainty propagation</span>
                </div>
                <span>{uncertainty.method} · n={uncertainty.successfulSampleCount}</span>
              </div>
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
                <div className="uncertainty-driver">
                  <span>Primary apogee driver</span>
                  <strong>{uncertainty.sensitivityByMetric.apogeeM?.[0]?.parameterLabel ?? "Unavailable"}</strong>
                  <small>
                    Spearman ρ {uncertainty.sensitivityByMetric.apogeeM?.[0]?.spearmanRho?.toFixed(2) ?? "—"}
                  </small>
                </div>
              </div>
              <div className="uncertainty-disclaimer">
                <span>MODEL UNCERTAINTY</span>
                <p>Assumed independent input distributions · seed {uncertainty.seed} · not validation, certification, or a flight-safety assessment.</p>
              </div>
            </div>
            <div className="optimization-card">
              <div className="event-card-heading">
                <div>
                  <strong>Design optimization</strong>
                  <span>Constraint-aware Pareto tradeoffs</span>
                </div>
                <span>
                  {optimization
                    ? `${optimization.result.paretoFront.length} Pareto candidates`
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
                            : `${Math.round(optimization.baseRecoveryDiameterM * Math.sqrt(candidate.variables.recoveryDragAreaScale) * 1000)} mm canopy`} · {candidate.metrics.apogeeM.toFixed(0)} m apogee
                        </small>
                      </div>
                    ))}
                  </div>
                  <div className="optimization-actions">
                    <button onClick={applyOptimizationRecommendation}>Apply compromise</button>
                    <button onClick={optimize}>Run again</button>
                  </div>
                </>
              ) : optimization ? (
                <div className="optimization-empty">
                  <strong>No feasible candidate found</strong>
                  <p>Widen the design bounds or review the Mach, dynamic-pressure, thrust-to-weight, and impact-speed guardrails.</p>
                  <button onClick={optimize}>Retry search</button>
                </div>
              ) : (
                <div className="optimization-empty">
                  <strong>Explore motor and recovery tradeoffs</strong>
                  <p>Runs 144 deterministic candidate simulations and returns a Pareto set. Your current design is not changed until you apply a recommendation.</p>
                  <button onClick={optimize}>Find better designs</button>
                </div>
              )}
              <div className="optimization-disclaimer">
                <span>UNVALIDATED SEARCH</span>
                <p>Seed arc54-optimizer-v1 · evolutionary search cannot prove a global optimum and may exploit model error. Independently validate before manufacturing or flight.</p>
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
                    <div>
                      <span>95% covariance ellipse</span>
                      <strong>{landingPrediction.footprint.confidenceEllipses[2].semiMajorM.toFixed(0)} × {landingPrediction.footprint.confidenceEllipses[2].semiMinorM.toFixed(0)} m</strong>
                      <small>{landingPrediction.footprint.confidenceEllipses[2].majorAxisAngleDegFromEast.toFixed(0)}° from east</small>
                    </div>
                  </div>
                </div>
                <div className="landing-disclaimer">
                  <span>RECOVERY PHASE ONLY</span>
                  <p>Seed {landingPrediction.seed} · includes mean wind, deterministic turbulence, canopy-area, mass, direction, and delay scenarios. Ascent drift, terrain, obstacles, canopy pendulum motion, and range constraints are omitted. Not a flight-safety corridor.</p>
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
            <NumberField id="length" label="Airframe length" value={length} unit="mm" min={200} max={1600} onChange={(value) => { setLength(value); markChanged(); }} />
            <NumberField id="diameter" label="Outer diameter" value={diameter} unit="mm" min={20} max={200} onChange={(value) => { setDiameter(value); markChanged(); }} />
            <NumberField id="payload-mass" label="Payload + avionics allowance" value={payloadMass} unit="kg" min={0.001} max={20} step={0.01} onChange={(value) => { setPayloadMass(value); markChanged(); }} />
            <div className="field-group">
              <label htmlFor="material">Airframe material model</label>
              <select id="material" value={material} onChange={(event) => { setMaterial(event.target.value as MaterialKey); markChanged(); }}>
                {Object.entries(materialModels).map(([key, model]) => <option value={key} key={key}>{model.label}</option>)}
              </select>
            </div>
            <div className="mass-properties-card">
              <div><span>Computed mass</span><strong>{mass.toFixed(3)} kg</strong></div>
              <div><span>CG from nose</span><strong>{centerOfMassMm.toFixed(0)} mm</strong></div>
              <div><span>Axial inertia</span><strong>{massProperties.inertiaAtCenterKgM2[0][0].toFixed(5)} kg·m²</strong></div>
              <div><span>Pitch inertia</span><strong>{massProperties.inertiaAtCenterKgM2[1][1].toFixed(5)} kg·m²</strong></div>
            </div>
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
            <NumberField id="thrust" label="Average thrust" value={thrust} unit="N" min={1} max={5000} step={0.5} onChange={setThrust} />
            <NumberField id="burn-time" label="Burn time" value={burnTime} unit="s" min={0.1} max={30} step={0.05} onChange={setBurnTime} />
            <NumberField id="drag" label="Drag coefficient" value={dragCoefficient} unit="Cd" min={0.1} max={2} step={0.01} onChange={setDragCoefficient} />
            <NumberField id="launch-altitude" label="Launch-site altitude" value={launchAltitude} unit="m" min={-400} max={10000} step={10} onChange={setLaunchAltitude} />
            <NumberField id="wind-speed" label="Wind at 500 m" value={windSpeed} unit="m/s" min={0} max={80} step={0.5} onChange={setWindSpeed} />
            <div className="field-group">
              <label htmlFor="recovery-enabled">Recovery model</label>
              <select id="recovery-enabled" value={recoveryEnabled ? "enabled" : "disabled"} onChange={(event) => setRecoveryEnabled(event.target.value === "enabled")}>
                <option value="enabled">450 mm parachute at apogee</option>
                <option value="disabled">Ballistic descent</option>
              </select>
            </div>
            {recoveryEnabled && <NumberField id="recovery-delay" label="Deployment delay" value={recoveryDelay} unit="s" min={0} max={30} step={0.1} onChange={setRecoveryDelay} />}
            {recoveryEnabled && <NumberField id="recovery-diameter" label="Canopy diameter" value={recoveryDiameter} unit="m" min={0.1} max={3} step={0.01} onChange={setRecoveryDiameter} />}
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
                </div>
                <p className="motor-provenance">Synthetic preview curve · CC0-1.0 · unvalidated. Letter class is an impulse-band estimate, not motor certification.</p>
                <div className="property-section-label">
                  <span>Flight environment</span>
                  <small>{previewEnvironment.modelVersion}</small>
                </div>
                <div className="mass-properties-card stability-properties-card">
                  <div><span>Altitude reference</span><strong>{environmentAt500M.altitudeAslM.toFixed(0)} m ASL at 500 m AGL</strong></div>
                  <div><span>Mean wind at 500 m</span><strong>{Math.hypot(environmentAt500M.meanWindWorldMps.x, environmentAt500M.meanWindWorldMps.y).toFixed(1)} m/s</strong></div>
                  <div><span>Turbulence RMS L / T / V</span><strong>{(windSpeed * 0.12).toFixed(2)} / {(windSpeed * 0.1).toFixed(2)} / {(windSpeed * 0.06).toFixed(2)} m/s</strong></div>
                  <div><span>Replay seed</span><strong>arc54-weather-v1</strong></div>
                </div>
                <p className="motor-provenance">Synthetic deterministic Dryden-shaped environment · CC0-1.0 · unvalidated. The current 1D chart reports the mean profile but does not couple horizontal turbulence; the 6DOF and recovery load APIs do.</p>
              </>
            ) : (
              <div className="mode-hint">
                <span className="mode-hint-label">BEGINNER VIEW</span>
                <strong>Essential flight inputs only</strong>
                <p>The estimate uses a synthetic motor curve and deterministic weather model. Expert mode reveals impulse, Isp, turbulence, and replay provenance.</p>
                <button className="quiet-button" onClick={() => changeExperienceMode("expert")}>Show expert details</button>
              </div>
            )}
            <button className="optimizer-button" onClick={optimize} disabled={optimizing}>{optimizing ? "Searching tradeoffs…" : "Optimize design"}</button>
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
                <p id="templates-description">Each template is an original Kestrel Lab configuration. Loading one replaces the current editable inputs and creates a recoverable local checkpoint.</p>
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
                    <span>{template.inputs.lengthMm + 180} mm overall</span>
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
                  <div><strong>Kestrel Lab · Synthetic preview</strong><small>Parametric browser curve · not a commercial motor</small></div>
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
                    <div><strong>{record.manufacturer} · {record.designation}</strong><small>{record.metrics.totalImpulseNs.toFixed(2)} N·s · {record.metrics.burnDurationS.toFixed(2)} s · {record.provenance.sourceName}</small></div>
                  </div>
                  <div className="motor-record-actions">
                    <span>{record.provenance.licenseIdentifier} · {record.provenance.validationStatus}</span>
                    <button onClick={() => downloadTextArtifact(`${record.id}.csv`, "text/csv;charset=utf-8", exportMotorThrustCsv(record))}>CSV</button>
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
              <label className="motor-csv-field">Thrust curve CSV <small>Required header: time_s,thrust_n · SI units · first point at 0 s · final thrust 0 N</small><textarea value={motorImportDraft.csv} onChange={(event) => setMotorImportDraft((draft) => ({ ...draft, csv: event.target.value }))} spellCheck={false} /></label>
              {motorError && <p className="motor-import-error" role="alert">{motorError}</p>}
              <div className="motor-import-actions"><button className="primary-button" onClick={importUserMotor}>Validate and save motor</button><span>Strict parser · max 2 MB · user-supplied-unvalidated</span></div>
            </div>
            <div className="history-notice">
              <span>DATA BOUNDARY</span>
              <p>Kestrel Lab stores the curve and provenance metadata locally. It does not download, bundle, or infer third-party motor databases, and it does not upgrade user-supplied data to certified status.</p>
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
              <p>This history stays on this device and browser profile. It is not cloud sync, collaboration, or a backup, and clearing site data can erase it. Export a Kestrel project document for portable storage.</p>
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
              <button onClick={() => exportArtifact("project")}>
                <span className="export-extension">JSON</span>
                <span><strong>Kestrel project document</strong><small>Versioned geometry, models, simulation, uncertainty, landing results, and provenance.</small></span>
                <em>↓</em>
              </button>
              <button onClick={() => exportArtifact("flight-csv")}>
                <span className="export-extension">CSV</span>
                <span><strong>Flight trace</strong><small>SI-unit time history for plotting, analysis, and reproducible comparisons.</small></span>
                <em>↓</em>
              </button>
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
