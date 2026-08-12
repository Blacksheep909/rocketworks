"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import {
  advanceFlightTrajectoryReplay,
  nearestFlightTrajectorySampleIndex,
  projectFlightTrajectory,
  type FlightTrajectoryCamera,
  type FlightTrajectoryEvent,
  type FlightTrajectorySeries,
  type ProjectedFlightTrajectoryPoint,
} from "../lib/visualization/flight-trajectory.ts";

const SERIES_COLORS = ["#2f9fff", "#ff7043", "#b58cff", "#45d6b0", "#e9c46a"] as const;
const DEFAULT_CAMERA: FlightTrajectoryCamera = {
  yawRad: 0.68,
  pitchRad: -0.48,
  zoom: 1,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function eventColor(kind: string | undefined): string {
  if (kind === "rail") return "#ff7043";
  if (kind === "scheduled") return "#f4a340";
  return "#b9d8e8";
}

export function FlightTrajectoryViewport({
  series,
  events = [],
  selectedTimeS = null,
  onSelectionChange,
}: Readonly<{
  series: readonly FlightTrajectorySeries[];
  events?: readonly FlightTrajectoryEvent[];
  selectedTimeS?: number | null;
  onSelectionChange?: (timeS: number | null) => void;
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<Readonly<{
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
  }> | null>(null);
  const [camera, setCamera] = useState<FlightTrajectoryCamera>(DEFAULT_CAMERA);
  const [canvasSize, setCanvasSize] = useState({ width: 720, height: 340 });
  const [hoverTimeS, setHoverTimeS] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const selectedTimeRef = useRef<number | null>(selectedTimeS);
  const playbackTimeRef = useRef<number | null>(selectedTimeS);
  const primarySeries = series[0] ?? null;
  const primaryTrace = useMemo(() => primarySeries?.trace ?? [], [primarySeries]);
  const projection = useMemo(
    () => projectFlightTrajectory(series, events, camera, canvasSize),
    [camera, canvasSize, events, series],
  );
  const activeTimeS = hoverTimeS ?? selectedTimeS;
  const activeIndex = activeTimeS === null
    ? null
    : nearestFlightTrajectorySampleIndex(primaryTrace, activeTimeS);
  const activePrimarySample = activeIndex === null ? null : primaryTrace[activeIndex] ?? null;
  const activePrimaryProjectedPoint = activeIndex === null
    ? null
    : projection.series[0]?.points[activeIndex] ?? null;

  useEffect(() => {
    selectedTimeRef.current = selectedTimeS;
    if (!playing) playbackTimeRef.current = selectedTimeS;
  }, [playing, selectedTimeS]);

  useEffect(() => {
    if (!playing || primaryTrace.length < 2) return;
    const firstTimeS = primaryTrace[0]!.timeS;
    const finalTimeS = primaryTrace.at(-1)!.timeS;
    let frameId: number | null = null;
    let previousTimestampMs: number | null = null;
    const tick = (timestampMs: number) => {
      if (previousTimestampMs === null) previousTimestampMs = timestampMs;
      const currentTimeS = playbackTimeRef.current ?? selectedTimeRef.current ?? firstTimeS;
      const elapsedS = Math.max(0, (timestampMs - previousTimestampMs) / 1000);
      previousTimestampMs = timestampMs;
      const replayStep = advanceFlightTrajectoryReplay(
        currentTimeS,
        elapsedS,
        playbackRate,
        firstTimeS,
        finalTimeS,
      );
      if (replayStep.completed) {
        playbackTimeRef.current = replayStep.timeS;
        selectedTimeRef.current = replayStep.timeS;
        onSelectionChange?.(replayStep.timeS);
        setPlaying(false);
        return;
      }
      playbackTimeRef.current = replayStep.timeS;
      selectedTimeRef.current = replayStep.timeS;
      onSelectionChange?.(replayStep.timeS);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [onSelectionChange, playbackRate, playing, primaryTrace]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        setCanvasSize({ width: bounds.width, height: bounds.height });
      }
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvasSize.width * ratio));
    canvas.height = Math.max(1, Math.round(canvasSize.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);
    context.fillStyle = "rgba(7, 13, 18, .88)";
    context.fillRect(0, 0, canvasSize.width, canvasSize.height);

    const originX = canvasSize.width / 2 - projection.bounds.centerLateral * projection.bounds.scale;
    const originY = canvasSize.height / 2 + projection.bounds.centerVertical * projection.bounds.scale;
    context.save();
    context.setLineDash([3, 6]);
    context.strokeStyle = "rgba(130, 165, 185, .18)";
    context.lineWidth = 1;
    for (let index = 1; index < 5; index += 1) {
      const x = (canvasSize.width * index) / 5;
      const y = (canvasSize.height * index) / 5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvasSize.height);
      context.stroke();
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvasSize.width, y);
      context.stroke();
    }
    context.restore();
    context.save();
    context.setLineDash([5, 5]);
    context.strokeStyle = "rgba(255, 173, 85, .44)";
    context.beginPath();
    context.moveTo(originX, originY);
    context.lineTo(originX + 42, originY);
    context.stroke();
    context.fillStyle = "#ffad55";
    context.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
    context.fillText("PAD", originX + 8, originY - 8);
    context.restore();

    projection.series.forEach((path, seriesIndex) => {
      if (path.points.length === 0) return;
      const color = path.color ?? SERIES_COLORS[seriesIndex % SERIES_COLORS.length]!;
      context.save();
      context.beginPath();
      path.points.forEach((point, pointIndex) => {
        if (pointIndex === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.strokeStyle = color;
      context.globalAlpha = seriesIndex === 0 ? 0.96 : 0.64;
      context.lineWidth = seriesIndex === 0 ? 2.4 : 1.5;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();
      const first = path.points[0]!;
      const last = path.points.at(-1)!;
      context.fillStyle = color;
      context.beginPath();
      context.arc(first.x, first.y, seriesIndex === 0 ? 3.5 : 2.5, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(last.x, last.y, seriesIndex === 0 ? 3.5 : 2.5, 0, Math.PI * 2);
      context.fill();
      context.restore();
    });

    projection.events.forEach((event) => {
      if (!event.point) return;
      context.save();
      context.fillStyle = eventColor(event.kind);
      context.strokeStyle = "rgba(7, 13, 18, .95)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(event.point.x, event.point.y, 5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.font = "600 9px ui-monospace, SFMono-Regular, Consolas, monospace";
      context.fillStyle = "#dbe8ee";
      context.fillText(event.label.slice(0, 22), event.point.x + 8, event.point.y - 8);
      context.restore();
    });

    if (activeTimeS !== null) {
      projection.series.forEach((path, seriesIndex) => {
        const index = nearestFlightTrajectorySampleIndex(
          series[seriesIndex]?.trace ?? [],
          activeTimeS,
        );
        const point = index === null ? null : path.points[index] ?? null;
        if (!point) return;
        const color = path.color ?? SERIES_COLORS[seriesIndex % SERIES_COLORS.length]!;
        context.save();
        context.fillStyle = color;
        context.strokeStyle = "#f1f8fb";
        context.lineWidth = seriesIndex === 0 ? 2 : 1;
        context.beginPath();
        context.arc(point.x, point.y, seriesIndex === 0 ? 6 : 4, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        if (point.attitude) {
          const glyphLength = seriesIndex === 0 ? 30 : 21;
          const noseX = point.x + point.attitude.noseDirectionScreen.x * glyphLength;
          const noseY = point.y + point.attitude.noseDirectionScreen.y * glyphLength;
          const headAngle = Math.atan2(noseY - point.y, noseX - point.x);
          context.save();
          context.strokeStyle = "#f1f8fb";
          context.fillStyle = "#f1f8fb";
          context.lineWidth = seriesIndex === 0 ? 2 : 1.25;
          context.beginPath();
          context.moveTo(point.x, point.y);
          context.lineTo(noseX, noseY);
          context.stroke();
          context.beginPath();
          context.moveTo(noseX, noseY);
          context.lineTo(noseX - Math.cos(headAngle - 0.48) * 7, noseY - Math.sin(headAngle - 0.48) * 7);
          context.lineTo(noseX - Math.cos(headAngle + 0.48) * 7, noseY - Math.sin(headAngle + 0.48) * 7);
          context.closePath();
          context.fill();
          context.restore();
        }
        context.restore();
      });
    }

    context.save();
    context.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
    context.fillStyle = "#78909d";
    context.fillText("EAST / NORTH · UP", 12, canvasSize.height - 12);
    context.fillText(`${projection.series.length} path${projection.series.length === 1 ? "" : "s"} · ${projection.events.length} event${projection.events.length === 1 ? "" : "s"}`, canvasSize.width - 142, canvasSize.height - 12);
    context.restore();
  }, [activeTimeS, camera, canvasSize, events, projection, series]);

  const emitSelection = (timeS: number | null) => {
    setPlaying(false);
    playbackTimeRef.current = timeS;
    selectedTimeRef.current = timeS;
    onSelectionChange?.(timeS);
  };

  const nearestPointAtPointer = (event: PointerEvent<HTMLCanvasElement>): number | null => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const points = projection.series[0]?.points ?? [];
    let nearest: ProjectedFlightTrajectoryPoint | null = null;
    let distance = Infinity;
    for (const point of points) {
      const candidateDistance = Math.hypot(point.x - x, point.y - y);
      if (candidateDistance < distance) {
        nearest = point;
        distance = candidateDistance;
      }
    }
    return nearest && distance <= 22 ? nearest.timeS : null;
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) {
      setHoverTimeS(nearestPointAtPointer(event));
      return;
    }
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    const moved = pointer.moved || Math.hypot(deltaX, deltaY) > 2;
    pointerRef.current = { pointerId: pointer.pointerId, x: event.clientX, y: event.clientY, moved };
    if (moved) {
      setCamera((current) => ({
        ...current,
        yawRad: current.yawRad + deltaX * 0.008,
        pitchRad: clamp(current.pitchRad + deltaY * 0.008, -1.2, 1.2),
      }));
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (pointer?.pointerId === event.pointerId) {
      if (!pointer.moved) emitSelection(nearestPointAtPointer(event));
      pointerRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    setCamera((current) => ({ ...current, zoom: clamp(current.zoom * Math.exp(-event.deltaY * 0.001), 0.55, 4) }));
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setCamera((current) => ({ ...current, yawRad: current.yawRad + (event.key === "ArrowLeft" ? -0.12 : 0.12) }));
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      setCamera((current) => ({ ...current, pitchRad: clamp(current.pitchRad + (event.key === "ArrowUp" ? -0.1 : 0.1), -1.2, 1.2) }));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setCamera((current) => ({ ...current, zoom: clamp(current.zoom * 1.12, 0.55, 4) }));
    } else if (event.key === "-") {
      event.preventDefault();
      setCamera((current) => ({ ...current, zoom: clamp(current.zoom / 1.12, 0.55, 4) }));
    } else if (event.key === "0") {
      event.preventDefault();
      setCamera(DEFAULT_CAMERA);
    }
  };

  const togglePlayback = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (primaryTrace.length < 2) return;
    const firstTimeS = primaryTrace[0]!.timeS;
    const finalTimeS = primaryTrace.at(-1)!.timeS;
    const requestedTimeS = selectedTimeRef.current ?? firstTimeS;
    const startTimeS = requestedTimeS >= finalTimeS ? firstTimeS : Math.max(firstTimeS, requestedTimeS);
    setHoverTimeS(null);
    playbackTimeRef.current = startTimeS;
    selectedTimeRef.current = startTimeS;
    onSelectionChange?.(startTimeS);
    setPlaying(true);
  };

  const selectIndex = (index: number) => {
    const sample = primaryTrace[index];
    if (sample) emitSelection(sample.timeS);
  };

  return (
    <section className="flight-trajectory-viewport" aria-labelledby="flight-trajectory-title">
      <div className="flight-trajectory-heading">
        <div>
          <span className="eyebrow">World-frame view</span>
          <h4 id="flight-trajectory-title">Interactive flight path</h4>
          <p>Orbit the coupled ENU trajectory, inspect release markers, and scrub the same time selection used by the trace profile.</p>
        </div>
        <div className="flight-trajectory-heading-meta">
          <span>{projection.validationStatus}</span>
          <strong>{projection.modelVersion}</strong>
        </div>
      </div>
      <div className="flight-trajectory-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="flight-trajectory-canvas"
          role="img"
          tabIndex={0}
          aria-label="Interactive world-frame flight trajectory. Drag to orbit, use the mouse wheel or plus and minus keys to zoom, and click the path to select a trace time."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverTimeS(null)}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
        />
        <div className="flight-trajectory-controls" aria-label="Flight trajectory view controls">
          <button type="button" onClick={() => setCamera((current) => ({ ...current, yawRad: current.yawRad - 0.2 }))} aria-label="Orbit flight path left">↶</button>
          <button type="button" onClick={() => setCamera(DEFAULT_CAMERA)}>Fit</button>
          <button type="button" onClick={() => setCamera((current) => ({ ...current, zoom: clamp(current.zoom / 1.12, 0.55, 4) }))} aria-label="Zoom flight path out">−</button>
          <span>{Math.round(camera.zoom * 100)}%</span>
          <button type="button" onClick={() => setCamera((current) => ({ ...current, zoom: clamp(current.zoom * 1.12, 0.55, 4) }))} aria-label="Zoom flight path in">+</button>
          <button type="button" onClick={() => setCamera((current) => ({ ...current, yawRad: current.yawRad + 0.2 }))} aria-label="Orbit flight path right">↷</button>
        </div>
      </div>
      <div className="flight-trajectory-replay" aria-label="Flight trajectory replay controls">
        <button
          type="button"
          className="flight-trajectory-replay-toggle"
          onClick={togglePlayback}
          disabled={primaryTrace.length < 2}
          aria-pressed={playing}
          aria-label={playing ? "Pause flight path replay" : "Play flight path replay"}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <label htmlFor="flight-trajectory-playback-rate">Replay rate</label>
        <select
          id="flight-trajectory-playback-rate"
          value={playbackRate}
          onChange={(event) => setPlaybackRate(Number(event.target.value))}
          aria-label="Flight path replay speed"
        >
          {[0.25, 0.5, 1, 2, 4].map((rate) => <option key={rate} value={rate}>{rate}x</option>)}
        </select>
        <span className="flight-trajectory-replay-status" aria-live="polite">{playing ? "Playing trace" : "Replay paused"}</span>
      </div>
      <div className="flight-trajectory-legend" aria-label="Flight path legend">
        {series.map((entry, index) => <span key={entry.id}><i style={{ background: entry.color ?? SERIES_COLORS[index % SERIES_COLORS.length] }} />{entry.label}</span>)}
        <span><i className="event" />events</span>
      </div>
      <div className="flight-trajectory-scrubber">
        <label htmlFor="flight-trajectory-scrubber">Trace time</label>
        <input
          id="flight-trajectory-scrubber"
          type="range"
          min={0}
          max={Math.max(primaryTrace.length - 1, 0)}
          step={1}
          value={Math.min(activeIndex ?? 0, Math.max(primaryTrace.length - 1, 0))}
          disabled={primaryTrace.length === 0}
          onChange={(event) => selectIndex(Number(event.target.value))}
        />
        <output aria-live="polite">{activeTimeS === null ? "Select a point" : `t ${activeTimeS.toFixed(2)} s`}</output>
      </div>
      {activePrimarySample && (
        <p className="flight-trajectory-readout" aria-live="polite">
          Selected sample <strong>{activePrimarySample.timeS.toFixed(2)} s</strong>. {activePrimaryProjectedPoint?.attitude ? `Rigid-body attitude available${activePrimaryProjectedPoint.attitude.angularRateMagnitudeRadS === null ? "" : ` · rate ${activePrimaryProjectedPoint.attitude.angularRateMagnitudeRadS.toFixed(3)} rad/s`}.` : "This path is translation-only at the selected sample."} Click any path point to synchronize the detailed trace.
        </p>
      )}
      <p className="flight-trajectory-disclaimer">Display projection only. It reuses the selected simulation states and does not add forces, contact, collision, range-safety, or flight-validation claims.</p>
    </section>
  );
}
