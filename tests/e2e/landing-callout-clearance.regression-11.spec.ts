import { expect, test } from "@playwright/test";

// Regression 11: the hero callout is absolutely positioned above the mascot and
// used to bleed upward past its reserved padding, colliding with the header
// tagline at 360-560px — most visibly in sans-serif locales where the glyphs
// fill the whole line box. The two text blocks must never intersect.
const languages = ["ko", "en", "ja", "zh", "ar"] as const;

test("hero callout never collides with the header tagline", async ({ browser }) => {
  test.setTimeout(180_000);
  for (const width of [360, 480, 560]) {
    for (const lang of languages) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      await context.addInitScript((nextLang) => localStorage.setItem("aru.lang", nextLang), lang);
      const page = await context.newPage();
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByTestId("header-tagline")).toBeVisible();
      await expect(page.getByTestId("hero-callout")).toBeVisible();
      const tagline = await page.getByTestId("header-tagline").boundingBox();
      const callout = await page.getByTestId("hero-callout").boundingBox();
      expect(tagline, `${lang} ${width}px tagline`).not.toBeNull();
      expect(callout, `${lang} ${width}px callout`).not.toBeNull();
      const overlapX = Math.min(tagline!.x + tagline!.width, callout!.x + callout!.width) - Math.max(tagline!.x, callout!.x);
      const overlapY = Math.min(tagline!.y + tagline!.height, callout!.y + callout!.height) - Math.max(tagline!.y, callout!.y);
      const intersects = overlapX > 0 && overlapY > 0;
      expect(intersects, `${lang} ${width}px: tagline ${JSON.stringify(tagline)} intersects callout ${JSON.stringify(callout)}`).toBe(false);
      await context.close();
    }
  }
});
