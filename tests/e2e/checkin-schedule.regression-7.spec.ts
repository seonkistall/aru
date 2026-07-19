import { expect, test } from "@playwright/test";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Regression: ISSUE-007 — a 3-week-old product use was labeled as week 4.
// Found by product QA on 2026-07-19.
// Report: .gstack/qa-reports/qa-report-aru-local-2026-07-19.md
test("week-four check-in does not open before four real weeks", async ({ page }) => {
  await page.addInitScript(({ startedAt }) => {
    localStorage.setItem("aru.lang", "ko");
    if (localStorage.getItem("gyeol_purchases")) return;
    localStorage.setItem(
      "gyeol_purchases",
      JSON.stringify([
        {
          id: "qa-use",
          sku_id: "cr3",
          name: "레드 블레미쉬 수분 크림",
          confirmedUse: true,
          ts: startedAt,
        },
      ])
    );
  }, { startedAt: Date.now() - 3.5 * WEEK_MS });

  await page.goto("/checkin");

  await expect(page.getByText("2주차")).toBeVisible();
  await expect(page.getByText("4주차")).toHaveCount(0);

  await page.evaluate((startedAt) => {
    const uses = JSON.parse(localStorage.getItem("gyeol_purchases") ?? "[]");
    localStorage.setItem("gyeol_purchases", JSON.stringify(uses.map((use: { ts: number }) => ({ ...use, ts: startedAt }))));
  }, Date.now() - 4 * WEEK_MS);
  await page.reload();

  await expect(page.getByText("4주차")).toBeVisible();
});
