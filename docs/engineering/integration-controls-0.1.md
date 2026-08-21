# Integration controls 0.1

RocketWorks exposes two bounded numerical-step controls in the expert Flight
inspector. They are persisted with the project, carried through share links and
portable snapshots, and included in the simulation fingerprint.

## Controls

- **Vertical integration step** is the fixed-step interval used by the nominal
  vertical flight preview. It also drives the ascent-wind-drift handoff used by
  the landing-dispersion preview.
- **Coupled 6DOF base step** is the fixed grid interval used by the staged,
  coupled rigid-body preview. In adaptive RK4 mode it is the starting/base
  interval for internal step-doubling refinement; event boundaries still align
  to the authored event time rather than being silently skipped.

Both controls accept `0.001`–`0.2` seconds and default to `0.02` seconds when
loading an older project that does not contain the fields. Smaller steps can
resolve short burns, rail exits, staging, and recovery transitions more
closely, at the cost of longer browser runtimes and larger traces.

## Numerical boundary

The controls change temporal discretization only. They do not add aerodynamic,
structural, propellant, plume, controller, hardware, or terrain fidelity, and
they cannot detect model-form error or inaccurate input data. The fast vertical
preview remains bounded to its existing mission horizon, while the coupled
preview retains its topology-derived duration and event schedule.

Use the existing vertical convergence diagnostic and the coupled integrator
diagnostics to compare a smaller step against the current result. Agreement is
only a numerical regression signal; it is not experimental validation,
certification, range approval, or a flight-safety result.
