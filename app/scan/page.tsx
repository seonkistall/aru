"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n/core";
import { CONSENT_VERSION, getConsentEvents, recordConsentEvent } from "@/lib/consent";
import {
  analyzeSkinBurst,
  classifyVisibleAttributes,
  VISIBLE_MODEL_CONTRACT,
  type SkinReads,
} from "@/lib/skin";
import { labelCount, type SampleMeta } from "@/lib/labels";
import { getCurrentPilotSession } from "@/lib/pilot";
import { recordFunnelEvent } from "@/lib/funnel";
import { pushScanHistory } from "@/lib/scan-history";
import { shouldKeepLearningCrop, shouldShowFeedback } from "@/lib/ml-collection";
import { DEVICE_DATA_KEY } from "@/lib/device-data";

import { moodShareUrl } from "@/lib/share-link";
import { createLandmarkerWorker, type LandmarkerWorker } from "./landmarker-client";
import { createVideoLandmarker } from "./create-landmarker";
import { resolveCaptureConsent } from "./consent-authorization";
import { openCamera, stopMediaStream } from "./camera-stream";
import {
  buildCameraQualityDebug,
  cropPlanForPurpose,
  frameMovement,
  scanCaptureButtonLabel,
  scanCaptureReady,
  type CameraAttempt,
} from "./camera-quality";
import {
  CAPTURE_PROFILES,
  initialQuality,
  type CaptureMode,
  type GuideZones,
  type Landmark,
  type Quality,
} from "./types";
import { CameraGuide, computeGuideZones, QualityPanel, ScanModePicker } from "./guide";
import { ResultCard } from "./result-card";
import { Feedback } from "./feedback";
import { Scanning } from "./scanning";
import { ScanControls } from "./scan-controls";
import { Center } from "./ui";
import { FlowSteps } from "@/app/components/flow-steps";
import { Xiaohei } from "@/app/components/sketch";
import { coverCropFractions, faceBox, isNormalizedBox, rawFaceSize } from "@/lib/scan-geometry";
import { InfoSheet } from "./info-sheet";
import {
  DEFAULT_SKIN_ROI_THRESHOLDS,
  evaluateSkinRoiQuality,
  skinRoiRegionsFromLandmarks,
} from "./skin-roi-quality";
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
import {
  captureGateDecision,
  cropFace,
  cropFaceImageData,
  evaluateCapturedQuality,
  exposureStats,
  mergeVisionAnalysis,
  predictionSnapshot,
  qualityMeta,
} from "./capture-analysis";

type Phase = "init" | "ready" | "analyzing" | "result" | "noface" | "denied" | "unsupported";
type FaceLandmarker = {
  detectForVideo: (source: HTMLVideoElement | HTMLCanvasElement, timestampMs: number) => { faceLandmarks?: Landmark[][] };
  close?: () => void;
};

const CONSENT_STORAGE_ERROR = "동의 기록을 저장하지 못했어요. 브라우저 저장공간을 확인한 뒤 다시 시도해 주세요.";

