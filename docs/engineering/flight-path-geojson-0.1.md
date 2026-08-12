# Flight-path GeoJSON export 0.2

## Scope

The artifact center can export the retained vehicle and any released-body
tracks from the current coupled preview as a GeoJSON `FeatureCollection`. The
format is an original interchange layer over RocketWorks' own trace states; it
does not run a simulation, alter a trajectory, or embed third-party data.

The export contains:

- one `LineString` feature per retained or released trace;
- `sampleTimesS`, optional altitude, speed, rigid-body quaternion, and angular
  velocity arrays, plus release-time metadata so a consumer can reconstruct
  the browser scrubber timeline. Sparse attitude fields retain `null` entries
  for translation-only samples and include a derived angular-rate magnitude;
- one `Point` feature per mission event, attached to the nearest retained
  sample when one exists; unreached events deliberately have `null` geometry;
- a top-level `metadata` member with model identity, provenance, coordinate
  frame, and limitations.

## Coordinate contract

Simulation positions use a local ENU frame: `x` east, `y` north, and `z` up in
metres from the launch point. GeoJSON coordinates are emitted as
`[longitude_deg, latitude_deg, ellipsoidal_height_m]` in WGS84 order.

The conversion uses the WGS84 semi-major axis and first eccentricity, evaluates
the meridional and prime-vertical radii at the launch latitude, and applies a
first-order local tangent conversion:

```text
latitude  = latitude0  + north / (M + elevation0)
longitude = longitude0 + east  / ((N + elevation0) cos(latitude0))
height    = elevation0 + up
```

This is intentionally a local approximation rather than a geodesic, ECEF
solver, surveyed datum transform, or terrain correction. It is appropriate for
plotting and interoperability around a launch site, but large-area GIS work
must reproject and independently validate the coordinates.

## Validation boundary

The document is marked `engineering-preview-unvalidated`. It is not a
range-safety corridor, flight-safety prediction, survey deliverable, terrain
model, collision result, or certification evidence. Earth rotation, geoid
height, terrain/obstacles, atmospheric refractivity, and datum transformations
remain outside this export contract.

Attitude telemetry is display/interchange data copied from the supplied
RocketWorks trace. Quaternion values are normalized for deterministic output;
the export does not infer attitude, add a force model, or validate the source
simulation.
