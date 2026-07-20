import { expect, test } from "@playwright/test";

// Regression: ISSUE — decorative forward arrows (SVG strokes and literal →
// glyphs) stayed pointing right under Arabic RTL, so the journey arrows on
// home/report pointed backwards against the reading direction.
// Found by the 2026-07-20 polish loop on the Arabic surface.

test("forward arrows mirror under RTL and stay unmirrored in LTR", async ({ browser }) => {
  const mirrored = async (lang: "ar" | "en") => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.addInitScript((next) => localStorage.setItem("aru.lang", next), lang);
    const page = await context.newPage();

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    const homeArrow = page.locator(".aru-dir-arrow").first();
    const homeTransform = await homeArrow.evaluate((el) => getComputedStyle(el).transform);

    await page.goto("/report");
    const stepArrow = page.locator(".aru-flow-steps__arrow").first();
    const stepTransform = await stepArrow.evaluate((el) => getComputedStyle(el).transform);

    await context.close();
    return { homeTransform, stepTransform };
  };

  const ar = await mirrored("ar");
  expect(ar.homeTransform).toContain("matrix(-1");
  expect(ar.stepTransform).toContain("matrix(-1");

  const en = await mirrored("en");
  expect(en.homeTransform).toBe("none");
  expect(en.stepTransform).toBe("none");
});
