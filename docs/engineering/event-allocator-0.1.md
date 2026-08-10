# Mission event allocator 0.1

Implementation: `lib/physics/event-allocator.ts` and `lib/physics/six-dof.ts`

The coupled preview can receive scheduled events (for example a timed recovery
command) and scalar state-triggered events (for example burnout, staging, or
apogee). Before integration, RocketWorks allocates a deterministic declaration
order so an event tie does not silently depend on the order in which a caller
constructed an array.

## Ordering rules

Each event may declare a semantic kind, an optional numeric priority, and
explicit `dependsOn` identifiers. Lower numeric priorities run first. When a
priority is omitted, the clean-room default order is:

| Kind | Default priority |
|---|---:|
| rail | 0 |
| separation | 10 |
| ignition | 20 |
| failure | 30 |
| recovery | 40 |
| custom | 100 |

The allocator performs a stable topological sort. It uses a supplied scheduled
time as a sort hint, then priority, then declaration index. State-triggered
events do not have a known time at allocation, so their actual root remains
the simulator's responsibility. A dependency that conflicts with time hints
is retained as a diagnostic warning rather than changing a trigger predicate.

Same-time groups, duplicate identifiers, missing dependencies, dependency
cycles, and competing mutual-exclusion keys are returned as explicit
diagnostics. Invalid dependency graphs stop the simulation; watch diagnostics
remain visible in the run, export, and engineering report.

## Scope and limits

The allocator changes event ordering only. It does not model pyrotechnic
hardware, command latency, sensor noise, event probability, contact, or
mechanism dynamics. It cannot make the surrounding rigid-body, staging,
recovery, or aerodynamic models flight-safe. The result remains an analytical
event-ordering check with regression tests only.

