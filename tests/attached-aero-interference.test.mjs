import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeAttachedAeroInterference,
  createAttachedAeroComponentEnvelope,
  createAttachedAeroInterferenceBody,
} from "../lib/physics/index.ts";

const identityTransform = {
  translationM: { x: 0, y: 0, z: 0 },
  rotation: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
};

function body(id, centerYM, radiusM, attachment = "parallel") {
  return createAttachedAeroInterferenceBody({
    id,
    label: id,
    stageId: id,
    stageRole: id === "core" ? "core" : "booster",
    stageAttachment: attachment,
    stageInstanceIndex: 0,
    centerYM,
    centerZM: 0,
    components: [{
      id: `${id}-body`,
      label: `${id} body`,
      sourceKind: "axisymmetric",
      axialStartM: 0,
      axialEndM: 1,
      centerYM,
      centerZM: 0,
      outerRadiusM: radiusM,
    }],
  });
}

test("attached aero screen distinguishes clear, near, and overlapping bodies", () => {
  const result = analyzeAttachedAeroInterference({
    bodies: [
      body("core", 0, 0.05),
      body("clear-booster", 0.2, 0.05),
      body("near-booster", 0.105, 0.05),
      body("overlap-booster", 0.08, 0.05),
    ],
    options: { nearClearanceM: 0.01 },
  });

  assert.equal(result.overallStatus, "review");
  assert.equal(result.bodyCount, 4);
  assert.equal(result.pairCount, 6);
  assert.equal(result.overlapPairCount, 3);
  assert.equal(result.nearPairCount, 1);
  assert.equal(result.clearPairCount, 2);
  assert.ok((result.maximumPenetrationM ?? 0) > 0);
  assert.match(result.warnings.join(" "), /overlapping conservative radial envelopes/);
});

test("co-linear serial stages are treated as an interface rather than interference", () => {
  const result = analyzeAttachedAeroInterference({
    bodies: [
      body("core", 0, 0.05, "serial"),
      body("upper", 0, 0.04, "serial"),
    ],
  });

  assert.equal(result.overallStatus, "screened");
  assert.equal(result.pairCount, 0);
  assert.match(result.warnings.at(-1), /coaxial relationship/);
});

test("missing surface geometry remains visible as a watch item", () => {
  const missing = createAttachedAeroInterferenceBody({
    id: "equipment-only",
    label: "Equipment only",
    stageId: "equipment-only",
    stageAttachment: "parallel",
    stageInstanceIndex: 0,
    centerYM: 0,
    centerZM: 0,
    components: [],
  });
  const result = analyzeAttachedAeroInterference({ bodies: [missing, body("core", 0.2, 0.05)] });

  assert.equal(result.overallStatus, "watch");
  assert.equal(result.unavailableBodyCount, 1);
  assert.equal(result.assessedBodyCount, 1);
  assert.match(result.warnings.join(" "), /missing aerodynamic surface geometry/);
});

test("component envelope conversion accounts for body placement and fin span", () => {
  const bodyEnvelope = createAttachedAeroComponentEnvelope({
    id: "body",
    name: "Body",
    stageId: "core",
    kind: "axisymmetric",
    densityKgM3: 1000,
    stations: [
      { xM: 0, outerRadiusM: 0.05 },
      { xM: 1, outerRadiusM: 0.04 },
    ],
    positionM: { x: 0.2, y: 0.1, z: 0 },
  }, {
    translationM: { x: 0.4, y: 0.2, z: 0 },
    rotation: identityTransform.rotation,
  });
  assert.ok(bodyEnvelope);
  assert.ok(Math.abs(bodyEnvelope.axialStartM - 0.6) < 1e-12);
  assert.ok(Math.abs(bodyEnvelope.axialEndM - 1.6) < 1e-12);
  assert.ok(Math.abs(bodyEnvelope.centerYM - 0.3) < 1e-12);

  const finEnvelope = createAttachedAeroComponentEnvelope({
    id: "fins",
    name: "Fins",
    stageId: "core",
    kind: "finSet",
    count: 4,
    axialPositionM: 0.7,
    bodyRadiusM: 0.05,
    rootChordM: 0.2,
    tipChordM: 0.08,
    sweepM: 0.05,
    spanM: 0.1,
    thicknessM: 0.002,
    densityKgM3: 1200,
  }, identityTransform);
  assert.ok(finEnvelope);
  assert.ok(Math.abs(finEnvelope.axialStartM - 0.7) < 1e-12);
  assert.ok(Math.abs(finEnvelope.axialEndM - 0.9) < 1e-12);
  assert.ok(Math.abs(finEnvelope.outerRadiusM - 0.15) < 1e-12);
});

test("attached aero screen rejects invalid geometry and options", () => {
  assert.throws(
    () => analyzeAttachedAeroInterference({ bodies: [body("bad", 0, -0.1)] }),
    /outer radius must be positive/,
  );
  assert.throws(
    () => analyzeAttachedAeroInterference({ bodies: [], options: { nearClearanceM: 2 } }),
    /near clearance must be between 0 and 1/,
  );
});
