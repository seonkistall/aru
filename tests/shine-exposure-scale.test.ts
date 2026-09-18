import { describe, expect, it } from "vitest";
import { analyzeSkin, ATTR_THRESHOLDS } from "@/lib/skin";

/**
 * `shine` must not depend on how bright the capture was.
 *
 * It is the oil axis's only feature and the one docs/label-free-axes.md lists as
 * within_image. Its first term, the T-zone specular ratio, always was one. Its second
 * term was `max(0, (tzoneL - cheekL) / 255)` — a luminance difference over a constant,
 * not over the capture — so a face whose T-zone is a fixed percentage brighter than its
 * cheeks read a larger oil index the brighter the photo was, and past a point published
 * a different oil level for it. The two other published features never had this: `cov`
 * divides by `cheekL` and `relRedness` is a difference of two ratios.
 *
 * The term is now Weber contrast against the cheek, scaled by
 * SHINE_REFERENCE_CHEEK_L / 255 so the cuts in ATTR_THRESHOLDS.oil keep meaning what
 * they meant on a correctly-exposed capture. The scale factor is not what makes the
 * index invariant — the ratio is — so these cases test the invariance separately from
 * the calibration.
 */

type LM = { x: number; y: number; z?: number };

// Region index lists copied from lib/skin.ts, as tests/retake-signal-rule.test.ts does.
const TZONE = [9, 8, 107, 336, 151, 10, 67, 297, 1, 4, 5, 195, 197];
const CHEEKS = [50, 101, 118, 117, 116, 205, 36, 280, 330, 347, 346, 345, 425, 266];
const CHIN = [18, 200, 199, 175, 152, 83, 313];

const W = 200;
const H = 200;

/** The reference cheek luminance in lib/skin.ts, and the 조명 band it is the midpoint of. */
const REFERENCE_CHEEK_L = 140;
const LIGHTING_BAND: [number, number] = [70, 210];

