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

  it("attaches a watch-out exactly when a pick can't guarantee the avoid list", () => {
    const result = recommend({ ...baseSurvey, avoid: ["향료", "알코올", "에센셜오일"] }, null);
    // The contract: watchOut is present iff the pick isn't fully avoid-clear
    // (catalog-independent).
    for (const pick of result.picks) {
      expect(Boolean(pick.watchOut)).toBe(!pick.avoidedClear);
    }
  });

  it("applies scan concerns and marks scanApplied when confidence is high", () => {
    const result = recommend(baseSurvey, { oil: 3, redness: 2, pores: 2, confidence: 0.9 });
    expect(result.scanApplied).toBe(true);
  });

  it("ignores a low-confidence / retake scan", () => {
    const result = recommend(baseSurvey, { oil: 3, redness: 2, pores: 2, confidence: 0.3, retakeRecommended: true });
    expect(result.scanApplied).toBe(false);
  });

  it("discloses 'both' when neither the budget nor the avoid list can be met", () => {
    // 선크림 SKUs are 18000/20000 and neither is 알코올-free → both constraints
    // unsatisfiable at a 1만원대 budget. Must NOT silently claim budget honored.
    const result = recommend({ type: "민감성", concerns: [], category: "선크림", budget: 15000, avoid: ["알코올"] }, null);
    expect(result.picks.length).toBeGreaterThan(0);
    expect(result.relaxed).toBe("both");
    expect(result.note).toBeDefined();
    expect(result.note).toContain("예산"); // budget stretch disclosed
    expect(result.note).toContain("제외 성분"); // avoid stretch disclosed
  });

  it("keeps the budget-relaxation note even alongside a low-confidence scan", () => {
    // Serums are 22000/24000 (>1만원대) so budget must relax; a retake scan must
    // not suppress that disclosure.
    const result = recommend(
      { type: "지성", concerns: [], category: "세럼", budget: 15000, avoid: [] },
      { oil: 1, redness: 0, pores: 0, confidence: 0.4, retakeRecommended: true }
    );
    expect(result.relaxed).toBe("budget");
    expect(result.note).toContain("스캔"); // scan-ambiguous line present
    expect(result.note).toContain("예산"); // budget relaxation NOT suppressed
  });
});
