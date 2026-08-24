# Shared-grid coupled multi-body flight 0.12

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
return body/world forces and a body-frame moment. A rigid body may additionally
provide `propertiesAt(state)` to replace its constant mass/inertia with a
caller-owned time-varying provider; the effective mass is retained in every
trace sample and an optional inertia-rate tensor participates in Euler's
angular-momentum equation. The shared gravity and point-drag basis remains
active; callback loads are additive and provenance remains with the caller.

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

## Retained-vehicle replay seed

The staged adapter exposes an additive `coupledMultiBodyIncludeRetainedBody`
option. When enabled, the first separation event adds a `retained-vehicle`
rigid-body trajectory to the shared grid alongside the detached bodies. Its
release position, velocity, attitude, angular rate, mass, and inertia are
copied from the staged event handoff. A load callback then interpolates the
authoritative staged trace's thrust, aerodynamic, and recovery world-force
vectors at the coupled state time; gravity, optional mutual gravity, and
optional envelope contact still come from this solver.

This is deliberately a translation-load replay diagnostic, not an independent
retained-stage simulation. It does not re-solve retained-stage propellant flow,
fresh aerodynamics, aerodynamic moments, separation mechanism dynamics, or later
mass-property changes after the first event. The browser labels the trajectory
and assumptions accordingly. The default remains detached bodies only, so
existing projects and comparisons retain their previous behavior unless the
option is explicitly enabled.

The staged adapter also accepts the explicit
`coupledMultiBodyRetainedBodyMode = "independent-mass-propulsion"` opt-in. This
keeps the first separation event as a state handoff, then evaluates the
clean-room staging `body` and fresh load callbacks at every shared-grid
substep. It therefore carries changing propellant mass/inertia, caller-supplied
thrust, active-topology aerodynamic force/moment loads, and retained recovery
force/moment loads into the shared track without replaying the authoritative
force trace. The preliminary model's world-gravity term is omitted from that
callback because the shared solver supplies gravity (and optional mutual/contact
terms) itself; body-frame propulsion/aero loads and recovery world/body loads
remain additive. Later authoritative state handoffs and body-frame velocity
impulses are inserted at exact shared-grid boundaries. It is intentionally
bounded: finite-duration separation mechanism dynamics, plume interaction, and
validated stage-to-stage interference are not re-solved. `"trace-replay"`
remains the default and existing projects are unchanged.

The generic solver exposes `velocityImpulseEvents` for caller-owned discrete
translation changes. Each event names a released body and exact mission time,
then supplies either `deltaVWorldMps` or `deltaVBodyMps` (never both). Events
are inserted into the shared grid, applied in declaration order for equal
timestamps, and retain optional `id`/`sourceEventId` provenance. Body-frame
vectors use the target's current quaternion at the event boundary. The result
returns canonical `appliedVelocityImpulseEvents`; an event targeting a body
after ground impact is skipped with an explicit warning. This is an
instantaneous state correction, not a finite-duration separation-mechanism or
angular-impulse solver.

## Optional finite-duration separation pulse

The generic solver also accepts an opt-in `separationMechanisms` list for a
bounded translational/angular mechanism preview. Each pulse names a distinct
retained and detached body, an exact `startTimeS`, a positive `durationS`, an
optional relative delta-v vector (world or retained-body frame), an optional
relative angular delta-omega vector (world or retained-body frame), and an
optional `constant` or `raised-cosine` profile. At least one target is required;
pulse boundaries are inserted into the shared grid.

For a current retained mass `m_r`, detached mass `m_d`, requested relative
delta-v `Δv_rel`, and duration `T`, the equal-and-opposite centre force is

```text
μ = m_r m_d / (m_r + m_d)
F_detached(t) = μ Δv_rel w(t) / T
F_retained(t) = -F_detached(t)
```

The constant profile uses `w(t)=1`; the raised-cosine profile uses
`w(t)=1-cos(2πt/T)`, whose integral is one over the pulse. Body-frame vectors
are rotated using the retained body's current attitude at each Runge–Kutta
substep, and dynamic mass providers are sampled as usual. Trace points expose
the applied world force, body-frame torque, magnitudes, and contributing pulse
count; the result returns the separation model identity, configured count,
active trace count, and maximum sampled force/torque.

