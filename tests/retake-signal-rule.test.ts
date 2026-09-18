import { describe, expect, it } from "vitest";
import { analyzeSkin, analyzeSkinBurst } from "@/lib/skin";
import { mergeVisionAnalysis } from "@/app/scan/capture-analysis";

type LM = { x: number; y: number; z?: number };

// Region index lists copied from lib/skin.ts. TZONE and CHEEKS are disjoint, which
// is what lets a frame fail exactly one signal: the two regions can be painted and
// sampled independently.
const TZONE = [9, 8, 107, 336, 151, 10, 67, 297, 1, 4, 5, 195, 197];
const CHEEKS = [50, 101, 118, 117, 116, 205, 36, 280, 330, 347, 346, 345, 425, 266];
const CHIN = [18, 200, 199, 175, 152, 83, 313];

const W = 200;
const H = 200;
const WOBBLE_REASON = "촬영 프레임 사이에 신호가 조금 흔들렸어요";

/** Top band (y < 100) is T-zone skin, bottom band is cheek skin. */
function bandFrame(tz: [number, number, number], ck: [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    const base = y < 100 ? tz : ck;
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      data[i] = base[0];
      data[i + 1] = base[1];
      data[i + 2] = base[2];
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H } as unknown as ImageData;
}

function glint(frame: ImageData, cx: number, cy: number, radius: number) {
  const d = frame.data as unknown as Uint8ClampedArray;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const o = (y * W + x) * 4;
      d[o] = 250;
      d[o + 1] = 250;
      d[o + 2] = 250;
    }
  }
}

function landmarks(cheekAt: [number, number]): LM[] {
  const lms: LM[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const i of TZONE) lms[i] = { x: 0.5, y: 0.3, z: 0 };
  for (const i of CHEEKS) lms[i] = { x: cheekAt[0], y: cheekAt[1], z: 0 };
  for (const i of CHIN) lms[i] = { x: 0.5, y: 0.85, z: 0 };
  return lms;
}

const CHEEK_OK: [number, number] = [0.5, 0.7];
// cx = cy = round(0.985 * 200) = 197, so each 9x9 patch keeps x,y in 193..199 —
// 49 px per landmark, 49 * 14 = 686 cheek samples, under the 700 floor. The T-zone
// patch is untouched at 13 * 81 = 1053, over its 500 floor.
const CHEEK_CLIPPED: [number, number] = [0.985, 0.985];

const SKIN: [number, number, number] = [196, 152, 140];
const DARK: [number, number, number] = [63, 49, 45];

describe("retakeRecommended is keyed on which signals failed", () => {
  it("does not recommend a retake when all three signals pass", () => {
    const reads = analyzeSkin(bandFrame(SKIN, SKIN), landmarks(CHEEK_OK))!;
    expect(reads.signals.filter((s) => !s.ok)).toHaveLength(0);
    expect(reads.retakeReasons).toEqual([]);
    expect(reads.retakeRecommended).toBe(false);
  });

  it("recommends a retake when 조명 alone fails", () => {
    const reads = analyzeSkin(bandFrame(DARK, DARK), landmarks(CHEEK_OK))!;
    expect(reads.signals.filter((s) => !s.ok).map((s) => s.label)).toEqual(["조명"]);
    expect(reads.raw.cheekL).toBeLessThan(70);
    expect(reads.confidence).toBeGreaterThanOrEqual(0.58);
    expect(reads.retakeReasons).toHaveLength(1);
    expect(reads.retakeRecommended).toBe(true);
  });

  it("recommends a retake when 반사 alone fails", () => {
    const frame = bandFrame(SKIN, SKIN);
    glint(frame, 100, 60, 6);
    const reads = analyzeSkin(frame, landmarks(CHEEK_OK))!;
    expect(reads.signals.filter((s) => !s.ok).map((s) => s.label)).toEqual(["반사"]);
    expect(reads.raw.tzoneSpecular).toBeGreaterThanOrEqual(0.1);
    expect(reads.confidence).toBeGreaterThanOrEqual(0.58);
    expect(reads.retakeReasons).toHaveLength(1);
    expect(reads.retakeRecommended).toBe(true);
  });

  it("recommends a retake when 피부 영역 alone fails", () => {
    const reads = analyzeSkin(bandFrame(SKIN, SKIN), landmarks(CHEEK_CLIPPED))!;
    expect(reads.signals.filter((s) => !s.ok).map((s) => s.label)).toEqual(["피부 영역"]);
    expect(reads.raw.cheekSamples).toBe(686);
    expect(reads.raw.tzoneSamples).toBe(1053);
    expect(reads.confidence).toBeGreaterThanOrEqual(0.58);
    expect(reads.retakeReasons).toHaveLength(1);
    expect(reads.retakeRecommended).toBe(true);
  });
});

