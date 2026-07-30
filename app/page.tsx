"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

type ComponentKey = "nose" | "body" | "fins" | "mount" | "recovery";
type ViewKey = "design" | "flight";
type FlightPoint = { time: number; altitude: number; velocity: number };
type FlightResult = {
  apogee: number;
  maxVelocity: number;
  timeToApogee: number;
  thrustToWeight: number;
  points: FlightPoint[];
};

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

function runVerticalEstimate({
  mass,
  diameter,
  dragCoefficient,
  thrust,
  burnTime,
}: {
  mass: number;
  diameter: number;
  dragCoefficient: number;
  thrust: number;
  burnTime: number;
}): FlightResult {
  const dt = 0.02;
  const gravity = 9.80665;
  const airDensity = 1.225;
  const area = Math.PI * Math.pow(diameter / 2000, 2);
  const propellantMass = Math.min(mass * 0.18, 0.085);
  let altitude = 0;
  let velocity = 0;
  let time = 0;
  let maxVelocity = 0;
  const points: FlightPoint[] = [{ time, altitude, velocity }];

  while (time < 60) {
    const burning = time < burnTime;
    const currentMass =
      mass - (burning ? propellantMass * (time / burnTime) : propellantMass);
    const motorForce = burning ? thrust : 0;
    const drag =
      0.5 *
      airDensity *
      dragCoefficient *
      area *
      velocity *
      Math.abs(velocity);
    const acceleration = (motorForce - currentMass * gravity - drag) / currentMass;
    velocity += acceleration * dt;
    altitude = Math.max(0, altitude + velocity * dt);
    time += dt;
    maxVelocity = Math.max(maxVelocity, velocity);
    const previous = points.at(-1);
    if (!previous || time - previous.time >= 0.18) {
      points.push({ time, altitude, velocity });
    }
    if (!burning && velocity <= 0) break;
  }

  return {
    apogee: altitude,
    maxVelocity,
    timeToApogee: time,
    thrustToWeight: thrust / (mass * gravity),
    points,
  };
}

function FlightChart({ result }: { result: FlightResult }) {
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
    const maxTime = Math.max(...result.points.map((point) => point.time), 1);
    const maxAltitude = Math.max(result.apogee, 1);

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

    const coordinates = result.points.map((point) => ({
      x: padding.left + (point.time / maxTime) * plotWidth,
      y: padding.top + plotHeight - (point.altitude / maxAltitude) * plotHeight,
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
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState(true);
  const [toast, setToast] = useState("");
  const [result, setResult] = useState<FlightResult>(() =>
    runVerticalEstimate({ mass, diameter, dragCoefficient, thrust, burnTime }),
  );

  const selectedComponent = components.find((component) => component.id === selected)!;
  const designLength = length + 180;
  const warning = useMemo(() => {
    const ratio = thrust / (mass * 9.80665);
    if (ratio < 3) return "Low launch thrust-to-weight ratio";
    if (diameter < 30) return "Small diameter requires a structural review";
    return "No preliminary issues detected";
  }, [diameter, mass, thrust]);

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
      setResult(
        runVerticalEstimate({ mass, diameter, dragCoefficient, thrust, burnTime }),
      );
      setRunning(false);
      notify("Estimate complete");
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
              <span className="model-badge">Equation model · v0.1</span>
            </div>
            <div className="metric-grid">
              <div className="metric"><span>Apogee</span><strong>{running ? <Skeleton width={86} /> : `${result.apogee.toFixed(0)} m`}</strong><small>Above launch point</small></div>
              <div className="metric"><span>Maximum speed</span><strong>{running ? <Skeleton width={96} /> : `${result.maxVelocity.toFixed(1)} m/s`}</strong><small>{(result.maxVelocity / 343).toFixed(2)} Mach</small></div>
              <div className="metric"><span>Time to apogee</span><strong>{running ? <Skeleton width={74} /> : `${result.timeToApogee.toFixed(1)} s`}</strong><small>Powered + coast</small></div>
              <div className="metric"><span>Thrust / weight</span><strong>{running ? <Skeleton width={62} /> : `${result.thrustToWeight.toFixed(1)} : 1`}</strong><small>At ignition</small></div>
            </div>
            <div className="chart-card">
              <div className="chart-title">
                <div><strong>Altitude</strong><span>Estimated trajectory over time</span></div>
                <span className="legend"><i /> Altitude AGL</span>
              </div>
              {running ? <div className="chart-loading"><Skeleton height={260} borderRadius={12} /></div> : <FlightChart result={result} />}
            </div>
            <div className="assumption-strip">
              <strong>Prototype assumptions</strong><span>Vertical launch</span><span>Constant sea-level density</span><span>Constant average thrust</span><span>No wind</span>
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
            <button className="full-run-button" onClick={simulate}>Recalculate flight</button>
          </>
        )}
        <div className={warning.startsWith("No ") ? "check-card good" : "check-card warn"}>
          <span>{warning.startsWith("No ") ? "✓" : "!"}</span>
          <div><strong>Design check</strong><p>{warning}</p></div>
        </div>
        <div className="inspector-footnote">
          <strong>Engineering status</strong>
          <p>Results are exploratory and must not be used for flight safety decisions. Validation and uncertainty models are planned.</p>
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
