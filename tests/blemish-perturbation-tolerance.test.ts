import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { detectBlemishes, frameChannelGains, labAStar } from "@/lib/skin";

/**
 * How far can a* move before `blemishCount` changes?
 *
 * Cycle 17 measured where a scan's time goes and found the answer is the sRGB transfer
 * curve: ablating `Math.pow(., 2.4)` takes 37-61% out of `detectBlemishes`, against the
 * 1.4-7.8% the a*-only fast path buys (`C5` in tests/scan-cost-benchmark.test.ts). The
 * obvious way to take that is a lookup table, and the obvious objection is that a table
 * is an approximation while `blemishCount` is a published value. The backlog item that
 * came out of it said the missing number is not "is the error small" but "is the error
 * smaller than the gap between the cells that survive and the cells that do not".
 *
 * That gap is measurable, and this file measures it. `detectBlemishes` computes an a*
 * per grid cell, subtracts a local background, keeps cells clearing
 * `BLEMISH.minResidual` that are local maxima in a 5x5 neighbourhood, and counts them.
 * So the count changes only when some cell changes its classification, and the question
 * becomes: what is the smallest per-cell error that flips one?
 *
 * Two numbers bracket the answer, and both are reported because they are different
 * claims:
 *
 * - The CERTIFIED radius. Below it no per-cell error bounded by delta can change the
 *   count, whatever its shape, because no cell's classification can flip. Derived from
 *   the margins of the run itself: a cell's residual moves by at most 2*delta (its own
 *   a* by delta, its local background by at most delta the other way), and a DIFFERENCE
 *   of two residuals by at most 4*delta.
 * - The ACHIEVED radius. The smallest delta at which a perturbation this file actually
 *   applies does change the count. It is an upper bound on the worst case: a cleverer
 *   assignment might manage it with less.
 *
 * The perturbation is injected into a rebuilt copy of lib/skin.ts, at the point where
 * `labAStar`'s results are consumed and before anything reads them — the same
 * source-rewriting machinery tests/scan-cost-benchmark.test.ts uses for its ablations.
 * A harness that silently perturbs nothing would report an enormous tolerance and look
 * like good news, so the cases come in that order: the unperturbed build reproduces the
 * committed counts exactly, the constants every margin is measured against are read out
 * of lib/skin.ts rather than copied into this file, and a perturbation large enough to
 * move the count is shown to move it — before any tolerance is reported.
 *
 * And then the thing the tolerance is for: the same machinery builds lib/skin.ts with
 * the transfer curve replaced by a lookup table, three of them, and reports the a*
 * error each one produces on the inputs the detector actually feeds, against the
 * tolerance measured here. Nothing in lib/ changes. This is the measurement the
 * decision needs, not the decision.
 *
 * The full distribution, including perturbation shapes that are not asserted:
 *   ARU_PRINT_BLEMISH_TOLERANCE=1 npx vitest run tests/blemish-perturbation-tolerance.test.ts
 * and the write-up, with every table this prints and the verdict it supports:
 * docs/blemish-perturbation-tolerance.md.
 */

type LM = { x: number; y: number; z?: number };
type Perturb = (astar: Float64Array, valid: Uint8Array, gw: number, gh: number) => void;
type ObserveResidual = (residual: Float64Array, valid: Uint8Array, gw: number, gh: number) => void;
type Hooked = {
  detectBlemishes: typeof detectBlemishes;
  labAStar: typeof labAStar;
  __perturbAStar: { fn: Perturb | null };
  __observeResidual: { fn: ObserveResidual | null };
};

/** lib/skin.ts's BLEMISH constants, read out of the source rather than copied into it.
 *  The replica below has to classify cells the way the detector does; a copy would go
 *  on measuring margins against a floor the detector no longer uses, and every number
 *  in this file would quietly become a measurement of something else. A case below
 *  pins the three values, so moving one fails by name instead of re-measuring. */
function blemishConstant(name: string): number {
  const source = readFileSync("lib/skin.ts", "utf8");
  const match = new RegExp(`\\n  ${name}: ([0-9.]+),`).exec(source);
  if (!match) throw new Error(`lib/skin.ts no longer declares BLEMISH.${name}`);
  return Number(match[1]);
}
const MIN_RESIDUAL = blemishConstant("minResidual");
const BACKGROUND_RADIUS = blemishConstant("backgroundRadius");
const SUPPRESSION_RADIUS = blemishConstant("suppressionRadius");

/** The tests/scan-cost-benchmark.test.ts face and landmark spread — the only fixture in
 *  this repository whose landmarks are laid out widely enough for `detectBlemishes` to
 *  run over a realistic grid, and the one whose counts the committed pins are drawn
 *  from. Duplicated rather than exported, as every other fixture in tests/ is. */
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

const FOREHEAD = [9, 8, 107, 336, 151, 10, 67, 297];
const LEFT_CHEEK = [50, 101, 118, 117, 116, 205, 36];
const RIGHT_CHEEK = [280, 330, 347, 346, 345, 425, 266];
const CHIN = [18, 200, 199, 175, 152, 83, 313];

function faceLandmarks(): LM[] {
  const at = (x: number, y: number) => ({ x, y, z: 0 });
  const landmarks: LM[] = Array.from({ length: 468 }, (_, i) => {
    const a = (i / 468) * Math.PI * 2;
    return at(0.5 + 0.17 * Math.cos(a), 0.52 + 0.29 * Math.sin(a));
  });
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
  spread([33, 133, 159, 145, 153, 157, 173, 246], 0.34, 0.40, 0.44, 0.44);
  spread([362, 263, 386, 374, 380, 385, 398, 466], 0.56, 0.40, 0.66, 0.44);
  spread([70, 63, 105, 66, 107, 336, 296, 334, 293, 300], 0.32, 0.33, 0.68, 0.33);
  spread([61, 291, 13, 14, 0, 17, 78, 308, 39, 269], 0.41, 0.70, 0.59, 0.72);
  spread([94, 99, 328, 2], 0.46, 0.56, 0.54, 0.58);
  return landmarks;
}

/** What the shipped build reads on this fixture. The same four rows
 *  tests/scan-cost-benchmark.test.ts pins; repeated here so the harness is checked
 *  against the published values rather than against itself. */
const COMMITTED: Array<[number, number, number, number]> = [
  [400, 480, 6, 4.122487064212401],
  [720, 960, 5, 3.061918802449535],
  [1080, 1440, 5, 3.060761789600968],
  [1440, 1920, 5, 3.061224489795918],
];

/** The noise amplitude the committed fixture uses, and one either side of it. Noise is
 *  what puts cells near the residual floor, so it is the knob that moves the margins;
 *  a tolerance measured on one frame would be an anecdote. */
const NOISE_LEVELS = [4, 9, 14];

/**
 * The measurement, committed. Per frame size: the certified radius, the delta that
 * lifts one cell over the floor, the delta that drops one under it — all in a* units.
 * Regenerate with ARU_PRINT_BLEMISH_TOLERANCE=1 and read the table it prints.
 */
const EXPECTED_TOLERANCE: Array<[number, number, number]> = [
  [0.00017859239785300574, 1.254294358, 4.552084464],
  [0.0004587555043507052, 1.236820701, 0.008175173507812501],
  [0.0023317497022921074, 1.264275574, 0.009978133226562502],
  [0.0002625290811928416, 1.271591904, 8.766481248000002],
];

/** Per candidate table and frame size: the worst |delta a*| the table produces on the
 *  inputs the detector feeds, and the count that comes out of it. */
const EXPECTED_LUT: Array<[string, number, number, number]> = [
  ["256 nearest", 400, 0.4702879849315944, 7],
  ["256 nearest", 720, 0.46191607187268113, 5],
  ["256 nearest", 1080, 0.4658468284778339, 5],
  ["256 nearest", 1440, 0.46100146910527107, 5],
  ["256 linear", 400, 0.0004787962235575094, 6],
  ["256 linear", 720, 0.0005036974101702008, 5],
  ["256 linear", 1080, 0.0005090465133306132, 5],
  ["256 linear", 1440, 0.0005156332888445192, 5],
  ["1024 linear", 400, 3.0264247163902525e-05, 6],
  ["1024 linear", 720, 2.943966231860884e-05, 5],
  ["1024 linear", 1080, 3.0684908336464645e-05, 5],
  ["1024 linear", 1440, 2.9084256003564235e-05, 5],
  ["4096 linear", 400, 1.8490215469846305e-06, 6],
  ["4096 linear", 720, 1.9172634591058113e-06, 5],
  ["4096 linear", 1080, 1.86537607582693e-06, 5],
  ["4096 linear", 1440, 1.9101021320189204e-06, 5],
];

/** Per noise amplitude and frame size: the count, and the certified radius. */
const EXPECTED_FAMILY: Array<[number, number, number, number]> = [
  [4, 400, 5, 1.0462367346697476e-05],
  [4, 720, 5, 8.489633564234822e-05],
  [4, 1080, 5, 0.000326820393055538],
  [4, 1440, 5, 4.135129144478e-05],
  [9, 400, 6, 0.00017859239785300574],
  [9, 720, 5, 0.0004587555043507052],
  [9, 1080, 5, 0.0023317497022921074],
  [9, 1440, 5, 0.0002625290811928416],
  [14, 400, 7, 0.00014820971506246394],
  [14, 720, 5, 0.00203678723564904],
  [14, 1080, 5, 0.003012814235247685],
  [14, 1440, 5, 0.000942254275686949],
];

