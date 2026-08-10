# Multi-stage vehicle and flight sequencing 0.1

Status: analytical component checks only. This model is not validated for
flight-safety decisions or separation-clearance analysis.

This is an original clean-room implementation based on public mass-property,
rocket-propulsion, and rigid-body mechanics. It contains no OpenRocket source,
simulation code, UI code, motor database, assets, or backend components.

## Purpose

The model tracks one retained flight vehicle as attached stages ignite, consume
propellant, burn out, fail to ignite, and separate. Each stage contains fixed
structural mass properties and one or more independently delayed motors. A
motor carries its own dry and propellant mass properties, thrust curve, thrust
axis, application point, and optional deterministic ignition-failure flag. The
browser topology layer can derive that axis
from a bounded stage-level cant angle and azimuth; repeated radial instances
rotate the azimuth with their placement.

The result supplies the 6-DOF kernel with one consistent, state-dependent:

- total mass, center of mass, central inertia tensor, and inertia-tensor rate
- attached-stage set and stage/motor phase diagnostics
- body-frame thrust force and moment about the instantaneous center of mass
- event state for ignition command, ignition failure, and separation

This makes staging a topology change rather than a cosmetic event: a separated
stage immediately stops contributing mass, inertia, propellant, or thrust to
the retained vehicle.

The current implementation is model version `kestrel-multi-stage-0.3.0`.
`RocketStage.instances` can describe physical copies of one logical stage.
When present, each copy has its own structure, motors, burnout offset, and
event state while `attachedStageIds` continues to expose the logical topology
used by the stage-aware aerodynamic adapter. `attachedStageInstanceIds` and
the nested `stage.instances` diagnostics expose the physical state.

## Discrete state and phases

The 6-DOF discrete-state map owns piecewise-constant staging keys:

- `staging.<stage>.ignitionTimeS`
- `staging.<stage>.ignitionFailed`
- `staging.<stage>.separated`
- `staging.<stage>.separationTimeS`
- `staging.<stage>.instances.<instance>.ignitionTimeS`
- `staging.<stage>.instances.<instance>.ignitionFailed`
- `staging.<stage>.instances.<instance>.separated`
- `staging.<stage>.instances.<instance>.separationTimeS`

An ignition command records the exact event time. Motor-local time is the
vehicle time minus stage ignition time and the motor's configured delay. Stage
phases are `waiting`, `ignition-delayed`, `burning`, `burned-out`,
`ignition-failed`, and `separated`.

Scheduled event helpers support absolute-time ignition, failure, and
separation. Separation events retain a body-frame delta-v annotation in the
applied rigid-body event trace so downstream previews can rotate it into the
current world frame without parsing labels. Model-bound state-event helpers locate stage burnout plus an
optional deterministic delay, then either separate the source stage or ignite
a target stage. Supplying an `instanceId` targets one physical copy; omitting
it preserves the legacy logical-stage operation and applies to every copy.
Source and target instance IDs can also be paired for repeated serial groups.
Failed or already separated source stages cannot synthesize a later burnout
transition. Simultaneous burnout events use the 6-DOF kernel's declared event
order.

## Mass and propulsion equations

For motor thrust `T(t)`, total impulse `J`, delivered impulse `J(t)`, and
initial propellant mass `mp0`:

`f(t) = clamp(1 - J(t) / J, 0, 1)`

`mp(t) = mp0 f(t)`

During the active curve interval:

`mp_dot(t) = -mp0 T(t) / J`

Only attached motor, propellant, structural, and retained-vehicle properties
are combined with the parallel-axis theorem. Propellant central inertia scales
with its remaining mass fraction. The combined inertia rate uses the same
uniform-depletion expression documented by the propellant-mass model.

For motor `i`, scalar thrust `Ti`, unit body axis `ei`, application point `pi`,
and live combined center of mass `R`:

`Fi = Ti ei`

`Mi = (pi - R) cross Fi`

Clustered, canted, and delayed motors are summed. A failed, uncommanded,
burned-out, or separated motor produces zero force and moment. A configured
motor ignition failure retains its dry mass and full propellant mass while
attached; it also does not extend the stage burnout offset, which is based on
motors that can actually burn.

## Separation semantics

Version 0.3 changes the retained mass and inertia while preserving its
position, velocity, orientation, and angular velocity. This represents an
ideal, zero-impulse release where the retained body has no instantaneous
velocity reset. The `stageMassProperties(state, stageId)` adapter exposes the
detached stage's live structural, dry-motor, and remaining-propellant
properties at the event state so a caller can construct a separate component
check without reimplementing the staging equations. Passing the optional
`instanceId` returns one still-attached physical copy; omitting it combines all
attached copies of that logical stage.

The stage-flight browser adapter uses that lookup to launch a bounded
trajectory for each newly detached stage. It offsets the stage to its own
center of mass and carries the parent angular-rate contribution into the
release velocity. The result reports any retained-body separation delta-v in
body and world frames. When that delta-v is present, the adapter derives the
detached-body delta-v from equal-and-opposite linear momentum using the
retained and detached masses at the event; without an event delta-v the branch
explicitly remains a no-impulse fallback. The stage-flight adapter also runs
the versioned `separation-dynamics-0.1.md` conservation audit, which checks
the instantaneous linear momentum residual and exposes first-order angular
impulse rather than silently treating it as solved. This branch is not a
coupled multi-body solver and does not model drag beyond its optional bounded
point basis, plume interaction, separation mechanism, angular impulse
response, collision, recovery, or clearance.

