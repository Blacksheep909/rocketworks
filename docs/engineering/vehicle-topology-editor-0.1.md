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
- per-stage motor assignment to a saved user-supplied record, with a global
  selection fallback;
- per-stage ignition delay, separation delay, and an explicit deterministic
  ignition-failure switch for the preview run.

The editor produces a validated `LocalVehicleTopology` document with schema `dev.kestrel-lab.local-vehicle-topology`, version 1. It is stored under `kestrel.project.arc54.vehicle-topology.v1` and is bounded to eight stages. IDs, optional motor assignments, stage order, parent references, attachment type, roles, repeat count, and radius are checked before persistence. Motor assignments are migration-by-default: older v1 records without `motorId` continue to use the global motor selection.

## Assembly mapping

The browser maps the topology into the existing original `createVehicleAssemblyModel` API. The core stage receives the editable ARC 54 components. Additional stages receive generated preview structural components scaled by role: booster, upper, or payload. Serial stages receive a topology-derived axial transform, and parallel stages use the assembly model's radial repeat transform. Assigned motor launch mass updates the analytical motor allowance; the resulting component instances, centre of gravity, total mass, inertia, and active-stage counts flow into the existing inspector and design summary.

The Flight view now exposes a staged 6-DOF preview that consumes the saved event
settings through the independent stage-flight adapter. A serial stage's ignition
delay is measured from the preceding stage burnout event; separation delay is
measured from that stage's own burnout. A forced ignition failure is applied as
an explicit time-zero event and remains visible in the stage phase diagnostics.
The preview still retains one vehicle body and does not silently model discarded
stage trajectories or separation clearance.

When a staged run is requested, the assigned motor's thrust curve and mass
properties feed that stage's independent propulsion model. A missing local
motor record falls back to the global selection and emits a visible warning in
the result; it is never silently treated as certified data.

## Safety and validation

Generated additional-stage geometry is a conceptual preview, not a structural
design, manufacturing drawing, or flight-ready configuration. Event controls are
deterministic inputs, not failure probabilities or certification data. The
topology modal and staged Flight card preserve model versions, event topology,
applicability warnings, and the retained-body/separation limitations.

## Clean-room boundary

The topology schema, validation rules, UI mapping, and generated preview geometry are original Kestrel Lab implementation. No OpenRocket source, UI, asset, database, or simulation engine is bundled or reused.
