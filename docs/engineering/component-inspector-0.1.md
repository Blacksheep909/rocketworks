# Component-aware design inspector 0.1

## Scope

The browser workbench exposes the selected nose, airframe, fin set, motor
mount, and recovery component as distinct editing contexts. Geometry fields are
stored in the validated local project snapshot and flow into the original
component mass, static-aerodynamic, assembly, display, and CAD-reference paths.

## Coupled inputs

- Nose length and profile (`ogive`, `conical`, or `elliptical`) change the
  axisymmetric station geometry used for mass and low-speed static stability.
- Airframe length, diameter, material, and payload allowance change the body
  profile and hierarchical mass properties.
- Fin count, root/tip chord, sweep, span, and thickness change fin mass,
  inertia, normal-force slope, center of pressure, 2D markers, 3D display
  geometry, and CAD-reference exports.
- Packed recovery mass changes the recovery component's point mass, center of
  gravity, inertia, and every subsequent flight/landing estimate.
- The motor mount context reports the selected motor's diameter, mass, curve,
  and provenance; mount retention and structural fit are intentionally not
  inferred from those values.

Cross-field validation keeps the fin root within the airframe, keeps tip chord
below root chord, and keeps sweep plus tip chord within the root-chord axial
envelope required by the display and reference-geometry paths.

## Separation and limitations

The canvas display remains a separate, display-only mesh. It now follows the
editable nose profile and fin planform, but its triangles are never used as a
mass or aerodynamic source. The static-aerodynamic result remains a low-speed,
small-angle analytical preview with `analytical-checks-only` status. Structural
attachment, fin flutter, local stress, motor retention, couplers, and
manufacturing tolerances are not modeled.

## Persistence and verification

New geometry fields are additive defaults in the version-1 local snapshot
validator so older browser records can be read as the original 180 mm ogive,
three-fin ARC 54 geometry. Invalid profile names, non-integral fin counts,
inverted planforms, and oversized fin envelopes are rejected. Regression tests
cover default migration, cross-field validation, distinct display profiles,
component inspector wiring, and the existing mass/aerodynamic contracts.

