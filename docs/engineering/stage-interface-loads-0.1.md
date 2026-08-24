# Stage-interface load path 0.6

RocketWorks includes a bounded stage-interface review for enabled topology edges. The adapter is original clean-room code and is intentionally narrower than a connector, contact, or structural finite-element solver.

## Scope

`createStageInterfaceLoadReview` evaluates each enabled child stage with a parent relationship:

1. Sum active logical-stage mass and configured peak motor thrust.
2. Compute a common axial acceleration proxy, `a = max(g, T / M)`, using the supplied gravity and optional screening load factor.
3. For a serial parent/child edge, estimate downstream mass as the child subtree plus retained payload/recovery mass.
4. Estimate axial interface demand as `F = m_downstream · a · loadFactor`.
5. When both parent and child supply section evidence, use the weaker shell-section proxy: `capacity = min(A_parent, A_child) · min(allowable_parent, allowable_child)`.
6. Report factor of safety against the larger declared parent/child requirement.
7. For repeated parallel stages, compute a separate equal-share force-scale
   audit: per-instance axial demand, canted-thrust radial force, eccentric
   moment at the authored repeat radius, and the symmetric radial resultant.
8. When the staged trace supplies the current body attitude and net force, carry
   the magnitude of the body-transverse (+Y/+Z) acceleration into a separate
   force envelope: `F_transverse = m_downstream · a_transverse · loadFactor`.
   The optional resultant `sqrt(F_axial² + F_transverse²)` is telemetry only;
   it does not change the axial shell-section capacity or factor of safety.
9. When both parent and child rows provide positive allowable shear evidence,
   compare the transverse demand against a separate shell-section proxy,
   `V_capacity = min(A_parent, A_child) · min(τ_parent, τ_child)`. The result
   is reported as a transverse shear factor of safety and never merged into
   the axial compression status.
10. For repeated parallel stages, add the per-instance canted-thrust radial
    force to the optional body-transverse demand as a conservative local radial
    demand, then compare it with the same explicitly separate shell-section
    shear proxy when the evidence exists.
11. When a child stage supplies upstream connector evidence, compute a separate
     direct single-shear capacity:
     `V_connector = n · π(d/2)² · τ_allowable · η`, where `n` is connector count,
     `d` is the supplied diameter, `τ_allowable` is the supplied allowable shear,
     and `η` is the explicit group-efficiency reduction. This channel is never
     merged into the shell-section or axial status.
12. When a parallel child stage also supplies a positive fastener-group radius,
    bound the per-fastener eccentric demand as
    `V_i = V_radial/n + |M_e|/(n · R_group)` and report
    `FoS_ecc = (π(d/2)² · τ_allowable · η) / V_i`. Direct and moment terms are
    summed conservatively for arbitrary relative directions; the screen does
    not solve contact, bearing, or joint deformation.

The default load factor is 1.0. It is an explicit screening multiplier and is not a measured transient or certification factor. When a current staged-flight trace is supplied, the review filters each interface to samples where both stages remain attached and compares the largest body-axis acceleration with the peak-thrust baseline; the larger value is used for the demand.

## Status policy

- `pass`: serial interface capacity exceeds the declared factor-of-safety threshold.
- `review`: supplied capacity is below the threshold.
- `unavailable`: the parent is missing/inactive, the stack has no positive
  mass, or section/allowable evidence is incomplete. The serial-capacity row
  for a parallel interface remains unavailable because it is not a connector
  solver.

The transverse/radial capacity status is reported separately as
`pass`/`review`/`unavailable`. Missing shear evidence or missing transverse
demand leaves that channel unavailable without changing a serial axial pass.
The result-level `shearStatus` aggregates only positive transverse/radial
demand channels, so an axial `assessed` result can still carry a separate
shear `review` or `not-assessed` status.

Connector direct-shear status is reported separately with the same
`pass`/`review`/`unavailable` values, and the result-level `connectorStatus`
aggregates only positive transverse/radial demand channels. Connector evidence
belongs to the child stage's upstream connector group; it is not inferred from
the parent shell or material profile. A positive transverse/radial demand with
missing direct-shear evidence leaves the row unavailable and the aggregate in
review; missing eccentric group-radius evidence keeps only the eccentric
channel not assessed.

Connector eccentricity status is reported separately as
`connectorEccentricStatus`. It is only assessed for positive parallel radial
demand when the child connector evidence includes `groupRadiusM`; leaving that
field blank keeps eccentricity explicitly not assessed rather than upgrading
the direct-shear result.

Parallel force-scale rows use `screened`/`unavailable` status. `screened` means
the equal-share arithmetic had the required topology and acceleration inputs;
the separate radial-capacity channel may still be unavailable or in review.

The aggregate is `assessed` only when every interface passes. Any review or unavailable row yields `review`; no interface yields `not-assessed`.

## Deliberate limits

The trace projection uses the unconstrained net force divided by instantaneous stack mass, projected onto the vehicle nose direction. The transverse channel is the magnitude of the same acceleration in body +Y/+Z, so it is only available for traces that carry the body attitude and full force vector. These are kinematic envelopes, not rail-reaction or joint-load reconstructions. The parallel audit assumes equal mass/thrust sharing across repeated instances and uses `F_r = T_i sin(theta)` and `M_e = F_r r` as local force/moment scales. The optional shell shear proxy uses the shell-section area and material allowable shear from both parent and child rows. The optional connector proxy uses only the supplied direct-shear fastener area and efficiency; the eccentric extension uses an equal-share bolt-circle radius and conservative direct-plus-moment superposition. Neither channel models bearing, pull-through, preload, prying, thread engagement, bonded joints, local shell buckling, bending capacity, drag, rail contact/reaction, transient amplification, staging impulse, plume interaction, separation dynamics, or connector/radial joint qualification. The section, allowable, and connector fields are user-supplied screening evidence, not qualification data.

The result is an engineering triage surface. It is not structural certification, manufacturing release, range-safety evidence, flight-safety evidence, or experimental validation.

## Provenance

- Implementation: `lib/physics/stage-interface-loads.ts`
- Model version: `rocketworks-stage-interface-loads-0.7.0`
- Validation status: `analytical-axial-transverse-radial-connector-eccentricity-load-path-proxy`
- Related public basis: Newton's second law (`F = m a`) and the project structural-screen section/allowable inputs. Public equations and standards are reference material only; no OpenRocket source, UI, assets, database, or simulation engine is used.
