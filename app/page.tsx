"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import {
  makeConstantThrustCurve,
  simulateVerticalFlight,
  type VerticalFlightResult,
} from "../lib/physics/index.ts";

type ComponentKey = "nose" | "body" | "fins" | "mount" | "recovery";
type ViewKey = "design" | "flight";

const components: Array<{
  id: ComponentKey;
  name: string;
  detail: string;
  marker: string;
}> = [
  { id: "nose", name: "Nose cone", detail: "Ogive · 180 mm", marker: "01" },
  { id: "body", name: "Airframe", detail: "54 × 710 mm", marker: "02" },
  { id: "fins", name: "Fin set", detail: "3 trapezoidal", marker: "03" },
  { id: "mount", name: "Motor mount", detail: "29 mm", marker: "04" },
  { id: "recovery", name: "Recovery", detail: "450 mm chute", marker: "05" },
];

function createFlightResult({
  mass,
  diameter,
  dragCoefficient,
  thrust,
  burnTime,
  launchAltitude,
  windSpeed,
  recoveryEnabled,
  recoveryDelay,
}: {
  mass: number;
  diameter: number;
  dragCoefficient: number;
  thrust: number;
  burnTime: number;
  launchAltitude: number;
  windSpeed: number;
  recoveryEnabled: boolean;
  recoveryDelay: number;
}): VerticalFlightResult {
  const propellantMassKg = Math.min(mass * 0.14, 0.08);
  return simulateVerticalFlight({
    vehicle: {
      dryMassKg: mass - propellantMassKg,
      propellantMassKg,
      referenceAreaM2: Math.PI * Math.pow(diameter / 2000, 2),
      dragCoefficient,
    },
    motor: { thrustCurve: makeConstantThrustCurve(thrust, burnTime) },
    recovery: {
      enabled: recoveryEnabled,
      dragAreaM2: Math.PI * Math.pow(0.45 / 2, 2),
      dragCoefficient: 0.75,
      deploymentDelayAfterApogeeS: recoveryDelay,
    },
    environment: {
      launchAltitudeM: launchAltitude,
      windProfile: [
        { altitudeM: 0, eastMps: windSpeed * 0.5, northMps: 0 },
        { altitudeM: 500, eastMps: windSpeed, northMps: windSpeed * 0.2 },
        { altitudeM: 2000, eastMps: windSpeed * 1.4, northMps: windSpeed * 0.4 },
      ],
    },
    integration: { timeStepS: 0.02, maxTimeS: 180 },
  });
}

function FlightChart({ result }: { result: VerticalFlightResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, bounds.width * ratio);
    canvas.height = Math.max(1, bounds.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);

    const width = bounds.width;
    const height = bounds.height;
    const padding = { top: 22, right: 18, bottom: 28, left: 42 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const maxTime = Math.max(result.totalFlightTimeS, 1);
    const maxAltitude = Math.max(result.apogeeM, 1);

    context.clearRect(0, 0, width, height);
    context.font = "11px ui-monospace, SFMono-Regular, Consolas, monospace";
    context.fillStyle = "#78837e";
    context.strokeStyle = "rgba(24, 42, 34, 0.09)";

    for (let index = 0; index <= 4; index += 1) {
      const y = padding.top + (plotHeight / 4) * index;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
      context.fillText(`${Math.round(maxAltitude * (1 - index / 4))} m`, 2, y + 4);
    }

    const coordinates = result.trace.map((point) => ({
      x: padding.left + (point.timeS / maxTime) * plotWidth,
      y:
        padding.top +
        plotHeight -
        (point.altitudeAglM / maxAltitude) * plotHeight,
    }));
    const gradient = context.createLinearGradient(0, padding.top, 0, height);
    gradient.addColorStop(0, "rgba(29, 123, 87, 0.24)");
    gradient.addColorStop(1, "rgba(29, 123, 87, 0.01)");
    context.beginPath();
    context.moveTo(coordinates[0].x, padding.top + plotHeight);
    coordinates.forEach((point) => context.lineTo(point.x, point.y));
    context.lineTo(coordinates.at(-1)?.x ?? width, padding.top + plotHeight);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();
    context.beginPath();
    coordinates.forEach((point, index) =>
      index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
    );
    context.strokeStyle = "#187a56";
    context.lineWidth = 2.4;
    context.lineJoin = "round";
    context.stroke();
    context.fillStyle = "#78837e";
    context.fillText("0 s", padding.left, height - 7);
    context.fillText(`${maxTime.toFixed(1)} s`, width - padding.right - 36, height - 7);
  }, [result]);

  return (
    <canvas
      ref={canvasRef}
      className="flight-chart"
      aria-label="Estimated altitude over time"
      role="img"
    />
  );
}

