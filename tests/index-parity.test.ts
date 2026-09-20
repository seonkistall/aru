import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { toneBandFromIta } from "@/lib/tone-bands";
import { analyzeSkin, itaDegrees, labAStar, redChromaticity, relativeRedness, relativeSpread, rgbToLab, roughnessRatio, sampleRegion, shineIndex, SAMPLING_LANDMARKS, SHINE_REFERENCE_CHEEK_L } from "@/lib/skin";

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
 * Six of the seven registry indices are covered, to different depths and under two
 * different KINDS of comparison, and that is said here rather than implied:
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
 * - `relative_redness` / `relRedness`: formula AND path, added cycle 19. Its 8 `face`
 *   rows are read through `analyzeSkin` and carry BOTH the frame recipe and the two
 *   region mean RGBs `sampleRegion` produced, because those means are what the index
 *   is fed and `SkinRawFeatures` does not export them. Exact, because the decision was
 *   MADE rather than deferred: the Python side was a CIELAB a* difference and moved
 *   onto this one, on the measurement in docs/redness-formula-decision.md.
 * - `ita` / `toneIta`: formula only, added cycle 19 as the second `divergent` group and
 *   `exact` since cycle 20 decided it. Three implementations guarded the b* ≈ 0
 *   singularity in two different places — |b*| < 0.01 in lib/skin.ts and ml/ita.py,
 *   1e-6 in ml/skin_indices.py — and because the ±90 fallback ignores the SIGN of b*
 *   the window between them was a 180-degree disagreement rather than a rounding one.
 *   All three now guard `b* == 0` and nothing wider, so the rows carry one column;
 *   docs/ita-guard-decision.md is the measurement that chose it.
 *
 * The seventh, `melanin_index`, is name-pinned and has no second column to check
 * against: FEATURE_KEY declares it to be `toneLstar` and it is a nonlinear transform
 * of it, with no TypeScript counterpart anywhere. Closing that is a decision about
 * what FEATURE_KEY means, not a row. docs/redness-formula-decision.md.
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
type RednessFaceRow = {
  kind: "face";
  note: string;
  cheekTarget: number;
  tzoneMul: [number, number, number];
  cheekRgb: [number, number, number];
  tzoneRgb: [number, number, number];
  cheekMean: [number, number, number];
  tzoneMean: [number, number, number];
  relRedness: number;
};
type RednessEdgeRow = {
  kind: "edge";
  note: string;
  cheekMean: [number, number, number];
  tzoneMean: [number, number, number];
  relRedness: number;
};
type RednessRow = RednessFaceRow | RednessEdgeRow;
type ItaRow = { note: string; lstar: number; bstar: number; value: number };

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

/**
 * One redness capture, read through the shipped `analyzeSkin` AND through
 * `sampleRegion`, because the two region mean RGBs are what `relativeRedness` is fed
 * and `SkinRawFeatures` does not export them. Committing the means is what lets Python
 * assert on the numbers the app's formula actually receives rather than on the painted
 * colours, which a change to the trim would silently decouple from each other.
 */
function readRednessFace(cheekTarget: number, tzoneMul: [number, number, number]) {
  const gain = cheekTarget / luminance(SKIN);
  const cheek = SKIN.map((v) => Math.min(255, Math.round(v * gain))) as [number, number, number];
  const tzone = cheek.map((v, c) => Math.min(255, Math.round(v * tzoneMul[c]))) as [number, number, number];
  const frame = bandFrame(tzone, cheek, 0);
  const data = (frame as unknown as { data: Uint8ClampedArray }).data;
  const lms = landmarks();
  const cheekStats = sampleRegion(data, W, H, lms, CHEEKS);
  const tzoneStats = sampleRegion(data, W, H, lms, TZONE);
  expect(cheekStats && tzoneStats, `cheekL ${cheekTarget} tzoneMul ${tzoneMul.join("/")} produced no region`).toBeTruthy();
  const reads = analyzeSkin(bandFrame(tzone, cheek, 0), lms);
  expect(reads, `cheekL ${cheekTarget} tzoneMul ${tzoneMul.join("/")} produced no reading`).not.toBeNull();
  return {
    cheek,
    tzone,
    cheekMean: [cheekStats!.meanR, cheekStats!.meanG, cheekStats!.meanB] as [number, number, number],
    tzoneMean: [tzoneStats!.meanR, tzoneStats!.meanG, tzoneStats!.meanB] as [number, number, number],
    relRedness: reads!.raw.relRedness,
  };
}

