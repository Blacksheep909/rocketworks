import {
  PROJECT_DIFF_FINGERPRINT_MODEL_VERSION,
  PROJECT_DIFF_MODEL_VERSION,
  type ProjectDiffCategory,
  type ProjectSnapshotDiff,
} from "../project/project-diff.ts";

/**
 * Stable, portable envelope versions for checkpoint-diff handoff artifacts.
 * These files contain configuration review metadata only; they never contain
 * simulation traces or a claim that a design is flight-ready.
 */
export const PROJECT_DIFF_EXPORT_MODEL_VERSION = "rocketworks-project-diff-export-0.2.0";
export const PROJECT_DIFF_EXPORT_VALIDATION_STATUS = "engineering-preview-unvalidated";
export const MAX_PROJECT_DIFF_CSV_LENGTH = 2_000_000;
const PROJECT_DIFF_CSV_REVIEW_BOUNDARY = "Configuration review metadata only; not simulation evidence or a flight-safety assessment.";

const MAX_DIFF_ROWS = 128;
const MAX_TEXT_LENGTH = 2_048;
const DIFF_CATEGORIES: readonly ProjectDiffCategory[] = [
  "identity",
  "input",
  "topology",
  "source",
];

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? value.toString() : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function markdownCell(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function assertText(value: unknown, label: string, options: Readonly<{ allowEmpty?: boolean }> = {}): string {
  if (typeof value !== "string" || (!options.allowEmpty && !value.trim())) {
    throw new Error(`${label} must be ${options.allowEmpty ? "a string" : "a non-empty string"}`);
  }
  if (value.length > MAX_TEXT_LENGTH) {
    throw new Error(`${label} cannot exceed ${MAX_TEXT_LENGTH} characters`);
  }
  return value;
}

function assertUtcTimestamp(value: unknown, label: string): string {
  const timestamp = assertText(value, label);
  if (Number.isNaN(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
    throw new Error(`${label} must be an ISO 8601 UTC timestamp`);
  }
  return timestamp;
}

function assertFingerprint(value: unknown, label: string): string {
  const fingerprint = assertText(value, label);
  const prefix = `${PROJECT_DIFF_FINGERPRINT_MODEL_VERSION}:`;
  if (!fingerprint.startsWith(prefix) || fingerprint.length !== prefix.length + 8) {
    throw new Error(`${label} must use the ${PROJECT_DIFF_FINGERPRINT_MODEL_VERSION} model`);
  }
  return fingerprint;
}

function validateDiff(input: ProjectSnapshotDiff): ProjectSnapshotDiff {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("project checkpoint diff must be an object");
  }
  if (input.modelVersion !== PROJECT_DIFF_MODEL_VERSION) {
    throw new Error(`unsupported project checkpoint diff model: ${String(input.modelVersion)}`);
  }
  const projectId = assertText(input.projectId, "project checkpoint diff projectId");
  if (!Number.isInteger(input.beforeRevision) || input.beforeRevision < 1) {
    throw new Error("project checkpoint diff beforeRevision must be a positive integer");
  }
  if (!Number.isInteger(input.afterRevision) || input.afterRevision <= input.beforeRevision) {
    throw new Error("project checkpoint diff afterRevision must be greater than beforeRevision");
  }
  const beforeSavedAtIso = assertUtcTimestamp(input.beforeSavedAtIso, "project checkpoint diff beforeSavedAtIso");
  const afterSavedAtIso = assertUtcTimestamp(input.afterSavedAtIso, "project checkpoint diff afterSavedAtIso");
  if (Date.parse(afterSavedAtIso) < Date.parse(beforeSavedAtIso)) {
    throw new Error("project checkpoint diff afterSavedAtIso cannot precede beforeSavedAtIso");
  }
  const beforeConfigurationFingerprint = assertFingerprint(
    input.beforeConfigurationFingerprint,
    "project checkpoint diff beforeConfigurationFingerprint",
  );
  const afterConfigurationFingerprint = assertFingerprint(
    input.afterConfigurationFingerprint,
    "project checkpoint diff afterConfigurationFingerprint",
  );
  const summary = assertText(input.summary, "project checkpoint diff summary");
  if (!Number.isInteger(input.changedCount) || input.changedCount < 0 || input.changedCount > MAX_DIFF_ROWS) {
    throw new Error(`project checkpoint diff changedCount must be an integer from 0 through ${MAX_DIFF_ROWS}`);
  }
  if (!Array.isArray(input.rows) || input.rows.length > MAX_DIFF_ROWS) {
    throw new Error(`project checkpoint diff rows must contain 0 through ${MAX_DIFF_ROWS} entries`);
  }
  if (input.changedCount !== input.rows.length) {
    throw new Error("project checkpoint diff changedCount must match rows");
  }
  const keys = new Set<string>();
  const rows = input.rows.map((row, index) => {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new Error(`project checkpoint diff row ${index + 1} must be an object`);
    }
    if (!DIFF_CATEGORIES.includes(row.category)) {
      throw new Error(`project checkpoint diff row ${index + 1} has an unknown category`);
    }
    const key = assertText(row.key, `project checkpoint diff row ${index + 1} key`);
    if (keys.has(`${row.category}:${key}`)) {
      throw new Error(`project checkpoint diff contains duplicate row ${row.category}:${key}`);
    }
    keys.add(`${row.category}:${key}`);
    return {
      category: row.category,
      key,
      label: assertText(row.label, `project checkpoint diff row ${index + 1} label`),
      before: assertText(row.before, `project checkpoint diff row ${index + 1} before`, { allowEmpty: true }),
      after: assertText(row.after, `project checkpoint diff row ${index + 1} after`, { allowEmpty: true }),
    };
  });
  return {
    modelVersion: PROJECT_DIFF_MODEL_VERSION,
    projectId,
    beforeRevision: input.beforeRevision,
    afterRevision: input.afterRevision,
    beforeSavedAtIso,
    afterSavedAtIso,
    beforeConfigurationFingerprint,
    afterConfigurationFingerprint,
    changedCount: input.changedCount,
    summary,
    rows,
  };
}

