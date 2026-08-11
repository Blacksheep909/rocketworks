import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultUiPreferences,
  parseUiPreferences,
  serializeUiPreferences,
  UI_PREFERENCES_SCHEMA_ID,
  UI_PREFERENCES_SCHEMA_VERSION,
} from "../lib/project/ui-preferences.ts";

test("UI preferences round-trip without becoming engineering inputs", () => {
  const preferences = {
    ...createDefaultUiPreferences(),
    designView: "3d-skeleton",
    designAzimuthDeg: 217,
    reducedMotion: true,
    highContrast: true,
  };
  const restored = parseUiPreferences(serializeUiPreferences(preferences));
  assert.deepEqual(restored, preferences);
  assert.equal(restored.schemaId, UI_PREFERENCES_SCHEMA_ID);
  assert.equal(restored.schemaVersion, UI_PREFERENCES_SCHEMA_VERSION);
});

test("UI preferences reject unsupported views and unsafe azimuth values", () => {
  const base = createDefaultUiPreferences();
  assert.throws(
    () => parseUiPreferences(JSON.stringify({ ...base, designView: "wireframe" })),
    /unsupported design view/,
  );
  assert.throws(
    () => parseUiPreferences(JSON.stringify({ ...base, designAzimuthDeg: 360 })),
    /azimuth must be an integer/,
  );
  assert.throws(
    () => parseUiPreferences(JSON.stringify({ ...base, designAzimuthDeg: -1 })),
    /azimuth must be an integer/,
  );
  assert.throws(
    () => parseUiPreferences(JSON.stringify({ ...base, reducedMotion: "yes" })),
    /reduced-motion setting must be a boolean/,
  );
  assert.throws(
    () => parseUiPreferences(JSON.stringify({ ...base, highContrast: 1 })),
    /high-contrast setting must be a boolean/,
  );
  assert.throws(
    () => parseUiPreferences(JSON.stringify({ ...base, schemaVersion: 99 })),
    /unsupported UI preferences version/,
  );
});

test("UI preference serialization keeps the schema envelope explicit", () => {
  const serialized = serializeUiPreferences(createDefaultUiPreferences());
  assert.deepEqual(JSON.parse(serialized), {
    schemaId: UI_PREFERENCES_SCHEMA_ID,
    schemaVersion: UI_PREFERENCES_SCHEMA_VERSION,
    designView: "2d",
    designAzimuthDeg: 0,
    reducedMotion: false,
    highContrast: false,
    locale: "en",
  });
});

test("UI preferences migrate the v1 presentation record without changing engineering state", () => {
  const restored = parseUiPreferences(JSON.stringify({
    schemaId: UI_PREFERENCES_SCHEMA_ID,
    schemaVersion: 1,
    designView: "3d-final",
    designAzimuthDeg: 91,
  }));
  assert.deepEqual(restored, {
    ...createDefaultUiPreferences(),
    designView: "3d-final",
    designAzimuthDeg: 91,
  });
});

test("UI preferences migrate the v2 accessibility record with an English locale", () => {
  const restored = parseUiPreferences(JSON.stringify({
    schemaId: UI_PREFERENCES_SCHEMA_ID,
    schemaVersion: 2,
    designView: "2d",
    designAzimuthDeg: 12,
    reducedMotion: true,
    highContrast: true,
  }));
  assert.deepEqual(restored, {
    ...createDefaultUiPreferences(),
    designAzimuthDeg: 12,
    reducedMotion: true,
    highContrast: true,
  });
});

test("UI preferences reject unsupported locales", () => {
  assert.throws(
    () => parseUiPreferences(JSON.stringify({ ...createDefaultUiPreferences(), locale: "fr" })),
    /locale must be en or es/,
  );
});
