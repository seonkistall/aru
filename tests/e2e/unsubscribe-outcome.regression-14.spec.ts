import { expect, test, type Page } from "@playwright/test";

/**
 * Revoking consent is the one action in the product that must not fail quietly.
 *
 * `POST /api/reengage/unsubscribe` has four outcomes and only ONE of them means the
 * link is finished: 400 (the token does not verify), 503 (UNSUBSCRIBE_SECRET or the
 * Supabase admin client is not configured), 500 (the consent write failed), and a
 * request that never arrives, which the page's own `.catch(() => null)` collapses into
 * the same `null` as a rejection. Until 2026-09-23 all four rendered
 * "이 링크는 사용할 수 없거나 유효 기간이 지났어요." — so a person whose unsubscribe
 * was blocked by ARU's own misconfiguration was told their link had expired, stopped
 * trying, and kept receiving the mail they had asked to stop.
 *
 * Each case drives the real page against a stubbed route, because the mapping under
 * test is from an HTTP outcome to a sentence and nothing shorter exercises it.
 */

const EXPIRED = "이 링크는 사용할 수 없거나 유효 기간이 지났어요.";
const RETRYABLE = "지금은 해지를 처리하지 못했어요. 잠시 후 다시 시도해 주세요. 계속 안 되면 받은 메일에 회신해 주세요.";
const DONE = "이메일 알림을 해지했어요. 이제 2주·4주 알림을 보내지 않을게요.";

async function openWithToken(page: Page) {
  await page.addInitScript(() => localStorage.setItem("aru.lang", "ko"));
  await page.goto("/unsubscribe?token=stub-token-for-the-route-below");
}

async function clickUnsubscribe(page: Page) {
  const button = page.getByRole("button", { name: "이메일 알림 해지하기" });
  await expect(button).toBeEnabled();
  await button.click();
}

test("a 400 is the only outcome that tells the reader their link is finished", async ({ page }) => {
  await page.route("**/api/reengage/unsubscribe", (route) =>
    route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "invalid token" }) }),
  );
  await openWithToken(page);
  await clickUnsubscribe(page);
  await expect(page.getByText(EXPIRED)).toBeVisible();
  await expect(page.getByText(RETRYABLE)).toHaveCount(0);
});

for (const status of [500, 503] as const) {
  test(`a ${status} is reported as retryable, not as an expired link`, async ({ page }) => {
    await page.route("**/api/reengage/unsubscribe", (route) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "not configured" }) }),
    );
    await openWithToken(page);
    await clickUnsubscribe(page);
    await expect(
      page.getByText(RETRYABLE),
      `a ${status} from ARU's own server was not reported as something worth retrying`,
    ).toBeVisible();
    await expect(
      page.getByText(EXPIRED),
      `a ${status} told the reader their unsubscribe link had expired`,
    ).toHaveCount(0);
    // And the way back is still open: the button has to be usable again.
    await expect(page.getByRole("button", { name: "이메일 알림 해지하기" })).toBeEnabled();
  });
}

test("a request that never arrives is reported as retryable", async ({ page }) => {
  await page.route("**/api/reengage/unsubscribe", (route) => route.abort("connectionfailed"));
  await openWithToken(page);
  await clickUnsubscribe(page);
  await expect(page.getByText(RETRYABLE)).toBeVisible();
  await expect(page.getByText(EXPIRED)).toHaveCount(0);
});

test("a success still confirms the revocation", async ({ page }) => {
  await page.route("**/api/reengage/unsubscribe", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
  await openWithToken(page);
  await clickUnsubscribe(page);
  await expect(page.getByText(DONE)).toBeVisible();
});

test("the missing-token explanation is page content, not an alert fired at load", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("aru.lang", "ko"));
  await page.goto("/unsubscribe");

  const note = page.getByText(EXPIRED);
  await expect(note, "the reader is not told why the button is disabled").toBeVisible();

  // `role="alert"` is a live region. Content present in it on the FIRST render is not
  // an announcement of a change, so a screen reader may never read out the one
  // sentence explaining why the only control on the page cannot be used. It is the
  // page's own explanation, so it is described text on the button instead.
  // Scoped to `main`: the Next.js dev-tools overlay puts its own `role="alert"` in the
  // document, and an unscoped count would be measuring the toolbar, not the product.
  await expect(
    page.locator('main [role="alert"]'),
    "the missing-token explanation is still a live region whose content was there before the region was",
  ).toHaveCount(0);

  const button = page.getByRole("button", { name: "이메일 알림 해지하기" });
  await expect(button).toBeDisabled();
  const describedBy = await button.getAttribute("aria-describedby");
  expect(describedBy, "the disabled button is not tied to the sentence explaining it").toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toHaveText(EXPIRED);
});
