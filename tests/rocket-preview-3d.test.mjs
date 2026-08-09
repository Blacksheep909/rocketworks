import assert from "node:assert/strict";
import test from "node:test";

import {
  ROCKET_PREVIEW_3D_MODEL_VERSION,
  createRocketPreviewMesh,
  pickProjectedRocketSurface,
  projectRocketPreview,
  tangentOgiveRadiusM,
} from "../lib/visualization/rocket-preview-3d.ts";

function mesh(overrides = {}) {
  return createRocketPreviewMesh({
    noseLengthM: 0.18,
    bodyLengthM: 0.71,
    bodyRadiusM: 0.027,
    finCount: 3,
    finRootChordM: 0.13,
    finTipChordM: 0.055,
    finSweepM: 0.045,
    finSpanM: 0.075,
    finThicknessM: 0.003,
    radialSegments: 28,
    ...overrides,
  });
}

test("tangent-ogive profile meets the tip and body radius exactly", () => {
  assert.ok(Math.abs(tangentOgiveRadiusM(0, 0.18, 0.027)) < 1e-14);
  assert.ok(Math.abs(tangentOgiveRadiusM(0.18, 0.18, 0.027) - 0.027) < 1e-14);
  const samples = Array.from({ length: 21 }, (_, index) =>
    tangentOgiveRadiusM((0.18 * index) / 20, 0.18, 0.027),
  );
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(samples[index] >= samples[index - 1]);
  }
});

test("preview mesh contains finite display surfaces and expected extents", () => {
  const result = mesh();
  assert.equal(result.modelVersion, ROCKET_PREVIEW_3D_MODEL_VERSION);
  assert.ok(result.triangles.length > 1000);
  assert.ok(result.triangles.some((triangle) => triangle.surface === "nose"));
  assert.ok(result.triangles.some((triangle) => triangle.surface === "skin"));
  assert.ok(result.triangles.some((triangle) => triangle.surface === "accent"));
  assert.ok(result.triangles.some((triangle) => triangle.surface === "fin"));
  assert.ok(result.triangles.some((triangle) => triangle.surface === "rear"));
  assert.ok(result.triangles.some((triangle) => triangle.surface === "nozzle"));
  assert.ok(Math.abs(result.longitudinalLengthM - 0.89) < 1e-14);
  assert.equal(result.maximumRadiusM, 0.102);
  assert.equal(result.bounds.minimum.x, 0);
  assert.ok(result.bounds.maximum.x > result.longitudinalLengthM);
  for (const triangle of result.triangles) {
    for (const vertex of [triangle.a, triangle.b, triangle.c]) {
      assert.ok([vertex.x, vertex.y, vertex.z].every(Number.isFinite));
    }
  }
});

test("preview mesh expands enabled serial and radial stage instances", () => {
  const result = mesh({
    stageInstances: [
      {
        id: "core-preview-1",
        translationXM: 0,
        radialOffsetM: { y: 0, z: 0 },
        lengthScale: 1,
        radiusScale: 1,
      },
      {
        id: "booster-preview-1",
        translationXM: 0,
        radialOffsetM: { y: 0.12, z: 0 },
        rotationRad: Math.PI / 2,
        lengthScale: 0.72,
        radiusScale: 0.8,
        includeNose: true,
        includeFins: true,
        includeNozzle: true,
      },
      {
        id: "upper-preview-1",
        translationXM: -0.45,
        radialOffsetM: { y: 0, z: 0 },
        lengthScale: 0.62,
        radiusScale: 0.72,
        includeFins: true,
        includeNozzle: true,
      },
    ],
  });
  assert.ok(result.bounds.minimum.x < 0);
  assert.ok(result.bounds.maximum.x > 0.89);
  assert.ok(result.maximumRadiusM > 0.12);
  assert.ok(result.triangles.length > mesh().triangles.length);
  assert.ok(result.triangles.every((triangle) =>
    [triangle.a, triangle.b, triangle.c]
      .flatMap((point) => [point.x, point.y, point.z])
      .every(Number.isFinite),
  ));
  const payloadOnly = mesh({
    stageInstances: [{
      id: "payload-preview-1",
      translationXM: 0,
      lengthScale: 0.48,
      radiusScale: 0.72,
      includeFins: false,
      includeNozzle: false,
    }],
  });
  assert.equal(payloadOnly.triangles.some((triangle) => triangle.surface === "fin"), false);
  assert.equal(payloadOnly.triangles.some((triangle) => triangle.surface === "nozzle"), false);
});

