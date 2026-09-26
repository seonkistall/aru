import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { frameChannelGains, type LM } from "@/lib/skin";

/**
 * Which of the five `BLEMISH` constants does the published `blemishCount` actually
 * depend on, and how steeply?
 *
 * Backlog > Now: "Validate the blemish-detection constants (`BLEMISH` in `lib/skin.ts`)
 * against real photos through `/eval`, and replace them with calibrated values. They
 * were chosen on a synthetic face." Calibrating them needs photos this loop does not
 * have. What does NOT need photos is the question of where that calibration budget has
 * to go: a constant the count does not move for is not worth a labelling session, and
 * one it moves for steeply is where a wrong value costs the most.
 *
 * This file measures exactly that and nothing else. It builds a copy of `lib/skin.ts`
 * per variant with ONE constant rewritten, runs the shipped `detectBlemishes` on the
 * synthetic face two of the other suites already use, and records the count. It changes
 * no shipped value: `tests/scan-cost-benchmark.test.ts` and
 * `tests/blemish-density-scale.test.ts` still pin what the build reports.
 *
 * It is a sensitivity measurement on one synthetic fixture, not a calibration. It says
 * which knobs matter here; it does not say what any of them should be.
 */

const DIR = "tests/.blemish-const-tmp";
const BLEMISH_ANCHOR = "const BLEMISH = {\n";

afterAll(() => rmSync(DIR, { recursive: true, force: true }));

/** Read a constant out of the source rather than copying it, the same rule
 *  `tests/blemish-perturbation-tolerance.test.ts` states: a copy would go on measuring
 *  against a value the detector no longer uses. */
function shippedValue(source: string, name: string): number {
  const matches = source.match(new RegExp(`\\n  ${name}: [0-9.]+,`, "g"));
  if (!matches || matches.length !== 1) {
    throw new Error(`lib/skin.ts declares BLEMISH.${name} ${matches?.length ?? 0} times; the sweep measures nothing`);
  }
  return Number(/([0-9.]+)/.exec(matches[0])![1]);
}

type Detector = { detectBlemishes: (
  data: Uint8ClampedArray, w: number, h: number, landmarks: LM[], gains: { r: number; g: number; b: number }
) => { count: number; areaFace: number; tiedPeaks: number } };

