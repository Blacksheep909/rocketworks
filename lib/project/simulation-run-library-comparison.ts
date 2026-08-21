import {
  validateLocalSimulationRunLibrary,
  type LocalSimulationRun,
  type LocalSimulationRunLibrary,
  type SimulationRunKind,
} from "./simulation-run-library.ts";

/**
 * A display and export model for comparing saved simulation decision points.
 * This module only reads validated result records; it never re-runs a flight,
 * changes project inputs, or implies that a comparison is validation evidence.
 */
export const SIMULATION_RUN_LIBRARY_COMPARISON_MODEL_VERSION =
  "rocketworks-simulation-run-library-comparison-0.1.0";
export const SIMULATION_RUN_LIBRARY_COMPARISON_STATUS =
  "engineering-preview-unvalidated" as const;

export type SimulationRunLibraryComparisonMetric = Readonly<{
  key: string;
  label: string;
  unit: string;
  values: readonly (number | null)[];
}>;

export type SimulationRunLibraryComparisonRun = Readonly<{
  id: string;
  label: string;
  kind: SimulationRunKind;
  savedAtIso: string;
  fingerprint: string;
}>;

export type SimulationRunLibraryComparisonGroup = Readonly<{
  kind: SimulationRunKind;
  runs: readonly SimulationRunLibraryComparisonRun[];
  metrics: readonly SimulationRunLibraryComparisonMetric[];
}>;

