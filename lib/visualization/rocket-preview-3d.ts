export const ROCKET_PREVIEW_3D_MODEL_VERSION =
  "kestrel-rocket-preview-3d-0.3.0";
export const ROCKET_PREVIEW_3D_MODEL_STATUS = "display-only-unvalidated";

export type PreviewVector3 = Readonly<{ x: number; y: number; z: number }>;
export type RocketPreviewSurface = "nose" | "skin" | "accent" | "fin" | "rear" | "nozzle";
export type RocketPreviewNoseProfile = "ogive" | "conical" | "elliptical";

export type RocketPreviewStageInstance = Readonly<{
  id: string;
  translationXM: number;
  radialOffsetM?: Readonly<{ y: number; z: number }>;
  rotationRad?: number;
  lengthScale?: number;
  radiusScale?: number;
  includeNose?: boolean;
  includeFins?: boolean;
  includeNozzle?: boolean;
}>;

export type RocketPreviewMeshInput = Readonly<{
  noseLengthM: number;
  noseProfile?: RocketPreviewNoseProfile;
  bodyLengthM: number;
  bodyRadiusM: number;
  finCount: number;
  finRootChordM: number;
  finTipChordM: number;
  finSweepM: number;
  finSpanM: number;
  finThicknessM: number;
  radialSegments?: number;
  stageInstances?: readonly RocketPreviewStageInstance[];
}>;

export type RocketPreviewTriangle = Readonly<{
  a: PreviewVector3;
  b: PreviewVector3;
  c: PreviewVector3;
  surface: RocketPreviewSurface;
}>;

export type RocketPreviewMesh = Readonly<{
  modelVersion: string;
  validationStatus: typeof ROCKET_PREVIEW_3D_MODEL_STATUS;
  triangles: readonly RocketPreviewTriangle[];
  longitudinalLengthM: number;
  maximumRadiusM: number;
  bounds: Readonly<{ minimum: PreviewVector3; maximum: PreviewVector3 }>;
}>;

export type RocketPreviewCamera = Readonly<{
  yawRad: number;
  pitchRad: number;
  zoom: number;
}>;

export type ProjectedRocketTriangle = Readonly<{
  points: readonly [Readonly<{ x: number; y: number }>, Readonly<{ x: number; y: number }>, Readonly<{ x: number; y: number }>];
  surface: RocketPreviewSurface;
  depth: number;
  lightIntensity: number;
  facingCamera: boolean;
}>;

export type RocketPreviewMarker = Readonly<{
  id: string;
  position: PreviewVector3;
}>;

export type ProjectedRocketPreview = Readonly<{
  triangles: readonly ProjectedRocketTriangle[];
  markers: Readonly<Record<string, Readonly<{ x: number; y: number; depth: number }>>>;
}>;

export function pickProjectedRocketSurface(
  projected: ProjectedRocketPreview | null,
  point: Readonly<{ x: number; y: number }>,
): RocketPreviewSurface | null {
  if (!projected) return null;
  for (let index = projected.triangles.length - 1; index >= 0; index -= 1) {
    const triangle = projected.triangles[index];
    const [first, second, third] = triangle.points;
    const denominator =
      (second.y - third.y) * (first.x - third.x) +
      (third.x - second.x) * (first.y - third.y);
    if (Math.abs(denominator) <= 1e-12) continue;
    const firstWeight =
      ((second.y - third.y) * (point.x - third.x) +
        (third.x - second.x) * (point.y - third.y)) /
      denominator;
    const secondWeight =
      ((third.y - first.y) * (point.x - third.x) +
        (first.x - third.x) * (point.y - third.y)) /
      denominator;
    const thirdWeight = 1 - firstWeight - secondWeight;
    if (firstWeight >= -1e-9 && secondWeight >= -1e-9 && thirdWeight >= -1e-9) {
      return triangle.surface;
    }
  }
  return null;
}

type MutableVector3 = { x: number; y: number; z: number };

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function pointOnRing(x: number, radius: number, angle: number): PreviewVector3 {
  return { x, y: radius * Math.cos(angle), z: radius * Math.sin(angle) };
}

