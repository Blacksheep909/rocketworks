# Portable browser shell 0.1

Status: `engineering-preview-unvalidated`

RocketWorks now publishes an original standards-based web app manifest, a
small original SVG mark, and a network pass-through service worker. Supported
browsers can install the workbench as a standalone window on a desktop, tablet,
or phone while using the same browser runtime and local project storage.

The manifest is deliberately a presentation and launch-surface contract. This
increment does **not** add an offline cache, background simulation, push
notifications, or a native desktop binary. The service worker intentionally
forwards every GET request to the network. No offline or flight-continuity
claim is made: network availability, browser storage policy, and device
capability remain deployment concerns.

The icon is original RocketWorks artwork and contains no third-party brand
assets. The future desktop wrapper can reuse the same web entry point after
storage, file permissions, update delivery, and simulation-worker behavior are
validated on Windows, macOS, and Linux.
