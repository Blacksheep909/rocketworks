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

test("server-renders the RocketWorks workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>RocketWorks/);
  assert.match(html, /Aerospace workbench/);
  assert.match(html, /Run estimate/);
  assert.match(html, /Independent implementation/);
  assert.match(html, /analytical-checks-only/);
  assert.match(html, /Static aerodynamics are low-speed and small-angle only/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /OpenRocket/);
});

test("ships an installable browser shell without claiming offline simulation", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(layout, /rocketworks-mark\.svg/);
  assert.match(layout, /PwaRegistration/);
  assert.match(await readFile(new URL("../app/pwa-registration.tsx", import.meta.url), "utf8"), /serviceWorker\.register/);
  assert.match(await readFile(new URL("../public/sw.js", import.meta.url), "utf8"), /fetch\(event\.request\)/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.theme_color, "#070a0d");
  assert.equal(manifest.icons[0].src, "/rocketworks-mark.svg");
  assert.equal(manifest.icons[0].purpose, "any maskable");
});

test("ships the graphite and telemetry-blue aerospace visual system", async () => {
  const stylesheet = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(stylesheet, /--paper: #090d11/);
  assert.match(stylesheet, /--accent: #2f9fff/);
  assert.match(stylesheet, /--canvas: #e7ebee/);
  assert.match(stylesheet, /--launch-orange: #ff7043/);
  assert.match(stylesheet, /VEHICLE GEOMETRY  \/  REV 01/);
  assert.match(stylesheet, /Launch-control visual pass/);
  assert.doesNotMatch(stylesheet, /#187a56|#0d573c|#e3f1eb/i);
});

test("ships versioned flight results and explainable model UI", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /result\.modelVersion/);
  assert.match(source, /Flight events/);
  assert.match(source, /Vertical flight profile/);
  assert.match(source, /FLIGHT_METRICS/);
  assert.match(source, /Dynamic pressure/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /modelWarning\.explanation/);
  assert.match(source, /result\.assumptions/);
  assert.match(source, /createSimulationFingerprint/);
  assert.match(source, /resultIsCurrent/);
  assert.match(source, /RERUN REQUIRED/);
  assert.match(source, /SIMULATION_FRESHNESS_MODEL_VERSION/);
  assert.match(source, /addCompactPackageInertia/);
  assert.match(source, /compact-package shape inertia placeholder/);
  assert.match(source, /Separated trajectories/);
  assert.match(source, /separatedBodies/);
  assert.match(source, /Multi-body COM separation/);
  assert.match(source, /Detached dV/);
  assert.match(source, /mass-ratio-linear-momentum/);
  assert.match(source, /equal-and-opposite linear-momentum/);
  assert.match(source, /analytical component check/);
});

test("ships a portable project import path with validated restoration warnings", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const exportSource = await readFile(new URL("../lib/export/project-exports.ts", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /parseKestrelProjectJson/);
  assert.match(source, /Import RocketWorks project/);
  assert.match(source, /projectImportInputRef/);
  assert.match(source, /rerun estimates to refresh results/);
  assert.match(exportSource, /export function parseKestrelProjectJson/);
  assert.match(exportSource, /validateEditableProjectInputs/);
  assert.match(exportSource, /validateVehicleTopology/);
  assert.match(stylesheet, /export-import-option/);
});

test("ships a validated browser design-share path without bundling local libraries", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const shareSource = await readFile(new URL("../lib/project/project-share.ts", import.meta.url), "utf8");
  assert.match(source, /encodeProjectShare/);
  assert.match(source, /decodeProjectShare/);
  assert.match(source, /Share design link/);
  assert.match(source, /Referenced motor/);
  assert.match(shareSource, /PROJECT_SHARE_HASH_PREFIX/);
  assert.match(shareSource, /validateEditableProjectInputs/);
  assert.match(shareSource, /validateVehicleTopology/);
  assert.match(shareSource, /never embeds local libraries|local motor records/);
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

test("ships a component-aware geometry inspector", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const state = await readFile(
    new URL("../lib/project/project-state.ts", import.meta.url),
    "utf8",
  );
  const stylesheet = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(source, /selected === "nose"/);
  assert.match(source, /nose-profile/);
  assert.match(source, /selected === "fins"/);
  assert.match(source, /fin-root-chord/);
  assert.match(source, /selected === "mount"/);
  assert.match(source, /selected === "recovery"/);
  assert.match(source, /recovery-mass/);
  assert.match(source, /componentDetails/);
  assert.match(source, /noseProfile=\{noseProfile\}/);
  assert.match(state, /noseLengthMm/);
  assert.match(state, /finSweepMm plus finTipChordMm/);
  assert.match(stylesheet, /\.component-note/);
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
  assert.match(source, /aerodynamicCoefficientBasis/);
  assert.match(source, /CD TABLE/);
  assert.match(source, /DEFAULT_UNCERTAINTY_SEED/);
  assert.match(source, /uncertaintySampleCount/);
  assert.match(source, /uncertaintySeed/);
  assert.match(source, /convergence/);
  assert.match(source, /formatConvergenceStatus/);
  assert.match(source, /Split-sample stability/);
  assert.match(source, /UncertaintySensitivityList/);
  assert.match(source, /UncertaintyCorrelationEditor/);
  assert.match(source, /UncertaintySettingsEditor/);
  assert.match(source, /uncertaintyCorrelations/);
  assert.match(source, /FlightDataComparisonCard/);
  assert.match(source, /importMotorRaspEng/);
  assert.match(source, /exportMotorRaspEng/);
  assert.match(source, /RASP \.eng/);
  assert.match(source, /parseFlightDataCsv/);
  assert.match(source, /compareFlightDataToStageTrace/);
  assert.match(source, /createFlightDataComparisonCsv/);
  assert.match(source, /Compare an instrumented flight/);
  assert.match(source, /flight-data-trace-source/);
  assert.match(source, /coupled 6DOF/);
  assert.match(source, /Residuals are simulated minus measured/);
  assert.match(source, /Measured time offset/);
  assert.match(source, /Simulation time = measured time \+ offset/);
  assert.match(source, /Export residuals/);
  assert.match(source, /PhysicsBenchmarkCard/);
  assert.match(source, /runPhysicsBenchmarkSuite/);
  assert.match(source, /Deterministic physics benchmarks/);
  assert.match(source, /Gaussian-copula pair/);
  assert.match(source, /Apogee sensitivity/);
  assert.match(source, /recoveryAreaScale/);
  assert.match(source, /recoveryDeploymentSuccess/);
  assert.match(source, /recovery-deployed/);
  assert.match(source, /Impact speed P05 \/ P50 \/ P95/);
  assert.match(source, /Recovery delay offset/);
  assert.match(source, /maxRecoveryDragN/);
  assert.match(source, /not validation, certification, or a flight-safety assessment/);
  assert.match(stylesheet, /\.uncertainty-grid/);
  assert.match(stylesheet, /\.uncertainty-convergence/);
  assert.match(stylesheet, /\.uncertainty-sensitivity/);
  assert.match(stylesheet, /\.uncertainty-correlation-card/);
  assert.match(stylesheet, /\.uncertainty-settings-card/);
  assert.match(stylesheet, /\.uncertainty-status-converged/);
  assert.match(stylesheet, /\.flight-data-card/);
  assert.match(stylesheet, /\.flight-data-table/);
  assert.match(stylesheet, /\.flight-data-controls/);
  assert.match(stylesheet, /\.flight-data-controls select/);
  assert.match(stylesheet, /\.benchmark-card/);
  assert.match(stylesheet, /\.benchmark-table/);
  assert.match(stylesheet, /rgba\(47,159,255/);
});

test("ships the separated-body telemetry branch with explicit ballistic limits", async () => {
  const source = await readFile(
    new URL("../lib/physics/stage-flight-preview.ts", import.meta.url),
    "utf8",
  );
  const stylesheet = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(source, /simulateSeparatedBodyFlight/);
  assert.match(source, /createRecoverySystemModel/);
  assert.match(source, /recoveryDevices/);
  assert.match(source, /recoveryDragN/);
  assert.match(source, /Explicit separation events spawn a separate ballistic/);
  assert.match(source, /referenceAreaM2/);
  assert.match(source, /bounded isotropic point drag/);
  assert.match(source, /retainedBodyTrace/);
  assert.match(source, /retainedBodyTrace/);
  assert.match(source, /analyzeMultiBodySeparation/);
  assert.match(source, /multiBodySeparation/);
  assert.match(stylesheet, /\.stage-separated-bodies/);
  assert.match(stylesheet, /\.stage-separated-body-grid/);
  assert.match(stylesheet, /\.stage-multi-body-separation/);
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
  assert.match(source, /relativeHumidityPercent/);
  assert.match(source, /surfacePressureHpa/);
  assert.match(source, /surfaceTemperatureC/);
  assert.match(source, /windAzimuthDeg/);
  assert.match(source, /Wind azimuth · east toward north/);
  assert.match(source, /Pad pressure/);
  assert.match(source, /Pad temperature/);
  assert.match(source, /Air density @ 500 m/);
  assert.match(source, /Sound speed @ 500 m/);
  assert.match(source, /versioned horizontal ascent-drift proxy/);
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
  assert.match(source, /Find robust designs/);
  assert.match(source, /robustApogeeP05M/);
  assert.match(source, /finite Latin-hypercube uncertainty scenarios/);
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
  assert.match(page, /previewComponentInstances/);
  assert.match(page, /componentInstances={previewComponentInstances}/);
  assert.match(page, /highlightSurface/);
  assert.match(page, /onSurfaceSelect/);
  assert.match(page, /onComponentSelect/);
  assert.match(page, /Design visualization mode/);
  assert.match(page, />3D<\/button>/);
  assert.match(viewport, /createRocketPreviewMesh/);
  assert.match(viewport, /RocketPreviewStageInstance/);
  assert.match(viewport, /Stage visibility controls/);
  assert.match(viewport, /pickProjectedRocketPart/);
  assert.match(viewport, /onStageSelect/);
  assert.match(viewport, /Interactive three-dimensional ARC 54 preview/);
  assert.match(viewport, /Click a rendered surface to select/);
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
  assert.match(page, /recoveryDeploymentSuccess/);
  assert.match(page, /recoveryDeploymentSuccessProbability/);
  assert.match(page, /relativeHumidityPercent/);
  assert.match(page, /Deployment success assumption/);
  assert.match(page, /Canopy opening schedule/);
  assert.match(page, /recoveryReefingEnabled/);
  assert.match(page, /recoveryReefingDurationS/);
  assert.match(page, /recoveryReefingStartAreaFraction/);
  assert.match(page, /recovery-provenance/);
  assert.match(page, /estimateAscentWindDrift/);
  assert.match(page, /landingPrediction\.ascentDrift/);
  assert.match(page, /Wind-drag proxy included/);
  assert.match(page, /Sample stability/);
  assert.match(page, /deploymentScenario/);
  assert.match(page, /Bernoulli/);
  assert.match(page, /failed<\/strong>/);
  assert.match(page, /assumed/);
  assert.match(page, /scenario-specific ascent wind-drag handoff/);
  assert.match(page, /Not a flight-safety corridor/);
  assert.match(chart, /50 \/ 90 \/ 95% covariance ellipses/);
  assert.match(chart, /role="img"/);
  assert.match(chart, /Local east-north landing footprint/);
  assert.match(stylesheet, /\.landing-footprint-chart/);
  assert.match(stylesheet, /\.landing-disclaimer/);
  assert.match(stylesheet, /\.landing-reliability/);
  assert.match(stylesheet, /\.landing-reefing/);
  assert.match(stylesheet, /\.landing-convergence/);
  assert.match(stylesheet, /\.landing-ascent-drift/);
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
  assert.match(page, /createUncertaintyCsv/);
  assert.match(page, /Uncertainty samples/);
  assert.match(page, /createEngineeringReportMarkdown/);
  assert.match(page, /stageFlight: stageFlightIsCurrent \? stageFlightResult : null/);
  assert.match(page, /createRocketProfileDxf/);
  assert.match(page, /createRocketOpenScad/);
  assert.match(page, /computeStructuralScreen/);
  assert.match(page, /STRUCTURAL SCREEN/);
  assert.match(page, /Analytical component checks only/);
  assert.match(page, /URL\.createObjectURL/);
  assert.match(page, /Run the vertical estimate again before exporting simulation results/);
  assert.match(page, /Rerun the coupled 6DOF preview before exporting its trace/);
  assert.match(page, /reference geometry—not drawings, toleranced solids/);
  assert.match(stylesheet, /\.export-backdrop/);
  assert.match(stylesheet, /\.structural-screen-card/);
  assert.match(stylesheet, /\.structural-check-review/);
  assert.match(stylesheet, /\.structural-check-review/);
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
  assert.match(page, /setLaunchRailEnabled/);
  assert.match(page, /launchRailLengthM/);
  assert.match(page, /launchRailInclinationDeg/);
  assert.match(page, /launchRailAzimuthDeg/);
  assert.match(page, /recoveryDeploymentSuccessProbability/);
  assert.match(page, /recoveryReefingEnabled/);
  assert.match(page, /recoveryReefingDurationS/);
  assert.match(page, /recoveryReefingStartAreaFraction/);
  assert.match(page, /window\.setTimeout\(\(\) => \{/);
  assert.match(page, /\}, 600\)/);
  assert.match(page, /Local project history/);
  assert.match(page, /Close local project history/);
  assert.match(page, /Restored revision/);
  assert.match(page, /not cloud sync, collaboration, or a backup/);
  assert.match(projectState, /DEFAULT_LOCAL_HISTORY_LIMIT = 40/);
  assert.match(projectState, /launchRailEnabled/);
  assert.match(projectState, /launchRailLengthM/);
  assert.match(projectState, /launchRailInclinationDeg/);
  assert.match(projectState, /launchRailAzimuthDeg/);
  assert.match(projectState, /recoveryDeploymentSuccessProbability/);
  assert.match(projectState, /recoveryReefingEnabled/);
  assert.match(projectState, /recoveryReefingDurationS/);
  assert.match(projectState, /recoveryReefingStartAreaFraction/);
  assert.match(projectState, /relativeHumidityPercent/);
  assert.match(projectState, /surfacePressureHpa/);
  assert.match(projectState, /surfaceTemperatureC/);
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
  assert.match(page, /Each template is an original RocketWorks configuration/);
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

test("ships a provenance-aware local aerodynamic table workflow", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const library = await readFile(new URL("../lib/project/aero-library-state.ts", import.meta.url), "utf8");
  const stageAware = await readFile(new URL("../lib/physics/stage-aware-aerodynamics.ts", import.meta.url), "utf8");
  const verticalFlight = await readFile(new URL("../lib/physics/vertical-flight.ts", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /Aerodynamic data/);
  assert.match(page, /Mach–Reynolds coefficient surface/);
  assert.match(page, /Validate and save table/);
  assert.match(page, /id: "user-aero-table-01"/);
  assert.match(page, /selectedAerodynamicTable/);
  assert.match(page, /AerodynamicTableInspector/);
  assert.match(page, /Mach \/ Reynolds grid/);
  assert.match(page, /absolute grid supplied/);
  assert.match(page, /aerodynamicTable: selectedAerodynamicTable/);
  assert.match(verticalFlight, /mach-reynolds-table/);
  assert.match(page, /globalTable: aerodynamicTable \?\? null/);
  assert.match(page, /Coefficient tables now drive both the fast vertical estimate/);
  assert.match(library, /LOCAL_AERODYNAMIC_LIBRARY_LIMIT = 8/);
  assert.match(library, /parseLocalAerodynamicLibrary/);
  assert.match(library, /createAerodynamicCoefficientTable/);
  assert.match(stageAware, /multiple aerodynamic tables/);
  assert.match(stylesheet, /.aerodynamic-dialog/);
  assert.match(stylesheet, /.aerodynamic-record/);
  assert.match(stylesheet, /.aerodynamic-inspector/);
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
  assert.match(page, /Aero table/);
  assert.match(page, /aerodynamicTableId/);
  assert.match(page, /userMotorRecords.map/);
  assert.match(page, /Force ignition failure/);
  assert.match(page, /Failed motors \(1-based\)/);
  assert.match(page, /failedMotorInstanceIndices/);
  assert.match(page, /Topology-aware preview/);
  assert.match(page, /Coupled dynamics preview/);
  assert.match(page, /6DOF ascent run/);
  assert.match(page, /Run staged preview/);
  assert.match(page, /Run 6DOF preview/);
  assert.match(page, /Launch rail constraint/);
  assert.match(page, /launchRailEnabled/);
  assert.match(page, /Inclination from vertical/);
  assert.match(page, /Azimuth · east toward north/);
  assert.match(page, /stage-flight-rail/);
  assert.match(page, /stageFlightResult\.validationStatus/);
  assert.match(page, /stage-flight-warnings/);
  assert.match(page, /analyzeStageFlightUncertainty/);
  assert.match(page, /6DOF uncertainty envelope/);
  assert.match(page, /Run dispersion/);
  assert.match(page, /stageUncertaintyIsCurrent/);
  assert.match(page, /StageFlightProfileChart/);
  assert.match(page, /Vertical vs coupled preview/);
  assert.match(page, /formatSignedMetric/);
  assert.match(page, /stage-flight-comparison/);
  assert.match(page, /Stage flight profile/);
  assert.match(page, /Dynamic pressure/);
  assert.match(page, /key: "angleOfAttack", label: "AoA"/);
  assert.match(page, /key: "sideslip", label: "Sideslip"/);
  assert.match(page, /point\.dynamicPressurePa/);
  assert.match(page, /point\.angleOfAttackRad/);
  assert.match(page, /point\.sideslipRad/);
  assert.match(page, /Motor-state diagnostics/);
  assert.match(page, /clusterDiagnostics/);
  assert.match(page, /Integration-step convergence/);
  assert.match(page, /formatStageFlightConvergenceStatus/);
  assert.match(page, /aria-label=\{`\$\{definition\.label\} over time/);
  assert.match(page, /attachedStageIds\.join/);
  assert.match(page, /ArrowRight/);
  assert.match(page, /ArrowLeft/);
  assert.match(page, /Staged 6DOF trace/);
  assert.match(page, /createStageFlightTraceCsv/);
  assert.match(page, /MODEL BOUNDARY/);
  assert.match(page, /LOCAL_VEHICLE_TOPOLOGY_STORAGE_KEY/);
  assert.match(page, /createVehicleAssemblyModel\(assemblyDefinition\)/);
  assert.match(page, /createStagePlacements/);
  assert.match(page, /stageEnvelopeLengthM/);
  assert.match(page, /makePlacedStageComponents/);
  assert.match(page, /stageThrustAxisBody/);
  assert.match(page, /Motor cant \(deg\)/);
  assert.match(page, /Separation dV \(\+X, m\/s\)/);
  assert.match(page, /thrustCantAngleDeg/);
  assert.match(topology, /MAX_VEHICLE_STAGES = 8/);
  assert.match(topology, /Parallel stage/);
  assert.match(topology, /parent must appear earlier/);
  assert.match(topology, /aerodynamicTableId/);
  assert.match(topology, /failedMotorInstanceIndices/);
  assert.match(topology, /separationDeltaVBodyMps/);
  assert.match(stagePreview, /simulateStageFlightPreview/);
  assert.match(stagePreview, /simulateRailGuidedLaunch/);
  assert.match(stagePreview, /sideslipRad/);
  assert.match(stagePreview, /StageFlightClusterDiagnostic/);
  assert.match(stagePreview, /clusterDiagnostics/);
  assert.match(stagePreview, /launchRailMaximumSteps/);
  assert.match(stagePreview, /mathematical-regression-tests-only/);
  assert.match(stagePreview, /STAGE_FLIGHT_CONVERGENCE_RELATIVE_TOLERANCE/);
  assert.match(stagePreview, /half the integration step/);
  assert.match(stagePreview, /separated bodies/);
  assert.match(stylesheet, /\.topology-stage/);
  assert.match(stylesheet, /\.topology-stage-events/);
  assert.match(stylesheet, /\.topology-failure-toggle/);
  assert.match(stylesheet, /\.topology-add-actions/);
  assert.match(stylesheet, /\.stage-flight-profile/);
  assert.match(stylesheet, /\.stage-flight-chart/);
  assert.match(stylesheet, /\.stage-flight-convergence/);
  assert.match(stylesheet, /\.stage-flight-uncertainty/);
  assert.match(stylesheet, /\.stage-flight-profile-tabs button:focus-visible/);
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

test("ships a local flight-run comparison workflow with stale-result guardrails", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /FlightComparisonCard/);
  assert.match(page, /comparisonReference/);
  assert.match(page, /Pin current run/);
  assert.match(page, /Replace reference/);
  assert.match(page, /Rerun required/);
  assert.match(page, /flight-safety evidence/);
  assert.match(stylesheet, /\.flight-comparison-card/);
  assert.match(stylesheet, /\.flight-comparison-row/);
});
