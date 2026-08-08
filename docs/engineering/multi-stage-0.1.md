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
axis, and application point.

The result supplies the 6-DOF kernel with one consistent, state-dependent:

- total mass, center of mass, central inertia tensor, and inertia-tensor rate
- attached-stage set and stage/motor phase diagnostics
- body-frame thrust force and moment about the instantaneous center of mass
- event state for ignition command, ignition failure, and separation

This makes staging a topology change rather than a cosmetic event: a separated
stage immediately stops contributing mass, inertia, propellant, or thrust to
the retained vehicle.

## Discrete state and phases

The 6-DOF discrete-state map owns piecewise-constant staging keys:

- `staging.<stage>.ignitionTimeS`
- `staging.<stage>.ignitionFailed`
- `staging.<stage>.separated`
- `staging.<stage>.separationTimeS`

An ignition command records the exact event time. Motor-local time is the
vehicle time minus stage ignition time and the motor's configured delay. Stage
phases are `waiting`, `ignition-delayed`, `burning`, `burned-out`,
`ignition-failed`, and `separated`.

Scheduled event helpers support absolute-time ignition, failure, and
separation. Model-bound state-event helpers locate stage burnout plus an
optional deterministic delay, then either separate the source stage or ignite
a target stage. Failed or already separated source stages cannot synthesize a
later burnout transition. Simultaneous burnout events use the 6-DOF kernel's
declared event order.

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
burned-out, or separated motor produces zero force and moment.

## Separation semantics

Version 0.1 propagates only the retained vehicle. A separation event changes
the retained mass and inertia while preserving its position, velocity,
orientation, and angular velocity. This represents an ideal, zero-impulse
release where the retained body has no instantaneous velocity reset.

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
- prevention of false burnout transitions after ignition failure
- exact scheduled ignition, failure, and separation changes
- inertia-tensor rate against centered finite differences
- end-to-end stage switching in the coupled 6-DOF kernel
- propulsion-adapter force, moment, and live-CG consistency
- explicit rejection of invalid configuration and discrete state

These checks validate equations and software state transitions, not physical
flight performance.

## Known limitations

- Propellant depletion is proportional to delivered impulse, not measured mass
  flow or geometry-based grain regression.
- Ignition delay and stage-event delays are deterministic. No distributions,
  misfire probabilities, partial ignition, pressure buildup, or thrust
  uncertainty are included.
- Separation is instantaneous and removes the source stage from one tracked
  body. The discarded stage is not spawned or propagated.
- Pyrotechnic and spring impulses, joint forces, tip-off, flexure, plume
  impingement, wake interaction, collision, and recontact are absent.
- Stage-aware aerodynamics 0.1 now reconfigures retained-body geometry, CP,
  reference area, and drag by attached-stage topology. Separation proximity
  aerodynamics remain outside both models.
- Motor and vehicle data must be measured, user supplied, or appropriately
  licensed. Kestrel does not bundle an OpenRocket motor or component database.

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

## Next work

Add optional measured mass-flow histories, explicit separation impulses, and a
multi-body branch that spawns discarded stages. Monte Carlo event uncertainty
should then vary
ignition delay, failure, separation impulse, thrust, mass, and alignment while
preserving deterministic reproducibility from a recorded random seed.
