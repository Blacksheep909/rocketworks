# Changelog

All notable RocketWorks changes are recorded here. The project is still an
engineering preview, so entries describe implementation scope rather than
flight-readiness claims.

## [Unreleased]

- Added an original aerodynamic coefficient polar inspector. Users can sample
  supplied tables across angle of attack while holding Mach, Reynolds number,
  and sideslip fixed, with direct body-axis force volumes preferred over the
  declared legacy small-angle proxy. The SVG view carries uncertainty,
  provenance, applicability warnings, and explicit out-of-domain review status;
  it is an analytical data-inspection surface, not CFD or flight-safety evidence.
- Added a world-frame vector impulse budget to the coupled preview. Recorded
  thrust, aerodynamic, gravity, recovery, and discrete-event contributions are
  integrated as force/mass vectors and checked against the observed velocity
  change. Closure residuals expose omitted rail/contact or event mechanisms as
  review telemetry; this remains analytical trace accounting, not a validated
  mission delta-v or flight-safety budget.
- Added a typed English/Spanish shell copy catalog and a persisted locale
  selector in Display & accessibility settings. Core navigation, view modes,
  and presentation controls can switch coherently; engineering explanations
  remain explicitly English until a complete translated catalog is available.
- Extended device-local UI preferences to schema v2 with a safe v1 migration,
  keyboard-reachable Display & accessibility controls, explicit reduced-motion
  behavior, and high-contrast presentation tokens. These flags remain outside
  project fingerprints, simulations, share links, and engineering exports.
- Added a trace-level force impulse budget to the coupled preview. The browser,
  project report, and export surface now expose trapezoidal thrust, aerodynamic
  drag, recovery drag, force/mass velocity-equivalent, peak-q, and per-stage
  active-window accounting. Scalar values remain explicitly diagnostic and are
  not presented as vector delta-v, mission loss, or flight-safety evidence.
- Added a bounded stage-interface axial load-path review. Serial topology
  edges now expose downstream mass, common-acceleration demand, parent/child
  section capacity proxies, and factor-of-safety status in the browser,
  project JSON, engineering report, and design-review finding. Parallel/radial
  interfaces and incomplete connector evidence remain visibly unavailable;
  this is not a connector, contact, transient, or flight-safety solver.
- Added a stage mass-ratio diagnostic to the coupled preview. Each logical
  propulsive stage now exposes structural, motor-dry, propellant, full, and
  burnout masses, mass ratio, effective specific impulse, and a stage-only
  ideal rocket-equation delta-v proxy in the browser card and engineering
  report. Downstream payload, gravity, drag, steering, residual, and staging
  losses remain explicitly outside scope.
- Added an independent stage-aware structural review aggregate. Enabled upper,
  booster, and payload rows now retain their own component-screen status,
  repeated-instance count, check totals, weakest factor-of-safety trend, and
  missing-evidence reason in the browser card, project JSON, engineering
  report, and design-review finding. Stage interfaces, load transfer, and
  cluster imbalance remain explicitly outside scope.
- Added an opt-in mutual point-mass gravity path to the shared released-body
  flight track, including exact release-time grid points, close-approach
  softening metadata, singular-state rejection, and browser force-model
  selection. The result remains an analytical component check, not a contact,
  collision, range-safety, or flight-safety solver.
- Added a preliminary airframe first-bending-mode screen using an independent
  Euler-Bernoulli equivalent-beam equation. The structural card and report now
  expose frequency, period, boundary assumption, modeled shell stiffness, and
  mass limits; this is a trend with no pass/fail or flight-safety meaning.
- Corrected literal encoding artifacts in the Flight convergence card, launch
  environment metrics, engineering-report residual units, and benchmark unit
  labels so arrows, middle dots, and SI exponents render as intended. Added a
  source-level regression guard for user-facing mojibake.
- Fixed the CI/runtime portability failure hidden by newer local Node versions:
  `npm test` now opts into Node 22's erasable TypeScript loader before running
  the direct `.ts` regression imports, with a source-level contract test. This
  changes no simulation equations or validation status and does not trigger a
  remote workflow by itself.
