# Deterministic physics benchmark suite 0.1

Status: `mathematical-regression-tests-only`.

The benchmark suite is a small evidence lane for changes to the original
RocketWorks calculation modules. It runs fixed SI anchors and closed-form
fixtures that are cheap enough to execute from the browser and deterministic
enough to run in CI.

## Fixtures

- U.S. Standard Atmosphere sea-level pressure and density;
- standard gravity at sea level;
- trapezoidal impulse of a triangular thrust curve;
- low-speed cone center of pressure at two-thirds of the cone length.

Each case reports the observed value, public-reference expected value, absolute
and relative error, and a declared tolerance. The suite currently contains
five cases because the atmosphere fixture checks pressure and density as
separate metrics.

## Interpretation

Passing means that the implementation still agrees with its fixed numerical
fixtures. It does not establish agreement with a real motor, vehicle, flight
test, certification standard, or range-safety analysis. The browser labels the
result as regression evidence and keeps the model version and assumptions
visible.

The fixtures deliberately use no OpenRocket code, data, assets, backend, or
simulation engine. They exercise the independent atmosphere, thrust-curve,
gravity, and static-aerodynamics modules directly.
