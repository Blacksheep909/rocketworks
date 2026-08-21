import {
  PROJECT_DIFF_MODEL_VERSION,
  type ProjectDiffCategory,
  type ProjectSnapshotDiff,
} from "../project/project-diff.ts";

/**
 * Stable, portable envelope versions for checkpoint-diff handoff artifacts.
 * These files contain configuration review metadata only; they never contain
 * simulation traces or a claim that a design is flight-ready.
 */
export const PROJECT_DIFF_EXPORT_MODEL_VERSION = "rocketworks-project-diff-export-0.1.0";
export const PROJECT_DIFF_EXPORT_VALIDATION_STATUS = "engineering-preview-unvalidated";

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
    changedCount: input.changedCount,
    summary,
    rows,
  };
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
    ["# review_boundary", "Configuration review metadata only; not simulation evidence or a flight-safety assessment."],
    ["# project_id", diff.projectId],
    ["# before_revision", diff.beforeRevision],
    ["# after_revision", diff.afterRevision],
    ["# before_saved_at_iso", diff.beforeSavedAtIso],
    ["# after_saved_at_iso", diff.afterSavedAtIso],
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
    `- Summary: ${markdownCell(diff.summary)}`,
    "",
    "## Configuration changes",
    "",
    rows,
    "",
    "> Review boundary: this artifact describes saved inputs, topology, and source selections only. It is not simulation evidence, validation, certification, configuration control, or a flight-safety assessment.",
    "",
  ].join("\n");
}