- Added a versioned device-local display-preferences record for the selected
  2D / 3D presentation mode and 2D azimuth. These preferences restore the
  user's workspace without entering the engineering project snapshot,
  configuration fingerprint, share link, or exported report. Invalid browser
  records fall back to the documented defaults and remain visible as a
  persistence warning.
- Added direct keyboard view shortcuts: `1` for 2D, `2` for 3D skeleton, and
  `3` for 3D final. The shortcuts are ignored while focus is inside a form
  control and are also discoverable through the command palette and ARIA
  `aria-keyshortcuts` metadata.
- Added an independent half-step numerical convergence diagnostic to the fast
  vertical-flight estimate. The Flight workspace now compares apogee, peak
  speed, peak dynamic pressure, impact availability, and event timing with
  explicit heuristic thresholds; stale fingerprints hide old diagnostics, and
  replay failures remain `not-assessed` rather than becoming a pass. This is
  numerical sensitivity evidence only, not physical validation or a
  flight-safety gate.
- Extended the independent U.S. Standard Atmosphere layer implementation from
  20 km to the published 84.852 km geopotential boundary (about 86 km
  geometric). The launch-environment provider, surface-observation anchor,
  vertical model, and coupled loads now share the extended range; upper-layer
  anchors and geometric/geopotential conversion limits are regression-tested.
- Added a focused vehicle presentation layer to the design workbench. The mode
  selector now distinguishes 2D, 3D skeleton, and 3D final display states; the
  skeleton is an intentionally low-ink rendering of the same independent
  preview mesh. Design inspector geometry fields now pair exact numeric entry
  with keyboard-accessible range sliders, and the 2D canvas includes a vertical
  azimuth rail with a live degree readout. The canvas uses a restrained
  graphite instrumentation field so the vehicle occupies more of the viewport
  without implying a change to the engineering models.
- Added structural and aeroelastic benchmark anchors to the deterministic
  evidence lane. Thin-wall shell area, axial stress, Euler critical load,
  fin-root bending, and the preliminary fin-flutter relation now have fixed
  closed-form recomputations; these remain regression evidence rather than
  experimental, certification, or flight-safety validation.
- Added a shared-grid detached-body flight track. Released bodies now have an
  independent fourth-order point-mass propagator that advances all branches
  together against common gravity, atmosphere, and wind queries, carries
  balanced event-level velocity corrections only into that explicit track,
  and reports continuous pairwise COM diagnostics. Contact, collision,
  aerodynamic interference, plume interaction, and flight-safety claims remain
  outside the model.
- Added a deterministic mission-event allocator for coupled flight. Rail,
  separation, ignition, failure, recovery, and custom transitions now carry
  semantic priorities and optional dependency edges; simultaneous groups,
  conflicting time hints, cycles, and competing commands remain explicit in
  the run diagnostics and engineering report.
- Added a validated altitude-dependent mean-wind editor. Users can switch
  between the deterministic synthetic profile and up to 32 strictly ordered
  local-ENU layers; custom profiles persist through autosave, history, share
  links, landing scenarios, vertical/coupled previews, and engineering reports
  with an explicit `user-supplied-unvalidated` provenance state. Loading a
  saved/template/shared project now also restores launch-site name and WGS84
  coordinates alongside altitude.
- Launch environment provenance is now editable in the Flight inspector:
  site name plus WGS84 latitude/longitude flow through local snapshots, share
  links, landing-zone sampling, coupled environment providers, and engineering
  reports. Legacy snapshots keep the ARC 54 synthetic-range defaults.
- Added explicit per-stage detached recovery plans. Upper stages and booster
  sets can carry an independent canopy with bounded diameter and deployment
  delay, and detached branches now command that device at their own apogee
  instead of silently falling back to a recovery-free path. The result keeps
  recovery-load warnings and remains an analytical component check only.
- Completed the public-branding pass across the mission console: the mark and
  mission identifier now use RocketWorks nomenclature, and visible model badges
  translate legacy internal prefixes without changing compatibility schemas or
  persisted project data.
- Added a browser-native `Install RocketWorks` handoff card. It uses the
  browser-owned install prompt when available, detects standalone launches, and
  remains dismissible without implying offline simulation or native-binary
  support.
