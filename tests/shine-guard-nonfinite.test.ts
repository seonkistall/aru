import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shineIndex, SHINE_REFERENCE_CHEEK_L, sampleRegion } from "@/lib/skin";

/**
 * The app side of `ml/selftest.py ::
 * test_shine_denominator_guard_agrees_with_the_app_except_on_a_non_finite_cheek`.
 *
 * `cheekL || 1` (lib/skin.ts) and `cheek_luminance if cheek_luminance else 1.0`
 * (ml/skin_indices.py) are the same guard on every finite input and disagree on
 * NaN, which is truthy in Python and falsy in JavaScript. Neither side is
 * changed here; both are pinned so the disagreement cannot move unnoticed while
 * the decision waits.
 */

const root = resolve(import.meta.dirname, "..");

describe("shineIndex's denominator guard", () => {
  it("agrees with Python on a zero, negative-zero and sub-epsilon cheek", () => {
    const expected = 0.1 + 200 * (SHINE_REFERENCE_CHEEK_L / 255);
    expect(shineIndex(0.1, 200, 0)).toBeCloseTo(expected, 12);
    expect(shineIndex(0.1, 200, -0)).toBeCloseTo(expected, 12);
    for (const cheek of [1e-7, 1e-6, 1e-3]) {
      expect(Number.isFinite(shineIndex(0.1, 200, cheek))).toBe(true);
    }
    // The sub-epsilon value both sides compute the same way, as a number.
    expect(shineIndex(0.1, 200, 1e-7)).toBe(0.1 + (200 - 1e-7) / 1e-7 * (SHINE_REFERENCE_CHEEK_L / 255));
  });

  it("publishes NaN on a non-finite cheek where Python publishes the specular term", () => {
    expect(Number.isNaN(shineIndex(0.1, 200, Number.NaN))).toBe(true);
    // The mechanism, in this language's own terms: NaN is falsy here (Python's
    // is truthy), so the app takes the `|| 1` branch and divides by 1 instead of
    // by NaN, and JS's Math.max propagates the NaN that Python's max discards.
    expect(Number.NaN ? "truthy" : "falsy").toBe("falsy");
    expect(Math.max(0, Number.NaN)).toBeNaN();
  });

  it("cannot get a NaN cheek out of sampleRegion, because kept is never empty", () => {
    // A 6x6 patch of one flat colour: every pixel lands in `collected`, the 10%
    // trim would leave fewer than 20, so `kept` falls back to the whole set.
    const w = 6;
    const h = 6;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      data[i * 4] = 180;
      data[i * 4 + 1] = 140;
      data[i * 4 + 2] = 130;
      data[i * 4 + 3] = 255;
    }
    const stats = sampleRegion(data, w, h, [{ x: 0.5, y: 0.5 }], [0], 2);
    expect(stats).not.toBeNull();
    expect(Number.isFinite(stats!.meanR)).toBe(true);
    expect(Number.isFinite(stats!.meanL)).toBe(true);
    // The line that makes it true, read from the source rather than asserted by proxy.
    const source = readFileSync(resolve(root, "lib/skin.ts"), "utf8");
    expect(source).toContain("const kept = sorted.length - cut * 2 >= 20 ? sorted.slice(cut, sorted.length - cut) : sorted;");
    expect(source).toContain("if (collected.length === 0) return null;");
  });
});
