# Launch-rail constraint, angled handoff, guide loss, and tip-off 0.3

Status: analytical component checks only. This model is not validated for
flight-safety decisions.

This is an original clean-room implementation built from public rigid-body and
launcher mechanics. It does not contain or call OpenRocket source, simulation
code, UI code, data, assets, or backend components.

## Scope

The launcher adapter covers the interval from the initial pad state until the
configured vehicle reference point reaches the effective end of a straight
rail. It then hands the exact release state to RocketWorks' independent six-degree-
of-freedom propagator.

The rail fixes the initial attitude, constrains angular velocity to zero, and
allows translation only along a unit world-frame direction `e`. For distance
`s`, speed `u`, total applied world force `F`, and instantaneous mass `m`:

`r = r0 + e s`

`v = e u`

`s_dot = u`

`u_dot = (F dot e) / m - a_g`

where `a_g` is the authored effective guide-friction acceleration while the
vehicle is moving forward. At the pad, the same value is used as a bounded
static-loss threshold: a positive axial acceleration that does not exceed it
does not produce liftoff. This is an effective scenario input, not a derivation
from guide normal force, button geometry, or a friction coefficient.

The reaction reported by the guide while moving is:

`R = e (F dot e - m a_g) - F`

This cancels transverse applied force without changing the axial component.
At the pad origin, axial force below the effective static-loss threshold is
canceled by support and the vehicle remains stationary. Liftoff occurs at the
first crossing above that threshold.

## ENU rail direction

The browser editor exposes a bounded inclination `i` from local +up and an
azimuth `a` measured from +east toward +north. The normalized rail direction is

`e = (sin(i) cos(a), sin(i) sin(a), cos(i))`

with angles entered in degrees and converted to radians before evaluation. The
initial body attitude is rotated from RocketWorks' vertical launch convention so
the body nose (-X) is aligned with `e`; when the rail constraint is disabled,
the preview retains the vertical launch attitude.

## Event handling

- Known ignition, thrust, or other discontinuities can be supplied as scheduled
  times. Integration lands on each time exactly and uses incoming and outgoing
  load limits on their respective sides.
- A smooth liftoff crossing is located by bisection while the vehicle is
  supported on the pad.
- Rail exit is located by bisection within the first integration step whose
  distance reaches the effective rail length.
- The exit position, velocity, fixed orientation, authored tip-off angular rate,
  and exact event time become the free-flight initial state without an
  interpolation gap. The tip-off rate is a bounded body-frame release
  condition; no transient guide torque is reconstructed.
- Scheduled state resets and one-shot state-triggered events are carried across
  the handoff. Stage ignition, burnout, separation, and failure events therefore
  keep the same discrete state whether they occur on the rail or after release.
- The staged preview records rail liftoff and rail-exit events alongside the
  staging timeline and exposes the exact release speed and time in the browser
  workspace.

The scalar constrained state is integrated with fixed-step fourth-order
Runge-Kutta between event boundaries. Free flight uses the separate rigid-body
six-degree-of-freedom kernel.

## Automated checks

The regression suite checks:

- no motion and correct support reaction under negative axial force
- constant-acceleration rail-exit time and speed against a closed-form solution
- exact state continuity into free flight
- cancellation of transverse force by the rail reaction
- fixed attitude and angular rate before release, followed by torque response
- root-found liftoff under a smoothly increasing load
- exact treatment of a scheduled step from zero to positive force
- effective guide-friction loss, static threshold, and friction telemetry
- authored pitch/yaw tip-off rate continuity at the rail-exit handoff
- scheduled and root-found discrete event continuity through rail release
- explicit rail-reversal stop without returning a negative guide position
- rejection of misaligned attitude and off-axis initial position
- ENU inclination/azimuth direction resolution and aligned angled-rail handoff

These checks verify mathematics and software boundaries; they do not validate
a real launcher or vehicle.

## Assumptions and limitations

- The rail is straight, rigid, fixed in the world frame, with effective axial
  guide-loss and no resolved clearance or compliance.
- The configured length is effective travel of the propagated reference point.
  It is not automatically the physical rail length or rail-button release
  distance.
- Rail-button spacing, binding, local normal loads, structural flexibility, and
  launcher motion are not modeled. The friction input is not a physical
  coefficient and the tip-off input is not a measured impulse or torque.
- The rail holds attitude and zero angular velocity until release; moments are
  reacted but the reaction moment is not separately reported. A configured
  body-frame pitch/yaw rate is applied only at the release boundary.
- Premature contact loss, partial guide engagement, reversal into the pad after
  liftoff, and re-contact are absent.
- Smooth liftoff detection assumes a crossing remains visible across an
  integration interval; multiple unresolved force sign changes within one step
  require a smaller step or explicit scheduled boundaries.
- Ground collision after release is absent.
- If a post-liftoff load would reverse the guide travel before release, the
  adapter stops at the guide origin and emits a `rail_reversal` event and
  warning; it does not fabricate a negative rail position or re-contact model.
- State resets on the rail must preserve the rail-aligned attitude, zero angular
  rate, and on-axis position/velocity; arbitrary impulses and off-axis release
  states remain rejected. The bounded tip-off rate is the sole authored release
  exception.
- A real safety assessment needs measured propulsion, mass properties,
  geometry, wind, guide geometry, structural limits, uncertainty, and
  correlation against test data.

## Public references

- NASA Glenn, *Flight of a Model Rocket*, explains why a launcher guides the
  rocket while aerodynamic stability is ineffective at very low launch speed:
  https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/flight-of-a-model-rocket/
- NASA CR-942, *A Generalized Mathematical Model for Rocket Vehicle Liftoff
  Dynamics*, treats the ignition-to-launcher-clearance interval with vehicle
  loads, winds, and launcher restraints:
  https://ntrs.nasa.gov/api/citations/19680000765/downloads/19680000765.pdf
- NASA, *2025 Student Launch Handbook*, includes project-specific requirements
  for rail-exit velocity, thrust-to-weight ratio, and static stability. Those
  thresholds are program rules, not universal physical acceptance criteria:
  https://www.nasa.gov/wp-content/uploads/2024/08/2025-nasa-sl-handbook.pdf

## Next work

Future launcher work should represent finite guide-button separation, binding
and normal-load mechanics, and calibration against measured rail-exit data. The
current coupled uncertainty adapter already scales the effective guide-loss and
tip-off scenario inputs, but those factors are not hardware distributions. The
broader flight engine still needs relative guide-body aerodynamics, terrain/
ground contact, and validated propulsion and mass-state models.
