import {
  IDENTITY_MATRIX,
  ZERO_MATRIX,
  rotationAboutX,
  type Matrix3,
  type Vector3,
} from "./linear-algebra.ts";
import {
  combineMassProperties,
  transformMassProperties,
  type MassProperties,
} from "./mass-properties.ts";

type ComponentBase = Readonly<{
  id: string;
  name: string;
  stageId: string;
  enabled?: boolean;
}>;

export type AxisymmetricComponent = ComponentBase &
  Readonly<{
    kind: "axisymmetric";
    densityKgM3: number;
    stations: readonly Readonly<{ xM: number; outerRadiusM: number }>[];
    wallThicknessM?: number;
    positionM?: Vector3;
    rotation?: Matrix3;
  }>;

export type FinSetComponent = ComponentBase &
  Readonly<{
    kind: "finSet";
    count: number;
    axialPositionM: number;
    bodyRadiusM: number;
    rootChordM: number;
    tipChordM: number;
    sweepM: number;
    spanM: number;
    thicknessM: number;
    densityKgM3: number;
    angularOffsetRad?: number;
  }>;

export type PointMassComponent = ComponentBase &
  Readonly<{
    kind: "pointMass";
    massKg: number;
    positionM: Vector3;
    inertiaAtCenterKgM2?: Matrix3;
  }>;

export type VehicleComponent =
  | AxisymmetricComponent
  | FinSetComponent
  | PointMassComponent;

export type VehicleMassProperties = MassProperties &
  Readonly<{
    componentCount: number;
    activeStageIds: readonly string[];
  }>;

const GAUSS_NODES = [
  -0.9602898564975363,
  -0.7966664774136267,
  -0.525532409916329,
  -0.1834346424956498,
  0.1834346424956498,
  0.525532409916329,
  0.7966664774136267,
  0.9602898564975363,
] as const;

const GAUSS_WEIGHTS = [
  0.1012285362903763,
  0.2223810344533745,
  0.3137066458778873,
  0.362683783378362,
  0.362683783378362,
  0.3137066458778873,
  0.2223810344533745,
  0.1012285362903763,
] as const;

function validatePositive(label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function integrateProfile(
  component: AxisymmetricComponent,
  integrand: (xM: number, outerRadiusM: number, innerRadiusM: number) => number,
): number {
  let total = 0;
  for (let segmentIndex = 0; segmentIndex < component.stations.length - 1; segmentIndex += 1) {
    const start = component.stations[segmentIndex];
    const end = component.stations[segmentIndex + 1];
    const halfWidth = (end.xM - start.xM) / 2;
    const midpoint = (end.xM + start.xM) / 2;
    for (let index = 0; index < GAUSS_NODES.length; index += 1) {
      const xM = midpoint + halfWidth * GAUSS_NODES[index];
      const fraction = (xM - start.xM) / (end.xM - start.xM);
      const outerRadiusM =
        start.outerRadiusM +
        fraction * (end.outerRadiusM - start.outerRadiusM);
      const innerRadiusM =
        component.wallThicknessM === undefined
          ? 0
          : Math.max(0, outerRadiusM - component.wallThicknessM);
      total +=
        halfWidth *
        GAUSS_WEIGHTS[index] *
        integrand(xM, outerRadiusM, innerRadiusM);
    }
  }
  return total;
}

export function axisymmetricMassProperties(
  component: AxisymmetricComponent,
): MassProperties {
  validatePositive("density", component.densityKgM3);
  if (component.stations.length < 2) {
    throw new Error("axisymmetric components require at least two stations");
  }
  for (let index = 0; index < component.stations.length; index += 1) {
    const station = component.stations[index];
    if (!Number.isFinite(station.xM) || station.outerRadiusM < 0) {
      throw new Error("profile stations must contain finite positions and non-negative radii");
    }
    if (index > 0 && station.xM <= component.stations[index - 1].xM) {
      throw new Error("profile station positions must increase strictly");
    }
  }
  if (
    component.wallThicknessM !== undefined &&
    (!Number.isFinite(component.wallThicknessM) || component.wallThicknessM <= 0)
  ) {
    throw new Error("wall thickness must be a positive finite number");
  }

  const density = component.densityKgM3;
  const lineMass = (_xM: number, outerRadiusM: number, innerRadiusM: number) =>
    density * Math.PI * (outerRadiusM ** 2 - innerRadiusM ** 2);
  const massKg = integrateProfile(component, lineMass);
  validatePositive("integrated component mass", massKg);
  const centerX =
    integrateProfile(
      component,
      (xM, outerRadiusM, innerRadiusM) =>
        xM * lineMass(xM, outerRadiusM, innerRadiusM),
    ) / massKg;

  const axialInertia = integrateProfile(
    component,
    (xM, outerRadiusM, innerRadiusM) => {
      const differentialMass = lineMass(xM, outerRadiusM, innerRadiusM);
      return 0.5 * differentialMass * (outerRadiusM ** 2 + innerRadiusM ** 2);
    },
  );
  const transverseInertia = integrateProfile(
    component,
    (xM, outerRadiusM, innerRadiusM) => {
      const differentialMass = lineMass(xM, outerRadiusM, innerRadiusM);
      return (
        differentialMass *
        (0.25 * (outerRadiusM ** 2 + innerRadiusM ** 2) +
          (xM - centerX) ** 2)
      );
    },
  );

  return transformMassProperties(
    {
      massKg,
      centerOfMassM: { x: centerX, y: 0, z: 0 },
      inertiaAtCenterKgM2: [
        [axialInertia, 0, 0],
        [0, transverseInertia, 0],
        [0, 0, transverseInertia],
      ],
    },
    {
      rotation: component.rotation ?? IDENTITY_MATRIX,
      translationM: component.positionM,
    },
  );
}

type PolygonProperties = Readonly<{
  areaM2: number;
  centroidXM: number;
  centroidYM: number;
  centralX2M4: number;
  centralY2M4: number;
  centralXYM4: number;
}>;

function polygonProperties(
  vertices: readonly Readonly<{ x: number; y: number }>[],
): PolygonProperties {
  let twiceArea = 0;
  let centroidXNumerator = 0;
  let centroidYNumerator = 0;
  let rawX2 = 0;
  let rawY2 = 0;
  let rawXY = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const cross = current.x * next.y - next.x * current.y;
    twiceArea += cross;
    centroidXNumerator += (current.x + next.x) * cross;
    centroidYNumerator += (current.y + next.y) * cross;
    rawX2 +=
      (current.x ** 2 + current.x * next.x + next.x ** 2) * cross;
    rawY2 +=
      (current.y ** 2 + current.y * next.y + next.y ** 2) * cross;
    rawXY +=
      (2 * current.x * current.y +
        current.x * next.y +
        next.x * current.y +
        2 * next.x * next.y) *
      cross;
  }
  const areaM2 = twiceArea / 2;
  if (!(areaM2 > 0)) throw new Error("fin polygon must have positive area");
  const centroidXM = centroidXNumerator / (6 * areaM2);
  const centroidYM = centroidYNumerator / (6 * areaM2);
  return {
    areaM2,
    centroidXM,
    centroidYM,
    centralX2M4: rawX2 / 12 - areaM2 * centroidXM ** 2,
    centralY2M4: rawY2 / 12 - areaM2 * centroidYM ** 2,
    centralXYM4: rawXY / 24 - areaM2 * centroidXM * centroidYM,
  };
}