/** The face family the committed rows are drawn from: the oil range, at three exposures. */
const FACE_RECIPES: Array<[number, number, number]> = [
  [140, 1.0, 0], [140, 1.0, 2], [140, 1.0, 8], [140, 1.0, 20], [140, 1.0, 40],
  [140, 1.08, 0], [140, 1.08, 2], [140, 1.08, 8], [140, 1.08, 40],
  [140, 1.2, 0], [140, 1.2, 8], [140, 1.2, 40],
  [80, 1.08, 0], [80, 1.08, 8], [200, 1.04, 0], [200, 1.04, 8],
];

/**
 * Inputs for the relative_redness rows, added cycle 19 when the Python side moved onto
 * the app's formula (docs/redness-formula-decision.md).
 *
 * `[cheekTarget, tzoneMul]`: the cheek is the SKIN constant scaled to that luminance
 * and the T-zone is the cheek scaled PER CHANNEL, which is what the shine family's
 * single `contrast` cannot do — a scalar contrast leaves both regions on the same
 * chromaticity and every row would read exactly 0.
 *
 * The first three recipes are one face at three exposures across the 조명 band, so the
 * scale-freedom the decision rests on is a property of the committed rows rather than a
 * sentence in a docstring. The rest span the axis: a T-zone redder than the cheek
 * (negative), one barely different, one well past the 0.03 cut.
 */
const REDNESS_FACE_RECIPES: Array<[number, [number, number, number]]> = [
  [80, [0.98, 1.03, 1.03]],
  [140, [0.98, 1.03, 1.03]],
  [200, [0.98, 1.03, 1.03]],
  [140, [1.0, 1.0, 1.0]],
  [140, [1.02, 0.98, 0.98]],
  [140, [0.995, 1.005, 1.005]],
  [140, [0.92, 1.09, 1.09]],
  [110, [0.95, 1.05, 1.06]],
];

/**
 * Inputs for the ita rows. Added cycle 19, which pinned the group `divergent` because
 * three implementations existed and only two agreed; rewritten cycle 20, which decided
 * it. The guard is now `b* === 0` in `lib/skin.ts:itaDegrees`, `ml/ita.py:ita_from_lab`
 * and `ml/skin_indices.py:ita` alike, so the group is `exact` and carries ONE column.
 *
 * What the rows have to locate has therefore changed. They are no longer a record of a
 * disagreement; they are the boundary of the only fallback left. Three things are held:
 *
 * 1. Where the old windows used to sit — b* at 0.01, at 0.005 either side, at 1e-6 —
 *    the angle now simply computes, and the ±0.005 pair reads ±89.986 instead of both
 *    reading +90. That pair is the whole finding cycle 19 recorded, inverted: the sign
 *    of b* now reaches the answer.
 * 2. The two neutral 8-bit greys, which are why the old window was reachable rather
 *    than arithmetic. `rgbToLab` gives r = g = b a small NEGATIVE b*, so a grey sat
 *    inside `|b*| < 0.01` and the old fallback answered with the sign of L* − 50, which
 *    is the sign the limit does not have. Their L* and b* come from `rgbToLab` itself
 *    rather than being typed in, so the row cannot outlive the conversion that produced
 *    it. docs/ita-guard-decision.md and tests/ita-guard-decision.test.ts are the
 *    measurement; this is the cross-language half of it.
 * 3. b* exactly zero, above and below the pivot and at it, where the quotient has no
 *    value and ±90 is a documented convention rather than an approximation. −0 is NOT
 *    a row here and cannot be: `JSON.stringify(-0)` is `"0"`, so the table cannot carry
 *    the distinction. tests/ita-guard-decision.test.ts and ml/selftest.py assert it
 *    against the functions directly, which is where a sign of zero belongs.
 */