// ---------------------------------------------------------------------------
// The rebuilt module: lib/skin.ts with one hook, and with the transfer curve
// replaced by a lookup table.
// ---------------------------------------------------------------------------

const DIR = "tests/.blemish-perturb-tmp";
/** The anchor the hook goes in front of: the first thing that reads `astar`. */
const CONSUME_ANCHOR =
  "  // Summed-area tables over valid cells only, so the local background is the\n";
const HOOK_LINE = "  if (__perturbAStar.fn) __perturbAStar.fn(astar, valid, gw, gh);\n";
const DECL_ANCHOR = "export function detectBlemishes(\n";
const HOOK_DECL =
  "export const __perturbAStar: { fn: null | ((astar: Float64Array, valid: Uint8Array, gw: number, gh: number) => void) } = { fn: null };\n\n";
/** The SECOND hook, and the blind spot it exists to close.
 *
 *  `__perturbAStar` is injected before the summed-area tables, so every residual this
 *  file reasons about is `residualsOf`'s — a REPLICA, recomputed from the a* grid the
 *  first hook captured. Anything `lib/skin.ts` does to `residual` DOWNSTREAM of a* is
 *  therefore invisible to the decision margins: quantising `residual[i]` to 3 decimals
 *  at the source leaves both margin cases green, which is the sixth break in
 *  docs/blemish-perturbation-tolerance.md §7.4 and the one that did not bite. The guard
 *  measures the a*-production path, which is what it was built for; it does not measure
 *  the classifier.
 *
 *  This hook is injected after the residual loop and before the classification loop, so
 *  the field the detector ACTUALLY classifies on can be read out and held against the
 *  replica. It is a second hook rather than a widening of the first because the two read
 *  different things at different points, and a replica that silently stopped being the
 *  detector is exactly the failure being guarded against. */
const RESIDUAL_ANCHOR = "  let count = 0;\n  let validCells = 0;\n";
const RESIDUAL_HOOK_LINE = "  if (__observeResidual.fn) __observeResidual.fn(residual, valid, gw, gh);\n";
const RESIDUAL_HOOK_DECL =
  "export const __observeResidual: { fn: null | ((residual: Float64Array, valid: Uint8Array, gw: number, gh: number) => void) } = { fn: null };\n\n";
/** srgbLinear's own line, the one C5 in tests/scan-cost-benchmark.test.ts ablates. */
const POW_LINE = "  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);\n";
const SRGB_ANCHOR = "function srgbLinear(channel: number): number {\n";

/** Candidate tables: [label, entries, interpolate]. */
const LUTS: Array<[string, number, boolean]> = [
  ["256 nearest", 256, false],
  ["256 linear", 256, true],
  ["1024 linear", 1024, true],
  ["4096 linear", 4096, true],
];

function rewriteImports(source: string): string {
  return source.replace('from "./i18n/core"', 'from "../../lib/i18n/core"');
}

function withHook(source: string): string {
  if (!source.includes(CONSUME_ANCHOR)) {
    throw new Error("perturbation hook: the astar consumer moved; the harness measures nothing");
  }
  if (!source.includes(DECL_ANCHOR)) {
    throw new Error("perturbation hook: detectBlemishes moved; the harness measures nothing");
  }
  if (!source.includes(RESIDUAL_ANCHOR)) {
    throw new Error("residual hook: the classification loop moved; the residual guard measures nothing");
  }
  return source
    .replace(DECL_ANCHOR, HOOK_DECL + RESIDUAL_HOOK_DECL + DECL_ANCHOR)
    .replace(CONSUME_ANCHOR, HOOK_LINE + CONSUME_ANCHOR)
    .replace(RESIDUAL_ANCHOR, RESIDUAL_HOOK_LINE + RESIDUAL_ANCHOR);
}

function withLut(source: string, entries: number, interpolate: boolean): string {
  if (!source.includes(POW_LINE) || !source.includes(SRGB_ANCHOR)) {
    throw new Error("lut build: srgbLinear moved; the comparison measures nothing");
  }
  const last = entries - 1;
  const table =
    `const SRGB_LUT = (() => {\n` +
    `  const table = new Float64Array(${entries});\n` +
    `  for (let i = 0; i < ${entries}; i += 1) {\n` +
    `    const c = i / ${last};\n` +
    `    table[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);\n` +
    `  }\n` +
    `  return table;\n` +
    `})();\n\n`;
  const body = interpolate
    ? `  const at = Math.min(${last}, Math.max(0, (channel / 255) * ${last}));\n` +
      `  const lo = Math.floor(at);\n` +
      `  const hi = lo >= ${last} ? ${last} : lo + 1;\n` +
      `  const frac = at - lo;\n` +
      `  return SRGB_LUT[lo] * (1 - frac) + SRGB_LUT[hi] * frac;\n`
    : `  const at = Math.min(${last}, Math.max(0, (channel / 255) * ${last}));\n` +
      `  return SRGB_LUT[Math.round(at)];\n`;
  return source.replace(SRGB_ANCHOR, table + SRGB_ANCHOR).replace(POW_LINE, body);
}

