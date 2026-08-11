# World-frame vector impulse budget 0.1

Implementation: `lib/physics/stage-flight-vector-budget.ts`  
Browser integration: `lib/physics/stage-flight-preview.ts` and `app/page.tsx`  
Model: `rocketworks-stage-flight-vector-budget-0.1.0`  
Validation status: `analytical-vector-trace-accounting`

## Scope

The coupled preview records the world ENU force vectors that its load model
actually supplies. This diagnostic integrates each contribution over the
returned trace:

\[
\Delta\mathbf v_i = \int_{t_0}^{t_1} \frac{\mathbf F_i(t)}{m(t)}\,dt
\]

The current trace components are thrust, aerodynamic force (drag and normal
force together), gravity, and retained-vehicle recovery force. The interval is
integrated with the trapezoidal rule using the recorded endpoint masses. A
discrete event velocity jump is added separately from the continuous integral:

\[
\Delta\mathbf v_\mathrm{accounted} =
\sum_i \Delta\mathbf v_i +
\sum_e \Delta\mathbf v_{e}
\]

The result compares that vector with the observed endpoint velocity change and
reports a closure residual. A residual above the explicit diagnostic tolerance
is `review`; it is not converted into a pass/fail safety judgment.

## Interpretation limits

This is a trace accounting layer, not a second integrator and not a validated
mission delta-v or loss budget. Launch-rail reaction and guide-contact forces
are not separate recorded components, and omitted staging mechanisms, plume
interaction, transient contact, and sub-step force histories appear in the
closure residual. The world-frame vectors are useful for explaining model
behavior and finding missing force pathways, but they do not certify vehicle
performance, range safety, manufacturing readiness, or flight safety.

The force components are local ENU vectors from the configured non-rotating
frame. They are not transformed into an inertial Earth-centered frame and do
not include Earth rotation, Coriolis, terrain, or contact dynamics.

## Evidence

Regression fixtures cover constant vector-force closure, discrete event delta-v
accounting, explicit closure-review behavior, malformed sample rejection, and
out-of-window event rejection. The coupled adapter supplies the same vectors
used by its independent loads provider and carries the model identity,
assumptions, warnings, and closure status into the browser and engineering
report.
