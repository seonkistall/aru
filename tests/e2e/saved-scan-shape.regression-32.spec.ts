import { expect, test } from "@playwright/test";

/**
 * A returning visitor's saved `scan`, in a shape no capture ever wrote.
 *
 * `/report` in a fresh tab falls back to `loadLastResult()` and hands the record
 * straight to `recommend(saved.survey, saved.scan ?? null)` (`loadInitialView`,
 * `app/report/page.tsx`). `shouldApplyScan` (`lib/recommend.ts`) is
 * `Boolean(scan && !scan.retakeRecommended && (scan.confidence ?? 0.7) >= 0.58)` — a
 * truthiness test plus two optional fields — so a truthy non-reading set `scanApplied`
 * and every pick reason opened "카메라에서 확인한 피부 특징과 ...", with the analysis
 * card's own line and the trust chip title saying the same, on a record with no camera
 * data in it. Nothing threw, so nothing on screen contradicted it.
 *
 * Measured on a production build before the guard, with `reads: null` and the survey
 * below: `scan: null` gave 0 occurrences of "카메라에서 확인한" on the picks step;
 * `1`, `"x"`, `[]`, `{}` and `true` each gave 3, on the same three SKUs
 * (sr1/sr2/sr3) that `scan: null` picks — the survey-only picks under camera copy.
 *
 * The unit half, including which wrong shapes reach `scanApplied` at all, is
 * `tests/scan-shape.test.ts`.
 */

const SURVEY = { type: "복합성", concerns: ["모공", "붉은기"], budget: 29000, avoid: ["향료"], category: "세럼" };

// The six fields `app/scan/use-capture-analysis.ts` writes, which is the only shape a
// capture has ever stored.
const GOOD_SCAN = { oil: 2, redness: 1, pores: 1, confidence: 0.82, retakeRecommended: false, source: "roi" };

// The strings `reads` has to satisfy `isSkinReads` with, so the analysis card renders
// and its trust chip is on screen to be checked. Same record as regression-31.
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
  extras: [],
};

// Any camera claim at all. Safe as a blanket check only on a record whose `reads` is
// null, because one line on the analysis step — `app/report/page.tsx:286` — is keyed on
// `reads`, not on `scanApplied`, and is accurate when a real reading is in the record.
const CAMERA_CLAIM = "카메라에서 확인한";
// The two the scan guard is actually about: the pick-reason prefix from `reasonFor`
// and the trust-chip title from `buildReportTrust`, both gated on `scanApplied`.
const PICK_CLAIM = "카메라에서 확인한 피부 특징과";
const TRUST_CLAIM = "카메라에서 확인한 피부 특징도 참고했어요";
const SURVEY_LED = "설문 답변을 중심으로 정리했어요";
const NO_READS_SUB = "설문 답변을 바탕으로 나에게 맞는 스킨케어를 정리했어요";
const ERROR_BOUNDARY = "앗, 잠깐 멈췄어요";

// localStorage only: the empty sessionStorage is what sends /report and /care down the
// saved-result fallback. Literals inside the function because addInitScript serialises
// it and runs it in the page.
function seedLocalOnly(record: string) {
  localStorage.setItem("aru.lang", "ko");
  localStorage.setItem("aru_last_result", record);
}

// innerText, not textContent: it is what the visitor can read, so a claim hidden by CSS
// does not count as gone and a claim rendered off the flow does not count as present.
async function visibleText(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.body.innerText);
}

async function open(browser: import("@playwright/test").Browser, scan: unknown, reads: unknown) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(seedLocalOnly, JSON.stringify({ survey: SURVEY, scan, reads, ts: Date.now() }));
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto("/report");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
  return { context, page, pageErrors };
}

async function picksStepText(page: import("@playwright/test").Page) {
  const tabs = page.locator('[role="tab"]');
  await expect(tabs).toHaveCount(3);
  await tabs.nth(1).click();
  await page.waitForTimeout(300);
  return visibleText(page);
}

const WRONG: [string, unknown][] = [
  ["the number 1", 1],
  ['the string "x"', "x"],
  ["an empty array", []],
  ["an empty object", {}],
  ["true", true],
];

// `reads: null` is the record the measurement used and the honest one to test: a store
// carrying a scan no capture wrote has no reading behind it either. With no `reads`
// there is no line on the page that a camera may legitimately be named on, so the whole
// body is checked.
for (const [name, scan] of WRONG) {
  test(`a saved scan that is ${name} does not make /report claim the camera`, async ({ browser }) => {
    const { context, page, pageErrors } = await open(browser, scan, null);

    await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
    // The report still renders — dropping the scan must not cost the visitor the
    // report. Visible, not merely present.
    await expect(page.getByText(NO_READS_SUB).first()).toBeVisible();
    expect(await visibleText(page), "the analysis step claims a camera reading").not.toContain(CAMERA_CLAIM);

    const picks = await picksStepText(page);
    expect(picks, "a pick reason claims a camera reading").not.toContain(CAMERA_CLAIM);
    // Still a real picks step with the merchant links on it: the honest copy, not a
    // degraded page.
    await expect(page.locator('a[href^="/api/out"]').first()).toBeVisible();
    expect(await page.locator('a[href^="/api/out"]').count()).toBe(4);
    expect(pageErrors).toEqual([]);

    await context.close();
  });
}

