# Stage-aware flight preview 1.0

Status: implemented composition adapter; mathematical regression tests only.
This preview is not flight-safety validated and must not be used for launch
approval or separation-clearance decisions.

## Purpose

`stage-flight-preview.ts` provides one deterministic entry point for a browser
stage run, including a single-stage coupled ascent baseline. It composes,
without replacing, the independently versioned RocketWorks
models for:

1. attached-stage mass, propellant, inertia, and clustered thrust;
2. exact-topology aerodynamic geometry, CP, drag, and applicability warnings;
3. atmosphere, wind, turbulence, and launch-site environment queries;
4. preliminary body loads; and
5. an optional straight launch-rail constraint and exact release handoff; and
6. optional retained-vehicle recovery-device loads and deployment events; and
7. the event-aware six-degree-of-freedom rigid-body integrator.

The adapter returns the underlying model versions, the full 6-DOF trace, stage
sets at every sample, event topology before and after each transition, warnings,
and assumptions. A caller cannot mistake a successful integration for physical
validation because the result status remains
`mathematical-regression-tests-only`. The composition model version is
`kestrel-stage-flight-preview-0.24.0`.

Relation-based aerodynamics retain both the selected normal-force trend and
the optional induced-drag polar (`C_D,i = k C_N^2`) plus their model versions
and factors. Direct force/moment tables remain authoritative, and stage
regimes with differing selections are reported as `mixed` rather than
silently collapsed.

The result also carries a `rocketworks-mission-mass-ratio-0.1.0` serial-stack
composition preview. The adapter passes the topology's serial stage IDs in
burn order, carries retained payload/recovery mass and later serial-stage full
mass through each ideal burn, and lists parallel/booster stages that were
excluded rather than flattening their coupled trajectory. This branch is an
ideal composition trend, not a mission delta-v budget or trajectory result.

Before integration, scheduled and state-triggered declarations pass through the
independent mission-event allocator. Semantic priorities put rail release,
separation, ignition, failure, recovery, and custom commands into a stable
tie-order; optional dependency edges are checked for missing identifiers and
cycles. Runtime root ties are added to the returned allocation telemetry, and
the same diagnostics flow into the browser card and engineering report. The
allocator changes ordering only; it never changes a trigger predicate or
claims a command will occur at a prescribed time.

When `recoveryDevices` is supplied, the adapter composes the independent
recovery-load model into the retained vehicle's force and moment callback. A
state-triggered apogee command can write the recovery device's discrete state,
after which deployment delay, inflation, and reefing affect the coupled trace.
The trace exposes recovery drag and effective area, and the result reports the
recovery model version. A detachable stage may also carry an explicitly
configured recovery device; that device is instantiated on the independent
branch after separation and commanded at that branch's apogee. Retained
vehicle settings are not copied into detached stages.

## Event and state policy

The caller supplies initial ignition stages and scheduled or state-triggered
events. The adapter initializes ignition through the shared staging state keys,
passes exact event times through the rail and free-flight phases, and summarizes
every applied event with its attached-stage set before and after the state
change. Repeated physical stage copies are also reported through attached and
detached stage-instance IDs. Separation events carry the optional body-frame
retained-body delta-v annotation and its attitude-rotated world-frame vector,
plus optional measured body-frame/world-frame retained impulse vectors and the
detached logical-stage IDs. This keeps the timeline and exported result numerically
traceable instead of relying on event-label text. When `launchRail` is present,
the result includes rail liftoff and release events, the effective travel distance,
the guide-loss acceleration, the authored tip-off rate, and the exact free-flight
handoff state. It does not invent ignition delays, separation impulses, failure
probabilities, or clearance trajectories.

The initial attitude defaults to the documented vertical-launch quaternion,
which maps the body nose direction to ENU up. A caller may provide a different
initial position, velocity, attitude, or body rate for analysis cases.

## Browser trace profile

The browser's `Stage flight profile` is a presentation layer over the returned
trace; it does not add forces, resample the integrator, or change the model
version. The operator can switch the plotted series between altitude, speed,
Mach, angle of attack, signed sideslip, dynamic pressure, axial drag, total
aerodynamic force, static-plus-damping aerodynamic moment, damping-moment
magnitude, mass, recovery drag, effective canopy area, and thrust. The
aerodynamic and recovery series come from the same per-state load diagnostics
used by the integrator, so table
applicability and topology changes remain visible in the surrounding warnings.
Rail liftoff, rail exit, staging, and failure events are drawn as time markers,
while the hover readout reports the exact retained trace sample and attached-
stage set. The canvas is paired with a textual summary so the profile remains
understandable to keyboard and assistive-technology users. CSV export includes
the same aerodynamic force/moment magnitudes, direct-table application flags,
and coefficient basis for external plotting. The metric tabs accept
Tab plus Arrow, Home, and End key navigation so changing the displayed series
does not require a pointer.