type CsvRecord = readonly string[];

/**
 * Parses RFC 4180-style records without relying on a browser CSV package.
 * Exported artifacts can contain quoted commas and newlines in review text,
 * so splitting on line breaks would silently corrupt a handoff.
 */
function parseCsvRecords(input: string): CsvRecord[] {
  if (input.length > MAX_PROJECT_DIFF_CSV_LENGTH) {
    throw new Error(`checkpoint diff CSVs must be ${MAX_PROJECT_DIFF_CSV_LENGTH.toLocaleString()} characters or smaller`);
  }
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let inQuotes = false;
  let closedQuote = false;
  let atCellStart = true;

  const finishCell = () => {
    record.push(cell);
    cell = "";
    atCellStart = true;
    closedQuote = false;
  };
  const finishRecord = () => {
    finishCell();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      if (!atCellStart || closedQuote) {
        throw new Error("checkpoint diff CSV contains a quote outside a quoted cell");
      }
      inQuotes = true;
      atCellStart = false;
      continue;
    }
    if (closedQuote) {
      if (character !== "," && character !== "\r" && character !== "\n") {
        throw new Error("checkpoint diff CSV has content after a closing quote");
      }
    }
    if (character === ",") {
      finishCell();
    } else if (character === "\n") {
      finishRecord();
    } else if (character === "\r") {
      if (input[index + 1] !== "\n") {
        throw new Error("checkpoint diff CSV must use LF or CRLF line endings");
      }
      index += 1;
      finishRecord();
    } else {
      cell += character;
      atCellStart = false;
    }
  }
  if (inQuotes) throw new Error("checkpoint diff CSV contains an unterminated quoted cell");
  if (record.length > 0 || cell.length > 0) finishRecord();
  return records;
}

const REQUIRED_DIFF_CSV_METADATA = [
  "# rocketworks_project_diff",
  "# export_model_version",
  "# diff_model_version",
  "# validation_status",
  "# review_boundary",
  "# project_id",
  "# before_revision",
  "# after_revision",
  "# before_saved_at_iso",
  "# after_saved_at_iso",
  "# fingerprint_model_version",
  "# before_configuration_fingerprint",
  "# after_configuration_fingerprint",
  "# changed_count",
  "# summary",
] as const;

