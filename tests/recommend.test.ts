import { describe, expect, it } from "vitest";
import { budgetLabel, efficacyClean, recommend, type Survey } from "@/lib/recommend";

const baseSurvey: Survey = {
  type: "복합성",
  concerns: ["모공", "유분"],
  budget: 25000,
  avoid: [],
  category: "토너",
};

describe("budgetLabel", () => {
  it("maps chip won values back to their bucket label", () => {
    expect(budgetLabel(15000)).toBe("1만원대");
    expect(budgetLabel(25000)).toBe("2만원대");
    expect(budgetLabel(35000)).toBe("3만원대");
  });

  it("collapses everything at/above 40k into the top bucket", () => {
    expect(budgetLabel(40000)).toBe("4만원 이상");
    expect(budgetLabel(60000)).toBe("4만원 이상");
  });
});

describe("efficacyClean (compliance safety net)", () => {
  it("passes copy with no medical/efficacy claims", () => {
    expect(efficacyClean("피지가 많은 편이라 산뜻한 사용감을 선호해요").ok).toBe(true);
  });

  it("flags banned efficacy words", () => {
    const result = efficacyClean("미백 효과로 주름개선까지");
    expect(result.ok).toBe(false);
    expect(result.flagged).toEqual(expect.arrayContaining(["미백", "효과", "주름개선"]));
  });
});

describe("recommend()", () => {
  it("returns picks and an AM/PM routine", () => {
    const result = recommend(baseSurvey, null);
    expect(result.picks.length).toBeGreaterThan(0);
    expect(result.routine.am.length).toBeGreaterThan(0);
    expect(result.routine.pm.length).toBeGreaterThan(0);
  });

  it("never emits efficacy claims in any pick reason or routine copy", () => {
    const result = recommend(baseSurvey, { oil: 2, redness: 1, pores: 1, confidence: 0.8 });
    for (const pick of result.picks) {
      expect(efficacyClean(pick.reason).ok, `reason: ${pick.reason}`).toBe(true);
      if (pick.watchOut) expect(efficacyClean(pick.watchOut).ok, `watchOut: ${pick.watchOut}`).toBe(true);
    }
    for (const step of [...result.routine.am, ...result.routine.pm]) {
      expect(efficacyClean(step.why).ok, `why: ${step.why}`).toBe(true);
      expect(efficacyClean(step.body).ok, `body: ${step.body}`).toBe(true);
    }
  });

  it("does not claim ingredients were avoided when the survey lists none", () => {
    const result = recommend({ ...baseSurvey, avoid: [] }, null);
    // The avoid-claim guard is survey.avoid.length, not the vacuously-true
    // [].every(). No copy should claim a "제외 성분" was honored.
    for (const pick of result.picks) {
      expect(pick.reason).not.toContain("제외 성분");
      expect(pick.watchOut).toBeUndefined();
    }
    for (const step of [...result.routine.am, ...result.routine.pm]) {
      expect(step.why).not.toContain("뺀 제품");
    }
  });

  it("warns to check ingredients when an avoided-substance can't be guaranteed clear", () => {
    const result = recommend({ ...baseSurvey, avoid: ["향료", "알코올", "에센셜오일"] }, null);
    // With every avoid flag set, at least one pick is unlikely to be fully clear.
    expect(result.picks.some((pick) => pick.watchOut !== undefined)).toBe(true);
  });

  it("applies scan concerns and marks scanApplied when confidence is high", () => {
    const result = recommend(baseSurvey, { oil: 3, redness: 2, pores: 2, confidence: 0.9 });
    expect(result.scanApplied).toBe(true);
  });

  it("ignores a low-confidence / retake scan", () => {
    const result = recommend(baseSurvey, { oil: 3, redness: 2, pores: 2, confidence: 0.3, retakeRecommended: true });
    expect(result.scanApplied).toBe(false);
  });
});
