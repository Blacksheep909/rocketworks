# Local aerodynamic coefficient library 0.1

Status: `engineering-preview-unvalidated`.

Kestrel Lab now accepts rectangular Mach–Reynolds coefficient surfaces through
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

Rows correspond to Reynolds points and columns correspond to Mach points. Kestrel
interpolates Mach linearly and Reynolds in `log10(Re)` between the supplied
nodes. A default table limit of eight records keeps the browser-local library
bounded and inspectable.

## Simulation coupling

The selected table is applied to every generated topology regime in the
coupled, topology-aware 6DOF preview. The runtime queries the table with the
current Mach and atmosphere-derived Reynolds number, carrying coefficient
uncertainty, applicability issues, and provenance into the load diagnostics.
Boundary clamping is never silent: each exceeded axis becomes an unsupported
applicability warning.

The fast vertical estimate deliberately continues to use its explicit constant
drag coefficient. This preserves a transparent, deterministic comparison path
while the table-backed 6DOF path exercises the Mach/Reynolds model. The Flight
inspector labels this distinction and the project export includes the selected
table definition or constant-Cd fallback.

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
