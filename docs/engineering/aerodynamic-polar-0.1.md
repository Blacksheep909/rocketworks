# Aerodynamic coefficient polar inspector 0.1

Status: `analytical-coefficient-sampling`

Implementation: `lib/physics/aerodynamic-polar.ts`

RocketWorks can sample a provenance-qualified coefficient table at a fixed
Mach number, Reynolds number, and sideslip angle. The browser inspector renders
the resulting normal-force and drag-coefficient curves against angle of attack.
This is an inspection aid for supplied data, not a CFD, aeroelastic, or
flight-safety solver.

## Sampling contract

`sampleAerodynamicPolar` accepts a validated
`AerodynamicCoefficientTableModel` and an optional set of query conditions:

- Mach number, constrained to the table's non-negative Mach domain;
- Reynolds number, constrained to the table's positive Reynolds domain;
- sideslip in radians, constrained to the table's signed sideslip domain; and
- a strictly increasing angle-of-attack sample list of at most 128 points.

When no conditions are supplied, the sampler uses the arithmetic Mach midpoint,
the geometric Reynolds midpoint, the table's zero-clamped sideslip, and nine
evenly spaced angles across the declared angular range. A table with no angular
range receives a bounded +/-12 degree inspection span, but its legacy relation
is disclosed as a proxy.

At each point, table evaluation still owns interpolation, uncertainty, and
out-of-range policy. A direct body-axis force volume is preferred when the
source supplies one:

```text
Cx = forceCoefficientBody.x
Cy = forceCoefficientBody.y
Cz = forceCoefficientBody.z
```

For a legacy table without a direct force volume, the sampler uses the declared
relations:

```text
Cx = -Cd
Cy = (dCn / d alpha) * alpha
Cz = unavailable
```

The fallback is intentionally labelled an analytical small-angle proxy. It is
not a claim that the vehicle's force direction, sign convention, or nonlinear
stall behavior has been established.

## Result and review status

Each result carries its own model version, table model version, fixed flight
condition, per-point applicability issues, declared coefficient uncertainty,
assumptions, and de-duplicated warnings. A result is `review` when any sample
was clamped from an unsupported table domain. A direct force database receives
an informational applicability issue; declared uncertainty remains visible for
downstream dispersion work.

The plot is an original SVG presentation. It deliberately exposes only the
normal and drag curves, the fixed-condition controls, and domain status. It does
not imply dynamic pressure, Reynolds transition, hysteresis, separated flow,
control-surface deflection, plume interaction, or measured flight agreement.

## Validation boundary

Regression fixtures use synthetic, user-supplied provenance. Tests cover direct
force-volume preference, the legacy small-angle fallback, fixed-condition
propagation, unsupported-domain review status, and rejection of unsorted or
oversized angle declarations. Independent aerodynamic benchmarking and
reference-axis, reference-area, sign, and licensing review remain required for
any engineering use beyond exploration.
