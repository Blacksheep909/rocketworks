# Fixed multi-nozzle propulsion 0.1

Status: implemented analytical preview; mathematical regression tests only.
This model is not flight-safety validated and must not be used for launch
approval, hardware qualification, or nozzle/manifold sizing.

## Purpose

RocketWorks' staged evaluator can represent one motor as a bounded fixed
cluster of nozzles. This is an original clean-room configuration contract. It
does not copy or depend on OpenRocket code, databases, assets, or simulation
engines.

Legacy motors remain compatible: when `nozzles` is omitted, the existing
`thrustApplicationPointBodyM` and `thrustAxisBody` pair becomes one implicit
nozzle with a thrust fraction of `1`.

## Contract

Each configured nozzle supplies:

- a stable identifier unique within its motor;
- a fixed body-frame application point;
- a finite, normalized body-frame thrust axis; and
- a positive `thrustFraction`.

The staged evaluator accepts at most 16 nozzles per motor and requires the
fractions to sum to one within a deterministic tolerance. A motor-level
gimbal schedule is rejected for a multi-nozzle layout because one commanded
axis cannot unambiguously describe independent nozzle vectors. The browser
topology editor therefore exposes an equal-share radial layout with bounded
radius and outward cant controls; it disables that layout while a gimbal
schedule is present.

## Equations

For motor thrust `T`, nozzle fraction `s_i`, unit axis `e_i`, application point
`p_i`, and instantaneous combined center of mass `R`:

`T_i = s_i T`

`F_i = T_i e_i`

`M_i = (p_i - R) cross F_i`

`F_motor = sum(F_i)` and `M_motor = sum(M_i)`.

The scalar motor thrust, delivered impulse, and propellant depletion remain
motor-level quantities. Nozzle shares only distribute the existing curve;
they do not duplicate impulse or propellant mass. The returned evaluation
retains each nozzle contribution plus aggregate force, moment, and effective
thrust axis.

## Explicit boundaries

The fixed layout does not model nozzle flow coupling, manifold pressure loss,
plume interaction, base drag, thermal loads, structural compliance, actuator
dynamics, individual nozzle failure, ignition transients, or measured
imbalance. It is a geometry and force/moment sensitivity tool. Independent
motor, material, thrust, and alignment evidence is still required for any real
vehicle decision.

## Verification

Regression tests cover:

- equal-share axial nozzles conserving the motor curve;
- symmetric nozzle moment cancellation;
- per-nozzle trace values and model assumptions; and
- invalid share sums and incompatible gimbal contracts.

The staged model version is `kestrel-multi-stage-0.9.0`; the browser adapter
version is `kestrel-stage-flight-preview-0.47.0`.
