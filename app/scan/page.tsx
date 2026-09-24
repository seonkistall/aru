"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n/core";
import { recordConsentEvent } from "@/lib/consent";
import type { SkinReads } from "@/lib/skin";
import type { SampleMeta } from "@/lib/labels";
import { getCurrentPilotSession } from "@/lib/pilot";
import { recordFunnelEvent } from "@/lib/funnel";
import { shouldShowFeedback } from "@/lib/ml-collection";
import { useFunnelPageView } from "@/app/use-funnel-page-view";

import { moodShareUrl } from "@/lib/share-link";
import type { LandmarkerWorker } from "./landmarker-client";
import { useLandmarker } from "./use-landmarker";
import { useQualityLoop } from "./use-quality-loop";
import { useCaptureAnalysis } from "./use-capture-analysis";
import { openCamera, stopMediaStream, watchCameraStream, type CameraInterruptionReason } from "./camera-stream";
import {
  scanCaptureButtonLabel,
  scanCaptureReady,
  type CameraAttempt,
} from "./camera-quality";
import {
  CAPTURE_PROFILES,
  type CaptureMode,
} from "./types";
import { CameraGuide, QualityPanel, ScanModePicker } from "./guide";
import { ResultCard } from "./result-card";
import { Feedback } from "./feedback";
import { Scanning } from "./scanning";
import { ScanControls } from "./scan-controls";
import { Center } from "./ui";
import { FlowSteps } from "@/app/components/flow-steps";
import { Xiaohei } from "@/app/components/sketch";
import { InfoSheet } from "./info-sheet";
import {
  cameraFrame,
  debugStyle,
  eyebrow,
  fallbackText,
  ghostLink,
  leadStyle,
  outlineBtn,
  primaryBtn,
  titleStyle,
  videoStyle,
} from "./scan-styles";

type Phase = "init" | "ready" | "analyzing" | "result" | "noface" | "denied" | "unsupported" | "interrupted";

const CONSENT_STORAGE_ERROR = "동의 기록을 저장하지 못했어요. 브라우저 저장공간을 확인한 뒤 다시 시도해 주세요.";

