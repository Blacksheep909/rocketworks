# Clustered propulsion loads 0.1

Status: analytical component checks only. This model is not validated for
flight-safety decisions.

This is an original clean-room implementation of public force and moment
mechanics. It contains no OpenRocket source, simulation code, UI code, motor
database, assets, or backend components.

## Purpose

The clustered propulsion layer converts the independently timed motor thrusts
from RocketWorks' propellant mass model into one body-frame force and moment for
the rigid-body flight kernel. It supports centerline motors, pods, strap-on
boosters, and canted multi-motor clusters using original configuration data.

Each motor has exactly one mount with:

- the matching motor identifier from the mass-state model
- a fixed body-frame thrust application point
- a fixed body-frame thrust-axis vector, normalized during configuration

Every mass-model motor must have one mount and no unknown or duplicate mount is
accepted. This prevents silent omission or double application of thrust.

## Frames and equations

RocketWorks body `+x` runs from nose to tail. A conventional aft motor producing
forward thrust therefore normally uses an axis near body `-x`. Body `y` and `z`
complete the right-handed transverse frame.

For motor `i`, scalar net thrust `Ti`, configured unit axis `ei`, application
point `pi`, and instantaneous combined center of mass `R`:

`Fi = Ti ei`

`ri = pi - R`

`Mi = ri cross Fi`

The cluster result is:

`F = sum(Fi)`

`M = sum(Mi)`

Reported total thrust is `sum(Ti)`, the sum of motor magnitudes. With canted
axes this is not the same as `|F|`; both scalar total and net force vector are
exposed so the distinction remains visible.

The center of mass is evaluated from the shared mass-state model at every load
query. An asymmetric burn can therefore move the center of mass and change the
moment arm while thrust is active. The motor's dry and propellant mass-property
locations remain separate configuration inputs and must agree physically with
the mount location.

## Coupling

The preliminary rocket load model now accepts exactly one propulsion source:

- a scalar thrust curve and one axis
- a scalar time-dependent thrust provider and one axis
- a motor-specific clustered propulsion provider

The clustered path adds its net force to aerodynamic body force and its thrust
moment to aerodynamic moment. Gravity remains a world-frame force. Diagnostics
expose scalar total thrust, net body force, and net body moment separately.

## Automated checks

The regression suite verifies:

- symmetric axial motors double force and cancel moment
- delayed ignition creates the expected asymmetric force and live-CG yaw moment
- a configured failed motor keeps its propellant mass attached while removing
  its thrust, depletion, and burnout contribution
- canted axes are normalized and symmetric transverse force cancels
- moment calculation uses the instantaneous combined center of mass
- an off-axis motor rotates the coupled variable-mass 6-DOF body
- force, moment, and diagnostics survive rocket-load composition
- missing, duplicate, unknown, zero-axis, ambiguous, and non-finite
  configurations fail explicitly

These checks validate equations and software coupling, not real motor mounts or
flight behavior.

## Known limitations

- Thrust axes and application points are fixed. Gimbals, flexure, mount
  compliance, and nozzle motion are absent.
- Per-motor failure can be configured deterministically, but ignition
  probability, partial ignition, thrust variation, temperature effects, and
  correlated cluster uncertainty are absent.
- Scalar thrust histories must already include exhaust momentum and nozzle
  pressure thrust.
- No plume interaction, base-pressure interaction, jet damping, or thrust
  augmentation is modeled.
- Each configured motor has one resultant application point; multi-nozzle
  engines need separate future nozzle-level representation.
- Mass properties, mount geometry, and thrust alignment require measurement and
  independent verification for a real vehicle.

## Primary public references

- NASA Glenn, *Rocket Thrust Equation*, defines net rocket thrust from exhaust
  momentum and nozzle pressure:
  https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-thrust-equation/
- NASA CR-2012-217475, *Missile Aerodynamics for Ascent and Re-entry*, uses
  body-frame force and moment resultants in six-degree-of-freedom dynamics:
  https://ntrs.nasa.gov/api/citations/20130003336/downloads/20130003336.pdf
- NASA/CR-1998-208246, *Dynamics of Variable Mass Systems*, explains the
  coupling between changing mass distribution, forces, moments, and attitude:
  https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19980210404.pdf

## Next work

The next propulsion step should add per-motor thrust uncertainty, gimbal
schedules, and optional measured mass-flow histories. A mission orchestrator
should then expose cluster imbalance warnings and uncertainty envelopes in the
browser UI.