const LOADED = new Map<string, Promise<Hooked>>();
function load(name: string, build: (source: string) => string): Promise<Hooked> {
  const existing = LOADED.get(name);
  if (existing) return existing;
  const source = readFileSync("lib/skin.ts", "utf8");
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/${name}.ts`, rewriteImports(build(withHook(source))));
  // The specifier is a variable behind @vite-ignore for the reason
  // tests/scan-cost-benchmark.test.ts gives: a literal would make `npx tsc --noEmit`
  // resolve a module that only exists while this file is running.
  const path = `./.blemish-perturb-tmp/${name}.ts`;
  const loaded = import(/* @vite-ignore */ path) as Promise<Hooked>;
  LOADED.set(name, loaded);
  return loaded;
}

// ---------------------------------------------------------------------------
// The grid, and a replica of the classification the detector performs on it.
// ---------------------------------------------------------------------------

type Grid = { astar: Float64Array; valid: Uint8Array; gw: number; gh: number; count: number };

/** One frame per size, built once. Rebuilding a 1440x1920 fixture inside the search
 *  loop costs more than every detectBlemishes call the search makes. */
const FIXTURES = new Map<string, { data: Uint8ClampedArray; lms: LM[]; gains: { r: number; g: number; b: number } }>();
function fixture(w: number, h: number, noise = 9) {
  const key = `${w}x${h}@${noise}`;
  const cached = FIXTURES.get(key);
  if (cached) return cached;
  const { data } = syntheticFace(w, h, noise);
  const lms = faceLandmarks();
  const built = { data, lms, gains: frameChannelGains(data, w, h) };
  FIXTURES.set(key, built);
  return built;
}

/** Run the hooked build once, keeping the a* grid it computed. */
function capture(mod: Hooked, w: number, h: number, noise = 9): Grid {
  const { data, lms, gains } = fixture(w, h, noise);
  let grid: Grid | null = null;
  mod.__perturbAStar.fn = (astar, valid, gw, gh) => {
    grid = { astar: Float64Array.from(astar), valid: Uint8Array.from(valid), gw, gh, count: 0 };
  };
  const read = mod.detectBlemishes(data, w, h, lms, gains);
  mod.__perturbAStar.fn = null;
  if (!grid) throw new Error(`${w}x${h}: the hook never ran; the harness measures nothing`);
  return { ...(grid as Grid), count: read.count };
}

/** Run the hooked build once, keeping BOTH the a* grid the first hook sees and the
 *  residual field the detector went on to classify. The a* hook fires first (before the
 *  summed-area tables) and the residual hook second (after the residual loop), so one
 *  run yields both halves of the comparison. */
function captureWithResidual(mod: Hooked, w: number, h: number, noise = 9): { grid: Grid; residual: Float64Array } {
  const { data, lms, gains } = fixture(w, h, noise);
  let grid: Grid | null = null;
  let residual: Float64Array | null = null;
  mod.__perturbAStar.fn = (astar, valid, gw, gh) => {
    grid = { astar: Float64Array.from(astar), valid: Uint8Array.from(valid), gw, gh, count: 0 };
  };
  mod.__observeResidual.fn = (r) => {
    residual = Float64Array.from(r);
  };
  const read = mod.detectBlemishes(data, w, h, lms, gains);
  mod.__perturbAStar.fn = null;
  mod.__observeResidual.fn = null;
  if (!grid) throw new Error(`${w}x${h}: the a* hook never ran; the harness measures nothing`);
  if (!residual) throw new Error(`${w}x${h}: the residual hook never ran; the residual guard measures nothing`);
  return { grid: { ...(grid as Grid), count: read.count }, residual };
}

/** Run the hooked build with a perturbation applied to the a* grid. */
function countWith(mod: Hooked, w: number, h: number, fn: Perturb): number {
  const { data, lms, gains } = fixture(w, h);
  mod.__perturbAStar.fn = fn;
  const read = mod.detectBlemishes(data, w, h, lms, gains);
  mod.__perturbAStar.fn = null;
  return read.count;
}

/** lib/skin.ts's local background, cell by cell: the mean a* of the valid cells within
 *  BACKGROUND_RADIUS, null below 8 of them. Replicated rather than imported because the
 *  oracle below has to know each cell's margin before choosing where to push. */
function residualsOf(grid: Grid): { residual: Float64Array; windowCount: Float64Array } {
  const { astar, valid, gw, gh } = grid;
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
  const residual = new Float64Array(gw * gh);
  const windowCount = new Float64Array(gw * gh);
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const i = gy * gw + gx;
      if (!valid[i]) continue;
      const lx = Math.max(0, gx - BACKGROUND_RADIUS);
      const ly = Math.max(0, gy - BACKGROUND_RADIUS);
      const hx = Math.min(gw - 1, gx + BACKGROUND_RADIUS);
      const hy = Math.min(gh - 1, gy + BACKGROUND_RADIUS);
      const a = (hy + 1) * sw + (hx + 1);
      const b = ly * sw + (hx + 1);
      const c = (hy + 1) * sw + lx;
      const d = ly * sw + lx;
      const n = countTable[a] - countTable[b] - countTable[c] + countTable[d];
      windowCount[i] = n;
      if (n < 8) continue;
      residual[i] = astar[i] - (sumTable[a] - sumTable[b] - sumTable[c] + sumTable[d]) / n;
    }
  }
  return { residual, windowCount };
}

/** lib/skin.ts's count, from a residual field: above the floor and a local maximum,
 *  ties to the cell scanned first. */
function countedOf(grid: Grid, residual: Float64Array): Uint8Array {
  const { valid, gw, gh } = grid;
  const counted = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const i = gy * gw + gx;
      if (!valid[i]) continue;
      if (residual[i] < MIN_RESIDUAL) continue;
      let isPeak = true;
      for (let dy = -SUPPRESSION_RADIUS; dy <= SUPPRESSION_RADIUS && isPeak; dy += 1) {
        for (let dx = -SUPPRESSION_RADIUS; dx <= SUPPRESSION_RADIUS; dx += 1) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || (dx === 0 && dy === 0)) continue;
          const j = ny * gw + nx;
          if (residual[j] > residual[i] || (residual[j] === residual[i] && j < i)) {
            isPeak = false;
            break;
          }
        }
      }
      if (isPeak) counted[i] = 1;
    }
  }
  return counted;
}

/**
 * The certified radius: the largest delta for which NO per-cell error bounded by delta
 * can change the count, on this frame.
 *
 * Two amplification factors do the work, and both are bounds rather than estimates.
 * A cell's residual is `a*[i] - mean(a* over its window)`, and cell i is in its own
 * window, so an error field bounded by delta moves it by at most
 * `delta * (1 + (n-1)/n) < 2*delta`. A DIFFERENCE of two residuals moves by at most
 * twice that. So:
 *
 * - a counted cell stays counted while `delta < (residual - floor) / 2` and
 *   `delta < (residual - best neighbour) / 4`;
 * - an uncounted cell stays uncounted while EITHER of the two things blocking it
 *   cannot be undone, which is why the two deficits combine with max, not min.
 *
 * The minimum over every valid cell is the radius. It is conservative on purpose: it
 * answers "what is provably safe", which is the only form of the question an
 * approximation to the transfer curve can be checked against.
 */
function certifiedRadius(grid: Grid, residual: Float64Array, counted: Uint8Array): number {
  const { valid, gw, gh } = grid;
  let radius = Infinity;
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const i = gy * gw + gx;
      if (!valid[i]) continue;
      let best = -Infinity;
      for (let dy = -SUPPRESSION_RADIUS; dy <= SUPPRESSION_RADIUS; dy += 1) {
        for (let dx = -SUPPRESSION_RADIUS; dx <= SUPPRESSION_RADIUS; dx += 1) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || (dx === 0 && dy === 0)) continue;
          if (!valid[ny * gw + nx]) continue;
          best = Math.max(best, residual[ny * gw + nx]);
        }
      }
      const thresholdMargin = Math.abs(residual[i] - MIN_RESIDUAL) / 2;
      const peakMargin = best === -Infinity ? Infinity : Math.abs(residual[i] - best) / 4;
      // A counted cell loses its status if EITHER test flips: the smaller margin rules.
      // An uncounted cell gains it only if BOTH of the things blocking it are undone,
      // so its radius is the larger of the two deficits that apply to it.
      const cell = counted[i]
        ? Math.min(thresholdMargin, peakMargin)
        : Math.max(residual[i] < MIN_RESIDUAL ? thresholdMargin : 0, residual[i] < best ? peakMargin : 0);
      radius = Math.min(radius, cell);
    }
  }
  return radius;
}

/**
 * The decision margin: how much daylight there is under each count the detector
 * reports. A DIFFERENT number from the certified radius above, and the reason it is a
 * different number is the whole point of this section.
 *
 * `certifiedRadius` answers "what error is provably safe" — it takes the minimum over
 * EVERY valid cell, divides the two margins by the amplification factors 2 and 4, and
 * combines a counted cell's two margins with `min` and an uncounted cell's with `max`.
 * That makes it the right input to a question about an approximation, and the wrong one
 * to a question about the count itself: it conflates "this cell is one ulp from being
 * counted" with "this cell is one ulp from not being", and the division by 4 means a
 * reader cannot tell a suppression tie from a floor graze.
 *
 * These margins are the raw distances, undivided, over the cells that actually SURVIVED:
 *
 * - `peakGap` — the smallest `residual[i] - max(residual over i's suppression window)`
 *   across counted cells. Zero exactly when a counted cell is tied with a neighbour and
 *   won on `j < i`, i.e. when scan order and not the image decided that count.
 * - `floorGap` — the smallest `residual[i] - BLEMISH.minResidual` across counted cells.
 * - `tiedPeaks` — how many counted cells have `peakGap === 0`. This is the census the
 *   detector never took.
 *
 * `noiseScale` is a computed upper bound on the rounding error the detector's own
 * arithmetic can put into one residual, not a recalled constant: the local background
 * is four reads of a summed-area table over `gw*gh` cells, so an absolute error of
 * `gw*gh * EPSILON * max|a*|` bounds it with room to spare. A margin is "real" when it
 * is orders of magnitude above that, and "settled by scan order" when it is zero.
 */
type Margins = {
  peakGap: number;
  floorGap: number;
  tiedPeaks: number;
  counted: number;
  noiseScale: number;
};

function marginsOf(grid: Grid, residual: Float64Array, counted: Uint8Array): Margins {
  const { astar, valid, gw, gh } = grid;
  let maxAbs = 0;
  for (let i = 0; i < astar.length; i += 1) if (valid[i]) maxAbs = Math.max(maxAbs, Math.abs(astar[i]));
  let peakGap = Infinity;
  let floorGap = Infinity;
  let tiedPeaks = 0;
  let countedCells = 0;
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const i = gy * gw + gx;
      if (!counted[i]) continue;
      countedCells += 1;
      floorGap = Math.min(floorGap, residual[i] - MIN_RESIDUAL);
      let best = -Infinity;
      for (let dy = -SUPPRESSION_RADIUS; dy <= SUPPRESSION_RADIUS; dy += 1) {
        for (let dx = -SUPPRESSION_RADIUS; dx <= SUPPRESSION_RADIUS; dx += 1) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || (dx === 0 && dy === 0)) continue;
          if (!valid[ny * gw + nx]) continue;
          best = Math.max(best, residual[ny * gw + nx]);
        }
      }
      // A counted cell with no valid neighbour has nothing to be tied with, so it
      // constrains nothing; it is left out rather than reported as an infinite margin.
      if (best === -Infinity) continue;
      const gap = residual[i] - best;
      if (gap === 0) tiedPeaks += 1;
      peakGap = Math.min(peakGap, gap);
    }
  }
  return {
    peakGap,
    floorGap,
    tiedPeaks,
    counted: countedCells,
    noiseScale: gw * gh * Number.EPSILON * maxAbs,
  };
}

// ---------------------------------------------------------------------------
// Perturbation shapes.
// ---------------------------------------------------------------------------

/** Every valid cell up by delta. The detector subtracts a local background, so this is
 *  the shape that should change nothing at all — and the amount by which it eventually
 *  does is floating point, not the detector. */
const uniform = (delta: number): Perturb => (astar, valid) => {
  for (let i = 0; i < astar.length; i += 1) if (valid[i]) astar[i] += delta;
};

/** Alternating sign by cell parity: the largest local contrast a bounded error can
 *  produce without knowing anything about the frame. */
const checkerboard = (delta: number): Perturb => (astar, valid, gw) => {
  for (let i = 0; i < astar.length; i += 1) {
    if (!valid[i]) continue;
    const gx = i % gw;
    const gy = (i - gx) / gw;
    astar[i] += (gx + gy) % 2 === 0 ? delta : -delta;
  }
};

