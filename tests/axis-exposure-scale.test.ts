import { describe, expect, it } from "vitest";
import { analyzeSkin, ATTR_THRESHOLDS } from "@/lib/skin";

/**
 * The OTHER two published axes must not depend on how bright the capture was.
 *
 * Cycle 12 swept `shine` and found it carried an absolute brightness term; it fixed
 * that and pinned it in tests/shine-exposure-scale.test.ts. The two remaining axes
 * were asserted to be exposure-invariant and had never been measured:
 *
 *   relRedness = rIdx(cheeks) - rIdx(tzone),  rIdx = meanR / (meanR + meanG + meanB)
 *   cov        = cheeks.texture / cheekL,     texture = sd of region luminance
 *
 * Both look scale-free, which is exactly what `shine` looked like. This file sweeps
 * them the way cycle 12 swept oil — relative face structure held fixed, exposure moved
 * across the 조명 band — and keeps oil in the sweep as the known-good control.
 *
 * What the sweep found, and why the formulas are NOT changed here:
 *
 *  1. Both ARE exposure-invariant, over the whole band in which no channel saturates.
 *     That is the regression guard these cases exist to hold.
 *  2. Both collapse at the TOP of the band, and the published pores level flips there
 *     while all three capture signals cycle 13 had still say ok. The cause is the
 *     8-bit ceiling, not the normalisation: the control face, same texture and same
 *     relRedness but less saturated, holds flat over the identical exposure sweep. No
 *     renormalisation recovers a pixel already written as 255, so unlike cycle 12's
 *     finding this one was never a fix to an index formula.
 *     **Cycle 14 closed it with a fourth signal instead**, 노출 여유, on the cheek's
 *     clipped-channel fraction — see lib/skin.ts `CHEEK_CLIP_LIMIT` for how its cut was
 *     derived and tests/cheek-clipping-signal.test.ts for the sweep. The cases below
 *     therefore evaluate the three old signals AND the shipped four separately: the
 *     collapse is still measured (it is physics and has not moved), what changed is
 *     that a capture suffering it is now refused rather than published.
 *  3. The dark end is clean. 8-bit quantisation adds scatter that grows as the
 *     absolute texture shrinks, but no trend, and nothing near a cut.
 *
 * Cycle 12's fixture cannot be reused directly: its frame is flat, so `texture` is 0
 * and `cov` is 0 at every exposure. A face needs texture before pores can be measured
 * at all, which is why this file builds its own.
 */

type LM = { x: number; y: number; z?: number };

// Region index lists copied from lib/skin.ts, as tests/shine-exposure-scale.test.ts does.
const TZONE = [9, 8, 107, 336, 151, 10, 67, 297, 1, 4, 5, 195, 197];
const CHEEKS = [50, 101, 118, 117, 116, 205, 36, 280, 330, 347, 346, 345, 425, 266];
const CHIN = [18, 200, 199, 175, 152, 83, 313];

const W = 200;
const H = 200;

/** The band the 조명 signal passes (`buildSignals`: cheekL 70..210). */
const LIGHTING_BAND: [number, number] = [70, 210];
/**
 * The part of that band in which a typical warm skin tone has not yet driven its red
 * channel into the 8-bit ceiling. Measured below, not assumed: `CLIPPING` reads 0.0%
 * of its cheek patch at 255 through cheekL 162.6, 2.5% at 177.9 and 25.9% at 190.7.
 */
const UNSATURATED_BAND: [number, number] = [70, 170];

const lumOf = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

