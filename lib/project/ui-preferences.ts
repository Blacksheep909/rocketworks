/**
 * Device-local presentation preferences for the RocketWorks workbench.
 *
 * These values deliberately stay outside the engineering project snapshot:
 * changing a camera/view preference must never change a vehicle fingerprint,
 * a saved flight configuration, or an exported engineering artifact.
 */

export const UI_PREFERENCES_SCHEMA_ID = "rocketworks-ui-preferences";
export const UI_PREFERENCES_SCHEMA_VERSION = 4;
export const UI_PREFERENCES_STORAGE_KEY = "rocketworks-ui-preferences-v4";
export const UI_PREFERENCES_LEGACY_STORAGE_KEYS = [
  "rocketworks-ui-preferences-v3",
  "rocketworks-ui-preferences-v2",
  "rocketworks-ui-preferences-v1",
] as const;

export type UiDesignView = "2d" | "3d-skeleton" | "3d-final";
export type UiLocale = "en" | "es";
export type UiExportDestination = "browser-download" | "save-dialog";

export type UiPreferences = Readonly<{
  schemaId: typeof UI_PREFERENCES_SCHEMA_ID;
  schemaVersion: typeof UI_PREFERENCES_SCHEMA_VERSION;
  designView: UiDesignView;
  designAzimuthDeg: number;
  reducedMotion: boolean;
  highContrast: boolean;
  locale: UiLocale;
  exportDestination: UiExportDestination;
}>;

const DESIGN_VIEWS: readonly UiDesignView[] = ["2d", "3d-skeleton", "3d-final"];

export function createDefaultUiPreferences(): UiPreferences {
  return {
    schemaId: UI_PREFERENCES_SCHEMA_ID,
    schemaVersion: UI_PREFERENCES_SCHEMA_VERSION,
    designView: "2d",
    designAzimuthDeg: 0,
    reducedMotion: false,
    highContrast: false,
    locale: "en",
    exportDestination: "browser-download",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function serializeUiPreferences(preferences: UiPreferences): string {
  if (preferences.schemaId !== UI_PREFERENCES_SCHEMA_ID) {
    throw new Error("unsupported UI preferences schema");
  }
  if (preferences.schemaVersion !== UI_PREFERENCES_SCHEMA_VERSION) {
    throw new Error("unsupported UI preferences version");
  }
  if (!DESIGN_VIEWS.includes(preferences.designView)) {
    throw new Error("UI preferences contain an unsupported design view");
  }
  if (!Number.isInteger(preferences.designAzimuthDeg) || preferences.designAzimuthDeg < 0 || preferences.designAzimuthDeg > 359) {
    throw new Error("UI preferences azimuth must be an integer from 0 through 359 degrees");
  }
  if (typeof preferences.reducedMotion !== "boolean") {
    throw new Error("UI preferences reduced-motion setting must be a boolean");
  }
  if (typeof preferences.highContrast !== "boolean") {
    throw new Error("UI preferences high-contrast setting must be a boolean");
  }
  if (preferences.locale !== "en" && preferences.locale !== "es") {
    throw new Error("UI preferences locale must be en or es");
  }
  if (preferences.exportDestination !== "browser-download" && preferences.exportDestination !== "save-dialog") {
    throw new Error("UI preferences export destination must be browser-download or save-dialog");
  }
  return JSON.stringify(preferences);
}

export function parseUiPreferences(serialized: string): UiPreferences {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("UI preferences are not valid JSON");
  }
  if (!isRecord(value)) throw new Error("UI preferences must be an object");
  if (value.schemaId !== UI_PREFERENCES_SCHEMA_ID) throw new Error("unsupported UI preferences schema");
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3 && value.schemaVersion !== UI_PREFERENCES_SCHEMA_VERSION) {
    throw new Error("unsupported UI preferences version");
  }
  if (typeof value.designView !== "string" || !DESIGN_VIEWS.includes(value.designView as UiDesignView)) {
    throw new Error("UI preferences contain an unsupported design view");
  }
  if (typeof value.designAzimuthDeg !== "number" || !Number.isInteger(value.designAzimuthDeg) || value.designAzimuthDeg < 0 || value.designAzimuthDeg > 359) {
    throw new Error("UI preferences azimuth must be an integer from 0 through 359 degrees");
  }
  const reducedMotion = value.schemaVersion === 1 ? false : value.reducedMotion;
  const highContrast = value.schemaVersion === 1 ? false : value.highContrast;
  const locale = value.schemaVersion === 3 || value.schemaVersion === UI_PREFERENCES_SCHEMA_VERSION
    ? value.locale
    : "en";
  const exportDestination = value.schemaVersion === UI_PREFERENCES_SCHEMA_VERSION
    ? value.exportDestination
    : "browser-download";
  if (typeof reducedMotion !== "boolean") {
    throw new Error("UI preferences reduced-motion setting must be a boolean");
  }
  if (typeof highContrast !== "boolean") {
    throw new Error("UI preferences high-contrast setting must be a boolean");
  }
  if (locale !== "en" && locale !== "es") {
    throw new Error("UI preferences locale must be en or es");
  }
  if (exportDestination !== "browser-download" && exportDestination !== "save-dialog") {
    throw new Error("UI preferences export destination must be browser-download or save-dialog");
  }
  return {
    schemaId: UI_PREFERENCES_SCHEMA_ID,
    schemaVersion: UI_PREFERENCES_SCHEMA_VERSION,
    designView: value.designView as UiDesignView,
    designAzimuthDeg: value.designAzimuthDeg,
    reducedMotion,
    highContrast,
    locale,
    exportDestination,
  };
}
