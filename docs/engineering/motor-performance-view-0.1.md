# Motor performance view 0.1

Status: `engineering-preview-unvalidated`

Implementation: `app/page.tsx` (`MotorThrustCurveChart`)

The browser motor library now presents the selected record's thrust curve before
it is used by a flight estimate. This is an original SVG inspection surface for
user-supplied or synthetic data. It is not a motor certification report and does
not infer missing test conditions.

## What is shown

The chart uses the validated `MotorDataRecord.thrustCurve` knots and the record's
derived metrics:

- total impulse from trapezoidal integration;
- peak thrust and its curve time;
- burn duration; and
- specific impulse from declared launch and dry mass difference.

The line between curve knots is the same linear interpolation used by the
preview adapter. The shaded area is a visual aid only. The chart does not alter
the curve, smooth samples, infer a pressure correction, or estimate a motor
from a designation.

## Provenance boundary

The view carries the record source name, license or permission identifier, and
validation status. Only a source explicitly marked `certified-test-data` receives
the source-labeled presentation; that label is preserved as user metadata and
is not upgraded by RocketWorks. Other records show `REVIEW REQUIRED`.

Measured propellant mass-flow histories remain explicitly separate from thrust.
When present, the chart says so without plotting a second axis that could be
mistaken for a thrust measurement. The mass-flow history remains available to
the depletion model and its own export path.

## Validation boundary

Motor records are already validated for finite, ordered curve knots, positive
impulse, endpoint semantics, declared mass geometry, provenance, and optional
mass-flow history. The chart regression checks the rendered affordance and its
status language; motor-data tests cover the underlying integration and parser.
Independent confirmation of motor identity, test conditions, calibration,
pressure correction, structural retention, and operational limits remains
required before any real-world use.
