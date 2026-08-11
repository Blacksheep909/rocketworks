# Component library 0.1

Status: `engineering-preview-unvalidated`

The RocketWorks browser now provides a device-local library of reusable
component presets. A preset can capture a nose profile, airframe shell, fin
set, or recovery configuration from the current design and apply it to a later
design. The library is an original RocketWorks data model; it does not contain
third-party CAD, OpenRocket content, or a simulation engine.

## Record and validation boundary

Every record has a stable local identifier, bounded display metadata, a
discriminated component kind, numeric parameters in SI-adjacent UI units, and
provenance fields for source, data version, license or permission, attribution,
and optional URL. The schema accepts project-authored, user-supplied, and
original-template records, but keeps all three explicitly unvalidated.

The validator rejects duplicate identifiers, unsupported kinds, mismatched
parameter discriminants, non-finite values, unsafe bounds, tip chords larger
than root chords, and missing provenance. The device-local limit is 32 records.
Applying a preset updates only its component inputs; the normal project
autosave and simulation-freshness paths then mark the design as changed.

## Persistence and exchange

Records are stored under a versioned local-storage envelope and can be removed,
reused, or exported as a strict JSON library. A portable RocketWorks project
JSON file includes the component library alongside the existing motor and
aerodynamic libraries, so a project can be restored on another device with its
declared data boundary intact. Compact design-share links intentionally remain
free of local libraries and source data.

The component library is not a CAD interchange format. It describes the
editable parameters needed by the current analytical mass, geometry, recovery,
and preview paths; structural joints, manufacturing tolerances, materials
allowables, detailed fabric behavior, and experimental validation remain
outside scope.
