import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  analyzeSkin,
  analyzeSkinBurst,
  detectBlemishes,
  extractRawFeatures,
  frameChannelGains,
  sampleRegion,
} from "@/lib/skin";
import {
  DEFAULT_SKIN_ROI_THRESHOLDS,
  evaluateSkinRoiQuality,
  skinRoiRegionsFromLandmarks,
} from "@/app/scan/skin-roi-quality";
import type { Landmark } from "@/app/scan/types";

/**
 * What a scan actually costs, and where the time goes.
 *
 * The backlog item this answers asked for the per-scan cost of the within-image
 * indices "on a mid-range phone profile, not on the build container", and the cycle-14
 * question underneath it: what does the per-pixel clipped-channel branch added to
 * `sampleRegion` cost. This box is not a phone and no multiplier turns it into one, so
 * what the sweep below reports is what a container CAN establish — the per-frame work
 * in pixels, how it scales with frame size, the split between phases, and the share of
 * a budget each phase takes HERE. Everything device-shaped stays in the golden-set /
 * physical-device blockers where it already sits.
 *
 * Two structural facts do most of the work and both are pinned as cheap cases below,
 * because they are what makes the timing interpretable:
 *
 * 1. `sampleRegion` visits a FIXED number of pixels — 81 per landmark over six
 *    landmark lists — so its cost, and therefore the clipped-channel branch's cost, is
 *    constant in frame size. Only `detectBlemishes` reads pixels in proportion to the
 *    face box, and even it walks a grid of a fixed ~90 cells across the face.
 * 2. The 650ms quality tick does NOT reach `sampleRegion`. `use-quality-loop.ts` calls
 *    `evaluateCapturedQuality` -> `evaluateSkinRoiQuality`, a different reader in
 *    `app/scan/skin-roi-quality.ts`; the only thing it takes from `lib/skin.ts` is the
 *    `SAMPLING_LANDMARKS` constant. `analyzeSkinBurst` runs ONCE per scan over at most
 *    three burst frames. So the clipped-channel branch runs 6 regions x 3 frames per
 *    scan, not per preview tick.
 *
 * The heavy sweep is behind ARU_PRINT_SCAN_COST, the shape this repository already uses
 * for ARU_PRINT_SCALE_SWEEP / ARU_PRINT_SHINE_SWEEP / ARU_PRINT_CLIP_SWEEP:
 *   ARU_PRINT_SCAN_COST=1 npx vitest run tests/scan-cost-benchmark.test.ts
 * Nothing that runs by default asserts a duration. A timing assertion fails on a loaded
 * box while nothing in the product is broken, which is worse than no assertion.
 */

type LM = { x: number; y: number; z?: number };

const TZONE = [9, 8, 107, 336, 151, 10, 67, 297, 1, 4, 5, 195, 197];
const CHEEKS = [50, 101, 118, 117, 116, 205, 36, 280, 330, 347, 346, 345, 425, 266];
const FOREHEAD = [9, 8, 107, 336, 151, 10, 67, 297];
const LEFT_CHEEK = [50, 101, 118, 117, 116, 205, 36];
const RIGHT_CHEEK = [280, 330, 347, 346, 345, 425, 266];
const CHIN = [18, 200, 199, 175, 152, 83, 313];
/** The six lists `extractRawFeatures` samples, in the order it samples them. */
const REGION_LISTS = [TZONE, CHEEKS, FOREHEAD, LEFT_CHEEK, RIGHT_CHEEK, CHIN];
/** lib/skin.ts's NON_SKIN: the landmarks whose neighbourhood detectBlemishes cuts out. */
const NON_SKIN = [
  33, 133, 159, 145, 153, 157, 173, 246,
  362, 263, 386, 374, 380, 385, 398, 466,
  70, 63, 105, 66, 107, 336, 296, 334, 293, 300,
  61, 291, 13, 14, 0, 17, 78, 308, 39, 269,
  94, 99, 328, 2,
];

/** The tests/blemish-density-scale.test.ts face, which is the only fixture in the
 *  repository whose landmarks are spread widely enough for `detectBlemishes` to run. */
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

