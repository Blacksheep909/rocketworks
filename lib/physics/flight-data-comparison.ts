import type { FlightTracePoint } from "./vertical-flight.ts";

export const FLIGHT_DATA_COMPARISON_MODEL_VERSION = "kestrel-flight-data-comparison-0.1.0";
export const FLIGHT_DATA_COMPARISON_STATUS = "engineering-preview-unvalidated";

export type FlightDataMetricKey = "altitudeM" | "velocityMps" | "accelerationMps2";

export type FlightDataSample = Readonly<{
  timeS: number;
  altitudeM?: number;
  velocityMps?: number;
  accelerationMps2?: number;
}>;

export type FlightDataSeries = Readonly<{
  sourceName: string;
  samples: readonly FlightDataSample[];
}>;

export type FlightDataMetricComparison = Readonly<{
  metric: FlightDataMetricKey;
  sampleCount: number;
  measuredMean: number;
  simulatedMean: number;
  meanResidual: number;
  rootMeanSquareError: number;
  maximumAbsoluteResidual: number;
  p95AbsoluteResidual: number;
}>;

export type FlightDataMetricResidual = Readonly<{
  measured: number;
  simulated: number;
  residual: number;
}>;

export type FlightDataComparisonRow = Readonly<{
  timeS: number;
  simulationTimeS: number;
  altitudeM?: FlightDataMetricResidual;
  velocityMps?: FlightDataMetricResidual;
  accelerationMps2?: FlightDataMetricResidual;
}>;

export type FlightDataComparisonResult = Readonly<{
  modelVersion: string;
  validationStatus: string;
  sourceName: string;
  measuredSampleCount: number;
  matchedSampleCount: number;
  unmatchedSampleCount: number;
  timeOffsetS: number;
  simulationTimeRangeS: readonly [number, number];
  measuredTimeRangeS: readonly [number, number];
  rows: readonly FlightDataComparisonRow[];
  metrics: Partial<Record<FlightDataMetricKey, FlightDataMetricComparison>>;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

type TracePoint = Pick<FlightTracePoint, "timeS" | "altitudeAglM" | "velocityMps" | "accelerationMps2">;

const METRIC_DEFINITIONS: readonly Readonly<{
  key: FlightDataMetricKey;
  label: string;
  sample: (value: FlightDataSample) => number | undefined;
  trace: (value: TracePoint) => number;
}>[] = [
  { key: "altitudeM", label: "altitude", sample: (value) => value.altitudeM, trace: (value) => value.altitudeAglM },
  { key: "velocityMps", label: "velocity", sample: (value) => value.velocityMps, trace: (value) => value.velocityMps },
  { key: "accelerationMps2", label: "acceleration", sample: (value) => value.accelerationMps2, trace: (value) => value.accelerationMps2 },
];

const CSV_COLUMN_ALIASES: Readonly<Record<string, FlightDataMetricKey | "timeS">> = {
  time: "timeS",
  time_s: "timeS",
  timestamp_s: "timeS",
  t: "timeS",
  altitude: "altitudeM",
  altitude_m: "altitudeM",
  height: "altitudeM",
  height_m: "altitudeM",
  velocity: "velocityMps",
  velocity_mps: "velocityMps",
  speed: "velocityMps",
  speed_mps: "velocityMps",
  acceleration: "accelerationMps2",
  acceleration_mps2: "accelerationMps2",
  accel: "accelerationMps2",
  accel_mps2: "accelerationMps2",
};

const MAX_FLIGHT_DATA_CSV_BYTES = 5_000_000;
const MAX_FLIGHT_DATA_SAMPLES = 100_000;

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/^\uFEFF/, "").replace(/\s+/g, "_");
}

function validateSamples(samples: readonly FlightDataSample[], label: string) {
  if (samples.length < 2) throw new Error(`${label} requires at least two samples.`);
  let previousTime = -Infinity;
  samples.forEach((sample, index) => {
    assertFinite(sample.timeS, `${label} sample ${index + 1} time`);
    if (sample.timeS <= previousTime) {
      throw new Error(`${label} sample times must increase strictly.`);
    }
    previousTime = sample.timeS;
    const values = [sample.altitudeM, sample.velocityMps, sample.accelerationMps2];
    if (!values.some((value) => value !== undefined)) {
      throw new Error(`${label} sample ${index + 1} must contain at least one supported metric.`);
    }
    values.forEach((value, metricIndex) => {
      if (value !== undefined) assertFinite(value, `${label} sample ${index + 1} metric ${metricIndex + 1}`);
    });
  });
}

