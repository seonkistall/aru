import { describe, expect, it } from "vitest";
import { labAStar, redChromaticity, relativeRedness, SAMPLING_LANDMARKS } from "@/lib/skin";
import { sampleRegion } from "@/lib/skin";

/**
 * `relative_redness` had two formulas under one declared name. Which one the product
 * keeps, measured.
 *
 * Backlog item, noted 2026-09-19: `FEATURE_KEY` maps `relative_redness` to
 * `relRedness`, but `ml/skin_indices.py` returned a CIELAB **a\* difference** and
 * `lib/skin.ts` returns `rIdx(cheeks) - rIdx(tzone)`, a difference of **red
 * chromaticities**. Different colour space, different scale, one declared field. The
 * fourth index of this kind and the last with a genuine measurement behind it.
 *
 * The item stated the question and this file answers it: **which of an a\* difference
 * and a chromaticity difference is the more stable within-image quantity?** Not which
 * is more standard, and not which one the app happens to ship —
 * `docs/shine-formula-decision.md` exists because picking a side without measuring is
 * what created the `shine` split in the first place.
 *
 * Both forms are computed from the SAME two `sampleRegion` outputs of the SAME frame,
 * so nothing between them differs but the formula.
 *
 * ARU_PRINT_REDNESS_DECISION=1 npx vitest run tests/redness-formula-decision.test.ts
 *
 * What it found, and the two places it did NOT find what the decision wanted:
 *
 *  1. An a* difference is not scale-free. a* is homogeneous of degree 1/3 in the
 *     linear signal and the linear signal is degree 2.4 in the 8-bit channel, so a
 *     common gain g multiplies BOTH regions' a* by g^0.8 — and a difference of two
 *     things that both scale scales too. It factors out of the difference instead of
 *     cancelling in it. `holds the exponent` below checks that against the shipped
 *     code rather than asserting the algebra.
 *  2. Over the nuisances docs/label-free-axes.md names, the chromaticity difference
 *     wins by 24x (exposure), 11x (melanin tone) and 3.3x (white balance), measured as
 *     drift over the sweep against the index's own range over four faces of genuinely
 *     different redness. That ratio is the comparison that works across two different
 *     scales; a raw spread would reward whichever index sits further from zero.
 *  3. On the two TRANSFER-FUNCTION nuisances it is a tie, and the ties are kept rather
 *     than trimmed: a device tone curve costs both forms about 0.40 of their range and
 *     veiling flare about 0.18, with the a* form ahead by 3% on flare and behind by 4%
 *     on the curve. Neither form is invariant to a camera that is not linear, and
 *     nothing in this cycle makes one so. That is a limit of the redness axis, not an
 *     argument for either side.
 *
 * So the app's form is kept and the Python side moved onto it. No published value
 * changed: `ATTR_THRESHOLDS.redness`, `fallbackVersion` and the manifest are untouched,
 * because the app was already computing the form that won.
 */

type LM = { x: number; y: number; z?: number };
const TZONE = SAMPLING_LANDMARKS.tzone;
const CHEEKS = SAMPLING_LANDMARKS.cheeks;
const W = 200;
const H = 200;
const lumOf = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

/** Deterministic per-pixel value in [0, 1). Same hash as tests/axis-exposure-scale. */
function hash01(x: number, y: number, seed: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

type Face = { cheek: number[]; tzone: number[]; amp: number; chroma: number };

/**
 * A camera, as the four things that can sit between a face and an 8-bit frame. `gain`
 * and `wb` are multiplicative and `gamma`/`black` are not, which is the whole reason
 * the last two sweeps come out differently from the first three.
 */
type Camera = { gain?: number; wb?: number[]; gamma?: number; black?: number };

function render(face: Face, cam: Camera, seed = 7): Uint8ClampedArray {
  const gain = cam.gain ?? 1;
  const wb = cam.wb ?? [1, 1, 1];
  const gamma = cam.gamma ?? 1;
  const black = cam.black ?? 0;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    const base = y < 100 ? face.tzone : face.cheek;
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const n = 1 + face.amp * (2 * hash01(x, y, seed) - 1);
      for (let c = 0; c < 3; c += 1) {
        const j = 1 + face.chroma * (2 * hash01(x, y, seed + 31 * (c + 1)) - 1);
        let v = base[c] * n * j * gain * wb[c];
        if (gamma !== 1) v = 255 * Math.pow(Math.min(1, v / 255), gamma);
        v += black;
        data[i + c] = Math.round(v);
      }
      data[i + 3] = 255;
    }
  }
  return data;
}

