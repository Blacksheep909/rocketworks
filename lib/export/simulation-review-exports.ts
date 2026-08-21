import {
  parseStagedSimulationReference,
  parseVerticalSimulationReference,
  serializeStagedSimulationReference,
  serializeVerticalSimulationReference,
  type LocalStagedSimulationReference,
  type LocalVerticalSimulationReference,
} from "../project/simulation-reference.ts";

/**
 * Portable run-review artifacts carry one already validated browser-local
 * reference plus a small envelope. They are handoff metadata, not project
 * documents, simulation engines, or flight-safety evidence.
 */
export const SIMULATION_REVIEW_EXPORT_SCHEMA = "rocketworks.simulation-review";
export const SIMULATION_REVIEW_EXPORT_SCHEMA_VERSION = 1;
export const SIMULATION_REVIEW_EXPORT_MODEL_VERSION = "rocketworks-simulation-review-export-0.1.0";
export const SIMULATION_REVIEW_EXPORT_REVIEW_BOUNDARY =
  "Simulation result handoff only; not validation, certification, or flight-safety evidence.";
export const MAX_SIMULATION_REVIEW_EXPORT_LENGTH = 4_100_000;

export type VerticalSimulationReviewReference = Omit<LocalVerticalSimulationReference, "kind"> & { kind: "vertical" };
export type StagedSimulationReviewReference = Omit<LocalStagedSimulationReference, "kind"> & { kind: "staged" };
export type SimulationReviewReference =
  | VerticalSimulationReviewReference
  | StagedSimulationReviewReference;
type AnySimulationReviewReference =
  | LocalVerticalSimulationReference
  | LocalStagedSimulationReference;

export type SimulationReviewExport = Readonly<{
  schema: typeof SIMULATION_REVIEW_EXPORT_SCHEMA;
  schemaVersion: typeof SIMULATION_REVIEW_EXPORT_SCHEMA_VERSION;
  exportModelVersion: typeof SIMULATION_REVIEW_EXPORT_MODEL_VERSION;
  reviewBoundary: typeof SIMULATION_REVIEW_EXPORT_REVIEW_BOUNDARY;
  reference: SimulationReviewReference;
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function isVerticalReference(
  reference: AnySimulationReviewReference,
): reference is LocalVerticalSimulationReference {
  return reference.kind === "vertical";
}

function normalizeReference(reference: AnySimulationReviewReference): SimulationReviewReference {
  if (isVerticalReference(reference)) {
    const parsed = parseVerticalSimulationReference(serializeVerticalSimulationReference(reference));
    return { ...parsed, kind: "vertical" };
  }
  const parsed = parseStagedSimulationReference(serializeStagedSimulationReference(reference));
  return { ...parsed, kind: "staged" };
}

function createEnvelope(reference: AnySimulationReviewReference): SimulationReviewExport {
  return {
    schema: SIMULATION_REVIEW_EXPORT_SCHEMA,
    schemaVersion: SIMULATION_REVIEW_EXPORT_SCHEMA_VERSION,
    exportModelVersion: SIMULATION_REVIEW_EXPORT_MODEL_VERSION,
    reviewBoundary: SIMULATION_REVIEW_EXPORT_REVIEW_BOUNDARY,
    reference: normalizeReference(reference),
  };
}

function serializeEnvelope(envelope: SimulationReviewExport): string {
  const serialized = `${JSON.stringify(envelope)}\n`;
  if (serialized.length > MAX_SIMULATION_REVIEW_EXPORT_LENGTH) {
    throw new Error("simulation review artifact exceeds the portable size limit");
  }
  return serialized;
}

function parseEnvelope(serialized: string): SimulationReviewExport {
  if (typeof serialized !== "string") throw new Error("simulation review artifact must be text");
  if (serialized.length > MAX_SIMULATION_REVIEW_EXPORT_LENGTH) {
    throw new Error("simulation review artifact exceeds the portable size limit");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("simulation review artifact is not valid JSON");
  }
  const envelope = objectValue(parsed, "simulation review artifact");
  if (envelope.schema !== SIMULATION_REVIEW_EXPORT_SCHEMA) {
    throw new Error("Unsupported simulation review artifact schema");
  }
  if (envelope.schemaVersion !== SIMULATION_REVIEW_EXPORT_SCHEMA_VERSION) {
    throw new Error("Unsupported simulation review artifact schema version");
  }
  if (envelope.exportModelVersion !== SIMULATION_REVIEW_EXPORT_MODEL_VERSION) {
    throw new Error(`Unsupported simulation review export model: ${String(envelope.exportModelVersion)}`);
  }
  if (envelope.reviewBoundary !== SIMULATION_REVIEW_EXPORT_REVIEW_BOUNDARY) {
    throw new Error("Simulation review artifact boundary is not recognized");
  }
  const reference = objectValue(envelope.reference, "simulation review artifact reference");
  const normalized = reference.kind === "vertical"
    ? { ...parseVerticalSimulationReference(JSON.stringify(reference)), kind: "vertical" as const }
    : reference.kind === "staged"
      ? { ...parseStagedSimulationReference(JSON.stringify(reference)), kind: "staged" as const }
      : (() => { throw new Error("Simulation review artifact reference kind must be vertical or staged"); })();
  return {
    schema: SIMULATION_REVIEW_EXPORT_SCHEMA,
    schemaVersion: SIMULATION_REVIEW_EXPORT_SCHEMA_VERSION,
    exportModelVersion: SIMULATION_REVIEW_EXPORT_MODEL_VERSION,
    reviewBoundary: SIMULATION_REVIEW_EXPORT_REVIEW_BOUNDARY,
    reference: normalized,
  };
}

export function createVerticalSimulationReviewExport(
  reference: LocalVerticalSimulationReference,
): string {
  return serializeEnvelope(createEnvelope(reference));
}

export function createStagedSimulationReviewExport(
  reference: LocalStagedSimulationReference,
): string {
  return serializeEnvelope(createEnvelope(reference));
}

export function parseSimulationReviewExport(serialized: string): SimulationReviewExport {
  return parseEnvelope(serialized);
}

export function parseVerticalSimulationReviewExport(
  serialized: string,
): Readonly<SimulationReviewExport & { reference: VerticalSimulationReviewReference }> {
  const parsed = parseEnvelope(serialized);
  if (parsed.reference.kind !== "vertical") {
    throw new Error("Simulation review artifact reference must be vertical");
  }
  return parsed as Readonly<SimulationReviewExport & { reference: VerticalSimulationReviewReference }>;
}

export function parseStagedSimulationReviewExport(
  serialized: string,
): Readonly<SimulationReviewExport & { reference: StagedSimulationReviewReference }> {
  const parsed = parseEnvelope(serialized);
  if (parsed.reference.kind !== "staged") {
    throw new Error("Simulation review artifact reference must be staged");
  }
  return parsed as Readonly<SimulationReviewExport & { reference: StagedSimulationReviewReference }>;
}
