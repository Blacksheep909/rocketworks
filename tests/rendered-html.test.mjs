import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Kestrel Lab workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Kestrel Lab/);
  assert.match(html, /Aerospace workbench/);
  assert.match(html, /Run estimate/);
  assert.match(html, /Independent implementation/);
  assert.match(html, /analytical-checks-only/);
  assert.match(html, /Static aerodynamics are low-speed and small-angle only/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /OpenRocket/);
});

test("ships the graphite and telemetry-blue aerospace visual system", async () => {
  const stylesheet = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(stylesheet, /--paper: #090d11/);
  assert.match(stylesheet, /--accent: #2f9fff/);
  assert.match(stylesheet, /--canvas: #e7ebee/);
  assert.doesNotMatch(stylesheet, /#187a56|#0d573c|#e3f1eb/i);
});

test("ships versioned flight results and explainable model UI", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /result\.modelVersion/);
  assert.match(source, /Flight events/);
  assert.match(source, /modelWarning\.explanation/);
  assert.match(source, /result\.assumptions/);
});

test("ships live center-of-pressure and static-margin feedback", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /computeStaticStability/);
  assert.match(source, /staticStability\.modelVersion/);
  assert.match(source, /staticStability\.staticMarginCalibers/);
  assert.match(source, /centerOfPressureMm/);
  assert.match(source, /Static aerodynamics are low-speed and small-angle only/);
});

test("ships an explicit stage hierarchy and configuration timeline", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const stylesheet = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(source, /Vehicle stage hierarchy/);
  assert.match(source, /Configuration timeline/);
  assert.match(source, /Current single-stage run/);
  assert.match(source, /No separation occurs in this estimate/);
  assert.match(source, /Multi-stage 6DOF runs switch mass, inertia, propulsion, CP/);
  assert.match(stylesheet, /\.configuration-timeline/);
  assert.match(stylesheet, /\.stage-summary/);
});

test("ships a seeded and clearly qualified uncertainty panel", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const stylesheet = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(source, /analyzeVerticalFlightUncertainty/);
  assert.match(source, /Dispersion envelope/);
  assert.match(source, /arc54-preview-v1/);
  assert.match(source, /not validation, certification, or a flight-safety assessment/);
  assert.match(stylesheet, /\.uncertainty-grid/);
  assert.match(stylesheet, /rgba\(47,159,255/);
});

test("routes browser mass properties through the hierarchical assembly graph", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /createVehicleAssemblyModel/);
  assert.match(source, /assembly\.massProperties/);
  assert.match(source, /Assembly graph/);
  assert.match(source, /assembly\.componentInstances\.length/);
  assert.match(source, /serial topology/);
});

test("shows provenance-qualified derived motor metrics", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /createMotorDataRecord/);
  assert.match(source, /Motor data/);
  assert.match(source, /previewMotor\.metrics\.impulseClassEstimate/);
  assert.match(source, /Synthetic preview curve/);
  assert.match(source, /not motor certification/);
});

test("shows a deterministic provenance-qualified launch environment", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /createLaunchEnvironmentModel/);
  assert.match(source, /Flight environment/);
  assert.match(source, /arc54-weather-v1/);
  assert.match(source, /Turbulence RMS L \/ T \/ V/);
  assert.match(source, /does not couple horizontal turbulence/);
  assert.match(source, /Synthetic deterministic Dryden-shaped environment/);
});

test("ships explicit constraint-aware design optimization", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const stylesheet = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(source, /optimizeVerticalFlightDesign/);
  assert.match(source, /Constraint-aware Pareto tradeoffs/);
  assert.match(source, /Your current design is not changed until you apply a recommendation/);
  assert.match(source, /evolutionary search cannot prove a global optimum/);
  assert.match(source, /Preview-model Mach applicability/);
  assert.match(source, /Canopy diameter/);
  assert.match(stylesheet, /\.optimization-card/);
  assert.match(stylesheet, /\.optimization-candidate\.recommended/);
});

