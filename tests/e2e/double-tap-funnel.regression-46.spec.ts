import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * One double-tap must count once.
 *
 * The defect this pins, measured on a production build at 360x800 in `ko` before the
 * fix, one `dblclick` per surface:
 *
 *   /survey submit        survey_completed=2
 *   /care purchase        window.open=2  commerce_clicked=2
 *   /report summary       tabs=2         commerce_clicked=2
 *   /report product card  tabs=2         commerce_clicked=2
 *
 * `commerce_clicked` is the numerator of the conversion rate the revenue arithmetic in
 * `docs/AUTOPILOT.md` is built on, and it divides by a `care_viewed`/`reco_viewed` that
 * cannot double; `survey_viewed → survey_completed` is the step that arithmetic reads to
 * decide whether the survey is where visitors are lost. So each duplicate makes a number
 * the loop steers by look better than it is.
 *
 * Two different fixes, because the two halves are different defects.
 * `/survey`'s submit has `router.push` in flight and uses a `useRef` flag
 * (`app/survey/page.tsx`). The three click surfaces have nothing in flight — `/care`'s
 * `openCareLink` MUST call `window.open` synchronously inside the click gesture, and the
 * two `<a target="_blank">` links are the browser's own navigation — so they share a
 * short synchronous time window keyed by href (`lib/tap-guard.ts`, unit-tested with fake
 * timers in `tests/tap-guard.test.ts`). On the two anchors the second tab is the
 * browser's own doing, so the handler cancels the navigation as well as the duplicate
 * event; `href`, `target` and `rel` are untouched.
 *
 * The last two tests are the half that matters as much as the dedupe: a DELIBERATE second
 * click, after the window, must still open and must still record. A guard that swallows a
 * visitor's real second visit to a merchant would trade one wrong number for another.
 *
 * No merchant redirect is ever followed: `window.open` is replaced by a collector, every
 * `/api/out` request is fulfilled locally, and so is every host in `ALLOWED_HOSTS`.
 */

const FUNNEL_KEY = "aru_funnel_events_v1";

// Every merchant host `lib/commerce.ts` allows, so a real network request can never
// leave this suite even if a link's href changes shape.
const MERCHANT_HOSTS = [
  "https://www.oliveyoung.co.kr/**",
  "https://search.shopping.naver.com/**",
  "https://www.coupang.com/**",
  "https://www.google.com/**",
];

// Wider than TAP_GUARD_WINDOW_MS (800 ms) in lib/tap-guard.ts. Hard-coded rather than
// imported so a change to the constant has to be made here too, deliberately.
const AFTER_WINDOW_MS = 1100;

const STUB = { status: 200, contentType: "text/html", body: "<html><body>merchant stub</body></html>" };

// Serialised into the page, so nothing from this module's scope exists inside it.
function installProbe() {
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

async function openContext(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(installProbe);
  await context.route("**/api/out*", (route) => route.fulfill(STUB));
  for (const host of MERCHANT_HOSTS) await context.route(host, (route) => route.fulfill(STUB));
  return context;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}

/** How many events of one kind the device store holds. `-1` if it is not a list. */
async function countKind(page: Page, kind: string) {
  return page.evaluate(([key, k]) => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(raw)) return -1;
      return raw.filter((event: { kind?: string }) => event && event.kind === k).length;
    } catch {
      return -1;
    }
  }, [FUNNEL_KEY, kind] as const);
}

async function openedCount(page: Page) {
  return page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length);
}

async function pickChips(page: Page) {
  for (const name of ["세럼", "건성", "2만원"]) {
    await page.getByRole("button", { name, exact: true }).first().click();
  }
}

function submitButton(page: Page) {
  return page.getByRole("button", { name: "내 스킨케어 결과 보기" });
}

async function completeSurvey(page: Page) {
  await pickChips(page);
  const submit = submitButton(page);
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForURL("**/report", { timeout: 20_000 });
  await settle(page);
}

function reportLink(page: Page, surface: "summary" | "product-card") {
  return page
    .locator(
      surface === "summary"
        ? 'a[target="_blank"][href*="placement=report_summary"]'
        : 'a[target="_blank"][href*="placement=report_product"]'
    )
    .first();
}

async function openPicksStep(page: Page) {
  const tabs = page.locator('[role="tab"]');
  await expect(tabs).toHaveCount(3);
  await tabs.nth(1).click();
  await page.waitForTimeout(400);
}

