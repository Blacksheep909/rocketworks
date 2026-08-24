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
- bounded custom airframe material profiles with exact-number/slider editing,
  thin-wall mass and preliminary structural participation, portable project
  and component-preset persistence, and explicit user-supplied/unvalidated
  provenance;
- staged 6DOF trace telemetry for topology-specific CP, CG, static margin, and
  normal-force slope, with interactive plots, SI CSV columns, and report ranges;
- staged 6DOF attitude and angular-rate telemetry, including quaternion/rate
  export, local-vertical tilt, and interactive profile modes;
- a conservative staged separation contact screen that root-finds potential
  fixed-envelope crossings on shared released-body paths and reports relative
  closing speed plus an explicitly non-structural kinetic-energy proxy;
- a separate contact compliance scenario with authored stopping-distance and
  restitution controls, normal impulse, absorbed/rebound energy, and explicit
  average/linear-stop force scales that never feed forces back into the flight
  trajectory;
- serial, parallel, radial, clustered, and multi-stage vehicle topology;
- editable topology point-mass equipment and cylindrical pod primitives with
  slider/exact-number placement controls and optional principal local inertia
  for equipment; a geometry-only attached-flow clearance screen makes
  off-axis and parallel-stage envelope overlap visible without changing loads;
- a device-local, provenance-aware component library for reusable core,
  recovery, equipment-mass, and cylindrical-pod presets, with strict bounds and
  portable-project import/export;
- checkpoint-to-checkpoint configuration review with an adjacent default and
  selectable earlier baseline, plus deterministic CSV and Markdown handoff
  artifacts that preserve revisions, source selections, normalized-configuration
  fingerprints, and the explicit non-validation boundary; exported CSVs can be
  reopened through a strict, read-only verifier without mutating the design;
- one-click configured-stage duplication with authored-component copies and
  safe component rehoming when a non-core stage is removed;
- per-stage body-length, diameter, and nose-length overrides for generated
  upper-stage, booster, and payload preview geometry, with role-based defaults;
- stage-local fin count, chord, sweep, span, and thickness overrides for upper
  stages and boosters, propagated through mass properties, 2D/3D previews,
  aerodynamic reference geometry, and CAD previews, with role-scaled defaults;
- independent repeated-stage instance ignition, burnout, separation, and live
  mass-property diagnostics with logical-stage topology preserved for aero
  regimes;
- bounded canted-motor configuration with radial instance alignment;
- bounded motor-local gimbal schedules with piecewise-linear thrust-axis
  interpolation, per-instance radial basis mapping, optional first-order vector
  response, plus bounded throttle schedules with impulse-consistent depletion
  and explicit actuator-model limitations;
- a post-trace gimbal control-authority envelope that exposes conservative
  independent force, moment, angular-acceleration, coverage, and
  control-to-aerodynamic-moment diagnostics at the authored ±15° command
  bound; it is explicitly not a controller, hardware assessment, or
  flight-safety result;
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
- an opt-in WGS84 Earth-rate Coriolis correction in the local ENU environment,
  persisted with the project and surfaced as an analytical, unvalidated model
  option; effective scalar gravity remains the default baseline;
- an opt-in WGS84 normal-gravity model using launch latitude and ASL height,
  with explicit formula provenance and a standard-gravity compatibility path;
- an opt-in relation normal-force compressibility selector with a bounded
  Prandtl-Glauert subsonic trend, normalized Ackeret supersonic trend, explicit
  transonic gap, persisted project state, and direct-table precedence;
- an opt-in relation induced-drag polar using the explicit `C_D,i = k C_N²`
  form, with a caller-authored bounded factor, direct force-table precedence,
  persisted provenance, and staged-report diagnostics;
- seeded coupled-flight uncertainty runs can independently vary declared motor
  thrust scales plus direct body-axis force and static-moment coefficient
  databases when those sources are present, with selected factors and nominal
  fallbacks disclosed;
- declared aerodynamic-table absolute uncertainty can use independent drag,
  normal-force-slope, and center-of-pressure channels in staged dispersion,
  with optional Gaussian-copula dependence pairs and an explicit common-sigma
  fallback for direct force/moment and damping cells;
- user-configurable recovery triggers (apogee, descending AGL altitude, or
  mission time) and reefing schedules shared by the vertical preview, landing
  descent, 6DOF recovery loads, trace telemetry, and portable inputs;
