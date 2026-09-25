import { test, expect } from "@playwright/test";

/**
 * Regression 28 — the landing header's tagline ran into the ARU wordmark.
 *
 * `app/page.tsx`'s header reserved space for the fixed language pill with
 * `paddingInlineEnd` and nothing else, so `justify-between` handed the tagline
 * every remaining pixel and the two boxes abutted at exactly 0px. Measured at
 * 360x800 on a production build, the painted first line came within 1.7px of
 * the wordmark in ar and 4.4px in zh. The reservation is now 106px with a 12px
 * column gap, which keeps the tagline box the same width (155.3px) and moves
 * every line away from the wordmark.
 *
 * Two floors, because the fix trades one clearance for the other: the gap to
 * the wordmark must not shrink, and the reservation must still clear the pill.
 */

const LANGS = ["ko", "en", "ja", "zh", "ar"] as const;
const GLYPH_GAP_MIN = 12;

for (const lang of LANGS) {
  test(`${lang}: the tagline's painted lines clear the wordmark and the language pill`, async ({ page }) => {
    await page.addInitScript(`try{localStorage.setItem("aru.lang",${JSON.stringify(lang)})}catch{}`);
    await page.goto("/");
    await expect(page.locator('[data-testid="header-tagline"]')).toBeVisible();

    const m = await page.evaluate(() => {
      const rects = (el: Element) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return [...range.getClientRects()].map((b) => ({ x: b.x, right: b.right, y: b.y, height: b.height }));
      };
      const header = document.querySelector("header")!;
      const wordmark = header.querySelector("span")!;
      const tagline = document.querySelector('[data-testid="header-tagline"]')!;
      const pill = document.querySelector('button[aria-label="Language"]')!.getBoundingClientRect();
      const rtl = getComputedStyle(document.documentElement).direction === "rtl";
      const wm = rects(wordmark);
      const top = Math.min(...wm.map((r) => r.y));
      const bottom = Math.max(...wm.map((r) => r.y + r.height));
      let worst = Number.POSITIVE_INFINITY;
      for (const line of rects(tagline)) {
        if (line.y + line.height <= top || line.y >= bottom) continue;
        const gap = rtl
          ? Math.min(...wm.map((r) => r.x)) - line.right
          : line.x - Math.max(...wm.map((r) => r.right));
        worst = Math.min(worst, gap);
      }
      const box = tagline.getBoundingClientRect();
      const pillSlack = rtl ? box.x - pill.right : pill.x - box.right;
      const style = getComputedStyle(header);
      return {
        worstGlyphGap: Number.isFinite(worst) ? worst : null,
        pillSlack,
        columnGap: style.columnGap,
        paddingInlineEnd: style.paddingInlineEnd,
        taglineWidth: box.width,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      };
    });

    expect(m.worstGlyphGap, `tagline line 1 sits ${m.worstGlyphGap}px from the wordmark`).not.toBeNull();
    expect(
      m.worstGlyphGap!,
      `worstGlyphGap=${m.worstGlyphGap} pillSlack=${m.pillSlack} taglineWidth=${m.taglineWidth}`,
    ).toBeGreaterThanOrEqual(GLYPH_GAP_MIN);
    expect(m.pillSlack, `the language pill overlaps the tagline box by ${-m.pillSlack}px`).toBeGreaterThan(0);
    expect(m.columnGap).toBe("12px");
    expect(m.paddingInlineEnd).toBe("106px");
    expect(m.scrollW).toBe(m.clientW);
  });
}
