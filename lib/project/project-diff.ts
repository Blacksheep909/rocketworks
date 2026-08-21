import {
  parseLocalProjectSnapshot,
  PROJECT_INPUT_LABELS,
  type EditableProjectInputs,
  type LocalProjectSnapshot,
} from "./project-state.ts";
import type { LocalVehicleTopology } from "./vehicle-topology.ts";

/**
 * A deterministic, human-readable diff between two validated project
 * checkpoints. This is review metadata only: it never changes project inputs
 * and never claims that either checkpoint is flight-safe or validated.
 */
export const PROJECT_DIFF_MODEL_VERSION = "rocketworks-project-diff-0.1.0";

export type ProjectDiffCategory = "identity" | "input" | "topology" | "source";

export type ProjectDiffRow = Readonly<{
  category: ProjectDiffCategory;
  key: string;
  label: string;
  before: string;
  after: string;
}>;

export type ProjectSnapshotDiff = Readonly<{
  modelVersion: typeof PROJECT_DIFF_MODEL_VERSION;
  projectId: string;
  beforeRevision: number;
  afterRevision: number;
  beforeSavedAtIso: string;
  afterSavedAtIso: string;
  changedCount: number;
  summary: string;
  rows: readonly ProjectDiffRow[];
}>;

const INPUT_KEYS = Object.keys(PROJECT_INPUT_LABELS) as Array<keyof EditableProjectInputs>;

function stableValue(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "Unavailable";
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6)));
}

function formatInputValue(key: keyof EditableProjectInputs, value: unknown): string {
  if (value === undefined || value === null) return "Not set";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (key === "windProfileLayers") return `${value.length} wind layer${value.length === 1 ? "" : "s"}`;
    if (key === "uncertaintyCorrelations") return `${value.length} correlation pair${value.length === 1 ? "" : "s"}`;
    return `${value.length} entries`;
  }
  if (typeof value === "object") {
    const named = value as { name?: unknown };
    return typeof named.name === "string" && named.name.trim()
      ? named.name
      : "Configured profile";
  }
  return String(value);
}

function topologySummary(topology: LocalVehicleTopology | undefined): string {
  if (!topology) return "Not recorded";
  const logicalStages = topology.stages.length;
  const physicalStages = topology.stages.reduce((sum, stage) => sum + stage.repeatCount, 0);
  const components = topology.components.length;
  return `${logicalStages} logical stage${logicalStages === 1 ? "" : "s"} · ${physicalStages} physical instance${physicalStages === 1 ? "" : "s"} · ${components} authored component${components === 1 ? "" : "s"}`;
}

function parseSnapshot(snapshot: LocalProjectSnapshot): LocalProjectSnapshot {
  return parseLocalProjectSnapshot(JSON.stringify(snapshot));
}

export function compareProjectSnapshots(
  before: LocalProjectSnapshot,
  after: LocalProjectSnapshot,
): ProjectSnapshotDiff {
  const previous = parseSnapshot(before);
  const current = parseSnapshot(after);
  if (previous.projectId !== current.projectId) {
    throw new Error("Project checkpoints must belong to the same project.");
  }

  const rows: ProjectDiffRow[] = [];
  if (previous.projectName !== current.projectName) {
    rows.push({
      category: "identity",
      key: "projectName",
      label: "Project name",
      before: previous.projectName,
      after: current.projectName,
    });
  }
  for (const key of INPUT_KEYS) {
    const previousValue = previous.inputs[key];
    const currentValue = current.inputs[key];
    if (stableValue(previousValue) === stableValue(currentValue)) continue;
    rows.push({
      category: "input",
      key,
      label: PROJECT_INPUT_LABELS[key],
      before: formatInputValue(key, previousValue),
      after: formatInputValue(key, currentValue),
    });
  }

  if (stableValue(previous.topology ?? null) !== stableValue(current.topology ?? null)) {
    rows.push({
      category: "topology",
      key: "topology",
      label: "Vehicle topology",
      before: topologySummary(previous.topology),
      after: topologySummary(current.topology),
    });
  }

  const previousMotor = previous.selectedMotorId ?? "synthetic";
  const currentMotor = current.selectedMotorId ?? "synthetic";
  if (previousMotor !== currentMotor) {
    rows.push({
      category: "source",
      key: "selectedMotorId",
      label: "Motor source",
      before: previousMotor,
      after: currentMotor,
    });
  }

  const previousAero = previous.selectedAerodynamicTableId ?? "constant";
  const currentAero = current.selectedAerodynamicTableId ?? "constant";
  if (previousAero !== currentAero) {
    rows.push({
      category: "source",
      key: "selectedAerodynamicTableId",
      label: "Aerodynamic source",
      before: previousAero,
      after: currentAero,
    });
  }

  const changedCount = rows.length;
  const summary = changedCount === 0
    ? "No configuration changes"
    : `${changedCount} configuration change${changedCount === 1 ? "" : "s"}`;
  return {
    modelVersion: PROJECT_DIFF_MODEL_VERSION,
    projectId: previous.projectId,
    beforeRevision: previous.revision,
    afterRevision: current.revision,
    beforeSavedAtIso: previous.savedAtIso,
    afterSavedAtIso: current.savedAtIso,
    changedCount,
    summary,
    rows,
  };
}
