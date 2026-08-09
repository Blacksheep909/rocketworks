import assert from "node:assert/strict";
import test from "node:test";

import {
  PREVIEW_WIND_PROFILE_MODEL_VERSION,
  createPreviewWindProfile,
} from "../lib/physics/preview-wind-profile.ts";

test("preview wind profile rotates the altitude-dependent ENU layers", () => {
  const east = createPreviewWindProfile(10);
  const north = createPreviewWindProfile(10, { windAzimuthRad: Math.PI / 2 });
  assert.equal(PREVIEW_WIND_PROFILE_MODEL_VERSION, "kestrel-preview-wind-profile-0.2.0");
  assert.ok(Math.abs(east[1].eastMps - 10) < 1e-12);
  assert.ok(Math.abs(east[1].northMps - 2) < 1e-12);
  assert.ok(Math.abs(north[1].eastMps + 2) < 1e-12);
  assert.ok(Math.abs(north[1].northMps - 10) < 1e-12);
  assert.ok(Math.abs(north[2].eastMps + 4) < 1e-12);
  assert.ok(Math.abs(north[2].northMps - 14) < 1e-12);
});

test("preview wind profile composes sampled direction offsets and rejects invalid inputs", () => {
  const profile = createPreviewWindProfile(8, {
    windAzimuthRad: Math.PI / 4,
    directionOffsetRad: -Math.PI / 4,
    windScale: 0.5,
  });
  assert.ok(Math.abs(profile[0].eastMps - 2) < 1e-12);
  assert.ok(Math.abs(profile[0].northMps) < 1e-12);
  assert.throws(() => createPreviewWindProfile(-1), /non-negative/);
  assert.throws(() => createPreviewWindProfile(1, { windScale: -0.1 }), /non-negative/);
  assert.throws(() => createPreviewWindProfile(1, { windAzimuthRad: Number.NaN }), /finite/);
});
