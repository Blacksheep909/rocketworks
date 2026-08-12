import type { Vector3 } from "../physics/linear-algebra.ts";

/**
 * Versioned, display/export-only flight-path interchange.  The simulation
 * remains responsible for producing the ENU states; this module only maps
 * those states into RFC 7946-style WGS84 GeoJSON features.
 */
export const FLIGHT_PATH_GEOJSON_MODEL_VERSION =
  "rocketworks-flight-path-geojson-0.1.0";
export const FLIGHT_PATH_GEOJSON_VALIDATION_STATUS =
  "engineering-preview-unvalidated" as const;

const WGS84_SEMI_MAJOR_AXIS_M = 6_378_137;
const WGS84_FIRST_ECCENTRICITY_SQUARED = 6.6943799901413165e-3;

export type FlightPathGeoJsonSample = Readonly<{
  timeS: number;
  positionWorldM: Vector3;
  altitudeAglM?: number;
  speedMps?: number;
}>;

export type FlightPathGeoJsonSeries = Readonly<{
  id: string;
  label: string;
  trace: readonly FlightPathGeoJsonSample[];
  releaseTimeS?: number;
}>;

export type FlightPathGeoJsonEvent = Readonly<{
  id: string;
  label: string;
  timeS: number;
  kind?: string;
}>;

export type FlightPathGeoJsonInput = Readonly<{
  projectName: string;
  generatedAtIso: string;
  sourceModelVersion: string;
  launchSite: Readonly<{
    name: string;
    latitudeDeg: number;
    longitudeDeg: number;
    elevationM: number;
  }>;
  series: readonly FlightPathGeoJsonSeries[];
  events?: readonly FlightPathGeoJsonEvent[];
}>;

type GeodeticCoordinate = Readonly<{
  longitudeDeg: number;
  latitudeDeg: number;
  altitudeM: number;
}>;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertNonNegative(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0) throw new Error(`${label} must be non-negative`);
}

function assertVector(value: Vector3, label: string): void {
  assertFinite(value.x, `${label} east`);
  assertFinite(value.y, `${label} north`);
  assertFinite(value.z, `${label} up`);
}

function assertIsoDate(value: string): void {
  if (!value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error("flight-path export timestamp must be an ISO date-time");
  }
}

function assertIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error(`${label} must contain only letters, numbers, dots, underscores, and hyphens`);
  }
}

function validateLaunchSite(site: FlightPathGeoJsonInput["launchSite"]): void {
  if (!site.name.trim()) throw new Error("flight-path launch-site name cannot be empty");
  assertFinite(site.latitudeDeg, "flight-path launch-site latitude");
  assertFinite(site.longitudeDeg, "flight-path launch-site longitude");
  assertFinite(site.elevationM, "flight-path launch-site elevation");
  if (site.latitudeDeg < -90 || site.latitudeDeg > 90) {
    throw new Error("flight-path launch-site latitude must be from -90 through 90 degrees");
  }
  if (site.longitudeDeg < -180 || site.longitudeDeg > 180) {
    throw new Error("flight-path launch-site longitude must be from -180 through 180 degrees");
  }
}

function validateTrace(
  trace: readonly FlightPathGeoJsonSample[],
  seriesId: string,
): void {
  let previousTimeS = -Infinity;
  trace.forEach((sample, index) => {
    assertNonNegative(sample.timeS, `flight path ${seriesId} sample ${index + 1} time`);
    if (sample.timeS < previousTimeS) {
      throw new Error(`flight path ${seriesId} sample times must be ordered`);
    }
    assertVector(sample.positionWorldM, `flight path ${seriesId} sample ${index + 1} position`);
    if (sample.altitudeAglM !== undefined) {
      assertFinite(sample.altitudeAglM, `flight path ${seriesId} sample ${index + 1} altitude`);
    }
    if (sample.speedMps !== undefined) {
      assertNonNegative(sample.speedMps, `flight path ${seriesId} sample ${index + 1} speed`);
    }
    previousTimeS = sample.timeS;
  });
}

