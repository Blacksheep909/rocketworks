# Kestrel Lab

Independent rocket design, simulation, and mission-analysis tools for the
browser.

Kestrel Lab is a browser-first rocket design and flight-analysis workbench
with a graphite mission-console interface. It is being built as an independent
clean-room implementation from public aerospace equations, published
research, standards, and original code.

> **Engineering preview:** Kestrel Lab is not flight-safety validated,
> manufacturing-approved, or a substitute for instrumented testing,
> independent analysis, range procedures, or qualified engineering review.

## Current release surface

- component-aware 2D geometry and an interactive 3D vehicle view driven by
  expanded assembly components, with clickable surface/stage/component
  selection, grouped stage visibility, plus enabled serial and radial previews;
- mass, centre-of-gravity, inertia, static stability, and centre-of-pressure
  calculations with model versions and assumptions;
- serial, parallel, radial, clustered, and multi-stage vehicle topology;
- independent repeated-stage instance ignition, burnout, separation, and live
  mass-property diagnostics with logical-stage topology preserved for aero
  regimes;
- bounded canted-motor configuration with radial instance alignment;
- deterministic per-motor cluster-failure preview with retained failed-motor
  propellant and explicit imbalance warnings;
- bounded retained-body separation delta-v controls with body/world-frame event
  telemetry and explicit discarded-body limitations;
- staged motor-state diagnostics in the Flight workspace and engineering
  report, including active/failed counts and retained failed propellant;
- bounded launch-rail inclination and ENU azimuth controls with aligned 6DOF
  handoff;
- motor and aerodynamic coefficient libraries for user-supplied,
  provenance-qualified data;
- atmosphere, launch-site, wind, turbulence, launch-rail, recovery, and
  landing-dispersion previews;
- user-configurable recovery reefing schedules shared by the vertical preview,
  landing descent, 6DOF recovery loads, trace telemetry, and portable inputs;
- optional relative-humidity coupling with explicit water-vapor, virtual-
  temperature, density, sound-speed, and Reynolds-number diagnostics;
- persisted pad-pressure and pad-temperature observations shared by the fast
  vertical, launch-environment, landing, and report paths;
- preliminary vertical flight, coupled 6DOF, staging, ignition delays,
  failure events, retained-vehicle recovery loads, and bounded separated-body
  trajectories with optional isotropic point-drag basis;
- seeded coupled 6DOF uncertainty envelopes that propagate bounded mass,
  propellant, thrust, drag, and wind assumptions through stage events and
  launch-rail handoff;
- interactive vertical and staged trace inspectors with Mach, dynamic-pressure,
  axial/recovery drag, canopy area, angle-of-attack, sideslip, event, and
  topology readouts;
- preliminary structural-readiness screen for axial stress, Euler buckling,
  fin-root bending/shear, and static-margin review with explicit assumptions;
- uncertainty analysis, parameter sweeps, sensitivity, and constraint-aware
  optimization;
- accessible event timelines, trace charts, comparisons, engineering reports,
  CSV, DXF, OpenSCAD, and portable Kestrel project JSON;
- validated project import, device-local autosave/history, templates,
  beginner/expert modes, keyboard command search, and compact browser design
  share links.

Every calculation surface exposes its model version, validation status,
warnings, assumptions, and scope limits. User data retains its source,
version, license identifier, attribution, and validation state.

## Clean-room boundary

OpenRocket is used only as an external feature and compatibility reference
where legally appropriate. This repository does **not** copy, modify, link,
bundle, translate, or directly reuse OpenRocket source code, simulation code,
UI code, assets, databases, or backend components.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

The app runs as a browser workbench. Production-compatible validation is
available with:

```bash
npm run lint
npm run build
npm test
```

`npm test` builds the app and runs the physics, state, export, UI-source, and
rendered-HTML regression suites.

## Public-project guardrails

This repository is intentionally transparent about what it does and does not
claim. Every calculation result carries a model version, validation status,
assumptions, warnings, and scope limits. The current implementation is an
engineering preview: it is useful for exploration, regression testing, and
design conversations, but it is not a flight-safety, range-safety,
manufacturing, or certification tool.

The project is released under the [MIT License](LICENSE). See
[CONTRIBUTING.md](CONTRIBUTING.md) for the clean-room rules, data-provenance
requirements, test workflow, and UI conventions. Security reports belong in
[SECURITY.md](SECURITY.md), not in a public issue.

## Repository map

```text
app/                  Browser workbench, dialogs, charts, and visual system
lib/physics/          Independent aerospace models and simulation kernels
lib/project/          Validated local state, topology, templates, and libraries
lib/export/           Portable JSON, CSV, report, DXF, and OpenSCAD artifacts
docs/engineering/     Versioned equations, assumptions, decisions, and limits
tests/                Deterministic physics, UI, export, and integration checks
```

## Roadmap

Near-term work is stronger experimental/benchmark validation, a full coupled
multi-body separation solver beyond the current mass-ratio impulse branch,
richer structural and aeroelastic checks, and more stage-aware design review.
Longer-term work includes collaboration and cloud project storage plus native
desktop/tablet packaging. Those additions
will preserve the same provenance boundary and will never upgrade an
analytical preview to flight-safe status without independent evidence.