const GREY_128 = rgbToLab(128, 128, 128);
const GREY_60 = rgbToLab(60, 60, 60);
const ITA_INPUTS: Array<[string, number, number]> = [
  ["ordinary light skin", 71.6, 22.0],
  ["ordinary deep skin", 27.2, 12.0],
  ["L* exactly at the 50 pivot: the angle is 0 whatever b* is", 50.0, 20.0],
  ["a cool cast, b* well clear of zero", 61.1, -8.0],
  ["b* at the old 0.01 guard, which the app used to stop computing at", 70.0, 0.01],
  ["b* inside the old 0.01 window: the angle, not the 90 it used to publish", 70.0, 0.005],
  ["the same b* negative: -89.99, where the old guard read +90 from the same frame", 70.0, -0.005],
  ["small negative b* below the pivot: +89.99, where the old guard read -90", 30.0, -0.005],
  ["b* at the old registry guard of 1e-6", 70.0, 1e-6],
  ["b* a thousand times smaller again: still an ordinary quotient", 70.0, 1e-9],
  ["b* denormal: the quotient overflows to Infinity and atan maps it to exactly 90", 70.0, 5e-324],
  // Why the old window was reachable. Not a knife-edge cast: the neutral axis itself.
  ["neutral 8-bit grey 128, above the pivot: b* is negative, so the limit is -90", GREY_128.l, GREY_128.b],
  ["neutral 8-bit grey 60, below the pivot: b* is negative, so the limit is +90", GREY_60.l, GREY_60.b],
  // The second defect a guard on b* alone carried: what diverges is the RATIO.
  ["L* a thousandth above the pivot inside the old window: 11.3, not the 90 it read", 50.001, 0.005],
  // The only fallback left, and it is a convention rather than an approximation.
  ["b* exactly zero above the pivot: the b* -> 0+ limit, by convention", 70.0, 0.0],
  ["b* exactly zero below the pivot", 30.0, 0.0],
  ["b* exactly zero AT the pivot: 0/0, so the convention is all there is", 50.0, 0.0],
];

