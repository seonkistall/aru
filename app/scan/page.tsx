"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recordConsentEvent } from "@/lib/consent";
import { saveCropSample, cropSampleCount, exportCropSamples } from "@/lib/crops";
import { analyzeSkin, type SkinReads } from "@/lib/skin";
import { exportLabels, labelCount, saveLabel, SCALES, toOrdinal, type Attr } from "@/lib/labels";

type Phase = "init" | "ready" | "analyzing" | "result" | "noface" | "denied" | "unsupported";
type Landmark = { x: number; y: number; z?: number };
type FaceLandmarker = { detect: (image: HTMLCanvasElement) => { faceLandmarks?: Landmark[][] } };
type CaptureMode = "balanced" | "texture" | "tone";
type CaptureProfile = {
  label: string;
  hint: string;
  centerToleranceX: number;
  centerToleranceY: number;
  minFaceSize: number;
  maxFaceSize: number;
  minBrightness: number;
  maxDarkRatio: number;
  maxHotRatio: number;
  maxMovement: number;
  requiresSteady: boolean;
};
type Quality = {
  face: boolean;
  centered: boolean;
  distance: boolean;
  brightness: boolean;
  noGlare: boolean;
  steady: boolean;
  score: number;
  message: string;
};

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const initialQuality: Quality = {
  face: false,
  centered: false,
  distance: false,
  brightness: false,
  noGlare: false,
  steady: false,
  score: 0,
  message: "얼굴을 윤곽선 안에 맞춰주세요.",
};

const CAPTURE_MODES: CaptureMode[] = ["balanced", "texture", "tone"];
const CAPTURE_PROFILES: Record<CaptureMode, CaptureProfile> = {
  balanced: {
    label: "균형",
    hint: "윤곽, 톤, 피부결을 함께 보는 기본 촬영입니다.",
    centerToleranceX: 0.12,
    centerToleranceY: 0.16,
    minFaceSize: 0.43,
    maxFaceSize: 0.76,
    minBrightness: 78,
    maxDarkRatio: 0.34,
    maxHotRatio: 0.08,
    maxMovement: 0.032,
    requiresSteady: false,
  },
  texture: {
    label: "피부결",
    hint: "모공과 결을 보려고 조금 더 가까이, 더 흔들림 없이 촬영합니다.",
    centerToleranceX: 0.1,
    centerToleranceY: 0.14,
    minFaceSize: 0.48,
    maxFaceSize: 0.78,
    minBrightness: 82,
    maxDarkRatio: 0.3,
    maxHotRatio: 0.065,
    maxMovement: 0.024,
    requiresSteady: true,
  },
  tone: {
    label: "피부톤",
    hint: "톤과 붉은기를 보려고 더 부드러운 빛과 낮은 반사를 요구합니다.",
    centerToleranceX: 0.12,
    centerToleranceY: 0.16,
    minFaceSize: 0.43,
    maxFaceSize: 0.74,
    minBrightness: 86,
    maxDarkRatio: 0.28,
    maxHotRatio: 0.055,
    maxMovement: 0.03,
    requiresSteady: false,
  },
};

