import { expect, test } from "@playwright/test";

/**
 * Regression: a language switch on `/survey` threw away every unsubmitted answer.
 *
 * `LanguageProvider` remounts the whole subtree under `key={active}`
 * (`lib/i18n.tsx`), so every piece of React state a visitor has created goes with
 * the discarded tree. `/survey` kept its answers in `useState` alone and wrote
 * `sessionStorage` only on submit, so the chips a visitor had tapped were gone the
 * moment they changed the language — five answers for one tap, on the screen
 * immediately before the report that carries the merchant links.
 *
 * Measured on a production build at 360x800 against `next start`, through the real
 * picker, ko -> en -> ja -> ar. Before the fix the selected-chip count
 * (`[aria-pressed="true"]`) went 5 -> 0 -> 0 -> 0 on the first switch and stayed
 * at 0; after it, 5 on all four. `window.scrollY` was 307 throughout both before
 * and after, so the scroll position was never the defect on this screen.
 *
 * The fix is the one cycle 42 used for `/report`'s step: the answers are mirrored
 * into the storage the screen already uses, `sessionStorage` under
 * `DEVICE_DATA_KEY.surveyDraft`, registered in `lib/device-data.ts` so "delete my
 * device data" clears it, and restored in the same after-mount effect that
 * rehydrates a submitted survey. Nothing new is written to `localStorage` and the
 * `key={active}` remount is untouched.
 */

const LABELS = [
  ["en", "English", "ltr"],
  ["ja", "日本語", "ltr"],
  ["ar", "العربية", "rtl"],
] as const;

const DRAFT_KEY = "aru_survey_draft_v1";

async function switchLanguage(page: import("@playwright/test").Page, label: string, code: string) {
  await page.click('button[aria-label="Language"]');
  await page.getByRole("option", { name: new RegExp(label) }).click();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 })
    .toBe(code);
  // The provider holds the doomed tree `inert` while a dictionary chunk is in
  // flight; wait for the hold to lift so the assertions below read the remounted
  // tree and not the one on its way out.
  await expect
    .poll(async () => page.evaluate(() => document.body.hasAttribute("inert")), { timeout: 20_000 })
    .toBe(false);
}

const selected = (page: import("@playwright/test").Page) => page.locator('main button[aria-pressed="true"]');

test("a language switch on /survey keeps the answers that were not submitted yet", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aru.lang", "ko");
    } catch {
      /* private mode — the in-memory fallback keeps the session working */
    }
  });
  await page.goto("/survey");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");

  // Five answers, by tapping the real chips: one category, one skin type, two
  // concerns and one budget. Three of the five are the required fields, so this is
  // a visitor one tap away from a report.
  const chips = page.locator("main button[aria-pressed]");
  for (const index of [1, 9, 14, 15, 27]) await chips.nth(index).click();
  await expect(selected(page)).toHaveCount(5);
  // Nothing was submitted: the submitted-survey key is still empty.
  expect(await page.evaluate(() => sessionStorage.getItem("gyeol_survey"))).toBeNull();
  const before = await selected(page).evaluateAll((els) => els.map((el) => el.getAttribute("aria-pressed")).length);
  expect(before).toBe(5);

  for (const [code, label, dir] of LABELS) {
    await switchLanguage(page, label, code);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    // The answers survived the remount.
    await expect(selected(page), `${code} must keep all five answers`).toHaveCount(5);
    // And the submit button is still the enabled one, so the visitor can go on
    // rather than re-answering.
    await expect(page.getByRole("button", { name: /.+/ }).last()).toBeEnabled();
    const box = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(box.scrollWidth, `${code} must not overflow 360px`).toBe(box.clientWidth);
  }

  // The draft is session-scoped and holds exactly the five answers.
  const draft = await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY);
  expect(draft).not.toBeNull();
  const parsed = JSON.parse(draft!) as { type: string | null; category: string | null; budget: number | null; concerns: string[]; avoid: string[] };
  expect(parsed.type).not.toBeNull();
  expect(parsed.category).not.toBeNull();
  expect(parsed.budget).not.toBeNull();
  expect(parsed.concerns).toHaveLength(2);
  expect(parsed.avoid).toHaveLength(0);
  // Still nothing submitted: the draft is not a submission.
  expect(await page.evaluate(() => sessionStorage.getItem("gyeol_survey"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("aru_survey_draft_v1"))).toBeNull();
});

