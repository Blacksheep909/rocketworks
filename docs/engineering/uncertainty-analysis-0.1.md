# Seeded uncertainty analysis 0.1

Status: engineering preview, unvalidated. This module is an original Kestrel Lab implementation from public statistical methods. It does not use OpenRocket code, data, assets, or simulation logic.

## Purpose

The nominal trajectory answers one deterministic question. The uncertainty layer repeatedly evaluates that same solver while varying explicitly declared inputs. Version 0.1 provides seeded Monte Carlo sampling, stratified Latin-hypercube sampling (LHS), parameter sweeps, distribution summaries, threshold probabilities with Wilson 95% intervals, and Spearman rank sensitivity.

This is uncertainty propagation through the configured model. It is not experimental validation, certification, reliability qualification, or a flight-safety assessment.

## Sampling

Supported independent marginal distributions are uniform, triangular, and normal. Normal distributions may be truncated by minimum and/or maximum bounds. LHS divides each marginal cumulative distribution into equal-probability strata, draws one point from every stratum, and independently shuffles strata between parameters. A caller-supplied string seed makes the complete sample matrix repeatable.

The pseudorandom stream uses a documented FNV-1a seed reduction and Mulberry32 generator. It is deterministic and non-cryptographic. A different runtime should reproduce the same IEEE-754 calculations when JavaScript number semantics are preserved.

Version 0.1 assumes independent uncertain inputs. Correlation structures, epistemic/aleatory separation, convergence diagnostics, and nested sampling are not yet represented.

## Output statistics

For every numeric response the analysis exposes count, missing count, mean, sample standard deviation, standard error of the mean, minimum, P05, P50, P95, and maximum. Quantiles use linear interpolation at position `(n - 1) p` in the ordered sample.

Threshold estimates report the observed fraction and a two-sided Wilson score interval using `z = 1.959963984540054`. The interval describes finite binomial sampling uncertainty for that threshold only. It does not account for incorrect distributions, model-form error, numerical error, or validation error.

Sensitivity is Spearman rho: average ranks are assigned to ties and Pearson correlation is applied to those ranks. It is useful for monotonic relationships and does not imply causation, independence, or a variance contribution.

## Vertical-flight adapter

`vertical-flight-uncertainty.ts` maps sampled factors into the existing 1D flight configuration. Version 0.1 can vary dry mass, propellant mass, body drag coefficient, delivered thrust, wind, recovery drag area, recovery delay, and launch altitude. It records apogee, maximum speed, Mach, maximum dynamic pressure, event times, impact speed, thrust-to-weight ratio, impulse, and liftoff state.

The browser preview uses 48 seeded LHS samples and declares its input assumptions next to the result. Those small-sample bands are intended for interactive design feedback, not tail-probability claims.

## Verification

Regression tests cover exact seeded replay, seed changes, one sample per LHS stratum, distribution medians, summary statistics, explicit failures and missing metrics, Wilson interval bounds, Spearman direction, sweep endpoints, validation errors, and a full trajectory-adapter run.

## Public references

- NASA, *Simulation Credibility: Advances in Verification, Validation, and Uncertainty Quantification*, NASA/TP-2016-219422. Describes Monte Carlo and Latin-hypercube sampling for simulation uncertainty quantification: https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20160013550.pdf
- NASA, *An Uncertainty Quantification Framework for Remaining Useful Life Prediction*, describes equal-probability LHS intervals and uncertainty propagation: https://ntrs.nasa.gov/api/citations/20140012546/downloads/20140012546.pdf
- NIST/SEMATECH e-Handbook, *Spearman Dissimilarity*, defines Spearman rho as Pearson correlation applied to ranks with average ranks for ties: https://itl.nist.gov/div898/software/dataplot/refman2/auxillar/speardis.htm
- Wilson, E. B. (1927), *Probable Inference, the Law of Succession, and Statistical Inference*, Journal of the American Statistical Association 22(158), 209-212, DOI 10.1080/01621459.1927.10502953.

## Known limitations

- Distributions are supplied assumptions, not inferred from measurements.
- Inputs are independent; correlation can materially change output tails.
- The small browser ensemble is not adequate for rare-event estimation.
- Spearman ranking can miss non-monotonic sensitivity and interactions.
- Evaluator failures are retained, but no automatic recovery or importance reweighting is attempted.
- The vertical solver remains a 1D engineering preview with its own documented limitations.
