# Seeded uncertainty analysis 0.4

Status: engineering preview, unvalidated. This module is an original Kestrel Lab implementation from public statistical methods. It does not use OpenRocket code, data, assets, or simulation logic.

## Purpose

The nominal trajectory answers one deterministic question. The uncertainty layer repeatedly evaluates that same solver while varying explicitly declared inputs. Version 0.4 provides seeded Monte Carlo sampling, stratified Latin-hypercube sampling (LHS), optional Gaussian-copula dependence, parameter sweeps, distribution summaries, threshold probabilities with Wilson 95% intervals, Spearman rank sensitivity, and deterministic split-sample convergence diagnostics.

This is uncertainty propagation through the configured model. It is not experimental validation, certification, reliability qualification, or a flight-safety assessment.

## Sampling

Supported marginal distributions are uniform, triangular, and normal. Normal distributions may be truncated by minimum and/or maximum bounds. Without a dependence declaration, LHS divides each marginal cumulative distribution into equal-probability strata, draws one point from every stratum, and independently shuffles strata between parameters. A caller-supplied string seed makes the complete sample matrix repeatable.

Callers may declare pairwise correlations between parameters. Version 0.4 validates the resulting matrix as positive-definite, maps independent standard-normal draws through its Cholesky factor, and then applies each parameter's inverse marginal distribution. Monte Carlo uses the Gaussian-copula CDF directly; correlated LHS rank-orders the latent scores while retaining one point in every marginal stratum. This preserves the declared marginals but is not a substitute for empirical joint-distribution data, tail-dependence modelling, or a formal copula fit. The browser's Dependence model editor persists validated pairs in the local project snapshot, share link, and project JSON; adapters filter pairs to the factors they actually declare and report the resulting pair count.

The pseudorandom stream uses a documented FNV-1a seed reduction and Mulberry32 generator. It is deterministic and non-cryptographic. A different runtime should reproduce the same IEEE-754 calculations when JavaScript number semantics are preserved.

Version 0.4 still does not separate epistemic from aleatory uncertainty. Its convergence diagnostic is a heuristic
contiguous-half comparison, not a formal stopping rule or proof of model
adequacy.

## Output statistics

For every numeric response the analysis exposes count, missing count, mean, sample standard deviation, standard error of the mean, minimum, P05, P50, P95, and maximum. Quantiles use linear interpolation at position `(n - 1) p` in the ordered sample.

Threshold estimates report the observed fraction and a two-sided Wilson score interval using `z = 1.959963984540054`. The interval describes finite binomial sampling uncertainty for that threshold only. It does not account for incorrect distributions, model-form error, numerical error, or validation error.

Sensitivity is Spearman rho: average ranks are assigned to ties and Pearson correlation is applied to those ranks. It is useful for monotonic relationships and does not imply causation, independence, or a variance contribution.

## Convergence diagnostics

Every result now compares the lower and upper contiguous halves of the
deterministically ordered sample list. For each numeric metric it reports the
relative shifts in P05, P50, and P95, normalized by the larger absolute
half-sample value. For every threshold it reports the absolute half-sample
probability shift and the width of the full Wilson interval.

The aggregate status is:

- `converged` when at least 32 successful samples are available, each half has
  at least 8 valid samples, and the largest diagnostic shift is at most 10%;
- `watch` when the minimum counts are met but a quantile or threshold-rate
  diagnostic exceeds 10%;
- `insufficient-data` when the minimum counts or valid half-sample coverage are
  not met.

This check is deliberately conservative and readable in the browser. It does
not account for model-form error, numerical integration error, rare-event
tails, or validation evidence.

## Vertical-flight adapter

`vertical-flight-uncertainty.ts` maps sampled factors into the existing 1D flight configuration. Version 0.3 can vary dry mass, propellant mass, body drag coefficient, delivered thrust, wind, recovery drag area, recovery deployment outcome, recovery-delay offset, and launch altitude. The delay factor is an additive, bounded offset around the configured nominal delay; the adapter clamps the resulting command time at zero so a negative sample cannot create an invalid flight configuration. A Bernoulli deployment failure removes the recovery device for that scenario. It records apogee, maximum speed, Mach, maximum dynamic pressure, event times, impact speed, thrust-to-weight ratio, impulse, liftoff state, and a `recoveryDeployed` output suitable for threshold-rate reporting.

The browser preview defaults to 48 seeded LHS samples, but its Analysis controls
persist a bounded 16–512 scenario count and a caller-visible replay seed in the
project snapshot, share link, and portable project JSON. The result marks itself
stale when either setting changes and requires an explicit rerun. These bands are
intended for interactive design feedback, not tail-probability claims; larger
ensembles improve resolution at the cost of browser runtime.

The browser's dispersion card also ranks the first four apogee sensitivity
drivers by absolute Spearman magnitude. Bars retain the sign of the
correlation, show the paired sample count, and are a reading aid over the
returned `sensitivityByMetric` values; they do not imply causation or a formal
variance decomposition.

## Verification

Regression tests cover exact seeded replay, seed changes, one sample per LHS stratum, correlated marginal preservation and matrix validation, distribution medians, summary statistics, explicit failures and missing metrics, Wilson interval bounds, deterministic split-sample convergence statuses, Spearman direction, sweep endpoints, validation errors, full trajectory-adapter runs, and recovery deployment/delay-offset scenarios without hidden evaluator failures.

## Public references

- NASA, *Simulation Credibility: Advances in Verification, Validation, and Uncertainty Quantification*, NASA/TP-2016-219422. Describes Monte Carlo and Latin-hypercube sampling for simulation uncertainty quantification: https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20160013550.pdf
- NASA, *An Uncertainty Quantification Framework for Remaining Useful Life Prediction*, describes equal-probability LHS intervals and uncertainty propagation: https://ntrs.nasa.gov/api/citations/20140012546/downloads/20140012546.pdf
- NIST/SEMATECH e-Handbook, *Spearman Dissimilarity*, defines Spearman rho as Pearson correlation applied to ranks with average ranks for ties: https://itl.nist.gov/div898/software/dataplot/refman2/auxillar/speardis.htm
- Wilson, E. B. (1927), *Probable Inference, the Law of Succession, and Statistical Inference*, Journal of the American Statistical Association 22(158), 209-212, DOI 10.1080/01621459.1927.10502953.

## Known limitations

- Distributions are supplied assumptions, not inferred from measurements.
- Dependence is opt-in and uses a Gaussian copula; empirical tail dependence and
  correlation uncertainty are not modeled.
- Split-sample convergence is heuristic and should not be used as a formal
  simulation-credibility gate.
- The small browser ensemble is not adequate for rare-event estimation.
- Spearman ranking can miss non-monotonic sensitivity and interactions.
- Evaluator failures are retained, but no automatic recovery or importance reweighting is attempted.
- The vertical solver remains a 1D engineering preview with its own documented limitations.