describe("the burst wobble reason is not a capture signal", () => {
  // Three flat frames whose oil and redness levels are 0, 1 and 2, so the fused
  // median lands on 1 and both agreements are 1/3; pores is flat (texture 0) in all
  // three, so its agreement is 1. meanAgreement = (1/3 + 1/3 + 1) / 3 = 0.5556,
  // under the 0.67 wobble cut, while every capture signal still passes.
  const WOBBLE_FRAMES = [
    { tz: [120, 92, 88] as [number, number, number], ck: [168, 150, 102] as [number, number, number] },
    { tz: [180, 192, 78] as [number, number, number], ck: [168, 155, 77] as [number, number, number] },
    { tz: [224, 229, 107] as [number, number, number], ck: [180, 150, 70] as [number, number, number] },
  ].map(({ tz, ck }) => ({ imageData: bandFrame(tz, ck), landmarks: landmarks(CHEEK_OK) }));

  it("wobble alone adds its reason and does NOT recommend a retake", () => {
    const reads = analyzeSkinBurst(WOBBLE_FRAMES)!;
    expect(reads.signals.filter((s) => !s.ok)).toHaveLength(0);
    const mean = (reads.burst!.agreement.oil + reads.burst!.agreement.redness + reads.burst!.agreement.pores) / 3;
    expect(mean).toBeLessThan(0.67);
    expect(reads.retakeReasons).toEqual([WOBBLE_REASON]);
    expect(reads.retakeRecommended).toBe(false);
  });

  it("one failed signal retakes with or without the wobble entry, so the rule is not a count", () => {
    const steady = [0, 1, 2].map(() => ({ imageData: bandFrame(SKIN, SKIN), landmarks: landmarks(CHEEK_CLIPPED) }));
    const steadyReads = analyzeSkinBurst(steady)!;
    expect(steadyReads.burst!.agreement.pores).toBe(1);
    expect(steadyReads.retakeReasons).toHaveLength(1);
    expect(steadyReads.retakeReasons).not.toContain(WOBBLE_REASON);
    expect(steadyReads.retakeRecommended).toBe(true);

    const wobbly = WOBBLE_FRAMES.map((frame) => ({ ...frame, landmarks: landmarks(CHEEK_CLIPPED) }));
    const wobblyReads = analyzeSkinBurst(wobbly)!;
    expect(wobblyReads.retakeReasons).toHaveLength(2);
    expect(wobblyReads.retakeReasons).toContain(WOBBLE_REASON);
    expect(wobblyReads.retakeRecommended).toBe(true);
  });
});

describe("the vision-API merge applies the same rule", () => {
  // mergeVisionAnalysis recomputes retakeRecommended whenever the payload carries any
  // confidence value. It used to count `retakeReasons`, which on the burst path also
  // holds the wobble line — so the two paths could disagree about the same capture.
  it("a vision merge over a capture failing 피부 영역 alone still recommends a retake", () => {
    const base = analyzeSkin(bandFrame(SKIN, SKIN), landmarks(CHEEK_CLIPPED))!;
    expect(base.retakeRecommended).toBe(true);
    const merged = mergeVisionAnalysis(base, { labels: { oil: 1 }, confidence: { oil: 0.9 } });
    expect(merged.confidence).toBeGreaterThanOrEqual(0.58);
    expect(merged.retakeReasons).toHaveLength(1);
    expect(merged.retakeRecommended).toBe(true);
  });

  it("a vision merge over a clean capture does not", () => {
    const base = analyzeSkin(bandFrame(SKIN, SKIN), landmarks(CHEEK_OK))!;
    const merged = mergeVisionAnalysis(base, { labels: { oil: 1 }, confidence: { oil: 0.9 } });
    expect(merged.retakeRecommended).toBe(false);
  });
});
