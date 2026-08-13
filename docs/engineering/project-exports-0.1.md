# Project, analysis, report, and CAD exports 0.9

Status: `engineering-preview-unvalidated`

Implementations:

- `lib/export/project-exports.ts`
- browser export center in `app/page.tsx`

This is an original clean-room RocketWorks implementation. Exported geometry,
data, reports, and code do not contain OpenRocket source, simulation code, UI
code, assets, databases, or backend components.

## Export center

The browser's Export action now opens a keyboard-accessible artifact center.
Escape or the close button dismisses it. Downloads are created in memory and
initiated only after the user selects a format.

Version 0.9 offers eight inspectable formats plus a validated project-import path:

1. Versioned RocketWorks project JSON
2. Flight-trace CSV
3. Vertical uncertainty-sample CSV
4. Staged 6DOF trace CSV
5. Parameter-sweep CSV
6. Preliminary engineering report in Markdown
7. R11/R12-compatible ASCII DXF side profile
8. Parametric OpenSCAD reference geometry

Every engineering or CAD surface presents manufacturing and validation limits
before download. The DXF, SCAD, project, and report files also embed status or
warning text internally.

The Markdown report records the selected motor and aerodynamic source IDs,
the motor's selected propellant depletion source, and, when supplied, the
integrated measured outflow mass. This keeps report provenance aligned with
the live source configuration without conflating measured flow with the
independent thrust curve.

For coupled previews, the report also records the selected relation-based
normal-force model (`low-speed`, `prandtl-glauert`, `supersonic-linearized`, or
`mixed` when stage regimes differ). Direct force/moment coefficient tables
remain authoritative; the relation selector is an engineering-preview trend
with an explicit transonic applicability gap. It also records the selected
relation induced-drag polar and its caller-authored `k` factor when present;
that term is documented in `docs/engineering/induced-drag-polar-0.1.md` and is
bypassed by direct force tables.

## RocketWorks project JSON

The root document declares:

```text
schema: org.kestrel-lab.project
schemaVersion: 1
exportModelVersion: kestrel-export-0.9.0
validationStatus: engineering-preview-unvalidated
```

It preserves the current geometry, material choice, optional uncertainty
dependence pairs, mass properties, static
stability, assembly summary, vertical-flight result and trace, uncertainty
analysis, optional optimization Pareto summary, optional landing footprint,
  preliminary structural-screen result, staged separation impulse audits, and
  source/licence provenance, including the ascent-to-recovery handoff
  proxy, recovery deployment reliability assumptions, and sampled outcomes when
  a landing dispersion is present.

When a current coupled 6DOF preview exists, the project JSON retains its
step-size convergence diagnostic, and the Markdown report includes the same
status, metric deltas, assumptions, and warnings. These are numerical
sensitivity checks, not physical validation or flight-safety evidence.

The coupled report also records the launch-rail guide-loss acceleration,
body-frame rail-exit tip-off rate, exact handoff speed/time, model version,
assumptions, and warnings when a rail run is present. The guide-loss and
tip-off values are authored scenario inputs, not guide-hardware measurements.

Explicitly separated stages are also retained as ballistic analytical
component checks, including release state, peak altitude/speed, impact time,
and the gravity-only model warnings. These traces do not imply aerodynamic
clearance, range-safety, or flight-safety coverage.

## Portable project import

