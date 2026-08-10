# Simulation freshness 0.2

## Purpose

RocketWorks keeps a deterministic browser-local identity for the configuration
used by each vertical and coupled-flight preview. The identity covers editable
vehicle and flight inputs, the active stage topology, the selected motor ID,
and the selected motor record. It also includes the selected aerodynamic table
definition (or the constant-Cd source). A result is current only when its
recorded identity matches the identity of the controls now on screen.

This is a presentation and export-safety contract. It is not a cryptographic
project hash, a model-validation result, or evidence that the underlying
calculation is flight-safe.

## User-facing behavior

- Changing any modeled input marks the displayed estimate as stale without
  destroying the previous trace, so the comparison remains visible.
- The flight workspace shows a `RERUN REQUIRED` notice with a direct rerun
  action and the mission rack reports `MODEL / STALE`.
- Simulation-dependent exports (vertical trace, coupled trace, and engineering
  report) are blocked until the matching preview has been rerun.
- Project JSON retains the editable project and records whether each available
  simulation was `current`, `stale`, or `not-run` at export time.

## Determinism and scope

The fingerprint serializes canonicalized JSON with recursively sorted object
keys and preserved array order. The implementation is intentionally local to
the browser and does not expose the fingerprint as an authentication or
integrity mechanism. The selected motor record is included so replacing a
user-supplied curve under the same identifier cannot silently reuse an old
trace.

## Limitations

Freshness only answers whether the visible result matches the visible inputs.
It does not validate equations, numerical integration, motor data, weather,
materials, structures, launch operations, or recovery behavior. All RocketWorks
Lab previews remain engineering-preview calculations with explicit model
versions and independent validation required before any real-world use.
