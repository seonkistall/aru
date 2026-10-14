import { afterEach, describe, expect, it } from "vitest";
import { budgetLabel, recommend, type Survey } from "@/lib/recommend";
import * as core from "@/lib/i18n/core";
import { parseReasonInput } from "@/lib/server/ai-input";

/**
 * /report sends each pick's template reason as `fallback`, and /api/reason's input
 * check gave it the same 200-character cap as the fields that go into the prompt. One
 * item over refuses the whole request, so those visitors never got a model-written
 * reason. Only English goes over: the cycle 114 sweep (5 types × 8 categories × 5
 * budgets × 14 concern sets (none, each of the 12, all 12) × 9 avoid sets (none, each
 * of the 7, all 7) × without/with a scan of oil 2, redness 1, pores 1 at confidence
 * 0.9, per language) found the longest template at ko 103, en 224, ja 96, zh 62 and
 * ar 173 characters, and 1042 of 50400 English requests refused. The sweep below is
 * the narrower English one at the lowest budget, which is enough to cross 200.
 */
const TYPES = ["지성", "건성", "복합성", "민감성", "중성"] as const;
const CONCERNS = ["모공", "블랙헤드", "붉은기", "건조", "수분부족", "유분", "트러블", "잡티", "칙칙함", "각질", "탄력", "민감"] as const;
const CATEGORIES = ["클렌저", "토너", "에센스", "세럼", "크림", "선크림", "마스크팩", "아이크림"] as const;
const AVOIDS = ["향료", "알코올", "에센셜오일", "파라벤", "실리콘", "인공색소", "광물성오일"] as const;
const SCANS = [null, { oil: 2, redness: 1, pores: 1, confidence: 0.9, retakeRecommended: false }];

// The request body exactly as app/report/page.tsx builds it.
function reportItems(survey: Survey, scan: (typeof SCANS)[number]) {
  return recommend(survey, scan as Parameters<typeof recommend>[1]).picks.map((pick) => ({
    brand: pick.sku.brand,
    name: pick.sku.name,
    category: pick.sku.category,
    type: survey.type,
    matched: survey.concerns.filter((concern) => pick.sku.concerns.includes(concern)),
    budgetText: budgetLabel(survey.budget),
    freeOf: pick.avoidedClear && survey.avoid.length ? survey.avoid : [],
    fallback: pick.reason,
  }));
}

afterEach(() => core.setCurrentLang("ko"));

describe("/api/reason accepts the fallback /report sends", () => {
  it("accepts every English request at the lowest budget, where the long template appears", async () => {
    await core.loadDict("en");
    core.setCurrentLang("en");
    let longest = 0;
    let refused = 0;
    for (const type of TYPES)
      for (const category of CATEGORIES)
        for (const concerns of [[], ...CONCERNS.map((c) => [c])])
          for (const avoid of [[], ...AVOIDS.map((a) => [a])])
            for (const scan of SCANS) {
              const survey = { type, category, budget: 19000, concerns, avoid } as Survey;
              const items = reportItems(survey, scan);
              if (!items.length) continue;
              for (const item of items) longest = Math.max(longest, item.fallback.length);
              if (!parseReasonInput({ items, lang: "en" }).ok) refused += 1;
            }
    // The sweep has to reach past the old cap, or it proves nothing.
    expect(longest).toBeGreaterThan(200);
    expect(refused).toBe(0);
  });

  it("still caps the fields that go into the prompt at 200", () => {
    const item = { brand: "b", name: "n", category: "c", type: "t", matched: [], budgetText: "x", freeOf: [], fallback: "f".repeat(600) };
    expect(parseReasonInput({ items: [item] }).ok).toBe(true);
    expect(parseReasonInput({ items: [{ ...item, fallback: "f".repeat(601) }] }).ok).toBe(false);
    expect(parseReasonInput({ items: [{ ...item, brand: "b".repeat(201) }] }).ok).toBe(false);
    expect(parseReasonInput({ items: [{ ...item, budgetText: "x".repeat(201) }] }).ok).toBe(false);
  });
});
