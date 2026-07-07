import { useMemo } from "react";
import { coverCropFractions } from "@/lib/scan-geometry";
import { SAMPLING_LANDMARKS } from "@/lib/skin";
import { modeButtonStyle, modePanelStyle } from "./scan-styles";
import {
  CAPTURE_MODES,
  CAPTURE_PROFILES,
  FACE_CONTOUR,
  type CaptureMode,
  type GuideZones,
  type Landmark,
  type Quality,
  type ZoneRect,
} from "./types";

export function ScanModePicker({ mode, onChange }: { mode: CaptureMode; onChange: (mode: CaptureMode) => void }) {
  const active = CAPTURE_PROFILES[mode];
  return (
    <div style={modePanelStyle}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {CAPTURE_MODES.map((item) => {
          const selected = item === mode;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(item)}
              style={{
                ...modeButtonStyle,
                background: selected ? "var(--plum)" : "var(--surface)",
                color: selected ? "var(--on-plum)" : "var(--ink)",
                borderColor: selected ? "var(--plum)" : "var(--line)",
              }}
            >
              {CAPTURE_PROFILES[item].label}
            </button>
          );
        })}
      </div>
      <p style={{ marginTop: 8, color: "var(--ink-soft)", fontSize: 12.5, lineHeight: 1.45 }}>{active.hint}</p>
    </div>
  );
}

export function CameraGuide({ quality, mode, zones }: { quality: Quality; mode: CaptureMode; zones: GuideZones | null }) {
  const border = quality.score >= 6 ? "rgba(47,125,79,.95)" : quality.score >= 4 ? "rgba(239,138,31,.92)" : "rgba(224,56,44,.9)";
  const locked = quality.face && quality.centered && quality.distance && quality.brightness && quality.noGlare;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: "8% 12% 17%", border: `2px solid ${border}`, borderRadius: "48% 48% 45% 45%", boxShadow: "0 0 0 999px rgba(0,0,0,.18)" }} />
      {!zones && <div style={{ position: "absolute", top: "11%", bottom: "20%", left: "50%", width: 1, background: "rgba(255,255,255,.62)" }} />}
      <div style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,.9)", border: "1px solid rgba(0,0,0,.12)", borderRadius: 999, color: "var(--ink)", fontSize: 11, fontWeight: 800, padding: "5px 9px" }}>
        {CAPTURE_PROFILES[mode].label}
      </div>
      {zones ? (
        <>
          {zones.contour.map((point, index) => (
            <div
              key={index}
              style={{
                position: "absolute",
                left: `${point.x}%`,
                top: `${point.y}%`,
                width: 2,
                height: 2,
                marginLeft: -1,
                marginTop: -1,
                borderRadius: 999,
                background: "rgba(255,255,255,.55)",
                transition: "left .3s ease-out, top .3s ease-out",
              }}
            />
          ))}
          <TrackedZone label="이마·T존" rect={zones.tzone} locked={locked} />
          <TrackedZone label="왼볼 결" rect={zones.leftCheek} locked={locked} />
          <TrackedZone label="오른볼 결" rect={zones.rightCheek} locked={locked} />
        </>
      ) : (
        <>
          <GuideZone label="이마/T존" style={{ top: "18%", left: "36%", width: "28%", height: "12%" }} />
          <GuideZone label="왼볼 결" style={{ top: "45%", left: "21%", width: "22%", height: "15%" }} />
          <GuideZone label="오른볼 결" style={{ top: "45%", right: "21%", width: "22%", height: "15%" }} />
        </>
      )}
      <div style={{ position: "absolute", left: 18, right: 18, bottom: 18, display: "flex", justifyContent: "center" }}>
        <span style={{ background: "rgba(255,255,255,.9)", color: "var(--ink)", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "8px 12px", fontSize: 13, lineHeight: 1.35, textAlign: "center" }}>
          {quality.message}
        </span>
      </div>
    </div>
  );
}

function TrackedZone({ label, rect, locked }: { label: string; rect: ZoneRect; locked: boolean }) {
  // Camera-focus style corner brackets read as precise measurement, not a box
  // drawn over the face; the fill only appears once the zone is locked.
  const stroke = locked ? "rgba(110,220,150,.95)" : "rgba(255,255,255,.9)";
  const corner = (position: React.CSSProperties, edges: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    width: 10,
    height: 10,
    ...position,
    ...edges,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: `${rect.left}%`,
        top: `${rect.top}%`,
        width: `${rect.width}%`,
        height: `${rect.height}%`,
        background: locked ? "rgba(47,125,79,.08)" : "transparent",
        borderRadius: 6,
        transition: "left .3s ease-out, top .3s ease-out, width .3s ease-out, height .3s ease-out, background .25s",
      }}
    >
      <span style={corner({ left: 0, top: 0 }, { borderTop: `1.6px solid ${stroke}`, borderLeft: `1.6px solid ${stroke}`, borderTopLeftRadius: 6 })} />
      <span style={corner({ right: 0, top: 0 }, { borderTop: `1.6px solid ${stroke}`, borderRight: `1.6px solid ${stroke}`, borderTopRightRadius: 6 })} />
      <span style={corner({ left: 0, bottom: 0 }, { borderBottom: `1.6px solid ${stroke}`, borderLeft: `1.6px solid ${stroke}`, borderBottomLeftRadius: 6 })} />
      <span style={corner({ right: 0, bottom: 0 }, { borderBottom: `1.6px solid ${stroke}`, borderRight: `1.6px solid ${stroke}`, borderBottomRightRadius: 6 })} />
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: -14,
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          color: "rgba(255,255,255,.92)",
          fontSize: 9.5,
          fontWeight: 800,
          letterSpacing: "0.04em",
          textShadow: "0 1px 8px rgba(0,0,0,.5)",
        }}
      >
        {locked ? `${label} ✓` : label}
      </span>
    </div>
  );
}

