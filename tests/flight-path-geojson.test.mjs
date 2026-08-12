import assert from "node:assert/strict";
import test from "node:test";

import {
  FLIGHT_PATH_GEOJSON_MODEL_VERSION,
  createFlightPathGeoJson,
} from "../lib/export/flight-path-geojson.ts";

const base = {
  projectName: "Geo fixture",
  generatedAtIso: "2026-08-12T00:00:00.000Z",
  sourceModelVersion: "fixture-6dof-1",
  launchSite: {
    name: "Equator range",
    latitudeDeg: 0,
    longitudeDeg: 0,
    elevationM: 100,
  },
  series: [
    {
      id: "retained-vehicle",
      label: "Retained vehicle",
      trace: [
        { timeS: 0, positionWorldM: { x: 0, y: 0, z: 0 }, altitudeAglM: 0, speedMps: 0 },
        { timeS: 1, positionWorldM: { x: 100, y: 200, z: 30 }, altitudeAglM: 30, speedMps: 230 },
      ],
    },
  ],
  events: [{ id: "rail-exit", label: "Rail exit", timeS: 1, kind: "rail" }],
};

test("flight-path GeoJSON is deterministic, WGS84-shaped, and keeps sample timing", () => {
  const first = JSON.parse(createFlightPathGeoJson(base));
  const replay = JSON.parse(createFlightPathGeoJson(base));
  assert.deepEqual(first, replay);
  assert.equal(first.type, "FeatureCollection");
  assert.equal(first.metadata.modelVersion, FLIGHT_PATH_GEOJSON_MODEL_VERSION);
  assert.equal(first.metadata.coordinateFrame, "WGS84 longitude, latitude, ellipsoidal height");
  assert.equal(first.features.length, 2);
  const path = first.features[0];
  assert.equal(path.geometry.type, "LineString");
  assert.deepEqual(path.properties.sampleTimesS, [0, 1]);
  assert.deepEqual(path.properties.altitudeAglM, [0, 30]);
  assert.deepEqual(path.properties.speedMps, [0, 230]);
  assert.equal(path.geometry.coordinates[0][0], 0);
  assert.equal(path.geometry.coordinates[0][1], 0);
  assert.equal(path.geometry.coordinates[0][2], 100);
  assert.ok(path.geometry.coordinates[1][0] > 0);
  assert.ok(path.geometry.coordinates[1][1] > 0);
  assert.equal(path.geometry.coordinates[1][2], 130);
  const event = first.features[1];
  assert.equal(event.geometry.type, "Point");
  assert.equal(event.properties.positionSource, "nearest-retained-sample");
  assert.deepEqual(event.geometry.coordinates, path.geometry.coordinates[1]);
  assert.match(first.metadata.limitations.join(" "), /tangent approximation/);
});

test("flight-path GeoJSON preserves optional rigid-body attitude telemetry", () => {
  const document = JSON.parse(createFlightPathGeoJson({
    ...base,
    series: [{
      ...base.series[0],
      trace: [
        {
          ...base.series[0].trace[0],
          orientationBodyToWorld: { w: 2, x: 0, y: 0, z: 0 },
        },
        {
          ...base.series[0].trace[1],
          angularVelocityBodyRadS: { x: 0.3, y: 0.4, z: 0 },
        },
      ],
    }],
  }));
  const properties = document.features[0].properties;
  assert.deepEqual(properties.orientationBodyToWorld, [
    { w: 1, x: 0, y: 0, z: 0 },
    null,
  ]);
  assert.deepEqual(properties.angularVelocityBodyRadS, [
    null,
    [0.3, 0.4, 0],
  ]);
  assert.deepEqual(properties.angularRateMagnitudeRadS, [null, 0.5]);
});

test("unreached events remain explicit and empty traces stay valid features", () => {
  const document = JSON.parse(createFlightPathGeoJson({
    ...base,
    series: [{ id: "released", label: "Released body", trace: [] }],
    events: [{ id: "future", label: "Future event", timeS: 12 }],
  }));
  assert.equal(document.features[0].geometry.coordinates.length, 0);
  assert.equal(document.features[1].geometry, null);
  assert.equal(document.features[1].properties.positionSource, "unplaced");
});

test("flight-path validation rejects unsafe identifiers, ordering, and sites", () => {
  assert.throws(
    () => createFlightPathGeoJson({ ...base, series: [{ ...base.series[0], id: "bad id" }] }),
    /identifier/,
  );
  assert.throws(
    () => createFlightPathGeoJson({
      ...base,
      series: [{ ...base.series[0], trace: [base.series[0].trace[1], base.series[0].trace[0]] }],
    }),
    /ordered/,
  );
  assert.throws(
    () => createFlightPathGeoJson({ ...base, launchSite: { ...base.launchSite, latitudeDeg: 91 } }),
    /latitude/,
  );
  assert.throws(
    () => createFlightPathGeoJson({ ...base, launchSite: { ...base.launchSite, latitudeDeg: 90 } }),
    /pole/,
  );
  assert.throws(
    () => createFlightPathGeoJson({ ...base, series: [] }),
    /at least one trajectory/,
  );
  assert.throws(
    () => createFlightPathGeoJson({
      ...base,
      series: [{
        ...base.series[0],
        trace: [{
          ...base.series[0].trace[0],
          orientationBodyToWorld: { w: 0, x: 0, y: 0, z: 0 },
        }],
      }],
    }),
    /orientation quaternion/,
  );
});
