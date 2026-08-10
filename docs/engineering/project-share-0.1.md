# Browser design-share links 0.1

Status: `engineering-preview-unvalidated`.

The project-share codec in `lib/project/project-share.ts` provides a compact,
server-free collaboration path for the browser workbench. It encodes validated
editable inputs (including persisted vertical-uncertainty count/seed and optional uncertainty-dependence pairs), the validated stage topology, and the selected motor and
aerodynamic source identifiers into a URL-safe hash. It never embeds local
motor records, aerodynamic tables, simulation traces, credentials, database
rows, or third-party source material.

## Validation boundary

Encoding re-validates both the editable project inputs and topology before
serializing them. Decoding rejects unknown schema versions, malformed UTF-8 or
base64url, invalid identifiers, out-of-range inputs, invalid stage parents, and
oversized payloads. The hash is removed from the address bar after a successful
browser import so refreshes do not repeatedly apply the design.

The selected motor and aerodynamic table are references, not bundled data. If a
recipient does not have the referenced record in the same browser profile, the
UI explicitly falls back to the synthetic motor or constant drag source and
leaves a review note. A portable RocketWorks project JSON export remains the
authoritative path when source libraries must travel with the design.

## Privacy and limits

The link is a bearer artifact: anyone who receives it can read the encoded
design inputs. It contains no server-side state and does not create a shared
cloud workspace, access control list, or revision merge. URL length is bounded
before copying. Users should use the versioned project JSON for archival,
provenance, and large imported data.

## Verification

Tests cover deterministic encoding, strict round trips, full-URL decoding,
tamper rejection, source-reference preservation, and the explicit exclusion of
motor curves and aerodynamic coefficient surfaces from the link payload.
