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
  /** Dominant cheek tone as CIELAB L* — recorded for calibration and tone-subgroup evaluation, never shown to users. */
  toneLstar: number;
  /** Individual Typology Angle (deg) of the dominant cheek tone — same recording-only purpose. */
  toneIta: number;
};

export type ConfidenceSignal = {
  label: string;
  ok: boolean;
  detail: string;
};

export type BurstInfo = {
  frames: number;
  agreement: Record<SkinAttr, number>;
};

export type SkinExtraRead = { label: string; value: string; calm: boolean; note: string };

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
  burst?: BurstInfo;
  extras?: SkinExtraRead[];
};

export type MlVisiblePrediction = {
  source: "ml-model";
  modelVersion?: string;
  inputSchemaVersion?: string;
  logits?: Partial<Record<SkinAttr, number[]>>;
  labels: Partial<Record<SkinAttr, SkinLevel>>;
  confidence: Partial<Record<SkinAttr, number>>;
};

type VisibleModelManifest = {
  status: "pending-training-data" | "active" | "disabled";
  modelPath?: string | null;
  modelVersion?: string;
  inputSchemaVersion?: string;
  runtime?: {
    featureFlag?: string;
    package?: string;
  };
};

type LM = { x: number; y: number; z?: number };
type SkinPixel = { r: number; g: number; b: number; L: number };
type RegionStats = {
  meanR: number;
  meanG: number;
  meanB: number;
  meanL: number;
  specularRatio: number;
  texture: number;
  n: number;
  pixels: SkinPixel[];
};

const TZONE = [9, 8, 107, 336, 151, 10, 67, 297, 1, 4, 5, 195, 197];
const CHEEKS = [50, 101, 118, 117, 116, 205, 36, 280, 330, 347, 346, 345, 425, 266];

// Exposed so the capture guide can draw the REAL sampling regions on the face.
export const SAMPLING_LANDMARKS = { tzone: TZONE, cheeks: CHEEKS };

export const SKIN_LABELS: Record<SkinAttr, [string, string, string]> = {
  oil: ["유분 적음", "유분 약간", "유분 많음"],
  redness: ["붉은기 낮음", "붉은기 약간", "붉은기 뚜렷"],
  pores: ["결 매끈", "결 약간 보임", "결 뚜렷"],
};

export const VISIBLE_MODEL_CONTRACT = {
  inputSchemaVersion: "2026-06-30.visible-face-crop.v1",
  // Bumped 07-03: trimmed region stats + tone (L*/ITA) fields change feature semantics.
  fallbackVersion: "roi-calibrated-2026-07-03",
  targetModel: "mobilenetv3-small-visible-attributes",
};

let visibleManifestPromise: Promise<VisibleModelManifest | null> | null = null;

function lum(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function sampleRegion(data: Uint8ClampedArray, w: number, h: number, landmarks: LM[], indices: number[], radius = 4): RegionStats | null {
  const collected: SkinPixel[] = [];
  let specular = 0;

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
        collected.push({ r, g, b, L });
        if (L > 218) specular += 1;
      }
    }
  }

  if (collected.length === 0) return null;

  // Fixed landmark patches bleed into hair shadow and glints; trimming the
  // luminance extremes keeps color/texture stats on actual skin. The specular
  // ratio stays measured on the UNTRIMMED set — glints ARE that signal.
  const sorted = [...collected].sort((a, b) => a.L - b.L);
  const cut = Math.floor(sorted.length * 0.1);
  const kept = sorted.length - cut * 2 >= 20 ? sorted.slice(cut, sorted.length - cut) : sorted;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumL = 0;
  for (const pixel of kept) {
    sumR += pixel.r;
    sumG += pixel.g;
    sumB += pixel.b;
    sumL += pixel.L;
  }
  const meanL = sumL / kept.length;
  const variance = kept.reduce((acc, pixel) => acc + (pixel.L - meanL) * (pixel.L - meanL), 0) / kept.length;

  return {
    meanR: sumR / kept.length,
    meanG: sumG / kept.length,
    meanB: sumB / kept.length,
    meanL,
    specularRatio: specular / collected.length,
    texture: Math.sqrt(variance),
    n: collected.length,
    pixels: kept,
  };
}

