# Stage-flight force impulse budget 0.1

RocketWorks exposes a trace-level force accounting branch for the coupled
preview. It is original clean-room code that integrates recorded scalar
diagnostics; it is not a second flight solver.

## Contract

`computeStageFlightForceBudget` applies the trapezoidal rule to each positive-
duration interval in the returned coupled trace:

- thrust impulse: `∫ T dt`;
- aerodynamic drag impulse: `∫ D_aero dt`;
- recovery drag impulse: `∫ D_recovery dt`;
- aerodynamic-force impulse: `∫ |F_aero| dt` when available;
- velocity-equivalent accounting: `∫ T / m dt` and `∫ (D_aero + D_recovery) / m dt`.

It also reports peak thrust, drag, dynamic pressure, speed, total time span,
and per-stage active-window totals. A stage interval uses the left endpoint's
attached-stage topology. A zero-duration staging boundary therefore contributes
no interval and cannot be counted twice.

## Status and limits

The result is `assessed` when at least two samples span positive time, otherwise
`not-assessed`. Non-monotonic timestamps, non-positive mass, and negative force
magnitudes are rejected. Missing optional aerodynamic-force, dynamic-pressure,
or speed fields remain explicitly unavailable.

All force inputs are scalar magnitudes. The velocity-equivalent values are not
vector delta-v. The branch cannot attribute gravity, steering, plume,
staging, or aerodynamic-vector losses because it does not reconstruct force
directions or a complete propulsive-efficiency history. Mass changes and event
discontinuities are represented only at the supplied trace samples; sub-step
transients are not inferred.

This is an explainable telemetry aid for comparing a run and its topology. It
is not a mission-performance budget, physical validation, structural decision,
range-safety boundary, or flight-safety assessment.

## Provenance

- Implementation: `lib/physics/stage-flight-force-budget.ts`
- Model version: `rocketworks-stage-flight-force-budget-0.1.0`
- Validation status: `analytical-trace-integral-only`
- Regression coverage: `tests/stage-flight-preview.test.mjs`
