# Separation impulse audit 0.1

Status: `instantaneous-conservation-audit-only`

Implementation: `lib/physics/separation-dynamics.ts`

RocketWorks now audits each staged topology handoff before the detached-body
branch is propagated. This is a bounded diagnostic step toward a coupled
multi-body separation solver. It does not replace that solver and it never
promotes a separation result to flight-safe evidence.

## Linear momentum

At the event boundary, each body inherits the parent translational velocity
and the rigid-body angular-rate contribution at its own center of mass. The
configured retained-body delta-v is rotated into world coordinates and the
detached branch receives the mass-ratio impulse implied by the event adapter:

```text
Delta v_detached = -(m_retained / m_detached,total) Delta v_retained
```

The audit reports the residual:

```text
r_p = sum(m_i v_i,after) - m_total v_before
```

`balanced` means the residual is below the deterministic tolerance used by the
screen. A missing configured event delta-v remains `unavailable`; an imbalance
is `review` and is surfaced in the staged Flight workspace and engineering
report.

## First-order angular impulse

The audit also reports the impulse moment about the pre-event center of mass:

```text
r_H = r_retained x (m_retained Delta v_retained)
    + sum(r_detached x (m_detached Delta v_detached))
```

This residual is intentionally not corrected by synthesizing an angular-rate
change. A non-zero value is a visible `review` condition because the current
branch does not model separation springs, pyrotechnics, joint compliance,
plume interaction, contact, or attitude-dependent aerodynamic torque.

## Limits

The audit is instantaneous and assumes the supplied mass properties and event
attitude are valid at the handoff. It ignores external force over the event
window and does not solve coupled retained/detached six-degree-of-freedom
motion, oriented collision geometry, lift, plume interference, range safety,
or detached-stage recovery. Those remain roadmap work and require independent
benchmark and test evidence.
