# Kestrel vertical-flight model 0.2

Status: **engineering preview; not validated for flight-safety decisions**

This is an original, clean-room implementation. It contains no source code,
algorithms, assets, databases, or backend components from OpenRocket or any
other rocket simulator.

## Purpose

Version 0.2 establishes a testable physics boundary for the browser product. It
is intentionally a one-dimensional model. It is not a substitute for the
planned rigid-body six-degree-of-freedom solver.

## Equations and public references

- Translation follows Newton's second law, with thrust, weight, and axial drag.
- Aerodynamic drag uses `D = 0.5 * rho * V_rel^2 * Cd * A`, with the reference
  area explicitly supplied by the caller.
- Temperature, pressure, density, and speed of sound use the layer equations
  and constants of the U.S. Standard Atmosphere, 1976, from -500 m to 20 km.
- Thrust and wind profiles use piecewise-linear interpolation.
- Delivered impulse is integrated by the trapezoidal rule. Until mass-flow data
  is introduced, propellant depletion is assumed proportional to delivered
  impulse.
- State integration uses fixed-step classical fourth-order Runge-Kutta (RK4).

Primary references:

- NASA Glenn, [Drag Equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/)
- NASA Glenn, [Rocket Thrust Equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-thrust-equation/)
- NOAA/NASA/USAF, [U.S. Standard Atmosphere, 1976](https://ntrs.nasa.gov/citations/19770009539)

## Implemented behavior

- Geometric-to-geopotential altitude conversion.
- Standard-atmosphere density and speed of sound through 20 km.
- User-supplied thrust curves and total impulse.
- Altitude-dependent three-axis wind interpolation. Only the vertical component
  is dynamically coupled in the 1D solver; crosswind is reported with a warning.
- Launch-pad constraint, liftoff, burnout, apogee, optional recovery deployment,
  ground impact, and no-liftoff events.
- Body and recovery drag areas.
- Altitude-dependent gravity.
- Explainable limitations and warnings.

## Validation scope

Automated tests cover atmosphere reference points, interpolation, impulse
integration, numerical agreement with a constant-acceleration analytical case,
event ordering, no-liftoff behavior, and recovery drag behavior.

This is numerical verification, not full physical validation. Missing validation
includes wind-tunnel drag data, instrumented flights, published benchmark
trajectories, transonic aerodynamics, off-axis dynamics, and uncertainty bounds.

## Next architecture steps

1. Component geometry, mass properties, centre of gravity, and inertia tensors.
2. Barrowman-class slender-body stability calculations derived from original
   reports and modern published corrections.
3. Mach- and Reynolds-dependent drag build-up.
4. Quaternion-based rigid-body 6-DOF propagation with rail constraints.
5. Staging, clustered thrust vectors, discrete events, turbulence, and dispersions.
6. Independent benchmark corpus and experimental validation ledger.

