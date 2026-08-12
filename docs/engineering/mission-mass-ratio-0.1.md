# Serial-stack mass-ratio preview 0.1

Implementation: `lib/physics/stage-mass-ratio.ts`

Browser integration: `lib/physics/stage-flight-preview.ts` and `app/page.tsx`

Model: `rocketworks-mission-mass-ratio-0.1.0`
Validation status: `analytical-serial-stack-preview`

## Scope

The mission preview extends the stage-only mass-ratio diagnostic by carrying
the retained payload/recovery mass and every later serial-stage full mass
through each earlier burn. Serial stages are supplied in burn order. For a
stage (i), the downstream stack is

\[
m_{\mathrm{down},i} = m_{\mathrm{retained}} +
\sum_{j>i} m_{0,j}
\]

and the attached masses used for the ideal burn are

\[
m_{0,i}^{\mathrm{mission}} = m_{0,i} + m_{\mathrm{down},i},
\qquad
m_{b,i}^{\mathrm{mission}} = m_{b,i} + m_{\mathrm{down},i}.
\]

The resulting composition trend is

\[
\Delta v_i = I_{sp,i} g_0
\ln\left(\frac{m_{0,i}^{\mathrm{mission}}}
{m_{b,i}^{\mathrm{mission}}}\right).
\]

The browser exposes the downstream stack, attached burn/burnout masses, mass
ratio, effective specific impulse, and ideal delta-v for every serial row.

## Topology boundary

Parallel and booster stages are not silently flattened into the serial stack.
The stage-flight adapter passes only the topology's serial stage IDs and lists
excluded stages in the result, report, and warning surface. Their simultaneous
burn, separation timing, thrust-vector coupling, and residual propellant stay
in the trajectory preview and are not represented by this composition model.

## Interpretation limits

This is still an ideal rocket-equation composition preview. It excludes
gravity, aerodynamic, steering, throttle, residual-propellant, finite-burn,
separation-impulse, staging-delay, guidance, atmosphere, and trajectory losses.
The retained payload/recovery mass is an aggregated point-mass input from the
current assembly. No motor failure branch, contact response, structural limit,
or flight-safety corridor is inferred. The result is not a mission delta-v
budget, performance certification, or flight-safety determination.

The underlying logarithmic relation and effective specific-impulse derivation
follow the same public ideal-rocket-equation references recorded in
`stage-mass-ratio-0.1.md`; the implementation is original RocketWorks code and
does not reuse any third-party simulator or data package.