/** Deterministic per-pixel value in [0, 1). No seeded RNG, no fixture file to lose. */
function hash01(x: number, y: number, seed: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

type Face = {
  /** Cheek and T-zone base colours in SCENE units, before any exposure gain. */
  cheek: number[];
  tzone: number[];
  /** Multiplicative luminance texture, the same on both regions. Drives `cov`. */
  amp: number;
  /** Multiplicative per-channel jitter, so the trimmed mean has a colour to choose from. */
  chroma: number;
};

/**
 * One face at one exposure. The scene is fixed and every variation on it is
 * MULTIPLICATIVE, so an exposure change leaves the relative structure of the face
 * untouched — which is the whole point of the sweep. The camera applies `gain` and
 * then writes 8 bits, and that write is the only place an exposure can leave a trace
 * in an index built from ratios.
 */
function frameAt(face: Face, gain: number, seed = 7): ImageData {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    const base = y < 100 ? face.tzone : face.cheek;
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const n = 1 + face.amp * (2 * hash01(x, y, seed) - 1);
      for (let c = 0; c < 3; c += 1) {
        const j = 1 + face.chroma * (2 * hash01(x, y, seed + 31 * (c + 1)) - 1);
        data[i + c] = Math.round(base[c] * n * j * gain);
      }
      data[i + 3] = 255;
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

function capture(face: Face, cheekTarget: number) {
  const reads = analyzeSkin(frameAt(face, cheekTarget / lumOf(face.cheek)), landmarks());
  expect(reads, `cheekL ${cheekTarget} produced no reading`).not.toBeNull();
  return reads!;
}

/** Share of the 9x9 cheek patch whose RED channel sits at the 8-bit ceiling. */
function clippedRedFraction(face: Face, cheekTarget: number) {
  const frame = frameAt(face, cheekTarget / lumOf(face.cheek)) as unknown as { data: Uint8ClampedArray };
  let clipped = 0;
  let total = 0;
  for (let y = 136; y <= 144; y += 1) {
    for (let x = 96; x <= 104; x += 1) {
      total += 1;
      if (frame.data[(y * W + x) * 4] >= 255) clipped += 1;
    }
  }
  return clipped / total;
}

type Attr = "oil" | "redness" | "pores";
const levelOf = (attr: Attr, value: number) => {
  const [lo, hi] = ATTR_THRESHOLDS[attr];
  return value < lo ? 0 : value < hi ? 1 : 2;
};

const spread = (values: number[]) => Math.max(...values) / Math.min(...values);

/**
 * A warm skin tone with R/L = 1.223. Its relRedness sits just above the 0.012 cut and
 * its cov just above the 0.085 cut, so both axes are one small move from a level flip
 * — which is what makes a drift visible as a PUBLISHED level and not just a number.
 */
const CLIPPING: Face = { cheek: [200, 150, 138], tzone: [195, 154, 142], amp: 0.19, chroma: 0.03 };

/**
 * The control. Same texture amplitude, same relRedness to two significant figures, but
 * R/L = 1.101 instead of 1.223, so the red channel still has headroom at the top of the
 * 조명 band. If the drift belonged to the normalisation this face would drift too.
 */
const HEADROOM: Face = { cheek: [176, 154, 148], tzone: [170.4, 158.4, 151.2], amp: 0.19, chroma: 0.03 };

/** Oil control: a near-neutral face whose T-zone is a fixed 10% brighter than its cheeks. */
const OIL: Face = { cheek: [165, 158, 152], tzone: [181.5, 173.8, 167.2], amp: 0.1, chroma: 0.03 };

/** A face with fine texture, for the quantisation-floor question at the dark end. */
const FINE: Face = { cheek: [200, 150, 138], tzone: [195, 154, 142], amp: 0.03, chroma: 0.01 };

const UNSATURATED_TARGETS = [70, 80, 100, 120, 140, 160, 170];

/**
 * The three signals `buildSignals` had when cycle 13 measured the silent window.
 * Cycle 14 added a fourth, 노출 여유, which closes it — so the cases below that
 * located the window have to keep asking the OLD question ("would these three have
 * caught it?") to stay the measurement they were, and ask the new one separately.
 */
const PRE_CYCLE_14 = ["조명", "반사", "피부 영역"];
const silentUnder = (labels: string[], reads: ReturnType<typeof capture>) =>
  labels.every((label) => reads.signals.find((s) => s.label === label)?.ok !== false);

describe("relRedness and cov do not scale with capture brightness", () => {
  it("holds both indices flat across the band where no channel saturates", () => {
    for (const [name, face] of [["clipping-prone", CLIPPING], ["headroom", HEADROOM]] as Array<[string, Face]>) {
      const reds: number[] = [];
      const covs: number[] = [];
      for (const target of UNSATURATED_TARGETS) {
        const reads = capture(face, target);
        expect(reads.signals.filter((s) => !s.ok), `${name} at cheekL ${target}`).toHaveLength(0);
        expect(clippedRedFraction(face, target), `${name} at cheekL ${target} already clips`).toBe(0);
        reds.push(reads.raw.relRedness);
        covs.push(reads.raw.cov);
      }
      // Measured spread over cheekL 71.2..172.8, a 2.4x exposure range: cov 1.0092 on
      // both faces, relRedness 1.0587 and 1.0423. What is left of either is 8-bit
      // rounding of the painted channel values, and it is scatter rather than a trend.
      if (process.env.ARU_PRINT_AXIS_SWEEP) process.stdout.write(`SWEEP ${name} cheekL ${capture(face, UNSATURATED_TARGETS[0]).raw.cheekL.toFixed(1)}..${capture(face, UNSATURATED_TARGETS[UNSATURATED_TARGETS.length - 1]).raw.cheekL.toFixed(1)} cov spread ${spread(covs).toFixed(4)} relRedness spread ${spread(reds).toFixed(4)}\n`);
      expect(spread(covs), `${name} cov ${covs.map((v) => v.toFixed(5)).join(" ")}`).toBeLessThan(1.02);
      expect(spread(reds), `${name} relRedness ${reds.map((v) => v.toFixed(5)).join(" ")}`).toBeLessThan(1.08);
    }
  });

  it("publishes one redness level and one pores level across that band", () => {
    for (const [name, face] of [["clipping-prone", CLIPPING], ["headroom", HEADROOM]] as Array<[string, Face]>) {
      const redness = UNSATURATED_TARGETS.map((t) => capture(face, t).redness.value);
      const pores = UNSATURATED_TARGETS.map((t) => capture(face, t).pores.value);
      expect(new Set(redness).size, `${name} published ${redness.join("/")}`).toBe(1);
      expect(new Set(pores).size, `${name} published ${pores.join("/")}`).toBe(1);
    }
  });

  it("keeps the oil control invariant on the same fixture, as cycle 12 left it", () => {
    const shines = UNSATURATED_TARGETS.map((t) => capture(OIL, t).raw.shine);
    const levels = UNSATURATED_TARGETS.map((t) => capture(OIL, t).oil.value);
    expect(shines.every((s) => s > 0), shines.join(" ")).toBe(true);
    if (process.env.ARU_PRINT_AXIS_SWEEP) process.stdout.write(`SWEEP oil control spread ${spread(shines).toFixed(4)} ${shines.map((v) => v.toFixed(5)).join(" ")}\n`);
    expect(spread(shines), `oil ${shines.map((v) => v.toFixed(5)).join(" ")}`).toBeLessThan(1.08);
    expect(new Set(levels).size, `oil published ${levels.join("/")}`).toBe(1);
  });

  it("still loses the pores level to the 8-bit ceiling, and 노출 여유 is now the signal that says so", () => {
    // Cycle 13's finding, kept as it was measured, with cycle 14's fix pinned on top.
    // The physics is unchanged and is NOT a normalisation defect: at cheekL 190.7 the
    // red channel of 25.9% of the cheek patch is pinned at 255; clipping removes the top
    // of the luminance distribution, the variance falls, and `cov` falls with it.
    // What changed is that the capture is no longer published in silence. The three
    // signals cycle 13 measured — 조명 (cheekL <= 210), 반사 (T-zone luminance > 218)
    // and 피부 영역 — still all pass, because none of them looks at a saturated CHEEK
    // channel. 노출 여유 does.
    const reads = capture(CLIPPING, 188);
    expect(clippedRedFraction(CLIPPING, 188)).toBeGreaterThan(0.2);
    expect(reads.raw.cheekClipped).toBeGreaterThan(0.2);
    expect(PRE_CYCLE_14.filter((label) => !reads.signals.find((s) => s.label === label)?.ok)).toEqual([]);
    expect(reads.signals.filter((s) => !s.ok).map((s) => s.label)).toEqual(["노출 여유"]);
    expect(reads.retakeRecommended, "a failed signal must force a retake").toBe(true);
    const reference = capture(CLIPPING, 140);
    expect(levelOf("pores", reference.raw.cov)).toBe(1);
    expect(levelOf("pores", reads.raw.cov)).toBe(0);
    expect(reads.raw.cov).toBeLessThan(reference.raw.cov);
  });

  it("puts that loss on the pixel headroom and not on the exposure", () => {
    // The control: identical texture amplitude and an equal relRedness, swept over the
    // identical exposures. It does not clip at cheekL 190.7 and it does not drift, so the
    // difference between the two faces is how much room the red channel had, not how
    // bright the photo was. Break the normalisation in lib/skin.ts and BOTH faces
    // drift, which is what makes this the case that separates the two explanations.
    expect(clippedRedFraction(HEADROOM, 188)).toBe(0);
    const held = capture(HEADROOM, 188);
    const reference = capture(HEADROOM, 140);
    expect(levelOf("pores", held.raw.cov)).toBe(levelOf("pores", reference.raw.cov));
    expect(held.raw.cov / reference.raw.cov, `${reference.raw.cov} -> ${held.raw.cov}`).toBeGreaterThan(0.99);
    expect(held.raw.cov / reference.raw.cov).toBeLessThan(1.01);
    // Both faces carry the same relRedness at the reference exposure, so the clipping
    // face's redness drop is not a property of being a redder face.
    expect(capture(CLIPPING, 140).raw.relRedness).toBeCloseTo(reference.raw.relRedness, 3);
    expect(capture(CLIPPING, 188).raw.relRedness).toBeLessThan(held.raw.relRedness);
  });

  it("finds the quantisation floor at the dark end, three cuts below anything that matters", () => {
    // The brief's question. At low exposure the 8-bit values compress, so `texture` has
    // fewer distinct levels to work with. It is real, it is in the direction theory
    // predicts, and it is tiny: rounding to 8 bits adds a variance of 1/12 count^2 to
    // the region luminance whatever the exposure, so it inflates `cov` by
    // sqrt(1 + (0.289 / cheekTexture)^2) and that term shrinks as the exposure rises.
    // On a face at the pores cut it is invisible. On a face with sub-count texture it
    // is a few percent, and `cov` is still 6x below the 0.085 cut.
    const dark = [66, 70, 75];
    const bright = [140, 152, 160, 170];
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    const atCut = [...dark, 80, 90, 100, 120, ...bright].map((t) => capture(CLIPPING, t).raw.cov);
    expect(spread(atCut), `at the cut: ${atCut.map((v) => v.toFixed(5)).join(" ")}`).toBeLessThan(1.02);
    expect(new Set([...dark, ...bright].map((t) => capture(CLIPPING, t).pores.value)).size).toBe(1);

    const fineDark = mean(dark.map((t) => capture(FINE, t).raw.cov));
    const fineBright = mean(bright.map((t) => capture(FINE, t).raw.cov));
    expect(capture(FINE, 66).raw.cheekTexture, "FINE texture at cheekL 66").toBeLessThan(1);
    if (process.env.ARU_PRINT_AXIS_SWEEP) process.stdout.write(`SWEEP fine dark ${fineDark.toFixed(6)} bright ${fineBright.toFixed(6)} ratio ${(fineDark / fineBright).toFixed(4)}; texture ${capture(FINE, 66).raw.cheekTexture.toFixed(4)} -> ${capture(FINE, 170).raw.cheekTexture.toFixed(4)}\n`);
    expect(fineDark, `${fineDark} vs ${fineBright}`).toBeGreaterThan(fineBright);
    expect(fineDark / fineBright, `${fineDark} vs ${fineBright}`).toBeLessThan(1.05);
    // Three levels of headroom: the inflated dark reading is still far under the cut.
    expect(fineDark * 4).toBeLessThan(ATTR_THRESHOLDS.pores[0]);
    expect(new Set([...dark, ...bright].map((t) => capture(FINE, t).pores.value)).size).toBe(1);
  });

  it("opens that silent window only above R/L 1.17, which is where skin is claimed to sit", () => {
    // Supervisor addition, 2026-09-18. CLIPPING and HEADROOM are two points; the number
    // the finding actually rests on is WHERE between them the window opens, because the
    // only reason this matters off the fixture is the claim that skin sits near it.
    // Faces are built at a fixed cheek luminance and a fixed green/blue shape, so R/L is
    // the only thing that moves. "Silent" = every capture signal ok.
    const L = lumOf(CLIPPING.cheek);
    const faceAtRL = (rl: number): Face => {
      const r = rl * L;
      const bOverG = CLIPPING.cheek[2] / CLIPPING.cheek[1];
      const g = (L - 0.299 * r) / (0.587 + 0.114 * bOverG);
      const cheek = [r, g, g * bOverG];
      return { ...CLIPPING, cheek, tzone: cheek.map((v) => v * (lumOf(CLIPPING.tzone) / L)) };
    };
    // The worst pores reading reachable at an exposure no signal rejects. Evaluated
    // under BOTH signal sets: `PRE_CYCLE_14` is what cycle 13 measured with, and is
    // what keeps this case the measurement it was; the full set is what ships.
    const worstSilentCov = (face: Face, labels: string[]) => {
      let worst = Infinity;
      for (let target = 160; target <= 210; target += 2) {
        const reads = capture(face, target);
        if (!silentUnder(labels, reads)) continue;
        worst = Math.min(worst, reads.raw.cov);
      }
      return worst;
    };
    const ALL = ["조명", "반사", "피부 영역", "노출 여유"];
    const rows = [1.10, 1.14, 1.17, 1.20, 1.223].map((rl) => {
      const face = faceAtRL(rl);
      const reference = capture(face, 160).raw.cov;
      const worst = worstSilentCov(face, PRE_CYCLE_14);
      const worstNow = worstSilentCov(face, ALL);
      return {
        rl,
        reference,
        worst,
        worstNow,
        flips: levelOf("pores", worst) !== levelOf("pores", reference),
        flipsNow: levelOf("pores", worstNow) !== levelOf("pores", reference),
      };
    });
    if (process.env.ARU_PRINT_AXIS_SWEEP) {
      for (const row of rows) {
        process.stdout.write(
          `SWEEP R/L ${row.rl.toFixed(3)} cov@160 ${row.reference.toFixed(5)} worst-silent(3) ${row.worst.toFixed(5)} ${row.flips ? "FLIPS" : "holds"} | worst-silent(4) ${row.worstNow.toFixed(5)} ${row.flipsNow ? "FLIPS" : "holds"}\n`
        );
      }
    }
    // Every face reads the same at the reference exposure: R/L alone is what differs.
    for (const row of rows) expect(levelOf("pores", row.reference), `R/L ${row.rl}`).toBe(1);
    // Measured under the three signals cycle 13 had: holds through 1.17, flips at 1.20
    // and above. The repository's own long-standing skin fixture [196, 152, 140] is
    // R/L 1.1967 — a fixture, not a measurement of anyone's skin, and it lands inside
    // that 1.17..1.20 band. Which side of it real captures fall on is still unknown
    // until the golden set exists; what cycle 14 changed is that it no longer decides
    // whether a level moves in silence.
    expect(rows.filter((r) => !r.flips).map((r) => r.rl)).toEqual([1.10, 1.14, 1.17]);
    expect(rows.filter((r) => r.flips).map((r) => r.rl)).toEqual([1.20, 1.223]);
    // And with 노출 여유 in the set, the window is closed at every R/L in the sweep:
    // no exposure that all four signals accept moves the published pores level.
    expect(rows.filter((r) => r.flipsNow).map((r) => r.rl)).toEqual([]);
    // Closed by REFUSING those captures, not by reading them differently — the worst
    // reading the old set accepted is strictly below the worst the new set accepts on
    // exactly the faces that used to flip.
    for (const row of rows.filter((r) => r.flips)) {
      expect(row.worst, `R/L ${row.rl}`).toBeLessThan(row.worstNow);
    }
  });

  it("still orders faces on both axes at one exposure", () => {
    // Invariance is only worth having if the indices still separate faces.
    const reds = [[196, 154, 141], [195, 154, 142], [193, 156, 142], [188, 158, 144]].map(
      (tzone) => capture({ ...CLIPPING, tzone }, 140).raw.relRedness
    );
    for (let i = 1; i < reds.length; i += 1) expect(reds[i], reds.join(" ")).toBeGreaterThan(reds[i - 1]);

    const covs = [0.05, 0.1, 0.19, 0.3].map((amp) => capture({ ...CLIPPING, amp }, 140).raw.cov);
    for (let i = 1; i < covs.length; i += 1) expect(covs[i], covs.join(" ")).toBeGreaterThan(covs[i - 1]);
  });

  // The sweep behind the table in docs/label-free-axes.md, committed so the numbers are
  // re-runnable rather than resting on a script nobody kept — the convention cycle 5's
  // ARU_PRINT_SCALE_SWEEP block and cycle 12's ARU_PRINT_SHINE_SWEEP set:
  //   ARU_PRINT_AXIS_SWEEP=1 npx vitest run tests/axis-exposure-scale.test.ts
  it("prints the sweep the doc tabulates", () => {
    if (!process.env.ARU_PRINT_AXIS_SWEEP) return;
    const write = (line: string) => process.stdout.write(`SWEEP ${line}\n`);
    write(`redness cuts ${ATTR_THRESHOLDS.redness.join(" / ")}; pores cuts ${ATTR_THRESHOLDS.pores.join(" / ")}; oil cuts ${ATTR_THRESHOLDS.oil.join(" / ")}`);
    write(`조명 band ${LIGHTING_BAND.join("..")}; unsaturated band ${UNSATURATED_BAND.join("..")}`);
    const faces: Array<[string, Face]> = [
      ["CLIPPING  cheek 200/150/138  R/L 1.223", CLIPPING],
      ["HEADROOM  cheek 176/154/148  R/L 1.101", HEADROOM],
      ["OIL       tzone 1.10x cheek", OIL],
      ["FINE      amp 0.03", FINE],
    ];
    for (const [name, face] of faces) {
      write(name);
      write("cheekL\tR=255\trelRed\tlvl\tcov\tlvl\tshine\tlvl\tfailed");
      for (const target of [66, 70, 80, 100, 120, 140, 160, 175, 182, 188, 195, 200, 205, 210]) {
        const reads = capture(face, target);
        const failed = reads.signals.filter((s) => !s.ok).map((s) => s.label).join(",") || "-";
        write(
          [
            reads.raw.cheekL.toFixed(1),
            `${(clippedRedFraction(face, target) * 100).toFixed(1)}%`,
            reads.raw.relRedness.toFixed(5), levelOf("redness", reads.raw.relRedness),
            reads.raw.cov.toFixed(5), levelOf("pores", reads.raw.cov),
            reads.raw.shine.toFixed(5), levelOf("oil", reads.raw.shine),
            failed,
          ].join("\t")
        );
      }
    }
  });
});