function landmarks(): LM[] {
  const lms: LM[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const i of TZONE) lms[i] = { x: 0.5, y: 0.3, z: 0 };
  for (const i of CHEEKS) lms[i] = { x: 0.5, y: 0.7, z: 0 };
  return lms;
}

/** Both candidate formulas, from the same two region samples of the same frame. */
function read(data: Uint8ClampedArray) {
  const lms = landmarks();
  const tzone = sampleRegion(data, W, H, lms, TZONE);
  const cheeks = sampleRegion(data, W, H, lms, CHEEKS);
  expect(tzone && cheeks, "the fixture produced no region").toBeTruthy();
  let clipped = 0;
  let total = 0;
  for (let y = 136; y <= 144; y += 1) {
    for (let x = 96; x <= 104; x += 1) {
      total += 1;
      if (data[(y * W + x) * 4] >= 255) clipped += 1;
    }
  }
  return {
    // The shipped index, through the shipped function.
    chroma: relativeRedness(cheeks!, tzone!),
    // The rejected index: a* of the cheek minus a* of the T-zone, through the shipped
    // `labAStar`, so the comparison is against real CIELAB and not a paraphrase of it.
    astar: labAStar(cheeks!.meanR, cheeks!.meanG, cheeks!.meanB) - labAStar(tzone!.meanR, tzone!.meanG, tzone!.meanB),
    cheekL: 0.299 * cheeks!.meanR + 0.587 * cheeks!.meanG + 0.114 * cheeks!.meanB,
    clip: clipped / total,
  };
}

/**
 * Render at whatever gain puts the CAPTURED cheek luminance at `target`. The gamma and
 * flare sweeps need this: both change the frame's brightness as a side effect, and
 * without re-normalising, a gamma sweep would be measuring exposure as well and the
 * comparison would be between two confounded numbers.
 */
function atCheekL(face: Face, target: number, cam: Camera = {}) {
  let gain = target / lumOf(face.cheek);
  for (let i = 0; i < 40; i += 1) {
    const r = read(render(face, { ...cam, gain }));
    if (Math.abs(r.cheekL - target) < 0.05) break;
    gain *= target / r.cheekL;
  }
  return read(render(face, { ...cam, gain }));
}

/** The same warm face tests/axis-exposure-scale.test.ts sweeps, R/L 1.223. */
const FACE: Face = { cheek: [200, 150, 138], tzone: [195, 154, 142], amp: 0.19, chroma: 0.03 };

/**
 * A melanin-like tone model, and it is deliberately NOT a plain scalar darkening:
 * melanin absorbs more at short wavelengths, so a deeper tone loses more blue than red.
 * A scalar model would make this sweep arithmetically identical to the exposure sweep
 * and the second table would be the first one twice.
 */
function faceAtMelanin(s: number): Face {
  const k = [0.75, 1.0, 1.2];
  return {
    cheek: FACE.cheek.map((v, c) => v * Math.pow(s, k[c])),
    tzone: FACE.tzone.map((v, c) => v * Math.pow(s, k[c])),
    amp: FACE.amp,
    chroma: FACE.chroma,
  };
}

const EXPOSURES = [70, 90, 110, 130, 150, 170];
const MELANIN = [0.55, 0.65, 0.75, 0.85, 1.0];
const WHITE_BALANCE = [[1, 1, 1], [1.12, 1, 0.92], [0.92, 1, 1.12], [1.06, 1, 0.96], [0.96, 1, 1.06], [1.2, 1, 0.85]];
const GAMMAS = [0.8, 0.9, 1.0, 1.1, 1.25];
const BLACKS = [0, 5, 10, 20, 30];

