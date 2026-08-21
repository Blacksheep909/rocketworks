# Portable simulation review export 0.1

Status: `engineering-preview-unvalidated`

RocketWorks comparison references are useful across a design session, but a
browser-local reference cannot be handed to a reviewer on another device. The
portable simulation-review artifact is an original, versioned JSON envelope
around one already validated local vertical or staged reference.

## Envelope

The outer object contains:

- `rocketworks.simulation-review` schema identity and schema version;
- `rocketworks-simulation-review-export-0.1.0` export model identity;
- an exact review boundary: simulation-result handoff only, not validation,
  certification, or flight-safety evidence;
- the existing strict local-reference record, including project identity,
  saved timestamp, simulation fingerprint, model version, validation status, and
  result trace/event arrays.

The parser accepts only the exact envelope and delegates result validation to
the vertical/staged reference validators. It rejects malformed JSON, unknown
schema/model/boundary values, a mismatched reference kind, invalid nested
metrics, and artifacts larger than 4,100,000 characters. Serialization is
deterministic for a given reference.

## Browser workflow

The Artifact center can export the current fresh vertical or staged result as a
`*.rocketworks.json` run-review artifact. **Import simulation review** verifies
the file and loads it as a session-only comparison reference; it does not
restore project inputs, write checkpoints, merge a workspace, or persist the
imported result. The Flight workspace labels the imported source, project name,
timestamp, and fingerprint and allows it to be cleared independently.

An imported result may come from another project or model configuration. The
comparison remains a numerical review aid and preserves the artifact's source
identity; it must not be read as proof that the current design reproduces or
inherits the imported configuration.

## Scope boundary

The artifact contains simulation output and provenance metadata only. It does
not include user motor/aerodynamic library files, project topology, credentials,
cloud synchronization, collaboration state, manufacturing approval, or flight
safety evidence. Independent review and validation remain required.
