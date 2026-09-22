import { describe, expect, it } from "vitest";
import { detectBlemishes, frameChannelGains } from "@/lib/skin";

/**
 * `detectBlemishes` now says whether the frame it just counted was decided by the
 * image or by scan order, and this file is what holds that census honest.
 *
 * Cycle 23 established the property: `detectBlemishes` resolves a suppression tie on an
 * exact float equality (`residual[j] === residual[i] && j < i`), a noiseless synthetic
 * face is nothing but plateaus, and on it one to three of the five counted cells are
 * settled by `j < i` rather than by anything in the picture. That measurement was taken
 * from OUTSIDE the detector, by a replica in
 * `tests/blemish-perturbation-tolerance.test.ts` that rebuilds the residual from the
 * captured a* grid — and §7.4 of `docs/blemish-perturbation-tolerance.md` records the
 * blind spot that leaves: quantising `residual[i]` INSIDE `lib/skin.ts` manufactures
 * plateaus on a realistic frame and every margin case stayed green, because the replica
 * never sees what the detector does downstream of a*.
 *
 * `tiedPeaks` is counted off the residual the detector actually classifies, so that
 * blind spot closes. It changes nothing: `count` is the same number it was, the census
 * is one extra float comparison per neighbour already being visited, and what
 * `blemishCount` should DO about a plateau-dominated frame — report it, refuse it, or
 * carry a confidence — stays the open decision it was. scipy's `find_peaks` takes the
 * same shape and is the reference for it (§7.6 of the same doc): a plateau's extent is
 * a reported property, and `(None, None)` is the documented way to have it computed
 * without filtering anything out.
 *
 * Re-derive the tables below with:
 *
 *     ARU_PRINT_PLATEAU_CENSUS=1 npx vitest run tests/blemish-plateau-census.test.ts
 */

type LM = { x: number; y: number; z?: number };

/** tests/blemish-density-scale.test.ts's face and landmarks, so this file measures the
 *  same fixture the cross-resolution assertion and the margin guard both use. */
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

function faceLandmarks(): LM[] {
  const at = (x: number, y: number) => ({ x, y, z: 0 });
  const landmarks: LM[] = Array.from({ length: 468 }, () => at(0.5, 0.58));
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

/** tests/blemish-density-scale.test.ts's own frame list — the five sizes whose counts
 *  that file asserts must agree on the noiseless face. §7.3 of
 *  docs/blemish-perturbation-tolerance.md measures a DIFFERENT fixture: same pixels,
 *  but the tests/scan-cost-benchmark.test.ts landmark ring rather than this file's
 *  clustered layout, so its face box and therefore its counts are not these. The open
 *  question is about the cross-resolution assertion, so this file follows that fixture. */
const FRAMES: Array<[number, number]> = [[400, 480], [600, 720], [800, 960], [1080, 1296], [1440, 1728]];

function read(w: number, h: number, noise: number) {
  const image = syntheticFace(w, h, noise);
  const data = image.data as Uint8ClampedArray;
  const lms = faceLandmarks() as never;
  return detectBlemishes(data, w, h, lms, frameChannelGains(data, w, h));
}

const out = (line: string) => { if (process.env.ARU_PRINT_PLATEAU_CENSUS) process.stdout.write(line); };

describe("the blemish plateau census", () => {
  it("reports no tie on a frame with real pixel noise, at any frame size or noise level", () => {
    // THE guard. A realistic frame's counted cells clear their suppression neighbours by
    // 4.2e-5 to 1.2e-2 a* units (§7.3), which is 1.2e6 to 3.2e8 times the detector's own
    // rounding error — so an exact tie among them is not a coincidence that happens, it
    // is a signal that something upstream has collapsed distinct residuals onto the same
    // float. That is precisely what an approximation to the transfer curve, or a
    // quantisation anywhere in the a*-to-residual path, does.
    out("in-detector plateau census, realistic fixture family\n");
    out("noise  frame        counted  tiedPeaks\n");
    for (const noise of [4, 9, 14]) {
      for (const [w, h] of FRAMES) {
        const got = read(w, h, noise);
        out(`${String(noise).padStart(5)}  ${`${w}x${h}`.padEnd(12)}${String(got.count).padStart(6)}${String(got.tiedPeaks).padStart(11)}\n`);
        expect(
          got.tiedPeaks,
          `noise ${noise} ${w}x${h}: ${got.tiedPeaks} of ${got.count} counted cells are settled by scan order, ` +
          "not by the image. On a frame with real pixel noise the suppression margins are 1e6x the detector's " +
          "own rounding error, so an exact tie means something upstream collapsed distinct residuals."
        ).toBe(0);
      }
    }
  });

  it("does report the ties on the noiseless fixture, which is the case the census exists for", () => {
    // The other half. tests/blemish-density-scale.test.ts asserts that this face reads
    // the same count at every resolution; it does, and one to three of those counts are
    // decided by `j < i`. Pinned per frame rather than as "> 0" so that a change to the
    // plateau path shows up as a moved number instead of staying green.
    out("in-detector plateau census, noiseAmplitude 0\n");
    out("frame        counted  tiedPeaks\n");
    const seen: string[] = [];
    for (const [w, h] of FRAMES) {
      const got = read(w, h, 0);
      out(`${`${w}x${h}`.padEnd(12)}${String(got.count).padStart(6)}${String(got.tiedPeaks).padStart(11)}\n`);
      seen.push(`${w}x${h}:${got.count}/${got.tiedPeaks}`);
    }
    // count/tiedPeaks. The counts are the `3, 3, 3, 3, 3` that
    // tests/blemish-density-scale.test.ts asserts must agree, and the second number is
    // how many of each 3 the image did not decide. Four of the five sizes carry at
    // least one; 1080x1296 carries none, which is why this is pinned as a vector and
    // not asserted as `> 0` — "the noiseless fixture always has a tie" is false.
    expect(
      seen.join(" "),
      "the noiseless fixture's plateau census moved. docs/blemish-perturbation-tolerance.md §7 " +
      "and the two backlog items that cite it are measured against these exact ties."
    ).toBe("400x480:3/2 600x720:3/1 800x960:3/2 1080x1296:3/0 1440x1728:3/1");
  });
});
