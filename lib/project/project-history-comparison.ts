import type { ProjectHistoryEntry } from "./project-state.ts";

/**
 * Returns the valid earlier checkpoints that can be used as a baseline for a
 * selected target. History is chronological, so later revisions are never
 * offered as a before-state.
 */
export function listComparisonBaselines(
  entries: readonly ProjectHistoryEntry[],
  targetEntryId: string | null,
): readonly ProjectHistoryEntry[] {
  if (targetEntryId === null) return [];
  const targetIndex = entries.findIndex((entry) => entry.id === targetEntryId);
  return targetIndex > 0 ? entries.slice(0, targetIndex) : [];
}

/**
 * Resolves an explicitly selected baseline and falls back to the immediately
 * preceding checkpoint when the selection is absent or no longer valid.
 */
export function selectComparisonBaseline(
  entries: readonly ProjectHistoryEntry[],
  targetEntryId: string | null,
  requestedBaselineEntryId: string | null,
): ProjectHistoryEntry | null {
  const baselines = listComparisonBaselines(entries, targetEntryId);
  if (baselines.length === 0) return null;
  const requested = requestedBaselineEntryId === null
    ? null
    : baselines.find((entry) => entry.id === requestedBaselineEntryId) ?? null;
  return requested ?? baselines.at(-1) ?? null;
}