function rgbToLab(r: number, g: number, b: number): { l: number; a: number; b: number } {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const rl = linear(r);
  const gl = linear(g);
  const bl = linear(b);
  // sRGB -> XYZ (D65), normalized to reference white.
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/**
 * Dominant skin tone via tiny K-means (k=3, 5 iterations) over the trimmed
 * cheek pixels — the largest cluster screens out residual blush/shadow the
 * trim didn't catch. Returned as CIELAB L* and ITA, recorded (not displayed)
 * so the 500+ crop gate's tone-subgroup evaluation has per-sample tone data.
 */
function dominantTone(pixels: SkinPixel[]): { lstar: number; ita: number } | null {
  if (pixels.length < 30) return null;
  const sample = pixels.filter((_, index) => index % 2 === 0);
  const centroids = [sample[0], sample[Math.floor(sample.length / 2)], sample[sample.length - 1]].map((p) => ({ r: p.r, g: p.g, b: p.b }));
  const assignment = new Array<number>(sample.length).fill(0);

  for (let iter = 0; iter < 5; iter += 1) {
    for (let i = 0; i < sample.length; i += 1) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const dr = sample[i].r - centroids[c].r;
        const dg = sample[i].g - centroids[c].g;
        const db = sample[i].b - centroids[c].b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      assignment[i] = best;
    }
    for (let c = 0; c < centroids.length; c += 1) {
      let count = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let i = 0; i < sample.length; i += 1) {
        if (assignment[i] !== c) continue;
        count += 1;
        sumR += sample[i].r;
        sumG += sample[i].g;
        sumB += sample[i].b;
      }
      if (count > 0) centroids[c] = { r: sumR / count, g: sumG / count, b: sumB / count };
    }
  }

  const counts = [0, 0, 0];
  for (const clusterIndex of assignment) counts[clusterIndex] += 1;
  const dominant = centroids[counts.indexOf(Math.max(...counts))];
  const lab = rgbToLab(dominant.r, dominant.g, dominant.b);
  const ita = Math.abs(lab.b) < 0.01 ? (lab.l > 50 ? 90 : -90) : (Math.atan((lab.l - 50) / lab.b) * 180) / Math.PI;
  return { lstar: Math.round(lab.l * 10) / 10, ita: Math.round(ita * 10) / 10 };
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

const ATTR_THRESHOLDS: Record<SkinAttr, [number, number]> = {
  oil: [0.05, 0.16],
  redness: [0.012, 0.03],
  pores: [0.085, 0.14],
};

const ATTR_RAW_KEY: Record<SkinAttr, "shine" | "relRedness" | "cov"> = {
  oil: "shine",
  redness: "relRedness",
  pores: "cov",
};

function levelFor(attr: SkinAttr, value: number): SkinLevel {
  const [lo, hi] = ATTR_THRESHOLDS[attr];
  return (value < lo ? 0 : value < hi ? 1 : 2) as SkinLevel;
}

// Gray-world illuminant gains from the FULL frame (background included, sub-
// sampled). Applied only to the tone estimate — oil/redness/pores stay on the
// self-relative measures that already cancel a global color cast. Gains are
// clamped so extreme scenes cannot invent a tone shift.
function frameChannelGains(data: Uint8ClampedArray, width: number, height: number): { r: number; g: number; b: number } {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  const stepY = Math.max(1, Math.floor(height / 60));
  const stepX = Math.max(1, Math.floor(width / 60));
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const o = (y * width + x) * 4;
      sumR += data[o];
      sumG += data[o + 1];
      sumB += data[o + 2];
      count += 1;
    }
  }
  if (!count) return { r: 1, g: 1, b: 1 };
  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  const gray = (meanR + meanG + meanB) / 3;
  const gain = (mean: number) => Math.min(1.6, Math.max(0.6, gray / Math.max(1, mean)));
  return { r: gain(meanR), g: gain(meanG), b: gain(meanB) };
}

