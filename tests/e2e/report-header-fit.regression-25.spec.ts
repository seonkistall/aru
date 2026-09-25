import { expect, test } from "@playwright/test";

const survey = { type: "복합성", concerns: ["붉은기"], budget: 39000, avoid: [], category: "크림" };

/**
 * Regression: the /report title block at 360px.
 *
 * Measured 2026-09-25 at 360x800 on the unfixed tree. The title row is a flex row of a
 * text column and a 60px mascot with `justifyContent: space-between`. The text column
 * had no `minWidth`, so it took its max-content width — 331.5px under `en`, 332.8px
 * under `ar`, against a 320px content box — and the mascot, which has no intrinsic
 * minimum of its own, was shrunk to **width 0** and laid out at left **361.5** (`en`)
 * and **-2.8** (`ar`): off the screen in both directions. `ko`, `ja` and `zh` fitted
 * and showed it.
 *
 * `/report` is where every commerce link on the site lives, so it is the screen a
 * cycle should not leave half-drawn in two of five locales.
 *
 * The two properties this pins are `minWidth: 0` on the text column with
 * `flexShrink: 0` on the mascot (`app/report/page.tsx`), and `flexWrap: "wrap"` on the
 * step rail (`app/components/flow-steps.tsx`) — without the second the first alone
 * narrows the column to 250px and pushes the rail's last label out to 350.5 (`en`) and
 * 8.2 (`ar`), past the same box.
 */
for (const lang of ["ko", "en", "ja", "zh", "ar"]) {
  test(`the report title block and its mascot both fit 360px under ${lang}`, async ({ page }) => {
    await page.addInitScript((value) => {
      localStorage.setItem("aru.lang", value.lang);
      sessionStorage.setItem("gyeol_survey", JSON.stringify(value.survey));
    }, { lang, survey });
    await page.goto("/report");
    await page.waitForSelector("main h1");

    const measured = await page.evaluate(() => {
      const doc = document.documentElement;
      const h1 = document.querySelector("main h1") as HTMLElement;
      const column = h1.parentElement as HTMLElement;
      const row = column.parentElement as HTMLElement;
      const mascot = row.children[1] as HTMLElement;
      const box = column.getBoundingClientRect();
      const outside = (Array.from(column.querySelectorAll("*")) as HTMLElement[]).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > box.right + 0.5 || r.left < box.left - 0.5);
      }).length;
      const m = mascot.getBoundingClientRect();
      return {
        docScroll: doc.scrollWidth,
        docClient: doc.clientWidth,
        rowScroll: row.scrollWidth,
        rowClient: row.clientWidth,
        mascotWidth: m.width,
        mascotLeft: m.left,
        mascotRight: m.right,
        outside,
      };
    });

    // The mascot is drawn at its full 60px and sits inside the page's content box.
    expect(measured.mascotWidth).toBeCloseTo(60, 1);
    expect(measured.mascotLeft).toBeGreaterThanOrEqual(19.5);
    expect(measured.mascotRight).toBeLessThanOrEqual(340.5);
    // Nothing in the text column hangs outside the column.
    expect(measured.outside).toBe(0);
    // And the row itself does not clip, nor does the page scroll sideways.
    expect(measured.rowScroll).toBe(measured.rowClient);
    expect(measured.docScroll).toBe(measured.docClient);
  });
}
