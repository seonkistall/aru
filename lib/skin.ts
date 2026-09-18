/**
 * Visible-signal skin analysis.
 *
 * The current runtime is a calibrated ROI feature model with a stable interface
 * for a future MobileNet/ONNX model. It is cosmetic guidance only, not medical
 * diagnosis.
 */

import { getLang, t } from "./i18n/core";

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
  /**
   * Within-image indices for the axes with no shippable public dataset
   * (docs/label-free-axes.md). Each compares regions of the SAME frame, so the
   * device and illuminant terms — which explain ~200x more colour variance than
   * the subject's skin does — largely cancel. Recorded for calibration; the
   * product grades none of them until ml/calibrate.py has cut points.
   */
  /** Relative spread of L* across forehead / both cheeks / chin. Evenness, not lightness. */
  toneSpread: number;
  /** Cheek high-frequency energy over forehead high-frequency energy, each brightness-normalised. 0 = not measurable. */
  roughnessRatio: number;
  /** Local a* maxima found on the sampled face area. */
  blemishCount: number;
  /** Those maxima per megapixel of sampled face area. */
  blemishDensity: number;
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
  /** Mean |L - mean(4-neighbour L)| over non-specular pixels: local detail, with
   *  the region's slow shading gradient removed. `texture` keeps that gradient. */
  highFreq: number;
  n: number;
  pixels: SkinPixel[];
};

const TZONE = [9, 8, 107, 336, 151, 10, 67, 297, 1, 4, 5, 195, 197];
const CHEEKS = [50, 101, 118, 117, 116, 205, 36, 280, 330, 347, 346, 345, 425, 266];

// Tone evenness needs regions, not one average, so the T-zone and cheek unions
// above are split into the four patches it compares. FOREHEAD is TZONE minus the
// nose bridge; LEFT_CHEEK + RIGHT_CHEEK is exactly CHEEKS. Oil, redness and pores
// keep reading the unions, so their calibrated thresholds are untouched.
const FOREHEAD = [9, 8, 107, 336, 151, 10, 67, 297];
const LEFT_CHEEK = [50, 101, 118, 117, 116, 205, 36];
const RIGHT_CHEEK = [280, 330, 347, 346, 345, 425, 266];
const CHIN = [18, 200, 199, 175, 152, 83, 313];

// Landmarks whose neighbourhood is not skin. Brows, lashes, lid shadow, lips and
// nostrils all read as local a* maxima, which is exactly what a blemish looks
// like to the detector below.
const NON_SKIN = [
  33, 133, 159, 145, 153, 157, 173, 246, // left eye
  362, 263, 386, 374, 380, 385, 398, 466, // right eye
  70, 63, 105, 66, 107, 336, 296, 334, 293, 300, // brows
  61, 291, 13, 14, 0, 17, 78, 308, 39, 269, // lips
  94, 99, 328, 2, // nostrils / philtrum
];

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
  // Bumped 09-14: within-image indices added (toneSpread, roughnessRatio,
  // blemish count/density) and tone evenness now reads the four-region spread.
  // Bumped 09-16: toneIta/toneLstar are measured on the captured pixels rather than
  // gray-world-balanced ones, so they differ from every sample collected before this
  // date and must not be pooled with them when thresholds are drawn — the rule in
  // docs/label-free-axes.md. Measurements in docs/tone-ita-verification.md.
  // Bumped 09-16b: blemishDensity is blemishes per face-width-squared of sampled
  // skin, not per megapixel of it. Every value collected before this string is on a
  // scale that depends on the capture resolution and must not be pooled with one
  // after it. Measurements in docs/capture-resolution-invariance.md.
  // Note the four "Bumped" lines describe fallbackVersion below, not
  // inputSchemaVersion above: the crop contract the model consumes is unchanged, the
  // derived feature values are not. Keep the manifest's copy in step.
  fallbackVersion: "roi-calibrated-2026-09-16c",
  targetModel: "mobilenetv3-small-visible-attributes",
};

let visibleManifestPromise: Promise<VisibleModelManifest | null> | null = null;

