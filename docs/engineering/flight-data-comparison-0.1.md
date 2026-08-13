# Flight-data comparison 0.3

Status: `engineering-preview-unvalidated`.

## Purpose

The browser Flight workspace can compare a current RocketWorks vertical or coupled
stage/6DOF trace with an instrumented flight log supplied by the user. This is
deliberately a diagnostic and reproducibility surface: it helps expose model
discrepancy, timestamp coverage, and sensor-to-model drift without presenting
an agreement score as validation or flight-safety evidence.

## Input contract

The importer accepts a simple comma-separated UTF-8 text file no larger than
5 MB. The first non-comment row is the header; lines beginning with `#` and
blank lines are ignored. `time_s` (or `time`/`t`) is required. Any of
`altitude_m`, `velocity_mps`, and `acceleration_mps2` may be supplied, and each
sample must contain at least one supported metric. Optional positive one-sigma
columns can be supplied as `<metric>_sigma`, `<metric>_uncertainty`, or
`<metric>_stddev` (with the SI suffix where appropriate), for example
`altitude_sigma_m` and `velocity_uncertainty_mps`. An uncertainty column must
have its matching measured metric in the same row. Values are SI units, sample
times must increase strictly, and quoted fields are intentionally rejected so
malformed logs fail visibly instead of being silently reinterpreted.

## Comparison method

For every measured timestamp `t_m`, RocketWorks linearly interpolates the selected
simulated trace at `t_m + Δt`. The Flight card exposes `Δt` as a bounded seconds
control; the default is zero. No automatic event alignment, sensor latency
estimation, smoothing, bias correction, or gravity calibration is applied. For
each shared metric, the residual is defined as:

`r_i = simulated_i - measured_i`

The result reports matched coverage, mean residual, root-mean-square error,
maximum absolute residual, and the interpolated 95th percentile absolute
residual. When a positive one-sigma value is present, it also reports the
normalized residual `r_i / sigma_i`, normalized RMSE, signed normalized mean,
and normalized P95 with explicit per-metric coverage. Positive bias means the
model is higher than the measured value. Samples outside the simulated time
range remain counted as unmatched and are called out in warnings.

## Scope limits

The comparison does not establish model validity, uncertainty calibration,
sensor accuracy, coordinate-frame equivalence, or flight safety. Normalized
residuals are not a chi-square test, uncertainty calibration, or acceptance
criterion; they only make the supplied measurement scale visible. The vertical
adapter compares the one-dimensional vertical trace. The coupled adapter maps
stage-flight altitude and speed into the same contract, collapses duplicate
event timestamps to the final state at each timestamp, and reconstructs its
acceleration channel with centered finite differences (forward/backward at the
endpoints). That acceleration is diagnostic, not a new sensor or 6DOF
truth-model. Coordinate-frame transformations, barometric altitude bias, GNSS
filtering, event-time synchronization, covariance matrices, and time-correlated
sensor error remain future work. After a successful strict parse, the raw CSV and source filename
are stored under the versioned `kestrel.project.arc54.flight-data.v1` browser
key. This is device-local convenience storage, not a project snapshot, cloud
record, or share-link payload; malformed, oversized, or unsupported stored
records are ignored without being rewritten. A residual CSV export contains
only the matched rows plus model/version/source metadata, including the selected
trace source, so the comparison can be reviewed or attached to an engineering
note without changing the project inputs.

## Verification

Regression tests cover comment/header parsing, supported metric and uncertainty
aliases, strict positivity and metric pairing, strictly increasing timestamps,
linear interpolation, raw and normalized residual signs, time offsets, partial
uncertainty coverage warnings, coupled event-timestamp normalization, diagnostic
finite-difference acceleration, malformed or metric-free logs, and the local
snapshot schema/size guardrails.
