"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n/core";
import { coverCropFractions, faceBox, isNormalizedBox, rawFaceSize } from "@/lib/scan-geometry";
import { buildCameraQualityDebug, frameMovement, scanCaptureReady, type CameraAttempt } from "./camera-quality";
import { exposureStats } from "./capture-analysis";
import { computeGuideZones } from "./guide";
import { createLandmarkerWorker, type LandmarkerWorker } from "./landmarker-client";
import {
  DEFAULT_SKIN_ROI_THRESHOLDS,
  evaluateSkinRoiQuality,
  skinRoiRegionsFromLandmarks,
} from "./skin-roi-quality";
import { CAPTURE_PROFILES, initialQuality, type CaptureMode, type GuideZones, type Quality } from "./types";
import type { VideoFaceLandmarker } from "./use-landmarker";

type RefValue<T> = { current: T };
type FaceCenter = { x: number; y: number; t: number };
type CropSizes = { ai?: string; learning?: string; model?: string };

type UseQualityLoopOptions = {
  active: boolean;
  captureMode: CaptureMode;
  videoRef: RefValue<HTMLVideoElement | null>;
  streamRef: RefValue<MediaStream | null>;
  captureRef: RefValue<(() => Promise<void>) | null>;
  workerRef: RefValue<LandmarkerWorker | null>;
  useWorkerRef: RefValue<boolean>;
  cameraAttemptRef: RefValue<CameraAttempt>;
  cropSizeRef: RefValue<CropSizes>;
  debugRef: RefValue<boolean>;
  guideAttempt: number;
  landmarkerDelegate: "GPU" | "CPU";
  loadLandmarker: () => Promise<VideoFaceLandmarker | null>;
  reloadLandmarker: () => void;
  forceCpuDelegate: () => void;
};

export function useQualityLoop({
  active,
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
}: UseQualityLoopOptions) {
  const lastCenterRef = useRef<FaceCenter | null>(null);
  const qualityTimerRef = useRef<number | null>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const passStreakRef = useRef(0);
  const countdownRef = useRef<number | null>(null);
  const autoHoldUntilRef = useRef(0);
  const capturingRef = useRef(false);
  const autoCaptureRef = useRef(true);
  const prevQualityKeyRef = useRef("");

  const [quality, setQuality] = useState<Quality>(initialQuality);
  const [autoCapture, setAutoCapture] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [zones, setZones] = useState<GuideZones | null>(null);
  const [debugInfo, setDebugInfo] = useState<Record<string, string | number | boolean> | null>(null);

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

  const resetAutoCaptureProgress = useCallback(() => {
    passStreakRef.current = 0;
    setCountdownSafe(null);
  }, [setCountdownSafe]);

  const handleAutoTick = useCallback((pass: boolean) => {
    if (!autoCaptureRef.current || capturingRef.current) return;
    if (!pass) {
      resetAutoCaptureProgress();
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
  }, [captureRef, resetAutoCaptureProgress, setCountdownSafe]);

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
  }, [videoRef]);

  const detectLiveFace = useCallback(async (landmarker: VideoFaceLandmarker, video: HTMLVideoElement) => {
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
  }, [workerRef]);

  const measureQuality = useCallback(async (landmarker: VideoFaceLandmarker) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

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

    if (landmarkerDelegate !== "CPU" && !isNormalizedBox(box)) {
      forceCpuDelegate();
      if (qualityTimerRef.current) window.clearTimeout(qualityTimerRef.current);
      handleAutoTick(false);
      reloadLandmarker();
      return;
    }

    const centerX = (box.minX + box.maxX) / 2;
    const centerY = (box.minY + box.maxY) / 2;
    const profile = CAPTURE_PROFILES[captureMode];
    const rawSize = rawFaceSize(box);
    const distance = rawSize > profile.minFaceSize && rawSize < 0.98;

    const { fx, fy } = coverCropFractions(video.videoWidth, video.videoHeight);
    const visCenterX = (centerX - (1 - fx) / 2) / fx;
    const visCenterY = (centerY - (1 - fy) / 2) / fy;
    const centered = Math.abs(visCenterX - 0.5) < 0.28 && Math.abs(visCenterY - 0.48) < 0.3;

    const frameData = frame.ctx.getImageData(0, 0, frame.w, frame.h);
    const exposure = exposureStats(frameData, box);
    const skinRegions = skinRoiRegionsFromLandmarks(face);
    const skinQuality = evaluateSkinRoiQuality(
      frameData,
      skinRegions ?? { tzone: null, leftCheek: null, rightCheek: null },
      {
        ...DEFAULT_SKIN_ROI_THRESHOLDS,
        minMeanLuma: profile.minBrightness,
        maxDarkRatio: profile.maxDarkRatio,
        maxHotRatio: profile.maxHotRatio,
      }
    );
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
        "delegate": landmarkerDelegate,
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
  }, [
    cameraAttemptRef,
    captureMode,
    commitQuality,
    cropSizeRef,
    debugRef,
    detectLiveFace,
    forceCpuDelegate,
    handleAutoTick,
    landmarkerDelegate,
    readFrame,
    reloadLandmarker,
    streamRef,
    videoRef,
  ]);

  const stopQualityLoop = useCallback(() => {
    if (qualityTimerRef.current) window.clearTimeout(qualityTimerRef.current);
    qualityTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    if (useWorkerRef.current && !workerRef.current) {
      workerRef.current = createLandmarkerWorker();
      if (workerRef.current) forceCpuDelegate();
    }
    loadLandmarker().then((landmarker) => {
      if (!mounted || !landmarker) return;
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
    });
    return () => {
      mounted = false;
      stopQualityLoop();
      resetAutoCaptureProgress();
    };
  }, [
    active,
    forceCpuDelegate,
    guideAttempt,
    loadLandmarker,
    measureQuality,
    resetAutoCaptureProgress,
    stopQualityLoop,
    useWorkerRef,
    workerRef,
  ]);

  const resetQualityLoop = useCallback(() => {
    setQuality(initialQuality);
    prevQualityKeyRef.current = "";
    lastCenterRef.current = null;
    passStreakRef.current = 0;
  }, []);

  const holdAutoCapture = useCallback((durationMs = 4000) => {
    autoHoldUntilRef.current = performance.now() + durationMs;
  }, []);

  const toggleAutoCapture = useCallback((next: boolean) => {
    autoCaptureRef.current = next;
    setAutoCapture(next);
    resetAutoCaptureProgress();
  }, [resetAutoCaptureProgress]);

  return {
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
  };
}
