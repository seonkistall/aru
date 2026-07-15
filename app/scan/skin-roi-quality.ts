export type NormalizedSkinRoi = { x: number; y: number; width: number; height: number };

export type SkinRoiRegions = {
  tzone: NormalizedSkinRoi | null;
  leftCheek: NormalizedSkinRoi | null;
  rightCheek: NormalizedSkinRoi | null;
};

export type SkinRoiFailureReason = "regions" | "dark" | "glare" | "soft";

export type SkinRoiQualityResult = {
  regionsReady: boolean;
  exposure: boolean;
  noGlare: boolean;
  sharp: boolean;
  passed: boolean;
  reason: SkinRoiFailureReason | null;
  meanLuma?: number;
  maxDarkRatio?: number;
  maxHotRatio?: number;
  minDetail?: number;
};

export type SkinRoiThresholds = {
  minMeanLuma: number;
  maxDarkRatio: number;
  maxHotRatio: number;
  minDetail: number;
};

type PixelFrame = { data: Uint8ClampedArray; width: number; height: number };
type PixelBounds = { left: number; top: number; right: number; bottom: number };

export const DEFAULT_SKIN_ROI_THRESHOLDS: SkinRoiThresholds = {
  minMeanLuma: 55,
  maxDarkRatio: 0.45,
  maxHotRatio: 0.18,
  minDetail: 2.5,
};

function pixelBounds(frame: PixelFrame, roi: NormalizedSkinRoi | null): PixelBounds | null {
  if (!roi || ![roi.x, roi.y, roi.width, roi.height].every(Number.isFinite)) return null;
  const left = Math.max(0, Math.floor(roi.x * frame.width));
  const top = Math.max(0, Math.floor(roi.y * frame.height));
  const right = Math.min(frame.width, Math.ceil((roi.x + roi.width) * frame.width));
  const bottom = Math.min(frame.height, Math.ceil((roi.y + roi.height) * frame.height));
  return right - left >= 8 && bottom - top >= 8 ? { left, top, right, bottom } : null;
}

function luma(data: Uint8ClampedArray, offset: number) {
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}

function regionStats(frame: PixelFrame, bounds: PixelBounds) {
  let sum = 0;
  let dark = 0;
  let hot = 0;
  let detail = 0;
  let detailSamples = 0;
  let pixels = 0;

  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      const offset = (y * frame.width + x) * 4;
      const value = luma(frame.data, offset);
      sum += value;
      dark += value < 48 ? 1 : 0;
      hot += value > 245 ? 1 : 0;
      pixels += 1;
      if (x + 1 < bounds.right) {
        detail += Math.abs(value - luma(frame.data, offset + 4));
        detailSamples += 1;
      }
      if (y + 1 < bounds.bottom) {
        detail += Math.abs(value - luma(frame.data, offset + frame.width * 4));
        detailSamples += 1;
      }
    }
  }

  return {
    mean: sum / pixels,
    darkRatio: dark / pixels,
    hotRatio: hot / pixels,
    detail: detailSamples ? detail / detailSamples : 0,
  };
}

export function evaluateSkinRoiQuality(
  frame: PixelFrame,
  regions: SkinRoiRegions,
  thresholds: SkinRoiThresholds = DEFAULT_SKIN_ROI_THRESHOLDS
): SkinRoiQualityResult {
  if (frame.width <= 0 || frame.height <= 0 || frame.data.length < frame.width * frame.height * 4) {
    return { regionsReady: false, exposure: false, noGlare: false, sharp: false, passed: false, reason: "regions" };
  }

  const bounds = [regions.tzone, regions.leftCheek, regions.rightCheek].map((roi) => pixelBounds(frame, roi));
  if (bounds.some((value) => value === null)) {
    return { regionsReady: false, exposure: false, noGlare: false, sharp: false, passed: false, reason: "regions" };
  }

  const stats = (bounds as PixelBounds[]).map((value) => regionStats(frame, value));
  const meanLuma = stats.reduce((sum, value) => sum + value.mean, 0) / stats.length;
  const maxDarkRatio = Math.max(...stats.map((value) => value.darkRatio));
  const maxHotRatio = Math.max(...stats.map((value) => value.hotRatio));
  const minDetail = Math.min(...stats.map((value) => value.detail));
  const exposure = stats.every((value) => value.mean >= thresholds.minMeanLuma && value.darkRatio <= thresholds.maxDarkRatio);
  const noGlare = maxHotRatio <= thresholds.maxHotRatio;
  const sharp = minDetail >= thresholds.minDetail;
  const reason = !exposure ? "dark" : !noGlare ? "glare" : !sharp ? "soft" : null;

  return {
    regionsReady: true,
    exposure,
    noGlare,
    sharp,
    passed: reason === null,
    reason,
    meanLuma,
    maxDarkRatio,
    maxHotRatio,
    minDetail,
  };
}
