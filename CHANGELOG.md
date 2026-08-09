# Changelog

All notable Kestrel Lab changes are recorded here. The project is still an
engineering preview, so entries describe implementation scope rather than
flight-readiness claims.

## [Unreleased]

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
- Added validated Kestrel project import/export, Markdown engineering reports,
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
