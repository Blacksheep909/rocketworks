# Local motor library 0.1

Status: implemented browser workflow; engineering preview.

## Scope

The motor library lets a project owner use the synthetic preview curve or add a user-supplied thrust curve. It intentionally does not ship a commercial motor database, scrape third-party catalogs, or imply a certification relationship.

## Import contract

The curve parser accepts UTF-8 text up to 2 MB with this exact header:

```text
time_s,thrust_n
```

Rows contain exactly two decimal numbers in SI units. Comments beginning with `#` and blank lines are ignored. The curve must begin at `0 s`, end at `0 N`, remain valid under the shared thrust-curve validator, and contain no more than 10,000 points. Metadata requires stable identifier, manufacturer, designation, physical dimensions, launch/dry mass, and provenance fields.

The UI marks every imported record `user-supplied-unvalidated`. The record keeps source name, data version, license or permission identifier, attribution, and optional URL. The parser never upgrades that status based on appearance or impulse class.

## Persistence

The device-local document is stored under `kestrel.project.arc54.motor-library.v1` with schema `dev.kestrel-lab.local-motor-library`, version 1, and a 24-record bound. Only the original input metadata and thrust curve are persisted. Derived impulse, Isp, inertia, warnings, and assumptions are rebuilt through `createMotorDataRecord` after restore. Duplicate IDs replace the prior local record only through an explicit upsert path.

## Flight integration

Selecting a record changes the thrust curve passed to the shared vertical-flight configuration. The selected record's launch-mass delta is applied relative to the synthetic 0.16 kg motor baseline, and its propellant mass remains subject to the vehicle launch-mass guard. Landing descent uses the same selected motor's propellant mass. The existing uncertainty, optimization, export, and report paths receive the selected record through the same input object.

This is still a preliminary integration: the editable assembly graph does not yet place arbitrary imported motor geometry as a first-class component, and the 6DOF/clustered-propulsion UI does not yet expose every motor placement parameter. The interface keeps that boundary visible and continues to label the result as unvalidated.

## Clean-room boundary

The storage document, parser wiring, UI, and mission-control visual treatment are original Kestrel Lab work. No OpenRocket source, UI code, asset, database, or engine is copied or bundled.
