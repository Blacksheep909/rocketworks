# Stage mass-ratio diagnostic 0.1

Implementation: `lib/physics/stage-mass-ratio.ts`  
Browser integration: `lib/physics/stage-flight-preview.ts` and `app/page.tsx`  
Model: `rocketworks-stage-mass-ratio-0.1.0`  
Validation status: `analytical-ideal-rocket-equation`

## Scope

The staged preview now exposes an inspectable composition diagnostic for each
propulsive stage. For a supplied stage:

\[
m_0 = m_\mathrm{structure} + m_\mathrm{motor,dry} + m_\mathrm{propellant}
\]

\[
m_b = m_\mathrm{structure} + m_\mathrm{motor,dry}, \qquad
R = \frac{m_0}{m_b}
\]

The adapter integrates the supplied thrust curves to obtain total impulse and
derives an effective specific impulse from the supplied initial propellant mass:

\[
I_{sp,eff} = \frac{I_t}{m_p g_0}
\]

The stage-only ideal delta-v proxy is then:

\[
\Delta v_\mathrm{ideal} = I_{sp,eff} g_0 \ln R
\]

The output retains structural, dry-motor, propellant, full, and burnout masses,
propellant fraction, mass ratio, effective specific impulse, ideal delta-v, and
an explicit status for missing or invalid evidence. Repeated physical instances
are aggregated when the stage adapter supplies a logical cluster stage.

## Interpretation limits

This is not a mission delta-v budget. The stage-only calculation excludes
downstream payload and upper-stage mass, gravity and drag losses, steering,
throttling, residual propellant, finite burn/staging transients, atmospheric
effects, motor efficiency uncertainty, and trajectory constraints. The summed
ideal delta-v is only a composition trend and must not be treated as flight
performance, certification, or a flight-safety result.

The calculation uses the supplied thrust curve and initial propellant mass. For
measured mass-flow motors, the stage model still reports the source provenance
and separate depletion behavior; this diagnostic does not independently validate
sensor calibration or exhaust velocity.

## Public references

- NASA Glenn, *Mass Ratios*:
  https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/mass-ratios/
- NASA Glenn, *Ideal Rocket Equation*:
  https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/
