import { describe, expect, it } from "vitest";
import { recommend, type Survey } from "@/lib/recommend";

const allReasons = (survey: Survey) => {
  const result = recommend(survey, null);
  return [...result.routine.am, ...result.routine.pm].map((step) => step.why).join(" ");
};

describe("routine answer attribution", () => {
  // Regression: ISSUE-002 — skin type was presented as an explicitly answered concern.
  // Found by product QA on 2026-07-19.
  // Report: .gstack/qa-reports/qa-report-aru-local-2026-07-19.md
  it("does not turn combination skin into an oil-concern answer", () => {
    const reasons = allReasons({
      type: "복합성",
      concerns: ["붉은기"],
      budget: 39000,
      avoid: [],
      category: "크림",
    });

    expect(reasons).not.toContain("유분 고민 답변");
    expect(reasons).not.toContain("답해주신 유분 고민");
  });

  it("does not turn sensitive skin into a redness-concern answer", () => {
    const reasons = allReasons({
      type: "민감성",
      concerns: ["건조"],
      budget: 39000,
      avoid: [],
      category: "크림",
    });

    expect(reasons).not.toContain("붉은기·민감 고민");
    expect(reasons).not.toContain("민감·붉은기 답변");
    expect(reasons).not.toContain("붉은기 고민을 답해");
    expect(reasons).not.toContain("민감 고민 답변");
  });
});