It does not conserve the angular momentum of the pre-separation combined stack
inside the retained body alone; the discarded body carries away its share.
There is no claim that real separation hardware is impulse-free. Explicit
separation impulses can be composed as event state resets, but clearance,
contact, plume, and recontact analysis require simultaneous multi-body
propagation.

## Automated checks

The regression suite verifies:

- analytical attached, burning, and post-separation mass states
- root-found simultaneous burnout, separation, and upper-stage ignition
- independent deterministic separation and ignition delays
- delayed clustered motors and off-axis thrust moments
- ignition-failure suppression with intact propellant
- asymmetric cluster evaluation with one failed motor, retained propellant,
  and active-motor burnout timing
- independent ignition, burnout, separation, physical-copy attachment, and
  live mass-property checks for repeated stage instances
- prevention of false burnout transitions after ignition failure
- exact scheduled ignition, failure, and separation changes
- retained-body separation delta-v in the current body attitude
- instantaneous separation linear-momentum and angular-impulse audit
- inertia-tensor rate against centered finite differences
- end-to-end stage switching in the coupled 6-DOF kernel
- propulsion-adapter force, moment, and live-CG consistency
- canted motor axes remain finite, unit-length, and visible in stage topology
- explicit rejection of invalid configuration and discrete state

These checks validate equations and software state transitions, not physical
flight performance.

## Known limitations

- Propellant depletion is proportional to delivered impulse, not measured mass
  flow or geometry-based grain regression.
- Ignition delay and stage-event delays are deterministic. Per-motor failure is
  a configured preview switch, not a misfire probability; partial ignition,
  pressure buildup, and thrust uncertainty are not included.
- Separation is instantaneous and removes the source stage from the retained
  tracked body. A logical-stage separation removes all physical instances;
  instance-targeted separation removes only the selected copy. The optional
  separated-body preview is not suitable for clearance, range-safety, or
  flight-safety decisions. A bounded body-frame +X delta-v may be applied to
  the retained body and is surfaced as explicit event/trajectory telemetry;
  the adapter supplies the detached body's mass-ratio equal-and-opposite
  linear impulse when that annotation is present. The separate impulse audit
  reports linear residual and unmodeled angular impulse but does not correct
  either by synthesizing new state.
- Pyrotechnic and spring impulses, joint forces, tip-off, flexure, plume
  impingement, wake interaction, collision, and recontact are absent.
- Stage-aware aerodynamics 0.1 now reconfigures retained-body geometry, CP,
  reference area, and drag by attached-stage topology. Separation proximity
  aerodynamics remain outside both models.
- Motor and vehicle data must be measured, user supplied, or appropriately
  licensed. RocketWorks does not bundle an OpenRocket motor or component database.

## Primary public references

- NASA Glenn, *Mass Ratios*, defines full, empty, payload, structural, and
  propellant mass relationships and explains why changing launch-vehicle mass
  must be represented:
  https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/mass-ratios/
- NASA Glenn, *Ideal Rocket Equation*, derives the variable-mass momentum
  relation and connects propellant loss, thrust, and mass ratio:
  https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/
- NASA Glenn, *Flight to Orbit*, describes staging as discarding vehicle mass
  and commonly igniting an upper stage:
  https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/flight-to-orbit/
- NASA TM-2016-219384, *Development of Constraint Force Equation Methodology
  for Application to Multi-Body Dynamics Including Launch Vehicle Stage
  Separation*, documents why credible separation-clearance analysis needs a
  coupled multi-body constraint-force treatment beyond this topology reset:
  https://ntrs.nasa.gov/citations/20160010566

## Browser integration

The stage-flight preview adapter now composes this model with stage-aware
aerodynamics, launch environment, preliminary loads, and the 6-DOF integrator.
The browser topology editor supplies deterministic ignition and separation delay
inputs, a stage-level ignition-failure preview switch, and optional one-based
failed motor numbers for repeated clusters. The resulting Flight card reports
event topology and retains the status
`mathematical-regression-tests-only`.

The browser assembly now applies a topology-derived axial transform to serial
upper/payload stages and expands repeated parallel stages into radial geometry
instances before the stage-aware aerodynamic adapter runs. The mass-property
assembly and aerodynamic geometry therefore no longer place every stage at the
same origin. Radial static-aero effects are still projected into the current
axisymmetric/fin coefficient representation; lateral interference and
separation proximity remain outside the model.

The staged Flight workspace can now compose the independent launch-rail adapter
before this retained-body event sequence. Rail liftoff, stage events, rail exit,
and free-flight handoff are shown in one timeline; the browser defaults to a
fixed vertical effective rail and exposes its travel length as an explicit
preview input.

## Next work

Add optional measured mass-flow histories, measured separation impulses, and a
time-propagated coupled multi-body branch that resolves discarded stages,
relative-body aerodynamic databases, and momentum exchange. The current
event-level minimum-norm impulse allocator is diagnostic telemetry only and
does not replace that propagated branch.
Monte Carlo event uncertainty
should then vary
ignition delay, failure, separation impulse, thrust, mass, and alignment while
preserving deterministic reproducibility from a recorded random seed.
