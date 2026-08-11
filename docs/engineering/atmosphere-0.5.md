# U.S. Standard Atmosphere layer model 0.5

Status: `engineering-preview-unvalidated`.

Implementation: `lib/physics/atmosphere.ts`

This is an original RocketWorks implementation of the hydrostatic, perfect-gas
layer equations published with the U.S. Standard Atmosphere, 1976. It contains
no OpenRocket source, engine, UI, assets, data, or backend content. A standard
profile is a reference environment, not a weather forecast or flight-safety
assessment.

## Supported domain

The provider accepts geometric altitudes from `-500 m` through the geometric
equivalent of `84.852 km` geopotential altitude (`85,999.9529 m` using the
RocketWorks geopotential radius). The implemented layer boundaries and lapse
rates are:

| Geopotential layer (km) | Base temperature (K) | Lapse rate (K/km) |
|---|---:|---:|
| 0–11 | 288.15 | -6.5 |
| 11–20 | 216.65 | 0.0 |
| 20–32 | 216.65 | +1.0 |
| 32–47 | 228.65 | +2.8 |
| 47–51 | 270.65 | 0.0 |
| 51–71 | 270.65 | -2.8 |
| 71–84.852 | 214.65 | -2.0 |

Layer pressures are propagated from the sea-level reference rather than copied
as independent constants, so adjacent boundaries remain continuous under the
same equations used for queries.

## Equations

Geometric altitude `z` is converted to geopotential altitude `h` with the
finite-radius relation:

```text
h = Re z / (Re + z)
```

For a non-zero lapse rate `L`, temperature and pressure in a layer are:

```text
T(h) = Tb + L (h - hb)
p(h) = pb [T(h) / Tb]^(-g0 / (R L))
```

For an isothermal layer, pressure is:

```text
p(h) = pb exp[-g0 (h - hb) / (R Tb)]
```

Density, sound speed, viscosity, and kinematic viscosity use the same bounded
dry-air relations as the earlier atmosphere implementation. Relative humidity
still applies the documented ideal-mixture virtual-temperature correction; it
does not add condensation, composition changes, or humidity-dependent
viscosity.

## Verification and limits

Regression tests anchor the 11, 20, 32, 47, 51, 71, and 84.852 km geopotential
boundaries against the published layer values, verify the geometric/geopotential
round trip, and reject requests outside the declared domain. These checks are
equation/regression evidence only. The model does not include latitude,
seasonal variability, solar activity, composition changes above the lower
atmosphere, terrain, live weather, or measured uncertainty.

Primary reference:

- NASA/NOAA/USAF, [U.S. Standard Atmosphere, 1976](https://ntrs.nasa.gov/citations/19770009539.pdf), including the hydrostatic model and layer definitions through 85 km.
