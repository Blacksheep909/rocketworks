# Local project history 0.1

Status: implemented browser persistence; engineering preview.

## Purpose

RocketWorks keeps the editable ARC 54 inputs across refreshes and exposes a recoverable checkpoint timeline. This is device-local continuity, not a shared project service.

## Stored records

Two browser `localStorage` records are used:

- `kestrel.project.arc54.current.v1` stores the latest validated snapshot.
- `kestrel.project.arc54.history.v1` stores up to 40 chronological checkpoints.

The snapshot schema is `dev.kestrel-lab.local-project`, version 1. It contains the project identity, monotonically increasing revision, UTC save time, editable design, component geometry, motor, environment, recovery, and vertical-uncertainty settings, plus an optional validated `topology` record for new checkpoints. New component geometry, recovery-reefing, uncertainty-control, and topology fields use additive defaults so older version-1 records restore safely. Derived mass properties, simulations, uncertainty samples, landing dispersions, and rendered geometry are deliberately omitted; they are recomputed from restored inputs and topology.

The history schema is `dev.kestrel-lab.local-project-history`, version 1. Every entry has a unique identifier, human-readable change label, and complete validated snapshot. Autosave suppresses consecutive duplicate input states. Manual and restore checkpoints may intentionally duplicate a state so the user action remains visible.

## Save and restore behavior

- Existing records are read only after client hydration, avoiding server/browser state mismatch.
- Every editable field and the complete vehicle topology participate in one canonical fingerprint.
- A change marks the project unsaved immediately and writes after a 600 ms debounce.
- A restore creates a new revision from the selected inputs and topology; it does not remove later checkpoints. Legacy checkpoints without topology restore their inputs while retaining the current topology.
- When more than 40 checkpoints exist, the oldest entries are discarded.
- JSON, schema identity, schema version, project identity, timestamps, revisions, types, finite numbers, and UI input ranges are validated before a record is accepted.
- An unreadable record never populates application state. The default design remains active and the interface reports that local data needs attention.
- The separate current-topology cache remains for fast browser startup, while checkpoints carry their own topology so a restore is configuration-complete.

## Limits and privacy

Browser storage is synchronous, capacity-limited, and specific to the current browser profile and origin. Private browsing, storage policies, browser cleanup, or site-data deletion can remove it. This implementation has no cloud synchronization, account identity, collaboration, multi-device merge, conflict resolution, server backup, encryption layer, or v0-to-v1 migration. Browser extensions and other software with access to the profile may be able to inspect local records.

Use the versioned RocketWorks project JSON export for portable or durable storage. Local history is a convenience recovery mechanism and is not engineering evidence, configuration control, certification traceability, or a flight-safety record.

## Clean-room boundary

The persistence schema and implementation are original RocketWorks code. They contain no OpenRocket source code, UI code, assets, databases, file formats, or simulation engine.
