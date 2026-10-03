import { expect, test } from "@playwright/test";

/**
 * Regression: a language switch on `/studio` threw away the card copy the visitor
 * had typed.
 *
 * `LanguageProvider` remounts the whole subtree under `key={active}`
 * (`lib/i18n.tsx`), so every piece of React state goes with the discarded tree.
 * `/studio` held the headline and the four read rows in `useState` alone and wrote
 * nothing anywhere, so a visitor who changed the language mid-edit got the English
 * preset back instead of their own words. Measured on a production build at 360x800
 * through the real picker: a headline typed as `내 피부, 오늘은 최고` came back as
 * `Calm and\ncomfortable texture` on the tap to `en`, on both the textarea and the
 * card itself.
 *
 * `/studio` is the share card's only renderer and it is linked from the `/scan`
 * result screen, so it is the editing step in front of the one image this product
 * puts into a chat.
 *
 * The fix is the pattern `/survey` (`surveyDraft`) and `/checkin` (`checkinDraft`)
 * already use: the card copy is mirrored into `sessionStorage` under
 * `DEVICE_DATA_KEY.studioDraft`, registered in `lib/device-data.ts` so "delete my
 * device data" clears it. It is written only once the visitor has typed, because the
 * preset and the scan prefill are rebuilt on every mount in the language on screen
 * and a frozen copy of either would stop translating — which the second test pins.
 * Nothing new goes in `localStorage`, the `key={active}` remount is untouched, and
 * what the share sheet is handed is unchanged.
 */

const DRAFT_KEY = "aru_studio_draft_v1";
const TYPED = "내 피부, 오늘은 최고";

async function switchLanguage(page: import("@playwright/test").Page, label: string, code: string) {
  await page.click('button[aria-label="Language"]');
  await page.getByRole("option", { name: new RegExp(label) }).click();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 })
    .toBe(code);
  // The provider holds the doomed tree `inert` while a dictionary chunk is in flight;
  // wait for the hold to lift so the assertions read the remounted tree.
  await expect
    .poll(async () => page.evaluate(() => document.body.hasAttribute("inert")), { timeout: 20_000 })
    .toBe(false);
}

function startInKorean(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    try {
      localStorage.setItem("aru.lang", "ko");
    } catch {
      /* private mode — the in-memory fallback keeps the session working */
    }
  });
}

test("a language switch on /studio keeps the card copy the visitor typed", async ({ page }) => {
  await startInKorean(page);
  await page.goto("/studio");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");

  const headline = page.locator("#studio-headline");
  await expect(headline).toBeVisible();
  // Nothing is stored until the visitor types, so the draft cannot be what carries
  // the preset across the next two switches.
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBeNull();

  await headline.fill(TYPED);
  // Two text inputs per read row (name, then value); the first row's value field.
  // Addressed by position rather than by its `aria-label`, because that label is
  // itself translated and the assertions below run after the switch.
  const firstValue = page.locator("main input").nth(1);
  await firstValue.fill("아주 좋음");
  await expect(page.locator("main h2")).toHaveText(TYPED);

  await switchLanguage(page, "English", "en");
  await expect(headline, "en must keep the typed headline").toHaveValue(TYPED);
  await expect(page.locator("main h2"), "the card itself must keep it too").toHaveText(TYPED);
  await expect(page.locator("main input").nth(1)).toHaveValue("아주 좋음");

  await switchLanguage(page, "日本語", "ja");
  await expect(headline, "ja must keep it as well").toHaveValue(TYPED);
  await expect(page.locator("main h2")).toHaveText(TYPED);

  // The draft is session-scoped and holds exactly the card, and nothing like it is in
  // localStorage.
  const draft = await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY);
  expect(draft).not.toBeNull();
  const parsed = JSON.parse(draft!) as { headline: string; reads: { label: string; value: string }[] };
  expect(parsed.headline).toBe(TYPED);
  expect(parsed.reads).toHaveLength(4);
  expect(parsed.reads[0].value).toBe("아주 좋음");
  expect(await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY)).toBeNull();
});

test("an untouched /studio card still translates, and leaves no draft", async ({ page }) => {
  await startInKorean(page);
  await page.goto("/studio");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");

  const headline = page.locator("#studio-headline");
  const korean = await headline.inputValue();
  expect(korean).not.toBe("");

  await switchLanguage(page, "English", "en");
  await expect(headline, "a card nobody edited must follow the language").not.toHaveValue(korean);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBeNull();
});
