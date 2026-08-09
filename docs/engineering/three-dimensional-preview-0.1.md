# Three-dimensional design preview 0.2

Status: `display-only-unvalidated`

Implementations:

- `lib/visualization/rocket-preview-3d.ts`
- `app/rocket-3d-viewport.tsx`

This is an original Kestrel Lab canvas renderer. It does not contain or derive
from OpenRocket UI code, assets, rendering code, geometry code, or backend
components.

## Purpose and separation from engineering models

The three-dimensional preview gives immediate spatial feedback while editing a
vehicle. It currently visualizes:

- an editable ogive, conical, or elliptical display nose
- cylindrical airframe
- telemetry-blue body band
- the current fin count and editable trapezoidal planform
- rear closure and motor nozzle
- live center-of-gravity and center-of-pressure markers

The preview mesh is deliberately separate from the versioned mass-property,
static-aerodynamic, assembly, and flight models. It consumes their current
dimensions and CG/CP results, but canvas triangles are never fed back into an
engineering calculation. This prevents display tessellation from becoming an
undocumented source of mass or aerodynamic behavior.

## Geometry

For nose length `L`, base radius `R`, and axial distance `x` from the tip, the
tangent-ogive display radius is:

```text
rho = (R^2 + L^2) / (2 R)
y(x) = sqrt(rho^2 - (L - x)^2) + R - rho
```

The surface is discretized into axial rings and 28 circumferential segments.
The body uses triangulated cylindrical sections. Each fin is constructed as a
thin closed trapezoidal prism oriented evenly around the body axis. The nozzle
is a tapered cylindrical display surface.

Version 0.2 renders those triangles through an original perspective projection,
depth-sort painter, and directional intensity calculation. It uses the Canvas
2D API rather than a third-party 3D or CAD library.

## Interaction and accessibility

- Pointer or touch drag orbits the model.
- Clicking a rendered nose, body, fin, or nozzle surface selects its matching
  inspector component; the selected surface receives a bright outline.
- Mouse-wheel zoom and dedicated buttons adjust scale.
- Arrow keys orbit; plus and minus zoom; zero resets the view.
- The canvas is keyboard focusable and has a descriptive accessible label.
- Focus-visible styling makes keyboard location explicit.
- The 2D/3D mode switch remains a normal labelled button group.
- Rendering has no continuous animation, so reduced-motion users are not
  exposed to automatic camera movement.

## Verification

Automated tests cover:

- exact tangent-ogive tip and base endpoints
- distinct conical and elliptical nose profiles
- monotonic profile radius
- required display surfaces and finite vertices
- geometric extents
- radial balance of the three-fin mesh
- finite perspective coordinates and depth ordering
- linear zoom response
- foremost-triangle surface picking and empty-space misses
- invalid geometry, camera, and viewport rejection
- UI presence, pointer/touch controls, keyboard controls, accessible label, and
  surface selection, and explicit display-only qualification

These tests validate display behavior only. They are not evidence of CAD
accuracy, aerodynamic fidelity, manufacturability, structural adequacy, or
flight safety.

## Known limitations

- The preview currently maps the browser's single-stage ARC 54 dimensions and
  current component geometry, not
  every node in the general assembly graph.
- Stage visibility and expanded assembly-instance rendering are not yet
  implemented.
- No internal components, transparency, section cuts, exploded views, stage
  separation animation, or material texture.
- Painter-style triangle sorting can produce minor overlap artifacts for future
  deeply nested or transparent geometry.
- Surface picking is a projected-triangle hit test, not a full 3D ray or CAD
  selection system. There is no clipping plane, GPU acceleration, or
  level-of-detail system.
- This is not a boundary-representation solid, watertight CAD model, drawing,
  toolpath, mesh export, or manufacturing artifact.
- CG and CP labels are projected annotations; their screen placement is not a
  dimensional measurement.

The next geometry increment should generate the preview from every expanded
assembly instance, add stage visibility, and reuse that same original scene
graph for CAD-friendly exports without treating the render mesh itself as
authoritative engineering geometry.
