"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeSkin, type SkinReads } from "@/lib/skin";
import { saveLabel, toOrdinal, SCALES, exportLabels, labelCount, type Attr } from "@/lib/labels";

type Phase = "init" | "ready" | "analyzing" | "result" | "noface" | "denied" | "unsupported";

const WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export default function Scan() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const landmarkerRef = useRef<any>(null);
  const [phase, setPhase] = useState<Phase>("init");
  const [reads, setReads] = useState<SkinReads | null>(null);
  const [err, setErr] = useState<string>("");
  const [consent, setConsent] = useState(false); // opt-in to send a face crop for sharper AI analysis

  const startCamera = useCallback(async () => {
    setErr("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
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

  // Lazy-load MediaPipe FaceLandmarker (browser only).
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
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    setPhase("analyzing");
    try {
      const landmarker = await ensureLandmarker();
      const w = video.videoWidth || 720;
      const h = video.videoHeight || 960;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(video, 0, 0, w, h);

      const res = landmarker.detect(canvas);
      const faces = res?.faceLandmarks ?? [];
      if (!faces.length) {
        setPhase("noface");
        return;
      }
      const imageData = ctx.getImageData(0, 0, w, h);
      const out = analyzeSkin(imageData, faces[0]);
      if (!out) {
        setPhase("noface");
        return;
      }
      // On-device heuristic by default. With consent, send only a FACE CROP to the
      // vision model for a sharper read; the crop is a local data URL, not stored.
      let final = out;
      if (consent) {
        try {
          const crop = cropFace(canvas, faces[0]);
          const resp = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: crop }),
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
          /* keep heuristic */
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
    startCamera();
  }

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 400 }}>
        <p style={eyebrow}>결 · 피부 무드 체크</p>
        <h1 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 28, color: "var(--ink)", margin: "6px 0 4px" }}>
          30초면 충분해요
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 22 }}>
          카메라로 지금 피부를 읽어요. 사진은 이 기기 안에서만 처리되고 저장·전송되지 않아요.
        </p>

        {/* ── camera / result stage ── */}
        {phase !== "result" && (
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "3 / 4",
              borderRadius: 16,
              overflow: "hidden",
              background: "var(--surface-tint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: "scaleX(-1)",
                display: phase === "ready" || phase === "analyzing" ? "block" : "none",
              }}
            />
            {phase === "init" && (
              <Center>
                <button onClick={startCamera} style={primaryBtn}>
                  카메라 켜기
                </button>
              </Center>
            )}
            {phase === "analyzing" && <Scanning />}
            {phase === "denied" && (
              <Center>
                <p style={fallbackText}>카메라 권한이 막혔어요.</p>
                <a href="/survey" style={ghostLink}>사진 없이 추천받기 →</a>
              </Center>
            )}
            {phase === "noface" && (
              <Center>
                <p style={fallbackText}>얼굴을 또렷이 못 읽었어요.<br />밝은 곳에서 정면으로 다시 해볼까요?</p>
                <button onClick={() => setPhase("ready")} style={primaryBtn}>다시 시도</button>
                <a href="/survey" style={ghostLink}>사진 없이 추천받기 →</a>
              </Center>
            )}
            {phase === "unsupported" && (
              <Center>
                <p style={fallbackText}>이 브라우저는 카메라를 못 써요.</p>
                <a href="/survey" style={ghostLink}>사진 없이 추천받기 →</a>
              </Center>
            )}
          </div>
        )}

        {phase === "ready" && (
          <label style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 16, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ accentColor: "var(--plum)", width: 16, height: 16 }} />
            <span>더 정확한 AI 분석 받기 <span style={{ color: "var(--faint)" }}>· 사진은 분석에만 쓰고 저장 안 함</span></span>
          </label>
        )}
        {(phase === "ready" || phase === "analyzing") && (
          <button onClick={capture} disabled={phase === "analyzing"} style={{ ...primaryBtn, width: "100%", marginTop: 12, opacity: phase === "analyzing" ? 0.6 : 1 }}>
            {phase === "analyzing" ? "읽는 중…" : "지금 찍기"}
          </button>
        )}
        {err && <p style={{ color: "var(--error, #9b4a45)", fontSize: 13, marginTop: 10 }}>{err}</p>}

        {/* ── result: the scan-moment card ── */}
        {phase === "result" && reads && (
          <>
            <ResultCard reads={reads} />
            <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", margin: "14px 0 4px" }}>
              * 지금은 대략적 신호예요(조명·화장에 흔들림). 곧 더 정확한 분석으로 업그레이드돼요.
            </p>
            <details style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
              <summary style={{ cursor: "pointer", textAlign: "center" }}>디버그: raw 신호 (튜닝용)</summary>
              <pre style={{ fontSize: 11, color: "var(--ink-soft)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, marginTop: 8, overflowX: "auto" }}>
{`shine(유분)     = ${reads.raw.shine.toFixed(3)}   → ${reads.oil.value}
relRedness(홍조)= ${reads.raw.relRedness.toFixed(4)}  → ${reads.redness.value}
cov(모공/결)    = ${reads.raw.cov.toFixed(3)}   → ${reads.pores.value}
tzoneL / cheekL = ${reads.raw.tzoneL.toFixed(0)} / ${reads.raw.cheekL.toFixed(0)}`}
              </pre>
              <p style={{ textAlign: "center" }}>이 숫자 + 실제 피부 상태를 알려주면 경계값을 맞춰드려요.</p>
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
                추천 받기 →
              </a>
            </div>
            <Feedback reads={reads} />
          </>
        )}
      </div>
    </main>
  );
}