function extractRawFeatures(imageData: ImageData, landmarks: LM[]): SkinRawFeatures | null {
  const { data, width: w, height: h } = imageData;
  const tzone = sampleRegion(data, w, h, landmarks, TZONE);
  const cheeks = sampleRegion(data, w, h, landmarks, CHEEKS);
  if (!tzone || !cheeks || tzone.n < 40 || cheeks.n < 40) return null;

  const cheekL = lum(cheeks.meanR, cheeks.meanG, cheeks.meanB);
  const tzoneL = lum(tzone.meanR, tzone.meanG, tzone.meanB);
  const rIdx = (m: RegionStats) => m.meanR / (m.meanR + m.meanG + m.meanB || 1);
  const gains = frameChannelGains(data, w, h);
  const balance = (pixel: SkinPixel): SkinPixel => ({
    r: Math.min(255, pixel.r * gains.r),
    g: Math.min(255, pixel.g * gains.g),
    b: Math.min(255, pixel.b * gains.b),
    L: pixel.L,
  });
  const tone = dominantTone(cheeks.pixels.map(balance)) ?? (() => {
    const lab = rgbToLab(
      Math.min(255, cheeks.meanR * gains.r),
      Math.min(255, cheeks.meanG * gains.g),
      Math.min(255, cheeks.meanB * gains.b)
    );
    const ita = Math.abs(lab.b) < 0.01 ? (lab.l > 50 ? 90 : -90) : (Math.atan((lab.l - 50) / lab.b) * 180) / Math.PI;
    return { lstar: Math.round(lab.l * 10) / 10, ita: Math.round(ita * 10) / 10 };
  })();

  return {
    shine: tzone.specularRatio + Math.max(0, (tzoneL - cheekL) / 255),
    relRedness: rIdx(cheeks) - rIdx(tzone),
    cov: cheeks.texture / (cheekL || 1),
    tzoneL,
    cheekL,
    cheekTexture: cheeks.texture,
    tzoneSpecular: tzone.specularRatio,
    cheekSamples: cheeks.n,
    tzoneSamples: tzone.n,
    toneLstar: tone.lstar,
    toneIta: tone.ita,
  };
}

function readsFromRaw(raw: SkinRawFeatures, ml?: MlVisiblePrediction | null, burst?: BurstInfo): SkinReads {
  const oil = bucket("oil", raw.shine, ...ATTR_THRESHOLDS.oil, distanceConfidence(raw.shine, ...ATTR_THRESHOLDS.oil));
  const redness = bucket("redness", raw.relRedness, ...ATTR_THRESHOLDS.redness, distanceConfidence(raw.relRedness, ...ATTR_THRESHOLDS.redness));
  const pores = bucket("pores", raw.cov, ...ATTR_THRESHOLDS.pores, distanceConfidence(raw.cov, ...ATTR_THRESHOLDS.pores));

  const merged = mergeMlPrediction({ oil, redness, pores }, ml);
  const signals = buildSignals(raw);
  const signalScore = signals.filter((signal) => signal.ok).length / signals.length;
  const attrConfidence = (merged.oil.confidence ?? 0.6) * 0.34 + (merged.redness.confidence ?? 0.6) * 0.33 + (merged.pores.confidence ?? 0.6) * 0.33;
  const meanAgreement = burst ? (burst.agreement.oil + burst.agreement.redness + burst.agreement.pores) / 3 : 1;
  const confidence = clamp01((attrConfidence * 0.72 + signalScore * 0.28) * (burst ? 0.9 + 0.1 * meanAgreement : 1));
  const retakeReasons = signals.filter((signal) => !signal.ok).map((signal) => signal.detail);
  if (burst && meanAgreement < 0.67) retakeReasons.push("촬영 프레임 사이에 신호가 조금 흔들렸어요");

  // Extra visible reads (observational only — no quantities, no claims).
  const toneDiff = Math.abs(raw.tzoneL - raw.cheekL) / Math.max(1, raw.cheekL);
  const toneEven: SkinExtraRead =
    toneDiff < 0.06
      ? { label: "톤 균일감", value: "고르게 보여요", calm: true, note: "이마와 볼 밝기가 비슷하게 읽혔어요." }
      : toneDiff < 0.13
        ? {
            label: "톤 균일감",
            value: "약간 차이",
            calm: false,
            note: raw.tzoneL > raw.cheekL ? "T존이 볼보다 조금 밝게 읽혔어요." : "볼이 T존보다 조금 밝게 읽혔어요.",
          }
        : { label: "톤 균일감", value: "차이 보임", calm: false, note: "부위별 밝기 차이가 커요. 조명 영향일 수도 있어요." };
  const gloss: SkinExtraRead =
    raw.tzoneSpecular < 0.04
      ? { label: "T존 반사광", value: "낮음", calm: true, note: "이마 번들거림 반사가 크지 않아요." }
      : raw.tzoneSpecular < 0.1
        ? { label: "T존 반사광", value: "보통", calm: true, note: "이마에 옅은 반사가 보여요." }
        : { label: "T존 반사광", value: "높음", calm: false, note: "이마 반사가 강해요. 유분 또는 조명 영향이에요." };

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
    burst,
    extras: [toneEven, gloss],
  };
}

