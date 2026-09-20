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
  /**
   * Share of the sampled CHEEK patch with at least one channel pinned at 255.
   * A capture-health number, not a graded index: `relRedness` and `cov` are both
   * computed from this patch, and a clipped pixel destroys the information they
   * read. Watched by the 노출 여유 signal in `buildSignals`.
   */
  cheekClipped: number;
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

export type LM = { x: number; y: number; z?: number };
export type SkinPixel = { r: number; g: number; b: number; L: number };
export type RegionStats = {
  meanR: number;
  meanG: number;
  meanB: number;
  meanL: number;
  specularRatio: number;
  /**
   * Share of the UNTRIMMED patch with at least one channel at the 8-bit ceiling.
   * Untrimmed for the same reason `specularRatio` is: the trim drops the brightest
   * decile, which is exactly where clipping lives, so a trimmed count would hide
   * the thing it exists to report.
   */
  clippedRatio: number;
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
  // Bumped 09-18: `shine`'s brightness-gap term divides by the capture's own cheek
  // luminance instead of by the constant 255, so the oil index no longer grows with
  // exposure. Values collected before this string carry a factor of roughly
  // cheekL/140 on that term and must not be pooled with ones after it.
  // Measurements in docs/label-free-axes.md.
  // Note the five "Bumped" lines describe fallbackVersion below, not
  // inputSchemaVersion above: the crop contract the model consumes is unchanged, the
  // derived feature values are not. Keep the manifest's copy in step.
  fallbackVersion: "roi-calibrated-2026-09-18",
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

/**
 * The four functions below are exported ONLY so tests/scan-cost-benchmark.test.ts can
 * time each phase of a scan as it actually ships, rather than against a copy that
 * drifts. Same reason `confidenceLabel` and `distanceConfidence` are exported. Nothing
 * outside lib/skin.ts calls them in the product: `extractRawFeatures` is reached through
 * `analyzeSkin`/`analyzeSkinBurst`, and the other three only through it.
 */
export function sampleRegion(data: Uint8ClampedArray, w: number, h: number, landmarks: LM[], indices: number[], radius = 4): RegionStats | null {
  const collected: SkinPixel[] = [];
  let specular = 0;
  let clipped = 0;
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
        if (r >= 255 || g >= 255 || b >= 255) clipped += 1;
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
    clippedRatio: clipped / collected.length,
    texture: Math.sqrt(variance),
    highFreq: hfCount ? hfSum / hfCount : 0,
    n: collected.length,
    pixels: kept,
  };
}

/** sRGB transfer curve, one channel, 0-255 in, linear 0-1 out. */
function srgbLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** CIELAB's f(t), with the CIE 1976 linear segment below the epsilon knee. */
function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

/**
 * a* alone. The blemish detector runs this once per valid grid cell — about
 * 18,000 times a frame — and reads nothing else, so b* is dead work there: it
 * needs z, a third f(), and an object to carry three fields where one number
 * would do.
 *
 * This is NOT a second formula for a*. `rgbToLab` below calls it, so a* has one
 * implementation in this file and the two cannot drift; what the fast path skips
 * is L* and b*, which it does not compute at all. The cross-language contract is
 * `ml/index-parity.json` -> `rgb_to_lab`, which pins the shared inputs against
 * `ml/ita.py` and states there which outputs this entry point does not produce.
 * Tolerance and the measurement that set it: docs/rgb-to-lab-parity.md.
 */
export function labAStar(r: number, g: number, b: number): number {
  const rl = srgbLinear(r);
  const gl = srgbLinear(g);
  const bl = srgbLinear(b);
  // sRGB -> XYZ (D65), normalized to reference white. z is not needed for a*.
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  return 500 * (labF(x) - labF(y));
}

