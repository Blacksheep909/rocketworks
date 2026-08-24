# RocketWorks staged parameter sweep 0.1

## Purpose

The staged parameter sweep is a deterministic, one-variable trade-study
adapter around the RocketWorks staged flight preview. It is not a second
simulation kernel: each row creates an immutable `createStageFlightVariant`
input and then evaluates the same event allocator, launch-rail handoff,
staging, recovery, aerodynamic, six-degree-of-freedom, and optional
released-body branches used by the nominal preview.

Model identity:

- adapter: `rocketworks-stage-flight-sweep-0.1.0`
- flight model: `kestrel-stage-flight-preview-0.46.0` (reported at runtime)
- status: `mathematical-regression-tests-only`

## Sampling contract

For a selected parameter `p`, minimum `p_min`, maximum `p_max`, and `N` rows,
the adapter evaluates the evenly spaced values

\[
p_i = p_{min} + \frac{i}{N-1}(p_{max}-p_{min}),\qquad i=0,\ldots,N-1.
\]

The browser currently bounds `N` to 2–25 rows. The reusable physics contract
accepts up to the shared parameter-sweep limit of 1,000 rows; the browser
limit is a responsiveness guard, not a physical limit.

Supported factors are bounded previews of delivered thrust, dry mass,
propellant mass, drag coefficient, wind, recovery area and inflation time,
ignition delay, separation impulse, launch alignment, guide friction, and
rail-exit tip-off. Bounds are deliberately screening ranges. They are not
probability distributions, tolerances, or hardware limits.

## Outputs and failure handling

Each successful row records peak altitude, peak speed, time to apogee, peak
dynamic pressure, final state speed, event count, released-body count, and
the staged convergence flag. Evaluator exceptions stay attached to their row
as an error string; they are not converted into a plausible numeric result or
silently dropped. The CSV and engineering-report exports retain those errors.

## Assumptions and limits

- Exactly one declared factor changes in a row; correlations and coupled
  tolerance distributions belong to the separate uncertainty workflow.
- Topology, event allocation, aerodynamic source, environment, integration
  method, and time step remain fixed across rows.
- The sweep does not search for an optimum, establish monotonicity, or prove
  a safe operating envelope.
- Results inherit every analytical limitation of the selected staged preview,
  including coefficient-source provenance, recovery approximations, rail
  assumptions, contact/wake sensitivity branches, and released-body limits.
- A row marked evaluated means only that the equations completed without an
  input/model exception. It is not experimental validation, certification,
  manufacturing approval, range clearance, or a flight-safety result.