/** Four faces of genuinely different redness at one capture: the SIGNAL both forms
 *  have to carry. Without it a stability contest is won by any index that is constant. */
const SIGNAL_TZONES = [[196, 154, 141], [195, 154, 142], [193, 156, 142], [188, 158, 144]];

const range = (values: number[]) => Math.max(...values) - Math.min(...values);
const spread = (values: number[]) => Math.max(...values) / Math.min(...values);

type Sweep = { name: string; chroma: number[]; astar: number[]; rows: string[] };

function sweeps(): { signal: { chroma: number[]; astar: number[] }; sweeps: Sweep[] } {
  const signalReads = SIGNAL_TZONES.map((tzone) => atCheekL({ ...FACE, tzone }, 140));
  const collect = (name: string, reads: Array<{ label: string; r: ReturnType<typeof read> }>): Sweep => ({
    name,
    chroma: reads.map((entry) => entry.r.chroma),
    astar: reads.map((entry) => entry.r.astar),
    rows: reads.map(
      (entry) =>
        `${entry.label}\t${entry.r.cheekL.toFixed(1)}\t${(entry.r.clip * 100).toFixed(0)}%\t` +
        `${entry.r.chroma.toFixed(6)}\t${entry.r.astar.toFixed(5)}`
    ),
  });

  // Exposure is NOT re-normalised — it is the thing being swept.
  const exposure = collect(
    "exposure 70..170",
    EXPOSURES.map((target) => ({ label: `${target}`, r: atCheekL(FACE, target) }))
  );
  // Melanin is NOT re-normalised either: a deeper face under one light produces a
  // darker frame, and pinning the frame's brightness would delete the effect.
  const gain140 = 140 / lumOf(FACE.cheek);
  const melanin = collect(
    "melanin tone",
    MELANIN.map((s) => ({ label: s.toFixed(2), r: read(render(faceAtMelanin(s), { gain: gain140 })) }))
  );
  const balance = collect(
    "white balance",
    WHITE_BALANCE.map((wb) => ({ label: wb.join("/"), r: atCheekL(FACE, 140, { wb }) }))
  );
  const curve = collect(
    "tone curve",
    GAMMAS.map((gamma) => ({ label: gamma.toFixed(2), r: atCheekL(FACE, 140, { gamma }) }))
  );
  const flare = collect(
    "veiling flare",
    BLACKS.map((black) => ({ label: `${black}`, r: atCheekL(FACE, 140, { black }) }))
  );

  return {
    signal: { chroma: signalReads.map((r) => r.chroma), astar: signalReads.map((r) => r.astar) },
    sweeps: [exposure, melanin, balance, curve, flare],
  };
}

