# Security policy

RocketWorks is an engineering-preview application. It is not a flight-control
system, a range-safety system, or a source of certified launch decisions.

## Reporting a vulnerability

Please do not publish credentials, exploit details, or sensitive project data
in a public issue. When the project is hosted on GitHub, use a private GitHub
Security Advisory. If private advisories are not enabled, contact the project
maintainer through the private channel associated with the repository and
include:

- the affected commit or version;
- the smallest reproducible example;
- impact and preconditions; and
- any suggested mitigation.

Reports about model limitations, numerical discrepancies, or unsafe
engineering interpretations should include the relevant input fixture and
should be filed as normal issues unless they expose a security vulnerability.

## Supported versions

Only the latest mainline commit is expected to receive security fixes while
the project is in prototype development. Dependencies are reviewed as part of
normal maintenance; users should run the current lockfile and avoid deploying
unreviewed builds to sensitive environments.
