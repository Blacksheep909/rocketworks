# Hierarchical vehicle assembly 0.1

Status: analytical component checks only, unvalidated. This is an original RocketWorks implementation based on public rigid-body mechanics. It does not use OpenRocket source code, simulation logic, UI, assets, databases, or backend components.

## Purpose

The assembly layer turns a design tree into concrete rigid-body instances. Version 0.1 represents:

- serial core and upper stages
- parallel and repeated strap-on booster stages
- nested pods, equipment bays, custom groups, and motor clusters
- arbitrary rigid translations and orthonormal rotations
- equally spaced radial patterns about the body longitudinal axis
- independently enabled nodes and active-stage topology
- concrete component mass-property instances and concrete motor mounts

The browser ARC 54 now obtains its design mass, CG, and inertia through this hierarchy rather than directly summing a flat component list.

## Coordinate convention

The rigid body uses a right-handed Cartesian body frame. The rocket nose direction is `+X`; `Y` and `Z` span the transverse plane. Every node provides a local-to-parent transform `(R, t)`. Transforms compose as:

`R_parent_child = R_parent R_child`

`t_parent_child = t_parent + R_parent t_child`

For a local point `p`, the body-frame point is `R p + t`. Motor directions use the rotation only and are normalized after transformation.

Rotations must be finite and orthonormal within `1e-9`, with determinant `+1` within `1e-9`. Reflections and scaled/sheared matrices are rejected.

## Radial patterns

A radial pattern creates `N` equally spaced placements about the `X` axis:

`theta_i = theta_0 + 2 pi i / N`

`t_i = (0, r cos(theta_i), r sin(theta_i))`

By default each instance also rotates by `theta_i` about `X`, preserving the local orientation of fins, pods, and off-axis motor geometry around the circumference. `rotateInstances: false` keeps every instance aligned with the parent frame.

Repeated stages share one logical topology identifier for aerodynamic regime
selection, while every physical copy gets a unique stage-instance index and
concrete component/motor instance identifier. The multi-stage flight model can
map those copies into `RocketStage.instances` and track ignition, burnout, and
separation independently.

## Mass properties

Each component is evaluated in its own local frame by the existing versioned component mass model. The assembly rotates its inertia tensor, transforms its CG, and combines all enabled instances with the tensor parallel-axis theorem. Symmetric radial layouts therefore cancel transverse CG offsets while retaining their roll and transverse inertia contributions.

Stage evaluations expose structural mass properties separately. This result can supply the structural portion of the existing multi-stage dynamics model. Motor-mount geometry is deliberately separate from motor dry/propellant mass; matching motor mass components must be supplied to avoid double counting or implicit mass.

## Validation and errors

The model rejects:

- missing stages and empty groups/stages
- malformed or duplicate stage/node identifiers
- parallel stages without an earlier parent
- self, unknown, or forward parent references
- cyclic node objects
- non-finite transforms and non-orthonormal rotations
- invalid repeat counts/radii
- zero or non-finite thrust axes
- unknown requested active stages
- active topologies with no structural mass

Disabled nodes and inactive stages contribute neither mass nor motor mounts.

## Aerodynamic scope

Off-axis components currently affect mass, CG, inertia, and thrust placement only. Version 0.1 does not calculate pod/booster aerodynamic interference, crossflow shielding, base-drag interaction, asymmetric separation aerodynamics, or multi-body wake effects. Every off-axis structural evaluation emits an explicit warning. Existing axial static and stage-aware aerodynamics remain separate and must not be presented as a complete booster/pod aerodynamic solution.

## Verification

Regression tests cover serial-stage CG, active-stage filtering, four-way booster symmetry and inertia, nested pod expansion, unique radial motor mounts, rigid transforms, disabled nodes, invalid parents/patterns/rotations, duplicate identifiers, object cycles, and unknown active stages.

## Public references

- NASA NESC Academy, *Kinematics and Dynamics for Practicing Engineers — Mass Distribution Made Easy*, covering mass centers, inertia tensors, product-of-inertia conventions, and the parallel-axis theorem: https://nescacademy.nasa.gov/video/7f310373e3e64527810f8ae319db74b91d
- NASA, *Stability and Control of Space Vehicles*, NASA/SP-2005-4540, describing inertia about mutually perpendicular axes through the center of gravity: https://www.nasa.gov/wp-content/uploads/2023/04/sp-4540.pdf
- NASA Glenn, *Rocket Rotations*, describing rocket rotation about CG and torque from an off-axis thrust vector: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-rotations/
- NASA Glenn, *Thrust Equation*, describing thrust as a vector force: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/thrust-force/

## Known limitations

- Aerodynamic interference and separation flow fields are absent.
- The assembly layer itself remains a geometry/mass expansion and does not
  own event state; callers must map its stage-instance indices into the
  multi-stage event model when independent separation is required.
- Flexible joints, mount compliance, slosh, and structural modes are absent.
- Motor mounts do not automatically create motor mass or thrust curves.
- Placements are programmatic; interactive browser editing of arbitrary trees is a future layer.
- Validation is analytical only and is not sufficient for flight-safety decisions.
