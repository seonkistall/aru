import { describe, expect, it } from "vitest";
import { analyzeSkin, itaDegrees, rgbToLab } from "@/lib/skin";
import { toneBandFromIta } from "@/lib/tone-bands";

/**
 * What ITA should read when b* is near zero — decided on a measurement, 2026-09-20.
 *
 * Cycle 19 found three implementations guarding the `atan((L* - 50) / b*)` singularity in
 * two different places: `|b*| < 0.01` in `lib/skin.ts:itaDegrees` and
 * `ml/ita.py:ita_from_lab`, `1e-6` in `ml/skin_indices.py:ita`. It pinned the pair as
 * divergent and deliberately did not choose, because the ±90 fallback ignores the SIGN of
 * b*, so inside the window the two did not round differently — they landed 180° apart,
 * `light` against `deep` on the tone stratifier from one frame.
 *
 * This file is the measurement that chose, kept so the decision can be re-run instead of
 * re-argued. `docs/ita-guard-decision.md` is its write-up. The rejected guard is
 * reproduced inline and named as rejected, because measuring what a guard does needs the
 * guard; it is not exported and nothing else imports it.
 *
 *   ARU_PRINT_ITA_GUARD=1 npx vitest run tests/ita-guard-decision.test.ts
 *
 * reprints the tables in that doc.
 */

/** The guard `lib/skin.ts` and `ml/ita.py` carried until 2026-09-20. */
function rejectedWideGuard(lstar: number, bstar: number): number {
  return Math.abs(bstar) < 0.01 ? (lstar > 50 ? 90 : -90) : (Math.atan((lstar - 50) / bstar) * 180) / Math.PI;
}

/** The guard `ml/skin_indices.py` carried until 2026-09-20. */
function rejectedNarrowGuard(lstar: number, bstar: number): number {
  return Math.abs(bstar) < 1e-6 ? (lstar > 50 ? 90 : -90) : (Math.atan((lstar - 50) / bstar) * 180) / Math.PI;
}

/** The limit `atan((L* - 50) / b*)` actually approaches as |b*| shrinks: it depends on
 *  the sign of b*, which is the whole of what the ±90 fallback threw away. */
function trueLimit(lstar: number, bstar: number): number {
  return (lstar - 50) / bstar > 0 ? 90 : -90;
}

const grey = (level: number) => rgbToLab(level, level, level);
const PRINT = process.env.ARU_PRINT_ITA_GUARD === "1";

type LM = { x: number; y: number; z?: number };

/** The landmark set tests/tone-ita-contract.test.ts uses, so the sweep below runs the
 *  shipped path on the committed synthetic face rather than on a frame of its own. */
function faceLandmarks(): LM[] {
  const at = (x: number, y: number) => ({ x, y, z: 0 });
  const landmarks: LM[] = Array.from({ length: 468 }, () => at(0.5, 0.58));
  const place = (indices: number[], x: number, y: number) => {
    for (const index of indices) landmarks[index] = at(x, y);
  };
  place([9, 8, 107, 336, 151, 10, 67, 297], 0.5, 0.22);
  place([1, 4, 5, 195, 197], 0.5, 0.48);
  place([50, 101, 118, 117, 116, 205, 36], 0.32, 0.58);
  place([280, 330, 347, 346, 345, 425, 266], 0.68, 0.58);
  place([18, 200, 199, 175, 152, 83, 313], 0.5, 0.82);
  return landmarks;
}

/** That same face and wall with one blue gain applied to the whole frame — the cool cast
 *  docs/tone-ita-verification.md §3 measures, parameterised so the crossing can be
 *  stepped over rather than jumped to. */
function coolCastFace(blueGain: number): ImageData {
  const w = 400;
  const h = 480;
  const data = new Uint8ClampedArray(w * h * 4);
  let seed = 20260916;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const inFace = x >= 0.18 * w && x <= 0.82 * w && y >= 0.1 * h && y <= 0.94 * h;
      const noise = (rand() - 0.5) * 9;
      const base = y < 0.42 * h ? 186 : y < 0.72 * h ? 170 : 158;
      const px = inFace
        ? [base + 22 + noise, base - 4 + noise, (base - 18 + noise) * blueGain]
        : [180 + noise, 180 + noise, (180 + noise) * blueGain];
      const o = (y * w + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        data[o + channel] = Math.max(0, Math.min(255, px[channel]));
      }
      data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h } as unknown as ImageData;
}

