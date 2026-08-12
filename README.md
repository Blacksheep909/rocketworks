# RocketWorks

Independent rocket design, simulation, and mission-analysis tools for the
browser.

RocketWorks is a browser-first rocket design and flight-analysis workbench
with a graphite mission-console interface. It is being built as an independent
clean-room implementation from public aerospace equations, published
research, standards, and original code.

> **Engineering preview:** RocketWorks is not flight-safety validated,
> manufacturing-approved, or a substitute for instrumented testing,
> independent analysis, range procedures, or qualified engineering review.

## Current release surface

- component-aware 2D geometry and an interactive 3D vehicle view driven by
  expanded assembly components, with clickable surface/stage/component
  selection, grouped stage visibility, plus enabled serial and radial previews;
- the 2D profile now projects enabled serial stages, repeated radial instances,
  and authored equipment/pod markers while preserving the explicit azimuth and
  display-only boundary;
- mass, centre-of-gravity, inertia, static stability, and centre-of-pressure
  calculations with model versions and assumptions;
- serial, parallel, radial, clustered, and multi-stage vehicle topology;
- editable topology point-mass equipment and cylindrical pod primitives with
  slider/exact-number placement controls and optional principal local inertia
  for equipment; off-axis aerodynamic interference is explicitly outside this
  analytical preview;
- a device-local, provenance-aware component library for reusable core,
  recovery, equipment-mass, and cylindrical-pod presets, with strict bounds and
  portable-project import/export;
- one-click configured-stage duplication with authored-component copies and
  safe component rehoming when a non-core stage is removed;
- per-stage body-length, diameter, and nose-length overrides for generated
  upper-stage, booster, and payload preview geometry, with role-based defaults;
- independent repeated-stage instance ignition, burnout, separation, and live
  mass-property diagnostics with logical-stage topology preserved for aero
  regimes;
- bounded canted-motor configuration with radial instance alignment;
- bounded motor-local gimbal schedules with piecewise-linear thrust-axis
  interpolation, per-instance radial basis mapping, and explicit actuator-model
  limitations;
- deterministic per-motor cluster-failure preview with retained failed-motor
  propellant and explicit imbalance warnings;
- bounded retained-body separation delta-v controls with body/world-frame event
  telemetry and explicit discarded-body limitations;
- staged motor-state diagnostics in the Flight workspace and engineering
  report, including active/failed counts, retained failed propellant, and
  explicit per-motor peak-curve spread telemetry;
- bounded launch-rail inclination and ENU azimuth controls with aligned 6DOF
  handoff, effective guide-friction loss, and authored pitch/yaw tip-off rates
  at release; guide-button geometry, binding, and transient launcher mechanics
  remain explicit limitations;
- motor and aerodynamic coefficient libraries for user-supplied,
  provenance-qualified data, including single- and multi-record RASP/ENG motor interchange and
  an accessible Mach/Reynolds coefficient-grid inspector with optional signed
  angle-of-attack and sideslip volumes plus direct body-axis force/moment
  databases for the 6DOF load path; optional positive measured mass-flow
  histories can now drive live motor depletion and inertia-rate telemetry, with
  a strict optional CSV field in the browser motor library;
- a provenance-aware motor performance view that plots the selected thrust
  curve, highlights derived impulse/peak/burn metrics, and keeps source status
  and measured-mass-flow boundaries visible before simulation;
- an angle-of-attack polar inspector with fixed Mach, Reynolds, and sideslip
  sliders, direct force-volume preference, explicit legacy small-angle fallback,
  uncertainty visibility, out-of-domain review status, and a metadata-rich CSV
  export for reproducing the default sampled condition;
- atmosphere through the published 84.852 km geopotential layer boundary,
  launch-site, wind, turbulence, launch-rail, recovery, and landing-dispersion
  previews; landing descent can root-find contact against a flat or bounded
  planar local-ENU terrain surface while keeping terrain elevation and the
  surveyed-terrain limitation explicit;
