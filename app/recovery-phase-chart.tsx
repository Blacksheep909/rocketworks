"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { FlightTracePoint } from "../lib/physics/vertical-flight.ts";
import {
  createRecoveryPhaseSamples,
  createRecoveryPhaseSpans,
  recoveryPhaseLabel,
  type RecoveryPhase,
} from "../lib/visualization/recovery-phase.ts";

const FONT = "650 8px ui-monospace, SFMono-Regular, Consolas, monospace";
const PHASE_ORDER: readonly RecoveryPhase[] = [
  "ballistic",
  "deployment-delay",
  "inflating",
  "reefing",
  "inflated",
];
const PHASE_COLORS: Record<RecoveryPhase, string> = {
  ballistic: "#647888",
  "deployment-delay": "#ffad55",
  inflating: "#43a9ff",
  reefing: "#b984ff",
  inflated: "#57d7b1",
};

function finiteTrace(trace: readonly FlightTracePoint[]): FlightTracePoint[] {
  return trace.filter((sample) => Number.isFinite(sample.timeS));
}

/**
 * Display-only timeline for the recorded vertical recovery approximation.
 * It visualizes solver samples; it does not add a canopy or line-dynamics
 * model between those samples.
 */
export function RecoveryPhaseChart({
  trace,
  recoveryEnabled,
}: Readonly<{
  trace: readonly FlightTracePoint[];
  recoveryEnabled: boolean;
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cleanTrace = useMemo(() => finiteTrace(trace), [trace]);
  const samples = useMemo(
    () => createRecoveryPhaseSamples(cleanTrace, recoveryEnabled),
    [cleanTrace, recoveryEnabled],
  );
  const spans = useMemo(() => createRecoveryPhaseSpans(samples), [samples]);
  const maximumTimeS = Math.max(1, samples.at(-1)?.timeS ?? cleanTrace.at(-1)?.timeS ?? 1);
  const commandTimeS = samples.find((sample) => sample.phase !== "ballistic")?.timeS ?? null;
  const phaseSummary = useMemo(
    () => [...new Set(samples.map((sample) => sample.phase))].map(recoveryPhaseLabel),
    [samples],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (!(bounds.width > 0) || !(bounds.height > 0)) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(bounds.width * pixelRatio));
    canvas.height = Math.max(1, Math.round(bounds.height * pixelRatio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);

    const padding = { top: 24, right: 20, bottom: 35, left: 100 };
    const plotWidth = Math.max(1, bounds.width - padding.left - padding.right);
    const timelineTop = padding.top;
    const timelineHeight = 116;
    const rowHeight = timelineHeight / PHASE_ORDER.length;
    const areaTop = timelineTop + timelineHeight + 18;
    const areaHeight = Math.max(1, bounds.height - areaTop - padding.bottom);
    const x = (timeS: number) => padding.left + (Math.max(0, Math.min(maximumTimeS, timeS)) / maximumTimeS) * plotWidth;
    const yForPhase = (phase: RecoveryPhase) => timelineTop + PHASE_ORDER.indexOf(phase) * rowHeight;
    const yForArea = (fraction: number) => areaTop + (1 - Math.max(0, Math.min(1, fraction))) * areaHeight;

    context.font = FONT;
    context.textBaseline = "middle";
    context.lineWidth = 1;
    context.setLineDash([2, 4]);
    context.strokeStyle = "rgba(91,126,152,.16)";
    context.fillStyle = "#718b9b";
    context.textAlign = "center";
    for (let index = 0; index <= 4; index += 1) {
      const fraction = index / 4;
      const xPosition = padding.left + fraction * plotWidth;
      context.beginPath();
      context.moveTo(xPosition, timelineTop);
      context.lineTo(xPosition, areaTop + areaHeight);
      context.stroke();
      context.fillText(`${(fraction * maximumTimeS).toFixed(maximumTimeS < 10 ? 1 : 0)} s`, xPosition, bounds.height - 15);
    }
    context.textAlign = "left";
    PHASE_ORDER.forEach((phase, index) => {
      const top = timelineTop + index * rowHeight;
      context.beginPath();
      context.moveTo(padding.left, top + rowHeight);
      context.lineTo(padding.left + plotWidth, top + rowHeight);
      context.stroke();
      context.fillStyle = PHASE_COLORS[phase];
      context.fillText(recoveryPhaseLabel(phase), 6, top + rowHeight / 2);
    });
    context.beginPath();
    context.moveTo(padding.left, areaTop);
    context.lineTo(padding.left + plotWidth, areaTop);
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = "#84a7bc";
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.fillText("RECOVERY PHASE · recorded samples", padding.left, 11);
    context.textAlign = "right";
    context.fillText("EFFECTIVE AREA", bounds.width - 2, 11);
    context.textAlign = "left";
    context.fillText("CANOPY AREA FRACTION", padding.left, areaTop - 7);

    if (spans.length === 0) {
      context.fillStyle = "#78909f";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(recoveryEnabled ? "No finite recovery samples" : "Recovery disabled", bounds.width / 2, bounds.height / 2);
      return;
    }

    spans.forEach((span) => {
      const startX = x(span.startTimeS);
      const endX = Math.max(startX + 1, x(span.endTimeS));
      const top = yForPhase(span.phase) + 4;
      context.fillStyle = `${PHASE_COLORS[span.phase]}33`;
      context.fillRect(startX, top, endX - startX, Math.max(2, rowHeight - 8));
      context.strokeStyle = `${PHASE_COLORS[span.phase]}aa`;
      context.lineWidth = 1.2;
      context.strokeRect(startX, top, endX - startX, Math.max(2, rowHeight - 8));
    });

    context.beginPath();
    samples.forEach((sample, index) => {
      const pointX = x(sample.timeS);
      const pointY = yForArea(sample.inflationFraction * sample.reefingFraction);
      if (index === 0) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    });
    context.strokeStyle = "#43a9ff";
    context.lineWidth = 2;
    context.stroke();
    const lastSample = samples.at(-1)!;
    context.fillStyle = "#43a9ff";
    context.beginPath();
    context.arc(x(lastSample.timeS), yForArea(lastSample.inflationFraction * lastSample.reefingFraction), 3, 0, 2 * Math.PI);
    context.fill();

    if (commandTimeS !== null) {
      const commandX = x(commandTimeS);
      context.setLineDash([4, 3]);
      context.strokeStyle = "#ffad55";
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(commandX, timelineTop - 8);
      context.lineTo(commandX, areaTop + areaHeight);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#ffad55";
      context.textAlign = commandX > bounds.width - 80 ? "right" : "left";
      context.textBaseline = "alphabetic";
      context.fillText("COMMAND", commandX + (commandX > bounds.width - 80 ? -4 : 4), timelineTop - 11);
    }
  }, [commandTimeS, maximumTimeS, recoveryEnabled, samples, spans]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const summary = samples.length === 0
    ? recoveryEnabled ? "No finite recovery samples" : "Recovery disabled"
    : `${phaseSummary.join(" · ")} · ${samples.length} samples`;
  return (
    <div className="recovery-phase-chart">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Recovery phase timeline for the vertical preview. ${summary}. ${commandTimeS === null ? "No recovery command was recorded." : `The first recovery command sample is at ${commandTimeS.toFixed(2)} seconds.`} The blue curve is the recorded effective canopy area fraction; this is a display-only engineering preview.`}
      />
      <div className="recovery-phase-chart-legend" aria-hidden="true">
        <span><i className="command" /> Command</span>
        <span><i className="area" /> Effective area fraction</span>
        <small>{summary}</small>
      </div>
    </div>
  );
}
