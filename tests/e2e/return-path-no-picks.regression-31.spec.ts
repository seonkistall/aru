import { expect, test } from "@playwright/test";

/**
 * The returning visitor's path, seeded the way a returning visitor actually arrives:
 * localStorage only, no sessionStorage. `/` renders `ReturnBanner` when
 * `hasLastResult()` is true, and `/report` in a fresh tab falls back to
 * `loadLastResult()` (`loadInitialView`, `app/report/page.tsx`).
 *
 * The defect this pins: `recommend()` never leaves `survey.category` — every
 * relaxation step in `lib/recommend.ts` filters `inCategory` — so a stored survey
 * naming a category the catalogue no longer stocks returns `picks: []`.
 * `isSurvey` keeps that record on purpose (`tests/survey-shape.test.ts`, "accepts a
 * survey naming a category this build no longer ships"), and its comment says
 * "/report renders its no-picks branch". There was no such branch: the grid rendered
 * nothing, the compare block needs two picks, and the commerce section — which also
 * carries the only /care hand-off on the step — was behind `top &&`. Measured before
 * the fix: 4 `/api/out` links and 9 anchors on the picks step became 0 and 4.
 *
 * `aru_last_result`'s envelope has never changed shape (`git log -- lib/last-result.ts`);
 * what older builds wrote differently is its CONTENTS, so the two legacy cases below
 * are a truthy non-survey (pre-cycle-32, when the guard was a truthiness check) and a
 * wrong-shaped `reads` (pre-cycle-33). Both must still land on a live screen.
 */

// The survey the app writes, and the same survey with a category no SKU declares.
// `grep -o 'category: "[^"]*"' lib/skus.ts | sort | uniq -c` lists the eight the
// catalogue stocks; 앰플 is not one of them, and neither is it in `CATEGORIES`
// (`app/survey/page.tsx`), so only a stored record can carry it.
const SURVEY = { type: "복합성", concerns: ["모공", "붉은기"], budget: 29000, avoid: ["향료"], category: "세럼" };
const SURVEY_DROPPED_CATEGORY = { ...SURVEY, category: "앰플" };

const SCAN = { oil: 2, redness: 1, pores: 1, confidence: 0.82, retakeRecommended: false, source: "roi" };

// Every string here is what the real generators in `lib/skin.ts` produce for
// oil level 2 / redness 1 / pores 1 at confidence 0.82 — `headlineFor`,
// `narrativeFor`, `overallFor`, `confidenceLabel`, `buildSignals` and the two
// `extras` — so the record is one this build could have written, not an invented one.
const READS = {
  oil: { value: "유분 많음", level: 2, calm: false, confidence: 0.82 },
  pores: { value: "결 약간 보임", level: 1, calm: false, confidence: 0.82 },
  redness: { value: "붉은기 약간", level: 1, calm: false, confidence: 0.82 },
  overall: { value: "균형 관리 필요", level: 2, calm: false, confidence: 0.82 },
  headline: "T존 유분과 피부결을 함께 볼게요",
  narrative: "T존 유분감이 비교적 뚜렷하고, 볼에 옅은 붉은기가 보여요. 피부결은 약간 보이는 편이에요.",
  confidence: 0.82,
  confidenceLabel: "보통",
  retakeRecommended: false,
  retakeReasons: [],
  signals: [
    { label: "조명", ok: true, detail: "분석하기 좋은 밝기예요" },
    { label: "반사", ok: true, detail: "반사가 크지 않아요" },
    { label: "노출 여유", ok: true, detail: "볼 색에 여유가 남아 있어요" },
    { label: "피부 영역", ok: true, detail: "볼/T존 영역이 충분히 잡혔어요" },
  ],
  source: "roi-calibrated",
  extras: [
    { label: "톤 균일감", value: "고르게 보여요", calm: true, note: "이마와 볼 밝기가 비슷하게 읽혔어요." },
    { label: "T존 반사광", value: "보통", calm: true, note: "이마에 옅은 반사가 보여요." },
  ],
};

const ERROR_BOUNDARY = "앗, 잠깐 멈췄어요";

// localStorage ONLY. sessionStorage is deliberately untouched: a returning visitor
// opens a new tab, and it is the empty sessionStorage that sends both revenue screens
// down the saved-result fallback.
// The keys are literals inside the function because `addInitScript` serialises it and
// runs it in the page, where nothing from this module's scope exists.
function seedLocalOnly(record: string | null) {
  localStorage.setItem("aru.lang", "ko");
  if (record !== null) localStorage.setItem("aru_last_result", record);
}

async function settle(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}

async function openPicksStep(page: import("@playwright/test").Page) {
  const tabs = page.locator('[role="tab"]');
  await expect(tabs).toHaveCount(3);
  await tabs.nth(1).click();
  await page.waitForTimeout(300);
}

