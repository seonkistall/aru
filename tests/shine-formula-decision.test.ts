import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSkin, sampleRegion, shineIndex, ATTR_THRESHOLDS, SAMPLING_LANDMARKS } from "@/lib/skin";

/**
 * Which of the two `shine` formulas the product should use — measured, on faces.
 *
 * Until 2026-09-19 `ml/skin_indices.py:shine_ratio` was
 * `tzone_specular / max(cheek_specular, 1e-6)` while `lib/skin.ts` computed
 * `tzoneSpecular + Weber contrast of the T-zone against the cheek`, and `FEATURE_KEY`
 * declared the two to be one field. The backlog item said deciding between them is a
 * measurement rather than a rename. This file is that measurement, kept so the
 * decision can be re-run instead of re-argued, and so it cannot be quietly reversed.
 *
 * The rejected form is reproduced here, inline and named as rejected, because a
 * measurement of what a formula does needs the formula. It is not exported, not
 * imported by anything, and exists only in this file.
 *
 *   ARU_PRINT_SHINE_DECISION=1 npx vitest run tests/shine-formula-decision.test.ts
 *
 * reprints both tables in docs/shine-formula-decision.md verbatim.
 */

type LM = { x: number; y: number; z?: number };
const TZONE = SAMPLING_LANDMARKS.tzone;
const CHEEKS = SAMPLING_LANDMARKS.cheeks;
const CHIN = [18, 200, 199, 175, 152, 83, 313];
const W = 200;
const H = 200;
const SKIN: [number, number, number] = [196, 152, 140];
const luminance = (c: [number, number, number]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const EPSILON = 1e-6;

/** The formula this cycle rejected, exactly as ml/skin_indices.py carried it. */
function rejectedShineRatio(tzoneSpecular: number, cheekSpecular: number): number {
  return tzoneSpecular / Math.max(cheekSpecular, EPSILON);
}

const [OIL_LO, OIL_HI] = ATTR_THRESHOLDS.oil;
const oilLevel = (shine: number) => (shine < OIL_LO ? 0 : shine < OIL_HI ? 1 : 2);

function landmarks(): LM[] {
  const lms: LM[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const i of TZONE) lms[i] = { x: 0.5, y: 0.3, z: 0 };
  for (const i of CHEEKS) lms[i] = { x: 0.5, y: 0.7, z: 0 };
  for (const i of CHIN) lms[i] = { x: 0.5, y: 0.85, z: 0 };
  return lms;
}
const LMS = landmarks();

function paintFrame(
  tz: [number, number, number],
  ck: [number, number, number],
  tzGlint: number,
  ckGlint: number,
): ImageData {
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
  // Every T-zone landmark sits at (0.5, 0.3) and every cheek landmark at (0.5, 0.7),
  // so each region is one 81-pixel patch and painting n of them above the 218 cut
  // gives that region a specular ratio of exactly n/81.
  const paint = (cx: number, cy: number, n: number) => {
    let done = 0;
    for (let y = cy - 4; y <= cy + 4 && done < n; y += 1) {
      for (let x = cx - 4; x <= cx + 4 && done < n; x += 1) {
        const o = (y * W + x) * 4;
        data[o] = 250;
        data[o + 1] = 250;
        data[o + 2] = 250;
        done += 1;
      }
    }
  };
  paint(100, 60, tzGlint);
  paint(100, 140, ckGlint);
  return { data, width: W, height: H } as unknown as ImageData;
}

/** One capture: the app's reading, plus the cheek specular ratio the rejected form needed. */
function capture(cheekTarget: number, contrast: number, tzGlint: number, ckGlint: number) {
  const gain = cheekTarget / luminance(SKIN);
  const cheek = SKIN.map((v) => Math.round(v * gain)) as [number, number, number];
  const tzone = cheek.map((v) => Math.min(255, Math.round(v * contrast))) as [number, number, number];
  const image = paintFrame(tzone, cheek, tzGlint, ckGlint);
  const reads = analyzeSkin(image, LMS);
  expect(reads, `cheekL ${cheekTarget} contrast ${contrast} produced no reading`).not.toBeNull();
  // The SHIPPED sampler on the SHIPPED cheek landmark list — the rejected form's second
  // input is not an exported field, so this is the only honest way to obtain it.
  const cheeks = sampleRegion(image.data, W, H, LMS, CHEEKS);
  expect(cheeks).not.toBeNull();
  const app = reads!.raw.shine;
  const rejected = rejectedShineRatio(reads!.raw.tzoneSpecular, cheeks!.specularRatio);
  return { raw: reads!.raw, signals: reads!.signals, cheekSpecular: cheeks!.specularRatio, app, rejected };
}

/**
 * A face whose T-zone and cheek each carry a ramp of highlight brightness, so the
 * fraction of each patch above the 218 cut responds to exposure the way a real capture
 * does instead of being painted on or off. This is the fixture the exposure case needs:
 * with flat painted glints the specular ratio is a constant by construction, which is
 * exactly the assumption that made the rejected form look exposure-invariant.
 */
function rampCapture(cheekTarget: number, contrast: number) {
  const gain = cheekTarget / luminance(SKIN);
  const data = new Uint8ClampedArray(W * H * 4);
  const ck = SKIN.map((v) => v * gain) as [number, number, number];
  const tz = ck.map((v) => v * contrast) as [number, number, number];
  for (let y = 0; y < H; y += 1) {
    const base = y < 100 ? tz : ck;
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      data[i] = Math.min(255, Math.round(base[0]));
      data[i + 1] = Math.min(255, Math.round(base[1]));
      data[i + 2] = Math.min(255, Math.round(base[2]));
      data[i + 3] = 255;
    }
  }
  const ramp = (cx: number, cy: number, base: [number, number, number], top: number) => {
    let k = 0;
    for (let y = cy - 4; y <= cy + 4; y += 1) {
      for (let x = cx - 4; x <= cx + 4; x += 1) {
        const f = 1 + (top - 1) * (k / 80);
        const o = (y * W + x) * 4;
        data[o] = Math.min(255, Math.round(base[0] * f));
        data[o + 1] = Math.min(255, Math.round(base[1] * f));
        data[o + 2] = Math.min(255, Math.round(base[2] * f));
        k += 1;
      }
    }
  };
  ramp(100, 60, tz, 1.45);
  ramp(100, 140, ck, 1.3);
  const image = { data, width: W, height: H } as unknown as ImageData;
  const reads = analyzeSkin(image, LMS);
  expect(reads, `ramp cheekL ${cheekTarget} produced no reading`).not.toBeNull();
  const cheeks = sampleRegion(image.data, W, H, LMS, CHEEKS);
  expect(cheeks).not.toBeNull();
  return {
    raw: reads!.raw,
    failed: reads!.signals.filter((signal) => !signal.ok).map((signal) => signal.label),
    cheekSpecular: cheeks!.specularRatio,
    app: reads!.raw.shine,
    rejected: rejectedShineRatio(reads!.raw.tzoneSpecular, cheeks!.specularRatio),
  };
}