/** Independent random sign at full magnitude, seeded so a run reproduces. */
const randomSign = (delta: number, seed: number): Perturb => (astar, valid) => {
  let state = seed >>> 0;
  for (let i = 0; i < astar.length; i += 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    if (!valid[i]) continue;
    astar[i] += state / 4294967296 < 0.5 ? delta : -delta;
  }
};

/** One cell, chosen because it is the closest to changing its own classification.
 *  `sign` +1 lifts an uncounted cell over the floor, -1 drops a counted one under it.
 *  Perturbing a single cell is the weakest adversary there is — it moves that cell's
 *  residual by delta*(1 - 1/n), about 0.99*delta — which is why the delta it needs is
 *  an upper bound on the worst case and never a claim about it. */
function oracleTarget(grid: Grid, residual: Float64Array, counted: Uint8Array, sign: 1 | -1): number {
  const { valid, gw, gh } = grid;
  let target = -1;
  let bestDeficit = Infinity;
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const i = gy * gw + gx;
      if (!valid[i]) continue;
      if (sign === -1) {
        if (!counted[i]) continue;
        const deficit = residual[i] - MIN_RESIDUAL;
        if (deficit < bestDeficit) {
          bestDeficit = deficit;
          target = i;
        }
        continue;
      }
      if (counted[i] || residual[i] >= MIN_RESIDUAL) continue;
      // Only cells already winning their neighbourhood: lifting a cell that is not a
      // local maximum would need the neighbours moved too, which is a different shape.
      let isPeak = true;
      for (let dy = -SUPPRESSION_RADIUS; dy <= SUPPRESSION_RADIUS && isPeak; dy += 1) {
        for (let dx = -SUPPRESSION_RADIUS; dx <= SUPPRESSION_RADIUS; dx += 1) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || (dx === 0 && dy === 0)) continue;
          const j = ny * gw + nx;
          if (residual[j] > residual[i] || (residual[j] === residual[i] && j < i)) {
            isPeak = false;
            break;
          }
        }
      }
      if (!isPeak) continue;
      const deficit = MIN_RESIDUAL - residual[i];
      if (deficit < bestDeficit) {
        bestDeficit = deficit;
        target = i;
      }
    }
  }
  if (target < 0) throw new Error(`oracle: no candidate cell for sign ${sign}`);
  return target;
}

const oneCell = (index: number, delta: number, sign: 1 | -1): Perturb => (astar) => {
  astar[index] += sign * delta;
};

/** The target cell and the suppression neighbourhood around it, together. Dropping one
 *  cell does not remove a count — a neighbour it was suppressing takes its place, and
 *  the case below pins exactly that — so removing one takes the block. */
const block = (index: number, delta: number, sign: 1 | -1, radius: number): Perturb =>
  (astar, valid, gw, gh) => {
    const gx = index % gw;
    const gy = (index - gx) / gw;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const j = ny * gw + nx;
        if (valid[j]) astar[j] += sign * delta;
      }
    }
  };

/**
 * The smallest delta at which `shape(delta)` changes the count, bisected inside a
 * bracket that is checked at both ends first. Both checks matter: without the low one
 * a shape that perturbs nothing would report the bracket's floor, and without the high
 * one a shape that never bites would report its ceiling.
 */
function bisect(
  runAt: (delta: number) => number,
  baseline: number,
  lo: number,
  hi: number
): { delta: number; countAt: number } {
  if (runAt(lo) !== baseline) throw new Error(`bisect: the count already moved at ${lo}`);
  const highCount = runAt(hi);
  if (highCount === baseline) throw new Error(`bisect: the count never moved by ${hi}`);
  let low = lo;
  let high = hi;
  for (let i = 0; i < 60 && (high - low) / high > 1e-9; i += 1) {
    const mid = (low + high) / 2;
    if (runAt(mid) === baseline) low = mid;
    else high = mid;
  }
  return { delta: high, countAt: runAt(high) };
}

/** Escalate by doubling until the count moves, then bisect inside the last rung. Used
 *  for the shapes whose threshold is not predictable from the margins. */
function ladder(runAt: (delta: number) => number, baseline: number, start = 1e-9, cap = 64): number | null {
  let previous = start;
  for (let delta = start; delta <= cap; delta *= 2) {
    if (runAt(delta) !== baseline) return bisect(runAt, baseline, previous, delta).delta;
    previous = delta;
  }
  return null;
}

afterAll(() => {
  rmSync(DIR, { recursive: true, force: true });
});

const sig = (v: number) => (v === 0 ? "0" : v.toExponential(3));

