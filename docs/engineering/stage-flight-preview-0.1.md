# Stage-aware flight preview 0.1

Status: implemented composition adapter; mathematical regression tests only.
This preview is not flight-safety validated and must not be used for launch
approval or separation-clearance decisions.

## Purpose

`stage-flight-preview.ts` provides one deterministic entry point for a browser
stage run. It composes, without replacing, the independently versioned Kestrel
models for:

1. attached-stage mass, propellant, inertia, and clustered thrust;
2. exact-topology aerodynamic geometry, CP, drag, and applicability warnings;
3. atmosphere, wind, turbulence, and launch-site environment queries;
4. preliminary body loads; and
5. the event-aware six-degree-of-freedom rigid-body integrator.

The adapter returns the underlying model versions, the full 6-DOF trace, stage
sets at every sample, event topology before and after each transition, warnings,
and assumptions. A caller cannot mistake a successful integration for physical
validation because the result status remains
`mathematical-regression-tests-only`.

## Event and state policy

The caller supplies initial ignition stages and scheduled or state-triggered
events. The adapter initializes ignition through the shared staging state keys,
passes exact event times to the integrator, and summarizes every applied event
with its attached-stage set before and after the state change. It does not
invent ignition delays, separation impulses, failure probabilities, or
clearance trajectories.

The initial attitude defaults to the documented vertical-launch quaternion,
which maps the body nose direction to ENU up. A caller may provide a different
initial position, velocity, attitude, or body rate for analysis cases.

## Limitations

- The retained-body staging model does not spawn or propagate discarded stages.
- Stage-separation proximity aerodynamics remain explicitly unsupported during
  the configured transition window.
- The supplied aerodynamic regime table must contain an exact regime for every
  attached-stage topology reached by the event sequence.
- Results inherit every applicability warning from the staging, aerodynamic,
  load, environment, and six-degree-of-freedom models.
- Integration and coupling checks are software and mathematical regressions,
  not wind-tunnel, instrumented-flight, or certification evidence.

## Engineering decision

This is intentionally a narrow composition layer. Keeping the existing models
independently versioned makes it possible to improve propulsion, aerodynamics,
environment, or event mechanics without hiding a new monolithic simulator
behind the browser UI. Future work can add a multi-body separation branch and
Monte Carlo event uncertainty while preserving this provenance boundary.
