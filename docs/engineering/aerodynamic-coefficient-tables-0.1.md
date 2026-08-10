# Aerodynamic coefficient tables and damping 0.1

Status: software interpolation and analytical coupling checks only. Supplying a
table does not make its data validated or flight-safe.

This is an original clean-room implementation of public aerodynamic similarity,
coefficient interpolation, and nondimensional damping relations. It contains
no OpenRocket source, UI, coefficient database, assets, or backend components.
RocketWorks does not bundle third-party aerodynamic data.

## Purpose

The model consumes appropriately licensed or user-supplied coefficient grids
indexed by Mach and Reynolds number. One table can provide:

- axial drag coefficient `CD`
- normal-force slope `CNa`
- body-axis center of pressure `xCP`
- nondimensional roll, pitch, and yaw rate derivatives
- absolute uncertainty for each coefficient surface
- source, version, license, attribution, and validation provenance

Stage-aware aerodynamics can assign a different table to every exact attached-
stage topology. The rocket-load model then queries the selected table from the
live atmosphere and wind-relative flight condition.

## Atmosphere viscosity and Reynolds number

Atmosphere 0.4 adds dry-air dynamic viscosity using Sutherland's relation with
reference values `mu0 = 1.716e-5 Pa s`, `T0 = 273.15 K`, and `S = 110.4 K`:

`mu(T) = mu0 (T / T0)^(3/2) (T0 + S) / (T + S)`

Kinematic viscosity is:

`nu = mu / rho`

When a relative-humidity observation is supplied, `rho` is the atmosphere's
virtual-temperature moist-air density. The viscosity remains the documented
dry-air Sutherland approximation, so humidity changes Reynolds number through
density but not through a separate humidity-viscosity model.

For wind-relative speed `V` and topology reference length `L`:

`Re = rho V L / mu = V L / nu`

The reference length is part of the regime contract. Data generated with a
diameter-based Reynolds number cannot be queried with vehicle length unless the
source data are transformed consistently.

## Table layout and interpolation

Mach nodes and Reynolds nodes must be finite and strictly increasing. Surface
rows correspond to Reynolds nodes and columns to Mach nodes. Every surface must
have exactly the declared rectangular shape.

Within the table domain, RocketWorks performs bilinear interpolation in:

- Mach `M` linearly
- `log10(Re)` linearly

Uncertainty surfaces use the identical weights. Logarithmic Reynolds spacing is
explicit because relevant Reynolds values commonly span orders of magnitude;
it is still an interpolation assumption and not a physical flow solver.

The default out-of-range policy rejects a query. An optional clamp policy uses
the nearest table boundary and emits an `unsupported` issue for each exceeded
axis. RocketWorks never silently extrapolates a coefficient surface.

## Provenance contract

Every table requires:

- stable table identifier and human-readable name
- source name and source kind: wind tunnel, CFD, flight test, published
  analysis, or user supplied
- source data version
- license identifier
- validation status: user-supplied unvalidated, published data unverified, or
  independently benchmarked
- optional HTTP(S) source URL and attribution

These fields are carried into flight diagnostics. They describe the supplied
dataset; RocketWorks does not independently promote its validation status.

## Uncertainty

Each nominal coefficient surface may provide an absolute non-negative
uncertainty surface. Interpolated uncertainty is exposed beside the nominal
result and marked with `COEFFICIENT_UNCERTAINTY_PRESENT`.

Version 0.1 does not automatically perturb coefficients. This keeps the
deterministic trajectory reproducible and makes the uncertainty ready for the
future seeded Monte Carlo layer. Correlation between coefficients, nodes, and
flight conditions is not represented yet.

## Rotational damping moments

RocketWorks body `x` is longitudinal; `y` and `z` are the transverse pitch and yaw
axes. For axis `i`, dynamic pressure `q`, reference area `S`, rate derivative
`Cwi`, body rate `wi`, reference length `li`, and airspeed `V`:

