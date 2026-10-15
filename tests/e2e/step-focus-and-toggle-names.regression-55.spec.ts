import { expect, test } from "@playwright/test";

/**
 * Three focus and naming gaps on /report, /scan and /studio.
 *
 * /report: "Next: …" on the middle step opened the last step, which has no "Next", and
 * "Back" there opened the first step, which has no "Back". Each removed the button that
 * had just been pressed, and focus fell to <body>. Every Next and Back press now moves
 * focus to the page heading, which names the new step.
 *
 * /scan: the "Learn more about photo and data use" sheet is an aria-modal dialog, and it
 * never received focus: it stayed on the button behind the sheet. Closing it with Close
 * removed the focused button and focus fell to <body>. Focus now moves to the dialog
 * when it opens and back to the button that opened it when it closes.
 *
 * /studio: the four emphasis toggles were each named only by their text, so all four
 * were "Calm" on the default card. Each is now named by its text and then its row's name
 * field, e.g. "Calm Oil", and follows that field when it is renamed.
 *
 * Driven by keyboard where focus is the point (focus, Enter, Escape), in English, the
 * language a visitor with no saved choice gets; the strings are lib/i18n/en.ts's. /scan
 * reaches its live-camera state through the canvas `captureStream()` shim that
 * tests/e2e/mobile-layout.spec.ts uses.
 *
 * Found by the cycle 117 bug hunt; fixed in cycle 118.
 */

const SURVEY = { type: "복합성", concerns: ["모공", "붉은기"], budget: 29000, avoid: ["향료"], category: "세럼" };

const FAKE_CAMERA = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const context = canvas.getContext("2d")!;
  let tick = 0;
  const paint = () => {
    tick += 1;
    context.fillStyle = "#c98b6b";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = `rgb(${210 + (tick % 8)}, 176, 152)`;
    context.beginPath();
    context.ellipse(320, 240, 130, 170, 0, 0, Math.PI * 2);
    context.fill();
  };
  paint();
  setInterval(paint, 100);
  const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(10);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => stream } });
};

test("/report: Next and Back move focus to the new step's heading", async ({ page }) => {
  await page.addInitScript((survey) => {
    try {
      localStorage.setItem("aru.lang", "en");
      sessionStorage.setItem("gyeol_survey", JSON.stringify(survey));
    } catch {
      /* the report redirects to /survey without it, and the first expectation fails */
    }
  }, SURVEY);
  await page.goto("/report");
  // Enter on a button that is not hydrated yet does nothing.
  await page.waitForLoadState("networkidle");

  const heading = page.getByRole("main").getByRole("heading", { level: 1 });
  const next = page.getByRole("button", { name: /^Next: / });
  const back = page.getByRole("button", { name: "Back", exact: true });

  // Loading the page moves focus nowhere.
  await expect(next).toBeVisible();
  await expect(heading).not.toBeFocused();

  await next.focus();
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText("Product options to explore");
  await expect(heading).toBeFocused();

  // The middle step's Next opens the last step, which has no Next.
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText("A simple routine to start today");
  await expect(next).toHaveCount(0);
  await expect(heading, "Next removed itself and focus did not move to the step heading").toBeFocused();

  await back.focus();
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText("Product options to explore");
  await expect(heading).toBeFocused();

  // The middle step's Back opens the first step, which has no Back.
  await back.focus();
  await page.keyboard.press("Enter");
  await expect(back).toHaveCount(0);
  await expect(heading, "Back removed itself and focus did not move to the step heading").toBeFocused();

  // A step tab keeps focus on itself.
  const secondTab = page.getByRole("tab").nth(1);
  await secondTab.focus();
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText("Product options to explore");
  await expect(secondTab).toBeFocused();
});

test("/scan: the info sheet takes focus when it opens and gives it back when it closes", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("aru.lang", "en");
    } catch {
      /* English is also the default with nothing saved */
    }
  });
  await context.addInitScript(FAKE_CAMERA);
  const page = await context.newPage();
  await page.goto("/scan");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("scan-start").click();

  const opener = page.getByRole("button", { name: "Learn more about photo and data use", exact: true });
  const dialog = page.getByRole("dialog", { name: "Capture tips & consent info" });
  await expect(opener).toBeVisible({ timeout: 30_000 });

  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog, "the dialog opened but focus stayed on the button behind it").toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(dialog).toBeFocused();
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await close.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(opener, "Close removed itself and focus did not return to the opener").toBeFocused();

  await context.close();
});

test("/studio: each emphasis toggle is named by its text and then its row", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aru.lang", "en");
    } catch {
      /* English is also the default with nothing saved */
    }
  });
  await page.goto("/studio");
  await page.waitForLoadState("networkidle");

  // The emphasis toggle is the button right after each row's value field.
  const toggles = page.locator("main input + button");
  await expect(toggles).toHaveCount(4);

  const names: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const text = (await toggles.nth(i).innerText()).trim();
    const row = await page.getByRole("textbox", { name: `Item ${i + 1} name`, exact: true }).inputValue();
    expect(row, `row ${i + 1} has no name to put in its toggle's`).not.toBe("");
    // The visible text first (WCAG 2.5.3), then the row.
    await expect(toggles.nth(i)).toHaveAccessibleName(`${text} ${row}`);
    names.push(`${text} ${row}`);
  }
  expect(new Set(names).size, `names: ${JSON.stringify(names)}`).toBe(4);

  // The name follows the row's name field.
  await page.getByRole("textbox", { name: "Item 1 name", exact: true }).fill("Shine");
  const text = (await toggles.first().innerText()).trim();
  await expect(toggles.first()).toHaveAccessibleName(`${text} Shine`);
});