export default function Scan() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastCenterRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const qualityTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("init");
  const [reads, setReads] = useState<SkinReads | null>(null);
  const [err, setErr] = useState("");
  const [consent, setConsent] = useState(false);
  const [datasetConsent, setDatasetConsent] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("balanced");
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const [cropDataUrl, setCropDataUrl] = useState<string | null>(null);
  const captureProfile = CAPTURE_PROFILES[captureMode];

  const canCapture =
    phase === "ready" &&
    quality.face &&
    quality.centered &&
    quality.distance &&
    quality.brightness &&
    quality.noGlare &&
    (!captureProfile.requiresSteady || quality.steady);

  const startCamera = useCallback(async () => {
    setErr("");
    setReads(null);
    setCropDataUrl(null);
    setQuality(initialQuality);
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 720 },
          height: { ideal: 960 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase("ready");
    } catch {
      setPhase("denied");
    }
  }, []);

  const ensureLandmarker = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    landmarkerRef.current = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
      runningMode: "IMAGE",
      numFaces: 1,
    });
    return landmarkerRef.current;
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (qualityTimerRef.current) window.clearInterval(qualityTimerRef.current);
  }, []);

  const readFrame = useCallback((maxSize = 360) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const ratio = video.videoWidth / video.videoHeight;
    const h = video.videoHeight > video.videoWidth ? maxSize : Math.round(maxSize / ratio);
    const w = Math.round(h * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return { canvas, ctx, w, h };
  }, []);

  const measureQuality = useCallback(
    async (landmarker: FaceLandmarker) => {
      const frame = readFrame();
      if (!frame) return;

      const res = landmarker.detect(frame.canvas);
      const face = res.faceLandmarks?.[0];
      if (!face?.length) {
        setQuality({ ...initialQuality, message: "얼굴이 보이지 않아요. 정면을 향해주세요." });
        return;
      }

      const box = faceBox(face);
      const centerX = (box.minX + box.maxX) / 2;
      const centerY = (box.minY + box.maxY) / 2;
      const size = Math.max(box.maxX - box.minX, box.maxY - box.minY);
      const profile = CAPTURE_PROFILES[captureMode];
      const centered = Math.abs(centerX - 0.5) < profile.centerToleranceX && Math.abs(centerY - 0.48) < profile.centerToleranceY;
      const distance = size > profile.minFaceSize && size < profile.maxFaceSize;
      const exposure = exposureStats(frame.ctx.getImageData(0, 0, frame.w, frame.h));
      const brightness = exposure.mean > profile.minBrightness && exposure.darkRatio < profile.maxDarkRatio;
      const noGlare = exposure.hotRatio < profile.maxHotRatio;

      const now = performance.now();
      const last = lastCenterRef.current;
      const movement = last ? Math.hypot(centerX - last.x, centerY - last.y) / Math.max(1, (now - last.t) / 250) : 0;
      lastCenterRef.current = { x: centerX, y: centerY, t: now };
      const steady = !last || movement < profile.maxMovement;

      const checks = [true, centered, distance, brightness, noGlare, steady];
      const score = checks.filter(Boolean).length;
      const message = !centered
        ? "얼굴 중심을 세로선에 맞춰주세요."
        : !distance
          ? size <= profile.minFaceSize
            ? "조금 더 가까이 와주세요. 볼 결이 작게 보여요."
            : "조금만 뒤로 물러나주세요. 얼굴 윤곽이 잘려요."
          : !brightness
            ? "빛이 부족해요. 창가처럼 밝고 부드러운 곳이 좋아요."
            : !noGlare
              ? "반사가 강해요. 정면 조명이나 번들거림을 줄여주세요."
              : !steady
                ? "잠깐만 멈춰주세요. 피부 결은 흔들림에 약해요."
                : "좋아요. 이마와 양볼 결이 잘 보입니다.";

      setQuality({ face: true, centered, distance, brightness, noGlare, steady, score, message });
    },
    [captureMode, readFrame]
  );

  useEffect(() => {
    if (phase !== "ready") return;
    let mounted = true;
    ensureLandmarker()
      .then((landmarker) => {
        if (!mounted) return;
        qualityTimerRef.current = window.setInterval(() => {
          void measureQuality(landmarker);
        }, 650);
      })
      .catch(() => setErr("얼굴 가이드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
    return () => {
      mounted = false;
      if (qualityTimerRef.current) window.clearInterval(qualityTimerRef.current);
    };
  }, [ensureLandmarker, measureQuality, phase]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    setPhase("analyzing");
    setErr("");
    setCropDataUrl(null);

    try {
      const landmarker = await ensureLandmarker();
      const w = video.videoWidth || 720;
      const h = video.videoHeight || 960;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("canvas unavailable");
      ctx.drawImage(video, 0, 0, w, h);

      const res = landmarker.detect(canvas);
      const faces = res.faceLandmarks ?? [];
      if (!faces.length) {
        setPhase("noface");
        return;
      }

      const faceCrop = consent || datasetConsent ? cropFace(canvas, faces[0]) : null;
      setCropDataUrl(datasetConsent ? faceCrop : null);

      const imageData = ctx.getImageData(0, 0, w, h);
      const out = analyzeSkin(imageData, faces[0]);
      if (!out) {
        setPhase("noface");
        return;
      }

      let final = out;
      if (consent && faceCrop) {
        try {
          const resp = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: faceCrop }),
          });
          if (resp.ok) {
            const v = await resp.json();
            if (v?.ok) {
              final = {
                ...out,
                oil: { value: v.oil, calm: v.oil === "거의 없음" },
                redness: { value: v.redness, calm: v.redness === "거의 없음" },
                pores: { value: v.pores, calm: v.pores === "매끈한 편" },
                narrative: v.narrative || out.narrative,
              };
            }
          }
        } catch {
          /* Keep on-device result. */
        }
      }

      setReads(final);
      stopCamera();
      setPhase("result");
    } catch (e) {
      console.error(e);
      setErr("분석 중 문제가 생겼어요. 다시 시도해 주세요.");
      setPhase("ready");
    }
  }

  function reset() {
    setReads(null);
    void startCamera();
  }

  function toggleAiConsent(next: boolean) {
    setConsent(next);
    recordConsentEvent("ai_analysis", next);
  }

  function toggleDatasetConsent(next: boolean) {
    setDatasetConsent(next);
    recordConsentEvent("learning_crop", next);
  }

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <p style={eyebrow}>K-Beauty skin scan</p>
        <h1 style={titleStyle}>얼굴 톤과 피부 결이 잘 보이게 찍어볼게요</h1>
        <p style={leadStyle}>
          얼굴 윤곽을 맞추고, 이마와 양볼 샘플링 영역이 밝고 번들거림 없이 보이면 분석 품질이 좋아집니다.
        </p>

        {phase !== "result" && (
          <div style={cameraFrame}>
            <video ref={videoRef} playsInline muted style={videoStyle(phase)} />
            {(phase === "ready" || phase === "analyzing") && <CameraGuide quality={quality} mode={captureMode} />}
            {phase === "init" && (
              <Center>
                <button onClick={startCamera} style={primaryBtn}>카메라 시작</button>
              </Center>
            )}
            {phase === "analyzing" && <Scanning />}
            {phase === "denied" && (
              <Center>
                <p style={fallbackText}>카메라 권한이 필요해요.</p>
                <a href="/survey" style={ghostLink}>사진 없이 추천받기</a>
              </Center>
            )}
            {phase === "noface" && (
              <Center>
                <p style={fallbackText}>얼굴을 읽지 못했어요.<br />밝은 곳에서 정면으로 다시 찍어주세요.</p>
                <button onClick={() => setPhase("ready")} style={primaryBtn}>다시 시도</button>
                <a href="/survey" style={ghostLink}>사진 없이 추천받기</a>
              </Center>
            )}
            {phase === "unsupported" && (
              <Center>
                <p style={fallbackText}>이 브라우저에서는 카메라를 사용할 수 없어요.</p>
                <a href="/survey" style={ghostLink}>사진 없이 추천받기</a>
              </Center>
            )}
          </div>
        )}

        {phase === "ready" && (
          <>
            <ScanModePicker mode={captureMode} onChange={setCaptureMode} />
            <QualityPanel quality={quality} />
            <CaptureTips />
            <PrivacyNotice />
            <label style={consentStyle}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => toggleAiConsent(e.target.checked)}
                style={{ accentColor: "var(--plum)", width: 16, height: 16 }}
              />
              <span>더 정교한 AI 분석 받기 <span style={{ color: "var(--faint)" }}>얼굴 크롭만 전송돼요</span></span>
            </label>
            <label style={consentStyle}>
              <input
                type="checkbox"
                checked={datasetConsent}
                onChange={(e) => toggleDatasetConsent(e.target.checked)}
                style={{ accentColor: "var(--plum)", width: 16, height: 16 }}
              />
              <span>학습용 크롭을 이 기기에 저장 <span style={{ color: "var(--faint)" }}>내보낼 때만 사용돼요</span></span>
            </label>
          </>
        )}

        {(phase === "ready" || phase === "analyzing") && (
          <button
            onClick={capture}
            disabled={phase === "analyzing" || !canCapture}
            style={{
              ...primaryBtn,
              width: "100%",
              marginTop: 12,
              opacity: phase === "analyzing" || !canCapture ? 0.58 : 1,
              cursor: phase === "analyzing" || !canCapture ? "default" : "pointer",
            }}
          >
            {phase === "analyzing" ? "분석 중..." : "지금 촬영하기"}
          </button>
        )}

        {err && <p style={{ color: "var(--error, #9b4a45)", fontSize: 13, marginTop: 10 }}>{err}</p>}

        {phase === "result" && reads && (
          <>
            <ResultCard reads={reads} />
            <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", margin: "14px 0 4px" }}>
              * 조명, 각도, 메이크업에 따라 달라질 수 있는 참고용 분석이에요.
            </p>
            <details style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
              <summary style={{ cursor: "pointer", textAlign: "center" }}>디버그 신호 보기</summary>
              <pre style={debugStyle}>
{`shine = ${reads.raw.shine.toFixed(3)} -> ${reads.oil.value}
relRedness = ${reads.raw.relRedness.toFixed(4)} -> ${reads.redness.value}
texture = ${reads.raw.cov.toFixed(3)} -> ${reads.pores.value}
tzoneL / cheekL = ${reads.raw.tzoneL.toFixed(0)} / ${reads.raw.cheekL.toFixed(0)}`}
              </pre>
            </details>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={reset} style={{ ...outlineBtn, flex: 1 }}>다시 찍기</button>
              <a
                href="/survey"
                onClick={() => {
                  sessionStorage.setItem(
                    "gyeol_scan",
                    JSON.stringify({
                      oil: toOrdinal("oil", reads.oil.value),
                      redness: toOrdinal("redness", reads.redness.value),
                      pores: toOrdinal("pores", reads.pores.value),
                    })
                  );
                  sessionStorage.setItem("gyeol_reads", JSON.stringify(reads));
                }}
                style={{ ...primaryBtn, flex: 1, textAlign: "center", textDecoration: "none" }}
              >
                추천 받기
              </a>
            </div>
            <Feedback reads={reads} cropDataUrl={cropDataUrl} />
          </>
        )}
      </div>
    </main>
  );
}