export default function Scan() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const forceCpuRef = useRef(false);
  const lastCenterRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const qualityTimerRef = useRef<number | null>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const passStreakRef = useRef(0);
  const countdownRef = useRef<number | null>(null);
  const autoHoldUntilRef = useRef(0);
  const capturingRef = useRef(false);
  const captureLockRef = useRef(false);
  const autoCaptureRef = useRef(true);
  const disposedRef = useRef(false);
  const prevQualityKeyRef = useRef("");
  const captureRef = useRef<(() => Promise<void>) | null>(null);
  const workerRef = useRef<LandmarkerWorker | null>(null);
  const useWorkerRef = useRef(false);
  const cameraAttemptRef = useRef<CameraAttempt>("high");
  const cropSizeRef = useRef<{ ai?: string; learning?: string; model?: string }>({});

  const [phase, setPhase] = useState<Phase>("init");
  const [deniedReason, setDeniedReason] = useState<"permission" | "busy" | "notfound">("permission");
  const [reads, setReads] = useState<SkinReads | null>(null);
  const [err, setErr] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [shareErr, setShareErr] = useState("");
  const [consent, setConsent] = useState(false);
  const [datasetConsent, setDatasetConsent] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("balanced");
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const [cropDataUrl, setCropDataUrl] = useState<string | null>(null);
  const [captureMeta, setCaptureMeta] = useState<SampleMeta | null>(null);
  const [autoCapture, setAutoCapture] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [zones, setZones] = useState<GuideZones | null>(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [guideState, setGuideState] = useState<"loading" | "ready" | "failed">("loading");
  const [guideAttempt, setGuideAttempt] = useState(0);
  const captureProfile = CAPTURE_PROFILES[captureMode];
  const [staffMode, setStaffMode] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const debugRef = useRef(false);
  const [debugInfo, setDebugInfo] = useState<Record<string, string | number | boolean> | null>(null);
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

  const zonesReady = Boolean(zones);
  const canCapture = phase === "ready" && scanCaptureReady(quality, zonesReady);

  // Skip renders when nothing user-visible changed (ticks arrive every 650ms);
  // qualityRef-independent auto-capture reads results via handleAutoTick instead.
  const commitQuality = useCallback((next: Quality, force = false) => {
    const key = `${next.face}|${next.centered}|${next.distance}|${next.brightness}|${next.noGlare}|${next.steady}|${next.message}`;
    if (!force && key === prevQualityKeyRef.current) return;
    prevQualityKeyRef.current = key;
    setQuality(next);
  }, []);

  const setCountdownSafe = useCallback((value: number | null) => {
    if (countdownRef.current === value) return;
    countdownRef.current = value;
    setCountdown(value);
  }, []);

  // Auto capture: two consecutive passing ticks arm a 3-2-1 countdown (one step
  // per 650ms tick); any failing check cancels it. Runs off refs so the quality
  // render bail-out above cannot stall it.
  const handleAutoTick = useCallback((pass: boolean) => {
    if (!autoCaptureRef.current || capturingRef.current) return;
    if (!pass) {
      passStreakRef.current = 0;
      setCountdownSafe(null);
      return;
    }
    if (performance.now() < autoHoldUntilRef.current) return;
    passStreakRef.current += 1;
    const current = countdownRef.current;
    if (current === null) {
      if (passStreakRef.current >= 2) setCountdownSafe(3);
    } else if (current > 1) {
      setCountdownSafe(current - 1);
    } else {
      setCountdownSafe(null);
      capturingRef.current = true;
      void captureRef.current?.().finally(() => {
        capturingRef.current = false;
      });
    }
  }, [setCountdownSafe]);

  const startCamera = useCallback(async () => {
    setErr("");
    setReads(null);
    setCropDataUrl(null);
    setCaptureMeta(null);
    setQuality(initialQuality);
    prevQualityKeyRef.current = "";
    lastCenterRef.current = null;
    passStreakRef.current = 0;
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }

    let opened: Awaited<ReturnType<typeof openCamera>>;
    try {
      opened = await openCamera((constraints) => navigator.mediaDevices.getUserMedia(constraints));
    } catch (lastError) {
      const name = (lastError as { name?: string } | null)?.name;
      setDeniedReason(name === "NotReadableError" ? "busy" : name === "NotFoundError" || name === "OverconstrainedError" ? "notfound" : "permission");
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
      setPhase("denied");
    }
  }, []);

  const ensureLandmarker = useCallback(async (): Promise<FaceLandmarker | null> => {
    if (landmarkerRef.current) return landmarkerRef.current;
    let landmarker: FaceLandmarker;
    if (forceCpuRef.current) {
      // A prior GPU run emitted corrupt (non-normalized) landmarks on this
      // device — CPU delegate is slower but always correct.
      landmarker = await createVideoLandmarker("CPU");
    } else {
      try {
        landmarker = await createVideoLandmarker("GPU");
      } catch {
        // Some mobile GPUs fail delegate init — CPU is slower but always works.
        landmarker = await createVideoLandmarker("CPU");
      }
    }
    // The WASM fileset + ~3MB model can take seconds on mobile; if the user
    // navigated away meanwhile, the unmount cleanup already ran (ref was still
    // null), so close the now-orphaned landmarker instead of leaking it.
    if (disposedRef.current) {
      landmarker.close?.();
      return null;
    }
    landmarkerRef.current = landmarker;
    return landmarker;
  }, []);

  const stopCamera = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (qualityTimerRef.current) window.clearTimeout(qualityTimerRef.current);
  }, []);

  const readFrame = useCallback((maxSize = 360) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const ratio = video.videoWidth / video.videoHeight;
    const h = video.videoHeight > video.videoWidth ? maxSize : Math.round(maxSize / ratio);
    const w = Math.round(h * ratio);
    const canvas = procCanvasRef.current ?? (procCanvasRef.current = document.createElement("canvas"));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return { canvas, ctx, w, h };
  }, []);

  // Live-gate detection source. When the worker offload is enabled and healthy,
  // run inference off the main thread; on any failure fall back to the trusted
  // main-thread landmarker for that frame. Capture() never uses the worker.
  const detectLiveFace = useCallback(async (landmarker: FaceLandmarker, video: HTMLVideoElement) => {
    const worker = workerRef.current;
    if (worker) {
      try {
        const bitmap = await createImageBitmap(video);
        return await worker.detect(bitmap, performance.now());
      } catch {
        /* fall back to main-thread inference below */
      }
    }
    return landmarker.detectForVideo(video, performance.now()).faceLandmarks?.[0] ?? null;
  }, []);

  const measureQuality = useCallback(
    async (landmarker: FaceLandmarker) => {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) return;

      // VIDEO running mode tracks temporally and reads the element directly —
      // the downscaled canvas below is only needed for exposure statistics.
      const face = await detectLiveFace(landmarker, video);
      if (!face?.length) {
        lastCenterRef.current = null;
        setZones(null);
        commitQuality({ ...initialQuality, message: t("얼굴이 보이지 않아요. 정면을 향해주세요.") });
        handleAutoTick(false);
        return;
      }

      const frame = readFrame();
      if (!frame) return;

      const box = faceBox(face);

      // Self-heal: some mobile GPU delegates (seen on Samsung) emit corrupt,
      // non-normalized landmarks (values ~1e34). A real normalized box is
      // within [0,1]; anything wild means the GPU output is garbage — switch
      // to the CPU delegate once and reload. This also un-breaks the tracked
      // sampling zones, which need valid landmarks.
      if (!forceCpuRef.current && !isNormalizedBox(box)) {
        forceCpuRef.current = true;
        landmarkerRef.current?.close?.();
        landmarkerRef.current = null;
        if (qualityTimerRef.current) window.clearTimeout(qualityTimerRef.current);
        handleAutoTick(false);
        setGuideState("loading");
        setGuideAttempt((n) => n + 1);
        return;
      }

      const centerX = (box.minX + box.maxX) / 2;
      const centerY = (box.minY + box.maxY) / 2;
      const profile = CAPTURE_PROFILES[captureMode];

      // Distance = the RAW normalized face box (aspect-independent). A real,
      // reasonably-close face spans a good fraction of the frame in at least
      // one axis, regardless of stream orientation. This drops the fragile
      // cover-crop transform from the GATE, which is what kept blocking phones.
      // The floor is per-profile: a face inside the guide but too far renders
      // too few skin pixels for trustworthy texture/pore reads.
      const rawSize = rawFaceSize(box);
      const distance = rawSize > profile.minFaceSize && rawSize < 0.98;

      // Centering stays ADVISORY only (landmark ROIs analyze off-center faces
      // fine), so it never blocks auto-capture.
      const { fx, fy } = coverCropFractions(video.videoWidth, video.videoHeight);
      const visCenterX = (centerX - (1 - fx) / 2) / fx;
      const visCenterY = (centerY - (1 - fy) / 2) / fy;
      const centered = Math.abs(visCenterX - 0.5) < 0.28 && Math.abs(visCenterY - 0.48) < 0.3;

      const frameData = frame.ctx.getImageData(0, 0, frame.w, frame.h);
      const exposure = exposureStats(frameData, box);
      const skinRegions = skinRoiRegionsFromLandmarks(face);
      const skinQuality = evaluateSkinRoiQuality(frameData, skinRegions ?? { tzone: null, leftCheek: null, rightCheek: null }, {
        ...DEFAULT_SKIN_ROI_THRESHOLDS,
        minMeanLuma: profile.minBrightness,
        maxDarkRatio: profile.maxDarkRatio,
        maxHotRatio: profile.maxHotRatio,
      });
      const brightness = skinQuality.exposure;
      const noGlare = skinQuality.noGlare;

      const now = performance.now();
      const last = lastCenterRef.current;
      const movement = last ? frameMovement(last, { x: centerX, y: centerY }, now - last.t) : 0;
      lastCenterRef.current = { x: centerX, y: centerY, t: now };
      const steady = !last || movement < profile.maxMovement;

      const nextZones = computeGuideZones(face, video.videoWidth, video.videoHeight);
      const skinReady = skinQuality.regionsReady && skinQuality.sharp;
      const pass = scanCaptureReady({ face: true, centered, distance, brightness, noGlare, steady, skinReady }, Boolean(nextZones));
      const score = 1 + (distance ? 1 : 0) + (brightness ? 1 : 0) + (noGlare ? 1 : 0) + (steady ? 1 : 0) + (centered ? 1 : 0);
      const message = !distance
        ? rawSize <= profile.minFaceSize
          ? t("얼굴이 작게 보여요. 조금 더 가까이 와주세요.")
          : t("너무 가까워요. 살짝 물러나 주세요.")
        : !skinQuality.regionsReady
          ? t("피부 영역을 가이드 안에 맞춰주세요.")
          : !brightness
          ? t("피부가 어두워요. 부드러운 정면 빛 쪽으로 이동해주세요.")
          : !noGlare
            ? t("피부 반사가 강해요. 직접 조명이나 번들거림을 줄여주세요.")
            : !skinQuality.sharp
              ? t("피부 결이 흐려요. 렌즈를 닦고 잠깐 멈춰주세요.")
              : !centered
                ? t("얼굴을 윤곽선 중앙에 맞춰주세요.")
            : !steady
              ? t("잠깐만 멈춰주세요. 피부 결은 흔들림에 약해요.")
              : t("좋아요. 그대로 계세요.");

      commitQuality({ face: true, centered, distance, brightness, noGlare, steady, skinReady, score, message });
      handleAutoTick(pass);
      setZones(nextZones);
      if (debugRef.current) {
        setDebugInfo({
          "delegate": forceCpuRef.current ? "CPU" : "GPU",
          ...buildCameraQualityDebug({
            attempt: cameraAttemptRef.current,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            trackSettings: streamRef.current?.getVideoTracks()[0]?.getSettings?.(),
            cropSizes: cropSizeRef.current,
          }),
          "ratio": Number((video.videoWidth / video.videoHeight).toFixed(3)),
          "fx/fy": `${fx.toFixed(2)}/${fy.toFixed(2)}`,
          "rawSize": Number(rawSize.toFixed(3)),
          "box cx/cy": `${centerX.toFixed(2)}/${centerY.toFixed(2)}`,
          "vis cx/cy": `${visCenterX.toFixed(2)}/${visCenterY.toFixed(2)}`,
          "mean/dark/hot": `${Math.round(exposure.mean)}/${exposure.darkRatio.toFixed(2)}/${exposure.hotRatio.toFixed(3)}`,
          "skin mean/dark/hot/detail": `${Math.round(skinQuality.meanLuma ?? 0)}/${(skinQuality.maxDarkRatio ?? 0).toFixed(2)}/${(skinQuality.maxHotRatio ?? 0).toFixed(3)}/${(skinQuality.minDetail ?? 0).toFixed(1)}`,
          "distance": distance,
          "brightness": brightness,
          "noGlare": noGlare,
          "skinReady": skinReady,
          "steady": steady,
          "centered(adv)": centered,
          "zones": nextZones ? `${nextZones.tzone.width} / ${nextZones.leftCheek.width} / ${nextZones.rightCheek.width}` : "none",
          "AUTO PASS": pass,
        });
      }
    },
    [captureMode, commitQuality, handleAutoTick, readFrame, detectLiveFace]
  );

  useEffect(() => {
    if (phase !== "ready") return;
    let mounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuideState("loading");
    if (useWorkerRef.current && !workerRef.current) {
      // Spin up lazily; null (unsupported) just keeps the main-thread path.
      workerRef.current = createLandmarkerWorker();
      // The worker uses the corruption-safe CPU delegate. capture() still runs
      // the main-thread landmarker, so pin it to CPU too — otherwise a GPU-buggy
      // device could pass the worker-driven gate and then fail every capture on
      // garbage GPU landmarks (which capture() doesn't self-heal).
      if (workerRef.current) forceCpuRef.current = true;
    }
    ensureLandmarker()
      .then((landmarker) => {
        if (!mounted || !landmarker) return;
        setGuideState("ready");
        // Self-scheduling instead of setInterval: waits for each measureQuality
        // to finish (no overlap) and paces adaptively — on a slow CPU-delegate
        // phone the next tick is 1.5x the last duration (650-1500ms) so the main
        // thread stays free to paint the preview + 3-2-1 countdown. Desktop ticks
        // finish in a few ms, so it stays at the 650ms baseline.
        const tick = () => {
          if (!mounted) return;
          if (document.hidden) {
            qualityTimerRef.current = window.setTimeout(tick, 650);
            return;
          }
          const started = performance.now();
          void measureQuality(landmarker).finally(() => {
            if (!mounted) return;
            const delay = Math.max(650, Math.min(1500, Math.round((performance.now() - started) * 1.5)));
            qualityTimerRef.current = window.setTimeout(tick, delay);
          });
        };
        qualityTimerRef.current = window.setTimeout(tick, 0);
      })
      .catch(() => {
        if (!mounted) return;
        // Model/WASM failed to load (offline, blocked CDN, GPU+CPU both fail).
        // Never leave the user stuck on a live preview with a dead button.
        landmarkerRef.current = null;
        setGuideState("failed");
      });
    return () => {
      mounted = false;
      if (qualityTimerRef.current) window.clearTimeout(qualityTimerRef.current);
      passStreakRef.current = 0;
      setCountdownSafe(null);
    };
  }, [ensureLandmarker, measureQuality, phase, setCountdownSafe, guideAttempt]);

  function retryGuide() {
    landmarkerRef.current = null;
    setGuideState("loading");
    setGuideAttempt((n) => n + 1);
  }

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      stopCamera();
      landmarkerRef.current?.close?.();
      landmarkerRef.current = null;
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

  async function capture() {
    const video = videoRef.current;
    // Reentrancy guard: the manual shutter stays enabled through the countdown,
    // so a tap landing the same frame auto-capture fires would run two pipelines
    // (double /api/analyze, duplicated funnel + scan-history, fighting phases).
    if (!video || captureLockRef.current || guideState !== "ready") return;
    captureLockRef.current = true;
    setCountdownSafe(null);
    passStreakRef.current = 0;
    setPhase("analyzing");
    setAnalysisStep(0);
    setErr("");
    setCropDataUrl(null);
    recordFunnelEvent("scan_started", { mode: captureMode });

    // Pace the four analysis stages so each is readable (825ms min = 3.3s
    // total, i.e. three full down-up sweeps of the 1.1s scan bar); the real
    // pipeline work runs inside the same awaits, so nothing is faked.
    let stepStartedAt = performance.now();
    const advanceStep = async (step: number) => {
      const waitMs = 825 - (performance.now() - stepStartedAt);
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      setAnalysisStep(step);
      stepStartedAt = performance.now();
    };

    try {
      const landmarker = await ensureLandmarker();
      if (!landmarker) return;
      const w = video.videoWidth || 720;
      const h = video.videoHeight || 960;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("canvas unavailable");
      ctx.drawImage(video, 0, 0, w, h);

      const res = landmarker.detectForVideo(canvas, performance.now());
      const faces = res.faceLandmarks ?? [];
      if (captureGateDecision({ guideState, landmarks: faces[0] }) === "face") {
        autoHoldUntilRef.current = performance.now() + 4000;
        setPhase("noface");
        return;
      }

      const imageData = ctx.getImageData(0, 0, w, h);
      // Steadiness from the capture frame itself when the baseline is long
      // enough to estimate a per-250ms velocity; under 80ms the estimate is
      // noise-dominated, so fall back to the (fresh) tick value instead.
      const captureBox = faceBox(faces[0]);
      const last = lastCenterRef.current;
      const captureCenter = { x: (captureBox.minX + captureBox.maxX) / 2, y: (captureBox.minY + captureBox.maxY) / 2 };
      const dtMs = last ? performance.now() - last.t : 0;
      const captureMovement =
        last && dtMs >= 80 ? frameMovement(last, captureCenter, dtMs) : undefined;
      const captureSteady =
        captureMovement !== undefined ? captureMovement < CAPTURE_PROFILES[captureMode].maxMovement : quality.steady;
      // Verify exposure on the SAME ~360px downscale the live gate uses, not the
      // full-res frame. Downscaling smooths specular glints, so full-res
      // hot/dark ratios run higher than the gate's — with identical thresholds
      // that let the gate green-light an exposure the full-res verify then
      // rejected, causing an auto-capture->reject loop. (Skin analysis below
      // still uses the full-res imageData.)
      const verifyFrame = readFrame();
      const verifyData = verifyFrame ? verifyFrame.ctx.getImageData(0, 0, verifyFrame.w, verifyFrame.h) : imageData;
      const verifiedQuality: Quality = {
        ...evaluateCapturedQuality(verifyData, faces[0], CAPTURE_PROFILES[captureMode], captureSteady),
        movement: captureMovement,
      };
      commitQuality(verifiedQuality, true);
      if (captureGateDecision({ guideState, landmarks: faces[0], quality: verifiedQuality }) === "quality") {
        autoHoldUntilRef.current = performance.now() + 4000;
        setErr(t("촬영 순간 품질이 흔들렸어요. 얼굴을 윤곽선에 맞추고 다시 찍어주세요."));
        setPhase("ready");
        return;
      }

      const session = getCurrentPilotSession();
      const scope = session ? { participantId: session.participantId, sessionId: session.sessionId } : undefined;
      const consentEvents = getConsentEvents();
      const exactScope = scope ? { participantId: scope.participantId, sessionId: scope.sessionId } : undefined;
      const aiEvent = resolveCaptureConsent(consentEvents, "ai_analysis", consent, exactScope);
      const cropEvent = resolveCaptureConsent(consentEvents, "learning_crop", datasetConsent, exactScope);
      const aiAllowed = Boolean(aiEvent);
      const cropAllowed = Boolean(cropEvent);

      // Crops come from this verified first frame (canvas still holds it).
      const aiCrop = aiAllowed ? cropFace(canvas, faces[0], cropPlanForPurpose("ai-analysis")) : null;
      const learningCrop = cropAllowed ? cropFace(canvas, faces[0], cropPlanForPurpose("learning-crop")) : null;
      const modelCrop = process.env.NEXT_PUBLIC_VISIBLE_ATTR_MODEL === "on" ? cropFaceImageData(canvas, faces[0]) : null;
      cropSizeRef.current = {
        ai: aiCrop?.size,
        learning: learningCrop?.size,
        model: modelCrop ? `${modelCrop.width}x${modelCrop.height}` : undefined,
      };
      setCropDataUrl(shouldKeepLearningCrop({ datasetConsent: cropAllowed }) ? learningCrop?.dataUrl ?? null : null);

      // Burst: two extra frames ~140ms apart; the per-feature median suppresses
      // one-frame glare/motion spikes, and cross-frame agreement feeds the
      // confidence/retake decision (recorded in labels for ML calibration).
      const burstFrames: Array<{ imageData: ImageData; landmarks: Landmark[] }> = [{ imageData, landmarks: faces[0] }];
      let previousBurstCenter = captureCenter;
      for (let i = 1; i < 3; i += 1) {
        const frameStartedAt = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 140));
        ctx.drawImage(video, 0, 0, w, h);
        const extra = landmarker.detectForVideo(canvas, performance.now()).faceLandmarks?.[0];
        if (extra?.length) {
          const extraBox = faceBox(extra);
          const extraCenter = { x: (extraBox.minX + extraBox.maxX) / 2, y: (extraBox.minY + extraBox.maxY) / 2 };
          const movement = frameMovement(previousBurstCenter, extraCenter, performance.now() - frameStartedAt);
          if (movement >= CAPTURE_PROFILES[captureMode].maxMovement) {
            autoHoldUntilRef.current = performance.now() + 4000;
            setErr(t("스캔 중 얼굴이 움직였어요. 윤곽선 중앙에 맞추고 잠깐 멈춰주세요."));
            setPhase("ready");
            return;
          }
          previousBurstCenter = extraCenter;
          burstFrames.push({ imageData: ctx.getImageData(0, 0, w, h), landmarks: extra });
        }
      }

      await advanceStep(1);
      const mlPrediction = modelCrop ? await classifyVisibleAttributes(modelCrop) : null;
      const out = analyzeSkinBurst(burstFrames, mlPrediction);
      if (!out) {
        setPhase("noface");
        return;
      }
      await advanceStep(2);
      await advanceStep(3);

      let final = out;
      if (aiAllowed && aiCrop) {
        // On-device `out` is already complete; a hung LLM upstream (Wi-Fi→cellular
        // handoff, black-holed TCP) must not freeze the analyzing overlay forever.
        // Cap at 8s like /report and fall through to the on-device result.
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        try {
          const resp = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: aiCrop.dataUrl }),
            signal: controller.signal,
          });
          if (resp.ok) {
            const v = await resp.json();
            if (v?.ok) final = mergeVisionAnalysis(out, v);
          }
        } catch {
          /* Timed out or failed — keep on-device result. */
        } finally {
          window.clearTimeout(timeout);
        }
      }

      setCaptureMeta({
        schemaVersion: "2026-06-29.label.v2",
        participantId: session?.participantId,
        sessionId: session?.sessionId,
        round: session?.round,
        deviceId: session?.deviceId,
        reviewerId: session?.reviewerId,
        scanIndex: labelCount() + 1,
        captureMode,
        quality: qualityMeta(verifiedQuality),
        consentVersion: CONSENT_VERSION,
        consentEventIds: {
          aiAnalysis: aiAllowed && aiEvent?.granted ? aiEvent.id : undefined,
          learningCrop: cropAllowed && cropEvent?.granted ? cropEvent.id : undefined,
        },
        predictionSource: final.source,
        modelVersion: final.source === "ml-model" && mlPrediction?.modelVersion ? mlPrediction.modelVersion : VISIBLE_MODEL_CONTRACT.fallbackVersion,
        inputSchemaVersion: mlPrediction?.inputSchemaVersion ?? VISIBLE_MODEL_CONTRACT.inputSchemaVersion,
        analysisConfidence: final.confidence,
        retakeRecommended: final.retakeRecommended,
        burst: final.burst,
        initialPrediction: predictionSnapshot(out),
        finalPrediction: predictionSnapshot(final),
      });

      await advanceStep(4);
      // Persist immediately so /survey, /report, and /studio all see this scan
      // even if the user navigates without tapping the recommendation CTA.
      // Best-effort: a blocked/full store must NOT abort the success path below —
      // otherwise a completed scan would be mislabeled as an analysis failure.
      try {
        sessionStorage.setItem(
          DEVICE_DATA_KEY.scan,
          JSON.stringify({
            oil: final.oil.level,
            redness: final.redness.level,
            pores: final.pores.level,
            confidence: final.confidence,
            retakeRecommended: final.retakeRecommended,
            source: final.source,
          })
        );
        sessionStorage.setItem(DEVICE_DATA_KEY.reads, JSON.stringify(final));
      } catch {
        /* result still renders from in-memory `final` below */
      }
      recordFunnelEvent("scan_completed", { retake: final.retakeRecommended, source: final.source });
      pushScanHistory({ oil: final.oil.level, redness: final.redness.level, pores: final.pores.level, confidence: final.confidence, ts: Date.now() });
      setReads(final);
      stopCamera();
      setPhase("result");
    } catch (e) {
      console.error(e);
      autoHoldUntilRef.current = performance.now() + 4000;
      setErr(t("분석 중 문제가 생겼어요. 다시 시도해 주세요."));
      setPhase("ready");
    } finally {
      captureLockRef.current = false;
    }
  }
  useEffect(() => {
    captureRef.current = capture;
  });

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

  function toggleAutoCapture(next: boolean) {
    autoCaptureRef.current = next;
    setAutoCapture(next);
    passStreakRef.current = 0;
    setCountdownSafe(null);
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
        <p style={eyebrow}>ARU skin scan</p>
        <FlowSteps current="scan" />
        <h1 style={titleStyle}>{t("얼굴 톤과 피부 결이 잘 보이게 찍어볼게요")}</h1>
        <p style={leadStyle}>{t("가이드에 얼굴을 맞추면 조건이 갖춰졌을 때 저절로 찍혀요.")}</p>

        {phase !== "result" && (
          <div style={cameraFrame}>
            <video
              ref={videoRef}
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
                <a href="/survey" style={ghostLink}>{t("사진 없이 추천받기")}</a>
              </div>
            )}
            {phase === "init" && (
              <Center>
                <div style={{ maxWidth: 320, background: "rgba(0,0,0,.58)", borderRadius: 14, padding: "20px 18px" }}>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: 25, color: "#fff", marginBottom: 12 }}>{t("30초 피부 스캔, 시작할까요?")}</p>
                  <div style={{ display: "grid", gap: 9, marginBottom: 16, textAlign: "left" }}>
                    {[
                      ["📷", "가이드에 얼굴을 맞추면 조건이 갖춰졌을 때 자동으로 찍혀요."],
                      ["🔒", "기본 스캔은 기기 안에서만 처리 — 사진은 전송·저장되지 않아요."],
                      ["✨", "T존·양볼의 유분·붉은기·결을 여러 프레임으로 읽어요."],
                    ].map(([icon, text]) => (
                      <div key={text} style={{ display: "flex", gap: 9, alignItems: "flex-start", color: "rgba(255,255,255,.94)", fontSize: 13, lineHeight: 1.45 }}>
                        <span aria-hidden style={{ flexShrink: 0 }}>{icon}</span>
                        <span>{t(text)}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={startCamera} style={{ ...primaryBtn, width: "100%" }}>{t("카메라 시작")}</button>
                  <a href="/survey" style={{ display: "block", textAlign: "center", marginTop: 11, fontSize: 13, color: "rgba(255,255,255,.85)", textDecoration: "underline" }}>
                    {t("카메라 없이 설문만")}
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
                <span style={{ fontFamily: "var(--font-display)", fontSize: 21, color: "#fff", textShadow: "0 1px 10px rgba(0,0,0,.55)" }}>{t("그대로 계세요")}</span>
              </div>
            )}
            {phase === "denied" && (
              <Center>
                <p style={fallbackText}>
                  {deniedReason === "busy"
                    ? t("카메라를 다른 앱이 사용 중이에요. 다른 앱을 닫고 다시 시도해 주세요.")
                    : deniedReason === "notfound"
                      ? t("연결된 카메라를 찾지 못했어요.")
                      : t("카메라 권한이 필요해요.")}
                </p>
                <button onClick={() => void startCamera()} style={primaryBtn}>{t("다시 시도")}</button>
                <a href="/survey" style={ghostLink}>{t("사진 없이 추천받기")}</a>
              </Center>
            )}
            {phase === "noface" && (
              <Center>
                <p style={fallbackText}>{t("얼굴을 읽지 못했어요.")}<br />{t("밝은 곳에서 정면으로 다시 찍어주세요.")}</p>
                <button onClick={() => setPhase("ready")} style={primaryBtn}>{t("다시 시도")}</button>
                <a href="/survey" style={ghostLink}>{t("사진 없이 추천받기")}</a>
              </Center>
            )}
            {phase === "unsupported" && (
              <Center>
                <p style={fallbackText}>{t("이 브라우저에서는 카메라를 사용할 수 없어요.")}</p>
                <a href="/survey" style={ghostLink}>{t("사진 없이 추천받기")}</a>
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
                {reads.retakeRecommended ? t("설문으로 이어가기") : t("추천 받기")}
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
              {shareCopied ? t("링크가 복사됐어요! 붙여넣기만 하면 초대 완료") : t("친구에게 내 피부 무드 공유하기")}
            </button>
            <p role="status" aria-live="polite" style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 6 }}>
              {t("공유 링크를 열면 친구도 30초 스캔으로 이어져요")}
            </p>
            {shareErr && <p role="alert" style={{ fontSize: 12.5, color: "var(--plum-press)", textAlign: "center", marginTop: 8 }}>{shareErr}</p>}
            <a href="/studio" style={{ display: "block", textAlign: "center", marginTop: 12, fontSize: 13, color: "var(--text-muted)", textDecoration: "underline" }}>
              {t("카드 문구 직접 편집하기")}
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