function lum(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function lumAt(data: Uint8ClampedArray, w: number, x: number, y: number) {
  const o = (y * w + x) * 4;
  return lum(data[o], data[o + 1], data[o + 2]);
}

function sampleRegion(data: Uint8ClampedArray, w: number, h: number, landmarks: LM[], indices: number[], radius = 4): RegionStats | null {
  const collected: SkinPixel[] = [];
  let specular = 0;
  let hfSum = 0;
  let hfCount = 0;

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
        // A glint is not texture, and an edge pixel has no four neighbours.
        else if (x > 0 && y > 0 && x + 1 < w && y + 1 < h) {
          const neighbours =
            (lumAt(data, w, x - 1, y) + lumAt(data, w, x + 1, y) + lumAt(data, w, x, y - 1) + lumAt(data, w, x, y + 1)) / 4;
          hfSum += Math.abs(L - neighbours);
          hfCount += 1;
        }
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
    highFreq: hfCount ? hfSum / hfCount : 0,
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

// Confidence in a bucketed reading is a function of how far the value sits from
// the nearest CUT POINT: a reading that lands on lo or hi could have gone either
// way, and one far outside the band is unambiguous.
//
// The previous form measured the out-of-band distance from the cut point but
// still SUBTRACTED it, so confidence fell as a reading became less ambiguous —
// it peaked at 0.916 a hair below `lo` and decayed to 0 for a plainly calm or
// plainly pronounced face. Sweeping a plausible feature grid (shine 0-0.5,
// relRedness -0.03-0.08, cov 0-0.3 at 51 steps each, all three capture signals
// passing), 41.54% of it scored under the 0.58 gate — so `readsFromRaw` labelled
// those captures 재촬영 권장 with an EMPTY `retakeReasons`, and `shouldApplyScan`
// in lib/recommend.ts discarded the scan. That share is now 0%, and no point on
// the grid moved the other way.
//
// Both branches now rise away from the cut points and meet at 0.695 on them.
// The function is unchanged in-band, but the COMPOSITE range moves: with all
// three signals passing, `readsFromRaw`'s confidence now lands in
// [0.7804, 0.9424], so `confidenceLabel` reads 높음 for any well-captured frame
// and no longer varies with how ambiguous the readings are. Whether the
// three-level label should still carry that is a live backlog item; do not
// nudge 0.695 or the 0.78 threshold without reading it.
export function distanceConfidence(value: number, lo: number, hi: number) {
  const span = Math.max(0.0001, hi - lo);
  if (value < lo || value > hi) {
    const beyond = Math.min(1, (value < lo ? lo - value : value - hi) / span);
    return clamp01(0.695 + beyond * 0.225);
  }
  const distance = Math.abs(value - (lo + hi) / 2) / span;
  return clamp01(0.92 - distance * 0.45);
}

// Kept as raw Korean data: lib/report-trust.ts matches on these strings and
// consumers translate at render (t(signal.label) / t(signal.detail)).
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

/**
 * Whether the capture should be retaken. Keyed on WHICH signals failed, never on
 * how many entries `retakeReasons` happens to hold — the array also carries the
 * burst frame-wobble line, which is not a capture signal and must not move this
 * gate. Shared with the vision-API merge in app/scan/capture-analysis.ts so the
 * two paths cannot drift.
 *
 * ANY ONE failed signal recommends a retake. That is stricter than the
 * `retakeReasons.length >= 2` count it replaces, and it is what the measurement
 * supports: on 120 seeded synthetic captures per condition, with each attribute's
 * raw value tuned onto its own cut point, a lone failure disagreed with a clean
 * capture of the same face on a PUBLISHED level at these rates —
 *
 *   조명 alone (cheekL 51-69, underexposed)  oil 71/120   redness 0/120   pores  4/120
 *   조명 alone (cheekL 214-226, blown out)   oil 120/120  redness 120/120 pores  0/120
 *   반사 alone (tzoneSpecular 0.296)         oil 120/120  redness 116/120 pores  0/120
 *   피부 영역 alone (686 cheek samples)       oil 42/120   redness 22/120  pores 49/120
 *
 * so every one of the three costs at least one reading more than a third of the
 * time, and none of them reaches the 0.58 confidence floor on its own: the lowest
 * confidence with 2 of 3 signals passing is 0.687067 (0.695 * 0.72 + (2/3) * 0.28,
 * 0.695 being the floor of `distanceConfidence` over every input). Under the old
 * rule all of that published silently.
 *
 * It errs towards asking for a retake, deliberately: a retake prompt on a capture
 * that would have read correctly costs one tap, and a wrong level costs the reading
 * AND the recommendation built on it — `shouldApplyScan` in lib/recommend.ts drops
 * a retake-recommended scan, so a bad reading that stays under the gate does not.
 */
export function retakeRecommendedFor(confidence: number, signals: ConfidenceSignal[]): boolean {
  return confidence < 0.58 || signals.some((signal) => !signal.ok);
}

/**
 * Exported only so tests/confidence-label-contract.test.ts can hold it against the
 * byte-for-byte copy in app/scan/capture-analysis.ts. The two call sites have
 * different shapes and merging them would be wider than the problem; what is worth
 * preventing is one threshold moving without the other.
 */
export function confidenceLabel(confidence: number): SkinReads["confidenceLabel"] {
  if (confidence >= 0.78) return "높음";
  if (confidence >= 0.58) return "보통";
  return "낮음";
}

/**
 * Stored as raw Korean (SkinReads is persisted to localStorage across language
 * switches) — consumers translate at render via t()/localizedNarrative.
 *
 * Exported because `mergeVisionAnalysis` rewrites the three buckets and has to
 * rederive everything that was derived from them. While it could not, the `<h1>` on
 * /report could read 피부 컨디션이 비교적 안정적이에요 directly above a row reading
 * 붉은기 뚜렷.
 */
export function headlineFor(oil: Bucket, redness: Bucket, pores: Bucket) {
  if (redness.level >= 2) return "오늘은 진정 루틴이 먼저예요";
  if (oil.level >= 2 && pores.level >= 1) return "T존 유분과 피부결을 함께 볼게요";
  if (oil.level >= 2) return "T존 유분이 도드라져 보여요";
  if (pores.level >= 2) return "볼 쪽 피부결이 또렷하게 보여요";
  return "피부 컨디션이 비교적 안정적이에요";
}

function narrativeParts(oil: Bucket, redness: Bucket, pores: Bucket) {
  return [
    oil.level === 0 ? "T존 번들거림은 크지 않고" : oil.level === 1 ? "T존에 유분감이 조금 보이고" : "T존 유분감이 비교적 뚜렷하고",
    redness.level === 0 ? "볼의 붉은기는 낮게 보여요" : redness.level === 1 ? "볼에 옅은 붉은기가 보여요" : "볼의 붉은기가 눈에 띄어요",
    pores.level === 0 ? "피부결은 매끈한 편이에요" : pores.level === 1 ? "피부결은 약간 보이는 편이에요" : "피부결과 모공감이 또렷해 보여요",
  ];
}

export function narrativeFor(oil: Bucket, redness: Bucket, pores: Bucket) {
  const parts = narrativeParts(oil, redness, pores);
  return `${parts[0]}, ${parts[1]}. ${parts[2]}.`;
}

/** The 전반 row. Derived from the same three buckets, so it moves with them. */
export function overallFor(oil: Bucket, redness: Bucket, pores: Bucket, confidence: number): Bucket {
  const concerns = [oil, redness, pores].filter((b) => b.level > 0).length;
  if (confidence < 0.58) return { value: "재촬영 권장", level: 1, calm: false, confidence };
  if (concerns >= 2) return { value: "균형 관리 필요", level: 2, calm: false, confidence };
  return { value: "대체로 안정", level: 0, calm: true, confidence };
}

// Render-time translation of the narrative: the stored narrative is one
// assembled Korean sentence (not a dictionary key), so rebuild it from the
// persisted bucket levels in the active language. In Korean, prefer the
// stored narrative (it may carry vision-API nuance beyond the template).
export function localizedNarrative(reads: Pick<SkinReads, "oil" | "redness" | "pores"> & { narrative?: string }): string {
  if (getLang() === "ko" && reads.narrative && /[가-힣]/.test(reads.narrative)) return reads.narrative;
  const parts = narrativeParts(reads.oil, reads.redness, reads.pores).map((part) => t(part));
  return `${parts[0]}, ${parts[1]}. ${parts[2]}.`;
}

export const ATTR_THRESHOLDS: Record<SkinAttr, [number, number]> = {
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
// sampled). oil/redness/pores stay on the self-relative measures that already
// cancel a global color cast; these feed the blemish a* threshold and the
// toneSpread region comparison, both of which are ratios within one frame and so
// only need the cast removed consistently, not correctly.
//
// NOT applied to toneIta/toneLstar. Gray-world estimates the illuminant from the
// whole frame, so a coloured wall behind the user is read as coloured light and
// divided out of their face. Measured on one synthetic face held fixed while only
// the background changed, toneIta ran 75.2 / 73.3 / 82.3 / 49.2 / -60.5 across a
// grey, white, dark, blue and warm-wood wall — very_light, very_light, very_light,
// light and brown_dark, so three of the five bands and the full width of the scale
// from one face. The clamp below bounds each gain but not
// the angle: ITA divides by b*, so a gain pair that drags b* through zero flips the
// sign whatever the clamp. Tone is therefore measured on the pixels as captured,
// which is also what ml/ita.py does offline and what its "change one, change both"
// contract requires. See docs/tone-ita-verification.md.
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

/**
 * Within-image indices for the axes no public dataset can supervise.
 *
 * The constants below are starting points, not validated cut points. What they
 * produce is a number whose ordering is meaningful; where the grade boundaries
 * sit is `ml/calibrate.py`'s job, and until it has run these feed nothing the
 * user sees. Mirrored in `ml/skin_indices.py`, held together by
 * tests/skin-index-contract.test.ts.
 */
const BLEMISH = {
  /** Face width in grid cells — sets the sampling stride. */
  gridAcrossFace: 90,
  /** Local-background window radius, in cells. ~6% of face width. */
  backgroundRadius: 5,
  /** Non-maximum suppression radius, in cells: one blemish, one count. */
  suppressionRadius: 2,
  /** a* units a candidate must clear above its own local background. */
  minResidual: 1.6,
  /** Exclusion radius around a non-skin landmark, as a fraction of face width. */
  excludeFraction: 0.055,
};

function relativeSpread(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  if (Math.abs(mean) < 1e-6) return 0;
  const variance = values.reduce((acc, value) => acc + (value - mean) * (value - mean), 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

/**
 * Blemish count over the sampled face area.
 *
 * Morphology, not colour level: a spot is a small local maximum of a* against
 * the skin immediately around it, so the count survives the device shifting
 * every a* in the frame by the same amount. Eyes, brows, lips and nostrils are
 * cut out because each of them is also a local a* maximum.
 *
 * The sampled area is returned in FACE WIDTHS SQUARED, not in capture pixels.
 * The detector walks a grid whose stride is a fraction of the face width, so the
 * count is already a face-relative quantity; dividing it by an area in capture
 * pixels made the density scale as roughly 1/faceWidth^2 and put two scans of one
 * face at different capture resolutions on different scales. Measured on one
 * synthetic face over a 7.2x range of face width (docs/capture-resolution-invariance.md):
 * the pixel area moves 50.8x while `areaPx / faceW^2` moves 1.9%, from 2.0403 to
 * 2.0012 — so the face-relative area is the invariant one and this is the
 * denominator a cross-device index has to use.
 */
function detectBlemishes(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  landmarks: LM[],
  gains: { r: number; g: number; b: number }
): { count: number; areaFace: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const lm of landmarks) {
    if (!lm) continue;
    minX = Math.min(minX, lm.x * w);
    maxX = Math.max(maxX, lm.x * w);
    minY = Math.min(minY, lm.y * h);
    maxY = Math.max(maxY, lm.y * h);
  }
  const faceW = maxX - minX;
  const faceH = maxY - minY;
  if (!Number.isFinite(faceW) || faceW < 20 || faceH < 20) return { count: 0, areaFace: 0 };

  // Fractional on purpose. Rounding it to whole pixels moved the effective grid
  // between 72 and 108 cells across the face over a 7.2x resolution sweep, which
  // changes both the sampling density and — since backgroundRadius and
  // suppressionRadius are counted in CELLS — the physical size of every window the
  // detector uses. A fractional stride keeps all three fixed in face-width units.
  const stride = Math.max(1, faceW / BLEMISH.gridAcrossFace);
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const gw = Math.floor((Math.min(w - 1, Math.ceil(maxX)) - x0) / stride) + 1;
  const gh = Math.floor((Math.min(h - 1, Math.ceil(maxY)) - y0) / stride) + 1;
  if (gw < 2 * BLEMISH.backgroundRadius || gh < 2 * BLEMISH.backgroundRadius) return { count: 0, areaFace: 0 };

  const excludeR = BLEMISH.excludeFraction * faceW;
  const excluded: Array<{ x: number; y: number }> = [];
  for (const idx of NON_SKIN) {
    const lm = landmarks[idx];
    if (lm) excluded.push({ x: lm.x * w, y: lm.y * h });
  }

  const astar = new Float64Array(gw * gh);
  const valid = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const cx = x0 + gx * stride;
      const cy = y0 + gy * stride;
      if (cx >= w || cy >= h) continue;
      let nearNonSkin = false;
      for (const point of excluded) {
        const dx = cx - point.x;
        const dy = cy - point.y;
        if (dx * dx + dy * dy < excludeR * excludeR) {
          nearNonSkin = true;
          break;
        }
      }
      if (nearNonSkin) continue;
      // Average the stride window rather than reading its corner pixel. Point
      // sampling missed a blemish outright whenever it fell between two sample
      // points, so the count depended on where the grid happened to land; the
      // windows tile the face box, so this costs one pass over it however fine
      // the grid is.
      const bx0 = Math.max(0, Math.round(cx - stride / 2));
      const by0 = Math.max(0, Math.round(cy - stride / 2));
      const bx1 = Math.min(w - 1, Math.max(bx0, Math.round(cx + stride / 2) - 1));
      const by1 = Math.min(h - 1, Math.max(by0, Math.round(cy + stride / 2) - 1));
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let by = by0; by <= by1; by += 1) {
        for (let bx = bx0; bx <= bx1; bx += 1) {
          const o = (by * w + bx) * 4;
          sr += data[o];
          sg += data[o + 1];
          sb += data[o + 2];
          n += 1;
        }
      }
      if (n === 0) continue;
      const r = sr / n;
      const g = sg / n;
      const b = sb / n;
      const L = lum(r, g, b);
      // Hair, shadow and blown highlights are not gradable skin.
      if (L < 40 || L > 230 || r <= b) continue;
      const lab = rgbToLab(Math.min(255, r * gains.r), Math.min(255, g * gains.g), Math.min(255, b * gains.b));
      astar[gy * gw + gx] = lab.a;
      valid[gy * gw + gx] = 1;
    }
  }

  // Summed-area tables over valid cells only, so the local background is the
  // mean of the skin actually present in the window.
  const sw = gw + 1;
  const sumTable = new Float64Array(sw * (gh + 1));
  const countTable = new Float64Array(sw * (gh + 1));
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const i = gy * gw + gx;
      const s0 = (gy + 1) * sw + (gx + 1);
      sumTable[s0] = (valid[i] ? astar[i] : 0) + sumTable[s0 - 1] + sumTable[s0 - sw] - sumTable[s0 - sw - 1];
      countTable[s0] = (valid[i] ? 1 : 0) + countTable[s0 - 1] + countTable[s0 - sw] - countTable[s0 - sw - 1];
    }
  }
  const windowMean = (gx: number, gy: number, radius: number): number | null => {
    const lx = Math.max(0, gx - radius);
    const ly = Math.max(0, gy - radius);
    const hx = Math.min(gw - 1, gx + radius);
    const hy = Math.min(gh - 1, gy + radius);
    const a = (hy + 1) * sw + (hx + 1);
    const b = ly * sw + (hx + 1);
    const c = (hy + 1) * sw + lx;
    const d = ly * sw + lx;
    const count = countTable[a] - countTable[b] - countTable[c] + countTable[d];
    if (count < 8) return null;
    return (sumTable[a] - sumTable[b] - sumTable[c] + sumTable[d]) / count;
  };

  const residual = new Float64Array(gw * gh);
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const i = gy * gw + gx;
      if (!valid[i]) continue;
      const background = windowMean(gx, gy, BLEMISH.backgroundRadius);
      residual[i] = background === null ? 0 : astar[i] - background;
    }
  }

  let count = 0;
  let validCells = 0;
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const i = gy * gw + gx;
      if (!valid[i]) continue;
      validCells += 1;
      if (residual[i] < BLEMISH.minResidual) continue;
      let isPeak = true;
      for (let dy = -BLEMISH.suppressionRadius; dy <= BLEMISH.suppressionRadius && isPeak; dy += 1) {
        for (let dx = -BLEMISH.suppressionRadius; dx <= BLEMISH.suppressionRadius; dx += 1) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || (dx === 0 && dy === 0)) continue;
          const j = ny * gw + nx;
          // Ties go to the cell scanned first, so a plateau counts once.
          if (residual[j] > residual[i] || (residual[j] === residual[i] && j < i)) {
            isPeak = false;
            break;
          }
        }
      }
      if (isPeak) count += 1;
    }
  }

  return { count, areaFace: (validCells * stride * stride) / (faceW * faceW) };
}

