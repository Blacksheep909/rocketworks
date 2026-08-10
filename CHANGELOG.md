# Changelog

All notable RocketWorks changes are recorded here. The project is still an
engineering preview, so entries describe implementation scope rather than
flight-readiness claims.

## [Unreleased]

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