test("submitting clears the draft, so a later visit is not restored from a stale one", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aru.lang", "ko");
    } catch {
      /* private mode */
    }
  });
  await page.goto("/survey");
  const chips = page.locator("main button[aria-pressed]");
  for (const index of [1, 9, 27]) await chips.nth(index).click();
  await expect(selected(page)).toHaveCount(3);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).not.toBeNull();

  const submit = page.getByRole("button", { name: "내 스킨케어 결과 보기" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForURL("**/report");
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("gyeol_survey"))).not.toBeNull();
});

/**
 * The /scan losses, recorded as correct rather than fixed. A language switch
 * before capture stops the camera and clears the three consent toggles, and both
 * are the right outcome: a consent must be given in the language it is read in,
 * and restarting a camera the visitor did not ask for is not ARU's call. Measured
 * on a production build with a canvas `captureStream()` for the camera:
 * checked boxes 3 -> 0, `[data-testid="scan-capture"]` 1 -> 0 and
 * `[data-testid="scan-start"]` 0 -> 1 on the first switch. This case pins that
 * reading, so a future cycle that "fixes" it has to change this spec on purpose.
 */
test("a language switch on /scan resets the camera and the consent toggles, by design", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aru.lang", "ko");
    } catch {
      /* private mode */
    }
  });
  await page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#c8a080";
    ctx.fillRect(0, 0, 640, 480);
    setInterval(() => ctx.fillRect(0, 0, 640, 480), 100);
    const stream = canvas.captureStream(30);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => stream,
        enumerateDevices: async () => [{ kind: "videoinput", deviceId: "canvas", label: "canvas" }],
      },
    });
  });

  await page.goto("/scan");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");
  await page.click('[data-testid="scan-start"]');
  await expect(page.locator('[data-testid="scan-capture"]')).toBeVisible({ timeout: 30_000 });
  const boxes = page.locator("input[type=checkbox]");
  await expect(boxes).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) await boxes.nth(index).check({ force: true });
  expect(await page.evaluate(() => document.querySelectorAll("input[type=checkbox]:checked").length)).toBe(3);

  await switchLanguage(page, "English", "en");
  expect(await page.evaluate(() => document.querySelectorAll("input[type=checkbox]:checked").length)).toBe(0);
  await expect(page.locator('[data-testid="scan-capture"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="scan-start"]')).toBeVisible();
});

test("an edit to an already-submitted survey survives a language switch", async ({ page }) => {
  // Added by the cycle 61 supervisor review. The draft is applied AFTER the
  // submitted survey because it is the newer of the two; the tests above never
  // have a submitted survey on the page, so they would pass with that order
  // reversed. This is the visitor who comes back from /report, changes an
  // answer, and then changes the language before resubmitting.
  const submitted = { type: "복합성", concerns: ["붉은기"], budget: 39000, avoid: [], category: "크림" };
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("aru.lang", "ko");
      sessionStorage.setItem("gyeol_survey", JSON.stringify(value));
    } catch {
      /* private mode */
    }
  }, submitted);
  await page.goto("/survey");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");

  const chips = page.locator("main button[aria-pressed]");
  const pressedIndices = () =>
    chips.evaluateAll((els) => els.flatMap((el, i) => (el.getAttribute("aria-pressed") === "true" ? [i] : [])));
  await expect.poll(async () => (await pressedIndices()).length).toBeGreaterThan(0);
  const fromSubmitted = await pressedIndices();

  // Any chip not already pressed is an edit, whichever group it belongs to.
  const total = await chips.count();
  const target = Array.from({ length: total }, (_, i) => i).find((i) => !fromSubmitted.includes(i));
  expect(target, "no unpressed chip to edit").not.toBeUndefined();
  await chips.nth(target!).click();
  const edited = await pressedIndices();
  expect(edited, "the tap must change the answers on screen").not.toEqual(fromSubmitted);

  await switchLanguage(page, "English", "en");
  expect(await pressedIndices(), "en must show the edited answers, not the submitted ones").toEqual(edited);
});