describe("the ITA guard, decided", () => {
  it("is b* === 0 and nothing wider", () => {
    // 0 is the only input where the quotient has no value at all. Everything else —
    // denormals included — divides to a finite or infinite quotient that Math.atan maps
    // to the right one-sided limit, so there is nothing for a window to protect.
    expect(itaDegrees(70, 0)).toBe(90);
    expect(itaDegrees(30, 0)).toBe(-90);
    expect(Number.isFinite((70 - 50) / 5e-324)).toBe(false);
    expect(itaDegrees(70, 5e-324)).toBe(90);
    expect(itaDegrees(30, 5e-324)).toBe(-90);
    expect(itaDegrees(70, 1e-300)).toBe(90);

    // -0 takes the branch too, and it has to: V8 divides by -0 to -Infinity while
    // CPython raises ZeroDivisionError on BOTH zeros, so without the branch the two
    // languages would read 70/-0 as -90 and as an exception. `=== 0` covers both.
    expect(Object.is(-0, 0)).toBe(false);
    expect((70 - 50) / -0).toBe(Number.NEGATIVE_INFINITY);
    expect(itaDegrees(70, -0)).toBe(90);
    expect(itaDegrees(30, -0)).toBe(-90);

    // 0/0 at the pivot. There is no limit to take, so ±90 there is a convention and is
    // documented as one; what matters is that it is a number rather than a NaN, because
    // toneBandFromIta maps a NaN to "unknown" and a tone-unknown row blocks promotion.
    expect(Number.isNaN((50 - 50) / 0)).toBe(true);
    expect(itaDegrees(50, 0)).toBe(-90);
    expect(Number.isFinite(itaDegrees(50, 0))).toBe(true);
  });

  it("reads the sign of b*, which is what the rejected fallback discarded", () => {
    // The pair cycle 19 recorded. One frame, one b* magnitude, two signs.
    expect(rejectedWideGuard(70, 0.005)).toBe(90);
    expect(rejectedWideGuard(70, -0.005)).toBe(90);
    expect(rejectedNarrowGuard(70, 0.005)).toBeCloseTo(89.98567605542014, 12);
    expect(rejectedNarrowGuard(70, -0.005)).toBeCloseTo(-89.98567605542014, 12);
    expect(itaDegrees(70, 0.005)).toBeCloseTo(89.98567605542014, 12);
    expect(itaDegrees(70, -0.005)).toBeCloseTo(-89.98567605542014, 12);

    // Which is the consequence: 41 is the light cut and 10 the deep one.
    expect(toneBandFromIta(rejectedWideGuard(70, -0.005))).toBe("very_light");
    expect(toneBandFromIta(itaDegrees(70, -0.005))).toBe("brown_dark");
    // And below the pivot it fires the other way, so neither sign of L* is safe.
    expect(rejectedWideGuard(30, -0.005)).toBe(-90);
    expect(itaDegrees(30, -0.005)).toBeCloseTo(89.98567605542014, 12);
  });

  /**
   * The reachability question the decision turned on, and the answer is in two halves.
   *
   * On a skin-coloured region the window is a knife edge: you have to tune the blue gain
   * to within a few times 1e-4 to land in it, so no capture arrives there by chance. On
   * the NEUTRAL AXIS it is not a knife edge at all — the axis is inside the window, and
   * 8-bit quantisation puts real pixel values exactly on it.
   */
  it("was reachable on the neutral axis, not by a tuned cast", () => {
    const insideWide: number[] = [];
    const insideNarrow: number[] = [];
    for (let level = 0; level < 256; level += 1) {
      const b = grey(level).b;
      if (Math.abs(b) < 0.01) insideWide.push(level);
      if (Math.abs(b) < 1e-6) insideNarrow.push(level);
    }
    expect(insideWide.length, "8-bit greys inside the rejected wide guard").toBe(242);
    expect(insideNarrow, "and inside the rejected narrow one").toEqual([0]);
    if (PRINT) {
      process.stdout.write(
        `DECISION greys inside |b*|<0.01: ${insideWide.length}/256, inside |b*|<1e-6: ${insideNarrow.length}/256\n`
      );
      process.stdout.write("DECISION grey       L*             b*     shipped ITA   rejected wide   true limit\n");
      for (const level of [0, 32, 64, 96, 119, 128, 160, 192, 224, 240]) {
        const { l, b } = grey(level);
        process.stdout.write(
          `DECISION ${String(level).padStart(4)} ${l.toFixed(5).padStart(9)} ${b.toFixed(9).padStart(14)} ` +
            `${itaDegrees(l, b).toFixed(6).padStart(13)} ${rejectedWideGuard(l, b).toFixed(1).padStart(15)} ` +
            `${(b === 0 ? itaDegrees(l, b) : trueLimit(l, b)).toFixed(1).padStart(12)}\n`
        );
      }
    }

    // The mechanism rather than a coincidence: ARU carries the sRGB→XYZ matrix to four
    // decimals, so for r = g = b the z row sums to 1.089/1.08883 = 1.00016 of the y row
    // and b* = 200 * (f(y) − f(z)) comes out small and NEGATIVE, growing with level.
    for (let level = 1; level < 256; level += 1) expect(grey(level).b, `grey ${level}`).toBeLessThan(0);
    expect(grey(0).b).toBe(0);
    expect(grey(128).b).toBeCloseTo(-0.006243566, 9);
    expect(grey(255).b).toBeCloseTo(-0.010408185, 9);

    // And so on every non-black grey inside the old window the rejected fallback
    // answered with sign(L* − 50), which is exactly the sign the limit does not have.
    let inverted = 0;
    for (const level of insideWide) {
      const { l, b } = grey(level);
      if (b === 0) continue;
      expect(Math.sign(itaDegrees(l, b)), `grey ${level}: the shipped angle carries the limit's sign`).toBe(
        Math.sign(trueLimit(l, b))
      );
      if (Math.sign(rejectedWideGuard(l, b)) !== Math.sign(trueLimit(l, b))) inverted += 1;
    }
    expect(inverted, "non-black greys the rejected fallback gave the wrong sign").toBe(241);

    // The knife-edge half. The blue gain that takes each committed fixture through
    // b* = 0, and the width of the interval around it where |b*| < 0.01 — measured, not
    // reasoned about, by bisection on the shipped rgbToLab.
    const FIXTURES: Array<[string, [number, number, number]]> = [
      ["synthetic-face cheek", [192, 166, 152]],
      ["swatch-1", [242, 223, 211]],
      ["swatch-3", [205, 168, 144]],
      ["swatch-6", [86, 58, 42]],
    ];
    const bOf = (px: readonly [number, number, number], gain: number) =>
      rgbToLab(Math.min(255, px[0]), Math.min(255, px[1]), Math.min(255, px[2] * gain)).b;
    const widths: Array<[string, number, number]> = [];
    for (const [name, px] of FIXTURES) {
      let lo = 1;
      let hi = 6;
      for (let i = 0; i < 200; i += 1) {
        const mid = (lo + hi) / 2;
        if (bOf(px, lo) * bOf(px, mid) <= 0) hi = mid;
        else lo = mid;
      }
      const crossing = (lo + hi) / 2;
      const edge = (direction: 1 | -1) => {
        let step = 1e-9;
        while (step < 1 && Math.abs(bOf(px, crossing + direction * step)) < 0.01) step *= 2;
        let a = crossing + direction * (step / 2);
        let bnd = crossing + direction * step;
        for (let i = 0; i < 100; i += 1) {
          const mid = (a + bnd) / 2;
          if (Math.abs(bOf(px, mid)) < 0.01) a = mid;
          else bnd = mid;
        }
        return a;
      };
      widths.push([name, crossing, Math.abs(edge(1) - edge(-1))]);
    }
    if (PRINT) {
      process.stdout.write("DECISION fixture              b* at gain 1   crossing gain   |b*|<0.01 window\n");
      for (const [name, crossing, width] of widths) {
        const px = FIXTURES.find(([fixture]) => fixture === name)![1];
        process.stdout.write(
          `DECISION ${name.padEnd(21)} ${bOf(px, 1).toFixed(4).padStart(12)}   ` +
            `${crossing.toFixed(6).padStart(13)}   ${width.toExponential(3).padStart(16)}\n`
        );
      }
    }
    // Every fixture's window is under a thousandth of a gain unit, so a capture crossing
    // zero passes through it rather than stopping in it. That is why the defect is a
    // correctness one on the neutral axis and a tidy-up everywhere else — and why a fix
    // that only made the fallback sign-aware would have been aimed at the wrong half.
    for (const [name, , width] of widths) {
      expect(width, `${name}: the guard window in blue-gain units`).toBeLessThan(1e-3);
      expect(width, `${name}: and it is not zero`).toBeGreaterThan(1e-5);
    }
  });

  it("could not have been fixed by sign-awareness alone, because the ratio is what diverges", () => {
    // A guard on |b*| asserts a vertical angle however small |L* − 50| is. A face a
    // thousandth above the pivot with b* inside the old window is the cheapest case:
    // the rejected guard published 90 where the angle is 11.3.
    expect(rejectedWideGuard(50.001, 0.005)).toBe(90);
    expect(itaDegrees(50.001, 0.005)).toBeCloseTo(11.309932474020215, 10);
    expect(toneBandFromIta(rejectedWideGuard(50.001, 0.005))).toBe("very_light");
    expect(toneBandFromIta(itaDegrees(50.001, 0.005))).toBe("tan");
    // A sign-aware ±90 would have answered 90 here too — the sign is right and the
    // value is still wrong by 79 degrees — which is why the guard narrowed instead.
    expect(trueLimit(50.001, 0.005)).toBe(90);

    // It is not a constructed input either. Grey 119 lands at L* 50.034 on the real
    // 8-bit axis, and there the angle is 80.24 against the rejected 90.
    const { l, b } = grey(119);
    expect(l).toBeCloseTo(50.03444, 5);
    expect(itaDegrees(l, b)).toBeCloseTo(-80.2381693436971, 10);
    expect(rejectedWideGuard(l, b)).toBe(90);
  });

  /**
   * The same question asked of the shipped path rather than of the formula, because a
   * window the formula can reach and the pipeline cannot is a different defect.
   *
   * This is also where cycle 19's reachability argument gets corrected. It read
   * `docs/tone-ita-verification.md` §3 — a cool cast takes ITA from 61.8 to −87.6 on a
   * real fixture — as evidence that a capture reaches the window. It is evidence that a
   * capture CROSSES it, which is not the same claim: the fixture's cheek b* passes
   * through zero, and passing through a 2.6e-4-wide interval is not landing in it.
   */
  it("is never entered by a capture: 121 blue gains step straight over it", () => {
    const landmarks = faceLandmarks();
    const angles: Array<[number, number]> = [];
    for (let step = 0; step <= 120; step += 1) {
      const gain = 1 + step * 0.005;
      const reads = analyzeSkin(coolCastFace(gain), landmarks);
      expect(reads, `blue gain ${gain}`).not.toBeNull();
      angles.push([gain, reads!.raw.toneIta]);
      if (PRINT) process.stdout.write(`DECISION sweep gb=${gain.toFixed(3)} toneIta=${reads!.raw.toneIta}\n`);
    }
    // b* crosses zero somewhere between these two steps, and the reading jumps the full
    // width of the scale in one 0.005 step of the blue gain — which is ITA being ITA,
    // not a guard firing.
    const before = angles.find(([gain]) => Math.abs(gain - 1.135) < 1e-9)!;
    const after = angles.find(([gain]) => Math.abs(gain - 1.14) < 1e-9)!;
    expect(before[1]).toBe(89.6);
    expect(after[1]).toBe(-89.2);
    expect(toneBandFromIta(before[1])).toBe("very_light");
    expect(toneBandFromIta(after[1])).toBe("brown_dark");

    // And not one of the 121 captures produced a reading the old guard would have
    // clamped. |toneIta| is rounded to 0.1, so a clamped frame would read exactly ±90;
    // the sweep gets to 89.6 and stops, on both sides.
    expect(angles.filter(([, ita]) => Math.abs(ita) === 90).length, "captures inside the old window").toBe(0);
    expect(Math.max(...angles.map(([, ita]) => Math.abs(ita)))).toBe(89.6);
  });

  it("leaves every reading a face produces untouched", () => {
    // The six reference-verified swatches and the synthetic-face cheek all sit two
    // orders of magnitude clear of the old window, so the decision moves nothing a
    // capture publishes. `tests/tone-ita-contract.test.ts` pins the values themselves;
    // this is the reason they did not have to change.
    const FACES: Array<[number, number, number]> = [
      [242, 223, 211],
      [226, 195, 176],
      [205, 168, 144],
      [181, 139, 110],
      [140, 100, 74],
      [86, 58, 42],
      [192, 166, 152],
    ];
    for (const rgb of FACES) {
      const { l, b } = rgbToLab(rgb[0], rgb[1], rgb[2]);
      expect(Math.abs(b), `${rgb}: b* must be clear of the old 0.01 window`).toBeGreaterThan(8);
      expect(itaDegrees(l, b)).toBe(rejectedWideGuard(l, b));
      expect(itaDegrees(l, b)).toBe(rejectedNarrowGuard(l, b));
    }
  });
});