/**
 * A face whose landmarks are SPREAD, which matters for what is being measured here.
 * The fixtures elsewhere in this repository collapse all thirteen T-zone landmarks onto
 * one point, so `sampleRegion` reads the same 81 pixels thirteen times out of L1 and its
 * cost comes out flattering. A real MediaPipe mesh puts 56 sampled patches at 56
 * different places on the face, and the six non-skin groups at six more. This lays them
 * out that way: every index in a group gets its own position on that group's arc or
 * line, deterministically, no randomness anywhere.
 */
function faceLandmarks(): LM[] {
  const at = (x: number, y: number) => ({ x, y, z: 0 });
  const landmarks: LM[] = Array.from({ length: 468 }, (_, i) => {
    // Unsampled points still set the face box detectBlemishes walks, so they are spread
    // over the face oval rather than stacked on its centre.
    const a = (i / 468) * Math.PI * 2;
    return at(0.5 + 0.17 * Math.cos(a), 0.52 + 0.29 * Math.sin(a));
  });
  /** Lay a group out along a line from (x0,y0) to (x1,y1), one index per step. */
  const spread = (indices: number[], x0: number, y0: number, x1: number, y1: number) => {
    const last = Math.max(1, indices.length - 1);
    indices.forEach((index, i) => {
      landmarks[index] = at(x0 + ((x1 - x0) * i) / last, y0 + ((y1 - y0) * i) / last);
    });
  };
  spread(FOREHEAD, 0.38, 0.18, 0.62, 0.26);
  spread([1, 4, 5, 195, 197], 0.47, 0.40, 0.53, 0.50);
  spread(LEFT_CHEEK, 0.26, 0.50, 0.38, 0.66);
  spread(RIGHT_CHEEK, 0.62, 0.50, 0.74, 0.66);
  spread(CHIN, 0.42, 0.78, 0.58, 0.84);
  // Non-skin groups, where lib/skin.ts's NON_SKIN list expects them. They decide how
  // many grid cells detectBlemishes excludes, so putting them all on one point would
  // change the work it does.
  spread([33, 133, 159, 145, 153, 157, 173, 246], 0.34, 0.40, 0.44, 0.44);
  spread([362, 263, 386, 374, 380, 385, 398, 466], 0.56, 0.40, 0.66, 0.44);
  spread([70, 63, 105, 66, 107, 336, 296, 334, 293, 300], 0.32, 0.33, 0.68, 0.33);
  spread([61, 291, 13, 14, 0, 17, 78, 308, 39, 269], 0.41, 0.70, 0.59, 0.72);
  spread([94, 99, 328, 2], 0.46, 0.56, 0.54, 0.58);
  return landmarks;
}

/** A capture on this box, at the frame sizes a phone preview and still actually use. */
const FRAMES: Array<[number, number]> = [[400, 480], [720, 960], [1080, 1440], [1440, 1920]];

// The exact source lines the sweep ablates, and the pins that keep them honest.
const CLIP_LINE = "        if (r >= 255 || g >= 255 || b >= 255) clipped += 1;\n";
/** detectBlemishes carries most of a scan, so section E ablates two things inside it.
 *  Each needle is pinned by a default case, so a reword fails loudly instead of
 *  measuring nothing. The ablations change what the detector COUNTS; only their
 *  durations are read, never their output. */
const EXCLUDE_FILL = "    const lm = landmarks[idx];\n    if (lm) excluded.push({ x: lm.x * w, y: lm.y * h });\n";
const LAB_CALL = "      astar[gy * gw + gx] = labAStar(Math.min(255, r * gains.r), Math.min(255, g * gains.g), Math.min(255, b * gains.b));\n";
/** Cycle 17's change, as the two places it touched. Section C4 rebuilds lib/skin.ts
 *  with LAB_BEFORE and LAB_CALL_BEFORE back in place — the shape at main f7c52df —
 *  so the speedup the cycle claims is re-derived by the branch rather than quoted.
 *  LAB_AFTER is the shipped block, pinned so a reword fails loudly. */
const LAB_AFTER = `/** sRGB transfer curve, one channel, 0-255 in, linear 0-1 out. */
function srgbLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}`;
/** The sRGB transfer curve's own line. C5 ablates it to bound what a fast path
 *  could NEVER reach: labAStar keeps all three Math.pow calls. */