/**
 * Individual Typology Angle in degrees, in one place.
 *
 * Extracted from `dominantTone` and from `extractRawFeatures`'s fallback on 2026-09-20
 * with the expression byte-for-byte unchanged and both call sites delegating to it, so
 * no published value moved — `tests/tone-ita-contract.test.ts`'s six reference-verified
 * rows are what prove it. Before that it was written out twice in this file, which is
 * the duplication the 2026-09-15 `confidenceLabel` finding is about.
 *
 * `ml/ita.py:ita_from_lab` is the offline mirror and carries the SAME 0.01 guard.
 * `ml/skin_indices.py:ita` — the registry's declaration of what this index is — carries
 * `1e-6` instead, and that is a real divergence rather than a rounding difference: the
 * ±90 fallback ignores the SIGN of b*, so where the two guards differ, a frame with a
 * small negative b* and L* above 50 reads +90 here and about −90 there. That is
 * `light` against `deep` on `coarse_tone_band` — opposite ends of the stratifier from
 * one frame. Both implementations put a 180° discontinuity in the same place in the
 * formula and disagree about where it sits; neither is obviously the right one, so
 * `ml/index-parity.json` -> `ita` pins BOTH columns at their values, the way the
 * `roughness_ratio` group does, and the backlog carries the decision.
 */
export function itaDegrees(lstar: number, bstar: number): number {
  return Math.abs(bstar) < 0.01 ? (lstar > 50 ? 90 : -90) : (Math.atan((lstar - 50) / bstar) * 180) / Math.PI;
}