export type SimulationRunLibraryComparison = Readonly<{
  modelVersion: typeof SIMULATION_RUN_LIBRARY_COMPARISON_MODEL_VERSION;
  validationStatus: typeof SIMULATION_RUN_LIBRARY_COMPARISON_STATUS;
  projectId: string;
  projectName: string;
  selectedRunIds: readonly string[];
  groups: readonly SimulationRunLibraryComparisonGroup[];
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

type MetricDefinition = Readonly<{
  key: string;
  label: string;
  unit: string;
  read: (run: LocalSimulationRun) => number | null;
}>;

function finiteOrNull(value: number | null | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}

function maximumFinite(values: readonly number[]): number | null {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length > 0 ? Math.max(...finiteValues) : null;
}

function runMetrics(kind: SimulationRunKind): readonly MetricDefinition[] {
  if (kind === "vertical") {
    return [
      { key: "apogeeM", label: "Apogee", unit: "m", read: (run) => run.kind === "vertical" ? finiteOrNull(run.reference.result.apogeeM) : null },
      { key: "maxSpeedMps", label: "Maximum speed", unit: "m/s", read: (run) => run.kind === "vertical" ? finiteOrNull(run.reference.result.maxSpeedMps) : null },
      { key: "maxMach", label: "Maximum Mach", unit: "Mach", read: (run) => run.kind === "vertical" ? finiteOrNull(run.reference.result.maxMach) : null },
      { key: "maxDynamicPressurePa", label: "Maximum dynamic pressure", unit: "Pa", read: (run) => run.kind === "vertical" ? finiteOrNull(run.reference.result.maxDynamicPressurePa) : null },
      { key: "timeToApogeeS", label: "Time to apogee", unit: "s", read: (run) => run.kind === "vertical" ? finiteOrNull(run.reference.result.timeToApogeeS) : null },
      { key: "totalFlightTimeS", label: "Total flight time", unit: "s", read: (run) => run.kind === "vertical" ? finiteOrNull(run.reference.result.totalFlightTimeS) : null },
      { key: "impactSpeedMps", label: "Impact speed", unit: "m/s", read: (run) => run.kind === "vertical" ? finiteOrNull(run.reference.result.impactSpeedMps) : null },
      { key: "totalImpulseNs", label: "Total impulse", unit: "N·s", read: (run) => run.kind === "vertical" ? finiteOrNull(run.reference.result.totalImpulseNs) : null },
      { key: "eventCount", label: "Events", unit: "count", read: (run) => run.kind === "vertical" ? run.reference.result.events.length : null },
      { key: "warningCount", label: "Warnings", unit: "count", read: (run) => run.kind === "vertical" ? run.reference.result.warnings.length : null },
      { key: "traceSamples", label: "Trace samples", unit: "count", read: (run) => run.kind === "vertical" ? run.reference.result.trace.length : null },
    ];
  }
  return [
    { key: "maxAltitudeAglM", label: "Maximum altitude", unit: "m AGL", read: (run) => run.kind === "staged" ? finiteOrNull(run.reference.result.maxAltitudeAglM) : null },
    { key: "maxSpeedMps", label: "Maximum speed", unit: "m/s", read: (run) => run.kind === "staged" ? finiteOrNull(run.reference.result.maxSpeedMps) : null },
    { key: "maxMach", label: "Maximum Mach", unit: "Mach", read: (run) => run.kind === "staged" ? maximumFinite(run.reference.result.trace.map((point) => point.mach)) : null },
    { key: "maxDynamicPressurePa", label: "Maximum dynamic pressure", unit: "Pa", read: (run) => run.kind === "staged" ? maximumFinite(run.reference.result.trace.map((point) => point.dynamicPressurePa)) : null },
    { key: "timeToApogeeS", label: "Time to apogee", unit: "s", read: (run) => run.kind === "staged" ? finiteOrNull(run.reference.result.timeToApogeeS) : null },
    { key: "maxTiltDeg", label: "Maximum tilt", unit: "deg", read: (run) => run.kind === "staged" ? maximumFinite(run.reference.result.trace.map((point) => (point.attitudeTiltRad * 180) / Math.PI)) : null },
    { key: "maxAngularRateRadS", label: "Maximum angular rate", unit: "rad/s", read: (run) => run.kind === "staged" ? maximumFinite(run.reference.result.trace.map((point) => point.angularRateRadS)) : null },
    { key: "eventCount", label: "Events", unit: "count", read: (run) => run.kind === "staged" ? run.reference.result.events.length : null },
    { key: "separatedBodyCount", label: "Separated bodies", unit: "count", read: (run) => run.kind === "staged" ? run.reference.result.separatedBodies.length : null },
    { key: "warningCount", label: "Warnings", unit: "count", read: (run) => run.kind === "staged" ? run.reference.result.warnings.length : null },
    { key: "traceSamples", label: "Trace samples", unit: "count", read: (run) => run.kind === "staged" ? run.reference.result.trace.length : null },
  ];
}

function normalizeSelection(
  library: LocalSimulationRunLibrary,
  selectedRunIds: readonly string[],
): readonly LocalSimulationRun[] {
  if (!Array.isArray(selectedRunIds) || selectedRunIds.length < 2) {
    throw new Error("Select at least two saved simulation runs to compare");
  }
  const ids = selectedRunIds.map((id) => {
    if (typeof id !== "string" || !id.trim()) throw new Error("Comparison run IDs must be non-empty strings");
    return id.trim();
  });
  if (new Set(ids).size !== ids.length) throw new Error("Comparison run IDs must be unique");
  const byId = new Map(library.runs.map((run) => [run.id, run]));
  return ids.map((id) => {
    const run = byId.get(id);
    if (!run) throw new Error(`Comparison run ${id} is not present in the local library`);
    return run;
  });
}

function groupFor(
  kind: SimulationRunKind,
  selected: readonly LocalSimulationRun[],
): SimulationRunLibraryComparisonGroup | null {
  const runs = selected.filter((run) => run.kind === kind);
  if (runs.length === 0) return null;
  const summaries = runs.map((run) => ({
    id: run.id,
    label: run.label,
    kind: run.kind,
    savedAtIso: run.reference.savedAtIso,
    fingerprint: run.reference.fingerprint,
  }));
  const metrics = runMetrics(kind).map((definition) => ({
    key: definition.key,
    label: definition.label,
    unit: definition.unit,
    values: runs.map((run) => definition.read(run)),
  }));
  return { kind, runs: summaries, metrics };
}

export function createSimulationRunLibraryComparison(
  library: LocalSimulationRunLibrary,
  selectedRunIds: readonly string[],
): SimulationRunLibraryComparison {
  const validated = validateLocalSimulationRunLibrary(library);
  const selected = normalizeSelection(validated, selectedRunIds);
  const groups = ([("vertical"), ("staged")] as const)
    .map((kind) => groupFor(kind, selected))
    .filter((group): group is SimulationRunLibraryComparisonGroup => group !== null);
  return {
    modelVersion: SIMULATION_RUN_LIBRARY_COMPARISON_MODEL_VERSION,
    validationStatus: SIMULATION_RUN_LIBRARY_COMPARISON_STATUS,
    projectId: validated.projectId,
    projectName: validated.projectName,
    selectedRunIds: selected.map((run) => run.id),
    groups,
    warnings: groups.length > 1
      ? ["Vertical and staged runs are shown in separate metric groups; their values are not mixed."]
      : [],
    assumptions: [
      "Values are read from saved result envelopes and are not recomputed during comparison.",
      "The comparison is an engineering-preview handoff, not validation, certification, or flight-safety evidence.",
    ],
  };
}

function csvCell(value: number | string | null): string {
  const raw = value === null ? "" : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

/** Create a deterministic long-form CSV suitable for plotting or review. */
export function createSimulationRunLibraryComparisonCsv(
  comparison: SimulationRunLibraryComparison,
): string {
  const rows: Array<Array<string | number | null>> = [
    ["record_type", "kind", "metric_key", "metric_label", "unit", "run_id", "run_label", "saved_at_iso", "fingerprint", "value"],
    ["meta", "", "model_version", "", "", "", "", "", comparison.modelVersion, ""],
    ["meta", "", "validation_status", "", "", "", "", "", comparison.validationStatus, ""],
    ["meta", "", "project_id", "", "", comparison.projectId, comparison.projectName, "", "", ""],
  ];
  for (const group of comparison.groups) {
    for (const run of group.runs) {
      rows.push(["run", group.kind, "", "", "", run.id, run.label, run.savedAtIso, run.fingerprint, ""]);
    }
    for (const metric of group.metrics) {
      metric.values.forEach((value, index) => {
        const run = group.runs[index]!;
        rows.push(["metric", group.kind, metric.key, metric.label, metric.unit, run.id, run.label, run.savedAtIso, run.fingerprint, value === null ? null : value]);
      });
    }
  }
  for (const warning of comparison.warnings) rows.push(["warning", "", "", warning, "", "", "", "", "", ""]);
  return `${rows.map((row) => row.map((cell) => csvCell(cell)).join(",")).join("\n")}\n`;
}
