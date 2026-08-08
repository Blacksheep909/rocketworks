# Launch environment model 0.1

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
- altitude-interpolated mean wind
- seeded, finite-band Dryden-shaped turbulence
- deterministic one-minus-cosine discrete gust events
- source, version, licence, attribution, observation time, and validation status

The same provider can be supplied to the preliminary 6DOF rocket-load and
recovery-load adapters. Supplying both this provider and their legacy launch
altitude or wind-profile inputs is rejected to avoid conflicting environments.

## Atmosphere adjustment

Without an observation, the existing Kestrel standard atmosphere is evaluated
at geometric ASL altitude. With station pressure `ps` and station temperature
`Ts`, version 0.1 preserves their offsets from standard conditions at the site:

```text
p(h) = pstd(h) ps / pstd(hs)
T(h) = Tstd(h) + Ts - Tstd(hs)
rho(h) = p(h) / (Rair T(h))
a(h) = sqrt(gamma Rair T(h))
```

Dynamic viscosity uses Sutherland's law. Relative humidity is retained as
metadata but is not yet coupled to density or speed of sound. The offset method
is a transparent engineering approximation, not a forecast or full
hypsometric profile reconstruction.

## Mean wind and turbulence

Mean east, north, and up wind components are linearly interpolated with AGL
altitude. Outside the supplied profile, the nearest endpoint is held.

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
- No humidity correction, vertical pressure-profile assimilation, or spatially
  varying temperature observation.
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
