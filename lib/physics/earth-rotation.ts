import {
  addVectors,
  cross,
  scaleVector,
  ZERO_VECTOR,
  type Vector3,
} from "./linear-algebra.ts";

/** WGS84 conventional mean Earth rotation rate, in radians per second. */
export const EARTH_ROTATION_RATE_RAD_S = 7.29211514670698e-5;
export const EARTH_ROTATION_MODEL_VERSION =
  "rocketworks-earth-rotation-0.1.0";
export const EARTH_ROTATION_MODEL_STATUS =
  "engineering-preview-unvalidated" as const;

/**
 * Optional local-frame rotation correction for the ENU flight equations.
 *
 * The default keeps historical RocketWorks traces unchanged.  The optional
 * centrifugal term is expressed as a local displacement gradient, because
 * the baseline scalar gravity model already represents an effective launch
 * site gravity rather than a raw geocentric gravitational acceleration.
 */
export type EarthRotationOptions = Readonly<{
  enabled?: boolean;
  includeCentrifugalGradient?: boolean;
}>;

export type EarthRotationEvaluation = Readonly<{
  modelVersion: typeof EARTH_ROTATION_MODEL_VERSION;
  validationStatus: typeof EARTH_ROTATION_MODEL_STATUS;
  enabled: boolean;
  includeCentrifugalGradient: boolean;
  angularVelocityWorldRadS: Vector3;
  coriolisAccelerationWorldMps2: Vector3;
  centrifugalGradientAccelerationWorldMps2: Vector3;
  accelerationWorldMps2: Vector3;
}>;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertVector(value: Vector3, label: string): void {
  assertFinite(value.x, `${label} x`);
  assertFinite(value.y, `${label} y`);
  assertFinite(value.z, `${label} z`);
}

/**
 * Express the Earth rotation vector in the launch site's local ENU frame.
 * East is x, north is y, and up is z; longitude does not enter because the
 * rotation axis is parallel to the ECEF polar axis.
 */
export function earthRotationAngularVelocityWorldRadS(
  latitudeDeg: number,
): Vector3 {
  assertFinite(latitudeDeg, "launch latitude");
  if (latitudeDeg < -90 || latitudeDeg > 90) {
    throw new Error("launch latitude must be from -90 through 90 degrees");
  }
  const latitudeRad = (latitudeDeg * Math.PI) / 180;
  return {
    x: 0,
    y: EARTH_ROTATION_RATE_RAD_S * Math.cos(latitudeRad),
    z: EARTH_ROTATION_RATE_RAD_S * Math.sin(latitudeRad),
  };
}

/**
 * Evaluate the apparent acceleration correction in a local, Earth-fixed ENU
 * frame.  `velocityWorldMps` is the vehicle velocity relative to the launch
 * site, not air-relative velocity; wind is handled by the aerodynamic model.
 */
export function evaluateEarthRotation(input: Readonly<{
  latitudeDeg: number;
  positionWorldM: Vector3;
  velocityWorldMps: Vector3;
  options?: EarthRotationOptions;
}>): EarthRotationEvaluation {
  assertVector(input.positionWorldM, "Earth-rotation position");
  assertVector(input.velocityWorldMps, "Earth-rotation velocity");
  if (
    input.options?.enabled !== undefined &&
    typeof input.options.enabled !== "boolean"
  ) {
    throw new Error("Earth-rotation enabled option must be boolean");
  }
  if (
    input.options?.includeCentrifugalGradient !== undefined &&
    typeof input.options.includeCentrifugalGradient !== "boolean"
  ) {
    throw new Error("Earth-rotation centrifugal-gradient option must be boolean");
  }
  const enabled = input.options?.enabled ?? false;
  const includeCentrifugalGradient =
    enabled && (input.options?.includeCentrifugalGradient ?? false);
  const angularVelocityWorldRadS = earthRotationAngularVelocityWorldRadS(
    input.latitudeDeg,
  );
  if (!enabled) {
    return {
      modelVersion: EARTH_ROTATION_MODEL_VERSION,
      validationStatus: EARTH_ROTATION_MODEL_STATUS,
      enabled: false,
      includeCentrifugalGradient: false,
      angularVelocityWorldRadS,
      coriolisAccelerationWorldMps2: ZERO_VECTOR,
      centrifugalGradientAccelerationWorldMps2: ZERO_VECTOR,
      accelerationWorldMps2: ZERO_VECTOR,
    };
  }
  const coriolisAccelerationWorldMps2 = scaleVector(
    cross(angularVelocityWorldRadS, input.velocityWorldMps),
    -2,
  );
  const centrifugalGradientAccelerationWorldMps2 = includeCentrifugalGradient
    ? scaleVector(
        cross(
          angularVelocityWorldRadS,
          cross(angularVelocityWorldRadS, input.positionWorldM),
        ),
        -1,
      )
    : ZERO_VECTOR;
  return {
    modelVersion: EARTH_ROTATION_MODEL_VERSION,
    validationStatus: EARTH_ROTATION_MODEL_STATUS,
    enabled: true,
    includeCentrifugalGradient,
    angularVelocityWorldRadS,
    coriolisAccelerationWorldMps2,
    centrifugalGradientAccelerationWorldMps2,
    accelerationWorldMps2: addVectors(
      coriolisAccelerationWorldMps2,
      centrifugalGradientAccelerationWorldMps2,
    ),
  };
}
