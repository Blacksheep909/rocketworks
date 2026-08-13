# Staged flight attitude telemetry 0.1

Status: `engineering-preview-unvalidated`  
Implementation: `lib/physics/stage-flight-preview.ts`, `app/page.tsx`, and `lib/export/project-exports.ts`  
Model: `kestrel-stage-flight-preview-0.30.0`

## Purpose

The coupled six-degree-of-freedom integrator already propagates a normalized
body-to-world quaternion and body-frame angular velocity. The staged adapter
now retains those state values in every `StageFlightTracePoint` rather than
reducing the Flight workspace to translation and scalar loads.

Each current trace sample carries:

- `orientationBodyToWorld`, the normalized attitude quaternion;
- `angularVelocityBodyRadS`, the body-frame angular velocity vector in rad/s;
- `attitudeTiltRad`, the angle between the vehicle nose axis and local ENU
  vertical; and
- `angularRateRadS`, the magnitude of the body angular velocity.

The browser profile inspector exposes attitude tilt and angular-rate plots.
Staged CSV exports include the quaternion, body-rate components, and explicit
degree/degree-per-second display columns. The engineering report records
sample coverage and peak tilt/rate when those fields are available.

## Coordinate and numerical convention

RocketWorks uses the body nose axis `-X` and local ENU vertical `+Z` in the
staged preview. The tilt diagnostic is the bounded angle

\[
\theta_{tilt} = \cos^{-1}(\hat{n}_{nose,world} \cdot \hat{z}_{ENU})
\]

where the nose direction is obtained by rotating body `(-1, 0, 0)` with the
solver quaternion. The angular-rate magnitude is

\[
\omega = \sqrt{\omega_x^2 + \omega_y^2 + \omega_z^2}.
\]

These are state projections, not new forces, control laws, or stability
claims. Quaternion values remain the solver's normalized state; the adapter
does not interpolate, smooth, or re-normalize a second attitude stream.

## Provenance and limits

Attitude and rate telemetry is `mathematical-regression-tests-only` alongside
the staged 6DOF result. It is useful for inspecting rail tip-off, gimbal
response, asymmetric thrust, damping, and event-induced state changes, but it
does not validate sensors, actuator response, guidance, structural loads,
flutter, contact, or flight safety. The tilt angle is relative to the local
vertical datum and is not a geodetic attitude solution.

Legacy trace records without the new fields remain importable. Their CSV cells
are blank and reports say `not available`; missing telemetry is never replaced
with a zero or inferred attitude.

## Automated checks

- staged preview traces retain finite normalized quaternion, angular-rate,
  tilt, and rate values;
- attitude tilt changes when the simulated body departs from vertical;
- legacy CSV fixtures retain deterministic blank fields;
- rendered UI source exposes the two new profile metrics;
- full build, regression, typecheck, and lint gates remain required.
