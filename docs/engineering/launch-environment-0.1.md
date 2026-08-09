# Launch environment model 0.2

Status: `engineering-preview-unvalidated`

Implementation: `lib/physics/launch-environment.ts`

This is an original clean-room implementation based on public atmosphere and
turbulence equations. It contains no OpenRocket code, engine, data, UI, or
assets. It is not a flight-weather product and must not be used as the sole
basis for launch-safety decisions.

## Scope

The model provides one deterministic environment state for a local
east-north-up position and time:

- WGS84 launch-site metadata and AGL/ASL altitude bookkeeping
- standard or surface-observation-adjusted pressure and temperature
- optional relative-humidity coupling to water-vapor pressure, virtual
  temperature, density, and speed of sound
- altitude-interpolated mean wind
- browser-preview azimuth control in the local ENU frame (0° east, +90°
  north), with deterministic rotation of every profile layer
- seeded, finite-band Dryden-shaped turbulence
- deterministic one-minus-cosine discrete gust events
- source, version, licence, attribution, observation time, and validation status

The same surface-observation anchor is also available to the fast vertical
flight adapter, so browser estimates can share pressure, temperature, and
humidity inputs with the coupled preview. The same provider can be supplied to the preliminary 6DOF rocket-load and
recovery-load adapters. Supplying both this provider and their legacy launch
altitude or wind-profile inputs is rejected to avoid conflicting environments.

## Atmosphere adjustment

Without an observation, the existing Kestrel standard atmosphere is evaluated
at geometric ASL altitude. With station pressure `ps` and station temperature
`Ts`, version 0.2 preserves their offsets from standard conditions at the site:

```text
p(h) = pstd(h) ps / pstd(hs)
T(h) = Tstd(h) + Ts - Tstd(hs)
rho(h) = p(h) / (Rair T(h))
a(h) = sqrt(gamma Rair T(h))
```

If relative humidity `RH` is supplied, the dry state is corrected with a
bounded ideal-mixture approximation. Saturation vapour pressure `es(T)` uses
the WMO Annex 4.B liquid-water/ice form, then:

```text
e = RH es(T)
w = epsilon e / (p - e)
Tv = T (1 + w / epsilon) / (1 + w)
rho = p / (Rair Tv)
a = sqrt(gamma_d Rair Tv)
```

Here `epsilon = Rair / Rv`. Relative humidity is held constant through the
altitude-adjusted profile. Dynamic viscosity still uses dry-air Sutherland's
law; condensation, precipitation, phase change, and humidity-dependent
viscosity are outside this model. The offset method is a transparent
engineering approximation, not a forecast or full hypsometric profile
reconstruction.

## Mean wind and turbulence

Mean east, north, and up wind components are linearly interpolated with AGL
altitude. Outside the supplied profile, the nearest endpoint is held.

The browser's synthetic profile is defined by scalar speed anchors at 0, 500,
and 2000 m AGL. Its configurable input azimuth rotates the horizontal profile
in the local ENU frame before the environment provider is built. Landing
dispersion adds a sampled direction offset on top of this base azimuth, while
the coupled 6DOF and vertical paths consume the same rotated provider. A
profile model version (`kestrel-preview-wind-profile-0.2.0`) is exposed in the
source and the input is persisted in local project snapshots; older snapshots
default to 0° for backward compatibility.

Turbulence is synthesized from logarithmically bounded spatial modes with
seeded phases. The longitudinal and transverse mode weights use the Dryden
spatial power spectral density shapes:

```text
Phi_u(Omega) = (2 sigma_u^2 Lu / pi) / (1 + (Lu Omega)^2)
Phi_v(Omega) = (sigma_v^2 Lv / pi)
               (1 + 3(Lv Omega)^2) / (1 + (Lv Omega)^2)^2
```

Discrete mode amplitudes are normalized so their represented theoretical RMS
equals the configured component RMS over the selected wavelength band. Taylor's
frozen-field approximation advects the field along the local horizontal mean
wind. A minimum advection speed prevents a zero-wind field from becoming
time-invariant.

This is deliberately described as *Dryden-shaped*. It is not an exact
continuous Dryden filter, a measured gust record, or a terrain-aware boundary
layer. Replaying the same seed, position, and time returns bitwise-identical
wind components.

## Discrete gusts

A gust has a start time, duration, peak ENU wind delta, and optional AGL range.
Inside that range its envelope is:

```text
G(t) = 0.5 [1 - cos(2 pi (t - t0) / duration)]
```

It is zero at both endpoints and reaches the configured peak halfway through.
Overlapping gust vectors are summed and every active gust identifier is exposed
in diagnostics.

## Verification

Automated tests cover:

- standard-atmosphere and observed surface anchors
- mean-wind interpolation
- synthetic-profile azimuth rotation and direction-offset composition
- gust endpoints, peak, altitude gating, and identifiers
- seeded repeatability and seed sensitivity
- frozen-field translation invariance
- configured RMS recovery over 20,000 spatial samples
- zero-intensity exactness and invalid-input rejection
- atmosphere/wind/gust integration into rocket and recovery loads

These are analytical and numerical component checks, not validation against
flight tests, wind-tunnel data, radiosonde data, or independent simulation
software.

## Known limitations

- Local flat-earth ENU coordinates; latitude, longitude, and WGS84 datum are
  metadata only.
- No terrain, buildings, surface roughness, stability class, shear law,
  atmospheric fronts, precipitation, icing, or convective cells.
- No live weather download, authentication, station-age policy, or forecast
  uncertainty.
- No condensation, precipitation, phase change, vertical moisture assimilation,
  or spatially varying temperature/humidity observation.
- Finite wavelength band and finite mode count; turbulence is stationary and
  advected only along the local mean horizontal wind.
- No rotational turbulence or gust-gradient aerodynamic model.

## Primary public references

- NASA, *Verifying Implementation of Dryden Turbulence Model*, 2019:
  https://ntrs.nasa.gov/api/citations/20190000875/downloads/20190000875.pdf
- NASA CR-165631, *Dryden Wind Turbulence Model for Flight Simulator*, 1981:
  https://ntrs.nasa.gov/api/citations/19840020734/downloads/19840020734.pdf
- NOAA MADIS, *Meteorological Calculations and Pressure Reduction Notes*:
  https://madis.ncep.noaa.gov/madis_rwis_qc_notes.shtml
- World Meteorological Organization, *Guide to Instruments and Methods of
  Observation*, Annex 4.B water-vapour pressure formulation:
  https://www.weather.gov/media/epz/mesonet/CWOP-WMO8.pdf
- UCAR/NCAR, *Water Vapor Pressure Formulations*:
  https://www.eol.ucar.edu/data-software/conventions-and-standards/water-vapor-pressure-formulations