/**
 * Convert a local ENU displacement to geodetic WGS84 using the meridional and
 * prime-vertical radii at the launch site.  This is a local tangent
 * approximation; it is intentionally not a geodesic or terrain correction.
 */
function localEnuToWgs84(
  positionWorldM: Vector3,
  site: FlightPathGeoJsonInput["launchSite"],
): GeodeticCoordinate {
  const latitudeRad = (site.latitudeDeg * Math.PI) / 180;
  const longitudeRad = (site.longitudeDeg * Math.PI) / 180;
  const sinLatitude = Math.sin(latitudeRad);
  const denominator = Math.sqrt(
    1 - WGS84_FIRST_ECCENTRICITY_SQUARED * sinLatitude ** 2,
  );
  const primeVerticalRadiusM = WGS84_SEMI_MAJOR_AXIS_M / denominator;
  const meridionalRadiusM =
    (WGS84_SEMI_MAJOR_AXIS_M * (1 - WGS84_FIRST_ECCENTRICITY_SQUARED)) /
    denominator ** 3;
  const latitudeOffsetRad = positionWorldM.y / (meridionalRadiusM + site.elevationM);
  const longitudeDenominator =
    (primeVerticalRadiusM + site.elevationM) * Math.cos(latitudeRad);
  if (!(Math.abs(longitudeDenominator) > 1e-6)) {
    throw new Error("flight-path launch-site longitude scale is undefined at a pole");
  }
  const rawLongitudeDeg =
    ((longitudeRad + positionWorldM.x / longitudeDenominator) * 180) / Math.PI;
  const longitudeDeg = ((rawLongitudeDeg + 180) % 360 + 360) % 360 - 180;
  const latitudeDeg = ((latitudeRad + latitudeOffsetRad) * 180) / Math.PI;
  if (latitudeDeg < -90 || latitudeDeg > 90) {
    throw new Error("flight-path trace exceeds the WGS84 latitude bounds of the local tangent export");
  }
  return {
    longitudeDeg,
    latitudeDeg,
    altitudeM: site.elevationM + positionWorldM.z,
  };
}

function coordinate(coordinate: GeodeticCoordinate): readonly [number, number, number] {
  return [coordinate.longitudeDeg, coordinate.latitudeDeg, coordinate.altitudeM];
}

function nearestSample(
  trace: readonly FlightPathGeoJsonSample[],
  timeS: number,
): FlightPathGeoJsonSample | null {
  if (trace.length === 0) return null;
  return trace.reduce((nearest, sample) =>
    Math.abs(sample.timeS - timeS) < Math.abs(nearest.timeS - timeS)
      ? sample
      : nearest,
  );
}

/**
 * Create deterministic GeoJSON for retained/released ENU traces and mission
 * events.  The output is a FeatureCollection with custom `metadata` and
 * per-line sample-time arrays so a GIS consumer can retain scrubber timing.
 */
