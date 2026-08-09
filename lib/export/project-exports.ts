import type { LandingDispersionResult } from "../physics/landing-zone.ts";
import type {
  FlightTracePoint,
  VerticalFlightResult,
} from "../physics/vertical-flight.ts";
import type {
  StageFlightPreviewResult,
  StageFlightTracePoint,
} from "../physics/stage-flight-preview.ts";
import type {
  ParameterSweepResult,
  UncertaintyAnalysisResult,
} from "../physics/uncertainty-analysis.ts";
import type { StructuralScreenResult } from "../physics/structural-screen.ts";
import {
  createAerodynamicCoefficientTable,
  type AerodynamicCoefficientTableDefinition,
} from "../physics/aerodynamic-coefficients.ts";
import {
  createMotorDataRecord,
  type MotorDataInput,
  type MotorDataRecord,
} from "../physics/motor-data.ts";
import {
  validateEditableProjectInputs,
  type EditableProjectInputs,
} from "../project/project-state.ts";
import {
  validateVehicleTopology,
  type LocalVehicleTopology,
} from "../project/vehicle-topology.ts";

export const KESTREL_PROJECT_SCHEMA_ID = "org.kestrel-lab.project";
export const KESTREL_PROJECT_SCHEMA_VERSION = 1;
export const KESTREL_EXPORT_MODEL_VERSION = "kestrel-export-0.8.0";
export const KESTREL_EXPORT_VALIDATION_STATUS =
  "engineering-preview-unvalidated";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | Readonly<{ [key: string]: JsonValue }>;

export type KestrelProjectImport = Readonly<{
  projectId: string;
  projectName: string;
  generatedAtIso: string;
  exportModelVersion: string;
  editableInputs: EditableProjectInputs;
  topology: LocalVehicleTopology;
  selectedMotorId: string;
  selectedAerodynamicTableId: string;
  motorLibrary: readonly MotorDataRecord[];
  aerodynamicLibrary: readonly AerodynamicCoefficientTableDefinition[];
  warnings: readonly string[];
}>;

export type RocketCadGeometry = Readonly<{
  projectName: string;
  noseLengthM: number;
  noseProfile?: "ogive" | "conical" | "elliptical";
  bodyLengthM: number;
  diameterM: number;
  finCount: number;
  finRootChordM: number;
  finTipChordM: number;
  finSweepM: number;
  finSpanM: number;
  finThicknessM: number;
  centerOfMassXM?: number;
  centerOfPressureXM?: number;
}>;