/**
 * The scan-hint edge the cycle 61 supervisor review left as is, fixed in cycle 64.
 *
 * On a survey that carries a scan hint the pre-selection used to be
 * `setConcerns((prev) => (prev.length ? prev : hint.concerns))`. A visitor who
 * deliberately cleared every concern chip stored a draft whose `concerns` is `[]`,
 * and the remount restored exactly that — at which point the old condition read the
 * empty list as "nothing stored" and put the scan's concerns back, overriding the
 * choice. Measured on a production build at 360x800 with
 * `{ oil: 3, redness: 2, pores: 2, confidence: 0.9 }` in `gyeol_scan`: 3 chips
 * pre-selected, 3 taps to clear them, 0 pressed, then 3 pressed again after the
 * switch to `en` — and the stored draft rewritten from `[]` to the hint's three
 * concerns. After the fix: 0 before and 0 after, draft still `[]`.
 *
 * The hint pre-selects only when there is neither a stored draft nor a submitted
 * survey. The hint TEXT is unconditional either way, which the retake link below
 * pins.
 */
test("a cleared concern list is not re-filled by the scan hint on a language switch", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aru.lang", "ko");
      // A reading that passes `isScanReads` and `shouldApplyScan`, with all three
      // signals over their thresholds, so the hint offers 유분 · 붉은기 · 모공.
      sessionStorage.setItem("gyeol_scan", JSON.stringify({ oil: 3, redness: 2, pores: 2, confidence: 0.9 }));
    } catch {
      /* private mode */
    }
  });
  await page.goto("/survey");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");

  // The hint pre-selected three concerns on this first visit, which is the behaviour
  // being kept — the fix narrows WHEN it applies, not that it applies.
  await expect(selected(page)).toHaveCount(3);
  await expect(page.getByRole("link", { name: "카메라로 다시 살펴보기" })).toBeVisible();

  // The visitor clears every one of them, one tap each. 고민 is optional, so an empty
  // list is a complete answer and not a half-filled field.
  const on = page.locator('main button[aria-pressed="true"]');
  for (let taps = 0; taps < 3; taps += 1) await on.first().click();
  await expect(selected(page)).toHaveCount(0);
  const cleared = await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY);
  expect(JSON.parse(cleared!).concerns, "the draft records the cleared list").toEqual([]);

  await switchLanguage(page, "English", "en");
  // The explicit choice survives: the hint does not override a stored draft.
  await expect(selected(page), "en must keep the cleared concern list").toHaveCount(0);
  // And the hint itself is still on screen, text and retake link, because clearing the
  // chips is not a reason to hide what the photo showed.
  await expect(page.getByRole("link", { name: "Check my skin with the camera again" })).toBeVisible();
  await expect(page.getByText("based on your photo", { exact: false })).toBeVisible();
  const after = await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY);
  expect(JSON.parse(after!).concerns, "and the draft was not rewritten with the hint").toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("aru_survey_draft_v1"))).toBeNull();
});

/**
 * Added by the cycle 64 supervisor review. `/survey` writes a draft on every mount,
 * an empty one included, so "a stored draft exists" is true for anyone who opened
 * the survey earlier in the session. The first form of the cycle 64 fix skipped
 * the scan pre-selection whenever a draft existed, which left the hint sentence
 * "사진에서 확인한 … 항목을 먼저 선택했어요" on screen with nothing selected. This is
 * the visitor who opens /survey, goes to scan, and comes back: the hint's concerns
 * must be pre-selected, as they were before cycle 64.
 */
test("a scan taken after an earlier, empty survey visit still pre-selects its concerns", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aru.lang", "ko");
    } catch {
      /* private mode */
    }
  });
  await page.goto("/survey");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");
  await expect(selected(page)).toHaveCount(0);
  // The earlier visit left a draft behind, with nothing chosen.
  await expect.poll(async () => page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).not.toBeNull();

  // The scan finishes and routes back to /survey with a reading in the session.
  await page.evaluate(() =>
    sessionStorage.setItem("gyeol_scan", JSON.stringify({ oil: 3, redness: 2, pores: 2, confidence: 0.9 })),
  );
  await page.goto("/survey");
  await expect(page.getByRole("link", { name: "카메라로 다시 살펴보기" })).toBeVisible();
  await expect(selected(page), "the hint says it pre-selected three concerns, so three must be pressed").toHaveCount(3);
});
