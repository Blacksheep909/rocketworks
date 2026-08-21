# Local workspace backup 0.1

## Purpose

The project console can download a single inspectable JSON envelope containing
the current browser-local project registry. This gives users a recoverable
index of multiple RocketWorks designs without introducing accounts, cloud
storage, or an undocumented synchronization protocol.

## Envelope

`dev.kestrel-lab.local-workspace-backup` version 1 contains:

- a canonical export timestamp;
- the browser-local registry schema and its active project;
- each validated project snapshot and matching checkpoint history;
- explicit handoff notes describing what is and is not included.

The backup is validated through the same strict registry parser used for local
hydration. Project identifiers, snapshot/history identity, timestamps, registry
capacity, and schema versions therefore retain one source of truth.

## Handoff boundary

The envelope intentionally contains snapshots and histories only. Motor,
aerodynamic, component, and measured-flight libraries can be large,
provenance-bearing local datasets and remain outside this backup. A complete
single-project handoff should use the existing RocketWorks project JSON export,
which carries the selected user libraries and their provenance. A recipient
who imports a workspace backup without those libraries will see the normal
synthetic/constant fallbacks and explicit source-selection warnings.

The export action creates a checkpoint first, so the backup reflects the latest
editable state of the active project. It is a download, not a network upload;
the user controls where the JSON file is stored or shared.

## Restore semantics

The project console and artifact center can merge a validated backup into the
current browser. Records with the same `projectId` are replaced by the backup;
new records append in backup order, and the backup's active project is opened.
The 24-project device limit is enforced before any imported record is written;
an overflow is reported to the user instead of silently dropping projects.
The active project's snapshot and history are restored, while motor,
aerodynamic, component, and measured-flight libraries remain unchanged because
they are intentionally outside this envelope. If a restored snapshot references
a library record that is unavailable on this device, the normal explicit
synthetic/constant fallback warning remains visible.

## Validation boundary

Successful parsing proves only that the workspace index is structurally valid
and internally consistent. It does not validate aerodynamic data, trajectory
accuracy, structural margins, manufacturing tolerances, or flight safety.
