import { expect, test } from "@playwright/test";

// Regression: ISSUE — decorative forward arrows (SVG strokes and literal →
// glyphs) stayed pointing right under Arabic RTL, so the journey arrows on
// home/report pointed backwards against the reading direction.
// Found by the 2026-07-20 polish loop on the Arabic surface.
//
// Assertions use toHaveCSS (auto-retrying) rather than a single evaluate():
// LanguageProvider remounts the subtree on language change, so a one-shot
// computed-style read races the remount and intermittently sees "none".

const MIRRORED = "matrix(-1, 0, 0, 1, 0, 0)";

async function openHome(browser: import("@playwright/test").Browser, lang: "ar" | "en") {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript((next) => localStorage.setItem("aru.lang", next), lang);
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  return { context, page };
}

test("forward arrows mirror under Arabic RTL", async ({ browser }) => {
  const { context, page } = await openHome(browser, "ar");

  const homeArrows = page.locator(".aru-dir-arrow");
  await expect(homeArrows.first()).toHaveCSS("transform", MIRRORED);
  for (let i = 0; i < await homeArrows.count(); i += 1) {
    await expect(homeArrows.nth(i)).toHaveCSS("transform", MIRRORED);
  }

  await page.goto("/report");
  await expect(page.locator(".aru-flow-steps__arrow").first()).toHaveCSS("transform", MIRRORED);

  await context.close();
});

test("forward arrows stay unmirrored in LTR", async ({ browser }) => {
  const { context, page } = await openHome(browser, "en");

  await expect(page.locator(".aru-dir-arrow").first()).toHaveCSS("transform", "none");

  await page.goto("/report");
  await expect(page.locator(".aru-flow-steps__arrow").first()).toHaveCSS("transform", "none");

  await context.close();
});
