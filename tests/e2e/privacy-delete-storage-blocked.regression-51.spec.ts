import { expect, test } from "@playwright/test";

/**
 * /privacy's "delete all device data" did nothing in a browser that refuses storage.
 *
 * In Chrome with "block all cookies", reading `window.sessionStorage` itself throws a
 * SecurityError (the `access` mode of `storage-blocked-funnel.regression-45`), and the
 * survey and scan live in `lib/session-store.ts`'s in-memory Map instead. The page built
 * its argument as `{ local: window.localStorage, session: window.sessionStorage }`, so
 * the throw escaped before `clearAllDeviceData` could clear that Map: 모두 지우기 showed
 * neither success nor error, and the submitted survey stayed readable on /report for
 * the rest of the tab. Found by the cycle 114 bug hunt. The page now passes getters, so
 * the Map is cleared and the keys it cannot verify come back as the retry message.
 */

// Serialised into the page by addInitScript; only sessionStorage is taken away.
function blockSessionStorage() {
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get: () => {
      const error = new Error("The operation is insecure.");
      error.name = "SecurityError";
      throw error;
    },
  });
  try {
    localStorage.setItem("aru.lang", "ko");
  } catch {
    /* the language falls back to the browser's */
  }
}

test("deleting device data clears the in-memory survey when sessionStorage access throws", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(blockSessionStorage);
  await context.route("**/api/out*", (route) => route.fulfill({ status: 204, body: "" }));
  const page = await context.newPage();

  await page.goto("/survey");
  for (const name of ["세럼", "건성", "2만원"]) await page.getByRole("button", { name, exact: true }).first().click();
  await page.getByRole("button", { name: "내 스킨케어 결과 보기" }).click();
  await page.waitForURL("**/report");

  // Client-side, so the in-memory session store survives the move to /privacy.
  await page.getByRole("link", { name: "개인정보와 동의" }).first().click();
  await page.waitForURL("**/privacy");
  await page.getByRole("button", { name: "이 기기의 ARU 데이터 모두 지우기" }).click();
  await page.getByRole("button", { name: "모두 지우기", exact: true }).click();

  // The refused area cannot be read back, so the page does not claim it is empty.
  await expect(page.locator('main [role="alert"]')).toContainText("일부 데이터를 삭제하지 못했어요");

  // And the survey held in memory is gone: /report has nothing to rebuild from.
  await page.goBack();
  await page.waitForURL("**/survey");
  await expect(page.locator('main button[aria-pressed="true"]')).toHaveCount(0);

  await context.close();
});
