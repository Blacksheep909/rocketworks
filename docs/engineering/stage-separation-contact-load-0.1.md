# Stage separation contact-load scenario 0.1

Implementation: `lib/physics/separation-contact-load.ts`  
Browser integration: `lib/physics/stage-flight-preview.ts` and `app/page.tsx`  
Model: `rocketworks-separation-contact-load-0.1.0`  
Validation status: `analytical-compliance-scenario`

## Scope

The fixed spherical-envelope contact screen identifies potential overlap and
reports the centre-of-mass closing speed and reduced-mass energy. This layer
turns those kinematic values into a deliberately separate one-dimensional
normal-compliance scenario. It does not alter either body trajectory.

For reduced mass `μ`, inward normal speed `vₙ`, stopping distance `d`, and
coefficient of restitution `e`, the scenario reports:

\[
E_{n}=\frac12\mu v_n^2,
\qquad
J=(1+e)\mu v_n,
\]

\[
E_{\mathrm{rebound}}=e^2E_n,
\qquad
E_{\mathrm{absorbed}}=(1-e^2)E_n,
\]

\[
F_{\mathrm{avg}}=\frac{E_{\mathrm{absorbed}}}{d},
\qquad
F_{\mathrm{linear-stop}}=\frac{2E_n}{d}.
\]

The linear-stop value is a force scale for an idealized constant-stiffness
compliance path. It is not a peak force prediction for a real coupler,
mechanism, or structure. Tangential relative kinetic energy is retained as a
separate value and is not silently converted into friction or normal load.

## Browser controls

The staged Flight workspace exposes:

- stopping distance, bounded to a positive scenario value; and
- normal coefficient of restitution `0 ≤ e ≤ 1`.

Changing either input marks the coupled result stale and requires a rerun. The
values are passed to the post-trace screen only; no contact force is injected
into the 6DOF or released-body integrators.

## Interpretation limits

This is a scenario screen, not a contact solver, structural-load analysis,
collision response, damage estimate, certification result, range-safety
analysis, or flight-safety determination. It does not identify stiffness,
damping, contact duration, friction, rebound direction, angular impulse,
deformation, joint geometry, fastener loads, plume interaction, or
aerodynamic interference. A detected envelope crossing with missing positive
closing speed or reduced mass remains `not-assessed`.

The implementation is original RocketWorks code. It consumes only the
independent contact-screen result and authored scenario inputs; it does not
reuse any OpenRocket source, backend, UI, asset, database, or simulation
engine.

## Verification

Regression fixtures cover normal impulse, restitution energy partition,
average and linear-stop force scales, tangential-energy separation, no-contact
coverage, and invalid scenario bounds. The staged adapter, browser card, and
engineering report retain the model identity, assumptions, warnings, and
per-pair values.
