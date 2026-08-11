# Preliminary airframe bending-mode screen 0.1

Status: `analytical-component-checks-only`.

Implementation: `lib/physics/structural-dynamics.ts`, composed by
`lib/physics/structural-screen.ts`.

This is an independent uniform Euler-Bernoulli equivalent-beam calculation. It
adds a dynamic-readiness trend to the existing structural screen; it is not a
finite-element model, ground-vibration test, aeroelastic certification, or
flight-safety assessment.

## Equation

For an equivalent beam with length `L`, bending stiffness `EI`, and
distributed mass per unit length `mu`, the first transverse angular frequency
is:

```text
omega_1 = (beta L)^2 sqrt(EI / (mu L^4))
f_1     = omega_1 / (2 pi)
T_1     = 1 / f_1
```

The default cantilever root is `beta L = 1.8751040687`. An explicit
simply-supported option uses `beta L = pi`. These are classical first-mode
roots; the implementation does not infer a boundary condition from launch
hardware.

The browser structural screen uses the weakest modeled shell second moment
and selected Young's modulus for `EI`. It obtains distributed mass from the
modeled airframe shell mass divided by the station span. Payload, motor,
propellant, and recovery point masses therefore do not silently become beam
mass; their omitted influence is disclosed as a limitation.

## Scope and limits

- Properties are uniform equivalents over the supplied station span.
- Shear deformation, rotary inertia, axial-load softening, joints, couplers,
  damping, payload/motor attachment, propellant slosh, aerodynamic forcing,
  nonlinear geometry, and mode coupling are outside the model.
- A frequency is a trend and has no pass/fail threshold in the structural
  review. Users must compare it with measured excitation spectra, guide and
  motor forcing, and an independently reviewed structural model.
- Results retain model version, equations, assumptions, and warnings and must
  not be represented as flight-safe.

## Verification

The deterministic benchmark suite and physics tests recompute the formula
from the returned `beta L`, `EI`, `mu`, and `L`, and cover both cantilever and
simply-supported roots plus invalid-input rejection. These checks establish
  implementation consistency, not experimental validation.

## Public reference

NASA, *Finite Element Modeling of Uniform Cantilever Beams*, NASA CR-89536,
describes the Bernoulli–Euler beam idealization and its frequency equations:

<https://ntrs.nasa.gov/api/citations/19670013552/downloads/19670013552.pdf>
