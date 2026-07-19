import { expect, test } from "@playwright/test";

const survey = {
  type: "복합성",
  concerns: ["붉은기"],
  budget: 39000,
  avoid: [],
  category: "크림",
};

// Regression: ISSUE-003 — the report summary rendered the invalid particle "크림를".
// Found by product QA on 2026-07-19.
// Report: .gstack/qa-reports/qa-report-aru-local-2026-07-19.md
test("report summary uses a particle-neutral category sentence", async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.setItem("aru.lang", "ko");
    sessionStorage.setItem("gyeol_survey", JSON.stringify(value));
  }, survey);
  await page.goto("/report");
  await page.getByRole("tab", { name: /살펴볼 제품 후보/ }).click();

  await expect(page.getByText(/크림 제품 후보/).first()).toBeVisible();
  await expect(page.getByText(/크림를/)).toHaveCount(0);
});