- Added an original ASCII STL reference-mesh export for the selected nose,
  airframe, nozzle, and repeated fin geometry. The export uses millimetres,
  deterministic triangulation, and an explicit preview-only manufacturing
  warning. Multi-stage serial, parallel, and repeated instances now retain
  their validated axial/radial offsets in the same mesh; it does not claim
  toleranced solids, slicer readiness, or structural validation.
- DXF side profiles and OpenSCAD references now consume the same topology-aware
  stage parts. DXF projects radial Z out of its 2D view with an explicit note;
  OpenSCAD keeps full 3D radial placement in uniquely named stage modules.
- Project autosave and manual history checkpoints now persist the validated
  vehicle topology alongside editable inputs. Configuration fingerprints and
  change labels include stage structure and geometry, and restoring a modern
  checkpoint restores its topology without deleting later entries; legacy
  checkpoints retain the current topology safely.
- Project history now also persists the selected motor and aerodynamic source
  IDs. Browser startup restores those selections when the local libraries have
  the records, while missing records fall back explicitly to synthetic motor or
  constant drag and remain visible as a source warning.
- Engineering Markdown reports now include the selected motor and aerodynamic
  source IDs alongside their existing provenance and depletion-source fields.
- Added validated per-stage body length, diameter, and nose-length overrides
  to the browser topology editor. Generated stage geometry, serial placement,
  envelope checks, fin scaling, mass properties, and aerodynamic reference area
  now use one consistent stage envelope; older topology records retain their
  role-based defaults.
- Expanded the on-demand benchmark lane with deterministic rigid-body 6DOF
  constant-force translation, torque-free energy and world-angular-momentum
  conservation, and quaternion-normalization fixtures. These are mathematical
  regression signals only and do not upgrade the coupled model to flight-safe
  or experimentally validated status.
- Validated measured-flight CSV imports now persist the raw log and source name
  in a bounded, versioned browser-local record. Restored logs are labeled in
  the Flight workspace; malformed or oversized records are ignored, and a
  replacement parse failure no longer erases the previous valid log.
- Added optional positive measured mass-flow histories to standalone and
  multi-stage motor inputs. Histories are validated, linearly interpolated,
  integrated into live propellant mass and inertia rate, surfaced with a
  depletion-source label, and kept separate from the independent thrust curve.
  The browser motor-library form now accepts a strict optional
  `time_s,mass_flow_kg_s` CSV; residual propellant and measurement limitations
  remain explicit.
- Engineering-report exports now carry the selected propellant depletion source
  and integrated measured outflow when available, keeping report provenance
  aligned with the live motor model.
- User motor records with measured histories can now export the same strict
  mass-flow CSV alongside their thrust CSV and RASP/ENG interchange file.
- Narrow-screen layouts keep command search and beginner/expert mode controls
  reachable instead of hiding the only paths to advanced workbench actions.
- Command search now exposes an explicit accessible combobox/listbox contract
  for screen readers and keyboard navigation.
- Expanded coupled stage-flight uncertainty to sample additional motor/stage
  ignition delay, annotated separation impulse, and initial launch-alignment
  perturbations. Variants wrap event updates without mutating the base project;
  rail alignment failures remain visible as failed scenarios and no sampled
  distribution is treated as flight-safety evidence.
- Added an event-level coupled separation impulse allocator. It distributes
  minimum-norm detached-body velocity corrections across supplied point-mass
  moment arms, reports linear/angular residuals and resolved-constraint count,
  and keeps the correction telemetry-only rather than silently changing the
  existing flight branches. Time-propagated multi-body aerodynamics remain
  explicitly out of scope.
- Refined retained/detached and multi-body separation diagnostics with a
  continuous piecewise-linear closest-approach pass over the union of both
  traces' sample times. Between-sample crossings are now surfaced instead of
  being hidden by the integration cadence; this remains a center-of-mass
  diagnostic, not a contact or flight-safety solver.
- Expanded the coupled trace inspector and CSV export with aerodynamic-force,
  static-plus-damping moment, damping-moment, coefficient-basis, and direct
  table-application telemetry. The new series come directly from per-state
  load diagnostics and remain engineering-preview outputs.
- Added separate coupled-flight uncertainty scales for direct body-axis force
  and static-moment databases. The factors feed seeded dispersion runs without
  silently scaling legacy drag, relation-based normal force, or damping terms.