function ScanModePicker({ mode, onChange }: { mode: CaptureMode; onChange: (mode: CaptureMode) => void }) {
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

function CameraGuide({ quality, mode }: { quality: Quality; mode: CaptureMode }) {
  const border = quality.score >= 6 ? "rgba(79,107,82,.95)" : quality.score >= 4 ? "rgba(168,134,90,.9)" : "rgba(107,45,74,.9)";
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: "8% 12% 17%", border: `2px solid ${border}`, borderRadius: "48% 48% 45% 45%", boxShadow: "0 0 0 999px rgba(34,30,26,.15)" }} />
      <div style={{ position: "absolute", top: "11%", bottom: "20%", left: "50%", width: 1, background: "rgba(252,250,246,.62)" }} />
      <div style={{ position: "absolute", top: "31%", left: "21%", right: "21%", borderTop: "1px dashed rgba(252,250,246,.72)" }} />
      <div style={{ position: "absolute", top: 14, right: 14, background: "rgba(252,250,246,.86)", border: "1px solid rgba(231,223,212,.85)", borderRadius: 999, color: "var(--ink)", fontSize: 11, fontWeight: 800, padding: "5px 9px" }}>
        {CAPTURE_PROFILES[mode].label}
      </div>
      <GuideZone label="이마/T존" style={{ top: "18%", left: "36%", width: "28%", height: "12%" }} />
      <GuideZone label="왼볼 결" style={{ top: "45%", left: "21%", width: "22%", height: "15%" }} />
      <GuideZone label="오른볼 결" style={{ top: "45%", right: "21%", width: "22%", height: "15%" }} />
      <div style={{ position: "absolute", left: 18, right: 18, bottom: 18, display: "flex", justifyContent: "center" }}>
        <span style={{ background: "rgba(252,250,246,.88)", color: "var(--ink)", border: "1px solid rgba(231,223,212,.85)", borderRadius: 8, padding: "8px 12px", fontSize: 13, lineHeight: 1.35, textAlign: "center" }}>
          {quality.message}
        </span>
      </div>
    </div>
  );
}

