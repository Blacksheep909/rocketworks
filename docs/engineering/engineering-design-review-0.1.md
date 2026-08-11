# Engineering design review aggregator 0.1

Status: `analytical-review-aggregation-only`.

RocketWorks now exposes one deterministic review surface that combines the
existing configuration, low-speed aerodynamics, structural screen, vertical
flight freshness, and coupled-stage diagnostics. It is deliberately an
aggregator rather than another physics solver: the review cannot make a model
more validated than the underlying source result.

## Policy checks

- launch thrust-to-weight uses peak motor thrust divided by current vehicle
  weight, with a 3:1 review threshold;
- static margin uses the current low-speed center-of-pressure result, with a
  1 to 3 caliber review band;
- each available structural check is carried through with its factor of safety,
  declared requirement, model version, and original detail;
- a stale or missing vertical estimate is surfaced as review/unavailable;
- configured coupled-stage runs expose preview freshness, event-allocation
  status, half-step convergence status, and non-balanced separation impulse
  proposals;
- missing evidence is never silently converted into a pass.

Findings are ranked deterministically so the highest-priority review item is
visible in the inspector and the engineering report. A factor of safety below
one is marked critical for triage; this is a policy severity, not a material
failure prediction.

## Scope boundary

The aggregator does not certify launch performance, dynamic stability,
structural integrity, flutter, contact, plume interaction, range safety,
manufacturing, or recovery success. Its status is a workflow aid for deciding
which assumptions deserve attention before a qualified independent review.

The implementation is original RocketWorks code and uses no OpenRocket source,
simulation engine, interface code, assets, databases, or backend components.
