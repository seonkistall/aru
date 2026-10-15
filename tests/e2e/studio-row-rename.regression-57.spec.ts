import { expect, test } from "@playwright/test";

/**
 * Renaming a /studio row could leave a stale fifth row on the share card.
 *
 * ShareCard keyed its rows by label, and the labels are what the visitor types. Renaming
 * row 1 (유분) to "전반적인 톤" one keystroke at a time passes through "전반", row 4's
 * label: two rows shared a key, and on the next keystroke React's reconcile left the
 * old row's DOM node in the card. It stayed through further edits and preset taps, and
 * PNG 저장 / 공유하기 rasterize the card's real DOM, so it went into the shared image.
 * Rows are now keyed by position. Found by the cycle 119 bug hunt.
 */

test("typing a row name through another row's name leaves four rows on the card", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("aru.lang", "ko"));
  await page.goto("/studio");
  const name = page.getByRole("textbox", { name: "항목 1 이름" });
  await expect(name).toHaveValue("유분");
  // Row 1's value appears once on the card (the editor shows it in an input, which
  // getByText does not read).
  await expect(page.getByText("유분 적음", { exact: true })).toHaveCount(1);

  await name.fill("");
  await name.pressSequentially("전반적인 톤", { delay: 30 });
  await expect(name).toHaveValue("전반적인 톤");

  await expect(page.getByText("유분 적음", { exact: true })).toHaveCount(1);
  await expect(page.getByText("전반적인 톤", { exact: true })).toHaveCount(1);
  await expect(page.getByText("전반", { exact: true })).toHaveCount(1);
});