- an accessible display-only recovery phase timeline in the vertical Flight
  inspector, classifying recorded ballistic, delay, inflation, reefing, and
  inflated samples while plotting the existing effective-area fraction without
  inventing canopy or line dynamics;
- optional relative-humidity coupling with explicit water-vapor, virtual-
  temperature, density, sound-speed, and Reynolds-number diagnostics;
- configurable local-ENU wind azimuth (0° east, +90° north) shared by the
  altitude-dependent vertical, landing, and coupled 6DOF environment paths;
- validated custom altitude-dependent mean-wind layers (up to 32 local-ENU
  points) with explicit user-supplied provenance, local persistence, share
  links, landing/coupled propagation, synthetic-profile fallback, and an
  accessible speed/direction profile plot;
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
- expert Flight-inspector sliders for the persisted vertical and coupled 6DOF
  integration steps (1 ms–200 ms), shared with uncertainty, sweep,
  optimization, landing-drift, and stage-preview paths; smaller steps remain a
  numerical-resolution choice, not a validation claim;
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
- a directed released-body relative-flow/wake review that checks finite
  expanding-cone overlap, reports bounded velocity-deficit and dynamic-pressure
  proxies when an environment provider is available, mirrors the result into
  engineering reports, and keeps the explicit no-force-feedback /
  no-validation boundary;
- an opt-in coupled wake-feedback sensitivity branch that feeds the strongest
  overlapping source-wake velocity deficit into the shared-grid drag/aero
  evaluation, with persisted controls, per-sample provenance, CSV/report
  export, and explicit analytical-only / no-CFD limits; the default force path
  remains unchanged;
- a strict pair-level relative-flow evidence importer and seeded calibration
  study for wake half-angle, recovery distance, and bounded deficit factors;
  aggregate coverage, deficit, dynamic-pressure, matched-observation, and
  candidate-failure metrics remain visible, and calibrated agreement never
  becomes a flight-load or safety claim;
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
- an opt-in bounded spherical-envelope contact-force mode for the shared
  released-body track, with stiffness, closing-speed damping, force-cap
  sliders, per-sample force/penetration diagnostics, persisted settings, and a
  dedicated CSV export; retained-vehicle contact, friction, off-centre moments,
  deformation, plume/aero interference, and flight safety remain outside the
  contract;
- an opt-in retained-vehicle replay track in the shared released-body solver
  that seeds the retained rigid state at first separation and replays
  interpolated thrust, aerodynamic, and recovery translation loads from the
  authoritative staged trace for contact/mutual-gravity diagnostics; an
  explicit independent mode instead evaluates changing retained mass/inertia,
  propulsion, active-topology aerodynamics, recovery loads, and later
  authoritative staging state/velocity-impulse events on the shared grid; an
  optional bounded separation-force pulse can be forwarded to that track while
  mechanism hardware, plume interaction, and validated interference remain out
  of scope;
- accessible first-separation pulse controls with bounded Δv, optional angular
  Δω, start-offset, duration sliders, constant/raised-cosine profile selection,
  automatic retained-track handoff, persisted project settings, and traceable
  force/torque diagnostics; angular mode uses sampled rigid-body inertia and
  remains an analytical mechanism sensitivity study;
- an opt-in projected-area attitude-drag mode for released rigid bodies that
  blends caller-supplied axial and broadside CdA pairs, retains incidence and
  effective-area diagnostics on the shared trace;
- an explicit released-body coefficient-table mode that queries the selected
  Mach/Reynolds/angular source at each sample and gives declared direct
  body-axis force/moment volumes precedence without requiring projected-area
  presentation drag;
- a clean-room detached-body static-load path that can add bounded normal
  force, induced drag, CP-to-CG moment, and supplied rate damping when stage
  geometry and coefficient inputs support it, with traceable assumptions and
  explicit analytical-only status;
- a trace-backed recovery opening-load screen with coverage labels, peak
  dynamic pressure, quasi-steady `q Cd A` drag, inflation impulse, and a
  force-rate proxy; opening shock and structural response remain explicitly
  outside the model;