export function analyzeSkin(imageData: ImageData, landmarks: LM[], ml?: MlVisiblePrediction | null): SkinReads | null {
  const raw = extractRawFeatures(imageData, landmarks);
  return raw ? readsFromRaw(raw, ml) : null;
}

/**
 * Burst analysis: fuse several frames captured ~100-200ms apart by taking the
 * per-feature median, which suppresses one-frame specular spikes and motion
 * noise. Per-attribute agreement across frames feeds confidence and the
 * retake decision, and is recorded in labels for ML calibration.
 */
export function analyzeSkinBurst(
  frames: Array<{ imageData: ImageData; landmarks: LM[] }>,
  ml?: MlVisiblePrediction | null
): SkinReads | null {
  const raws = frames
    .map((frame) => extractRawFeatures(frame.imageData, frame.landmarks))
    .filter((raw): raw is SkinRawFeatures => raw !== null);
  if (!raws.length) return null;
  if (raws.length === 1) return readsFromRaw(raws[0], ml);

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    // True median: with an even count (a burst frame dropped), average the two
    // middle values — taking the upper one would let a spike frame win.
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const fused = {} as SkinRawFeatures;
  for (const key of Object.keys(raws[0]) as (keyof SkinRawFeatures)[]) {
    fused[key] = median(raws.map((raw) => raw[key]));
  }

  const agreement = {} as BurstInfo["agreement"];
  for (const attr of Object.keys(ATTR_RAW_KEY) as SkinAttr[]) {
    const finalLevel = levelFor(attr, fused[ATTR_RAW_KEY[attr]]);
    agreement[attr] = raws.filter((raw) => levelFor(attr, raw[ATTR_RAW_KEY[attr]]) === finalLevel).length / raws.length;
  }

  return readsFromRaw(fused, ml, { frames: raws.length, agreement });
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
  if (process.env.NEXT_PUBLIC_VISIBLE_ATTR_MODEL !== "on") return null;
  const manifest = await loadVisibleModelManifest();
  if (!manifest || manifest.status !== "active" || !manifest.modelPath) return null;

  // ONNX runtime is intentionally not bundled until Pilot 1 produces enough
  // consented crops. The manifest/flag path keeps promotion mechanics stable.
  return null;
}

function loadVisibleModelManifest(): Promise<VisibleModelManifest | null> {
  if (visibleManifestPromise) return visibleManifestPromise;
  visibleManifestPromise = fetch("/models/visible-attributes/manifest.json", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() as Promise<VisibleModelManifest> : null))
    .catch(() => null);
  return visibleManifestPromise;
}
