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
  });
});
