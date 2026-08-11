# Contributing to RocketWorks

RocketWorks is an independent, browser-first rocket design and flight-analysis
project. Contributions are welcome when they improve clarity, reproducibility,
accessibility, or engineering usefulness without weakening the project’s
provenance boundary.

## Before opening a change

- Read the engineering notes in `docs/engineering/` for the model you are
  changing.
- Keep equations, units, reference conditions, model versions, warnings,
  assumptions, and validation status explicit.
- Do not copy, translate, link, bundle, or adapt OpenRocket source code, UI
  code, assets, databases, simulation code, or backend components. OpenRocket
  may only remain an external compatibility or behavior reference where
  legally appropriate.
- Do not add third-party coefficient or motor data without a source name,
  data version, license identifier, attribution, and validation status.
- Treat every result as an engineering preview unless independent evidence
  supports a stronger claim. Regression tests are not flight-safety validation.

## Local workflow

The project requires Node.js `>=22.13.0`. The regression command explicitly
uses Node 22's `--experimental-strip-types` loader because the tests import
the original TypeScript modules directly; this keeps local and CI runtimes
consistent until the test harness is compiled as a separate artifact.

```bash
npm install
npm run lint
npm test
npm run build
```

`npm test` builds the browser app and runs deterministic physics, state,
export, UI-source, and rendered-HTML checks. Changes that affect a model or
export should include a focused regression test and an update to the matching
engineering note.

## Pull requests

Keep pull requests focused and describe:

1. the user-facing or engineering problem;
2. the equations, standards, or original implementation used;
3. the scope limits and any new warnings;
4. the tests and commands run; and
5. whether a schema, CSV, project-export, or model-version change is included.

Avoid committing build output, local environment files, credentials, or user
project data. New UI should preserve keyboard access, readable focus states,
responsive layouts, and the graphite/telemetry-blue visual language.