export function parseFlightDataCsv(csv: string, sourceName = "Flight data CSV"): FlightDataSeries {
  if (typeof csv !== "string") throw new Error("Flight data CSV must be text.");
  if (new TextEncoder().encode(csv).byteLength > MAX_FLIGHT_DATA_CSV_BYTES) {
    throw new Error("Flight data CSV exceeds the 5 MB import limit.");
  }
  const rows = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter((row) => row.line && !row.line.startsWith("#"));
  if (rows.length < 3) throw new Error("Flight data CSV requires a header and at least two data rows.");
  const headers = rows[0]!.line.split(",").map(normalizeHeader);
  const mappedHeaders = headers.map((header) => CSV_COLUMN_ALIASES[header] ?? null);
  if (!mappedHeaders.includes("timeS")) {
    throw new Error("Flight data CSV needs a time_s, time, or t column.");
  }
  const seen = new Set<string>();
  mappedHeaders.forEach((header) => {
    if (header === null) return;
    if (seen.has(header)) throw new Error(`Flight data CSV contains duplicate ${header} columns.`);
    seen.add(header);
  });
  const samples: FlightDataSample[] = [];
  rows.slice(1).forEach((row) => {
    if (samples.length >= MAX_FLIGHT_DATA_SAMPLES) throw new Error("Flight data CSV contains too many samples.");
    if (row.line.includes('"')) throw new Error(`Flight data CSV line ${row.lineNumber} must not contain quoted fields.`);
    const fields = row.line.split(",").map((field) => field.trim());
    if (fields.length !== headers.length) {
      throw new Error(`Flight data CSV line ${row.lineNumber} must contain ${headers.length} columns.`);
    }
    const values: Partial<Record<FlightDataMetricKey | "timeS", number>> = {};
    fields.forEach((field, index) => {
      const key = mappedHeaders[index];
      if (key === null || field === "") return;
      const value = Number(field);
      if (!Number.isFinite(value)) throw new Error(`Flight data CSV line ${row.lineNumber} contains a non-finite number.`);
      values[key] = value;
    });
    if (values.timeS === undefined) throw new Error(`Flight data CSV line ${row.lineNumber} is missing time.`);
    const sample: FlightDataSample = {
      timeS: values.timeS,
      ...(values.altitudeM === undefined ? {} : { altitudeM: values.altitudeM }),
      ...(values.velocityMps === undefined ? {} : { velocityMps: values.velocityMps }),
      ...(values.accelerationMps2 === undefined ? {} : { accelerationMps2: values.accelerationMps2 }),
    };
    if (![sample.altitudeM, sample.velocityMps, sample.accelerationMps2].some((value) => value !== undefined)) {
      throw new Error(`Flight data CSV line ${row.lineNumber} needs altitude, velocity, or acceleration.`);
    }
    samples.push(sample);
  });
  validateSamples(samples, "Flight data");
  return { sourceName: sourceName.trim() || "Flight data CSV", samples };
}

function interpolateTrace(trace: readonly TracePoint[], timeS: number): TracePoint | null {
  const first = trace[0];
  const last = trace.at(-1);
  if (!first || !last || timeS < first.timeS || timeS > last.timeS) return null;
  if (timeS === first.timeS) return first;
  if (timeS === last.timeS) return last;
  let lower = 0;
  let upper = trace.length - 1;
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (trace[middle]!.timeS <= timeS) lower = middle;
    else upper = middle;
  }
  const left = trace[lower]!;
  const right = trace[upper]!;
  const fraction = (timeS - left.timeS) / (right.timeS - left.timeS);
  const lerp = (a: number, b: number) => a + fraction * (b - a);
  return {
    timeS,
    altitudeAglM: lerp(left.altitudeAglM, right.altitudeAglM),
    velocityMps: lerp(left.velocityMps, right.velocityMps),
    accelerationMps2: lerp(left.accelerationMps2, right.accelerationMps2),
  };
}

function quantile(sorted: readonly number[], probability: number) {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower]! + fraction * ((sorted[lower + 1] ?? sorted[lower]!) - sorted[lower]!);
}