export type EngineeringReportInput = Readonly<{
  projectName: string;
  generatedAtIso: string;
  vehicle: Readonly<{
    lengthM: number;
    diameterM: number;
    massKg: number;
    centerOfMassXM: number;
    centerOfPressureXM: number;
    staticMarginCalibers: number;
    axialInertiaKgM2: number;
    pitchInertiaKgM2: number;
    massModelVersion: string;
    aerodynamicModelVersion: string;
  }>;
  motor: Readonly<{
    designation: string;
    totalImpulseNs: number;
    peakThrustN: number;
    averageThrustN: number;
    specificImpulseS: number;
    provenance: string;
  }>;
  environment: Readonly<{
    siteName: string;
    elevationM: number;
    meanWindAt500Mps: number;
    surfacePressureHpa?: number;
    surfaceTemperatureC?: number;
    relativeHumidityPercent?: number;
    modelVersion: string;
    validationStatus: string;
    provenance: string;
  }>;
  flight: VerticalFlightResult;
  stageFlight?: StageFlightPreviewResult | null;
  uncertainty?: UncertaintyAnalysisResult | null;
  landing?: LandingDispersionResult | null;
  structural?: StructuralScreenResult | null;
}>;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertIsoDate(value: string, label: string): void {
  if (!value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO date-time`);
  }
}

function validateJsonValue(value: JsonValue, path: string, ancestors: Set<object>): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`);
    return;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value !== "object") throw new Error(`${path} is not JSON-compatible`);
  if (ancestors.has(value)) throw new Error(`${path} contains a circular reference`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJsonValue(entry, `${path}[${index}]`, ancestors));
  } else {
    for (const [key, entry] of Object.entries(value)) {
      if (!key.trim()) throw new Error(`${path} contains an empty object key`);
      validateJsonValue(entry, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

export function createKestrelProjectJson(input: Readonly<{
  projectId: string;
  projectName: string;
  generatedAtIso: string;
  applicationVersion: string;
  vehicle: JsonValue;
  simulations: JsonValue;
  analyses: JsonValue;
  provenance: JsonValue;
  configuration?: JsonValue;
}>): string {
  if (!/^[A-Za-z0-9._-]+$/.test(input.projectId)) {
    throw new Error("project identifier must contain only letters, numbers, dots, underscores, and hyphens");
  }
  if (!input.projectName.trim()) throw new Error("project name cannot be empty");
  if (!input.applicationVersion.trim()) {
    throw new Error("application version cannot be empty");
  }
  assertIsoDate(input.generatedAtIso, "project export timestamp");
  const document = {
    schema: KESTREL_PROJECT_SCHEMA_ID,
    schemaVersion: KESTREL_PROJECT_SCHEMA_VERSION,
    exportModelVersion: KESTREL_EXPORT_MODEL_VERSION,
    validationStatus: KESTREL_EXPORT_VALIDATION_STATUS,
    generatedAtIso: input.generatedAtIso,
    applicationVersion: input.applicationVersion,
    project: { id: input.projectId, name: input.projectName },
    cleanRoomNotice:
      "Original Kestrel Lab data and calculation output. No OpenRocket source, engine, UI, assets, database, or backend content is embedded.",
    vehicle: input.vehicle,
    simulations: input.simulations,
    analyses: input.analyses,
    provenance: input.provenance,
    ...(input.configuration === undefined
      ? {}
      : { configuration: input.configuration }),
  } satisfies JsonValue;
  validateJsonValue(document, "project document", new Set());
  return `${JSON.stringify(document, null, 2)}\n`;
}

function importObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function importString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function importMotorLibrary(value: unknown): MotorDataRecord[] {
  if (!Array.isArray(value) || value.length > 24) {
    throw new Error("project motor library must contain 0 through 24 records");
  }
  return value.map((record, index) => {
    try {
      return createMotorDataRecord(record as MotorDataInput);
    } catch (error) {
      throw new Error(
        `project motor ${index + 1} is invalid: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  });
}

function importAerodynamicLibrary(
  value: unknown,
): AerodynamicCoefficientTableDefinition[] {
  if (!Array.isArray(value) || value.length > 8) {
    throw new Error("project aerodynamic library must contain 0 through 8 tables");
  }
  return value.map((definition, index) => {
    try {
      const table = definition as AerodynamicCoefficientTableDefinition;
      createAerodynamicCoefficientTable(table);
      return table;
    } catch (error) {
      throw new Error(
        `project aerodynamic table ${index + 1} is invalid: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  });
}

/**
 * Reads the portable configuration envelope emitted by the Kestrel project
 * export. Simulation results remain inspectable data; only validated editable
 * configuration and user-supplied libraries are returned for restoration.
 */
export function parseKestrelProjectJson(serialized: string): KestrelProjectImport {
  try {
    const document = importObject(JSON.parse(serialized), "project document");
    if (document.schema !== KESTREL_PROJECT_SCHEMA_ID) {
      throw new Error("unsupported Kestrel project schema");
    }
    if (document.schemaVersion !== KESTREL_PROJECT_SCHEMA_VERSION) {
      throw new Error("unsupported Kestrel project schema version");
    }
    const project = importObject(document.project, "project metadata");
    const projectId = importString(project.id, "project id");
    if (!/^[A-Za-z0-9._-]+$/.test(projectId)) {
      throw new Error("project id contains unsupported characters");
    }
    const projectName = importString(project.name, "project name");
    const generatedAtIso = importString(document.generatedAtIso, "generated timestamp");
    assertIsoDate(generatedAtIso, "generated timestamp");
    const exportModelVersion = importString(
      document.exportModelVersion,
      "export model version",
    );
    const configuration = importObject(
      document.configuration,
      "portable project configuration",
    );
    const editableInputs = validateEditableProjectInputs(configuration.editableInputs);
    const topology = validateVehicleTopology(configuration.topology);
    const motorLibrary = importMotorLibrary(configuration.motorLibrary ?? []);
    const aerodynamicLibrary = importAerodynamicLibrary(
      configuration.aerodynamicLibrary ?? [],
    );
    const selectedMotorId = importString(
      configuration.selectedMotorId ?? "synthetic",
      "selected motor id",
    );
    const selectedAerodynamicTableId = importString(
      configuration.selectedAerodynamicTableId ?? "constant",
      "selected aerodynamic table id",
    );
    const warnings: string[] = [];
    if (
      selectedMotorId !== "synthetic" &&
      !motorLibrary.some((record) => record.id === selectedMotorId)
    ) {
      warnings.push(
        `Selected motor ${selectedMotorId} was not included in the imported library; synthetic preview motor selected instead.`,
      );
    }
    if (
      selectedAerodynamicTableId !== "constant" &&
      !aerodynamicLibrary.some((table) => table.id === selectedAerodynamicTableId)
    ) {
      warnings.push(
        `Selected aerodynamic table ${selectedAerodynamicTableId} was not included in the imported library; constant drag selected instead.`,
      );
    }
    return {
      projectId,
      projectName,
      generatedAtIso,
      exportModelVersion,
      editableInputs,
      topology,
      selectedMotorId:
        selectedMotorId === "synthetic" || motorLibrary.some((record) => record.id === selectedMotorId)
          ? selectedMotorId
          : "synthetic",
      selectedAerodynamicTableId:
        selectedAerodynamicTableId === "constant" || aerodynamicLibrary.some((table) => table.id === selectedAerodynamicTableId)
          ? selectedAerodynamicTableId
          : "constant",
      motorLibrary,
      aerodynamicLibrary,
      warnings,
    };
  } catch (error) {
    throw new Error(
      `Could not read Kestrel project document: ${error instanceof Error ? error.message : "invalid JSON"}`,
    );
  }
}

function csvCell(value: string | number | boolean): string {
  const text = typeof value === "number" ? value.toString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createFlightTraceCsv(trace: readonly FlightTracePoint[]): string {
  if (trace.length === 0) throw new Error("flight trace cannot be empty");
  const headers = [
    "time_s",
    "altitude_agl_m",
    "velocity_mps",
    "acceleration_mps2",
    "mass_kg",
    "thrust_n",
    "density_kg_m3",
    "mach",
    "dynamic_pressure_pa",
    "horizontal_wind_mps",
    "recovery_deployed",
  ];
  const rows = trace.map((point, index) => {
    const values = [
      point.timeS,
      point.altitudeAglM,
      point.velocityMps,
      point.accelerationMps2,
      point.massKg,
      point.thrustN,
      point.densityKgM3,
      point.mach,
      point.dynamicPressurePa,
      point.horizontalWindMps,
    ];
    values.forEach((value, valueIndex) =>
      assertFinite(value, `flight trace row ${index + 1} column ${headers[valueIndex]}`),
    );
    return [...values, point.recoveryDeployed].map(csvCell).join(",");
  });
  return `${headers.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

export function createStageFlightTraceCsv(
  trace: readonly StageFlightTracePoint[],
): string {
  if (trace.length === 0) throw new Error("stage-flight trace cannot be empty");
  const headers = [
    "time_s",
    "altitude_agl_m",
    "speed_mps",
    "mach",
    "angle_of_attack_deg",
    "sideslip_deg",
    "dynamic_pressure_pa",
    "drag_n",
    "mass_kg",
    "thrust_n",
    "attached_stage_ids",
  ];
  const rows = trace.map((point, index) => {
    const values = [
      point.timeS,
      point.altitudeAglM,
      point.speedMps,
      point.mach,
      (point.angleOfAttackRad * 180) / Math.PI,
      (point.sideslipRad * 180) / Math.PI,
      point.dynamicPressurePa,
      point.dragN,
      point.massKg,
      point.thrustN,
    ];
    values.forEach((value, valueIndex) =>
      assertFinite(value, `stage-flight trace row ${index + 1} column ${headers[valueIndex]}`),
    );
    return [...values, point.attachedStageIds.join("|")].map(csvCell).join(",");
  });
  return `${headers.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

export function createParameterSweepCsv(
  sweep: Readonly<ParameterSweepResult>,
): string {
  if (sweep.values.length === 0 || sweep.samples.length === 0) {
    throw new Error("parameter sweep cannot be empty");
  }
  if (sweep.values.length !== sweep.samples.length) {
    throw new Error("parameter sweep values and samples must have equal length");
  }
  const outputKeys = Array.from(
    new Set(
      sweep.samples.flatMap((sample) =>
        sample.outputs ? Object.keys(sample.outputs) : [],
      ),
    ),
  );
  const headers = [
    "parameter_key",
    "parameter_value",
    ...outputKeys,
    "error",
  ];
  const rows = sweep.samples.map((sample, index) => {
    if (!Number.isFinite(sample.value)) {
      throw new Error(`parameter sweep row ${index + 1} value must be finite`);
    }
    const outputs = outputKeys.map((key) => sample.outputs?.[key] ?? null);
    outputs.forEach((value, valueIndex) => {
      if (value !== null && !Number.isFinite(value)) {
        throw new Error(
          `parameter sweep row ${index + 1} column ${outputKeys[valueIndex]} must be finite or null`,
        );
      }
    });
    return [
      sweep.parameterKey,
      sample.value,
      ...outputs.map((value) => value ?? ""),
      sample.error ?? "",
    ]
      .map((value) => csvCell(value))
      .join(",");
  });
  return `${headers.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

function validateCadGeometry(geometry: RocketCadGeometry): void {
  if (!geometry.projectName.trim()) throw new Error("CAD project name cannot be empty");
  for (const [label, value] of [
    ["nose length", geometry.noseLengthM],
    ["body length", geometry.bodyLengthM],
    ["diameter", geometry.diameterM],
    ["fin root chord", geometry.finRootChordM],
    ["fin tip chord", geometry.finTipChordM],
    ["fin span", geometry.finSpanM],
    ["fin thickness", geometry.finThicknessM],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`CAD ${label} must be a positive finite number`);
    }
  }
  if (!Number.isFinite(geometry.finSweepM) || geometry.finSweepM < 0) {
    throw new Error("CAD fin sweep must be a non-negative finite number");
  }
  if (!Number.isInteger(geometry.finCount) || geometry.finCount < 2 || geometry.finCount > 12) {
    throw new Error("CAD fin count must be an integer from 2 through 12");
  }
  if (geometry.finRootChordM > geometry.bodyLengthM) {
    throw new Error("CAD fin root chord cannot exceed body length");
  }
  if (geometry.finSweepM + geometry.finTipChordM > geometry.finRootChordM) {
    throw new Error("CAD fin tip must remain within the root-chord axial envelope");
  }
  if (geometry.noseProfile !== undefined && !["ogive", "conical", "elliptical"].includes(geometry.noseProfile)) {
    throw new Error("CAD nose profile must be ogive, conical, or elliptical");
  }
  for (const [label, value] of [
    ["center of mass", geometry.centerOfMassXM],
    ["center of pressure", geometry.centerOfPressureXM],
  ] as const) {
    if (value !== undefined && !Number.isFinite(value)) {
      throw new Error(`CAD ${label} must be finite when supplied`);
    }
  }
}

function tangentOgiveRadiusMm(
  axialMm: number,
  lengthMm: number,
  radiusMm: number,
): number {
  const generatingRadiusMm =
    (radiusMm ** 2 + lengthMm ** 2) / (2 * radiusMm);
  return (
    Math.sqrt(
      Math.max(0, generatingRadiusMm ** 2 - (lengthMm - axialMm) ** 2),
    ) +
    radiusMm -
    generatingRadiusMm
  );
}

function profileRadiusMm(
  axialMm: number,
  lengthMm: number,
  radiusMm: number,
  profile: RocketCadGeometry["noseProfile"] = "ogive",
): number {
  if (profile === "conical") return (radiusMm * axialMm) / lengthMm;
  if (profile === "elliptical") {
    const fraction = axialMm / lengthMm;
    return radiusMm * Math.sqrt(Math.max(0, 1 - (1 - fraction) ** 2));
  }
  return tangentOgiveRadiusMm(axialMm, lengthMm, radiusMm);
}

function dxfPair(code: number, value: string | number): string[] {
  return [String(code), String(value)];
}

function dxfPolyline(
  layer: string,
  points: readonly Readonly<{ x: number; y: number }>[],
  closed: boolean,
): string[] {
  const output = [
    ...dxfPair(0, "POLYLINE"),
    ...dxfPair(8, layer),
    ...dxfPair(66, 1),
    ...dxfPair(70, closed ? 1 : 0),
    ...dxfPair(10, 0),
    ...dxfPair(20, 0),
    ...dxfPair(30, 0),
  ];
  points.forEach((point) =>
    output.push(
      ...dxfPair(0, "VERTEX"),
      ...dxfPair(8, layer),
      ...dxfPair(10, point.x.toFixed(6)),
      ...dxfPair(20, point.y.toFixed(6)),
      ...dxfPair(30, 0),
    ),
  );
  output.push(...dxfPair(0, "SEQEND"), ...dxfPair(8, layer));
  return output;
}

function dxfLine(
  layer: string,
  start: Readonly<{ x: number; y: number }>,
  end: Readonly<{ x: number; y: number }>,
): string[] {
  return [
    ...dxfPair(0, "LINE"),
    ...dxfPair(8, layer),
    ...dxfPair(10, start.x.toFixed(6)),
    ...dxfPair(20, start.y.toFixed(6)),
    ...dxfPair(30, 0),
    ...dxfPair(11, end.x.toFixed(6)),
    ...dxfPair(21, end.y.toFixed(6)),
    ...dxfPair(31, 0),
  ];
}

export function createRocketProfileDxf(geometry: RocketCadGeometry): string {
  validateCadGeometry(geometry);
  const noseLengthMm = geometry.noseLengthM * 1000;
  const bodyLengthMm = geometry.bodyLengthM * 1000;
  const radiusMm = (geometry.diameterM * 1000) / 2;
  const totalLengthMm = noseLengthMm + bodyLengthMm;
  const finRootChordMm = geometry.finRootChordM * 1000;
  const finTipChordMm = geometry.finTipChordM * 1000;
  const finSweepMm = geometry.finSweepM * 1000;
  const finSpanMm = geometry.finSpanM * 1000;
  const noseTop = Array.from({ length: 25 }, (_, index) => {
    const axialMm = (noseLengthMm * index) / 24;
    return {
      x: axialMm,
      y: profileRadiusMm(axialMm, noseLengthMm, radiusMm, geometry.noseProfile),
    };
  });
  const outline = [
    ...noseTop,
    { x: totalLengthMm, y: radiusMm },
    { x: totalLengthMm, y: -radiusMm },
    ...[...noseTop].reverse().map((point) => ({ x: point.x, y: -point.y })),
  ];
  const rootStartMm = totalLengthMm - finRootChordMm;
  const topFin = [
    { x: rootStartMm, y: radiusMm },
    { x: rootStartMm + finSweepMm, y: radiusMm + finSpanMm },
    {
      x: rootStartMm + finSweepMm + finTipChordMm,
      y: radiusMm + finSpanMm,
    },
    { x: totalLengthMm, y: radiusMm },
  ];
  const bottomFin = topFin.map((point) => ({ x: point.x, y: -point.y }));
  const extentsMm = radiusMm + finSpanMm + 20;
  const entities = [
    ...dxfPolyline("AIRFRAME", outline, true),
    ...dxfPolyline("FINS", topFin, true),
    ...dxfPolyline("FINS", bottomFin, true),
    ...dxfLine("CENTERLINE", { x: -10, y: 0 }, { x: totalLengthMm + 20, y: 0 }),
    ...(geometry.centerOfMassXM === undefined
      ? []
      : dxfLine(
          "CG",
          { x: geometry.centerOfMassXM * 1000, y: -extentsMm },
          { x: geometry.centerOfMassXM * 1000, y: extentsMm },
        )),
    ...(geometry.centerOfPressureXM === undefined
      ? []
      : dxfLine(
          "CP",
          { x: geometry.centerOfPressureXM * 1000, y: -extentsMm },
          { x: geometry.centerOfPressureXM * 1000, y: extentsMm },
        )),
  ];
  const safeName = geometry.projectName.replace(/[\r\n]/g, " ").trim();
  const lines = [
    ...dxfPair(999, `Kestrel Lab ${KESTREL_EXPORT_MODEL_VERSION} - ${safeName}`),
    ...dxfPair(999, "Units: millimetres. Engineering preview; verify before manufacturing."),
    ...dxfPair(0, "SECTION"),
    ...dxfPair(2, "HEADER"),
    ...dxfPair(9, "$ACADVER"),
    ...dxfPair(1, "AC1009"),
    ...dxfPair(9, "$MEASUREMENT"),
    ...dxfPair(70, 1),
    ...dxfPair(0, "ENDSEC"),
    ...dxfPair(0, "SECTION"),
    ...dxfPair(2, "ENTITIES"),
    ...entities,
    ...dxfPair(0, "ENDSEC"),
    ...dxfPair(0, "EOF"),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

function scadNumber(valueMm: number): string {
  return Number(valueMm.toFixed(6)).toString();
}

export function createRocketOpenScad(geometry: RocketCadGeometry): string {
  validateCadGeometry(geometry);
  const noseLengthMm = geometry.noseLengthM * 1000;
  const bodyLengthMm = geometry.bodyLengthM * 1000;
  const radiusMm = (geometry.diameterM * 1000) / 2;
  const totalLengthMm = noseLengthMm + bodyLengthMm;
  const rootStartMm = totalLengthMm - geometry.finRootChordM * 1000;
  const noseSurface = Array.from({ length: 33 }, (_, index) => {
    const axialMm = (noseLengthMm * index) / 32;
    return [
      profileRadiusMm(axialMm, noseLengthMm, radiusMm, geometry.noseProfile),
      axialMm,
    ] as const;
  });
  const nosePolygon = [
    [0, 0] as const,
    ...noseSurface.slice(1),
    [0, noseLengthMm] as const,
  ]
    .map(([radius, axial]) => `[${scadNumber(radius)},${scadNumber(axial)}]`)
    .join(",");
  const finPoints = [
    [rootStartMm, radiusMm],
    [totalLengthMm, radiusMm],
    [
      rootStartMm + (geometry.finSweepM + geometry.finTipChordM) * 1000,
      radiusMm + geometry.finSpanM * 1000,
    ],
    [
      rootStartMm + geometry.finSweepM * 1000,
      radiusMm + geometry.finSpanM * 1000,
    ],
  ]
    .map(([x, radius]) => `[${scadNumber(x)},${scadNumber(radius)}]`)
    .join(",");
  const safeName = geometry.projectName.replace(/[\r\n]/g, " ").trim();
  return `// ${safeName}\n// Generated by Kestrel Lab ${KESTREL_EXPORT_MODEL_VERSION}\n// Units: millimetres\n// Engineering-preview reference geometry only. Verify tolerances, wall thickness, fits, and structure before manufacturing.\n\n$fn = 96;\n\nmodule nose() {\n  rotate([0,90,0])\n    rotate_extrude(convexity=10)\n      polygon(points=[${nosePolygon}]);\n}\n\nmodule airframe() {\n  translate([${scadNumber(noseLengthMm)},0,0])\n    rotate([0,90,0])\n      cylinder(h=${scadNumber(bodyLengthMm)},r=${scadNumber(radiusMm)});\n}\n\nmodule fin() {\n  linear_extrude(height=${scadNumber(geometry.finThicknessM * 1000)},center=true,convexity=10)\n    polygon(points=[${finPoints}]);\n}\n\nmodule fin_set() {\n  for (angle=[0:${scadNumber(360 / geometry.finCount)}:${scadNumber(360 - 360 / geometry.finCount)}])\n    rotate([angle,0,0]) fin();\n}\n\nmodule nozzle() {\n  translate([${scadNumber(totalLengthMm)},0,0])\n    rotate([0,90,0])\n      cylinder(h=${scadNumber(Math.min(45, bodyLengthMm * 0.08))},r1=${scadNumber(radiusMm * 0.36)},r2=${scadNumber(radiusMm * 0.29)});\n}\n\nunion() {\n  nose();\n  airframe();\n  fin_set();\n  nozzle();\n}\n`;
}

function markdownText(value: string): string {
  return value.replaceAll("|", "\\|").replace(/[\r\n]+/g, " ").trim();
}

function formatNumber(value: number, decimals: number): string {
  assertFinite(value, "engineering report value");
  return value.toFixed(decimals);
}

export function createEngineeringReportMarkdown(
  input: EngineeringReportInput,
): string {
  if (!input.projectName.trim()) throw new Error("report project name cannot be empty");
  assertIsoDate(input.generatedAtIso, "report timestamp");
  const landing = input.landing?.footprint;
  const lines = [
    `# ${markdownText(input.projectName)} — Preliminary Engineering Report`,
    "",
    `Generated: ${input.generatedAtIso}`,
    "",
    `Export model: \`${KESTREL_EXPORT_MODEL_VERSION}\`  `,
    `Validation status: \`${KESTREL_EXPORT_VALIDATION_STATUS}\``,
    "",
    "> **Not flight-safe or manufacturing-approved.** This report contains engineering-preview calculations with analytical component checks only. Independently validate all geometry, loads, materials, recovery behavior, weather, and operational constraints.",
    "",
    "## Vehicle summary",
    "",
    "| Property | Value |",
    "|---|---:|",
    `| Length | ${formatNumber(input.vehicle.lengthM * 1000, 0)} mm |`,
    `| Diameter | ${formatNumber(input.vehicle.diameterM * 1000, 1)} mm |`,
    `| Computed mass | ${formatNumber(input.vehicle.massKg, 3)} kg |`,
    `| Centre of gravity from tip | ${formatNumber(input.vehicle.centerOfMassXM * 1000, 0)} mm |`,
    `| Centre of pressure from tip | ${formatNumber(input.vehicle.centerOfPressureXM * 1000, 0)} mm |`,
    `| Static margin | ${formatNumber(input.vehicle.staticMarginCalibers, 2)} calibres |`,
    `| Axial inertia | ${formatNumber(input.vehicle.axialInertiaKgM2, 6)} kg·m² |`,
    `| Pitch inertia | ${formatNumber(input.vehicle.pitchInertiaKgM2, 6)} kg·m² |`,
    `| Mass model | \`${markdownText(input.vehicle.massModelVersion)}\` |`,
    `| Aerodynamic model | \`${markdownText(input.vehicle.aerodynamicModelVersion)}\` |`,
    "",
    "## Motor data",
    "",
    `- Designation: ${markdownText(input.motor.designation)}`,
    `- Total impulse: ${formatNumber(input.motor.totalImpulseNs, 2)} N·s`,
    `- Peak thrust: ${formatNumber(input.motor.peakThrustN, 2)} N`,
    `- Average thrust: ${formatNumber(input.motor.averageThrustN, 2)} N`,
    `- Calculated specific impulse: ${formatNumber(input.motor.specificImpulseS, 2)} s`,
    `- Provenance: ${markdownText(input.motor.provenance)}`,
    "",
    "## Launch environment",
    "",
    `- Site: ${markdownText(input.environment.siteName)}`,
    `- Site elevation: ${formatNumber(input.environment.elevationM, 0)} m`,
    `- Mean wind at 500 m AGL: ${formatNumber(input.environment.meanWindAt500Mps, 2)} m/s`,
    ...(input.environment.surfacePressureHpa === undefined
      ? []
      : [`- Pad pressure observation: ${formatNumber(input.environment.surfacePressureHpa, 1)} hPa`]),
    ...(input.environment.surfaceTemperatureC === undefined
      ? []
      : [`- Pad temperature observation: ${formatNumber(input.environment.surfaceTemperatureC, 1)} °C`]),
    ...(input.environment.relativeHumidityPercent === undefined
      ? []
      : [`- Relative humidity observation: ${formatNumber(input.environment.relativeHumidityPercent, 0)}%`]),
    `- Model: \`${markdownText(input.environment.modelVersion)}\``,
    `- Status: \`${markdownText(input.environment.validationStatus)}\``,
    `- Provenance: ${markdownText(input.environment.provenance)}`,
    "",
    "## Vertical-flight estimate",
    "",
    `Model: \`${markdownText(input.flight.modelVersion)}\`  `,
    `Status: \`${markdownText(input.flight.validationStatus)}\``,
    ...(input.flight.aerodynamicCoefficientBasis
      ? [
          `Aerodynamic coefficient basis: \`${markdownText(input.flight.aerodynamicCoefficientBasis)}\``,
          ...(input.flight.aerodynamicModelVersion
            ? [`Aerodynamic coefficient model: \`${markdownText(input.flight.aerodynamicModelVersion)}\``]
            : []),
        ]
      : []),
    "",
    "| Metric | Estimate |",
    "|---|---:|",
    `| Apogee AGL | ${formatNumber(input.flight.apogeeM, 1)} m |`,
    `| Maximum speed | ${formatNumber(input.flight.maxSpeedMps, 2)} m/s |`,
    `| Maximum Mach | ${formatNumber(input.flight.maxMach, 3)} |`,
    `| Maximum dynamic pressure | ${formatNumber(input.flight.maxDynamicPressurePa, 0)} Pa |`,
    `| Time to apogee | ${formatNumber(input.flight.timeToApogeeS, 2)} s |`,
    `| Total flight time | ${formatNumber(input.flight.totalFlightTimeS, 2)} s |`,
    `| Impact speed | ${input.flight.impactSpeedMps === null ? "Not reached" : `${formatNumber(input.flight.impactSpeedMps, 2)} m/s`} |`,
    `| Ignition thrust-to-weight | ${formatNumber(input.flight.thrustToWeightAtIgnition, 2)} : 1 |`,
    `| Total impulse | ${formatNumber(input.flight.totalImpulseNs, 2)} N·s |`,
    "",
    "### Flight events",
    "",
    "| Event | Time | Altitude AGL | Velocity |",
    "|---|---:|---:|---:|",
    ...input.flight.events.map(
      (event) =>
        `| ${markdownText(event.label)} | ${formatNumber(event.timeS, 2)} s | ${formatNumber(event.altitudeAglM, 1)} m | ${formatNumber(event.velocityMps, 2)} m/s |`,
    ),
    "",
    ...(input.stageFlight
      ? [
          "## Coupled 6DOF preview",
          "",
          `Model: \`${markdownText(input.stageFlight.modelVersion)}\`  `,
          `Status: \`${markdownText(input.stageFlight.validationStatus)}\``,
          "",
          "| Diagnostic | Value |",
          "|---|---:|",
          `| Peak altitude | ${formatNumber(input.stageFlight.maxAltitudeAglM, 1)} m |`,
          `| Peak speed | ${formatNumber(input.stageFlight.maxSpeedMps, 2)} m/s |`,
          `| Apogee estimate | ${formatNumber(input.stageFlight.timeToApogeeS, 2)} s |`,
          `| Step convergence | ${markdownText(input.stageFlight.convergence.status)} |`,
          `| Coarse step | ${formatNumber(input.stageFlight.convergence.baseTimeStepS, 4)} s |`,
          `| Half-step | ${formatNumber(input.stageFlight.convergence.refinedTimeStepS, 4)} s |`,
          `| Maximum relative shift | ${input.stageFlight.convergence.maximumRelativeDifference === null ? "not available" : `${formatNumber(input.stageFlight.convergence.maximumRelativeDifference * 100, 2)}%`} |`,
          `| Apogee timing difference | ${input.stageFlight.convergence.apogeeTimeDifferenceS === null ? "not available" : `${formatNumber(input.stageFlight.convergence.apogeeTimeDifferenceS, 4)} s`} |`,
          `| Event timing difference | ${input.stageFlight.convergence.maximumEventTimeDifferenceS === null ? "not available" : `${formatNumber(input.stageFlight.convergence.maximumEventTimeDifferenceS, 4)} s`} |`,
          "",
          "### Staged event telemetry",
          "",
          "| Event | Time | Detached stages | Retained dV body (+X) | Retained dV world magnitude |",
          "|---|---:|---|---:|---:|",
          ...(input.stageFlight.events ?? []).map(
            (event) =>
              `| ${markdownText(event.label)} | ${formatNumber(event.timeS, 2)} s | ${(event.detachedStageIds ?? []).length > 0 ? markdownText((event.detachedStageIds ?? []).join(", ")) : "—"} | ${event.separationDeltaVBodyMps ? `${formatNumber(event.separationDeltaVBodyMps.x, 3)} m/s` : "—"} | ${event.separationDeltaVWorldMps ? `${formatNumber(Math.hypot(event.separationDeltaVWorldMps.x, event.separationDeltaVWorldMps.y, event.separationDeltaVWorldMps.z), 3)} m/s` : "—"} |`,
          ),
          "",
          ...input.stageFlight.convergence.assumptions.map((assumption) => `- ${markdownText(assumption)}`),
          ...input.stageFlight.convergence.warnings.map((warning) => `- **Convergence warning:** ${markdownText(warning)}`),
          ...((input.stageFlight.clusterDiagnostics ?? []).length > 0
            ? [
                "",
                "### Motor-state diagnostics",
                "",
                "| Stage | Available motors | Failed motors | Retained failed propellant | Status |",
                "|---|---:|---:|---:|---|",
                ...(input.stageFlight.clusterDiagnostics ?? []).map(
                  (diagnostic) =>
                    `| ${markdownText(diagnostic.stageName)} | ${diagnostic.activeMotorCount} / ${diagnostic.motorCount} | ${diagnostic.failedMotorCount} | ${formatNumber(diagnostic.failedPropellantMassKg, 3)} kg | ${markdownText(diagnostic.status)} |`,
                ),
                "",
                "> Motor-state diagnostics are deterministic configuration checks; they do not estimate ignition probability, hardware health, or flight safety.",
              ]
            : []),
          ...((input.stageFlight.separatedBodies ?? []).length > 0
            ? [
                "",
                "### Separated-body trajectories",
                "",
                "| Stage | Release | Retained dV (+X) | Impact | Peak altitude | Peak speed |",
                "|---|---:|---:|---:|---:|---:|",
                ...(input.stageFlight.separatedBodies ?? []).map(
                  (body) =>
                    `| ${markdownText(body.stageName)} | ${formatNumber(body.releaseTimeS, 2)} s | ${body.retainedBodyDeltaVBodyMps ? `${formatNumber(body.retainedBodyDeltaVBodyMps.x, 3)} m/s` : "not recorded"} | ${body.impactTimeS === null ? "Not reached" : `${formatNumber(body.impactTimeS, 2)} s`} | ${formatNumber(body.maxAltitudeAglM, 1)} m | ${formatNumber(body.maxSpeedMps, 2)} m/s |`,
                ),
                "",
                "> Separated-body paths are gravity-only analytical component checks. The retained-body delta-v is reported for traceability; the detached branch starts from the pre-event state. Drag, plume interaction, aerodynamic clearance, equal-and-opposite separation impulse, collision, and recovery are not modeled.",
              ]
            : []),
          "",
        ]
      : []),
    ...(input.uncertainty
      ? [
          "## Uncertainty analysis",
          "",
          `- Method: ${markdownText(input.uncertainty.method)}`,
          `- Successful samples: ${input.uncertainty.successfulSampleCount} / ${input.uncertainty.requestedSampleCount}`,
          `- Convergence status: ${markdownText(input.uncertainty.convergence.status)}`,
          `- Maximum split-sample quantile shift: ${input.uncertainty.convergence.maximumRelativeQuantileShift === null ? "not available" : `${formatNumber(input.uncertainty.convergence.maximumRelativeQuantileShift * 100, 1)}%`}`,
          ...(input.uncertainty.convergence.thresholds.length > 0
            ? input.uncertainty.convergence.thresholds.map(
                (threshold) =>
                  `- Threshold ${markdownText(threshold.thresholdId)} convergence: ${markdownText(threshold.status)}; half-rate shift ${threshold.halfProbabilityShift === null ? "not available" : `${formatNumber(threshold.halfProbabilityShift * 100, 1)}%`}; Wilson width ${threshold.wilson95Width === null ? "not available" : `${formatNumber(threshold.wilson95Width * 100, 1)}%`}`,
              )
            : []),
          ...input.uncertainty.convergence.warnings.map((warning) => `- ${markdownText(warning)}`),
          "",
        ]
      : []),
    ...(landing
      ? [
          "## Recovery landing footprint",
          "",
          `Model: \`${markdownText(input.landing!.modelVersion)}\`  `,
          `Status: \`${markdownText(input.landing!.validationStatus)}\`  `,
          `Seed: \`${markdownText(input.landing!.seed)}\``,
          "",
          `- Scenario count: ${landing.sampleCount}`,
          `- Mean impact: ${formatNumber(landing.meanImpact.eastM, 1)} m east, ${formatNumber(landing.meanImpact.northM, 1)} m north`,
          `- Mean WGS84 position: ${formatNumber(landing.meanImpact.positionWgs84.latitudeDeg, 6)}°, ${formatNumber(landing.meanImpact.positionWgs84.longitudeDeg, 6)}°`,
          `- Radial distance P50 / P95: ${formatNumber(landing.radialDistanceM.p50, 1)} / ${formatNumber(landing.radialDistanceM.p95, 1)} m`,
          `- Impact speed P50 / P95: ${formatNumber(landing.impactSpeedMps.p50, 2)} / ${formatNumber(landing.impactSpeedMps.p95, 2)} m/s`,
          `- 95% covariance ellipse semi-axes: ${formatNumber(landing.confidenceEllipses[2].semiMajorM, 1)} × ${formatNumber(landing.confidenceEllipses[2].semiMinorM, 1)} m`,
          `- Landing uncertainty convergence: ${markdownText(input.landing!.uncertainty.convergence.status)}; maximum split-sample quantile shift ${input.landing!.uncertainty.convergence.maximumRelativeQuantileShift === null ? "not available" : `${formatNumber(input.landing!.uncertainty.convergence.maximumRelativeQuantileShift * 100, 1)}%`}`,
          ...(input.landing!.deploymentScenario
            ? [
                `- ${markdownText(input.landing!.deploymentScenario.label)}: ${input.landing!.deploymentScenario.failedSampleCount} / ${input.landing!.deploymentScenario.successfulSampleCount + input.landing!.deploymentScenario.failedSampleCount} sampled failures`,
                `- Observed deployment success: ${input.landing!.deploymentScenario.observedSuccessRate === null ? "not available" : `${formatNumber(input.landing!.deploymentScenario.observedSuccessRate * 100, 1)}%`} (assumed ${(input.landing!.deploymentScenario.assumedSuccessProbability * 100).toFixed(1)}%)`,
              ]
            : []),
          ...(input.landing!.ascentDrift
            ? [
                `- Ascent-to-recovery handoff: ${markdownText(input.landing!.ascentDrift.label)} (${markdownText(input.landing!.ascentDrift.modelVersion)})`,
                `- Ascent-drift scope: ${markdownText(input.landing!.ascentDrift.description)}`,
              ]
            : []),
          "",
          "> The footprint includes the declared ascent handoff and recovery-phase drift only. It is not a launch corridor or range-safety boundary.",
          "",
        ]
      : []),
    "## Model assumptions",
    "",
    ...input.flight.assumptions.map((assumption) => `- ${markdownText(assumption)}`),
    "",
    "## Warnings and limitations",
    "",
    ...input.flight.warnings.map(
      (warning) =>
        `- **${markdownText(warning.title)}** [${warning.severity} / ${warning.code}]: ${markdownText(warning.explanation)}`,
    ),
    ...(input.landing
      ? input.landing.warnings.map((warning) => `- ${markdownText(warning)}`)
      : []),
    ...(input.structural
      ? [
          "## Preliminary structural screen",
          "",
          `Model: \`${markdownText(input.structural.modelVersion)}\`  `,
          `Status: \`${markdownText(input.structural.validationStatus)}\`  `,
          `Overall screen: **${markdownText(input.structural.overallStatus).toUpperCase()}**`,
          "",
          "| Check | Demand | Capacity | Factor of safety | Status |",
          "|---|---:|---:|---:|---|",
          ...Object.values(input.structural.checks).map(
            (check) =>
              `| ${markdownText(check.label)} | ${check.demand === null ? "Not available" : `${formatNumber(check.demand, 2)} ${markdownText(check.unit)}`} | ${check.capacity === null ? "Not available" : `${formatNumber(check.capacity, 2)} ${markdownText(check.unit)}`} | ${check.factorOfSafety === null ? "Not available" : `${formatNumber(check.factorOfSafety, 2)}×`} | ${markdownText(check.status)} |`,
          ),
          "",
          `- Axial demand: ${formatNumber(input.structural.loads.axialCompressionN, 2)} N (${formatNumber(input.structural.loads.peakThrustN, 2)} N peak thrust + ${formatNumber(input.structural.loads.weightN, 2)} N weight).`,
          `- Modeled body: ${formatNumber(input.structural.geometry.bodyLengthM * 1000, 0)} mm long, ${formatNumber(input.structural.geometry.minimumOuterDiameterM * 1000, 1)} mm minimum diameter, ${formatNumber(input.structural.geometry.wallThicknessM * 1000, 2)} mm wall; slenderness ${formatNumber(input.structural.geometry.slendernessRatio, 1)}.`,
          ...input.structural.assumptions.map((assumption) => `- ${markdownText(assumption)}`),
          ...input.structural.warnings.map((warning) => `- **Structural screen warning:** ${markdownText(warning)}`),
          "",
          "> This screen uses representative material properties and simplified component loads. It is not a structural certification, manufacturing release, or flight-safety decision.",
          "",
        ]
      : []),
    "",
    "## Independence and provenance",
    "",
    "This artifact was produced by original Kestrel Lab interface and calculation code from public aerospace equations and user/synthetic inputs. It does not embed OpenRocket source code, simulation code, UI code, assets, databases, or backend components.",
    "",
  ];
  return lines.join("\n");
}
