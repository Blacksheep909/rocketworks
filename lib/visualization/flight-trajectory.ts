import type { Vector3 } from "../physics/linear-algebra.ts";
import {
  normalizeQuaternion,
  rotateBodyToWorld,
  type Quaternion,
} from "../physics/six-dof.ts";

/**
 * Original, display-only projection helpers for world-frame flight paths.
 * The projection is intentionally independent from the engineering solvers:
 * it consumes already-produced traces and never changes a simulation state.
 */
export const FLIGHT_TRAJECTORY_VIEW_MODEL_VERSION =
  "rocketworks-flight-trajectory-view-0.2.0";

export type FlightTrajectorySample = Readonly<{
  timeS: number;
  positionWorldM: Vector3;
  /** Optional rigid-body attitude; point-mass traces intentionally omit it. */
  orientationBodyToWorld?: Quaternion;
  /** Optional body-frame angular rate retained for display telemetry. */
  angularVelocityBodyRadS?: Vector3;
}>;

export type FlightTrajectorySeries = Readonly<{
  id: string;
  label: string;
  trace: readonly FlightTrajectorySample[];
  color?: string;
}>;

export type FlightTrajectoryEvent = Readonly<{
  id: string;
  label: string;
  timeS: number;
  kind?: string;
}>;

export type FlightTrajectoryCamera = Readonly<{
  yawRad: number;
  pitchRad: number;
  zoom: number;
}>;

export type FlightTrajectoryViewport = Readonly<{
  width: number;
  height: number;
  padding?: number;
}>;

export type ProjectedFlightTrajectoryPoint = Readonly<{
  seriesId: string;
  timeS: number;
  x: number;
  y: number;
  depth: number;
  attitude?: Readonly<{
    /** Unit nose direction in screen coordinates; body nose is body -X. */
    noseDirectionScreen: Readonly<{ x: number; y: number }>;
    angularRateMagnitudeRadS: number | null;
  }>;
}>;

export type ProjectedFlightTrajectorySeries = Readonly<{
  id: string;
  label: string;
  color?: string;
  points: readonly ProjectedFlightTrajectoryPoint[];
}>;

export type ProjectedFlightTrajectoryEvent = Readonly<{
  id: string;
  label: string;
  timeS: number;
  kind?: string;
  point: ProjectedFlightTrajectoryPoint | null;
}>;

export type FlightTrajectoryProjection = Readonly<{
  modelVersion: typeof FLIGHT_TRAJECTORY_VIEW_MODEL_VERSION;
  validationStatus: "display-projection-only";
  series: readonly ProjectedFlightTrajectorySeries[];
  events: readonly ProjectedFlightTrajectoryEvent[];
  bounds: Readonly<{
    minimumLateral: number;
    maximumLateral: number;
    minimumVertical: number;
    maximumVertical: number;
    scale: number;
    centerLateral: number;
    centerVertical: number;
  }>;
}>;

export type FlightTrajectoryReplayStep = Readonly<{
  timeS: number;
  completed: boolean;
}>;

type RotatedPoint = Readonly<{
  lateral: number;
  vertical: number;
  depth: number;
}>;

function finiteVector(value: Vector3): boolean {
  return [value.x, value.y, value.z].every(Number.isFinite);
}

function rotatePosition(position: Vector3, camera: FlightTrajectoryCamera): RotatedPoint {
  const sinYaw = Math.sin(camera.yawRad);
  const cosYaw = Math.cos(camera.yawRad);
  const sinPitch = Math.sin(camera.pitchRad);
  const cosPitch = Math.cos(camera.pitchRad);
  const lateral = position.x * cosYaw - position.y * sinYaw;
  const alongView = position.x * sinYaw + position.y * cosYaw;
  return {
    lateral,
    vertical: position.z * cosPitch - alongView * sinPitch,
    depth: position.z * sinPitch + alongView * cosPitch,
  };
}

function validateCamera(camera: FlightTrajectoryCamera): void {
  if (![camera.yawRad, camera.pitchRad, camera.zoom].every(Number.isFinite)) {
    throw new Error("flight trajectory camera values must be finite");
  }
  if (camera.pitchRad < -Math.PI / 2 || camera.pitchRad > Math.PI / 2) {
    throw new Error("flight trajectory camera pitch must be from -π/2 through π/2");
  }
  if (camera.zoom <= 0 || camera.zoom > 8) {
    throw new Error("flight trajectory camera zoom must be greater than 0 and no more than 8");
  }
}