function extractRawFeatures(imageData: ImageData, landmarks: LM[]): SkinRawFeatures | null {
  const { data, width: w, height: h } = imageData;
  const tzone = sampleRegion(data, w, h, landmarks, TZONE);
  const cheeks = sampleRegion(data, w, h, landmarks, CHEEKS);
  if (!tzone || !cheeks || tzone.n < 40 || cheeks.n < 40) return null;
  const forehead = sampleRegion(data, w, h, landmarks, FOREHEAD);
  const leftCheek = sampleRegion(data, w, h, landmarks, LEFT_CHEEK);
  const rightCheek = sampleRegion(data, w, h, landmarks, RIGHT_CHEEK);
  const chin = sampleRegion(data, w, h, landmarks, CHIN);

  const cheekL = lum(cheeks.meanR, cheeks.meanG, cheeks.meanB);
  const tzoneL = lum(tzone.meanR, tzone.meanG, tzone.meanB);
  const rIdx = (m: RegionStats) => m.meanR / (m.meanR + m.meanG + m.meanB || 1);
  const gains = frameChannelGains(data, w, h);
  // Unbalanced on purpose — see the frameChannelGains comment. The same cheek
  // pixels must yield the same band whatever is behind the person, and must match
  // what ml/ita.py computes from a dataset image of the same face.
  const tone = dominantTone(cheeks.pixels) ?? (() => {
    const lab = rgbToLab(cheeks.meanR, cheeks.meanG, cheeks.meanB);
    const ita = Math.abs(lab.b) < 0.01 ? (lab.l > 50 ? 90 : -90) : (Math.atan((lab.l - 50) / lab.b) * 180) / Math.PI;
    return { lstar: Math.round(lab.l * 10) / 10, ita: Math.round(ita * 10) / 10 };
  })();

  // Tone evenness: spread of L* across four regions of this one frame. Divided by
  // the mean so a brighter exposure does not read as a less even face; L* itself
  // is never the reading, because how light someone is is not a skin concern.
  const labOf = (m: RegionStats) => rgbToLab(Math.min(255, m.meanR * gains.r), Math.min(255, m.meanG * gains.g), Math.min(255, m.meanB * gains.b)).l;
  const regionLstars = [forehead, leftCheek, rightCheek, chin]
    .filter((region): region is RegionStats => region !== null && region.n >= 40)
    .map(labOf);

  // Dryness: cheek detail against forehead detail, each divided by its own
  // brightness. Flaking raises the numerator; a sharpening filter raises both.
  // The weakest of the indices — phone denoising differs — so it stays recorded
  // until a survey answer sits next to it.
  const normalizedHf = (region: RegionStats | null, meanL: number) =>
    region && meanL > 1 ? region.highFreq / meanL : null;
  const cheekHf = normalizedHf(cheeks, cheekL);
  const foreheadHf = normalizedHf(forehead, forehead ? lum(forehead.meanR, forehead.meanG, forehead.meanB) : 0);

  const blemishes = detectBlemishes(data, w, h, landmarks, gains);

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
    toneSpread: relativeSpread(regionLstars),
    // 0 means "could not measure" — the forehead patch fell outside the frame. A
    // real ratio cannot be 0 (cheek pixels always carry some high-frequency energy),
    // and the previous sentinel of 1 was indistinguishable from a genuine even face.
    roughnessRatio: cheekHf !== null && foreheadHf !== null && foreheadHf > 1e-6 ? cheekHf / foreheadHf : 0,
    blemishCount: blemishes.count,
    blemishDensity: blemishes.count / Math.max(blemishes.areaFace, 1e-6),
  };
}