test("a double-tap on /survey's submit records survey_completed once", async ({ browser }) => {
  const context = await openContext(browser);
  const page = await context.newPage();

  await page.goto("/survey");
  await settle(page);
  await pickChips(page);
  const submit = submitButton(page);
  await expect(submit).toBeEnabled();
  await submit.dblclick({ force: true });
  await page.waitForURL("**/report", { timeout: 20_000 });
  await settle(page);

  expect(await countKind(page, "survey_completed")).toBe(1);

  await context.close();
});

test("a visitor who goes back to /survey and submits again still records a second survey_completed", async ({ browser }) => {
  const context = await openContext(browser);
  const page = await context.newPage();

  await page.goto("/survey");
  await settle(page);
  await completeSurvey(page);
  expect(await countKind(page, "survey_completed")).toBe(1);

  // A fresh mount is a fresh in-flight flag. The guard must not become a latch that
  // ends the funnel for anyone who edits their answers.
  await page.goto("/survey");
  await settle(page);
  await completeSurvey(page);

  expect(await countKind(page, "survey_completed")).toBe(2);

  await context.close();
});

test("a double-tap on /care's purchase link opens one tab and records commerce_clicked once", async ({ browser }) => {
  const context = await openContext(browser);
  const page = await context.newPage();

  await page.goto("/survey");
  await settle(page);
  await completeSurvey(page);
  await page.goto("/care");
  await settle(page);

  const before = await countKind(page, "commerce_clicked");
  const buy = page.getByRole("button", { name: /올리브영|네이버 쇼핑|쿠팡|Global search/ }).first();
  await expect(buy).toBeVisible();
  await buy.dblclick({ force: true });
  await page.waitForTimeout(900);

  expect(await openedCount(page)).toBe(1);
  expect((await countKind(page, "commerce_clicked")) - before).toBe(1);

  await context.close();
});

test("a deliberate second tap on /care after the guard window opens again and records again", async ({ browser }) => {
  const context = await openContext(browser);
  const page = await context.newPage();

  await page.goto("/survey");
  await settle(page);
  await completeSurvey(page);
  await page.goto("/care");
  await settle(page);

  const before = await countKind(page, "commerce_clicked");
  const buy = page.getByRole("button", { name: /올리브영|네이버 쇼핑|쿠팡|Global search/ }).first();
  await expect(buy).toBeVisible();
  await buy.click({ force: true });
  await page.waitForTimeout(AFTER_WINDOW_MS);
  await buy.click({ force: true });
  await page.waitForTimeout(600);

  expect(await openedCount(page)).toBe(2);
  expect((await countKind(page, "commerce_clicked")) - before).toBe(2);

  await context.close();
});

for (const surface of ["summary", "product-card"] as const) {
  test(`a double-tap on /report's ${surface} link opens one tab and records commerce_clicked once`, async ({ browser }) => {
    const context = await openContext(browser);
    const page = await context.newPage();

    await page.goto("/survey");
    await settle(page);
    await completeSurvey(page);
    await openPicksStep(page);

    const tabs: Page[] = [];
    context.on("page", (opened) => tabs.push(opened));
    const before = await countKind(page, "commerce_clicked");
    const link = reportLink(page, surface);
    await expect(link).toBeVisible();
    await link.dblclick({ force: true });
    await page.waitForTimeout(1200);

    expect(tabs.length).toBe(1);
    expect((await countKind(page, "commerce_clicked")) - before).toBe(1);

    await context.close();
  });

  test(`a deliberate second tap on /report's ${surface} link after the guard window opens again and records again`, async ({ browser }) => {
    const context = await openContext(browser);
    const page = await context.newPage();

    await page.goto("/survey");
    await settle(page);
    await completeSurvey(page);
    await openPicksStep(page);

    const tabs: Page[] = [];
    context.on("page", (opened) => tabs.push(opened));
    const before = await countKind(page, "commerce_clicked");
    const link = reportLink(page, surface);
    await expect(link).toBeVisible();
    await link.click({ force: true });
    await page.waitForTimeout(AFTER_WINDOW_MS);
    await link.click({ force: true });
    await page.waitForTimeout(900);

    expect(tabs.length).toBe(2);
    expect((await countKind(page, "commerce_clicked")) - before).toBe(2);

    await context.close();
  });
}