function GuideZone({ label, style }: { label: string; style: React.CSSProperties }) {
  return (
    <div style={{ position: "absolute", border: "1px solid rgba(252,250,246,.78)", borderRadius: 999, background: "rgba(107,45,74,.10)", ...style }}>
      <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", whiteSpace: "nowrap", color: "rgba(252,250,246,.92)", fontSize: 10, fontWeight: 800, textShadow: "0 1px 8px rgba(34,30,26,.45)" }}>{label}</span>
    </div>
  );
}

function QualityPanel({ quality }: { quality: Quality }) {
  const checks = useMemo(
    () => [
      ["얼굴", quality.face],
      ["중앙", quality.centered],
      ["거리", quality.distance],
      ["밝기", quality.brightness],
      ["반사", quality.noGlare],
      ["안정", quality.steady],
    ] as const,
    [quality]
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 12 }}>
      {checks.map(([label, ok]) => (
        <div key={label} style={{ background: ok ? "var(--plum-soft)" : "var(--surface)", color: ok ? "var(--plum)" : "var(--text-muted)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 4px", textAlign: "center", fontSize: 12, fontWeight: ok ? 700 : 500 }}>
          {ok ? "✓ " : ""}{label}
        </div>
      ))}
    </div>
  );
}

function CaptureTips() {
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-soft)", fontSize: 12.5, lineHeight: 1.55 }}>
      <b style={{ color: "var(--ink)" }}>촬영 팁</b>
      <span>  창가의 부드러운 빛, 정면 얼굴, 닦은 렌즈, 강한 반사 없는 상태가 가장 좋아요.</span>
    </div>
  );
}

