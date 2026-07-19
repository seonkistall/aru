"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { CONSENT_VERSION, getConsentEvents } from "@/lib/consent";
import { DEVICE_DATA_KEY } from "@/lib/device-data";
import { recordFunnelEvent } from "@/lib/funnel";
import { t } from "@/lib/i18n/core";
import { labelCount, type SampleMeta } from "@/lib/labels";
import { shouldKeepLearningCrop } from "@/lib/ml-collection";
import { getCurrentPilotSession } from "@/lib/pilot";
import { faceBox } from "@/lib/scan-geometry";
import { pushScanHistory } from "@/lib/scan-history";
import {
  analyzeSkinBurst,
  classifyVisibleAttributes,
  VISIBLE_MODEL_CONTRACT,
  type SkinReads,
} from "@/lib/skin";
import { cropPlanForPurpose, frameMovement } from "./camera-quality";
import {
  captureGateDecision,
  cropFace,
  cropFaceImageData,
  evaluateCapturedQuality,
  mergeVisionAnalysis,
  predictionSnapshot,
  qualityMeta,
  type GuideState,
} from "./capture-analysis";
import { resolveCaptureConsent } from "./consent-authorization";
import { CAPTURE_PROFILES, type CaptureMode, type Landmark, type Quality } from "./types";
import type { VideoFaceLandmarker } from "./use-landmarker";

type RefValue<T> = { current: T };
type CapturePhase = "init" | "ready" | "analyzing" | "result" | "noface" | "denied" | "unsupported" | "interrupted";
type Frame = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
};

type UseCaptureAnalysisOptions = {
  videoRef: RefValue<HTMLVideoElement | null>;
  captureRef: RefValue<(() => Promise<void>) | null>;
  cropSizeRef: RefValue<{ ai?: string; learning?: string; model?: string }>;
  lastCenterRef: RefValue<{ x: number; y: number; t: number } | null>;
  captureMode: CaptureMode;
  quality: Quality;
  guideState: GuideState;
  consent: boolean;
  datasetConsent: boolean;
  ensureLandmarker: () => Promise<VideoFaceLandmarker | null>;
  readFrame: () => Frame | null;
  commitQuality: (quality: Quality, force?: boolean) => void;
  resetAutoCaptureProgress: () => void;
  holdAutoCapture: (durationMs?: number) => void;
  stopCamera: () => void;
  setPhase: Dispatch<SetStateAction<CapturePhase>>;
  setAnalysisStep: Dispatch<SetStateAction<number>>;
  setErr: Dispatch<SetStateAction<string>>;
  setCropDataUrl: Dispatch<SetStateAction<string | null>>;
  setCaptureMeta: Dispatch<SetStateAction<SampleMeta | null>>;
  setReads: Dispatch<SetStateAction<SkinReads | null>>;
};

