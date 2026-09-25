import { afterEach, describe, expect, it } from "vitest";
import { recommend, type Survey } from "@/lib/recommend";
// Dictionaries load per locale in the browser (lib/i18n/core.ts); this test
// switches language synchronously, so it registers all four up front.
import "@/lib/i18n/all";
import { setCurrentLang, type Lang } from "@/lib/i18n/core";

const creamSurvey: Survey = {
  type: "복합성",
  concerns: ["붉은기"],
  budget: 39000,
  avoid: [],
  category: "크림",
};

afterEach(() => setCurrentLang("ko"));

describe("recommendation sentence grammar", () => {
  // Regression: ISSUE-003 — variable categories produced "크림예요" and "세럼로".
  // Found by product QA on 2026-07-19.
  // Report: .gstack/qa-reports/qa-report-aru-local-2026-07-19.md
  it("keeps Korean category names away from variable particles", () => {
    setCurrentLang("ko");
    const regular = recommend(creamSurvey, null);
    expect(regular.picks[0]?.reason).toContain("크림 제품");
    expect(regular.picks[0]?.reason).not.toContain("크림예요");

    const relaxed = recommend({ ...creamSurvey, category: "세럼", budget: 15000 }, null);
    expect(relaxed.picks[0]?.reason).toContain("세럼 제품");
    expect(relaxed.picks[0]?.reason).not.toContain("세럼로");
  });

  it.each(["en", "ja", "zh", "ar"] as const)("translates the neutral category template in %s", (lang: Lang) => {
    setCurrentLang(lang);
    const reason = recommend(creamSurvey, null).picks[0]?.reason ?? "";

    expect(reason).not.toContain("제품으로 골랐어요");
    expect(reason).not.toMatch(/\bA Cream\b/);
  });
});
