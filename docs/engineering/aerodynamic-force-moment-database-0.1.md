# Direct aerodynamic force and moment database 0.1

Status: `analytical-component-checks-only`

Implementation: `lib/physics/aerodynamic-coefficients.ts` and
`lib/physics/rocket-loads.ts`

RocketWorks can now consume optional angle-aware body-axis force and static
moment coefficient volumes from a user-supplied aerodynamic package. This is
an independent data/loads path; it does not copy or bundle a third-party
simulation engine or aerodynamic database.

## Coefficient convention

The volume order is the same as the angular coefficient extension:

```text
values[sideslip][angleOfAttack][reynolds][mach]
```

The direct force vector is dimensionless and uses the consuming vehicle body
axes:

```text
C_F = (C_axial, C_normal, C_side)
F_body = q S C_F
```

The direct static moment vector is dimensionless:

```text
C_M = (C_roll, C_pitch, C_yaw)
M_body = q S (C_roll l_x, C_pitch l_y, C_yaw l_z)
```

In RocketWorks' nose-to-tail body convention, the axial force is +x and a
nose-first drag resultant is normally positive +x. The normal and side signs
are owned by the imported package's declared axis convention and must be
checked before use. The stage-aware adapter supplies the moment reference
lengths from the regime's declared reference geometry (or the validated
diameter/length fallback) and exposes the result in diagnostics.

## Load-path behavior

When direct force coefficients are present and the current flow is forward
with sufficient airspeed, the 6DOF load model uses `q S C_F` as the complete
body-axis aerodynamic force. It decomposes the result into axial and
transverse diagnostics for readability, but does not replace the imported
vector with a legacy normal-force approximation.

When direct static moment coefficients are present under the same conditions,
the load model uses the normalized `q S C_M l` result. If only direct force is
provided, the existing center-of-pressure cross-force moment remains the
explicit fallback. Rate damping derivatives remain a separate optional term;
they are not silently folded into the static moment database.

If the flow is not forward or is below the configured load threshold, direct
coefficients are not applied and the existing bounded fallback behavior is
retained with its applicability warnings. Queries outside declared axes follow
the table's reject or clamp-with-warning policy.

## Validation boundary

The importer and table model validate exact volume shape, finite coefficients,
finite uncertainty, signed monotonic angular axes, and source/provenance
metadata. The load model validates moment reference lengths and reports the
selected coefficient basis (`mach-reynolds-force-moment-table`) plus direct
force/moment application flags.

These checks do not certify sign conventions, reference areas, reference
lengths, data licensing, aerodynamic accuracy, shock behavior, plume effects,
separated-body interference, unsteady derivatives, or flight safety. The
current database is a transparent coefficient-driven engineering preview, not
a CFD solver, aeroelastic model, range-safety analysis, or certification
artifact.

## Regression evidence

Synthetic fixtures cover direct volume interpolation, body-axis force and
moment normalization, stage-aware query propagation, load-result replacement,
library round-trips, malformed data rejection, and rendered UI disclosure of
the direct database boundary.
