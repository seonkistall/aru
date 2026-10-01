import { expect, test } from "@playwright/test";

/**
 * Regression: a language switch on `/care` threw the visitor back to the top of the page.
 *
 * `/care` is the screen that carries the merchant links. `LanguageProvider` remounts the
 * whole subtree under `key={active}` (`lib/i18n.tsx`), so `app/care/page.tsx`'s `viewLoaded`
 * state resets and the page returns its `<main className="min-h-screen">` loading branch —
 * one viewport tall. At `scrollHeight` 800 against an 800px viewport the maximum scroll is
 * 0, so the browser clamps `scrollY`, and the content coming back at 1862-2029 does not
 * restore the position. Cycle 61 caught the empty frame with a per-frame recorder
 * (`[ms, scrollY, scrollHeight]` `[11,400,1731] [161,0,800] [177,0,2029]`) and recorded it
 * as a race, having seen one `ja` run keep 400.
 *
 * Measured again in cycle 62 at 360x800 on a production build, through the real picker,
 * scrolling to 400 and switching: 20 switches across `en`/`ja`/`ar` ended at `scrollY` 0
 * on 20 of 20, with and without the frame recorder installed. So on this container it is
 * not intermittent at all.
 *
 * The fix is one effect: the after-mount `sessionStorage` read that sets `viewLoaded` is a
 * LAYOUT effect instead of a passive one, so React flushes the state update that brings the
 * content back inside the same commit and the browser never lays the short document out.
 * After it, the same 20 switches ended at 400 on 20 of 20 and no frame ever read
 * `scrollHeight` 800. `key={active}`, the `inert` hold and the `dir`/`lang` handling are
 * untouched, and nothing is written to storage.
 *
 * This spec re-scrolls to the test offset before every switch, so each of the five is an
 * independent case rather than one that only has to survive the first. The second case uses
 * an offset past one viewport, which a loading branch merely padded to `100vh` would not
 * hold.
 */

const SURVEY = { type: "복합성", concerns: ["모공", "유분"], budget: 25000, avoid: [], category: "토너" };

// Five switches through the real picker, which is what the brief's "at least 5" means. The
// list ends back on Korean so the page the visitor started in is also a destination.
const SWITCHES = [
  ["en", "English"],
  ["ja", "日本語"],
  ["zh", "中文"],
  ["ar", "العربية"],
  ["ko", "한국어"],
] as const;

// The position is either kept exactly or clamped to 0; 2px absorbs a sub-pixel layout
// difference between locales without admitting a clamp.
const TOLERANCE = 2;

async function openCare(page: import("@playwright/test").Page) {
  await page.addInitScript((survey) => {
    try {
      localStorage.setItem("aru.lang", "ko");
      sessionStorage.setItem("gyeol_survey", survey as string);
    } catch {
      /* private mode — the in-memory fallback keeps the session working */
    }
    // `/care`'s merchant links call window.open. Record the argument instead of opening it
    // so no merchant is ever reached from a test run.
    const opened: string[] = [];
    (window as unknown as { __aruOpened: string[] }).__aruOpened = opened;
    window.open = ((url?: string | URL) => {
      opened.push(String(url));
      return null;
    }) as typeof window.open;
    // Cycle 61's frame recorder, kept because the minimum scrollHeight it sees is the
    // mechanism: a clamp needs a frame at 800, and the fix is that no such frame exists.
    const frames: Array<[number, number, number]> = [];
    (window as unknown as { __aruFrames: typeof frames }).__aruFrames = frames;
    const start = Date.now();
    const tick = () => {
      frames.push([Date.now() - start, Math.round(window.scrollY), document.documentElement.scrollHeight]);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, JSON.stringify(SURVEY));
  await page.goto("/care");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");
  await expect(page.locator('[id^="care-merchants-"] button').first()).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

async function switchLanguage(page: import("@playwright/test").Page, label: string, code: string) {
  await page.click('button[aria-label="Language"]');
  await page.getByRole("option", { name: new RegExp(label) }).click();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 })
    .toBe(code === "zh" ? "zh-CN" : code);
  // The provider holds the doomed tree `inert` while a dictionary chunk is in flight; wait
  // for the hold to lift so the position below is read on the remounted tree.
  await expect
    .poll(async () => page.evaluate(() => document.body.hasAttribute("inert")), { timeout: 20_000 })
    .toBe(false);
  await expect(page.locator('[id^="care-merchants-"] button').first()).toBeVisible({ timeout: 20_000 });
}

async function runSwitches(page: import("@playwright/test").Page, offset: number, cases: readonly (readonly [string, string])[]) {
  for (const [code, label] of cases) {
    await page.evaluate((y) => window.scrollTo(0, y), offset);
    await expect.poll(async () => page.evaluate(() => Math.round(window.scrollY)), { timeout: 10_000 }).toBe(offset);
    await page.evaluate(() => {
      (window as unknown as { __aruFrames: unknown[] }).__aruFrames.length = 0;
    });

    await switchLanguage(page, label, code);

    const after = await page.evaluate(() => Math.round(window.scrollY));
    const frames = await page.evaluate(
      () => (window as unknown as { __aruFrames: Array<[number, number, number]> }).__aruFrames,
    );
    const minHeight = frames.length ? Math.min(...frames.map((f) => f[2])) : -1;
    // Printed on every run: the minimum scrollHeight observed across the switch is what
    // says whether the empty branch was ever laid out.
    console.log(
      `[care-scroll] offset=${offset} -> ${code}: scrollY=${after} frames=${frames.length} minScrollHeight=${minHeight}`,
    );
    expect(
      Math.abs(after - offset),
      `${code}: /care lost the scroll position across the switch (scrollY ${after}, expected ${offset}±${TOLERANCE}, minimum scrollHeight seen ${minHeight})`,
    ).toBeLessThanOrEqual(TOLERANCE);
  }
  // No merchant link was followed at any point.
  expect(await page.evaluate(() => (window as unknown as { __aruOpened: string[] }).__aruOpened)).toEqual([]);
}

test("/care keeps the scroll position across five language switches", async ({ page }) => {
  test.setTimeout(180_000);
  await openCare(page);
  await runSwitches(page, 400, SWITCHES);
});

test("/care keeps a scroll position past the first viewport across a language switch", async ({ page }) => {
  test.setTimeout(180_000);
  await openCare(page);
  // 900 is past the 800px viewport, so a loading branch padded to one screen height would
  // still clamp here; the page is 1731px tall in ko, so 900 is reachable.
  await runSwitches(page, 900, [["en", "English"], ["ja", "日本語"]] as const);
});
