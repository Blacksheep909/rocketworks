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

test("keeps the Node 22 TypeScript test-loader contract explicit", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.match(
    packageJson.scripts?.test ?? "",
    /node --experimental-strip-types --test/,
    "npm test must opt into Node 22's erasable TypeScript loader",
  );
  assert.match(
    packageJson.scripts?.typecheck ?? "",
    /tsc --noEmit --incremental false/,
    "the repository must expose a no-emit TypeScript gate",
  );
  const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(ci, /run: npm run typecheck/);
});

test("ships an installable browser shell without claiming offline simulation", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(layout, /rocketworks-mark\.svg/);
  assert.match(layout, /PwaRegistration/);
  assert.match(await readFile(new URL("../app/pwa-registration.tsx", import.meta.url), "utf8"), /serviceWorker\.register/);
  assert.match(await readFile(new URL("../app/pwa-registration.tsx", import.meta.url), "utf8"), /beforeinstallprompt/);
  assert.match(await readFile(new URL("../app/pwa-registration.tsx", import.meta.url), "utf8"), /pwa-install-card/);
  assert.match(await readFile(new URL("../app/pwa-registration.tsx", import.meta.url), "utf8"), /appinstalled/);
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
  const atmosphereSource = await readFile(
    new URL("../lib/physics/atmosphere.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /result\.modelVersion/);
  assert.match(source, /publicModelVersion/);
  assert.match(source, /RKW-01/);
  assert.match(source, /brand-mark.*>R<\/span>/);
  assert.match(source, /Flight events/);
  assert.match(source, /Vertical flight profile/);
  assert.match(source, /vertical-flight-trace-scrubber/);
  assert.match(source, /copy\.traceSample/);
  assert.match(source, /copy\.traceNoSelection/);
  assert.match(source, /event-item-button/);
  assert.match(source, /selectedFlightEventTimeS/);
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
  assert.match(source, /launch-site-name/);
  assert.match(source, /launch-latitude/);
  assert.match(source, /launch-longitude/);
  assert.match(source, /WGS84/);
  assert.match(source, /wind-profile-editor/);
  assert.match(source, /Use custom layers/);
  assert.match(source, /setWindProfileLayers/);
  assert.match(source, /launchSiteName/);
  assert.match(source, /launchLatitudeDeg/);
  assert.match(source, /launchLongitudeDeg/);
  assert.match(atmosphereSource, /84_852/);
  assert.match(atmosphereSource, /ATMOSPHERE_MAX_GEOMETRIC_ALTITUDE_M/);
  assert.match(source, /1st bending mode/);
  assert.match(source, /equivalent-beam/);
  assert.match(source, /Vector impulse budget/);
  assert.match(source, /Observed velocity change/);
  assert.match(source, /stageFlightResult\.vectorBudget/);
  assert.doesNotMatch(source, /(?:Â|Ã|â†)/, "Flight UI source must not contain mojibake labels");
  assert.doesNotMatch(
    await readFile(new URL("../lib/export/project-exports.ts", import.meta.url), "utf8"),
    /(?:Â|Ã|â†)/,
    "engineering report source must not contain mojibake units",
  );
});

test("ships a portable project import path with validated restoration warnings", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const exportSource = await readFile(new URL("../lib/export/project-exports.ts", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /parseKestrelProjectJson/);
  assert.match(source, /Import RocketWorks project/);
  assert.match(source, /projectImportInputRef/);
  assert.match(source, /id="project-name"/);
  assert.match(source, /namedProjectFingerprint/);
  assert.match(source, /projectFileStem/);
  assert.match(source, /setProjectName\(imported\.projectName\)/);
  assert.match(source, /LOCAL_COMPONENT_LIBRARY_STORAGE_KEY/);
  assert.match(source, /componentLibrary/);
  assert.match(source, /Component library/);
  assert.match(source, /applyComponentPreset/);
  assert.match(source, /rerun estimates to refresh results/);
  assert.match(exportSource, /export function parseKestrelProjectJson/);
  assert.match(exportSource, /validateEditableProjectInputs/);
  assert.match(exportSource, /validateVehicleTopology/);
  assert.match(exportSource, /validateLocalComponentRecords/);
  assert.match(stylesheet, /export-import-option/);
  assert.match(stylesheet, /\.project-name-input/);
});

test("ships a validated browser design-share path without bundling local libraries", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const shareSource = await readFile(new URL("../lib/project/project-share.ts", import.meta.url), "utf8");
  assert.match(source, /encodeProjectShare/);
  assert.match(source, /decodeProjectShare/);
  assert.match(source, /Share design link/);
  assert.match(source, /Referenced motor/);
  assert.match(source, /projectName,/);
  assert.match(source, /Shared \$\{shared\.projectName\} design loaded/);
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
  assert.match(source, /Normalized residuals divide by supplied one-sigma/);
  assert.match(source, /Normalized RMSE/);
  assert.match(source, /σ coverage/);
  assert.match(source, /Measured time offset/);
  assert.match(source, /Simulation time = measured time \+ offset/);
  assert.match(source, /Export residuals/);
  assert.match(source, /LOCAL_FLIGHT_DATA_STORAGE_KEY/);
  assert.match(source, /parseLocalFlightDataSnapshot/);
  assert.match(source, /Restored from this browser/);
  assert.match(source, /PhysicsBenchmarkCard/);
  assert.match(source, /runPhysicsBenchmarkSuite/);
  assert.match(source, /createEngineeringDesignReview/);
  assert.match(source, /ENGINEERING DESIGN REVIEW/);
  assert.match(source, /Deterministic physics benchmarks/);
  assert.match(source, /Gaussian-copula pair/);
  assert.match(source, /Apogee sensitivity/);
  assert.match(source, /recoveryAreaScale/);
  assert.match(source, /recoveryDeploymentSuccess/);
  assert.match(source, /motorThrustScaleFactorKey/);
  assert.match(source, /motorFactorDefinitions/);
  assert.match(source, /motor\.name\} thrust/);
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
  assert.match(stylesheet, /\.flight-data-persistence/);
  assert.match(stylesheet, /\.benchmark-card/);
  assert.match(stylesheet, /\.benchmark-table/);
  assert.match(stylesheet, /rgba\(47,159,255/);
});

