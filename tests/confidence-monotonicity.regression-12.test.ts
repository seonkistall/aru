import { describe, expect, it } from "vitest";
import { ATTR_THRESHOLDS, distanceConfidence, type SkinAttr } from "@/lib/skin";

// Regression 12 — `distanceConfidence` was sign-inverted outside the threshold
// band. Confidence peaked immediately BELOW `lo` (the most ambiguous reading
// there is) and decayed toward 0 as a reading became unmistakably calm or
// unmistakably pronounced. Downstream, `readsFromRaw` gates on 0.58 to emit
// 재촬영 권장 and `shouldApplyScan` (lib/recommend.ts) discards the scan below
// the same bar, so a clean capture of very calm skin was thrown away and the
// user was told to retake with no reason listed.
//
// The invariant: confidence is LOWEST at a cut point and never decreases as the
// value moves away from it.

const attrs = Object.keys(ATTR_THRESHOLDS) as SkinAttr[];

describe("distanceConfidence", () => {
  it.each(attrs)("is minimal at the cut points for %s", (attr) => {
    const [lo, hi] = ATTR_THRESHOLDS[attr];
    const span = hi - lo;
    const atLo = distanceConfidence(lo, lo, hi);
    const atHi = distanceConfidence(hi, lo, hi);

    // Straddling a cut point must not jump: the old form scored 0.916 just
    // below `lo` and 0.695 exactly on it.
    expect(distanceConfidence(lo - span * 1e-6, lo, hi)).toBeCloseTo(atLo, 3);
    expect(distanceConfidence(hi + span * 1e-6, lo, hi)).toBeCloseTo(atHi, 3);

    // Nothing anywhere may be less confident than a reading sitting on a cut point.
    for (const value of [lo - span * 3, lo - span, lo + span / 2, hi + span, hi + span * 3]) {
      expect(distanceConfidence(value, lo, hi)).toBeGreaterThanOrEqual(atLo - 1e-9);
    }
  });

  it.each(attrs)("never decreases as %s moves away from the band", (attr) => {
    const [lo, hi] = ATTR_THRESHOLDS[attr];
    const span = hi - lo;

    // Walking down from `lo`, confidence must rise. The old form fell: for
    // redness it went 0.895 -> 0.620 -> 0.120 over this walk.
    let prev = distanceConfidence(lo, lo, hi);
    for (let step = 1; step <= 40; step += 1) {
      const next = distanceConfidence(lo - (span * step) / 10, lo, hi);
      expect(next).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = next;
    }

    // And walking up from `hi`.
    prev = distanceConfidence(hi, lo, hi);
    for (let step = 1; step <= 40; step += 1) {
      const next = distanceConfidence(hi + (span * step) / 10, lo, hi);
      expect(next).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = next;
    }
  });

  it("keeps an unambiguous reading above the 0.58 retake gate", () => {
    // The capture that used to be discarded: very calm skin, every capture
    // signal passing. Per-attribute confidences feed `readsFromRaw` as
    // attrConfidence * 0.72 + signalScore * 0.28, with signalScore = 1.
    const calm = {
      oil: distanceConfidence(0, ...ATTR_THRESHOLDS.oil),
      redness: distanceConfidence(-0.02, ...ATTR_THRESHOLDS.redness),
      pores: distanceConfidence(0.02, ...ATTR_THRESHOLDS.pores),
    };
    const attrConfidence = calm.oil * 0.34 + calm.redness * 0.33 + calm.pores * 0.33;
    const confidence = attrConfidence * 0.72 + 1 * 0.28;

    // Old value was 0.5759 — below the 0.58 gate, so the scan was dropped.
    expect(confidence).toBeGreaterThan(0.58);
    expect(calm.redness).toBeGreaterThan(calm.oil); // redness is the least ambiguous of the three
  });

  it("leaves in-band confidence unchanged", () => {
    const [lo, hi] = ATTR_THRESHOLDS.oil;
    expect(distanceConfidence((lo + hi) / 2, lo, hi)).toBeCloseTo(0.92, 6);
    expect(distanceConfidence(lo, lo, hi)).toBeCloseTo(0.695, 6);
    expect(distanceConfidence(hi, lo, hi)).toBeCloseTo(0.695, 6);
  });
});
