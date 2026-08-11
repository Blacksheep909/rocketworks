# RocketWorks device-local UI preferences 0.2

Status: implemented accessibility contract; the current envelope is v3 (see
`ui-localization-0.1.md` for the locale extension)

## Scope

RocketWorks keeps presentation choices separate from the saved engineering
project. The device-local record controls the selected 2D/3D view, the 2D
azimuth, reduced-motion behavior, and high-contrast presentation. None of
these values enter a project configuration fingerprint, a simulation input,
an uncertainty sample, a share link, or an exported engineering artifact.

The accessibility release introduced the `rocketworks-ui-preferences-v2`
record. The current app stores the v3 envelope under
`rocketworks-ui-preferences-v3`; both v2 and the earlier
`rocketworks-ui-preferences-v1` key remain readable so a browser upgrade does
not discard the user's view selection or accessibility choices.

## Schema

```json
{
  "schemaId": "rocketworks-ui-preferences",
  "schemaVersion": 2,
  "designView": "2d",
  "designAzimuthDeg": 0,
  "reducedMotion": false,
  "highContrast": false
}
```

`designView` is one of `2d`, `3d-skeleton`, or `3d-final`. `designAzimuthDeg`
is an integer in the inclusive range 0 through 359. The accessibility flags
are strict booleans. Invalid records are rejected and the workbench keeps
documented defaults; it never partially applies an unsafe browser record.

Version 1 records are migrated in memory with both new flags set to `false`.
The next successful preference write emits the version 2 envelope.

## Presentation behavior

`reducedMotion` applies an explicit transition and animation reduction to the
workbench even when the operating-system preference is unchanged. It also
disables smooth scrolling for the app shell. The browser-level
`prefers-reduced-motion` rule remains active as an additional safeguard.

`highContrast` raises inherited text and border tokens, strengthens form-field
borders and focus rings, and keeps the setting scoped to the app shell. The
setting is a visual aid, not a guarantee of conformance for every future
custom visualization; new controls must retain keyboard focus visibility and
semantic labels.

The **Display & accessibility** dialog is keyboard reachable from the top bar
and command search. `Escape` closes it, and the close control receives focus
when it opens. The controls take effect immediately and persist independently
of project autosave.

## Limits

This is a presentation contract, not a localization system. Engineering copy
and unit conventions remain English/SI until a complete locale catalog can be
introduced without leaving mixed-language warnings or model metadata. No
accessibility preference changes the equations, model versions, validation
status, or flight-safety limitations of any result.