The same profile is available for an enabled single-stage vehicle as a
`6DOF ascent run`. In that mode there are no staging transitions, but the
retained vehicle still passes through the coupled mass, aerodynamic, launch-
environment, rail, and rigid-body layers. Multi-stage projects retain the
topology-aware event view and stage-set annotations.

The profile deliberately uses one primary y-axis at a time. This prevents a
large thrust value or a small mass value from visually hiding another series
and keeps the plotted quantity's units explicit. It is a diagnostic view, not
a replacement for the underlying state vector or independent verification.

For a single-stage vehicle, the browser also exposes a small cross-model
diagnostic after both runs are available. It reports the apogee, peak-speed,
and time-to-apogee deltas between the automatic vertical estimate and the
coupled 6DOF preview. The comparison is intentionally labeled diagnostic:
the models use different force, attitude, environment, and rail pathways, so a
delta is not a validation result or a reason to prefer one model without
independent evidence.

## Cluster readiness diagnostics

The adapter also returns a `clusterDiagnostics` list for multi-motor stages or
any stage with a configured ignition failure. Each entry reports the active and
failed motor counts, attached propellant mass, propellant retained by failed
motors, individual peak thrust-curve ordinates, available peak-curve sum, and
the spread between available motor peaks. A partial failure is a `watch`
condition because the retained body can experience asymmetric thrust and
changing mass properties; an all-motor failure is `failed` for powered flight
while still retaining its hardware and propellant in the mass model. Peak
spread is a curve-level comparison only: it does not synchronize motor timing
or resolve net force, thrust-axis error, transient response, or flight safety.
These are deterministic configuration diagnostics, not probabilities or
hardware-health measurements.

## Numerical convergence diagnostic

Every browser run also performs a second deterministic integration with half
the requested time step. The result exposes the coarse and refined step sizes,
relative peak-altitude and peak-speed differences, apogee timing difference,
final position and velocity differences, and the maximum shared-event timing
delta. A `converged` status requires an aggregate relative difference no larger
than 2% and apogee/shared-event timing differences no larger than 0.05 s. A
different event set or a larger difference produces `watch`; a failed refined
run produces `not-assessed`.

These thresholds are deliberately simple numerical heuristics. They detect
step-size sensitivity and discontinuity effects but do not establish physical
model validity, uncertainty adequacy, hardware agreement, or flight safety.
The engineering report and project JSON retain the diagnostic assumptions and
warnings alongside the primary trace.

## Coupled uncertainty adapter

`stage-flight-uncertainty.ts` propagates seeded Latin-hypercube input
distributions through this complete adapter. The browser Flight workspace uses
16 bounded samples for dry mass, propellant mass, delivered thrust, drag, and
wind, then reports percentile bands, sensitivity, failed samples, and
split-sample convergence. The variant builder does not mutate the source
topology or environment. Drag uncertainty is an explicit drag-only scale after
the selected constant or Mach--Reynolds source. When a direct force/moment
database is selected, separate direct-force and direct-moment scales feed the
same load diagnostics; relation fallback, damping, and centre-of-pressure
terms remain nominal. If a selected table declares absolute uncertainty cells,
the wrapper also adds a bounded common signed-sigma factor for the interpolated
drag, normal-force, CP, direct force/moment, and damping cells; empirical
coefficient covariance and time correlation remain outside this adapter. See
`stage-flight-uncertainty-0.1.md` for the full contract and limitations.

## Stage mass-ratio diagnostic

The adapter also returns `massRatio` telemetry from
`stage-mass-ratio.ts`. Each logical propulsive stage records structural mass,
motor dry mass, initial propellant mass, full and burnout mass, mass ratio,
effective specific impulse, and an ideal rocket-equation delta-v proxy. The
browser card and report keep this branch separate from the integrated trajectory
and show its model version and validation status.

This branch is intentionally stage-only: it does not add downstream payload or
upper-stage mass, gravity/drag loss, steering, residual propellant, finite
staging transients, or motor validation. A summed ideal delta-v is therefore a
composition trend, not a mission budget, flight-performance claim, or safety
decision. See `stage-mass-ratio-0.1.md` for equations and public references.