/** The oil range, at a correctly-exposed cheek. */
const OIL_SWEEP: Array<[number, number, number]> = [];
for (const contrast of [1.0, 1.08, 1.2]) {
  for (const tzGlint of [0, 2, 8, 20, 40]) for (const ckGlint of [0, 1, 2, 5]) OIL_SWEEP.push([contrast, tzGlint, ckGlint]);
}
const EXPOSURE_SWEEP = [80, 100, 120, 140, 160, 180, 200];

describe("the rejected form is degenerate where the product lives", () => {
  it("has no denominator at all on a matte cheek, so the epsilon sets the scale", () => {
    // A correctly-exposed matte cheek has NO pixel above the specular cut. Not "few":
    // exactly zero, which is what makes the division a division by the epsilon.
    const matte = capture(140, 1.08, 2, 0);
    expect(matte.cheekSpecular).toBe(0);
    expect(matte.raw.tzoneSpecular).toBeCloseTo(2 / 81, 12);
    // tzoneSpecular / 1e-6 — the face contributes the numerator and 1e-6 the rest.
    expect(matte.rejected).toBeCloseTo((2 / 81) * 1e6, 3);
    expect(matte.app).toBeCloseTo(0.06735703578329305, 12);
  });

  it("moves by a factor of 12,345.7 when one cheek pixel in 81 crosses the cut", () => {
    // The same face, one pixel different. This is the discontinuity: not a sensitivity
    // that could be calibrated away, a cliff at the only cheek state a good capture has.
    const matte = capture(140, 1.08, 2, 0);
    const onePixel = capture(140, 1.08, 2, 1);
    expect(onePixel.cheekSpecular).toBeCloseTo(1 / 81, 12);
    expect(matte.raw.tzoneSpecular).toBe(onePixel.raw.tzoneSpecular);
    // (1 / 1e-6) / 81 exactly: the epsilon is six orders of magnitude below the
    // smallest specular ratio a patch of 81 pixels can report that is not zero.
    expect(matte.rejected / onePixel.rejected).toBeCloseTo(12345.679012345681, 9);
    // The app's index does not move at all: one cheek pixel is not oil.
    expect(onePixel.app).toBe(matte.app);
  });

  it("reads an oilier face as less oily, which is the wrong sign for the axis", () => {
    // Hold the T-zone and add oil to the cheek. An all-over-oily face reads matte,
    // because a T-zone-against-cheek ratio measures where the oil is, not how much.
    const series = [0, 1, 2, 5].map((ckGlint) => capture(140, 1.08, 8, ckGlint));
    for (let i = 1; i < series.length; i += 1) {
      expect(series[i].rejected, `cheek glint ${i}`).toBeLessThan(series[i - 1].rejected);
      // The app's index is flat here rather than falling: the cheek's own glints are
      // not part of it. Flat is defensible, falling is not.
      expect(series[i].app).toBe(series[0].app);
    }
    expect(series[3].rejected).toBeLessThan(series[0].rejected / 1000);
  });

  it("cannot see the brightness gap at all, which is most of the oil signal", () => {
    // Three faces with no glint anywhere, differing only in how much brighter the
    // T-zone is than the cheek — the ordinary way an oily forehead presents. The app
    // separates them and publishes two different levels; the rejected form returns
    // exactly 0 for all three, because 0 / 1e-6 is 0.
    const gaps = [1.0, 1.08, 1.2].map((contrast) => capture(140, contrast, 0, 0));
    for (const face of gaps) {
      expect(face.raw.tzoneSpecular).toBe(0);
      expect(face.rejected).toBe(0);
      expect(oilLevel(face.rejected)).toBe(0);
    }
    expect(gaps[0].app).toBeLessThan(gaps[1].app);
    expect(gaps[1].app).toBeLessThan(gaps[2].app);
    expect(new Set(gaps.map((face) => oilLevel(face.app))).size).toBeGreaterThan(1);
  });

  it("publishes only the two outer levels over the whole oil range", () => {
    // ATTR_THRESHOLDS.oil cuts at 0.05 and 0.16. The rejected form's scale has nothing
    // to do with those numbers, so its middle band is unreachable: to land in it the
    // cheek would have to be 6 to 20 times oilier than the T-zone. The app uses all
    // three levels over the same sweep.
    const levels = OIL_SWEEP.map(([contrast, tz, ck]) => capture(140, contrast, tz, ck));
    const rejectedLevels = new Set(levels.map((face) => oilLevel(face.rejected)));
    const appLevels = new Set(levels.map((face) => oilLevel(face.app)));
    expect([...rejectedLevels].sort()).toEqual([0, 2]);
    expect([...appLevels].sort()).toEqual([0, 1, 2]);
  });
});

