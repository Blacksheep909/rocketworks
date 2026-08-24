# RocketWorks export destination preference 0.1

Status: browser UX improvement; this preference does not change engineering
inputs, simulation equations, fingerprints, or artifact contents.

## Behavior

RocketWorks exports are explicit user actions. The default `save-dialog`
destination uses the browser File System Access API when it is available and
asks the user for a filename and location for each artifact. The optional
`browser-download` destination preserves normal browser behavior and places the
artifact in the browser's configured Downloads folder.

The save dialog is opened directly from the export action so the browser's user
activation requirement is respected. A cancelled dialog produces no second
download. If the API is unavailable, or a browser/permission error occurs,
RocketWorks asks for explicit confirmation before using the normal browser
download path; it never silently fills Downloads from the save-dialog mode.

## Persistence and migration

The setting lives in the device-local UI preference envelope, not in a project
snapshot or simulation fingerprint. Version 4 introduced the export destination,
and version 5 makes the safer save-dialog flow the default:

```json
{
  "exportDestination": "save-dialog"
}
```

Version 1 through 4 records migrate to `save-dialog`, while the existing design
view, azimuth, accessibility flags, and locale remain intact. This intentionally
stops legacy default preferences from silently filling the Downloads folder;
users can still opt back into `browser-download` in Display & accessibility.
Invalid destination values are rejected as a whole record, so a malformed
browser preference cannot partially change the workbench.

## Limits

The browser cannot be given a silent arbitrary filesystem path. The save dialog
is therefore an explicit per-export flow, and unsupported browsers continue to
use their own download settings. A future desktop wrapper can provide a
project-folder workflow without changing the export payload contract.

All exported engineering results retain their existing model version,
provenance, assumptions, uncertainty, and unvalidated status boundaries.