function parseMetadataInteger(metadata: ReadonlyMap<string, string>, key: string, minimum: number): number {
  const value = metadata.get(key);
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`checkpoint diff CSV metadata ${key} must be a non-negative integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`checkpoint diff CSV metadata ${key} is outside the supported range`);
  }
  return parsed;
}

function requireMetadata(metadata: ReadonlyMap<string, string>, key: string): string {
  const value = metadata.get(key);
  if (value === undefined) throw new Error(`checkpoint diff CSV is missing metadata ${key}`);
  return value;
}

/**
 * Reopens a deterministic checkpoint-diff CSV and validates every envelope,
 * fingerprint, revision, and change row. The result is review metadata only;
 * this function never restores a project or changes browser state.
 */
export function parseProjectDiffCsv(input: string): ProjectSnapshotDiff {
  if (typeof input !== "string") throw new Error("checkpoint diff CSV must be text");
  const records = parseCsvRecords(input);
  if (records.length === 0) throw new Error("checkpoint diff CSV is empty");

  const metadata = new Map<string, string>();
  let recordIndex = 0;
  while (recordIndex < records.length && records[recordIndex][0]?.startsWith("#")) {
    const record = records[recordIndex];
    if (record.length !== 2 || !record[0]) {
      throw new Error(`checkpoint diff CSV metadata row ${recordIndex + 1} must contain exactly two cells`);
    }
    if (metadata.has(record[0])) throw new Error(`checkpoint diff CSV repeats metadata ${record[0]}`);
    metadata.set(record[0], record[1]);
    recordIndex += 1;
  }
  if (recordIndex === 0) throw new Error("checkpoint diff CSV is missing its metadata envelope");
  for (const key of REQUIRED_DIFF_CSV_METADATA) {
    if (!metadata.has(key)) throw new Error(`checkpoint diff CSV is missing metadata ${key}`);
  }
  if (metadata.size !== REQUIRED_DIFF_CSV_METADATA.length) {
    throw new Error("checkpoint diff CSV contains unsupported metadata");
  }
  if (metadata.get("# rocketworks_project_diff") !== "1") {
    throw new Error("unsupported checkpoint diff CSV envelope");
  }
  if (metadata.get("# export_model_version") !== PROJECT_DIFF_EXPORT_MODEL_VERSION) {
    throw new Error(`unsupported checkpoint diff CSV export model: ${metadata.get("# export_model_version")}`);
  }
  if (metadata.get("# diff_model_version") !== PROJECT_DIFF_MODEL_VERSION) {
    throw new Error(`unsupported checkpoint diff CSV model: ${metadata.get("# diff_model_version")}`);
  }
  if (metadata.get("# validation_status") !== PROJECT_DIFF_EXPORT_VALIDATION_STATUS) {
    throw new Error("checkpoint diff CSV has an unsupported validation status");
  }
  if (metadata.get("# review_boundary") !== PROJECT_DIFF_CSV_REVIEW_BOUNDARY) {
    throw new Error("checkpoint diff CSV review boundary is not recognized");
  }
  if (metadata.get("# fingerprint_model_version") !== PROJECT_DIFF_FINGERPRINT_MODEL_VERSION) {
    throw new Error("checkpoint diff CSV has an unsupported fingerprint model");
  }
  if (records[recordIndex]?.join(",") !== "category,key,label,before,after") {
    throw new Error("checkpoint diff CSV has an unexpected change-row header");
  }
  recordIndex += 1;

  const rows = records.slice(recordIndex).map((record, index) => {
    if (record.length !== 5) {
      throw new Error(`checkpoint diff CSV change row ${index + 1} must contain exactly five cells`);
    }
    const [category, key, label, before, after] = record;
    if (!DIFF_CATEGORIES.includes(category as ProjectDiffCategory)) {
      throw new Error(`checkpoint diff CSV change row ${index + 1} has an unknown category`);
    }
    return { category: category as ProjectDiffCategory, key, label, before, after };
  });
  const changedCount = parseMetadataInteger(metadata, "# changed_count", 0);
  const diff = {
    modelVersion: PROJECT_DIFF_MODEL_VERSION,
    projectId: requireMetadata(metadata, "# project_id"),
    beforeRevision: parseMetadataInteger(metadata, "# before_revision", 1),
    afterRevision: parseMetadataInteger(metadata, "# after_revision", 1),
    beforeSavedAtIso: requireMetadata(metadata, "# before_saved_at_iso"),
    afterSavedAtIso: requireMetadata(metadata, "# after_saved_at_iso"),
    beforeConfigurationFingerprint: requireMetadata(metadata, "# before_configuration_fingerprint"),
    afterConfigurationFingerprint: requireMetadata(metadata, "# after_configuration_fingerprint"),
    changedCount,
    summary: requireMetadata(metadata, "# summary"),
    rows,
  } satisfies ProjectSnapshotDiff;
  return validateDiff(diff);
}

/**
 * Exports a deterministic CSV with comment-prefixed metadata and one row per
 * configuration change. Empty diffs remain useful because the summary and
 * revisions are preserved in the metadata section.
 */
export function createProjectDiffCsv(input: ProjectSnapshotDiff): string {
  const diff = validateDiff(input);
  const metadata: readonly [string, string | number][] = [
    ["# rocketworks_project_diff", 1],
    ["# export_model_version", PROJECT_DIFF_EXPORT_MODEL_VERSION],
    ["# diff_model_version", diff.modelVersion],
    ["# validation_status", PROJECT_DIFF_EXPORT_VALIDATION_STATUS],
    ["# review_boundary", PROJECT_DIFF_CSV_REVIEW_BOUNDARY],
    ["# project_id", diff.projectId],
    ["# before_revision", diff.beforeRevision],
    ["# after_revision", diff.afterRevision],
    ["# before_saved_at_iso", diff.beforeSavedAtIso],
    ["# after_saved_at_iso", diff.afterSavedAtIso],
    ["# fingerprint_model_version", PROJECT_DIFF_FINGERPRINT_MODEL_VERSION],
    ["# before_configuration_fingerprint", diff.beforeConfigurationFingerprint],
    ["# after_configuration_fingerprint", diff.afterConfigurationFingerprint],
    ["# changed_count", diff.changedCount],
    ["# summary", diff.summary],
  ];
  const headers = ["category", "key", "label", "before", "after"];
  const rows = diff.rows.map((row) => [
    row.category,
    row.key,
    row.label,
    row.before,
    row.after,
  ].map(csvCell).join(","));
  return `${metadata.map(([key, value]) => `${key},${csvCell(value)}`).join("\r\n")}\r\n${headers.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

/**
 * Exports the same diff as a readable Markdown handoff for design reviews,
 * issue descriptions, and repository artifacts. The output is deterministic.
 */
export function createProjectDiffMarkdown(input: ProjectSnapshotDiff): string {
  const diff = validateDiff(input);
  const rows = diff.rows.length === 0
    ? "No configuration changes were recorded between these checkpoints."
    : [
        "| Category | Key | Change | Before | After |",
        "| --- | --- | --- | --- | --- |",
        ...diff.rows.map((row) => `| ${markdownCell(row.category)} | ${markdownCell(row.key)} | ${markdownCell(row.label)} | ${markdownCell(row.before)} | ${markdownCell(row.after)} |`),
      ].join("\n");
  return [
    "# RocketWorks checkpoint configuration diff",
    "",
    `- Export model: \`${PROJECT_DIFF_EXPORT_MODEL_VERSION}\``,
    `- Diff model: \`${diff.modelVersion}\``,
    `- Validation status: \`${PROJECT_DIFF_EXPORT_VALIDATION_STATUS}\``,
    `- Project: \`${markdownCell(diff.projectId)}\``,
    `- Revisions: R${String(diff.beforeRevision).padStart(2, "0")} → R${String(diff.afterRevision).padStart(2, "0")}`,
    `- Saved: ${diff.beforeSavedAtIso} → ${diff.afterSavedAtIso}`,
    `- Fingerprint model: \`${PROJECT_DIFF_FINGERPRINT_MODEL_VERSION}\``,
    `- Configuration fingerprints: \`${diff.beforeConfigurationFingerprint}\` → \`${diff.afterConfigurationFingerprint}\``,
    `- Summary: ${markdownCell(diff.summary)}`,
    "",
    "## Configuration changes",
    "",
    rows,
    "",
    "> Review boundary: fingerprints are non-cryptographic equality aids, not tamper signatures. This artifact describes saved inputs, topology, and source selections only; it is not simulation evidence, validation, certification, configuration control, or a flight-safety assessment.",
    "",
  ].join("\n");
}