const POW_LINE = "  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);\n";
const LAB_BEFORE = `function rgbToLabPreFastPath(r: number, g: number, b: number): { l: number; a: number; b: number } {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const rl = linear(r);
  const gl = linear(g);
  const bl = linear(b);
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
` + LAB_AFTER;
const LAB_CALL_BEFORE =
  "      const lab = rgbToLabPreFastPath(Math.min(255, r * gains.r), Math.min(255, g * gains.g), Math.min(255, b * gains.b));\n" +
  "      astar[gy * gw + gx] = lab.a;\n";
/** The row-filtered exclusion test as shipped, and the point-by-point loop it replaced.
 *  Section C3 rebuilds lib/skin.ts with the second in place of the first, so the
 *  speedup this cycle claims is re-derived by the branch rather than quoted from it. */
const ROW_FILTERED = `  const rowPoints: Array<{ x: number; y: number }> = [];
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
`;
const POINT_BY_POINT = `  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const cx = x0 + gx * stride;
      const cy = y0 + gy * stride;
      if (cx >= w || cy >= h) continue;
      let nearNonSkin = false;
      for (const point of excluded) {
        const dx = cx - point.x;
        const dy = cy - point.y;
        if (dx * dx + dy * dy < excludeRSq) {
          nearNonSkin = true;
          break;
        }
      }
`;
const REPEATS = 7;

// ---------------------------------------------------------------------------
// Default cases. Cheap, deterministic, no duration is asserted anywhere.
// ---------------------------------------------------------------------------