function validateViewport(viewport: FlightTrajectoryViewport): number {
  if (!Number.isFinite(viewport.width) || viewport.width <= 0) {
    throw new Error("flight trajectory viewport width must be positive and finite");
  }
  if (!Number.isFinite(viewport.height) || viewport.height <= 0) {
    throw new Error("flight trajectory viewport height must be positive and finite");
  }
  const padding = viewport.padding ?? 28;
  if (!Number.isFinite(padding) || padding < 0 || padding * 2 >= Math.min(viewport.width, viewport.height)) {
    throw new Error("flight trajectory viewport padding is invalid");
  }
  return padding;
}

function validateSeries(series: readonly FlightTrajectorySeries[]): void {
  const ids = new Set<string>();
  for (const entry of series) {
    if (!entry.id.trim() || !entry.label.trim()) {
      throw new Error("flight trajectory series ids and labels cannot be empty");
    }
    if (ids.has(entry.id)) throw new Error(`flight trajectory series ${entry.id} is duplicated`);
    ids.add(entry.id);
    let previousTimeS = -Infinity;
    for (const sample of entry.trace) {
      if (!Number.isFinite(sample.timeS) || sample.timeS < 0 || sample.timeS < previousTimeS) {
        throw new Error(`flight trajectory series ${entry.id} times must be finite, non-negative, and ordered`);
      }
      if (!finiteVector(sample.positionWorldM)) {
        throw new Error(`flight trajectory series ${entry.id} positions must be finite`);
      }
      if (sample.orientationBodyToWorld) {
        normalizeQuaternion(sample.orientationBodyToWorld);
      }
      if (sample.angularVelocityBodyRadS && !finiteVector(sample.angularVelocityBodyRadS)) {
        throw new Error(`flight trajectory series ${entry.id} angular rates must be finite`);
      }
      previousTimeS = sample.timeS;
    }
  }
}

function nearestSample(
  trace: readonly FlightTrajectorySample[],
  timeS: number,
): FlightTrajectorySample | null {
  if (trace.length === 0) return null;
  let best = trace[0]!;
  let bestDistance = Math.abs(best.timeS - timeS);
  for (const sample of trace.slice(1)) {
    const distance = Math.abs(sample.timeS - timeS);
    if (distance < bestDistance) {
      best = sample;
      bestDistance = distance;
    }
  }
  return best;
}

