# Angular aerodynamic coefficient volumes 0.1

Status: `analytical-component-checks-only`

Implementation: `lib/physics/aerodynamic-coefficients.ts`

RocketWorks accepts an optional angle-aware extension to the existing
Mach/Reynolds coefficient table. The extension is intentionally a data
interpolation layer, not a CFD or aeroelastic solver. A legacy two-dimensional
record remains valid and continues to use the small-angle consuming model.

## Axes and storage order

An angular volume declares signed axes in radians:

- `angleOfAttackPointsRad`
- `sideslipPointsRad`

Each optional angular coefficient volume is stored in this order:

```text
values[sideslip][angleOfAttack][reynolds][mach]
```

The nominal drag, normal-force slope, center-of-pressure, and damping surfaces
may each provide a volume. A coefficient without a volume falls back to its
legacy Mach/Reynolds surface; no values are silently blended between unrelated
sources.

## Interpolation and limits

Mach is linearly interpolated, Reynolds number is interpolated in `log10(Re)`,
and angle of attack and sideslip are linearly interpolated in radians. The
same rule is applied to declared absolute uncertainty. Queries outside any
declared axis are rejected by default or clamped with an explicit unsupported
applicability issue when the record selects `clamp-with-warning`.

The flight adapter passes the current air-relative angle of attack and sideslip
into the table. It reports `mach-reynolds-angle-table` as the coefficient basis
when an angular volume is active, so trace and diagnostics consumers can tell
which source was used.

## Validation boundary

The importer validates finite, strictly increasing axes, exact volume shape,
positive drag and normal-force surfaces, non-negative uncertainty, and the
existing source/provenance envelope. These checks do not establish that a
user-supplied dataset is physically accurate, licensed for a particular use,
or valid outside its measured/computed domain.

The current consuming load model still represents normal force with its
bounded force relation and does not reconstruct nonlinear shock, hysteresis,
control-surface, plume, separated-body, or unsteady-flow effects. Angular
volumes therefore improve source fidelity and expose applicability, but are not
flight-safety or certification evidence.

## Regression evidence

The test suite covers trilinear angular interpolation, exact signed-axis
clamping/rejection, library round-trips, stage-aware query propagation, and
the rendered import/inspection affordances. The fixtures are synthetic and
carry explicit user-supplied provenance.
