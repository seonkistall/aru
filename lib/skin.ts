/**
 * On-device skin reading (visible attributes only — qualitative, no fake numbers).
 *
 * Pipeline:
 *   selfie frame (canvas) + MediaPipe FaceLandmarker landmarks
 *     -> sample skin regions (forehead/nose T-zone, both cheeks)
 *     -> heuristic signals (specular=oil, redness, texture variance)
 *     -> qualitative buckets
 *
 * The selfie is processed in-canvas and never uploaded/stored (design decision D3).
 *
 * ── Accuracy honesty ──────────────────────────────────────────────────────────
 * These are HEURISTIC reads (rough signals from pixel statistics), not a trained
 * classifier. They give a real on-device hook but are approximate. The upgrade
 * path (C) is a trained MobileNetV2 visible-attribute classifier — see
 * `classifyVisibleAttributes` below for the integration point + references.
 */

export type Bucket = { value: string; calm?: boolean };
export type SkinReads = {
  oil: Bucket; // 유분
  pores: Bucket; // 모공/결
  redness: Bucket; // 홍조
  overall: Bucket; // 전반
  headline: string;
  /** Self-calibrated raw signals (relative, lighting-robust) — shown in debug. */
  raw: { shine: number; relRedness: number; cov: number; tzoneL: number; cheekL: number };
};

type LM = { x: number; y: number; z?: number };

// MediaPipe FaceMesh (468) landmark indices for skin regions.
const TZONE = [9, 8, 107, 336, 151, 10, 67, 297, 1, 4, 5, 195, 197]; // forehead/glabella + nose
const CHEEKS = [50, 101, 118, 117, 116, 205, 36, 280, 330, 347, 346, 345, 425, 266];

function lum(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Average + variance of a small patch around each landmark, over a region. */
function sampleRegion(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  landmarks: LM[],
  indices: number[],
  radius = 4
) {
  let sumR = 0,
    sumG = 0,
    sumB = 0,
    n = 0;
  const lums: number[] = [];
  let specular = 0;
  for (const idx of indices) {
    const lm = landmarks[idx];
    if (!lm) continue;
    const cx = Math.round(lm.x * w);
    const cy = Math.round(lm.y * h);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const o = (y * w + x) * 4;
        const r = data[o],
          g = data[o + 1],
          b = data[o + 2];
        sumR += r;
        sumG += g;
        sumB += b;
        const L = lum(r, g, b);
        lums.push(L);
        if (L > 210) specular++; // bright specular highlight (shine)
        n++;
      }
    }
  }
  if (n === 0) return null;
  const meanR = sumR / n,
    meanG = sumG / n,
    meanB = sumB / n;
  const meanL = lums.reduce((a, c) => a + c, 0) / lums.length;
  const variance =
    lums.reduce((a, c) => a + (c - meanL) * (c - meanL), 0) / lums.length;
  return {
    meanR,
    meanG,
    meanB,
    specularRatio: specular / n,
    texture: Math.sqrt(variance),
    n,
  };
}

function bucket(v: number, lo: number, hi: number, labels: [string, string, string], calmIdx?: number): Bucket {
  const i = v < lo ? 0 : v < hi ? 1 : 2;
  return { value: labels[i], calm: calmIdx === i };
}

/**
 * Compute qualitative skin reads from a captured frame + landmarks.
 * Returns null when there isn't enough valid skin signal (non-skin rejection).
 */
export function analyzeSkin(
  imageData: ImageData,
  landmarks: LM[]
): SkinReads | null {
  const { data, width: w, height: h } = imageData;
  const tzone = sampleRegion(data, w, h, landmarks, TZONE);
  const cheeks = sampleRegion(data, w, h, landmarks, CHEEKS);
  if (!tzone || !cheeks || tzone.n < 40 || cheeks.n < 40) return null;

  // Self-calibrated signals: measure each attribute RELATIVE to the face's own
  // baseline, so lighting / skin tone / camera don't shift the result.
  const cheekL = lum(cheeks.meanR, cheeks.meanG, cheeks.meanB);
  const tzoneL = lum(tzone.meanR, tzone.meanG, tzone.meanB);
  const rIdx = (m: { meanR: number; meanG: number; meanB: number }) =>
    m.meanR / (m.meanR + m.meanG + m.meanB || 1);

  // ── Oil: T-zone shine = specular + T-zone brighter than cheeks. ──
  const shine = tzone.specularRatio + Math.max(0, (tzoneL - cheekL) / 255);
  const oil = bucket(shine, 0.05, 0.16, ["거의 없음", "살짝 있음", "있는 편"], 0);

  // ── Redness: cheeks redder than the forehead/nose baseline (flush). ──
  const relRedness = rIdx(cheeks) - rIdx(tzone);
  const redness = bucket(relRedness, 0.012, 0.03, ["거의 없음", "약간 보임", "붉은기 있음"], 0);

  // ── Texture/pores: cheek variation normalized by brightness (CoV). ──
  const cov = cheeks.texture / (cheekL || 1);
  const pores = bucket(cov, 0.085, 0.14, ["매끈한 편", "신경 쓰이는 정도", "도드라짐"], 0);

  // Overall composite.
  const concerns = [oil, redness, pores].filter((b) => !b.calm).length;
  const overall: Bucket =
    concerns === 0
      ? { value: "건강한 편", calm: true }
      : concerns >= 2
      ? { value: "진정이 필요", calm: true }
      : { value: "대체로 안정", calm: true };

  const headline =
    concerns === 0
      ? "차분하고\n건강한 결"
      : redness.value === "붉은기 있음"
      ? "조금은\n예민한 결"
      : oil.value === "있는 편"
      ? "윤기 도는\n결"
      : "조금은\n목마른 결";

  return {
    oil,
    pores,
    redness,
    overall,
    headline,
    raw: { shine, relRedness, cov, tzoneL, cheekL },
  };
}

/**
 * ── C: trained classifier integration point (NOT YET WIRED) ───────────────────
 * Swap the heuristics above for a trained visible-attribute model for real
 * accuracy. Recommended path (browser, on-device):
 *
 *   model:   MobileNetV2 acne-severity (mild/moderate/severe), per
 *            "Acne Severity Classification on Mobile Devices" (IJACSA v15n6 #68,
 *            92% acc, TFLite) + Microsoft/Nestlé selfie acne work.
 *   dataset: ACNE04 (acne grading) for training; add a NON-SKIN rejection class
 *            (per IEEE 11385779, 0.97 acc w/ perfect non-skin rejection) so the
 *            model refuses non-face / bad frames.
 *   runtime: convert to ONNX -> onnxruntime-web (WASM/WebGPU), or Keras -> TF.js.
 *   input:   the MediaPipe-isolated skin crop (not the whole frame).
 *
 * Until trained weights exist, this returns null and we fall back to heuristics.
 * Do NOT claim precision we don't have.
 */
export async function classifyVisibleAttributes(
  _skinCrop: ImageData
): Promise<Partial<SkinReads> | null> {
  return null; // integration point — load ONNX/TF.js model here when available
}
