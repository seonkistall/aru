import { describe, expect, it } from "vitest";
import { analyzeSkin } from "@/lib/skin";

/**
 * blemishDensity must not depend on how many pixels the camera spent on the face.
 *
 * The detector walks a grid whose stride is a fraction of the face width, so the
 * count is already face-relative; the density used to divide it by an area in real
 * capture pixels, which made the index scale as roughly 1/faceWidth^2. Two scans of
 * one face — a 400x480 preview and a 1440x1728 still — landed 12.8x apart with the
 * same number of spots on it. Nothing user-facing reads the value yet, which is why
 * it is worth pinning before it is in collected data.
 *
 * What is pinned here is the DENOMINATOR, isolated as density/count. The count
 * itself is not stable across resolutions on this fixture (2 to 5 spots on one
 * noiseless face) because the detector point-samples its grid and a disc that lands
 * between sample points is missed — a separate and larger defect, recorded in
 * docs/capture-resolution-invariance.md and in the backlog rather than asserted
 * here as if it were fixed.
 */

type LM = { x: number; y: number; z?: number };

/** The tests/skin-index-contract.test.ts face, rendered at an arbitrary frame size. */
function syntheticFace(w: number, h: number, noiseAmplitude = 9): ImageData {
  const sx = w / 400;
  const sy = h / 480;
  const data = new Uint8ClampedArray(w * h * 4);
  let seed = 20260914;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const blemishes = [
    { x: 120, y: 260 }, { x: 150, y: 300 }, { x: 280, y: 265 },
    { x: 300, y: 310 }, { x: 200, y: 380 },
  ].map((spot) => ({ x: spot.x * sx, y: spot.y * sy }));
  const radiusSq = 25 * sx * sy;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const row = y / sy;
      const base = row < 200 ? 186 : row < 340 ? 170 : 158;
      const noise = (rand() - 0.5) * noiseAmplitude;
      let r = base + 22 + noise;
      let g = base - 4 + noise;
      let b = base - 18 + noise;
      for (const spot of blemishes) {
        const dx = x - spot.x;
        const dy = y - spot.y;
        if (dx * dx + dy * dy < radiusSq) {
          r += 26;
          g -= 6;
          b -= 6;
        }
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

/** density / count is 1 / (sampled area), in whatever unit the area is carried in. */
function inverseSampledArea(width: number, height: number): number {
  const read = analyzeSkin(syntheticFace(width, height), faceLandmarks());
  expect(read, `${width}x${height} produced no reading`).not.toBeNull();
  expect(read!.raw.blemishCount, `${width}x${height} found no blemish`).toBeGreaterThan(0);
  return read!.raw.blemishDensity / read!.raw.blemishCount;
}

describe("blemishDensity is comparable across capture resolutions", () => {
  // 200x240 up to 1440x1728: face width 72px to 518.4px, a 7.2x range that covers a
  // downscaled preview frame through a full-resolution still.
  const frames: Array<[number, number]> = [
    [200, 240], [300, 360], [400, 480], [600, 720], [800, 960], [1080, 1296], [1440, 1728],
  ];

  it("divides by the same area whatever the frame size", () => {
    const areas = frames.map(([w, h]) => inverseSampledArea(w, h));
    const spread = Math.max(...areas) / Math.min(...areas);
    // Measured spread over this sweep is 1.0196; the pixel-area denominator it
    // replaced spans 50.8x over the same frames.
    expect(spread).toBeLessThan(1.03);
  });

  it("puts a preview frame and a full-resolution still on one scale", () => {
    const preview = inverseSampledArea(400, 480);
    const still = inverseSampledArea(1440, 1728);
    // Before the fix these differed by 12.8x on this pair.
    expect(still / preview).toBeGreaterThan(1 / 1.03);
    expect(still / preview).toBeLessThan(1.03);
  });

  // The sweep behind docs/capture-resolution-invariance.md, so the tables in it are
  // re-runnable rather than resting on a script nobody kept:
  //   ARU_PRINT_SCALE_SWEEP=1 npx vitest run tests/blemish-density-scale.test.ts
  it("prints the sweep the doc tabulates", () => {
    if (!process.env.ARU_PRINT_SCALE_SWEEP) return;
    for (const noise of [9, 0]) {
      process.stdout.write(`SWEEP noise=${noise}\nSWEEP frame\tfaceW\tstride\tcount\tareaPx\tareaPx/faceW^2\tdensity\n`);
      for (const [w, h] of frames) {
        const read = analyzeSkin(syntheticFace(w, h, noise), faceLandmarks())!;
        const faceW = 0.36 * w;
        const stride = Math.max(1, Math.round(faceW / 90));
        const count = read.raw.blemishCount;
        const density = read.raw.blemishDensity;
        // areaPx is not exported; recover it from the pair that is.
        const areaFace = count > 0 && density > 0 ? count / density : 0;
        const areaPx = areaFace * faceW * faceW;
        process.stdout.write(
          `SWEEP ${w}x${h}\t${faceW.toFixed(1)}\t${stride}\t${count}\t${areaPx.toFixed(0)}\t${areaFace.toFixed(4)}\t${density.toFixed(3)}\n`
        );
      }
    }
  });

  // The count, not just the denominator. Before the stride window was averaged the
  // detector point-sampled its grid, so a disc landing between two sample points was
  // missed outright and the same five-spot face read 2, 4, 2, 4, 3, 5, 3 across these
  // seven frames with pixel noise off. The two smallest frames are excluded on
  // purpose and named here rather than quietly dropped: at face width 72px the stride
  // clamps at one whole pixel, so the grid is 72 cells across the face instead of 90
  // and the detector is in a different regime from every frame above it.
  it("finds the same spots on one face at every realistic capture resolution", () => {
    const realistic = frames.filter(([w]) => 0.36 * w >= 144);
    expect(realistic.length).toBe(5);
    const counts = realistic.map(([w, h]) => {
      const read = analyzeSkin(syntheticFace(w, h, 0), faceLandmarks());
      expect(read, `${w}x${h} produced no reading`).not.toBeNull();
      return read!.raw.blemishCount;
    });
    // Every frame must agree, and agree on a count the detector could not reach by
    // finding nothing: a sequence of zeros would otherwise satisfy "all equal".
    expect(new Set(counts).size, `counts across resolutions: ${counts.join(", ")}`).toBe(1);
    expect(counts[0]).toBeGreaterThan(0);
  });

  it("stays finite at every frame size", () => {
    // The new denominator is a ratio of two measured quantities, so a degenerate
    // face box must not turn it into NaN or Infinity on its way to the sync payload.
    for (const [w, h] of frames) {
      const read = analyzeSkin(syntheticFace(w, h), faceLandmarks());
      expect(Number.isFinite(read!.raw.blemishDensity), `${w}x${h}`).toBe(true);
      expect(read!.raw.blemishDensity).toBeGreaterThanOrEqual(0);
    }
  });
});