function PrivacyNotice() {
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink-soft)", fontSize: 12.5, lineHeight: 1.55 }}>
      <b style={{ color: "var(--ink)" }}>동의는 2가지로 분리돼요.</b>
      <span> AI 분석 전송은 얼굴 크롭을 분석 API에 보내는 선택이고, 학습용 크롭 저장은 이 기기에 최근 25개까지 보관하는 선택입니다. </span>
      <a href="/privacy" style={{ color: "var(--plum)", fontWeight: 800, textDecoration: "none" }}>자세히 보기</a>
    </div>
  );
}

function ResultCard({ reads }: { reads: SkinReads }) {
  const rows = [
    { label: "유분", ...reads.oil },
    { label: "모공/결", ...reads.pores },
    { label: "붉은기", ...reads.redness },
    { label: "전반", ...reads.overall },
  ];
  return (
    <div style={resultCardStyle}>
      <p style={eyebrow}>오늘의 피부 리포트</p>
      <h2 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 34, lineHeight: 1.2, color: "var(--ink)", margin: "10px 0 8px", whiteSpace: "pre-line" }}>
        {reads.headline}
      </h2>
      <p style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 18 }}>{reads.narrative}</p>
      <div style={{ borderTop: "1px solid var(--line)" }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 14, color: "var(--ink)" }}>{row.label}</span>
            <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: row.calm ? "var(--text-muted)" : "var(--plum)" }}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Feedback({ reads, cropDataUrl }: { reads: SkinReads; cropDataUrl: string | null }) {
  const init = {
    oil: toOrdinal("oil", reads.oil.value),
    redness: toOrdinal("redness", reads.redness.value),
    pores: toOrdinal("pores", reads.pores.value),
  };
  const [stage, setStage] = useState<"ask" | "correcting" | "done">("ask");
  const [labels, setLabels] = useState(init);
  const [count, setCount] = useState(() => labelCount());
  const [cropCount, setCropCount] = useState(() => cropSampleCount());

  function commit(source: "confirmed" | "corrected", finalLabels: typeof init) {
    const sample = { ts: Date.now(), features: reads.raw, labels: finalLabels, source };
    saveLabel(sample);
    if (cropDataUrl) {
      saveCropSample({ image: cropDataUrl, features: reads.raw, labels: finalLabels, source, ts: sample.ts });
      setCropCount(cropSampleCount());
    }
    setCount(labelCount());
    setStage("done");
  }

  const attrs: { key: Attr; label: string }[] = [
    { key: "oil", label: "유분" },
    { key: "redness", label: "붉은기" },
    { key: "pores", label: "모공" },
  ];

  return (
    <div style={{ marginTop: 22, padding: "18px 18px 20px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8 }}>
      {stage === "ask" && (
        <>
          <p style={{ fontSize: 14, color: "var(--ink)", marginBottom: 12 }}>이 결과가 실제 피부와 비슷한가요?</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => commit("confirmed", init)} style={{ ...feedBtn, background: "var(--plum)", color: "var(--on-plum)", border: "none" }}>맞아요</button>
            <button onClick={() => setStage("correcting")} style={feedBtn}>조금 달라요</button>
          </div>
        </>
      )}

      {stage === "correcting" && (
        <>
          <p style={{ fontSize: 14, color: "var(--ink)", marginBottom: 12 }}>실제 느낌에 맞게 고쳐주세요.</p>
          {attrs.map(({ key, label }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
              <span style={{ fontSize: 14, color: "var(--ink)", width: 56 }}>{label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button aria-label="낮추기" onClick={() => setLabels((l) => ({ ...l, [key]: Math.max(0, l[key] - 1) }))} style={stepBtn}>-</button>
                <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: "var(--plum)", width: 108, textAlign: "center" }}>{SCALES[key][labels[key]]}</span>
                <button aria-label="높이기" onClick={() => setLabels((l) => ({ ...l, [key]: Math.min(2, l[key] + 1) }))} style={stepBtn}>+</button>
              </div>
            </div>
          ))}
          <button onClick={() => commit("corrected", labels)} style={{ ...feedBtn, width: "100%", marginTop: 12, background: "var(--plum)", color: "var(--on-plum)", border: "none" }}>저장</button>
        </>
      )}

      {stage === "done" && (
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--ink)" }}>고마워요. {count}번째 피부 피드백이에요.</p>
          {cropDataUrl && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>학습용 크롭 {cropCount}개가 이 기기에 저장되어 있어요.</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={exportLabels} style={{ ...feedBtn, fontSize: 13 }}>라벨 내보내기</button>
            {cropDataUrl && <button onClick={exportCropSamples} style={{ ...feedBtn, fontSize: 13 }}>크롭 내보내기</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 24, textAlign: "center" }}>{children}</div>;
}

function Scanning() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: "8%", right: "8%", height: 2, background: "linear-gradient(90deg, transparent, var(--plum), transparent)", boxShadow: "0 0 14px var(--plum)", animation: "gyeol-scan 1.8s ease-in-out infinite" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 18 }}>
        <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 16, color: "var(--ink)", background: "rgba(247,243,236,.78)", padding: "6px 14px", borderRadius: 8 }}>피부 신호를 읽는 중</span>
      </div>
    </div>
  );
}