export default function Scan() {
  // scan_started fires at the shutter, so everything /scan lost before that —
  // above all a refused camera permission — left no trace. scan_opened is the
  // denominator that makes that loss countable; camera_blocked below names it.
  useFunnelPageView("scan_opened");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef<Phase>("init");
  const disposedRef = useRef(false);
  const captureRef = useRef<(() => Promise<void>) | null>(null);
  const workerRef = useRef<LandmarkerWorker | null>(null);
  const useWorkerRef = useRef(false);
  const cameraAttemptRef = useRef<CameraAttempt>("high");
  const cropSizeRef = useRef<{ ai?: string; learning?: string; model?: string }>({});

  const [phase, setPhase] = useState<Phase>("init");
  // Every setPhase("denied") must set this too. The render below falls through to the
  // permission copy for anything it does not recognise, so a path that forgets tells
  // the user to grant a permission they have already granted — pinned by
  // tests/camera-denied-reason.test.ts.
  const [deniedReason, setDeniedReason] = useState<"permission" | "busy" | "notfound" | "attach">("permission");
  // Why the live camera stopped. "backgrounded" is ARU stopping its own stream when
  // the tab is hidden; "muted"/"ended" is the track dying under it, which on a phone
  // is almost always another app taking the camera. The user can act on the second
  // and not on the first, so the screen must not tell them the same thing.
  const [interruptReason, setInterruptReason] = useState<CameraInterruptionReason | "backgrounded">("backgrounded");
  const [reads, setReads] = useState<SkinReads | null>(null);
  const [err, setErr] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [shareErr, setShareErr] = useState("");
  const [consent, setConsent] = useState(false);
  const [datasetConsent, setDatasetConsent] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("balanced");
  const [cropDataUrl, setCropDataUrl] = useState<string | null>(null);
  const [captureMeta, setCaptureMeta] = useState<SampleMeta | null>(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const {
    delegate: landmarkerDelegate,
    guideState,
    attempt: guideAttempt,
    ensureLandmarker,
    loadLandmarker,
    reloadLandmarker,
    forceCpuDelegate,
  } = useLandmarker();
  const captureProfile = CAPTURE_PROFILES[captureMode];
  const [staffMode, setStaffMode] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const debugRef = useRef(false);
  useEffect(() => {
    // URL is client-only context here; reading it during render breaks hydration.
    const params = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect */
    setStaffMode(params.get("staff") === "1");
    const dbg = params.get("debug") === "1";
    setDebugMode(dbg);
    debugRef.current = dbg;
    /* eslint-enable react-hooks/set-state-in-effect */
    // Opt-in Web Worker inference offload (default off). Ships dark for on-device
    // validation; the main thread stays the default and the per-frame fallback.
    useWorkerRef.current = params.get("worker") === "1";
  }, []);

  const {
    quality,
    autoCapture,
    countdown,
    zones,
    debugInfo,
    lastCenterRef,
    readFrame,
    commitQuality,
    resetQualityLoop,
    resetAutoCaptureProgress,
    holdAutoCapture,
    toggleAutoCapture,
    stopQualityLoop,
  } = useQualityLoop({
    active: phase === "ready",
    captureMode,
    videoRef,
    streamRef,
    captureRef,
    workerRef,
    useWorkerRef,
    cameraAttemptRef,
    cropSizeRef,
    debugRef,
    guideAttempt,
    landmarkerDelegate,
    loadLandmarker,
    reloadLandmarker,
    forceCpuDelegate,
  });

  const zonesReady = Boolean(zones);
  const canCapture = phase === "ready" && scanCaptureReady(quality, zonesReady);

  const startCamera = useCallback(async () => {
    setErr("");
    setReads(null);
    setCropDataUrl(null);
    setCaptureMeta(null);
    resetQualityLoop();
    if (!navigator.mediaDevices?.getUserMedia) {
      recordFunnelEvent("camera_blocked", { reason: "unsupported" });
      setPhase("unsupported");
      return;
    }

    let opened: Awaited<ReturnType<typeof openCamera>>;
    try {
      opened = await openCamera((constraints) => navigator.mediaDevices.getUserMedia(constraints));
    } catch (lastError) {
      const name = (lastError as { name?: string } | null)?.name;
      const reason = name === "NotReadableError" ? "busy" : name === "NotFoundError" || name === "OverconstrainedError" ? "notfound" : "permission";
      recordFunnelEvent("camera_blocked", { reason });
      setDeniedReason(reason);
      setPhase("denied");
      return;
    }
    const { stream, attempt } = opened;
    cameraAttemptRef.current = attempt;

    try {
      if (disposedRef.current) {
        stopMediaStream(stream);
        return;
      }
      stopMediaStream(streamRef.current);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // A play() rejection (iOS Low Power Mode / AbortError) does NOT mean the
        // camera was denied — the stream is live and attached. onLoadedMetadata
        // retries play; never route a play() reject to the denied dead-end.
        try {
          await videoRef.current.play();
        } catch {
          /* live stream attached; onLoadedMetadata will start playback */
        }
      }
      setPhase("ready");
    } catch {
      // The stream opened and then failed to attach. A different failure from a
      // refusal, and the user sees the same dead-end, so it is recorded separately —
      // and told separately: permission was granted here (getUserMedia resolved above),
      // so the 권한 copy would send the user to check a setting that is already correct.
      recordFunnelEvent("camera_blocked", { reason: "attach" });
      setDeniedReason("attach");
      setPhase("denied");
    }
  }, [resetQualityLoop]);

  const stopCamera = useCallback(() => {
    if (videoRef.current) videoRef.current.srcObject = null;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    stopQualityLoop();
  }, [stopQualityLoop]);

  const { capture, cancelCapture } = useCaptureAnalysis({
    videoRef,
    captureRef,
    cropSizeRef,
    lastCenterRef,
    captureMode,
    quality,
    guideState,
    consent,
    datasetConsent,
    ensureLandmarker,
    readFrame,
    commitQuality,
    resetAutoCaptureProgress,
    holdAutoCapture,
    stopCamera,
    setPhase,
    setAnalysisStep,
    setErr,
    setCropDataUrl,
    setCaptureMeta,
    setReads,
  });

  const interruptCamera = useCallback((reason: CameraInterruptionReason | "backgrounded") => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "analyzing") return;
    cancelCapture();
    stopCamera();
    setErr("");
    setInterruptReason(reason);
    // A live camera dying was the one camera dead-end the funnel recorded nothing for.
    // The reason is carried from the call site rather than derived here, because the
    // backgrounding callers reach the same function and are not a loss.
    recordFunnelEvent("camera_interrupted", { reason });
    setPhase("interrupted");
  }, [cancelCapture, stopCamera]);

  function retryGuide() {
    reloadLandmarker();
  }

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream || (phase !== "ready" && phase !== "analyzing")) return;
    return watchCameraStream(stream, interruptCamera);
  }, [interruptCamera, phase]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) interruptCamera("backgrounded");
    };
    const handlePageHide = () => interruptCamera("backgrounded");
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [interruptCamera]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      stopCamera();
      workerRef.current?.close();
      workerRef.current = null;
    };
  }, [stopCamera]);

  // The <video> is unmounted during the result phase, so 다시 찍기's
  // startCamera can resolve before the element exists — reattach on remount.
  useEffect(() => {
    const video = videoRef.current;
    if (phase !== "ready" || !video || !streamRef.current) return;
    if (video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play();
    }
  }, [phase]);

 function reset() {
    setReads(null);
    setShareErr("");
    void startCamera();
  }

  // One-tap viral loop: copy the mood invite link to the clipboard — no file
  // pickers or share sheets, so passing it into any chat is frictionless.
  async function shareResultCard() {
    if (!reads) return;
    setShareErr("");
    const url = moodShareUrl({ oil: reads.oil.level, redness: reads.redness.level, pores: reads.pores.level });
    try {
      await navigator.clipboard.writeText(url);
      recordFunnelEvent("share_clicked", { surface: "scan_result", mode: "clipboard" });
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2400);
    } catch {
      setShareErr(t("공유에 실패했어요. 잠시 후 다시 시도해 주세요."));
    }
  }

  function toggleAiConsent(next: boolean) {
    const session = getCurrentPilotSession();
    const event = recordConsentEvent("ai_analysis", next, session ? { participantId: session.participantId, sessionId: session.sessionId } : undefined);
    if (!event && next) {
      setErr(t(CONSENT_STORAGE_ERROR));
      return;
    }
    setConsent(next);
    setErr(event ? "" : t(CONSENT_STORAGE_ERROR));
  }

  function toggleDatasetConsent(next: boolean) {
    const session = getCurrentPilotSession();
    const event = recordConsentEvent("learning_crop", next, session ? { participantId: session.participantId, sessionId: session.sessionId } : undefined);
    if (!event && next) {
      setErr(t(CONSENT_STORAGE_ERROR));
      return;
    }
    setDatasetConsent(next);
    setErr(event ? "" : t(CONSENT_STORAGE_ERROR));
  }

  return (
    <main className="px-5 py-9" style={{ background: "var(--paper)", minHeight: "100dvh" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <p style={eyebrow}>{t("30초 피부 체크")}</p>
        <FlowSteps current="scan" />
        <h1 style={titleStyle}>{t("오늘의 피부를 카메라로 살펴볼게요")}</h1>
        <p style={leadStyle}>{t("얼굴을 가이드에 맞추면 빛과 각도를 확인한 뒤 자동으로 촬영해요.")}</p>

        {phase !== "result" && (
          <div style={cameraFrame}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => videoRef.current?.play().catch(() => {})}
              style={videoStyle(phase === "ready" || phase === "analyzing")}
            />
            {phase === "ready" && guideState === "ready" && <CameraGuide quality={quality} mode={captureMode} zones={zones} />}
            {phase === "ready" && guideState === "loading" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(255,255,255,.78)" }}>
                <Xiaohei size={64} pose="magnify" bob />
                <p style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--ink)" }}>{t("얼굴 가이드 불러오는 중…")}</p>
              </div>
            )}
            {phase === "ready" && guideState === "failed" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24, textAlign: "center", background: "rgba(255,255,255,.92)" }}>
                <p style={fallbackText}>{t("얼굴 가이드를 불러오지 못했어요.")}<br />{t("네트워크를 확인하고 다시 시도해 주세요.")}</p>
                <button onClick={retryGuide} style={primaryBtn}>{t("다시 시도")}</button>
                <a href="/survey" style={ghostLink}>{t("카메라 없이 설문으로 시작하기")}</a>
              </div>
            )}
            {phase === "init" && (
              <Center>
                <div style={{ maxWidth: 320, background: "rgba(0,0,0,.58)", borderRadius: 14, padding: "20px 18px" }}>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: 25, color: "#fff", marginBottom: 12 }}>{t("30초 피부 체크, 시작해볼까요?")}</p>
                  <div style={{ display: "grid", gap: 9, marginBottom: 16, textAlign: "start" }}>
                    {[
                      ["📷", "얼굴을 가이드에 맞추면 빛과 각도를 확인한 뒤 자동으로 촬영해요."],
                      ["🔒", "기본 스캔은 기기 안에서만 처리 — 사진은 전송·저장되지 않아요."],
                      ["✨", "T존·양볼의 유분·붉은기·결을 여러 프레임으로 읽어요."],
                    ].map(([icon, text]) => (
                      <div key={text} style={{ display: "flex", gap: 9, alignItems: "flex-start", color: "rgba(255,255,255,.94)", fontSize: 13, lineHeight: 1.45 }}>
                        <span aria-hidden style={{ flexShrink: 0 }}>{icon}</span>
                        <span>{t(text)}</span>
                      </div>
                    ))}
                  </div>
                  <button data-testid="scan-start" onClick={startCamera} style={{ ...primaryBtn, width: "100%" }}>{t("카메라로 살펴보기")}</button>
                  <a href="/survey" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "100%", minHeight: "var(--tap-min)", textAlign: "center", marginTop: 11, fontSize: 13, color: "rgba(255,255,255,.85)", textDecoration: "underline" }}>
                    {t("카메라 없이 설문으로 시작하기")}
                  </a>
                </div>
              </Center>
            )}
            {phase === "analyzing" && <Scanning step={analysisStep} />}
            {debugMode && debugInfo && (
              <div style={{ position: "absolute", top: 6, left: 6, right: 6, background: "rgba(0,0,0,.72)", color: "#fff", fontSize: 10.5, fontFamily: "ui-monospace, Consolas, monospace", lineHeight: 1.5, padding: "6px 8px", borderRadius: 6, pointerEvents: "none", zIndex: 20 }}>
                {Object.entries(debugInfo).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, color: typeof v === "boolean" ? (v ? "#7de89a" : "#ff8c7d") : "#fff" }}>
                    <span style={{ opacity: 0.8 }}>{k}</span>
                    <span>{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
            {phase === "ready" && countdown !== null && (
              <div role="status" aria-live="polite" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, pointerEvents: "none" }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 96, lineHeight: 1, color: "#fff", textShadow: "0 2px 18px rgba(0,0,0,.5)" }}>{countdown}</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 21, color: "#fff", textShadow: "0 1px 10px rgba(0,0,0,.55)" }}>{t("좋아요. 잠시 그대로 있어주세요.")}</span>
              </div>
            )}
            {phase === "denied" && (
              <Center>
                <p style={fallbackText}>
                  {deniedReason === "busy"
                    ? t("카메라를 다른 앱이 사용 중이에요. 다른 앱을 닫고 다시 시도해 주세요.")
                    : deniedReason === "notfound"
                      ? t("연결된 카메라를 찾지 못했어요.")
                      : deniedReason === "attach"
                        ? t("카메라는 켜졌는데 화면에 연결하지 못했어요. 다시 시도해 주세요.")
                        : t("카메라 권한이 필요해요.")}
                </p>
                <button onClick={() => void startCamera()} style={primaryBtn}>{t("다시 시도")}</button>
                <a href="/survey" style={ghostLink}>{t("카메라 없이 설문으로 시작하기")}</a>
              </Center>
            )}
            {phase === "interrupted" && (
              <Center>
                <div style={{ maxWidth: 300, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <p style={{ ...fallbackText, color: "var(--ink)", fontWeight: 700, marginBottom: 6 }}>
                    {t("카메라가 잠시 멈췄어요.")}
                  </p>
                  <p style={{ ...fallbackText, marginBottom: 12 }}>
                    {interruptReason === "backgrounded"
                      ? t("계속하려면 카메라를 다시 켜주세요.")
                      : t("다른 앱이 카메라를 쓰고 있을 수 있어요. 그 앱을 닫고 다시 켜주세요.")}
                  </p>
                  <button onClick={() => void startCamera()} style={primaryBtn}>{t("카메라 다시 켜기")}</button>
                  <a href="/survey" style={ghostLink}>{t("카메라 없이 설문으로 시작하기")}</a>
                </div>
              </Center>
            )}
            {phase === "noface" && (
              <Center>
                <p style={fallbackText}>{t("피부가 선명하게 보이지 않았어요. 가이드라인에 맞춰서 밝은 곳에서 정면으로 다시 촬영해 주세요.")}</p>
                <button onClick={() => setPhase("ready")} style={primaryBtn}>{t("다시 시도")}</button>
                <a href="/survey" style={ghostLink}>{t("카메라 없이 설문으로 시작하기")}</a>
              </Center>
            )}
            {phase === "unsupported" && (
              <Center>
                <p style={fallbackText}>{t("이 브라우저에서는 카메라를 사용할 수 없어요.")}</p>
                <a href="/survey" style={ghostLink}>{t("카메라 없이 설문으로 시작하기")}</a>
              </Center>
            )}
          </div>
        )}

        {phase === "ready" && (
          <>
            {staffMode && <ScanModePicker mode={captureMode} onChange={setCaptureMode} />}
            <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: quality.face ? "var(--success)" : "var(--text-muted)", fontWeight: 600 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: quality.face ? "var(--success)" : "var(--muted)", animation: quality.face ? "gyeol-bob 1.1s ease-in-out infinite" : undefined, flexShrink: 0 }} />
              <span>{quality.face ? t("얼굴 인식됨 · 피부 신호를 읽고 있어요") : t("얼굴을 화면 안에 맞춰주세요")}</span>
            </div>
            <QualityPanel quality={quality} requireSteady={captureProfile.requiresSteady} zonesReady={zonesReady} />
            <ScanControls
              aiConsent={consent}
              datasetConsent={datasetConsent}
              autoCapture={autoCapture}
              onAiConsentChange={toggleAiConsent}
              onDatasetConsentChange={toggleDatasetConsent}
              onAutoCaptureChange={toggleAutoCapture}
              onInfoOpen={() => setInfoOpen(true)}
            />
          </>
        )}

        {(phase === "ready" || phase === "analyzing") && (
          <div style={{ position: "sticky", bottom: 0, zIndex: 5, background: "var(--paper)", padding: "10px 0 calc(8px + env(safe-area-inset-bottom))", marginTop: 6 }}>
            <button
              onClick={capture}
              disabled={phase === "analyzing" || !canCapture || guideState !== "ready"}
              style={{
                ...primaryBtn,
                width: "100%",
                opacity: phase === "analyzing" || !canCapture || guideState !== "ready" ? 0.58 : 1,
                cursor: phase === "analyzing" || !canCapture || guideState !== "ready" ? "default" : "pointer",
              }}
            >
              {t(scanCaptureButtonLabel({ phase, countdown, guideReady: guideState === "ready", canCapture, zonesReady }))}
            </button>
          </div>
        )}

        {err && <p role="alert" style={{ color: "var(--plum-press)", fontSize: 13, marginTop: 10 }}>{err}</p>}

        {infoOpen && <InfoSheet staffMode={staffMode} onClose={() => setInfoOpen(false)} />}

        {phase === "result" && reads && (
          <>
            <ResultCard reads={reads} />
            <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", margin: "14px 0 4px" }}>
              {t("* 조명, 각도, 메이크업에 따라 달라질 수 있는 참고용 분석이에요.")}
            </p>
            {staffMode && getCurrentPilotSession() && (
              <details style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
                <summary style={{ cursor: "pointer", textAlign: "center" }}>{t("디버그 신호 보기")}</summary>
                <pre style={debugStyle}>
{`shine = ${reads.raw.shine.toFixed(3)} -> ${reads.oil.value}
relRedness = ${reads.raw.relRedness.toFixed(4)} -> ${reads.redness.value}
texture = ${reads.raw.cov.toFixed(3)} -> ${reads.pores.value}
tzoneL / cheekL = ${reads.raw.tzoneL.toFixed(0)} / ${reads.raw.cheekL.toFixed(0)}`}
                </pre>
              </details>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={reset} style={{ ...(reads.retakeRecommended ? primaryBtn : outlineBtn), flex: 1 }}>{t("다시 찍기")}</button>
              <a
                href="/survey"
                style={{ ...(reads.retakeRecommended ? outlineBtn : primaryBtn), flex: 1, textAlign: "center", textDecoration: "none" }}
              >
                {t("설문으로 이어가기")}
              </a>
            </div>
            <button
              type="button"
              onClick={shareResultCard}
              style={{
                ...outlineBtn,
                width: "100%",
                marginTop: 10,
                ...(shareCopied ? { borderColor: "var(--success)", color: "var(--success)" } : null),
              }}
            >
              {shareCopied ? t("공유 링크를 복사했어요.") : t("오늘의 피부 리포트 공유하기")}
            </button>
            <p role="status" aria-live="polite" style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 6 }}>
              {t("친구도 링크에서 30초 만에 자신의 피부를 살펴볼 수 있어요.")}
            </p>
            {shareErr && <p role="alert" style={{ fontSize: 12.5, color: "var(--plum-press)", textAlign: "center", marginTop: 8 }}>{shareErr}</p>}
            <a href="/studio" style={{ display: "block", textAlign: "center", marginTop: 12, fontSize: 13, color: "var(--text-muted)", textDecoration: "underline" }}>
              {t("공유할 문구 다듬기")}
            </a>
            {shouldShowFeedback({ hasReads: Boolean(reads), staffMode, datasetConsent }) && (
              <Feedback reads={reads} cropDataUrl={cropDataUrl} captureMeta={captureMeta} />
            )}
          </>
        )}
      </div>
    </main>
  );
}

// Presentational styles live in ./scan-styles.
