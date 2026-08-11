# Project identity 0.1

Status: `device-local continuity`

Implementation: `app/page.tsx`, `lib/project/project-state.ts`, and the existing
project-share/export contracts.

The browser shell now lets the user edit the vehicle project name instead of
forcing every design to display the example name ARC 54. The name is a project
identity field, not an engineering input: changing it does not invalidate a
simulation fingerprint, alter a mass property, or change a flight equation.

## Persistence and sharing

The validated name is carried through the existing versioned local snapshot and
history records. It is restored on reload and checkpoint restore, and a rename
creates a visible `Renamed project to ...` history label. Empty names revert to
the documented default. The field is bounded to 80 characters and exports use a
sanitized name stem for downloaded artifact filenames.

Design share links already contain a validated `projectName`; the browser now
uses that field for both encoding and hydration. Project JSON import restores
the name before creating its import checkpoint. Local motor and aerodynamic
libraries remain device-local and are never embedded in share links.

## Export and presentation

The editable identity is shown in the shell header, component panel, 2D/3D
accessible labels, and artifact-center title. JSON, CAD, report, trace, sweep,
uncertainty, and polar artifacts retain the name in their document metadata or
sanitized filename. The fixed compatibility project ID `arc54` remains in the
schema envelope so existing local records continue to restore safely.

## Validation boundary

Project identity is presentation and continuity metadata. It is not evidence of
vehicle ownership, motor identity, design revision approval, or flight safety.
The engineering calculations remain governed by their own inputs, model
versions, validation statuses, assumptions, and warnings.