describe("the exposure invariance the rejected form was asserted to have", () => {
  it("does not survive contact with a frame", () => {
    // ml/selftest.py asserted shine_ratio(0.30, 0.10) == shine_ratio(0.51, 0.17):
    // true of two numbers that both scale, and a specular ratio does not scale. It is
    // the share of a patch above a FIXED 218 cut, so an exposure gain moves it by
    // however many pixels happen to cross — a different amount in each region.
    const swept = EXPOSURE_SWEEP.map((cheekTarget) => rampCapture(cheekTarget, 1.1));
    const accepted = swept.filter((face) => face.failed.length === 0);
    expect(accepted.length).toBeGreaterThanOrEqual(4);

    // Across the captures every signal accepts, on ONE face at one relative structure.
    const rejectedRange = accepted.map((face) => face.rejected);
    expect(Math.min(...rejectedRange)).toBe(0);
    expect(Math.max(...rejectedRange)).toBeGreaterThan(40000);

    // The app's index over the same accepted captures: the three that share a specular
    // state hold within a fraction of a percent, and the fourth moves because the
    // T-zone genuinely started to glint, which is oil.
    const flat = accepted.filter((face) => face.raw.tzoneSpecular === 0).map((face) => face.app);
    expect(flat.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...flat) / Math.min(...flat)).toBeLessThan(1.005);
  });

  it("holds only where both inputs scale, which no exposure change does", () => {
    // The algebraic identity itself, stated so the replacement's narrower claim is
    // visible next to it: the rejected form cancels a factor applied to BOTH specular
    // ratios, and that is not what an exposure gain is.
    expect(rejectedShineRatio(0.3, 0.1)).toBeCloseTo(3, 12);
    expect(rejectedShineRatio(0.3 * 1.7, 0.1 * 1.7)).toBeCloseTo(3, 12);
    // What the surviving form claims instead: the gap term is Weber contrast, so a
    // gain on both luminances cancels exactly, and the specular term is passed through.
    const base = shineIndex(0.3, 168, 140);
    for (const gain of [0.5, 1.7, 3]) expect(shineIndex(0.3, 168 * gain, 140 * gain)).toBeCloseTo(base, 12);
  });
});

