# Attached-body aerodynamic interference screen 0.1

Status: analytical component checks only, unvalidated. This is an original
RocketWorks geometry review. It does not use OpenRocket source code, simulation
logic, UI, assets, databases, or backend components.

## Purpose

The attached-flow screen makes one previously implicit limitation visible for
multi-body designs: two attached stage or booster envelopes can occupy the
same axial region while their radial clearances are small or negative. The
screen compares current assembly geometry and returns a deterministic review
record for the design workspace and engineering report.

It is a post-processing diagnostic. It does not apply an interference factor,
shielding correction, base-drag change, lift correction, aerodynamic moment, or
trajectory perturbation to any flight model.

## Geometry reduction

Each axisymmetric component is reduced to its axial station range and maximum
outer radius. Fin sets use the fin root/tip/sweep extent and body radius as a
conservative transverse envelope. Point masses have no aerodynamic surface and
therefore leave their physical stage body as `not-assessed` when no surface
component is present.

For a physical stage instance, the browser combines component envelopes around
the stage-instance center. For a pair of bodies `i` and `j`, the review uses:

`axialOverlap = min(x_end_i, x_end_j) - max(x_start_i, x_start_j)`

`radialClearance = centerDistance - radius_i - radius_j`

Pairs with no positive axial overlap are omitted. Co-linear serial stages are
treated as an intentional structural interface and are not reported as
interference. A pair is `clear` above the configured near-clearance band,
`near` inside that band, and `overlap` when the conservative envelopes cross.

## Validation status and assumptions

The model version is `rocketworks-attached-aero-interference-0.1.0` and the
validation status is `analytical-component-checks-only`. The output carries:

- assessed and unavailable body counts;
- clear, near, and overlap pair counts;
- minimum radial clearance and maximum envelope penetration;
- pair-level axial overlap, radial clearance, status, and explanatory detail;
- assumptions and warnings that preserve the non-propagating boundary.

The envelopes are intentionally conservative and do not describe local fin
gaps, boundary-layer interaction, wake roll-up, plume flow, Reynolds or Mach
dependence, attitude-dependent crossflow, or unsteady derivatives. Validated
interference databases, CFD, wind-tunnel data, and measured-flight comparison
remain future work.

## Verification

`tests/attached-aero-interference.test.mjs` covers clear/near/overlap
classification, co-linear serial interfaces, missing surface geometry,
component placement conversion, and invalid bounds.
