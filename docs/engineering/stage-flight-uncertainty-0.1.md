# Coupled stage-flight uncertainty 0.1

Kestrel Lab's coupled dispersion adapter is an independent wrapper around the
existing staging, topology-aerodynamics, launch-environment, launch-rail, and
rigid-body models. It does not import or reuse an external rocket simulator.

## Contract

- Adapter version: `kestrel-stage-flight-uncertainty-0.1.0`
- Sampling: seeded Latin hypercube through the shared uncertainty model
  (`kestrel-uncertainty-0.3.0`)
- Default browser ensemble: 16 samples, retained as individual input/output or
  error records
- Each sample runs the full coupled preview, including its half-step numerical
  convergence rerun
- The caller receives percentile summaries, Wilson threshold intervals,
  Spearman sensitivity, and contiguous-half convergence diagnostics

The default browser factors are independent bounded distributions for dry mass,
propellant mass, delivered thrust, drag coefficient, and wind magnitude. The
variant builder scales structural and dry motor mass properties with the dry
mass factor, initial propellant mass properties with the propellant factor,
every thrust-curve ordinate with the thrust factor, selected aerodynamic drag
with the drag factor, and both profile/provider wind vectors with the wind
factor. The input object and its nested stage/motor records are never mutated.

## Reported metrics

Each successful sample exposes:

- peak altitude above launch point;
- peak speed and maximum dynamic pressure;
- time to the sampled apogee estimate;
- final position magnitude and final speed;
- applied event count, separated-body branch count, and a numerical-convergence
  indicator.

Failed samples remain visible and are excluded from percentile calculations.

## Aerodynamic scale boundary

`StageFlightPreviewInput.dragCoefficientScale` applies after the selected
constant or Mach--Reynolds table source is evaluated. It scales drag only;
normal-force slope, centre of pressure, damping, and coefficient uncertainty
remain nominal. This is an explicit input-dispersion assumption, not a claim
that all aerodynamic coefficients share one correlated error.

## Interpretation and limits

The adapter samples input assumptions, not measured distributions. Factors are
independent in this release; correlations, epistemic/model-form uncertainty,
motor grain geometry, weather forecast error, terrain, collision, and clearance
are outside scope. Split-sample convergence is a finite-ensemble stability
heuristic and cannot validate the equations, certify a design, or establish a
flight-safety corridor. Use the coupled result for design exploration and
independent engineering review only.