function addQuad(
  triangles: RocketPreviewTriangle[],
  first: PreviewVector3,
  second: PreviewVector3,
  third: PreviewVector3,
  fourth: PreviewVector3,
  surface: RocketPreviewSurface,
): void {
  triangles.push(
    { a: first, b: second, c: third, surface },
    { a: first, b: third, c: fourth, surface },
  );
}

export function tangentOgiveRadiusM(
  axialPositionM: number,
  lengthM: number,
  baseRadiusM: number,
): number {
  assertPositive(lengthM, "ogive length");
  assertPositive(baseRadiusM, "ogive base radius");
  if (!Number.isFinite(axialPositionM) || axialPositionM < 0 || axialPositionM > lengthM) {
    throw new Error("ogive axial position must lie from zero through its length");
  }
  const generatingRadiusM =
    (baseRadiusM ** 2 + lengthM ** 2) / (2 * baseRadiusM);
  return (
    Math.sqrt(
      Math.max(
        0,
        generatingRadiusM ** 2 - (lengthM - axialPositionM) ** 2,
      ),
    ) +
    baseRadiusM -
    generatingRadiusM
  );
}

function createSingleRocketPreviewMesh(input: RocketPreviewMeshInput): RocketPreviewMesh {
  assertPositive(input.noseLengthM, "preview nose length");
  assertPositive(input.bodyLengthM, "preview body length");
  assertPositive(input.bodyRadiusM, "preview body radius");
  assertPositive(input.finRootChordM, "preview fin root chord");
  assertPositive(input.finTipChordM, "preview fin tip chord");
  assertPositive(input.finSpanM, "preview fin span");
  assertPositive(input.finThicknessM, "preview fin thickness");
  if (!Number.isFinite(input.finSweepM) || input.finSweepM < 0) {
    throw new Error("preview fin sweep must be a non-negative finite number");
  }
  if (!Number.isInteger(input.finCount) || input.finCount < 2 || input.finCount > 12) {
    throw new Error("preview fin count must be an integer from 2 through 12");
  }
  const radialSegments = input.radialSegments ?? 28;
  if (!Number.isInteger(radialSegments) || radialSegments < 12 || radialSegments > 96) {
    throw new Error("preview radial segments must be an integer from 12 through 96");
  }
  const totalLengthM = input.noseLengthM + input.bodyLengthM;
  if (input.finRootChordM > input.bodyLengthM) {
    throw new Error("preview fin root chord cannot exceed body length");
  }
  if (input.finSweepM + input.finTipChordM > input.finRootChordM + 1e-12) {
    throw new Error("preview fin tip must remain within the root-chord axial envelope");
  }

  const triangles: RocketPreviewTriangle[] = [];
  const noseAxialSegments = Math.max(8, Math.ceil(radialSegments / 2));
  const noseProfile = input.noseProfile ?? "ogive";
  const noseRadiusAt = (axialPositionM: number): number => {
    if (noseProfile === "conical") {
      return (input.bodyRadiusM * axialPositionM) / input.noseLengthM;
    }
    if (noseProfile === "elliptical") {
      const fraction = axialPositionM / input.noseLengthM;
      return input.bodyRadiusM * Math.sqrt(Math.max(0, 1 - (1 - fraction) ** 2));
    }
    return tangentOgiveRadiusM(
      axialPositionM,
      input.noseLengthM,
      input.bodyRadiusM,
    );
  };
  const tip: PreviewVector3 = { x: 0, y: 0, z: 0 };
  const firstRingX = input.noseLengthM / noseAxialSegments;
  const firstRingRadius = noseRadiusAt(firstRingX);
  for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
    const angle = (2 * Math.PI * radialIndex) / radialSegments;
    const nextAngle = (2 * Math.PI * (radialIndex + 1)) / radialSegments;
    triangles.push({
      a: tip,
      b: pointOnRing(firstRingX, firstRingRadius, nextAngle),
      c: pointOnRing(firstRingX, firstRingRadius, angle),
      surface: "nose",
    });
  }
  for (let axialIndex = 1; axialIndex < noseAxialSegments; axialIndex += 1) {
    const firstX = (input.noseLengthM * axialIndex) / noseAxialSegments;
    const secondX =
      (input.noseLengthM * (axialIndex + 1)) / noseAxialSegments;
    const firstRadius = noseRadiusAt(firstX);
    const secondRadius = noseRadiusAt(secondX);
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const angle = (2 * Math.PI * radialIndex) / radialSegments;
      const nextAngle = (2 * Math.PI * (radialIndex + 1)) / radialSegments;
      addQuad(
        triangles,
        pointOnRing(firstX, firstRadius, angle),
        pointOnRing(secondX, secondRadius, angle),
        pointOnRing(secondX, secondRadius, nextAngle),
        pointOnRing(firstX, firstRadius, nextAngle),
        "nose",
      );
    }
  }

  const bandStartM = input.noseLengthM + Math.min(0.09, input.bodyLengthM * 0.17);
  const bandEndM = Math.min(totalLengthM, bandStartM + Math.min(0.018, input.bodyLengthM * 0.035));
  const bodySections = [
    { start: input.noseLengthM, end: bandStartM, surface: "skin" as const },
    { start: bandStartM, end: bandEndM, surface: "accent" as const },
    { start: bandEndM, end: totalLengthM, surface: "skin" as const },
  ].filter((section) => section.end > section.start + 1e-12);
  for (const section of bodySections) {
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const angle = (2 * Math.PI * radialIndex) / radialSegments;
      const nextAngle = (2 * Math.PI * (radialIndex + 1)) / radialSegments;
      addQuad(
        triangles,
        pointOnRing(section.start, input.bodyRadiusM, angle),
        pointOnRing(section.end, input.bodyRadiusM, angle),
        pointOnRing(section.end, input.bodyRadiusM, nextAngle),
        pointOnRing(section.start, input.bodyRadiusM, nextAngle),
        section.surface,
      );
    }
  }

  const rearCenter: PreviewVector3 = { x: totalLengthM, y: 0, z: 0 };
  for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
    const angle = (2 * Math.PI * radialIndex) / radialSegments;
    const nextAngle = (2 * Math.PI * (radialIndex + 1)) / radialSegments;
    triangles.push({
      a: rearCenter,
      b: pointOnRing(totalLengthM, input.bodyRadiusM, angle),
      c: pointOnRing(totalLengthM, input.bodyRadiusM, nextAngle),
      surface: "rear",
    });
  }

  const finRootStartM = totalLengthM - input.finRootChordM;
  const tangentHalfThicknessM = input.finThicknessM / 2;
  for (let finIndex = 0; finIndex < input.finCount; finIndex += 1) {
    const angle = (2 * Math.PI * finIndex) / input.finCount;
    const radial = { y: Math.cos(angle), z: Math.sin(angle) };
    const tangent = { y: -Math.sin(angle), z: Math.cos(angle) };
    const profile = [
      { x: finRootStartM, radius: input.bodyRadiusM },
      { x: totalLengthM, radius: input.bodyRadiusM },
      {
        x: finRootStartM + input.finSweepM + input.finTipChordM,
        radius: input.bodyRadiusM + input.finSpanM,
      },
      {
        x: finRootStartM + input.finSweepM,
        radius: input.bodyRadiusM + input.finSpanM,
      },
    ];
    const side = (sign: number) =>
      profile.map(
        (point): PreviewVector3 => ({
          x: point.x,
          y: point.radius * radial.y + sign * tangentHalfThicknessM * tangent.y,
          z: point.radius * radial.z + sign * tangentHalfThicknessM * tangent.z,
        }),
      );
    const near = side(-1);
    const far = side(1);
    addQuad(triangles, near[0], near[1], near[2], near[3], "fin");
    addQuad(triangles, far[3], far[2], far[1], far[0], "fin");
    for (let edgeIndex = 0; edgeIndex < 4; edgeIndex += 1) {
      const nextEdge = (edgeIndex + 1) % 4;
      addQuad(
        triangles,
        near[edgeIndex],
        far[edgeIndex],
        far[nextEdge],
        near[nextEdge],
        "fin",
      );
    }
  }

  const nozzleLengthM = Math.min(0.045, input.bodyLengthM * 0.08);
  const nozzleRadiusM = input.bodyRadiusM * 0.36;
  for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
    const angle = (2 * Math.PI * radialIndex) / radialSegments;
    const nextAngle = (2 * Math.PI * (radialIndex + 1)) / radialSegments;
    addQuad(
      triangles,
      pointOnRing(totalLengthM, nozzleRadiusM, angle),
      pointOnRing(totalLengthM + nozzleLengthM, nozzleRadiusM * 0.8, angle),
      pointOnRing(totalLengthM + nozzleLengthM, nozzleRadiusM * 0.8, nextAngle),
      pointOnRing(totalLengthM, nozzleRadiusM, nextAngle),
      "nozzle",
    );
  }

  const vertices = triangles.flatMap((triangle) => [triangle.a, triangle.b, triangle.c]);
  const minimum: MutableVector3 = { x: Infinity, y: Infinity, z: Infinity };
  const maximum: MutableVector3 = { x: -Infinity, y: -Infinity, z: -Infinity };
  vertices.forEach((vertex) => {
    minimum.x = Math.min(minimum.x, vertex.x);
    minimum.y = Math.min(minimum.y, vertex.y);
    minimum.z = Math.min(minimum.z, vertex.z);
    maximum.x = Math.max(maximum.x, vertex.x);
    maximum.y = Math.max(maximum.y, vertex.y);
    maximum.z = Math.max(maximum.z, vertex.z);
  });
  return {
    modelVersion: ROCKET_PREVIEW_3D_MODEL_VERSION,
    validationStatus: ROCKET_PREVIEW_3D_MODEL_STATUS,
    triangles,
    longitudinalLengthM: totalLengthM,
    maximumRadiusM: input.bodyRadiusM + input.finSpanM,
    bounds: { minimum, maximum },
  };
}

