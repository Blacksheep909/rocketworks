# Recovery descent and landing footprint 0.2

Status: `engineering-preview-unvalidated`.

The landing-footprint composition version is
`kestrel-landing-footprint-0.2.0`; the underlying recovery-descent point-mass
model remains independently versioned. The uncertainty sampler is
`kestrel-uncertainty-0.2.0` and now supports Bernoulli outcomes alongside its
continuous distributions.

Implementations:

- `lib/physics/landing-zone.ts`
- `app/landing-footprint-chart.tsx`

This is an original clean-room Kestrel Lab implementation based on public
point-mass dynamics, drag equations, WGS84 parameters, and statistical methods.
It contains no OpenRocket source, simulation engine, UI code, assets, database,
or backend components.

## Recovery-phase dynamics

Version 0.1 begins at a supplied apogee state and integrates a three-degree-of-
freedom point mass in local east-north-up coordinates. For mass `m`, inertial
velocity `v`, supplied wind `w`, density `rho`, and effective drag area `CdA`:

```text
vrel = v - w
Fdrag = -0.5 rho CdA |vrel| vrel
dr/dt = v
dv/dt = Fdrag / m + [0, 0, -g(hASL)]
```

The atmosphere, mean wind, deterministic Dryden-shaped turbulence, and discrete
gusts all come from the versioned launch-environment provider. Gravity varies
with ASL altitude. A fourth-order Runge–Kutta method advances position and
velocity; impact is linearly interpolated across the final step to the flat
`z = 0` AGL plane.

Ballistic body drag remains active throughout descent. When recovery is
configured, canopy drag area is added using the declared deployment delay and a
smoothstep inflation ramp:

```text
s(u) = u^2 (3 - 2u),  0 <= u <= 1
CdAeffective = CdAbody + s(u) CdAcanopy
```

This is substantially simpler than a canopy-riser-payload model. It does not
model line forces, relative canopy motion, pendulum dynamics, opening shock,
reefing stages, apparent mass, wake interaction, or fluid-structure coupling.

## Seeded dispersion

The browser uses 24 independent Latin-hypercube scenarios with the fixed seed
`arc54-landing-v1`. Current preview distributions cover:

- mean-wind magnitude
- wind-direction offset
- turbulence intensity
- descent mass
- canopy drag area when recovery is enabled
- deployment-delay offset when recovery is enabled
- recovery deployment outcome when recovery is enabled, using an explicit
  Bernoulli success assumption

Each scenario receives its own deterministic turbulence seed. Failed descent
evaluations remain visible in uncertainty diagnostics and are excluded from
footprint geometry. These distributions are engineering assumptions, not values
inferred from weather observations or recovery tests.

The recovery deployment outcome is encoded as `1 = deployment succeeds` and
`0 = deployment fails`. A failed outcome does not disappear from the sample: it
continues through the same point-mass descent with body drag and no canopy drag,
so the landing footprint, impact-speed distribution, and observed success rate
remain inspectable together. The browser reports the sampled success/failure
counts and a Wilson 95% interval; the configured success probability is an
assumption, not a reliability claim about hardware.

## WGS84 conversion

The footprint is integrated in a local ENU tangent plane. Small local offsets
are converted to approximate WGS84 geodetic coordinates using the WGS84
semi-major axis `a = 6378137 m`, inverse flattening `1/f = 298.257223563`, and
the meridian and prime-vertical radii of curvature at the launch latitude:

```text
e^2 = f (2 - f)
N = a / sqrt(1 - e^2 sin^2(phi))
M = a (1 - e^2) / (1 - e^2 sin^2(phi))^(3/2)
dphi = north / (M + h)
dlambda = east / ((N + h) cos(phi))
```

This approximation is limited to horizontal offsets of 100 km and latitudes
away from the poles. It is not a surveyed geodetic solution, terrain
intersection, or legal range boundary.

## Footprint statistics

The result exposes every impact sample, sample mean, unbiased covariance,
convex hull, radial-distance quantiles, impact-speed quantiles, and covariance
ellipses at 50%, 90%, and 95% probability levels.

For an approximately bivariate-normal impact distribution, the ellipse scale
at probability `p` is:

```text
k(p) = sqrt(-2 ln(1 - p))
```

Semi-axis lengths are `k sqrt(lambdaMajor)` and `k sqrt(lambdaMinor)`, where the
`lambda` values are eigenvalues of the two-dimensional sample covariance.

Covariance ellipses can be misleading for skewed, multimodal, clipped, or
failure-heavy distributions. The convex hull is shown alongside them so the
actual finite sample support remains visible.

## Browser presentation

The original canvas plot includes:

- every scenario impact
- launch-point crosshair
- mean-impact marker
- sample convex hull
- 50/90/95% covariance ellipses
- local ENU grid and north arrow
- mean WGS84 coordinate
- P50/P95 radial distance and impact speed
- failed-scenario count, seed, model scope, and limitations

No map tiles or third-party cartographic assets are used in version 0.1.

## Verification

Automated tests cover:

- near-vacuum free fall against the constant-gravity analytical solution
- steady-canopy terminal speed against the drag-weight relation
- wind-relative downwind drift
- deployment delay and smooth inflation phases
- WGS84 curvature conversion at the equator
- exact mean, covariance, ellipse ratio, hull, and quantiles for a symmetric
  footprint fixture
- seeded dispersion replay and sensitivity output
- deterministic deployment-success/failure branching and Wilson interval
- invalid state, integration, geodesy, and footprint rejection
- browser footprint, accessible canvas description, metrics, and safety copy

These are analytical and numerical component checks. They are not validation
against flight-test trajectories, radiosonde histories, surveyed impact points,
independent range-safety software, or certified parachute data.

## Known limitations

- Recovery phase begins at zero horizontal displacement and velocity at apogee;
  ascent and coast drift are omitted from the browser footprint.
- Flat ground; no terrain elevation, obstacles, exclusion zones, coastline,
  water drift, or recovery-team routing.
- Point mass only; no 6DOF attitude, tumbling, canopy-payload geometry, or
  tether dynamics.
- Constant user/model ballistic and canopy drag coefficients.
- Deployment reliability is represented by an independent Bernoulli branch; no
  hardware-derived reliability data, conditional dependencies, or partial
  deployment states are modeled.
- Independent scenario inputs; correlations and time-varying forecast error are
  not modeled.
- The local geodetic approximation is not suitable for large ranges or polar
  sites.

Do not use this footprint as a launch corridor, public-safety boundary, waiver
analysis, or go/no-go weather decision.

## Primary public references

- National Geospatial-Intelligence Agency, *The American Practical Navigator*,
  WGS84 defining parameters:
  https://msi.nga.mil/api/publications/download?key=16693975%2FSFH00000%2FBowditch_Vol_1_LoRes.pdf&type=view
- NASA CR-120326, *Parachute Dynamics and Stability Analysis*, 1974:
  https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19740022320.pdf
- NASA NESC-RP-15-01037, *Orion Parachute System Model*, point-mass parachute
  translational dynamics and wind-relative frames:
  https://ntrs.nasa.gov/api/citations/20190032136/downloads/20190032136.pdf
