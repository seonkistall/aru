import { describe, expect, it } from "vitest";
import { roughnessRatio, sampleRegion, SAMPLING_LANDMARKS, type LM } from "@/lib/skin";

/**
 * Sizing the `roughness_ratio` / `roughnessRatio` divergence, which the backlog item has
 * carried since cycle 17 as "which side moves needs faces".
 *
 * The two forms are `region_highfreq / max(reference_highfreq, 1e-6)` (Python,
 * `ml/skin_indices.py`) and `foreheadHf > 1e-6 ? cheekHf / foreheadHf : 0`
 * (`lib/skin.ts:roughnessRatio`). They can only disagree when `foreheadHf <= 1e-6`, and of
 * the 10 rows in `ml/index-parity.json`'s `roughness_ratio` group the 3 that actually
 * diverge hold `foreheadHf` 1e-6, 1e-7 and 0 — hand-written values, not values any
 * capture produced. What nobody had established is what a CAPTURE has to look like to
 * land in the window, and the item's answer — a perfectly smooth forehead — is not the
 * only one.
 *
 * `foreheadHf` is `forehead.highFreq / meanL` (`lib/skin.ts`), and `highFreq` is the mean
 * over sampled pixels of `|L - mean(4 neighbours)|` with
 * `L = 0.299r + 0.587g + 0.114b` on integer channels. So a region lands in the window
 * whenever that mean is at most `1e-6 * meanL` — not only when it is 0. And it is not 0
 * for a checkerboard of two DISTINCT colours whose exact luminances are equal: the
 * rational value `(299r + 587g + 114b)/1000` is identical, the double is not, and the
 * residue is the floating-point error rather than any texture in the frame.
 *
 * Two things follow, and both are about how the item is WRITTEN rather than about faces.
 * (1) The window is not the set `highFreq === 0`: this region's `highFreq` is
 * 1.4210854715202004e-14, not 0, so a guard phrased as "is the forehead perfectly smooth"
 * would not fire on a capture that is in the window. The region is flat in LUMINANCE
 * (texture 5.188544138981456e-13) and not in colour — mean blue 118.8944246737841 against
 * the pair's 176 and 60 — because `highFreq` is computed on luminance alone.
 * (2) The committed row's "python: 320000.0 app: 0" magnitude is a property of the
 * cheek, not of the epsilon: here both regions are in the window together and Python
 * returns 1.9407372876655204e-10, which is also exactly its own ceiling `cheekHf / 1e-6`.
 * So the size of the disagreement should not be quoted as if the clamp produced it.
 * Neither settles the item — a usable dryness reading on a genuinely smooth forehead is
 * still a question about faces — and no constant is changed here.
 */

const W = 200;
const H = 200;
const TZONE = SAMPLING_LANDMARKS.tzone;
const CHEEKS = SAMPLING_LANDMARKS.cheeks;

// Distinct 8-bit triples with the SAME exact luminance: 299*60 + 587*60 + 114*176 and
// 299*63 + 587*81 + 114*60 are both 73224, i.e. L = 73.224 in exact arithmetic. Chosen
// out of the 60..199 cube; nothing about the pair is special beyond that equality, and
// the test below re-derives it rather than trusting this comment.
const PAIR_A: [number, number, number] = [60, 60, 176];
const PAIR_B: [number, number, number] = [63, 81, 60];

function exactLumNumerator([r, g, b]: [number, number, number]): number {
  return 299 * r + 587 * g + 114 * b;
}

function floatLum([r, g, b]: [number, number, number]): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function landmarks(): LM[] {
  const lms: LM[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const i of TZONE) lms[i] = { x: 0.5, y: 0.3, z: 0 };
  for (const i of CHEEKS) lms[i] = { x: 0.5, y: 0.7, z: 0 };
  return lms;
}

/** A full frame painted as a 1px checkerboard of the two colours. */
function checkerFrame(a: [number, number, number], b: [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const colour = (x + y) % 2 === 0 ? a : b;
      const o = (y * W + x) * 4;
      data[o] = colour[0];
      data[o + 1] = colour[1];
      data[o + 2] = colour[2];
      data[o + 3] = 255;
    }
  }
  return data;
}

/** A flat frame, which is the case the backlog item already records. */
function flatFrame(a: [number, number, number]): Uint8ClampedArray {
  return checkerFrame(a, a);
}

