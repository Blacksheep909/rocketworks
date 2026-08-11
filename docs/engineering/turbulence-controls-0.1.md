# Turbulence controls 0.1

Status: `engineering-preview-unvalidated`

RocketWorks exposes a small, explicit control surface for deterministic
synthetic turbulence. The controls are inputs to the independent launch
environment model; they are not a live weather feed or a launch-go decision.

## Inputs

`turbulenceScale` is a dimensionless RMS multiplier validated in the inclusive
range `0`–`3`. It scales the longitudinal, lateral, and vertical RMS values
generated from the preview wind reference speed. A value of `0` disables the
stochastic component exactly while preserving the mean-wind field and any
explicit discrete gusts.

`weatherSeed` is a required, non-empty replay label with an 80-character limit.
The default `arc54-weather-v1` keeps older projects deterministic. The seed is
used by the original finite-mode turbulence field and is combined with the
landing scenario index (`<seed>-landing-<n>`) so each scenario is independent
but repeatable. Landing dispersion multiplies the persisted nominal scale by a
bounded scenario factor (`0.65`–`1.4`) before it queries the field; the
inspector value remains the nominal design assumption shown in reports.

## Persistence and provenance

Both inputs are validated with the editable project state and are included in
local autosave/history, portable project JSON, compact share links, built-in
templates, the coupled environment provider, landing-dispersion predictions,
and engineering-report launch-environment lines. The Flight inspector shows
the active RMS envelope and replay seed next to the mean-wind provenance.

Reports label these as user-controlled synthetic assumptions. A seed is not a
claim that a measured weather record exists, and changing the seed is not a
statistical validation of the turbulence model.

## Adapter boundary

The coupled 6DOF preview and landing-dispersion adapter query the seeded field.
The fast 1D vertical trace intentionally uses the mean-wind profile only. It
does not integrate a random gust realization or claim stochastic load
coverage. The UI keeps this limitation visible until a separately validated
vertical stochastic integrator is available.

See [Launch environment model 0.2](launch-environment-0.1.md) for the public
equation basis, finite-band assumptions, verification checks, and known
limitations.