describe("how far a* can move before blemishCount changes", () => {
  it("rebuilds lib/skin.ts with the hook and reads exactly what the shipped build reads", async () => {
    // The harness is only worth its output if the build it perturbs is the build that
    // ships. With no perturbation installed it must reproduce the committed counts and
    // densities, which are the same four rows tests/scan-cost-benchmark.test.ts pins.
    const mod = await load("skin-perturbable", (source) => source);
    for (const [w, h, count, density] of COMMITTED) {
      const { data, lms, gains } = fixture(w, h);
      const shipped = detectBlemishes(data, w, h, lms, gains);
      const hooked = mod.detectBlemishes(data, w, h, lms, gains);
      expect(hooked.count, `${w}x${h} hooked count`).toBe(shipped.count);
      expect(hooked.areaFace, `${w}x${h} hooked areaFace`).toBe(shipped.areaFace);
      expect(hooked.count, `${w}x${h} committed count`).toBe(count);
      expect(shipped.count / Math.max(shipped.areaFace, 1e-6), `${w}x${h} density`).toBe(density);
    }
  });

  it("measures against the floor and the windows the detector actually uses", () => {
    // Every margin in this file is a distance to one of these three. Read from
    // lib/skin.ts rather than copied, and pinned here so that moving one is a named
    // failure rather than a silent re-measurement of a different detector.
    expect(MIN_RESIDUAL, "BLEMISH.minResidual").toBe(1.6);
    expect(BACKGROUND_RADIUS, "BLEMISH.backgroundRadius").toBe(5);
    expect(SUPPRESSION_RADIUS, "BLEMISH.suppressionRadius").toBe(2);
  });

  it("actually perturbs: a large error moves the count at every frame size", async () => {
    // The failure mode this file has to rule out first. A hook that is never called,
    // or is called on a copy, reports an enormous tolerance and looks like good news.
    // Four a* units of alternating error is well past anything a lookup table could
    // produce — a 256-entry table read at its nearest entry is off by 0.47 at worst,
    // measured below — and it moves the count at all four sizes.
    const mod = await load("skin-perturbable", (source) => source);
    const moved: number[] = [];
    for (const [w, h, count] of COMMITTED) {
      const perturbed = countWith(mod, w, h, checkerboard(4));
      expect(perturbed, `${w}x${h}: a 4.0 a* checkerboard left the count alone`).not.toBe(count);
      moved.push(perturbed);
    }
    // Pinned, so "it moved" cannot quietly become "it moved to whatever".
    expect(moved).toEqual([415, 421, 414, 418]);
  });

  it("is insensitive to a uniform offset, which is the property the index is built on", async () => {
    // detectBlemishes subtracts a local background precisely so a device shifting every
    // a* in the frame by the same amount does not change the count. A uniform shape is
    // therefore the control: it must not move the count at magnitudes that dwarf every
    // threshold measured below.
    const mod = await load("skin-perturbable", (source) => source);
    for (const [w, h, count] of COMMITTED) {
      for (const delta of [1e-6, 1e-3, 0.5, 2]) {
        expect(countWith(mod, w, h, uniform(delta)), `${w}x${h} uniform ${delta}`).toBe(count);
      }
    }
  });

  it("measures the certified radius and the achieved one, at every frame size", async () => {
    const mod = await load("skin-perturbable", (source) => source);
    const rows: Array<{ w: number; h: number; certified: number; lift: number; drop: number }> = [];
    for (const [w, h, count] of COMMITTED) {
      const grid = capture(mod, w, h);
      const { residual } = residualsOf(grid);
      const counted = countedOf(grid, residual);
      // The replica has to be the detector, or the oracle targets the wrong cell.
      let replicated = 0;
      for (let i = 0; i < counted.length; i += 1) replicated += counted[i];
      expect(replicated, `${w}x${h}: the replica disagrees with detectBlemishes`).toBe(count);

      const certified = certifiedRadius(grid, residual, counted);
      const lifted = oracleTarget(grid, residual, counted, 1);
      const dropped = oracleTarget(grid, residual, counted, -1);
      // Removing a count is not the mirror image of adding one, and this is the case
      // that says so. Dropping the most marginal counted cell by TWICE the margin that
      // would take it under the floor leaves the count where it was: the cell it was
      // suppressing becomes the local maximum and is counted in its place.
      const dropMargin = residual[dropped] - MIN_RESIDUAL;
      expect(
        countWith(mod, w, h, oneCell(dropped, dropMargin * 2, -1)),
        `${w}x${h}: dropping one cell removed a count`
      ).toBe(count);
      // Each direction is searched the same way: double from 1e-9 until the count
      // moves, then halve inside that rung. The count is not monotone in delta, so
      // what this finds is the smallest magnitude on that ladder at which the count
      // differs — an upper bound on the worst case, never a claim to be it.
      const lift = ladder((delta) => countWith(mod, w, h, oneCell(lifted, delta, 1)), count);
      const drop = ladder(
        (delta) => countWith(mod, w, h, block(dropped, delta, -1, SUPPRESSION_RADIUS)),
        count
      );
      expect(lift, `${w}x${h}: lifting one cell never moved the count`).not.toBeNull();
      expect(drop, `${w}x${h}: dropping the block never moved the count`).not.toBeNull();
      // The bracket the certified radius promises: nothing moves below it.
      expect(lift!, `${w}x${h}: lift below certified`).toBeGreaterThan(certified);
      expect(drop!, `${w}x${h}: drop below certified`).toBeGreaterThan(certified);
      rows.push({ w, h, certified, lift: lift!, drop: drop! });
    }

    if (process.env.ARU_PRINT_BLEMISH_TOLERANCE) {
      process.stdout.write("\nper-cell a* perturbation tolerance, one synthetic face\n");
      process.stdout.write("frame        certified   lift one  drop 5x5\n");
      for (const row of rows) {
        process.stdout.write(
          `${`${row.w}x${row.h}`.padEnd(12)}${sig(row.certified).padStart(10)} ` +
          `${sig(row.lift).padStart(10)} ${sig(row.drop).padStart(10)}\n`
        );
      }
      process.stdout.write(
        `PIN EXPECTED_TOLERANCE ${JSON.stringify(rows.map((row) => [row.certified, row.lift, row.drop]))}\n`
      );
    }

    // The committed measurement. These are the numbers the lookup-table question is
    // decided against, so they are pinned rather than printed and forgotten.
    const expected = EXPECTED_TOLERANCE;
    expect(rows.length).toBe(expected.length);
    rows.forEach((row, i) => {
      const [certified, lift, drop] = expected[i];
      // The radius is closed-form arithmetic over the grid, so it is pinned exactly.
      // The other two are the output of a 60-step bisection, which promises a relative
      // 1e-9 and is pinned to a relative 1e-6 rather than to its last bit.
      expect(row.certified, `${row.w}x${row.h} certified`).toBe(certified);
      expect(row.lift / lift, `${row.w}x${row.h} lift`).toBeCloseTo(1, 6);
      expect(row.drop / drop, `${row.w}x${row.h} drop`).toBeCloseTo(1, 6);
    });
  });

  it("measures the certified radius across the fixture family, not one frame of it", async () => {
    // One frame is an anecdote. The same face is rendered at three noise amplitudes
    // either side of the committed 9 and read at all four frame sizes, and the radius
    // is computed on each. The SMALLEST of the twelve is the number any approximation
    // of the transfer curve has to beat; the spread is why one number would mislead.
    const mod = await load("skin-perturbable", (source) => source);
    const rows: Array<{ noise: number; w: number; h: number; count: number; certified: number }> = [];
    for (const noise of NOISE_LEVELS) {
      for (const [w, h] of COMMITTED) {
        const grid = capture(mod, w, h, noise);
        const { residual } = residualsOf(grid);
        const counted = countedOf(grid, residual);
        let replicated = 0;
        for (let i = 0; i < counted.length; i += 1) replicated += counted[i];
        expect(replicated, `noise ${noise} ${w}x${h}: the replica disagrees with detectBlemishes`).toBe(grid.count);
        rows.push({ noise, w, h, count: grid.count, certified: certifiedRadius(grid, residual, counted) });
      }
    }

    if (process.env.ARU_PRINT_BLEMISH_TOLERANCE) {
      process.stdout.write("\ncertified radius over the fixture family (a* units)\n");
      process.stdout.write("noise  frame        count  certified\n");
      for (const row of rows) {
        process.stdout.write(
          `${String(row.noise).padStart(5)}  ${`${row.w}x${row.h}`.padEnd(12)}` +
          `${String(row.count).padStart(5)}  ${sig(row.certified).padStart(9)}\n`
        );
      }
      process.stdout.write(`smallest: ${sig(Math.min(...rows.map((row) => row.certified)))}\n`);
      // The pin above, at full precision, so regenerating it is a copy rather than a
      // retyping of a rounded table.
      process.stdout.write(
        `PIN EXPECTED_FAMILY ${JSON.stringify(rows.map((row) => [row.noise, row.w, row.count, row.certified]))}\n`
      );
    }

    const expected = EXPECTED_FAMILY;
    expect(rows.length).toBe(expected.length);
    rows.forEach((row, i) => {
      const [noise, w, count, certified] = expected[i];
      expect(row.noise).toBe(noise);
      expect(row.w).toBe(w);
      expect(row.count, `noise ${row.noise} ${row.w}x${row.h} count`).toBe(count);
      expect(row.certified, `noise ${row.noise} ${row.w}x${row.h} certified`).toBe(certified);
    });
  });

  it("prints the shapes that are measured but not pinned", { timeout: 300_000 }, async () => {
    if (!process.env.ARU_PRINT_BLEMISH_TOLERANCE) return;
    const mod = await load("skin-perturbable", (source) => source);
    process.stdout.write("\nsmallest delta at which each shape moves the count (null: never, to 64)\n");
    process.stdout.write("frame        checkerboard  random(1)  random(2)    uniform\n");
    for (const [w, h, count] of COMMITTED) {
      const shapes: Array<number | null> = [
        ladder((delta) => countWith(mod, w, h, checkerboard(delta)), count),
        ladder((delta) => countWith(mod, w, h, randomSign(delta, 20260919)), count),
        ladder((delta) => countWith(mod, w, h, randomSign(delta, 7717)), count),
        ladder((delta) => countWith(mod, w, h, uniform(delta)), count),
      ];
      process.stdout.write(
        `${`${w}x${h}`.padEnd(12)}${shapes.map((v) => (v === null ? "null" : sig(v)).padStart(11)).join(" ")}\n`
      );
    }
  });

  it("measures what a lookup table for the transfer curve would actually cost", async () => {
    // The question the tolerance exists to answer. Each build replaces srgbLinear with
    // a table over the 0-255 channel domain and nothing else, so the a* difference it
    // produces IS the approximation error on the inputs detectBlemishes feeds —
    // stride-window means times a gray-world gain, which are floats and not integers,
    // which is the whole reason a table is an approximation here.
    const shipped = await load("skin-perturbable", (source) => source);
    const rows: Array<{ label: string; w: number; h: number; worst: number; count: number }> = [];
    for (const [label, entries, interpolate] of LUTS) {
      const name = `skin-lut-${entries}-${interpolate ? "linear" : "nearest"}`;
      const mod = await load(name, (source) => withLut(source, entries, interpolate));
      for (const [w, h, count] of COMMITTED) {
        const exact = capture(shipped, w, h);
        const approx = capture(mod, w, h);
        expect(approx.valid, `${label} ${w}x${h}: a different set of cells`).toEqual(exact.valid);
        let worst = 0;
        for (let i = 0; i < exact.astar.length; i += 1) {
          if (!exact.valid[i]) continue;
          worst = Math.max(worst, Math.abs(exact.astar[i] - approx.astar[i]));
        }
        rows.push({ label, w, h, worst, count: approx.count });
        expect(worst, `${label} ${w}x${h}: the table returned the exact curve`).toBeGreaterThan(0);
        expect(exact.count, `${label} ${w}x${h}: the reference build is not the shipped one`).toBe(count);
      }
    }

    if (process.env.ARU_PRINT_BLEMISH_TOLERANCE) {
      process.stdout.write("\nlookup tables for srgbLinear: worst |delta a*| and the count it produces\n");
      process.stdout.write("table          frame        worst |da*|   count\n");
      for (const row of rows) {
        process.stdout.write(
          `${row.label.padEnd(14)}${`${row.w}x${row.h}`.padEnd(12)}${sig(row.worst).padStart(11)} ` +
          `${String(row.count).padStart(7)}\n`
        );
      }
      process.stdout.write(
        `PIN EXPECTED_LUT ${JSON.stringify(rows.map((row) => [row.label, row.w, row.worst, row.count]))}\n`
      );
    }

    // The verdict, as an assertion rather than as a sentence in a document: of the four
    // candidates, exactly one moves a published count, and it is the 256-entry table
    // read at its nearest entry — the one the backlog item named.
    const committed = new Map(COMMITTED.map(([w, h, count]) => [`${w}x${h}`, count]));
    const moved = rows.filter((row) => row.count !== committed.get(`${row.w}x${row.h}`));
    expect(moved.map((row) => `${row.label} ${row.w}x${row.h} -> ${row.count}`)).toEqual([
      "256 nearest 400x480 -> 7",
    ]);

    const expected = EXPECTED_LUT;
    expect(rows.length).toBe(expected.length);
    rows.forEach((row, i) => {
      const [label, w, worst, count] = expected[i];
      expect(row.label).toBe(label);
      expect(row.w).toBe(w);
      expect(row.worst, `${row.label} ${row.w}x${row.h} worst`).toBe(worst);
      expect(row.count, `${row.label} ${row.w}x${row.h} count`).toBe(count);
    });
  });
});