test("a saved result whose category the catalogue dropped keeps a live picks step", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(
    seedLocalOnly,
    JSON.stringify({ survey: SURVEY_DROPPED_CATEGORY, scan: SCAN, reads: READS, ts: Date.now() })
  );
  const page = await context.newPage();

  // The banner is the entry point, and it has to be there for the rest to be reachable.
  await page.goto("/");
  await settle(page);
  await expect(page.locator('[data-testid="return-banner"] a[href="/report"]')).toHaveCount(1);

  await page.goto("/report");
  await settle(page);
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  await openPicksStep(page);

  // There is nothing to buy, which is honest, and no affiliate disclosure with no
  // affiliate link next to it.
  await expect(page.locator('a[href^="/api/out"]')).toHaveCount(0);
  // What must NOT happen is the step becoming a dead end. Both ways out are links.
  // Scoped to the empty state: `/report` already carries other `/survey` links
  // (FlowSteps), so a bare count would pass with no empty state at all.
  await expect(page.locator('[data-testid="report-picks-empty"] a[href="/survey"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="report-picks-empty"] a[href="/care"]')).toHaveCount(1);
  // Still the report, not a blank screen.
  await expect(page.getByRole("tab", { name: /살펴볼 제품 후보/ })).toBeVisible();

  const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(width[0], "the no-picks step overflows 360px").toBe(width[1]);

  await context.close();
});

test("a saved result in the current shape still reaches four merchant links", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(seedLocalOnly, JSON.stringify({ survey: SURVEY, scan: SCAN, reads: READS, ts: Date.now() }));
  const page = await context.newPage();

  await page.goto("/");
  await settle(page);
  await expect(page.locator('[data-testid="return-banner"] a[href="/report"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="return-banner"] a[href="/scan"]')).toHaveCount(1);

  await page.goto("/report");
  await settle(page);
  await openPicksStep(page);
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  // Three product cards plus the summary out-link: the paying path, unchanged.
  await expect(page.locator('a[href^="/api/out"]')).toHaveCount(4);
  await expect(page.locator('a[href="/care"]')).toHaveCount(1);
  // The empty state is NOT rendered when there are picks.
  await expect(page.locator('[data-testid="report-picks-empty"]')).toHaveCount(0);

  await context.close();
});

test("the same record 60 days old behaves identically, because nothing reads ts", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(
    seedLocalOnly,
    JSON.stringify({ survey: SURVEY, scan: SCAN, reads: READS, ts: Date.now() - 60 * 24 * 60 * 60 * 1000 })
  );
  const page = await context.newPage();

  await page.goto("/");
  await settle(page);
  await expect(page.locator('[data-testid="return-banner"] a[href="/report"]')).toHaveCount(1);

  await page.goto("/report");
  await settle(page);
  await openPicksStep(page);
  await expect(page.locator('a[href^="/api/out"]')).toHaveCount(4);

  await context.close();
});

test("a pre-cycle-32 record whose survey is a truthy non-survey lands on /survey, not a dead /report", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(seedLocalOnly, JSON.stringify({ survey: "abcdef", scan: null, reads: null, ts: Date.now() }));
  const page = await context.newPage();

  await page.goto("/");
  await settle(page);
  // No banner: there is nothing to continue.
  await expect(page.locator('[data-testid="return-banner"]')).toHaveCount(0);

  await page.goto("/report");
  await settle(page);
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/survey");

  await context.close();
});

test("a pre-cycle-33 record with a wrong-shaped reads keeps the report and its links", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(
    seedLocalOnly,
    JSON.stringify({ survey: SURVEY, scan: SCAN, reads: { oil: { value: "유분 많음", level: 2 } }, ts: Date.now() })
  );
  const page = await context.newPage();

  await page.goto("/");
  await settle(page);
  await expect(page.locator('[data-testid="return-banner"] a[href="/report"]')).toHaveCount(1);

  await page.goto("/report");
  await settle(page);
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  await openPicksStep(page);
  await expect(page.locator('a[href^="/api/out"]')).toHaveCount(4);

  await context.close();
});

test("nothing stored: /report goes to /survey and /care keeps both of its own ways out", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(seedLocalOnly, null);
  const page = await context.newPage();

  await page.goto("/");
  await settle(page);
  await expect(page.locator('[data-testid="return-banner"]')).toHaveCount(0);

  await page.goto("/report");
  await settle(page);
  expect(new URL(page.url()).pathname).toBe("/survey");

  await page.goto("/care");
  await settle(page);
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  await expect(page.locator('a[href="/scan"]')).toHaveCount(1);
  await expect(page.locator('a[href="/survey"]')).toHaveCount(1);

  await context.close();
});
