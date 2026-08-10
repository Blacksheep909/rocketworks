# Impulse-based propellant mass model 0.2

Status: analytical component checks only. This model is not validated for
flight-safety decisions.

This is an original clean-room implementation based on public mechanics and
rocket-propulsion equations. It does not contain or call OpenRocket source,
simulation code, UI code, motor databases, assets, or backend components.

## Purpose

The model gives the rigid-body propagator one consistent timeline for measured
or user-supplied thrust, remaining propellant mass, vehicle center of mass,
full inertia tensor, and inertia-tensor rate. It supports multiple independently
timed motors and exposes every ignition and thrust-curve knot as a known
integration boundary.

Each configured motor contains a thrust curve relative to its ignition,
constant dry-motor mass properties, and initial propellant mass properties in
vehicle body coordinates. An optional positive measured mass-flow history can
replace impulse-proportional depletion for that motor. Fixed vehicle properties
must exclude those motor masses so they are not counted twice.

## Depletion equations

For linearly interpolated thrust `T(t)`, total impulse `J`, delivered impulse
`J(t)`, initial propellant mass `mp0`, consumed fraction `c`, and remaining
fraction `f`:

`J(t) = integral(T(tau) d tau)`

`c(t) = clamp(J(t) / J, 0, 1)`

`f(t) = 1 - c(t)`

`mp(t) = mp0 f(t)`

During the active curve interval:

`mp_dot(t) = -mp0 T(t) / J`

This is exact only when thrust is proportional to propellant mass flow with an
effectively constant relationship over the burn. It is an explicit
approximation for general measured thrust curves. When a measured mass-flow
history is supplied, the model instead integrates its positive outflow rate
directly and keeps thrust as an independent curve.

The model uses uniform depletion: the normalized spatial mass distribution and
center remain fixed while its central inertia tensor scales with remaining mass:

`Ip(t) = f(t) Ip0`

This does not represent a changing grain surface or moving regression front.

## Combined mass properties

For parts with mass `mi`, fixed body-frame center `ri`, and central tensor `Ii`:

`M = sum(mi)`

`R = sum(mi ri) / M`

`I = sum(Ii + mi (|di|^2 E - di di^T))`, where `di = ri - R`

The existing clean-room parallel-axis implementation performs this composition.
The combined center therefore moves as propellant mass changes relative to the
dry vehicle.

For uniform depletion at fixed part centers, center-motion terms cancel when
all parts are summed. The tensor rate supplied to the rotational kernel is:

`I_dot = sum((mp_dot / mp0) Ip0 + mp_dot (|dp|^2 E - dp dp^T))`

where `dp` is the propellant-center displacement from the instantaneous
combined center of mass.

The translational kernel does not add `mass rate times velocity` as a separate
force. The supplied net thrust is assumed to represent exhaust momentum and
pressure thrust. Other control-volume effects must be supplied separately.

## Automated checks

The regression suite verifies:

- triangular-curve impulse, remaining mass, and mass-flow rate analytically
- measured mass-flow depletion, residual propellant, and source telemetry
- initial and burnout vehicle mass, center of mass, and pitch inertia
- analytical tensor rate against centered finite differences
- delayed multi-motor thrust summation and shared curve boundaries
- angular-momentum conservation when coupled to the variable-inertia 6-DOF
  kernel without external moment
- use of the same delayed thrust provider by the rocket load model
- rejection of zero-impulse curves and ambiguous thrust configuration

These are mathematical implementation checks, not motor or flight validation.

## Known limitations

- Without a measured history, depletion follows delivered impulse and remains
  proportional to the thrust curve.
- A measured history is linearly interpolated between supplied knots. Sensor
  calibration, phase lag, and sample uncertainty are not independently
  validated; if its integrated mass is below the declared initial mass, the
  residual remains attached after the history ends.
- The normalized propellant distribution remains fixed. Grain regression,
  erosive burning, inhibited surfaces, residue, slosh, and cracks are absent.
- Dry hardware remains constant. Nozzle erosion, ablation, and expelled
  hardware are absent.
- This layer reports scalar motor thrusts. The separate clustered propulsion
  adapter now applies individual axes, offsets, cant angles, and live-CG thrust
  moments.
- Ignition uncertainty, failure, pressure limits, and temperature effects are
  absent from this mass layer.
- Curves and mass properties must be measured, user-supplied, or appropriately
  licensed. RocketWorks does not bundle OpenRocket motor data.
- The resulting rigid-body inertia must remain positive definite. Collinear
  point-mass-only descriptions are insufficient for 6-DOF propagation.

## Primary public references

- NASA Glenn, *Rocket Thrust Equation*, describes the exhaust momentum and
  pressure terms represented by a net thrust curve:
  https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-thrust-equation/
- NASA/CR-1998-208246, *Dynamics of Variable Mass Systems*, derives general
  translational and rotational equations and explains why internal flow and
  mass-loss geometry matter:
  https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19980210404.pdf
- NASA CR-112044, *Dynamic Characteristics of a Variable-Mass Flexible
  Missile*, illustrates internal-flow and flexibility effects intentionally
  outside this rigid uniform-depletion model:
  https://ntrs.nasa.gov/citations/19720013188

## Next work

Motor-specific fixed axes and offsets are now handled by the clustered
propulsion adapter, and optional measured mass-flow histories now drive both
the standalone and multi-stage mass evaluators. The next propulsion increment
should add explicit pressure/temperature provenance, gimbal schedules, and
geometry-based grain regression. Vehicle loads should update the CP-to-CG lever
arm from this live mass state rather than accepting only a fixed value.
