import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { analyzeSkin } from "@/lib/skin";

/**
 * `blemishCount` on a NOISELESS face is decided by an exact float equality, and on a
 * noisy one it is not. Both halves are measured here, because only the second one is
 * a property of the detector.
 *
 * `detectBlemishes` picks local maxima in a*, and its suppression loop breaks ties
 * explicitly (`lib/skin.ts`):
 *
 *     // Ties go to the cell scanned first, so a plateau counts once.
 *     if (residual[j] > residual[i] || (residual[j] === residual[i] && j < i)) {
 *
 * That clause exists so a flat plateau counts once instead of once per cell, and it is
 * right. But a synthetic face built with `noiseAmplitude = 0` is nothing BUT plateaus:
 * whole runs of stride windows average to bit-identical channel triples, so whole runs
 * of cells carry bit-identical residuals, and which of them survives is settled by
 * `j < i` rather than by the image. Perturb a* by one part in 1e16 — below one ulp of
 * the values involved — and those runs stop being ties, each becomes a minute slope,
 * and the count moves.
 *
 * Found 2026-09-20 (cycle 22) while measuring whether a lookup table for the sRGB
 * transfer curve could replace `Math.pow`. The table changed `blemishCount` on the
 * noiseless fixture in `tests/blemish-density-scale.test.ts`; making the table eight
 * times more accurate changed it differently, which is what said the table was not the
 * cause. `docs/srgb-transfer-table.md` §7 has the full sweep.
 *
 * What this file asserts is that the tie-break line is still there, and that the
 * noiseless fixture's agreement really does rest on it — so that
 * `tests/blemish-density-scale.test.ts`'s "every frame must agree", which is green and
 * which this cycle did NOT touch, is not read as a statement about the detector.
 *
 * On a face with real pixel noise the same nudge moves nothing at any frame size, and
 * that is the reassuring half. It is printed rather than asserted, and the case below
 * says why: no source-line break was found that could make such an assertion fail.
 */

function syntheticFace(w: number, h: number, noiseAmplitude = 9): ImageData {
  const sx = w / 400;
  const sy = h / 480;
  const data = new Uint8ClampedArray(w * h * 4);
  let seed = 20260914;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const spots = [{ x: 120, y: 260 }, { x: 150, y: 300 }, { x: 280, y: 265 }, { x: 300, y: 310 }, { x: 200, y: 380 }]
    .map((spot) => ({ x: spot.x * sx, y: spot.y * sy }));
  const radiusSq = 25 * sx * sy;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const row = y / sy;
      const base = row < 200 ? 186 : row < 340 ? 170 : 158;
      const noise = (rand() - 0.5) * noiseAmplitude;
      let r = base + 22 + noise, g = base - 4 + noise, b = base - 18 + noise;
      for (const spot of spots) {
        const dx = x - spot.x, dy = y - spot.y;
        if (dx * dx + dy * dy < radiusSq) { r += 26; g -= 6; b -= 6; }
      }
      const o = (y * w + x) * 4;
      data[o] = Math.max(0, Math.min(255, r));
      data[o + 1] = Math.max(0, Math.min(255, g));
      data[o + 2] = Math.max(0, Math.min(255, b));
      data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h } as unknown as ImageData;
}

/** tests/blemish-density-scale.test.ts's landmark layout and its realistic frames, so
 *  this file measures the same face that file asserts on and not a different one. */
function faceLandmarks() {
  const at = (x: number, y: number) => ({ x, y, z: 0 });
  const landmarks = Array.from({ length: 468 }, () => at(0.5, 0.58));
  const place = (indices: number[], x: number, y: number) => {
    for (const index of indices) landmarks[index] = at(x, y);
  };
  place([9, 8, 107, 336, 151, 10, 67, 297], 0.5, 0.22);
  place([1, 4, 5, 195, 197], 0.5, 0.48);
  place([50, 101, 118, 117, 116, 205, 36], 0.32, 0.58);
  place([280, 330, 347, 346, 345, 425, 266], 0.68, 0.58);
  place([18, 200, 199, 175, 152, 83, 313], 0.5, 0.82);
  return landmarks;
}
const FRAMES: Array<[number, number]> = [[400, 480], [600, 720], [800, 960], [1080, 1296], [1440, 1728]];

const SKIN = readFileSync("lib/skin.ts", "utf8");
const TIE_BREAK = "          if (residual[j] > residual[i] || (residual[j] === residual[i] && j < i)) {\n";
const A_STAR_WRITE = "      astar[gy * gw + gx] = labAStar(Math.min(255, r * gains.r), Math.min(255, g * gains.g), Math.min(255, b * gains.b));\n";
/** One part in 1e16 added where a* is consumed and before anything reads it — far
 *  below any approximation anyone would ship, and below one ulp of a* itself at these
 *  magnitudes. Its only effect is that bit-identical residuals stop being identical. */
