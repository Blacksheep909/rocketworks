# Mass properties model 0.1

Status: analytical checks pass; independent benchmark and physical validation are
not complete.

This is an original clean-room implementation. It uses public rigid-body
mechanics and geometric integration. It does not contain or call OpenRocket
source code, data, assets, or simulation logic.

## Coordinate convention

- `x`: vehicle longitudinal axis, positive from the nose toward the tail
- `y` and `z`: transverse body axes
- distance: metres
- mass: kilograms
- inertia: kilogram-square-metres

Each component reports mass, a three-dimensional center of mass, and a symmetric
3 × 3 inertia tensor about its own center of mass. A rigid transform rotates the
tensor into the vehicle frame with `R I Rᵀ` and transforms the component center.
The vehicle center is the mass-weighted component center. Component tensors are
then translated to that center with

`I_vehicle = I_component + m ((d · d) identity - d dᵀ)`

before summation.

## Component models

### Axisymmetric profiles

An axisymmetric part is a sequence of radius stations. Radius varies linearly
between adjacent stations. Eight-point Gauss-Legendre quadrature integrates
annular differential disks. A wall thickness creates a hollow profile; omitting
it creates a solid profile.

This representation covers straight tubes, cylinders, cones, conical
transitions, and piecewise-linear approximations of curved nose profiles.

### Fin sets

A fin is a uniform-density extruded trapezoidal plate. Exact polygon integrals
provide its area, centroid, planar moments, and product of inertia. The model adds
the finite-thickness contribution, rotates each fin evenly around the vehicle
axis, and composes the set with the same tensor pipeline.

### Known and point masses

Motors, recovery hardware, payloads, and ballast can be represented by a known
mass and three-dimensional location. A measured or supplier-provided local
inertia tensor can be supplied; otherwise the part is treated as a point mass.

### Stages

Every component belongs to a stage. A calculation may include all stages or an
explicit active-stage set. This does not yet model separation dynamics, but it
establishes the mass-state mechanism required for that work.

## Analytical verification

Automated tests currently cover:

- hollow-cylinder mass, center, axial inertia, and transverse inertia
- solid right-cone mass, center, axial inertia, and transverse inertia
- two-point-mass parallel-axis composition
- 90-degree rigid rotation of center and principal moments
- symmetric fin-set mass and transverse-center cancellation
- active-stage filtering
- compact-package shape inertia for retained point-mass allowances

The numerical integration tolerance in these closed-form cases is `1e-12`.

## Known limitations

- Density is uniform within each component.
- Fasteners, adhesives, paint, wiring, and manufacturing variation require
  explicit known-mass entries or an uncertainty allowance.
- Curved profiles are approximated by their supplied radius stations.
- The fin model assumes a planar, uniform trapezoidal extrusion.
- Point masses without a local tensor understate their own rotational inertia.
- The browser's retained payload/recovery fallback may add the versioned
  `kestrel-compact-package-inertia-0.1.0` solid-cylinder shape term when a
  point-mass-only retained state would be singular. This is an explicit
  positive-definite placeholder, not measured or CAD-derived geometry.
- Flexibility, slosh, propellant motion, ablation, and separation transients are
  not modeled.
- CAD-derived and experimentally measured properties are not yet supported.
- Analytical regression tests are not a substitute for calibrated scales,
  balance measurements, torsional-pendulum tests, or independent software
  benchmarks.

Do not use these values as the sole basis for flight-safety decisions.

## Public references

- NASA, *Spacecraft Mass Properties Estimation Using the Force and Moment
  Method*, AAS 18-222. Defines tensor rotation, the parallel-axis theorem, and
  composite mass-property accumulation:
  https://ntrs.nasa.gov/api/citations/20180005661/downloads/20180005661.pdf
- NASA Technical Memorandum 20220013375, *Spacecraft Mass Properties Estimation
  Using the Force and Moment Method*. Includes the inertia tensor and
  parallel-axis formulation:
  https://ntrs.nasa.gov/api/citations/20220013375/downloads/NASA-TM-20220013375.pdf
- NASA Technical Note D-4911, *A General Computer Program for Calculating the
  Mass and Inertial Properties of Complex Bodies*. Describes composite bodies as
  combinations of basic elements:
  https://ntrs.nasa.gov/api/citations/19690004466/downloads/19690004466.pdf
- NASA, *Experimental Determination of the Moments of Inertia of an Unmanned Air
  Vehicle*. Supports the limitation that physical testing is needed for complex
  finished vehicles:
  https://ntrs.nasa.gov/api/citations/20180001455/downloads/20180001455.pdf
