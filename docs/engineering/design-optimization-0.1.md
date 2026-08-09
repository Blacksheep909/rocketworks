# Design optimization 0.2

Status: `engineering-preview-unvalidated`

Implementations:

- `lib/physics/design-optimization.ts`
- `lib/physics/vertical-flight-optimization.ts`

This is an original clean-room implementation based on publicly described
multi-objective optimization methods. It contains no OpenRocket code, engine,
data, UI, assets, or backend components.

## Purpose

The optimizer searches bounded continuous design variables against multiple
objectives and engineering constraints. It returns:

- the final ranked population
- every feasible non-dominated candidate in the final Pareto front
- constraint values and normalized violations for every candidate
- Pareto rank and crowding distance
- one explicitly labelled weighted compromise recommendation
- seed, evaluation count, algorithm version, assumptions, and warnings

It does not silently modify a design and it does not claim that the compromise
is uniquely best or globally optimal.

## Search method

Version 0.2 uses a deterministic, constrained, non-dominated evolutionary
search inspired by the public NSGA-II method:

1. The declared initial design is evaluated.
2. The remaining initial population uses a seeded Latin-hypercube design over
   each variable range.
3. Constraint dominance ranks feasible candidates ahead of infeasible ones.
   Between infeasible candidates, lower summed normalized violation wins.
4. Feasible candidates use Pareto dominance across all objectives.
5. Normalized crowding distance preserves objective-space diversity.
6. Seeded tournament selection, bounded blend crossover, mutation, and random
   gene restarts generate offspring.
7. Elitist survivor selection fills the next population by Pareto front and
   crowding distance.

The crossover and mutation operators are Kestrel's own bounded implementation;
this is therefore described as *NSGA-II-style*, not as a byte-for-byte or exact
reference implementation of any third-party library.

For each feasible final-front candidate, objective values are converted to the
requested minimize/maximize direction and normalized over that front. The
reported tradeoff score is the weighted mean normalized regret. The candidate
with the smallest score is labelled the compromise recommendation. Changing
bounds, weights, constraints, population size, generation count, evaluator, or
seed can change that recommendation.

## Vertical-flight adapter

The first adapter searches existing vertical-flight factors:

- dry and propellant mass scale
- drag-coefficient scale
- motor thrust scale
- mean-wind scale
- recovery drag-area scale
- recovery delay
- launch-altitude offset

Available optimization metrics include apogee, maximum speed, Mach, dynamic
pressure, flight times, impact speed, ignition thrust-to-weight, impulse,
liftoff, and completed-flight flags.

The browser preview deliberately searches only motor thrust, canopy area, and
deployment delay. It does not optimize an assumed drag coefficient or delete
payload mass merely to improve a score. Its guardrails currently require:

- liftoff and a completed simulated flight
- ignition thrust-to-weight of at least 3:1
- Mach no greater than 0.85 for the simplified vertical preview
- maximum dynamic pressure no greater than 25 kPa
- impact speed no greater than 15 m/s when recovery is enabled

Those limits are preview defaults, not universal launch requirements or
structural allowables.

## Opt-in robust screen

The vertical adapter also accepts an explicit `robustness` block. When it is
enabled, every candidate is propagated through a seeded Latin-hypercube
ensemble using the declared bounded uncertainty factors and optional
correlation pairs. The evaluator reports finite-sample metrics alongside the
nominal metrics:

- `robustApogeeP05M` — lower-tail apogee floor;
- `robustMaxDynamicPressureP95Pa` — upper-tail maximum dynamic pressure;
- `robustImpactSpeedP95Mps` — upper-tail impact speed when recovery is active;
- `robustFailureRate` — failed scenarios divided by requested scenarios.

The browser's **Find robust designs** action uses 12 scenarios per candidate,
the persisted dependence model is filtered to the supported factors, and
additional guardrails reject candidates with excessive scenario failures or
upper-tail loads. This is a transparent risk screen, not a reliability claim:
the ensemble is intentionally small, scenario failures remain visible, and
quantiles are not confidence bounds. Nominal optimization remains the default.

## Verification

Automated tests cover:

- exact replay for identical seeds
- seed sensitivity
- convergence on a smooth analytical one-variable optimum
- constraint dominance against an objectively attractive infeasible region
- preservation of a broad two-objective Pareto front
- vertical-flight metric and constraint integration
- deterministic finite-sample robust metrics, scenario-failure constraints,
  and invalid robust-settings rejection
- invalid bounds, search sizes, weights, missing metrics, and non-finite metrics

These tests establish deterministic numerical behavior and component-level
correctness. They do not validate the optimizer's rocket recommendations
against flight data, independent design software, structural analysis, or
certification rules.

## Known limitations

- No proof of global optimality or exhaustive coverage.
- Continuous bounded variables only; no categorical component selection,
  integer variables, topology mutation, or mixed discrete-continuous search.
- Synchronous single-process evaluation; no worker pool or checkpoint/resume.
- Robust mode is a finite-sample screening ensemble, not a reliability method;
  it has no confidence bounds, adaptive sampling, importance sampling,
  surrogate model, or certification interpretation.
- Constraints use user-supplied normalization or the magnitude of their limit;
  poor scaling can distort infeasible-candidate ranking.
- The weighted compromise is sensitive to the discovered front's extrema.
- Optimizers can exploit omissions and inaccuracies in their evaluator.

Never manufacture or fly an optimized candidate without independent analysis,
test evidence, range review, and appropriately qualified engineering judgment.

## Primary public reference

- K. Deb, A. Pratap, S. Agarwal, and T. Meyarivan, *A Fast and Elitist
  Multiobjective Genetic Algorithm: NSGA-II*, IEEE Transactions on Evolutionary
  Computation 6(2), 182–197, 2002. DOI: 10.1109/4235.996017.
  https://repository.ias.ac.in/83498/1/2-a.pdf
