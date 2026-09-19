import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSkin, labAStar, relativeSpread, rgbToLab, roughnessRatio, shineIndex, SAMPLING_LANDMARKS, SHINE_REFERENCE_CHEEK_L } from "@/lib/skin";

/**
 * Every within-image index has two implementations in two languages. From 2026-09-14,
 * when `ml/skin_indices.py` was added, to 2026-09-19, the oil axis's two were DIFFERENT
 * formulas under one name — and every test stayed green, because
 * `tests/skin-index-contract.test.ts` pins the index registry's NAMES (which feature
 * key each id maps to, which columns carry it) and nothing anywhere compared the two
 * formulas' VALUES. It was found by a cycle reading both files side by side.
 *
 * This file is that comparison, for the indices it covers. Python and TypeScript cannot
 * call each other in this repository's test setup (vitest in node, unittest in python3,
 * no bridge and no network), so the cheapest honest cross-language check is a committed
 * table — inputs with one expected output each — that both languages assert against.
 * Neither side can move without failing its own language's test.
 *
 * Four of the seven registry indices are covered, to different depths and — since
 * cycle 18 — under two different KINDS of comparison, and that is said here rather
 * than implied:
 *
 * - `shine_ratio` / `shine`: formula AND path. Of its 22 rows, 16 are `face` rows —
 *   real readings of real frames through `analyzeSkin`, carrying the recipe that
 *   produced them, so a case below rebuilds each frame and checks the whole way in.
 *   Without that, moving which patch `tzoneSpecular` is measured over would leave every
 *   row green. The 6 `edge` rows are branches a face family cannot reach: a zero
 *   denominator, a T-zone darker than the cheek, a capture with no specular pixel.
 * - `tone_evenness` / `toneSpread`: formula ONLY. Its inputs are the four region L*
 *   values, which `SkinRawFeatures` does not export — only the result. An end-to-end
 *   half would need a new exported field, and a field should be added because the
 *   product needs one, not because a test would like one. So these rows pin that the
 *   two implementations agree on the same inputs and do not pin what reaches them;
 *   `tests/skin-index-contract.test.ts` pins the value the path produces.
 * - `blemish_count` / `blemishDensity`: formula only, added cycle 17. Its two inputs —
 *   `validCells * stride^2` and the face-box width — are not exported fields either.
 *   Checked and it AGREES exactly, so it is pinned rather than fixed; two of its rows
 *   are the pair one face gave at two capture resolutions, so the invariance the third
 *   argument exists for is checked and not asserted.
 * - `roughness_ratio` / `roughnessRatio`: formula only, added cycle 18, and the only
 *   group whose two columns are NOT expected to match. Every other group pins an
 *   agreement; this one pins a DISAGREEMENT at the value it takes, because the two
 *   implementations put their guard in different places and deciding which is right
 *   needs faces. Each row carries both columns and each language asserts its own.
 *
 * The other three are name-pinned and value-unchecked, and two of those three are
 * already known to be wrong. docs/shine-formula-decision.md.
 *
 * `primitives` is a second section with a third comparison, and the difference is the
 * point. The `indices` rows above are compared EXACTLY — each against its own
 * language's column, for `roughness_ratio` — because every covered expression is +, -,
 * *, / and sqrt on IEEE doubles, all correctly rounded, so a matching implementation
 * matches bit for bit. `rgb_to_lab` is not: it runs
 * `pow(., 2.4)` three times and a cube root up to three times, and neither language's
 * library rounds those correctly. Measured over 268,877 inputs, V8 and CPython 3.11
 * agree exactly on 63-80% of them and differ by up to 1.47 units of
 * `channelScale * 2^-52` on the rest. So these rows carry a tolerance, and the
 * tolerance came from that measurement rather than from a round number:
 * docs/rgb-to-lab-parity.md.
 *
 * Regenerate (deliberately, never to make a red test green):
 *   ARU_PRINT_INDEX_PARITY=1 npx vitest run tests/index-parity.test.ts
 */

