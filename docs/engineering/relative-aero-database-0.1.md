# Relative-body aerodynamic database 0.1

Status: `analytical-component-checks-only`

Implementation: `lib/physics/relative-aero-database.ts` and
`lib/physics/relative-aero-interaction.ts`

RocketWorks accepts an optional, directed source/target coefficient table for
post-trace relative-flow review. This is a clean-room data contract for
user-supplied or appropriately licensed proximity data; no aerodynamic data is
bundled with the application.

## Coordinate and table convention

Each binding names a source body and a target body. At a sample time, the
source air-relative velocity defines the local +x flow axis. Let `D_s` be the
source equivalent diameter, `r_t - r_s` the target-minus-source position, and
`u_s` the unit source air-relative velocity:

```text
x_rel = (r_t - r_s) · u_s / D_s
r_perp = ||(r_t - r_s) - x_rel D_s u_s|| / D_s
M_t = ||v_t - w_t|| / a_t
```

The database axes are ordered:

```text
values[lateral separation][axial separation][Mach]
```

Axial separation may be signed; positive values are downstream. Lateral
separation is non-negative. Each cell is a coefficient delta relative to the
target's isolated-body reference:

```text
ΔF_body = q S (ΔC_A, ΔC_N, ΔC_S)
ΔM_body = q S L (ΔC_l, ΔC_m, ΔC_n)
q = 1/2 ρ ||v_t - w_t||²
```

The table's reference area is used only when the target trace does not supply
one. Moment deltas are scaled only when a positive moment reference length is
declared. If either scale is unavailable, coefficient interpolation is still
retained while the dimensional load is reported as unavailable.

## Validation and interpolation

`createRelativeAeroDatabase` validates finite, strictly increasing Mach and
separation axes, exact lateral × axial × Mach grid shape, finite coefficient
deltas bounded to a magnitude of 20, non-negative uncertainty cells with
matching shape, required provenance and HTTP(S) source URLs, reference area,
and moment length. At least one coefficient channel is required; a moment
reference is required whenever a moment channel is present.

Queries use trilinear interpolation. The default `reject` policy refuses a
query outside the supplied domain. `clamp-with-warning` clamps each outside
axis to its nearest boundary and emits an `unsupported` applicability issue.
The query result retains requested/evaluated coordinates, all supplied
channels, interpolated absolute uncertainty, applicability issues, and source
provenance.

## Flight integration boundary

The current adapter runs this database after staged traces have already been
generated. It reports per-directed-pair sample coverage, query failures, and
maximum dimensional force/moment deltas in the relative-flow inspector and
engineering report. It never adds the deltas to the isolated-body load model,
shared-grid wake feedback, retained vehicle, or detached branch.

This boundary is intentional. A force-coupled separation solver must first
define simultaneous retained/discarded-stage states, hardware event timing,
relative attitude, plume state, uncertainty propagation, and conservation
checks. Interpolating a table after the fact is not evidence that those loads
are valid for a real vehicle.

## Provenance and limitations

The model exposes the source's declared validation status but does not upgrade
it. It does not verify axes, force/moment signs, reference geometry, Reynolds
similarity, data licensing, CFD convergence, wind-tunnel repeatability, or
flight correlation beyond structural input checks. It also does not model wake
roll-up, viscous shielding, shocks, plume interaction, unsteady derivatives,
attitude-dependent database coordinates, flexible bodies, collision response,
or covariance/time-series processes. No output is flight-safety evidence.

Primary public references include NASA/TM-2020-220582, *Wind Tunnel
Investigation of the Supersonic Stage Separation Aerodynamics of a Generic
Two-Stage-to-Orbit Reusable Launch Vehicle Configuration*, and NASA/AIAA-
2016-0798, *Space Launch System Booster Separation Aerodynamic Database
Development and Uncertainty Quantification*. Those publications motivate the
need for configuration- and relative-position-dependent loads; they are not
bundled data sources for RocketWorks.

## Regression evidence

`tests/relative-aero-database.test.mjs` covers trilinear interpolation, signed
axial coordinates, uncertainty interpolation, reject/clamp policies, shape
limits, provenance, and moment-reference requirements.

`tests/relative-aero-interaction.test.mjs` covers directed binding, dynamic
force/moment scaling, pair coverage, provenance summary, and the invariant
that input traces remain unchanged.
