# Relation normal-force compressibility trends 0.1

Status: `engineering-preview-unvalidated`.

RocketWorks keeps the original low-speed small-angle relation as the
compatibility default. This document describes the opt-in trends used when a
vehicle does not supply a direct force/moment coefficient database.

## Subsonic Prandtl-Glauert trend

For a requested Mach number `M < 0.8`, the relation normal-force slope is
multiplied by:

`F_PG = 1 / sqrt(1 - M^2)`.

This is the classical linearized subsonic compressibility correction. The
factor is deliberately not evaluated at or above Mach 0.8 because the
singularity is not a model of transonic physics. RocketWorks reports a
`transonic-gap` state and suppresses relation normal force there.

## Supersonic Ackeret trend

For a requested Mach number `M > 1.2`, Ackeret linearized theory gives the
two-dimensional thin-surface normal-force slope `4 / sqrt(M^2 - 1)`. The
RocketWorks relation path normalizes this against its low-speed `2 / rad`
reference, so the applied trend factor is:

`F_A = 2 / sqrt(M^2 - 1)`.

This normalization is a transparent mixed-body/fin approximation, not a
vehicle-specific supersonic coefficient derivation. The 0.8 through 1.2
interval remains an explicit transonic gap. Direct user-supplied force/moment
tables bypass this trend and remain the preferred source whenever available.

## Wiring and limits

- module: `lib/physics/normal-force-compressibility.ts`;
- model version: `rocketworks-normal-force-compressibility-0.1.0`;
- domain status: `engineering-preview-unvalidated`;
- selection: persisted `normalForceModel` project input and the Flight inspector;
- scope: relation-based normal force in the coupled 6DOF load path;
- unchanged: axial drag, static CP, recovery loads, and the fast 1D vertical
  estimate;
- direct force/moment coefficient tables remain authoritative and are not
  multiplied by the relation trend.

The factor is applied before the existing small-angle angle-of-attack bound.
Forward flow, minimum airspeed, and positive dynamic pressure are still
required. The result is an engineering trend only; it does not model wave
drag, shock-expansion flow, separated flow, hysteresis, boundary-layer
effects, fin/body interference, control-surface effects, or experimental
uncertainty.

## Public references

- Briggs, *Compressibility Correction Methods to Incompressible Pressure
  Distribution*, NACA-TN-2649, NASA NTRS:
  https://ntrs.nasa.gov/citations/19930083588
- Garrick and Kaplan, *On the Flow of a Compressible Fluid by the Hodograph
  Method I*, NACA-TR-789, NASA NTRS:
  https://ntrs.nasa.gov/citations/19930091881
- NASA, *The Practical Calculation of the Aerodynamic Characteristics of
  Slender Finned Vehicles*, NASA/TM-2001-209983:
  https://ntrs.nasa.gov/citations/20010047838
- NASA, *Flat Plate Cascades at Supersonic Speed* (Ackeret linearized theory
  overview), NASA NTRS:
  https://ntrs.nasa.gov/citations/19930093861

These references are used as public equation references only. No OpenRocket
source, simulation engine, UI, assets, database, or backend component is used.
