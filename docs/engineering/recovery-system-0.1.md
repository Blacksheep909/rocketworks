# Recovery system loads 0.1

Status: analytical component checks only. This model is not validated for
flight-safety decisions.

This is an original clean-room implementation based on public drag and rigid-
body mechanics. It contains no OpenRocket source, simulation code, UI code,
recovery database, assets, or backend components.

## Purpose

The recovery layer adds discrete deployment state and wind-relative canopy
loads to Kestrel's independent 6-DOF kernel. It supports multiple devices such
as drogues and main parachutes with:

- root-found apogee or altitude commands
- scheduled commands
- deterministic deployment delay
- prescribed smooth inflation
- explicit failed-device state
- optional fixed body-frame force application points
- user-supplied Mach applicability limits

Deployment helpers modify only the event-driven discrete state. Continuous
position, velocity, attitude, and angular velocity remain governed by the
Newton-Euler integration.

## Discrete state

For device identifier `id`, the recovery model uses two namespaced values:

- `recovery.id.commandTimeS`: finite time when deployment was commanded
- `recovery.id.failed`: boolean failure state

Discrete values remain constant through RK4 intermediate stages and change only
through accepted event resets. The 6-DOF kernel validates that all discrete
values are booleans, finite numbers, or strings.

Device phases are `stowed`, `delayed`, `inflating`, `inflated`, and `failed`.
A failure overrides a prior command and produces no recovery load.

## Triggers

The apogee helper uses the falling zero crossing of world-up velocity:

`g_apogee(state) = velocityWorld.z`

The altitude helper uses a rising or falling crossing of:

`g_altitude(state) = positionWorld.z - configuredAltitudeAgl`

The shared 6-DOF event system root-finds these crossings by time bisection.
Scheduled helpers use the known-time event path. A command records the accepted
event time; configured delay and inflation begin from that exact value.

## Inflation and loads

For time since inflation start `tau`, configured inflation time `ti`, full
reference area `A`, and clamped linear fraction `x`:

`x = clamp(tau / ti, 0, 1)`

`f = x^2 (3 - 2x)`

`Aeff = f A`

The smoothstep ramp makes effective area and its first derivative continuous at
the endpoints. It is a numerical assumption, not a fabric or suspension-line
model. Zero inflation time produces an immediate full-area transition at the
accepted event boundary.

For atmosphere density `rho`, wind-relative world velocity `vrel`, speed `V`,
drag coefficient `Cd`, and dynamic pressure `q`:

`q = rho V^2 / 2`

`D = q Cd Aeff`

`Fworld = -D vrel / V`

If an application point `p` is supplied, the force is rotated to the body frame
and its moment about instantaneous body-frame center of mass `R` is:

`Mbody = (p - R) cross Fbody`

With no point, the force acts at the center of mass and contributes no moment.
Multiple device forces and moments are summed without canopy interaction.

## Automated checks

The regression suite verifies:

- fully inflated vector force against the closed-form drag equation
- delayed and quarter-time inflation against the smoothstep relation
- drag opposition to three-axis wind-relative motion
- off-center body moment signs and magnitude
- failed-device suppression
- root-found apogee command and exact discrete command time
- materially lower root-found impact speed than ballistic descent
- deterministic scheduled, altitude, and failure helpers
- duplicate/invalid device rejection and Mach-limit diagnostics
- discrete-state persistence and invalid-value rejection in the 6-DOF kernel

These are equation and integration checks, not canopy qualification.

## Known limitations

- Opening shock, line stretch, snatch force, reefing hardware, packing,
  suspension geometry, and structural loads are absent.
- Canopy aerodynamics use constant user-supplied `Cd` and area. Mach, Reynolds,
  porosity, angle, wake, and oscillation effects are not derived.
- Inflation is prescribed rather than coupled to pressure, fabric, payload, or
  line dynamics.
- Canopy and payload are one rigid body. Pendulum modes, line elasticity,
  canopy mass, and relative motion are absent.
- Multiple canopies do not interact aerodynamically or mechanically.
- Delay, inflation, and failure state are deterministic; uncertainty and
  reliability distributions are future work.
- Ground impact terminates the trajectory but terrain, bounce, snagging, and
  landing damage are separate future models.

## Primary public references

- NASA Glenn, *Drag Equation*, defines `D = Cd rho V^2 A / 2` and explains that
  coefficient and reference area must match the flow and geometry:
  https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/
- NACA TN-1869, *Wind-Tunnel Investigation of the Opening Characteristics,
  Drag, and Stability of Several Hemispherical Parachutes*, reports measured
  opening, drag, and stability behavior:
  https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19930082545.pdf
- NASA CR-120326, *Parachute Dynamics and Stability Analysis*, develops a much
  more complete nonlinear canopy-riser-payload model with elasticity, wind, and
  gusts, illustrating physics omitted here:
  https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19740022320.pdf
- NASA/TM-2009-216165, *Crew Exploration Vehicle Integrated Landing System*,
  uses a simplified vector-opposing parachute drag force for a landing-system
  assessment while noting the approximation:
  https://ntrs.nasa.gov/api/citations/20100002764/downloads/20100002764.pdf

## Next work

The next recovery increment should add reefing stages, opening-load estimates,
line and canopy state, deployment reliability distributions, and uncertainty
propagation. The browser UI should expose deployment phases, applicability
warnings, impact-speed ranges, and failure scenarios rather than one nominal
answer.