describe("relative_redness: an a* difference against a chromaticity difference", () => {
  it("holds the shipped form flat across the 조명 band while the rejected one doubles", () => {
    // The finding the decision rests on, on its own so it fails on its own. Same face,
    // same regions, same frames; only the formula differs.
    const reads = EXPOSURES.map((target) => atCheekL(FACE, target));
    for (const r of reads) expect(r.clip, `cheekL ${r.cheekL} already clips`).toBe(0);
    const chroma = reads.map((r) => r.chroma);
    const astar = reads.map((r) => r.astar);
    // Measured: chromaticity 0.013064..0.013390 (1.0249x) over a 2.43x exposure range;
    // a* 1.82634..3.95999 (2.1683x). The a* difference nearly doubles on one face
    // whose skin did not change.
    expect(spread(chroma), chroma.map((v) => v.toFixed(6)).join(" ")).toBeLessThan(1.03);
    expect(spread(astar), astar.map((v) => v.toFixed(5)).join(" ")).toBeGreaterThan(2.1);
    // And it is monotone in the exposure, which is what makes it the formula rather
    // than noise: every step up in brightness reads as a redder face.
    for (let i = 1; i < astar.length; i += 1) expect(astar[i]).toBeGreaterThan(astar[i - 1]);
  });

  it("holds the exponent the mechanism predicts, against the shipped labAStar", () => {
    // WHY the a* difference moves, checked rather than argued. a* = 500 * (f(x) - f(y))
    // with f a cube root above its knee, so a* is homogeneous of degree 1/3 in the
    // linear signal; the linear signal is degree 2.4 in the channel. A common gain g
    // therefore takes a* — and any DIFFERENCE of two a* values — to g^0.8 of itself.
    //
    // Under a PURE 2.4 power law that is exact, and this asserts it to 12 decimals.
    // The shipped transfer curve is affine-then-power ((c + 0.055) / 1.055)^2.4, whose
    // offset does not scale, so the shipped ratio sits near g^0.8 without being it:
    // 0.65561 against 0.66454 at g = 0.6. Both columns are printed.
    const pureLinear = (channel: number) => Math.pow(channel / 255, 2.4);
    const pureAStar = (r: number, g: number, b: number) => {
      const [rl, gl, bl] = [pureLinear(r), pureLinear(g), pureLinear(b)];
      const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
      const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
      const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      return 500 * (f(x) - f(y));
    };
    const diff = (fn: (r: number, g: number, b: number) => number, m: number) =>
      fn(FACE.cheek[0] * m, FACE.cheek[1] * m, FACE.cheek[2] * m) -
      fn(FACE.tzone[0] * m, FACE.tzone[1] * m, FACE.tzone[2] * m);
    const pure0 = diff(pureAStar, 1);
    const shipped0 = diff(labAStar, 1);
    for (const m of [0.6, 0.8, 1.2, 1.4]) {
      expect(diff(pureAStar, m) / pure0, `pure power law at gain ${m}`).toBeCloseTo(Math.pow(m, 0.8), 12);
      // The shipped curve: near it, not it, and never mistaken for invariant.
      expect(diff(labAStar, m) / shipped0, `shipped labAStar at gain ${m}`).toBeCloseTo(Math.pow(m, 0.8), 1);
      expect(Math.abs(diff(labAStar, m) / shipped0 - 1), `shipped labAStar at gain ${m}`).toBeGreaterThan(0.1);
    }
    // The shipped chromaticity form, over the same scalings: invariant to within one
    // ulp of 1.0, which is one correctly-rounded division on each side of a subtraction.
    const chroma0 = redChromaticity(FACE.cheek[0], FACE.cheek[1], FACE.cheek[2]) - redChromaticity(FACE.tzone[0], FACE.tzone[1], FACE.tzone[2]);
    for (const m of [0.6, 0.8, 1.2, 1.4]) {
      const scaled =
        redChromaticity(FACE.cheek[0] * m, FACE.cheek[1] * m, FACE.cheek[2] * m) -
        redChromaticity(FACE.tzone[0] * m, FACE.tzone[1] * m, FACE.tzone[2] * m);
      expect(Math.abs(scaled - chroma0), `chromaticity at gain ${m}`).toBeLessThanOrEqual(2 ** -52);
    }
  });

  it("compares the two on drift against their own signal, which is the number that decides", () => {
    // Two indices on two scales cannot be compared by raw spread — that rewards
    // whichever sits further from zero. The comparable quantity is how much a nuisance
    // moves an index relative to how much a real difference between faces moves it.
    const { signal, sweeps: all } = sweeps();
    // The denominators first: neither form is degenerate, and both order the four
    // faces, so this is not a contest between an index and a constant.
    expect(range(signal.chroma)).toBeGreaterThan(0.01);
    expect(range(signal.astar)).toBeGreaterThan(4);
    for (let i = 1; i < signal.chroma.length; i += 1) {
      expect(signal.chroma[i], "the shipped form must still order faces").toBeGreaterThan(signal.chroma[i - 1]);
      expect(signal.astar[i], "and so must the rejected one").toBeGreaterThan(signal.astar[i - 1]);
    }

    const ratio = (sweep: Sweep) => ({
      chroma: range(sweep.chroma) / range(signal.chroma),
      astar: range(sweep.astar) / range(signal.astar),
    });
    const by = Object.fromEntries(all.map((sweep) => [sweep.name, ratio(sweep)]));

    // Measured 2026-09-20 (nuisance / signal, lower is better):
    //   exposure 70..170   0.0209   0.5047   chroma by 24.16x
    //   melanin tone       0.0227   0.2545   chroma by 11.19x
    //   white balance      0.0624   0.2071   chroma by  3.32x
    //   tone curve         0.3930   0.4076   chroma by  1.04x
    //   veiling flare      0.1878   0.1822   astar  by  1.03x
    expect(by["exposure 70..170"].astar / by["exposure 70..170"].chroma).toBeGreaterThan(15);
    expect(by["melanin tone"].astar / by["melanin tone"].chroma).toBeGreaterThan(8);
    expect(by["white balance"].astar / by["white balance"].chroma).toBeGreaterThan(2.5);
    // The three the design document names, in absolute terms: the shipped form gives
    // up under a tenth of its range to each, the rejected one a fifth to a half.
    for (const name of ["exposure 70..170", "melanin tone", "white balance"]) {
      expect(by[name].chroma, `${name}: chroma`).toBeLessThan(0.1);
      expect(by[name].astar, `${name}: astar`).toBeGreaterThan(0.2);
    }
    // And the honest half: on the two nuisances that are NOT multiplicative it is a
    // tie, in both directions. Kept as an assertion so that a later cycle claiming the
    // chromaticity form is simply the stable one has to fail this to say so.
    for (const name of ["tone curve", "veiling flare"]) {
      const worse = Math.max(by[name].chroma, by[name].astar);
      const better = Math.min(by[name].chroma, by[name].astar);
      expect(worse / better, `${name} is not a tie`).toBeLessThan(1.1);
      expect(better, `${name}: neither form is invariant to a non-linear camera`).toBeGreaterThan(0.15);
    }
    expect(by["veiling flare"].astar).toBeLessThan(by["veiling flare"].chroma);
    expect(by["tone curve"].chroma).toBeLessThan(by["tone curve"].astar);
  });

  it("costs the shipped form a published level on the tone curve, which the cuts cannot fix", () => {
    // What the tie above means for a user, stated in the units the product publishes.
    // A device contrast curve between gamma 0.8 and 1.25, with the exposure held, takes
    // this face from 0.010348 to 0.016477 — across the 0.012 낮음/보통 cut. Moving the
    // cut does not help: the sweep straddles it wherever it is put, and the same curve
    // moves the rejected form by as much. It is the limit of reading redness off an
    // uncalibrated camera, not a defect of either formula.
    const reads = GAMMAS.map((gamma) => atCheekL(FACE, 140, { gamma }));
    const chroma = reads.map((r) => r.chroma);
    expect(Math.min(...chroma)).toBeLessThan(0.012);
    expect(Math.max(...chroma)).toBeGreaterThan(0.012);
    for (let i = 1; i < chroma.length; i += 1) expect(chroma[i]).toBeGreaterThan(chroma[i - 1]);
  });

  it("prints the tables the doc tabulates", () => {
    if (!process.env.ARU_PRINT_REDNESS_DECISION) return;
    const write = (line: string) => process.stdout.write(`REDNESS ${line}\n`);
    const { signal, sweeps: all } = sweeps();
    write(`signal range over four faces: chroma ${range(signal.chroma).toExponential(4)} astar ${range(signal.astar).toExponential(4)}`);
    for (const sweep of all) {
      write(`--- ${sweep.name}`);
      write("step\tcheekL\tR=255\tchroma\t\tastar");
      for (const row of sweep.rows) write(row);
      write(`spread  chroma ${spread(sweep.chroma).toFixed(4)}\tastar ${spread(sweep.astar).toFixed(4)}`);
      write(
        `n/s     chroma ${(range(sweep.chroma) / range(signal.chroma)).toFixed(4)}\t` +
          `astar ${(range(sweep.astar) / range(signal.astar)).toFixed(4)}`
      );
    }
  });
});
