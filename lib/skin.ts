/**
 * Visible-signal skin analysis.
 *
 * The current runtime is a calibrated ROI feature model with a stable interface
 * for a future MobileNet/ONNX model. It is cosmetic guidance only, not medical
 * diagnosis.
 */

export type SkinLevel = 0 | 1 | 2;
export type SkinAttr = "oil" | "redness" | "pores";
export type Bucket = { value: string; level: SkinLevel; calm?: boolean; confidence?: number };
export type AnalysisSource = "roi-calibrated" | "vision-api" | "ml-model";

export type SkinRawFeatures = {
  shine: number;
  relRedness: number;
  cov: number;
  tzoneL: number;
  cheekL: number;
  cheekTexture: number;
  tzoneSpecular: number;
  cheekSamples: number;
  tzoneSamples: number;
};

export type ConfidenceSignal = {
  label: string;
  ok: boolean;
  detail: string;
};

export type SkinReads = {
  oil: Bucket;
  pores: Bucket;
  redness: Bucket;
  overall: Bucket;
  headline: string;
  narrative: string;
  confidence: number;
  confidenceLabel: "높음" | "보통" | "낮음";
  retakeRecommended: boolean;
  retakeReasons: string[];
  signals: ConfidenceSignal[];
  source: AnalysisSource;
  raw: SkinRawFeatures;
};

export type MlVisiblePrediction = {
  source: "ml-model";
  modelVersion?: string;
  inputSchemaVersion?: string;
  logits?: Partial<Record<SkinAttr, number[]>>;
  labels: Partial<Record<SkinAttr, SkinLevel>>;
  confidence: Partial<Record<SkinAttr, number>>;
};

type LM = { x: number; y: number; z?: number };
type RegionStats = {
  meanR: number;
  meanG: number;
  meanB: number;
  meanL: number;
  specularRatio: number;
  texture: number;
  n: number;
};

const TZONE = [9, 8, 107, 336, 151, 10, 67, 297, 1, 4, 5, 195, 197];
const CHEEKS = [50, 101, 118, 117, 116, 205, 36, 280, 330, 347, 346, 345, 425, 266];

export const SKIN_LABELS: Record<SkinAttr, [string, string, string]> = {
  oil: ["유분 적음", "유분 약간", "유분 많음"],
  redness: ["붉은기 낮음", "붉은기 약간", "붉은기 뚜렷"],
  pores: ["결 매끈", "결 약간 보임", "결 뚜렷"],
};

export const VISIBLE_MODEL_CONTRACT = {
  inputSchemaVersion: "2026-06-30.visible-face-crop.v1",
  fallbackVersion: "roi-calibrated-2026-06-30",
  targetModel: "mobilenetv3-small-visible-attributes",
};

function lum(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function sampleRegion(data: Uint8ClampedArray, w: number, h: number, landmarks: LM[], indices: number[], radius = 4): RegionStats | null {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let n = 0;
  let specular = 0;
  const lums: number[] = [];

  for (const idx of indices) {
    const lm = landmarks[idx];
    if (!lm) continue;
    const cx = Math.round(lm.x * w);
    const cy = Math.round(lm.y * h);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const o = (y * w + x) * 4;
        const r = data[o];
        const g = data[o + 1];
        const b = data[o + 2];
        const L = lum(r, g, b);
        sumR += r;
        sumG += g;
        sumB += b;
        lums.push(L);
        if (L > 218) specular += 1;
        n += 1;
      }
    }
  }

  if (n === 0 || lums.length === 0) return null;

  const meanL = lums.reduce((a, c) => a + c, 0) / lums.length;
  const variance = lums.reduce((a, c) => a + (c - meanL) * (c - meanL), 0) / lums.length;

  return {
    meanR: sumR / n,
    meanG: sumG / n,
    meanB: sumB / n,
    meanL,
    specularRatio: specular / n,
    texture: Math.sqrt(variance),
    n,
  };
}

function bucket(attr: SkinAttr, value: number, lo: number, hi: number, confidence: number): Bucket {
  const level = (value < lo ? 0 : value < hi ? 1 : 2) as SkinLevel;
  return {
    value: SKIN_LABELS[attr][level],
    level,
    calm: level === 0,
    confidence,
  };
}

function distanceConfidence(value: number, lo: number, hi: number) {
  const midpoint = value < lo ? lo : value > hi ? hi : (lo + hi) / 2;
  const span = Math.max(0.0001, hi - lo);
  const distance = Math.abs(value - midpoint) / span;
  return clamp01(0.92 - distance * 0.45);
}

function buildSignals(raw: SkinRawFeatures) {
  return [
    {
      label: "조명",
      ok: raw.cheekL >= 70 && raw.cheekL <= 210,
      detail: raw.cheekL < 70 ? "조명이 어두워요" : raw.cheekL > 210 ? "빛이 강해요" : "분석하기 좋은 밝기예요",
    },
    {
      label: "반사",
      ok: raw.tzoneSpecular < 0.1,
      detail: raw.tzoneSpecular >= 0.1 ? "이마/T존 반사가 강해요" : "반사가 크지 않아요",
    },
    {
      label: "피부 영역",
      ok: raw.cheekSamples >= 700 && raw.tzoneSamples >= 500,
      detail: raw.cheekSamples < 700 || raw.tzoneSamples < 500 ? "얼굴 영역이 작게 잡혔어요" : "볼/T존 영역이 충분히 잡혔어요",
    },
  ] satisfies ConfidenceSignal[];
}

function confidenceLabel(confidence: number): SkinReads["confidenceLabel"] {
  if (confidence >= 0.78) return "높음";
  if (confidence >= 0.58) return "보통";
  return "낮음";
}

