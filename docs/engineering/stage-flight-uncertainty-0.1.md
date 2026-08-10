# Coupled stage-flight uncertainty 0.2

RocketWorks' coupled dispersion adapter is an independent wrapper around the
existing staging, topology-aerodynamics, launch-environment, launch-rail, and
rigid-body models. It does not import or reuse an external rocket simulator.

## Contract

- Adapter version: `kestrel-stage-flight-uncertainty-0.4.0`
- Sampling: seeded Latin hypercube through the shared uncertainty model
  (`kestrel-uncertainty-0.4.0`)
- Default browser ensemble: 16 samples, retained as individual input/output or
  error records
- Each sample runs the full coupled preview, including its half-step numerical
  convergence rerun
- The caller receives percentile summaries, Wilson threshold intervals,
  Spearman sensitivity, and contiguous-half convergence diagnostics

The default browser factors are independent bounded distributions for dry mass,
propellant mass, delivered thrust, drag coefficient, recovery area (when a
retained recovery device is configured), recovery deployment outcome (when a
retained recovery device is configured), and wind magnitude. When the selected
topology source exposes direct body-axis force or static-moment volumes, the
browser also exposes separate direct-force and direct-moment coefficient scales.
The variant builder scales structural and dry motor mass properties with the
dry-mass factor, initial propellant mass properties with the propellant factor,
every thrust-curve ordinate with the thrust factor, selected aerodynamic drag
with the drag factor, direct body-axis force and static-moment resultants with
their respective factors, configured recovery-device reference areas with the
recovery area factor, and both profile/provider wind vectors with the wind
factor.

When a Bernoulli recovery outcome is sampled as failure, the variant inserts a
small positive-time failure event for each configured recovery device; the
device remains failed even if a later apogee command fires. The input object
and its nested stage/motor/recovery records are never mutated.

## Reported metrics

Each successful sample exposes:

- peak altitude above launch point;
- peak speed and maximum dynamic pressure;
- peak retained-vehicle recovery drag and effective canopy area when recovery
  is configured;
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

`directForceCoefficientScale` and `directMomentCoefficientScale` apply after
the selected angular force/moment volumes are evaluated. They multiply the
body-axis `q S C_F` and `q S C_M l` resultants independently; static relation
fallbacks, damping derivatives, and source uncertainty surfaces remain
nominal. The separate factors avoid implying that drag, transverse force, and
static moments share one error source.

## Interpretation and limits

The adapter samples input assumptions, not measured distributions. The browser
default remains independent because no correlations are declared. API callers
may opt into pairwise Gaussian-copula correlations; the shared uncertainty
model validates a positive-definite matrix, preserves each marginal, and
records the declared pairs in the result. This is a dependence assumption, not
empirical joint-distribution evidence or a flight-safety claim. Epistemic/model-
form uncertainty, motor grain geometry, weather forecast error, terrain,
collision, and clearance remain outside scope. Split-sample convergence is a
finite-ensemble stability heuristic and cannot validate the equations, certify
a design, or establish a flight-safety corridor. Use the coupled result for
design exploration and independent engineering review only.