export function finSetMassProperties(component: FinSetComponent): MassProperties {
  validatePositive("fin count", component.count);
  if (!Number.isInteger(component.count)) throw new Error("fin count must be an integer");
  validatePositive("root chord", component.rootChordM);
  validatePositive("tip chord", component.tipChordM);
  validatePositive("span", component.spanM);
  validatePositive("thickness", component.thicknessM);
  validatePositive("density", component.densityKgM3);
  if (component.bodyRadiusM < 0) throw new Error("body radius cannot be negative");

  const polygon = polygonProperties([
    { x: 0, y: 0 },
    { x: component.rootChordM, y: 0 },
    { x: component.sweepM + component.tipChordM, y: component.spanM },
    { x: component.sweepM, y: component.spanM },
  ]);
  const massKg = component.densityKgM3 * polygon.areaM2 * component.thicknessM;
  const densityTimesThickness = component.densityKgM3 * component.thicknessM;
  const oneFin: MassProperties = {
    massKg,
    centerOfMassM: {
      x: component.axialPositionM + polygon.centroidXM,
      y: component.bodyRadiusM + polygon.centroidYM,
      z: 0,
    },
    inertiaAtCenterKgM2: [
      [
        densityTimesThickness * polygon.centralY2M4 +
          (massKg * component.thicknessM ** 2) / 12,
        -densityTimesThickness * polygon.centralXYM4,
        0,
      ],
      [
        -densityTimesThickness * polygon.centralXYM4,
        densityTimesThickness * polygon.centralX2M4 +
          (massKg * component.thicknessM ** 2) / 12,
        0,
      ],
      [
        0,
        0,
        densityTimesThickness *
          (polygon.centralX2M4 + polygon.centralY2M4),
      ],
    ],
  };
  const angularOffset = component.angularOffsetRad ?? 0;
  return combineMassProperties(
    Array.from({ length: component.count }, (_, index) =>
      transformMassProperties(oneFin, {
        rotation: rotationAboutX(
          angularOffset + (index * 2 * Math.PI) / component.count,
        ),
      }),
    ),
  );
}

export function componentMassProperties(component: VehicleComponent): MassProperties {
  if (component.kind === "axisymmetric") {
    return axisymmetricMassProperties(component);
  }
  if (component.kind === "finSet") return finSetMassProperties(component);
  validatePositive("point mass", component.massKg);
  return {
    massKg: component.massKg,
    centerOfMassM: component.positionM,
    inertiaAtCenterKgM2: component.inertiaAtCenterKgM2 ?? ZERO_MATRIX,
  };
}

export function computeVehicleMassProperties(
  components: readonly VehicleComponent[],
  options: Readonly<{ activeStageIds?: readonly string[] }> = {},
): VehicleMassProperties {
  const activeStages = options.activeStageIds
    ? new Set(options.activeStageIds)
    : undefined;
  const activeComponents = components.filter(
    (component) =>
      component.enabled !== false &&
      (!activeStages || activeStages.has(component.stageId)),
  );
  const combined = combineMassProperties(
    activeComponents.map(componentMassProperties),
  );
  return {
    ...combined,
    componentCount: activeComponents.length,
    activeStageIds: [...new Set(activeComponents.map((component) => component.stageId))],
  };
}
