import { expect, test } from "@playwright/test";

// Regression: ISSUE-001 — the check-in home link rendered at 22×22px.
// Found by product QA on 2026-07-19.
// Report: .gstack/qa-reports/qa-report-aru-local-2026-07-19.md
test("check-in home link meets the mobile touch-target contract", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("aru.lang", "ko"));
  await page.goto("/checkin");

  const home = page.getByRole("link", { name: "아루" });
  await expect(home).toBeVisible();

  const box = await home.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// The same contract, on the controls a user actually answers with — which the test above
// never reached. The rating pills only render once a confirmed product use is at least
// two weeks old (`roundFor`, app/checkin/page.tsx), so an audit run against an empty
// store sees only the two empty-state links and reports /checkin clean. Seeded here the
// way tests/e2e/checkin-schedule.regression-7.spec.ts seeds it, and measured in the
// browser rather than computed from the stylesheet: before `pill()` carried the 44px
// minimum these were 35.5px high in all five locales — 32 of 45 controls under the
// contract, the narrowest being zh 好 at 37px wide and ar لا at 31.4px.
// /checkin is where every re-engagement mail lands (app/api/reengage/run/route.ts), so
// these are the primary controls of the one surface that brings a user back.
for (const lang of ["ko", "en", "ja", "zh", "ar"]) {
  test(`check-in answer controls meet the touch-target contract in ${lang}`, async ({ page }) => {
    await page.addInitScript(({ startedAt, lang }) => {
      localStorage.setItem("aru.lang", lang);
      localStorage.setItem(
        "gyeol_purchases",
        JSON.stringify([
          { id: "tap-use", sku_id: "cr3", name: "레드 블레미쉬 수분 크림", confirmedUse: true, ts: startedAt },
        ])
      );
    }, { startedAt: Date.now() - 3.5 * WEEK_MS, lang });

    await page.goto("/checkin");

    const pills = page.locator("main button");
    // The card renders three questions: 만족도 (3 answers), 트러블 (2), 재구매 (2), plus
    // the save button. Asserted so a card that stopped rendering cannot pass by emptiness.
    await expect(pills).toHaveCount(8);

    const undersized = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll("main button, main a").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 44 || r.height < 44) {
          bad.push(`${(el.textContent ?? "").trim()} ${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`);
        }
      });
      return bad;
    });
    expect(undersized, `${lang}: controls under 44px`).toEqual([]);

    // Raising them widened the rows, so the other half of the check: nothing started
    // overflowing 360px in the process.
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      elements: Array.from(document.querySelectorAll("main *"))
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.tagName),
    }));
    expect(overflow.doc, `${lang}: document overflows 360px`).toBeLessThanOrEqual(0);
    expect(overflow.elements, `${lang}: elements clip their content`).toEqual([]);
  });
}

// The same contract on the EMPTY state, which neither case above reaches: the first
// measures only the home link, and the second seeds a confirmed purchase so the card
// renders and the empty state never appears. It is the state a re-engagement mail lands
// on for anyone who has not recorded a product use — and its two links are the only way
// out of the page.
//
// Measured in Chromium at 360x800 before the fix: `マイレポートを見る` came back
// 155.0x43.0 against ko 115.1x45.0, en 128.3x45.0, zh 120.0x45.0 and ar 113.5x45.0.
// 43.0 is one pixel under `--tap-min: 44px` and, counter-intuitively, it is the height
// the stylesheet actually asks for — see the comment on `ctaBase` in
// app/checkin/page.tsx. Asserted per locale rather than only on the observed one,
// because what made ja differ is a font-fallback baseline and a new dictionary entry
// can move any of the five.
for (const lang of ["ko", "en", "ja", "zh", "ar"]) {
  test(`check-in empty-state links meet the touch-target contract in ${lang}`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("aru.lang", l), lang);
    await page.goto("/checkin");

    // No seeded store, so the empty state is what renders. Asserted so a page that
    // stopped rendering its links cannot pass by emptiness.
    const links = page.locator("main a");
    await expect(links).toHaveCount(3); // the home link plus the two empty-state CTAs

    const undersized = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll("main a, main button").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 44 || r.height < 44) {
          bad.push(`${(el.textContent ?? "").trim()} ${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`);
        }
      });
      return bad;
    });
    expect(undersized, `${lang}: empty-state controls under 44px`).toEqual([]);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${lang}: document overflows 360px`).toBeLessThanOrEqual(0);
  });
}
