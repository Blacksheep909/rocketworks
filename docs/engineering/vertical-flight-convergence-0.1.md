# Vertical-flight integration convergence 0.1

Status: `engineering-preview-unvalidated`.

Implementation: `lib/physics/vertical-flight-convergence.ts`

This is an original numerical-sensitivity diagnostic for the RocketWorks fast
vertical model. It contains no OpenRocket source, engine, UI, assets, data, or
backend content. It must not be used as a flight-safety or certification gate.

## Contract

`analyzeVerticalFlightConvergence` accepts the same `VerticalFlightConfig` used
by the nominal one-dimensional solver. It keeps the caller's requested result
as the base run and performs a second deterministic run with half the
integration step. The output records the two step sizes, metric differences,
event-set agreement, timing differences, assumptions, and warnings. A replay
failure is returned as `not-assessed` rather than being treated as a pass.

The helper is deliberately separate from `VerticalFlightResult`: the nominal
trace remains the requested integration, while the replay is evidence about
step-size sensitivity only. Browser results retain a fingerprint so a
convergence card is hidden when the design or environment has changed.

## Comparisons

The diagnostic compares:

- apogee, peak speed, peak dynamic pressure, and impact speed using relative
  differences normalized by the larger absolute value and a one-unit floor;
- time to apogee and the maximum event-time difference in seconds; and
- event sets by ordered event type (`ignition:0`, `burnout:0`, and so on).

The default heuristic thresholds are 2% for the metric group and 0.05 s for
apogee/event timing. A run is `converged` only when the event sets agree, the
impact result is available in the same way for both runs, and all thresholds
pass. Otherwise it is `watch`. These thresholds are intentionally exposed in
the result and are not physical error bounds.

## Validation boundary

The replay catches sensitivity to the fixed-step RK4 integration cadence. It
does not estimate model-form error, aerodynamic uncertainty, motor-data error,
weather uncertainty, structural response, experimental agreement, or rare
event behavior. A converged replay is therefore not evidence that the vehicle
is flight-safe. Independent analysis, instrumentation, and qualified review
remain required.

## Verification

Regression tests cover deterministic replay, step-pair reporting, strict
threshold watch behavior, and invalid-step rejection. The browser renders the
diagnostic beside the vertical flight profile and carries its model/version
status in the visible card. The coupled stage-flight model retains its own
separate convergence implementation and thresholds.
