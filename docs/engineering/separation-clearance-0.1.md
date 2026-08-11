# Separation-clearance diagnostics 0.3

Status: `analytical-component-checks-only`.

RocketWorks compares each detached-stage center-of-mass trajectory with the
retained vehicle's propagated center-of-mass path after an explicit staging
event. It also aggregates every retained/detached and detached/detached pair
into one multi-body diagnostic. The diagnostics report the minimum assessed
separation, the time of that minimum, release separation, final separation, and
relative speed at release where the traces provide it, plus relative speed and
inward radial closing speed at the continuous closest approach.

## Method

The retained trajectory is the exact world-frame rigid-body trace used by the
coupled preview (including the launch-rail handoff when configured). The
detached branch is the independent world-frame trajectory produced by the
separated-body model. For every detached sample at or after release, the
retained position is linearly interpolated in time and the Euclidean distance
between the two center points is evaluated. The minimum is now refined over
continuous piecewise-linear relative motion between the union of both traces'
sample times, so a crossing between integration samples is not silently
missed:

\[
d(t) = \lVert \mathbf r_{detached}(t) - \mathbf r_{retained}(t) \rVert_2
\]

Velocity separation at release uses the same world-frame subtraction when both
traces provide velocity. At the closest approach, the result reports the
relative speed and the inward radial component (clipped at zero). If a trace
does not carry velocity, the piecewise-linear position slope is used only as
kinematic telemetry. No time extrapolation is performed; samples outside the
retained trace are reported as unmatched and produce a `partial` result.

## Multi-body aggregation

`analyzeMultiBodySeparation` accepts at least two bodies, each with a unique
identifier, a release time, and a world-frame center-of-mass trace. It runs the
same two-body comparison for every unique pair. A pair begins at the later of
its two release times, which prevents a detached body from being compared with
another body's pre-release path. The aggregate exposes pair records, the
closest assessed pair, the minimum distance across all matched pairs, and an
aggregate `assessed`, `partial`, or `not-assessed` status.

The aggregate model is versioned independently as
`kestrel-multi-body-separation-0.3.0`; the single-pair result is
`kestrel-separation-clearance-0.3.0`. The `kestrel-*` prefix is retained for
serialized project compatibility even though the public product is branded
RocketWorks.

## Scope boundary

This remains a path-divergence diagnostic, not a collision or range-safety
solver. The implementation does not model fin geometry, joint or spring
mechanisms, angular separation impulse, plume interaction, aerodynamic
interference, lift, contact, or recovery on the detached body. The separate
`separation-envelope-0.1.md` screen may subtract conservative fixed spherical
geometry bounds from this COM path, but it does not turn the result into a
contact or certified clearance margin.

Both results carry the same unvalidated engineering-preview status as the
separated-body branch.

## Verification

- Unit tests cover interpolation, continuous minimum-distance selection,
  between-sample crossings, release relative
  speed, closest-approach relative/closing speed, partial time overlap,
  malformed trajectories, pairwise aggregation, duplicate identifiers, and
  insufficient body inputs.
- Stage-flight previews pass their exact retained world-frame trace into each
  detached branch, so the browser telemetry uses the same state history rather
  than a separately reconstructed path. The aggregate then compares those
  exact retained and detached traces without extrapolation.
