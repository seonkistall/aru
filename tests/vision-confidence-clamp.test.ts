import { describe, expect, it } from "vitest";
import { confidenceLabelFor, mergeVisionAnalysis } from "@/app/scan/capture-analysis";
import { SKIN_LABELS, type SkinReads } from "@/lib/skin";

/**
 * Where the published confidence comes from when the vision path wins, and what the
 * 0.86 cap is actually absorbing.
 *
 * This is the measurement half of the open backlog item "The 0.86 vision-confidence cap
 * and the 0.8614 confidence gate are 0.0014 apart and were chosen independently". It
 * does NOT decide where the cap should sit — that still needs the vision path's
 * confidences measured against real readings, which no export in this repository has.
 * What it establishes is narrower and did not need one: until 2026-09-25 the cap was
 * doing a second job nobody had assigned it, standing in for input validation that
 * `mergeVisionAnalysis` was not doing, and the two layers disagreed wherever the cap
 * did not bite.
 *
 * `/api/analyze`'s `readConfidence` clamps each attribute to [0,1] before the payload
 * is ever returned. `mergeVisionAnalysis` clamped it too — but only where the
 * per-attribute confidence was read, not where the aggregate that becomes
 * `next.confidence` was summed. So the same payload published one number through the
 * function and another through the route.
 */

/** Mirror of `readConfidence` in `app/api/analyze/route.ts`, so the two columns below are comparable. */
function asRouteWouldReturn(confidence: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const attr of ["oil", "redness", "pores"] as const) {
    const value = confidence[attr];
    if (typeof value === "number" && Number.isFinite(value)) out[attr] = Math.max(0, Math.min(1, value));
  }
  return out;
}

function baseReads(confidence: number): SkinReads {
  const bucket = (attr: "oil" | "redness" | "pores") => ({
    value: SKIN_LABELS[attr][1],
    level: 1 as const,
    calm: false,
    confidence,
  });
  return {
    source: "roi-calibrated",
    confidence,
    confidenceLabel: confidenceLabelFor(confidence),
    retakeRecommended: false,
    signals: [],
    oil: bucket("oil"),
    redness: bucket("redness"),
    pores: bucket("pores"),
    headline: "",
    narrative: "",
    overall: { value: "", level: 1, calm: false, confidence },
  } as unknown as SkinReads;
}

function merged(confidence: Record<string, number>, base = 0.2) {
  return mergeVisionAnalysis(baseReads(base), {
    labels: { oil: 0, redness: 0, pores: 0 },
    confidence,
  } as never);
}

/**
 * The rows that used to diverge, now measured on both paths and asserted equal.
 *
 * Every number here is a literal `vitest` output from this file, not a derivation:
 * `oil: 2` published **0.600 / 보통 / no retake** through `mergeVisionAnalysis` and
 * **0.300 / 낮음 / retake** through the route, and `oil: -2` diverged the other way,
 * **0.200 / 낮음 / retake** against **0.600 / 보통 / no retake** — the negative value
 * dragged the unclamped mean under the base reading, which `Math.max` then restored.
 */
describe("an out-of-range vision confidence means the same thing to the function and to the route", () => {
  const rows: [string, Record<string, number>, number][] = [
    ["one attribute at 2, the rest at 0", { oil: 2, redness: 0, pores: 0 }, 0.3],
    ["one attribute at 3, the rest at 0", { oil: 3, redness: 0, pores: 0 }, 0.3],
    ["one attribute at 10, the rest at 0", { oil: 10, redness: 0, pores: 0 }, 0.3],
    ["one attribute at 1.5, the rest at 0", { oil: 1.5, redness: 0, pores: 0 }, 0.3],
    ["one attribute negative", { oil: -2, redness: 1, pores: 1 }, 0.6],
    ["every attribute out of range", { oil: 5, redness: 5, pores: 5 }, 0.86],
    ["every attribute at the ceiling", { oil: 1, redness: 1, pores: 1 }, 0.86],
  ];

  for (const [label, confidence, expected] of rows) {
    it(`${label}: both paths publish ${expected}`, () => {
      const direct = merged(confidence);
      const viaRoute = merged(asRouteWouldReturn(confidence));
      expect(direct.confidence).toBeCloseTo(expected, 10);
      expect(viaRoute.confidence).toBeCloseTo(expected, 10);
      expect(direct.confidenceLabel).toBe(viaRoute.confidenceLabel);
      expect(direct.retakeRecommended).toBe(viaRoute.retakeRecommended);
    });
  }
});

/**
 * What the cap absorbs, and where it stops absorbing.
 *
 * `next.confidence = Math.max(base.confidence, Math.min(0.86, mean * 0.9))`, so the cap
 * hides any mean at or above 0.86 / 0.9 = 0.95555… and hides nothing below it. That is
 * the whole reason the divergence above was invisible for as long as it was: the two
 * obvious adversarial payloads — everything at 5, everything at 1 — are both on the
 * absorbed side and both read 0.86 either way.
 */
describe("the 0.86 cap, and the band it does not cover", () => {
  it("saturates at exactly 0.86 from a mean of 0.95555… upward", () => {
    const at = 0.86 / 0.9;
    expect(merged({ oil: at, redness: at, pores: at }).confidence).toBeCloseTo(0.86, 10);
    expect(merged({ oil: 1, redness: 1, pores: 1 }).confidence).toBeCloseTo(0.86, 10);
    const below = merged({ oil: 0.9, redness: 0.9, pores: 0.9 });
    expect(below.confidence).toBeCloseTo(0.81, 10);
    expect(below.confidence).toBeLessThan(0.86);
  });

  it("0.86 is below the 높음 gate, so the vision term alone never publishes 높음", () => {
    expect(confidenceLabelFor(0.86)).toBe("보통");
    expect(confidenceLabelFor(0.8614)).toBe("높음");
    expect(merged({ oil: 1, redness: 1, pores: 1 }).confidenceLabel).toBe("보통");
  });

  it("a stronger on-device reading still carries 높음 through Math.max", () => {
    expect(merged({ oil: 1, redness: 1, pores: 1 }, 0.9).confidence).toBeCloseTo(0.9, 10);
    expect(merged({ oil: 1, redness: 1, pores: 1 }, 0.9).confidenceLabel).toBe("높음");
  });
});

/** Non-numbers were already excluded from the aggregate; that has not changed. */
describe("what is excluded from the aggregate entirely", () => {
  it("drops NaN, Infinity and non-numbers rather than clamping them", () => {
    const base = baseReads(0.2);
    const withJunk = mergeVisionAnalysis(base, {
      labels: { oil: 0, redness: 0, pores: 0 },
      confidence: { oil: Number.NaN, redness: Number.POSITIVE_INFINITY, pores: 0.8 },
    } as never);
    // Only `pores` counts, so the mean is 0.8 and the published figure is 0.72.
    expect(withJunk.confidence).toBeCloseTo(0.72, 10);
  });

  it("with no usable confidence at all the base reading is left alone", () => {
    const untouched = mergeVisionAnalysis(baseReads(0.2), {
      labels: { oil: 0, redness: 0, pores: 0 },
      confidence: { oil: "high" as unknown as number },
    } as never);
    expect(untouched.confidence).toBeCloseTo(0.2, 10);
    expect(untouched.confidenceLabel).toBe("낮음");
  });
});
