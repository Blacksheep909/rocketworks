# Portable simulation run-library export 0.1

Status: `engineering-preview-unvalidated`

RocketWorks can hand off the device-local named simulation catalog as a strict
JSON envelope. The export contains validated vertical and staged result
records only; it is not a project document, a design-state backup, or a
simulation engine.

## Envelope

The outer object contains:

- `rocketworks.simulation-run-library` schema identity and version;
- `rocketworks-simulation-run-library-export-0.1.0` model identity;
- canonical export time and source project identity;
- the exact boundary: simulation-result handoff only, not validation,
  certification, or flight-safety evidence;
- the versioned local run-library document, including its named vertical and
  staged records.

The parser validates the outer schema, model, boundary, timestamp, project
identity, and nested run-library schema. It rejects malformed JSON, unsupported
versions, cross-project identity tampering, invalid result metrics, duplicate
run IDs, and artifacts larger than 4,700,000 characters. Serialization is
deterministic for a given library and export timestamp.

## Browser workflow

The Artifact center can export every saved run in the active project's local
catalog. **Import simulation run library** accepts an export only when its
source project ID matches the active project. Records are merged transactionally:
re-importing an identical run is a no-op, a conflicting ID fails, and capacity
overflow leaves the current catalog untouched. The run-library dialog exposes
the same import action for a shorter workflow.

Import never restores editable inputs, checkpoints, topology, motor data,
aerodynamic tables, or cloud state. Use a RocketWorks project document for
design handoff and a single simulation-review export when the source project is
not available locally.

## Scope boundary

The catalog remains browser-local and project-scoped. It is a review
convenience, not validation, reliability qualification, certification,
manufacturing approval, or flight-safety analysis. Every imported run keeps
its source fingerprint, model identity, timestamp, and validation status.
