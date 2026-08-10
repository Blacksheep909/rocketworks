# Three-dimensional design preview 0.5

Status: `display-only-unvalidated`

Implementations:

- `lib/visualization/rocket-preview-3d.ts`
- `app/rocket-3d-viewport.tsx`

This is an original RocketWorks canvas renderer. It does not contain or derive
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
- enabled serial stages and repeated radial booster instances from the saved
  vehicle topology
- expanded axisymmetric, fin-set, and point-mass component instances from the
  validated assembly graph, with component identity retained for selection

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

Version 0.5 renders those triangles through an original perspective projection,
depth-sort painter, and directional intensity calculation. It expands each
enabled topology stage into a display instance with its validated axial
translation, radial offset, scale, and repeated-instance rotation. The browser
now supplies the renderer with every expanded assembly component instance;
axisymmetric profiles, fin sets, and point masses are tessellated independently
and transformed by the assembly placement. Stage and component identity are
carried as display metadata only, allowing the viewport to group repeated
instances, hide/show a stage without changing the engineering model, and report
the selected stage/component when a projected surface is clicked. It uses the
Canvas 2D API rather than a third-party 3D or CAD library.

## Interaction and accessibility

- Pointer or touch drag orbits the model.
- Clicking a rendered nose, body, fin, or nozzle surface selects its matching
  inspector component; the selected surface receives a bright outline.
- Disabled topology stages are omitted from the display mesh, so the design view
  follows the active assembly configuration.
- Stage visibility controls group repeated instances by stage and always keep
  one stage visible, so isolating a booster or payload cannot produce an empty
  or invalid display mesh.
- Clicking a stage-aware triangle retains both the surface component and stage
  identity; the browser viewport highlights that stage and can notify the
  surrounding inspector.
- Component-aware triangles select the corresponding nose, airframe, fin,
  motor, or recovery inspector entry. Point masses are display markers only;
  they are not rendered as structural solids.
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
- serial and radial stage-instance expansion, transforms, bounds, and surface
  filtering
- stage metadata propagation, repeated-instance grouping, visibility fallback,
  and stage-aware projected picking
- expanded assembly component rendering for axisymmetric profiles, fin sets,
  and point-mass markers, including transformed bounds and component-aware
  picking
- invalid geometry, camera, and viewport rejection
- UI presence, pointer/touch controls, keyboard controls, accessible label, and
  surface selection, and explicit display-only qualification

These tests validate display behavior only. They are not evidence of CAD
accuracy, aerodynamic fidelity, manufacturability, structural adequacy, or
flight safety.

## Known limitations

- The preview now maps expanded component instances supplied by the browser's
  assembly graph, but arbitrary custom group visual primitives and nested CAD
  solids still need dedicated display schemas.
- No internal transparent solids, section cuts, exploded views, stage separation
  animation, or material texture; point-mass markers are intentionally abstract.
- Painter-style triangle sorting can produce minor overlap artifacts for future
  deeply nested or transparent geometry.
- Surface picking is a projected-triangle hit test, not a full 3D ray or CAD
  selection system. There is no clipping plane, GPU acceleration, or
  level-of-detail system.
- This is not a boundary-representation solid, watertight CAD model, drawing,
  toolpath, mesh export, or manufacturing artifact.
- CG and CP labels are projected annotations; their screen placement is not a
  dimensional measurement.

The next geometry increment should add dedicated custom-group display schemas,
section/exploded views, and a reusable scene graph for CAD-friendly exports
without treating the render mesh itself as authoritative engineering geometry.