function ResultCard({ reads }: { reads: SkinReads }) {
  const rows = [
    { label: "유분", ...reads.oil },
    { label: "모공", ...reads.pores },
    { label: "홍조", ...reads.redness },
    { label: "전반", ...reads.overall },
  ];
  return (
    <div
      style={{
        width: "100%",
        background: "var(--surface)",
        borderRadius: 16,
        padding: "30px 26px",
        boxShadow: "0 8px 24px rgba(40,30,20,.10)",
        animation: "gyeol-fade-up .5s ease-out both",
      }}
    >
      <p style={eyebrow}>오늘의 피부 무드</p>
      <h2 style={{ fontFamily: "var(--font-ko-serif)", fontSize: 38, lineHeight: 1.2, color: "var(--ink)", margin: "10px 0 8px", whiteSpace: "pre-line" }}>
        {reads.headline}
      </h2>
      {reads.narrative && (
        <p style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 18 }}>{reads.narrative}</p>
      )}
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 22 }}>정직하게, 보이는 것만 읽었어요</p>
      <div style={{ borderTop: "1px solid var(--line)" }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 14, color: "var(--ink)" }}>{r.label}</span>
            <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: r.calm ? "var(--text-muted)" : "var(--plum)" }}>{r.value}</span>
          </div>
        ))}
      </div>
      <div style={{ height: 1, width: 34, background: "var(--bronze)", margin: "26px auto 0", opacity: 0.75 }} />
    </div>
  );
}