test("with a real reading beside it, the wrong-shaped scan still loses the trust chip", async ({ browser }) => {
  // The one case where `reads` is genuine and only `scan` is wrong. `buildReportTrust`
  // is handed `scanApplied`, so its title is the claim to check here, not the
  // reads-keyed line above it.
  const { context, page, pageErrors } = await open(browser, {}, READS);

  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  await expect(page.getByText(SURVEY_LED).first()).toBeVisible();
  expect(await visibleText(page), "the trust chip claims the camera was applied").not.toContain(TRUST_CLAIM);

  const picks = await picksStepText(page);
  expect(picks, "a pick reason claims a camera reading").not.toContain(PICK_CLAIM);
  expect(pageErrors).toEqual([]);

  await context.close();
});

test("a saved scan in the shape a capture writes still says the camera was used", async ({ browser }) => {
  // The failure path of the guard: too strict and a returning visitor silently loses
  // their capture, which is the same lie in the other direction.
  const { context, page, pageErrors } = await open(browser, GOOD_SCAN, READS);

  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  await expect(page.getByText(TRUST_CLAIM).first()).toBeVisible();

  const picks = await picksStepText(page);
  expect(picks, "the camera reading was dropped by the guard").toContain(PICK_CLAIM);
  expect(await page.locator('a[href^="/api/out"]').count()).toBe(4);
  expect(pageErrors).toEqual([]);

  await context.close();
});

test("a saved scan of null is unchanged: no claim, and the picks are still there", async ({ browser }) => {
  const { context, page, pageErrors } = await open(browser, null, READS);

  await expect(page.getByText(SURVEY_LED).first()).toBeVisible();
  const picks = await picksStepText(page);
  expect(picks).not.toContain(PICK_CLAIM);
  expect(await page.locator('a[href^="/api/out"]').count()).toBe(4);
  expect(pageErrors).toEqual([]);

  await context.close();
});

test("/care takes the same record without claiming the camera", async ({ browser }) => {
  // /care reads `scan` out of the same two stores with the same two lines, so it had the
  // same hole; its own routine copy is generated by the same recommend() call.
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(seedLocalOnly, JSON.stringify({ survey: SURVEY, scan: {}, reads: READS, ts: Date.now() }));
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto("/care");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);

  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  expect(await visibleText(page)).not.toContain(PICK_CLAIM);
  // Still the live /care screen, not an empty one.
  await expect(page.locator('a[href="/scan"]').first()).toBeVisible();
  expect(pageErrors).toEqual([]);

  await context.close();
});

test("the sessionStorage path is guarded too, not just the saved record", async ({ browser }) => {
  // The fresh-tab fallback is one of two readers. In a tab that HAS a survey in
  // sessionStorage, /report reads `gyeol_scan` from sessionStorage instead, and that
  // read had the identical hole — and it is the one that then mirrors the record into
  // localStorage via saveLastResult(), so an unguarded value here would also be the
  // value every future visit falls back to.
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(
    (payload: { survey: string; scan: string; reads: string }) => {
      localStorage.setItem("aru.lang", "ko");
      sessionStorage.setItem("gyeol_survey", payload.survey);
      sessionStorage.setItem("gyeol_scan", payload.scan);
      sessionStorage.setItem("gyeol_reads", payload.reads);
    },
    { survey: JSON.stringify(SURVEY), scan: JSON.stringify([]), reads: JSON.stringify(READS) }
  );
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto("/report");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);

  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  await expect(page.getByText(SURVEY_LED).first()).toBeVisible();
  const picks = await picksStepText(page);
  expect(picks, "a pick reason claims a camera reading").not.toContain(PICK_CLAIM);

  // And what it mirrored into localStorage for the next visit carries no scan.
  const mirrored = await page.evaluate(() => localStorage.getItem("aru_last_result"));
  expect(mirrored).not.toBeNull();
  expect(JSON.parse(mirrored as string).scan).toBeNull();
  expect(pageErrors).toEqual([]);

  await context.close();
});

// Supervisor, cycle 44 review. /survey reads the same sessionStorage key for its scan
// hint (loadScanHint, app/survey/page.tsx) and had no guard: `{ "confidence": 0.9 }`
// gave "사진에서 뚜렷하게 보이는 항목이 적어…", a line about a photo with no data behind it.
for (const [name, scan] of [
  ["an object with only a confidence", { confidence: 0.9 }],
  ["a string", "x"],
] as const) {
  test(`/survey gives no photo hint for a session scan that is ${name}`, async ({ page }) => {
    await page.addInitScript(
      ([raw]) => {
        localStorage.setItem("aru.lang", "ko");
        sessionStorage.setItem("gyeol_scan", raw);
      },
      [JSON.stringify(scan)] as const,
    );
    await page.goto("/survey");
    await expect(page.getByRole("button", { name: "내 스킨케어 결과 보기" })).toBeVisible();
    await expect(page.getByText("사진에서", { exact: false })).toHaveCount(0);
    await expect(page.getByText("촬영 조건이 충분하지 않아", { exact: false })).toHaveCount(0);
  });
}

test("/survey still gives the photo hint for a session scan a capture wrote", async ({ page }) => {
  await page.addInitScript(
    ([raw]) => {
      localStorage.setItem("aru.lang", "ko");
      sessionStorage.setItem("gyeol_scan", raw);
    },
    [JSON.stringify(GOOD_SCAN)] as const,
  );
  await page.goto("/survey");
  await expect(page.getByText("사진에서 확인한", { exact: false })).toBeVisible();
});
