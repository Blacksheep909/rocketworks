# Rigid-body six-degree-of-freedom kernel 0.4

Status: mathematical regression tests only. This kernel is not a validated
rocket flight simulation.

This is an original clean-room implementation of public Newton-Euler rigid-body
equations and quaternion attitude kinematics. It does not contain or call
OpenRocket source code, simulation code, UI code, data, assets, or backend
components.

## Purpose

Version 0.4 establishes the numerical state, fixed and adaptive integration,
root-found event, and discrete-mode layer needed for a coupled rocket
simulation. It propagates:

- three world-frame position coordinates
- three world-frame velocity coordinates
- a scalar-first unit quaternion mapping body vectors into the world frame
- three body-frame angular-velocity components

The API accepts world-frame force, body-frame force, and body-frame moment. It
also accepts either constant body properties or a state-dependent provider for
prescribed mass, inertia, and inertia-rate histories. It does not add any loads
automatically. Gravity, thrust, aerodynamics, launch guidance, recovery,
terrain, and weather must be supplied by later models.

## Frames and conventions

The current world frame is a right-handed, non-rotating Cartesian frame. It has
no implied latitude, longitude, or Earth orientation. A later local-tangent
frame adapter will define east, north, and up for atmospheric flight.

The body frame is right-handed. RocketWorks' vehicle convention uses body `x` as
the longitudinal nose-to-tail axis, with `y` and `z` transverse. Angular
velocity and moment are expressed in body coordinates. The quaternion `qBW`
maps a body-frame vector into the world frame:

`vW = qBW ⊗ [0, vB] ⊗ conjugate(qBW)`

Quaternions use scalar-first ordering `(w, x, y, z)` and are normalized after
each integration update.

## Equations

For prescribed mass `m`, body inertia tensor `I`, inertia rate `İ`, total
world-frame force `FW`, body-frame moment `MB`, body angular velocity `ωB`,
position `rW`, velocity `vW`, and body-to-world quaternion `qBW`:

`ṙW = vW`

`v̇W = FW / m`

`I ω̇B = MB - ωB × (I ωB) - İ ωB`

`q̇BW = 1/2 qBW ⊗ [0, ωB]`

The inertia tensor must be finite, symmetric, and positive definite. Its
prescribed derivative must be finite and symmetric. Body-frame forces are
rotated into the world frame before summation. Moments are assumed to be about
the center of mass; callers must include the cross product from an off-center
force in the supplied moment.

The `İω` term preserves angular momentum for a prescribed changing inertia.
This is not a complete control-volume model of a burning rocket: exhaust
momentum, pressure thrust, internal flow, slosh, and jet damping are not inferred
from mass loss. Their force and moment effects must be modeled explicitly.

## Numerical propagation

A fixed-step classical fourth-order Runge-Kutta method advances the complete
state by default. The final step is shortened to finish at the requested time
exactly. Callers may opt into `adaptive-rk4-step-doubling`; this compares one
full RK4 step with two half steps, scales the component-wise difference by the
configured absolute and relative tolerances, rejects an over-tolerance step,
and grows or shrinks the next internal step with a conservative fifth-order
error exponent. The refined half-step state is retained. The requested
`timeStepS` remains the maximum internal step and trace/output interval, while
scheduled and state-triggered event boundaries are still landed on exactly.

Adaptive diagnostics report accepted and rejected internal steps, the smallest
and largest accepted step, and the largest normalized error among accepted
steps. These are numerical truncation diagnostics, not a measure of load-model
accuracy or experimental agreement.

Callers may supply strictly increasing scheduled times for ignition, burnout,
stage separation, deployment, or other discontinuities. The integrator splits a
step at each scheduled time, evaluates the incoming step with the left-hand load
limit, and starts the outgoing step with the right-hand load. This avoids mixing
pre-event and post-event forces through one RK4 quadrature interval.

Scheduled times identify known discontinuities. A scheduled event may apply a
deterministic state reset at its boundary, enabling explicit impulses or
topology handoff. The result records the state immediately before and after
every reset. Multiple scheduled events at the same time execute in declared
order.

