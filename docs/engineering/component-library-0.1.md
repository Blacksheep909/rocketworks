# Component library 0.1

Status: `engineering-preview-unvalidated`

The RocketWorks browser now provides a device-local library of reusable
component presets. A preset can capture a nose profile, airframe shell, fin
set, recovery configuration, equipment point mass, or cylindrical pod from the
current design and apply it to a later design. Topology primitives preserve
their stage-local axial position, radial offset, and azimuth, so applying one
creates a new authored component in the first enabled stage without silently
changing an existing component. The library is an original RocketWorks data
model; it does not contain third-party CAD, OpenRocket content, or a simulation
engine.

## Record and validation boundary

Every record has a stable local identifier, bounded display metadata, a
discriminated component kind, numeric parameters in SI-adjacent UI units, and
provenance fields for source, data version, license or permission, attribution,
and optional URL. The schema accepts project-authored, user-supplied, and
original-template records, but keeps all three explicitly unvalidated.

The validator rejects duplicate identifiers, unsupported kinds, mismatched
parameter discriminants, non-finite values, unsafe bounds, tip chords larger
than root chords, cylindrical walls thicker than half their diameter, and
missing provenance. Equipment and pod placement is bounded to a 10 m axial
position, 2 m radial offset, and -180 to +180 degree azimuth. The device-local
limit is 32 records. Applying a core preset updates only its component inputs;
applying a topology preset creates a bounded new plan and selects it for
editing. The normal project autosave and simulation-freshness paths then mark
the design as changed.

The topology editor exposes the same selection explicitly, so a user can mark
an equipment or pod plan for library capture without relying on canvas hit
testing. The selected plan is shown in the component-library dialog before a
save is accepted.

## Persistence and exchange

Records are stored under a versioned local-storage envelope and can be removed,
reused, or exported as a strict JSON library. A portable RocketWorks project
JSON file includes the component library alongside the existing motor and
aerodynamic libraries, so a project can be restored on another device with its
declared data boundary intact. Compact design-share links intentionally remain
free of local libraries and source data.

The component library is not a CAD interchange format. It describes the
editable parameters needed by the current analytical mass, geometry, topology,
recovery, and preview paths; structural joints, manufacturing tolerances,
materials allowables, detailed fabric behavior, off-axis aerodynamic
interference, and experimental validation remain outside scope. A cylindrical
pod contributes its bounded shell mass and inertia to the analytical preview;
it is not a CAD solid or a certified payload model.
