# Preliminary fin flutter screen 0.1

Status: `preliminary-naca-tn-4197-style-screen`

Implementation: `lib/physics/fin-flutter.ts`

RocketWorks uses this small, explainable screen to flag fin geometries that
need aeroelastic review. It is an independent implementation of the
thin-plate preliminary relation described in NACA Technical Note 4197,
[Summary of Flutter Experiences as a Guide to the Preliminary Design of
Lifting Surfaces on Missiles](https://ntrs.nasa.gov/citations/19930085030).
The implementation follows the public equation transcription at
[RocketFlutter's equations reference](https://rocketflutter.com/equations.html)
only as a readable notation aid; it does not import code, assets, or an
engine from another simulator.

## Relation

For a trapezoidal fin with root chord `c_r`, tip chord `c_t`, span `s`, sweep
offset `x_s`, and thickness `t`:

```text
lambda = c_t / c_r
A      = ((c_r + c_t) / 2) s
AR     = s^2 / A

x_c = (2 c_t x_s + c_t^2 + x_s c_r + c_t c_r + c_r^2)
      / (3 (c_t + c_r))
epsilon = x_c / c_r - 0.25
```

With isotropic Young's modulus `E`, Poisson ratio `nu`, local pressure `p`,
reference pressure `p_0`, and heat-capacity ratio `gamma`:

```text
G = E / (2 (1 + nu))
D = 24 epsilon gamma p_0 / pi
F = D AR^3 / ((t / c_r)^3 (AR + 2))
    * ((lambda + 1) / 2) * (p / p_0)
V_f = a sqrt(G / F)
V_safe = V_f / SF
```

The reported factor of safety is `V_f / V_max`. The screen passes only when
that ratio clears the configured `SF` (default `1.25`) and the selected
condition is below Mach 0.8. A missing current airspeed or local atmosphere
keeps the result `unavailable`.

## Scope and limits

This is a thin, flat, uniform, linearly elastic fin proxy. It does not model
body-fin coupling, transonic or supersonic flow, damping, mass balancing,
fillets, skins, joints, adhesive, local buckling, dynamic pressure
transients, thermal effects, manufacturing variation, or test-derived
material knockdowns. The result is an engineering-preview design flag only;
it is not flutter certification, structural qualification, or flight-safety
evidence.
