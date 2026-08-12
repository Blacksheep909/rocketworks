# Coupled stage-flight uncertainty 0.4

RocketWorks' coupled dispersion adapter is an independent wrapper around the
existing staging, topology-aerodynamics, launch-environment, launch-rail, and
rigid-body models. It does not import or reuse an external rocket simulator.

## Contract

- Adapter version: `kestrel-stage-flight-uncertainty-0.6.0`
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
retained recovery device is configured), and wind magnitude. Each declared
motor also receives an independent `motorThrustScale:<id>` factor so clustered
stages can expose thrust spread and net-force/moment imbalance. When the
selected topology source exposes direct body-axis force or static-moment
volumes, the browser also exposes separate direct-force and direct-moment
coefficient scales. The coupled browser additionally samples an ignition-delay
offset, a separation-impulse scale, and a small launch-alignment offset. The
variant builder scales structural and dry motor mass properties with the
dry-mass factor, initial propellant mass properties with the propellant factor,
every thrust-curve ordinate with the global thrust factor and its declared
per-motor factor, selected aerodynamic drag with the drag factor, direct
body-axis force and static-moment resultants with their respective factors,
configured recovery-device reference areas with the recovery area factor, both
profile/provider wind vectors with the wind factor, and annotated staging
events with the event factors. Motor-local ignition delays and
ignition-after-burnout triggers receive the sampled delay offset; annotated
separation events receive the sampled impulse scale; the initial body attitude
receives a body-`+Y` pitch perturbation for alignment uncertainty.

Per-motor factors are keyed by the exact motor identifier. Repeated physical
copies with distinct identifiers can vary independently; copies that share an
identifier share one sampled factor. The factors are deterministic scenario
multipliers and do not claim measured motor covariance, gimbal behavior,
thrust-vector misalignment, or a qualified motor-performance distribution.

When a Bernoulli recovery outcome is sampled as failure, the variant inserts a
small positive-time failure event for each configured recovery device; the
device remains failed even if a later apogee command fires. The input object
and its nested stage/motor/recovery records are never mutated.

Event factors are deterministic scenario perturbations, not measured
distributions. A launch-rail run can reject an alignment sample when the
perturbation exceeds its declared tolerance; that sample remains a visible
failed scenario and is excluded from percentile metrics. Separation impulse
scaling wraps the event's state update and telemetry annotation together so
the sampled velocity change cannot silently disagree with the reported event.

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

## Event-factor limits

- The ignition-delay factor is a global additive offset over motor-local delay
  and stage ignition-after-burnout triggers. Per-motor timing distributions,
  ignition transients, and measured event covariance remain future inputs.
- Separation impulse scaling applies only to events carrying the explicit
  separation-delta-v annotation. Mechanism compliance, plume interaction,
  contact, angular impulse, and relative-body propagation remain outside this
  adapter.
- Alignment uncertainty is a body-frame pitch perturbation at the initial
  state. It is not a pad-survey, rail-flexure, tip-off, or guidance-error
  model.
