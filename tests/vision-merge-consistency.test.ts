import { describe, expect, it } from "vitest";
import { mergeVisionAnalysis } from "@/app/scan/capture-analysis";
import { headlineFor, localizedNarrative, narrativeFor, overallFor, type Bucket, type SkinReads } from "@/lib/skin";
import { getLang, setCurrentLang } from "@/lib/i18n/core";

/**
 * `mergeVisionAnalysis` rewrites oil, redness and pores when a vision key is configured
 * and the user has consented. Three fields are derived from exactly those three buckets
 * — the headline, the narrative sentence and the 전반 row — and all three used to arrive
 * through `...base`, computed from the buckets as they were before the merge.
 *
 * The result a user could see: the `<h1>` on /report reading 피부 컨디션이 비교적
 * 안정적이에요 directly above a row reading 붉은기 뚜렷, from one scan of one face. It is
 * not a rounding disagreement; it is the page contradicting itself, which is worse for
 * trust than either reading alone.
 */

const calm = (value: string): Bucket => ({ value, level: 0, calm: true, confidence: 0.7 });

function calmBase(): SkinReads {
  const oil = calm("낮음");
  const redness = calm("낮음");
  const pores = calm("매끈");
  return {
    oil,
    redness,
    pores,
    overall: overallFor(oil, redness, pores, 0.7),
    headline: headlineFor(oil, redness, pores),
    narrative: narrativeFor(oil, redness, pores),
    confidence: 0.7,
    confidenceLabel: "보통",
    retakeRecommended: false,
    retakeReasons: [],
    signals: [],
    source: "roi-calibrated",
    raw: {} as SkinReads["raw"],
  };
}

describe("mergeVisionAnalysis keeps the report agreeing with itself", () => {
  // The vision model disagrees with the on-device read and calls the skin inflamed.
  const merged = () =>
    mergeVisionAnalysis(calmBase(), {
      labels: { oil: 2, redness: 2, pores: 1 },
      confidence: { oil: 0.9, redness: 0.9, pores: 0.9 },
    });

  it("rewrites the headline when it rewrites the buckets", () => {
    const next = merged();
    expect(next.redness.level).toBe(2);
    expect(next.headline).toBe(headlineFor(next.oil, next.redness, next.pores));
    // The specific contradiction that shipped.
    expect(next.headline).not.toBe("피부 컨디션이 비교적 안정적이에요");
  });

  it("rewrites the narrative, so ko and en do not describe different faces", () => {
    const next = merged();
    expect(next.narrative).toBe(narrativeFor(next.oil, next.redness, next.pores));
    // localizedNarrative returns the stored Korean sentence as-is for ko and rebuilds
    // it from the levels for every other language. A stale stored sentence therefore
    // showed a Korean user one face and an English user another, from one object.
    const previous = getLang();
    try {
      setCurrentLang("ko");
      const korean = localizedNarrative(next);
      setCurrentLang("en");
      const english = localizedNarrative(next);
      expect(korean).toBe(next.narrative);
      expect(english).not.toBe("");
      // Both must describe redness as raised; the Korean is the template's own wording.
      expect(korean).toContain("붉은기가 눈에 띄어요");
    } finally {
      setCurrentLang(previous);
    }
  });

  it("rewrites the 전반 row", () => {
    const next = merged();
    expect(next.overall).toEqual(overallFor(next.oil, next.redness, next.pores, next.confidence));
    expect(next.overall.value).toBe("균형 관리 필요");
    expect(next.overall.calm).toBe(false);
  });

  it("still lets the vision payload's own narrative win", () => {
    const next = mergeVisionAnalysis(calmBase(), {
      labels: { redness: 2 },
      confidence: { redness: 0.9 },
      narrative: "모델이 직접 쓴 문장이에요.",
    });
    expect(next.narrative).toBe("모델이 직접 쓴 문장이에요.");
    // The headline is not an override point, so it still has to follow the buckets.
    expect(next.headline).toBe(headlineFor(next.oil, next.redness, next.pores));
  });

  it("leaves a merge that changed nothing exactly as it was", () => {
    const base = calmBase();
    const next = mergeVisionAnalysis(base, {});
    expect(next.headline).toBe(base.headline);
    expect(next.narrative).toBe(base.narrative);
    expect(next.overall).toEqual(base.overall);
  });

  it("agrees with the ROI path on the same three buckets", () => {
    // readsFromRaw derives all three from the buckets too, so the two paths can only
    // stay consistent by using the same functions — which is why they are exported.
    const next = merged();
    expect(next.headline).toBe(headlineFor(next.oil, next.redness, next.pores));
    expect(next.narrative).toBe(narrativeFor(next.oil, next.redness, next.pores));
    expect(next.overall).toEqual(overallFor(next.oil, next.redness, next.pores, next.confidence));
  });
});
