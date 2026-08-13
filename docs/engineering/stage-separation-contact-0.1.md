# Stage separation contact and relative-load screen 0.1

Status: `analytical-component-checks-only`.

This screen is a conservative review aid layered on the shared released-body
paths. It is not a contact solver, collision response, structural-load model,
range-safety analysis, or flight-safety result.

## Purpose

The spherical-envelope screen reports the closest fixed-radius clearance, but a
designer also needs to know when a potential envelope crossing first occurs and
how fast the centres of mass are moving together. The independent
`separation-contact.ts` module adds that telemetry without altering either
trajectory:

- first potential envelope-contact time for every pair with two supplied radii;
- centre-of-mass relative speed and inward closing speed at that time;
- reduced mass and a relative kinetic-energy proxy when positive masses are
  available; and
- aggregate assessed, partial, no-contact, and contact-detected states.

The stage adapter prefers the synchronized released-body grid when available,
and otherwise uses the independent detached traces. The retained vehicle is
mapped from the exact staged trace, including the mass diagnostic at each
sample.

## Equations

For body positions `r_1(t)` and `r_2(t)`, the relative position is

`r_rel(t) = r_2(t) - r_1(t)`.

Each supplied body radius is fixed, so the envelope clearance is

`c(t) = ||r_rel(t)|| - (R_1 + R_2)`.

Within one pair of adjacent samples, the relative position is interpolated as
`r_rel(u) = r_0 + u (r_1 - r_0)`, with `0 <= u <= 1`. The first contact root
is the earliest solution of

`||r_0 + u (r_1 - r_0)||^2 = (R_1 + R_2)^2`.

This catches a boundary crossing between output samples. Relative speed is
`||v_2 - v_1||`, and inward closing speed is

`max(0, -r_rel · v_rel / ||r_rel||)`.

When positive masses are available, the reduced mass and centre-of-mass
relative kinetic energy are

`mu = m_1 m_2 / (m_1 + m_2)`

and

`E_rel = 0.5 mu ||v_rel||^2`.

`E_rel` is an energy bookkeeping value only. It is not an impact impulse,
peak force, stress, deformation, or damage estimate.

## Explicit limits

- Bounds are fixed spheres centred on the simulated COM. Attitude, fin sweep,
  body rotation, flex, slosh, clearance pockets, and manufacturing geometry are
  not resolved.
- The root is kinematic and does not feed a force or event back into the
  flight integrator. No contact duration, coefficient of restitution, friction,
  rebound, angular impulse, or momentum transfer is assumed.
- Missing radii leave a pair `not-assessed`; missing positive masses leave the
  energy field unavailable instead of borrowing a guessed mass.
- Trace velocities are preferred. If a trace only provides positions, the
  interval position slope is retained as a display-only kinematic fallback.
- Plume interaction, lift, stage-to-stage aerodynamic interference, terrain,
  range safety, structural response, and experimental validation remain out of
  scope.

## Verification

`tests/separation-contact.test.mjs` verifies between-sample contact roots,
closing speed, reduced-mass energy, no-contact and partial-geometry states,
missing-mass disclosure, duplicate identifiers, and invalid radii. Staged
preview and engineering-report tests verify the result is carried through the
browser and exported report without changing the active flight path.