`Cmi = Cwi wi li / (2 V)`

`Mi = q S li Cmi = q S Cwi wi li^2 / (2 V)`

The supplied derivative therefore owns its sign convention. Under RocketWorks'
convention, a negative derivative opposes a positive body rate. Any positive
derivative triggers a caution because it reinforces that rate. Roll commonly
uses diameter while pitch and yaw use vehicle length, so the three reference
lengths are configured independently.

At effectively zero airspeed the damping moment is zero. Derivatives and all
three reference lengths must be supplied together; partial damping input is
rejected. The damping moment is added to the CP normal-force moment and
propulsion moment before the Newton-Euler solve.

## Automated checks

The regression suite verifies:

- exact table-node recovery
- bilinear interpolation in Mach and `log10(Re)`
- identical interpolation of absolute uncertainty
- default rejection outside either table axis
- boundary clamping with explicit unsupported issues
- Sutherland viscosity and analytical Reynolds calculations
- table-to-topology-to-load propagation of Mach, Reynolds, CP, provenance, and
  uncertainty
- absence of the fixed-drag warning for a tabulated source
- closed-form pitch damping moment
- reduced angular rate in a coupled 6-DOF trajectory
- incomplete and destabilizing damping diagnostics
- rejection of malformed grids, axes, provenance, and transport inputs

These checks validate implementation mechanics, not the aerodynamic accuracy of
any real vehicle.

## Known limitations

- No bundled aerodynamic coefficient data are supplied.
- Bilinear interpolation cannot reconstruct shocks, boundary-layer transition,
  hysteresis, discontinuities, or nonlinear angle-of-attack behavior absent
  from the source grid.
- Legacy Version 0.1 tables are indexed only by Mach and Reynolds number.
  Optional angular volumes are documented separately in
  `aerodynamic-angle-tables-0.1.md`; control deflection, surface condition,
  motor plume state, and relative separated-body position remain outside both
  table forms.
- Normal force remains linear in bounded angle of attack after table lookup.
- Damping derivatives are uncoupled diagonal body-axis terms. Cross derivatives
  and unsteady aerodynamic states are absent.
- Absolute uncertainty is uncorrelated metadata until the Monte Carlo model is
  implemented.
- Source reference area, length, axes, signs, units, and moment origin must be
  checked before importing data.

## Primary public references

- NASA Glenn, *Reynolds Number*, defines `Re = rho V L / mu` and explains its
  role in aerodynamic similarity:
  https://www.grc.nasa.gov/WWW/K-12/airplane/reynolds.html
- NACA Report 1135, *Equations, Tables, and Charts for Compressible Flow*,
  Appendix A gives Sutherland's viscosity relation and Appendix B defines
  Reynolds number:
  https://www.grc.nasa.gov/WWW/K-12/airplane/Images/naca1135.pdf
- NASA Wind-US, *Viscosity*, documents Sutherland's law as the ideal-gas
  viscosity model:
  https://www.grc.nasa.gov/www/winddocs/user/keywords/viscosity.html
- NASA CR-2012-217475, *Missile Aerodynamics for Ascent and Re-entry*, develops
  nondimensional force, moment, and damping derivatives for 6-DOF missile
  simulation:
  https://ntrs.nasa.gov/api/citations/20130003336/downloads/20130003336.pdf
- NASA-20220007178, *Free-Flight CFD Simulations and Dynamic Stability Analysis
  of the Orion Crew Module*, compares computed pitch damping with experimental
  ballistic-range fits:
  https://ntrs.nasa.gov/citations/20220007178

## Next work

Add monotone/high-gradient interpolation options, covariance and correlation
metadata, deterministic seeded dispersion, and importer validation for user
CSV/JSON coefficient packages. Experimental benchmarks must compare complete
force and moment histories, not only interpolation mechanics or angular-volume
round trips.
