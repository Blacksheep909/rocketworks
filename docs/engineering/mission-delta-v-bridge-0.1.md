# Mission delta-v composition-to-trace bridge

Model: `rocketworks-mission-delta-v-bridge-0.1.0`

Validation status: `analytical-composition-to-trace-comparison`

## Purpose

The staged Flight workspace now places two existing analytical views beside
each other:

- the serial-stack ideal delta-v from
  `rocketworks-mission-mass-ratio-0.1.0`; and
- the recorded thrust impulse equivalent from
  `rocketworks-mission-loss-budget-0.1.0`.

The bridge reports the signed ideal-to-trace gap, the corresponding
trace-to-ideal fraction when the ideal value is positive, and a separate
ideal-to-net-vector gap. This gives a fast way to spot topology or mass-model
differences while keeping the source diagnostics inspectable.

## Calculation boundary

For an ideal serial-stack value `Δv_ideal` and a recorded trace value
`Δv_trace = ∫ ||F_thrust|| / m dt`, the bridge reports:

```text
idealToTraceGap = Δv_ideal - Δv_trace
traceToIdealFraction = Δv_trace / Δv_ideal  (only when Δv_ideal > 0)
```

The vector comparison uses the existing magnitude of the integrated thrust
acceleration, not a second propagation. Gravity, aerodynamic, recovery,
steering, and event projections stay in the thrust-axis loss screen and are not
subtracted from either bridge value.

## Status and exclusions

The bridge is `assessed` only when the serial composition is assessed, the
trace has complete thrust-axis coverage, and no topology stages are excluded.
It becomes `partial` for incomplete coverage, review-status composition, or
excluded parallel/booster stages. It is `not-assessed` when either primary
value is unavailable.

This is a clean-room analytical comparison, not a validated mission delta-v,
achieved performance result, loss budget, certification artifact, or
flight-safety decision. A negative signed gap means the recorded scalar thrust
integral exceeds the serial preview; it is a prompt to inspect topology and
mass assumptions, not a physical loss credit.
