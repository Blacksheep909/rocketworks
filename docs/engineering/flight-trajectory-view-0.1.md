# Interactive flight trajectory view 0.1

Status: `display-projection-only`.

The Flight workspace includes an original canvas view of the already-produced
world-frame coupled trace. It is a visualization surface, not another flight
solver. The view can show the retained vehicle and any released-body tracks
returned by the shared-grid branch, with rail, staging, ignition, failure, and
recovery events attached to the nearest retained-trace sample.

## Coordinate and projection convention

Engineering states use the local ENU world frame:

- `x` is east;
- `y` is north;
- `z` is up relative to the launch point.

For camera yaw `ψ` and pitch `θ`, the display first rotates a world position
`r = (x, y, z)` into a lateral/view-aligned frame:

```text
l = x cos(ψ) - y sin(ψ)
d = x sin(ψ) + y cos(ψ)
v = z cos(θ) - d sin(θ)
```

`l` and `v` are fitted into the canvas with a uniform scale. The remaining
camera-depth coordinate is retained for diagnostics and future depth-aware
rendering. Zoom changes only this display scale; it never changes the stored
trace positions.

## Interaction and accessibility

- Pointer drag and arrow keys orbit yaw/pitch.
- Wheel, `+`, and `−` change display zoom; `0` restores the authored fit view.
- Clicking within the retained path selects its nearest numerical sample.
- The range scrubber selects a sample by index and shares its time with the
  staged metric chart and event rows.
- Play/pause advances the shared selected time at a bounded selectable rate
  (0.25x through 4x) and stops exactly at the final retained sample. This is a
  requestAnimationFrame display loop backed by a pure bounded step helper; it
  never reruns, extrapolates, or mutates the engineering solver.
- Keyboard focus, a descriptive canvas label, visible controls, and a live
  selected-time readout keep the view usable without pointer input.
- Reduced-motion preferences remain respected because the view does not use a
  continuous animation loop.

## Validation boundary

The projection validates finite, ordered trace times and finite positions,
then reports model version `rocketworks-flight-trajectory-view-0.1.0` with
status `display-projection-only`. It does not interpolate or modify engineering
states, infer missing released-body paths, or add aerodynamic, gravity,
contact, collision, range-safety, or flight-validation evidence. Event markers
are nearest-sample annotations, so their screen location is a display aid
rather than a new event-state reconstruction.

The view intentionally remains separate from the RocketWorks mass, loads,
rail, recovery, and six-degree-of-freedom models. Any future animation or
attitude glyphs must continue to consume versioned output traces and preserve
the same provenance and limitation language.