test("ships an accessible interactive original 3D design viewport", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const viewport = await readFile(
    new URL("../app/rocket-3d-viewport.tsx", import.meta.url),
    "utf8",
  );
  const stylesheet = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(page, /Rocket3DViewport/);
  assert.match(page, /Design visualization mode/);
  assert.match(page, />3D<\/button>/);
  assert.match(viewport, /createRocketPreviewMesh/);
  assert.match(viewport, /Interactive three-dimensional ARC 54 preview/);
  assert.match(viewport, /onPointerMove/);
  assert.match(viewport, /onWheel/);
  assert.match(viewport, /onKeyDown/);
  assert.match(viewport, /Display mesh only/);
  assert.match(stylesheet, /\.rocket-3d-viewport canvas:focus-visible/);
  assert.match(stylesheet, /touch-action: none/);
});

test("ships a provenance-qualified recovery landing footprint", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const chart = await readFile(
    new URL("../app/landing-footprint-chart.tsx", import.meta.url),
    "utf8",
  );
  const stylesheet = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(page, /analyzeRecoveryLandingDispersion/);
  assert.match(page, /Landing footprint/);
  assert.match(page, /Recovery-phase drift/);
  assert.match(page, /arc54-landing-v1/);
  assert.match(page, /Ascent drift, terrain, obstacles/);
  assert.match(page, /Not a flight-safety corridor/);
  assert.match(chart, /50 \/ 90 \/ 95% covariance ellipses/);
  assert.match(chart, /role="img"/);
  assert.match(chart, /Local east-north landing footprint/);
  assert.match(stylesheet, /\.landing-footprint-chart/);
  assert.match(stylesheet, /\.landing-disclaimer/);
});

test("ships an accessible multi-format engineering export center", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(page, /setExportOpen\(true\)/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /Close export center/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /createKestrelProjectJson/);
  assert.match(page, /createFlightTraceCsv/);
  assert.match(page, /createEngineeringReportMarkdown/);
  assert.match(page, /createRocketProfileDxf/);
  assert.match(page, /createRocketOpenScad/);
  assert.match(page, /URL\.createObjectURL/);
  assert.match(page, /reference geometry—not drawings, toleranced solids/);
  assert.match(stylesheet, /\.export-backdrop/);
  assert.match(stylesheet, /\.export-grid button:focus-visible/);
});

test("ships validated device-local autosave and recoverable project history", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const projectState = await readFile(
    new URL("../lib/project/project-state.ts", import.meta.url),
    "utf8",
  );
  const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /LOCAL_PROJECT_STORAGE_KEY/);
  assert.match(page, /LOCAL_PROJECT_HISTORY_STORAGE_KEY/);
  assert.match(page, /window\.localStorage\.setItem/);
  assert.match(page, /parseLocalProjectSnapshot/);
  assert.match(page, /window\.setTimeout\(\(\) => \{/);
  assert.match(page, /\}, 600\)/);
  assert.match(page, /Local project history/);
  assert.match(page, /Close local project history/);
  assert.match(page, /Restored revision/);
  assert.match(page, /not cloud sync, collaboration, or a backup/);
  assert.match(projectState, /DEFAULT_LOCAL_HISTORY_LIMIT = 40/);
  assert.match(projectState, /validateEditableProjectInputs/);
  assert.match(projectState, /Unsupported local project schema version/);
  assert.match(stylesheet, /\.history-entry button:focus-visible/);
});

test("ships beginner and expert workflows with original templates and guidance", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const templates = await readFile(new URL("../lib/project/templates.ts", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /Experience mode/);
  assert.match(page, />Beginner<\/button>/);
  assert.match(page, />Expert<\/button>/);
  assert.match(page, /Start from a template/);
  assert.match(page, /Each template is an original Kestrel Lab configuration/);
  assert.match(page, /Build, check, then estimate/);
  assert.match(page, /How to read CG \/ CP/);
  assert.match(page, /Loaded template:/);
  assert.match(page, /Show expert details/);
  assert.match(templates, /first-flight/);
  assert.match(templates, /weather-study/);
  assert.match(templates, /ballistic-check/);
  assert.match(stylesheet, /\.beginner-guide/);
  assert.match(stylesheet, /\.template-grid/);
  assert.match(stylesheet, /\.mode-switch/);
});