For rigid retained and detached bodies, an angular target `Δω_rel` is converted
to a bounded world torque using their sampled inverse inertias:

```text
K = (I_r⁻¹ + I_d⁻¹)⁻¹
τ_detached(t) = K Δω_rel w(t) / T
τ_retained(t) = -τ_detached(t)
```

The torque pair is rotated into each body's current body frame before the
Euler angular-momentum equation is evaluated. RK4 boundary handling treats a
constant pulse as a half-open interval for integration while retaining explicit
boundary telemetry, avoiding duplicate endpoint impulse.

This is an analytical mechanism preview, not a pyrotechnic, spring, joint, or
plume solver. Translational force is applied at body centres; the optional
angular target is a sampled-inertia sensitivity term, not a joint torque or
hardware model. Compliance, shock, release timing uncertainty, contact
response, structural load, aerodynamic interference, and calibration against
mechanism tests or measured flight data remain outside the contract.

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

When `aerodynamicBasis` is supplied with a rigid-body state, the body receives
the clean-room detached-body load path in
`lib/physics/detached-body-aerodynamics.ts`. The basis retains the supplied
reference area and drag coefficient, and can optionally add a small-angle
normal-force relation, a CP-to-CG moment arm, an induced-drag polar, and
caller-supplied rate damping. Normal force is applied only for forward flow,
positive airspeed, and the declared angle/compressibility envelope:

```text
q = 1/2 rho V^2
C_N = C_N,alpha * f(M) * clamp(alpha, alpha_max)
N = q A C_N
M_static = r_CP-CG x F_normal
M_damping = q A / (2 V) * C_mq * omega * l_ref^2
```

The normal force opposes the transverse environment-relative flow in body
coordinates. Its trace records angle of attack, sideslip, dynamic pressure,
normal-force magnitude/application, static moment, damping moment, and the
versioned basis. This is a bounded relation. When the basis includes a
validated coefficient table, the shared-grid path queries its
Mach/Reynolds/angular surfaces at each sample and lets declared direct
force/moment volumes take precedence. It is still not a full lifting-body
model or an accuracy certification.

When `attitudeDependentDrag` is supplied inside that basis, the axial and
broadside CdA pairs are additionally blended by orientation. Let `c = |u . a|`
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

The resulting drag force is `-D u`; relation normal force and its moments are
then superposed when configured. The trace retains incidence angle, dynamic
pressure, effective reference area, effective Cd, and drag magnitude. This is
an explicit smooth interpolation between caller-supplied axial and broadside
coefficient/area pairs; it is not a calibrated lift or moment database. Bodies
without either opt-in basis keep the constant isotropic point-drag path. A
body cannot use an attitude-dependent basis without a rigid-body attitude
state.

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

For a body with a dynamic property provider, the solver uses the effective
mass at each evaluation time in its translational force balance and uses the
provided inertia and inertia-rate tensor for rotational dynamics:

```text
m(t) a = F_gravity + F_drag + F_contact + F_caller
I(t) ω̇ = M_caller - ω × (I(t)ω) - Ī(t)ω
```

The provider is a contract boundary, not an inferred propulsion model. A
changing mass value does not create thrust or exhaust momentum; caller-supplied
loads remain responsible for those terms. The provider must return finite,
positive mass and a positive-definite inertia at every sampled state.

## Optional spherical-envelope contact branch

`contact.enabled` adds a deliberately narrow force-feedback contract for the
shared released-body state vector. A pair participates only while both bodies
are active and both supply a positive `envelopeRadiusM`. For centre positions
`r_1`, `r_2`, radii `R_1`, `R_2`, and relative velocity `v_rel = v_2 - v_1`,
the penetration and inward closing speed are

```text
delta = max(0, R_1 + R_2 - ||r_2 - r_1||)
v_closing = max(0, -n . v_rel)
n = (r_2 - r_1) / ||r_2 - r_1||
```

An overlap receives equal-and-opposite centre-applied normal forces:

```text
F_n = min(F_max, k delta + c v_closing)
F_1 = -n F_n
F_2 =  n F_n
```

