import { expect, test } from "@playwright/test";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * /checkin's answers did not say which question they answer.
 *
 * Each due card asks 만족도 / 트러블 / 재구매, but the question was a plain <span> next
 * to a row of aria-pressed buttons, and a button's accessible name is only its answer.
 * In English both 트러블 and 재구매 are answered by "Yes" (Arabic gives نعم twice), so
 * a screen-reader user tabbing through a card heard "Yes, toggle button" twice and
 * could not tell a breakout from an intention to repurchase; with two products due,
 * nothing told the cards apart either. This is the page every re-engagement email
 * lands on. Each row is now a group named by its product and its question, both text
 * already on the card. Found by the cycle 117 bug hunt.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ now, day }) => {
      localStorage.setItem("aru.lang", "en");
      if (localStorage.getItem("gyeol_purchases")) return;
      const use = (id: string, sku_id: string, name: string) => ({ id, sku_id, name, confirmedUse: true, ts: now - 15 * day });
      localStorage.setItem(
        "gyeol_purchases",
        JSON.stringify([use("use-cream", "cr3", "레드 블레미쉬 수분 크림"), use("use-serum", "sr1", "어성초 77 B3 징크 세럼")])
      );
    },
    { now: Date.now(), day: DAY_MS }
  );
});

test("each answer toggle is named by its product and its question", async ({ page }) => {
  await page.goto("/checkin");
  await expect(page.getByRole("button", { name: "Log it" })).toHaveCount(2);

  for (const product of ["Red Blemish Moisture Cream", "Heartleaf 77 B3 Zinc Serum"]) {
    const breakouts = page.getByRole("group", { name: `${product} Breakouts`, exact: true });
    const repurchase = page.getByRole("group", { name: `${product} Repurchase`, exact: true });
    const satisfaction = page.getByRole("group", { name: `${product} Satisfaction`, exact: true });

    await expect(breakouts.getByRole("button", { name: "Yes", exact: true })).toHaveCount(1);
    await expect(breakouts.getByRole("button", { name: "None", exact: true })).toHaveCount(1);
    await expect(repurchase.getByRole("button", { name: "Yes", exact: true })).toHaveCount(1);
    await expect(repurchase.getByRole("button", { name: "No", exact: true })).toHaveCount(1);
    await expect(satisfaction.getByRole("button")).toHaveCount(3);
  }

  // Every toggle on the page sits inside one of those six groups.
  const toggles = page.locator("main button[aria-pressed]");
  await expect(toggles).toHaveCount(14);
  await expect(page.locator('main [role="group"] button[aria-pressed]')).toHaveCount(14);
});

test("answering inside a group still records that question", async ({ page }) => {
  await page.goto("/checkin");
  const card = page.getByRole("group", { name: "Red Blemish Moisture Cream Breakouts", exact: true });
  const yes = card.getByRole("button", { name: "Yes", exact: true });
  await yes.click();
  await expect(yes).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("group", { name: "Red Blemish Moisture Cream Repurchase", exact: true }).getByRole("button", { name: "Yes", exact: true })
  ).toHaveAttribute("aria-pressed", "false");
});
