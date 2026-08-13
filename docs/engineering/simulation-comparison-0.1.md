# Local flight-run comparison 0.1

Status: `engineering-preview-unvalidated`

The browser Flight workspace includes local reference-run comparisons. They
are original RocketWorks interaction layers around the vertical-flight and
coupled/staged preview results; they do not copy OpenRocket UI or simulation
code.

## Workflow

1. Run the current vertical estimate.
2. Choose **Pin current run** in the Flight workspace.
3. Change geometry, propulsion, recovery, or environment inputs.
4. Run the estimate again.
5. Read the reference/current/delta table and replace or clear the reference
   when the design decision changes.

The same workflow is available after a coupled or staged preview in **Staged
run comparison**. That table also reports trace-sample, event, and released-
body counts so changes in sampled topology remain visible alongside the main
flight metrics.

The reference is held in browser memory for the active workbench session. It
is intentionally not written into local project checkpoints or share links yet:
those documents preserve validated editable inputs and portable analysis data,
while an in-memory reference avoids silently growing their storage footprint.
Vertical and coupled/staged references are independent, so pinning one does
not replace the other.

When a fresh staged result and a pinned staged reference are available, the
Artifact center offers a **Staged run comparison** CSV. It includes the
comparison model/version, validation status, current-minus-reference semantic,
both simulation fingerprints, metric rows, warnings, and assumptions. The
engineering Markdown report includes the same delta table when generated from
that fresh result.

## Compared metrics

The vertical table reports deterministic differences for:

- apogee
- maximum speed
- maximum dynamic pressure
- time to apogee
- total flight time
- impact speed, when the vertical result includes one

The staged table reports:

- apogee, maximum speed, and time to apogee
- trace sample count and event count
- released-body count from the coupled preview result

The delta is `current − reference`, with SI units and a signed display. Null or
non-finite values remain `—` rather than being coerced to zero.

## Freshness and limits

The pin action is disabled until the current inputs have a matching vertical
result. After an input change, the panel labels the previous result as stale
and asks for a rerun; the displayed last-result values are never described as
the current design. This comparison is a design-review aid, not a validation,
reliability, flight-safety, or manufacturing claim. It compares the existing
vertical preview only; coupled 6DOF and uncertainty results retain their own
explicit model status and limits. The staged counts describe sampled outputs
and are not convergence evidence.

## Verification

Rendered-HTML regression checks assert both pin/replace/clear workflows, stale
guardrails, comparison components, and responsive table styling. The staged
comparison contract has direct regression tests for signed deltas and
non-finite-value handling. Numerical delta formatting reuses the same
finite-value conventions as the Flight trace inspector; the underlying
physics suites continue to validate the result objects independently.
