"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LandingFootprintResult } from "../lib/physics/landing-zone.ts";

export function LandingFootprintChart({
  footprint,
}: Readonly<{ footprint: LandingFootprintResult }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const ellipse95 = footprint.confidenceEllipses.find(
      (ellipse) => ellipse.probability === 0.95,
    )!;
    const eastValues = footprint.impacts.map((impact) => impact.eastM);
    const northValues = footprint.impacts.map((impact) => impact.northM);
    eastValues.push(
      0,
      footprint.meanImpact.eastM - ellipse95.semiMajorM,
      footprint.meanImpact.eastM + ellipse95.semiMajorM,
    );
    northValues.push(
      0,
      footprint.meanImpact.northM - ellipse95.semiMajorM,
      footprint.meanImpact.northM + ellipse95.semiMajorM,
    );
    const minimumEast = Math.min(...eastValues);
    const maximumEast = Math.max(...eastValues);
    const minimumNorth = Math.min(...northValues);
    const maximumNorth = Math.max(...northValues);
    const horizontalSpan = Math.max(maximumEast - minimumEast, 10);
    const verticalSpan = Math.max(maximumNorth - minimumNorth, 10);
    const padding = 34;
    const scale = Math.min(
      (bounds.width - 2 * padding) / horizontalSpan,
      (bounds.height - 2 * padding) / verticalSpan,
    );
    const centerEast = (minimumEast + maximumEast) / 2;
    const centerNorth = (minimumNorth + maximumNorth) / 2;
    const screen = (eastM: number, northM: number) => ({
      x: bounds.width / 2 + (eastM - centerEast) * scale,
      y: bounds.height / 2 - (northM - centerNorth) * scale,
    });

    const gridStepM = 10 ** Math.floor(Math.log10(Math.max(horizontalSpan, verticalSpan) / 5));
    const adjustedGridStepM =
      Math.max(horizontalSpan, verticalSpan) / gridStepM > 8
        ? gridStepM * 2
        : gridStepM;
    context.lineWidth = 1;
    context.strokeStyle = "rgba(91,126,152,.11)";
    context.setLineDash([3, 5]);
    const firstEast = Math.floor(minimumEast / adjustedGridStepM) * adjustedGridStepM;
    for (let east = firstEast; east <= maximumEast; east += adjustedGridStepM) {
      const start = screen(east, minimumNorth);
      const end = screen(east, maximumNorth);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }
    const firstNorth = Math.floor(minimumNorth / adjustedGridStepM) * adjustedGridStepM;
    for (let north = firstNorth; north <= maximumNorth; north += adjustedGridStepM) {
      const start = screen(minimumEast, north);
      const end = screen(maximumEast, north);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }
    context.setLineDash([]);

    if (footprint.convexHull.length >= 3) {
      context.beginPath();
      footprint.convexHull.forEach((point, index) => {
        const projected = screen(point.eastM, point.northM);
        if (index === 0) context.moveTo(projected.x, projected.y);
        else context.lineTo(projected.x, projected.y);
      });
      context.closePath();
      context.fillStyle = "rgba(47,159,255,.07)";
      context.fill();
      context.strokeStyle = "rgba(47,159,255,.28)";
      context.lineWidth = 1;
      context.stroke();
    }

    const ellipseColors = [
      "rgba(107,196,255,.58)",
      "rgba(73,169,237,.42)",
      "rgba(47,159,255,.28)",
    ];
    footprint.confidenceEllipses.forEach((ellipse, index) => {
      const center = screen(ellipse.centerEastM, ellipse.centerNorthM);
      context.save();
      context.translate(center.x, center.y);
      context.rotate((-ellipse.majorAxisAngleDegFromEast * Math.PI) / 180);
      context.beginPath();
      context.ellipse(
        0,
        0,
        ellipse.semiMajorM * scale,
        ellipse.semiMinorM * scale,
        0,
        0,
        2 * Math.PI,
      );
      context.strokeStyle = ellipseColors[index];
      context.lineWidth = index === 0 ? 1.4 : 1;
      context.stroke();
      context.restore();
    });

    footprint.impacts.forEach((impact) => {
      const point = screen(impact.eastM, impact.northM);
      context.beginPath();
      context.arc(point.x, point.y, 2, 0, 2 * Math.PI);
      context.fillStyle = "rgba(176,218,246,.55)";
      context.fill();
    });
    const launch = screen(0, 0);
    context.strokeStyle = "#ffad55";
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(launch.x - 5, launch.y);
    context.lineTo(launch.x + 5, launch.y);
    context.moveTo(launch.x, launch.y - 5);
    context.lineTo(launch.x, launch.y + 5);
    context.stroke();
    const mean = screen(footprint.meanImpact.eastM, footprint.meanImpact.northM);
    context.fillStyle = "#42aaff";
    context.beginPath();
    context.arc(mean.x, mean.y, 4, 0, 2 * Math.PI);
    context.fill();
    context.strokeStyle = "#dff3ff";
    context.lineWidth = 1;
    context.stroke();

    context.fillStyle = "#7690a3";
    context.font = "650 8px ui-monospace, SFMono-Regular, Consolas, monospace";
    context.textAlign = "right";
    context.fillText("N", bounds.width - 17, 20);
    context.beginPath();
    context.moveTo(bounds.width - 17, 27);
    context.lineTo(bounds.width - 17, 39);
    context.lineTo(bounds.width - 20, 34);
    context.moveTo(bounds.width - 17, 39);
    context.lineTo(bounds.width - 14, 34);
    context.strokeStyle = "#7690a3";
    context.stroke();
    context.textAlign = "left";
    context.fillText(`${adjustedGridStepM.toFixed(adjustedGridStepM < 10 ? 1 : 0)} m grid`, 12, bounds.height - 12);
  }, [footprint]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div className="landing-footprint-chart">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Local east-north landing footprint with ${footprint.sampleCount} scenario impacts. The mean impact is ${footprint.meanImpact.eastM.toFixed(0)} metres east and ${footprint.meanImpact.northM.toFixed(0)} metres north of launch. The 95 percent radial distance is ${footprint.radialDistanceM.p95.toFixed(0)} metres.`}
      />
      <div className="landing-footprint-legend" aria-hidden="true">
        <span><i className="launch" /> Launch</span>
        <span><i className="mean" /> Mean impact</span>
        <span><i className="ellipse" /> 50 / 90 / 95% covariance ellipses</span>
      </div>
    </div>
  );
}