test("editable nose profiles produce distinct finite display geometry", () => {
  const ogive = mesh({ noseProfile: "ogive" });
  const conical = mesh({ noseProfile: "conical" });
  const elliptical = mesh({ noseProfile: "elliptical" });
  assert.equal(conical.longitudinalLengthM, ogive.longitudinalLengthM);
  assert.equal(elliptical.longitudinalLengthM, ogive.longitudinalLengthM);
  assert.notDeepEqual(conical.triangles.slice(0, 28), ogive.triangles.slice(0, 28));
  assert.notDeepEqual(elliptical.triangles.slice(0, 28), ogive.triangles.slice(0, 28));
  for (const result of [conical, elliptical]) {
    assert.ok(result.triangles.flatMap((triangle) => [triangle.a, triangle.b, triangle.c])
      .flatMap((point) => [point.x, point.y, point.z])
      .every(Number.isFinite));
  }
});

test("three-fin mesh is radially balanced around the vehicle axis", () => {
  const finVertices = mesh().triangles
    .filter((triangle) => triangle.surface === "fin")
    .flatMap((triangle) => [triangle.a, triangle.b, triangle.c]);
  const sumY = finVertices.reduce((sum, vertex) => sum + vertex.y, 0);
  const sumZ = finVertices.reduce((sum, vertex) => sum + vertex.z, 0);
  assert.ok(Math.abs(sumY) < 1e-12);
  assert.ok(Math.abs(sumZ) < 1e-12);
});

test("perspective projection is finite, depth sorted, and zoom responsive", () => {
  const result = mesh();
  const markers = [
    { id: "nose", position: { x: 0, y: 0, z: 0 } },
    { id: "tail", position: { x: result.longitudinalLengthM, y: 0, z: 0 } },
  ];
  const first = projectRocketPreview(
    result,
    { yawRad: -0.4, pitchRad: -0.2, zoom: 0.8 },
    { width: 900, height: 520, padding: 40 },
    markers,
  );
  const zoomed = projectRocketPreview(
    result,
    { yawRad: -0.4, pitchRad: -0.2, zoom: 1.6 },
    { width: 900, height: 520, padding: 40 },
    markers,
  );
  assert.equal(first.triangles.length, result.triangles.length);
  for (let index = 1; index < first.triangles.length; index += 1) {
    assert.ok(first.triangles[index].depth >= first.triangles[index - 1].depth);
  }
  for (const triangle of first.triangles) {
    assert.ok(Number.isFinite(triangle.lightIntensity));
    assert.ok(triangle.points.flatMap((point) => [point.x, point.y]).every(Number.isFinite));
  }
  const separation = Math.hypot(
    first.markers.tail.x - first.markers.nose.x,
    first.markers.tail.y - first.markers.nose.y,
  );
  const zoomedSeparation = Math.hypot(
    zoomed.markers.tail.x - zoomed.markers.nose.x,
    zoomed.markers.tail.y - zoomed.markers.nose.y,
  );
  assert.ok(Math.abs(zoomedSeparation / separation - 2) < 1e-12);
});

test("surface picking resolves the foremost triangle and misses empty space", () => {
  const projected = {
    markers: {},
    triangles: [
      {
        points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }],
        surface: "nose",
        depth: 0,
        lightIntensity: 1,
        facingCamera: true,
      },
      {
        points: [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 2, y: 8 }],
        surface: "fin",
        depth: 1,
        lightIntensity: 1,
        facingCamera: true,
      },
    ],
  };
  assert.equal(pickProjectedRocketSurface(projected, { x: 3, y: 3 }), "fin");
  assert.equal(pickProjectedRocketSurface(projected, { x: 20, y: 20 }), null);
  assert.equal(pickProjectedRocketSurface(null, { x: 0, y: 0 }), null);
});

test("invalid mesh and camera inputs fail explicitly", () => {
  assert.throws(() => mesh({ bodyRadiusM: 0 }), /body radius/);
  assert.throws(() => mesh({ finCount: 1 }), /fin count/);
  assert.throws(() => mesh({ finSweepM: 0.1, finTipChordM: 0.1 }), /axial envelope/);
  assert.throws(
    () => projectRocketPreview(mesh(), { yawRad: 0, pitchRad: 0, zoom: 3 }, { width: 900, height: 500 }),
    /zoom/,
  );
  assert.throws(
    () => projectRocketPreview(mesh(), { yawRad: 0, pitchRad: 0, zoom: 1 }, { width: 20, height: 20, padding: 10 }),
    /padding/,
  );
  assert.throws(() => mesh({ stageInstances: [] }), /cannot be empty/);
  assert.throws(
    () => mesh({ stageInstances: [{ id: "invalid", translationXM: 0, lengthScale: 0 }] }),
    /length scale/,
  );
  assert.throws(
    () => mesh({ stageInstances: [{ id: "duplicate", translationXM: 0 }, { id: "duplicate", translationXM: 1 }] }),
    /unique/,
  );
});
