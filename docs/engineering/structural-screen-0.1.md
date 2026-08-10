# Preliminary structural screen 0.1

Status: `analytical-component-checks-only`

Implementation: `lib/physics/structural-screen.ts`

This module is an independent, explainable design-readiness screen. It is
deliberately not a finite-element model, material certificate, manufacturing
release, flight-safety assessment, or substitute for qualified structural
review.

## Load cases

The axial load case combines peak modeled thrust and full vehicle weight:

```text
N = T_peak + m g
```

The screen evaluates the weakest circular shell section supplied by the
airframe component. For outer radius `r_o` and wall thickness `t`, the inner
radius is `r_i = r_o - t`, with:

```text
A = π (r_o² - r_i²)
I = π / 4 (r_o⁴ - r_i⁴)
σ_axial = N / A
```

The fin proxy uses the current flight result's maximum dynamic pressure when
available. Each fin is assigned an equal share of a simple normal-force load:

```text
F_fin = q C_N A_fin / n
M_root = F_fin (span / 2)
Z_root = root_chord thickness² / 6
σ_bending = M_root / Z_root
τ_shear = F_fin / (root_chord thickness)
```

The default `C_N = 0.8` is a declared screening assumption, not a measured
fin coefficient. A stale or missing flight result leaves fin-load checks
visible as `unavailable` rather than silently substituting a different run.

## Buckling proxy

The airframe is treated as a pinned-pinned Euler column with effective-length
factor `K = 1.0`:

```text
P_cr = π² E I / (K L)²
λ = K L / √(I / A)
```

The calculation is intentionally limited to global elastic buckling. It does
not model local shell buckling, ovalization, joints, couplers, motor mounts,
thrust eccentricity, pressure differential, vibration, launch-rail contact,
damage, temperature, layup orientation, or manufacturing tolerances.

## Material models

The browser exposes representative Young's modulus and allowable stress values
for the three educational material choices. These are screen parameters only;
they are not supplier datasheets and do not include a process-specific knockdown
or environmental qualification. The report records the selected label and all
screen assumptions so a future project can replace them with reviewed data.

## Interpretation

The default review target is a factor of safety of `1.5`. A `pass` means only
that the simplified demand/capacity ratio clears that threshold. `review`
includes ratios below target and any unavailable fin or stability check. When
a current maximum airspeed and local atmosphere are available, the structural
screen also includes the optional [preliminary fin flutter
screen](fin-flutter-0.1.md). Its default `1.25` speed margin and Mach 0.8
review guard are separate from the structural `1.5` target. The overall status
must never be promoted to flight-safe or manufacturing-approved without
independent analysis, test evidence, and operational review.