function transformedStagePoint(
  point: PreviewVector3,
  stage: RocketPreviewStageInstance,
): PreviewVector3 {
  const rotationRad = stage.rotationRad ?? 0;
  const cosRotation = Math.cos(rotationRad);
  const sinRotation = Math.sin(rotationRad);
  const radialOffset = stage.radialOffsetM ?? { y: 0, z: 0 };
  return {
    x: point.x + stage.translationXM,
    y: point.y * cosRotation - point.z * sinRotation + radialOffset.y,
    z: point.y * sinRotation + point.z * cosRotation + radialOffset.z,
  };
}

function validateStageInstance(
  stage: RocketPreviewStageInstance,
  seenIds: Set<string>,
): void {
  if (typeof stage.id !== "string" || !stage.id.trim()) {
    throw new Error("preview stage instance id cannot be empty");
  }
  if (seenIds.has(stage.id)) {
    throw new Error(`preview stage instance id ${stage.id} must be unique`);
  }
  seenIds.add(stage.id);
  if (!Number.isFinite(stage.translationXM)) {
    throw new Error(`preview stage ${stage.id} translation must be finite`);
  }
  if (stage.rotationRad !== undefined && !Number.isFinite(stage.rotationRad)) {
    throw new Error(`preview stage ${stage.id} rotation must be finite`);
  }
  for (const [label, value] of [
    ["length scale", stage.lengthScale],
    ["radius scale", stage.radiusScale],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      throw new Error(`preview stage ${stage.id} ${label} must be positive and finite`);
    }
  }
  if (stage.radialOffsetM) {
    if (!Number.isFinite(stage.radialOffsetM.y) || !Number.isFinite(stage.radialOffsetM.z)) {
      throw new Error(`preview stage ${stage.id} radial offset must be finite`);
    }
  }
}

