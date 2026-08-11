# Deterministic physics benchmark suite 0.4

Status: `mathematical-regression-tests-only`.

The benchmark suite is a small evidence lane for changes to the original
RocketWorks calculation modules. It runs fixed SI anchors and closed-form
fixtures that are cheap enough to execute from the browser and deterministic
enough to run in CI.

## Fixtures

- U.S. Standard Atmosphere sea-level pressure and density plus 32 km and
  84.852 km geopotential layer anchors;
- standard gravity at sea level;
- trapezoidal impulse of a triangular thrust curve;
- low-speed cone center of pressure at two-thirds of the cone length;
- constant-force 6DOF translation;
- torque-free asymmetric-rigid-body rotational energy and world angular
  momentum conservation;
- 6DOF attitude quaternion normalization under a constant principal-axis
  moment;
- thin-wall circular-shell area, axial compression stress, and pinned-column
  Euler critical load;
- equivalent airframe first bending frequency from the Euler-Bernoulli
  cantilever root, weakest shell stiffness, and modeled shell mass;
- equal-load fin-root bending stress;
- a preliminary NACA-TN-4197-style fin flutter-speed equation anchor using the
  local standard-atmosphere pressure and sound speed.

Each case reports the observed value, public-reference expected value, absolute
and relative error, and a declared tolerance. The suite currently contains
seventeen cases because the atmosphere fixture checks pressure and density as
separate metrics, the 6DOF conservation checks are reported independently,
and the structural/aeroelastic equations are checked against independent
closed-form recomputations.

## Interpretation

Passing means that the implementation still agrees with its fixed numerical
fixtures. It does not establish agreement with a real motor, vehicle, flight
test, certification standard, or range-safety analysis. The browser labels the
result as regression evidence and keeps the model version and assumptions
visible.

The fixtures deliberately use no OpenRocket code, data, assets, backend, or
simulation engine. They exercise the independent atmosphere, thrust-curve,
gravity, static-aerodynamics, rigid-body 6DOF, structural-screen, and
fin-flutter modules directly. The conservation, structural, and aeroelastic
cases are regression anchors, not experimental validation of a vehicle, motor,
aerodynamic database, material, or operational profile.