- seeded coupled 6DOF uncertainty envelopes that propagate bounded mass,
  propellant, global and per-motor thrust, drag, recovery-area,
  deployment-outcome, wind, and declared aerodynamic-table absolute-uncertainty
  assumptions through stage events and launch-rail
  handoff, plus sampled ignition-delay, separation-impulse, and
  launch-alignment factors; contact-load scenarios can additionally sample
  stopping-distance and restitution scales with post-trace percentile impulse
  and force-scale telemetry, with channel-specific aerodynamic uncertainty
  factors and an explicit measured-covariance boundary;
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
- a bounded stage-interface load-path review that transfers downstream mass
  across serial topology edges, compares supplied parent/child section proxies,
  uses a current staged trace peak when available while retaining the
  peak-thrust baseline, and carries an optional body-transverse trace envelope
  plus equal-share parallel/radial force-scale audit for per-instance axial
  and transverse demand, canted-thrust radial force, eccentric moment, and
  symmetric resultant; when parent/child shear evidence exists, it adds a
  separate shell-section transverse/radial shear proxy, and optional child-stage
  upstream connector-group direct-shear evidence using explicit count, diameter,
  allowable, efficiency, and (for parallel stages) fastener-group radius fields
  without claiming joint qualification;
- a trace-level force impulse budget that integrates recorded thrust,
  aerodynamic drag, recovery drag, and force/mass velocity-equivalent signals
  by stage without mislabeling scalar accounting as vector delta-v;
- a world-frame vector impulse budget that integrates the actual coupled
  thrust, aerodynamic, gravity, recovery, and discrete-event contributions and
  reports observed-versus-accounted velocity closure with an explicit review
  residual;
- a thrust-axis mission-loss screen that exposes thrust impulse-equivalent
  speed, steering dispersion, and positive opposing/assisting projections for
  gravity, aerodynamics, recovery, and available event vectors without
  mislabeling the trace as a validated mission budget;
- an ideal-to-trace mission delta-v composition bridge that compares the
  serial-stack ideal preview with recorded scalar and vector thrust metrics,
  keeps topology exclusions and axis coverage visible, and does not claim
  achieved performance;
- deterministic structural and aeroelastic benchmark anchors for thin-wall
  section area, axial stress, Euler critical load, fin-root bending, and the
  preliminary fin-flutter equation, kept separate from experimental validation;
- configurable seeded uncertainty analysis, sensitivity, nominal optimization,
  and opt-in finite-sample robust optimization screens with explicit quantile
  and scenario-failure metrics; the fast vertical model and the complete
  staged 6DOF preview both expose bounded deterministic one-variable sweeps,
  while staged Flight adds a constraint-aware Pareto search over thrust, drag,
  and recovery settings with mapped recommendation controls; all sweeps and
  searches retain failures and CSV/report metadata;
- accessible event timelines, trace charts, comparisons, engineering reports,
  flight/stage/sweep/uncertainty CSV, topology-aware DXF, multi-stage
  triangulated STL reference meshes, OpenSCAD, and a part-level manufacturing
  manifest, portable RocketWorks project
  JSON, and a WGS84 GeoJSON flight-path export with retained/released tracks,
  sample-time arrays, optional attitude/rate telemetry, and event markers for
  GIS review;
- local vertical and coupled/staged run comparisons that pin a reference
  estimate, expose signed metric deltas after a design or environment change,
  keep sampled event/released-body counts visible, and export the staged delta
  with run fingerprints into CSV and engineering reports;
- portable, versioned vertical and staged simulation-review JSON artifacts that
  retain result fingerprints, model status, timestamps, and explicit review
  boundaries; imports are strictly verified and session-only, never project
  restores or cloud synchronization;
- a device-local simulation run library with eight bounded slots for named
  vertical and staged decision points; saved runs can be inspected, reused as
  session comparison references, or removed without changing editable inputs;
  the catalog can also be selected into a kind-aware multi-run comparison
  matrix, exported as deterministic long-form CSV, or merged through a strict
  project-scoped JSON handoff;
- measured-flight CSV comparison with strict SI parsing, vertical or coupled
  6DOF trace selection, interpolation-based residuals, event-timestamp
  normalization, optional positive one-sigma measurement uncertainty with
  normalized residual statistics, deterministic residual CSV export,
  browser-local persistence, and explicit validation boundaries;
- a bounded staged telemetry calibration study that compares imported altitude,
  velocity, and reconstructed acceleration against the coupled preview,
  preserves coverage/convergence/simulation-failure metrics, and exposes only
  caller-declared thrust and drag factors through a deterministic mapped
  recommendation; this is residual minimization for engineering diagnosis,
  never a validation or flight-safety claim;
