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
    expect(budgetLabel(15000)).toBe("1만원");
    expect(budgetLabel(25000)).toBe("2만원");
    expect(budgetLabel(35000)).toBe("3만원");
    expect(budgetLabel(49000)).toBe("4만원");
  });

  it("collapses everything at/above 50k into the top bucket", () => {
    expect(budgetLabel(50000)).toBe("5만원 이상");
    expect(budgetLabel(60000)).toBe("5만원 이상");
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
      if (step.heroNote) expect(efficacyClean(step.heroNote).ok, `heroNote: ${step.heroNote}`).toBe(true);
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

  it("does not falsely relax budget when in-band products fit the chip ceiling", () => {
    // The "1만원대" chip stores its band ceiling (19000); toners are 16000-19000,
    // all within the band, so the budget must be honored — not stretched.
    const result = recommend({ type: "복합성", concerns: [], budget: 19000, avoid: [], category: "토너" }, null);
    expect(result.relaxed).not.toBe("budget");
    expect(result.relaxed).not.toBe("both");
    expect(budgetLabel(19000)).toBe("1만원");
  });

  it("keeps the budget-relaxation note even alongside a low-confidence scan", () => {
    // Serums are 22000/24000 (>1만원대) so budget must relax; a retake scan must
    // not suppress that disclosure.
    const result = recommend(
      { type: "지성", concerns: [], category: "세럼", budget: 15000, avoid: [] },
      { oil: 1, redness: 0, pores: 0, confidence: 0.4, retakeRecommended: true }
    );
    expect(result.relaxed).toBe("budget");
    expect(result.note).toContain("촬영 조건"); // low-confidence camera line present
    expect(result.note).toContain("예산"); // budget relaxation NOT suppressed
  });

  it("attaches the chosen sunscreen to the sun step, not a hydration step", () => {
    // survey.category 선크림 collides with the dedicated am-protect step; the
    // hydrate steps must not claim it (else the sunscreen shows on a 수분 step
    // and the real sun step is product-less).
    const result = recommend({ type: "지성", concerns: ["유분"], category: "선크림", budget: 25000, avoid: [] }, null);
    expect(result.relaxed).toBeNull();
    const amProtect = result.routine.am.find((s) => s.id === "am-protect");
    const amHydrate = result.routine.am.find((s) => s.id === "am-hydrate");
    const pmHydrate = result.routine.pm.find((s) => s.id === "pm-hydrate");
    expect(amProtect?.heroSku?.category).toBe("선크림");
    expect(amHydrate?.heroSku).toBeUndefined();
    expect(pmHydrate?.heroSku).toBeUndefined();
  });

  it("does not claim budget-fit in pick reasons when the budget was relaxed", () => {
    const result = recommend({ type: "지성", concerns: [], category: "세럼", budget: 19000, avoid: [] }, null);
    expect(result.relaxed).toBe("budget");
    for (const pick of result.picks) {
      // over-budget picks must not assert they were chosen to fit the budget
      expect(pick.reason).not.toContain("예산을 함께 보고 고른");
      expect(pick.reason).toContain("가장 가까운");
      expect(efficacyClean(pick.reason).ok, `reason: ${pick.reason}`).toBe(true);
    }
  });
});

describe("an exact score tie is broken by price, not by accumulation order", () => {
  // scoreSku adds 3, 2, 1.2, 1.5 and 2 — every weight a multiple of 0.1, so the exact
  // score is one too. The ADDITIONS are not exact, and the order they arrive in depends
  // on which concerns each SKU declares, so two SKUs that tie mathematically can end up
  // as two different doubles. `rank` used the raw difference as its first sort key, and
  // `||` treats 1.78e-15 as a real ordering, so the price key never ran.
  const tieSurvey: Survey = {
    type: "지성",
    concerns: ["모공", "건조", "트러블"],
    budget: 29000,
    avoid: [],
    category: "토너",
  };

  it("is a real hazard: the same score reached in two orders is two different doubles", () => {
    // The two accumulation orders scoreSku actually walks for tn1 and tn2 under
    // tieSurvey. Written out rather than described, so this documents the mechanism
    // instead of asserting the platform has floats.
    const asTn1 = 3 + 2 + 1.2 + 1.2 + 2 + 1.2 + 1.5 + 2;
    const asTn2 = 3 + 2 + 1.2 + 2 + 1.2 + 1.2 + 1.5 + 2;
    expect(asTn1).not.toBe(asTn2);
    expect(asTn1 - asTn2).toBeCloseTo(1.7763568394002505e-15, 20);
    // And why rounding to tenths is exact rather than merely tolerant.
    expect(Math.round(asTn1 * 10)).toBe(Math.round(asTn2 * 10));
  });

  it("puts the cheaper of two equally-scored toners first", () => {
    const { picks } = recommend(tieSurvey, null);
    // Both score 14.1. Before the fix this read tn1 19,000원 ahead of tn2 18,000원.
    expect(picks.map((pick) => `${pick.sku.id} ${pick.sku.price}`)).toEqual([
      "tn2 18000",
      "tn1 19000",
      "tn3 16000",
    ]);
  });

  it("carries the corrected pick into the routine hero, which is where a user sees it", () => {
    // The top pick is attached to both hydrate steps (`attach`), so a tie decided by
    // accumulation order does not stay inside the pick list.
    const { picks, routine } = recommend(tieSurvey, null);
    const amHydrate = routine.am.find((step) => step.id === "am-hydrate");
    const pmHydrate = routine.pm.find((step) => step.id === "pm-hydrate");
    expect(amHydrate?.heroSku?.id).toBe("tn2");
    expect(pmHydrate?.heroSku?.id).toBe("tn2");
    expect(amHydrate?.heroSku?.id).toBe(picks[0].sku.id);
  });

  it("does not reorder picks whose scores genuinely differ", () => {
    // The fix must not become "cheapest first". baseSurvey's picks come out in the same
    // order before and after it — verified against the pre-fix module, not assumed — and
    // the 16,000원 tn3 stays last, behind the 19,000원 tn1 that outscores it.
    const { picks } = recommend(baseSurvey, null);
    expect(picks.length).toBeGreaterThan(1);
    expect(picks.map((pick) => `${pick.sku.id} ${pick.sku.price}`)).toEqual([
      "tn2 18000",
      "tn1 19000",
      "tn3 16000",
    ]);
  });
});