const A_STAR_NUDGED = "      astar[gy * gw + gx] = labAStar(Math.min(255, r * gains.r), Math.min(255, g * gains.g), Math.min(255, b * gains.b)) + 1e-16;\n";

const DIR = "tests/.tie-break-tmp";
type SkinModule = { analyzeSkin: typeof analyzeSkin };

async function builds(): Promise<[SkinModule, SkinModule]> {
  if (!SKIN.includes(A_STAR_WRITE)) throw new Error("the a* write moved; this file perturbs nothing");
  mkdirSync(DIR, { recursive: true });
  const relative = (text: string) => text.replace('from "./i18n/core"', 'from "../../lib/i18n/core"');
  // A fresh copy of the shipped file too, so both sides go through V8's tiers alike
  // and neither is the statically imported module other suites have already driven.
  writeFileSync(`${DIR}/shipped.ts`, relative(SKIN));
  writeFileSync(`${DIR}/nudged.ts`, relative(SKIN.replace(A_STAR_WRITE, A_STAR_NUDGED)));
  const load = async (name: string) => (await import(/* @vite-ignore */ `./.tie-break-tmp/${name}.ts`)) as SkinModule;
  return [await load("shipped"), await load("nudged")];
}

function counts(mod: SkinModule, noise: number): number[] {
  return FRAMES.map(([w, h]) => {
    const read = mod.analyzeSkin(syntheticFace(w, h, noise), faceLandmarks() as never);
    if (!read) throw new Error(`${w}x${h} at noise ${noise} produced no reading`);
    return read.raw.blemishCount;
  });
}

describe("the blemish plateau tie-break", () => {
  it("is declared in lib/skin.ts and decides plateaus by exact equality", () => {
    // Pinned as source, because everything below is a measurement OF this line. If it
    // is reworded the cases here would go on perturbing a detector that no longer has
    // the behaviour they describe, and would report that as good news.
    expect(SKIN, "the suppression tie-break moved").toContain(TIE_BREAK);
    expect(SKIN).toContain("      // Ties go to the cell scanned first, so a plateau counts once.\n");
  });

  it("reports what the nudge does to a noisy face, and asserts nothing about it", async () => {
    // Printed, not asserted, and the reason is worth keeping. The measurement is that
    // a noisy face's counts do NOT move under this nudge at any frame size, which is
    // the reassuring half. But no edit to lib/skin.ts was found that makes an assertion
    // of it fail: the nudge adds the same 1e-16 to every cell, a uniform shift cancels
    // in `astar[i] - background`, and what actually moves the noiseless fixture is that
    // the addition ROUNDS differently at different magnitudes. Quantising the residual
    // absorbs the nudge; quantising the channel averages into plateaus keeps the ties
    // exactly tied. Seven source-line breaks were tried (T1-T7 in
    // docs/srgb-transfer-table.md §7) and every one of them failed the case below and
    // none failed this one.
    //
    // An assertion nothing can break is not coverage, it is a green line that looks
    // like coverage, so this stays a measurement. The property it gestures at — that a
    // realistic frame's count has a margin far above float noise — is real and is worth
    // a guard; the guard has to measure the margin itself rather than nudge and look,
    // and that is on the backlog.
    if (!process.env.ARU_PRINT_TIE_BREAK) return;
    const [shipped, nudged] = await builds();
    try {
      for (const noise of [9, 0]) {
        process.stdout.write(
          `TIE noise=${noise} shipped=[${counts(shipped, noise).join(", ")}] ` +
          `nudged=[${counts(nudged, noise).join(", ")}]\n`
        );
      }
    } finally {
      rmSync(DIR, { recursive: true, force: true });
    }
  }, 120000);

  it("does decide it on a noiseless synthetic face, which is why that agreement is not a guarantee", async () => {
    // The other half, recorded rather than asserted away. tests/blemish-density-scale
    // .test.ts asserts that a NOISELESS face reads the same count at every resolution.
    // It does, on the exact arithmetic shipped today, and this case is the measurement
    // that says why that is a coincidence and not a property: the same face, nudged by
    // one part in 1e16, stops agreeing.
    const [shipped, nudged] = await builds();
    try {
      const before = counts(shipped, 0);
      const after = counts(nudged, 0);
      expect(new Set(before).size, `the shipped build is supposed to agree: ${before.join(", ")}`).toBe(1);
      expect(
        after,
        `a 1e-16 nudge left the noiseless fixture's counts unchanged at ${after.join(", ")}. ` +
        "If that is now true the plateau path has changed and docs/srgb-transfer-table.md is stale."
      ).not.toEqual(before);
    } finally {
      rmSync(DIR, { recursive: true, force: true });
    }
  }, 120000);
});
