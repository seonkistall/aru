import { expect, test, type Page } from "@playwright/test";

/**
 * `/care` is the product's second commerce surface — it is reachable from the nav on
 * every page, its merchant buttons are the same `/api/out` links `/report` uses, and it
 * had no browser-level coverage of any kind.
 *
 * The defect this pins: the "다른 판매처 보기" disclosure named a panel that CONTAINED
 * it. `aria-controls={merchantPanelId}` pointed at the grid the toggle itself was a
 * child of, so a screen-reader user following the relationship from the button landed
 * on a region whose contents included the button they had just left. Confirmed in
 * Chromium at 360px in all five locales before the fix (`containsToggle=true`, five of
 * five). The fix moves the toggle out to be the panel's sibling; two nested grids with
 * the same 7px gap render identically to the single grid they replace, measured
 * collapsed and expanded — every button's x, y, width and height unchanged.
 *
 * The rest of the file is the layout coverage `/care` never had. It found nothing on
 * the day it was written (overflow 0 and no control under 44px in any locale), which is
 * worth having as a guard rather than as a note.
 */

const survey = { type: "복합성", concerns: ["모공", "유분"], budget: 25000, avoid: [], category: "토너" };
const languages = ["ko", "en", "ja", "zh", "ar"] as const;

async function openCare(page: Page, lang: string) {
  await page.addInitScript(([l, s]) => {
    localStorage.setItem("aru.lang", l as string);
    sessionStorage.setItem("gyeol_survey", s as string);
  }, [lang, JSON.stringify(survey)] as const);
  await page.goto("/care");
  // Structural rather than by label: the toggle's copy is translated, and this
  // helper is used by the locale sweep below.
  await page.locator("button[aria-controls]").first().waitFor();
}

test("the merchant disclosure does not name a panel that contains it", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openCare(page, "ko");

  const structure = await page.evaluate(() => {
    const toggles = Array.from(document.querySelectorAll("button[aria-controls]"));
    return toggles.map((toggle) => {
      const id = toggle.getAttribute("aria-controls")!;
      const panel = document.getElementById(id);
      return {
        id,
        panelExists: Boolean(panel),
        containsToggle: panel ? panel.contains(toggle) : true,
        merchantButtons: panel ? panel.querySelectorAll("button").length : -1,
        expanded: toggle.getAttribute("aria-expanded"),
      };
    });
  });

  expect(structure.length, "no merchant disclosure rendered; the fixture reached the wrong page").toBeGreaterThan(0);
  for (const row of structure) {
    expect(row.panelExists, `aria-controls="${row.id}" names no element`).toBe(true);
    expect(
      row.containsToggle,
      `aria-controls="${row.id}" names a panel that contains its own toggle: a disclosure cannot control a region it is inside`
    ).toBe(false);
    expect(row.expanded, `${row.id} starts collapsed`).toBe("false");
    expect(row.merchantButtons, `${row.id} collapsed holds one merchant and no toggle`).toBe(1);
  }
});

test("expanding the disclosure changes the panel it names, and nothing else", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openCare(page, "ko");

  const toggle = page.getByRole("button", { name: "다른 판매처 보기" }).first();
  const panelId = await toggle.getAttribute("aria-controls");
  await toggle.click();

  await expect(page.getByRole("button", { name: "다른 판매처 닫기" }).first()).toHaveAttribute("aria-expanded", "true");
  const count = await page.evaluate((id) => document.getElementById(id!)!.querySelectorAll("button").length, panelId);
  // Four merchants ship in lib/commerce.ts; the assertion is that the panel grew, and
  // that the toggle is still not one of the buttons inside it.
  expect(count, "expanding did not add merchants to the controlled panel").toBeGreaterThan(1);
  const containsToggle = await page.evaluate((id) => {
    const panel = document.getElementById(id!)!;
    return Boolean(panel.querySelector("button[aria-controls]"));
  }, panelId);
  expect(containsToggle, "the expanded panel swallowed its own toggle").toBe(false);
});

test("/care fits 360px and keeps every control tappable in all five locales", async ({ browser }) => {
  test.setTimeout(180_000);
  const failures: string[] = [];
  for (const lang of languages) {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const page = await context.newPage();
    await openCare(page, lang);
    const found = await page.evaluate((locale) => {
      const problems: string[] = [];
      const doc = document.documentElement;
      const overflow = Math.max(0, doc.scrollWidth - doc.clientWidth);
      if (overflow > 0) problems.push(`${locale} document overflows by ${overflow}px`);
      document.querySelectorAll("main button, main a").forEach((el) => {
        const r = el.getBoundingClientRect();
        const label = (el.textContent || "").trim().slice(0, 24);
        if (r.height < 44) problems.push(`${locale} "${label}" is ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);
        if (r.left < -0.5 || r.right > doc.clientWidth + 0.5) {
          problems.push(`${locale} "${label}" spans ${r.left.toFixed(1)}..${r.right.toFixed(1)} outside 0..${doc.clientWidth}`);
        }
      });
      return problems;
    }, lang);
    failures.push(...found);
    await context.close();
  }
  expect(failures, "controls under the 44px tap contract, or clipped, on /care").toEqual([]);
});