function readsFromRaw(raw: SkinRawFeatures, ml?: MlVisiblePrediction | null, burst?: BurstInfo): SkinReads {
  const oil = bucket("oil", raw.shine, ...ATTR_THRESHOLDS.oil, distanceConfidence(raw.shine, ...ATTR_THRESHOLDS.oil));
  const redness = bucket("redness", raw.relRedness, ...ATTR_THRESHOLDS.redness, distanceConfidence(raw.relRedness, ...ATTR_THRESHOLDS.redness));
  const pores = bucket("pores", raw.cov, ...ATTR_THRESHOLDS.pores, distanceConfidence(raw.cov, ...ATTR_THRESHOLDS.pores));

  const merged = mergeMlPrediction({ oil, redness, pores }, ml);
  const signals = buildSignals(raw);
  const signalScore = signals.filter((signal) => signal.ok).length / signals.length;
  const attrConfidence = (merged.buckets.oil.confidence ?? 0.6) * 0.34 + (merged.buckets.redness.confidence ?? 0.6) * 0.33 + (merged.buckets.pores.confidence ?? 0.6) * 0.33;
  const meanAgreement = burst ? (burst.agreement.oil + burst.agreement.redness + burst.agreement.pores) / 3 : 1;
  const confidence = clamp01((attrConfidence * 0.72 + signalScore * 0.28) * (burst ? 0.9 + 0.1 * meanAgreement : 1));
  const failedSignals = signals.filter((signal) => !signal.ok);
  const retakeReasons = failedSignals.map((signal) => signal.detail);
  // Frame wobble is a FOURTH entry in the same array, and it is not a capture
  // signal: `retakeRecommendedFor` reads `signals`, never this array's length, so
  // pushing it here cannot move the gate. See that function for why.
  if (burst && meanAgreement < 0.67) retakeReasons.push("촬영 프레임 사이에 신호가 조금 흔들렸어요");

  // Extra visible reads (observational only — no quantities, no claims).
  // Raw Korean: persisted with SkinReads, translated at render.
  // Reads the four-region L* spread now, not the T-zone/cheek luminance gap: two
  // patches cannot tell an uneven face from a brighter forehead. Cut points are
  // provisional, like every other one here, until ml/calibrate.py replaces them.
  const toneDiff = raw.toneSpread;
  const toneEven: SkinExtraRead =
    toneDiff < 0.035
      ? { label: "톤 균일감", value: "고르게 보여요", calm: true, note: "이마와 볼 밝기가 비슷하게 읽혔어요." }
      : toneDiff < 0.075
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

  const overall = overallFor(merged.buckets.oil, merged.buckets.redness, merged.buckets.pores, confidence);

  return {
    oil: merged.buckets.oil,
    pores: merged.buckets.pores,
    redness: merged.buckets.redness,
    overall,
    headline: headlineFor(merged.buckets.oil, merged.buckets.redness, merged.buckets.pores),
    narrative: narrativeFor(merged.buckets.oil, merged.buckets.redness, merged.buckets.pores),
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    retakeRecommended: retakeRecommendedFor(confidence, signals),
    retakeReasons,
    signals,
    source: merged.usedMl ? "ml-model" : "roi-calibrated",
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

function isSkinLevel(value: unknown): value is SkinLevel {
  return value === 0 || value === 1 || value === 2;
}

function isUsableConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function mergeMlPrediction(
  base: Record<SkinAttr, Bucket>,
  ml?: MlVisiblePrediction | null
): { buckets: Record<SkinAttr, Bucket>; usedMl: boolean } {
  if (!ml) return { buckets: base, usedMl: false };

  const next = { ...base };
  let usedMl = false;
  for (const attr of Object.keys(base) as SkinAttr[]) {
    const mlLevel = ml.labels[attr];
    if (!isSkinLevel(mlLevel)) continue;
    const mlConfidence = ml.confidence[attr];
    if (!isUsableConfidence(mlConfidence)) continue;
    const baseConfidence = base[attr].confidence ?? 0;
    if (mlConfidence >= 0.55 || mlConfidence >= baseConfidence) {
      next[attr] = {
        value: SKIN_LABELS[attr][mlLevel],
        level: mlLevel,
        calm: mlLevel === 0,
        confidence: Math.max(mlConfidence, baseConfidence * 0.9),
      };
      usedMl = true;
    }
  }
  return { buckets: next, usedMl };
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