type LM = { x: number; y: number; z?: number };
type FaceRow = {
  kind: "face";
  note: string;
  cheekTarget: number;
  contrast: number;
  glintPixels: number;
  tzoneSpecular: number;
  tzoneL: number;
  cheekL: number;
  shine: number;
};
type EdgeRow = { kind: "edge"; note: string; tzoneSpecular: number; tzoneL: number; cheekL: number; shine: number };
type Row = FaceRow | EdgeRow;
type SpreadRow = { note: string; lstars: number[]; value: number };
type LabRow = { note: string; rgb: [number, number, number]; l: number; a: number; b: number };
type DensityRow = { note: string; count: number; sampledAreaPx: number; faceWidthPx: number; value: number };
type RoughnessRow = {
  note: string;
  cheekHf: number | null;
  foreheadHf: number | null;
  app: number;
  python: number | null;
};

/** blemish_density's inputs are the two quantities detectBlemishes actually produces:
 *  `validCells * stride * stride` and the face-box width in pixels. The first three
 *  rows are the pairs lib/skin.ts reported for ONE synthetic face at two capture
 *  resolutions (docs/capture-resolution-invariance.md), which is what makes the
 *  resolution-invariance the index exists for checkable rather than asserted; the rest
 *  are the guard branches a face cannot reach. */
const DENSITY_INPUTS: Array<[string, number, number, number]> = [
  ["one face at 400x480, 6 blemishes", 6, 42032, 144],
  ["the same face at 1440x1728, 6 blemishes", 6, 537804, 518.4],
  ["the same face, 5 blemishes at the larger capture", 5, 537804, 518.4],
  ["no blemishes found", 0, 42032, 144],
  ["one blemish, small sampled area", 1, 42032, 144],
  ["degenerate face width: both sides clamp", 0, 0, 0],
  ["a sliver of sampled skin on a full-size face", 2, 120, 400],
  ["dense face, count linear in the numerator", 24, 42032, 144],
];

/**
 * Inputs for the roughness_ratio rows, which are a different KIND of row and the table
 * says so: this group is `comparison: "divergent"`, and every other group is
 * `"exact"`.
 *
 * The two implementations of the dryness axis do not agree, measured 2026-09-19:
 * `ml/skin_indices.py:roughness_ratio` is `region_highfreq / max(reference_highfreq,
 * 1e-6)` and `lib/skin.ts:roughnessRatio` is
 * `foreheadHf > 1e-6 ? cheekHf / foreheadHf : 0`. An epsilon clamp against a guard that
 * publishes nothing: on a forehead with no texture the Python side returns a number in
 * the hundreds of thousands where the app returns 0. It is the mechanism that
 * disqualified the rejected `shine_ratio` (24,691 against 0.0674,
 * docs/shine-formula-decision.md), one axis over.
 *
 * WHICH side should move is not decided here, and the rows are built so that it cannot
 * be decided here by accident: each row carries BOTH values, each language asserts its
 * own column, and a change to either implementation fails that language's test without
 * anyone having chosen a winner. The decision needs the measurement the backlog item
 * names — which guard produces a usable dryness reading on a smooth forehead — and that
 * needs faces.
 *
 * The rows either side of 1e-6 are the ones that carry the finding; the first three are
 * there so the table is not only its own edge cases, and the last two are the app's
 * missing-region branch, which Python has no concept of and so has no column for.
 */
const ROUGHNESS_INPUTS: Array<[string, number | null, number | null]> = [
  ["ordinary face: a smoother cheek than forehead", 0.32, 0.4],
  ["a rougher cheek than forehead", 0.8 * 0.4, 0.2 * 0.4],
  ["a cheek with no texture at all", 0, 0.4],
  ["reference an order above the guard: the two agree", 0.32, 1e-5],
  ["reference one ulp above the guard: the two still agree", 0.32, 1.0000001e-6],
  ["reference exactly at 1e-6: Python clamps to it, the app's > excludes it", 0.32, 1e-6],
  ["reference just under the guard", 0.32, 1e-7],
  ["a perfectly smooth forehead: reference exactly 0", 0.32, 0],
  ["no forehead patch: a branch Python has no concept of", 0.32, null],
  ["no cheek patch: the same branch, the other side", null, 0.4],
];

/** The Python side's expression, spelled in TypeScript so the generator can produce the
 *  column ml/selftest.py asserts `roughness_ratio` against. It is NOT what the app
 *  computes and is never called by anything but the generator. */
const pythonRoughness = (region: number, reference: number) => region / Math.max(reference, 1e-6);

