# Vehicle topology editor 0.1

Status: implemented browser assembly workflow; engineering preview.

## Scope

Kestrel Lab now exposes a local topology editor for:

- one required core sustainer;
- serial upper stages;
- serial payload bays;
- parallel booster stages;
- equal radial repetition of a stage up to eight instances;
- parent-stage selection, enable/disable state, and editable names.

The editor produces a validated `LocalVehicleTopology` document with schema `dev.kestrel-lab.local-vehicle-topology`, version 1. It is stored under `kestrel.project.arc54.vehicle-topology.v1` and is bounded to eight stages. IDs, stage order, parent references, attachment type, roles, repeat count, and radius are checked before persistence.

## Assembly mapping

The browser maps the topology into the existing original `createVehicleAssemblyModel` API. The core stage receives the editable ARC 54 components. Additional stages receive generated preview structural components scaled by role: booster, upper, or payload. Parallel stages use the assembly model's radial repeat transform; the resulting component instances, centre of gravity, total mass, inertia, and active-stage counts flow into the existing inspector and design summary.

This is intentionally a topology-first increment. The current flight panel still presents a single-stage vertical preview, and the exact stage-separation/ignition event schedule is not silently inferred from the editor. The independent multi-stage event solver remains the integration boundary for the next flight workflow increment.

## Safety and validation

Generated additional-stage geometry is a conceptual preview, not a structural design, manufacturing drawing, or flight-ready configuration. The editor preserves the model-version and validation-status surfaces, and the topology modal explicitly states that exact staging events are not yet wired into the browser preview.

## Clean-room boundary

The topology schema, validation rules, UI mapping, and generated preview geometry are original Kestrel Lab implementation. No OpenRocket source, UI, asset, database, or simulation engine is bundled or reused.