function faceBox(landmarks: Landmark[]) {
  return landmarks.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      minY: Math.min(acc.minY, p.y),
      maxX: Math.max(acc.maxX, p.x),
      maxY: Math.max(acc.maxY, p.y),
    }),
    { minX: 1, minY: 1, maxX: 0, maxY: 0 }
  );
}

function exposureStats(imageData: ImageData) {
  const { data } = imageData;
  let total = 0;
  let count = 0;
  let hot = 0;
  let dark = 0;
  for (let i = 0; i < data.length; i += 16) {
    const L = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    total += L;
    if (L > 232) hot++;
    if (L < 42) dark++;
    count++;
  }
  return { mean: total / Math.max(1, count), hotRatio: hot / Math.max(1, count), darkRatio: dark / Math.max(1, count) };
}

function cropFace(src: HTMLCanvasElement, landmarks: Landmark[]): string {
  const w = src.width;
  const h = src.height;
  const box = faceBox(landmarks);
  const pad = 0.14;
  const x0 = Math.max(0, (box.minX - pad) * w);
  const y0 = Math.max(0, (box.minY - pad) * h);
  const cw = Math.min(w, (box.maxX + pad) * w) - x0;
  const ch = Math.min(h, (box.maxY + pad) * h) - y0;
  const scale = Math.min(1, 384 / Math.max(cw, ch));
  const out = document.createElement("canvas");
  out.width = Math.round(cw * scale);
  out.height = Math.round(ch * scale);
  out.getContext("2d")?.drawImage(src, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", 0.82);
}

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--bronze)",
  fontWeight: 700,
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-ko-serif)",
  fontSize: 28,
  lineHeight: 1.22,
  color: "var(--ink)",
  margin: "6px 0 8px",
};

