# Released-body relative-flow interaction 0.1

Status: `analytical-component-checks-only`.

Implementation: `lib/physics/relative-aero-interaction.ts`.

RocketWorks now adds a post-trace relative-flow screen to staged separation
results. It evaluates every directed body pair (source wake → target body) on
the union of their supplied trajectory times. The screen is intentionally
independent of the flight integrator: it reports review telemetry and never
adds an aerodynamic force, moment, contact impulse, or state correction.

## Input contract

Each body supplies a non-empty, non-decreasing position trace and optional
world-frame velocity samples. A positive reference area produces an equivalent
circular diameter:

```text
D_eq = sqrt(4 A / pi)
```

When reference area is unavailable, a positive fixed spherical envelope radius
is used as the diameter fallback (`D_eq = 2 r`). Bodies without either source
remain visible but are not assessed. A launch-environment provider is optional;
when present it supplies local wind and density for air-relative wake direction
and dynamic-pressure telemetry.

## Bounded wake proxy

The source body's air-relative velocity defines the wake axis. Without an
environment provider, the ground-relative velocity is used as an explicitly
weaker proxy and dynamic-pressure deltas are left unavailable. The wake is a
finite expanding cone:

```text
r_wake(x) = r_source + tan(theta) x
0 < x <= L_wake
L_wake = D_eq source * N_recovery
```

The target envelope is considered exposed when its lateral distance from that
axis is no greater than `r_wake + r_target`. Exposure is weighted linearly by
the remaining cone clearance and the downstream recovery distance. The reported
velocity-deficit proxy is:

```text
d = min(d_max, d_peak * exposure * (1 - x / L_wake))
```

When density and target air-relative speed are available, the corresponding
dynamic-pressure reduction proxy is:

```text
Delta q = q [1 - (1 - d)^2]
```

Defaults are an 8° half-angle, 30 source diameters of finite wake length, a
50% peak deficit, and a 70% hard cap. They are deliberately conservative
engineering-preview controls, not calibrated stage-separation coefficients.

## Why this is separate

NASA stage-separation wind-tunnel work treats proximity-flow interference
forces and moments as a dedicated test problem, rather than something inferred
from centre-of-mass clearance alone. FAA wake guidance likewise treats the
strength, duration, direction, and encounter geometry of a generating wake as
distinct risk inputs. RocketWorks therefore exposes the finite-cone overlap as
an explainable review flag while keeping the actual trajectory unchanged.

References:

- NASA, *Stage Separation Wind Tunnel Tests of a Generic Two-Stage-to-Orbit
  Launch Vehicle*, NTRS report 20030066311:
  https://ntrs.nasa.gov/search.jsp?R=20030066311
- NASA, *Space Shuttle Solid Rocket Motor Separation* (wake aerodynamic
  increments), NTRS report 20110014618:
  https://ntrs.nasa.gov/api/citations/20110014618/downloads/20110014618.pdf
- FAA, *Aircraft Wake Turbulence* overview and AC 90-23 guidance:
  https://www.faa.gov/about/office_org/headquarters_offices/avs/offices/afx/afs/afs400/afs410/aircraft-wake-turbulence

These references motivate the need for a separate proximity-flow evidence
lane; they do not validate this RocketWorks proxy for rockets or any specific
vehicle.

## Verification and limits

Regression fixtures cover directed in-wake exposure, lateral non-exposure,
dynamic-pressure proxy calculation, missing geometry, disabled analysis,
option bounds, and the no-provider boundary. Staged preview tests retain the
result and model provenance alongside existing kinematic envelope/contact
screens.

The engineering-report export mirrors the screen status, assessed and exposed
pair counts, peak proxy metrics, the highest-exposure directed pairs, model
identity, assumptions, and warnings. The report repeats the no-force-feedback
boundary so a portable artifact cannot make this analytical proxy look like a
flight-load or certification result.

This module does not model plume interaction, shock-shock interaction, viscous
wake roll-up, vortex persistence, body attitude, fin interference, unsteady
moments, structural response, contact, or range safety. CFD, wind-tunnel data,
measured flight data, or a calibrated stage-separation database are required
before using a result for design release or operations.
