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
  createExplodedPreviewComponentInstances,
  createExplodedPreviewStageInstances,
  createRocketPreviewMesh,
  pickProjectedRocketPart,
  projectRocketPreview,
  type ProjectedRocketTriangle,
  type RocketPreviewNoseProfile,
  type RocketPreviewSurface,
  type RocketPreviewComponentInstance,
  type RocketPreviewStageInstance,
} from "../lib/visualization/rocket-preview-3d.ts";

const SURFACE_COLORS: Record<RocketPreviewSurface, readonly [number, number, number]> = {
  nose: [43, 51, 58],
  skin: [43, 51, 58],
  accent: [47, 159, 255],
  fin: [52, 61, 69],
  rear: [19, 24, 28],
  nozzle: [12, 16, 19],
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

type Rocket3DDisplayMode = "integrated" | "exploded";

function triangleColor(triangle: ProjectedRocketTriangle) {
  const base = SURFACE_COLORS[triangle.surface];
  const intensity = triangle.lightIntensity;
  return `rgb(${Math.round(base[0] * intensity)},${Math.round(base[1] * intensity)},${Math.round(base[2] * intensity)})`;
}

export function Rocket3DViewport({
  noseLengthM,
  noseProfile,
  bodyLengthM,
  bodyDiameterM,
  finCount,
  finRootChordM,
  finTipChordM,
  finSweepM,
  finSpanM,
  finThicknessM,
  centerOfMassXM,
  centerOfPressureXM,
  stageInstances,
  componentInstances,
  highlightSurface = null,
  onSurfaceSelect,
  onComponentSelect,
  onStageSelect,
}: Readonly<{
  noseLengthM: number;
  noseProfile: RocketPreviewNoseProfile;
  bodyLengthM: number;
  bodyDiameterM: number;
  finCount: number;
  finRootChordM: number;
  finTipChordM: number;
  finSweepM: number;
  finSpanM: number;
  finThicknessM: number;
  centerOfMassXM: number;
  centerOfPressureXM: number;
  stageInstances?: readonly RocketPreviewStageInstance[];
  componentInstances?: readonly RocketPreviewComponentInstance[];
  highlightSurface?: RocketPreviewSurface | null;
  onSurfaceSelect?: (surface: RocketPreviewSurface) => void;
  onComponentSelect?: (componentId: string) => void;
  onStageSelect?: (stageId: string) => void;
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<Readonly<{
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
  }> | null>(null);
  const projectedRef = useRef<ReturnType<typeof projectRocketPreview> | null>(null);
  const [yawRad, setYawRad] = useState(-0.42);
  const [pitchRad, setPitchRad] = useState(-0.18);
  const [zoom, setZoom] = useState(0.86);
  const [displayMode, setDisplayMode] = useState<Rocket3DDisplayMode>("integrated");
  const [hiddenStageIds, setHiddenStageIds] = useState<readonly string[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const controlInstances = componentInstances ?? stageInstances;
  const stageGroups = useMemo(() => {
    if (!controlInstances) return [];
    const groups = new Map<string, { id: string; label: string; instanceKeys: Set<string> }>();
    for (const instance of controlInstances) {
      const id = instance.stageId ?? instance.id;
      const instanceIndex = "stageInstanceIndex" in instance
        ? instance.stageInstanceIndex
        : instance.instanceIndex ?? instance.id;
      const existing = groups.get(id);
      if (existing) {
        existing.instanceKeys.add(String(instanceIndex));
      } else {
        groups.set(id, {
          id,
          label: instance.stageLabel ?? id,
          instanceKeys: new Set([String(instanceIndex)]),
        });
      }
    }
    return [...groups.values()].map(({ instanceKeys, ...group }) => ({
      ...group,
      count: instanceKeys.size,
    }));
  }, [controlInstances]);
  const hiddenStageIdSet = useMemo(() => new Set(hiddenStageIds), [hiddenStageIds]);
  const visibleStageInstances = useMemo(() => {
    if (!stageInstances) return undefined;
    const visible = stageInstances.filter((instance) => !hiddenStageIdSet.has(instance.stageId ?? instance.id));
    return visible.length > 0 ? visible : stageInstances.slice(0, 1);
  }, [hiddenStageIdSet, stageInstances]);
  const visibleComponentInstances = useMemo(() => {
    if (!componentInstances) return undefined;
    const visible = componentInstances.filter((instance) => !hiddenStageIdSet.has(instance.stageId));
    return visible.length > 0 ? visible : componentInstances.slice(0, 1);
  }, [componentInstances, hiddenStageIdSet]);
  const explodedSpacingM = useMemo(
    () => Math.max(bodyLengthM * 0.16, bodyDiameterM * 2.6, noseLengthM * 0.45),
    [bodyDiameterM, bodyLengthM, noseLengthM],
  );
  const displayStageInstances = useMemo(() => {
    if (!visibleStageInstances || displayMode === "integrated") return visibleStageInstances;
    return createExplodedPreviewStageInstances(visibleStageInstances, explodedSpacingM);
  }, [displayMode, explodedSpacingM, visibleStageInstances]);
  const displayComponentInstances = useMemo(() => {
    if (!visibleComponentInstances || displayMode === "integrated") return visibleComponentInstances;
    return createExplodedPreviewComponentInstances(visibleComponentInstances, explodedSpacingM);
  }, [displayMode, explodedSpacingM, visibleComponentInstances]);
  const mesh = useMemo(
    () =>
      createRocketPreviewMesh({
        noseLengthM,
        noseProfile,
        bodyLengthM,
        bodyRadiusM: bodyDiameterM / 2,
        finCount,
        finRootChordM,
        finTipChordM,
        finSweepM,
        finSpanM,
        finThicknessM,
        ...(displayComponentInstances
          ? { componentInstances: displayComponentInstances }
          : { stageInstances: displayStageInstances }),
      }),
    [bodyDiameterM, bodyLengthM, displayComponentInstances, displayStageInstances, finCount, finRootChordM, finSpanM, finSweepM, finThicknessM, finTipChordM, noseLengthM, noseProfile],
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
    const integratedMarkers = displayMode === "integrated"
      ? [
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
        ]
      : [];
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
        ...integratedMarkers,
      ],
    );
    projectedRef.current = projected;
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
      const isSurfaceHighlighted = highlightSurface === triangle.surface;
      const isStageHighlighted = selectedStageId !== null && triangle.stageId === selectedStageId;
      const isHighlighted = isSurfaceHighlighted || isStageHighlighted;
      context.globalAlpha = isHighlighted ? 0.86 : 0.26;
      context.strokeStyle = isSurfaceHighlighted ? "#e7f7ff" : isStageHighlighted ? "#ffad55" : "#a9c2d3";
      context.lineWidth = isHighlighted ? 1.25 : 0.45;
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
    if (displayMode === "integrated") {
      drawMarker("cg", "#ffad55", "CG");
      drawMarker("cp", "#69bfff", "CP");
    }
  }, [centerOfMassXM, centerOfPressureXM, displayMode, highlightSurface, mesh, pitchRad, selectedStageId, yawRad, zoom]);

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
      moved: false,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    pointerRef.current = {
      pointerId: pointer.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: pointer.moved || Math.hypot(deltaX, deltaY) > 2,
    };
    setYawRad((value) => value + deltaX * 0.008);
    setPitchRad((value) => clamp(value + deltaY * 0.008, -1.2, 1.2));
  };
  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (pointer?.pointerId === event.pointerId) {
      pointerRef.current = null;
      if (!pointer.moved && (onSurfaceSelect || onComponentSelect || onStageSelect)) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const part = pickProjectedRocketPart(projectedRef.current, {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        });
        if (part?.stageId) {
          setSelectedStageId(part.stageId);
          onStageSelect?.(part.stageId);
        }
        if (part?.componentId && onComponentSelect) {
          onComponentSelect?.(part.componentId);
        } else if (part) {
          onSurfaceSelect?.(part.surface);
        }
      }
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
    if (event.key.toLowerCase() === "e") {
      event.preventDefault();
      setDisplayMode((value) => value === "integrated" ? "exploded" : "integrated");
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
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

  const toggleStageVisibility = (stageId: string) => {
    const isHidden = hiddenStageIdSet.has(stageId);
    if (!isHidden && stageGroups.every((group) => group.id === stageId || hiddenStageIdSet.has(group.id))) {
      return;
    }
    if (isHidden) {
      setHiddenStageIds((current) => current.filter((id) => id !== stageId));
    } else {
      setHiddenStageIds((current) => [...current, stageId]);
      if (selectedStageId === stageId) setSelectedStageId(null);
    }
  };

  const visibleStageCount = stageGroups.filter((group) => !hiddenStageIdSet.has(group.id)).length;
  const renderedInstanceCount = controlInstances?.length ?? 1;

  return (
    <div className="rocket-3d-viewport">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`Interactive three-dimensional ARC 54 ${displayMode} preview with ${renderedInstanceCount} rendered component instances and ${visibleStageCount} visible stages, a ${noseProfile} nose and ${finCount} fins. Click a rendered surface to select its inspector component and stage. Drag or use arrow keys to orbit, use the mouse wheel or plus and minus keys to zoom, and press E to toggle integrated or exploded assembly view.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      />
      {stageGroups.length > 0 && (
        <div className="rocket-3d-stage-filter" aria-label="Stage visibility controls">
          <span>STAGE VISIBILITY</span>
          <div>
            {stageGroups.map((group) => {
              const visible = !hiddenStageIdSet.has(group.id);
              return (
                <button
                  key={group.id}
                  type="button"
                  className={visible ? "active" : ""}
                  aria-pressed={visible}
                  title={`${visible ? "Hide" : "Show"} ${group.label}`}
                  onClick={() => toggleStageVisibility(group.id)}
                >
                  <i aria-hidden="true" />
                  <span>{group.label}</span>
                  {group.count > 1 && <small>×{group.count}</small>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="rocket-3d-display-mode" aria-label="Assembly display mode">
        <span>ASSEMBLY VIEW</span>
        <div role="group" aria-label="Assembly display mode choices">
          <button
            type="button"
            className={displayMode === "integrated" ? "active" : ""}
            aria-pressed={displayMode === "integrated"}
            onClick={() => setDisplayMode("integrated")}
          >
            Integrated
          </button>
          <button
            type="button"
            className={displayMode === "exploded" ? "active" : ""}
            aria-pressed={displayMode === "exploded"}
            onClick={() => setDisplayMode("exploded")}
            title="Separate display-only components along the vehicle axis"
          >
            Exploded
          </button>
        </div>
      </div>
      <div className="rocket-3d-controls" aria-label="Three-dimensional view controls">
        <button type="button" onClick={() => setYawRad((value) => value - 0.2)} aria-label="Orbit left">↶</button>
        <button type="button" onClick={resetView}>Fit</button>
        <button type="button" onClick={() => setZoom((value) => clamp(value / 1.12, 0.4, 2.5))} aria-label="Zoom out">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((value) => clamp(value * 1.12, 0.4, 2.5))} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setYawRad((value) => value + 0.2)} aria-label="Orbit right">↷</button>
      </div>
      <div className="rocket-3d-readout">
        <span>DISPLAY MODEL · {displayMode === "exploded" ? "EXPLODED" : "INTEGRATED"}</span>
        <strong>{mesh.modelVersion}</strong>
        <small>{visibleStageCount}/{stageGroups.length || 1} stages visible</small>
        <small>{displayMode === "exploded" ? "Integrated CG / CP markers hidden in exploded view" : "Click a surface to select · drag to orbit · wheel to zoom · arrows / + / − / 0 / E"}</small>
      </div>
      <p className="rocket-3d-disclaimer">
        Display mesh only. Engineering calculations continue to use the versioned mass and aerodynamic geometry models.
      </p>
    </div>
  );
}
