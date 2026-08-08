# Provenance-first motor data 0.1

Status: engineering preview, unvalidated. This is an original Kestrel Lab implementation from public propulsion equations and published impulse-band definitions. It does not contain or depend on OpenRocket code, motor databases, simulation logic, UI, assets, or backend components.

## Purpose

The motor-data layer accepts user, manufacturer, test-lab, or synthetic thrust data only when the record carries explicit provenance. It derives performance metrics and local mass properties, supports strict CSV import/export, builds searchable in-memory libraries, and adapts one record into the existing impulse-depletion and multi-stage dynamics models.

Kestrel Lab does not ship a copied third-party motor database. Users or future appropriately licensed providers must supply records and retain their license/attribution terms.

## Required record

Every record declares:

- stable identifier, manufacturer, and designation
- case diameter and length in metres
- launch and post-burn dry mass in kilograms
- a thrust curve in seconds and newtons
- optional ejection delays
- optional propellant axial length/inset and dry CG
- source name and kind
- data version
- license identifier and attribution
- optional HTTP(S) source URL
- validation status

Compatible source/status combinations are checked. A synthetic source cannot claim certified-test status. Non-certified data carries an explicit verification warning.

## CSV format

Version 0.1 intentionally uses a small original interchange surface:

```text
time_s,thrust_n
0,0
0.05,18.2
1.70,0
```

Blank lines and lines beginning with `#` are ignored. The header is required. Every data row must contain exactly two unquoted decimal/scientific-notation numbers. Imports are limited to 2 MB and 10,000 curve points.

Curves must contain at least two strictly increasing non-negative time/thrust points, begin at exactly `0 s`, end at zero thrust, and integrate to positive impulse. These rules avoid ambiguous pre-ignition offsets, implicit post-burn thrust, duplicate times, and unbounded browser imports.

## Derived performance

Total impulse uses trapezoidal integration of the piecewise-linear curve:

`It = integral F(t) dt`

Average thrust is `It / tb`, where `tb` is the final curve time. Peak thrust is the largest supplied node. Declared propellant mass is wet minus dry mass. Calculated specific impulse is:

`Isp = It / (mp g0)`, with `g0 = 9.80665 m/s²`.

This Isp estimate is sensitive to residual propellant, ejection charge mass, case/hardware changes, thrust-test ambient conditions, and declared wet/dry mass quality.

## Impulse-class estimate

The classifier uses the published doubling bands: `1/8A` through `1/2A`, then `A` through `O`. The upper limits are 0.3125, 0.625, 1.25, 2.5, 5, 10 ... 40,960 N·s. Values above that are reported as `above-O`.

This label is a numerical band estimate only. It does not assert NAR, Tripoli, TRA, CAR, government, manufacturer, or any other certification or approval. Certification requires the relevant authority's accepted test data and current listing.

## Local mass properties

The local origin is the aft case/nozzle plane; `+X` points toward the rocket nose. Dry hardware and propellant each use a uniform solid-cylinder approximation:

`Ixx = 1/2 m r²`

`Iyy = Izz = 1/12 m (3r² + L²)`

The user may specify propellant axial length/inset and dry CG. The default places each distribution across the full case. This is a preliminary approximation: real grains, nozzles, closures, liners, retainers, and reload hardware require measured mass properties.

## Dynamics adapters

The impulse-mass adapter translates local dry/propellant CG and inertia to a supplied body-frame motor origin and preserves the record curve. The multi-stage adapter additionally supplies ignition delay, nozzle application point, and normalized thrust axis. Existing propulsion code then evaluates depletion, CG/inertia change, forces, moments, burnout, and staging.

## Browser preview

ARC 54 now constructs a synthetic motor record from its editable average thrust and burn-time inputs. Its impulse band, total impulse, peak thrust, and calculated Isp appear in the launch inspector. The source is visibly labelled synthetic and unvalidated; it is not presented as a real commercial motor.

## Verification

Regression tests cover performance metrics, every fractional/letter impulse boundary through O, CSV comments and round-trip, geometry/inertia, impulse-depletion integration, multi-stage integration, library search/filtering, provenance compatibility, parser limits, malformed rows, bad mass/geometry, and certification-safe warnings.

## Public references

- NASA Glenn, *Specific Impulse*, defining time-varying total impulse as `integral F dt` and specific impulse from propellant weight flow: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-impulse/
- National Association of Rocketry, *Rocket Motor Resources*, publishing fractional-A through O total-impulse bands and explaining that a class letter denotes a range rather than exact impulse: https://www.nar.org/RocketMotorResources
- National Association of Rocketry, *United States Model Rocket Sporting Code*, section 4.5, publishing model-motor classification bands and explaining certification acceptance: https://www.nar.org/wp-content/uploads/2017/06/USMRSC-July_-2017.pdf

## Known limitations

- No bundled commercial motor data is provided.
- The CSV format carries thrust nodes only; record metadata is supplied separately.
- Ambient test pressure, temperature, sample uncertainty, and curve covariance are not yet modeled.
- Ejection delays are catalog metadata and are not automatically wired to recovery events.
- Cylinder mass properties are preliminary approximations.
- Certified status is provenance metadata supplied by a trusted source; Kestrel Lab does not independently authenticate certification in version 0.1.
- Results are not flight-safety validation.