- Added optional direct body-axis force and static moment coefficient volumes.
  Provenance-qualified `C_axial/C_normal/C_side` and `C_roll/C_pitch/C_yaw`
  datasets now drive the 6DOF aerodynamic load result with declared moment
  reference lengths, diagnostics, and explicit fallback behavior; this remains
  a coefficient-driven engineering preview, not a CFD or flight-safety model.
- Added optional angle-of-attack and sideslip coefficient volumes to the
  provenance-qualified aerodynamic library. Volumes interpolate in signed
  angular axes plus Mach/Reynolds, propagate into stage-aware flight loads,
  preserve explicit bounds and uncertainty, and remain clearly separate from
  a nonlinear CFD or flight-safety model.
- Added an instantaneous separation impulse audit to staged previews and
  engineering reports. Each detached event now checks mass-ratio linear
  momentum balance and reports first-order angular impulse that the current
  branch does not synthesize, with explicit unavailable/review states and no
  claim of a coupled separation solver.
- Added a preliminary, independent fin-flutter screen to the structural review.
  The browser and engineering reports now show the NACA-TN-4197-style
  thin-plate flutter speed, safety margin, local atmosphere, and explicit
  unavailable/review states; body-fin coupling, transonic effects, damping,
  joints, and qualification evidence remain out of scope.
- Added an independent recovery opening-load screen to the coupled stage-flight
  view. It reports trace coverage, peak dynamic pressure, quasi-steady `q Cd A`
  drag, trapezoidal inflation impulse, and a force-rate proxy while explicitly
  excluding opening shock, snatch force, lines, fabric, canopy geometry, and
  structural qualification.
- Added a conservative spherical-envelope separation screen driven by original
  component geometry. Staged previews now distinguish center-of-mass path
  divergence from fixed-radius potential overlap, preserve missing-geometry
  states, and keep contact, plume, interference, and range-safety analysis out
  of scope.
- Added a display-only exploded assembly mode to the 3D design viewport. Users
  can separate component or legacy stage display instances along the vehicle
  axis, keep stage filtering and surface selection, and toggle the view with
  an accessible control or the `E` key; integrated CG/CP markers are hidden in
  exploded mode so display transforms cannot be mistaken for engineering
  inputs.
- Rebranded the public workbench, browser shell, exports, documentation, and
  repository metadata as RocketWorks while retaining versioned `kestrel-*`
  schema/model identifiers for existing project compatibility. Added an
  accessible Mach/Reynolds coefficient-grid inspector with declared uncertainty
  and provenance readouts.
- Fixed staged-preview failures after a core separation when the retained
  payload/recovery allowance consisted of collinear point masses with zero
  axial inertia. The browser now adds a versioned compact-package inertia
  placeholder, with an explicit warning that retained geometry is still not
  modeled.
- Added an aggregate multi-body center-of-mass separation diagnostic for staged
  previews. It checks every retained/detached and detached/detached trace pair
  from the later release time, reports the closest assessed pair, and remains
  explicitly outside body-envelope, collision, aerodynamic-clearance, and
  range-safety analysis.
- Added a clean-room, single-record RASP/ENG motor interchange path. Users can
  import a public-format motor header and thrust curve with their own
  provenance, export local records as `.eng`, and keep third-party motor files
  out of the repository and browser bundle.
- Extended measured-flight CSV comparison to select the current vertical 1D or
  coupled 6DOF trace, normalize duplicate stage-event timestamps, derive a
  clearly qualified diagnostic acceleration channel, and include trace-source
  provenance in residual exports.
- Bumped the shared uncertainty model to 0.4.0 and added opt-in,
  positive-definite Gaussian-copula correlations that preserve declared
  marginal distributions for Monte Carlo and Latin-hypercube ensembles.
- Bumped the vertical and coupled stage-flight uncertainty adapters to expose
  declared correlation pairs and their dependence-model caveats in results and
  engineering reports; browser defaults remain independent.
- Added a browser Dependence model editor that persists validated correlation
  pairs through local checkpoints, share links, and portable project JSON, with
  adapter-specific filtering and explicit scope hints.