/** Inputs for the rgb_to_lab rows. Four families, and the reason for each:
 *  - `cube`: corners and interior of the sRGB cube, so the table is not only skin.
 *  - `worst`: the three inputs where the wide sweep found V8 and CPython furthest
 *    apart, one per channel. Without these the tolerance would never be exercised.
 *  - `knee`: either side of the transfer curve's 0.04045 knee and of f()'s 0.008856
 *    knee, so a branch swapped in one language shows up here.
 *  - `skin`: the shape detectBlemishes actually feeds — a stride-window mean times a
 *    gray-world gain, floats rather than integers, which is why a lookup table for
 *    the transfer curve is not available to either language. */
const LAB_INPUTS: Array<[string, [number, number, number]]> = [
  ["cube: black", [0, 0, 0]],
  ["cube: white", [255, 255, 255]],
  ["cube: mid gray", [128, 128, 128]],
  ["cube: saturated red", [255, 0, 0]],
  ["cube: saturated blue", [0, 0, 255]],
  ["cube: near-black, one channel lit", [1, 3, 0]],
  ["worst L* disagreement in the sweep", [250, 165, 190]],
  ["worst a* disagreement in the sweep", [240, 170, 145]],
  ["worst b* disagreement in the sweep", [20, 15, 240]],
  ["knee: just below 0.04045 * 255", [10.314749999, 128, 64]],
  ["knee: just above 0.04045 * 255", [10.314750001, 128, 64]],
  ["knee: all three channels on the knee", [10.31475, 10.31475, 10.31475]],
  ["knee: f() linear segment, y below 0.008856", [24, 22, 20]],
  ["skin: light cheek, gray-world gains applied", [198.40625, 171.28125, 158.75]],
  ["skin: mid cheek", [171.5625, 143.8125, 132.40625]],
  ["skin: deep cheek", [112.34375, 84.6875, 71.53125]],
  ["skin: a blemish against its background", [176.09375, 139.375, 130.65625]],
  ["skin: T-zone highlight, one channel clamped at 255", [255, 221.46875, 208.8125]],
  ["skin: the darkest cell the detector will grade (L just over 40)", [58.5, 44.25, 39.125]],
  ["skin: the brightest cell the detector will grade (L just under 230)", [246.75, 228.5, 219.25]],
];

