import { expect, test } from "@playwright/test";

/**
 * Regression: the "추천 제품 비교" row on /report's picks step is a `<details>`, and
 * nothing on screen said so. Its `<summary>` is `display: flex`, which is exactly the
 * case where Chromium paints no `::marker`, and the inline style also set
 * `listStyle: "none"`. So the one control that lets a user compare the three picks
 * before choosing which to buy rendered as a caption sitting above the buy buttons.
 *
 * Measured before the fix, on a production build at 360x800 on the picks step:
 *   summary text      "추천 제품 비교예산대, 용량, 주요 성분을 비교해 보세요."
 *   display           flex
 *   list-style-type   none
 *   child spans       2          (the label and the hint — no glyph of any kind)
 *
 * The fix is `.aru-details-marker` (app/globals.css), drawing ↓ when shut and ↑ when
 * open, driven off `details[open]` so the glyph cannot disagree with the panel. It is
 * the same affordance /care's merchant expander already carries, and it is vertical,
 * so unlike the forward arrows it needs no RTL mirroring — the flex row puts it at the
 * inline end by itself.
 */

const READS = {
  oil: { value: "유분 많음", level: 2, calm: false },
  pores: { value: "결 약간 보임", level: 1, calm: false },
  redness: { value: "붉은기 약간", level: 1, calm: false },
  overall: { value: "균형 관리 필요", level: 2, calm: false },
  headline: "T존 유분과 피부결을 함께 볼게요",
  narrative: "T존 유분감이 비교적 뚜렷하고, 볼에 옅은 붉은기가 보여요. 피부결은 약간 보이는 편이에요.",
  confidence: 0.72, confidenceLabel: "보통", retakeRecommended: false, retakeReasons: [],
  signals: [{ label: "조명", ok: true, detail: "빛이 충분해요" }], source: "roi-calibrated", raw: {},
};
const SCAN = { oil: 2, redness: 1, pores: 1, confidence: 0.72, retakeRecommended: false, source: "roi-calibrated" };
const SURVEY = '{"type":"지성","concerns":["모공"],"budget":30000,"avoid":[],"category":"토너"}';

for (const lang of ["ko", "en", "ar"] as const) {
  test(`the compare row shows that it opens, under ${lang}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.addInitScript(
      ([l, r, s, sv]) => {
        localStorage.setItem("aru.lang", l as string);
        sessionStorage.setItem("gyeol_reads", r as string);
        sessionStorage.setItem("gyeol_scan", s as string);
        sessionStorage.setItem("gyeol_survey", sv as string);
      },
      [lang, JSON.stringify(READS), JSON.stringify(SCAN), SURVEY] as const,
    );
    const page = await context.newPage();
    await page.goto("/report");
    await page.getByRole("tab").nth(1).click();
    await expect(page.locator("details summary").first()).toBeVisible();

    const state = () =>
      page.evaluate(() => {
        const marker = document.querySelector(".aru-details-marker");
        const details = document.querySelector("details") as HTMLDetailsElement;
        const box = marker?.getBoundingClientRect();
        const summary = (document.querySelector("details summary") as HTMLElement).getBoundingClientRect();
        return {
          open: details.open,
          glyph: marker ? getComputedStyle(marker, "::after").content.replaceAll('"', "") : null,
          // Where the glyph sits relative to the summary, in reading order.
          atInlineEnd: !!box && (getComputedStyle(document.documentElement).direction === "rtl"
            ? box.left - summary.left < 20
            : summary.right - box.right < 20),
          pageOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
        };
      });

    const shut = await state();
    expect(shut.open).toBe(false);
    expect(shut.glyph).toBe("↓");
    expect(shut.atInlineEnd).toBe(true);
    expect(shut.pageOverflow).toBe(true);

    await page.locator("details summary").first().click();
    const open = await state();
    expect(open.open).toBe(true);
    // The glyph is driven off details[open], so it cannot disagree with the panel.
    expect(open.glyph).toBe("↑");
    expect(open.atInlineEnd).toBe(true);
    expect(open.pageOverflow).toBe(true);

    await context.close();
  });
}