const SKIN: [number, number, number] = [196, 152, 140];
const luminance = (c: [number, number, number]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

/** Top band is T-zone skin, bottom band is cheek skin, plus an optional T-zone glint. */
function bandFrame(tz: [number, number, number], ck: [number, number, number], glintPixels = 0): ImageData {
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
  // The T-zone landmarks all sit at (0.5, 0.3), so every one samples the same 9x9
  // patch at x,y in 96..104 / 56..64. Painting n of those 81 pixels above the
  // specular cut gives a specular ratio of n/81 exactly.
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

/**
 * One face at one exposure. `contrast` is the T-zone/cheek luminance RATIO, which is
 * the thing an exposure change leaves alone — so holding it fixed while moving
 * `cheekL` is exactly the sweep that isolates the defect.
 */
function capture(cheekTarget: number, contrast: number, glintPixels = 0) {
  const gain = cheekTarget / luminance(SKIN);
  const cheek = SKIN.map((v) => Math.round(v * gain)) as [number, number, number];
  const tzone = cheek.map((v) => Math.min(255, Math.round(v * contrast))) as [number, number, number];
  const reads = analyzeSkin(bandFrame(tzone, cheek, glintPixels), landmarks());
  expect(reads, `cheekL ${cheekTarget} contrast ${contrast} produced no reading`).not.toBeNull();
  return reads!;
}

/** What `shine` was before this change, recovered from the raw fields the reading carries. */
function shineBeforeNormalisation(raw: { tzoneSpecular: number; tzoneL: number; cheekL: number }) {
  return raw.tzoneSpecular + Math.max(0, (raw.tzoneL - raw.cheekL) / 255);
}

/** T-zone/cheek luminance ratio, and the cheek luminances it can be held at. */
const EXPOSURE_SWEEP: Array<[number, number[]]> = [
  [1.04, [80, 120, 160, 200]],
  [1.08, [80, 120, 160, 200]],
  [1.15, [80, 120, 160, 180]],
  [1.3, [80, 100, 120, 160]],
];

const [OIL_LO, OIL_HI] = ATTR_THRESHOLDS.oil;
const oilLevel = (shine: number) => (shine < OIL_LO ? 0 : shine < OIL_HI ? 1 : 2);

describe("shine does not scale with capture brightness", () => {
  it("reads the same oil level at both ends of the 조명 band on one face", () => {
    // 1.08 is the brief's case: a T-zone 8% brighter than the cheeks. Before the
    // change this face read 유분 적음 at cheekL 80 and 유분 약간 at cheekL 200, with
    // every capture signal passing at both ends, so nothing asked for a retake.
    // The 200 endpoint is dropped above contrast 1.08 and 180 above 1.15 on purpose,
    // and named rather than quietly trimmed: at those exposures the T-zone patch
    // itself crosses the 218 specular cut, so the 반사 signal fails and the capture is
    // a retake either way. The defect lives where all three signals pass.
    for (const [contrast, targets] of EXPOSURE_SWEEP) {
      const levels = targets.map((target) => {
        const reads = capture(target, contrast);
        expect(reads.signals.filter((signal) => !signal.ok), `contrast ${contrast} at cheekL ${target}`).toHaveLength(0);
        return reads.oil.value;
      });
      expect(new Set(levels).size, `contrast ${contrast} published ${levels.join(" / ")}`).toBe(1);
    }
  });

  it("holds the index itself within a few percent across a 2.5x exposure range", () => {
    for (const contrast of [1.04, 1.08]) {
      const dark = capture(80, contrast).raw;
      const bright = capture(200, contrast).raw;
      expect(dark.tzoneSpecular).toBe(0);
      expect(bright.tzoneSpecular).toBe(0);
      // Measured spread over this sweep is 0.935-0.956, and what is left of it is the
      // 8-bit rounding of the painted channel values, not the formula.
      const ratio = bright.shine / dark.shine;
      expect(ratio, `contrast ${contrast}: ${dark.shine} -> ${bright.shine}`).toBeGreaterThan(0.9);
      expect(ratio).toBeLessThan(1.1);
      // The term it replaced: same two captures, 2.3x apart.
      const before = shineBeforeNormalisation(bright) / shineBeforeNormalisation(dark);
      expect(before).toBeGreaterThan(2.3);
    }
  });

  it("keeps the reference exposure reading exactly what it read before", () => {
    // This is what lets ATTR_THRESHOLDS.oil stay at 0.05 / 0.16. At the reference
    // cheek luminance the two formulas agree for EVERY specular ratio and every
    // contrast, because the scale factor is exactly 140/255 there.
    expect(REFERENCE_CHEEK_L).toBe((LIGHTING_BAND[0] + LIGHTING_BAND[1]) / 2);
    for (const contrast of [1.0, 1.08, 1.2]) {
      for (const glint of [0, 8, 24, 49]) {
        const raw = capture(REFERENCE_CHEEK_L, contrast, glint).raw;
        const before = shineBeforeNormalisation(raw);
        expect(
          Math.abs(raw.shine - before),
          `contrast ${contrast} glint ${glint}: ${raw.shine} vs ${before}`
        ).toBeLessThan(1e-3);
        expect(oilLevel(raw.shine)).toBe(oilLevel(before));
      }
    }
  });

  it("puts the calibration in the index and not in the cuts, which is not the same thing", () => {
    // The alternative was to divide by cheekL alone and scale ATTR_THRESHOLDS.oil by
    // 255/140 to compensate. That is NOT equivalent: the cuts are compared against
    // `specularRatio + gap` and only the gap would have been rescaled, so a capture
    // whose oil reading is mostly specular would change bucket at the reference
    // exposure — the one exposure this change is supposed to leave alone.
    const scaled: [number, number] = [OIL_LO * (255 / REFERENCE_CHEEK_L), OIL_HI * (255 / REFERENCE_CHEEK_L)];
    // 5 of 81 T-zone pixels above the specular cut: a specular ratio of 0.0617,
    // between 0.05 and 0.0911, which is where the two disagree.
    const raw = capture(REFERENCE_CHEEK_L, 1.0, 5).raw;
    expect(raw.tzoneSpecular).toBeCloseTo(5 / 81, 6);
    expect(raw.shine).toBeCloseTo(raw.tzoneSpecular, 6);
    expect(oilLevel(raw.shine)).toBe(1);
    const underScaledCuts = raw.shine < scaled[0] ? 0 : raw.shine < scaled[1] ? 1 : 2;
    expect(underScaledCuts).toBe(0);
  });

  it("still reports more oil on a glossier T-zone at any one exposure", () => {
    // Invariance is only worth having if the index still orders faces. Four T-zone
    // contrasts at one exposure must come out strictly increasing.
    const shines = [1.0, 1.05, 1.1, 1.2].map((contrast) => capture(REFERENCE_CHEEK_L, contrast).raw.shine);
    for (let i = 1; i < shines.length; i += 1) {
      expect(shines[i], `${shines.join(" ")}`).toBeGreaterThan(shines[i - 1]);
    }
  });

  // The sweep behind the table in docs/label-free-axes.md, committed so the numbers
  // that chose the reference are re-runnable rather than resting on a script nobody
  // kept — the convention ml/tools/verify_tone_ita.py and cycle 5's
  // ARU_PRINT_SCALE_SWEEP block set:
  //   ARU_PRINT_SHINE_SWEEP=1 npx vitest run tests/shine-exposure-scale.test.ts
  it("prints the sweep the doc tabulates", () => {
    if (!process.env.ARU_PRINT_SHINE_SWEEP) return;
    const write = (line: string) => process.stdout.write(`SWEEP ${line}\n`);
    write(`oil cuts ${OIL_LO} / ${OIL_HI}; reference cheekL ${REFERENCE_CHEEK_L}; K = ${(REFERENCE_CHEEK_L / 255).toFixed(6)}`);
    for (const contrast of [1.04, 1.08, 1.15, 1.3]) {
      write(`tzoneL/cheekL = ${contrast}`);
      write("cheekL\ttzoneL\tspec\tbefore\tlvl\tafter\tlvl\t조명\t반사");
      for (const target of [70, 80, 100, 120, 140, 160, 180, 200, 210]) {
        const raw = capture(target, contrast).raw;
        const before = shineBeforeNormalisation(raw);
        write(
          [
            raw.cheekL.toFixed(1), raw.tzoneL.toFixed(1), raw.tzoneSpecular.toFixed(3),
            before.toFixed(4), oilLevel(before), raw.shine.toFixed(4), oilLevel(raw.shine),
            raw.cheekL >= LIGHTING_BAND[0] && raw.cheekL <= LIGHTING_BAND[1] ? "ok" : "FAIL",
            raw.tzoneSpecular < 0.1 ? "ok" : "FAIL",
          ].join("\t")
        );
      }
    }
  });
});