export function createFlightPathGeoJson(input: FlightPathGeoJsonInput): string {
  if (!input.projectName.trim()) throw new Error("flight-path project name cannot be empty");
  if (!input.sourceModelVersion.trim()) throw new Error("flight-path source model version cannot be empty");
  assertIsoDate(input.generatedAtIso);
  validateLaunchSite(input.launchSite);
  if (input.series.length === 0) throw new Error("flight-path export requires at least one trajectory");

  const seriesIds = new Set<string>();
  input.series.forEach((series) => {
    assertIdentifier(series.id, "flight-path series identifier");
    if (!series.label.trim()) throw new Error(`flight path ${series.id} label cannot be empty`);
    if (seriesIds.has(series.id)) throw new Error(`flight path ${series.id} is duplicated`);
    seriesIds.add(series.id);
    validateTrace(series.trace, series.id);
    if (series.releaseTimeS !== undefined) {
      assertNonNegative(series.releaseTimeS, `flight path ${series.id} release time`);
    }
  });

  const eventIds = new Set<string>();
  const events = input.events ?? [];
  events.forEach((event) => {
    assertIdentifier(event.id, "flight-path event identifier");
    if (!event.label.trim()) throw new Error(`flight path event ${event.id} label cannot be empty`);
    if (eventIds.has(event.id)) throw new Error(`flight path event ${event.id} is duplicated`);
    eventIds.add(event.id);
    assertNonNegative(event.timeS, `flight path event ${event.id} time`);
    if (event.kind !== undefined && !event.kind.trim()) {
      throw new Error(`flight path event ${event.id} kind cannot be empty`);
    }
  });

  const primaryTrace = input.series[0]?.trace ?? [];
  const features = input.series.map((series) => ({
    type: "Feature" as const,
    id: series.id,
    properties: {
      featureKind: "flight-path",
      pathId: series.id,
      label: series.label,
      sourceModelVersion: input.sourceModelVersion,
      validationStatus: FLIGHT_PATH_GEOJSON_VALIDATION_STATUS,
      coordinateFrame: "WGS84 longitude, latitude, ellipsoidal height",
      localFrame: "ENU metres from the launch point",
      sampleTimesS: series.trace.map((sample) => sample.timeS),
      ...(series.releaseTimeS === undefined ? {} : { releaseTimeS: series.releaseTimeS }),
      ...(series.trace.some((sample) => sample.altitudeAglM !== undefined)
        ? { altitudeAglM: series.trace.map((sample) => sample.altitudeAglM ?? null) }
        : {}),
      ...(series.trace.some((sample) => sample.speedMps !== undefined)
        ? { speedMps: series.trace.map((sample) => sample.speedMps ?? null) }
        : {}),
    },
    geometry: {
      type: "LineString" as const,
      coordinates: series.trace.map((sample) => coordinate(localEnuToWgs84(sample.positionWorldM, input.launchSite))),
    },
  }));

  const eventFeatures = events.map((event) => {
    const sample = nearestSample(primaryTrace, event.timeS);
    return {
      type: "Feature" as const,
      id: `event-${event.id}`,
      properties: {
        featureKind: "flight-event",
        eventId: event.id,
        label: event.label,
        timeS: event.timeS,
        ...(event.kind === undefined ? {} : { kind: event.kind }),
        sourceModelVersion: input.sourceModelVersion,
        validationStatus: FLIGHT_PATH_GEOJSON_VALIDATION_STATUS,
        positionSource: sample ? "nearest-retained-sample" : "unplaced",
      },
      geometry: sample
        ? {
            type: "Point" as const,
            coordinates: coordinate(localEnuToWgs84(sample.positionWorldM, input.launchSite)),
          }
        : null,
    };
  });

  const document = {
    type: "FeatureCollection" as const,
    metadata: {
      format: "RocketWorks flight-path GeoJSON",
      modelVersion: FLIGHT_PATH_GEOJSON_MODEL_VERSION,
      sourceModelVersion: input.sourceModelVersion,
      validationStatus: FLIGHT_PATH_GEOJSON_VALIDATION_STATUS,
      generatedAtIso: input.generatedAtIso,
      projectName: input.projectName,
      launchSite: input.launchSite,
      coordinateFrame: "WGS84 longitude, latitude, ellipsoidal height",
      localFrame: "ENU metres from the launch point",
      projection: "WGS84 local tangent approximation using meridional and prime-vertical radii",
      limitations: [
        "This export is an engineering-preview visualization/interchange artifact, not a flight-safety or range-safety product.",
        "Local ENU positions are mapped to WGS84 with a first-order tangent approximation; terrain, geoid height, Earth rotation, and surveying corrections are not applied.",
        "Event points are attached to the nearest retained-vehicle sample; unreached events have null geometry.",
      ],
    },
    features: [...features, ...eventFeatures],
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}
