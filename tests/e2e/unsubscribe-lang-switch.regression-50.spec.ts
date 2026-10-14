import { expect, test, type Page } from "@playwright/test";

/**
 * /unsubscribe forgot the visitor had already unsubscribed when they switched language.
 *
 * A reminder email lands a recipient with no saved language on the English page. They
 * unsubscribe, read "Email reminders have been stopped…", and switch to 한국어 to read
 * it in their own language. The provider remounts the subtree under `key={active}`
 * (`lib/i18n.tsx`), the form's state went back to `idle`, and the prompt and the
 * 해지하기 button returned as if nothing had happened, inviting a second POST. Found by
 * the cycle 114 bug hunt. The form now remembers, per tab, which tokens it unsubscribed.
 */

const DONE_KO = "이메일 알림을 해지했어요. 이제 2주·4주 알림을 보내지 않을게요.";
const DONE_EN = "Email reminders have been stopped. We won't send the 2- or 4-week reminders.";

async function switchToKorean(page: Page) {
  await page.click('button[aria-label="Language"]');
  await page.getByRole("option", { name: /한국어/ }).click();
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");
  await expect.poll(async () => page.evaluate(() => document.body.hasAttribute("inert")), { timeout: 20_000 }).toBe(false);
}

test("the unsubscribe confirmation survives a language switch", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/reengage/unsubscribe", (route) => {
    posts += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem("aru.lang")) localStorage.setItem("aru.lang", "en");
  });
  await page.goto("/unsubscribe?token=stub-token-for-the-route-above");

  const button = page.getByRole("button", { name: "Unsubscribe from email reminders" });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByText(DONE_EN)).toBeVisible();

  await switchToKorean(page);

  await expect(page.getByText(DONE_KO)).toBeVisible();
  await expect(page.getByRole("button", { name: "이메일 알림 해지하기" })).toHaveCount(0);
  expect(posts).toBe(1);
});
