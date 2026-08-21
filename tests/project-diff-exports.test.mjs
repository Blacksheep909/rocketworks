import assert from "node:assert/strict";
import test from "node:test";

import {
  createProjectDiffCsv,
  createProjectDiffMarkdown,
  parseProjectDiffCsv,
  PROJECT_DIFF_EXPORT_MODEL_VERSION,
} from "../lib/export/project-diff-exports.ts";
import {
  compareProjectSnapshots,
  PROJECT_DIFF_FINGERPRINT_MODEL_VERSION,
} from "../lib/project/project-diff.ts";
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
  assert.match(csv, new RegExp(`# fingerprint_model_version,${PROJECT_DIFF_FINGERPRINT_MODEL_VERSION}`));
  assert.match(csv, /# before_configuration_fingerprint,rocketworks-config-fingerprint-fnv1a32-0\.1\.0:/);
  assert.match(csv, /# after_configuration_fingerprint,rocketworks-config-fingerprint-fnv1a32-0\.1\.0:/);
  assert.match(csv, /# review_boundary,Configuration review metadata only; not simulation evidence or a flight-safety assessment\./);
  assert.match(csv, /category,key,label,before,after/);
  assert.match(csv, /input,diameterMm,outer diameter,54,62/);
  assert.match(csv, /input,launchSiteName,launch-site name,ARC 54 synthetic range,"Pad 1, north"/);
  assert.match(csv, /\r\n$/);
});

test("checkpoint diff CSV round-trips quoted commas and newlines exactly", () => {
  const diff = sampleDiff({ launchSiteName: "Pad 1,\n north" });
  const csv = createProjectDiffCsv(diff);
  assert.match(csv, /"Pad 1,\n north"/);
  assert.deepEqual(parseProjectDiffCsv(csv), diff);
  assert.deepEqual(parseProjectDiffCsv(csv.replaceAll("\r\n", "\n")), diff);
});

test("checkpoint diff CSV parser rejects unsupported envelopes and malformed rows", () => {
  const csv = createProjectDiffCsv(sampleDiff({ launchSiteName: "Pad 1, north" }));
  assert.throws(
    () => parseProjectDiffCsv(csv.replace(`# export_model_version,${PROJECT_DIFF_EXPORT_MODEL_VERSION}`, "# export_model_version,other")),
    /unsupported checkpoint diff CSV export model/,
  );
  assert.throws(
    () => parseProjectDiffCsv(csv.replace(/# before_configuration_fingerprint,[^\r\n]+/, "# before_configuration_fingerprint,broken")),
    /beforeConfigurationFingerprint must use/,
  );
  assert.throws(
    () => parseProjectDiffCsv(csv.replace(/"Pad 1, north"/, '"Pad 1, north')),
    /unterminated quoted cell/,
  );
  assert.throws(
    () => parseProjectDiffCsv(csv.replace("# changed_count,2", "# changed_count,1")),
    /changedCount must match rows/,
  );
});

test("checkpoint diff Markdown is deterministic and retains the review boundary", () => {
  const diff = sampleDiff({ diameterMm: 62 });
  const markdown = createProjectDiffMarkdown(diff);
  assert.match(markdown, /^# RocketWorks checkpoint configuration diff/m);
  assert.match(markdown, /Revisions: R01 → R02/);
  assert.match(markdown, /Fingerprint model: `rocketworks-config-fingerprint-fnv1a32-0\.1\.0`/);
  assert.match(markdown, /Configuration fingerprints: `rocketworks-config-fingerprint-fnv1a32-0\.1\.0:/);
  assert.match(markdown, /\| input \| diameterMm \| outer diameter \| 54 \| 62 \|/);
  assert.match(markdown, /non-cryptographic equality aids, not tamper signatures/);
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
