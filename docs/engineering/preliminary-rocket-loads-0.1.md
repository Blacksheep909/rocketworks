# Preliminary rocket force and moment coupling 0.3.1

Status: analytical component checks only. This coupling is not a validated
flight simulation.

This is an original clean-room implementation using public atmosphere,
gravity, thrust, drag, and slender-body relations. It does not contain or call
OpenRocket source code, simulation code, UI code, data, assets, or backend
components.

## Purpose

This layer connects RocketWorks' atmosphere, wind, thrust-curve, static-stability,
and rigid-body foundations without hiding their current limits. For any 6-DOF
state it returns:

- world-frame gravity
- body-frame thrust
- body-frame axial drag
- bounded body-frame normal force
- the normal-force moment about the center of mass
- atmosphere and flow diagnostics
- machine-readable applicability issues

Version 0.2 also accepts a state-dependent aerodynamic provider instead of the
four constant reference-area, drag, normal-slope, and CP-offset inputs. The
stage-aware aerodynamic adapter uses this path to switch geometry,
coefficients, CP, live CG, and applicability at exact topology events. Mixing
constant and dynamic aerodynamic inputs is rejected.

Version 0.3 adds optional diagonal roll, pitch, and yaw rate derivatives from a
dynamic provider. Each dimensionless derivative is converted to a body moment
with its configured reference length and the standard reduced-rate factor. The
diagnostics now carry dynamic viscosity, Reynolds number, damping moment,
coefficient uncertainty, and source provenance when available.

Version 0.3.1 adds a signed sideslip diagnostic to the flow condition and load
diagnostic. With body-forward speed `u = -Vbody,x`, lateral speed `v =
Vbody,y`, and total airspeed `V`, the reported angle is

`beta = asin(clamp(v / V, -1, 1))`

Positive sideslip is toward body `+y`. This readout is diagnostic only; it does
not introduce a new sideslip-dependent force or coefficient model.

The returned loads can drive the independent rigid-body integrator. The model
does not yet implement a launch rail, ground contact, recovery, or a complete
flight-event controller.

## Frames

The world frame is a local right-handed east-north-up frame:

- world `+x`: east
- world `+y`: north
- world `+z`: up

It is treated as non-rotating and Cartesian. Earth rotation, Coriolis effects,
curvature, geodesy, and transport rate are absent.

Vehicle geometry uses body `+x` from nose toward tail. The nose/forward flight
direction is therefore body `-x`. A supplied vertical-launch attitude maps body
`-x` to world `+z`.

## Atmosphere, wind, and gravity

Atmosphere density and speed of sound come from RocketWorks' independently
implemented U.S. Standard Atmosphere 1976 layer model. Geometric altitude is:

`hASL = launch altitude + world up position`

The atmosphere currently supports `-500 m <= hASL <= 20,000 m` and throws
outside that interval rather than silently extrapolating.

Wind is linearly interpolated by altitude and represented directly in ENU. The
air-relative velocity is:

`vair,W = vvehicle,W - vwind,W`

Gravity acts in world `-z`, with magnitude varying by altitude through the
inverse-square radius relation already used by the vertical model:

`Fg,W = [0, 0, -m g(h)]`

## Thrust

The thrust curve is linearly interpolated. By default the thrust vector acts in
body `-x`. A caller can supply another normalized body-axis direction.

The curve value is treated as net engine thrust. It must already represent
exhaust momentum and nozzle pressure thrust; the load layer does not infer
those terms from propellant mass loss.

The model may alternatively receive one finite non-negative thrust provider.
The impulse-based propellant model uses this path so thrust, remaining mass,
center of mass, inertia, and inertia rate share one motor timeline. Supplying
both a curve and a provider is rejected as ambiguous.

Version 0.2 also accepts a motor-specific clustered propulsion provider. It
supplies net body force and the thrust moment about the live combined center of
mass, allowing delayed pods, boosters, and canted clusters without collapsing
them onto one centerline axis. Exactly one scalar or clustered propulsion source
is permitted.

## Axial drag

For airspeed `V`, density `rho`, reference area `A`, and the user-supplied
coefficient `Cd`:

`q = 1/2 rho V^2`

`D = q Cd A`

The drag vector opposes the full body-frame air-relative velocity. Version 0.2
uses either a constant `Cd` or a state-dependent provider and always emits a
diagnostic explaining that intrinsic Mach and Reynolds prediction is absent.

## Small-angle normal force and moment

For the static normal-force derivative `CNalpha`, total angle of attack
`alpha`, and the same reference area:

`N = q A CNalpha alpha`

The transverse force opposes transverse air-relative velocity. Its moment is
computed at the static center-of-pressure lever arm:

`Mbody = (rCP - rCG) cross Nbody`

Normal force is enabled only when:

- airspeed exceeds the configured minimum
- flow is nose-first (`-Vbody,x > 0`)
- Mach does not exceed the configured low-speed limit

Angle of attack is bounded at the configured small-angle limit. Exceeding that
limit produces an `unsupported` issue; the bounded value prevents unlimited
linear extrapolation. Exceeding the Mach limit or entering reverse flow disables
normal force entirely. Axial drag remains, but its fixed coefficient is still
explicitly flagged.

This first coupling omits aerodynamic pitch, yaw, and roll damping. NASA's
missile-aerodynamics report emphasizes that damping is essential for tumbling
motion, so this model must not be used for that regime.

## Diagnostics

Each evaluation exposes:

- AGL and ASL altitude
- density and speed of sound
- wind and air-relative velocity in world and body frames
- airspeed, forward airspeed, Mach, and dynamic pressure
- angle of attack and signed sideslip
- thrust, weight, drag, and normal-force magnitudes
- whether normal force was applied
- structured applicability codes with severity and explanation

Current issue codes are:

- `LOW_AIRSPEED`
- `NON_FORWARD_FLOW`
- `ANGLE_OF_ATTACK_LIMIT`
- `MACH_LIMIT`
- `FIXED_DRAG_COEFFICIENT`
- `AERODYNAMIC_DAMPING_OMITTED`

## Automated verification

Tests cover:

- mapping the body nose axis to ENU up
- altitude-dependent gravity with zero aerodynamic load at rest
- drag magnitude and direction
- wind subtraction in ENU
- opposing transverse normal force
- restoring moment from an aft center of pressure
- Mach-limit suppression of normal force
- launch altitude plus world-up atmosphere lookup
- coupled upward acceleration from thrust exceeding weight
- exact attached-stage topology diagnostics from a dynamic aerodynamic provider
- topology-dependent area, drag, CP, CG, and static-margin handoff
- rejection of mixed constant and dynamic aerodynamic configuration

These verify equation wiring and sign conventions, not real-world trajectory
accuracy.

## Known limitations

- No launch rail, pad constraint, or ground contact
- No event controller for liftoff, burnout, apogee, deployment, or impact
- No aerodynamic damping derivatives
- No Mach- or Reynolds-dependent drag coefficient
- No transonic, supersonic, separated-flow, or reverse-flow normal-force model
- No angle-of-attack-dependent CP movement unless a direct coefficient database
  supplies a static moment volume
- No roll or fin-cant aerodynamics. A separate clustered propulsion adapter can
  supply fixed thrust misalignment and off-center thrust moments, but not
  gimbals, mount flexibility, or failure uncertainty
- Recovery-device loads are supplied by a separate composable recovery model;
  they are not added automatically by this aerodynamic/propulsion layer
- A separate launch-environment provider can supply deterministic Dryden-shaped
  turbulence and discrete gusts. Terrain, Earth rotation, and coordinate
  geodesy remain omitted.
- The impulse-based mass adapter can move CG and inertia under a documented
  uniform-depletion approximation. A dynamic provider can update the CP-to-CG
  lever arm, but neither layer models propellant grain geometry.

Do not use this model for flight-safety decisions.

## Primary public references

- NASA Glenn Research Center, *Drag Equation*. Defines
  `D = Cd rho V^2 A / 2`, dynamic pressure, and the need to match flow
  conditions when using a coefficient:
  https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/
- NASA Glenn Research Center, *Rocket Thrust Equation*. Defines rocket thrust
  from exhaust momentum and nozzle pressure:
  https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-thrust-equation/
- NASA CR-2012-217475, *Missile Aerodynamics for Ascent and Re-entry*.
  Develops force and moment equations for 6-DOF missile simulation and explains
  the importance of aerodynamic damping:
  https://ntrs.nasa.gov/api/citations/20130003336/downloads/20130003336.pdf
- James S. Barrowman, *The Practical Calculation of the Aerodynamic
  Characteristics of Slender Finned Vehicles*, NASA/TM-2001-209983. Supplies
  the static normal-force and center-of-pressure foundation consumed here:
  https://ntrs.nasa.gov/api/citations/20010047838/downloads/20010047838.pdf
- U.S. Standard Atmosphere, 1976, NOAA/NASA/USAF. Supplies the atmospheric
  layer definitions used by RocketWorks' atmosphere model:
  https://ntrs.nasa.gov/api/citations/19770009539/downloads/19770009539.pdf

## Next work

A physically coherent launch simulation needs a rail constraint that holds
translation and attitude until release criteria are met, an event/root-finding
controller, derived time-varying mass properties, and stronger experimental
validation of any direct force/moment database. The direct coefficient path is
still a transparent engineering-preview load source and does not replace
independent qualification or the remaining coupled separation work.
