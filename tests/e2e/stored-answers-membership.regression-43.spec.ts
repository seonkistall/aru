import { expect, test } from "@playwright/test";

/**
 * Regression: `/survey` and `/checkin` restored a stored answer that is not one of the
 * values they offer.
 *
 * Both screens copied fields out of `sessionStorage` on a truthiness or `typeof` check
 * alone — `if (saved.type) setType(saved.type)` and friends. A string an older build
 * wrote, a renamed category, or an edited tab therefore became state, and the failure is
 * invisible rather than loud: nothing in the rendered chip list equals the value, so no
 * chip reads as pressed, while `/survey`'s `ready` test counts the field as answered and
 * enables submit. The submit then writes the value through to `/report`.
 *
 * Measured first on a production build at 360x800 against `next start`, `gyeol_survey`
 * seeded per case, before the fix:
 *
 *   - `{ type: "초지성", category: "앰플" }` — 2 chips pressed (유분, 2만원), neither
 *     피부 타입 nor 제품 종류 showing anything, submit ENABLED. Submitting stored the
 *     pair verbatim and `/report`'s picks step read `앰플 · 0개` with 0 `/api/out`
 *     links and the empty-picks section rendered.
 *   - `{ budget: 1234 }` — 3 pressed, no 예산 chip, submit ENABLED, and `/report`
 *     scored `세럼 · 3개` with 4 `/api/out` links against a band no chip offers.
 *   - `{ concerns: ["우주고민", "유분"] }` — 4 pressed, and the non-member rode through
 *     the submit into `gyeol_survey` and on to `/report`.
 *
 * After the fix the first two leave submit DISABLED, the third keeps only `유분`, and the
 * valid control is byte-identical: 4 pressed, submit enabled, `세럼 · 3개`, 4 `/api/out`
 * links.
 *
 * `isSurvey` (`lib/recommend.ts`) is untouched and is not the fix: it is a structural
 * guard on purpose, because `/report` must keep rendering a survey whose category the
 * catalogue no longer stocks instead of throwing. The screen that offers the options is
 * the one that can say which values are offerable, so each restore passes its own option
 * list to `storedOption` / `storedOptions` (`lib/stored-option.ts`). What is SAVED, and
 * when, is unchanged.
 */

const DRAFT_KEY = "aru_survey_draft_v1";
const CHECKIN_DRAFT_KEY = "aru_checkin_draft_v1";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const USE_ID = "membership-use";

const VALID = { type: "지성", concerns: ["유분"], budget: 29000, avoid: [], category: "세럼" };

const selected = (page: import("@playwright/test").Page) => page.locator('main button[aria-pressed="true"]');
const submitButton = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "내 스킨케어 결과 보기", exact: true });

async function openSurvey(page: import("@playwright/test").Page, seed: { survey?: unknown; draft?: unknown }) {
  await page.addInitScript((value) => {
    // No merchant link may be followed from a test. /report and /care open theirs
    // through anchors, and anything that reaches for window.open is collected instead.
    const opened: string[] = [];
    (window as unknown as { __opened: string[] }).__opened = opened;
    window.open = (url?: string | URL) => {
      opened.push(String(url));
      return null;
    };
    try {
      localStorage.setItem("aru.lang", "ko");
      if (value.survey !== undefined) sessionStorage.setItem("gyeol_survey", JSON.stringify(value.survey));
      if (value.draft !== undefined) sessionStorage.setItem("aru_survey_draft_v1", JSON.stringify(value.draft));
    } catch {
      /* private mode — the in-memory fallback keeps the session working */
    }
  }, seed);
  await page.goto("/survey");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");
  // The restore is a post-mount effect, so wait for the chip the valid half of every
  // seed below shares rather than racing it.
  await expect(page.getByRole("button", { name: "유분", exact: true })).toHaveAttribute("aria-pressed", "true");
}

test("an out-of-enum type and category are not restored, and submit stays disabled", async ({ page }) => {
  await openSurvey(page, { survey: { ...VALID, type: "초지성", category: "앰플" } });

  // The two valid answers are still there; the two non-members are nowhere.
  await expect(selected(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "2만원", exact: true })).toHaveAttribute("aria-pressed", "true");
  for (const label of ["지성", "건성", "복합성", "민감성", "중성", "세럼", "크림", "토너"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "false");
  }

  // Which is what the submit must say: two of the three required fields are now
  // unanswered, so the visitor is told so instead of being sent to a report built on a
  // value no chip offers.
  await expect(submitButton(page)).toBeDisabled();
  await expect(page.getByText("필수 항목 1/3")).toBeVisible();
  // Nothing was rewritten on the way: the submitted key still holds what was seeded, and
  // the draft carries only the answers that are real options.
  const stored = JSON.parse((await page.evaluate(() => sessionStorage.getItem("gyeol_survey")))!);
  expect(stored.type).toBe("초지성");
  expect(stored.category).toBe("앰플");
  const draft = JSON.parse((await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY))!);
  expect(draft.type).toBeNull();
  expect(draft.category).toBeNull();
  expect(draft.budget).toBe(29000);
  expect(draft.concerns).toEqual(["유분"]);
});

test("a budget that is not one of the chips is not restored, and submit stays disabled", async ({ page }) => {
  await openSurvey(page, { survey: { ...VALID, budget: 1234 } });

  await expect(selected(page)).toHaveCount(3);
  for (const label of ["1만원", "2만원", "3만원", "4만원", "5만원 이상"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "false");
  }
  await expect(submitButton(page)).toBeDisabled();
  await expect(page.getByText("필수 항목 2/3")).toBeVisible();
  const draft = JSON.parse((await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY))!);
  expect(draft.budget, "1234 is not a band any chip offers").toBeNull();
});

