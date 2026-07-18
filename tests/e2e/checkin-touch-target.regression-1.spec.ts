import { expect, test } from "@playwright/test";

// Regression: ISSUE-001 — the check-in home link rendered at 22×22px.
// Found by product QA on 2026-07-19.
// Report: .gstack/qa-reports/qa-report-aru-local-2026-07-19.md
test("check-in home link meets the mobile touch-target contract", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("aru.lang", "ko"));
  await page.goto("/checkin");

  const home = page.getByRole("link", { name: "아루" });
  await expect(home).toBeVisible();

  const box = await home.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
