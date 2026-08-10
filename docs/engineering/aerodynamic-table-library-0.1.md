# Local aerodynamic coefficient library 0.1

Status: `engineering-preview-unvalidated`.

RocketWorks now accepts rectangular Mach–Reynolds coefficient surfaces through
an explicit device-local import workflow. This is an original clean-room data
boundary. It does not bundle OpenRocket source, coefficient data, UI, assets,
databases, or simulation code.

## What can be supplied

Each table definition contains:

- a stable identifier and display name;
- strictly increasing Mach and Reynolds axes;
- rectangular `CD`, `CNa`, and body-axis `xCP` surfaces;
- optional roll, pitch, and yaw damping surfaces;
- optional non-negative absolute uncertainty surfaces;
- an out-of-range policy (`reject` or `clamp-with-warning`); and
- source, version, licence, attribution, and validation-status metadata.

Rows correspond to Reynolds points and columns correspond to Mach points. RocketWorks
interpolates Mach linearly and Reynolds in `log10(Re)` between the supplied
nodes. A default table limit of eight records keeps the browser-local library
bounded and inspectable.

## Browser inspection

The Aerodynamic data modal includes an accessible inspector for every imported
surface. The operator can switch between drag, normal-force, center-of-pressure,
and optional roll/pitch/yaw damping grids, while each cell preserves the exact
Mach/Reynolds axes and any declared absolute uncertainty. The inspector also
shows the interpolation rule, domain, out-of-range policy, source, data version,
and validation status before the table is selected for a run. This is a display
and provenance aid; it does not validate the aerodynamic accuracy of the source.

## Simulation coupling

The selected table is applied to every generated topology regime in the
coupled, topology-aware 6DOF preview and can also drive the fast vertical
estimate. Both paths query the table with current Mach and
atmosphere-derived Reynolds number, carrying applicability issues and
provenance into the result. Boundary clamping is never silent: each exceeded
axis becomes an unsupported applicability warning. A rejected query falls
back to the explicitly configured constant Cd for that sample and records a
warning rather than silently discarding the table.

The Flight inspector labels the active coefficient basis, and the project
export includes the selected table definition or constant-Cd fallback.

## Storage and safety boundary

Definitions are validated before they enter browser storage. Malformed grids,
duplicate identifiers, invalid provenance, non-finite values, and unsupported
schema versions are rejected without replacing an existing record. The library
is local to the browser profile; it is not cloud sync or a source-licence
verifier. Imported data remain `user-supplied-unvalidated` unless the supplied
provenance explicitly describes another allowed status.

This workflow validates document shape and interpolation mechanics only. It
does not validate wind-tunnel, CFD, flight-test, or published aerodynamic
accuracy, reference axes, signs, reference areas, unit conventions, or source
licensing. No result is flight-safe by virtue of being imported or tabulated.
