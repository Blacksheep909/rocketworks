# Gimbal control-authority envelope (0.1)

Status: analytical actuator envelope; regression-tested, not flight validated  
Implementation: `lib/physics/gimbal-control-authority.ts`, `lib/physics/stage-flight-preview.ts`, `app/page.tsx`, and `lib/export/project-exports.ts`  
Model: `rocketworks-gimbal-control-authority-0.1.0`  
Validation status: `analytical-actuator-envelope`

## Purpose and scope

RocketWorks reports a bounded, post-trace screen for the instantaneous effect of configured thrust-vector gimbals. It answers a narrow engineering question: given the recorded thrust axis, thrust level, motor application point, and sampled rigid-body inertia, what force, moment, and angular-acceleration magnitude could the currently thrusting gimballed motors produce at the configured command envelope?

The screen is deliberately not a guidance or control system. It does not feed a corrective force or moment back into the 6DOF integration, and it does not claim actuator sizing, stability, controllability, flight readiness, or safety.

## Inputs

Each staged trace sample supplies:

- the sample time and live center-of-mass mass properties;
- each motor's instantaneous thrust magnitude and body-frame thrust axis;
- each motor's body-frame thrust application point;
- whether the motor has a configured gimbal-axis schedule and its optional response-time context; and
- the recorded static-plus-rate-damping aerodynamic moment vector for an optional magnitude comparison.

The topology editor bounds authored pitch and yaw gimbal offsets to ±15°. The analyzer uses that same bound as its command envelope rather than inferring additional authority from an unbounded input.

## Derivation

For each configured motor with positive thrust, the current axis is normalized and two deterministic transverse bases are constructed. Nine command corners are evaluated at pitch/yaw values `{−15°, 0°, +15°}`. A commanded axis is formed using the tangent-plane construction used by the topology model:

```text
a_cmd = normalize(a + p̂ tan(δ) pitch_sign + ŷ tan(δ) yaw_sign)
ΔF = T (a_cmd − a)
τ = r × ΔF
I α = τ
```

`r` is the motor application point relative to the sampled center of mass. `I α = τ` is solved against the sampled inertia tensor using the independent clean-room 3×3 linear algebra implementation.

For each motor, the largest magnitude across those nine corners is retained for force, moment, and angular acceleration. The result then sums those individual maxima. This is an intentionally conservative independent-actuator envelope; it is not a coordinated allocation or an achievable simultaneous vector command.

The optional control-to-aerodynamic-moment ratio is the scalar ratio of the summed control-moment envelope to the recorded aerodynamic-moment magnitude at the same sample. Samples with no positive aerodynamic moment do not produce a ratio.

## Interpretation

`available` means at least one trace sample has positive thrust through a configured gimballed motor. `watch` means schedules exist but no positive-thrust sample was available. `not-assessed` means no motor has a configured gimbal schedule or no trace samples were supplied. Coverage is the fraction of trace samples with positive-thrust gimbal authority; intermittent staging or burnout is reported rather than silently filled.

The response time is retained as context only. It is not converted into a rate limit, lag state, servo saturation, or closed-loop response.

## Explicit limitations

This diagnostic excludes:

- closed-loop guidance, attitude estimation, controller gains, control allocation, and command arbitration;
- actuator rate limits, servo saturation, deadband, backlash, latency variation, failures, and power limits;
- structural stiffness, joint compliance, body flexure, slosh, vibration, and load-path capacity;
- plume interaction, base drag, aerodynamic control derivatives, propellant feed dynamics, and transient thrust response; and
- hardware calibration, wind-tunnel correlation, flight-test validation, reliability, range safety, or flight-safety evidence.

The UI, CSV, and engineering report label this result as an analytical envelope and preserve its assumptions and warnings. Any flight or hardware decision requires independently validated models, test data, and qualified engineering review.