export function createRocketPreviewMesh(input: RocketPreviewMeshInput): RocketPreviewMesh {
  const stageInstances = input.stageInstances;
  if (stageInstances === undefined) return createSingleRocketPreviewMesh(input);
  if (stageInstances.length === 0) {
    throw new Error("preview stage instances cannot be empty");
  }

  const seenIds = new Set<string>();
  const triangles: RocketPreviewTriangle[] = [];
  for (const stage of stageInstances) {
    validateStageInstance(stage, seenIds);
    const lengthScale = stage.lengthScale ?? 1;
    const local = createSingleRocketPreviewMesh({
      ...input,
      noseLengthM: input.noseLengthM * lengthScale,
      bodyLengthM: input.bodyLengthM * lengthScale,
      bodyRadiusM: input.bodyRadiusM * (stage.radiusScale ?? lengthScale),
      finRootChordM: input.finRootChordM * lengthScale,
      finTipChordM: input.finTipChordM * lengthScale,
      finSweepM: input.finSweepM * lengthScale,
      finSpanM: input.finSpanM * lengthScale,
      stageInstances: undefined,
    });
    for (const triangle of local.triangles) {
      if (triangle.surface === "nose" && stage.includeNose === false) continue;
      if (triangle.surface === "fin" && stage.includeFins === false) continue;
      if (triangle.surface === "nozzle" && stage.includeNozzle === false) continue;
      triangles.push({
        ...triangle,
        a: transformedStagePoint(triangle.a, stage),
        b: transformedStagePoint(triangle.b, stage),
        c: transformedStagePoint(triangle.c, stage),
      });
    }
  }
  if (triangles.length === 0) {
    throw new Error("preview stage instances produced no display triangles");
  }
  const vertices = triangles.flatMap((triangle) => [triangle.a, triangle.b, triangle.c]);
  const minimum: MutableVector3 = { x: Infinity, y: Infinity, z: Infinity };
  const maximum: MutableVector3 = { x: -Infinity, y: -Infinity, z: -Infinity };
  let maximumRadiusM = 0;
  vertices.forEach((vertex) => {
    minimum.x = Math.min(minimum.x, vertex.x);
    minimum.y = Math.min(minimum.y, vertex.y);
    minimum.z = Math.min(minimum.z, vertex.z);
    maximum.x = Math.max(maximum.x, vertex.x);
    maximum.y = Math.max(maximum.y, vertex.y);
    maximum.z = Math.max(maximum.z, vertex.z);
    maximumRadiusM = Math.max(maximumRadiusM, Math.hypot(vertex.y, vertex.z));
  });
  return {
    modelVersion: ROCKET_PREVIEW_3D_MODEL_VERSION,
    validationStatus: ROCKET_PREVIEW_3D_MODEL_STATUS,
    triangles,
    longitudinalLengthM: maximum.x - minimum.x,
    maximumRadiusM,
    bounds: { minimum, maximum },
  };
}

