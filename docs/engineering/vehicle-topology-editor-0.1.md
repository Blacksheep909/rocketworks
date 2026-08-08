# Vehicle topology editor 0.1

Status: implemented browser assembly workflow; engineering preview.

## Scope

Kestrel Lab now exposes a local topology editor for:

- one required core sustainer;
- serial upper stages;
- serial payload bays;
- parallel booster stages;
- equal radial repetition of a stage up to eight instances;
- parent-stage selection, enable/disable state, and editable names;
- per-stage ignition delay, separation delay, and an explicit deterministic
  ignition-failure switch for the preview run.

The editor produces a validated `LocalVehicleTopology` document with schema `dev.kestrel-lab.local-vehicle-topology`, version 1. It is stored under `kestrel.project.arc54.vehicle-topology.v1` and is bounded to eight stages. IDs, stage order, parent references, attachment type, roles, repeat count, and radius are checked before persistence.

## Assembly mapping

The browser maps the topology into the existing original `createVehicleAssemblyModel` API. The core stage receives the editable ARC 54 components. Additional stages receive generated preview structural components scaled by role: booster, upper, or payload. Parallel stages use the assembly model's radial repeat transform; the resulting component instances, centre of gravity, total mass, inertia, and active-stage counts flow into the existing inspector and design summary.

The Flight view now exposes a staged 6-DOF preview that consumes the saved event
settings through the independent stage-flight adapter. A serial stage's ignition
delay is measured from the preceding stage burnout event; separation delay is
measured from that stage's own burnout. A forced ignition failure is applied as
an explicit time-zero event and remains visible in the stage phase diagnostics.
The preview still retains one vehicle body and does not silently model discarded
stage trajectories or separation clearance.

## Safety and validation

Generated additional-stage geometry is a conceptual preview, not a structural
design, manufacturing drawing, or flight-ready configuration. Event controls are
deterministic inputs, not failure probabilities or certification data. The
topology modal and staged Flight card preserve model versions, event topology,
applicability warnings, and the retained-body/separation limitations.

## Clean-room boundary

The topology schema, validation rules, UI mapping, and generated preview geometry are original Kestrel Lab implementation. No OpenRocket source, UI, asset, database, or simulation engine is bundled or reused.
