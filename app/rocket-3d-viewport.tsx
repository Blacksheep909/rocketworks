"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import {
  createRocketPreviewMesh,
  projectRocketPreview,
  type ProjectedRocketTriangle,
  type RocketPreviewSurface,
} from "../lib/visualization/rocket-preview-3d.ts";

const SURFACE_COLORS: Record<RocketPreviewSurface, readonly [number, number, number]> = {
  skin: [43, 51, 58],
  accent: [47, 159, 255],
  fin: [52, 61, 69],
  rear: [19, 24, 28],
  nozzle: [12, 16, 19],
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function triangleColor(triangle: ProjectedRocketTriangle) {
  const base = SURFACE_COLORS[triangle.surface];
  const intensity = triangle.lightIntensity;
  return `rgb(${Math.round(base[0] * intensity)},${Math.round(base[1] * intensity)},${Math.round(base[2] * intensity)})`;
}

export function Rocket3DViewport({
  noseLengthM,
  bodyLengthM,
  bodyDiameterM,
  centerOfMassXM,
  centerOfPressureXM,
}: Readonly<{
  noseLengthM: number;
  bodyLengthM: number;
  bodyDiameterM: number;
  centerOfMassXM: number;
  centerOfPressureXM: number;
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<Readonly<{
    pointerId: number;
    x: number;
    y: number;
  }> | null>(null);
  const [yawRad, setYawRad] = useState(-0.42);
  const [pitchRad, setPitchRad] = useState(-0.18);
  const [zoom, setZoom] = useState(0.86);
  const mesh = useMemo(
    () =>
      createRocketPreviewMesh({
        noseLengthM,
        bodyLengthM,
        bodyRadiusM: bodyDiameterM / 2,
        finCount: 3,
        finRootChordM: Math.min(0.13, bodyLengthM * 0.45),
        finTipChordM: Math.min(0.055, bodyLengthM * 0.18),
        finSweepM: Math.min(0.045, bodyLengthM * 0.14),
        finSpanM: 0.075,
        finThicknessM: 0.003,
      }),
    [bodyDiameterM, bodyLengthM, noseLengthM],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (!(bounds.width > 0) || !(bounds.height > 0)) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(bounds.width * pixelRatio));
    const pixelHeight = Math.max(1, Math.round(bounds.height * pixelRatio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    const markerHeightM = mesh.maximumRadiusM * 1.26;
    const projected = projectRocketPreview(
      mesh,
      { yawRad, pitchRad, zoom },
      { width: bounds.width, height: bounds.height, padding: 46 },
      [
        { id: "axis-start", position: { x: 0, y: 0, z: 0 } },
        {
          id: "axis-end",
          position: { x: mesh.longitudinalLengthM, y: 0, z: 0 },
        },
        {
          id: "cg-center",
          position: { x: centerOfMassXM, y: 0, z: 0 },
        },
        {
          id: "cg-label",
          position: { x: centerOfMassXM, y: 0, z: markerHeightM },
        },
        {
          id: "cp-center",
          position: { x: centerOfPressureXM, y: 0, z: 0 },
        },
        {
          id: "cp-label",
          position: { x: centerOfPressureXM, y: 0, z: -markerHeightM },
        },
      ],
    );
    const axisStart = projected.markers["axis-start"];
    const axisEnd = projected.markers["axis-end"];
    context.save();
    context.setLineDash([5, 6]);
    context.strokeStyle = "rgba(118,145,165,.28)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(axisStart.x, axisStart.y);
    context.lineTo(axisEnd.x, axisEnd.y);
    context.stroke();
    context.restore();

    for (const triangle of projected.triangles) {
      context.beginPath();
      context.moveTo(triangle.points[0].x, triangle.points[0].y);
      context.lineTo(triangle.points[1].x, triangle.points[1].y);
      context.lineTo(triangle.points[2].x, triangle.points[2].y);
      context.closePath();
      context.globalAlpha = triangle.facingCamera ? 0.98 : 0.52;
      context.fillStyle = triangleColor(triangle);
      context.fill();
      context.globalAlpha = 0.26;
      context.strokeStyle = "#a9c2d3";
      context.lineWidth = 0.45;
      context.stroke();
    }
    context.globalAlpha = 1;

    const drawMarker = (
      id: "cg" | "cp",
      color: string,
      label: string,
    ) => {
      const center = projected.markers[`${id}-center`];
      const labelPoint = projected.markers[`${id}-label`];
      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = 1.25;
      context.beginPath();
      context.moveTo(center.x, center.y);
      context.lineTo(labelPoint.x, labelPoint.y);
      context.stroke();
      context.beginPath();
      context.arc(center.x, center.y, 3.2, 0, 2 * Math.PI);
      context.fill();
      context.font = "650 9px ui-monospace, SFMono-Regular, Consolas, monospace";
      context.textAlign = "center";
      context.textBaseline = id === "cg" ? "bottom" : "top";
      context.fillText(label, labelPoint.x, labelPoint.y + (id === "cg" ? -4 : 4));
    };
    drawMarker("cg", "#ffad55", "CG");
    drawMarker("cp", "#69bfff", "CP");
  }, [centerOfMassXM, centerOfPressureXM, mesh, pitchRad, yawRad, zoom]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const resetView = () => {
    setYawRad(-0.42);
    setPitchRad(-0.18);
    setZoom(0.86);
  };
  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    pointerRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setYawRad((value) => value + deltaX * 0.008);
    setPitchRad((value) => clamp(value + deltaY * 0.008, -1.2, 1.2));
  };
  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current?.pointerId === event.pointerId) {
      pointerRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    setZoom((value) => clamp(value * Math.exp(-event.deltaY * 0.001), 0.4, 2.5));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setYawRad((value) => value + (event.key === "ArrowLeft" ? -0.12 : 0.12));
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      setPitchRad((value) =>
        clamp(value + (event.key === "ArrowUp" ? -0.1 : 0.1), -1.2, 1.2),
      );
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setZoom((value) => clamp(value * 1.1, 0.4, 2.5));
    } else if (event.key === "-") {
      event.preventDefault();
      setZoom((value) => clamp(value / 1.1, 0.4, 2.5));
    } else if (event.key === "0") {
      event.preventDefault();
      resetView();
    }
  };

  return (
    <div className="rocket-3d-viewport">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`Interactive three-dimensional ARC 54 preview, ${Math.round(mesh.longitudinalLengthM * 1000)} millimetres long. Drag or use arrow keys to orbit, and use the mouse wheel or plus and minus keys to zoom.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      />
      <div className="rocket-3d-controls" aria-label="Three-dimensional view controls">
        <button type="button" onClick={() => setYawRad((value) => value - 0.2)} aria-label="Orbit left">↶</button>
        <button type="button" onClick={resetView}>Fit</button>
        <button type="button" onClick={() => setZoom((value) => clamp(value / 1.12, 0.4, 2.5))} aria-label="Zoom out">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((value) => clamp(value * 1.12, 0.4, 2.5))} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setYawRad((value) => value + 0.2)} aria-label="Orbit right">↷</button>
      </div>
      <div className="rocket-3d-readout">
        <span>DISPLAY MODEL</span>
        <strong>{mesh.modelVersion}</strong>
        <small>Drag to orbit · wheel to zoom · arrows / + / − / 0</small>
      </div>
      <p className="rocket-3d-disclaimer">
        Display mesh only. Engineering calculations continue to use the versioned mass and aerodynamic geometry models.
      </p>
    </div>
  );
}