export function compareFlightDataToTrace(
  trace: readonly TracePoint[],
  series: FlightDataSeries,
  options: Readonly<{ timeOffsetS?: number }> = {},
): FlightDataComparisonResult {
  if (trace.length < 2) throw new Error("Simulation trace requires at least two samples.");
  validateSamples(series.samples, "Flight data");
  const timeOffsetS = options.timeOffsetS ?? 0;
  assertFinite(timeOffsetS, "Flight data time offset");
  for (let index = 1; index < trace.length; index += 1) {
    if (!(trace[index]!.timeS > trace[index - 1]!.timeS)) throw new Error("Simulation trace times must increase strictly.");
  }
  const firstTraceTime = trace[0]!.timeS;
  const lastTraceTime = trace.at(-1)!.timeS;
  const measuredTimes = series.samples.map((sample) => sample.timeS);
  const matchedRows = series.samples.map((sample) => ({ sample, trace: interpolateTrace(trace, sample.timeS + timeOffsetS) }));
  const matchedSampleCount = matchedRows.filter((row) => row.trace !== null).length;
  const warnings: string[] = [];
  if (matchedSampleCount < series.samples.length) {
    warnings.push(`${series.samples.length - matchedSampleCount} measured sample${series.samples.length - matchedSampleCount === 1 ? "" : "s"} fall outside the simulated time range.`);
  }
  if (matchedSampleCount === 0) warnings.push("No measured samples overlap the simulated trace; residual metrics are unavailable.");
  const rows: FlightDataComparisonRow[] = [];
  matchedRows.forEach((row) => {
    const traceSample = row.trace;
    if (traceSample === null) return;
    const metricValues: Partial<Record<FlightDataMetricKey, FlightDataMetricResidual>> = {};
    METRIC_DEFINITIONS.forEach((definition) => {
      const measured = definition.sample(row.sample);
      if (measured === undefined) return;
      const simulated = definition.trace(traceSample);
      metricValues[definition.key] = { measured, simulated, residual: simulated - measured };
    });
    if (Object.keys(metricValues).length > 0) {
      rows.push({ timeS: row.sample.timeS, simulationTimeS: row.sample.timeS + timeOffsetS, ...metricValues });
    }
  });
  const metrics: Partial<Record<FlightDataMetricKey, FlightDataMetricComparison>> = {};
  METRIC_DEFINITIONS.forEach((definition) => {
    const pairs = matchedRows.flatMap((row) => {
      const measured = definition.sample(row.sample);
      const simulated = row.trace === null ? undefined : definition.trace(row.trace);
      return measured === undefined || simulated === undefined ? [] : [{ measured, simulated }];
    });
    if (pairs.length === 0) return;
    const residuals = pairs.map((pair) => pair.simulated - pair.measured);
    const absoluteResiduals = residuals.map(Math.abs).sort((a, b) => a - b);
    metrics[definition.key] = {
      metric: definition.key,
      sampleCount: pairs.length,
      measuredMean: pairs.reduce((sum, pair) => sum + pair.measured, 0) / pairs.length,
      simulatedMean: pairs.reduce((sum, pair) => sum + pair.simulated, 0) / pairs.length,
      meanResidual: residuals.reduce((sum, value) => sum + value, 0) / residuals.length,
      rootMeanSquareError: Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / residuals.length),
      maximumAbsoluteResidual: absoluteResiduals.at(-1)!,
      p95AbsoluteResidual: quantile(absoluteResiduals, 0.95)!,
    };
  });
  if (Object.keys(metrics).length === 0) warnings.push("No supported measured metric overlaps the simulated trace.");
  return {
    modelVersion: FLIGHT_DATA_COMPARISON_MODEL_VERSION,
    validationStatus: FLIGHT_DATA_COMPARISON_STATUS,
    sourceName: series.sourceName,
    measuredSampleCount: series.samples.length,
    matchedSampleCount,
    unmatchedSampleCount: series.samples.length - matchedSampleCount,
    timeOffsetS,
    simulationTimeRangeS: [firstTraceTime, lastTraceTime],
    measuredTimeRangeS: [measuredTimes[0]!, measuredTimes.at(-1)!],
    rows,
    metrics,
    warnings,
    assumptions: [
      "Measured samples are compared against linearly interpolated simulation trace values.",
      "Residuals are simulated minus measured; a positive value means the model is higher.",
      "Timestamps are assumed to share a common time reference; no automatic event alignment or sensor calibration is applied.",
      "This comparison is an engineering diagnostic, not validation, certification, or a flight-safety assessment.",
    ],
  };
}

function csvField(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createFlightDataComparisonCsv(result: FlightDataComparisonResult): string {
  const lines = [
    `# model_version,${csvField(result.modelVersion)}`,
    `# validation_status,${csvField(result.validationStatus)}`,
    `# source_name,${csvField(result.sourceName)}`,
    `# time_offset_s,${csvField(result.timeOffsetS)}`,
    `# measured_samples,${csvField(result.measuredSampleCount)}`,
    `# matched_samples,${csvField(result.matchedSampleCount)}`,
    "time_s,simulation_time_s,altitude_measured_m,altitude_simulated_m,altitude_residual_m,velocity_measured_mps,velocity_simulated_mps,velocity_residual_mps,acceleration_measured_mps2,acceleration_simulated_mps2,acceleration_residual_mps2",
  ];
  result.rows.forEach((row) => {
    const values = [
      row.timeS,
      row.simulationTimeS,
      row.altitudeM?.measured,
      row.altitudeM?.simulated,
      row.altitudeM?.residual,
      row.velocityMps?.measured,
      row.velocityMps?.simulated,
      row.velocityMps?.residual,
      row.accelerationMps2?.measured,
      row.accelerationMps2?.simulated,
      row.accelerationMps2?.residual,
    ];
    values.forEach((value, index) => {
      if (value !== undefined) assertFinite(value, `flight data CSV row ${index + 1}`);
    });
    lines.push(values.map((value) => csvField(value)).join(","));
  });
  return `${lines.join("\r\n")}\r\n`;
}