describe("the roughnessRatio divergent window, and what a capture has to be to land in it", () => {
  it("the pair is two distinct colours of identical exact luminance and non-identical double luminance", () => {
    expect(PAIR_A).not.toEqual(PAIR_B);
    expect(exactLumNumerator(PAIR_A)).toBe(exactLumNumerator(PAIR_B));
    expect(exactLumNumerator(PAIR_A)).toBe(73224);
    const delta = Math.abs(floatLum(PAIR_A) - floatLum(PAIR_B));
    // The whole mechanism: the exact values agree and the doubles do not.
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThan(1e-12);
  });

  it("a checkerboard of that pair has real variance and still lands inside the window", () => {
    const lms = landmarks();
    const stats = sampleRegion(checkerFrame(PAIR_A, PAIR_B), W, H, lms, TZONE);
    expect(stats).not.toBeNull();
    const meanL = floatLum([stats!.meanR, stats!.meanG, stats!.meanB]);
    expect(meanL).toBeGreaterThan(1);

    // Flat in luminance and not in colour, which is the precise claim: the region's
    // luminance texture is ~5.19e-13 while its mean blue sits between the pair's 176 and
    // 60. `highFreq` reads luminance only, so the colour difference is invisible to it.
    expect(stats!.texture).toBeLessThan(1e-12);
    expect(Math.abs(stats!.meanB - PAIR_A[2])).toBeGreaterThan(1);
    expect(Math.abs(stats!.meanB - PAIR_B[2])).toBeGreaterThan(1);

    const foreheadHf = stats!.highFreq / meanL;
    // The mechanism, pinned rather than bounded: `highFreq` is the MEAN of the per-pixel
    // `|L - mean(4 neighbours)|`, and on a checkerboard every one of those is the same
    // float delta, so the mean is exactly that delta. A `highFreq` that dropped the
    // `/hfCount` would read ~1e-11 here instead.
    expect(stats!.highFreq).toBe(Math.abs(floatLum(PAIR_A) - floatLum(PAIR_B)));
    // Inside the window, and NOT by being zero.
    expect(stats!.highFreq).toBeGreaterThan(0);
    expect(foreheadHf).toBeGreaterThan(0);
    expect(foreheadHf).toBeLessThanOrEqual(1e-6);
  });

  it("the size of the disagreement comes from the other region, not from the clamp", () => {
    const lms = landmarks();
    const forehead = sampleRegion(checkerFrame(PAIR_A, PAIR_B), W, H, lms, TZONE);
    const cheek = sampleRegion(checkerFrame(PAIR_A, PAIR_B), W, H, lms, CHEEKS);
    expect(forehead && cheek).toBeTruthy();
    const foreheadHf = forehead!.highFreq / floatLum([forehead!.meanR, forehead!.meanG, forehead!.meanB]);
    const cheekHf = cheek!.highFreq / floatLum([cheek!.meanR, cheek!.meanG, cheek!.meanB]);

    const app = roughnessRatio(cheekHf, foreheadHf);
    const python = cheekHf / Math.max(foreheadHf, 1e-6);

    expect(app).toBe(0);
    // Python's clamp cannot exceed cheekHf / 1e-6 and here it is far below it, because
    // cheekHf is in the same window — which is the honest version of the "320000.0 vs 0"
    // row: the size of the disagreement depends on the OTHER region, not on the guard.
    expect(python).toBeGreaterThan(0);
    expect(python).toBeLessThanOrEqual(cheekHf / 1e-6);
    expect(python).not.toBe(app);
  });

  it("the flat case the item already records is a strictly smaller class than the window", () => {
    const lms = landmarks();
    const flat = sampleRegion(flatFrame(PAIR_A), W, H, lms, TZONE);
    expect(flat).not.toBeNull();
    // Flat: exactly zero, because `(L+L+L+L)/4` is exact in doubles.
    expect(flat!.highFreq).toBe(0);

    const checker = sampleRegion(checkerFrame(PAIR_A, PAIR_B), W, H, lms, TZONE);
    // So the window holds at least two distinct classes, and `highFreq === 0` does not
    // characterise it. A guard written against "is it exactly flat" would miss this one.
    expect(checker!.highFreq).not.toBe(0);
    expect(checker!.highFreq / floatLum([checker!.meanR, checker!.meanG, checker!.meanB])).toBeLessThanOrEqual(1e-6);
    expect(roughnessRatio(1, flat!.highFreq)).toBe(roughnessRatio(1, checker!.highFreq));
  });
});
