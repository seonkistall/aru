import { expect, test } from "@playwright/test";

/**
 * A malformed `gyeol_survey` takes BOTH revenue screens, and /report makes it permanent.
 *
 * `/report` and `/care` each read `sessionStorage["gyeol_survey"]` inside a
 * `try { JSON.parse } catch { return null }` and then hand the result straight to
 * `recommend(survey, scan)`. The catch only covers the parse: a value that parses to the
 * WRONG SHAPE sails past it and `recommend` throws at `survey.concerns` / `survey.avoid`
 * inside the mount effect, so `app/error.tsx` replaces the page — and with it every
 * `/api/out` link on `/report` and every merchant button on `/care`, which is the whole
 * of the paying path.
 *
 * `/report` also mirrors the value on the way past: `loadInitialView` calls
 * `saveLastResult({ survey, ... })` on the line BEFORE `recommend(survey, scan)`, so the
 * bad survey is written to `localStorage["aru_last_result"]` before the throw. After that
 * the fresh-tab fallback in both pages (`loadLastResult`) re-reads it forever — the third
 * case below is that state, with no sessionStorage at all.
 *
 * Fixed by one shape check at the three reads (`isSurvey` in `lib/recommend.ts`): the
 * pages fall back to the path they already have for "no survey yet" — `/report` redirects
 * to `/survey`, `/care` shows its own empty state with the scan CTA — and the mirror is
 * never written.
 */

const SURVEY_KEY = "gyeol_survey";
const LAST_RESULT_KEY = "aru_last_result";

// Valid JSON every one, so the try/catch at the read never sees them.
const WRONG_SHAPES: [string, string][] = [
  ["null", "null"],
  ["a number", "5"],
  ["a string", '"abcdef"'],
  ["an empty object", "{}"],
  ["a boolean", "true"],
  ["an array", "[]"],
  ["a survey with no avoid list", '{"type":"지성","concerns":["모공"],"budget":30000,"category":"토너"}'],
  ["a survey whose concerns is a string", '{"type":"지성","concerns":"모공","budget":30000,"avoid":[],"category":"토너"}'],
];

async function settle(page: import("@playwright/test").Page) {
  // Both pages read the store in a mount effect, so the first paint is the loading
  // shell either way. Two animation frames put the assertions after that effect.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

for (const [name, raw] of WRONG_SHAPES) {
  test(`/report survives a survey store holding ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.addInitScript(
      ([surveyKey, value]) => {
        localStorage.setItem("aru.lang", "ko");
        sessionStorage.setItem(surveyKey as string, value as string);
      },
      [SURVEY_KEY, raw] as const,
    );
    const page = await context.newPage();
    await page.goto("/report");
    await settle(page);

    await expect(page.getByText("앗, 잠깐 멈췄어요"), `/report fell into app/error.tsx on ${name}`).toHaveCount(0);
    // The page's own "no usable survey" path, which it already had.
    await expect(page, `/report did not reach the survey on ${name}`).toHaveURL(/\/survey$/);

    // And the bad value was not mirrored into localStorage on the way past, so the
    // next tab session is not born broken.
    const mirrored = await page.evaluate((key) => localStorage.getItem(key as string), LAST_RESULT_KEY);
    expect(mirrored, `/report mirrored ${name} into ${LAST_RESULT_KEY}`).toBeNull();

    await context.close();
  });

  test(`/care still offers its merchant path when the survey store holds ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.addInitScript(
      ([surveyKey, value]) => {
        localStorage.setItem("aru.lang", "ko");
        sessionStorage.setItem(surveyKey as string, value as string);
      },
      [SURVEY_KEY, raw] as const,
    );
    const page = await context.newPage();
    await page.goto("/care");
    await settle(page);

    await expect(page.getByText("앗, 잠깐 멈췄어요"), `/care fell into app/error.tsx on ${name}`).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 1, name: "아직 이어서 볼 리포트가 없어요." }),
      `/care showed neither its picks nor its empty state on ${name}`,
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "내 피부 살펴보기" })).toBeVisible();

    await context.close();
  });
}

test("/care survives the mirrored copy a broken /report left in localStorage", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(
    ([lastResultKey]) => {
      localStorage.setItem("aru.lang", "ko");
      // Exactly what saveLastResult writes on the line before recommend() throws.
      localStorage.setItem(
        lastResultKey as string,
        JSON.stringify({ survey: 5, scan: null, reads: null, ts: 1758600000000 }),
      );
    },
    [LAST_RESULT_KEY] as const,
  );
  const page = await context.newPage();
  await page.goto("/care");
  await settle(page);

  await expect(page.getByText("앗, 잠깐 멈췄어요"), "/care fell into app/error.tsx on a mirrored bad survey").toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "아직 이어서 볼 리포트가 없어요." })).toBeVisible();

  await context.close();
});