The JSON export now includes a `configuration` envelope containing the
validated editable inputs, vehicle topology, selected source identifiers, and
the user-supplied motor and aerodynamic libraries plus the provenance-aware
component preset library. `parseKestrelProjectJson` validates the schema,
numeric ranges, stage graph, motor records, coefficient tables, component
records, and selected-source fallbacks before any browser state is changed.
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
recovery_inflation_fraction
recovery_reefing_fraction
```

Rows use CRLF delimiters for broad spreadsheet compatibility. Numbers use
locale-independent JavaScript decimal notation and every numeric value is
checked for finiteness.

The staged 6DOF trace CSV uses the same explicit style and adds
`mach`, `angle_of_attack_deg`, `sideslip_deg`, `center_of_pressure_x_m`,
`center_of_mass_x_m`, `static_margin_calibers`,
`normal_force_slope_per_rad`, `attitude_tilt_deg`, `angular_rate_deg_s`,
quaternion components, angular-velocity components, `dynamic_pressure_pa`, and `drag_n`,
`recovery_drag_n`, and `recovery_effective_area_m2` before the live mass,
thrust, and attached-stage identifiers. These aerodynamic, stability, and
recovery columns are evaluated from the coupled load diagnostics at each
retained sample, not reconstructed from the display chart. Stability cells are
blank when the active source cannot provide a CP/CG estimate. Recovery values
are zero when no retained-vehicle recovery device is configured or before its command.
`recovery_inflation_fraction` is the vertical preview's smoothstep
effective-area fraction; it is not a fabric-state measurement.

The staged trace also includes `attitude_tilt_deg`, `angular_rate_deg_s`, the
four body-to-world quaternion components, and body angular-velocity components
in rad/s. These are direct 6DOF state projections for replay and inspection;
legacy records without them retain blank cells. See
`stage-flight-attitude-telemetry-0.1.md` for the coordinate convention and
validation boundary.

The staged project JSON and engineering report also retain the optional
`separationContact` screen. It records fixed-envelope pair coverage, first
potential-contact time, centre-of-mass closing speed, and the reduced-mass
relative kinetic-energy proxy when masses are available. These values are
kinematic review telemetry only; no contact force, structural load, rebound,
or flight-safety claim is encoded. See `stage-separation-contact-0.1.md`.

They also retain the staged `missionLossBudget` thrust-axis screen. It records
thrust impulse-equivalent speed, net thrust-vector magnitude, steering
dispersion, thrust-axis coverage, positive opposing/assisting projections, and
projected versus unprojected event counts. These values are explanatory trace
projections only; they are not a validated mission delta-v or loss budget,
performance certification, or flight-safety result. See
`mission-loss-budget-0.1.md`.

## Uncertainty-sample CSV

The uncertainty export writes one row per seeded scenario, including the
`sample_index`, every declared input parameter, every observed output metric,
and a retained `error` field. Input columns follow the declared parameter
order; output columns are sorted by key so the same result serializes
identically across runs. Missing inputs and null outputs remain empty cells,
while evaluator errors are CSV-escaped rather than discarded.

The file begins with deterministic `# key,value` metadata records for the
uncertainty model version, validation status, sampling method, replay seed,
requested/successful/failed counts, declared parameter count, and correlation
pair count. This makes the sample table auditable without requiring the full
project JSON. It is still an engineering-preview data extract: finite-sample
quantiles and scenario failures do not establish reliability, certification,
or flight safety.

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

When the project has an enabled multi-stage topology, OpenSCAD emits unique
stage-prefixed modules and a final union that translates each serial, parallel,
or repeated instance by its validated axial and 3D radial offset. The stage
modules intentionally share the same bounded external shape assumptions as the
single-stage reference; internal couplers, retention, and interference are not
silently invented.

## ASCII STL reference mesh

The generated `.stl` file is an ASCII triangulation in millimetres of the
selected nose profile, cylindrical airframe, tapered nozzle, and repeated
external fin prisms. The mesh is generated from the same validated geometry
envelope as the DXF and OpenSCAD outputs, so the three references share the
same axial dimensions and fin planform inputs. When the project has an enabled
multi-stage topology, the browser adds one validated mesh part per serial,
parallel, or repeated stage instance and applies its axial/radial placement
offset. It is useful for visual CAD inspection, fit studies, and early mesh
interoperability checks.

STL has no unit, material, provenance, or tolerance schema. RocketWorks
therefore labels this output as a reference mesh rather than a slicer-ready
part. It does not include wall thickness, internal hardware, tabs, clearances,
shrink compensation, or load evidence; independently repair and validate any
mesh before manufacturing.

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
- optional preliminary structural screen with axial, Euler, fin-root,
  static-margin, and conditionally available fin-flutter checks, model status,
  assumptions, and warnings
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
- uncertainty-sample provenance comments, deterministic input/output column
  ordering, null-output cells, retained evaluator errors, and non-finite-value
  rejection
- DXF version, units, layers, dimensions, CG/CP, and EOF termination
- OpenSCAD modules, millimetre dimensions, fin rotation, and safety comment
- STL solid-name, facet normals, millimetre dimensions, fin repetition,
  multi-stage axial/radial offsets, and deterministic termination
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
- No ZIP package, binary DXF, STEP, IGES, 3MF, OBJ, glTF, PDF, or native CAD
  export. STL remains a reference mesh, not a manufacturing export.
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
