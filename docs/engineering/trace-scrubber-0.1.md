# Accessible trace scrubbing 0.1

Status: `presentation-layer engineering preview`.

RocketWorks flight charts keep the pointer interaction for fast visual
inspection and add a synchronized range control for precise sample selection.
The vertical and staged trace inspectors each expose a one-based sample
position over the current numerical trace. Arrow keys, Home, End, touch, and
pointer dragging all update the same selected sample that draws the chart
crosshair and numerical readout.

The range control is a view affordance only. It never changes vehicle inputs,
simulation fingerprints, model versions, or engineering results, and it does
not trigger a rerun. A newly selected metric or a pointer leaving the canvas
clears the visual selection; the range remains available at the first sample
until the user selects another point.

The selected value is reported with time and the active metric unit through an
adjacent output and an explicit `aria-valuetext`. Canvas rendering remains a
visual enhancement; the chart's existing screen-reader summary, event count,
model-boundary copy, and stale-result guardrails remain authoritative.

Detected vertical and staged event rows are buttons. Activating one selects
its event time in the corresponding trace scrubber, so rail release, burnout,
staging, failure, and recovery transitions can be inspected without relying
on pixel-precise pointer placement. The selected event is a view state and is
cleared when a new result is generated or the engineering inputs change.

This interaction does not make the underlying trace validated, flight-safe,
or suitable for range decisions. It only makes the declared analytical
preview easier to inspect with keyboard, touch, and pointer workflows.
