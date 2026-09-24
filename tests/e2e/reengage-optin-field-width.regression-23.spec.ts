import { expect, test } from "@playwright/test";

/**
 * The email field on the re-engagement opt-in must stay usable at 360px in every
 * locale.
 *
 * The opt-in is the only retention loop the product has, and its form put the address
 * input and the submit button on one flex line: the button `flexShrink: 0`, the input
 * `flex: 1, minWidth: 0`. The button's label is a translated sentence, so the input got
 * whatever the longest translation left it. Measured at 360x800 on /report before the
 * fix: 26.3px under `ar` and 30.8px under `ja`, against buttons of 209.7px and 205.3px.
 * At 26px no part of a typed address is visible.
 *
 * Pinned as a floor per locale rather than as the exact number, because the number is
 * the button's own width subtracted from a container and a copy edit may legitimately
 * move it. What must not come back is a field too narrow to read.
 */

const survey = { type: "복합성", concerns: ["붉은기"], budget: 39000, avoid: [], category: "크림" };

// Enough to show a typed address rather than a fragment of one. The container is 244px
// wide at this viewport, so a wrapped field reads 244 and anything sharing its line with
// a translated button label reads well under this.
const MIN_FIELD_WIDTH = 200;

for (const lang of ["ko", "en", "ja", "zh", "ar"] as const) {
  test(`the opt-in email field stays readable at 360px in ${lang}`, async ({ page }) => {
    await page.addInitScript(([l, value]) => {
      localStorage.setItem("aru.lang", l as string);
      sessionStorage.setItem("gyeol_survey", JSON.stringify(value));
    }, [lang, survey]);
    await page.goto("/report");
    await page.getByRole("tab").nth(2).click();

    const email = page.locator('input[type="email"]');
    await email.waitFor();
    const field = await email.boundingBox();
    const button = await email.locator("xpath=following-sibling::button").boundingBox();
    expect(field, `${lang}: no email field`).not.toBeNull();
    expect(button, `${lang}: no submit button`).not.toBeNull();

    expect(field!.width, `${lang}: email field width`).toBeGreaterThanOrEqual(MIN_FIELD_WIDTH);
    // The button keeps its own line and its tap target; wrapping must not have traded
    // one unusable control for another.
    expect(button!.width, `${lang}: button width`).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(button!.height, `${lang}: button height`).toBeGreaterThanOrEqual(44);

    // And nothing was pushed off the side of the page to buy that width.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth, `${lang}: horizontal page scroll`).toBeLessThanOrEqual(overflow.clientWidth);
  });
}
