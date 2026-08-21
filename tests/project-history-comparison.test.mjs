import assert from "node:assert/strict";
import test from "node:test";

import {
  listComparisonBaselines,
  selectComparisonBaseline,
} from "../lib/project/project-history-comparison.ts";

const entries = [
  { id: "r1", snapshot: { revision: 1 }, label: "Initial" },
  { id: "r2", snapshot: { revision: 2 }, label: "Airframe" },
  { id: "r3", snapshot: { revision: 3 }, label: "Wind" },
];

test("history comparison baselines are limited to earlier checkpoints", () => {
  assert.deepEqual(listComparisonBaselines(entries, "r3").map((entry) => entry.id), ["r1", "r2"]);
  assert.deepEqual(listComparisonBaselines(entries, "r1"), []);
  assert.deepEqual(listComparisonBaselines(entries, "missing"), []);
});

test("history comparison defaults to adjacent and accepts an earlier baseline", () => {
  assert.equal(selectComparisonBaseline(entries, "r3", null)?.id, "r2");
  assert.equal(selectComparisonBaseline(entries, "r3", "r1")?.id, "r1");
  assert.equal(selectComparisonBaseline(entries, "r3", "r3")?.id, "r2");
  assert.equal(selectComparisonBaseline(entries, "r1", null), null);
});