- Added an opt-in finite-sample robust optimization screen for vertical flight:
  each candidate can be replayed across seeded uncertainty scenarios, ranked by
  explicit P05/P95 metrics, and constrained by observed scenario failure rate.
  The browser labels this as a risk screen rather than a reliability claim.
- Added persisted vertical uncertainty controls: users can choose 16–512
  Latin-hypercube scenarios and a reproducibility seed, with stale-result
  detection and round-trip support through local history, share links, and
  portable project JSON.
- Added an installable PWA manifest, standalone viewport metadata, original
  RocketWorks app artwork, and a deliberately network-only service worker as
  the first browser-to-desktop portability layer; offline caching and native
  wrappers remain explicitly out of scope for this increment.
- Added a deterministic uncertainty-sample CSV export with model/method/seed
  provenance, stable input/output columns, null-output cells, and retained
  evaluator errors. Stale vertical results are blocked from export until the
  current persisted ensemble settings are rerun.
- Added a browser-local Flight run comparison panel. Users can pin a current
  vertical estimate, change the design or environment, rerun, and inspect
  apogee, speed, maximum-q, timing, and impact-speed deltas. The panel labels
  stale results and does not persist or upgrade them into validation evidence.
- Bumped the vertical uncertainty adapter to 0.3.0. Recovery scenarios now
  include a Bernoulli deployment outcome, a `recoveryDeployed` metric and
  threshold, and an additive delay-offset interpretation clamped at zero so
  bounded negative timing samples cannot become hidden evaluator failures.
- Added an in-memory measured-flight CSV comparison workflow. Strict SI
  parsing, linear trace interpolation, residual sign conventions, matched
  coverage, RMSE/P95 discrepancy metrics, and timestamp warnings are exposed
  without turning agreement into validation or flight-safety evidence.
- Added a retained-versus-detached center-of-mass separation diagnostic to
  staged previews. The path comparison reports minimum distance, release
  relative speed, and time-coverage status without presenting geometry-free
  results as collision or range-safety clearance.
- Added an on-demand deterministic physics benchmark suite for standards
  anchors and closed-form atmosphere, gravity, thrust, and static-aero
  fixtures. Passing cases remain regression evidence, not experimental
  validation or flight-safety evidence.

- Continue independent model validation, stage-aware review, and public
  documentation.
- Added a persisted local-ENU wind azimuth control (0° east, +90° north) to
  the browser environment. The same rotated altitude-dependent profile now
  feeds vertical estimates, landing-drift scenarios, coupled 6DOF previews,
  project history, and portable inputs; older snapshots default to 0°.
- Bumped the coupled stage-flight preview to 0.8.0 and integrated the
  independent recovery-load model into retained-vehicle 6DOF/rail loads, with
  apogee command events, canopy-area/drag trace telemetry, and explicit
  detached-stage recovery scope limits.
- Bumped the coupled uncertainty adapter to 0.2.0 and added bounded recovery
  reference-area variation, deployment-outcome scenarios, and peak
  recovery-drag/effective-area metrics.
- Added independently keyed repeated physical stage instances to the original
  multi-stage model: per-copy ignition/failure/separation state, burnout event
  targeting, nested diagnostics, and live per-copy mass-property lookup while
  preserving logical stage topology for aerodynamic regimes.
- Bumped the stage-flight preview contract to 0.7.0 and added per-copy event
  telemetry plus one bounded separated-body trajectory per detached physical
  stage instance.
- Added mass-ratio equal-and-opposite linear-momentum impulses to detached
  stage branches when a retained-body separation delta-v is configured; the
  instantaneous two-body assumption, missing impulse fallback, and remaining
  mechanism limitations are exposed in telemetry and the browser UI.
- Added a shared, validated piecewise-linear recovery reefing schedule to the
  6DOF recovery loads and landing-descent models, including explicit reefing
  phase/fraction telemetry and caution applicability messaging. Empty schedules
  preserve the prior smooth-inflation behavior.
- Exposed the reefing schedule as validated portable project inputs and Flight
  workspace controls, and propagated the declared area ramp through the fast
  vertical preview, landing dispersion, trace CSV, and model assumptions. The
  browser defaults remain full-open for backward-compatible projects.
