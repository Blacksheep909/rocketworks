import assert from "node:assert/strict";
import test from "node:test";

import {
  createProjectDiffCsv,
  createProjectDiffMarkdown,
  PROJECT_DIFF_EXPORT_MODEL_VERSION,
} from "../lib/export/project-diff-exports.ts";
import { compareProjectSnapshots } from "../lib/project/project-diff.ts";
import { createLocalProjectSnapshot } from "../lib/project/project-state.ts";

const baseInputs = {
  lengthMm: 710,
  diameterMm: 54,
  payloadMassKg: 0.16,
  material: "kraft",
  thrustN: 22,
  burnTimeS: 1.65,
  dragCoefficient: 0.52,
  launchAltitudeM: 80,
  windSpeedMps: 4,
  recoveryEnabled: true,
  recoveryDelayS: 0,
  recoveryInflationTimeS: 1.2,
  recoveryDeploymentTrigger: "apogee",
  recoveryDeploymentAltitudeM: 150,
  recoveryDeploymentTimeS: 8,
  recoveryDiameterM: 0.45,
  surfacePressureHpa: 1004,
  surfaceTemperatureC: 15,
};

function snapshot(revision, overrides = {}) {
  return createLocalProjectSnapshot({
    projectId: "arc54",
    projectName: "ARC 54",
    revision,
    savedAtIso: `2026-08-21T09:0${revision}:00.000Z`,
    inputs: { ...baseInputs, ...overrides },
  });
}

function sampleDiff(overrides = {}) {
  return compareProjectSnapshots(
    snapshot(1),
    snapshot(2, { diameterMm: 62, ...overrides }),
  );
}

test("checkpoint diff CSV preserves metadata and escaped change rows", () => {
  const csv = createProjectDiffCsv(sampleDiff({ launchSiteName: "Pad 1, north" }));
  assert.match(csv, new RegExp(`# export_model_version,${PROJECT_DIFF_EXPORT_MODEL_VERSION}`));
  assert.match(csv, /# review_boundary,Configuration review metadata only; not simulation evidence or a flight-safety assessment\./);
  assert.match(csv, /category,key,label,before,after/);
  assert.match(csv, /input,diameterMm,outer diameter,54,62/);
  assert.match(csv, /input,launchSiteName,launch-site name,ARC 54 synthetic range,"Pad 1, north"/);
  assert.match(csv, /\r\n$/);
});

test("checkpoint diff Markdown is deterministic and retains the review boundary", () => {
  const diff = sampleDiff({ diameterMm: 62 });
  const markdown = createProjectDiffMarkdown(diff);
  assert.match(markdown, /^# RocketWorks checkpoint configuration diff/m);
  assert.match(markdown, /Revisions: R01 → R02/);
  assert.match(markdown, /\| input \| diameterMm \| outer diameter \| 54 \| 62 \|/);
  assert.match(markdown, /not simulation evidence, validation, certification, configuration control, or a flight-safety assessment/);
  assert.equal(markdown, createProjectDiffMarkdown(diff));
});

test("empty checkpoint diffs remain portable without a fabricated change row", () => {
  const diff = compareProjectSnapshots(snapshot(1), snapshot(2));
  const csv = createProjectDiffCsv(diff);
  const markdown = createProjectDiffMarkdown(diff);
  assert.match(csv, /# changed_count,0/);
  assert.match(csv, /category,key,label,before,after\r\n\r\n$/);
  assert.match(markdown, /No configuration changes were recorded between these checkpoints\./);
});

test("checkpoint diff exports reject malformed or non-chronological input", () => {
  const diff = sampleDiff();
  assert.throws(
    () => createProjectDiffCsv({ ...diff, changedCount: 0 }),
    /changedCount must match rows/,
  );
  assert.throws(
    () => createProjectDiffMarkdown({ ...diff, modelVersion: "other-model" }),
    /unsupported project checkpoint diff model/,
  );
  assert.throws(
    () => createProjectDiffCsv({ ...diff, afterRevision: 1 }),
    /afterRevision must be greater than beforeRevision/,
  );
});