Version 0.2 also accepts one-shot state-triggered events. Each event provides a
continuous scalar function `g(state)` and an optional crossing direction:

- `rising`: negative to zero or positive
- `falling`: positive to zero or negative
- `any`: either crossing direction

After a trial step brackets a permitted crossing, the integrator bisects the
time interval and repeatedly propagates from the accepted step origin until the
configured time tolerance is met. The fixed or adaptive integration method is
used consistently for each trial. The root-found state may be recorded, reset
and continued, or marked terminal. Terminal events end the requested simulation
early and are exposed separately in the result. State events are one-shot and
same-time state events execute in declaration order. A
`triggerAtStart` option explicitly allows a surface that is already zero at an
accepted boundary to fire; this is off by default so a rocket beginning at
ground altitude does not immediately report impact.

When a root-found state event coincides with a known-time boundary, state
events execute first in declaration order, followed by scheduled resets in
declaration order. A terminal state event stops immediately and therefore
prevents later events at that boundary from executing.

State-event functions must return finite values. State resets must preserve the
root-found time, return a valid finite rigid-body state, and remain compatible
with the body-property provider.

## Discrete state

Version 0.3 adds an optional namespaced key-value map to every state. Values are
limited to booleans, finite numbers, and strings. RK4 intermediate states carry
the same map unchanged; only a scheduled or root-found event reset may replace
it. This supports deterministic deployment, failure, staging, and mode flags
without treating them as continuous differential states.

The kernel assigns no meaning to discrete keys. Coupled models own their
namespaces and validate their semantics. Recovery 0.1 uses this mechanism for
deployment command time and failed-device state. Multi-stage 0.1 uses it for
stage ignition time, ignition failure, and separation topology.

## Automated verification

The regression suite currently checks:

- axis-angle quaternion rotation of a body vector
- constant world force against closed-form position and velocity
- constant principal-axis torque against closed-form angular velocity and angle
- torque-free asymmetric-body conservation of rotational kinetic energy
- torque-free conservation of world-frame angular momentum
- unit-quaternion preservation
- exact landing on scheduled times
- correct left- and right-limit treatment of a scheduled force change
- angular-momentum conservation during prescribed principal-axis inertia loss
- exactly-once application of a scheduled separation impulse
- deterministic ordering of same-time state resets
- rejection of a non-symmetric inertia tensor
- root-found terminal ground impact against a closed-form trajectory
- non-terminal apogee detection with a one-shot state reset
- rising versus falling event-direction filtering
- deterministic ordering of simultaneous state-triggered resets
- state-triggered then scheduled ordering at a shared boundary
- explicit triggering at an initial boundary
- rejection of non-finite event functions and time-changing event resets
- persistence of discrete mode state through RK4 propagation
- rejection of non-finite or unsupported discrete-state values
- adaptive RK4 step-doubling convergence against a refined reference
- adaptive tolerance and minimum/maximum step validation
- adaptive landing on scheduled event boundaries with integration diagnostics

These are mathematical implementation checks. They do not validate coupled
rocket behavior.

## Known limitations

- Mass, inertia, and inertia rate are prescribed externally rather than derived
  from tanks, grains, geometry, or internal flow.
- The translating origin is assumed to remain at the instantaneous center of
  mass; effects from a moving body-frame origin are not derived.
- Exhaust momentum, pressure thrust, moving propellant, jet damping, slosh,
  flexibility, aeroelasticity, and internal mechanisms are absent unless their
  resultant loads are supplied externally.
- The world frame does not rotate and has no geodesy or curved-Earth model.
- There is no automatic gravity, atmosphere, wind, turbulence, propulsion,
  aerodynamics, damping, ground-contact, staging, or recovery force. A separate
  launch-rail adapter can constrain and hand off a state to this kernel, and a
  multi-stage adapter can supply attached-body mass, inertia, and propulsion.