test("ships the separated-body telemetry branch with explicit ballistic limits", async () => {
  const source = await readFile(
    new URL("../lib/physics/stage-flight-preview.ts", import.meta.url),
    "utf8",
  );
  const pageSource = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const stylesheet = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const trajectoryViewport = await readFile(
    new URL("../app/flight-trajectory-viewport.tsx", import.meta.url),
    "utf8",
  );
  const trajectoryProjection = await readFile(
    new URL("../lib/visualization/flight-trajectory.ts", import.meta.url),
    "utf8",
  );
  const flightPathExport = await readFile(
    new URL("../lib/export/flight-path-geojson.ts", import.meta.url),
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
  assert.match(source, /analyzeSphericalSeparationEnvelope/);
  assert.match(source, /analyzeSeparationContact/);
  assert.match(source, /multiBodySeparation/);
  assert.match(source, /separationEnvelope/);
  assert.match(source, /separationContact/);
  assert.match(source, /separationContactLoad/);
  assert.match(source, /simulateCoupledMultiBodyFlight/);
  assert.match(source, /coupledMultiBodyFlight/);
  assert.match(pageSource, /FlightTrajectoryViewport/);
  assert.match(pageSource, /stageFlightTrajectorySeries/);
  assert.match(trajectoryViewport, /Interactive flight path/);
  assert.match(trajectoryViewport, /onSelectionChange/);
  assert.match(trajectoryViewport, /togglePlayback/);
  assert.match(trajectoryViewport, /requestAnimationFrame/);
  assert.match(trajectoryViewport, /Replay rate/);
  assert.match(trajectoryViewport, /Pause flight path replay/);
  assert.match(trajectoryViewport, /noseDirectionScreen/);
  assert.match(trajectoryViewport, /Rigid-body attitude available/);
  assert.match(trajectoryProjection, /display-projection-only/);
  assert.match(trajectoryProjection, /projectFlightTrajectory/);
  assert.match(trajectoryProjection, /advanceFlightTrajectoryReplay/);
  assert.match(trajectoryProjection, /orientationBodyToWorld/);
  assert.match(trajectoryProjection, /rocketworks-flight-trajectory-view-0\.2\.0/);
  assert.match(pageSource, /createFlightPathGeoJson/);
  assert.match(pageSource, /flight-path-geojson/);
  assert.match(flightPathExport, /FeatureCollection/);
  assert.match(flightPathExport, /orientationBodyToWorld/);
  assert.match(flightPathExport, /local tangent approximation/);
  assert.match(flightPathExport, /WGS84/);
  assert.match(pageSource, /rigidBodyCount/);
  assert.match(pageSource, /quaternion\/inertia state/);
  assert.match(pageSource, /Coupled integrator/);
  assert.match(pageSource, /integration\.acceptedStepCount/);
  assert.match(pageSource, /Closing speed at closest approach/);
  assert.match(pageSource, /Closing speed at closest pair/);
  assert.match(pageSource, /closingSpeedMps/);
  assert.match(stylesheet, /\.stage-separated-bodies/);
  assert.match(stylesheet, /\.stage-separated-body-grid/);
  assert.match(stylesheet, /\.stage-multi-body-separation/);
  assert.match(stylesheet, /\.stage-coupled-multi-body-flight/);
  assert.match(stylesheet, /\.stage-separation-envelope/);
  assert.match(stylesheet, /\.flight-trajectory-viewport/);
  assert.match(stylesheet, /\.flight-trajectory-canvas/);
  assert.match(stylesheet, /\.flight-trajectory-replay/);
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
  const stylesheet = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(source, /createMotorDataRecord/);
  assert.match(source, /Motor data/);
  assert.match(source, /previewMotor\.metrics\.impulseClassEstimate/);
  assert.match(source, /previewMotor\.massFlowHistoryKgS/);
  assert.match(source, /Depletion source/);
  assert.match(source, /Measured mass-flow CSV/);
  assert.match(source, /parseMotorMassFlowCsv/);
  assert.match(source, /depletionSource: previewMotor\.massFlowHistoryKgS/);
  assert.match(source, /exportMotorMassFlowCsv/);
  assert.match(source, /Synthetic preview curve/);
  assert.match(source, /not motor certification/);
  assert.match(source, /MotorThrustCurveChart/);
  assert.match(source, /Thrust profile/);
  assert.match(source, /The curve is linearly interpolated/);
  assert.match(stylesheet, /\.motor-performance/);
  assert.match(stylesheet, /\.motor-performance-plot/);
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
  assert.match(source, /turbulence-scale/);
  assert.match(source, /weather-seed/);
  assert.match(source, /weatherSeed/);
  assert.match(source, /turbulenceScale/);
  assert.match(source, /earth-rotation/);
  assert.match(source, /earthRotationEnabled/);
  assert.match(source, /gravity-model/);
  assert.match(source, /normalGravityEnabled/);
  assert.match(source, /normal-force-model/);
  assert.match(source, /supersonic-linearized/);
  assert.match(source, /induced-drag-model/);
  assert.match(source, /quadratic-normal-force/);
  assert.match(source, /relativeHumidityPercent/);
  assert.match(source, /surfacePressureHpa/);
  assert.match(source, /surfaceTemperatureC/);
  assert.match(source, /windAzimuthDeg/);
  assert.match(source, /Wind azimuth · east toward north/);
  assert.match(source, /windProfileLayerCount/);
  assert.match(source, /Mean-wind source/);
  assert.match(source, /user-wind-profile-v1/);
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
  assert.match(page, /uiCopy\.designVisualizationMode/);
  assert.match(page, /3D skeleton/);
  assert.match(page, /3D final/);
  assert.match(page, /renderMode={designView === "3d-skeleton" \? "skeleton" : "final"}/);
  assert.match(page, /view-azimuth-rail/);
  assert.match(page, /designAzimuthDeg/);
  assert.match(page, /className="field-slider"/);
  assert.match(page, /id="thrust".*slider/);
  assert.match(page, /id="burn-time".*slider/);
  assert.match(page, /id="drag".*slider/);
  assert.match(page, /id="wind-speed".*slider/);
  assert.match(page, /id="launch-rail-length".*slider/);
  assert.match(page, /id="launch-rail-friction".*slider/);
  assert.match(page, /id="launch-rail-tipoff-pitch".*slider/);
  assert.match(page, /id="launch-rail-tipoff-yaw".*slider/);
  assert.match(page, /id="recovery-diameter".*slider/);
  assert.match(page, /id="correlation-coefficient".*slider/);
  assert.match(page, /UI_PREFERENCES_STORAGE_KEY/);
  assert.match(page, /UI_PREFERENCES_LEGACY_STORAGE_KEYS/);
  assert.match(page, /serializeUiPreferences/);
  assert.match(page, /getUiCopy/);
  assert.match(page, /ui-locale/);
  assert.match(page, /accessibilityTitle/);
  assert.match(page, /interfaceLanguage/);
  assert.match(page, /reducedMotion/);
  assert.match(page, /highContrast/);
  assert.match(page, /data-reduced-motion/);
  assert.match(page, /data-high-contrast/);
  assert.match(page, /lang={locale}/);
  assert.match(page, /aria-keyshortcuts="1"/);
  assert.match(page, /aria-keyshortcuts="2"/);
  assert.match(page, /aria-keyshortcuts="3"/);
  assert.match(page, /Show 3D skeleton view/);
  assert.match(page, /analyzeVerticalFlightConvergence/);
  assert.match(page, /Vertical integration-step convergence/);
  assert.match(stylesheet, /\.vertical-flight-convergence/);
  assert.match(viewport, /createRocketPreviewMesh/);
  assert.match(viewport, /RocketPreviewStageInstance/);
  assert.match(viewport, /Stage visibility controls/);
  assert.match(viewport, /pickProjectedRocketPart/);
  assert.match(viewport, /onStageSelect/);
  assert.match(viewport, /createExplodedPreviewComponentInstances/);
  assert.match(viewport, /createExplodedPreviewStageInstances/);
  assert.match(viewport, /Assembly display mode/);
  assert.match(viewport, /Integrated/);
  assert.match(viewport, /Exploded/);
  assert.match(viewport, /press E to toggle/);
  assert.match(viewport, /Interactive three-dimensional ARC 54/);
  assert.match(viewport, /Rocket3DRenderMode/);
  assert.match(viewport, /renderMode === "skeleton"/);
  assert.match(viewport, /Click a rendered surface to select/);
  assert.match(viewport, /onPointerMove/);
  assert.match(viewport, /onWheel/);
  assert.match(viewport, /onKeyDown/);
  assert.match(viewport, /Display mesh only/);
  assert.match(stylesheet, /\.rocket-3d-viewport canvas:focus-visible/);
  assert.match(stylesheet, /touch-action: none/);
  assert.match(stylesheet, /.rocket-3d-display-mode/);
  assert.match(stylesheet, /.view-azimuth-rail/);
  assert.match(stylesheet, /.field-slider/);
  assert.match(stylesheet, /.accessibility-dialog/);
  assert.match(stylesheet, /data-reduced-motion/);
  assert.match(stylesheet, /data-high-contrast/);
  assert.match(stylesheet, /.accessibility-language/);
});

test("keeps command search and experience mode reachable on narrow screens", async () => {
  const styles = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.command-button \{ display: inline-flex;/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.mode-switch \{ display: inline-flex;/);
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /role="combobox"/);
  assert.match(page, /aria-controls="command-list"/);
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
  assert.match(page, /terrainModel/);
  assert.match(page, /terrain-east-slope/);
  assert.match(page, /terrain-north-slope/);
  assert.match(page, /terrainName/);
  assert.match(page, /terrainElevationM/);
  assert.match(page, /createPlanarTerrainSurface/);
  assert.match(page, /arc54-landing-v1/);
  assert.match(page, /recoveryDeploymentSuccess/);
  assert.match(page, /recoveryDeploymentSuccessProbability/);
  assert.match(page, /relativeHumidityPercent/);
  assert.match(page, /Deployment success assumption/);
  assert.match(page, /Canopy opening schedule/);
  assert.match(page, /recoveryReefingEnabled/);
  assert.match(page, /recoveryReefingDurationS/);
  assert.match(page, /recoveryReefingStartAreaFraction/);
  assert.match(page, /recoveryDeploymentTrigger/);
  assert.match(page, /events\.push\(createScheduledRecoveryDeploymentEvent/);
  assert.match(page, /stateEvents\.push\(recoveryDeploymentTrigger === "altitude"/);
  assert.match(page, /recoveryDeploymentAltitudeM/);
  assert.match(page, /recoveryDeploymentTimeS/);
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
  const exportSource = await readFile(new URL("../lib/export/project-exports.ts", import.meta.url), "utf8");
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
  assert.match(page, /createFlightPathGeoJson/);
  assert.match(page, /exportArtifact\("flight-path-geojson"\)/);
  assert.match(page, /WGS84 GeoJSON/);
  assert.match(page, /createUncertaintyCsv/);
  assert.match(page, /createAerodynamicPolarCsv/);
  assert.match(page, /exportArtifact\("aero-polar-csv"\)/);
  assert.match(exportSource, /RocketWorks aerodynamic polar export/);
  assert.match(page, /Uncertainty samples/);
  assert.match(page, /createEngineeringReportMarkdown/);
  assert.match(page, /stageFlight: stageFlightIsCurrent \? stageFlightResult : null/);
  assert.match(page, /createRocketProfileDxf/);
  assert.match(page, /createRocketStl/);
  assert.match(page, /createCadStageParts/);
  assert.match(page, /stageParts:/);
  assert.match(page, /createRocketOpenScad/);
  assert.match(page, /exportArtifact\("stl"\)/);
  assert.match(page, /Reference mesh/);
  assert.match(exportSource, /Multi-stage topology reference/);
  assert.match(exportSource, /radial Z offset is projected out/);
  assert.match(page, /computeStructuralScreen/);
  assert.match(page, /stageFlightResult\.massRatio/);
  assert.match(page, /stageFlightResult\.missionLossBudget/);
  assert.match(page, /stageFlightResult\.missionDeltaVBridge/);
  assert.match(page, /missionMassRatio/);
  assert.match(page, /Serial-stack mass-ratio preview/);
  assert.match(page, /Ideal-to-trace delta-v bridge/);
  assert.match(page, /mission-mass-ratio-list/);
  assert.match(page, /stageVectorBudget/);
  assert.match(page, /Stage mass-ratio diagnostic/);
  assert.match(page, /createStageStructuralReview/);
  assert.match(page, /STAGE-AWARE STRUCTURAL REVIEW/);
  assert.match(exportSource, /Stage-aware structural review/);
  assert.match(exportSource, /Stage mass-ratio diagnostic/);
  assert.match(exportSource, /Serial-stack mass-ratio preview/);
  assert.match(exportSource, /World-frame vector impulse budget/);
  assert.match(page, /flutterFlightCondition/);
  assert.match(page, /Separation impulse audit/);
  assert.match(page, /STRUCTURAL SCREEN/);
  assert.match(page, /ENGINEERING DESIGN REVIEW/);
  assert.match(page, /Flutter-safe speed/);
  assert.match(page, /Analytical component checks only/);
  assert.match(page, /URL\.createObjectURL/);
  assert.match(page, /Run the vertical estimate again before exporting simulation results/);
  assert.match(page, /Rerun the coupled 6DOF preview before exporting its trace/);
  assert.match(page, /reference geometry—not drawings, toleranced solids/);
  assert.match(stylesheet, /\.export-backdrop/);
  assert.match(stylesheet, /\.structural-screen-card/);
  assert.match(stylesheet, /\.stage-structural-review-card/);
  assert.match(stylesheet, /\.stage-structural-review-row-review/);
  assert.match(stylesheet, /\.stage-mass-ratio-card/);
  assert.match(stylesheet, /\.mission-mass-ratio-card/);
  assert.match(stylesheet, /\.mission-mass-ratio-row/);
  assert.match(stylesheet, /\.stage-vector-budget-card/);
  assert.match(stylesheet, /\.structural-check-review/);
  assert.match(stylesheet, /\.engineering-review-card/);
  assert.match(stylesheet, /\.engineering-review-finding-review/);
  assert.match(stylesheet, /\.stage-separation-dynamics/);
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
  assert.match(page, /projectConfigurationFingerprint/);
  assert.match(page, /describeProjectConfigurationChanges/);
  assert.match(page, /setLaunchSiteName\(inputs\.launchSiteName\)/);
  assert.match(page, /setLaunchLatitudeDeg\(inputs\.launchLatitudeDeg\)/);
  assert.match(page, /setLaunchLongitudeDeg\(inputs\.launchLongitudeDeg\)/);
  assert.match(page, /topology: vehicleTopology/);
  assert.match(page, /LOCAL_MOTOR_SELECTION_STORAGE_KEY/);
  assert.match(page, /namedProjectFingerprint\(/);
  assert.match(page, /restoredMotorSelection/);
  assert.match(page, /restoredAerodynamicSelection/);
  assert.match(page, /legacy topology retained/);
  assert.match(page, /setLaunchRailEnabled/);
  assert.match(page, /launchRailLengthM/);
  assert.match(page, /launchRailInclinationDeg/);
  assert.match(page, /launchRailAzimuthDeg/);
  assert.match(page, /launchRailFrictionAccelerationMps2/);
  assert.match(page, /launchRailTipOffPitchRateDegS/);
  assert.match(page, /launchRailTipOffYawRateDegS/);
  assert.match(page, /recoveryDeploymentSuccessProbability/);
  assert.match(page, /recoveryReefingEnabled/);
  assert.match(page, /recoveryReefingDurationS/);
  assert.match(page, /recoveryReefingStartAreaFraction/);
  assert.match(page, /recovery-deployment-trigger/);
  assert.match(page, /recovery-deployment-altitude/);
  assert.match(page, /recovery-deployment-time/);
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
  assert.match(projectState, /launchRailFrictionAccelerationMps2/);
  assert.match(projectState, /launchRailTipOffPitchRateDegS/);
  assert.match(projectState, /launchRailTipOffYawRateDegS/);
  assert.match(projectState, /recoveryDeploymentSuccessProbability/);
  assert.match(projectState, /recoveryReefingEnabled/);
  assert.match(projectState, /recoveryReefingDurationS/);
  assert.match(projectState, /recoveryReefingStartAreaFraction/);
  assert.match(projectState, /recoveryDeploymentTrigger/);
  assert.match(projectState, /recoveryDeploymentAltitudeM/);
  assert.match(projectState, /recoveryDeploymentTimeS/);
  assert.match(projectState, /relativeHumidityPercent/);
  assert.match(projectState, /surfacePressureHpa/);
  assert.match(projectState, /surfaceTemperatureC/);
  assert.match(projectState, /validateEditableProjectInputs/);
  assert.match(projectState, /validateVehicleTopology/);
  assert.match(projectState, /topology?: LocalVehicleTopology/);
  assert.match(projectState, /projectConfigurationFingerprint/);
  assert.match(projectState, /releasedBodyDragModel/);
  assert.match(projectState, /sixDofIntegrationMethod/);
  assert.match(projectState, /vehicle topology/);
  assert.match(projectState, /ProjectSourceSelections/);
  assert.match(projectState, /Unsupported local project schema version/);
  assert.match(stylesheet, /\.history-entry button:focus-visible/);
});

test("ships beginner and expert workflows with original templates and guidance", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const templates = await readFile(new URL("../lib/project/templates.ts", import.meta.url), "utf8");
  const copy = await readFile(new URL("../lib/project/ui-copy.ts", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /uiCopy\.experienceMode/);
  assert.match(page, /uiCopy\.beginner/);
  assert.match(page, /uiCopy\.expert/);
  assert.match(page, /Start from a template/);
  assert.match(page, /Each template is an original RocketWorks configuration/);
  assert.match(page, /Build, check, then estimate/);
  assert.match(page, /uiCopy\.showGuide/);
  assert.match(page, /Loaded template:/);
  assert.match(page, /Show expert details/);
  assert.match(templates, /first-flight/);
  assert.match(templates, /weather-study/);
  assert.match(templates, /ballistic-check/);
  assert.match(copy, /SPANISH_COPY/);
  assert.match(copy, /Pantalla y accesibilidad/);
  assert.match(stylesheet, /\.beginner-guide/);
  assert.match(stylesheet, /\.template-grid/);
  assert.match(stylesheet, /\.mode-switch/);
});

test("ships a provenance-aware local motor library and mission-control visual language", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const motorState = await readFile(new URL("../lib/project/motor-library-state.ts", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /Motor library/);
  assert.match(page, /Validate and save motor\(s\)/);
  assert.match(page, /RASP accepts one or multiple header blocks/);
  assert.match(page, /importMotorRaspEngBatch/);
  assert.match(page, /batch IDs use the prefix/);
  assert.match(page, /Measured mass-flow CSV can only be attached to one RASP\/ENG record/);
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
  const polar = await readFile(new URL("../lib/physics/aerodynamic-polar.ts", import.meta.url), "utf8");
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
  assert.match(page, /optional angle-of-attack and sideslip volumes/);
  assert.match(page, /sideslip × angle-of-attack × Reynolds × Mach/);
  assert.match(page, /Direct body-axis force\/moment coefficients/);
  assert.match(page, /Force \/ moment DB/);
  assert.match(page, /sampleAerodynamicPolar/);
  assert.match(page, /Angle-of-attack response/);
  assert.match(page, /absolute grid supplied/);
  assert.match(page, /aerodynamicTable: selectedAerodynamicTable/);
  assert.match(verticalFlight, /mach-reynolds-table/);
  assert.match(page, /globalTable: aerodynamicTable \?\? null/);
  assert.match(page, /Coefficient tables now drive both the fast vertical estimate/);
  assert.match(library, /LOCAL_AERODYNAMIC_LIBRARY_LIMIT = 8/);
  assert.match(library, /parseLocalAerodynamicLibrary/);
  assert.match(library, /createAerodynamicCoefficientTable/);
  assert.match(stageAware, /multiple aerodynamic tables/);
  assert.match(stageAware, /angleOfAttackRad: condition\.angleOfAttackRad/);
  assert.match(polar, /AERODYNAMIC_POLAR_MODEL_VERSION/);
  assert.match(polar, /small-angle normal-force slope/);
  assert.match(stylesheet, /.aerodynamic-dialog/);
  assert.match(stylesheet, /.aerodynamic-record/);
  assert.match(stylesheet, /.aerodynamic-inspector/);
  assert.match(stylesheet, /.aerodynamic-polar/);
});

test("ships an interactive multi-stage, booster, and radial-topology editor", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const topology = await readFile(new URL("../lib/project/vehicle-topology.ts", import.meta.url), "utf8");
  const stagePreview = await readFile(new URL("../lib/physics/stage-flight-preview.ts", import.meta.url), "utf8");
  const stageInterfaceLoads = await readFile(new URL("../lib/physics/stage-interface-loads.ts", import.meta.url), "utf8");
  const stageForceBudget = await readFile(new URL("../lib/physics/stage-flight-force-budget.ts", import.meta.url), "utf8");
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
  assert.match(page, /released-body-force-model/);
  assert.match(page, /released-body-drag-model/);
  assert.match(page, /Projected-area \+ static aero loads \(preview\)/);
  assert.match(page, /Validated coefficient-table loads/);
  assert.match(page, /Include mutual point-mass gravity/);
  assert.match(page, /coupledGravitySofteningRadiusM/);
  assert.match(page, /Launch rail constraint/);
  assert.match(page, /launchRailEnabled/);
  assert.match(page, /Inclination from vertical/);
  assert.match(page, /Azimuth · east toward north/);
  assert.match(page, /stage-flight-rail/);
  assert.match(page, /stageFlightResult\.validationStatus/);
  assert.match(page, /stage-flight-warnings/);
  assert.match(page, /analyzeStageFlightUncertainty/);
  assert.match(page, /6DOF uncertainty envelope/);
  assert.match(page, /directForceCoefficientScale/);
  assert.match(page, /directMomentCoefficientScale/);
  assert.match(page, /coefficientUncertaintyScale/);
  assert.match(page, /Aero table uncertainty/);
  assert.match(page, /ignitionDelayOffsetS/);
  assert.match(page, /separationImpulseScale/);
  assert.match(page, /contactStoppingDistanceScale/);
  assert.match(page, /contactRestitutionScale/);
  assert.match(page, /maxContactNormalImpulseNs/);
  assert.match(page, /Contact force scale P05/);
  assert.match(page, /alignmentOffsetRad/);
  assert.match(page, /Direct force and static-moment coefficient databases receive separate bounded scales/);
  assert.match(page, /Run dispersion/);
  assert.match(page, /stageUncertaintyIsCurrent/);
  assert.match(page, /StageFlightProfileChart/);
  assert.match(page, /stage-flight-trace-scrubber/);
  assert.match(page, /copy=\{uiCopy\}/);
  assert.match(page, /stage-flight-event/);
  assert.match(page, /selectedStageEventTimeS/);
  assert.match(page, /Vertical vs coupled preview/);
  assert.match(page, /formatSignedMetric/);
  assert.match(page, /stage-flight-comparison/);
  assert.match(page, /Stage flight profile/);
  assert.match(page, /createStageInterfaceLoadReview/);
  assert.match(page, /STAGE-INTERFACE AXIAL LOAD PATH/);
  assert.match(page, /stageInterfaceLoadReview/);
  assert.match(page, /PARALLEL \/ RADIAL FORCE-SCALE AUDIT/);
  assert.match(page, /Trace peak/);
  assert.match(page, /trace-peak-with-baseline/);
  assert.match(page, /Force impulse budget/);
  assert.match(page, /stageFlightResult\.forceBudget/);
  assert.match(page, /Dynamic pressure/);
  assert.match(page, /key: "angleOfAttack", label: "AoA"/);
  assert.match(page, /key: "sideslip", label: "Sideslip"/);
  assert.match(page, /key: "aerodynamicForce", label: "Aero force"/);
  assert.match(page, /key: "aerodynamicMoment", label: "Aero moment"/);
  assert.match(page, /key: "aerodynamicDampingMoment", label: "Damping moment"/);
  assert.match(page, /key: "centerOfPressure", label: "CP"/);
  assert.match(page, /key: "centerOfMass", label: "CG"/);
  assert.match(page, /key: "staticMargin", label: "Static margin"/);
  assert.match(page, /key: "attitudeTilt", label: "Attitude tilt"/);
  assert.match(page, /key: "angularRate", label: "Angular rate"/);
  assert.match(page, /point\.dynamicPressurePa/);
  assert.match(page, /point\.angleOfAttackRad/);
  assert.match(page, /point\.sideslipRad/);
  assert.match(page, /Motor-state diagnostics/);
  assert.match(page, /clusterDiagnostics/);
  assert.match(page, /peakCurveSpread/);
  assert.match(page, /motorPeakThrusts/);
  assert.match(page, /estimateRecoveryOpeningLoad/);
  assert.match(page, /Opening-load estimate/);
  assert.match(page, /Peak quasi-steady drag/);
  assert.match(page, /Opening shock, snatch force, lines, fabric/);
  assert.match(page, /Integration-step convergence/);
  assert.match(page, /6DOF integration method/);
  assert.match(page, /adaptive-rk4-step-doubling/);
  assert.match(page, /6DOF integrator diagnostics/);
  assert.match(page, /sixDofIntegrationMethod/);
  assert.match(page, /coupledMutualGravityEnabled/);
  assert.match(page, /coupledGravitySofteningRadiusM/);
  assert.match(page, /separationContactStoppingDistanceM/);
  assert.match(page, /separationContactCoefficientOfRestitution/);
  assert.match(page, /inputs\.releasedBodyDragModel \?\? "isotropic-point"/);
  assert.match(page, /Event allocator/);
  assert.match(page, /Simultaneous groups/);
  assert.match(page, /eventAllocation/);
  assert.match(page, /formatStageFlightConvergenceStatus/);
  assert.match(page, /aria-label=\{`\$\{definition\.label\} over time/);
  assert.match(page, /attachedStageIds\.join/);
  assert.match(page, /ArrowRight/);
  assert.match(page, /ArrowLeft/);
  assert.match(page, /Staged 6DOF trace/);
  assert.match(page, /createStageFlightTraceCsv/);
  assert.match(page, /Released-body traces/);
  assert.match(page, /createSeparatedBodyTraceCsv/);
  assert.match(page, /MODEL BOUNDARY/);
  assert.match(page, /LOCAL_VEHICLE_TOPOLOGY_STORAGE_KEY/);
  assert.match(page, /createVehicleAssemblyModel\(assemblyDefinition\)/);
  assert.match(page, /createStagePlacements/);
  assert.match(page, /stageEnvelopeLengthM/);
  assert.match(page, /makePlacedStageComponents/);
  assert.match(page, /stageThrustAxisBody/);
  assert.match(page, /stageThrustAxisWithGimbal/);
  assert.match(page, /Gimbal schedule/);
  assert.match(page, /Add gimbal point/);
  assert.match(page, /Measured separation impulse/);
  assert.match(page, /Clear measured impulse/);
  assert.match(page, /Motor cant \(deg\)/);
  assert.match(page, /Body length \(m\)/);
  assert.match(page, /Diameter \(m\)/);
  assert.match(page, /Nose length \(m\)/);
  assert.match(page, /stagePreviewGeometry/);
  assert.match(page, /Separation dV \(\+X, m\/s\)/);
  assert.match(page, /Detached recovery/);
  assert.match(page, /Canopy diameter \(m\)/);
  assert.match(page, /Recovery trigger/);
  assert.match(page, /Descending altitude/);
  assert.match(page, /Mission time/);
  assert.match(page, /deploymentAltitudeAglM/);
  assert.match(page, /deploymentTimeS/);
  assert.match(page, /Recovery delay \(s\)/);
  assert.match(page, /updateTopologyRecovery/);
  assert.match(page, /thrustCantAngleDeg/);
  assert.match(page, /TopologyNumberField/);
  assert.match(page, /className="topology-slider"/);
  assert.match(page, /Custom component instances/);
  assert.match(page, /\+ Equipment mass/);
  assert.match(page, /\+ Cylindrical pod/);
  assert.match(page, /Select for library/);
  assert.match(page, /selected for component library/);
  assert.match(page, /Equipment mass/);
  assert.match(page, /Cylindrical pod/);
  assert.match(page, /addTopologyComponentFromPreset/);
  assert.match(page, /selectedTopologyComponentId/);
  assert.match(page, /Save reusable nose, airframe, fin-set, recovery, equipment-mass, and cylindrical-pod/);
  assert.match(page, /topology placement/);
  assert.match(page, /topologyComponentToVehicleComponent/);
  assert.match(page, /duplicateTopologyStage/);
  assert.match(page, /Duplicate/);
  assert.match(page, /rehomed to core/);
  assert.match(page, /topologyStageParts/);
  assert.match(page, /topologyComponentMarkers/);
  assert.match(page, /TOPOLOGY PROFILE/);
  assert.match(page, /stage profiles/);
  assert.match(page, /Radial offset \(m\)/);
  assert.match(page, /Wall thickness \(m\)/);
  assert.match(page, /Advanced local inertia/);
  assert.match(page, /Principal moments at the equipment CG/);
  assert.match(page, /local inertia/);
  assert.match(page, /updateTopologyComponentInertia/);
  assert.match(page, /rotateInertiaAboutX/);
  assert.match(topology, /inertiaAtCenterKgM2/);
  assert.match(page, /radial placement rotates with repeated booster instances/);
  assert.match(page, /value=\{sliderValue\}/);
  assert.match(page, /raw === "" \? "" : Number\(raw\)/);
  assert.match(topology, /MAX_VEHICLE_STAGES = 8/);
  assert.match(topology, /MAX_VEHICLE_COMPONENTS = 64/);
  assert.match(topology, /VehicleTopologyComponentPlan/);
  assert.match(topology, /cylindricalPod/);
  assert.match(topology, /unknown stage/);
  assert.match(topology, /duplicateVehicleStageTopology/);
  assert.match(topology, /removeVehicleStageTopology/);
  assert.match(topology, /Parallel stage/);
  assert.match(topology, /parent must appear earlier/);
  assert.match(topology, /aerodynamicTableId/);
  assert.match(topology, /bodyLengthM/);
  assert.match(topology, /noseLengthM/);
  assert.match(topology, /failedMotorInstanceIndices/);
  assert.match(topology, /separationDeltaVBodyMps/);
  assert.match(topology, /separationImpulseBodyNs/);
  assert.match(topology, /VehicleStageRecoveryPlan/);
  assert.match(topology, /recoveryValue/);
  assert.match(stagePreview, /simulateStageFlightPreview/);
  assert.match(stagePreview, /simulateRailGuidedLaunch/);
  assert.match(stagePreview, /sideslipRad/);
  assert.match(stagePreview, /StageFlightClusterDiagnostic/);
  assert.match(stagePreview, /clusterDiagnostics/);
  assert.match(stagePreview, /peakCurveSpreadFraction/);
  assert.match(stagePreview, /launchRailMaximumSteps/);
  assert.match(stagePreview, /RailGuidedLaunchResult/);
  assert.match(stagePreview, /mathematical-regression-tests-only/);
  assert.match(stagePreview, /STAGE_FLIGHT_CONVERGENCE_RELATIVE_TOLERANCE/);
  assert.match(stagePreview, /eventAllocation/);
  assert.match(stagePreview, /allocateMissionEventPlan/);
  assert.match(stagePreview, /half the integration step/);
  assert.match(stagePreview, /separated bodies/);
  assert.match(stagePreview, /bindMeasuredSeparationImpulseEvent/);
  assert.match(stagePreview, /coupledMultiBodyGravity/);
  assert.match(stagePreview, /attitudeDependentDrag/);
  assert.match(stagePreview, /missionSerialStageIds/);
  assert.match(stagePreview, /computeMissionMassRatio/);
  assert.match(stageInterfaceLoads, /analytical-axial-load-path-proxy/);
  assert.match(stageInterfaceLoads, /Parallel\/radial interface solver/);
  assert.match(stageInterfaceLoads, /downstream mass/);
  assert.match(stageInterfaceLoads, /StageInterfaceLoadTracePoint/);
  assert.match(stageInterfaceLoads, /tracePeakForInterface/);
  assert.match(stageInterfaceLoads, /StageParallelLoadAudit/);
  assert.match(stageInterfaceLoads, /per-instance radial force/);
  assert.match(stageForceBudget, /analytical-trace-integral-only/);
  assert.match(stageForceBudget, /velocity-equivalent accounting/);
  assert.match(stylesheet, /\.stage-flight-model-options/);
  assert.match(stylesheet, /\.stage-flight-cluster-motor-peaks/);
  assert.match(stylesheet, /\.topology-stage/);
  assert.match(stylesheet, /\.topology-stage-events/);
  assert.match(stylesheet, /\.topology-slider/);
  assert.match(stylesheet, /\.topology-number-field/);
  assert.match(stylesheet, /\.topology-failure-toggle/);
  assert.match(stylesheet, /\.topology-add-actions/);
  assert.match(stylesheet, /\.topology-components/);
  assert.match(stylesheet, /\.topology-component-card/);
  assert.match(stylesheet, /\.topology-stage-actions/);
  assert.match(stylesheet, /\.topology-stage-profile/);
  assert.match(stylesheet, /\.topology-component-marker/);
  assert.match(stylesheet, /\.stage-flight-profile/);
  assert.match(stylesheet, /\.stage-flight-chart/);
  assert.match(stylesheet, /\.stage-flight-profile-scrubber/);
  assert.match(stylesheet, /\.event-item-button:focus-visible/);
  assert.match(stylesheet, /\.stage-flight-events > button:focus-visible/);
  assert.match(stylesheet, /\.stage-flight-convergence/);
  assert.match(stylesheet, /\.stage-event-allocation/);
  assert.match(stylesheet, /\.recovery-opening-load-card/);
  assert.match(stylesheet, /\.recovery-opening-load-grid/);
  assert.match(stylesheet, /\.stage-flight-uncertainty/);
  assert.match(stylesheet, /\.stage-flight-profile-tabs button:focus-visible/);
  assert.match(page, /Spherical-envelope clearance/);
  assert.match(page, /separationEnvelope/);
  assert.match(page, /Potential contact and relative-load/);
  assert.match(page, /separationContact/);
  assert.match(page, /separationContactLoad/);
  assert.match(page, /Contact impulse and force-scale estimate/);
  assert.match(page, /Released-body aerodynamic interaction screen/);
  assert.match(stagePreview, /analyzeRelativeAeroInteraction/);
  assert.match(stylesheet, /\.stage-separation-envelope/);
  assert.match(stylesheet, /\.stage-separation-contact/);
  assert.match(stylesheet, /\.stage-relative-aero-interaction/);
  assert.match(stylesheet, /\.stage-coupled-multi-body-flight-drag-summary/);
  assert.match(stylesheet, /\.stage-coupled-multi-body-flight-aero-summary/);
  assert.match(stylesheet, /\.stage-interface-load-card/);
  assert.match(stylesheet, /\.stage-interface-load-row-unavailable/);
  assert.match(stylesheet, /\.stage-parallel-load-audit/);
  assert.match(stylesheet, /\.stage-force-budget-card/);
  assert.match(stylesheet, /\.stage-force-budget-row/);
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
