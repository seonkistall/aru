import { expect, test } from "@playwright/test";

/**
 * Regression: the scan hint on `/survey` said it had selected concerns it had not.
 *
 * `loadScanHint` builds "사진에서 확인한 {signals} 항목을 먼저 선택했어요. 내 느낌과 다르면
 * 바꿔주세요." whenever the reading flags anything, and the sentence is unconditional. The
 * pre-selection was not: `setConcerns((prev) => (prev.length ? prev : hint.concerns))`
 * applied only to an EMPTY list. So a visitor with a submitted survey — the one the
 * `/report` scan nudge sends to `/scan` and back — read the sentence over their own chips
 * and none of the photo's.
 *
 * Measured on a production build at 360x800 with `gyeol_survey` =
 * `{"type":"건성","concerns":["건조"],"budget":29000,"avoid":[],"category":"세럼"}` and
 * `gyeol_scan` = `{"oil":3,"redness":0,"pores":0,"confidence":0.9}`, which passes
 * `shouldApplyScan` and flags 유분 alone. Before: the sentence named **1** signal (유분),
 * **4** chips pressed (세럼, 건성, 건조, 2만원), and **1** named signal was not pressed.
 * With `{"oil":3,"redness":2,"pores":2}`: **3** named, the same **4** pressed, **3** named
 * and not pressed. After: **0** named and not pressed in both, and the visitor's 건조 is
 * still pressed — the hint ADDS to the list rather than replacing it or skipping it.
 *
 * The union keeps the visitor's own answers first and in their order (the draft reads
 * `["건조","유분"]`, not `["유분","건조"]`), and it is the same set `/report` already scores
 * on: `effectiveConcerns` in `lib/recommend.ts` unions the identical three signals into
 * `survey.concerns`. Neither the chips nor `lib/recommend.ts` caps how many concerns may be
 * selected, so the union has no cap to run into.
 *
 * What is NOT changed: the hint is still absorbed once per hint, keyed on the draft's
 * `hintFor`, which is cycle 64's rule and what lets a deliberately cleared list stay
 * cleared — `survey-draft-lang-switch.regression-40` pins that side and is unedited. No
 * copy changed.
 */

const DRAFT_KEY = "aru_survey_draft_v1";
// A submitted survey whose single concern is disjoint from anything the readings below
// flag, so every pressed hint chip can only have come from the hint.
const SUBMITTED = { type: "건성", concerns: ["건조"], budget: 29000, avoid: [], category: "세럼" };

async function seed(page: import("@playwright/test").Page, scan: Record<string, number>) {
  await page.addInitScript(
    ([survey, reading]) => {
      try {
        localStorage.setItem("aru.lang", "ko");
        sessionStorage.setItem("gyeol_survey", JSON.stringify(survey));
        sessionStorage.setItem("gyeol_scan", JSON.stringify(reading));
      } catch {
        /* private mode — the in-memory fallback keeps the session working */
      }
    },
    [SUBMITTED, scan] as const,
  );
}

async function openSurvey(page: import("@playwright/test").Page) {
  await page.goto("/survey");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");
  // The hint block is on screen, which is what makes the sentence a promise.
  await expect(page.getByRole("link", { name: "카메라로 다시 살펴보기" })).toBeVisible();
}

/** The signals the sentence itself names, read off the rendered text rather than assumed. */
async function namedSignals(page: import("@playwright/test").Page): Promise<string[]> {
  const text = await page.locator("main p").filter({ hasText: "사진에서 확인한" }).first().innerText();
  const match = text.match(/사진에서 확인한 (.+?) 항목을/);
  expect(match, `the hint sentence must name its signals: ${text}`).not.toBeNull();
  return match![1].split("·");
}

const pressedLabels = (page: import("@playwright/test").Page) =>
  page.locator('main button[aria-pressed="true"]').evaluateAll((els) => els.map((el) => el.textContent!.trim()));

for (const [label, scan, count] of [
  ["one signal", { oil: 3, redness: 0, pores: 0, confidence: 0.9 }, 1],
  ["three signals", { oil: 3, redness: 2, pores: 2, confidence: 0.9 }, 3],
] as const) {
  test(`the scan hint's ${label} are pressed over a submitted survey, and the visitor's own concern stays`, async ({ page }) => {
    await seed(page, scan);
    await openSurvey(page);

    const signals = await namedSignals(page);
    expect(signals, `the reading flags ${count}`).toHaveLength(count);

    // Every signal the sentence names is pressed. This is the assertion the bug failed:
    // the sentence claimed a selection the screen did not show.
    const pressed = await pressedLabels(page);
    expect(
      signals.filter((signal) => !pressed.includes(signal)),
      `the sentence names ${signals.join("·")} as selected, so each must be pressed`,
    ).toEqual([]);

    // And the visitor's own answer was added to, not replaced.
    expect(pressed, "the submitted concern must still be pressed").toContain("건조");
    expect(pressed, "the three required answers must still be pressed").toEqual(
      expect.arrayContaining(["세럼", "건성", "2만원"]),
    );
    await expect(page.getByRole("button", { name: "내 스킨케어 결과 보기" })).toBeEnabled();

    // The draft records the union with the visitor's own concern FIRST, in their order.
    const draft = await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY);
    const parsed = JSON.parse(draft!) as { concerns: string[]; hintFor: string | null };
    expect(parsed.concerns[0], "the visitor's order comes first").toBe("건조");
    expect(parsed.concerns, "no concern is added twice").toHaveLength(new Set(parsed.concerns).size);
    expect(parsed.concerns).toEqual(["건조", ...signals]);
    expect(parsed.hintFor, "the draft records which hint it absorbed").toBe(signals.join(","));
  });
}

test("an absorbed hint is not re-applied on the next mount, so removing one of its concerns sticks", async ({ page }) => {
  // The union must stay once-per-hint. If it ran on every mount it would undo the tap
  // that removes a concern the photo suggested, which is exactly what the sentence
  // invites ("내 느낌과 다르면 바꿔주세요").
  await seed(page, { oil: 3, redness: 2, pores: 2, confidence: 0.9 });
  await openSurvey(page);
  const signals = await namedSignals(page);
  expect(signals).toHaveLength(3);
  expect(await pressedLabels(page)).toEqual(expect.arrayContaining(signals.slice()));

  // The visitor disagrees with one of them and taps it off.
  const dropped = signals[0];
  await page.getByRole("button", { name: dropped, exact: true }).click();
  await expect(page.getByRole("button", { name: dropped, exact: true })).toHaveAttribute("aria-pressed", "false");
  const afterTap = await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY);
  expect(JSON.parse(afterTap!).concerns, "the draft records the removal").not.toContain(dropped);

  // Same hint, same session, a fresh mount: the draft has already absorbed it.
  await openSurvey(page);
  expect(await namedSignals(page), "the sentence is unchanged").toEqual(signals);
  const pressed = await pressedLabels(page);
  expect(pressed, "the removal survives the remount").not.toContain(dropped);
  expect(pressed, "the other two are still pressed").toEqual(expect.arrayContaining(signals.slice(1)));
  expect(pressed, "and so is the visitor's own concern").toContain("건조");
});
