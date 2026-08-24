# RocketWorks relative-flow evidence calibration 0.1

## Purpose and boundary

The relative-flow evidence calibration adapter estimates bounded factors for
the RocketWorks released-body wake-cone proxy against a user-supplied,
pair-level evidence file. Evidence may come from an appropriately licensed
wind-tunnel reduction, CFD post-processing export, or instrumented flight
comparison. The adapter does not ingest or bundle any third-party solver or
database, and it never feeds a force, moment, contact impulse, or state change
back into a trajectory.

Model identity:

- adapter: `rocketworks-relative-aero-calibration-0.1.0`;
- interaction model: `rocketworks-relative-aero-interaction-0.2.0`;
- search model: `kestrel-design-optimization-0.1.0` (reported inside the
  result);
- status: `engineering-preview-unvalidated`.

## Evidence contract

The strict CSV importer requires one directed row per `source_body_id` →
`target_body_id` pair. A row must contain at least one of:

- `exposure_coverage_fraction` (0–1), the observed fraction of flow-qualified
  samples exposed to the source wake;
- `peak_velocity_deficit_fraction` (0–less-than-1), the observed maximum
  deficit fraction; or
- `dynamic_pressure_delta_pa`, the observed maximum positive dynamic-pressure
  reduction proxy in pascals.

Optional positive uncertainty columns (`exposure_sigma`,
`peak_deficit_sigma`, and `q_delta_sigma_pa`) define one-sigma normalization
for the matching channel. Blank metric cells are allowed so a source can
provide only what it measured. Pair identifiers must be unique, and malformed,
non-finite, out-of-range, or quoted fields are rejected rather than silently
coerced.

## Calibration and metrics

Each candidate reruns the independent relative-flow analyzer with the declared
body traces, environment provider, geometry, and unlisted options fixed. The
candidate may vary only the caller-declared wake half-angle, recovery distance
in source body diameters, peak deficit, and maximum deficit. A maximum deficit
below the peak is rejected by the analyzer and retained as an explicit
`simulationFailure` candidate metric.

Channel residuals use the supplied one-sigma value when present. Without sigma,
fraction channels use conservative fixed scales (0.25 for exposure and 0.1 for
deficit); dynamic-pressure deltas use the measured magnitude with a 10 Pa floor.
The `weightedResidualRmse` is the root mean square across all measured channel
residuals. The result also retains channel RMSE, matched-observation fraction,
and failure status so unsupported or missing pairs remain visible.

The seeded constrained search is deterministic for a fixed evidence file,
body traces, bounds, and seed. Determinism does not prove a global optimum or
identify a causal aerodynamic coefficient. The result is an agreement study
against the supplied aggregate observations; it does not estimate phase lag,
sensor bias, wake roll-up, turbulence, plume interaction, attitude-dependent
moments, or time-correlated errors.

## Interpretation and limits

A low residual can reflect compensating errors, sparse pair coverage, or an
evidence reduction that shares the proxy's assumptions. It is not proof that a
stage-separation load is correct. Use source provenance, independent reruns,
additional geometry and flow evidence, and qualified engineering review before
using any calibrated factor in a design release.

This adapter remains an engineering diagnostic—not stage-separation validation,
CFD validation, wind-tunnel qualification, certification, manufacturing
approval, range-safety evidence, or flight-safety evidence. The calibrated
values do not change the retained or detached trajectories until a separate,
explicit force-feedback study is run, and that branch remains analytically
bounded and unvalidated.
