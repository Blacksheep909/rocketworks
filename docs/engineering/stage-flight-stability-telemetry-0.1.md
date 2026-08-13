# Staged flight stability telemetry 0.1

Status: `engineering-preview-unvalidated`  
Implementation: `lib/physics/stage-flight-preview.ts`, `lib/export/project-exports.ts`  
Model: `kestrel-stage-flight-preview-0.37.0`

## Purpose

The coupled staged preview already evaluates the active topology's center of
pressure (CP), staging mass properties, and static margin at every solver
state. This slice preserves those values in the returned trace so a burn,
staging transition, or coefficient-table switch can be inspected rather than
being reduced to one design-time card.

Each trace sample carries, when available:

- `centerOfPressureXM`, measured from the nose datum in metres;
- `centerOfMassXM`, measured from the same datum in metres;
- `staticMarginCalibers`, the signed CP-minus-CG distance divided by the active
  reference diameter;
- `normalForceSlopePerRad`, the active static normal-force slope.

The browser trace inspector exposes CP, CG, and static-margin plot modes. The
staged trace CSV adds the same values as SI columns, and the engineering report
summarizes the available static-margin and CP/CG ranges.

## Relation and provenance

The evaluator uses the existing active-topology static-aerodynamics relation:

\[
M = \frac{x_{CP} - x_{CG}}{D_{ref}}
\]

where positive `M` means the computed CP lies aft of the CG under the
project's nose-to-tail coordinate convention. A coefficient table may replace
the nominal CP and normal-force slope at its queried Mach, Reynolds number,
angle-of-attack, and sideslip condition; its declared uncertainty factor is
already applied before the values reach the trace. The mass center comes from
the shared staging model at that solver state.

These are analytical component checks and interpolation outputs. They are not
dynamic stability derivatives, flutter evidence, control authority, contact
loads, or a launch approval. A null field is retained as unavailable rather
than substituted with a guessed value. Direct force/moment tables can carry
loads without supplying a stability estimate, so their CP/CG/margin fields
must be interpreted with the accompanying applicability and provenance
diagnostics.

## Automated checks

- staged simulation traces retain finite CP, CG, static-margin, and normal-force
  slope values across an attached-stage transition;
- legacy trace fixtures export blank stability cells rather than inventing
  values;
- CSV headers remain deterministic and include explicit SI units;
- rendered UI source includes the three stability plot modes;
- the complete regression suite and type/lint/build gates remain required.