describe("what a scan reads, counted rather than timed", () => {
  it("samples the same number of pixels whatever the frame size", () => {
    const counts = FRAMES.map(([w, h]) => {
      const { data } = syntheticFace(w, h);
      const lms = faceLandmarks();
      return REGION_LISTS.map((list) => sampleRegion(data, w, h, lms, list)?.n ?? 0);
    });
    // 81 pixels per landmark (radius 4), every patch fully inside the frame.
    expect(counts[0]).toEqual([13 * 81, 14 * 81, 8 * 81, 7 * 81, 7 * 81, 7 * 81]);
    for (const row of counts) expect(row).toEqual(counts[0]);
    const perFrame = counts[0].reduce((a, b) => a + b, 0);
    expect(perFrame).toBe(4536);
  });

  it("keeps the clipped-channel branch on exactly the line the sweep ablates", () => {
    // The ARU_PRINT_SCAN_COST sweep isolates cycle 14's added cost by rebuilding
    // lib/skin.ts with this one line removed. If the line is reworded the sweep must
    // fail loudly rather than silently measure nothing, so its needle is pinned here.
    const source = readFileSync("lib/skin.ts", "utf8");
    expect(source).toContain(CLIP_LINE);
    // Section E ablates these two inside detectBlemishes, for the same reason.
    expect(source).toContain(EXCLUDE_FILL);
    expect(source).toContain(LAB_CALL);
    expect(source).toContain(LAB_AFTER);
    expect(source).toContain(POW_LINE);
    expect(source).toContain(ROW_FILTERED);
  });

  it("runs the clipped-channel branch once per scan per region, not per preview tick", () => {
    // The 650ms tick's own reader is a different file. If this ever stops being true
    // the cost model in the sweep's header is wrong, so it is a case and not a comment.
    const quality = readFileSync("app/scan/capture-analysis.ts", "utf8");
    expect(quality).toContain('from "./skin-roi-quality"');
    const roi = readFileSync("app/scan/skin-roi-quality.ts", "utf8");
    expect(roi).toContain('import { SAMPLING_LANDMARKS } from "@/lib/skin"');
    expect(roi).not.toContain("analyzeSkin");
    const loop = readFileSync("app/scan/use-quality-loop.ts", "utf8");
    expect(loop).not.toContain("analyzeSkin");
    // ...and the burst is at most three frames, which is the other half of 6 x 3.
    expect(readFileSync("app/scan/use-capture-analysis.ts", "utf8")).toContain("for (let i = 1; i < 3; i += 1)");
  });

  it("excludes the same grid cells row-filtered as it did point-by-point", () => {
    // detectBlemishes rejects a grid cell within excludeR of any non-skin landmark.
    // That test used to run all ~42 points against every one of ~18,000 cells; it now
    // drops, once per row, the points that are further than excludeR in y alone and so
    // can never be within excludeR at all. This re-derives both forms over the real
    // grid and asserts they mark exactly the same cells, at radii either side of the
    // shipped 0.055 of face width, including ones where a point sits on the boundary.
    const w = 720;
    const h = 960;
    const lms = faceLandmarks();
    const xs = lms.map((lm) => lm.x * w);
    const ys = lms.map((lm) => lm.y * h);
    const faceW = Math.max(...xs) - Math.min(...xs);
    const points = NON_SKIN.map((i) => ({ x: lms[i].x * w, y: lms[i].y * h }));
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const stride = Math.max(1, faceW / 90);
    const gw = Math.floor((Math.min(w - 1, Math.ceil(Math.max(...xs))) - x0) / stride) + 1;
    const gh = Math.floor((Math.min(h - 1, Math.ceil(Math.max(...ys))) - y0) / stride) + 1;

    for (const fraction of [0.0, 0.01, 0.055, 0.12, 0.4]) {
      const r = fraction * faceW;
      const rSq = r * r;
      let cells = 0;
      let excludedCells = 0;
      for (let gy = 0; gy < gh; gy += 1) {
        const cy = y0 + gy * stride;
        if (cy >= h) continue;
        const rowPoints = points.filter((point) => (cy - point.y) ** 2 < rSq);
        for (let gx = 0; gx < gw; gx += 1) {
          const cx = x0 + gx * stride;
          if (cx >= w) continue;
          cells += 1;
          const naive = points.some((point) => (cx - point.x) ** 2 + (cy - point.y) ** 2 < rSq);
          const filtered = rowPoints.some((point) => (cx - point.x) ** 2 + (cy - point.y) ** 2 < rSq);
          expect(filtered, `radius ${fraction} cell ${gx},${gy}`).toBe(naive);
          if (naive) excludedCells += 1;
        }
      }
      // A radius that excludes nothing, or everything, would make the equality above
      // hold for free. The middle radii have to actually bite.
      if (fraction > 0 && fraction < 0.4) {
        expect(excludedCells, `radius ${fraction} excluded nothing`).toBeGreaterThan(0);
        expect(excludedCells, `radius ${fraction} excluded everything`).toBeLessThan(cells);
      }
    }
  });

  it("counts the same blemishes it counted before the row filter", () => {
    // The end-to-end guard on the same change: these are the counts and densities the
    // build BEFORE the row filter produced on this fixture, byte for byte. Two of the
    // fixture's five discs sit inside the nostril group's exclusion band in y, so a
    // row filter with the wrong bound moves them.
    const expected: Array<[number, number, number, number]> = [
      [400, 480, 6, 4.122487064212401],
      [720, 960, 5, 3.061918802449535],
      [1080, 1440, 5, 3.060761789600968],
      [1440, 1920, 5, 3.061224489795918],
    ];
    for (const [w, h, count, density] of expected) {
      const raw = extractRawFeatures(syntheticFace(w, h), faceLandmarks());
      expect(raw, `${w}x${h} produced no reading`).not.toBeNull();
      expect(raw!.blemishCount, `${w}x${h} blemishCount`).toBe(count);
      expect(raw!.blemishDensity, `${w}x${h} blemishDensity`).toBe(density);
    }
  });

  it("reads the same frame the same way twice, so a timing loop measures one thing", () => {
    const image = syntheticFace(720, 960);
    const lms = faceLandmarks();
    const a = extractRawFeatures(image, lms);
    const b = extractRawFeatures(image, lms);
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
  });
});

// ---------------------------------------------------------------------------
// The sweep. Everything below prints and asserts nothing unless asked.
// ---------------------------------------------------------------------------