function headlineFor(oil: Bucket, redness: Bucket, pores: Bucket) {
  if (redness.level >= 2) return "오늘은 진정 루틴이 먼저예요";
  if (oil.level >= 2 && pores.level >= 1) return "T존 유분과 피부결을 함께 볼게요";
  if (oil.level >= 2) return "T존 유분이 도드라져 보여요";
  if (pores.level >= 2) return "볼 쪽 피부결이 또렷하게 보여요";
  return "피부 컨디션이 비교적 안정적이에요";
}

function narrativeFor(oil: Bucket, redness: Bucket, pores: Bucket) {
  const parts = [
    oil.level === 0 ? "T존 번들거림은 크지 않고" : oil.level === 1 ? "T존에 유분감이 조금 보이고" : "T존 유분감이 비교적 뚜렷하고",
    redness.level === 0 ? "볼의 붉은기는 낮게 보여요" : redness.level === 1 ? "볼에 옅은 붉은기가 보여요" : "볼의 붉은기가 눈에 띄어요",
    pores.level === 0 ? "피부결은 매끈한 편이에요" : pores.level === 1 ? "피부결은 약간 보이는 편이에요" : "피부결과 모공감이 또렷해 보여요",
  ];
  return `${parts[0]}, ${parts[1]}. ${parts[2]}.`;
}

export function analyzeSkin(imageData: ImageData, landmarks: LM[], ml?: MlVisiblePrediction | null): SkinReads | null {
  const { data, width: w, height: h } = imageData;
  const tzone = sampleRegion(data, w, h, landmarks, TZONE);
  const cheeks = sampleRegion(data, w, h, landmarks, CHEEKS);
  if (!tzone || !cheeks || tzone.n < 40 || cheeks.n < 40) return null;

  const cheekL = lum(cheeks.meanR, cheeks.meanG, cheeks.meanB);
  const tzoneL = lum(tzone.meanR, tzone.meanG, tzone.meanB);
  const rIdx = (m: RegionStats) => m.meanR / (m.meanR + m.meanG + m.meanB || 1);

  const raw: SkinRawFeatures = {
    shine: tzone.specularRatio + Math.max(0, (tzoneL - cheekL) / 255),
    relRedness: rIdx(cheeks) - rIdx(tzone),
    cov: cheeks.texture / (cheekL || 1),
    tzoneL,
    cheekL,
    cheekTexture: cheeks.texture,
    tzoneSpecular: tzone.specularRatio,
    cheekSamples: cheeks.n,
    tzoneSamples: tzone.n,
  };

  const oil = bucket("oil", raw.shine, 0.05, 0.16, distanceConfidence(raw.shine, 0.05, 0.16));
  const redness = bucket("redness", raw.relRedness, 0.012, 0.03, distanceConfidence(raw.relRedness, 0.012, 0.03));
  const pores = bucket("pores", raw.cov, 0.085, 0.14, distanceConfidence(raw.cov, 0.085, 0.14));

  const merged = mergeMlPrediction({ oil, redness, pores }, ml);
  const signals = buildSignals(raw);
  const signalScore = signals.filter((signal) => signal.ok).length / signals.length;
  const attrConfidence = (merged.oil.confidence ?? 0.6) * 0.34 + (merged.redness.confidence ?? 0.6) * 0.33 + (merged.pores.confidence ?? 0.6) * 0.33;
  const confidence = clamp01(attrConfidence * 0.72 + signalScore * 0.28);
  const retakeReasons = signals.filter((signal) => !signal.ok).map((signal) => signal.detail);

  const concerns = [merged.oil, merged.redness, merged.pores].filter((b) => b.level > 0).length;
  const overall: Bucket =
    confidence < 0.58
      ? { value: "재촬영 권장", level: 1, calm: false, confidence }
      : concerns >= 2
        ? { value: "균형 관리 필요", level: 2, calm: false, confidence }
        : { value: "대체로 안정", level: 0, calm: true, confidence };

  return {
    oil: merged.oil,
    pores: merged.pores,
    redness: merged.redness,
    overall,
    headline: headlineFor(merged.oil, merged.redness, merged.pores),
    narrative: narrativeFor(merged.oil, merged.redness, merged.pores),
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    retakeRecommended: confidence < 0.58 || retakeReasons.length >= 2,
    retakeReasons,
    signals,
    source: ml ? "ml-model" : "roi-calibrated",
    raw,
  };
}

function mergeMlPrediction(base: Record<SkinAttr, Bucket>, ml?: MlVisiblePrediction | null): Record<SkinAttr, Bucket> {
  if (!ml) return base;

  const next = { ...base };
  for (const attr of Object.keys(base) as SkinAttr[]) {
    const mlLevel = ml.labels[attr];
    if (mlLevel === undefined) continue;
    const mlConfidence = ml.confidence[attr] ?? 0;
    const baseConfidence = base[attr].confidence ?? 0;
    if (mlConfidence >= 0.55 || mlConfidence >= baseConfidence) {
      next[attr] = {
        value: SKIN_LABELS[attr][mlLevel],
        level: mlLevel,
        calm: mlLevel === 0,
        confidence: Math.max(mlConfidence, baseConfidence * 0.9),
      };
    }
  }
  return next;
}

export async function classifyVisibleAttributes(skinCrop: ImageData): Promise<MlVisiblePrediction | null> {
  void skinCrop;
  // Runtime hook for the exported ONNX model. Until enough consented crops exist,
  // the app keeps using calibrated ROI features and records the same contract.
  return null;
}
