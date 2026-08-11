# RocketWorks shell localization 0.1

Status: implemented shell catalog; engineering copy remains English

## Contract

RocketWorks stores the interface locale in the device-local presentation
record, not in the engineering project. The current supported locales are:

- `en` — English (default)
- `es` — Spanish

The version 3 preference envelope adds `locale` and keeps the existing 2D/3D,
azimuth, reduced-motion, and high-contrast values. Version 1 and version 2
records migrate to `en` without changing engineering state.

## Translation boundary

The original typed catalog covers the workbench shell: brand tagline, top-bar
actions, experience mode, workspace tabs, design visualization controls, 2D
azimuth labels, the beginner template entry point, and the Display &
accessibility dialog. The locale selector is itself translated and updates the
document language metadata.

Detailed engineering labels, unit strings, model assumptions, warnings,
provenance, validation status, and report text remain English for now. This is
intentional: a partial translation must not make a warning appear translated
while a nearby limitation stays ambiguous. New copy should enter the typed
catalog or be explicitly marked as engineering-language content until the
catalog is complete.

## Safety and persistence

Changing locale changes presentation only. It does not alter inputs, simulation
fingerprints, motor or aerodynamic source selections, uncertainty seeds,
results, exports, or share links. The preference parser rejects unknown locale
values rather than silently selecting a partially supported language.

Localization is not validation. Spanish or English labels do not change the
unvalidated status, assumptions, or flight-safety limitations carried by any
physics result.
