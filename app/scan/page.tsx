"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONSENT_VERSION, latestConsent, recordConsentEvent } from "@/lib/consent";
import { saveCropSample, cropSampleCount, exportCropSamples } from "@/lib/crops";
import {
  analyzeSkinBurst,
  classifyVisibleAttributes,
  SAMPLING_LANDMARKS,
  SKIN_LABELS,
  VISIBLE_MODEL_CONTRACT,
  type AnalysisSource,
  type SkinAttr,
  type SkinLevel,
  type SkinReads,
} from "@/lib/skin";
import { exportLabels, labelCount, saveLabel, SCALES, toOrdinal, type Attr, type CaptureQualityMeta, type SampleMeta } from "@/lib/labels";
import { getCurrentPilotSession } from "@/lib/pilot";
import { FlowSteps } from "@/app/components/flow-steps";
import { Xiaohei } from "@/app/components/sketch";
import { InfoSheet } from "./info-sheet";
import {
  cameraFrame,
  confidenceBox,
  consentStyle,
  debugStyle,
  eyebrow,
  fallbackText,
  feedBtn,
  ghostLink,
  infoLinkBtn,
  leadStyle,
  modeButtonStyle,
  modePanelStyle,
  outlineBtn,
  primaryBtn,
  resultCardStyle,
  stepBtn,
  titleStyle,
  videoStyle,
} from "./scan-styles";

type Phase = "init" | "ready" | "analyzing" | "result" | "noface" | "denied" | "unsupported";
type Landmark = { x: number; y: number; z?: number };
type FaceLandmarker = {
  detectForVideo: (source: HTMLVideoElement | HTMLCanvasElement, timestampMs: number) => { faceLandmarks?: Landmark[][] };
  close?: () => void;
};
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
  centerOffsetX?: number;
  centerOffsetY?: number;
  faceSize?: number;
  brightnessMean?: number;
  darkRatio?: number;
  hotRatio?: number;
  movement?: number;
  rejectReason?: string;
};

type ZoneRect = { left: number; top: number; width: number; height: number };
type GuideZones = {
  tzone: ZoneRect;
  leftCheek: ZoneRect;
  rightCheek: ZoneRect;
  contour: Array<{ x: number; y: number }>;
};

type VisionAnalysis = {
  labels?: Partial<Record<SkinAttr, SkinLevel>>;
  confidence?: Partial<Record<SkinAttr, number>>;
  narrative?: string;
  source?: string;
};

const ATTRS: SkinAttr[] = ["oil", "redness", "pores"];

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

const ANALYSIS_STEPS = ["촬영 프레임 정합", "T존·양볼 신호 추출", "유분·붉은기·결 판정", "신뢰도 교차 검증"];

// A light face outline (subset of the MediaPipe face-oval indices) for the
// tracking dots — enough to read as "locked on", without a dense mesh.
const FACE_CONTOUR = [10, 297, 284, 389, 454, 361, 397, 379, 152, 150, 172, 132, 234, 162, 54, 67];

