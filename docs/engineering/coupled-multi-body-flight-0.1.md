# Shared-grid coupled multi-body flight 0.4

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

An individual body may also opt into a rigid-body state by supplying a
body-to-world quaternion, body-frame angular velocity, and positive-definite
body-frame inertia tensor. That state is propagated on the same shared grid.
An optional body load callback receives the current rigid-body state and may
return body/world forces and a body-frame moment. The shared gravity and point
drag basis remains active; callback loads are additive and provenance remains
with the caller.

The mission end time and requested step are shared across all bodies. Release
times are inserted as exact trace points, and each body is advanced to the same
mission-time grid using partial steps where needed. The output includes a
trajectory for each body, terminal ground-crossing time, peak altitude and
speed, and a continuous pairwise center-of-mass diagnostic over overlapping
trace windows.

The optional `integration.method = "adaptive-rk4-step-doubling"` setting keeps
those output boundaries but subdivides each shared-grid interval internally.
Accepted/rejected internal steps, accepted-step range, and the maximum scaled
truncation estimate are returned in `result.integration`. Fixed RK4 remains the
default for compatibility.

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

When `attitudeDependentDrag` is supplied with a rigid-body state, the point
drag basis is replaced by a bounded projected-area blend. Let `c = |u . a|`
be the absolute alignment between the environment-relative flow unit vector
`u` and the body +X axis `a`:

```text
w_axial = c^2
w_cross = 1 - w_axial
A_eff = w_axial A_axial + w_cross A_cross
(Cd A)_eff = w_axial Cd_axial A_axial
           + w_cross Cd_cross A_cross
D = q (Cd A)_eff
```

The resulting force is `-D u`. The trace retains incidence angle, dynamic
pressure, effective reference area, effective Cd, and drag magnitude. This is
an explicit smooth interpolation between caller-supplied axial and broadside
coefficient/area pairs; it is not a lift or moment model. Bodies without this
option keep the constant isotropic point-drag path. A body cannot use this
option without a rigid-body attitude state.

The base `D = q Cd A` relationship and the dependence of drag on inclination
and reference-area convention follow NASA Glenn's public drag-equation
overview: <https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/>.
NASA also notes that coefficient values are normally established
experimentally; the RocketWorks projected-area blend therefore remains
`analytical-component-checks-only` until independently benchmarked.

The environment provider is queried at each Runge–Kutta substep for each
body, so atmosphere and wind can vary with time and position. Bodies share the
provider and grid but do not modify the environment. The default mode still
does not exchange forces. An opt-in mode integrates all active bodies in one
state vector and adds pairwise point-mass gravity:

```text
a_i,gravity = sum_j G m_j (r_j - r_i) / (|r_j - r_i|^2 + epsilon^2)^(3/2)
```

`G` is the documented standard gravitational constant used by the module.
The optional `epsilon` is a Plummer-style softening radius for close
approaches. With `epsilon = 0`, coincident bodies are rejected as a singular
state rather than silently inventing a force.

For bodies with the rigid-body option, the state additionally follows

```text
dq/dt = 1/2 q * [0, omega]
I d(omega)/dt + omega x (I omega) = M_body
```

where `q` is normalized after each Runge-Kutta state update, `I` is the
supplied constant inertia tensor, and `M_body` is the optional callback moment.
World-frame callback forces are combined with rotated body-frame forces before
the translational acceleration is evaluated.

Adaptive intervals compare one full RK4 step with two half RK4 steps. For each
active body's position, velocity, quaternion, and angular-rate components, the
refined/full difference is divided by Richardson's fourth-order factor of 15
and scaled by the configured absolute plus relative tolerance. An interval is
accepted only when the maximum normalized component error is at most one; a
minimum-step failure is reported rather than silently relaxing the tolerance.

## Coupling boundary

This is a simultaneous shared-environment and relative-motion track. The
default and mutual-gravity branches remain point-mass translation; the opt-in
rigid-body branch adds attitude and angular-rate propagation, and the
projected-area option adds only the bounded translational drag blend described
above. It is not a full contact or structural multi-body solver. It does not
infer lift, aerodynamic torque, body-to-body contact forces, collision
response, joint or spring compliance, plume interaction, wake/interference,
structural flexibility, separation mechanism dynamics, or range-safety
margins. Pairwise COM distance is a diagnostic, not clearance approval. Fixed
spherical envelopes remain a separate geometry screen.

The stage-flight adapter applies a solved minimum-norm release correction only
when the event-level separation allocator reports a balanced result. The
existing detached 6DOF branches remain unchanged, so the shared-grid track is
an explicit comparison/audit path rather than a silent state reset. The browser
exposes the mutual-gravity choice as an advanced released-body force model. The
stage-flight adapter forwards each detached stage's release attitude, angular
rate, and center-of-mass inertia into the shared audit track; it intentionally
does not duplicate the detached recovery/aerodynamic-moment loads there.

Adaptive step diagnostics describe numerical truncation only. They do not
validate the environment, supplied loads, geometry, separation mechanism, or
contact behavior.

## Step budget and status

The default maximum is 200,000 shared-grid steps. If a requested step would
exceed a caller-supplied budget, the integrator coarsens the effective step to
reach the requested mission end and marks the result `partial`. Ground impact
is terminal for that body; post-impact propagation is not inferred.