- Added stage-aware metadata, grouped stage visibility controls, and projected
  stage selection to the original display-only 3D viewport; visibility changes
  never alter engineering inputs or results.
- Added component-instance display geometry for expanded assembly axisymmetric
  profiles, fin sets, and point-mass markers, with component-aware picking and
  explicit display-only qualification.
- Added validated browser design-share links for editable inputs and stage
  topology; local motor/aerodynamic source data remain unbundled and missing
  references fall back with an explicit review note.
- Added bounded isotropic point-drag propagation for separated stages when a
  topology-specific drag coefficient and reference area are available, with a
  visible gravity-only fallback when that basis is missing.
- Added bounded per-stage motor cant and azimuth controls; radial instances
  rotate the cant direction and feed the resulting unit axes into the staged
  propulsion model.
- Added a ranked apogee-sensitivity view to the dispersion card with signed
  Spearman bars and paired-sample counts.
- Added a visible flight-heading badge showing whether the nominal drag basis
  is the selected Mach--Reynolds table or the explicit constant-Cd fallback.
- Added bounded launch-rail inclination and ENU azimuth controls; the coupled
  preview now aligns the initial attitude and hands the angled rail state into
  free flight.
- Added angle-of-attack and signed-sideslip diagnostics to the coupled trace
  inspector and staged CSV export, with explicit degree units.
- Added bounded per-motor cluster-failure topology controls; failed motors keep
  their attached dry/propellant mass, contribute no thrust or depletion, and
  remain visible as explicit warnings and ignition-failed phases.
- Added staged motor-state diagnostics to the coupled Flight card and
  engineering report, with nominal/watch/failed statuses and retained
  propellant visibility.
- Added projected 3D surface picking and selection highlights so clicking the
  nose, airframe, fins, or nozzle keeps the design inspector synchronized.
- Expanded the display-only 3D scene from a single vehicle into the saved
  enabled serial and radial topology instances, including scale, offset, and
  repeated-stage rotation.
- Added bounded body-frame +X separation delta-v controls to topology stages;
  the retained-body 6DOF event applies the configured delta-v and records
  body-frame/world-frame release telemetry in the timeline and separated-body
  result while preserving the explicit non-coupled discarded-body limit.
- Bumped the rigid-body, separated-body, multi-stage, and stage-flight model
  versions to expose the new event semantics in exported provenance.
- Added a clean-room moist-air atmosphere slice: relative humidity now drives
  water-vapor partial pressure, virtual temperature, density, sound speed, and
  Reynolds-number inputs across the browser preview, while condensation and
  humidity-dependent viscosity remain explicit limitations.
- Added persisted pad-pressure and pad-temperature observations. The shared
  surface-weather anchor now feeds the fast vertical trace, launch environment,
  landing-dispersion scenarios, engineering report, and expert diagnostics.

## 0.1.0-preview — 2026-08-09

- Added a graphite/telemetry-blue browser workbench with 2D and display-only 3D
  design views, keyboard workflows, templates, local history, and artifact
  exports.
- Added original component, mass-property, static-aerodynamic, clustered,
  staged, launch-rail, recovery, environment, uncertainty, optimization, and
  preliminary structural-screen models.
- Added local provenance-aware motor and Mach–Reynolds aerodynamic libraries.
- Coupled selected aerodynamic tables into the fast vertical estimate and the
  topology-aware 6DOF preview with explicit applicability warnings and fallback
  behavior.
- Added interactive vertical and staged trace inspectors, including Mach,
  dynamic pressure, axial drag, event markers, and portable CSV fields.
- Added validated RocketWorks project import/export, Markdown engineering reports,
  DXF/OpenSCAD reference exports, and separated-body ballistic component
  checks.
- Established the clean-room boundary: no OpenRocket source, engine, UI,
  assets, databases, or backend components are bundled or reused.
## Unreleased

- Added a seeded coupled stage-flight uncertainty adapter and Flight workspace
  envelope for mass, propellant, thrust, drag, and wind dispersion. Samples
  retain full errors, event counts, separated-body branches, sensitivity, and
  split-sample convergence diagnostics.
- Added an explicit drag-only scale hook for constant and Mach--Reynolds
  topology sources; normal-force and damping terms remain nominal and the
  assumption is surfaced in the model contract.
