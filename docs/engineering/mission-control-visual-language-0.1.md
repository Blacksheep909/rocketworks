# Mission-control visual language 0.1

Status: implemented UI treatment; original Kestrel Lab design system.

The current pass responds to the requested SpaceX/Rocket Lab-inspired direction
as a broad visual reference only. It does not reproduce either company’s
interface, assets, typography, branding, or source code.

## Direction

Kestrel Lab now uses a restrained launch-console language inspired by contemporary aerospace operations without copying any company’s interface, assets, typography, or source code:

- near-black graphite surfaces and sharp, low-radius controls;
- a pale technical drawing plate for vehicle geometry, with a dark vehicle
  silhouette and a single signal-orange service band;
- paper-white technical labels and compact monospace instrumentation;
- telemetry blue for active state, links, selection, and live model context;
- amber/terracotta only for caution, provenance, unvalidated data, and the small number of launch-console signal accents;
- thin grid lines, mission identifiers, stage context, and model-status badges;
- generous workspace canvas with dense side inspectors, preserving a design-review rhythm;
- a compact mission telemetry rack for configuration, active-stage count, and a plain-language design check;
- a black/white engineering plate with a restrained orange service band, keeping
  the canvas distinct from the surrounding console without introducing a
  swamp-green cast;
- high-contrast launch actions and quiet telemetry surfaces, so the operator
  can scan readiness, configuration, and model status without decorative noise.

## Interaction hierarchy

The top bar establishes mission identity (`KST-01`), persistence state, experience mode, template access, export, and the primary run action. The workspace toolbar establishes the current design/flight loop and vehicle topology, then exposes a small telemetry rack (`CONFIG`, `STAGES`, `CHECK`) so the operator can read state at a glance. Side panels hold editable inputs and explainable diagnostics. Modal centers are reserved for templates, local history, motor data, exports, and a keyboard-first command search (`Ctrl/Cmd+K`) that routes the highest-value actions without forcing a pointer-only workflow.

This hierarchy is intentionally original. It borrows broad aerospace control-room conventions—status bands, telemetry labels, dark surfaces, and clear state transitions—not any protected visual asset or implementation.

## Accessibility constraints

Blue is not the only state signal: labels, button text, and dialog descriptions carry the meaning. Focus rings remain visible, modal inputs receive focus on open, command search supports arrow-key navigation and Enter execution, Escape and backdrop dismissal are supported, and responsive breakpoints collapse data cards without hiding the primary run action. Beginner mode reduces secondary detail while preserving model warnings and validation status.

## Engineering boundary

Visual polish does not change model applicability. Every motor, flight, landing, stability, and optimization result continues to expose assumptions, version, provenance, and unvalidated status where appropriate.
