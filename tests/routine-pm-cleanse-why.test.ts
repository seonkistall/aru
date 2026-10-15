import { describe, expect, it } from "vitest";
import { recommend, type Survey } from "@/lib/recommend";
import type { Concern, SkinType } from "@/lib/skus";

/**
 * The evening cleanse step explained a body it did not show.
 *
 * pm-cleanse's title and body take the "더 꼼꼼하게" branch whenever the skin type alone is
 * oily (지성 / 복합성), but its why line followed that branch only for an oil concern or
 * an oil scan. A 복합성 visitor who picked 붉은기 therefore read "저녁 세안은 조금 더
 * 꼼꼼하게" over "민감 고민 답변에 맞춰 저녁 세안도 순하게 잡았어요.", a sentence written
 * for the gentle body that is not on screen. Found by the cycle 120 bug hunt.
 */
const TYPES: SkinType[] = ["지성", "건성", "복합성", "민감성", "중성"];
const CONCERNS: Concern[] = ["모공", "블랙헤드", "붉은기", "건조", "수분부족", "유분", "트러블", "잡티", "칙칙함", "각질", "탄력", "민감"];
const THOROUGH = "저녁 세안은 조금 더 꼼꼼하게";
const GENTLE_WHYS = ["민감 고민 답변에 맞춰 저녁 세안도 순하게 잡았어요.", "붉은기 신호가 있어서 저녁에도 부드러운 세안을 권해요."];

function subsets<T>(items: T[]): T[][] {
  return Array.from({ length: 1 << items.length }, (_, mask) => items.filter((_, i) => mask & (1 << i)));
}

describe("pm-cleanse", () => {
  it("never pairs the thorough title with a gentle why, over every type and concern set", () => {
    let thorough = 0;
    const mismatched: string[] = [];
    for (const type of TYPES) {
      for (const concerns of subsets(CONCERNS)) {
        const survey: Survey = { type, concerns, budget: 30000, avoid: [], category: "세럼" };
        for (const scan of [null, { oil: 1, redness: 2, pores: 0, confidence: 0.9, retakeRecommended: false, source: "roi" }]) {
          const step = recommend(survey, scan).routine.pm.find((s) => s.id === "pm-cleanse");
          if (step?.title !== THOROUGH) continue;
          thorough += 1;
          if (GENTLE_WHYS.includes(step.why) && mismatched.length < 3) mismatched.push(`${type} ${concerns.join("+")} scan=${scan ? "yes" : "no"}`);
        }
      }
    }
    expect(thorough).toBeGreaterThan(0);
    expect(mismatched).toEqual([]);
  });

  it("keeps the gentle why under the gentle title", () => {
    const survey: Survey = { type: "건성", concerns: ["붉은기"], budget: 30000, avoid: [], category: "세럼" };
    const step = recommend(survey, null).routine.pm.find((s) => s.id === "pm-cleanse");
    expect(step?.title).toBe("저녁에도 부드럽게 씻기");
    expect(step?.why).toBe("민감 고민 답변에 맞춰 저녁 세안도 순하게 잡았어요.");
  });
});
