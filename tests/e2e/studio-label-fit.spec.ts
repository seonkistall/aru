import { expect, test } from "@playwright/test";

/**
 * /studio's per-read editor cut its own prefilled text in three of five locales.
 *
 * The name field was a fixed `width: 96` (94px of content box) and the value field took
 * whatever was left of the row. Measured in Chromium against the real page, as the text
 * width the field's own prefilled value needs including its padding, against the box it
 * gets (negative = clipped):
 *
 *   field   locale  value                 360px      320px
 *   name    en      "Pores/texture"       -14.7      -14.7
 *   name    ar      "المسام/الملمس"        -23.2      -23.2
 *   value   en      "Fairly comfortable"  +21.7      -18.3
 *   value   ja      "落ち着いている"          +23.4      -16.6
 *
 * The name box does not depend on the viewport, so en and ar cut the label at every
 * width, desktop included. /studio is the product's only image-share surface and the
 * share loop is its only organic acquisition path, so this is the screen a first-time
 * sharer edits before sending.
 *
 * Why the fix is a wrap rather than a wider name field: at 320px the en value already
 * needed 137.3px against a 119px box, so taking width from the value to give to the name
 * makes the narrow viewport worse. The name takes its own line instead.
 *
 * Both halves are asserted. A width floor alone would pass a field wide enough to tap
 * that still cuts its label; `scrollWidth <= clientWidth` alone would pass a 20px field
 * showing all of a one-character value. This is cycle 25's lesson in a different shape:
 * the first version of that guard measured the wrong element and looked green.
 */
const LANGS = ["ko", "en", "ja", "zh", "ar"] as const;

for (const width of [320, 360]) {
  for (const lang of LANGS) {
    test(`studio read fields show their own value in ${lang} at ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      await context.addInitScript((l) => localStorage.setItem("aru.lang", l), lang);
      const page = await context.newPage();
      await page.goto("/studio");
      await page.evaluate(() => document.fonts.ready);

      const fields = page.locator("main input");
      // Four reads, each a name and a value field. Asserted so an editor that stopped
      // rendering cannot pass this spec by being empty.
      await expect(fields).toHaveCount(8);

      const report = await page.evaluate(() => {
        const clipped: string[] = [];
        const narrow: string[] = [];
        document.querySelectorAll("main input").forEach((element) => {
          const input = element as HTMLInputElement;
          const rect = input.getBoundingClientRect();
          const label = `${input.getAttribute("aria-label")}="${input.value}"`;
          if (input.scrollWidth > input.clientWidth + 1) {
            clipped.push(`${label} sw=${input.scrollWidth} cw=${input.clientWidth}`);
          }
          if (rect.width < 44 || rect.height < 44) {
            narrow.push(`${label} ${Math.round(rect.width * 10) / 10}x${Math.round(rect.height * 10) / 10}`);
          }
        });
        return {
          clipped,
          narrow,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      expect(report.clipped, `${lang} @${width}: read fields cutting their own value`).toEqual([]);
      expect(report.narrow, `${lang} @${width}: read fields under the 44px tap contract`).toEqual([]);
      expect(report.overflow, `${lang} @${width}: document overflows the viewport`).toBeLessThanOrEqual(0);
      await context.close();
    });
  }
}