export function useCaptureAnalysis({
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
}: UseCaptureAnalysisOptions) {
  const captureLockRef = useRef(false);
  const captureRunRef = useRef(0);

  const cancelCapture = useCallback(() => {
    captureRunRef.current += 1;
  }, []);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || captureLockRef.current || guideState !== "ready") return;
    const runId = captureRunRef.current + 1;
    captureRunRef.current = runId;
    const cancelled = () => captureRunRef.current !== runId;
    captureLockRef.current = true;
    resetAutoCaptureProgress();
    setPhase("analyzing");
    setAnalysisStep(0);
    setErr("");
    setCropDataUrl(null);
    recordFunnelEvent("scan_started", { mode: captureMode });

    let stepStartedAt = performance.now();
    const advanceStep = async (step: number) => {
      const waitMs = 825 - (performance.now() - stepStartedAt);
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      if (cancelled()) return false;
      setAnalysisStep(step);
      stepStartedAt = performance.now();
      return true;
    };

    try {
      const landmarker = await ensureLandmarker();
      if (cancelled() || !landmarker) return;
      const w = video.videoWidth || 720;
      const h = video.videoHeight || 960;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("canvas unavailable");
      ctx.drawImage(video, 0, 0, w, h);

      const faces = landmarker.detectForVideo(canvas, performance.now()).faceLandmarks ?? [];
      if (captureGateDecision({ guideState, landmarks: faces[0] }) === "face") {
        holdAutoCapture();
        setPhase("noface");
        return;
      }

      const imageData = ctx.getImageData(0, 0, w, h);
      const captureBox = faceBox(faces[0]);
      const last = lastCenterRef.current;
      const captureCenter = {
        x: (captureBox.minX + captureBox.maxX) / 2,
        y: (captureBox.minY + captureBox.maxY) / 2,
      };
      const dtMs = last ? performance.now() - last.t : 0;
      const captureMovement = last && dtMs >= 80 ? frameMovement(last, captureCenter, dtMs) : undefined;
      const captureSteady = captureMovement !== undefined
        ? captureMovement < CAPTURE_PROFILES[captureMode].maxMovement
        : quality.steady;

      const verifyFrame = readFrame();
      const verifyData = verifyFrame
        ? verifyFrame.ctx.getImageData(0, 0, verifyFrame.w, verifyFrame.h)
        : imageData;
      const verifiedQuality: Quality = {
        ...evaluateCapturedQuality(verifyData, faces[0], CAPTURE_PROFILES[captureMode], captureSteady),
        movement: captureMovement,
      };
      commitQuality(verifiedQuality, true);
      if (captureGateDecision({ guideState, landmarks: faces[0], quality: verifiedQuality }) === "quality") {
        holdAutoCapture();
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

      const aiCrop = aiAllowed ? cropFace(canvas, faces[0], cropPlanForPurpose("ai-analysis")) : null;
      const learningCrop = cropAllowed ? cropFace(canvas, faces[0], cropPlanForPurpose("learning-crop")) : null;
      const modelCrop = process.env.NEXT_PUBLIC_VISIBLE_ATTR_MODEL === "on" ? cropFaceImageData(canvas, faces[0]) : null;
      cropSizeRef.current = {
        ai: aiCrop?.size,
        learning: learningCrop?.size,
        model: modelCrop ? `${modelCrop.width}x${modelCrop.height}` : undefined,
      };
      setCropDataUrl(shouldKeepLearningCrop({ datasetConsent: cropAllowed }) ? learningCrop?.dataUrl ?? null : null);

      const burstFrames: Array<{ imageData: ImageData; landmarks: Landmark[] }> = [{ imageData, landmarks: faces[0] }];
      let previousBurstCenter = captureCenter;
      for (let i = 1; i < 3; i += 1) {
        const frameStartedAt = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 140));
        if (cancelled()) return;
        ctx.drawImage(video, 0, 0, w, h);
        const extra = landmarker.detectForVideo(canvas, performance.now()).faceLandmarks?.[0];
        if (extra?.length) {
          const extraBox = faceBox(extra);
          const extraCenter = {
            x: (extraBox.minX + extraBox.maxX) / 2,
            y: (extraBox.minY + extraBox.maxY) / 2,
          };
          const movement = frameMovement(previousBurstCenter, extraCenter, performance.now() - frameStartedAt);
          if (movement >= CAPTURE_PROFILES[captureMode].maxMovement) {
            holdAutoCapture();
            setErr(t("스캔 중 얼굴이 움직였어요. 윤곽선 중앙에 맞추고 잠깐 멈춰주세요."));
            setPhase("ready");
            return;
          }
          previousBurstCenter = extraCenter;
          burstFrames.push({ imageData: ctx.getImageData(0, 0, w, h), landmarks: extra });
        }
      }

      if (!(await advanceStep(1))) return;
      const mlPrediction = modelCrop ? await classifyVisibleAttributes(modelCrop) : null;
      if (cancelled()) return;
      const out = analyzeSkinBurst(burstFrames, mlPrediction);
      if (!out) {
        setPhase("noface");
        return;
      }
      if (!(await advanceStep(2))) return;
      if (!(await advanceStep(3))) return;

      let final = out;
      if (aiAllowed && aiCrop) {
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
            const value = await resp.json();
            if (value?.ok) final = mergeVisionAnalysis(out, value);
          }
        } catch {
          /* Timed out or failed — keep on-device result. */
        } finally {
          window.clearTimeout(timeout);
        }
        if (cancelled()) return;
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
        modelVersion: final.source === "ml-model" && mlPrediction?.modelVersion
          ? mlPrediction.modelVersion
          : VISIBLE_MODEL_CONTRACT.fallbackVersion,
        inputSchemaVersion: mlPrediction?.inputSchemaVersion ?? VISIBLE_MODEL_CONTRACT.inputSchemaVersion,
        analysisConfidence: final.confidence,
        retakeRecommended: final.retakeRecommended,
        burst: final.burst,
        initialPrediction: predictionSnapshot(out),
        finalPrediction: predictionSnapshot(final),
      });

      if (!(await advanceStep(4))) return;
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
      pushScanHistory({
        oil: final.oil.level,
        redness: final.redness.level,
        pores: final.pores.level,
        confidence: final.confidence,
        ts: Date.now(),
      });
      setReads(final);
      stopCamera();
      setPhase("result");
    } catch (error) {
      if (cancelled()) return;
      console.error(error);
      holdAutoCapture();
      setErr(t("분석 중 문제가 생겼어요. 다시 시도해 주세요."));
      setPhase("ready");
    } finally {
      captureLockRef.current = false;
    }
  }, [
    captureMode,
    commitQuality,
    consent,
    cropSizeRef,
    datasetConsent,
    ensureLandmarker,
    guideState,
    holdAutoCapture,
    lastCenterRef,
    quality,
    readFrame,
    resetAutoCaptureProgress,
    setAnalysisStep,
    setCaptureMeta,
    setCropDataUrl,
    setErr,
    setPhase,
    setReads,
    stopCamera,
    videoRef,
  ]);

  useEffect(() => {
    captureRef.current = capture;
    return () => {
      cancelCapture();
      if (captureRef.current === capture) captureRef.current = null;
    };
  }, [cancelCapture, capture, captureRef]);

  return { capture, cancelCapture };
}
