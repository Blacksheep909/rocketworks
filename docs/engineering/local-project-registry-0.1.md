# Local project registry 0.1

## Purpose

RocketWorks now keeps a small, versioned index of project documents in the
current browser. The registry makes the project console useful for more than a
single hard-coded design: users can see local workspaces, open another saved
design, and duplicate the current design under a new name.

This is intentionally a device-local workspace primitive. It is not an
account system, cloud backup service, collaboration protocol, or conflict
resolver. Portable project JSON remains the durable handoff mechanism.

## Contract

The registry is stored under `kestrel.project.workspace-registry.v1` and uses
the `dev.kestrel-lab.local-project-registry` schema envelope. Each record
contains:

- a stable project identifier and display name;
- canonical creation and update timestamps;
- a validated project snapshot;
- the matching validated checkpoint history.

Identifiers are bounded to letters, numbers, dots, dashes, and underscores.
Names are bounded to 120 characters. The registry accepts at most 24 projects
to keep local storage predictable. A record cannot be activated unless its
snapshot and history both identify the same project.

## Persistence and recovery

Autosave and manual checkpoints update the existing current-snapshot/history
keys and then upsert the same record into the registry. On hydration, a valid
active registry record is preferred; legacy current snapshot/history data seed
the registry when no record exists. All registry parsing is strict and
versioned. If the registry is unreadable, the app keeps the old local records
untouched and exposes a persistence warning rather than silently inventing a
project.

Opening a project writes its validated snapshot, history, topology, and source
selection into the active browser workspace. A current checkpoint is recorded
before switching, so the outgoing design remains recoverable. Missing local
motor or aerodynamic sources fall back to the declared synthetic/constant
preview and remain visible as a warning.

Duplicating a project creates a new readable identifier, starts a revision-one
history for the copy, and preserves the current topology and source references.
The operation never copies external library data into the registry; those
libraries remain device-local and are still handled by the portable project
export/import path.

## Validation boundary

Registry validity proves document identity and persistence integrity only. It
does not validate aerodynamic accuracy, structural margins, trajectory safety,
manufacturing tolerances, or range procedures. Simulation results continue to
carry their own model version, assumptions, stale-result guards, and
engineering-preview status.
