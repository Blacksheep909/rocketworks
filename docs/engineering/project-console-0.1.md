# Project console (0.1)

The RocketWorks header project affordance opens a local project console rather
than pretending there is a remote project service. It is a workspace handoff
surface over the existing validated browser primitives.

## Actions

- **Artifact center** opens the existing JSON, trace, report, and CAD export
  surface.
- **Import a project file** restores a validated project envelope and its
  user-supplied motor, aerodynamic, and component libraries.
- **Review local history** restores a checkpoint without deleting newer
  revisions.
- **Choose a template** starts a new design direction through the existing
  template validator.
- **Copy design share link** serializes editable inputs and stage topology but
  intentionally leaves device-local libraries out of the URL.
- **Create checkpoint** records a validated revision in browser storage.

## Boundary

The console reports whether browser storage is ready and labels the revision
that was most recently persisted. It does not upload, synchronize, merge, or
grant access to a project. Local history can be lost when site data is cleared;
portable RocketWorks project JSON remains the durable handoff mechanism until a
separate, authenticated collaboration service is designed and validated.
