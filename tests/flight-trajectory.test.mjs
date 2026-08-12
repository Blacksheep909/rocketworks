import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceFlightTrajectoryReplay,
  FLIGHT_TRAJECTORY_VIEW_MODEL_VERSION,
  nearestFlightTrajectorySampleIndex,
  projectFlightTrajectory,
} from "../lib/visualization/flight-trajectory.ts";

const camera = { yawRad: 0.4, pitchRad: -0.3, zoom: 1 };
const viewport = { width: 640, height: 320, padding: 28 };

function series() {
  return [{
    id: "retained",
    label: "Retained vehicle",
    trace: [
      { timeS: 0, positionWorldM: { x: 0, y: 0, z: 0 } },
      { timeS: 1, positionWorldM: { x: 5, y: 2, z: 18 } },
      { timeS: 2, positionWorldM: { x: 9, y: 5, z: 31 } },
    ],
  }];
}

test("flight trajectory projection is deterministic and keeps release markers attached", () => {
  const first = projectFlightTrajectory(
    series(),
    [{ id: "rail-exit", label: "Rail exit", timeS: 1, kind: "rail" }],
    camera,
    viewport,
  );
  const replay = projectFlightTrajectory(
    series(),
    [{ id: "rail-exit", label: "Rail exit", timeS: 1, kind: "rail" }],
    camera,
    viewport,
  );
  assert.deepEqual(first, replay);
  assert.equal(first.modelVersion, FLIGHT_TRAJECTORY_VIEW_MODEL_VERSION);
  assert.equal(first.validationStatus, "display-projection-only");
  assert.equal(first.series[0].points.length, 3);
  assert.equal(first.events[0].point.timeS, 1);
  assert.ok(first.series[0].points.every((point) => [point.x, point.y, point.depth].every(Number.isFinite)));
});

test("orbit changes the display projection without changing input traces", () => {
  const input = series();
  const first = projectFlightTrajectory(input, [], camera, viewport);
  const rotated = projectFlightTrajectory(input, [], { ...camera, yawRad: camera.yawRad + Math.PI / 2 }, viewport);
  assert.notDeepEqual(first.series[0].points, rotated.series[0].points);
  assert.equal(input[0].trace[1].positionWorldM.x, 5);
  assert.equal(input[0].trace[1].positionWorldM.y, 2);
});

test("nearest sample selection is stable and malformed projections fail explicitly", () => {
  assert.equal(nearestFlightTrajectorySampleIndex(series()[0].trace, 1.6), 2);
  assert.equal(nearestFlightTrajectorySampleIndex([], 1), null);
  assert.throws(
    () => projectFlightTrajectory(
      [{ id: "bad", label: "Bad", trace: [{ timeS: 1, positionWorldM: { x: 0, y: 0, z: 0 } }, { timeS: 0, positionWorldM: { x: 0, y: 0, z: 0 } }] }],
      [],
      camera,
      viewport,
    ),
    /ordered/,
  );
  assert.throws(
    () => projectFlightTrajectory(series(), [], { ...camera, zoom: 0 }, viewport),
    /zoom/,
  );
});

test("replay advancement is rate-scaled, bounded, and pure", () => {
  assert.deepEqual(
    advanceFlightTrajectoryReplay(2, 0.25, 2, 0, 10),
    { timeS: 2.5, completed: false },
  );
  assert.deepEqual(
    advanceFlightTrajectoryReplay(9, 1, 4, 0, 10),
    { timeS: 10, completed: true },
  );
  assert.deepEqual(
    advanceFlightTrajectoryReplay(-5, 0, 1, 0, 10),
    { timeS: 0, completed: false },
  );
  assert.throws(
    () => advanceFlightTrajectoryReplay(1, 0.1, 0, 0, 10),
    /rate must be positive/,
  );
  assert.throws(
    () => advanceFlightTrajectoryReplay(1, 0.1, 1, 5, 2),
    /bounds are invalid/,
  );
});

test("empty paths remain displayable while unplaced events stay explicit", () => {
  const result = projectFlightTrajectory(
    [{ id: "empty", label: "No path", trace: [] }],
    [{ id: "unreached", label: "Unreached", timeS: 3, kind: "state" }],
    camera,
    viewport,
  );
  assert.equal(result.series[0].points.length, 0);
  assert.equal(result.events[0].point, null);
});
