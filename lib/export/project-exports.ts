import type { LandingDispersionResult } from "../physics/landing-zone.ts";
import type {
  FlightTracePoint,
  VerticalFlightResult,
} from "../physics/vertical-flight.ts";
import type { StageFlightTracePoint } from "../physics/stage-flight-preview.ts";
import type {
  ParameterSweepResult,
  UncertaintyAnalysisResult,
} from "../physics/uncertainty-analysis.ts";

export const KESTREL_PROJECT_SCHEMA_ID = "org.kestrel-lab.project";
export const KESTREL_PROJECT_SCHEMA_VERSION = 1;
export const KESTREL_EXPORT_MODEL_VERSION = "kestrel-export-0.4.0";
export const KESTREL_EXPORT_VALIDATION_STATUS =
  "engineering-preview-unvalidated";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | Readonly<{ [key: string]: JsonValue }>;

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
    modelVersion: string;
    validationStatus: string;
    provenance: string;
  }>;
  flight: VerticalFlightResult;
  uncertainty?: UncertaintyAnalysisResult | null;
  landing?: LandingDispersionResult | null;
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
  } satisfies JsonValue;
  validateJsonValue(document, "project document", new Set());
  return `${JSON.stringify(document, null, 2)}\n`;
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
    "mass_kg",
    "thrust_n",
    "attached_stage_ids",
  ];
  const rows = trace.map((point, index) => {
    const values = [
      point.timeS,
      point.altitudeAglM,
      point.speedMps,
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
    `- Model: \`${markdownText(input.environment.modelVersion)}\``,
    `- Status: \`${markdownText(input.environment.validationStatus)}\``,
    `- Provenance: ${markdownText(input.environment.provenance)}`,
    "",
    "## Vertical-flight estimate",
    "",
    `Model: \`${markdownText(input.flight.modelVersion)}\`  `,
    `Status: \`${markdownText(input.flight.validationStatus)}\``,
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
    "",
    "## Independence and provenance",
    "",
    "This artifact was produced by original Kestrel Lab interface and calculation code from public aerospace equations and user/synthetic inputs. It does not embed OpenRocket source code, simulation code, UI code, assets, databases, or backend components.",
    "",
  ];
  return lines.join("\n");
}
