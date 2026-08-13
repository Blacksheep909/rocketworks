# Thrust-axis loss accounting 0.1

Implementation: `lib/physics/mission-loss-budget.ts`  
Browser integration: `lib/physics/stage-flight-preview.ts` and `app/page.tsx`  
Model: `rocketworks-mission-loss-budget-0.1.0`  
Validation status: `analytical-thrust-axis-projection`

## Scope

This screen explains a coupled trace by projecting recorded force vectors onto
the instantaneous direction of the recorded thrust vector. For each source
force, the endpoint acceleration is

\[
\mathbf a_i(t) = \frac{\mathbf F_i(t)}{m(t)}
\]

and the signed thrust-axis projection is

\[
q_i(t) = \mathbf a_i(t) \cdot \hat{\mathbf u}_T(t),
\qquad
\hat{\mathbf u}_T = \frac{\mathbf F_T}{\lVert\mathbf F_T\rVert}.
\]

The browser reports the trapezoidal integral of `q_i`, its positive opposing
part `max(0, -q_i)`, and its positive assisting part `max(0, q_i)` for gravity,
aerodynamic, and recovery forces. These are signed directional projections,
not scalar mission losses.

The scalar thrust impulse-equivalent speed is

\[
V_{T,\mathrm{eq}} = \int \frac{\lVert\mathbf F_T(t)\rVert}{m(t)}\,dt,
\]

while the net propulsive vector is

\[
\Delta\mathbf v_T = \int \frac{\mathbf F_T(t)}{m(t)}\,dt.
\]

The reported steering-dispersion screen is

\[
V_{\mathrm{disp}} = \max\left(0,
V_{T,\mathrm{eq}} - \lVert\Delta\mathbf v_T\rVert\right),
\]

which is non-negative by the triangle inequality. It describes the gap between
a scalar thrust-magnitude integral and the net thrust vector; it is not a
guidance loss model.

Discrete event delta-v vectors are projected only when the nearest recorded
sample has a non-zero thrust axis. Events without an active thrust direction
remain unprojected and are disclosed so the world-frame vector budget can be
used alongside this screen.

## Coverage and status

`assessed` requires at least two active-thrust samples and an axis available for
the complete trace span. A trace with a positive time span but no complete axis
coverage is `partial`; fewer than two samples or no positive time span is
`not-assessed`. The coverage fraction is retained in the result and report so
coast intervals are not hidden inside a single percentage.

## Interpretation limits

This is an explanatory trace projection, not a mission delta-v, gravity-loss,
drag-loss, steering-loss, performance-certification, or flight-safety model.
It does not solve propellant efficiency, staging transients, guidance, control,
rail reactions, plume interaction, contact, structural loads, Earth-fixed
rotation, or omitted constraint forces. A force component that assists the
instantaneous thrust axis is reported separately rather than silently deducted
from the opposing value. Zero-thrust intervals have no defined local thrust
axis and are not directionally classified.

The implementation is original RocketWorks code. It consumes only the force,
mass, velocity, and event state already returned by the independent coupled
trace; it does not reuse a third-party simulator, backend engine, asset, or
database.

## Evidence

Regression fixtures cover constant-force projection, steering-dispersion
inequality behavior, event projection, sparse thrust coverage, malformed sample
rejection, and out-of-window event rejection. The staged adapter carries the
model identity, coverage, projections, assumptions, and warnings into the
browser workspace and engineering report.
