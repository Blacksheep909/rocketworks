# Project, analysis, report, and CAD exports 0.1

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

Version 0.1 offers five inspectable formats:

1. Versioned Kestrel project JSON
2. Flight-trace CSV
3. Preliminary engineering report in Markdown
4. R11/R12-compatible ASCII DXF side profile
5. Parametric OpenSCAD reference geometry

Every engineering or CAD surface presents manufacturing and validation limits
before download. The DXF, SCAD, project, and report files also embed status or
warning text internally.

## Kestrel project JSON

The root document declares:

```text
schema: org.kestrel-lab.project
schemaVersion: 1
exportModelVersion: kestrel-export-0.1.0
validationStatus: engineering-preview-unvalidated
```

It preserves the current geometry, material choice, mass properties, static
stability, assembly summary, vertical-flight result and trace, uncertainty
analysis, optional optimization Pareto summary, optional landing footprint,
and source/licence provenance.

All numbers must be finite and all values must be JSON-compatible. Circular
references, unsupported values, invalid identifiers, and invalid timestamps are
rejected rather than silently discarded. The document is designed as the basis
for future project import and schema migration; version 0.1 does not yet expose
an importer and therefore does not claim round-trip support.

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
```

Rows use CRLF delimiters for broad spreadsheet compatibility. Numbers use
locale-independent JavaScript decimal notation and every numeric value is
checked for finiteness.

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
- mass and aerodynamic model versions
- motor performance and provenance
- launch site, wind, environment version, status, and provenance
- flight metrics and event table
- optional recovery landing footprint and uncertainty seed
- model assumptions, warnings, and limitations
- clean-room independence statement

Markdown control characters in user-facing labels are escaped or flattened so
values cannot silently alter table structure.

## Verification

Automated tests cover:

- deterministic JSON for a fixed timestamp
- schema identity, version, clean-room notice, and nested data
- CSV headers, SI units, CRLF rows, column count, and recovery booleans
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