/** Median and spread of the per-call cost, over REPEATS independent repeats. */
function timeIt(label: string, iterations: number, run: () => void) {
  for (let i = 0; i < Math.max(3, Math.min(iterations, 20)); i += 1) run(); // warm the JIT
  const per: number[] = [];
  for (let r = 0; r < REPEATS; r += 1) {
    const t0 = performance.now();
    for (let i = 0; i < iterations; i += 1) run();
    per.push((performance.now() - t0) / iterations);
  }
  per.sort((a, b) => a - b);
  const median = per[Math.floor(per.length / 2)];
  return { label, median, min: per[0], max: per[per.length - 1], spread: per[per.length - 1] / per[0] };
}

/** Two candidates timed against each other, alternating within each repeat, so a
 *  drift in the box (or in V8's tiering) lands on both rather than on whichever ran
 *  second. Same REPEATS and same shape of result as timeIt. */
function timePair(iterations: number, a: () => void, b: () => void) {
  const warm = Math.max(3, Math.min(iterations, 20));
  for (let i = 0; i < warm; i += 1) { a(); b(); }
  const perA: number[] = [];
  const perB: number[] = [];
  for (let r = 0; r < REPEATS; r += 1) {
    // Swap which one goes first on alternate repeats: whatever runs second inherits
    // the cache state the first left behind, and that must not always be the same one.
    const first = r % 2 === 0;
    const run = (fn: () => void, into: number[]) => {
      const t0 = performance.now();
      for (let i = 0; i < iterations; i += 1) fn();
      into.push((performance.now() - t0) / iterations);
    };
    if (first) { run(a, perA); run(b, perB); } else { run(b, perB); run(a, perA); }
  }
  // The PAIRED difference is the estimator worth reading: a and b were measured
  // adjacently in the same repeat, so a drift in the box between repeats cancels in
  // each delta instead of landing in whichever median it happened to move.
  const deltas = perA.map((v, i) => perB[i] - v);
  const summarise = (label: string, per: number[]) => {
    const sorted = [...per].sort((x, y) => x - y);
    return { label, median: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted[sorted.length - 1] };
  };
  return [summarise("a", perA), summarise("b", perB), summarise("delta", deltas)] as const;
}

const ms = (v: number) => v.toFixed(3).padStart(8);
const us = (v: number) => (v * 1000).toFixed(1).padStart(8);

