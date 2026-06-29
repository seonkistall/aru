/**
 * On-device skin reading from visible selfie signals.
 *
 * This is a heuristic, not a medical diagnosis. It gives qualitative guidance
 * from face landmarks and pixel statistics while keeping the default flow local.
 */

export type Bucket = { value: string; calm?: boolean };
export type SkinReads = {
  oil: Bucket;
  pores: Bucket;
  redness: Bucket;
  overall: Bucket;
  headline: string;
  narrative: string;
  raw: { shine: number; relRedness: number; cov: number; tzoneL: number; cheekL: number };
};

type LM = { x: number; y: number; z?: number };

const TZONE = [9, 8, 107, 336, 151, 10, 67, 297, 1, 4, 5, 195, 197];
const CHEEKS = [50, 101, 118, 117, 116, 205, 36, 280, 330, 347, 346, 345, 425, 266];

function lum(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function sampleRegion(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  landmarks: LM[],
  indices: number[],
  radius = 4
) {
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
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
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
        if (L > 210) specular++;
        n++;
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
    specularRatio: specular / n,
    texture: Math.sqrt(variance),
    n,
  };
}

function bucket(v: number, lo: number, hi: number, labels: [string, string, string], calmIdx?: number): Bucket {
  const i = v < lo ? 0 : v < hi ? 1 : 2;
  return { value: labels[i], calm: calmIdx === i };
}

export function analyzeSkin(imageData: ImageData, landmarks: LM[]): SkinReads | null {
  const { data, width: w, height: h } = imageData;
  const tzone = sampleRegion(data, w, h, landmarks, TZONE);
  const cheeks = sampleRegion(data, w, h, landmarks, CHEEKS);
  if (!tzone || !cheeks || tzone.n < 40 || cheeks.n < 40) return null;

  const cheekL = lum(cheeks.meanR, cheeks.meanG, cheeks.meanB);
  const tzoneL = lum(tzone.meanR, tzone.meanG, tzone.meanB);
  const rIdx = (m: { meanR: number; meanG: number; meanB: number }) =>
    m.meanR / (m.meanR + m.meanG + m.meanB || 1);

  const shine = tzone.specularRatio + Math.max(0, (tzoneL - cheekL) / 255);
  const oil = bucket(shine, 0.05, 0.16, ["거의 없음", "조금 있음", "많은 편"], 0);

  const relRedness = rIdx(cheeks) - rIdx(tzone);
  const redness = bucket(relRedness, 0.012, 0.03, ["거의 없음", "약간 보임", "붉은기 있음"], 0);

  const cov = cheeks.texture / (cheekL || 1);
  const pores = bucket(cov, 0.085, 0.14, ["매끈한 편", "조금 도드라짐", "도드라진 편"], 0);

  const concerns = [oil, redness, pores].filter((b) => !b.calm).length;
  const overall: Bucket =
    concerns === 0
      ? { value: "편안한 편", calm: true }
      : concerns >= 2
        ? { value: "균형 조절 필요", calm: true }
        : { value: "대체로 안정", calm: true };

  const headline =
    concerns === 0
      ? "차분하고\n편안한 결"
      : redness.value === "붉은기 있음"
        ? "조금은\n예민해 보이는 결"
        : oil.value === "많은 편"
          ? "윤기가\n도드라지는 결"
          : "조금은\n결이 보이는 피부";

  const tzonePhrase =
    oil.value === "많은 편"
      ? "T존의 번들거림이 비교적 도드라지고"
      : oil.value === "조금 있음"
        ? "T존에 은은한 유분감이 있고"
        : "T존 유분감은 차분하고";
  const cheekPhrase =
    redness.value === "붉은기 있음"
      ? "볼 쪽 붉은기가 눈에 띄어요"
      : pores.value === "도드라진 편"
        ? "볼 쪽 결이 조금 도드라져 보여요"
        : redness.value === "약간 보임"
          ? "볼 쪽에 옅은 붉은기가 있어요"
          : "볼 쪽은 비교적 편안해 보여요";

  return {
    oil,
    pores,
    redness,
    overall,
    headline,
    narrative: `${tzonePhrase}, ${cheekPhrase}.`,
    raw: { shine, relRedness, cov, tzoneL, cheekL },
  };
}

export async function classifyVisibleAttributes(skinCrop: ImageData): Promise<Partial<SkinReads> | null> {
  void skinCrop;
  return null;
}
