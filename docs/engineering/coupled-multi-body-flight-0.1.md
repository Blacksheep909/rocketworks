# Shared-grid coupled multi-body flight 0.1

Status: implemented analytical component check; mathematical regression tests
only. This model is not flight-safety, range-safety, contact, or collision
validated.

## Contract

`lib/physics/coupled-multi-body-flight.ts` accepts one or more released body
records. Each record supplies a mass, exact release time, center-of-mass
position, release velocity, and optional constant reference-area/Cd basis. A
caller may attach an explicit world-frame velocity adjustment with a source
event identifier; the result retains both baseline and adjusted release
velocities.

The mission end time and requested step are shared across all bodies. Release
times are inserted as exact trace points, and each body is advanced to the same
mission-time grid using partial steps where needed. The output includes a
trajectory for each body, terminal ground-crossing time, peak altitude and
speed, and a continuous pairwise center-of-mass diagnostic over overlapping
trace windows.

## Equations and numerical method

The translational state is integrated with explicit fourth-order Runge–Kutta:

```text
dr/dt = v
dv/dt = [0, 0, -g(h)] + a_drag
```

Gravity uses the RocketWorks altitude-dependent gravity function. When both Cd
and reference area are present, point drag uses the environment-relative
velocity:

```text
F_drag = -0.5 * rho * |v - w|² * Cd * A * (v - w)/|v - w|
a_drag = F_drag / m
```

The environment provider is queried at each Runge–Kutta substep for each
body, so atmosphere and wind can vary with time and position. Bodies share the
provider and grid but do not modify one another's state or environment.

## Coupling boundary

This is a simultaneous shared-environment and relative-motion track. It is not
a full rigid-body multi-body solver. It does not model body attitude, lift,
aerodynamic torque, body-to-body contact forces, collision response, joint or
spring compliance, plume interaction, wake/interference, separation mechanism
dynamics, structural flexibility, or range-safety margins. Pairwise COM
distance is a diagnostic, not clearance approval. Fixed spherical envelopes
remain a separate geometry screen.

The stage-flight adapter applies a solved minimum-norm release correction only
when the event-level separation allocator reports a balanced result. The
existing detached 6DOF branches remain unchanged, so the shared-grid track is
an explicit comparison/audit path rather than a silent state reset.

## Step budget and status

The default maximum is 200,000 shared-grid steps. If a requested step would
exceed a caller-supplied budget, the integrator coarsens the effective step to
reach the requested mission end and marks the result `partial`. Ground impact
is terminal for that body; post-impact propagation is not inferred.