describe("per-scan cost sweep", () => {
  it("prints where a scan's time goes", { timeout: 600_000 }, async () => {
    if (!process.env.ARU_PRINT_SCAN_COST) return;
    const out = (line: string) => process.stdout.write(`${line}\n`);

    out("");
    out(`node ${process.version} on ${process.arch}; median of ${REPEATS} repeats, min..max alongside.`);
    out("This is the build container, NOT a phone. No device multiplier is applied anywhere.");

    out("");
    out("A. one scan, end to end (ms per call)");
    out("frame        analyzeSkin  min..max   spread   burst(3f)  min..max");
    for (const [w, h] of FRAMES) {
      const image = syntheticFace(w, h);
      const lms = faceLandmarks();
      const frames = [0, 1, 2].map(() => ({ imageData: image, landmarks: lms as unknown as Landmark[] }));
      const one = timeIt("analyzeSkin", 20, () => void analyzeSkin(image, lms));
      const burst = timeIt("burst", 8, () => void analyzeSkinBurst(frames));
      out(
        `${`${w}x${h}`.padEnd(12)}${ms(one.median)} ${ms(one.min)}..${ms(one.max)} ${one.spread.toFixed(3)}  ` +
        `${ms(burst.median)} ${ms(burst.min)}..${ms(burst.max)}`
      );
    }

    out("");
    out("B. one frame, by phase (us per call; 'rest' is analyzeSkin minus the three)");
    out("frame        6xsampleRegion  frameGains  detectBlemishes      rest   facebox px   grid cells");
    for (const [w, h] of FRAMES) {
      const image = syntheticFace(w, h);
      const { data } = image;
      const lms = faceLandmarks();
      const sample = timeIt("sample", 200, () => {
        for (const list of REGION_LISTS) sampleRegion(data, w, h, lms, list);
      });
      const gains = timeIt("gains", 200, () => void frameChannelGains(data, w, h));
      const gainValues = frameChannelGains(data, w, h);
      const blem = timeIt("blemish", 30, () => void detectBlemishes(data, w, h, lms, gainValues));
      const whole = timeIt("whole", 20, () => void analyzeSkin(image, lms));
      const faceW = (0.68 - 0.32) * w;
      const faceH = (0.82 - 0.22) * h;
      const stride = Math.max(1, faceW / 90);
      const gw = Math.floor((Math.min(w - 1, Math.ceil(0.68 * w)) - Math.floor(0.32 * w)) / stride) + 1;
      const gh = Math.floor((Math.min(h - 1, Math.ceil(0.82 * h)) - Math.floor(0.22 * h)) / stride) + 1;
      out(
        `${`${w}x${h}`.padEnd(12)}${us(sample.median)}    ${us(gains.median)}  ${us(blem.median)}  ` +
        `${us(whole.median - sample.median - gains.median - blem.median)}  ` +
        `${Math.round(faceW * faceH).toString().padStart(10)}   ${(gw * gh).toString().padStart(10)}`
      );
    }

    out("");
    out("C. cycle 14's clipped-channel branch, and the two heaviest things inside");
    out("   detectBlemishes, each isolated against a build of lib/skin.ts with exactly");
    out("   that line removed or replaced. Durations only; an ablated build's COUNTS");
    out("   are not a reading and are never read.");
    const source = readFileSync("lib/skin.ts", "utf8");
    const dir = "tests/.scan-cost-tmp";
    type SkinModule = { sampleRegion: typeof sampleRegion; detectBlemishes: typeof detectBlemishes };
    const write = (name: string, needle: string, replacement: string) => {
      if (!source.includes(needle)) throw new Error(`${name}: the line moved; the ablation measures nothing`);
      writeFileSync(
        `${dir}/${name}.ts`,
        source.replace(needle, replacement).replace('from "./i18n/core"', 'from "../../lib/i18n/core"')
      );
    };
    try {
      mkdirSync(dir, { recursive: true });
      write("skin-no-clip-branch", CLIP_LINE, "");
      write("skin-no-exclusion", EXCLUDE_FILL, "");
      write("skin-no-rgbtolab", LAB_CALL, "      astar[gy * gw + gx] = r - g;\n");
      write("skin-no-srgb-pow", POW_LINE, "  return c * c;\n");
      write("skin-point-by-point-exclusion", ROW_FILTERED, POINT_BY_POINT);
      // Two needles, one build: the pre-cycle-17 rgbToLab and the call site that used it.
      if (!source.includes(LAB_AFTER) || !source.includes(LAB_CALL)) {
        throw new Error("skin-lab-pre-fast-path: a needle moved; the ablation measures nothing");
      }
      writeFileSync(
        `${dir}/skin-lab-pre-fast-path.ts`,
        source
          .replace(LAB_AFTER, LAB_BEFORE)
          .replace(LAB_CALL, LAB_CALL_BEFORE)
          .replace('from "./i18n/core"', 'from "../../lib/i18n/core"')
      );
      // And an UNCHANGED copy, so C4 compares two freshly loaded modules rather than
      // one fresh module against the statically imported build that sections B, C1,
      // C2 and C3 have already driven through V8's tiers. Measured the asymmetric way
      // first, the "saving" changed sign between frame sizes and between runs.
      writeFileSync(
        `${dir}/skin-lab-fast-path.ts`,
        source.replace('from "./i18n/core"', 'from "../../lib/i18n/core"')
      );
      // The specifier is a variable behind @vite-ignore: a literal would make tsc
      // resolve a module that only exists while this sweep is running, and adding an
      // error to `npx tsc --noEmit` to print a table is not a trade worth making.
      const load = async (name: string): Promise<SkinModule> => {
        const path = `./.scan-cost-tmp/${name}.ts`;
        return (await import(/* @vite-ignore */ path)) as SkinModule;
      };
      const noClip = await load("skin-no-clip-branch");
      const noExclude = await load("skin-no-exclusion");
      const noLab = await load("skin-no-rgbtolab");
      const prior = await load("skin-point-by-point-exclusion");
      const preFast = await load("skin-lab-pre-fast-path");
      const fast = await load("skin-lab-fast-path");
      const noPow = await load("skin-no-srgb-pow");

      out("");
      out("   C1. the clipped-channel branch. Six regions = one frame's worth of sampling,");
      out("       4536 pixels, the same count at every frame size.");
      out("   frame          shipped   min..max      ablated   min..max        delta   delta/px");
      for (const [w, h] of FRAMES) {
        const { data } = syntheticFace(w, h);
        const lms = faceLandmarks();
        const on = timeIt("on", 400, () => {
          for (const list of REGION_LISTS) sampleRegion(data, w, h, lms, list);
        });
        const off = timeIt("off", 400, () => {
          for (const list of REGION_LISTS) noClip.sampleRegion(data, w, h, lms, list);
        });
        const delta = on.median - off.median;
        out(
          `   ${`${w}x${h}`.padEnd(12)}${us(on.median)} ${us(on.min)}..${us(on.max)} ${us(off.median)} ` +
          `${us(off.min)}..${us(off.max)} ${us(delta)}  ${((delta * 1e6) / 4536).toFixed(2)}ns`
        );
      }
      out("       Read each delta against the min..max beside it. Where |delta| is inside");
      out("       either column's own spread, this box cannot resolve the branch at all.");

      out("");
      out("   C2. inside detectBlemishes (ms per call).");
      out("   frame          shipped  no exclusion test   no rgbToLab   exclusion   rgbToLab");
      for (const [w, h] of FRAMES) {
        const { data } = syntheticFace(w, h);
        const lms = faceLandmarks();
        const gainValues = frameChannelGains(data, w, h);
        const full = timeIt("full", 30, () => void detectBlemishes(data, w, h, lms, gainValues));
        const ex = timeIt("ex", 30, () => void noExclude.detectBlemishes(data, w, h, lms, gainValues));
        const lab = timeIt("lab", 30, () => void noLab.detectBlemishes(data, w, h, lms, gainValues));
        out(
          `   ${`${w}x${h}`.padEnd(12)}${ms(full.median)}          ${ms(ex.median)}     ${ms(lab.median)}  ` +
          `${ms(full.median - ex.median)}  ${ms(full.median - lab.median)}`
        );
      }

      out("");
      out("   C3. this cycle's own change: the row-filtered exclusion test against the");
      out("       point-by-point loop it replaced, both built from the same lib/skin.ts.");
      out("       The two builds are asserted to produce the same count, so this is a");
      out("       duration difference and nothing else.");
      out("   frame        row-filtered   min..max     point-by-point   min..max      saved");
      for (const [w, h] of FRAMES) {
        const { data } = syntheticFace(w, h);
        const lms = faceLandmarks();
        const gainValues = frameChannelGains(data, w, h);
        const a = detectBlemishes(data, w, h, lms, gainValues);
        const b = prior.detectBlemishes(data, w, h, lms, gainValues);
        if (a.count !== b.count || a.areaFace !== b.areaFace) {
          throw new Error(`${w}x${h}: the two builds disagree (${a.count}/${a.areaFace} vs ${b.count}/${b.areaFace})`);
        }
        const now = timeIt("now", 30, () => void detectBlemishes(data, w, h, lms, gainValues));
        const was = timeIt("was", 30, () => void prior.detectBlemishes(data, w, h, lms, gainValues));
        out(
          `   ${`${w}x${h}`.padEnd(12)}${ms(now.median)} ${ms(now.min)}..${ms(now.max)}  ` +
          `${ms(was.median)} ${ms(was.min)}..${ms(was.max)}  ${ms(was.median - now.median)}`
        );
      }

      out("");
      out("   C4. cycle 17's change: labAStar against the rgbToLab call it replaced,");
      out("       both built from the same lib/skin.ts. The two builds are asserted to");
      out("       return the SAME count and the same area — the fast path computes a*");
      out("       with the identical sequence of doubles — so this is a duration");
      out("       difference and nothing else.");
      out("   frame          labAStar   rgbToLab   saved(paired)   min..max        %");
      for (const [w, h] of FRAMES) {
        const { data } = syntheticFace(w, h);
        const lms = faceLandmarks();
        const gainValues = frameChannelGains(data, w, h);
        const a = fast.detectBlemishes(data, w, h, lms, gainValues);
        const b = preFast.detectBlemishes(data, w, h, lms, gainValues);
        if (a.count !== b.count || a.areaFace !== b.areaFace) {
          throw new Error(`${w}x${h}: the two builds disagree (${a.count}/${a.areaFace} vs ${b.count}/${b.areaFace})`);
        }
        const [now, was, delta] = timePair(
          30,
          () => void fast.detectBlemishes(data, w, h, lms, gainValues),
          () => void preFast.detectBlemishes(data, w, h, lms, gainValues)
        );
        out(
          `   ${`${w}x${h}`.padEnd(12)}${ms(now.median)}  ${ms(was.median)}  ` +
          `${ms(delta.median)} ${ms(delta.min)}..${ms(delta.max)}  ` +
          `${((delta.median / was.median) * 100).toFixed(1).padStart(5)}%`
        );
      }
      out("       The saved column is the median of the PAIRED per-repeat differences,");
      out("       and min..max beside it is their own spread. A median whose spread");
      out("       straddles zero is not resolvable on this box and is not a result.");

      out("");
      out("   C5. where the rest of it is. labAStar keeps all three Math.pow(., 2.4)");
      out("       calls, so the sRGB transfer curve is the part NO a*-only fast path");
      out("       can reach. Same paired form; the ablated build's counts are not a");
      out("       reading and are never read.");
      out("   frame          shipped   pow -> c*c   removed(paired)   min..max        %");
      for (const [w, h] of FRAMES) {
        const { data } = syntheticFace(w, h);
        const lms = faceLandmarks();
        const gainValues = frameChannelGains(data, w, h);
        const [on, off, delta] = timePair(
          30,
          () => void fast.detectBlemishes(data, w, h, lms, gainValues),
          () => void noPow.detectBlemishes(data, w, h, lms, gainValues)
        );
        out(
          `   ${`${w}x${h}`.padEnd(12)}${ms(on.median)}    ${ms(off.median)}  ` +
          `${ms(-delta.median)} ${ms(-delta.max)}..${ms(-delta.min)}  ` +
          `${((-delta.median / on.median) * 100).toFixed(1).padStart(5)}%`
        );
      }
      out("       An upper bound, like every ablation here: dropping the curve also");
      out("       changes which cells survive suppression, so it moves the inner loop's");
      out("       work as well as its own cost.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    out("");
    out("D. what the 650ms preview tick actually runs (evaluateSkinRoiQuality), and");
    out("   what share of that budget it and a whole scan take ON THIS BOX.");
    out("frame        roiQuality  min..max    %of650ms   analyzeSkin %of650ms");
    for (const [w, h] of FRAMES) {
      const image = syntheticFace(w, h);
      const lms = faceLandmarks() as unknown as Landmark[];
      const regions = skinRoiRegionsFromLandmarks(lms);
      if (!regions) throw new Error(`${w}x${h}: no skin ROI regions, so there is nothing to time`);
      // A degenerate ROI makes evaluateSkinRoiQuality return before it reads a pixel,
      // which times an early return and reads as 0.000ms. Refuse to publish that.
      const probe = evaluateSkinRoiQuality(image, regions, DEFAULT_SKIN_ROI_THRESHOLDS);
      if (!probe.regionsReady) throw new Error(`${w}x${h}: ROI quality bailed out early (${probe.reason})`);
      const roi = timeIt("roi", 40, () => void evaluateSkinRoiQuality(image, regions, DEFAULT_SKIN_ROI_THRESHOLDS));
      const whole = timeIt("whole", 20, () => void analyzeSkin(image, lms as unknown as LM[]));
      out(
        `${`${w}x${h}`.padEnd(12)}${ms(roi.median)} ${ms(roi.min)}..${ms(roi.max)}  ` +
        `${((roi.median / 650) * 100).toFixed(2).padStart(7)}%  ${ms(whole.median)}  ` +
        `${((whole.median / 650) * 100).toFixed(2).padStart(7)}%`
      );
    }
    out("");
  });
});
