# Local motor library 0.3

Status: implemented browser workflow; engineering preview.

## Scope

The motor library lets a project owner use the synthetic preview curve or add a user-supplied thrust curve. It intentionally does not ship a commercial motor database, scrape third-party catalogs, or imply a certification relationship.

## Import contract

The curve parser accepts UTF-8 text up to 2 MB. CSV imports use this exact
header:

```text
time_s,thrust_n
```

Rows contain exactly two decimal numbers in SI units. Comments beginning with `#` and blank lines are ignored. The curve must begin at `0 s`, end at `0 N`, remain valid under the shared thrust-curve validator, and contain no more than 10,000 points. Metadata requires stable identifier, manufacturer, designation, physical dimensions, launch/dry mass, and provenance fields.

The browser also accepts public RASP/ENG motor records. Its header uses
designation, diameter in millimetres, length in millimetres, delay values,
propellant mass in grams, total mass in grams, and manufacturer, followed by
time/thrust rows. Plugged motors use `P` for the delay field. A file may contain
one or multiple header blocks; every block is validated independently and
converted into the same SI motor record. For a batch, the typed identifier is
kept as the prefix and deterministic `-1`, `-2`, … suffixes are assigned. A
single record keeps the prefix unchanged. The browser can export each local
record again as `.eng`. Measured mass-flow history remains a single-record
attachment so it cannot be silently copied across motors. The parser never
bundles a third-party database.

The UI marks every imported record `user-supplied-unvalidated`. The record
keeps source name, data version, license or permission identifier, attribution,
and optional URL. The parser never upgrades that status based on appearance or
impulse class.

## Persistence

The device-local document is stored under `kestrel.project.arc54.motor-library.v1` with schema `dev.kestrel-lab.local-motor-library`, version 1, and a 24-record bound. Only the original input metadata and thrust curve are persisted. Derived impulse, Isp, inertia, warnings, and assumptions are rebuilt through `createMotorDataRecord` after restore. Duplicate IDs replace the prior local record only through an explicit upsert path.

## Flight integration

Selecting a record changes the thrust curve and motor mass allowance passed to the shared vertical-flight configuration. Its propellant mass remains subject to the vehicle launch-mass guard, and landing descent uses the same selected motor's propellant mass. The topology editor can additionally assign a saved user motor to each stage; unassigned stages inherit the global selection. Assigned launch mass updates the analytical stage mass allowance, while the staged 6DOF adapter uses the assigned thrust curve, dry/propellant mass properties, CG, and burn duration. The existing uncertainty, optimization, export, and report paths receive the selected global record through the same input object.

This is still a preliminary integration: imported motor geometry is represented through analytical dimensions and mass properties rather than a first-class CAD solid; stage assignment falls back to the global motor with an explicit warning when a local record is unavailable; and the topology UI exposes bounded stage-level cant rather than every grain or motor-mount placement parameter. The interface keeps that boundary visible and continues to label the result as unvalidated.

The RASP/ENG interchange contract is based on the public format description at
[ThrustCurve](https://www.thrustcurve.org/info/raspformat.html). RocketWorks'
parser is original and treats the supplied file as user data; this reference
does not grant a license to redistribute any motor file or database.

## Clean-room boundary

The storage document, parser wiring, UI, and mission-control visual treatment are original RocketWorks work. No OpenRocket source, UI code, asset, database, or engine is copied or bundled.
