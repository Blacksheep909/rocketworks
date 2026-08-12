import { magnitude, scaleVector, type Vector3 } from "./linear-algebra.ts";

/** Versioned local ENU terrain support for analytical ground-contact checks. */
export const TERRAIN_SURFACE_MODEL_VERSION = "kestrel-local-terrain-0.1.0";
export const TERRAIN_SURFACE_VALIDATION_STATUS = "engineering-preview-unvalidated" as const;

export type TerrainSurface = Readonly<{
  modelVersion: string;
  validationStatus: typeof TERRAIN_SURFACE_VALIDATION_STATUS;
  name: string;
  /** Elevation in metres relative to the launch-pad origin. */
  elevationAt: (positionWorldM: Vector3) => number;
  /** Unit outward normal in the local ENU frame, when the surface supplies one. */
  normalAt?: (positionWorldM: Vector3) => Vector3;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

export type PlanarTerrainSurfaceInput = Readonly<{
  name?: string;
  /** Elevation at the launch-pad origin, relative to that origin. */
  elevationAtOriginM?: number;
  /** Rise per metre moving east. */
  eastSlope?: number;
  /** Rise per metre moving north. */
  northSlope?: number;
}>;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function finiteVector(value: Vector3, label: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite components`);
  }
}

function normalizedNormal(eastSlope: number, northSlope: number): Vector3 {
  const normal = { x: -eastSlope, y: -northSlope, z: 1 };
  const length = magnitude(normal);
  return scaleVector(normal, 1 / length);
}

/** Returns a validated flat surface at the launch-pad reference elevation. */
export function createFlatTerrainSurface(name = "Flat launch surface"): TerrainSurface {
  if (!name.trim()) throw new Error("terrain surface name cannot be empty");
  return createPlanarTerrainSurface({ name, elevationAtOriginM: 0, eastSlope: 0, northSlope: 0 });
}

/**
 * Creates a bounded analytical plane in the launch-local ENU frame. Slopes are
 * dimensionless rise/run ratios; UI callers may expose them as percent.
 */
export function createPlanarTerrainSurface(
  input: PlanarTerrainSurfaceInput = {},
): TerrainSurface {
  const name = input.name ?? "Planar launch surface";
  if (!name.trim()) throw new Error("terrain surface name cannot be empty");
  const elevationAtOriginM = finite(input.elevationAtOriginM ?? 0, "terrain origin elevation");
  const eastSlope = finite(input.eastSlope ?? 0, "terrain east slope");
  const northSlope = finite(input.northSlope ?? 0, "terrain north slope");
  if (Math.abs(eastSlope) > 1 || Math.abs(northSlope) > 1) {
    throw new Error("terrain slopes must be between -1 and 1 metre per metre");
  }
  const normal = normalizedNormal(eastSlope, northSlope);
  return {
    modelVersion: TERRAIN_SURFACE_MODEL_VERSION,
    validationStatus: TERRAIN_SURFACE_VALIDATION_STATUS,
    name: name.trim(),
    elevationAt: (positionWorldM) => {
      finiteVector(positionWorldM, "terrain query position");
      return elevationAtOriginM + eastSlope * positionWorldM.x + northSlope * positionWorldM.y;
    },
    normalAt: () => normal,
    assumptions: [
      "Terrain is represented by an infinite plane in the launch-local east-north-up frame",
      "The plane elevation is relative to the launch-pad origin and does not alter the WGS84 site elevation",
      "Ground contact is a kinematic crossing; no bounce, skid, penetration, or contact impulse is solved",
    ],
    warnings: [
      "This terrain surface is an analytical engineering preview and is not a surveyed digital elevation model",
      "No obstacles, exclusion zones, coastlines, water, vegetation, or range boundaries are represented",
    ],
  };
}

/** Safely evaluates a surface callback and returns its local elevation. */
export function terrainElevationAt(surface: TerrainSurface, positionWorldM: Vector3): number {
  finiteVector(positionWorldM, "terrain query position");
  const elevationM = surface.elevationAt(positionWorldM);
  return finite(elevationM, "terrain elevation");
}

/** Returns signed clearance above the terrain (positive means above ground). */
export function terrainClearanceM(surface: TerrainSurface, positionWorldM: Vector3): number {
  return positionWorldM.z - terrainElevationAt(surface, positionWorldM);
}
