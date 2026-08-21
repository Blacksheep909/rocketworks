# Saved simulation run comparison 0.1

Status: `engineering-preview-unvalidated`

RocketWorks can compare two or more saved records from the device-local
simulation run library without re-running a flight or changing project state.
The comparison is a deterministic read of validated result envelopes and is
separate from the live current-versus-reference panels.

## Selection and grouping

The run-library dialog lets the user select up to eight saved records. Vertical
and coupled staged records are rendered in separate groups so unlike result
schemas are never silently mixed. A mixed selection is useful for reviewing a
catalog, but it does not create a cross-model delta.

Vertical metrics include apogee, maximum speed and Mach, maximum dynamic
pressure, time to apogee, total flight time, impact speed, total impulse, event
count, warning count, and trace sample count. Staged metrics include maximum
altitude, maximum speed and Mach, maximum dynamic pressure, time to apogee,
maximum tilt, maximum angular rate, event count, separated-body count, warning
count, and trace sample count. Missing or non-finite values remain `—` in the
interface and blank in the CSV rather than being coerced to zero.

## CSV handoff

The comparison action emits a deterministic long-form CSV with model identity,
validation status, project identity, run fingerprints, saved timestamps, metric
keys, units, and values. It is intended for plotting, design reviews, and
reproducible discussion. It is not a project restore, a new simulation input,
an acceptance test, certification evidence, or flight-safety analysis.

## Verification boundary

The comparison module validates the local library and selected IDs, rejects
unknown or duplicate selections, preserves saved-run order, and keeps the
source fingerprints attached to each row. It does not recompute trajectories,
infer causality, normalize metrics across vertical and staged solvers, or
upgrade the model validation status.
