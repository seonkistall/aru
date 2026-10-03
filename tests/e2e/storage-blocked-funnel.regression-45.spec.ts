import { expect, test, type Page } from "@playwright/test";

/**
 * The funnel in a browser that refuses `sessionStorage`.
 *
 * The defect this pins: `/survey`'s submit wrote the answers with
 * `sessionStorage.setItem` and, on a throw, showed
 * "설문을 저장하지 못했어요…" and returned; `/report` and `/care` read the same answers
 * back out of `sessionStorage` and nowhere else. So the funnel ENDED at `/survey` —
 * no report, no merchant link. Measured on a production build at 360x800 in `ko`,
 * before the fix: submit stayed on `/survey` with the error shown in all three
 * blocked modes below, a hand-typed `/report` rendered the error boundary (getItem
 * blocked) or bounced back to `/survey` (setItem only), and `/care` had 0 merchant
 * panels in all three.
 *
 * Three modes, because browsers break this three different ways:
 *   - `both`   — `getItem` and `setItem` throw (an in-app browser, a blocked store)
 *   - `set`    — only `setItem` throws (a full quota)
 *   - `access` — touching `window.sessionStorage` throws, which is what Chrome with
 *                "block all cookies" does
 *
 * `both` and `set` are installed on `Storage.prototype`, which `localStorage` shares,
 * so each of those contexts gets a Map-backed `localStorage` put back: the assertions
 * below are about the sessionStorage fallback and must not be satisfied by
 * `loadLastResult()`. In `access` only the sessionStorage property is taken away, so
 * `localStorage` is the real one — which is why that mode, and only that mode,
 * survives the reload at the end.
 *
 * No merchant redirect is ever followed: `window.open` is replaced by a collector and
 * every `/api/out` request is fulfilled locally.
 */

type Mode = "none" | "both" | "set" | "access";

// Serialised into the page by addInitScript, so nothing from this module's scope
// exists inside it and every key is a literal.
function breakStorage(mode: Mode) {
  const blocked = () => {
    const error = new Error("blocked");
    error.name = "SecurityError";
    throw error;
  };
  if (mode === "access") {
    Object.defineProperty(window, "sessionStorage", { configurable: true, get: blocked });
  } else if (mode === "both") {
    Storage.prototype.setItem = blocked;
    Storage.prototype.getItem = blocked;
  } else if (mode === "set") {
    Storage.prototype.setItem = blocked;
  }
  if (mode === "both" || mode === "set") {
    const memory = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => ({
        getItem: (key: string) => (memory.has(String(key)) ? memory.get(String(key)) : null),
        setItem: (key: string, value: string) => void memory.set(String(key), String(value)),
        removeItem: (key: string) => void memory.delete(String(key)),
        clear: () => memory.clear(),
        key: (index: number) => [...memory.keys()][index] ?? null,
        get length() {
          return memory.size;
        },
      }),
    });
  }
  try {
    localStorage.setItem("aru.lang", "ko");
  } catch {
    /* the language falls back to the browser's, which these assertions do not read */
  }
  (window as unknown as { __opened: string[] }).__opened = [];
  window.open = ((url?: string | URL) => {
    (window as unknown as { __opened: string[] }).__opened.push(String(url));
    return null;
  }) as typeof window.open;
}

const SAVE_ERR = "설문을 저장하지 못했어요";
const CARE_DEAD_END = "아직 이어서 볼 리포트가 없어요.";
const ERROR_BOUNDARY = "앗, 잠깐 멈췄어요";

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}

async function openContext(browser: import("@playwright/test").Browser, mode: Mode) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(breakStorage, mode);
  await context.route("**/api/out*", (route) => route.fulfill({ status: 204, body: "" }));
  return context;
}

/** The three required chips, then submit. */
async function completeSurvey(page: Page) {
  for (const name of ["세럼", "건성", "2만원"]) {
    await page.getByRole("button", { name, exact: true }).first().click();
  }
  const submit = page.getByRole("button", { name: "내 스킨케어 결과 보기" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForTimeout(1500);
}

async function openPicksStep(page: Page) {
  const tabs = page.locator('[role="tab"]');
  await expect(tabs).toHaveCount(3);
  await tabs.nth(1).click();
  await page.waitForTimeout(300);
}

for (const mode of ["both", "set", "access"] as const) {
  test(`a visitor whose sessionStorage throws (${mode}) still reaches the report and the routine`, async ({ browser }) => {
    const context = await openContext(browser, mode);
    const page = await context.newPage();

    await page.goto("/survey");
    await settle(page);
    await completeSurvey(page);

    // The funnel's own navigation, not a hand-typed URL: this is the step that used
    // to end here.
    await expect(page.getByText(SAVE_ERR)).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/report");
    await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);

    await openPicksStep(page);
    // Three product cards plus the summary out-link: the paying path.
    await expect(page.locator('a[href^="/api/out"]')).toHaveCount(4);

    // /care through the in-app link. `router.push` keeps the JS modules alive, which
    // is what the in-memory fallback rides on.
    const careLink = page.locator('a[href="/care"]');
    await expect(careLink).toHaveCount(1);
    await careLink.first().click();
    await settle(page);
    expect(new URL(page.url()).pathname).toBe("/care");
    await expect(page.getByText(CARE_DEAD_END)).toHaveCount(0);
    await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
    await expect(page.locator('[id^="care-merchants-"]')).toHaveCount(3);

    // Nothing opened a merchant tab.
    expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length)).toBe(0);

    // The limit, pinned rather than left to be assumed: a full document load drops
    // the in-memory copy. `access` keeps a real localStorage, so `loadLastResult()`
    // brings the report back there and only there.
    await page.reload();
    await settle(page);
    await expect(page.locator('[id^="care-merchants-"]')).toHaveCount(mode === "access" ? 3 : 0);

    await context.close();
  });
}

test("a browser whose storage works is unchanged", async ({ browser }) => {
  const context = await openContext(browser, "none");
  const page = await context.newPage();

  await page.goto("/survey");
  await settle(page);
  await completeSurvey(page);
  expect(new URL(page.url()).pathname).toBe("/report");

  await openPicksStep(page);
  await expect(page.locator('a[href^="/api/out"]')).toHaveCount(4);

  await page.locator('a[href="/care"]').first().click();
  await settle(page);
  await expect(page.locator('[id^="care-merchants-"]')).toHaveCount(3);
  // And here the reload survives, because sessionStorage holds the answers.
  await page.reload();
  await settle(page);
  await expect(page.locator('[id^="care-merchants-"]')).toHaveCount(3);
  expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length)).toBe(0);

  await context.close();
});