/** Returns the nearest sample index for deterministic scrubber and hit-test behavior. */
export function nearestFlightTrajectorySampleIndex(
  trace: readonly FlightTrajectorySample[],
  timeS: number,
): number | null {
  if (trace.length === 0) return null;
  if (!Number.isFinite(timeS)) throw new Error("flight trajectory sample time must be finite");
  let bestIndex = 0;
  let bestDistance = Math.abs(trace[0]!.timeS - timeS);
  for (let index = 1; index < trace.length; index += 1) {
    const distance = Math.abs(trace[index]!.timeS - timeS);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

/**
 * Advance a display replay playhead without extrapolating beyond the supplied
 * trace interval. This helper is intentionally pure so the UI timing loop can
 * be regression-tested independently from browser animation APIs.
 */
export function advanceFlightTrajectoryReplay(
  currentTimeS: number,
  elapsedS: number,
  playbackRate: number,
  startTimeS: number,
  endTimeS: number,
): FlightTrajectoryReplayStep {
  if (![currentTimeS, elapsedS, playbackRate, startTimeS, endTimeS].every(Number.isFinite)) {
    throw new Error("flight trajectory replay values must be finite");
  }
  if (elapsedS < 0) throw new Error("flight trajectory replay elapsed time must be non-negative");
  if (playbackRate <= 0) throw new Error("flight trajectory replay rate must be positive");
  if (startTimeS < 0 || endTimeS < startTimeS) {
    throw new Error("flight trajectory replay bounds are invalid");
  }
  const boundedCurrentTimeS = Math.max(startTimeS, Math.min(endTimeS, currentTimeS));
  const candidateTimeS = boundedCurrentTimeS + elapsedS * playbackRate;
  return candidateTimeS >= endTimeS
    ? { timeS: endTimeS, completed: true }
    : { timeS: candidateTimeS, completed: false };
}

/**
 * Projects one or more ENU traces into an orthographic, orbitable display plane.
 * `x` is east, `y` is north, and `z` is up in the engineering world frame.
 */
export function projectFlightTrajectory(
  series: readonly FlightTrajectorySeries[],
  events: readonly FlightTrajectoryEvent[],
  camera: FlightTrajectoryCamera,
  viewport: FlightTrajectoryViewport,
): FlightTrajectoryProjection {
  validateCamera(camera);
  const padding = validateViewport(viewport);
  validateSeries(series);
  const rotatedSeries = series.map((entry) => ({
    entry,
    points: entry.trace.map((sample) => ({ sample, rotated: rotatePosition(sample.positionWorldM, camera) })),
  }));
  const allRotated = rotatedSeries.flatMap((entry) => entry.points.map((point) => point.rotated));
  const rotatedOrigin = rotatePosition({ x: 0, y: 0, z: 0 }, camera);
  const extents = [rotatedOrigin, ...allRotated];
  const minimumLateral = Math.min(...extents.map((point) => point.lateral));
  const maximumLateral = Math.max(...extents.map((point) => point.lateral));
  const minimumVertical = Math.min(...extents.map((point) => point.vertical));
  const maximumVertical = Math.max(...extents.map((point) => point.vertical));
  const lateralSpan = Math.max(maximumLateral - minimumLateral, 1e-9);
  const verticalSpan = Math.max(maximumVertical - minimumVertical, 1e-9);
  const scale = Math.min(
    (viewport.width - padding * 2) / lateralSpan,
    (viewport.height - padding * 2) / verticalSpan,
  ) * camera.zoom;
  const centerLateral = (minimumLateral + maximumLateral) / 2;
  const centerVertical = (minimumVertical + maximumVertical) / 2;
  const project = (
    rotated: RotatedPoint,
    seriesId: string,
    timeS: number,
    sample: FlightTrajectorySample,
  ): ProjectedFlightTrajectoryPoint => {
    const point = {
      seriesId,
      timeS,
      x: viewport.width / 2 + (rotated.lateral - centerLateral) * scale,
      y: viewport.height / 2 - (rotated.vertical - centerVertical) * scale,
      depth: rotated.depth,
    };
    if (!sample.orientationBodyToWorld) return point;
    const noseWorld = rotateBodyToWorld(sample.orientationBodyToWorld, { x: -1, y: 0, z: 0 });
    const noseScreen = rotatePosition(noseWorld, camera);
    const screenMagnitude = Math.hypot(noseScreen.lateral, noseScreen.vertical);
    return {
      ...point,
      ...(screenMagnitude > 1e-12
        ? {
            attitude: {
              noseDirectionScreen: {
                x: noseScreen.lateral / screenMagnitude,
                y: -noseScreen.vertical / screenMagnitude,
              },
              angularRateMagnitudeRadS: sample.angularVelocityBodyRadS
                ? Math.hypot(
                    sample.angularVelocityBodyRadS.x,
                    sample.angularVelocityBodyRadS.y,
                    sample.angularVelocityBodyRadS.z,
                  )
                : null,
            },
          }
        : {}),
    };
  };
  const projectedSeries = rotatedSeries.map(({ entry, points }) => ({
    id: entry.id,
    label: entry.label,
    ...(entry.color ? { color: entry.color } : {}),
    points: points.map(({ sample, rotated }) => project(rotated, entry.id, sample.timeS, sample)),
  }));
  const primaryTrace = series[0]?.trace ?? [];
  const projectedEvents = events.map((event) => {
    if (!Number.isFinite(event.timeS) || event.timeS < 0) {
      throw new Error(`flight trajectory event ${event.id} time must be finite and non-negative`);
    }
    const sample = nearestSample(primaryTrace, event.timeS);
    const point = sample
      ? projectedSeries[0]?.points.find((candidate) => candidate.timeS === sample.timeS) ?? null
      : null;
    return {
      id: event.id,
      label: event.label,
      timeS: event.timeS,
      ...(event.kind ? { kind: event.kind } : {}),
      point,
    };
  });
  return {
    modelVersion: FLIGHT_TRAJECTORY_VIEW_MODEL_VERSION,
    validationStatus: "display-projection-only",
    series: projectedSeries,
    events: projectedEvents,
    bounds: {
      minimumLateral,
      maximumLateral,
      minimumVertical,
      maximumVertical,
      scale,
      centerLateral,
      centerVertical,
    },
  };
}
