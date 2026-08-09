# Project, analysis, report, and CAD exports 0.8

Status: `engineering-preview-unvalidated`

Implementations:

- `lib/export/project-exports.ts`
- browser export center in `app/page.tsx`

This is an original clean-room Kestrel Lab implementation. Exported geometry,
data, reports, and code do not contain OpenRocket source, simulation code, UI
code, assets, databases, or backend components.

## Export center

The browser's Export action now opens a keyboard-accessible artifact center.
Escape or the close button dismisses it. Downloads are created in memory and
initiated only after the user selects a format.

Version 0.8 offers seven inspectable formats plus a validated project-import path:

1. Versioned Kestrel project JSON
2. Flight-trace CSV
3. Staged 6DOF trace CSV
4. Parameter-sweep CSV
5. Preliminary engineering report in Markdown
6. R11/R12-compatible ASCII DXF side profile
7. Parametric OpenSCAD reference geometry

Every engineering or CAD surface presents manufacturing and validation limits
before download. The DXF, SCAD, project, and report files also embed status or
warning text internally.

## Kestrel project JSON

The root document declares:

```text
schema: org.kestrel-lab.project
schemaVersion: 1
exportModelVersion: kestrel-export-0.8.0
validationStatus: engineering-preview-unvalidated
```

It preserves the current geometry, material choice, mass properties, static
stability, assembly summary, vertical-flight result and trace, uncertainty
analysis, optional optimization Pareto summary, optional landing footprint,
  preliminary structural-screen result, and source/licence provenance, including the ascent-to-recovery handoff
  proxy, recovery deployment reliability assumptions, and sampled outcomes when
  a landing dispersion is present.

When a current coupled 6DOF preview exists, the project JSON retains its
step-size convergence diagnostic, and the Markdown report includes the same
status, metric deltas, assumptions, and warnings. These are numerical
sensitivity checks, not physical validation or flight-safety evidence.

Explicitly separated stages are also retained as ballistic analytical
component checks, including release state, peak altitude/speed, impact time,
and the gravity-only model warnings. These traces do not imply aerodynamic
clearance, range-safety, or flight-safety coverage.

## Portable project import

The JSON export now includes a `configuration` envelope containing the
validated editable inputs, vehicle topology, selected source identifiers, and
the user-supplied motor and aerodynamic libraries. `parseKestrelProjectJson`
validates the schema, numeric ranges, stage graph, motor records, coefficient
tables, and selected-source fallbacks before any browser state is changed.
Import is transactional at the UI boundary: malformed documents leave the
current design untouched and report a clear error. Imported simulation results
are treated as historical evidence only; the browser marks estimates stale and
requires a rerun for the restored configuration.

All numbers must be finite and all values must be JSON-compatible. Circular
references, unsupported values, invalid identifiers, and invalid timestamps are
rejected rather than silently discarded. The document is designed as the basis
for future schema migration. The importer is transactional at the UI boundary;
restored simulation results remain historical until the configuration is rerun.

## Flight CSV

The flight trace uses explicit SI-unit columns:

```text
time_s
altitude_agl_m
velocity_mps
acceleration_mps2
mass_kg
thrust_n
density_kg_m3
mach
dynamic_pressure_pa
horizontal_wind_mps
recovery_deployed
recovery_reefing_fraction
```

Rows use CRLF delimiters for broad spreadsheet compatibility. Numbers use
locale-independent JavaScript decimal notation and every numeric value is
checked for finiteness.

The staged 6DOF trace CSV uses the same explicit style and adds
`mach`, `angle_of_attack_deg`, `sideslip_deg`, `dynamic_pressure_pa`, and
`drag_n`, `recovery_drag_n`, and `recovery_effective_area_m2` before the live
mass, thrust, and attached-stage identifiers. These aerodynamic and recovery
columns are evaluated from the coupled load diagnostics at each retained
sample, not reconstructed from the display chart. Recovery values are zero
when no retained-vehicle recovery device is configured or before its command.

## DXF side profile

The ASCII file declares AutoCAD database version `AC1009` and uses classic
`POLYLINE`, `VERTEX`, `SEQEND`, and `LINE` entities. Dimensions are written in
millimetres. Layers are:

- `AIRFRAME`: closed tangent-ogive and cylindrical side outline
- `FINS`: closed upper and lower fin outlines
- `CENTERLINE`: vehicle datum
- `CG`: current centre-of-gravity station
- `CP`: current centre-of-pressure station

The nose is sampled at 25 axial stations. The DXF is intended for inspection,
layout, and early profile exchange. It is not a toleranced drawing, sheet-metal
development, fin-tab drawing, airframe cut plan, or authoritative manufacturing
definition.

Autodesk's published DXF references define `AC1009` as R11/R12, group-code 70
bit 1 as a closed polyline, and `VERTEX` group codes 10/20/30 as point
coordinates.

## OpenSCAD reference

The generated `.scad` file uses millimetres and defines original modules for:

- a solid tangent-ogive generated with `rotate_extrude`
- cylindrical airframe
- evenly rotated, linearly extruded trapezoidal fins
- tapered nozzle

The source is human-readable and parametric, but it currently represents a
solid external reference shape. It does not include airframe wall thickness,
couplers, shoulder, internal components, fin tabs, motor retention, recovery
attachments, fasteners, clearances, shrink compensation, material process
rules, or structural design. It must not be sent directly to manufacturing.

## Engineering report

The Markdown report leads with an explicit not-flight-safe and
not-manufacturing-approved warning, then records:

- export version and timestamp
- vehicle dimensions, mass, CG, CP, stability, and inertia
- selected nose profile and fin planform geometry in the CAD-reference inputs
- mass and aerodynamic model versions
- motor performance and provenance
- launch site, wind, environment version, status, and provenance
- flight metrics and event table
- vertical uncertainty sample count, convergence status, split-sample quantile
  shifts, and threshold-rate diagnostics when an uncertainty result is supplied
- optional recovery landing footprint, ascent handoff proxy, uncertainty seed,
  and deployment success/failure interval
- optional preliminary structural screen with axial, Euler, fin-root, and
  static-margin checks, model status, assumptions, and warnings
- simulation freshness status for vertical and coupled traces (`current`,
  `stale`, or `not-run`) in project JSON; trace and report exports require a
  current matching run
- model assumptions, warnings, and limitations
- selected aerodynamic coefficient-table definition or the constant-Cd fallback, including provenance and validation status
- clean-room independence statement

Markdown control characters in user-facing labels are escaped or flattened so
values cannot silently alter table structure.

## Verification

Automated tests cover:

- deterministic JSON for a fixed timestamp
- schema identity, version, clean-room notice, and nested data
- CSV headers, SI units, CRLF rows, column count, recovery booleans, and the
  effective reefing-area fraction
- DXF version, units, layers, dimensions, CG/CP, and EOF termination
- OpenSCAD modules, millimetre dimensions, fin rotation, and safety comment
- report warning order, metrics, landing section, limitations, and independence
- rejection of invalid identifiers, empty traces, non-finite values, invalid
  geometry, and impossible fin envelopes
- browser dialog semantics, keyboard dismissal, format descriptions, download
  creation, and manufacturing warnings

These checks validate serialization and geometric construction logic. They do
not establish interoperability with every CAD kernel or validate a manufactured
part.

## Known limitations

- No project import, schema migration, merge, or conflict handling yet.
- No ZIP package, binary DXF, STEP, IGES, STL, 3MF, OBJ, glTF, PDF, or native
  CAD export.
- DXF contains a two-dimensional side reference, not separate fin templates or
  internal cut geometry.
- OpenSCAD geometry is a solid visual/reference CSG model without engineering
  tolerances or construction detail.
- No unit selector; JSON/CSV use SI and CAD outputs use millimetres.
- Browser downloads rely on Blob URLs and the user's browser download policy.
- Reports are Markdown only and contain no cryptographic signature or frozen
  source-data attachment.

## Primary format references

- Autodesk, *HEADER Section Group Codes (DXF)*:
  https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm
- Autodesk, *POLYLINE (DXF)*:
  https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-ABF6B778-BE20-4B49-9B58-A94E64CEFFF3.htm
- Autodesk, *VERTEX (DXF)*:
  https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-DXF/files/GUID-0741E831-599E-4CBF-91E1-8ADBCFD6556D.htm
- OpenSCAD, *User Manual*:
  https://files.openscad.org/documentation/manual/OpenSCAD_User_Manual.pdf