`k` is caller-configured stiffness in N/m, `c` is closing-speed damping in
N/(m/s), and `F_max` is a positive per-pair cap. Defaults are 50,000 N/m,
100 N/(m/s), and 1,000,000 N respectively; all values are bounded by the
module validator. The result reports model/status identity, maximum sampled
penetration, maximum observed force, pair count, and contact-sample count.
Trace samples retain the applied world force, magnitude, penetration, and
number of active pairs involving each body. The browser persists the switch
and three controls, includes them in the simulation fingerprint, and exposes a
dedicated shared-coupled-trace CSV.

This branch is not a collision mesh, rigid contact solver, impact law, or
structural model. It applies no friction, restitution, tangential impulse,
off-centre moment, deformation, joint compliance, rebound geometry, plume or
aerodynamic interference, or retained-vehicle reaction. The stage adapter's
retained vehicle is propagated in its own primary track, so this branch only
couples released bodies that enter the shared detached track. Positive
envelopes are conservative geometry bounds, not measured stiffness data.

## Optional relative-flow wake feedback

`relativeAeroForceFeedback.enabled` promotes the same finite-cone geometry used
by the post-trace relative-flow review into a narrowly bounded sensitivity path
for the shared coupled track. It is disabled by default and never changes the
independent detached 6DOF branches. A target participates only when it has an
explicit point-drag, projected-area, or detached aerodynamic basis. Each active
source contributes a candidate wake from its environment-relative velocity
`v_air,j`; the downstream axis is `u_j = v_air,j / |v_air,j|`:

```text
x = (r_target - r_source) · u_source
L = D_source N_recovery
r_wake(x) = R_source + tan(theta) x
d_j = min(d_max, d_peak * exposure * (1 - x/L))
v_air,target,eff = (v_target - w_target) - d_j |v_air,j| u_j
```

Candidates are limited to `0 < x <= L` and a target-envelope overlap with the
expanding cone. When multiple source wakes overlap, only the strongest deficit
vector is applied; this prevents the branch from stacking an unbounded sum of
uncalibrated deficits. The adjusted flow is then passed to the target's existing
point-drag, projected-area, or detached-aero evaluator. Trace points retain the
effective relative airspeed, strongest deficit fraction, and source count. The
result records the normalized configuration, maximum observed deficit, exposed
sample count, and affected-body count under
`rocketworks-coupled-multi-body-relative-aero-0.1.0`.

The branch is an analytical sensitivity check only. It does not model wake
roll-up, turbulence, viscous shielding, crossflow/attitude databases, plume
interaction, shock interaction, unsteady derivatives, or measured proximity
forces and moments. CFD, wind-tunnel data, calibrated relative-body tables, and
measured-flight comparison are required before using it for design release,
operations, or flight/range-safety decisions.

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
rigid-body branch adds attitude and angular-rate propagation. Detached static
aerodynamic loads add the bounded relation or supplied coefficient-table
equations above, while the projected-area option adds the supplied CdA blend.
It is not a full contact or structural multi-body solver. Unless the explicit
`contact.enabled` branch is selected, it does not infer body-to-body contact
forces. Even when selected, it does not infer fin interference, unsteady flow,
collision meshes, joint or spring compliance, plume interaction,
wake/interference beyond the explicit bounded feedback sensitivity branch,
structural flexibility, separation mechanism dynamics, or range-safety margins.
Pairwise COM distance and spherical envelopes remain diagnostics, not clearance
approval.

The stage-flight adapter applies a solved minimum-norm release correction only
when the event-level separation allocator reports a balanced result. The
existing detached 6DOF branches remain unchanged, so the shared-grid track is
an explicit comparison/audit path rather than a silent state reset. The browser
exposes the mutual-gravity choice as an advanced released-body force model and
the projected-area selection as the opt-in detached aerodynamic-load basis.
The stage-flight adapter forwards each detached stage's release attitude,
angular rate, center-of-mass inertia, static aerodynamic basis, and (when
configured) coefficient-table reference length and provenance into the shared
audit track. The browser's coefficient-table mode can select that table-backed
load path without also enabling projected-area display drag; a missing table
keeps the explicit isotropic fallback.

Adaptive step diagnostics describe numerical truncation only. They do not
validate the environment, supplied loads, geometry, separation mechanism, or
contact behavior.

## Step budget and status

The default maximum is 200,000 shared-grid steps. If a requested step would
exceed a caller-supplied budget, the integrator coarsens the effective step to
reach the requested mission end and marks the result `partial`. Ground impact
is terminal for that body; post-impact propagation is not inferred.
