import { expect, test } from "@playwright/test";

const survey = {
  type: "복합성",
  concerns: ["붉은기"],
  budget: 39000,
  avoid: [],
  category: "크림",
};

// Regression: ISSUE-009 — reminder opt-in omitted the active UI locale.
// Found by product QA on 2026-07-19.
// Report: .gstack/qa-reports/qa-report-aru-local-2026-07-19.md
test("reminder opt-in sends the active locale", async ({ page }) => {
  let submittedBody: Record<string, unknown> | undefined;
  await page.route("**/api/reengage/subscribe", async (route) => {
    submittedBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.addInitScript((value) => {
    localStorage.setItem("aru.lang", "en");
    sessionStorage.setItem("gyeol_survey", JSON.stringify(value));
  }, survey);
  await page.goto("/report");
  await page.getByRole("tab", { name: /A simple routine to start today/ }).click();

  await page.getByRole("textbox", { name: "Email address" }).fill("person@example.com");
  await page.getByText("I agree to my email being stored for reminders").click();
  await page.getByRole("button", { name: "Get email reminders" }).click();

  await expect(page.getByRole("status")).toBeVisible();
  expect(submittedBody?.locale).toBe("en");
});
