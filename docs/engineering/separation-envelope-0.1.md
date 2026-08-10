# Spherical-envelope separation screen 0.1

Status: `analytical-component-checks-only`. This screen is a conservative
geometry diagnostic, not a contact, collision, range-safety, or flight-safety
solver.

## Purpose

The staged preview already propagates retained and detached center-of-mass paths
in the shared world frame. This increment adds a small, explainable geometry
bound on top of those paths so a designer can see when the sampled separation
distance is smaller than the supplied component envelope.

## Geometry bound

For each body, RocketWorks estimates a fixed spherical radius from the original
component geometry. Axisymmetric stations, fin extents, and point-mass
locations are bounded from the body's aggregate center of mass. The largest
component-center distance plus its local geometry bound is used:

`r_body = max_i( ||q_i - r_CG|| + b_i )`

where `q_i` is the transformed component center and `b_i` is a conservative
bound around that center. When a caller does not provide `q_i`, RocketWorks
derives it from the component origin and local geometry. The radius is
intentionally independent of attitude and time. It may be over-conservative
for repeated radial stages and does not infer propellant slosh, flex, or an
oriented mesh.

## Clearance calculation

For a pair of bodies with COM distance `d(t)` and fixed radii `r_1`, `r_2`, the
screen reports:

`c(t) = d(t) - (r_1 + r_2)`

The reported minimum is the continuous piecewise-linear COM closest approach
minus the radius sum. A non-positive value is labeled `potential overlap`; it
does not prove that physical surfaces touch because the bound is spherical and
geometry-free.

Pairs without both geometry radii, or without overlapping post-release traces,
remain `not-assessed`. The browser preserves those missing-data states instead
of borrowing a vehicle diameter or silently extrapolating a path.

## Scope boundary

The screen does not model oriented body envelopes, fin sweep intersection,
joint or spring mechanisms, angular separation impulse, plume impingement,
aerodynamic interference, contact response, terrain, or range-safety rules. It
is useful for highlighting a geometry review item, not for certifying a
separation event.

## Verification

- Component-bound fixtures verify finite, deterministic radii for axisymmetric,
  fin, and point-mass geometry.
- Pair fixtures verify radius subtraction, potential-overlap labeling, partial
  geometry coverage, and invalid-radius rejection.
- Stage-flight integration keeps the spherical screen separate from the
  center-of-mass diagnostic and exposes both model versions in the result.