export function rgbToLab(r: number, g: number, b: number): { l: number; a: number; b: number } {
  const rl = srgbLinear(r);
  const gl = srgbLinear(g);
  const bl = srgbLinear(b);
  // sRGB -> XYZ (D65), normalized to reference white.
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;
  const fy = labF(y);
  const fz = labF(z);
  // a* delegates rather than repeating the expression: one formula, not two.
  return { l: 116 * fy - 16, a: labAStar(r, g, b), b: 200 * (fy - fz) };
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
  const ita = itaDegrees(lab.l, lab.b);
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

/**
 * Share of the sampled cheek patch that may sit at the 8-bit ceiling before the
 * capture is refused. Derived, not chosen: cycle 13 found that `relRedness` and
 * `cov` are both computed from the cheek patch and that clipping there destroys
 * them while all three previous signals still said ok.
 *
 * `tests/cheek-clipping-signal.test.ts` sweeps a family of faces (R/L 1.10..1.30,
 * texture amplitude 0.10..0.26, three T-zone scales) across the whole 조명 band and
 * buckets every capture the previous three signals passed by its clipped fraction.
 * Against the invariance the unclipped band actually delivers — cov within 1.02x and
 * relRedness within 1.08x, the tolerances tests/axis-exposure-scale.test.ts measured:
 *
 *   clipped   n     max|dCov|  max|dRed|  published level flips
 *   11.11%    20      1.89%      4.92%     0
 *   12.35%    21      1.23%      3.43%     0
 *   13.58%     5      1.40%      3.48%     0
 *   14.81%    52      1.91%      6.19%     0     <- last bucket inside both tolerances
 *   16.05%    35      2.16%      5.72%     0     <- cov leaves its 2% band
 *   19.75%    13      2.71%      6.84%     0
 *   20.99%    20      2.45%      9.48%     1     <- first published level flip
 *   22.22%    82      3.59%     14.29%    30
 *
 * So 0.15 is the one cut that sits above every bucket whose indices are still inside
 * the invariance the band delivers and below every bucket in which a published level
 * has ever moved. It is not a round number picked for looks: it lands between the last
 * clean bucket (14.81%) and the first drifting one (16.05%).
 *
 * What it costs, measured on the same family over cheekL 70..212 — of the 10,273
 * captures the previous three signals passed, 645 (6.28%) now ask for a retake, and
 * they are not spread evenly:
 *
 *   cheekL <= 140      0/5964   0.00%
 *   cheekL 140..170   33/2520   1.31%
 *   cheekL 170..190  337/1367  24.65%
 *   cheekL 190..212  275/422   65.17%
 *
 * A correctly-exposed capture does not trip it. It catches 379 of the 380 silent
 * published-level flips in that sweep; the one it misses is at cheekL 74.9 with NO
 * clipping at all — a relRedness of 0.01276 quantising down to 0.01197 across the
 * 0.012 cut, which is the dark-end 8-bit scatter cycle 13 measured and not something
 * a clipping signal can see.
 *
 * What it costs a user whose reading was fine, measured by the supervisor on the same
 * family: this signal refuses a capture some exposure BEFORE either a published level
 * moves or an older signal would have caught it anyway. That band is small and only
 * mildly tone-dependent — mean 5.6 counts of cheekL at R/L 1.223 and 7.3 at 1.30, a
 * factor of 1.30, with no face refused more than 11 counts early. Texture is not a
 * driver at all: the whole 0.10..0.42 amplitude range fits inside 10 counts at a fixed
 * R/L. Both were pre-registered as likely to be large and neither is. The band is
 * pinned rather than merely noted, because it is the number that would have to grow
 * before the signal became tone-unfair.
 */
const CHEEK_CLIP_LIMIT = 0.15;

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
      // The cheek's own 8-bit ceiling. 조명 watches the cheek's MEAN and 반사 the
      // T-zone's LUMINANCE, so a warm face can pin its red channel at 255 while both
      // still pass — and clipping delays 반사 into the bargain, because a clipped
      // pixel's computed luminance is lower than the scene's. relRedness and cov are
      // both read off this patch, so this is the signal that guards them.
      label: "노출 여유",
      ok: raw.cheekClipped < CHEEK_CLIP_LIMIT,
      detail: raw.cheekClipped >= CHEEK_CLIP_LIMIT ? "볼이 너무 밝아 색이 날아갔어요" : "볼 색에 여유가 남아 있어요",
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
 * Cycle 11 wrote this table from a script it did not commit, so cycle 12 re-derived
 * it from the description and committed the sweep behind ARU_PRINT_RETAKE_SWEEP in
 * tests/retake-signal-rule.test.ts. The numbers below are that re-run, which is NOT
 * cycle 11's: 반사 and 피부 영역 came back within a handful of seeds, and 조명 did
 * not (dark oil was recorded as 71/120 and pores as 4/120). The rule this function
 * implements is unchanged and so is the ordering the rule rests on — see the cycle 12
 * entry in docs/AUTOPILOT.md for the two constructions and why they differ.
 *
 *   조명 (cheekL 59.6-60.5, underexposed)   oil  21/120  redness  29/120  pores 120/120
 *   조명 (cheekL 214.7-215.3, blown out)    oil 120/120  redness  91/120  pores  61/120
 *   반사 (tzoneSpecular 0.296)              oil 120/120  redness 120/120  pores   0/120
 *   피부 영역 (686 cheek samples)            oil  37/120  redness  33/120  pores  49/120
 *
 * (On the blown-out row the oil and pores fixtures also trip 반사, because their own
 * T-zone patch crosses the specular cut at that exposure; the sweep prints the failed
 * set per row rather than asserting each condition is lone.)
 *
 * so every one of the three costs at least one reading on at least a sixth of the
 * seeds, and none of them reaches the 0.58 confidence floor on its own. Under the old
 * rule all of that published silently.
 *
 * Cycle 14 added a FOURTH signal, 노출 여유, so `signalScore` is now n/4 rather than
 * n/3 and the arithmetic above moves with it: the lowest confidence with 3 of 4
 * signals passing is 0.710400 (0.695 * 0.72 + 0.75 * 0.28, 0.695 being the floor of
 * `distanceConfidence` over every input), where the old 2-of-3 figure was 0.687067.
 * Both are comfortably above 0.58, so the conclusion is unchanged and it is the
 * `signals.some` clause below, not the confidence floor, that catches a lone failure.
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
 *
 * WHAT THIS LABEL REPORTS, settled at cycle 14 after eight cycles on the backlog.
 *
 * `confidence` is `(attrConfidence * 0.72 + signalScore * 0.28) * burstMultiplier`.
 * On the only path where the reading is actually used — `shouldApplyScan` in
 * lib/recommend.ts requires `!retakeRecommended`, and `retakeRecommendedFor` fails on
 * ANY failed signal since cycle 11 — `signalScore` is exactly 1 by construction. So
 * the signal term is a constant 0.28 there and carries no information; adding the
 * fourth signal widens what must pass and leaves that constant a constant. Two terms
 * are left: `attrConfidence`, the reading's distance from its cut points, and the
 * burst multiplier, frame-to-frame stability.
 *
 * The old 0.78 gate sat BELOW the reachable floor of 0.7804 (attrConfidence is bounded
 * to [0.695, 0.92] by `distanceConfidence`), so at full frame agreement 100% of the
 * reachable range read 높음 and reading margin could not move the label at all. Frame
 * wobble was the only input that ever did — which is what the user was never told:
 *
 *   meanAgreement   range             share reading 높음 at 0.78   at 0.8614
 *   1.0000          0.7804 .. 0.9424          100.0%                 50.0%
 *   0.8889          0.7717 .. 0.9319           94.8%                 44.0%
 *   0.6667          0.7544 .. 0.9110           83.6%                 31.7%
 *   0.3333          0.7284 .. 0.8796           65.9%                 12.0%
 *
 * The decision: the label reports READING MARGIN. Capture quality is already shown in
 * full — the 측정 환경 checklist in app/scan/result-card.tsx renders every signal with
 * a tick or a bang, and a failed one routes to the retake copy — and frame wobble
 * already has its own line in `retakeReasons`. Margin is the only one of the three the
 * user is told nowhere else, and it was the one the gate had collapsed.
 *
 * 0.8614 is derived, not chosen. `distanceConfidence` maps a reading sitting exactly on
 * a cut point to 0.695 and one a half-span away to 0.92; the midpoint of that axis,
 * 0.8075, is what it returns for a reading a QUARTER-span from its nearest cut. Composed
 * with the rest of the formula at full agreement, `0.8075 * 0.72 + 0.28 = 0.8614`. So
 * 높음 now means "every reading at least about a quarter-span clear of its cut", and the
 * axis splits 50/50 instead of 100/0.
 *
 * Frame wobble is not removed, it is demoted: one attribute disagreeing on one of three
 * frames multiplies by 0.988889, which decides the label only for readings inside a
 * 0.00968-wide band — 5.97% of the 0.162-wide reachable range, against a gate that used
 * to be the only thing wobble could not overrule.
 *
 * The 0.58 gate does NOT move. It is the same number `shouldApplyScan` and `overallFor`
 * compare against, so moving it here alone would desynchronise three call sites.
 *
 * One collision this exposes, pinned in tests/confidence-label-contract.test.ts rather
 * than left to be rediscovered: `mergeVisionAnalysis` caps its own confidence at 0.86,
 * which is now 0.0014 BELOW this gate, so a vision-model confidence can no longer reach
 * 높음 on its own strength — only through the `Math.max(base.confidence, ...)` that
 * carries the ROI reading's margin. That is arguably what the cap was for, but the two
 * constants were chosen independently and must not be moved independently.
 */
export function confidenceLabel(confidence: number): SkinReads["confidenceLabel"] {
  if (confidence >= 0.8614) return "높음";
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

/**
 * Cheek luminance at which `shine`'s brightness-gap term equals the `/ 255` term it
 * replaced, so these oil cuts keep meaning what they meant on a correctly-exposed
 * capture. 140 is the midpoint of the band the 조명 signal calls acceptable
 * (`buildSignals`: cheekL 70..210), which is this repository's only written
 * definition of a correctly-exposed capture.
 *
 * The constant does NOT create the exposure invariance — `(tzoneL - cheekL) / cheekL`
 * is a ratio and cancels a gain for any value of this. All it decides is WHICH
 * exposure keeps today's number, and 140 was chosen so that the cuts did not have to
 * move. Moving them instead would not have been equivalent: the cuts are compared
 * against `specularRatio + gap`, and `specularRatio` is not rescaled, so cuts scaled
 * by 255/140 drop a level on every capture whose specular ratio lands in
 * [0.05, 0.0911) or [0.16, 0.2914) — see tests/shine-exposure-scale.test.ts.
 */
export const SHINE_REFERENCE_CHEEK_L = 140;

/**
 * The oil axis's index, in one place so there is one formula to keep in step.
 *
 * `ml/skin_indices.py:shine_ratio` is the Python mirror and computes this same
 * expression; `ml/index-parity.json` is a committed table of inputs and outputs that
 * BOTH sides assert against, so the two can no longer drift apart silently the way
 * they did from 2026-09-14 (when `ml/skin_indices.py` was added, with a different
 * formula) to 2026-09-19. `tests/skin-index-contract.test.ts` pins
 * the names; `tests/index-parity.test.ts` and `ml/selftest.py` pin the values.
 *
 * Extracted from `extractRawFeatures` on 2026-09-19 with the expression byte-for-byte
 * unchanged, so no published value moved — `tests/shine-exposure-scale.test.ts` and
 * `tests/axis-exposure-scale.test.ts` pin the numbers that prove it.
 *
 * Term 1 is the share of the UNTRIMMED T-zone patch above the 218 luminance cut — a
 * count fraction, not a luminance, which is why it does not scale with exposure and
 * why the ratio form this replaced was never exposure-invariant on an actual frame
 * (docs/shine-formula-decision.md).
 * Term 2 is Weber contrast of the T-zone against the cheek, scaled so the cuts in
 * ATTR_THRESHOLDS.oil keep meaning what they meant on a correctly-exposed capture.
 */
export function shineIndex(tzoneSpecular: number, tzoneL: number, cheekL: number): number {
  return tzoneSpecular + Math.max(0, (tzoneL - cheekL) / (cheekL || 1)) * (SHINE_REFERENCE_CHEEK_L / 255);
}

/**
 * The dryness axis's index: cheek high-frequency energy against the forehead's, each
 * already divided by its own region's mean L* before it reaches here.
 *
 * 0 means "could not measure" — either patch outside the frame, or a forehead with no
 * texture to divide by. A real ratio cannot be 0 (cheek pixels always carry some
 * high-frequency energy), and the sentinel of 1 this replaced was indistinguishable
 * from a genuinely even face.
 *
 * Extracted from `extractRawFeatures` on 2026-09-19 with the expression byte-for-byte
 * unchanged, so no published value moved; `tests/skin-index-contract.test.ts` pins the
 * number that proves it. It is extracted because the Python mirror DISAGREES with it
 * and the disagreement needed somewhere to be written down:
 * `ml/skin_indices.py:roughness_ratio` is `region_highfreq / max(reference_highfreq,
 * 1e-6)`, an epsilon clamp where this returns 0, so on a forehead with no texture at
 * all the two read 320000.0 and 0 on the row `ml/index-parity.json` commits — the same
 * mechanism that made the rejected
 * `shine_ratio` read 24,691 where the app read 0.0674 (docs/shine-formula-decision.md).
 * `ml/index-parity.json` -> `roughness_ratio` holds both columns side by side so
 * neither side can move by accident. WHICH side should move is not decided there and
 * is not decided here: it is the question of which guard produces a usable dryness
 * reading on a smooth forehead, and that needs faces.
 */
export function roughnessRatio(cheekHf: number | null, foreheadHf: number | null): number {
  return cheekHf !== null && foreheadHf !== null && foreheadHf > 1e-6 ? cheekHf / foreheadHf : 0;
}

/**
 * Red chromaticity: the red channel's share of a region's total signal.
 *
 * Homogeneous of degree 0, which is the property the redness axis is built on: multiply
 * all three channels of a region by anything — an exposure change, a darker skin tone,
 * a dimmer room — and the value does not move. In exact arithmetic it does not move at
 * all; in doubles it is one correctly-rounded division, so a DIFFERENCE of two of them
 * moves by at most one ulp of 1.0, which `ml/selftest.py` derives and measures at half
 * of. `|| 1` is the black-region branch, so a region with no signal reads 0 rather than
 * NaN.
 */
export function redChromaticity(r: number, g: number, b: number): number {
  return r / (r + g + b || 1);
}

/**
 * The redness axis's index: how much redder the cheeks are than the T-zone, in one
 * place so there is one formula for both languages to agree with.
 *
 * Extracted from `extractRawFeatures` on 2026-09-20 with the expression byte-for-byte
 * unchanged, so no published value moved; the `relRedness` pins in
 * `tests/skin-index-contract.test.ts` and `tests/axis-exposure-scale.test.ts` are what
 * prove it.
 *
 * `ml/skin_indices.py:relative_redness` was a DIFFERENT formula under this same
 * declared name from 2026-09-14 to 2026-09-20 — a CIELAB a* difference, where this is a
 * difference of red chromaticities — and `FEATURE_KEY` declared the two to be one
 * field. The Python side moved to this one, and it moved on a measurement rather than
 * on which was more standard: an a* difference is NOT scale-free. a* is homogeneous of
 * degree 1/3 in the linear signal and the linear signal is homogeneous of degree 2.4 in
 * the channel, so a common exposure gain g takes an a* DIFFERENCE to g^0.8 times
 * itself — it factors out of the difference instead of cancelling in it. Measured on
 * one face across the 조명 band, the a* form runs 1.83 -> 3.96 while this one holds
 * within 1.025x. docs/redness-formula-decision.md, and
 * `tests/redness-formula-decision.test.ts` is the re-runnable sweep.
 */
export function relativeRedness(
  cheek: Pick<RegionStats, "meanR" | "meanG" | "meanB">,
  tzone: Pick<RegionStats, "meanR" | "meanG" | "meanB">,
): number {
  return redChromaticity(cheek.meanR, cheek.meanG, cheek.meanB) - redChromaticity(tzone.meanR, tzone.meanG, tzone.meanB);
}

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
export function frameChannelGains(data: Uint8ClampedArray, width: number, height: number): { r: number; g: number; b: number } {
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

/**
 * Spread of a set of L* values divided by their mean. `toneSpread`'s whole formula.
 *
 * `ml/skin_indices.py:tone_evenness` is the Python mirror and its docstring has
 * claimed since 2026-09-14 to be "the same formula as `relativeSpread` in
 * lib/skin.ts". As of 2026-09-19 that claim is checked rather than asserted:
 * `ml/index-parity.json` carries inputs and expected outputs that both sides run.
 * Exported for that test only — the claim's `shine_ratio` counterpart turned out to
 * be false, and the name-level contract test could never have caught it
 * (docs/shine-formula-decision.md).
 */
export function relativeSpread(values: number[]): number {
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
export function detectBlemishes(
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
  const excludeRSq = excludeR * excludeR;
  // The exclusion test used to run all ~42 non-skin points against every one of the
  // ~18,000 grid cells. `cy` depends only on `gy`, so a point further than excludeR in
  // y alone can never be within excludeR, and the predicate is a plain OR over the
  // points: dropping those once per ROW is exactly the same test, not an
  // approximation. Eyes, brows, lips and nostrils each sit in a narrow y band, so most
  // rows keep a handful of points or none.
  // Measured by rebuilding this file with the loop it replaced and checking both
  // builds return the same count first: 2.19-3.00ms saved per frame at 400x480 falling
  // to 0.99-1.62ms at 1440x1920, against a detectBlemishes of 5.18-10.21ms — 3.0-9.0ms
  // per three-frame scan on the build container, which is not a phone.
  // docs/scan-cost-measurement.md; ARU_PRINT_SCAN_COST=1 npx vitest run
  // tests/scan-cost-benchmark.test.ts re-derives every figure in it.
  const rowPoints: Array<{ x: number; y: number }> = [];
  for (let gy = 0; gy < gh; gy += 1) {
    const cy = y0 + gy * stride;
    if (cy >= h) continue;
    rowPoints.length = 0;
    for (const point of excluded) {
      const dy = cy - point.y;
      if (dy * dy < excludeRSq) rowPoints.push(point);
    }
    for (let gx = 0; gx < gw; gx += 1) {
      const cx = x0 + gx * stride;
      if (cx >= w) continue;
      let nearNonSkin = false;
      for (const point of rowPoints) {
        const dx = cx - point.x;
        const dy = cy - point.y;
        if (dx * dx + dy * dy < excludeRSq) {
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
      astar[gy * gw + gx] = labAStar(Math.min(255, r * gains.r), Math.min(255, g * gains.g), Math.min(255, b * gains.b));
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

export function extractRawFeatures(imageData: ImageData, landmarks: LM[]): SkinRawFeatures | null {
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
  const gains = frameChannelGains(data, w, h);
  // Unbalanced on purpose — see the frameChannelGains comment. The same cheek
  // pixels must yield the same band whatever is behind the person, and must match
  // what ml/ita.py computes from a dataset image of the same face.
  const tone = dominantTone(cheeks.pixels) ?? (() => {
    const lab = rgbToLab(cheeks.meanR, cheeks.meanG, cheeks.meanB);
    const ita = itaDegrees(lab.l, lab.b);
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
    // Both terms are within-image, which is the contract docs/label-free-axes.md
    // states and the second term used to break: it divided the T-zone/cheek
    // brightness gap by the constant 255 instead of by the capture, so the oil index
    // grew with how bright the photo was. Weber contrast against the cheek fixes
    // that the same way `cov` below divides by `cheekL`. Measured: at a fixed
    // tzoneL/cheekL of 1.08 the old term ran 0.0254 -> 0.0595 across cheekL 80..200
    // (x2.34) and flipped the published level between cheekL 140 and 160 — on
    // captures where all three signals passed, so nothing asked for a retake.
    shine: shineIndex(tzone.specularRatio, tzoneL, cheekL),
    // Both measured exposure-invariant across cheekL 71.2..172.8 at a fixed relative
    // face structure — cov within 1.0092x, relRedness within 1.0587x — so neither carries the
    // absolute term `shine` did. Above that they collapse, and it is the 8-bit ceiling
    // rather than the normalisation: the CHEEK's red channel can pin at 255 before any
    // T-zone luminance crosses the 218 the 반사 signal watches, so the capture is
    // published. At cheekL 190.7 on an R/L 1.223 face, 25.9% of the cheek patch is
    // clipped, the pores level drops a bucket, and all three signals still say ok; a
    // control face with the same texture and the same relRedness but R/L 1.10 holds
    // flat over the identical sweep. Swept on R/L itself, that silent window opens
    // between 1.17 (holds) and 1.20 (flips). Where real captures sit in that band is
    // NOT known here: the 1.2 this repository's fixtures use comes from its own
    // [196, 152, 140] skin constant (R/L 1.1967), which is a fixture and not a
    // measurement. tests/axis-exposure-scale.test.ts, docs/label-free-axes.md.
    relRedness: relativeRedness(cheeks, tzone),
    cov: cheeks.texture / (cheekL || 1),
    tzoneL,
    cheekL,
    cheekTexture: cheeks.texture,
    tzoneSpecular: tzone.specularRatio,
    cheekClipped: cheeks.clippedRatio,
    cheekSamples: cheeks.n,
    tzoneSamples: tzone.n,
    toneLstar: tone.lstar,
    toneIta: tone.ita,
    toneSpread: relativeSpread(regionLstars),
    roughnessRatio: roughnessRatio(cheekHf, foreheadHf),
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