/**
 * The guard the tolerance work above could not produce, and the reason it could not.
 *
 * Cycle 22 tried to assert that a realistic frame's `blemishCount` survives a 1e-16
 * nudge of a*. It does, but SEVEN source-line breaks of lib/skin.ts were tried against
 * that assertion and none made it fail, because a uniform nudge cancels in
 * `astar[i] - background` — so it shipped as a printed measurement in
 * tests/blemish-tie-break.test.ts instead of as a case. An assertion nothing can break
 * is a green line that looks like coverage.
 *
 * The thing that is actually worth asserting is one level down: not "a small error does
 * not move the count" but "the count does not rest on an exact float equality in the
 * first place". That is measurable directly — `marginsOf` above measures it — and it
 * separates the two fixture families in this repository, which is what makes it a guard
 * rather than a second vacuous assertion:
 *
 * - on the realistic (noisy) frames, every counted cell wins its suppression window by
 *   a margin orders of magnitude above the detector's own rounding error;
 * - on the same face rendered with `noiseAmplitude = 0`, counted cells are tied with
 *   their neighbours EXACTLY, and the count is settled by `j < i` — by scan order, not
 *   by the image. That is the state tests/blemish-density-scale.test.ts's fixture is in,
 *   and it is why a 1e-16 nudge moves that file's counts while no lookup table is at
 *   fault.
 *
 * Both cases run the same predicate, so neither can pass by being weak. The threshold
 * is a ratio against a computed bound on the detector's own arithmetic, never a
 * hand-picked epsilon.
 *
 * Full tables: ARU_PRINT_BLEMISH_MARGIN=1 npx vitest run tests/blemish-perturbation-tolerance.test.ts
 */

/** How far above its own rounding error a margin has to sit to count as decided: four
 *  orders of magnitude. Chosen from the measurement rather than for how large it sounds.
 *  The tightest of the twelve realistic rows is noise 4 at 400x480, whose suppression
 *  margin is 4.185e-5 a* against a noise bound of 3.435e-11 — a ratio of 1.218e6. So
 *  1e6 would be "cleared" by 1.22x, which is a coin flip dressed as a guard, while 1e4
 *  is cleared by 122x there and by 3.2e4 at the loosest row. Either way the noiseless
 *  fixture fails it with a margin of exactly zero, which is the comparison that matters. */
const MARGIN_RATIO = 1e4;

/** The one predicate both cases below run. A count is DECIDED when no counted cell is
 *  exactly tied with a neighbour and both margins clear the noise floor; otherwise it is
 *  merely SETTLED, by whatever the tie-break happens to be. */
function decided(m: Margins): boolean {
  const floor = MARGIN_RATIO * m.noiseScale;
  return m.tiedPeaks === 0 && m.peakGap > floor && m.floorGap > floor;
}

/** Per noise amplitude and frame size: counted cells, tied peaks, peak gap, floor gap.
 *  Regenerate with ARU_PRINT_BLEMISH_MARGIN=1 and copy the PIN lines it prints. */
const EXPECTED_MARGINS: Array<[number, number, number, number, number, number]> = [
  [4, 400, 5, 0, 0.000041849469386789906, 3.460827870790577],
  [4, 720, 5, 0, 0.0003395853425693929, 7.276109382418614],
  [4, 1080, 5, 0, 0.001307281572222152, 7.320772058134777],
  [4, 1440, 5, 0, 0.00016540516577912, 7.049801037391136],
  [9, 400, 6, 0, 0.0007143695914120229, 3.517519811652717],
  [9, 720, 5, 0, 0.001835022017402821, 7.294225448874842],
  [9, 1080, 5, 0, 0.00932699880916843, 7.330567715043038],
  [9, 1440, 5, 0, 0.0010501163247713663, 7.047981540269735],
  [14, 400, 7, 0, 0.0005928388602498558, 3.5560116374332176],
  [14, 720, 5, 0, 0.00814714894259616, 7.332984857467885],
  [14, 1080, 5, 0, 0.01205125694099074, 7.352717149572985],
  [14, 1440, 5, 0, 0.003769017102747796, 7.034719852509035],
];
const EXPECTED_FLAT_MARGINS: Array<[number, number, number, number, number]> = [
  [400, 5, 1, 0, 3.4306109505675786],
  [720, 5, 1, 0, 7.249357545068296],
  [1080, 5, 3, 0, 7.303853934022106],
  [1440, 5, 3, 0, 7.0571639873858985],
];

describe("the margin the blemish count is decided by", () => {
  it("measures a real margin on every realistic frame, and says how real", async () => {
    const mod = await load("skin-perturbable", (source) => source);
    const rows: Array<{ noise: number; w: number; h: number; m: Margins }> = [];
    for (const noise of NOISE_LEVELS) {
      for (const [w, h] of COMMITTED) {
        const grid = capture(mod, w, h, noise);
        const { residual } = residualsOf(grid);
        const counted = countedOf(grid, residual);
        let replicated = 0;
        for (let i = 0; i < counted.length; i += 1) replicated += counted[i];
        // The margins are computed from the replica, so the replica has to be the
        // detector or they are margins of something else.
        expect(replicated, `noise ${noise} ${w}x${h}: the replica disagrees with detectBlemishes`).toBe(grid.count);
        rows.push({ noise, w, h, m: marginsOf(grid, residual, counted) });
      }
    }

    if (process.env.ARU_PRINT_BLEMISH_MARGIN) {
      process.stdout.write("\ndecision margin on the realistic fixture family (a* units)\n");
      process.stdout.write("noise  frame        counted  tied    peak gap   floor gap   noise scale   peak/noise\n");
      for (const { noise, w, h, m } of rows) {
        process.stdout.write(
          `${String(noise).padStart(5)}  ${`${w}x${h}`.padEnd(12)}${String(m.counted).padStart(7)}` +
          `${String(m.tiedPeaks).padStart(6)}  ${sig(m.peakGap).padStart(10)}  ${sig(m.floorGap).padStart(10)}` +
          `  ${sig(m.noiseScale).padStart(11)}  ${sig(m.peakGap / m.noiseScale).padStart(10)}\n`
        );
      }
      process.stdout.write(
        `PIN EXPECTED_MARGINS ${JSON.stringify(rows.map(({ noise, w, m }) => [noise, w, m.counted, m.tiedPeaks, m.peakGap, m.floorGap]))}\n`
      );
    }

    // The guard. Every realistic frame is decided by the image.
    for (const { noise, w, h, m } of rows) {
      expect(m.counted, `noise ${noise} ${w}x${h}: nothing was counted, so nothing is guarded`).toBeGreaterThan(0);
      expect(
        m.tiedPeaks,
        `noise ${noise} ${w}x${h}: ${m.tiedPeaks} of ${m.counted} counts are settled by scan order, not by the image`
      ).toBe(0);
      expect(
        m.peakGap / m.noiseScale,
        `noise ${noise} ${w}x${h}: the smallest suppression margin is ${sig(m.peakGap)} a*, only ${sig(m.peakGap / m.noiseScale)}x the detector's own rounding error`
      ).toBeGreaterThan(MARGIN_RATIO);
      expect(
        m.floorGap / m.noiseScale,
        `noise ${noise} ${w}x${h}: the smallest floor margin is ${sig(m.floorGap)} a*, only ${sig(m.floorGap / m.noiseScale)}x the detector's own rounding error`
      ).toBeGreaterThan(MARGIN_RATIO);
      expect(decided(m), `noise ${noise} ${w}x${h}: the count is not decided by the image`).toBe(true);
    }

    const expected = EXPECTED_MARGINS;
    expect(rows.length).toBe(expected.length);
    rows.forEach((row, i) => {
      const [noise, w, counted, tied, peakGap, floorGap] = expected[i];
      expect(row.noise).toBe(noise);
      expect(row.w).toBe(w);
      expect(row.m.counted, `noise ${row.noise} ${row.w} counted`).toBe(counted);
      expect(row.m.tiedPeaks, `noise ${row.noise} ${row.w} tied`).toBe(tied);
      expect(row.m.peakGap, `noise ${row.noise} ${row.w} peak gap`).toBe(peakGap);
      expect(row.m.floorGap, `noise ${row.noise} ${row.w} floor gap`).toBe(floorGap);
    });
  });

  it("fails the same predicate on the noiseless fixture, which is what makes it a guard", async () => {
    // The non-vacuity case. The predicate above passes on twelve realistic frames; here
    // is the same face with the noise turned off, and it fails — at every frame size,
    // on the tie census, with a suppression margin of EXACTLY zero. If a change ever
    // makes this case pass, the predicate has stopped discriminating and the case above
    // is worth nothing.
    const mod = await load("skin-perturbable", (source) => source);
    const rows: Array<{ w: number; h: number; m: Margins }> = [];
    for (const [w, h] of COMMITTED) {
      const grid = capture(mod, w, h, 0);
      const { residual } = residualsOf(grid);
      const counted = countedOf(grid, residual);
      let replicated = 0;
      for (let i = 0; i < counted.length; i += 1) replicated += counted[i];
      expect(replicated, `flat ${w}x${h}: the replica disagrees with detectBlemishes`).toBe(grid.count);
      rows.push({ w, h, m: marginsOf(grid, residual, counted) });
    }

    if (process.env.ARU_PRINT_BLEMISH_MARGIN) {
      process.stdout.write("\ndecision margin with noiseAmplitude 0 (a* units)\n");
      process.stdout.write("frame        counted  tied    peak gap   floor gap  decided\n");
      for (const { w, h, m } of rows) {
        process.stdout.write(
          `${`${w}x${h}`.padEnd(12)}${String(m.counted).padStart(7)}${String(m.tiedPeaks).padStart(6)}` +
          `  ${sig(m.peakGap).padStart(10)}  ${sig(m.floorGap).padStart(10)}  ${String(decided(m)).padStart(7)}\n`
        );
      }
      process.stdout.write(
        `PIN EXPECTED_FLAT_MARGINS ${JSON.stringify(rows.map(({ w, m }) => [w, m.counted, m.tiedPeaks, m.peakGap, m.floorGap]))}\n`
      );
    }

    for (const { w, h, m } of rows) {
      expect(m.counted, `flat ${w}x${h}: nothing was counted`).toBeGreaterThan(0);
      // The finding, as an assertion: on a noiseless face the count is settled by the
      // `j < i` tie-break rather than decided by the image.
      expect(m.peakGap, `flat ${w}x${h}: the noiseless fixture has a suppression margin`).toBe(0);
      expect(m.tiedPeaks, `flat ${w}x${h}: no counted cell is tied with a neighbour`).toBeGreaterThan(0);
      expect(decided(m), `flat ${w}x${h}: the predicate accepted a scan-order count`).toBe(false);
    }

    const expected = EXPECTED_FLAT_MARGINS;
    expect(rows.length).toBe(expected.length);
    rows.forEach((row, i) => {
      const [w, counted, tied, peakGap, floorGap] = expected[i];
      expect(row.w).toBe(w);
      expect(row.m.counted, `flat ${row.w} counted`).toBe(counted);
      expect(row.m.tiedPeaks, `flat ${row.w} tied`).toBe(tied);
      expect(row.m.peakGap, `flat ${row.w} peak gap`).toBe(peakGap);
      expect(row.m.floorGap, `flat ${row.w} floor gap`).toBe(floorGap);
    });
  });
});