- on-demand deterministic physics benchmarks for atmosphere, gravity,
  thrust-curve impulse, static aerodynamics, rigid-body 6DOF, bounded gimbal
  control-authority, stage-interface shear, connector, and eccentric-group
  reserve, structural, and
  preliminary aeroelastic regression fixtures;
- benchmark evidence CSV and matching engineering-report section with model
  identity, fixture tolerances, assumptions, and explicit regression-only
  interpretation;
- validated project import, topology- and source-complete device-local
  autosave/history, templates,
  beginner/expert modes, keyboard command search, and compact browser design
  share links; local history can compare adjacent or any earlier checkpoints
  with deterministic before/after input, topology-count, and source-selection
  rows; topbar and command-palette undo/redo navigate saved checkpoints without
  deleting the audit timeline, while new edits correctly invalidate redo;
- a functional project console behind the workspace header with local save
  status, revision handoff, history, template, import, export, checkpoint, and
  share actions; the console now indexes up to 24 validated browser-local
  workspaces, can open or duplicate a design, and can download or merge a
  strict workspace-backup envelope without implying cloud sync; matching
  project IDs replace their local records, removable local projects make
  capacity recovery explicit, and multi-user collaboration remains out of
  scope for this browser-only surface;
- coupled-flight contract settings are carried through validated autosave,
  project JSON, and share links, including released-body aerodynamic mode,
  mutual-gravity softening, contact-screen assumptions, and 6DOF integration
  method; legacy documents receive explicit compatibility defaults;
- editable project identity carried through local history, share links, imported
  documents, accessible labels, and sanitized artifact filenames while the
  compatibility project ID remains stable;
- device-local, provenance-aware component presets for nose, airframe, fin-set,
  recovery, equipment-mass, and cylindrical-pod configurations, with strict
  bounds, portable project-file exchange, and no bundled third-party geometry;
- device-local display and accessibility preferences with versioned migration,
  reduced-motion behavior, high-contrast controls, keyboard-reachable settings,
  an opt-in save-location dialog, and a session-scoped project-folder chooser
  for keeping exports together; these destinations never enter engineering
  project state;
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
lib/export/           Portable JSON, CSV, report, DXF, OpenSCAD, and manufacturing artifacts
docs/engineering/     Versioned equations, assumptions, decisions, and limits
tests/                Deterministic physics, UI, export, and integration checks
```

## Roadmap

Near-term work is stronger experimental/benchmark validation, extension of the
new opt-in released-body rigid-state branch toward contact and relative-load
validation, including evidence-backed calibration of the now-configurable
relative-flow wake proxy and its bounded force-feedback sensitivity branch,
validated stage-interface/load-transfer and
mission-level mass-ratio loss models, and validated structural/aeroelastic benchmarks beyond the
preliminary fin flutter screen. The optional retained replay track now provides
an explicit shared-grid diagnostic, and the staged adapter now has an explicit
API-only independent retained handoff that evaluates changing mass/inertia,
caller-supplied thrust, active-topology aerodynamics, recovery loads, and later
  authoritative staging state/velocity-impulse events after the first separation.
The shared solver now also has an API-only finite-duration separation-force
pulse preview with exact boundaries and equal-and-opposite linear momentum;
mechanism hardware models, relative-body databases, angular/plume exchange,
and a full validated momentum-exchange solver remain future work.
Angular and direct force/moment coefficient
volumes are now supported as explicit
interpolation sources, and seeded event-factor dispersion now covers timing,
separation impulse, and launch alignment; benchmarked data packages,
relative-body separation databases, unsteady models, and validated
stage-to-stage interference data remain future work. The stage-interface
screen now carries a body-transverse trace envelope alongside its axial
compression proxy and an explicitly separate shell-section shear proxy when
  material evidence exists; full connector/radial capacity validation remains
  future work beyond the new optional direct-shear and eccentric fastener-group
  evidence screens. The new attached-flow screen is intentionally a conservative,
non-propagating geometry diagnostic,
not an aerodynamic correction.
Longer-term work includes collaboration and cloud project storage plus native
desktop/tablet packaging. Those additions
will preserve the same provenance boundary and will never upgrade an
analytical preview to flight-safe status without independent evidence.
