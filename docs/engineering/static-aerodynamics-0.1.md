# Static aerodynamics model 0.1

Status: analytical checks only. Wind-tunnel, flight-test, and independent
software benchmark validation are not complete.

This is an original clean-room implementation based on published slender-body
and fin relations. It does not contain or call OpenRocket source code,
simulation code, data, assets, or backend components.

## Purpose and scope

The model estimates the small-angle normal-force slope, center of pressure, and
static margin for a slender, coaxial rocket at low speed. It is intended for
live preliminary design feedback and explainable warnings. It is not yet the
aerodynamic model used by a six-degree-of-freedom trajectory.

The supported aerodynamic geometry is:

- piecewise-linear axisymmetric radius profiles
- cylindrical body tubes
- three- or four-fin trapezoidal fin sets
- active-stage filtering

Point masses affect the center of mass but contribute no aerodynamic load.

## Coordinates and normalization

- `x` is measured from the nose toward the tail
- reference diameter `d` is the largest active body diameter unless supplied
- reference area `Aref = π(d/2)²`
- normal-force slopes are per radian
- positive static margin means the center of pressure is aft of the center of
  mass

`static margin = (xCP - xCG) / d`

The result is reported in body calibers.

## Axisymmetric body relation

For each change in cross-sectional area:

`dCNα = 2 dA / Aref`

The center of pressure of a profile interval follows from the first moment of
that area change:

`xCP = ∫ x dA / ΔA`

Integration by parts gives:

`∫ x dA = [xA]start,end - ∫ A dx`

The volume integral is exact for each linear-radius frustum. A conical nose
therefore produces `CNα = 2` with its center of pressure at two-thirds of its
length from the tip. A constant-radius cylindrical tube contributes zero in
this inviscid small-angle body relation.

## Fin-set relation

For `N` identical fins, body radius `r`, exposed span `s`, reference diameter
`d`, root chord `Cr`, tip chord `Ct`, and mid-chord-line length `l`:

`CNα,fins = (1 + r/(r+s)) 4N(s/d)² / (1 + √(1 + (2l/(Cr+Ct))²))`

The first factor is the body-fin interference correction used by the reference
method. For leading-edge sweep `Xr`, the fin-set center is:

`xCP,fins = xroot + (Xr/3)(Cr+2Ct)/(Cr+Ct) + (1/6)(Cr+Ct-CrCt/(Cr+Ct))`

Vehicle center of pressure is the normal-force-slope-weighted location:

`xCP = Σ(CNα,i xCP,i) / Σ(CNα,i)`

## Automated verification

Tests cover:

- conical-nose slope of two
- conical-nose center at two-thirds length
- zero inviscid contribution from a constant-diameter tube
- closed-form trapezoidal fin slope and center
- weighted vehicle center of pressure
- positive static-margin sign convention
- explicit Mach and fin-count applicability warnings
- active-stage filtering

These regression tests verify implementation consistency with the documented
relations. They do not establish real-world accuracy.

## Applicability warnings and limitations

- Version 0.1 is low-speed and incompressible. Results above Mach 0.3 are marked
  unsupported.
- The linear relation assumes small angle of attack.
- The reference method is intended for slender axisymmetric vehicles, primarily
  with three or four fins.
- The model does not predict transonic center-of-pressure movement.
- Viscous body lift, separated flow, base effects, protuberances, rail buttons,
  pods, strap-on boosters, canard-fin interference, fin-body gaps, surface
  roughness, aeroelasticity, and Reynolds-number effects are not modeled.
- Fin thickness and edge shape affect drag and high-speed behavior but do not
  enter this first normal-force model.
- A positive static margin alone does not prove dynamic stability. Pitch
  damping, inertia, wind, rail departure, thrust misalignment, spin, and control
  dynamics must be evaluated.
- Large static margins can increase weathercocking and loads.

Do not use the result as the sole basis for flight-safety decisions.

## Primary public references

- James S. Barrowman, *The Practical Calculation of the Aerodynamic
  Characteristics of Slender Finned Vehicles*, NASA/TM-2001-209983. The report
  develops normal-force, center-of-pressure, damping, roll, and drag methods for
  slender axisymmetric vehicles with three or four fins and explicitly excludes
  a transonic analysis:
  https://ntrs.nasa.gov/api/citations/20010047838/downloads/20010047838.pdf
- J. S. Barrowman et al., *An Improved Theoretical Aerodynamic Derivatives
  Computer Program for Sounding Rockets*, AIAA 79-0504. The NASA record
  describes small-angle subsonic and supersonic normal-force, pitching-moment,
  and center-of-pressure calculations:
  https://ntrs.nasa.gov/citations/19790041753
- NASA TN D-993, *Static Longitudinal Stability of a Rocket Vehicle Having a
  Rear-Facing Step Ahead of the Stabilizing Fins*. Wind-tunnel comparison
  demonstrates both useful agreement and the importance of separated-flow
  effects:
  https://ntrs.nasa.gov/citations/19980227828
- NASA, *Aerodynamic Characteristics in Pitch of a 1/7-Scale Model of a Two-
  and Three-Stage Rocket Configuration at Mach Numbers of 0.4 to 4.63*. The
  measured data show fin-size and Mach-dependent changes in normal force and
  center of pressure:
  https://ntrs.nasa.gov/api/citations/19690025608/downloads/19690025608.pdf

