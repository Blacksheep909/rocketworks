# RocketWorks staged flight optimization 0.1

## Purpose

The staged optimizer is a versioned adapter around the RocketWorks coupled
stage-flight preview. It searches bounded design variables with the shared
seeded constrained non-dominated evolutionary algorithm; it does not introduce
an alternate flight kernel or copy an external simulator.

Model identity:

- adapter: `rocketworks-stage-flight-optimization-0.1.0`
- flight model: `kestrel-stage-flight-preview-0.47.0` (reported at runtime)
- search model: `kestrel-design-optimization-0.1.0` (reported inside the result)
- status: `mathematical-regression-tests-only`

## Candidate contract

The browser currently searches four bounded factors:

- delivered thrust scale: 0.80–1.20;
- drag-coefficient scale: 0.85–1.15;
- recovery area scale: 0.70–1.40;
- recovery inflation-time scale: 0.70–1.50.

Every candidate is evaluated by the complete staged input graph: topology,
mass and inertia, propulsion, launch rail, atmosphere/environment, events,
recovery, aerodynamic sources, six-degree-of-freedom propagation, and any
configured separated-body branches. The optimizer does not mutate the caller's
base input.

Nominal objectives use peak altitude, peak dynamic pressure, and final speed.
The browser also requires a non-negative convergence metric so a candidate's
numerical status stays visible in the constraint record rather than being
silently treated as validated.

## Robust screen

The robust mode evaluates eight seeded Latin-hypercube scenarios per candidate
using the declared dry-mass, thrust, drag, and wind distributions. It reports
the P05 peak-altitude floor, P95 peak dynamic pressure, P95 final speed, and
the requested-versus-failed scenario rate. These are finite-sample screening
metrics; they are not reliability probabilities, tolerance qualifications, or
flight-safety limits.

## Search and application boundaries

The search is deterministic for a fixed seed and candidate contract, but it
does not prove a global optimum and can exploit model error. The browser uses
eight candidates across two generations to keep the interactive workflow
bounded. Applying a recommendation maps only the common global thrust, drag,
recovery-area, and inflation-time controls; stage-local assignments,
propellant mass, mechanism hardware, and unrepresented variables are not
silently rewritten. The coupled preview must be rerun after applying a
recommendation, and all outputs remain engineering previews pending independent
validation.