/** Branches the face family cannot reach. Expected values come from `relativeRedness`. */
const REDNESS_EDGE_INPUTS: Array<[string, [number, number, number], [number, number, number]]> = [
  ["identical regions: exactly 0, not nearly 0", [196, 152, 140], [196, 152, 140]],
  ["both regions black: the (r + g + b || 1) branch on both sides", [0, 0, 0], [0, 0, 0]],
  ["a black T-zone against a lit cheek: only the reference takes the branch", [196, 152, 140], [0, 0, 0]],
  ["a black cheek against a lit T-zone: the branch, and the sign is negative", [0, 0, 0], [196, 152, 140]],
  ["non-integer means, which is what a trimmed mean of a textured region gives", [180.375, 149.8125, 141.5], [176.25, 152.9375, 145.0625]],
  ["the same pair 2.5x brighter: a ratio, so it must not move", [450.9375, 374.53125, 353.75], [440.625, 382.34375, 362.65625]],
  ["a saturated region, all three channels at the ceiling", [255, 255, 255], [196, 152, 140]],
  // These two straddle any epsilon somebody might reach for, and they are here because
  // the group was BROKEN on purpose without them and Python stayed green: swapping its
  // `total if total else 1.0` for `max(total, 1e-6)` agrees on a region of exactly
  // zero, so the black rows above locate the branch on ZERO and locate nothing about
  // where it sits. The same failure mode tone_evenness's 2e-7 / 2e-6 pair was added to
  // close. Not a capture anyone will take — an 8-bit mean is 0 or it is not small —
  // which is what makes it an `edge` row.
  ["a region summing to 1e-9: the branch is on zero, not on small", [5e-10, 3e-10, 2e-10], [196, 152, 140]],
  ["the same chromaticity a million times larger: both must read the same", [5e-4, 3e-4, 2e-4], [196, 152, 140]],
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
const rednessGroup = parity.indices.relative_redness;
const rednessRows: RednessRow[] = rednessGroup?.rows ?? [];
const itaGroup = parity.indices.ita;
const itaRows: ItaRow[] = itaGroup?.rows ?? [];
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

  it("recomputes every relative_redness row through the shipped formula and the shipped path", () => {
    // The fourth index whose two implementations were two formulas under one declared
    // name, and the last one with a real measurement behind it. Until 2026-09-20
    // `ml/skin_indices.py:relative_redness` returned a CIELAB a* difference while this
    // side returned a difference of red chromaticities, and `FEATURE_KEY` called them
    // one field. The Python side moved, on the measurement in
    // docs/redness-formula-decision.md rather than on which was more standard.
    expect(rednessRows.length, "ml/index-parity.json has no relative_redness group").toBe(
      REDNESS_FACE_RECIPES.length + REDNESS_EDGE_INPUTS.length
    );
    expect(rednessGroup.comparison).toBe("exact");
    expect(rednessGroup.featureKey).toBe("relRedness");
    expect(rednessRows.filter((row) => row.kind === "face").length).toBe(REDNESS_FACE_RECIPES.length);
    expect(rednessRows.filter((row) => row.kind === "edge").length).toBe(REDNESS_EDGE_INPUTS.length);

    // Exact, not toBeCloseTo: two divisions and a subtraction on doubles, all
    // correctly rounded. Python asserts these same rows the same way.
    for (const row of rednessRows) {
      const computed = relativeRedness(
        { meanR: row.cheekMean[0], meanG: row.cheekMean[1], meanB: row.cheekMean[2] },
        { meanR: row.tzoneMean[0], meanG: row.tzoneMean[1], meanB: row.tzoneMean[2] }
      );
      expect(computed, `${row.note}: relativeRedness(${row.cheekMean.join("/")}, ${row.tzoneMean.join("/")})`).toBe(
        row.relRedness
      );
    }

    // The path, not just the leaf. Without this the rows would pin arithmetic and a
    // change to WHICH regions the index compares — or to the trim that produces their
    // means — would leave every row above green, which is exactly the hole the shine
    // group's face rows exist to close.
    for (const row of rednessRows) {
      if (row.kind !== "face") continue;
      const read = readRednessFace(row.cheekTarget, row.tzoneMul);
      expect(read.cheek, `${row.note}: painted cheek`).toEqual(row.cheekRgb);
      expect(read.tzone, `${row.note}: painted T-zone`).toEqual(row.tzoneRgb);
      expect(read.cheekMean, `${row.note}: cheek region mean`).toEqual(row.cheekMean);
      expect(read.tzoneMean, `${row.note}: T-zone region mean`).toEqual(row.tzoneMean);
      expect(read.relRedness, `${row.note}: relRedness`).toBe(row.relRedness);
    }
    const source = readFileSync(resolve(import.meta.dirname, "..", "lib", "skin.ts"), "utf8");
    expect(source).toContain("relRedness: relativeRedness(cheeks, tzone),");
    expect(source).toContain("return r / (r + g + b || 1);");

    // A table of zeroes would satisfy every loop above and pin nothing. The rows have
    // to span the published axis, both signs included.
    const values = rednessRows.map((row) => row.relRedness);
    expect(values.filter((value) => value > 0.03).length, `above the 높음 cut: ${values.join(" ")}`).toBeGreaterThanOrEqual(1);
    expect(values.filter((value) => value < 0).length, "no row is negative").toBeGreaterThanOrEqual(2);
    expect(values.filter((value) => value === 0).length, "no row is exactly 0").toBeGreaterThanOrEqual(2);

    // The property the decision rests on, carried by the rows rather than by a
    // docstring: one face at three exposures across the 조명 band reads the same
    // redness. The rejected a* difference moves by 2.17x over the same band.
    const sameFace = rednessRows.filter(
      (row): row is RednessFaceRow => row.kind === "face" && row.tzoneMul.join("/") === "0.98/1.03/1.03"
    );
    expect(sameFace.length).toBe(3);
    expect(new Set(sameFace.map((row) => row.cheekTarget)).size).toBe(3);
    const readings = sameFace.map((row) => row.relRedness);
    // The rejected form, computed from the SAME committed means, so the comparison is
    // between two readings of one frame rather than between two fixtures. Measured:
    // chromaticity 0.011695 / 0.011843 / 0.012302, spread 1.0520; a* 1.801081 /
    // 2.870473 / 4.364763, spread 2.4234. Neither is 1.0000 — a capture writes 8-bit
    // integers and rounding is not a multiplicative operation — but one of them is
    // rounding and the other is the formula.
    const rejected = sameFace.map(
      (row) =>
        labAStar(row.cheekMean[0], row.cheekMean[1], row.cheekMean[2]) -
        labAStar(row.tzoneMean[0], row.tzoneMean[1], row.tzoneMean[2])
    );
    const spread = (values: number[]) => Math.max(...values) / Math.min(...values);
    expect(spread(readings), readings.join(" ")).toBeLessThan(1.06);
    expect(spread(rejected), rejected.join(" ")).toBeGreaterThan(2.4);
    // The number the decision turns on: the excess over 1.0 — what the sweep costs —
    // is more than twenty times larger for the rejected form on these three frames.
    expect((spread(rejected) - 1) / (spread(readings) - 1)).toBeGreaterThan(20);
    // And the edge pair, where the inputs are exact multiples and nothing is rounded:
    // there the invariance is down to the last place of a difference of two ~0.34
    // chromaticities, which is one ulp of 1.0.
    const exact = rednessRows.find((row) => row.note.startsWith("non-integer means"));
    const exactBrighter = rednessRows.find((row) => row.note.startsWith("the same pair 2.5x brighter"));
    expect(exact && exactBrighter).toBeTruthy();
    expect(Math.abs(exactBrighter!.relRedness - exact!.relRedness)).toBeLessThanOrEqual(2 ** -52);

    // The two branches a face cannot reach, named rather than left to the loop.
    const black = rednessRows.find((row) => row.note.startsWith("both regions black"));
    expect(black!.relRedness, "a black frame must read 0, not NaN").toBe(0);
    expect(Number.isNaN(black!.relRedness)).toBe(false);
    expect(redChromaticity(0, 0, 0), "the (r + g + b || 1) branch").toBe(0);
    // And where that branch SITS, which the black rows cannot say: `|| 1` fires on
    // exactly zero, so a region summing to 1e-9 is still divided by its own sum and
    // reads the same chromaticity as one a million times larger. An epsilon clamp in
    // either language would return 5e-4 for the first and 0.5 for the second.
    const tiny = rednessRows.find((row) => row.note.startsWith("a region summing to 1e-9"));
    const large = rednessRows.find((row) => row.note.startsWith("the same chromaticity a million"));
    expect(tiny && large).toBeTruthy();
    expect(tiny!.relRedness, "the guard fires on small instead of on zero").toBe(large!.relRedness);
    expect(redChromaticity(5e-10, 3e-10, 2e-10)).toBe(0.5);
  });

  it("recomputes every ita row through the shipped function, exactly", () => {
    // Cycle 19 pinned this group as a disagreement between three implementations; cycle
    // 20 decided it, so what the case holds now is the agreement AND the shape of the
    // one fallback left. `exact` rather than `divergent` is itself an assertion: if the
    // guards part again, the row set stops matching in one language or the other.
    expect(itaRows.length, "ml/index-parity.json has no ita group").toBe(ITA_INPUTS.length);
    expect(itaGroup.comparison).toBe("exact");
    expect(itaGroup.featureKey).toBe("toneIta");
    for (const row of itaRows) {
      expect(itaDegrees(row.lstar, row.bstar), `${row.note}: itaDegrees(${row.lstar}, ${row.bstar})`).toBe(row.value);
    }
    // The extraction that made this assertable has to keep pointing at both shipped
    // call sites, or the rows would pin a function nothing calls.
    const source = readFileSync(resolve(import.meta.dirname, "..", "lib", "skin.ts"), "utf8");
    expect(source.match(/const ita = itaDegrees\(lab\.l, lab\.b\);/g)?.length, "both tone sites must delegate").toBe(2);
    expect(source).toContain(
      "return bstar === 0 ? (lstar > 50 ? 90 : -90) : (Math.atan((lstar - 50) / bstar) * 180) / Math.PI;"
    );

    // The fallback fires on exactly the rows where b* is zero and on no others, which
    // is the whole of the decision. A row set that took the fallback anywhere else
    // would mean a window had reappeared.
    const fellBack = itaRows.filter((row) => row.value === 90 || row.value === -90);
    expect(new Set(fellBack.map((row) => row.bstar)), "only b* == 0 may reach the fallback").toEqual(new Set([0, 5e-324]));
    // 5e-324 is there precisely because it does NOT take the guard: the quotient
    // overflows to Infinity and Math.atan maps that to exactly pi/2, so the value is
    // the limit rather than the convention. Both routes produce 90 and only one of
    // them is a branch.
    expect(itaDegrees(70, 5e-324)).toBe(90);
    expect(Number.isFinite((70 - 50) / 5e-324)).toBe(false);

    // The pair cycle 19 recorded, now reading the sign of b* instead of ignoring it.
    // Before the decision both of these published +90.
    const positive = itaRows.find((row) => row.note.startsWith("b* inside the old 0.01 window"))!;
    const negative = itaRows.find((row) => row.note.startsWith("the same b* negative"))!;
    expect(positive.value).toBeCloseTo(89.98567605542014, 12);
    expect(negative.value).toBe(-positive.value);
    // Which is the consequence that made it worth deciding: 41 is the light cut and 10
    // the deep one (ITA_BIN_EDGES, ml/subgroups.py and lib/tone-bands.ts), and the old
    // fallback put both of these above the first.
    expect(positive.value).toBeGreaterThan(41);
    expect(negative.value).toBeLessThan(10);

    // Why the old window was reachable, in the table rather than only in the doc: a
    // neutral grey has a small negative b*, so it sat inside |b*| < 0.01, and the old
    // fallback answered with sign(L* - 50) where the limit is its negation.
    for (const note of ["neutral 8-bit grey 128", "neutral 8-bit grey 60"]) {
      const row = itaRows.find((entry) => entry.note.startsWith(note))!;
      expect(row.bstar, `${note}: b* must be negative for the sign to matter`).toBeLessThan(0);
      expect(Math.abs(row.bstar), `${note}: and inside the guard that used to catch it`).toBeLessThan(0.01);
      expect(Math.sign(row.value), `${note}: the limit is -sign(L* - 50)`).toBe(-Math.sign(row.lstar - 50));
      expect(Math.abs(row.value), `${note}: and it is still a near-vertical angle`).toBeGreaterThan(89);
    }

    // The second defect a guard on b* alone carried. What diverges is the ratio, so a
    // window on b* published a vertical angle for a face a thousandth off the pivot.
    const pivot = itaRows.find((row) => row.note.startsWith("L* a thousandth above the pivot"))!;
    expect(pivot.value).toBeCloseTo(11.309932474020215, 10);
    expect(toneBandFromIta(pivot.value)).toBe("tan");
    expect(toneBandFromIta(90)).toBe("very_light");
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
    const rednessFaces: RednessRow[] = REDNESS_FACE_RECIPES.map(([cheekTarget, tzoneMul]) => {
      const read = readRednessFace(cheekTarget, tzoneMul);
      return {
        kind: "face",
        note: `cheekL ${cheekTarget}, T-zone ${tzoneMul.join("/")} of the cheek`,
        cheekTarget,
        tzoneMul,
        cheekRgb: read.cheek,
        tzoneRgb: read.tzone,
        cheekMean: read.cheekMean,
        tzoneMean: read.tzoneMean,
        relRedness: read.relRedness,
      };
    });
    const rednessEdges: RednessRow[] = REDNESS_EDGE_INPUTS.map(([note, cheekMean, tzoneMean]) => ({
      kind: "edge",
      note,
      cheekMean,
      tzoneMean,
      relRedness: relativeRedness(
        { meanR: cheekMean[0], meanG: cheekMean[1], meanB: cheekMean[2] },
        { meanR: tzoneMean[0], meanG: tzoneMean[1], meanB: tzoneMean[2] }
      ),
    }));
    const itas: ItaRow[] = ITA_INPUTS.map(([note, lstar, bstar]) => ({
      note,
      lstar,
      bstar,
      value: itaDegrees(lstar, bstar),
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
        // The fourth index found to be two formulas under one declared name, and the
        // last of those with a real measurement behind it. Unlike roughness_ratio this
        // one is `exact`, because the decision was made rather than deferred: the
        // Python side moved onto the app's formula on 2026-09-20, and the reason it
        // moved is that an a* difference is not scale-free while a chromaticity
        // difference is. docs/redness-formula-decision.md.
        relative_redness: {
          featureKey: "relRedness",
          pythonFunction: "ml/skin_indices.py :: relative_redness",
          comparison: "exact",
          formula: "relRedness = redChromaticity(cheekMean) - redChromaticity(tzoneMean), redChromaticity(r, g, b) = r / (r + g + b || 1)",
          covers:
            "formula and path; the two region mean RGBs are not an exported field, so each face row " +
            "carries the means sampleRegion produced as well as the frame recipe that produced them",
          replaced:
            "relative_redness(target_astar, reference_astar) — a CIELAB a* difference, declared by " +
            "FEATURE_KEY to be the same field as the app's chromaticity difference from 2026-09-14 to " +
            "2026-09-20. Rejected on measurement: a* is homogeneous of degree 1/3 in the linear signal " +
            "and the linear signal degree 2.4 in the channel, so a common exposure gain g takes an a* " +
            "DIFFERENCE to g^0.8 of itself instead of leaving it alone. Over cheekL 70..170 on one face " +
            "the a* form runs 1.83 -> 3.96 (2.17x) where this one holds within 1.025x.",
          rows: [...rednessFaces, ...rednessEdges],
        },
        // The seventh index, and the one that finished the audit cycles 16-19 ran.
        // Pinned `divergent` by cycle 19 with both columns; ONE column since cycle 20
        // decided the guard, which is what a settled index looks like in this table.
        ita: {
          featureKey: "toneIta",
          pythonFunction: "ml/skin_indices.py :: ita",
          comparison: "exact",
          formula: "ita = b* == 0 ? (L* > 50 ? 90 : -90) : atan((L* - 50) / b*) in degrees",
          covers:
            "formula only; the cheek L* and b* that reach it come from dominantTone's k-means centroid, " +
            "which is not an exported field. All three implementations are held to this column: " +
            "lib/skin.ts :: itaDegrees by tests/index-parity.test.ts, ml/skin_indices.py :: ita exactly " +
            "and ml/ita.py :: ita_from_lab within the math.degrees tolerance by ml/selftest.py.",
          replaced:
            "|b*| < 0.01 in lib/skin.ts and ml/ita.py against |b*| < 1e-6 in ml/skin_indices.py, which " +
            "cycle 19 pinned as a divergence because the +-90 fallback ignores the SIGN of b* and the " +
            "three therefore landed 180 degrees apart inside the window -- `light` against `deep` on " +
            "coarse_tone_band from one frame. Decided on a measurement rather than on taste: a neutral " +
            "grey is INSIDE the wider window, because ARU's four-decimal sRGB->XYZ matrix gives " +
            "r = g = b a small negative b*, so 242 of the 256 8-bit greys satisfied |b*| < 0.01 against " +
            "1 of 256 for 1e-6, and on all 241 non-black ones the fallback returned the sign the limit " +
            "does not have. A guard on b* alone was wrong twice over: what diverges is the RATIO, so at " +
            "L* 50.001 and b* 0.005 it published +90 (very_light) where the angle is 11.3 (tan). " +
            "docs/ita-guard-decision.md.",
          rows: itas,
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
      body.indices.relative_redness.rows.length +
      body.indices.ita.rows.length +
      body.primitives.rgb_to_lab.rows.length;
    process.stdout.write(`PARITY wrote ${total} rows to ml/index-parity.json\n`);
  });
});
