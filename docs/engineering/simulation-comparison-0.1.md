# Local flight-run comparison 0.1

Status: `engineering-preview-unvalidated`

The browser Flight workspace includes a local reference-run comparison. It is
an original RocketWorks interaction layer around the existing vertical-flight
result; it does not copy OpenRocket UI or simulation code.

## Workflow

1. Run the current vertical estimate.
2. Choose **Pin current run** in the Flight workspace.
3. Change geometry, propulsion, recovery, or environment inputs.
4. Run the estimate again.
5. Read the reference/current/delta table and replace or clear the reference
   when the design decision changes.

The reference is held in browser memory for the active workbench session. It
is intentionally not written into local project checkpoints or share links yet:
those documents preserve validated editable inputs and portable analysis data,
while an in-memory reference avoids silently growing their storage footprint.

## Compared metrics

The table reports deterministic differences for:

- apogee
- maximum speed
- maximum dynamic pressure
- time to apogee
- total flight time
- impact speed, when the vertical result includes one

The delta is `current − reference`, with SI units and a signed display. Null or
non-finite values remain `—` rather than being coerced to zero.

## Freshness and limits

The pin action is disabled until the current inputs have a matching vertical
result. After an input change, the panel labels the previous result as stale
and asks for a rerun; the displayed last-result values are never described as
the current design. This comparison is a design-review aid, not a validation,
reliability, flight-safety, or manufacturing claim. It compares the existing
vertical preview only; coupled 6DOF and uncertainty results retain their own
explicit status and comparison surfaces.

## Verification

Rendered-HTML regression checks assert the pin/replace/clear workflow, stale
guardrail, comparison component, and responsive table styling. The numerical
delta formatting reuses the same finite-value conventions as the Flight trace
inspector; the underlying physics suites continue to validate the result
objects independently.
