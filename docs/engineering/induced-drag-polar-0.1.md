# Relation induced-drag polar 0.1

Status: `engineering-preview-unvalidated`.

RocketWorks now has an opt-in, clean-room quadratic drag-due-to-normal-force
term for the relation-based 6DOF aerodynamic fallback. It is deliberately
separate from the direct force/moment coefficient database path and does not
copy or call any third-party simulation engine.

## Equation

For a relation-based aerodynamic state, the added coefficient is

`C_D,i = k C_N^2`

and the effective axial coefficient is

`C_D = C_D0 + C_D,i`.

`C_N` is the signed, dimensionless normal-force coefficient implied by the
selected normal-force slope, compressibility factor, and bounded angle of
attack. Squaring it makes the added drag non-negative for either crossflow
direction. The factor `k` is dimensionless and bounded from 0 through 10.

This is the same quadratic drag-polar structure used in public induced-drag
relations, where the induced term is proportional to the square of a lift or
normal-force coefficient. NASA's Glenn Research Center documents the canonical
form `C_D,i = C_L^2 / (pi * AR * e)` and the additive `C_D = C_D0 + C_D,i`
construction:

- https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/induced-drag-coefficient/
- https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-coefficient/

RocketWorks exposes `k` directly instead of inferring a wing aspect ratio or
efficiency from a rocket fin planform. Fin interference, body crossflow,
reference-area mapping, and the appropriate lifting surface are vehicle
specific and need measured or higher-fidelity evidence before such an
inference is defensible.

## Scope and precedence

- Model version: `rocketworks-induced-drag-polar-0.1.0`.
- Default: `disabled`, preserving existing project behavior.
- `quadratic-normal-force`: applies only when the load layer uses its relation
  fallback for normal force.
- Direct body-axis force coefficients remain authoritative and bypass this
  term, with an explicit applicability message.
- A zero normal-force coefficient produces zero induced drag even when the
  selector is enabled.
- The term is not used by the fast 1D vertical preview because that preview has
  no resolved angle-of-attack state; it is available in the coupled/staged
  6DOF path.

The load diagnostics expose the selected model, model version, factor, added
coefficient, and effective coefficient. Project snapshots, share links, staged
preview provenance, and Markdown engineering reports retain the selection and
factor so a result cannot be mistaken for a baseline run.

## Limits

This relation is an engineering trend, not a validated flight model. It does
not represent transonic wave drag, separated flow, fin-body interference,
vortex shedding, dynamic stall, aeroelasticity, or a vehicle-specific induced
drag efficiency. Use a provenance-qualified Mach/Reynolds/angle table or direct
force/moment database when available, and independently validate any result
before manufacturing or flight decisions.