const LOADED = new Map<string, Promise<Detector>>();
function variant(name: string, constant: string | null, value: number | null): Promise<Detector> {
  const existing = LOADED.get(name);
  if (existing) return existing;
  let source = readFileSync("lib/skin.ts", "utf8");
  if (!source.includes(BLEMISH_ANCHOR)) throw new Error("lib/skin.ts no longer declares BLEMISH; the sweep measures nothing");
  if (constant !== null) {
    shippedValue(source, constant); // throws unless the declaration is there exactly once
    source = source.replace(new RegExp(`\\n  ${constant}: [0-9.]+,`), `\n  ${constant}: ${value},`);
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/${name}.ts`, source.replace('from "./i18n/core"', 'from "../../lib/i18n/core"'));
  // Variable specifier behind @vite-ignore for the reason the two other scratch-build
  // suites give: a literal would make `npx tsc --noEmit` resolve a module that only
  // exists while this file runs.
  const path = `./.blemish-const-tmp/${name}.ts`;
  const loaded = import(/* @vite-ignore */ path) as Promise<Detector>;
  LOADED.set(name, loaded);
  return loaded;
}

// --- the fixture, duplicated as every other fixture in tests/ is -----------------

function syntheticFace(w: number, h: number, noiseAmplitude = 9): Uint8ClampedArray {
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
  return data;
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

const FIXTURES = new Map<string, { data: Uint8ClampedArray; lms: LM[]; gains: { r: number; g: number; b: number } }>();
function fixture(w: number, h: number) {
  const key = `${w}x${h}`;
  const cached = FIXTURES.get(key);
  if (cached) return cached;
  const data = syntheticFace(w, h);
  const lms = faceLandmarks();
  const built = { data, lms, gains: frameChannelGains(data, w, h) };
  FIXTURES.set(key, built);
  return built;
}

async function countAt(name: string, constant: string | null, value: number | null, w: number, h: number) {
  const mod = await variant(name, constant, value);
  const { data, lms, gains } = fixture(w, h);
  return mod.detectBlemishes(data, w, h, lms, gains).count;
}

// --- the sweep --------------------------------------------------------------------

const SIZES: [number, number][] = [[400, 480], [720, 960]];
const SOURCE = readFileSync("lib/skin.ts", "utf8");

/** One step either side of the shipped value, per constant. The steps are the smallest
 *  meaningful move for each: ±1 cell for the three integer radii/strides, ±0.2 a* units
 *  for the residual floor (an eighth of it), ±0.01 face-width for the exclusion. */
const SWEEP: Array<[string, number[]]> = [
  ["gridAcrossFace", [80, 100]],
  ["backgroundRadius", [4, 6]],
  ["suppressionRadius", [1, 3]],
  ["minResidual", [1.4, 1.8]],
  ["excludeFraction", [0.045, 0.065]],
];

describe("BLEMISH constant sensitivity on the synthetic face", () => {
  it("the shipped build reads what the other suites pin, so the harness is not measuring itself", async () => {
    // The two rows `tests/scan-cost-benchmark.test.ts` and
    // `tests/blemish-perturbation-tolerance.test.ts` both carry for these sizes.
    expect(await countAt("shipped", null, null, 400, 480)).toBe(6);
    expect(await countAt("shipped", null, null, 720, 960)).toBe(5);
  });

  it("the five constants are each declared exactly once, with the values this sweep moved from", async () => {
    const shipped = Object.fromEntries(SWEEP.map(([name]) => [name, shippedValue(SOURCE, name)]));
    expect(shipped).toEqual({
      gridAcrossFace: 90,
      backgroundRadius: 5,
      suppressionRadius: 2,
      minResidual: 1.6,
      excludeFraction: 0.055,
    });
  });

  it("two of the five do not move the count at all here, so this fixture cannot calibrate them", () => {
    // ±0.2 a* on the residual floor and ±0.01 face-width on the exclusion leave both
    // sizes at the shipped 6 and 5. The reason is the fixture: its five blemishes are
    // +26 r over their background, nowhere near the 1.6 a* floor, so no candidate is
    // marginal and no move of the floor changes who clears it. That is the item's own
    // point stated as a measurement — a synthetic face with no borderline blemish on it
    // cannot settle a threshold whose whole job is to judge borderline ones.
    for (const constant of ["minResidual", "excludeFraction"]) {
      for (const value of SWEEP.find(([name]) => name === constant)![1]) {
        expect(COUNTS[`${constant}=${value}@400x480`], `${constant}=${value} moved 400x480`).toBe(6);
        expect(COUNTS[`${constant}=${value}@720x960`], `${constant}=${value} moved 720x960`).toBe(5);
      }
    }
  });

  it("suppressionRadius is the steepest of the three that do move it", () => {
    // One cell less costs +3 of 6 at 400x480 and +2 of 5 at 720x960; one cell more
    // costs -1 and 0. The other two movers are worth one count each in one direction.
    const span = (constant: string) => {
      const values = SWEEP.find(([name]) => name === constant)![1];
      const counts = values.flatMap((value) => [COUNTS[`${constant}=${value}@400x480`], COUNTS[`${constant}=${value}@720x960`]]);
      return Math.max(...counts) - Math.min(...counts);
    };
    expect(span("suppressionRadius")).toBe(4);
    expect(span("gridAcrossFace")).toBe(1);
    expect(span("backgroundRadius")).toBe(2);
    expect(span("minResidual")).toBe(1);
    expect(span("excludeFraction")).toBe(1);
    // The two non-movers' span of 1 is the 6-vs-5 gap BETWEEN the two frame sizes, not
    // a response to the constant: at each size on its own they are flat.
    expect(span("suppressionRadius")).toBeGreaterThan(span("backgroundRadius"));
  });

  for (const [constant, values] of SWEEP) {
    for (const value of values) {
      for (const [w, h] of SIZES) {
        it(`${constant} = ${value} at ${w}x${h}`, async () => {
          const count = await countAt(`${constant}-${String(value).replace(".", "_")}`, constant, value, w, h);
          expect(COUNTS[`${constant}=${value}@${w}x${h}`], `${constant}=${value}@${w}x${h} read ${count}`).toBe(count);
        });
      }
    }
  }
});

/** The measured table. Every entry is the literal output of this file's own run; the
 *  assertion above compares against it so a change to the detector, or to a shipped
 *  constant, fails by name here instead of moving a published index unnoticed. */
const COUNTS: Record<string, number> = {
  "gridAcrossFace=80@400x480": 5,
  "gridAcrossFace=80@720x960": 6,
  "gridAcrossFace=100@400x480": 6,
  "gridAcrossFace=100@720x960": 5,
  "backgroundRadius=4@400x480": 7,
  "backgroundRadius=4@720x960": 5,
  "backgroundRadius=6@400x480": 6,
  "backgroundRadius=6@720x960": 5,
  "suppressionRadius=1@400x480": 9,
  "suppressionRadius=1@720x960": 7,
  "suppressionRadius=3@400x480": 5,
  "suppressionRadius=3@720x960": 5,
  "minResidual=1.4@400x480": 6,
  "minResidual=1.4@720x960": 5,
  "minResidual=1.8@400x480": 6,
  "minResidual=1.8@720x960": 5,
  "excludeFraction=0.045@400x480": 6,
  "excludeFraction=0.045@720x960": 5,
  "excludeFraction=0.065@400x480": 6,
  "excludeFraction=0.065@720x960": 5,
};