function rotatePoint(
  point: PreviewVector3,
  centerX: number,
  camera: RocketPreviewCamera,
): MutableVector3 {
  const x = point.x - centerX;
  const cosYaw = Math.cos(camera.yawRad);
  const sinYaw = Math.sin(camera.yawRad);
  const cosPitch = Math.cos(camera.pitchRad);
  const sinPitch = Math.sin(camera.pitchRad);
  const yawX = x * cosYaw - point.y * sinYaw;
  const yawY = x * sinYaw + point.y * cosYaw;
  return {
    x: yawX * cosPitch + point.z * sinPitch,
    y: yawY,
    z: -yawX * sinPitch + point.z * cosPitch,
  };
}

function subtract(left: MutableVector3, right: MutableVector3): MutableVector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function cross(left: MutableVector3, right: MutableVector3): MutableVector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

export function projectRocketPreview(
  mesh: RocketPreviewMesh,
  camera: RocketPreviewCamera,
  viewport: Readonly<{ width: number; height: number; padding?: number }>,
  markers: readonly RocketPreviewMarker[] = [],
): ProjectedRocketPreview {
  assertPositive(viewport.width, "preview viewport width");
  assertPositive(viewport.height, "preview viewport height");
  if (!Number.isFinite(camera.yawRad) || !Number.isFinite(camera.pitchRad)) {
    throw new Error("preview camera angles must be finite");
  }
  if (!Number.isFinite(camera.zoom) || camera.zoom < 0.4 || camera.zoom > 2.5) {
    throw new Error("preview camera zoom must be from 0.4 through 2.5");
  }
  const padding = viewport.padding ?? 28;
  if (!Number.isFinite(padding) || padding < 0 || padding * 2 >= Math.min(viewport.width, viewport.height)) {
    throw new Error("preview viewport padding is invalid");
  }
  const centerX = (mesh.bounds.minimum.x + mesh.bounds.maximum.x) / 2;
  const cameraDistanceM = Math.max(
    mesh.longitudinalLengthM * 3.2,
    mesh.maximumRadiusM * 8,
  );
  const perspective = (point: MutableVector3) => {
    const denominator = cameraDistanceM - point.y;
    if (!(denominator > 0)) throw new Error("preview geometry crossed the camera plane");
    const factor = cameraDistanceM / denominator;
    return { x: point.x * factor, y: -point.z * factor, depth: point.y };
  };
  const rotatedTriangles = mesh.triangles.map((triangle) => {
    const a = rotatePoint(triangle.a, centerX, camera);
    const b = rotatePoint(triangle.b, centerX, camera);
    const c = rotatePoint(triangle.c, centerX, camera);
    return { triangle, rotated: [a, b, c] as const };
  });
  const projectedPhysicalPoints = rotatedTriangles.flatMap(({ rotated }) =>
    rotated.map(perspective),
  );
  const rotatedMarkers = markers.map((marker) => ({
    id: marker.id,
    point: perspective(rotatePoint(marker.position, centerX, camera)),
  }));
  const allPoints = [...projectedPhysicalPoints, ...rotatedMarkers.map((marker) => marker.point)];
  const minimumX = Math.min(...allPoints.map((point) => point.x));
  const maximumX = Math.max(...allPoints.map((point) => point.x));
  const minimumY = Math.min(...allPoints.map((point) => point.y));
  const maximumY = Math.max(...allPoints.map((point) => point.y));
  const spanX = Math.max(maximumX - minimumX, 1e-12);
  const spanY = Math.max(maximumY - minimumY, 1e-12);
  const scale =
    Math.min(
      (viewport.width - 2 * padding) / spanX,
      (viewport.height - 2 * padding) / spanY,
    ) * camera.zoom;
  const physicalCenterX = (minimumX + maximumX) / 2;
  const physicalCenterY = (minimumY + maximumY) / 2;
  const screen = (point: Readonly<{ x: number; y: number }>) => ({
    x: viewport.width / 2 + (point.x - physicalCenterX) * scale,
    y: viewport.height / 2 + (point.y - physicalCenterY) * scale,
  });
  const light = { x: -0.35, y: 0.75, z: 0.55 };
  const lightMagnitude = Math.hypot(light.x, light.y, light.z);
  const triangles = rotatedTriangles
    .map(({ triangle, rotated }): ProjectedRocketTriangle => {
      const firstEdge = subtract(rotated[1], rotated[0]);
      const secondEdge = subtract(rotated[2], rotated[0]);
      const normal = cross(firstEdge, secondEdge);
      const normalMagnitude = Math.hypot(normal.x, normal.y, normal.z);
      const normalizedNormal =
        normalMagnitude > 1e-15
          ? {
              x: normal.x / normalMagnitude,
              y: normal.y / normalMagnitude,
              z: normal.z / normalMagnitude,
            }
          : { x: 0, y: 0, z: 0 };
      const lightDot =
        (normalizedNormal.x * light.x +
          normalizedNormal.y * light.y +
          normalizedNormal.z * light.z) /
        lightMagnitude;
      const projected = rotated.map(perspective);
      return {
        points: [screen(projected[0]), screen(projected[1]), screen(projected[2])],
        surface: triangle.surface,
        depth: projected.reduce((sum, point) => sum + point.depth, 0) / 3,
        lightIntensity: Math.max(0.2, Math.min(1, 0.42 + 0.58 * Math.abs(lightDot))),
        facingCamera: normalizedNormal.y >= 0,
      };
    })
    .sort((left, right) => left.depth - right.depth);
  return {
    triangles,
    markers: Object.fromEntries(
      rotatedMarkers.map((marker) => [
        marker.id,
        { ...screen(marker.point), depth: marker.point.depth },
      ]),
    ),
  };
}