test("a concern that is not one of the chips is dropped and the rest of the answer is kept", async ({ page }) => {
  await openSurvey(page, { survey: { ...VALID, concerns: ["우주고민", "유분"] } });

  // 고민 is optional, so the valid part of the answer is a complete answer: this one
  // stays submittable, unlike the two above.
  await expect(selected(page)).toHaveCount(4);
  await expect(submitButton(page)).toBeEnabled();
  const draft = JSON.parse((await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY))!);
  expect(draft.concerns).toEqual(["유분"]);

  await submitButton(page).click();
  await page.waitForURL("**/report");
  const submitted = JSON.parse((await page.evaluate(() => sessionStorage.getItem("gyeol_survey")))!);
  expect(submitted.concerns, "the non-member must not reach /report").toEqual(["유분"]);
  expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length)).toBe(0);
});

test("a valid stored survey still restores exactly as before, through to /report", async ({ page }) => {
  await openSurvey(page, { survey: VALID });

  await expect(selected(page)).toHaveCount(4);
  for (const label of ["세럼", "지성", "유분", "2만원"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(submitButton(page)).toBeEnabled();
  await expect(page.getByText("필수 항목 3/3")).toBeVisible();

  await submitButton(page).click();
  await page.waitForURL("**/report");
  // The picks step is where the merchant links are. Stepping there by the stored step
  // key rather than by two taps keeps this case about the restore.
  await page.evaluate(() => sessionStorage.setItem("aru_report_step_v1", "1"));
  await page.reload();
  await expect(page.getByText("세럼 · 3개")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('a[href^="/api/out"]')).toHaveCount(4);
  await expect(page.locator('[data-testid="report-picks-empty"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length)).toBe(0);
});

test("the /survey draft restore gets the same rule as the submitted survey", async ({ page }) => {
  // The draft is applied after the submitted survey, so a bad draft field over a good
  // submitted one is the case that matters: without the guard the draft's 앰플 replaced
  // 세럼 and submit stayed enabled on a category no chip offers.
  await openSurvey(page, { survey: VALID, draft: { type: "초지성", concerns: ["유분", "우주고민"], category: "앰플", budget: 7, avoid: ["진주가루"], hintFor: null } });

  // Every one of the draft's five fields is a non-member, so the submitted survey's
  // answers stand — which is the fallback the restore order already gives.
  await expect(selected(page)).toHaveCount(4);
  for (const label of ["세럼", "지성", "유분", "2만원"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(submitButton(page)).toBeEnabled();
  const draft = JSON.parse((await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY))!);
  expect(draft.avoid, "a non-member ingredient is filtered out, not carried").toEqual([]);
  expect(draft.concerns).toEqual(["유분"]);
});

function seedCheckinDraft(page: import("@playwright/test").Page, draft: unknown) {
  return page.addInitScript(({ startedAt, useId, draftKey, value }) => {
    try {
      localStorage.setItem("aru.lang", "ko");
      localStorage.setItem(
        "gyeol_purchases",
        JSON.stringify([{ id: useId, sku_id: "cr3", name: "레드 블레미쉬 수분 크림", confirmedUse: true, ts: startedAt }]),
      );
      sessionStorage.setItem(draftKey, JSON.stringify({ [useId]: value }));
    } catch {
      /* private mode */
    }
  }, { startedAt: Date.now() - 3.5 * WEEK_MS, useId: USE_ID, draftKey: CHECKIN_DRAFT_KEY, value: draft });
}

async function openCheckin(page: import("@playwright/test").Page) {
  await page.goto("/checkin");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");
  // The card's eight controls: 만족도 (3), 트러블 (2), 재구매 (2) and 기록하기. Asserted so a
  // card that stopped rendering cannot pass one of these cases by emptiness.
  await expect(page.locator("main button")).toHaveCount(8);
}

test("a /checkin satisfaction off the scale is not restored, and saving stays disabled", async ({ page }) => {
  // 7 is not one of the three values `Seg` renders, so no 만족도 pill can show it. With the
  // other two answers valid this is the whole of the defect on this screen: before the
  // guard `ready` counted 7 as an answer, so 기록하기 was ENABLED with that question
  // reading as unanswered, and pressing it wrote satisfaction 7 into the check-in record.
  await seedCheckinDraft(page, { sat: 7, trouble: false, repurchase: true });
  await openCheckin(page);

  for (const label of ["없었어요", "할래요"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  for (const label of ["별로", "보통", "좋음"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "false");
  }
  await expect(selected(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "기록하기", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("gyeol_checkins"))).toBeNull();
});

test("a /checkin trouble answer that is not a boolean is not restored either", async ({ page }) => {
  await seedCheckinDraft(page, { sat: 2, trouble: "yes", repurchase: true });
  await openCheckin(page);

  for (const label of ["보통", "할래요"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  for (const label of ["있었어요", "없었어요"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "false");
  }
  await expect(selected(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "기록하기", exact: true })).toBeDisabled();
});

test("a valid /checkin draft still restores all three answers", async ({ page }) => {
  await seedCheckinDraft(page, { sat: 2, trouble: false, repurchase: true });
  await openCheckin(page);
  await expect(selected(page)).toHaveCount(3);
  for (const label of ["보통", "없었어요", "할래요"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByRole("button", { name: "기록하기", exact: true })).toBeEnabled();
});
