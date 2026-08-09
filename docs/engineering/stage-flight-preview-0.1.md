# Stage-aware flight preview 0.4

Status: implemented composition adapter; mathematical regression tests only.
This preview is not flight-safety validated and must not be used for launch
approval or separation-clearance decisions.

## Purpose

`stage-flight-preview.ts` provides one deterministic entry point for a browser
stage run, including a single-stage coupled ascent baseline. It composes,
without replacing, the independently versioned Kestrel
models for:

1. attached-stage mass, propellant, inertia, and clustered thrust;
2. exact-topology aerodynamic geometry, CP, drag, and applicability warnings;
3. atmosphere, wind, turbulence, and launch-site environment queries;
4. preliminary body loads; and
5. an optional straight launch-rail constraint and exact release handoff; and
6. the event-aware six-degree-of-freedom rigid-body integrator.

The adapter returns the underlying model versions, the full 6-DOF trace, stage
sets at every sample, event topology before and after each transition, warnings,
and assumptions. A caller cannot mistake a successful integration for physical
validation because the result status remains
`mathematical-regression-tests-only`. The composition model version is
`kestrel-stage-flight-preview-0.4.0`.

## Event and state policy

The caller supplies initial ignition stages and scheduled or state-triggered
events. The adapter initializes ignition through the shared staging state keys,
passes exact event times through the rail and free-flight phases, and summarizes
every applied event with its attached-stage set before and after the state
change. When `launchRail` is present, the result includes rail liftoff and
release events, the effective travel distance, and the exact free-flight
handoff state. It does not invent ignition delays, separation impulses, failure
probabilities, or clearance trajectories.

The initial attitude defaults to the documented vertical-launch quaternion,
which maps the body nose direction to ENU up. A caller may provide a different
initial position, velocity, attitude, or body rate for analysis cases.

## Browser trace profile

The browser's `Stage flight profile` is a presentation layer over the returned
trace; it does not add forces, resample the integrator, or change the model
version. The operator can switch the plotted series between altitude, speed,
mass, and thrust. Rail liftoff, rail exit, staging, and failure events are
drawn as time markers, while the hover readout reports the exact retained
trace sample and attached-stage set. The canvas is paired with a textual
summary so the profile remains understandable to keyboard and assistive-
technology users. CSV export remains the authoritative portable trace for
external plotting. The metric tabs accept Tab plus Arrow, Home, and End key
navigation so changing the displayed series does not require a pointer.

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

## Separated-body analytical branch

When an explicit separation event detaches a stage, the browser also records a
separate trajectory for that body's own center of mass. The release state is
derived from the retained body's event state: the stage center-of-mass offset
is rotated into world coordinates and the parent angular-rate cross-product is
included in the released velocity. The branch then uses the same original
6-DOF integrator with altitude-dependent gravity and a terminal ground-impact
event.

This is intentionally a bounded ballistic component check. It does not invent
drag coefficients, plume interaction, stage-to-stage aerodynamic interference,
separation impulse, collision, recovery, or clearance logic. The result status
is `analytical-component-checks-only`, and the UI, project JSON, and engineering
report retain the warning so an impact time cannot be mistaken for a range or
flight-safety prediction.

## Limitations

- The retained-body staging model remains a single tracked vehicle; the new
  separated-body branch is an independent gravity-only preview, not a coupled
  multi-body solver.
- Stage-separation proximity aerodynamics remain explicitly unsupported during
  the configured transition window.
- The supplied aerodynamic regime table must contain an exact regime for every
  attached-stage topology reached by the event sequence.
- The optional launch rail is straight, fixed, vertical in the browser adapter,
  and frictionless; guide-button spacing, tip-off, flexure, and launcher motion
  are not modeled. Rail-phase state resets must preserve the constrained axis
  and attitude.
- Results inherit every applicability warning from the staging, aerodynamic,
  load, environment, launch-rail, and six-degree-of-freedom models.
- The half-step convergence rerun can be unavailable when a caller imposes a
  very small rail step budget or another runtime limit; this is surfaced as
  `not-assessed`, never silently treated as converged.
- Integration and coupling checks are software and mathematical regressions,
  not wind-tunnel, instrumented-flight, or certification evidence.

## Engineering decision

This is intentionally a narrow composition layer. Keeping the existing models
independently versioned makes it possible to improve propulsion, aerodynamics,
environment, or event mechanics without hiding a new monolithic simulator
behind the browser UI. Future work can add a coupled multi-body separation
solver and Monte Carlo event uncertainty while preserving this provenance
boundary.
