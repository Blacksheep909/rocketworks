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

The reference is stored in a strict, bounded browser-local record keyed by the
active project and comparison kind. Reloading the project restores its vertical
and coupled/staged references independently; changing projects loads that
project's records instead. **Clear reference** removes the corresponding local
record, and deleting a project cleans up both records when browser storage is
available.

These records are deliberately separate from editable project checkpoints,
workspace backups, and share links. They are not cloud-synced, are not included
in portable project documents, and are not a validation or safety gate. A
browser quota or size-limit failure leaves the reference available for the
current session only. Vertical and coupled/staged references are independent,
so pinning one does not replace the other.

When a fresh staged result and a pinned staged reference are available, the
Artifact center offers a **Staged run comparison** CSV. It includes the
comparison model/version, validation status, current-minus-reference semantic,
both simulation fingerprints, metric rows, warnings, and assumptions. The
engineering Markdown report includes the same delta table when generated from
that fresh result.

The Artifact center also exports fresh vertical and staged results as the
versioned `rocketworks-simulation-review-export-0.1.0` JSON envelope. A verified
import can become a session-only comparison reference, including the source
project identity, timestamp, fingerprint, and result model status. It never
changes editable inputs, local checkpoints, or cloud state; the imported source
must be treated as a separate review artifact rather than evidence for the
current configuration.

## Local run library

The Flight workspace also exposes a device-local **Simulation run library**.
After a fresh vertical or staged preview, a user can save a short label and
retain the result in one of eight bounded slots for the active project. Each
record keeps the result, model status, timestamp, project identity, and
simulation fingerprint. The library is stored under its own versioned
browser-local key and is intentionally separate from editable project inputs,
checkpoints, workspace backups, and portable project JSON.

Selecting **Use as reference** loads the saved result into the corresponding
comparison table for the current session. It does not overwrite the pinned
reference record and does not alter the active design. Removing a catalog
entry only removes that entry; an already-loaded comparison remains available
until it is cleared or replaced. If browser storage is unavailable, the UI
keeps the catalog in memory and labels the result as session-only.

The catalog is a review convenience, not simulation evidence, validation,
certification, or flight-safety analysis. Use the portable simulation-review
JSON export when a named result must move between browser profiles or devices.

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