const leadStyle: React.CSSProperties = {
  fontSize: 14,
  color: "var(--text-muted)",
  lineHeight: 1.55,
  marginBottom: 20,
};

const cameraFrame: React.CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "3 / 4",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--surface-tint)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function videoStyle(phase: Phase): React.CSSProperties {
  return {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: "scaleX(-1)",
    display: phase === "ready" || phase === "analyzing" ? "block" : "none",
  };
}

const primaryBtn: React.CSSProperties = {
  background: "var(--plum)",
  color: "var(--on-plum)",
  border: "none",
  borderRadius: 8,
  padding: "14px 22px",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};

const outlineBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--ink)",
  border: "1px solid var(--ink)",
  borderRadius: 8,
  padding: "13px 22px",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};

const feedBtn: React.CSSProperties = {
  flex: 1,
  background: "transparent",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "12px 16px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const stepBtn: React.CSSProperties = {
  background: "var(--surface-tint)",
  border: "none",
  borderRadius: 8,
  width: 34,
  height: 34,
  fontSize: 15,
  color: "var(--ink)",
  cursor: "pointer",
};

const consentStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  marginTop: 12,
  fontSize: 13,
  color: "var(--text-muted)",
  cursor: "pointer",
};

const modePanelStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "var(--surface)",
};

const modeButtonStyle: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "10px 4px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const resultCardStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--surface)",
  borderRadius: 8,
  padding: "28px 24px",
  boxShadow: "0 8px 24px rgba(40,30,20,.10)",
  animation: "gyeol-fade-up .5s ease-out both",
};

const debugStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--ink-soft)",
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 12,
  marginTop: 8,
  overflowX: "auto",
};

const ghostLink: React.CSSProperties = { color: "var(--text-muted)", fontSize: 13, marginTop: 8, textDecoration: "underline" };
const fallbackText: React.CSSProperties = { color: "var(--ink-soft)", fontSize: 14, textAlign: "center", lineHeight: 1.5 };