// ── The data flywheel: each confirm/correct = a labeled sample you own. ──
function Feedback({ reads }: { reads: SkinReads }) {
  const init = {
    oil: toOrdinal("oil", reads.oil.value),
    redness: toOrdinal("redness", reads.redness.value),
    pores: toOrdinal("pores", reads.pores.value),
  };
  const [stage, setStage] = useState<"ask" | "correcting" | "done">("ask");
  const [labels, setLabels] = useState(init);
  const [count, setCount] = useState(0);
  useEffect(() => setCount(labelCount()), []);

  function commit(source: "confirmed" | "corrected", finalLabels: typeof init) {
    saveLabel({ ts: Date.now(), features: reads.raw, labels: finalLabels, source });
    setCount(labelCount() + 0); // re-read happens after save
    setCount(labelCount());
    setStage("done");
  }

  const attrs: { key: Attr; label: string }[] = [
    { key: "oil", label: "유분" },
    { key: "redness", label: "홍조" },
    { key: "pores", label: "모공" },
  ];

  return (
    <div style={{ marginTop: 22, padding: "18px 18px 20px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12 }}>
      {stage === "ask" && (
        <>
          <p style={{ fontSize: 14, color: "var(--ink)", marginBottom: 12 }}>이 결과, 실제 내 피부랑 맞아요?</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => commit("confirmed", init)} style={{ ...feedBtn, background: "var(--plum)", color: "var(--on-plum)", border: "none" }}>정확해요</button>
            <button onClick={() => setStage("correcting")} style={feedBtn}>조금 달라요</button>
          </div>
        </>
      )}

      {stage === "correcting" && (
        <>
          <p style={{ fontSize: 14, color: "var(--ink)", marginBottom: 12 }}>실제에 맞게 고쳐주세요</p>
          {attrs.map(({ key, label }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
              <span style={{ fontSize: 14, color: "var(--ink)", width: 48 }}>{label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button aria-label="낮춤" onClick={() => setLabels((l) => ({ ...l, [key]: Math.max(0, l[key] - 1) }))} style={stepBtn}>◀</button>
                <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: "var(--plum)", width: 110, textAlign: "center" }}>
                  {SCALES[key][labels[key]]}
                </span>
                <button aria-label="높임" onClick={() => setLabels((l) => ({ ...l, [key]: Math.min(2, l[key] + 1) }))} style={stepBtn}>▶</button>
              </div>
            </div>
          ))}
          <button onClick={() => commit("corrected", labels)} style={{ ...feedBtn, width: "100%", marginTop: 12, background: "var(--plum)", color: "var(--on-plum)", border: "none" }}>저장</button>
        </>
      )}

      {stage === "done" && (
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--ink)" }}>고마워요. {count}번째 라벨이에요.</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 12px" }}>
            이 데이터가 쌓일수록 우리 모델이 똑똑해져요 (당신만의 데이터 = 해자).
          </p>
          <button onClick={exportLabels} style={{ ...feedBtn, fontSize: 13 }}>데이터 내보내기 (JSONL · {count}개)</button>
        </div>
      )}
    </div>
  );
}

const feedBtn: React.CSSProperties = {
  flex: 1,
  background: "transparent",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "12px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
const stepBtn: React.CSSProperties = {
  background: "var(--surface-tint)",
  border: "none",
  borderRadius: 8,
  width: 34,
  height: 34,
  fontSize: 13,
  color: "var(--ink)",
  cursor: "pointer",
};

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--bronze)",
  fontWeight: 600,
};
const primaryBtn: React.CSSProperties = {
  background: "var(--plum)",
  color: "var(--on-plum)",
  border: "none",
  borderRadius: 8,
  padding: "14px 22px",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};
const outlineBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--ink)",
  border: "1px solid var(--ink)",
  borderRadius: 8,
  padding: "13px 22px",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};
const ghostLink: React.CSSProperties = { color: "var(--text-muted)", fontSize: 13, marginTop: 12, textDecoration: "underline" };
const fallbackText: React.CSSProperties = { color: "var(--ink-soft)", fontSize: 14, textAlign: "center", lineHeight: 1.5 };

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: 24, textAlign: "center" }}>
      {children}
    </div>
  );
}
function Scanning() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          height: 2,
          background: "linear-gradient(90deg, transparent, var(--plum), transparent)",
          boxShadow: "0 0 14px var(--plum)",
          animation: "gyeol-scan 1.8s ease-in-out infinite",
        }}
      />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 18 }}>
        <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 16, color: "var(--ink)", background: "rgba(247,243,236,.72)", padding: "5px 14px", borderRadius: 9999 }}>
          피부 결을 읽는 중…
        </span>
      </div>
    </div>
  );
}

// On-device face crop (data URL) — only sent to the vision model with consent, never stored.
function cropFace(src: HTMLCanvasElement, landmarks: { x: number; y: number }[]): string {
  const w = src.width;
  const h = src.height;
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of landmarks) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = 0.12;
  const x0 = Math.max(0, (minX - pad) * w);
  const y0 = Math.max(0, (minY - pad) * h);
  const cw = Math.min(w, (maxX + pad) * w) - x0;
  const ch = Math.min(h, (maxY + pad) * h) - y0;
  const scale = Math.min(1, 384 / Math.max(cw, ch));
  const out = document.createElement("canvas");
  out.width = Math.round(cw * scale);
  out.height = Math.round(ch * scale);
  out.getContext("2d")!.drawImage(src, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", 0.82);
}
