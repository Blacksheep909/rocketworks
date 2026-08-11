# Vehicle topology editor 0.1

Status: implemented browser assembly workflow; engineering preview.

## Scope

RocketWorks now exposes a local topology editor for:

- one required core sustainer;
- serial upper stages;
- serial payload bays;
- parallel booster stages;
- equal radial repetition of a stage up to eight instances;
- parent-stage selection, enable/disable state, and editable names;
- per-stage motor assignment to a saved user-supplied record, with a global
  selection fallback;
- per-stage aerodynamic-table assignment to a saved coefficient surface, with
  a global selection fallback;
- optional per-stage body length, outer diameter, and nose length overrides for
  generated upper-stage, booster, and payload preview geometry, with role-based
  proportions as the migration-safe default;
- per-stage ignition delay, separation delay, and an explicit deterministic
  ignition-failure switch for the preview run.
- bounded retained-body axial separation delta-v up to 30 m/s in the body-frame
  +X (nose) direction; zero remains the conservative default.
- per-motor failure selection for repeated radial instances, entered as a
  one-based comma-separated list and stored as validated zero-based indices.
- bounded per-stage motor cant up to 15 degrees, with an azimuth that rotates
  with repeated radial instances so outward/inward thrust alignment remains
  inspectable.
- paired range and exact-number controls for stage geometry, repetition,
  motor cant, ignition/separation timing, separation delta-v, and detached
  recovery settings; both inputs write the same validated topology field.

The editor produces a validated `LocalVehicleTopology` document with schema `dev.kestrel-lab.local-vehicle-topology`, version 1. It is stored under `kestrel.project.arc54.vehicle-topology.v1` and is bounded to eight stages. IDs, optional motor and aerodynamic-table assignments, stage order, parent references, attachment type, roles, repeat count, radius, bounded geometry overrides, cant angles, separation delta-v, and per-motor failure indices are checked before persistence. Motor, aerodynamic-table, geometry, cant, failure, and separation-delta-v assignments are migration-by-default: older v1 records without an optional field continue to use the global selection, role-based geometry, axial thrust, all-motors-available, or zero-delta-v default.

The range controls are an interaction layer only. Their minimums, maximums,
and steps mirror the topology validator's bounded values, while the adjacent
number input preserves precise edits and allows an empty optional geometry
override to return to its role-based default. Changing either control marks
the same topology snapshot stale and does not bypass validation.

## Assembly mapping

The browser maps the topology into the existing original `createVehicleAssemblyModel` API. The core stage receives the editable ARC 54 components. Additional stages receive generated preview structural components scaled by role: booster, upper, or payload. Serial stages receive a topology-derived axial transform based on the selected stage envelope, and parallel stages use the assembly model's radial repeat transform. A geometry override changes the generated body, nose, fin scaling, stage placement, envelope radius, mass properties, and aerodynamic reference area together; it does not create a CAD solid or certify structural joints. Assigned motor launch mass updates the analytical motor allowance; the resulting component instances, centre of gravity, total mass, inertia, and active-stage counts flow into the existing inspector and design summary.

The Flight view now exposes a staged 6-DOF preview that consumes the saved event
settings through the independent stage-flight adapter. A serial stage's ignition
delay is measured from the preceding stage burnout event; separation delay is
measured from that stage's own burnout. A forced stage ignition failure is
applied as an explicit time-zero event and remains visible in the stage phase
diagnostics. A failed motor instance is represented inside the independent
propulsion model: it stays attached with its dry and full propellant mass,
contributes no thrust or depletion, and does not extend the stage burnout
clock. The preview emits a warning so a cluster imbalance is never hidden in
the aggregate thrust number.
The preview still retains one vehicle body and does not silently model discarded
stage trajectories or separation clearance.

When configured, separation delta-v is applied instantaneously to the retained
body in its current body-frame +X direction and is included in the staged event
label. This is a bounded analytical input rather than a measured pyrotechnic
impulse; the detached-body preview derives the equal-and-opposite linear
momentum delta-v from the retained-to-detached mass ratio, while the retained
solver and preview still omit separation mechanism and angular-impulse details.

When a staged run is requested, the assigned motor's thrust curve and mass
properties feed that stage's independent propulsion model. A missing local
motor record falls back to the global selection and emits a visible warning in
the result; it is never silently treated as certified data.

The stage cant controls map to a unit body-frame thrust axis. A cant angle of
`α` and azimuth `φ` use `(-cos α, sin α cos φ, sin α sin φ)`; repeated radial
instances add their placement angle to `φ`. This keeps symmetric booster sets
radially balanced when they use the same outward cant. The 0--15 degree limit
is an interface guardrail, not a claim that larger cant angles are physically
invalid.

Each exact attached-stage regime also resolves its aerodynamic source. If all
active stages point to one available table, that table is used for the regime.
If the active set contains conflicting table IDs or an unavailable table, the
regime falls back to the global source and emits a warning that combined-stage
interference is not represented. This conservative fallback avoids silently
mixing incompatible coefficient reference areas or signs.

## Safety and validation

Generated additional-stage geometry is a conceptual preview, not a structural
design, manufacturing drawing, or flight-ready configuration. Event controls are
deterministic inputs, not failure probabilities or certification data. The
topology modal and staged Flight card preserve model versions, event topology,
applicability warnings, and the retained-body/separation limitations.

## Clean-room boundary

The topology schema, validation rules, UI mapping, and generated preview geometry are original RocketWorks implementation. No OpenRocket source, UI, asset, database, or simulation engine is bundled or reused.