test("ships a provenance-aware local motor library and mission-control visual language", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const motorState = await readFile(new URL("../lib/project/motor-library-state.ts", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /Motor library/);
  assert.match(page, /Validate and save motor/);
  assert.match(page, /Required header: time_s,thrust_n/);
  assert.match(page, /user-supplied-unvalidated/);
  assert.match(page, /Selected motor/);
  assert.match(page, /exportMotorThrustCsv/);
  assert.match(page, /mission-chip/);
  assert.match(page, /mission-rack/);
  assert.match(page, /CONFIG/);
  assert.match(page, /STAGES/);
  assert.match(page, /CHECK/);
  assert.match(page, /DESIGN LOOP/);
  assert.match(motorState, /LOCAL_MOTOR_LIBRARY_SCHEMA_ID/);
  assert.match(motorState, /LOCAL_MOTOR_LIBRARY_LIMIT = 24/);
  assert.match(motorState, /parseLocalMotorLibrary/);
  assert.match(stylesheet, /\.motor-dialog/);
  assert.match(stylesheet, /\.mission-chip/);
  assert.match(stylesheet, /--signal-amber: #f4a340/);
  assert.match(stylesheet, /\.mission-rack/);
  assert.match(stylesheet, /\.status-pulse/);
  assert.match(stylesheet, /\.workspace-status/);
  assert.match(page, /Command search/);
  assert.match(page, /openCommandPalette/);
  assert.match(page, /runSweep/);
  assert.match(stylesheet, /\.command-dialog/);
  assert.match(stylesheet, /\.command-item/);
});

test("ships an interactive multi-stage, booster, and radial-topology editor", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const topology = await readFile(new URL("../lib/project/vehicle-topology.ts", import.meta.url), "utf8");
  const stagePreview = await readFile(new URL("../lib/physics/stage-flight-preview.ts", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /Stages, boosters & clusters/);
  assert.match(page, /\+ Upper stage/);
  assert.match(page, /\+ Booster set/);
  assert.match(page, /Repeat count/);
  assert.match(page, /Radial radius/);
  assert.match(page, /Ignition delay/);
  assert.match(page, /Separation delay/);
  assert.match(page, /Motor assignment/);
  assert.match(page, /userMotorRecords.map/);
  assert.match(page, /Force ignition failure/);
  assert.match(page, /Topology-aware preview/);
  assert.match(page, /Run staged preview/);
  assert.match(page, /stageFlightResult\.validationStatus/);
  assert.match(page, /stage-flight-warnings/);
  assert.match(page, /Staged 6DOF trace/);
  assert.match(page, /createStageFlightTraceCsv/);
  assert.match(page, /MODEL BOUNDARY/);
  assert.match(page, /LOCAL_VEHICLE_TOPOLOGY_STORAGE_KEY/);
  assert.match(page, /createVehicleAssemblyModel\(assemblyDefinition\)/);
  assert.match(page, /createStagePlacements/);
  assert.match(page, /stageEnvelopeLengthM/);
  assert.match(page, /makePlacedStageComponents/);
  assert.match(topology, /MAX_VEHICLE_STAGES = 8/);
  assert.match(topology, /Parallel stage/);
  assert.match(topology, /parent must appear earlier/);
  assert.match(stagePreview, /simulateStageFlightPreview/);
  assert.match(stagePreview, /mathematical-regression-tests-only/);
  assert.match(stagePreview, /separated bodies/);
  assert.match(stylesheet, /\.topology-stage/);
  assert.match(stylesheet, /\.topology-stage-events/);
  assert.match(stylesheet, /\.topology-failure-toggle/);
  assert.match(stylesheet, /\.topology-add-actions/);
});

test("ships a bounded parameter-sweep workflow with inspectable exports", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const sweep = await readFile(new URL("../lib/physics/vertical-flight-sweep.ts", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /Parameter sweep/);
  assert.match(page, /Run sweep/);
  assert.match(page, /Rerun sweep/);
  assert.match(page, /createParameterSweepCsv/);
  assert.match(page, /verticalSweep: sweepResult/);
  assert.match(sweep, /sweepVerticalFlight/);
  assert.match(sweep, /flight-safety assessment/);
  assert.match(stylesheet, /\.sweep-card/);
  assert.match(stylesheet, /\.sweep-plot/);
  assert.match(stylesheet, /\.sweep-table/);
});
