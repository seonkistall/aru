import { t } from "@/lib/i18n/core";
import {
  SKIN_LABELS,
  VISIBLE_MODEL_CONTRACT,
  type AnalysisSource,
  type SkinAttr,
  type SkinLevel,
  type SkinReads,
} from "@/lib/skin";
import type { CaptureQualityMeta } from "@/lib/labels";
import { coverCropFractions, faceBox, rawFaceSize } from "@/lib/scan-geometry";
import { captureGatePassed, cropOutputSize, cropPlanForPurpose, type CropPlan } from "./camera-quality";
import {
  DEFAULT_SKIN_ROI_THRESHOLDS,
  evaluateSkinRoiQuality,
  skinRoiRegionsFromLandmarks,
} from "./skin-roi-quality";
import type { CaptureProfile, Landmark, Quality } from "./types";

export type GuideState = "loading" | "ready" | "failed";

export type VisionAnalysis = {
  labels?: Partial<Record<SkinAttr, SkinLevel>>;
  confidence?: Partial<Record<SkinAttr, number>>;
  narrative?: string;
  source?: string;
};

const ATTRS: SkinAttr[] = ["oil", "redness", "pores"];

export function captureGateDecision(input: {
  guideState: GuideState;
  landmarks?: Landmark[] | null;
  quality?: Quality;
}): "guide" | "face" | "quality" | null {
  if (input.guideState !== "ready") return "guide";
  if (!input.landmarks?.length) return "face";
  if (input.quality && !captureGatePassed(input.quality)) return "quality";
  return null;
}

export function evaluateCapturedQuality(
  imageData: ImageData,
  landmarks: Landmark[],
  profile: CaptureProfile,
  previousSteady: boolean,
): Quality {
  const box = faceBox(landmarks);
  const centerX = (box.minX + box.maxX) / 2;
  const centerY = (box.minY + box.maxY) / 2;
  const { fx, fy } = coverCropFractions(imageData.width, imageData.height);
  const centerOffsetX = (centerX - (1 - fx) / 2) / fx - 0.5;
  const centerOffsetY = (centerY - (1 - fy) / 2) / fy - 0.48;
  const rawSize = rawFaceSize(box);
  const faceSize = rawSize;
  const exposure = exposureStats(imageData, box);
  const centered = Math.abs(centerOffsetX) < 0.28 && Math.abs(centerOffsetY) < 0.3;
  const distance = rawSize > profile.minFaceSize && rawSize < 0.98;
  const skinRegions = skinRoiRegionsFromLandmarks(landmarks);
  const skinQuality = evaluateSkinRoiQuality(imageData, skinRegions ?? { tzone: null, leftCheek: null, rightCheek: null }, {
    ...DEFAULT_SKIN_ROI_THRESHOLDS,
    minMeanLuma: profile.minBrightness,
    maxDarkRatio: profile.maxDarkRatio,
    maxHotRatio: profile.maxHotRatio,
  });
  const brightness = skinQuality.exposure;
  const noGlare = skinQuality.noGlare;
  const skinReady = skinQuality.regionsReady && skinQuality.sharp;
  const steady = previousSteady;
  const rejectReason = !distance
    ? "distance"
    : !skinQuality.regionsReady
      ? "skin-regions"
      : !brightness
        ? "brightness"
        : !noGlare
          ? "glare"
          : !skinQuality.sharp
            ? "skin-soft"
            : !steady
              ? "movement"
              : !centered
                ? "center"
                : undefined;
  return {
    face: true,
    centered,
    distance,
    brightness,
    noGlare,
    steady,
    skinReady,
    score: 1 + (distance ? 1 : 0) + (brightness ? 1 : 0) + (noGlare ? 1 : 0) + (steady ? 1 : 0) + (centered ? 1 : 0),
    message: rejectReason ? t("촬영 품질을 다시 맞춰주세요.") : t("촬영 품질이 확인됐어요."),
    centerOffsetX,
    centerOffsetY,
    faceSize,
    brightnessMean: exposure.mean,
    darkRatio: exposure.darkRatio,
    hotRatio: exposure.hotRatio,
    rejectReason,
  };
}

export function qualityMeta(quality: Quality): CaptureQualityMeta {
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

export function exposureStats(imageData: ImageData, box?: ReturnType<typeof faceBox>) {
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
      const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      total += luminance;
      if (luminance > 232) hot += 1;
      if (luminance < 42) dark += 1;
      count += 1;
    }
  }
  return { mean: total / Math.max(1, count), hotRatio: hot / Math.max(1, count), darkRatio: dark / Math.max(1, count) };
}

export function cropFace(src: HTMLCanvasElement, landmarks: Landmark[], plan: CropPlan): { dataUrl: string; size: string } {
  const w = src.width;
  const h = src.height;
  const box = faceBox(landmarks);
  const pad = 0.14;
  const x0 = Math.max(0, (box.minX - pad) * w);
  const y0 = Math.max(0, (box.minY - pad) * h);
  const cw = Math.min(w, (box.maxX + pad) * w) - x0;
  const ch = Math.min(h, (box.maxY + pad) * h) - y0;
  const size = cropOutputSize({ sourceWidth: cw, sourceHeight: ch, maxEdge: plan.maxEdge });
  const out = document.createElement("canvas");
  out.width = size.width;
  out.height = size.height;
  out.getContext("2d")?.drawImage(src, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return { dataUrl: out.toDataURL(plan.mimeType, plan.quality), size: `${out.width}x${out.height}` };
}

export function cropFaceImageData(src: HTMLCanvasElement, landmarks: Landmark[]): ImageData | null {
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
  const plan = cropPlanForPurpose("model-input");
  out.width = plan.maxEdge;
  out.height = plan.maxEdge;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return ctx.getImageData(0, 0, out.width, out.height);
}

export function mergeVisionAnalysis(base: SkinReads, payload: VisionAnalysis): SkinReads {
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

export function predictionSnapshot(reads: SkinReads): Record<string, unknown> {
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
