# Relative-body aerodynamic database 0.1

Status: `analytical-component-checks-only`

Implementation: `lib/physics/relative-aero-database.ts`,
`lib/physics/relative-aero-interaction.ts`, and the device-local browser
library in `lib/project/relative-aero-library-state.ts`.

RocketWorks accepts an optional, directed source/target coefficient table for
post-trace relative-flow review. This is a clean-room data contract for
user-supplied or appropriately licensed proximity data; no aerodynamic data is
bundled with the application.

The browser's **Relative-body data** panel validates and stores up to eight
tables in versioned local storage. The selected table can be bound to retained
→ detached, detached → retained, or all ordered body directions (including
detached ↔ detached pairs) after the staged trace is generated. Selecting
**Diagnostics disabled** removes the binding. The panel can export the exact
JSON definition, shows the declared provenance and ranges, and makes the
binding policy explicit before a preview is rerun. Local storage is
device-local; the table is not silently embedded in a share link or downloaded
from a third-party database.

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

The default adapter runs this database after staged traces have already been
generated. It reports per-directed-pair sample coverage, query failures, and
maximum dimensional force/moment deltas in the relative-flow inspector and
engineering report. It never adds the deltas to the isolated-body load model,
shared-grid wake feedback, retained vehicle, or detached branch.

An explicit, opt-in `databaseForceFeedback` branch is available only inside the
shared coupled track. The stage adapter expands the selected directed binding
policy and filters it to bodies that are present in that track. Interpolated
force and moment coefficients are converted with the target's available
reference area and moment length, capped at the configured maximum force and
moment, and applied to rigid-body targets only. Point-mass targets and missing
rigid orientations remain diagnostic-only. A source body receives no
equal-and-opposite reaction; the branch is therefore a bounded target-load
sensitivity adapter rather than a conservation-complete interference solver.
Reject-policy queries increment a per-sample failure counter and are skipped so
unsupported table domains do not terminate the integrator. The result and
trace retain binding, applicability, failure, skip, cap, and peak-load
telemetry. The branch is disabled by default and never changes the independent
detached 6DOF branches.

This boundary is intentional. A conservation-complete separation solver must
first define simultaneous retained/discarded-stage states, hardware event
timing, relative attitude, plume state, uncertainty propagation, and reaction
loads. The opt-in branch is only a bounded analytical sensitivity path;
interpolating a table or applying its capped target load is not evidence that
those loads are valid for a real vehicle.

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

`tests/relative-aero-library-state.test.mjs` covers the versioned local
document, stable-id upsert, duplicate/schema rejection, grid-shape validation,
and provenance preservation. `tests/stage-flight-preview.test.mjs` covers the
explicit directed-pair expansion seam and the automatic retained-to-detached
binding path, confirming that dimensional diagnostics are produced without
changing the staged trace contract.
