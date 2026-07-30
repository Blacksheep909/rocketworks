export type ThrustPoint = {
  timeS: number;
  thrustN: number;
};

export type WindLayer = {
  altitudeM: number;
  eastMps: number;
  northMps: number;
  upMps?: number;
};

export type WindVector = {
  eastMps: number;
  northMps: number;
  upMps: number;
  horizontalSpeedMps: number;
};

function assertStrictlyIncreasing(values: number[], label: string) {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] <= values[index - 1]) {
      throw new Error(`${label} values must be strictly increasing.`);
    }
  }
}

export function validateThrustCurve(points: ThrustPoint[]): void {
  if (points.length < 2) {
    throw new Error("A thrust curve requires at least two points.");
  }
  for (const point of points) {
    if (
      !Number.isFinite(point.timeS) ||
      !Number.isFinite(point.thrustN) ||
      point.timeS < 0 ||
      point.thrustN < 0
    ) {
      throw new Error("Thrust-curve values must be finite and non-negative.");
    }
  }
  assertStrictlyIncreasing(
    points.map((point) => point.timeS),
    "Thrust-curve time",
  );
}

export function validateWindProfile(layers: WindLayer[]): void {
  if (layers.length === 0) return;
  for (const layer of layers) {
    if (
      !Number.isFinite(layer.altitudeM) ||
      !Number.isFinite(layer.eastMps) ||
      !Number.isFinite(layer.northMps) ||
      !Number.isFinite(layer.upMps ?? 0)
    ) {
      throw new Error("Wind-profile values must be finite.");
    }
  }
  assertStrictlyIncreasing(
    layers.map((layer) => layer.altitudeM),
    "Wind-profile altitude",
  );
}

function linearInterpolate(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x: number,
): number {
  if (x1 === x0) return y0;
  const fraction = (x - x0) / (x1 - x0);
  return y0 + fraction * (y1 - y0);
}

export function thrustAt(points: ThrustPoint[], timeS: number): number {
  if (timeS < points[0].timeS || timeS > points.at(-1)!.timeS) return 0;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    if (timeS <= right.timeS) {
      return linearInterpolate(
        left.timeS,
        left.thrustN,
        right.timeS,
        right.thrustN,
        timeS,
      );
    }
  }
  return 0;
}

export function impulseThrough(
  points: ThrustPoint[],
  requestedTimeS: number,
): number {
  const timeS = Math.max(0, requestedTimeS);
  let impulseNs = 0;

  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    if (timeS <= left.timeS) break;
    const segmentEnd = Math.min(timeS, right.timeS);
    const endThrust = thrustAt(points, segmentEnd);
    impulseNs +=
      0.5 * (left.thrustN + endThrust) * (segmentEnd - left.timeS);
    if (timeS <= right.timeS) break;
  }
  return impulseNs;
}

export function totalImpulse(points: ThrustPoint[]): number {
  validateThrustCurve(points);
  return impulseThrough(points, points.at(-1)!.timeS);
}

export function propellantFractionConsumed(
  points: ThrustPoint[],
  timeS: number,
): number {
  const total = totalImpulse(points);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, impulseThrough(points, timeS) / total));
}

export function interpolateWind(
  layers: WindLayer[],
  altitudeM: number,
): WindVector {
  if (layers.length === 0) {
    return { eastMps: 0, northMps: 0, upMps: 0, horizontalSpeedMps: 0 };
  }

  let left = layers[0];
  let right = layers[0];
  if (altitudeM <= layers[0].altitudeM) {
    left = right = layers[0];
  } else if (altitudeM >= layers.at(-1)!.altitudeM) {
    left = right = layers.at(-1)!;
  } else {
    for (let index = 1; index < layers.length; index += 1) {
      if (altitudeM <= layers[index].altitudeM) {
        left = layers[index - 1];
        right = layers[index];
        break;
      }
    }
  }

  const interpolate = (leftValue: number, rightValue: number) =>
    linearInterpolate(
      left.altitudeM,
      leftValue,
      right.altitudeM,
      rightValue,
      altitudeM,
    );
  const eastMps = interpolate(left.eastMps, right.eastMps);
  const northMps = interpolate(left.northMps, right.northMps);
  const upMps = interpolate(left.upMps ?? 0, right.upMps ?? 0);

  return {
    eastMps,
    northMps,
    upMps,
    horizontalSpeedMps: Math.hypot(eastMps, northMps),
  };
}

export function makeConstantThrustCurve(
  thrustN: number,
  burnTimeS: number,
): ThrustPoint[] {
  if (thrustN <= 0 || burnTimeS <= 0) {
    throw new Error("Constant thrust and burn time must be positive.");
  }
  return [
    { timeS: 0, thrustN },
    { timeS: burnTimeS, thrustN },
    { timeS: burnTimeS + 0.000001, thrustN: 0 },
  ];
}