## Force impulse budget

The adapter also returns `forceBudget` from
`stage-flight-force-budget.ts`. It applies trapezoidal integration to the
recorded scalar trace magnitudes for thrust, aerodynamic drag, recovery drag,
and total aerodynamic force. It reports total impulse, force/mass
velocity-equivalents, peak dynamic pressure, and per-stage active-window
accounting. A stage interval uses the left sample's attached-stage topology;
zero-duration event boundaries do not contribute an interval twice.

The velocity-equivalent values are useful for seeing how much scalar force was
recorded relative to the changing mass, but they are not vector delta-v. The
budget cannot separate gravity, steering, plume, staging, or aerodynamic-vector
losses because the trace does not expose a complete force-vector and
propulsive-efficiency history. It is a trace-accounting diagnostic, not a
mission-performance budget, validation result, or flight-safety gate. See
`stage-flight-force-budget.ts` for the contract and limits.

## Separated-body analytical branch

When an explicit separation event detaches a stage or one of its physical
instances, the browser also records a separate trajectory for that body's own
center of mass. The release state is
derived from the retained body's event state: the stage center-of-mass offset
is rotated into world coordinates and the parent angular-rate cross-product is
included in the released velocity. The result reports the retained-body
separation delta-v in both body and world frames and preserves any supplied
measured retained-body impulse in both frames. When present, the adapter
also adds the derived detached-body impulse to that release velocity. The
branch then uses the same original
6-DOF integrator with altitude-dependent gravity and a terminal ground-impact
event. If the stage topology carries a recovery device, the same branch also
couples its canopy force and moment after the apogee command, including the
configured delay and inflation approximation.

When the detached stage has an explicit topology-specific drag coefficient and
a bounded reference area, the branch also applies isotropic point drag against
the environment-relative velocity. A coefficient table is sampled only at its
declared design point for this independent branch; it is not coupled to the
discarded body's changing Mach or Reynolds state. If either basis is missing,
the branch stays gravity-only and labels that fallback in its telemetry.

When the event carries a retained-body delta-v, including one derived from a
measured retained-body impulse, the adapter derives the
detached-body delta-v from equal-and-opposite linear momentum using the
retained and detached masses at the event. If one event releases multiple
physical copies, their combined detached mass is used and the same derived
velocity increment is assigned to each copy; this assumes one shared impulse
velocity rather than independent mechanism impulses. This is an instantaneous
two-body impulse idealization; it does not model the separation mechanism,
spring or joint dynamics, or angular impulse. When no event delta-v is
supplied, the detached branch explicitly reports that the impulse is not
modeled.

This remains an intentionally bounded ballistic-capable component check. It does not
invent lift, attitude-dependent aerodynamic torque, plume interaction,
stage-to-stage aerodynamic interference, or contact logic for detached bodies.
When supplied component geometry is available, a separate fixed spherical
envelope screen subtracts conservative bounds from the COM paths; that screen
is still only a potential-overlap diagnostic. Retained-vehicle and explicitly
configured detached-stage recovery remain effective-area load approximations.
The result status is
`analytical-component-checks-only`, and the UI, project JSON, and engineering
report retain the warning so an impact time cannot be mistaken for a range or
flight-safety prediction.

### Detached-stage recovery triggers

Each detachable stage may carry a recovery canopy with the same three command
modes exposed by the fast retained-vehicle preview: branch apogee, a
falling-through AGL altitude, or a mission-time schedule. Legacy topology
documents omit these fields and normalize to branch apogee. Altitude commands
use the 6DOF state-event root finder; mission-time commands use the scheduled
event path. If a configured mission time precedes the stage release, the
command is clamped to an infinitesimal interval after the branch release
boundary so an event cannot be applied to a state that no longer exists. The canopy's own deployment delay, inflation,
and reefing schedule remain deterministic effective-area approximations.

The detached branch reports the selected trigger and a warning when the command
is not reached before ground impact or the configured horizon. Separation
mechanism dynamics, canopy lines, opening shock, and flight-safety validation
remain outside the model.

When detached branches are available, the adapter also returns an aggregate
pairwise center-of-mass diagnostic and, when geometry bounds are supplied, a
separate spherical-envelope result. The COM diagnostic compares every
retained/detached and detached/detached trace pair from the later release time
and reports the closest assessed pair. The envelope result subtracts fixed
component-derived radii and labels non-positive values as potential overlap;
neither result models contact, aerodynamic clearance, or range safety. Both
results now carry relative speed and inward radial closing speed at the
closest assessed approach when the trace data support it; those values are
kinematic telemetry only, not impact loads or contact-response predictions.

