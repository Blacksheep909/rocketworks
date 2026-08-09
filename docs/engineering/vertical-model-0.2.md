# Kestrel vertical-flight model 0.3

Status: **engineering preview; not validated for flight-safety decisions**

This is an original, clean-room implementation. It contains no source code,
algorithms, assets, databases, or backend components from OpenRocket or any
other rocket simulator.

## Purpose

Version 0.3 establishes a testable one-dimensional physics boundary for the
browser product. It remains the fast nominal/uncertainty/optimization adapter;
the separate rigid-body six-degree-of-freedom kernel and stage-aware preview
now cover the higher-dimensional experimental path. Neither path is validated
for flight-safety decisions.

## Equations and public references

- Translation follows Newton's second law, with thrust, weight, and axial drag.
- Aerodynamic drag uses `D = 0.5 * rho * V_rel^2 * Cd * A`, with the reference
  area explicitly supplied by the caller.
- Temperature, pressure, density, and speed of sound use the layer equations
  and constants of the U.S. Standard Atmosphere, 1976, from -500 m to 20 km.
- Optional relative humidity is applied as a constant-profile ideal-mixture
  correction: water-vapor partial pressure changes virtual temperature, density,
  and speed of sound. Condensation, phase change, and humidity-dependent
  viscosity are not modeled.
- Optional surface pressure and temperature observations use the same
  launch-site anchor as the coupled environment provider, so the fast vertical
  trace and the 6DOF preview do not silently use different pad weather states.
- Thrust and wind profiles use piecewise-linear interpolation.
- Delivered impulse is integrated by the trapezoidal rule. Until mass-flow data
  is introduced, propellant depletion is assumed proportional to delivered
  impulse.
- State integration uses fixed-step classical fourth-order Runge-Kutta (RK4).

Primary references:

- NASA Glenn, [Drag Equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/)
- NASA Glenn, [Rocket Thrust Equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-thrust-equation/)
- NOAA/NASA/USAF, [U.S. Standard Atmosphere, 1976](https://ntrs.nasa.gov/citations/19770009539)
- NOAA/WMO, [CWOP/WMO8 water-vapor pressure formulation](https://www.weather.gov/media/epz/mesonet/CWOP-WMO8.pdf)

## Implemented behavior

- Geometric-to-geopotential altitude conversion.
- Standard-atmosphere density and speed of sound through 20 km.
- User-supplied thrust curves and total impulse.
- Altitude-dependent three-axis wind interpolation. Only the vertical component
  is dynamically coupled in the 1D solver; crosswind is reported with a warning.
- Launch-pad constraint, liftoff, burnout, apogee, optional recovery deployment,
  ground impact, and no-liftoff events.
- Body and recovery drag areas.
- Optional recovery reefing schedules multiply the canopy drag area from a
  declared initial fraction to full open with a bounded piecewise-linear model.
  The schedule begins at the accepted recovery command time in this 1D solver;
  inflation hardware and opening loads remain outside scope.
- Optional Mach--Reynolds drag-table coupling using the same coefficient-table
  interpolation path as the coupled load adapter. When a table is selected,
  the solver computes Reynolds number from atmospheric density, relative speed,
  viscosity, and the vehicle reference length; out-of-range or rejected
  queries remain explicit warnings and fall back to the declared constant Cd.
- Altitude-dependent gravity.
- Explainable limitations and warnings.

The browser's primary trace inspector exposes the returned samples without
recomputing them: altitude, speed, acceleration, mass, thrust, and dynamic
pressure can be selected as separate time-series views. Event markers are
drawn from the result's ordered event list, and pointer/keyboard navigation
only changes the display selection; it never changes the numerical result.

## Validation scope

Automated tests cover atmosphere reference points, interpolation, impulse
integration, numerical agreement with a constant-acceleration analytical case,
event ordering, no-liftoff behavior, recovery drag behavior, and the shared
reefing-area schedule. The trace and CSV export expose the effective reefing
fraction for every sampled state.

This is numerical verification, not full physical validation. Missing validation
includes wind-tunnel drag data, instrumented flights, published benchmark
trajectories, transonic aerodynamics, off-axis dynamics, and uncertainty bounds.

## Current adjacent architecture

The browser also exposes independently implemented component mass properties,
static stability, launch-environment profiles, launch-rail handoff, quaternion
6-DOF propagation, topology-aware staging, recovery dispersion, uncertainty,
bounded parameter sweeps, and constrained optimization. These are deliberately
separate adapters so the fast vertical result remains easy to inspect and
regression-test.

Remaining work includes richer Mach- and Reynolds-dependent drag build-up, complete
discarded-body staging trajectories, an independent benchmark corpus, and an
experimental validation ledger. None of those gaps are hidden by the vertical
model or its UI status badges.