- editable launch-site name and WGS84 coordinates carried into local history,
  share links, landing-zone provenance, coupled environment providers, and
  engineering reports;
- seeded coupled-flight uncertainty runs can independently vary declared motor
  thrust scales plus direct body-axis force and static-moment coefficient
  databases when those sources are present, with selected factors and nominal
  fallbacks disclosed;
- user-configurable recovery triggers (apogee, descending AGL altitude, or
  mission time) and reefing schedules shared by the vertical preview, landing
  descent, 6DOF recovery loads, trace telemetry, and portable inputs;
- optional relative-humidity coupling with explicit water-vapor, virtual-
  temperature, density, sound-speed, and Reynolds-number diagnostics;
- configurable local-ENU wind azimuth (0° east, +90° north) shared by the
  altitude-dependent vertical, landing, and coupled 6DOF environment paths;
- validated custom altitude-dependent mean-wind layers (up to 32 local-ENU
  points) with explicit user-supplied provenance, local persistence, share
  links, landing/coupled propagation, and synthetic-profile fallback;
- persisted turbulence RMS scaling and a weather replay seed, carried through
  local projects, share links, templates, landing scenarios, coupled
  environments, and engineering reports; the fast 1D vertical trace remains
  intentionally mean-wind-only and labels that boundary in the UI;
- persisted pad-pressure and pad-temperature observations shared by the fast
  vertical, launch-environment, landing, and report paths;
- preliminary vertical flight, coupled 6DOF, staging, ignition delays,
  failure events, retained-vehicle recovery loads, and bounded separated-body
  trajectories with optional isotropic point-drag basis and retained-versus-
  detached center-of-mass separation diagnostics, plus aggregate pairwise
  retained/detached and detached/detached path checks; released-body tracks
  can opt into an independently integrated quaternion attitude, angular-rate,
  inertia, and caller-supplied body/world load state; the stage-flight adapter
  now forwards detached-stage release attitude/rate/inertia into this audit;
  the independent 6DOF
  kernel also offers opt-in adaptive RK4 step-doubling with explicit numerical
  error diagnostics while retaining fixed-step compatibility, and the shared
  released-body grid exposes the same opt-in step-doubling diagnostics without
  changing its fixed-grid default;
- half-step numerical convergence diagnostics for the fast vertical estimate,
  with explicit metric/event thresholds and stale-result handling;
- deterministic mission-event allocation for simultaneous rail, separation,
  ignition, failure, recovery, and custom transitions, with explicit priority,
  dependency, tie-group, cycle, and mutual-exclusion diagnostics carried into
  coupled traces and engineering reports;
- optional stage-specific detached recovery plans for upper stages and booster
  sets, with apogee, descending-altitude, or mission-time command events, canopy
  inflation telemetry, and explicit recovery-load applicability warnings;
- a conservative spherical-envelope separation screen derived from supplied
  component geometry, with explicit potential-overlap and missing-geometry
  states plus relative and inward-closing speed telemetry at closest approach;
  it remains outside contact and range-safety analysis;
- an instantaneous separation impulse audit that checks mass-ratio linear
  momentum balance and exposes unmodeled first-order angular impulse before
  detached-body propagation;
- optional measured retained-body separation impulse vectors with live-mass
  delta-v conversion, event provenance, and uncertainty scaling;
- a shared-grid detached-body flight track that propagates every released
  point mass together against common gravity, atmosphere, and wind queries,
  applies only explicitly balanced event corrections, and reports continuous
  pairwise COM diagnostics without claiming contact, interference, or flight
  safety;
- an opt-in mutual point-mass gravity mode for the shared released-body track,
  with exact-release grid alignment, close-approach softening controls,
  singular-state rejection, and explicit force-model provenance;
- a trace-backed recovery opening-load screen with coverage labels, peak
  dynamic pressure, quasi-steady `q Cd A` drag, inflation impulse, and a
  force-rate proxy; opening shock and structural response remain explicitly
  outside the model;
