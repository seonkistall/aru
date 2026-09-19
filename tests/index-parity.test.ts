import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSkin, relativeSpread, shineIndex, SAMPLING_LANDMARKS, SHINE_REFERENCE_CHEEK_L } from "@/lib/skin";

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
 * Two of the seven registry indices are covered, to different depths, and that is said
 * here rather than implied:
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
 *
 * The other five are name-pinned and value-unchecked. docs/shine-formula-decision.md.
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
        tone_evenness: {
          featureKey: "toneSpread",
          formula: "toneSpread = stdev(regionLstars) / abs(mean(regionLstars)), 0 when n < 2 or abs(mean) < 1e-6",
          covers: "formula only; the region L* inputs are not an exported field",
          rows: spreads,
        },
      },
    };
    writeFileSync(PARITY_PATH, `${JSON.stringify(body, null, 2)}\n`);
    const total = body.indices.shine_ratio.rows.length + body.indices.tone_evenness.rows.length;
    process.stdout.write(`PARITY wrote ${total} rows to ml/index-parity.json\n`);
  });
});
