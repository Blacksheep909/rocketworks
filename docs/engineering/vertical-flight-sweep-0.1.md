# Vertical-flight parameter sweep 0.1

Status: engineering preview; deterministic regression-tested; not validated for flight or range-safety decisions.

## Purpose

The Flight workspace exposes a bounded one-variable trade study for the independent vertical-flight model. It lets a designer inspect how a declared change in delivered thrust, dry mass, drag coefficient, wind magnitude, or recovery delay moves apogee, peak dynamic pressure, impact speed, and launch success without silently changing the rest of the configuration.

The browser workflow uses nine rows by default, permits up to twenty-five rows from the UI, keeps failed evaluations visible, and exports the complete table as CSV. The sweep is also included in the versioned RocketWorks project document when a result is present.

## Model contract

- Adapter: `kestrel-vertical-sweep-0.1.0`.
- Underlying trajectory model: `kestrel-vertical-0.4.0-alpha`.
- Sampling: linearly spaced inclusive endpoints; no random seed is required.
- Evaluation: each row calls the same deterministic vertical solver used by the nominal estimate after applying one explicit variant factor.
- Supported factors: dry-mass scale, drag-coefficient scale, delivered-thrust scale, wind-profile scale, recovery delay in seconds, and recovery inflation-time scale.
- Bounds: the adapter rejects non-finite values and physically unbounded UI ranges before evaluation.

## Interpretation

The sweep is intended for sensitivity inspection and design review. A monotonic trend is not proof of causation, and a local sweep does not establish a global optimum. Rows with evaluator errors are retained in the CSV and excluded from range summaries. Compare results at multiple step counts when a trend is nonlinear or a threshold is close.

## Known limitations

- The underlying vertical model is a one-dimensional ascent/descent approximation; it is not the staged 6DOF model.
- Parameter correlations, model-form uncertainty, structural failure, motor manufacturing variation, and atmospheric forecast error are not inferred by the sweep.
- Recovery and landing outputs remain preliminary and depend on the selected recovery model.
- A sweep cannot validate a motor, certify a design, establish stability margins, or approve a launch.