- seeded coupled 6DOF uncertainty envelopes that propagate bounded mass,
  propellant, global and per-motor thrust, drag, recovery-area,
  deployment-outcome, wind, and declared aerodynamic-table absolute-uncertainty
  assumptions through stage events and launch-rail
  handoff, plus sampled ignition-delay, separation-impulse, and
  launch-alignment factors, with recovery-load percentile telemetry and an
  explicit common-sigma correlation boundary;
- optional Gaussian-copula correlation pairs for uncertainty propagation,
  validated as positive-definite while preserving each declared marginal;
- a persisted Dependence model editor that carries correlation assumptions
  through local history, share links, project JSON, and scoped analyses;
- interactive vertical and staged trace inspectors with Mach, dynamic-pressure,
  axial/recovery drag, canopy area, angle-of-attack, sideslip, event, and
  topology readouts, plus synchronized keyboard/touch sample scrubbers and
  event-row navigation for precise trace inspection; the staged workspace also
  includes an orbitable ENU flight-path view for retained and released-body
  tracks with shared-time selection, selectable-speed replay, rigid-body
  nose-direction glyphs when quaternion states are available, and display-only
  event markers;
- preliminary structural-readiness screen for axial stress, Euler buckling,
  fin-root bending/shear, and static-margin review with explicit assumptions;
- a preliminary equivalent-beam first bending-mode frequency trend with
  explicit boundary-condition, shell-stiffness, mass, and dynamic-model limits;
- a stage-aware structural review that preserves independent stage rows,
  repeated-instance counts, weakest factors, and missing evidence without
  pretending to solve stage interfaces or load transfer;
- an inspectable stage mass-ratio branch using supplied impulse and propellant
  mass to expose stage-only ideal rocket-equation delta-v trends with explicit
  downstream-payload and loss-model limits;
- a serial-stack mass-ratio preview that carries retained payload and later
  serial-stage mass through each ideal burn, while explicitly listing excluded
  parallel/booster stages instead of flattening their coupled trajectory;
- a bounded stage-interface axial load-path review that transfers downstream
  mass across serial topology edges, compares supplied parent/child section
  proxies, uses a current staged trace peak when available while retaining the
  peak-thrust baseline, and keeps parallel/radial interfaces visibly
  unavailable;
- a trace-level force impulse budget that integrates recorded thrust,
  aerodynamic drag, recovery drag, and force/mass velocity-equivalent signals
  by stage without mislabeling scalar accounting as vector delta-v;
- a world-frame vector impulse budget that integrates the actual coupled
  thrust, aerodynamic, gravity, recovery, and discrete-event contributions and
  reports observed-versus-accounted velocity closure with an explicit review
  residual;
- deterministic structural and aeroelastic benchmark anchors for thin-wall
  section area, axial stress, Euler critical load, fin-root bending, and the
  preliminary fin-flutter equation, kept separate from experimental validation;
- configurable seeded uncertainty analysis, parameter sweeps, sensitivity,
  nominal optimization, and an opt-in finite-sample robust optimization screen
  with explicit quantile and scenario-failure metrics;
- accessible event timelines, trace charts, comparisons, engineering reports,
  flight/stage/sweep/uncertainty CSV, topology-aware DXF, multi-stage
  triangulated STL reference meshes, OpenSCAD, portable RocketWorks project
  JSON, and a WGS84 GeoJSON flight-path export with retained/released tracks,
  sample-time arrays, optional attitude/rate telemetry, and event markers for
  GIS review;
- local run comparison that pins a reference estimate and exposes explicit
  metric deltas after a design or environment change;
- measured-flight CSV comparison with strict SI parsing, vertical or coupled
  6DOF trace selection, interpolation-based residuals, event-timestamp
  normalization, deterministic residual CSV export, browser-local persistence,
  and explicit validation boundaries;
- on-demand deterministic physics benchmarks for atmosphere, gravity,
  thrust-curve impulse, static aerodynamics, rigid-body 6DOF, structural, and
  preliminary aeroelastic regression fixtures;
