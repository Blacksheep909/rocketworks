"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { WindLayer } from "../lib/physics/curves.ts";

const FONT = "650 8px ui-monospace, SFMono-Regular, Consolas, monospace";

function horizontalSpeed(layer: WindLayer): number {
  return Math.hypot(layer.eastMps, layer.northMps);
}

function finiteLayer(layer: WindLayer): boolean {
  return [layer.altitudeM, layer.eastMps, layer.northMps, layer.upMps ?? 0].every(Number.isFinite);
}

/**
 * Display-only profile plot for the same mean ENU layers consumed by the
 * launch-environment model. It intentionally does not invent interpolation or
 * turbulence data; it makes the authored/synthetic layer shape easier to
 * inspect before a run.
 */
export function WindProfileChart({
  layers,
}: Readonly<{ layers: readonly WindLayer[] }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sortedLayers = useMemo(
    () => layers.filter(finiteLayer).sort((a, b) => a.altitudeM - b.altitudeM),
    [layers],
  );
  const maximumSpeed = Math.max(1, ...sortedLayers.map(horizontalSpeed));
  const minimumAltitude = sortedLayers.length > 0 ? sortedLayers[0]!.altitudeM : 0;
  const maximumAltitude = sortedLayers.length > 0
    ? Math.max(minimumAltitude + 100, sortedLayers.at(-1)!.altitudeM)
    : 100;
  const altitudeSpan = Math.max(100, maximumAltitude - minimumAltitude);
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

    const padding = { top: 18, right: 28, bottom: 25, left: 38 };
    const plotWidth = Math.max(1, bounds.width - padding.left - padding.right);
    const plotHeight = Math.max(1, bounds.height - padding.top - padding.bottom);
    const screen = (speedMps: number, altitudeM: number) => ({
      x: padding.left + (speedMps / maximumSpeed) * plotWidth,
      y: padding.top + (1 - (altitudeM - minimumAltitude) / altitudeSpan) * plotHeight,
    });
    const altitudeLabel = (value: number) => `${Math.round(value)} m`;
    const speedLabel = (value: number) => `${value.toFixed(value < 10 ? 1 : 0)}`;

    context.font = FONT;
    context.lineWidth = 1;
    context.setLineDash([2, 4]);
    context.strokeStyle = "rgba(91,126,152,.16)";
    context.fillStyle = "#718b9b";
    context.textAlign = "right";
    for (let index = 0; index <= 4; index += 1) {
      const fraction = index / 4;
      const x = padding.left + fraction * plotWidth;
      context.beginPath();
      context.moveTo(x, padding.top);
      context.lineTo(x, padding.top + plotHeight);
      context.stroke();
      context.fillText(speedLabel(fraction * maximumSpeed), x, bounds.height - 9);
    }
    context.textAlign = "left";
    for (let index = 0; index <= 4; index += 1) {
      const fraction = index / 4;
      const y = padding.top + (1 - fraction) * plotHeight;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(padding.left + plotWidth, y);
      context.stroke();
      context.fillText(altitudeLabel(minimumAltitude + fraction * altitudeSpan), 4, y + 3);
    }
    context.setLineDash([]);

    context.fillStyle = "#84a7bc";
    context.textAlign = "left";
    context.fillText("HORIZONTAL SPEED · m/s", padding.left, 10);
    context.textAlign = "right";
    context.fillText("ENU DIRECTION", bounds.width - 2, 10);

    if (sortedLayers.length === 0) {
      context.fillStyle = "#78909f";
      context.textAlign = "center";
      context.fillText("No finite wind layers", bounds.width / 2, bounds.height / 2);
      return;
    }

    context.beginPath();
    sortedLayers.forEach((layer, index) => {
      const point = screen(horizontalSpeed(layer), layer.altitudeM);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.strokeStyle = "#43a9ff";
    context.lineWidth = 2;
    context.stroke();

    sortedLayers.forEach((layer) => {
      const point = screen(horizontalSpeed(layer), layer.altitudeM);
      context.beginPath();
      context.arc(point.x, point.y, 3, 0, 2 * Math.PI);
      context.fillStyle = "#43a9ff";
      context.fill();
      context.strokeStyle = "#dff4ff";
      context.lineWidth = 1;
      context.stroke();

      const speed = horizontalSpeed(layer);
      if (!(speed > 1e-9)) return;
      const angle = Math.atan2(layer.northMps, layer.eastMps);
      const arrowOriginX = bounds.width - padding.right + 1;
      const arrowLength = 8;
      const arrowEndX = arrowOriginX + Math.cos(angle) * arrowLength;
      const arrowEndY = point.y - Math.sin(angle) * arrowLength;
      context.beginPath();
      context.moveTo(arrowOriginX, point.y);
      context.lineTo(arrowEndX, arrowEndY);
      context.strokeStyle = "#ffad55";
      context.lineWidth = 1.2;
      context.stroke();
      context.beginPath();
      context.moveTo(arrowEndX, arrowEndY);
      context.lineTo(
        arrowEndX - Math.cos(angle - 0.55) * 3.5,
        arrowEndY + Math.sin(angle - 0.55) * 3.5,
      );
      context.moveTo(arrowEndX, arrowEndY);
      context.lineTo(
        arrowEndX - Math.cos(angle + 0.55) * 3.5,
        arrowEndY + Math.sin(angle + 0.55) * 3.5,
      );
      context.stroke();
    });
  }, [altitudeSpan, maximumSpeed, minimumAltitude, sortedLayers]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const first = sortedLayers[0];
  const last = sortedLayers.at(-1);
  const rangeLabel = first && last
    ? `${Math.round(first.altitudeM)}–${Math.round(last.altitudeM)} m AGL · ${sortedLayers.length} layers`
    : "No finite layers";
  return (
    <div className="wind-profile-chart">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Altitude-dependent mean wind profile with ${sortedLayers.length} layers from ${Math.round(minimumAltitude)} to ${Math.round(maximumAltitude)} metres AGL. Horizontal speed ranges from zero to ${maximumSpeed.toFixed(1)} metres per second; orange arrows show ENU direction.`}
      />
      <div className="wind-profile-chart-legend" aria-hidden="true">
        <span><i className="speed" /> Horizontal mean speed</span>
        <span><i className="direction" /> ENU direction</span>
        <small>{rangeLabel}</small>
      </div>
    </div>
  );
}
