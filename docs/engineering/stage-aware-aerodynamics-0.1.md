# Stage-aware aerodynamics 0.1

Status: analytical component checks only. This model is not validated for
flight-safety decisions or stage-separation clearance analysis.

This is an original clean-room implementation based on public aerodynamic and
rigid-body mechanics. It contains no OpenRocket source, simulation code, UI
code, aerodynamic database, assets, or backend components.

## Purpose

The adapter makes aerodynamic configuration follow the exact attached-stage
topology from Kestrel's multi-stage state. At every load evaluation it:

1. reads attached stages and instantaneous mass properties
2. selects one explicit aerodynamic regime for that exact topology
3. filters component geometry to attached and always-retained sections
4. recomputes reference diameter, area, normal-force slope, CP, and static
   margin from active geometry and live CG
5. supplies topology-specific drag and applicability limits to the rocket-load
   model

A separated stage therefore cannot continue contributing fins, body profile,
reference area, drag coefficient, or CP influence to the retained vehicle.

## Exact topology regimes

Each regime declares an unordered set of attached stage identifiers and exactly
one coefficient source: a constant drag coefficient with geometry-derived CP
and normal slope, or a Mach/Reynolds coefficient table. Optional regime values
can override reference diameter, reference length, damping lengths, and normal-
force applicability limits. Regime selection uses an exact canonical set match;
missing or duplicate topology definitions fail explicitly.

This avoids silently applying full-stack coefficients to an upper stage or
interpolating between geometrically different vehicles. The drag coefficient
must use the reference-area convention reported by that selected topology.

The browser topology editor can assign one saved coefficient table to each
stage. For an exact attached-stage set, one available assigned table is used;
conflicting or unavailable assignments fall back to the global table and emit
an explicit warning. This is a source-selection convenience, not a model of
combined-stage interference or a way to blend incompatible datasets.

Always-active geometry identifiers support payload, capsule, or retained nose
sections whose component grouping is outside the propulsive-stage list.

## Static force and moment state

For active topology `k`, dynamic pressure `q`, topology reference area `S(k)`,
drag coefficient `CD(k)`, normal-force slope `CNa(k)`, angle of attack `alpha`,
CP `xCP(k)`, and instantaneous CG `xCG(t)`:

`D = q S(k) CD(k)`

`N = q S(k) CNa(k) alpha`

`lCP-CG = xCP(k) - xCG(t)`

`M = rCP-CG cross N`

The existing static-aerodynamics 0.1 model derives `CNa` and `xCP` from active
axisymmetric profile changes and trapezoidal fin sets. The stage-aware adapter
does not increase that method's fidelity; it ensures the correct geometry and
live CG feed it after each topology event.

The preliminary rocket-load model now accepts either all four constant
aerodynamic inputs or one dynamic aerodynamic provider. Mixing the two is
rejected. Diagnostics expose the active stages, model version, reference area,
drag coefficient, normal-force slope, CP, CG, CP-to-CG arm, and static margin.

## Separation transition

The post-separation topology becomes active at the exact state reset. For a
configurable window after separation, the adapter emits an `unsupported`
`STAGE_SEPARATION_PROXIMITY` issue. The nominal post-separation coefficients
remain available for propagation, but the warning states that relative-body
position, plume, wake, and proximity interference are absent.

This is deliberate. NASA stage-separation programs use dedicated multi-body
force-and-moment databases with relative positions, attitudes, engine states,
and uncertainty; a single-body topology switch cannot represent that physics.

## Automated checks

The regression suite verifies:

- full-stack to upper-stage geometry, CP, diameter, area, and margin changes
- explicit unsupported status inside the separation transition window
- topology-specific dynamic rocket-load diagnostics
- drag-force scaling with topology `CD S`
- exact pre/post regimes at a scheduled 6-DOF separation event
- failure when an attached-stage topology has no exact regime
- always-retained geometry behavior
- rejection of mixed dynamic/static aerodynamic inputs
- rejection of unknown stages, duplicate topology sets, and invalid windows
- rendered stage hierarchy and configuration timeline in the browser UI

These are mathematical and software-coupling checks, not experimental
validation.

## Known limitations

- The underlying CP method remains low-speed, small-angle, slender-body
  preliminary analysis.
- Constant drag coefficients or externally sourced Mach/Reynolds tables are
  supplied per topology; Kestrel does not independently predict viscous, base,
  wave, or interference drag.
- Coefficients switch instantaneously and do not describe the moving separated
  bodies.
- Proximity aerodynamics, plume impingement, shock interaction, wake effects,
  control surfaces, unsteady cross derivatives, and aeroelasticity are absent.
- A complete regime table is required for every topology the simulation can
  reach.
- Geometry components must use stage identifiers consistent with the staging
  model or an explicit always-retained group.

## Primary public references

- NASA CR-2012-217475, *Missile Aerodynamics for Ascent and Re-entry*, develops
  body-axis aerodynamic forces, moments, CP effects, and 6-DOF coupling:
  https://ntrs.nasa.gov/api/citations/20130003336/downloads/20130003336.pdf
- NASA/TM-2020-220582, *Wind Tunnel Investigation of the Supersonic Stage
  Separation Aerodynamics of a Generic Two-Stage-to-Orbit Reusable Launch
  Vehicle Configuration*, demonstrates configuration-, proximity-, and
  Mach-dependent stage-separation forces and moments:
  https://ntrs.nasa.gov/citations/20200002873
- NASA/AIAA-2016-0798, *Space Launch System Booster Separation Aerodynamic
  Database Development and Uncertainty Quantification*, documents separate
  configuration data, relative-body variables, plume interactions, and
  uncertainty treatment:
  https://ntrs.nasa.gov/citations/20160007764
- NASA-20230017496, *Development of Aerodynamic Loads Databases for the Space
  Launch System Booster Separation Event*, describes nominal force-and-moment
  databases plus Monte Carlo uncertainty for separation trajectories:
  https://ntrs.nasa.gov/api/citations/20230017496/downloads/2024scitech_boosterSep_methods_v6.pdf

## Next work

Mach/Reynolds tables, interpolation provenance, uncertainty fields, and diagonal
body-rate damping are now available. Next add angle-of-attack and sideslip axes,
covariance metadata, and a multi-body separation solver that queries relative-
body aerodynamic databases rather than using this single retained-body warning.