- validated project import, topology- and source-complete device-local
  autosave/history, templates,
  beginner/expert modes, keyboard command search, and compact browser design
  share links;
- editable project identity carried through local history, share links, imported
  documents, accessible labels, and sanitized artifact filenames while the
  compatibility project ID remains stable;
- device-local, provenance-aware component presets for nose, airframe, fin-set,
  recovery, equipment-mass, and cylindrical-pod configurations, with strict
  bounds, portable project-file exchange, and no bundled third-party geometry;
- device-local display and accessibility preferences with v1 migration,
  reduced-motion behavior, high-contrast controls, and keyboard-reachable
  settings; these never enter engineering project state;
- synchronized bounded sliders plus exact-number inputs for flight, weather,
  launch-rail, recovery, reefing, and uncertainty tuning, with the same
  validation and stale-result guardrails as direct edits;
- a typed English/Spanish shell copy catalog with device-local locale
  persistence, including trace-inspection controls, and a clearly bounded
  translation surface while engineering explanations remain English until a
  complete catalog is available.
- an installable standards-based browser shell with original RocketWorks artwork,
  a native browser install affordance, and an honest later desktop/tablet
  wrapper path; offline simulation is not claimed.

Every calculation surface exposes its model version, validation status,
warnings, assumptions, and scope limits. User data retains its source,
version, license identifier, attribution, and validation state.

## Clean-room boundary

OpenRocket is used only as an external feature and compatibility reference
where legally appropriate. This repository does **not** copy, modify, link,
bundle, translate, or directly reuse OpenRocket source code, simulation code,
UI code, assets, databases, or backend components.

The public brand is RocketWorks. The UI presents RocketWorks-prefixed model
labels, while internal `kestrel-*` model identifiers and versioned schema names
remain compatibility identifiers for existing local projects and exports; they
are not a third-party dependency.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

The app runs as a browser workbench. Production-compatible validation is
available with:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

`npm run typecheck` checks the complete TypeScript surface without emitting
build files. `npm test` builds the app and runs the physics, state, export, UI-source, and
rendered-HTML regression suites.

## Public-project guardrails

This repository is intentionally transparent about what it does and does not
claim. Every calculation result carries a model version, validation status,
assumptions, warnings, and scope limits. The current implementation is an
engineering preview: it is useful for exploration, regression testing, and
design conversations, but it is not a flight-safety, range-safety,
manufacturing, or certification tool.

The project is released under the [MIT License](LICENSE). See
[CONTRIBUTING.md](CONTRIBUTING.md) for the clean-room rules, data-provenance
requirements, test workflow, and UI conventions. Security reports belong in
[SECURITY.md](SECURITY.md), not in a public issue.

## Repository map

```text
app/                  Browser workbench, dialogs, charts, and visual system
lib/physics/          Independent aerospace models and simulation kernels
lib/project/          Validated local state, topology, templates, and libraries
lib/export/           Portable JSON, CSV, report, DXF, and OpenSCAD artifacts
docs/engineering/     Versioned equations, assumptions, decisions, and limits
tests/                Deterministic physics, UI, export, and integration checks
```

## Roadmap

Near-term work is stronger experimental/benchmark validation, extension of the
new opt-in released-body rigid-state branch toward contact and relative-load
validation, validated stage-interface/load-transfer and mission-level mass-ratio
loss models, and validated structural/aeroelastic benchmarks beyond the
preliminary fin flutter screen. Angular and direct force/moment coefficient
volumes are now supported as explicit
interpolation sources, and seeded event-factor dispersion now covers timing,
separation impulse, and launch alignment; benchmarked data packages,
relative-body separation databases, and unsteady models remain future work.
Longer-term work includes collaboration and cloud project storage plus native
desktop/tablet packaging. Those additions
will preserve the same provenance boundary and will never upgrade an
analytical preview to flight-safe status without independent evidence.
