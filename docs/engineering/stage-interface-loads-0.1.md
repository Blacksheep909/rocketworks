# Stage-interface axial and parallel load path 0.3

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

The default load factor is 1.0. It is an explicit screening multiplier and is not a measured transient or certification factor. When a current staged-flight trace is supplied, the review filters each interface to samples where both stages remain attached and compares the largest body-axis acceleration with the peak-thrust baseline; the larger value is used for the demand.

## Status policy

- `pass`: serial interface capacity exceeds the declared factor-of-safety threshold.
- `review`: supplied capacity is below the threshold.
- `unavailable`: the parent is missing/inactive, the stack has no positive
  mass, or section/allowable evidence is incomplete. The serial-capacity row
  for a parallel interface remains unavailable because it is not a connector
  solver.

Parallel force-scale rows use `screened`/`unavailable` status. `screened` means
the equal-share arithmetic had the required topology and acceleration inputs;
it does not mean that radial joint transfer has been assessed.

The aggregate is `assessed` only when every interface passes. Any review or unavailable row yields `review`; no interface yields `not-assessed`.

## Deliberate limits

The trace projection uses the unconstrained net force divided by instantaneous stack mass, projected onto the vehicle nose direction. It is a kinematic envelope, not a rail-reaction or joint-load reconstruction. The parallel audit assumes equal mass/thrust sharing across repeated instances and uses `F_r = T_i sin(theta)` and `M_e = F_r r` as local force/moment scales. It does not model connector geometry, fasteners, threads, latches, bonded joints, local shell buckling, bending capacity, eccentricity beyond the simple moment scale, drag, rail contact/reaction, transient amplification, staging impulse, plume interaction, separation dynamics, or radial/parallel joint capacity. The section and allowable fields are proxies taken from the current component screen, not connector qualification data.

The result is an engineering triage surface. It is not structural certification, manufacturing release, range-safety evidence, flight-safety evidence, or experimental validation.

## Provenance

- Implementation: `lib/physics/stage-interface-loads.ts`
- Model version: `rocketworks-stage-interface-loads-0.3.0`
- Validation status: `analytical-axial-load-path-proxy`
- Related public basis: Newton's second law (`F = m a`) and the project structural-screen section/allowable inputs. Public equations and standards are reference material only; no OpenRocket source, UI, assets, database, or simulation engine is used.