// Guide rects come from the REAL sampling landmarks (lib/skin.ts) so what the
// user aligns is exactly what gets measured. Landmarks are normalized to the
// VIDEO frame, but the overlay lives in the 3:4 container that object-fit:
// cover crops the stream into — so coords are remapped to the visible region
// first (coverCropFractions from lib/scan-geometry), then mirrored to match
// the CSS-mirrored preview.

type GuidePoint = { x: number; y: number };

const LEFT_CHEEK_LANDMARKS = SAMPLING_LANDMARKS.cheeks.slice(0, 7);
const RIGHT_CHEEK_LANDMARKS = SAMPLING_LANDMARKS.cheeks.slice(7);

type GuideBounds = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };

function pointBounds(points: GuidePoint[]): GuideBounds | null {
  if (!points.length) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function zoneFromPoints(points: GuidePoint[], face: GuideBounds, pad: { x: number; y: number; faceX: number; faceY: number }): ZoneRect | null {
  const bounds = pointBounds(points);
  if (!bounds) return null;
  const padX = Math.max(bounds.width * pad.x, face.width * pad.faceX);
  const padY = Math.max(bounds.height * pad.y, face.height * pad.faceY);
  const minX = Math.max(0, bounds.minX - padX);
  const maxX = Math.min(1, bounds.maxX + padX);
  const minY = Math.max(0, bounds.minY - padY);
  const maxY = Math.min(1, bounds.maxY + padY);
  const round = (value: number) => Math.round(value * 1000) / 10;
  return { left: round(1 - maxX), top: round(minY), width: round(maxX - minX), height: round(maxY - minY) };
}

export function computeGuideZones(landmarks: Landmark[], videoWidth: number, videoHeight: number): GuideZones | null {
  const { fx, fy } = coverCropFractions(videoWidth, videoHeight);
  const mapPoint = (lm: Landmark): GuidePoint => ({ x: (lm.x - (1 - fx) / 2) / fx, y: (lm.y - (1 - fy) / 2) / fy });
  const pointsFor = (indices: number[]) =>
    indices
      .map((index) => landmarks[index])
      .filter((lm): lm is Landmark => Boolean(lm))
      .map(mapPoint);

  const tzonePoints = pointsFor(SAMPLING_LANDMARKS.tzone);
  const leftCheekPoints = pointsFor(LEFT_CHEEK_LANDMARKS);
  const rightCheekPoints = pointsFor(RIGHT_CHEEK_LANDMARKS);
  const face = pointBounds([...tzonePoints, ...leftCheekPoints, ...rightCheekPoints]);
  if (!face) return null;

  const tzone = zoneFromPoints(tzonePoints, face, { x: 0.28, y: 0.32, faceX: 0.035, faceY: 0.025 });
  const zoneA = zoneFromPoints(leftCheekPoints, face, { x: 0.24, y: 0.34, faceX: 0.032, faceY: 0.03 });
  const zoneB = zoneFromPoints(rightCheekPoints, face, { x: 0.24, y: 0.34, faceX: 0.032, faceY: 0.03 });
  if (!tzone || !zoneA || !zoneB) return null;

  // Label cheeks by their on-screen (mirrored) position.
  const [leftCheek, rightCheek] = zoneA.left <= zoneB.left ? [zoneA, zoneB] : [zoneB, zoneA];
  const contour = pointsFor(FACE_CONTOUR).map((point) => ({
    x: Math.round((1 - point.x) * 1000) / 10,
    y: Math.round(point.y * 1000) / 10,
  }));

  return { tzone, leftCheek, rightCheek, contour };
}

function GuideZone({ label, style }: { label: string; style: React.CSSProperties }) {
  return (
    <div style={{ position: "absolute", border: "1px solid rgba(255,255,255,.8)", borderRadius: 999, background: "rgba(47,109,224,.10)", ...style }}>
      <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", whiteSpace: "nowrap", color: "rgba(255,255,255,.94)", fontSize: 10, fontWeight: 800, textShadow: "0 1px 8px rgba(0,0,0,.5)" }}>{label}</span>
    </div>
  );
}

export function QualityPanel({ quality, requireSteady, zonesReady }: { quality: Quality; requireSteady: boolean; zonesReady: boolean }) {
  const checks = useMemo(() => {
    // Keep the camera checklist aligned with what the user needs to trust the scan.
    const base: Array<[string, boolean]> = [
      ["얼굴", quality.face],
      ["측정영역", zonesReady],
      ["거리", quality.distance],
      ["밝기", quality.brightness],
      ["반사 없음", quality.noGlare],
    ];
    if (requireSteady) base.push(["흔들림 없음", quality.steady]);
    return base;
  }, [quality, requireSteady, zonesReady]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${checks.length}, 1fr)`, gap: 5, marginTop: 10 }}>
      {checks.map(([label, ok]) => (
        <div key={label} style={{ background: ok ? "#eef5f0" : "var(--surface)", color: ok ? "var(--success)" : "var(--text-muted)", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 2px", textAlign: "center", fontSize: 11, fontWeight: ok ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden" }}>
          {ok ? "✓ " : ""}{label}
        </div>
      ))}
    </div>
  );
}