describe("the residual the detector actually classifies", () => {
  /**
   * The blind spot named in §7.4, closed rather than restated.
   *
   * Every margin above is computed from `residualsOf`, which rebuilds the residual out
   * of the captured a* grid. That makes the margins a property of the a*-production
   * path and of this file's own arithmetic — not of the field `detectBlemishes` hands
   * to its classification loop. The gap is not hypothetical: quantising `residual[i]`
   * to 3 decimals inside `lib/skin.ts` changes which cells survive and leaves both
   * margin cases green.
   *
   * So this case reads the detector's own residual through `__observeResidual` and
   * holds it against the replica at every cell, then re-measures the pinned margins on
   * it. Three separate things have to hold, and they fail for different reasons:
   *
   * 1. The two residual fields agree EXACTLY at every valid cell. This is what a change
   *    downstream of a* breaks, and nothing else in this file can see it.
   * 2. Classifying the detector's own residual reproduces the count `detectBlemishes`
   *    returned. Guards the classification replica itself.
   * 3. The margins measured on the detector's own residual are the pinned margins. An
   *    independent surface: editing `residualsOf` to match a moved `lib/skin.ts` would
   *    satisfy (1) and still fail here.
   */
  it("is the field the margins are measured on, cell for cell, at every frame and noise level", async () => {
    const mod = await load("skin-perturbable", (source) => source);
    const rows: Array<{
      label: string;
      noise: number;
      w: number;
      diffCells: number;
      validCells: number;
      worst: number;
      m: Margins;
    }> = [];

    for (const noise of [...NOISE_LEVELS, 0]) {
      for (const [w, h] of COMMITTED) {
        const { grid, residual: observed } = captureWithResidual(mod, w, h, noise);
        const { residual: replica } = residualsOf(grid);
        expect(observed.length, `noise ${noise} ${w}x${h}: the residual field changed length`).toBe(replica.length);

        let diffCells = 0;
        let validCells = 0;
        let worst = 0;
        for (let i = 0; i < observed.length; i += 1) {
          if (!grid.valid[i]) continue;
          validCells += 1;
          if (observed[i] !== replica[i]) {
            diffCells += 1;
            worst = Math.max(worst, Math.abs(observed[i] - replica[i]));
          }
        }

        const counted = countedOf(grid, observed);
        let replicated = 0;
        for (let i = 0; i < counted.length; i += 1) replicated += counted[i];

        rows.push({
          label: `noise ${noise} ${w}x${h}`,
          noise,
          w,
          diffCells,
          validCells,
          worst,
          m: marginsOf(grid, observed, counted),
        });

        // (1) The blind spot itself. Asserted before anything else, so a residual that
        // has moved downstream of a* says so rather than surfacing as a moved margin.
        expect(
          diffCells,
          `${`noise ${noise} ${w}x${h}`}: the detector's own residual differs from this file's replica at ` +
            `${diffCells} of ${validCells} valid cells (worst |d| = ${sig(worst)}). Every decision margin in ` +
            `this file is measured on the replica, so a change downstream of a* moves what the detector ` +
            `classifies without moving a single number above it`
        ).toBe(0);

        // (2) The classification replica, checked against the shipped count on the
        // detector's own residual rather than on the reconstructed one.
        expect(
          replicated,
          `noise ${noise} ${w}x${h}: classifying the detector's own residual gives ${replicated}, but detectBlemishes returned ${grid.count}`
        ).toBe(grid.count);
      }
    }

    if (process.env.ARU_PRINT_BLEMISH_MARGIN) {
      process.stdout.write("\nmargins measured on the detector's own residual (a* units)\n");
      process.stdout.write("noise  frame   valid  diff   counted  tied    peak gap   floor gap\n");
      for (const row of rows) {
        process.stdout.write(
          `${String(row.noise).padStart(5)}  ${String(row.w).padEnd(6)}${String(row.validCells).padStart(6)}` +
            `${String(row.diffCells).padStart(6)}${String(row.m.counted).padStart(10)}${String(row.m.tiedPeaks).padStart(6)}` +
            `  ${sig(row.m.peakGap).padStart(10)}  ${sig(row.m.floorGap).padStart(10)}\n`
        );
      }
    }

    // (3) The pinned margins, re-measured on the detector's own field. EXPECTED_MARGINS
    // covers the three realistic noise levels and EXPECTED_FLAT_MARGINS the noiseless
    // fixture, which is the same split the two cases above use.
    const noisy = rows.filter((row) => row.noise !== 0);
    expect(noisy.length, "the realistic rows and the pinned table are different lengths").toBe(EXPECTED_MARGINS.length);
    noisy.forEach((row, i) => {
      const [noise, w, counted, tied, peakGap, floorGap] = EXPECTED_MARGINS[i];
      expect(row.noise, `row ${i}: noise`).toBe(noise);
      expect(row.w, `row ${i}: frame`).toBe(w);
      expect(row.m.counted, `${row.label} counted, on the detector's own residual`).toBe(counted);
      expect(row.m.tiedPeaks, `${row.label} tied, on the detector's own residual`).toBe(tied);
      expect(row.m.peakGap, `${row.label} peak gap, on the detector's own residual`).toBe(peakGap);
      expect(row.m.floorGap, `${row.label} floor gap, on the detector's own residual`).toBe(floorGap);
    });

    const flat = rows.filter((row) => row.noise === 0);
    expect(flat.length, "the noiseless rows and the pinned table are different lengths").toBe(EXPECTED_FLAT_MARGINS.length);
    flat.forEach((row, i) => {
      const [w, counted, tied, peakGap, floorGap] = EXPECTED_FLAT_MARGINS[i];
      expect(row.w, `flat row ${i}: frame`).toBe(w);
      expect(row.m.counted, `${row.label} counted, on the detector's own residual`).toBe(counted);
      expect(row.m.tiedPeaks, `${row.label} tied, on the detector's own residual`).toBe(tied);
      expect(row.m.peakGap, `${row.label} peak gap, on the detector's own residual`).toBe(peakGap);
      expect(row.m.floorGap, `${row.label} floor gap, on the detector's own residual`).toBe(floorGap);
    });
  });
});

// ---------------------------------------------------------------------------
// The summed-area table's own error, against the bound every margin is divided by.
// ---------------------------------------------------------------------------

/** Exact accumulation in a non-overlapping expansion (Shewchuk's TwoSum), summed
 *  smallest-first at the end so the result carries exactly one rounding. Used as the
 *  reference the two summed-area-table constructions are measured against — this is an
 *  exact sum rounded once, not merely a compensated one. */
