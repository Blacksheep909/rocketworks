# Stage-aware structural review 0.1

Implementation: `lib/physics/stage-structural-review.ts`  
Browser adapter: `app/page.tsx`  
Validation status: `analytical-stage-aggregation-only`

## Purpose

The primary structural card is intentionally airframe-centric. Multi-stage
topologies need a second view that makes upper stages, boosters, payload stages,
and repeated parallel instances visible without implying that a single
whole-vehicle screen covers every load path. This module aggregates one
independently computed `StructuralScreenResult` per logical stage row.

The aggregate does not add a new stress or flight solver. It applies a small,
deterministic policy:

- a stage row is `pass` only when its supplied component screen is `pass`;
- a supplied screen that contains a review condition is `review`;
- missing geometry, mass, or a failed screen evaluation is `unavailable`;
- the overall result is `review` whenever any row is `review` or `unavailable`;
- the weakest row is ordered by review status, then its minimum finite factor of
  safety, then stable stage identifier.

The browser adapter evaluates the first physical instance of each enabled stage
with the existing independent component screen. A parallel stage keeps its
logical `instanceCount` in the result. The current browser preview uses the
shared vehicle peak dynamic-pressure/airspeed condition as a load proxy when a
current flight estimate is available, and marks the underlying screen stale
when that estimate no longer matches editable inputs.

## Limits

This is an engineering triage surface, not a structural certification or
flight-safety result. It does not model stage-interface load transfer, bolts,
adhesives, joints, local shell buckling, bending continuity, thrust eccentricity,
cluster asymmetry, canted-thrust imbalance, separation transients, aeroelastic
coupling, manufacturing allowables, or material test evidence. Repeated parallel
stages are represented by one logical screen per instance geometry rather than a
coupled cluster solver.

Every row retains its source screen model version, assumptions, and warnings.
Missing rows are never silently promoted to a pass. The design-review finding
uses the aggregate only as a policy signal and cannot authorize a flight.
