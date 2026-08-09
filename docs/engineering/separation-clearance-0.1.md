# Separation-clearance diagnostic 0.1

Status: `analytical-component-checks-only`.

Kestrel Lab now compares each detached-stage center-of-mass trajectory with the
retained vehicle's propagated center-of-mass path after an explicit staging
event. The diagnostic reports the minimum sampled separation, the time of that
minimum, release separation, final separation, and relative speed at release.

## Method

The retained trajectory is the exact world-frame rigid-body trace used by the
coupled preview (including the launch-rail handoff when configured). The
detached branch is the independent world-frame trajectory produced by the
separated-body model. For every detached sample at or after release, the
retained position is linearly interpolated in time and the Euclidean distance
between the two center points is evaluated:

\[
d(t) = \lVert \mathbf r_{detached}(t) - \mathbf r_{retained}(t) \rVert_2
\]

Velocity separation at release uses the same world-frame subtraction when both
traces provide velocity. No time extrapolation is performed; samples outside
the retained trace are reported as unmatched and produce a `partial` result.

## Scope boundary

This is a path-divergence diagnostic, not a collision or range-safety solver.
The implementation does not model body envelopes, fin geometry, joint or
spring mechanisms, angular separation impulse, plume interaction,
aerodynamic interference, lift, contact, or recovery on the detached body. A
small center-of-mass distance must not be interpreted as a collision result,
and a large distance must not be interpreted as a certified clearance margin.

The result carries model version `kestrel-separation-clearance-0.1.0` and the
same unvalidated engineering-preview status as the separated-body branch.

## Verification

- Unit tests cover interpolation, minimum-distance selection, release relative
  speed, partial time overlap, and malformed trajectories.
- Stage-flight previews pass their exact retained world-frame trace into each
  detached branch, so the browser telemetry uses the same state history rather
  than a separately reconstructed path.
