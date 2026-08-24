# RocketWorks staged telemetry calibration 0.1

## Purpose and boundary

Staged telemetry calibration is a bounded, versioned engineering-study adapter
for comparing the RocketWorks coupled stage-flight preview with an imported
flight log. It estimates only the factors the caller declares. It does not
introduce a second simulation engine, rewrite the flight model, or establish
that the measured instrumentation or the model is correct.

Model identity:

- adapter: `rocketworks-stage-flight-calibration-0.1.0`;
- flight model: reported at runtime from the staged preview model version;
- search model: `kestrel-design-optimization-0.1.0` (reported inside the
  optimization result);
- status: `engineering-preview-unvalidated`.

## Residual contract

Each candidate runs the complete staged preview and is compared with the
imported altitude, velocity, and reconstructed acceleration channels. Samples
are linearly interpolated from the simulated trace after the caller-declared
fixed time offset. A supplied positive one-sigma value is used as that channel's
normalization. If sigma is absent, the residual uses the absolute measured mean
with a conservative floor (10 m for altitude and 5 units for the other
channels). The combined `weightedResidualRmse` is the sample-count-weighted
root mean square of those normalized channel losses.

The result retains channel RMSE, matched-sample fraction, convergence, and
simulation-failure metrics for every candidate. A failed candidate is assigned
an explicitly infeasible penalty; it is never removed or converted into a
plausible residual. Constraints therefore make coverage and failures visible
in the Pareto result.

## Variables and search limits

Variables use the same declared, bounded staged-variant contract as the sweep
and optimizer surfaces. The current UI declares delivered thrust scale and
drag-coefficient scale only, but the adapter accepts any supported factor when
the caller supplies a safe sub-range. Topology, events, environment source,
integration method, and aerodynamic source remain fixed for a run.

The seeded search is deterministic for a fixed input, telemetry series, and
candidate contract. Determinism is a reproducibility aid, not proof of a global
optimum. The time offset is fixed rather than estimated, so event alignment,
sensor bias, coordinate transforms, and time-correlated noise are outside this
surface.

## Interpretation

Calibration is residual minimization against one supplied log. A low residual
can result from compensating errors, over-fitting, sparse coverage, or a biased
sensor; it does not identify causal parameter truth. Results are therefore
engineering-preview diagnostics only—not validation, certification,
manufacturing approval, or flight-safety evidence. Use independent instrument
checks, additional flights, range procedures, and qualified engineering review
before making safety-critical decisions.
