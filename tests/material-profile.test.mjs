import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_MATERIAL_PROFILE_MODEL_VERSION,
  CUSTOM_MATERIAL_PROFILE_VALIDATION_STATUS,
  DEFAULT_CUSTOM_MATERIAL_PROFILE,
  materialProfileLimits,
  resolveCustomMaterialProfile,
  validateCustomMaterialProfile,
} from "../lib/project/material-profile.ts";

test("custom material profiles normalize display units into the structural SI model", () => {
  const profile = validateCustomMaterialProfile({
    label: "Test laminate",
    densityKgM3: 1_280,
    wallThicknessMm: 1.1,
    youngsModulusGPa: 32,
    poissonRatio: 0.28,
    allowableCompressionMPa: 90,
    allowableBendingMPa: 84,
    allowableShearMPa: 26,
  });
  const resolved = resolveCustomMaterialProfile(profile);

  assert.equal(resolved.label, "Test laminate");
  assert.equal(resolved.densityKgM3, 1_280);
  assert.equal(resolved.wallThicknessM, 0.0011);
  assert.equal(resolved.youngsModulusPa, 32e9);
  assert.equal(resolved.poissonRatio, 0.28);
  assert.equal(resolved.allowableCompressionPa, 90e6);
  assert.equal(resolved.allowableBendingPa, 84e6);
  assert.equal(resolved.allowableShearPa, 26e6);
  assert.equal(resolved.modelVersion, CUSTOM_MATERIAL_PROFILE_MODEL_VERSION);
  assert.equal(resolved.validationStatus, CUSTOM_MATERIAL_PROFILE_VALIDATION_STATUS);
  assert.equal(resolved.provenance?.sourceKind, "user-supplied");
  assert.equal(resolved.provenance?.validationStatus, "user-supplied-unvalidated");
});

test("custom material profiles provide safe defaults and reject malformed bounds", () => {
  assert.deepEqual(
    validateCustomMaterialProfile(DEFAULT_CUSTOM_MATERIAL_PROFILE),
    DEFAULT_CUSTOM_MATERIAL_PROFILE,
  );
  const limits = materialProfileLimits();
  assert.equal(limits.densityKgM3[0], 50);
  assert.equal(limits.poissonRatio[1], 0.49);
  assert.throws(
    () => validateCustomMaterialProfile({ ...DEFAULT_CUSTOM_MATERIAL_PROFILE, label: " " }),
    /label must be a non-empty string/,
  );
  assert.throws(
    () => validateCustomMaterialProfile({ ...DEFAULT_CUSTOM_MATERIAL_PROFILE, densityKgM3: 49.9 }),
    /densityKgM3 must be a finite number/,
  );
  assert.throws(
    () => validateCustomMaterialProfile({ ...DEFAULT_CUSTOM_MATERIAL_PROFILE, poissonRatio: 0.5 }),
    /poissonRatio must be a finite number/,
  );
  assert.throws(
    () => validateCustomMaterialProfile({ ...DEFAULT_CUSTOM_MATERIAL_PROFILE, youngsModulusGPa: Number.NaN }),
    /youngsModulusGPa must be a finite number/,
  );
});
