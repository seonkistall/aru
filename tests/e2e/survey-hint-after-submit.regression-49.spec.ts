import { expect, test, type Page } from "@playwright/test";

/**
 * Two /survey defects found by the cycle 114 bug hunt, both on what a submit leaves
 * behind.
 *
 * 1. A scan concern the visitor unpressed and submitted came back pressed. The draft is
 *    the only place that records which scan hint was already absorbed (`hintFor`), and
 *    submit deleted the whole draft, so a return to /survey (the 설문 step link on
 *    /report, or Back) applied the same hint again: 유분 pressed, and a resubmit that
 *    changed only the budget saved `concerns: ["유분"]`. Submit now keeps `{ hintFor }`
 *    alone, with no answer fields, so nothing stale can be restored from it and
 *    regression-40's "submitting clears the draft" (no scan, so no hint) is unchanged.
 *    `hintFor` is still the concern list, so a rescan flagging the same signals leaves
 *    the choice alone too, as a language-switch remount already did before submit.
 *
 * 2. `survey_completed.hasScan` was `Boolean(scanHint?.concerns.length)`: false for a
 *    calm scan that /report applied, while the same session's reco_viewed recorded
 *    scanApplied=true. It is now whether a scan reading exists, so it is true and
 *    scanApplied false, by design, for a retake-recommended or low-confidence reading.
 */

const DRAFT_KEY = "aru_survey_draft_v1";
const FUNNEL_KEY = "aru_funnel_events_v1";

async function seed(page: Page, scan: Record<string, number> | null) {
  await page.addInitScript((reading) => {
    try {
      localStorage.setItem("aru.lang", "ko");
      // Once per tab, so a later navigation does not reset what the test changed.
      if (reading && !sessionStorage.getItem("gyeol_scan")) sessionStorage.setItem("gyeol_scan", JSON.stringify(reading));
    } catch {
      /* private mode */
    }
  }, scan);
}

const chip = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).first();
const submitButton = (page: Page) => page.getByRole("button", { name: "내 스킨케어 결과 보기" });

async function openSurvey(page: Page) {
  await page.goto("/survey");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");
}

async function submit(page: Page) {
  await expect(submitButton(page)).toBeEnabled();
  await submitButton(page).click();
  await page.waitForURL("**/report");
}

test("a scan concern the visitor unpressed and submitted stays unpressed on the way back", async ({ page }) => {
  await seed(page, { oil: 3, redness: 0, pores: 0, confidence: 0.9 });
  await openSurvey(page);
  await expect(chip(page, "유분")).toHaveAttribute("aria-pressed", "true");

  await chip(page, "유분").click();
  await expect(chip(page, "유분")).toHaveAttribute("aria-pressed", "false");
  for (const name of ["세럼", "건성", "2만원"]) await chip(page, name).click();
  await submit(page);

  const draft = JSON.parse((await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY))!);
  expect(Object.keys(draft)).toEqual(["hintFor"]);

  await openSurvey(page);
  await expect(chip(page, "건성")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "유분")).toHaveAttribute("aria-pressed", "false");

  // Change only the budget and submit again: 유분 must not ride along.
  await chip(page, "3만원").click();
  await submit(page);
  const survey = JSON.parse((await page.evaluate(() => sessionStorage.getItem("gyeol_survey")))!);
  expect(survey.concerns).not.toContain("유분");
  expect(survey.budget).toBe(39000);
});

for (const [label, scan, expected] of [
  ["a scan that flags nothing", { oil: 0, redness: 0, pores: 0, confidence: 0.9 }, true],
  ["a scan that flags a concern", { oil: 3, redness: 0, pores: 0, confidence: 0.9 }, true],
  ["no scan", null, false],
] as const) {
  test(`survey_completed.hasScan is ${expected} after ${label}`, async ({ page }) => {
    await seed(page, scan);
    await openSurvey(page);
    for (const name of ["세럼", "건성", "2만원"]) await chip(page, name).click();
    await submit(page);

    const props = await page.evaluate((key) => {
      const events: { kind: string; props?: Record<string, unknown> }[] = JSON.parse(localStorage.getItem(key) || "[]");
      return events.filter((event) => event.kind === "survey_completed").map((event) => event.props ?? {});
    }, FUNNEL_KEY);
    expect(props).toHaveLength(1);
    expect(props[0].hasScan).toBe(expected);
  });
}