The adapter also returns a coupled separation impulse allocation diagnostic for
each event that releases one or more bodies. It starts from the configured
retained-body delta-v and the existing detached-body mass-ratio increments,
then solves a regularized minimum-norm point-mass correction for linear and
first-order angular momentum. The correction is reported in body and world
frames with residuals and a resolved-constraint count; it is not applied to the
current trajectories. Rank-deficient release geometry remains `review` rather
than being presented as a solved mechanism impulse.

When one or more detached branches are available, the adapter also runs a
separate shared-grid point-mass track. It initializes each released center of
mass from the exact event handoff, applies a minimum-norm event correction only
when the allocation is balanced, and then advances every released body on a
common mission-time grid. Each Runge–Kutta substep queries the same launch
environment provider for that body's position and time; altitude-dependent
gravity and an optional constant isotropic drag basis are evaluated per body.
The result keeps the baseline and applied release velocities visible, reports
ground-crossing times, and feeds its synchronized traces into the continuous
pairwise COM diagnostic.

The browser can opt this track into direct pairwise point-mass gravity. That
mode integrates all active released bodies as one translational state vector,
aligns the shared grid to exact release times, and exposes the gravitational
constant plus any Plummer-style close-approach softening radius. It is disabled
by default; a zero-softening coincident state is rejected as a singularity.

This track is intentionally distinct from the existing independent detached
6DOF branches: it is a simultaneous shared-environment component check, not a
full rigid-body multi-body solver. The optional point-mass gravity mode
exchanges only the modeled Newtonian body force; the track does not model
contact forces, momentum transfer after impact, attitude, lift, plume
interaction, stage-to-stage aerodynamic interference, structural compliance,
or collision response. A coarsened time step is labeled `partial` when the
requested step would exceed the explicit maximum-step budget. It remains an
engineering preview and must not be used for range-safety or flight approval.

If the retained payload/recovery allowance is made only from collinear point
masses, the browser adapter adds a versioned compact-package shape inertia
(`kestrel-compact-package-inertia-0.1.0`) before constructing the rigid-body
state. This keeps the state positive-definite while leaving the result
explicitly approximate; it is not a substitute for retained CAD geometry.

## Limitations

- The retained-body staging model remains a single tracked vehicle; each
  separated-body branch is an independent 6DOF preview with optional isotropic
  point drag and optional stage-specific recovery loads. The adapter also
  exposes a shared-grid detached point-mass track; mutual gravity is an opt-in
  translational force extension, not a contact or aerodynamic-interference
  solver.
- A configured separation delta-v or measured retained-body impulse is applied
  in the event body frame and carried into event/trajectory diagnostics in body
  and world frames. The discarded-body branch receives the mass-ratio
  equal-and-opposite linear impulse when that event annotation is present;
  mechanism dynamics, impulse calibration, angular impulse, and coupled contact
  remain outside the model.
- Stage-separation proximity aerodynamics remain explicitly unsupported during
  the configured transition window.
- The supplied aerodynamic regime table must contain an exact regime for every
  attached-stage topology reached by the event sequence.
- The optional launch rail is straight, fixed, angled by bounded ENU controls in
  the browser adapter, and may use an authored effective guide-loss acceleration
  and rail-exit tip-off rate; guide-button spacing, binding, normal-load
  friction, flexure, transient torque, and launcher motion are not modeled.
  Rail-phase state resets must preserve the constrained axis and attitude.
- Results inherit every applicability warning from the staging, aerodynamic,
  load, recovery, environment, launch-rail, and six-degree-of-freedom models.
- The half-step convergence rerun can be unavailable when a caller imposes a
  very small rail step budget or another runtime limit; this is surfaced as
  `not-assessed`, never silently treated as converged.
- Integration and coupling checks are software and mathematical regressions,
  not wind-tunnel, instrumented-flight, or certification evidence.

## Engineering decision

This is intentionally a narrow composition layer. Keeping the existing models
independently versioned makes it possible to improve propulsion, aerodynamics,
environment, or event mechanics without hiding a new monolithic simulator
  behind the browser UI. Future work can add correlated/model-form uncertainty,
  relative-body aerodynamic databases, attitude-aware envelope geometry, and a
  time-propagated coupled multi-body separation solver with contact, relative
  aerodynamics, and attitude while preserving this provenance boundary.