function exactSum(values: number[]): number {
  const partials: number[] = [];
  for (const value of values) {
    let x = value;
    let i = 0;
    for (const p of partials) {
      let a = x;
      let b = p;
      if (Math.abs(a) < Math.abs(b)) {
        const t = a;
        a = b;
        b = t;
      }
      const hi = a + b;
      const lo = b - (hi - a);
      if (lo !== 0) partials[i++] = lo;
      x = hi;
    }
    partials.length = i;
    partials.push(x);
  }
  let total = 0;
  for (let i = partials.length - 1; i >= 0; i -= 1) total += partials[i];
  return total;
}

/** The reference construction, from scikit-image's `integral_image`: a separable
 *  cumulative sum along each axis, with float inputs promoted to at least float64. No
 *  subtraction enters the build, unlike the inclusion-exclusion recurrence lib/skin.ts
 *  uses. The 4-corner query is the same either way. */
function cumsumSat(grid: Grid): Float64Array {
  const { astar, valid, gw, gh } = grid;
  const sw = gw + 1;
  const table = new Float64Array(sw * (gh + 1));
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const i = gy * gw + gx;
      table[(gy + 1) * sw + (gx + 1)] = valid[i] ? astar[i] : 0;
    }
  }
  for (let gy = 1; gy <= gh; gy += 1) {
    for (let gx = 2; gx <= gw; gx += 1) table[gy * sw + gx] += table[gy * sw + gx - 1];
  }
  for (let gx = 1; gx <= gw; gx += 1) {
    for (let gy = 2; gy <= gh; gy += 1) table[gy * sw + gx] += table[(gy - 1) * sw + gx];
  }
  return table;
}

/** lib/skin.ts's own construction: one pass of the inclusion-exclusion recurrence. */
function inclusionExclusionSat(grid: Grid): Float64Array {
  const { astar, valid, gw, gh } = grid;
  const sw = gw + 1;
  const table = new Float64Array(sw * (gh + 1));
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const i = gy * gw + gx;
      const s0 = (gy + 1) * sw + (gx + 1);
      table[s0] = (valid[i] ? astar[i] : 0) + table[s0 - 1] + table[s0 - sw] - table[s0 - sw - 1];
    }
  }
  return table;
}

function windowFrom(table: Float64Array, gw: number, gh: number, gx: number, gy: number, radius: number): number {
  const sw = gw + 1;
  const lx = Math.max(0, gx - radius);
  const ly = Math.max(0, gy - radius);
  const hx = Math.min(gw - 1, gx + radius);
  const hy = Math.min(gh - 1, gy + radius);
  return (
    table[(hy + 1) * sw + (hx + 1)] - table[ly * sw + (hx + 1)] - table[(hy + 1) * sw + lx] + table[ly * sw + lx]
  );
}

describe("the summed-area table the local background is read from", () => {
  /**
   * Why this is measured at all.
   *
   * Every margin in this file is reported as a multiple of `noiseScale`, and the guard
   * `peakGap / noiseScale > 1e4` is the assertion that a count is decided by the image
   * rather than by arithmetic. `noiseScale` is `gw*gh * EPSILON * max|a*|` — a bound
   * asserted in a comment and verified by nobody. If it is not actually an upper bound
   * on the error the summed-area table puts into one background, the ratio is a
   * multiple of the wrong number and the guard above it means less than it says.
   *
   * The comparison is with a reference construction rather than in the abstract.
   * scikit-image's `integral_image`, read from its own source on 2026-09-21, builds the
   * table as a separable `cumsum` along each axis and promotes float inputs to at least
   * float64 "for better accuracy and to avoid potential overflow". lib/skin.ts uses the
   * one-pass inclusion-exclusion recurrence instead, which SUBTRACTS a partial sum at
   * every cell — the cancellation a cumsum never performs — so the two constructions
   * are not obviously equally accurate and ARU's is the one with a reason to be worse.
   *
   * Both are measured against `exactSum` over the window itself: an exact accumulation
   * rounded once, so the errors below are the constructions' and not the reference's.
   * The count side of `windowMean` is left out on purpose — `countTable` accumulates
   * 0/1 into partial sums bounded by gw*gh, every one of them an exactly representable
   * integer in float64, so the divisor carries no error to measure.
   */
  it("keeps its error under the noise bound every margin above is divided by", async () => {
    const mod = await load("skin-perturbable", (source) => source);
    const rows: Array<{
      label: string;
      cells: number;
      aruWorst: number;
      cumsumWorst: number;
      noiseScale: number;
      peakGap: number;
    }> = [];

    for (const noise of [...NOISE_LEVELS, 0]) {
      for (const [w, h] of COMMITTED) {
        const grid = capture(mod, w, h, noise);
        const { astar, valid, gw, gh } = grid;
        const aru = inclusionExclusionSat(grid);
        const reference = cumsumSat(grid);

        let maxAbs = 0;
        for (let i = 0; i < astar.length; i += 1) if (valid[i]) maxAbs = Math.max(maxAbs, Math.abs(astar[i]));
        const noiseScale = gw * gh * Number.EPSILON * maxAbs;

        let aruWorst = 0;
        let cumsumWorst = 0;
        let cells = 0;
        for (let gy = 0; gy < gh; gy += 1) {
          for (let gx = 0; gx < gw; gx += 1) {
            if (!valid[gy * gw + gx]) continue;
            const lx = Math.max(0, gx - BACKGROUND_RADIUS);
            const ly = Math.max(0, gy - BACKGROUND_RADIUS);
            const hx = Math.min(gw - 1, gx + BACKGROUND_RADIUS);
            const hy = Math.min(gh - 1, gy + BACKGROUND_RADIUS);
            const values: number[] = [];
            for (let ny = ly; ny <= hy; ny += 1) {
              for (let nx = lx; nx <= hx; nx += 1) {
                const j = ny * gw + nx;
                if (valid[j]) values.push(astar[j]);
              }
            }
            if (values.length < 8) continue;
            cells += 1;
            const exact = exactSum(values) / values.length;
            aruWorst = Math.max(aruWorst, Math.abs(windowFrom(aru, gw, gh, gx, gy, BACKGROUND_RADIUS) / values.length - exact));
            cumsumWorst = Math.max(
              cumsumWorst,
              Math.abs(windowFrom(reference, gw, gh, gx, gy, BACKGROUND_RADIUS) / values.length - exact)
            );
          }
        }

        const counted = countedOf(grid, residualsOf(grid).residual);
        rows.push({
          label: `noise ${noise} ${w}x${h}`,
          cells,
          aruWorst,
          cumsumWorst,
          noiseScale,
          peakGap: marginsOf(grid, residualsOf(grid).residual, counted).peakGap,
        });
      }
    }

    if (process.env.ARU_PRINT_BLEMISH_MARGIN) {
      process.stdout.write("\nsummed-area table error against an exact window sum (a* units)\n");
      process.stdout.write("frame               cells   aru (incl-excl)   skimage (cumsum)    noise bound   aru/bound   peak gap/aru\n");
      for (const row of rows) {
        process.stdout.write(
          `${row.label.padEnd(20)}${String(row.cells).padStart(6)}  ${sig(row.aruWorst).padStart(15)}  ` +
            `${sig(row.cumsumWorst).padStart(16)}  ${sig(row.noiseScale).padStart(13)}  ` +
            `${sig(row.aruWorst / row.noiseScale).padStart(9)}  ${sig(row.peakGap / (row.aruWorst || Number.MIN_VALUE)).padStart(13)}\n`
        );
      }
    }

    for (const row of rows) {
      expect(row.cells, `${row.label}: no window had 8 valid cells, so nothing was measured`).toBeGreaterThan(0);
      // The claim the margin guard rests on: gw*gh * EPSILON * max|a*| bounds the error
      // the table actually puts into one background.
      expect(
        row.aruWorst,
        `${row.label}: the inclusion-exclusion table's worst background error is ${sig(row.aruWorst)} a*, ` +
          `ABOVE the bound ${sig(row.noiseScale)} that every margin in this file is reported as a multiple of`
      ).toBeLessThan(row.noiseScale);
      // And the reference construction is measured beside it rather than assumed better,
      // so a future cycle deciding whether to switch has the number and not a hunch.
      expect(
        row.cumsumWorst,
        `${row.label}: the cumsum reference's worst background error is ${sig(row.cumsumWorst)} a*, above the same bound`
      ).toBeLessThan(row.noiseScale);
    }

    // On every frame with a real margin, the table's error is orders of magnitude below
    // the gap it would have to close to change a count. The noiseless fixture's peak gap
    // is exactly zero, so it is excluded here rather than asserted against - that zero is
    // the finding of the case above, not a property of the table.
    for (const row of rows.filter((r) => r.peakGap > 0)) {
      expect(
        row.peakGap / row.aruWorst,
        `${row.label}: the table's error ${sig(row.aruWorst)} is within 1e4 of the smallest peak gap ${sig(row.peakGap)}`
      ).toBeGreaterThan(1e4);
    }
  });
});
