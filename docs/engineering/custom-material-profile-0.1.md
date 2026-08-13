# Custom material profile (0.1)

RocketWorks lets a project author describe an airframe material when the
representative Kraft, fiberglass, and carbon presets are not a useful match.
The profile is a portable input contract for the independent browser preview;
it is not a material database, certificate, laminate solver, or manufacturing
release.

## Stored fields

| Field | Display unit | Accepted range | Used by |
|---|---:|---:|---|
| `label` | text | 1–120 trimmed characters | reports and inspectors |
| `densityKgM3` | kg/m³ | 50–20,000 | shell mass and mass properties |
| `wallThicknessMm` | mm | 0.1–20 | shell geometry, mass, section properties |
| `youngsModulusGPa` | GPa | 0.01–500 | Euler buckling and bending-mode trend |
| `poissonRatio` | dimensionless | 0–0.49 | shell stiffness correction |
| `allowableCompressionMPa` | MPa | 0.01–2,000 | axial compression factor |
| `allowableBendingMPa` | MPa | 0.01–2,000 | fin/body bending factor |
| `allowableShearMPa` | MPa | 0.01–2,000 | fin-root shear factor |

Values are validated at project, share-link, component-preset, and import
boundaries. The UI exposes the same bounds through exact number inputs and
sliders so a copied project cannot silently inject non-finite or unbounded
material values.

## SI conversion and calculations

The profile is converted to the SI structural model with the following direct
unit transforms:

```text
wallThicknessM       = wallThicknessMm / 1000
youngsModulusPa       = youngsModulusGPa × 1e9
allowable*Pa          = allowable*MPa × 1e6
```

The airframe shell mass uses the independent thin-wall geometry path:

```text
mass = density × π × diameter × wallThickness × bodyLength
```

Section stiffness and preliminary load checks use the public thin-wall
relations already documented by the structural-screen module. The profile
does not add orthotropic axes, ply layups, knock-down factors, temperature or
moisture effects, fatigue, joints, fasteners, local buckling, damage growth,
or strain-rate behavior. Those omissions remain visible in the structural
screen assumptions and engineering report.

## Provenance boundary

Custom profiles are tagged `rocketworks-custom-material-profile-0.1.0` and
`user-supplied-unvalidated`. The source name is recorded as
“User-authored RocketWorks material profile” with a `user-declared` license
identifier. Users should record the actual datasheet, test method, specimen
orientation, temperature, safety factor, and laminate direction separately in
their project notes. A profile never upgrades a RocketWorks result into flight
safety evidence or manufacturing approval.
