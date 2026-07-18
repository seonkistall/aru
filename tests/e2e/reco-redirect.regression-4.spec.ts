import { expect, test } from "@playwright/test";

// Regression: ISSUE-004 — /reco rendered an empty client shell before redirecting.
// Found by product QA on 2026-07-19.
// Report: .gstack/qa-reports/qa-report-aru-local-2026-07-19.md
test("legacy recommendation route redirects before rendering", async ({ page }) => {
  const recoStatuses: number[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname === "/reco" && response.request().resourceType() === "document") {
      recoStatuses.push(response.status());
    }
  });

  await page.goto("/reco");

  expect(recoStatuses).toEqual([307]);
  await expect(page).toHaveURL(/\/(report|survey)$/);
});