export default function Home() {
  const [selected, setSelected] = useState<ComponentKey>("body");
  const [view, setView] = useState<ViewKey>("design");
  const [length, setLength] = useState(710);
  const [diameter, setDiameter] = useState(54);
  const [mass, setMass] = useState(0.58);
  const [thrust, setThrust] = useState(22);
  const [burnTime, setBurnTime] = useState(1.65);
  const [dragCoefficient, setDragCoefficient] = useState(0.52);
  const [launchAltitude, setLaunchAltitude] = useState(80);
  const [windSpeed, setWindSpeed] = useState(4);
  const [recoveryEnabled, setRecoveryEnabled] = useState(true);
  const [recoveryDelay, setRecoveryDelay] = useState(0);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState(true);
  const [toast, setToast] = useState("");
  const [result, setResult] = useState<VerticalFlightResult>(() =>
    createFlightResult({
      mass,
      diameter,
      dragCoefficient,
      thrust,
      burnTime,
      launchAltitude,
      windSpeed,
      recoveryEnabled,
      recoveryDelay,
    }),
  );

  const selectedComponent = components.find((component) => component.id === selected)!;
  const designLength = length + 180;
  const warning = useMemo(() => {
    const ratio = thrust / (mass * 9.80665);
    if (ratio < 3) return "Low launch thrust-to-weight ratio";
    if (diameter < 30) return "Small diameter requires a structural review";
    return "No preliminary issues detected";
  }, [diameter, mass, thrust]);
  const modelWarning =
    result.warnings.find((item) => item.severity !== "info") ??
    result.warnings[0];

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };
  const markChanged = () => {
    setSaved(false);
    window.setTimeout(() => setSaved(true), 850);
  };
  const simulate = () => {
    setRunning(true);
    setView("flight");
    window.setTimeout(() => {
      try {
        setResult(
          createFlightResult({
            mass,
            diameter,
            dragCoefficient,
            thrust,
            burnTime,
            launchAltitude,
            windSpeed,
            recoveryEnabled,
            recoveryDelay,
          }),
        );
        notify("Model run complete");
      } catch (error) {
        notify(error instanceof Error ? error.message : "Unable to run the model");
      } finally {
        setRunning(false);
      }
    }, 520);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">K</span>
          <div><strong>Kestrel Lab</strong><span>Clean-room prototype</span></div>
        </div>
        <div className="project-title">
          <button className="quiet-button" aria-label="Go back to projects">‹</button>
          <div><strong>ARC 54</strong><span>{saved ? "Saved locally" : "Saving changes…"}</span></div>
        </div>
        <div className="top-actions">
          <button className="quiet-button command-button" onClick={() => notify("Command search is planned next")}>
            <span>Search actions</span><kbd>⌘ K</kbd>
          </button>
          <button className="secondary-button">Export</button>
          <button className="primary-button" onClick={simulate}>Run estimate</button>
        </div>
      </header>

      <aside className="component-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">Vehicle</span><h1>ARC 54</h1></div>
          <button className="icon-button" aria-label="Project options">···</button>
        </div>
        <div className="design-summary">
          <div><span>Length</span><strong>{designLength} mm</strong></div>
          <div><span>Mass</span><strong>{Math.round(mass * 1000)} g</strong></div>
        </div>
        <div className="component-list-heading">
          <span>Components</span>
          <button onClick={() => notify("Component library is coming next")}>+ Add</button>
        </div>
        <nav className="component-list" aria-label="Rocket components">
          {components.map((component) => (
            <button
              className={selected === component.id ? "component active" : "component"}
              key={component.id}
              onClick={() => { setSelected(component.id); setView("design"); }}
            >
              <span className="component-marker">{component.marker}</span>
              <span><strong>{component.name}</strong><small>{component.detail}</small></span>
              <span className="chevron">›</span>
            </button>
          ))}
        </nav>
        <div className="compliance-note">
          <span className="status-dot" />
          <div>
            <strong>Independent implementation</strong>
            <p>Original UI and calculation code. No third-party rocket engine.</p>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <div className="workspace-toolbar">
          <div className="segmented-control" aria-label="Workspace view">
            <button className={view === "design" ? "active" : ""} onClick={() => setView("design")}>Design</button>
            <button className={view === "flight" ? "active" : ""} onClick={() => setView("flight")}>Flight</button>
          </div>
          <div className="view-tools">
            <button aria-label="Fit view">Fit</button><button aria-label="Zoom out">−</button>
            <span>100%</span><button aria-label="Zoom in">+</button>
          </div>
        </div>

        {view === "design" ? (
          <div className="design-canvas">
            <div className="canvas-grid" />
            <div className="dimension dimension-top"><span /><strong>{designLength} mm</strong><span /></div>
            <div className="rocket-assembly" aria-label="Side profile of the ARC 54 rocket">
              <div className="rocket-nose" />
              <div className="rocket-body" style={{ width: `${Math.min(520, 280 + length / 4)}px` }}>
                <div className="body-label">ARC 54</div><div className="body-band" /><div className="body-seam" />
              </div>
              <div className="rocket-tail">
                <div className="fin fin-top" /><div className="fin fin-bottom" /><div className="nozzle" />
              </div>
            </div>
            <div className="centerline" />
            <div className="canvas-caption"><span>Side profile</span><span>Dimensions in millimetres</span></div>
          </div>
        ) : (
          <div className="flight-view">
            <div className="flight-heading">
              <div><span className="eyebrow">Preliminary estimate</span><h2>Vertical flight profile</h2></div>
              <span className="model-badge">{result.modelVersion}</span>
            </div>
            <div className="metric-grid">
              <div className="metric"><span>Apogee</span><strong>{running ? <Skeleton width={86} /> : `${result.apogeeM.toFixed(0)} m`}</strong><small>Above launch point</small></div>
              <div className="metric"><span>Maximum speed</span><strong>{running ? <Skeleton width={96} /> : `${result.maxSpeedMps.toFixed(1)} m/s`}</strong><small>{result.maxMach.toFixed(2)} Mach</small></div>
              <div className="metric"><span>Time to apogee</span><strong>{running ? <Skeleton width={74} /> : `${result.timeToApogeeS.toFixed(1)} s`}</strong><small>{result.totalFlightTimeS.toFixed(1)} s total flight</small></div>
              <div className="metric"><span>Thrust / weight</span><strong>{running ? <Skeleton width={62} /> : `${result.thrustToWeightAtIgnition.toFixed(1)} : 1`}</strong><small>{result.totalImpulseNs.toFixed(1)} N·s impulse</small></div>
            </div>
            <div className="chart-card">
              <div className="chart-title">
                <div><strong>Altitude</strong><span>Estimated trajectory over time</span></div>
                <span className="legend"><i /> Max q {Math.round(result.maxDynamicPressurePa)} Pa</span>
              </div>
              {running ? <div className="chart-loading"><Skeleton height={260} borderRadius={12} /></div> : <FlightChart result={result} />}
            </div>
            <div className="event-card">
              <div className="event-card-heading">
                <div><strong>Flight events</strong><span>Detected by the numerical model</span></div>
                <span>{result.events.length} events</span>
              </div>
              <div className="event-timeline">
                {result.events.map((event) => (
                  <div className="event-item" key={`${event.type}-${event.timeS}`}>
                    <i />
                    <strong>{event.label}</strong>
                    <span>{event.timeS.toFixed(2)} s</span>
                    <small>{event.altitudeAglM.toFixed(0)} m AGL</small>
                  </div>
                ))}
              </div>
            </div>
            <div className="assumption-strip">
              <strong>Model assumptions</strong>
              {result.assumptions.slice(0, 4).map((assumption) => <span key={assumption}>{assumption}</span>)}
            </div>
          </div>
        )}
      </section>

      <aside className="inspector">
        <div className="inspector-heading">
          <span className="eyebrow">{view === "design" ? "Inspector" : "Simulation"}</span>
          <h2>{view === "design" ? selectedComponent.name : "Launch model"}</h2>
          <p>{view === "design" ? "Edit the selected component. Changes are reflected in the workspace." : "Inputs for the preliminary vertical-flight estimate."}</p>
        </div>
        {view === "design" ? (
          <>
            <NumberField id="length" label="Airframe length" value={length} unit="mm" min={200} max={1600} onChange={(value) => { setLength(value); markChanged(); }} />
            <NumberField id="diameter" label="Outer diameter" value={diameter} unit="mm" min={20} max={200} onChange={(value) => { setDiameter(value); markChanged(); }} />
            <NumberField id="mass" label="Launch mass" value={mass} unit="kg" min={0.1} max={20} step={0.01} onChange={(value) => { setMass(value); markChanged(); }} />
            <div className="field-group"><label htmlFor="material">Material</label><select id="material" defaultValue="kraft"><option value="kraft">Kraft phenolic</option><option value="fiberglass">Fiberglass</option><option value="carbon">Carbon composite</option></select></div>
          </>
        ) : (
          <>
            <NumberField id="thrust" label="Average thrust" value={thrust} unit="N" min={1} max={5000} step={0.5} onChange={setThrust} />
            <NumberField id="burn-time" label="Burn time" value={burnTime} unit="s" min={0.1} max={30} step={0.05} onChange={setBurnTime} />
            <NumberField id="drag" label="Drag coefficient" value={dragCoefficient} unit="Cd" min={0.1} max={2} step={0.01} onChange={setDragCoefficient} />
            <NumberField id="launch-altitude" label="Launch-site altitude" value={launchAltitude} unit="m" min={-400} max={10000} step={10} onChange={setLaunchAltitude} />
            <NumberField id="wind-speed" label="Wind at 500 m" value={windSpeed} unit="m/s" min={0} max={80} step={0.5} onChange={setWindSpeed} />
            <div className="field-group">
              <label htmlFor="recovery-enabled">Recovery model</label>
              <select id="recovery-enabled" value={recoveryEnabled ? "enabled" : "disabled"} onChange={(event) => setRecoveryEnabled(event.target.value === "enabled")}>
                <option value="enabled">450 mm parachute at apogee</option>
                <option value="disabled">Ballistic descent</option>
              </select>
            </div>
            {recoveryEnabled && <NumberField id="recovery-delay" label="Deployment delay" value={recoveryDelay} unit="s" min={0} max={30} step={0.1} onChange={setRecoveryDelay} />}
            <button className="full-run-button" onClick={simulate}>Recalculate flight</button>
          </>
        )}
        <div className={(view === "design" ? warning.startsWith("No ") : modelWarning.severity === "info") ? "check-card good" : "check-card warn"}>
          <span>{(view === "design" ? warning.startsWith("No ") : modelWarning.severity === "info") ? "✓" : "!"}</span>
          <div>
            <strong>{view === "design" ? "Design check" : modelWarning.title}</strong>
            <p>{view === "design" ? warning : modelWarning.explanation}</p>
          </div>
        </div>
        <div className="inspector-footnote">
          <strong>{result.validationStatus}</strong>
          <p>Analytical regression tests pass. Experimental and independent benchmark validation are still required; do not use these results for flight-safety decisions.</p>
        </div>
      </aside>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function NumberField({
  id, label, value, unit, min, max, step, onChange,
}: {
  id: string; label: string; value: number; unit: string; min: number; max: number;
  step?: number; onChange: (value: number) => void;
}) {
  return (
    <div className="field-group">
      <label htmlFor={id}>{label}</label>
      <div className="input-with-unit">
        <input id={id} type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <span>{unit}</span>
      </div>
    </div>
  );
}
