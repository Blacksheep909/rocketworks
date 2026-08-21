# Coupled-flight persistence 0.1

Status: `engineering-preview-unvalidated`.

RocketWorks treats the coupled-flight contract as part of the editable design
configuration. A result can change when the released-body aerodynamic mode,
mutual point-mass gravity, numerical integration method, or contact-load
screen assumptions change, so new autosave snapshots, project JSON documents,
and design-share links carry these choices alongside geometry and source
selections.

## Persisted settings

The schema accepts the following additive fields:

- `coupledMutualGravityEnabled` and
  `coupledGravitySofteningRadiusM` select the optional shared-grid point-mass
  gravity extension and its Plummer-style close-approach regularization;
- `releasedBodyDragModel` selects isotropic point drag, projected-area/static
  loads, or live coefficient-table loads for released bodies;
- `coupledMultiBodyIncludeRetainedBody` opts the staged adapter into a
  replay-backed retained-vehicle rigid seed in the shared coupled track;
- `coupledRelativeAeroForceFeedbackEnabled` opts the shared track into the
  bounded strongest-source wake-deficit sensitivity branch; its geometry and
  deficit controls reuse the persisted relative-flow settings;
- `separationContactStoppingDistanceM` and
  `separationContactCoefficientOfRestitution` configure the separate
  non-trajectory contact-load screen;
- `sixDofIntegrationMethod` selects fixed RK4 or adaptive RK4 step-doubling.

All values are validated at the project boundary with the same finite bounds
used by the browser controls. Existing schema-v1 documents omit these additive
keys and intentionally restore to the compatibility defaults: shared
environment only, 0.02 m softening, detached bodies only, wake feedback
disabled, isotropic point drag, 0.01 m stopping distance, zero restitution, and
fixed RK4. This is a migration default, not a
claim that the legacy document used those settings explicitly.

The fields are configuration provenance, not validation evidence. The coupled
simulation remains an analytical engineering preview and must not be treated
as flight-safety, range-safety, or collision-certification data.

## Clean-room boundary

This persistence contract is original RocketWorks code. It carries only
validated design values and source identifiers; it does not bundle third-party
simulation engines, motor databases, aerodynamic databases, or copied project
formats.
