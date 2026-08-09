/**
 * Deterministic synthetic wind profile used by the browser preview.
 *
 * The profile is intentionally small and transparent: it is a user-facing
 * exploratory environment, not a measured weather product. The azimuth uses
 * the local ENU convention used by the browser controls: 0° points east and
 * +90° points north.
 */
export const PREVIEW_WIND_PROFILE_MODEL_VERSION = "kestrel-preview-wind-profile-0.2.0";

export type PreviewWindProfileOptions = Readonly<{
  windScale?: number;
  directionOffsetRad?: number;
  windAzimuthRad?: number;
}>;

export function createPreviewWindProfile(
  windSpeedMps: number,
  options: PreviewWindProfileOptions = {},
) {
  if (!Number.isFinite(windSpeedMps) || windSpeedMps < 0) {
    throw new Error("Preview wind speed must be finite and non-negative.");
  }
  const windScale = options.windScale ?? 1;
  const windAzimuthRad = options.windAzimuthRad ?? 0;
  const directionOffsetRad = options.directionOffsetRad ?? 0;
  if (!Number.isFinite(windScale) || windScale < 0) {
    throw new Error("Preview wind scale must be finite and non-negative.");
  }
  if (!Number.isFinite(windAzimuthRad) || !Number.isFinite(directionOffsetRad)) {
    throw new Error("Preview wind direction must be finite.");
  }
  const angle = windAzimuthRad + directionOffsetRad;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    { altitudeM: 0, eastMps: windSpeedMps * 0.5, northMps: 0, upMps: 0 },
    { altitudeM: 500, eastMps: windSpeedMps, northMps: windSpeedMps * 0.2, upMps: 0 },
    { altitudeM: 2000, eastMps: windSpeedMps * 1.4, northMps: windSpeedMps * 0.4, upMps: 0 },
  ].map((layer) => ({
    ...layer,
    eastMps: (layer.eastMps * cosine - layer.northMps * sine) * windScale,
    northMps: (layer.eastMps * sine + layer.northMps * cosine) * windScale,
    upMps: layer.upMps * windScale,
  }));
}