describe("what the decision rests on besides the numbers", () => {
  it("records that the rejected form's second input was never an ARU field", () => {
    // `cheek_specular` had no source. SkinRawFeatures carries the T-zone's specular
    // ratio and no cheek counterpart, so the rejected form could not be computed from
    // an export at all — this file had to reach for `sampleRegion` to measure it.
    const skinTs = readFileSync(resolve(import.meta.dirname, "..", "lib/skin.ts"), "utf8");
    const rawType = skinTs.slice(skinTs.indexOf("export type SkinRawFeatures"), skinTs.indexOf("export type ConfidenceSignal"));
    expect(rawType).toContain("tzoneSpecular: number");
    expect(rawType).not.toContain("cheekSpecular");
  });

  it("records that no pipeline script ever called it", () => {
    // run_pipeline.py and calibrate.py read the app's `shine` column straight out of
    // the export. So the Python function was a declaration of what the index IS, and
    // the declaration was the thing that was wrong.
    for (const file of ["run_pipeline.py", "calibrate.py", "prepare_crop_dataset.py"]) {
      const source = readFileSync(resolve(import.meta.dirname, "..", "ml", file), "utf8");
      expect(source, `${file} calls shine_ratio`).not.toContain("shine_ratio(");
    }
  });

  it("pins ml/skin_indices.py to the app's inputs", () => {
    const python = readFileSync(resolve(import.meta.dirname, "..", "ml/skin_indices.py"), "utf8");
    expect(python).toContain("def shine_ratio(tzone_specular: float, tzone_luminance: float, cheek_luminance: float) -> float:");
    expect(python).toContain("SHINE_REFERENCE_CHEEK_L = 140.0");
    expect(python).toContain("return tzone_specular + gap * (SHINE_REFERENCE_CHEEK_L / 255.0)");
    // The rejected division, as a line of code rather than as a mention of it: the
    // docstring names the old form on purpose and must stay free to.
    expect(python).not.toContain("return tzone_specular / denominator");
  });

  it("prints the tables the doc tabulates", () => {
    if (!process.env.ARU_PRINT_SHINE_DECISION) return;
    const write = (line: string) => process.stdout.write(`DECISION ${line}\n`);
    write(`oil cuts ${OIL_LO} / ${OIL_HI}; epsilon ${EPSILON}`);
    write("");
    write("A. the oil range at cheekL 140, all captures the signals accept");
    write("tzoneL/cheekL  tzGlint  ckGlint   tzSpec    ckSpec     app shine  lvl      rejected  lvl");
    for (const [contrast, tzGlint, ckGlint] of OIL_SWEEP) {
      const face = capture(140, contrast, tzGlint, ckGlint);
      write(
        `${contrast.toFixed(2).padStart(11)}  ${String(tzGlint).padStart(7)}  ${String(ckGlint).padStart(7)}  ` +
          `${face.raw.tzoneSpecular.toFixed(6)}  ${face.cheekSpecular.toFixed(6)}  ` +
          `${face.app.toFixed(6).padStart(10)}  ${oilLevel(face.app)}  ` +
          `${face.rejected.toExponential(4).padStart(12)}  ${oilLevel(face.rejected)}`,
      );
    }
    write("");
    write("B. one face, ramped highlights, swept across the 조명 band");
    write("cheekL   tzSpec    ckSpec     app shine     rejected  signals failed");
    for (const cheekTarget of EXPOSURE_SWEEP) {
      const face = rampCapture(cheekTarget, 1.1);
      write(
        `${face.raw.cheekL.toFixed(1).padStart(6)}  ${face.raw.tzoneSpecular.toFixed(6)}  ${face.cheekSpecular.toFixed(6)}  ` +
          `${face.app.toFixed(6).padStart(10)}  ${face.rejected.toExponential(4).padStart(12)}  ` +
          `${face.failed.join(",") || "-"}`,
      );
    }
  });
});