- Root finding detects endpoint-bracketed crossings and assumes a continuous
  scalar event function with at most one relevant crossing per integration
  step. Tangential contact without a sign change and multiple crossings inside
  one step can be missed.
- Event-time bisection controls time localization. Adaptive step-doubling adds
  a local numerical truncation estimate, but convergence with tighter tolerances
  or independent time-step studies remains necessary.
- State events are one-shot. Repeated or hysteretic contact requires an
  explicit future event-state machine.
- Discrete state is a flat primitive-value map. Nested objects, arrays, and
  continuously changing auxiliary dynamics are intentionally excluded.
- State resets and impulses are supported, but a reset does not automatically
  construct or propagate multiple separated bodies.
- The adaptive mode is still an RK4 step-doubling estimate rather than an
  embedded method; it can miss error caused by discontinuous or inaccurate load
  providers, and omitted event boundaries can invalidate its smoothness
  assumption.
- Quaternion normalization limits numerical drift but does not prove physical
  correctness.

Do not use this kernel alone for flight-safety decisions.

## Primary public references

- NASA CR-124416, *A Study of Numerical Integration Techniques for Use in the
  Simulation of Space Vehicle Dynamics*. It formulates rigid-body rotational
  motion with Euler equations and quaternion kinematics and examines numerical
  integration behavior:
  https://ntrs.nasa.gov/api/citations/19730024029/downloads/19730024029.pdf
- NASA TM-110164, *Manual for a Workstation-Based Generic Flight Simulation
  Program (LaRCsim), Version 1.4*. It documents a full rigid-body flight model
  using quaternion angular integration:
  https://ntrs.nasa.gov/citations/19950023906
- NASA CR-2012-217475, *Missile Aerodynamics for Ascent and Re-entry*. It
  develops aerodynamic force and moment equations intended for six-degree-of-
  freedom missile simulations and emphasizes aerodynamic damping for tumbling
  motion:
  https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20130003336.pdf
- NASA/CR-1998-208246, *Dynamics of Variable Mass Systems*. It derives general
  translational and rotational equations for variable-mass systems and shows
  that geometry and mass-loss details can materially affect attitude behavior:
  https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19980210404.pdf
- NASA CR-112044, *Dynamic Characteristics of a Variable-Mass Flexible
  Missile*. It treats a variable-mass missile with internal flow and
  aerodynamic forces, illustrating physics intentionally outside this
  prescribed-property kernel:
  https://ntrs.nasa.gov/citations/19720013188
- NASA CR-132741, *Six-Degree-of-Freedom Program to Optimize Simulated
  Trajectories (6D POST), Volume 1: Formulation Manual*. It documents a general
  rigid-body trajectory formulation for atmospheric and orbital problems:
  https://ntrs.nasa.gov/citations/19760006045

## Next coupling work

A preliminary local east-north-up adapter now supplies gravity, atmosphere,
wind-relative velocity, thrust, constant-coefficient drag, and bounded
small-angle restoring loads. A separate constrained launch-rail model now
root-finds liftoff and rail exit before handing the exact release state to this
kernel. An impulse-based propellant model now supplies a consistent prescribed
mass, center-of-mass, inertia, inertia-rate, and thrust history from user motor
curves under a documented uniform-depletion assumption. The next physically
meaningful increments are aerodynamic damping, motor-axis and thrust-offset
loads, finite guide-button and tip-off mechanics, and higher-fidelity
ground-contact events. A separate preliminary recovery model now uses discrete
apogee/altitude/timed commands, smooth inflation, wind-relative drag, failure
state, and terminal impact. Multi-stage 0.1 now performs exact ignition,
burnout, failure, and separation topology changes for one retained vehicle.
The stage-flight adapter now spawns an independent discarded-body branch and,
when a retained-body separation delta-v is configured, derives the equal-and-
opposite detached-body linear impulse from the event mass ratio. This is an
instantaneous two-body momentum idealization; a later multi-body solver should
replace it with explicit separation mechanisms, angular impulse, contact, and
coupled proximity aerodynamics. A later geometry-based propellant layer should
replace uniform depletion where grain data is available.