const PARITY_PATH = resolve(import.meta.dirname, "..", "ml", "index-parity.json");
const TZONE = SAMPLING_LANDMARKS.tzone;
const CHEEKS = SAMPLING_LANDMARKS.cheeks;
const CHIN = [18, 200, 199, 175, 152, 83, 313];
const W = 200;
const H = 200;
const SKIN: [number, number, number] = [196, 152, 140];
const luminance = (c: [number, number, number]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

/**
 * Same construction as tests/shine-exposure-scale.test.ts: a T-zone band over a cheek
 * band, with `glintPixels` of the 81-pixel T-zone patch painted above the 218 specular
 * cut, so the T-zone specular ratio is exactly glintPixels/81.
 */
function bandFrame(tz: [number, number, number], ck: [number, number, number], glintPixels: number): ImageData {
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
  let painted = 0;
  for (let y = 56; y <= 64 && painted < glintPixels; y += 1) {
    for (let x = 96; x <= 104 && painted < glintPixels; x += 1) {
      const o = (y * W + x) * 4;
      data[o] = 250;
      data[o + 1] = 250;
      data[o + 2] = 250;
      painted += 1;
    }
  }
  return { data, width: W, height: H } as unknown as ImageData;
}

function landmarks(): LM[] {
  const lms: LM[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const i of TZONE) lms[i] = { x: 0.5, y: 0.3, z: 0 };
  for (const i of CHEEKS) lms[i] = { x: 0.5, y: 0.7, z: 0 };
  for (const i of CHIN) lms[i] = { x: 0.5, y: 0.85, z: 0 };
  return lms;
}

/** One capture of the family, read through the shipped `analyzeSkin`. */
function readFace(cheekTarget: number, contrast: number, glintPixels: number) {
  const gain = cheekTarget / luminance(SKIN);
  const cheek = SKIN.map((v) => Math.round(v * gain)) as [number, number, number];
  const tzone = cheek.map((v) => Math.min(255, Math.round(v * contrast))) as [number, number, number];
  const reads = analyzeSkin(bandFrame(tzone, cheek, glintPixels), landmarks());
  expect(reads, `cheekL ${cheekTarget} contrast ${contrast} glint ${glintPixels} produced no reading`).not.toBeNull();
  return reads!.raw;
}

/** The face family the committed rows are drawn from: the oil range, at three exposures. */
const FACE_RECIPES: Array<[number, number, number]> = [
  [140, 1.0, 0], [140, 1.0, 2], [140, 1.0, 8], [140, 1.0, 20], [140, 1.0, 40],
  [140, 1.08, 0], [140, 1.08, 2], [140, 1.08, 8], [140, 1.08, 40],
  [140, 1.2, 0], [140, 1.2, 8], [140, 1.2, 40],
  [80, 1.08, 0], [80, 1.08, 8], [200, 1.04, 0], [200, 1.04, 8],
];

/** Branches the face family cannot produce. Expected values come from `shineIndex` itself. */
const EDGE_INPUTS: Array<[string, number, number, number]> = [
  ["black frame: the (cheekL || 1) branch", 0, 0, 0],
  ["black frame with a specular T-zone", 0.5, 12, 0],
  ["T-zone darker than the cheek: the gap clamps at 0", 0.0, 100, 140],
  ["T-zone darker and specular", 0.25, 100, 140],
  ["no specular pixel, large gap", 0, 210, 140],
  ["fully specular T-zone", 1, 200, 140],
];

/**
 * Inputs for the tone-evenness rows. The four realistic ones are the shape the index
 * actually sees — forehead / both cheeks / chin L* off one frame; the rest are the
 * branches a face does not reach.
 */
const SPREAD_INPUTS: Array<[string, number[]]> = [
  ["even face, mid tone", [62, 62, 62, 62]],
  ["uneven face", [40, 55, 48, 62]],
  ["bright forehead", [71, 59, 61, 58]],
  ["deep tone, slightly uneven", [28.4, 26.9, 27.2, 25.8]],
  ["the same face 1.15x brighter: a ratio, so unchanged but for the last ulp", [46, 63.25, 55.2, 71.3]],
  ["fewer than two values", [62]],
  ["no values at all", []],
  ["all zeros: mean is exactly 0", [0, 0, 0, 0]],
  // These two straddle the 1e-6 mean guard and are the only rows that locate it: an
  // earlier pair both had a mean of exactly zero, so moving the guard to 1e-12 left
  // the whole table green. Checked by breaking it, which is how that was found.
  ["mean 2e-7, just inside the 1e-6 guard: returns 0", [1e-7, 1e-7, 3e-7, 3e-7]],
  ["mean 2e-6, just outside it: returns the real ratio", [1e-6, 1e-6, 3e-6, 3e-6]],
  ["negative mean: the divisor is its magnitude", [-40, -55, -48, -62]],
];

const parity = JSON.parse(readFileSync(PARITY_PATH, "utf8"));
const rows: Row[] = parity.indices.shine_ratio.rows;
const spreadRows: SpreadRow[] = parity.indices.tone_evenness.rows;
const labGroup = parity.primitives.rgb_to_lab;
const densityRows: DensityRow[] = parity.indices.blemish_count.rows;
/** Optional-chained for one reason only: the regenerator below lives in this file, so
 *  the module has to load once against a table that does not yet carry this group. The
 *  case that reads it asserts the row count, so a missing group is still a loud
 *  failure rather than a silent zero-row pass. */
const roughnessGroup = parity.indices.roughness_ratio;
const roughnessRows: RoughnessRow[] = roughnessGroup?.rows ?? [];
const labRows: LabRow[] = labGroup.rows;
/** The tolerance is built from two committed numbers rather than typed as a float, so
 *  it cannot drift and cannot be widened by editing a digit. k is the only judgement
 *  in it; docs/rgb-to-lab-parity.md is the measurement that set it. */
const labTolerance = (channel: "l" | "a" | "b") =>
  labGroup.toleranceK * labGroup.channelScale[channel] * 2 ** -52;

describe("cross-language index parity table", () => {
  it("has rows of both kinds, spanning the oil range", () => {
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.filter((row) => row.kind === "face").length).toBe(FACE_RECIPES.length);
    expect(rows.filter((row) => row.kind === "edge").length).toBe(EDGE_INPUTS.length);
    const shines = rows.map((row) => row.shine);
    expect(Math.min(...shines)).toBe(0);
    expect(Math.max(...shines)).toBeGreaterThan(0.7);
    // ml/selftest.py reads this same file; the reference constant must agree too.
    expect(SHINE_REFERENCE_CHEEK_L).toBe(140);
    // Each covered index names the app field it claims to be, so a row set cannot be
    // pinned against a formula while pointing at a different column.
    expect(parity.indices.shine_ratio.featureKey).toBe("shine");
    expect(parity.indices.tone_evenness.featureKey).toBe("toneSpread");
    expect(spreadRows.length).toBe(SPREAD_INPUTS.length);
  });

  it("recomputes every committed row through the shipped formula, exactly", () => {
    // Exact, not toBeCloseTo: the expression is +, -, * and / on doubles, all
    // IEEE-exact operations, so a matching implementation matches bit for bit. Python
    // asserts the same rows the same way (ml/selftest.py).
    for (const row of rows) {
      const computed = shineIndex(row.tzoneSpecular, row.tzoneL, row.cheekL);
      expect(computed, `${row.note}: shineIndex(${row.tzoneSpecular}, ${row.tzoneL}, ${row.cheekL})`).toBe(row.shine);
    }
  });

  it("reproduces every face row end to end, not just the leaf function", () => {
    // Without this the table would pin the formula and nothing would pin the path
    // into it: a change to which patch `tzoneSpecular` is measured over, or to the
    // trim, would leave every row above green.
    for (const row of rows) {
      if (row.kind !== "face") continue;
      const raw = readFace(row.cheekTarget, row.contrast, row.glintPixels);
      expect(raw.tzoneSpecular, `${row.note}: tzoneSpecular`).toBe(row.tzoneSpecular);
      expect(raw.tzoneL, `${row.note}: tzoneL`).toBe(row.tzoneL);
      expect(raw.cheekL, `${row.note}: cheekL`).toBe(row.cheekL);
      expect(raw.shine, `${row.note}: shine`).toBe(row.shine);
    }
  });

  it("recomputes every tone-evenness row through the shipped formula, exactly", () => {
    // ml/skin_indices.py:tone_evenness has claimed since 2026-09-14 to be "the same
    // formula as relativeSpread in lib/skin.ts". Checked here rather than believed:
    // the `shine_ratio` docstring made the same kind of claim and was wrong for three
    // months. This one is right, and now it stays right or a test goes red.
    for (const row of spreadRows) {
      const computed = relativeSpread(row.lstars);
      expect(computed, `${row.note}: relativeSpread([${row.lstars.join(", ")}])`).toBe(row.value);
    }
    // A table of zeroes would satisfy the loop above and pin nothing.
    expect(spreadRows.filter((row) => row.value > 0).length).toBeGreaterThanOrEqual(4);

    // The property the index exists to have, on the two rows built to show it: the
    // same face 1.15x brighter reads the same evenness. "The same" to 15 significant
    // figures and not to 17 — dividing by a mean that moved is not bit-exact — which
    // is why the committed note for that row says so and this assertion is a
    // tolerance while every cross-language one above is exact.
    const uneven = spreadRows.find((row) => row.note === "uneven face");
    const brighter = spreadRows.find((row) => row.note.startsWith("the same face 1.15x"));
    expect(uneven && brighter).toBeTruthy();
    expect(brighter!.value).not.toBe(uneven!.value);
    expect(brighter!.value).toBeCloseTo(uneven!.value, 15);
  });

  it("recomputes every blemish-density row through the shipped expression, exactly", () => {
    // `blemishDensity: blemishes.count / Math.max(blemishes.areaFace, 1e-6)` in
    // lib/skin.ts, where `areaFace: (validCells * stride * stride) / (faceW * faceW)`.
    // Python spells the same thing in two steps with a guard on each. Exact, not
    // toBeCloseTo: this is /, * and max on doubles, all correctly rounded.
    expect(densityRows.length).toBe(DENSITY_INPUTS.length);
    const source = readFileSync(resolve(import.meta.dirname, "..", "lib", "skin.ts"), "utf8");
    expect(source).toContain("blemishDensity: blemishes.count / Math.max(blemishes.areaFace, 1e-6),");
    expect(source).toContain("return { count, areaFace: (validCells * stride * stride) / (faceW * faceW) };");
    for (const row of densityRows) {
      const areaFace = row.faceWidthPx > 0 ? row.sampledAreaPx / (row.faceWidthPx * row.faceWidthPx) : 0;
      expect(row.count / Math.max(areaFace, 1e-6), `${row.note}`).toBe(row.value);
    }
    // The property the third argument was added for, on the two rows built to show it:
    // the same face at 3.6x the capture width reads the same density. Without this the
    // rows would pin arithmetic and not the index.
    const small = densityRows.find((row) => row.note.startsWith("one face at 400x480"));
    const large = densityRows.find((row) => row.note.startsWith("the same face at 1440x1728"));
    expect(small && large).toBeTruthy();
    expect(large!.value).toBeCloseTo(small!.value, 1);
    expect(large!.value).not.toBe(small!.value);
  });

  it("recomputes every roughness_ratio row through the shipped guard, and records the other side's", () => {
    // The app's column, asserted exactly: the expression is one comparison and one
    // division on doubles. ml/selftest.py asserts the `python` column of these same
    // rows against `roughness_ratio`, so each language holds its own side and neither
    // can move without going red — which is the whole point of committing a table for
    // a pair that DISAGREES rather than waiting for someone to decide which is right.
    expect(roughnessRows.length, "ml/index-parity.json has no roughness_ratio group").toBe(ROUGHNESS_INPUTS.length);
    expect(roughnessGroup.comparison).toBe("divergent");
    expect(roughnessGroup.featureKey).toBe("roughnessRatio");
    for (const row of roughnessRows) {
      const computed = roughnessRatio(row.cheekHf, row.foreheadHf);
      expect(computed, `${row.note}: roughnessRatio(${row.cheekHf}, ${row.foreheadHf})`).toBe(row.app);
    }
    // The extraction that made this assertable has to keep pointing at the shipped
    // field, or the rows would pin a function nothing calls.
    const source = readFileSync(resolve(import.meta.dirname, "..", "lib", "skin.ts"), "utf8");
    expect(source).toContain("roughnessRatio: roughnessRatio(cheekHf, foreheadHf),");
    expect(source).toContain(
      "return cheekHf !== null && foreheadHf !== null && foreheadHf > 1e-6 ? cheekHf / foreheadHf : 0;"
    );

    // A table where the two columns happened to agree everywhere would pin the
    // arithmetic and hide the finding. These are the rows that carry it.
    const divergent = roughnessRows.filter((row) => row.python !== null && row.python !== row.app);
    expect(divergent.length, "no row exercises the guard the two sides put in different places").toBeGreaterThanOrEqual(3);
    const smooth = roughnessRows.find((row) => row.note.startsWith("a perfectly smooth forehead"));
    expect(smooth).toBeTruthy();
    expect(smooth!.app, "the app publishes nothing on a textureless forehead").toBe(0);
    expect(smooth!.python, "Python's epsilon turns the same frame into a large ratio").toBeGreaterThan(100_000);
    // And rows where they agree, so the divergence is located at the guard rather than
    // being everywhere.
    const agreeing = roughnessRows.filter((row) => row.python !== null && row.python === row.app);
    expect(agreeing.length).toBeGreaterThanOrEqual(4);
    // The app's missing-region branch has no Python counterpart, and the table records
    // that as an absent column rather than as a zero that looks like a value.
    const missing = roughnessRows.filter((row) => row.cheekHf === null || row.foreheadHf === null);
    expect(missing.length).toBe(2);
    for (const row of missing) {
      expect(row.python, `${row.note}: Python has no branch for a missing region`).toBeNull();
      expect(row.app, `${row.note}: the app returns the could-not-measure sentinel`).toBe(0);
    }
  });

  it("recomputes every rgb_to_lab row through the shipped function, exactly", () => {
    // Exact on THIS side of the language boundary. The tolerance in the table is for
    // ml/ita.py, whose libm rounds pow and cbrt differently; within TypeScript the
    // rows are ordinary doubles and any drift is a real change.
    expect(labRows.length).toBe(LAB_INPUTS.length);
    for (const row of labRows) {
      const lab = rgbToLab(row.rgb[0], row.rgb[1], row.rgb[2]);
      expect(lab.l, `${row.note}: L*`).toBe(row.l);
      expect(lab.a, `${row.note}: a*`).toBe(row.a);
      expect(lab.b, `${row.note}: b*`).toBe(row.b);
    }
    // Not a table of one colour: it has to span L* to be worth pinning.
    const ls = labRows.map((row) => row.l);
    expect(Math.min(...ls)).toBe(0);
    expect(Math.max(...ls)).toBe(100);
  });

  it("computes a* through the fast path with the same doubles, bit for bit", () => {
    // The whole safety argument for labAStar. detectBlemishes picks local maxima in a*
    // and suppresses neighbours, so a difference far below any threshold can still flip
    // which cells survive — which means "close enough" is not good enough here and
    // toBeCloseTo would be the wrong assertion. rgbToLab delegates its `a` to
    // labAStar, so this holds by construction; it is pinned anyway, because the
    // construction is one edit away from not holding.
    for (const row of labRows) {
      expect(labAStar(row.rgb[0], row.rgb[1], row.rgb[2]), `${row.note}: labAStar`).toBe(row.a);
    }
    expect(labGroup.fastPath.computes).toEqual(["a"]);
    expect(labGroup.fastPath.doesNotCompute).toEqual(["l", "b"]);
  });

  it("states a tolerance that is derived, small, and cannot be widened by a digit", () => {
    // Three things, because a tolerance nobody can check is not a contract.
    // 1. It is built from k and the channel's own literal multiplier, not typed out.
    expect(labGroup.toleranceK).toBe(4);
    expect(labGroup.channelScale).toEqual({ l: 116, a: 500, b: 200 });
    // 2. The multipliers are the ones the formula actually uses.
    const source = readFileSync(resolve(import.meta.dirname, "..", "lib", "skin.ts"), "utf8");
    expect(source).toContain("return { l: 116 * fy - 16, a: labAStar(r, g, b), b: 200 * (fy - fz) };");
    expect(source).toContain("return 500 * (labF(x) - labF(y));");
    // 3. It is far below anything that could hide a real difference. a* feeds
    //    BLEMISH.minResidual = 1.6; the tolerance is 4.4e-13, twelve orders below it,
    //    and about 1e-14 relative on a skin a* of ~20. A genuine formula split — a
    //    different white point, a different matrix, a chromaticity where an a* was
    //    declared — moves a* by whole units, not by parts in 1e14.
    expect(labTolerance("a")).toBeLessThan(1e-9);
    expect(labTolerance("a")).toBeGreaterThan(labTolerance("b"));
    expect(labTolerance("b")).toBeGreaterThan(labTolerance("l"));
  });

  it("regenerates the table when asked", () => {
    if (!process.env.ARU_PRINT_INDEX_PARITY) return;
    const faces: Row[] = FACE_RECIPES.map(([cheekTarget, contrast, glintPixels]) => {
      const raw = readFace(cheekTarget, contrast, glintPixels);
      return {
        kind: "face",
        note: `cheekL ${cheekTarget}, tzoneL/cheekL ${contrast}, ${glintPixels}/81 specular`,
        cheekTarget, contrast, glintPixels,
        tzoneSpecular: raw.tzoneSpecular, tzoneL: raw.tzoneL, cheekL: raw.cheekL, shine: raw.shine,
      };
    });
    const edges: Row[] = EDGE_INPUTS.map(([note, tzoneSpecular, tzoneL, cheekL]) => ({
      kind: "edge", note, tzoneSpecular, tzoneL, cheekL, shine: shineIndex(tzoneSpecular, tzoneL, cheekL),
    }));
    const spreads: SpreadRow[] = SPREAD_INPUTS.map(([note, lstars]) => ({
      note, lstars, value: relativeSpread(lstars),
    }));
    const labs: LabRow[] = LAB_INPUTS.map(([note, rgb]) => {
      const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
      return { note, rgb, l: lab.l, a: lab.a, b: lab.b };
    });
    const densities: DensityRow[] = DENSITY_INPUTS.map(([note, count, sampledAreaPx, faceWidthPx]) => {
      const areaFace = faceWidthPx > 0 ? sampledAreaPx / (faceWidthPx * faceWidthPx) : 0;
      return { note, count, sampledAreaPx, faceWidthPx, value: count / Math.max(areaFace, 1e-6) };
    });
    const roughnesses: RoughnessRow[] = ROUGHNESS_INPUTS.map(([note, cheekHf, foreheadHf]) => ({
      note,
      cheekHf,
      foreheadHf,
      app: roughnessRatio(cheekHf, foreheadHf),
      python: cheekHf === null || foreheadHf === null ? null : pythonRoughness(cheekHf, foreheadHf),
    }));
    const body = {
      generatedBy: "ARU_PRINT_INDEX_PARITY=1 npx vitest run tests/index-parity.test.ts",
      assertedBy: ["tests/index-parity.test.ts", "ml/selftest.py"],
      note: "Inputs and expected outputs for the ml/skin_indices.py indices whose values are pinned across both languages. See docs/shine-formula-decision.md.",
      indices: {
        shine_ratio: {
          featureKey: "shine",
          formula: "shine = tzoneSpecular + max(0, (tzoneL - cheekL) / (cheekL || 1)) * (140 / 255)",
          covers: "formula and path",
          rows: [...faces, ...edges],
        },
        // Keyed by the REGISTRY id, which is `blemish_count`, while the function that
        // computes it is `blemish_density`. The id and the function do not share a name
        // and neither does the feature key; that is worth seeing in the table rather
        // than discovering from a KeyError.
        blemish_count: {
          featureKey: "blemishDensity",
          pythonFunction: "ml/skin_indices.py :: blemish_density",
          formula: "blemishDensity = count / max(sampledAreaPx / faceWidthPx^2, 1e-6)",
          covers: "formula only; validCells * stride^2 and the face-box width are not exported fields",
          rows: densities,
        },
        // The one group whose two columns are NOT expected to match. Everything else
        // in this file pins an agreement; this pins a disagreement, at the value it
        // takes, so that the pair cannot drift further while the decision that settles
        // it is waiting on faces.
        roughness_ratio: {
          featureKey: "roughnessRatio",
          pythonFunction: "ml/skin_indices.py :: roughness_ratio",
          comparison: "divergent",
          appFormula: "roughnessRatio = foreheadHf > 1e-6 ? cheekHf / foreheadHf : 0, and 0 if either region is missing",
          pythonFormula: "roughness_ratio = region_highfreq / max(reference_highfreq, 1e-6)",
          covers:
            "both sides' guard behaviour; the high-frequency inputs are not an exported field, and the " +
            "app divides each region's high-frequency energy by that region's own mean L* before this " +
            "function sees it, which the Python docstring does not say",
          divergence:
            "An epsilon clamp against a guard that publishes nothing. Below 1e-6 of reference texture " +
            "Python returns region/1e-6 — hundreds of thousands — where the app returns its " +
            "could-not-measure 0; at exactly 1e-6 they still differ, because Python clamps to the " +
            "epsilon and the app's > excludes it; above it they agree exactly. Which side moves is a " +
            "measurement on real faces, not a choice to be made from this table.",
          rows: roughnesses,
        },
        tone_evenness: {
          featureKey: "toneSpread",
          formula: "toneSpread = stdev(regionLstars) / abs(mean(regionLstars)), 0 when n < 2 or abs(mean) < 1e-6",
          covers: "formula only; the region L* inputs are not an exported field",
          rows: spreads,
        },
      },
      primitives: {
        rgb_to_lab: {
          typescript: "lib/skin.ts :: rgbToLab",
          python: "ml/ita.py :: rgb_to_lab",
          covers: "formula only; the pixels that reach it are not an exported field",
          comparison: "tolerance",
          why:
            "Unlike the indices above, this runs pow(., 2.4) three times and a cube root up to three " +
            "times, and neither language's library rounds those correctly. V8's Math.cbrt and CPython's " +
            "t ** (1/3) differ by up to 1 ulp, and 500 * (f(x) - f(y)) amplifies that. Exact equality is " +
            "not available and asserting it would make this table a tripwire for the libm, not for ARU.",
          toleranceUnits: "toleranceK * channelScale * 2 ** -52, per channel",
          toleranceK: 4,
          channelScale: { l: 116, a: 500, b: 200 },
          measuredWorstInUnits: 1.472,
          measuredOver: 268877,
          measurement: "docs/rgb-to-lab-parity.md",
          fastPath: {
            typescript: "lib/skin.ts :: labAStar",
            computes: ["a"],
            doesNotCompute: ["l", "b"],
            python: null,
            note:
              "labAStar is the entry point detectBlemishes runs about 18,000 times a frame. It computes " +
              "a* with the identical sequence of doubles and skips z, the third f() and the object, so " +
              "rgbToLab(r, g, b).a === labAStar(r, g, b) exactly. It does not compute L* or b* at all, " +
              "and ml/ita.py has no counterpart: nothing in the Python pipeline wants a* alone.",
          },
          rows: labs,
        },
      },
    };
    writeFileSync(PARITY_PATH, `${JSON.stringify(body, null, 2)}\n`);
    const total =
      body.indices.shine_ratio.rows.length +
      body.indices.tone_evenness.rows.length +
      body.indices.blemish_count.rows.length +
      body.indices.roughness_ratio.rows.length +
      body.primitives.rgb_to_lab.rows.length;
    process.stdout.write(`PARITY wrote ${total} rows to ml/index-parity.json\n`);
  });
});