const CAPTURE_MODES: CaptureMode[] = ["balanced", "texture", "tone"];
const CAPTURE_PROFILES: Record<CaptureMode, CaptureProfile> = {
  balanced: {
    label: "균형",
    hint: "윤곽, 톤, 피부결을 함께 보는 기본 촬영입니다.",
    // Tolerances/size are fractions of the VISIBLE frame; widened so normal
    // selfie framing passes on portrait (9:16) phone streams, not only on
    // landscape desktop webcams (v0.5.1 gates were desktop-tuned → 중앙·거리
    // unreachable on phones). Burst median + retake still guard real quality.
    centerToleranceX: 0.2,
    centerToleranceY: 0.22,
    minFaceSize: 0.3,
    maxFaceSize: 0.9,
    minBrightness: 72,
    maxDarkRatio: 0.4,
    maxHotRatio: 0.1,
    maxMovement: 0.05,
    requiresSteady: false,
  },
  texture: {
    label: "피부결",
    hint: "모공과 결을 보려고 조금 더 가까이, 더 흔들림 없이 촬영합니다.",
    centerToleranceX: 0.16,
    centerToleranceY: 0.18,
    minFaceSize: 0.34,
    maxFaceSize: 0.9,
    minBrightness: 80,
    maxDarkRatio: 0.32,
    maxHotRatio: 0.065,
    maxMovement: 0.03,
    requiresSteady: true,
  },
  tone: {
    label: "피부톤",
    hint: "톤과 붉은기를 보기 위해 더 부드러운 빛, 더 적은 반사가 필요해요.",
    centerToleranceX: 0.2,
    centerToleranceY: 0.22,
    minFaceSize: 0.3,
    maxFaceSize: 0.9,
    minBrightness: 82,
    maxDarkRatio: 0.32,
    maxHotRatio: 0.06,
    maxMovement: 0.045,
    requiresSteady: false,
  },
};

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
  const autoCaptureRef = useRef(true);
  const disposedRef = useRef(false);
  const prevQualityKeyRef = useRef("");
  const captureRef = useRef<(() => Promise<void>) | null>(null);

  const [phase, setPhase] = useState<Phase>("init");
  const [reads, setReads] = useState<SkinReads | null>(null);
  const [err, setErr] = useState("");
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
  }, []);

  // Auto-capture no longer requires centered/distance-in-a-tight-range — those
  // depend on the fragile aspect-ratio transform and blocked real phone
  // framing. It needs a face, a non-tiny face (raw distance), and good light.
  const canCapture =
    phase === "ready" &&
    quality.face &&
    quality.distance &&
    quality.brightness &&
    quality.noGlare &&
    (!captureProfile.requiresSteady || quality.steady);

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
      if (disposedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
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

  const ensureLandmarker = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const create = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
      });
    if (forceCpuRef.current) {
      // A prior GPU run emitted corrupt (non-normalized) landmarks on this
      // device — CPU delegate is slower but always correct.
      landmarkerRef.current = await create("CPU");
      return landmarkerRef.current;
    }
    try {
      landmarkerRef.current = await create("GPU");
    } catch {
      // Some mobile GPUs fail delegate init — CPU is slower but always works.
      landmarkerRef.current = await create("CPU");
    }
    return landmarkerRef.current;
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
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

  const measureQuality = useCallback(
    async (landmarker: FaceLandmarker) => {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) return;

      // VIDEO running mode tracks temporally and reads the element directly —
      // the downscaled canvas below is only needed for exposure statistics.
      const res = landmarker.detectForVideo(video, performance.now());
      const face = res.faceLandmarks?.[0];
      if (!face?.length) {
        lastCenterRef.current = null;
        setZones(null);
        commitQuality({ ...initialQuality, message: "얼굴이 보이지 않아요. 정면을 향해주세요." });
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
      if (!forceCpuRef.current && (!Number.isFinite(box.maxX) || box.maxX > 1.5 || box.minX < -0.5 || box.maxY > 1.5 || box.minY < -0.5)) {
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
      const rawSize = Math.max(box.maxX - box.minX, box.maxY - box.minY);
      const distance = rawSize > 0.2 && rawSize < 0.98;

      // Centering stays ADVISORY only (landmark ROIs analyze off-center faces
      // fine), so it never blocks auto-capture.
      const { fx, fy } = coverCropFractions(video.videoWidth, video.videoHeight);
      const visCenterX = (centerX - (1 - fx) / 2) / fx;
      const visCenterY = (centerY - (1 - fy) / 2) / fy;
      const centered = Math.abs(visCenterX - 0.5) < 0.28 && Math.abs(visCenterY - 0.48) < 0.3;

      const exposure = exposureStats(frame.ctx.getImageData(0, 0, frame.w, frame.h), box);
      const brightness = exposure.mean > profile.minBrightness && exposure.darkRatio < profile.maxDarkRatio;
      const noGlare = exposure.hotRatio < profile.maxHotRatio;

      const now = performance.now();
      const last = lastCenterRef.current;
      const movement = last ? Math.hypot(centerX - last.x, centerY - last.y) / Math.max(1, (now - last.t) / 250) : 0;
      lastCenterRef.current = { x: centerX, y: centerY, t: now };
      const steady = !last || movement < profile.maxMovement;

      const pass = distance && brightness && noGlare && (!profile.requiresSteady || steady);
      const score = 1 + (distance ? 1 : 0) + (brightness ? 1 : 0) + (noGlare ? 1 : 0) + (steady ? 1 : 0) + (centered ? 1 : 0);
      const message = !distance
        ? rawSize <= 0.2
          ? "얼굴이 작게 보여요. 조금 더 가까이 와주세요."
          : "너무 가까워요. 살짝 물러나 주세요."
        : !brightness
          ? "빛이 부족해요. 창가처럼 밝고 부드러운 곳이 좋아요."
          : !noGlare
            ? "반사가 강해요. 정면 조명이나 번들거림을 줄여주세요."
            : !steady
              ? "잠깐만 멈춰주세요. 피부 결은 흔들림에 약해요."
              : "좋아요. 그대로 계세요.";

      commitQuality({ face: true, centered, distance, brightness, noGlare, steady, score, message });
      handleAutoTick(pass);
      setZones(computeGuideZones(face, video.videoWidth, video.videoHeight));
      if (debugRef.current) {
        setDebugInfo({
          "delegate": forceCpuRef.current ? "CPU" : "GPU",
          "video": `${video.videoWidth}x${video.videoHeight}`,
          "ratio": Number((video.videoWidth / video.videoHeight).toFixed(3)),
          "fx/fy": `${fx.toFixed(2)}/${fy.toFixed(2)}`,
          "rawSize": Number(rawSize.toFixed(3)),
          "box cx/cy": `${centerX.toFixed(2)}/${centerY.toFixed(2)}`,
          "vis cx/cy": `${visCenterX.toFixed(2)}/${visCenterY.toFixed(2)}`,
          "mean/dark/hot": `${Math.round(exposure.mean)}/${exposure.darkRatio.toFixed(2)}/${exposure.hotRatio.toFixed(3)}`,
          "distance": distance,
          "brightness": brightness,
          "noGlare": noGlare,
          "steady": steady,
          "centered(adv)": centered,
          "AUTO PASS": pass,
        });
      }
    },
    [captureMode, commitQuality, handleAutoTick, readFrame]
  );

  useEffect(() => {
    if (phase !== "ready") return;
    let mounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuideState("loading");
    ensureLandmarker()
      .then((landmarker) => {
        if (!mounted) return;
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
    if (!video) return;
    setCountdownSafe(null);
    passStreakRef.current = 0;
    setPhase("analyzing");
    setAnalysisStep(0);
    setErr("");
    setCropDataUrl(null);

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
      if (!faces.length) {
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
        last && dtMs >= 80 ? Math.hypot(captureCenter.x - last.x, captureCenter.y - last.y) / (dtMs / 250) : undefined;
      const captureSteady =
        captureMovement !== undefined ? captureMovement < CAPTURE_PROFILES[captureMode].maxMovement : quality.steady;
      const verifiedQuality: Quality = {
        ...evaluateCapturedQuality(imageData, faces[0], CAPTURE_PROFILES[captureMode], captureSteady),
        movement: captureMovement,
      };
      commitQuality(verifiedQuality, true);
      if (!qualityPassed(verifiedQuality, CAPTURE_PROFILES[captureMode])) {
        autoHoldUntilRef.current = performance.now() + 4000;
        setErr("촬영 순간 품질이 흔들렸어요. 얼굴을 윤곽선에 맞추고 다시 찍어주세요.");
        setPhase("ready");
        return;
      }

      // Crops come from this verified first frame (canvas still holds it).
      const faceCrop = consent || datasetConsent ? cropFace(canvas, faces[0]) : null;
      const modelCrop = process.env.NEXT_PUBLIC_VISIBLE_ATTR_MODEL === "on" ? cropFaceImageData(canvas, faces[0]) : null;
      setCropDataUrl(staffMode && datasetConsent ? faceCrop : null);

      // Burst: two extra frames ~140ms apart; the per-feature median suppresses
      // one-frame glare/motion spikes, and cross-frame agreement feeds the
      // confidence/retake decision (recorded in labels for ML calibration).
      const burstFrames: Array<{ imageData: ImageData; landmarks: Landmark[] }> = [{ imageData, landmarks: faces[0] }];
      for (let i = 1; i < 3; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 140));
        ctx.drawImage(video, 0, 0, w, h);
        const extra = landmarker.detectForVideo(canvas, performance.now()).faceLandmarks?.[0];
        if (extra?.length) burstFrames.push({ imageData: ctx.getImageData(0, 0, w, h), landmarks: extra });
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
      if (consent && faceCrop) {
        try {
          const resp = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: faceCrop }),
          });
          if (resp.ok) {
            const v = await resp.json();
            if (v?.ok) final = mergeVisionAnalysis(out, v);
          }
        } catch {
          /* Keep on-device result. */
        }
      }

      const session = getCurrentPilotSession();
      const scope = session ? { participantId: session.participantId, sessionId: session.sessionId } : undefined;
      const aiEvent = latestConsent("ai_analysis", scope) ?? (scope ? latestConsent("ai_analysis") : null);
      const cropEvent = latestConsent("learning_crop", scope) ?? (scope ? latestConsent("learning_crop") : null);
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
          aiAnalysis: consent && aiEvent?.granted ? aiEvent.id : undefined,
          learningCrop: datasetConsent && cropEvent?.granted ? cropEvent.id : undefined,
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
      sessionStorage.setItem(
        "gyeol_scan",
        JSON.stringify({
          oil: final.oil.level,
          redness: final.redness.level,
          pores: final.pores.level,
          confidence: final.confidence,
          retakeRecommended: final.retakeRecommended,
          source: final.source,
        })
      );
      sessionStorage.setItem("gyeol_reads", JSON.stringify(final));
      setReads(final);
      stopCamera();
      setPhase("result");
    } catch (e) {
      console.error(e);
      autoHoldUntilRef.current = performance.now() + 4000;
      setErr("분석 중 문제가 생겼어요. 다시 시도해 주세요.");
      setPhase("ready");
    }
  }
  useEffect(() => {
    captureRef.current = capture;
  });

  function reset() {
    setReads(null);
    void startCamera();
  }

  function toggleAutoCapture(next: boolean) {
    autoCaptureRef.current = next;
    setAutoCapture(next);
    passStreakRef.current = 0;
    setCountdownSafe(null);
  }

  function toggleAiConsent(next: boolean) {
    setConsent(next);
    const session = getCurrentPilotSession();
    recordConsentEvent("ai_analysis", next, session ? { participantId: session.participantId, sessionId: session.sessionId } : undefined);
  }

  function toggleDatasetConsent(next: boolean) {
    setDatasetConsent(next);
    const session = getCurrentPilotSession();
    recordConsentEvent("learning_crop", next, session ? { participantId: session.participantId, sessionId: session.sessionId } : undefined);
  }

  return (
    <main className="px-5 py-9" style={{ background: "var(--paper)", minHeight: "100dvh" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <p style={eyebrow}>ARU skin scan</p>
        <FlowSteps current="scan" />
        <h1 style={titleStyle}>얼굴 톤과 피부 결이 잘 보이게 찍어볼게요</h1>
        <p style={leadStyle}>가이드에 얼굴을 맞추면 조건이 갖춰졌을 때 저절로 찍혀요.</p>

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
                <p style={{ fontFamily: "var(--font-hand)", fontSize: 20, color: "var(--ink)" }}>얼굴 가이드 불러오는 중…</p>
              </div>
            )}
            {phase === "ready" && guideState === "failed" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24, textAlign: "center", background: "rgba(255,255,255,.92)" }}>
                <p style={fallbackText}>얼굴 가이드를 불러오지 못했어요.<br />네트워크를 확인하고 다시 시도해 주세요.</p>
                <button onClick={retryGuide} style={primaryBtn}>다시 시도</button>
                <a href="/survey" style={ghostLink}>사진 없이 추천받기</a>
              </div>
            )}
            {phase === "init" && (
              <Center>
                <button onClick={startCamera} style={primaryBtn}>카메라 시작</button>
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
                <span style={{ fontFamily: "var(--font-hand)", fontSize: 96, lineHeight: 1, color: "#fff", textShadow: "0 2px 18px rgba(0,0,0,.5)" }}>{countdown}</span>
                <span style={{ fontFamily: "var(--font-hand)", fontSize: 21, color: "#fff", textShadow: "0 1px 10px rgba(0,0,0,.55)" }}>그대로 계세요</span>
              </div>
            )}
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
            {staffMode && <ScanModePicker mode={captureMode} onChange={setCaptureMode} />}
            <QualityPanel quality={quality} requireSteady={captureProfile.requiresSteady} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10 }}>
              <label style={{ ...consentStyle, marginTop: 0 }}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => toggleAiConsent(e.target.checked)}
                  style={{ accentColor: "var(--blue)", width: 16, height: 16 }}
                />
                <span>AI 분석 전송 <span style={{ color: "var(--text-muted)" }}>선택</span></span>
              </label>
              <label style={{ ...consentStyle, marginTop: 0 }}>
                <input
                  type="checkbox"
                  checked={autoCapture}
                  onChange={(e) => toggleAutoCapture(e.target.checked)}
                  style={{ accentColor: "var(--ink)", width: 16, height: 16 }}
                />
                <span>자동 촬영</span>
              </label>
            </div>
            {staffMode && (
              <label style={consentStyle}>
                <input
                  type="checkbox"
                  checked={datasetConsent}
                  onChange={(e) => toggleDatasetConsent(e.target.checked)}
                  style={{ accentColor: "var(--blue)", width: 16, height: 16 }}
                />
                <span>연구용: 학습 크롭 저장 <span style={{ color: "var(--text-muted)" }}>동의한 파일만 이 기기에 최대 120개 보관돼요</span></span>
              </label>
            )}
            <button type="button" onClick={() => setInfoOpen(true)} style={infoLinkBtn}>
              촬영 팁 · 동의 안내 보기
            </button>
          </>
        )}

        {(phase === "ready" || phase === "analyzing") && (
          <div style={{ position: "sticky", bottom: 0, zIndex: 5, background: "var(--paper)", padding: "10px 0 8px", marginTop: 6 }}>
            <button
              onClick={capture}
              disabled={phase === "analyzing" || !canCapture}
              style={{
                ...primaryBtn,
                width: "100%",
                opacity: phase === "analyzing" || !canCapture ? 0.58 : 1,
                cursor: phase === "analyzing" || !canCapture ? "default" : "pointer",
              }}
            >
              {phase === "analyzing" ? "분석 중..." : countdown !== null ? `자동 촬영 ${countdown}` : guideState !== "ready" ? "가이드 준비 중…" : canCapture ? "지금 촬영하기" : "얼굴을 가이드에 맞춰주세요"}
            </button>
          </div>
        )}

        {err && <p style={{ color: "var(--plum)", fontSize: 13, marginTop: 10 }}>{err}</p>}

        {infoOpen && <InfoSheet staffMode={staffMode} onClose={() => setInfoOpen(false)} />}

        {phase === "result" && reads && (
          <>
            <ResultCard reads={reads} />
            <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", margin: "14px 0 4px" }}>
              * 조명, 각도, 메이크업에 따라 달라질 수 있는 참고용 분석이에요.
            </p>
            {staffMode && getCurrentPilotSession() && (
              <details style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
                <summary style={{ cursor: "pointer", textAlign: "center" }}>디버그 신호 보기</summary>
                <pre style={debugStyle}>
{`shine = ${reads.raw.shine.toFixed(3)} -> ${reads.oil.value}
relRedness = ${reads.raw.relRedness.toFixed(4)} -> ${reads.redness.value}
texture = ${reads.raw.cov.toFixed(3)} -> ${reads.pores.value}
tzoneL / cheekL = ${reads.raw.tzoneL.toFixed(0)} / ${reads.raw.cheekL.toFixed(0)}`}
                </pre>
              </details>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={reset} style={{ ...(reads.retakeRecommended ? primaryBtn : outlineBtn), flex: 1 }}>다시 찍기</button>
              <a
                href="/survey"
                style={{ ...(reads.retakeRecommended ? outlineBtn : primaryBtn), flex: 1, textAlign: "center", textDecoration: "none" }}
              >
                {reads.retakeRecommended ? "설문으로 이어가기" : "추천 받기"}
              </a>
            </div>
            <a href="/studio" style={{ display: "block", textAlign: "center", marginTop: 12, fontSize: 13, color: "var(--text-muted)", textDecoration: "underline" }}>
              결과를 카드로 만들어 공유하기
            </a>
            {staffMode && <Feedback reads={reads} cropDataUrl={cropDataUrl} captureMeta={captureMeta} />}
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

function CameraGuide({ quality, mode, zones }: { quality: Quality; mode: CaptureMode; zones: GuideZones | null }) {
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
// first, then mirrored to match the CSS-mirrored preview.
const FRAME_RATIO = 3 / 4;

// Visible fraction of a stream shown with object-fit:cover inside the 3:4
// frame. Shared by the live gate, capture verification, and the zone overlay
// so the three stay in lockstep.
function coverCropFractions(width: number, height: number): { fx: number; fy: number } {
  const ratio = width > 0 && height > 0 ? width / height : FRAME_RATIO;
  return { fx: Math.min(1, FRAME_RATIO / ratio), fy: Math.min(1, ratio / FRAME_RATIO) };
}

type GuidePoint = { x: number; y: number };

function zoneFromPoints(points: GuidePoint[], padX: number, padY: number): ZoneRect | null {
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
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;
  const round = (value: number) => Math.round(value * 1000) / 10;
  return { left: round(1 - maxX), top: round(minY), width: round(maxX - minX), height: round(maxY - minY) };
}

function computeGuideZones(landmarks: Landmark[], videoWidth: number, videoHeight: number): GuideZones | null {
  const { fx, fy } = coverCropFractions(videoWidth, videoHeight);
  const mapPoint = (lm: Landmark): GuidePoint => ({ x: (lm.x - (1 - fx) / 2) / fx, y: (lm.y - (1 - fy) / 2) / fy });
  const pointsFor = (indices: number[]) =>
    indices
      .map((index) => landmarks[index])
      .filter((lm): lm is Landmark => Boolean(lm))
      .map(mapPoint);

  const cheekPoints = pointsFor(SAMPLING_LANDMARKS.cheeks);
  if (!cheekPoints.length) return null;
  const centerX = cheekPoints.reduce((sum, point) => sum + point.x, 0) / cheekPoints.length;
  const sideA = cheekPoints.filter((point) => point.x < centerX);
  const sideB = cheekPoints.filter((point) => point.x >= centerX);

  const tzone = zoneFromPoints(pointsFor(SAMPLING_LANDMARKS.tzone), 0.015, 0.02);
  const zoneA = zoneFromPoints(sideA, 0.015, 0.015);
  const zoneB = zoneFromPoints(sideB, 0.015, 0.015);
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

function QualityPanel({ quality, requireSteady }: { quality: Quality; requireSteady: boolean }) {
  const checks = useMemo(() => {
    // Only the actual auto-capture requirements (centering is advisory).
    const base: Array<[string, boolean]> = [
      ["얼굴", quality.face],
      ["거리", quality.distance],
      ["밝기", quality.brightness],
      ["반사 없음", quality.noGlare],
    ];
    if (requireSteady) base.push(["흔들림 없음", quality.steady]);
    return base;
  }, [quality, requireSteady]);
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

function ResultCard({ reads }: { reads: SkinReads }) {
  const confidencePct = Math.round(reads.confidence * 100);
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
      <div style={confidenceBox(reads.retakeRecommended)}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: reads.retakeRecommended ? "var(--plum-press)" : "var(--success)" }}>
            분석 신뢰도 {reads.confidenceLabel}
          </span>
          <span style={{ fontFeatureSettings: '"tnum"', fontSize: 18, fontWeight: 900, color: "var(--ink)" }}>{confidencePct}%</span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.5, marginTop: 6 }}>
          {reads.retakeRecommended
            ? "이 결과는 추천에서 참고만 하고, 설문 답변을 더 크게 반영할게요."
            : "촬영 품질이 충분해서 추천 기준에 스캔 신호를 함께 반영할게요."}
        </p>
        {reads.retakeReasons.length > 0 && (
          <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
            {reads.retakeReasons.map((reason) => (
              <span key={reason} style={{ fontSize: 12, color: "var(--plum-press)" }}>{reason}</span>
            ))}
          </div>
        )}
      </div>
      <div style={{ borderTop: "1px solid var(--line)" }}>
        {rows.map((row, index) => (
          <div
            key={row.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              padding: "13px 0",
              borderBottom: "1px solid var(--line)",
              animation: "gyeol-fade-up .45s ease-out both",
              animationDelay: `${160 + index * 110}ms`,
            }}
          >
            <span style={{ fontSize: 14, color: "var(--ink)" }}>{row.label}</span>
            <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: row.calm ? "var(--text-muted)" : "var(--plum)" }}>{row.value}</span>
          </div>
        ))}
      </div>
      {reads.extras && reads.extras.length > 0 && (
        <div>
          {reads.extras.map((extra, index) => (
            <div
              key={extra.label}
              style={{
                padding: "12px 0",
                borderBottom: "1px solid var(--line)",
                animation: "gyeol-fade-up .45s ease-out both",
                animationDelay: `${620 + index * 110}ms`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 14, color: "var(--ink)" }}>{extra.label}</span>
                <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: extra.calm ? "var(--text-muted)" : "var(--plum)" }}>{extra.value}</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{extra.note}</p>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 14, animation: "gyeol-fade-up .45s ease-out both", animationDelay: "880ms" }}>
        <p style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700, marginBottom: 6 }}>측정 환경</p>
        <div style={{ display: "grid", gap: 4 }}>
          {reads.signals.map((signal) => (
            <div key={signal.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-muted)" }}>
              <span style={{ width: 12, textAlign: "center", color: signal.ok ? "var(--success)" : "var(--plum)" }}>{signal.ok ? "✓" : "!"}</span>
              <span>{signal.label} · {signal.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Feedback({ reads, cropDataUrl, captureMeta }: { reads: SkinReads; cropDataUrl: string | null; captureMeta: SampleMeta | null }) {
  const init = {
    oil: toOrdinal("oil", reads.oil.value),
    redness: toOrdinal("redness", reads.redness.value),
    pores: toOrdinal("pores", reads.pores.value),
  };
  const [stage, setStage] = useState<"ask" | "correcting" | "done">("ask");
  const [labels, setLabels] = useState(init);
  const [troubleSeen, setTroubleSeen] = useState(false);
  const [count, setCount] = useState(() => labelCount());
  const [cropCount, setCropCount] = useState(() => cropSampleCount());

  function commit(source: "confirmed" | "corrected", finalLabels: typeof init) {
    const meta: SampleMeta | undefined = captureMeta
      ? {
          ...captureMeta,
          labelConfidence: source === "confirmed" ? (reads.retakeRecommended ? "low" : "medium") : "high",
          correctionFlags: source === "corrected"
            ? {
                oil: finalLabels.oil !== init.oil,
                redness: finalLabels.redness !== init.redness,
                pores: finalLabels.pores !== init.pores,
              }
            : undefined,
          ungradable: reads.retakeRecommended && source === "confirmed",
          observations: troubleSeen ? { troubleSeen: true } : undefined,
        }
      : undefined;
    const sample = { ts: Date.now(), features: reads.raw, labels: finalLabels, source, meta };
    saveLabel(sample);
    if (cropDataUrl) {
      saveCropSample({ image: cropDataUrl, features: reads.raw, labels: finalLabels, source, meta, ts: sample.ts });
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

      {stage !== "done" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={troubleSeen}
            onChange={(e) => setTroubleSeen(e.target.checked)}
            style={{ accentColor: "var(--ink)", width: 15, height: 15 }}
          />
          <span>트러블 흔적도 보였어요 <span style={{ color: "var(--faint)" }}>선택 · 관찰 기록용</span></span>
        </label>
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

function Scanning({ step }: { step: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.22)" }} />
      <div style={{ position: "absolute", left: "8%", right: "8%", height: 2, background: "var(--blue)", animation: "gyeol-scan 1.1s ease-in-out infinite" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 14 }}>
        <div style={{ background: "rgba(255,255,255,.95)", border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "11px 16px 12px", minWidth: 230 }}>
          <p style={{ fontFamily: "var(--font-hand)", fontSize: 19, color: "var(--ink)", margin: "0 0 7px" }}>피부 신호를 읽는 중</p>
          <div style={{ height: 2, background: "var(--line)", borderRadius: 2, overflow: "hidden", margin: "0 0 8px" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (step / ANALYSIS_STEPS.length) * 100)}%`, background: "var(--blue)", transition: "width .5s ease" }} />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {ANALYSIS_STEPS.map((label, index) => {
              const done = index < step;
              const active = index === step;
              return (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: 11.5,
                    color: done ? "var(--success)" : active ? "var(--ink)" : "var(--muted)",
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  <span style={{ width: 12, textAlign: "center", animation: active ? "gyeol-bob 1.1s ease-in-out infinite" : undefined }}>
                    {done ? "✓" : active ? "●" : "○"}
                  </span>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function faceBox(landmarks: Landmark[]) {
  // Plain loop, not reduce — this runs on every quality tick and 4x per
  // capture over ~478 landmarks; reduce allocated a throwaway object per point.
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function evaluateCapturedQuality(imageData: ImageData, landmarks: Landmark[], profile: CaptureProfile, previousSteady: boolean): Quality {
  const box = faceBox(landmarks);
  const centerX = (box.minX + box.maxX) / 2;
  const centerY = (box.minY + box.maxY) / 2;
  // Match the live gate: raw aspect-independent distance, centering advisory.
  const { fx, fy } = coverCropFractions(imageData.width, imageData.height);
  const centerOffsetX = (centerX - (1 - fx) / 2) / fx - 0.5;
  const centerOffsetY = (centerY - (1 - fy) / 2) / fy - 0.48;
  const rawSize = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  const faceSize = rawSize;
  const exposure = exposureStats(imageData, box);
  const centered = Math.abs(centerOffsetX) < 0.28 && Math.abs(centerOffsetY) < 0.3;
  const distance = rawSize > 0.2 && rawSize < 0.98;
  const brightness = exposure.mean > profile.minBrightness && exposure.darkRatio < profile.maxDarkRatio;
  const noGlare = exposure.hotRatio < profile.maxHotRatio;
  const steady = profile.requiresSteady ? previousSteady : true;
  const rejectReason = !distance
    ? "distance"
    : !brightness
      ? "brightness"
      : !noGlare
        ? "glare"
        : !steady
          ? "movement"
          : undefined;
  return {
    face: true,
    centered,
    distance,
    brightness,
    noGlare,
    steady,
    score: 1 + (distance ? 1 : 0) + (brightness ? 1 : 0) + (noGlare ? 1 : 0) + (steady ? 1 : 0) + (centered ? 1 : 0),
    message: rejectReason ? "촬영 품질을 다시 맞춰주세요." : "촬영 품질이 확인됐어요.",
    centerOffsetX,
    centerOffsetY,
    faceSize,
    brightnessMean: exposure.mean,
    darkRatio: exposure.darkRatio,
    hotRatio: exposure.hotRatio,
    rejectReason,
  };
}

function qualityPassed(quality: Quality, profile: CaptureProfile) {
  // Centering is advisory, not required (see canCapture / measureQuality).
  return quality.face && quality.distance && quality.brightness && quality.noGlare && (!profile.requiresSteady || quality.steady);
}

function qualityMeta(quality: Quality): CaptureQualityMeta {
  return {
    version: "2026-06-29.quality.v1",
    score: quality.score,
    face: quality.face,
    centered: quality.centered,
    distance: quality.distance,
    brightness: quality.brightness,
    noGlare: quality.noGlare,
    steady: quality.steady,
    centerOffsetX: quality.centerOffsetX,
    centerOffsetY: quality.centerOffsetY,
    faceSize: quality.faceSize,
    brightnessMean: quality.brightnessMean,
    darkRatio: quality.darkRatio,
    hotRatio: quality.hotRatio,
    movement: quality.movement,
    rejectReason: quality.rejectReason,
  };
}

function exposureStats(imageData: ImageData, box?: ReturnType<typeof faceBox>) {
  const { data, width, height } = imageData;
  const xStart = box ? Math.max(0, Math.floor(box.minX * width)) : 0;
  const xEnd = box ? Math.min(width, Math.ceil(box.maxX * width)) : width;
  const yStart = box ? Math.max(0, Math.floor(box.minY * height)) : 0;
  const yEnd = box ? Math.min(height, Math.ceil(box.maxY * height)) : height;
  let total = 0;
  let count = 0;
  let hot = 0;
  let dark = 0;
  for (let y = yStart; y < yEnd; y += 2) {
    for (let x = xStart; x < xEnd; x += 2) {
      const i = (y * width + x) * 4;
      const L = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      total += L;
      if (L > 232) hot++;
      if (L < 42) dark++;
      count++;
    }
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

function cropFaceImageData(src: HTMLCanvasElement, landmarks: Landmark[]): ImageData | null {
  const w = src.width;
  const h = src.height;
  const box = faceBox(landmarks);
  const pad = 0.14;
  const x0 = Math.max(0, (box.minX - pad) * w);
  const y0 = Math.max(0, (box.minY - pad) * h);
  const cw = Math.min(w, (box.maxX + pad) * w) - x0;
  const ch = Math.min(h, (box.maxY + pad) * h) - y0;
  if (cw <= 0 || ch <= 0) return null;
  const out = document.createElement("canvas");
  out.width = 224;
  out.height = 224;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return ctx.getImageData(0, 0, out.width, out.height);
}

function mergeVisionAnalysis(base: SkinReads, payload: VisionAnalysis): SkinReads {
  const next: SkinReads = {
    ...base,
    oil: { ...base.oil },
    redness: { ...base.redness },
    pores: { ...base.pores },
    narrative: payload.narrative || base.narrative,
    source: "vision-api" satisfies AnalysisSource,
  };

  const confidenceValues: number[] = [];
  for (const attr of ATTRS) {
    const level = payload.labels?.[attr];
    const confidence = payload.confidence?.[attr];
    if (typeof confidence === "number" && Number.isFinite(confidence)) confidenceValues.push(confidence);
    if (level !== 0 && level !== 1 && level !== 2) continue;
    const current = next[attr];
    const modelConfidence = typeof confidence === "number" && Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.52;
    if (modelConfidence < 0.62 && modelConfidence < (current.confidence ?? 0.6)) continue;
    next[attr] = {
      value: SKIN_LABELS[attr][level],
      level,
      calm: level === 0,
      confidence: Math.max(modelConfidence, current.confidence ?? 0.6),
    };
  }

  if (confidenceValues.length) {
    const visionConfidence = confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length;
    next.confidence = Math.max(base.confidence, Math.min(0.86, visionConfidence * 0.9));
    next.confidenceLabel = confidenceLabelFor(next.confidence);
    next.retakeRecommended = next.confidence < 0.58 || next.retakeReasons.length >= 2;
  }

  return next;
}

function confidenceLabelFor(confidence: number): SkinReads["confidenceLabel"] {
  if (confidence >= 0.78) return "높음";
  if (confidence >= 0.58) return "보통";
  return "낮음";
}

function predictionSnapshot(reads: SkinReads): Record<string, unknown> {
  return {
    source: reads.source,
    confidence: Number(reads.confidence.toFixed(3)),
    retakeRecommended: reads.retakeRecommended,
    labels: {
      oil: reads.oil.level,
      redness: reads.redness.level,
      pores: reads.pores.level,
    },
    values: {
      oil: reads.oil.value,
      redness: reads.redness.value,
      pores: reads.pores.value,
    },
    featureVersion: VISIBLE_MODEL_CONTRACT.inputSchemaVersion,
  };
}

// Presentational styles live in ./scan-styles.
