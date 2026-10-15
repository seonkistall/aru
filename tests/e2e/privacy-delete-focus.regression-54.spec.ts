import { expect, test } from "@playwright/test";

/**
 * /privacy's "delete all device data" flow lost keyboard focus at every step.
 *
 * Each step swaps one block for another: "Delete all ARU data on this device" is
 * replaced by the confirmation (its heading, Cancel and Delete everything), Cancel
 * brings the first button back, and Delete everything is replaced by the "deleted"
 * status line. The button that had just been pressed was unmounted every time and
 * nothing took focus, so it fell to <body>. A keyboard user had to Tab from the top of
 * the page to find the confirmation, and a screen-reader user heard nothing at all:
 * the confirmation is not a live region, and the status line is mounted already
 * holding its text, which screen readers commonly do not announce. Focus now moves to
 * the confirmation heading, back to the restored delete button on Cancel, and to the
 * status line once the data is gone. The error outcome keeps its role="alert".
 *
 * Driven by keyboard alone (focus, Enter, Tab), in English, the language a visitor
 * with no saved choice gets; the strings are lib/i18n/en.ts's.
 *
 * Found by the cycle 117 bug hunt.
 */

const DELETE_ALL = "Delete all ARU data on this device";
const CONFIRM_HEADING = "Delete all data on this device?";
const CANCEL = "Cancel";
const DELETE_EVERYTHING = "Delete everything";
const DONE = "All ARU data stored on this device has been deleted.";

test("the delete flow keeps keyboard focus on what replaced the pressed button", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aru.lang", "en");
    } catch {
      /* English is also the default with nothing saved */
    }
  });
  await page.goto("/privacy");
  // Enter on a button that is not hydrated yet does nothing.
  await page.waitForLoadState("networkidle");

  const deleteAll = page.getByRole("button", { name: DELETE_ALL, exact: true });
  const confirmHeading = page.getByRole("heading", { name: CONFIRM_HEADING, exact: true });
  const cancel = page.getByRole("button", { name: CANCEL, exact: true });
  const deleteEverything = page.getByRole("button", { name: DELETE_EVERYTHING, exact: true });

  // Loading the page moves focus nowhere.
  await expect(deleteAll).toBeVisible();
  await expect(deleteAll).not.toBeFocused();

  await deleteAll.focus();
  await page.keyboard.press("Enter");
  await expect(confirmHeading, "the confirmation appeared but focus did not move to it").toBeFocused();

  // From the heading, Tab reaches the confirmation's own controls in order.
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(deleteAll, "Cancel restored the delete button but focus did not return to it").toBeFocused();

  await page.keyboard.press("Enter");
  await expect(confirmHeading).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(deleteEverything).toBeFocused();
  await page.keyboard.press("Enter");

  const done = page.getByRole("status").filter({ hasText: DONE });
  await expect(done).toHaveText(DONE);
  await expect(done, "the data was deleted but focus did not move to the outcome").toBeFocused();
});
