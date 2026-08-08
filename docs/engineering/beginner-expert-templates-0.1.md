# Beginner, expert, and template workflows 0.1

Status: implemented browser workflow layer; engineering preview.

## Intent

Kestrel Lab presents the same original calculation model at two levels of detail:

- **Beginner** keeps the inspector focused on geometry, essential flight inputs, live design checks, and the guided CG/CP explanation.
- **Expert** reveals model versions, mass-property details, aerodynamic slopes, assembly topology, motor metrics, weather provenance, replay seeds, and optimization controls.

The mode is a device-local preference. It does not change equations, input values, simulation fidelity, or validation status. Switching modes never changes the vehicle.

## Templates

The template library contains four original input bundles:

1. First flight — a compact recovery-equipped learning configuration.
2. High-power study — a heavier composite trade-study configuration.
3. Weather study — a higher-wind configuration for environment and landing-dispersion exploration.
4. Ballistic check — recovery disabled to make descent warnings and baseline behavior visible.

Each bundle passes the same input-range validator used by local snapshots. Loading a template applies all editable inputs atomically from the user’s perspective, records a named checkpoint, and leaves the derived mass, stability, flight, uncertainty, and landing results to recompute from the shared model.

Template labels describe an educational starting point only. They do not certify a motor, prove structural margins, approve a range, or imply flight safety.

## Guided teaching language

The beginner guide defines:

- **CG** as the current mass-model balance location.
- **CP** as the low-speed aerodynamic force location.
- **Static margin** as their separation in body diameters.

The copy explicitly distinguishes a model result from a safety certificate. This is important because a simplified, low-speed aerodynamic model can be useful for learning while still being outside transonic, damping, viscous, structural, and experimental validation domains.

## Accessibility and responsive behavior

Mode controls use a labelled button group. The template library and local history are modal dialogs with labelled descriptions, focus placement, Escape dismissal, backdrop dismissal, and keyboard-focus styling. The guide uses an `aria-expanded` toggle. Template cards collapse to one column on narrow screens, while the mode switch is hidden on mobile in favor of the guided content and existing responsive controls.

## Clean-room boundary

The workflow copy, template values, state mapping, and UI are original Kestrel Lab implementation. No OpenRocket source, UI code, asset, database, file format, or backend is bundled or reused.
