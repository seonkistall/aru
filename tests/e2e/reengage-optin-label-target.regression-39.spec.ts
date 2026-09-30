import { expect, test } from "@playwright/test";

/**
 * The re-engage opt-in's consent control must stay a real tap target in every locale.
 *
 * Cycle 50 measured the `<input type="checkbox">` inside `ReengageOptIn` at 15x15 (`ko`)
 * and 13x15 (`en`) and filed it as under both SC 2.5.8's 24x24 (AA) and the repo's
 * `--tap-min` 44 (WCAG 2.5.5 AAA — see docs/tap-target-provenance.md). Cycle 59 measured
 * the surrounding `<label>` instead, which is the same judgement cycle 49 made for the
 * three /scan consent checkboxes, and found the label is the target: at 360x800 on a
 * production build it is 244x44 in all five locales, and a click at each of its four
 * inner corners, at its far end from the input, and at its midpoint toggles `checked` in
 * both directions. The input was left at its measured 15x15 / 13.046875x15 / 13x15
 * because resizing it would not change the target a finger actually hits.
 *
 * What this pins is that reading: if the label ever stops being at least 24 wide, stops
 * being at least `--tap-min` tall, or stops toggling from a corner, the control falls
 * back to a 13px-wide input and the cycle-50 defect is live again.
 *
 * This spec must never submit the form. The label sits outside the `<form>` and no
 * address is typed, so `submit()` cannot run; every request the page makes is recorded
 * and the test fails if one reaches the subscribe endpoint anyway.
 */

const survey = { type: "복합성", concerns: ["붉은기"], budget: 39000, avoid: [], category: "크림" };

// SC 2.5.8 Target Size (Minimum), level AA. The height floor is read from `--tap-min` at
// runtime rather than hard-coded, so this spec tracks the contract instead of a copy of it.
const AA_MIN = 24;

for (const lang of ["ko", "en", "ja", "zh", "ar"] as const) {
  test(`the opt-in consent label is the tap target in ${lang}`, async ({ page }) => {
    const subscribeCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/reengage/")) subscribeCalls.push(req.url());
    });
    await page.addInitScript(([l, value]) => {
      localStorage.setItem("aru.lang", l as string);
      sessionStorage.setItem("gyeol_survey", JSON.stringify(value));
    }, [lang, survey]);
    await page.goto("/report");
    await page.getByRole("tab").nth(2).click();

    const input = page.locator('label input[type="checkbox"]');
    await input.waitFor();
    const label = input.locator("xpath=ancestor::label[1]");
    await label.scrollIntoViewIfNeeded();

    // The label must not be inside the form, or a click on it could submit.
    expect(await label.evaluate((el) => !!el.closest("form")), `${lang}: label inside form`).toBe(false);

    const tapMin = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tap-min")),
    );
    expect(tapMin, `${lang}: --tap-min`).toBeGreaterThan(0);

    const box = (await label.boundingBox())!;
    expect(box, `${lang}: no label box`).not.toBeNull();
    expect(box.width, `${lang}: consent label width`).toBeGreaterThanOrEqual(AA_MIN);
    expect(box.height, `${lang}: consent label height`).toBeGreaterThanOrEqual(tapMin);

    // A few px in from each inner corner, plus the far end from the input and the
    // midpoint. Each click must flip `checked`, so the run also proves the previous
    // click landed.
    const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
    const probes: Record<string, [number, number]> = {
      TL: [box.x + 3, box.y + 3],
      TR: [box.x + box.width - 3, box.y + 3],
      BL: [box.x + 3, box.y + box.height - 3],
      BR: [box.x + box.width - 3, box.y + box.height - 3],
      far: dir === "rtl" ? [box.x + 3, box.y + box.height / 2] : [box.x + box.width - 3, box.y + box.height / 2],
      mid: [box.x + box.width / 2, box.y + box.height / 2],
    };

    // The opt-in ships unchecked; the toggles below leave it that way (six clicks).
    expect(await input.isChecked(), `${lang}: initial checked state`).toBe(false);
    for (const [name, [x, y]] of Object.entries(probes)) {
      const before = await input.isChecked();
      await page.mouse.click(x, y);
      expect(await input.isChecked(), `${lang}: click at ${name} did not toggle the checkbox`).toBe(!before);
    }
    expect(await input.isChecked(), `${lang}: six toggles should return to unchecked`).toBe(false);

    expect(subscribeCalls, `${lang}: the spec reached the subscribe endpoint`).toEqual([]);

    const inputBox = (await input.boundingBox())!;
    console.log(
      `[reengage-target] ${lang}: dir=${dir} tapMin=${tapMin} label=${box.width}x${box.height} ` +
        `input=${inputBox.width}x${inputBox.height} probes=${Object.keys(probes).join(",")}`,
    );
  });
}
