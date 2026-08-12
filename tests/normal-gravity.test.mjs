import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateGravity,
  gravityAtAltitude,
  wgs84NormalGravityAtLatitudeAltitude,
} from "../lib/physics/index.ts";

test("WGS84 normal gravity reproduces equator and pole surface anchors", () => {
  const equator = wgs84NormalGravityAtLatitudeAltitude(0, 0);
  const pole = wgs84NormalGravityAtLatitudeAltitude(90, 0);
  assert.ok(Math.abs(equator - 9.7803253359) < 1e-10);
  assert.ok(Math.abs(pole - 9.8321849379) < 1e-10);
  assert.ok(pole > equator);
});

test("WGS84 normal gravity decreases with height and varies by latitude", () => {
  const seaLevel = wgs84NormalGravityAtLatitudeAltitude(-36.85, 0);
  const oneKm = wgs84NormalGravityAtLatitudeAltitude(-36.85, 1000);
  assert.ok(seaLevel > oneKm);
  assert.ok(seaLevel - oneKm > 0.002);
  assert.ok(seaLevel - oneKm < 0.004);
});

test("standard gravity evaluation remains an exact compatibility path", () => {
  const result = evaluateGravity({ model: "standard", latitudeDeg: 90, altitudeM: 500 });
  assert.equal(result.gravityMps2, gravityAtAltitude(500));
  assert.equal(result.model, "standard");
  assert.match(result.modelVersion, /standard-gravity/);
});

test("gravity model evaluation rejects invalid sites, altitudes, and model identifiers", () => {
  assert.throws(() => evaluateGravity({ model: "wgs84-normal", latitudeDeg: 90.1, altitudeM: 0 }), /latitude/);
  assert.throws(() => evaluateGravity({ model: "wgs84-normal", latitudeDeg: 0, altitudeM: Number.NaN }), /altitude/);
  assert.throws(() => evaluateGravity({ model: "unknown", latitudeDeg: 0, altitudeM: 0 }), /model must/);
  assert.throws(() => wgs84NormalGravityAtLatitudeAltitude(0, -1e10), /altitude must be/);
});
