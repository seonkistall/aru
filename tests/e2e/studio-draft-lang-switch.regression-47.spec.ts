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

// Added by the cycle 72 supervisor review. A preset tapped AFTER typing is the
// build's copy again, not the visitor's, so it must translate like the untouched
// card does. Before the review fix the draft kept recording after the tap, froze
// the Korean preset, and handed it back on the switch to `en` — a Korean headline
// on an English card, which the pre-draft page never did.
test("a preset tapped after typing translates again on a language switch", async ({ page }) => {
  await startInKorean(page);
  await page.goto("/studio");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");

  const headline = page.locator("#studio-headline");
  await headline.fill(TYPED);
  await page.getByRole("button", { name: "유분 케어" }).click();
  await expect(headline).toHaveValue("윤기가\n도드라지는 결");

  await switchLanguage(page, "English", "en");
  await expect(headline, "the preset is not the visitor's copy, so it must not stay Korean").not.toHaveValue("윤기가\n도드라지는 결");
  await expect(headline).not.toHaveValue(TYPED);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBeNull();
});

// Added by the cycle 72 supervisor review. The draft holds the four read VALUES as
// well as the headline, so a draft from an older scan would put that scan's readings
// on the card of a newer one — the one image this product puts into a chat, showing
// the wrong skin. A draft is kept only for the scan it was typed over.
function reads(oil: string, headline: string) {
  const bucket = (value: string) => ({ value, level: 1, calm: true });
  return {
    oil: bucket(oil),
    pores: bucket("결 매끈"),
    redness: bucket("붉은기 낮음"),
    overall: bucket("편안한 편"),
    headline,
    confidence: 0.8,
    confidenceLabel: "높음",
    retakeRecommended: false,
    retakeReasons: [],
    signals: [],
    source: "test",
  };
}

test("a draft typed over one scan does not survive onto a newer scan", async ({ page }) => {
  await startInKorean(page);
  await page.goto("/studio");
  await page.evaluate((value) => sessionStorage.setItem("gyeol_reads", value), JSON.stringify(reads("유분 적음", "첫 스캔")));
  await page.reload();
  const headline = page.locator("#studio-headline");
  await expect(headline).toHaveValue("첫 스캔");

  await headline.fill(TYPED);
  // Same scan, reloaded: the visitor's words still win.
  await page.reload();
  await expect(headline).toHaveValue(TYPED);

  // A new scan in the same tab.
  await page.evaluate((value) => sessionStorage.setItem("gyeol_reads", value), JSON.stringify(reads("유분 많음", "두 번째 스캔")));
  await page.reload();
  await expect(headline, "the newer scan's prefill, not the older draft").toHaveValue("두 번째 스캔");
  await expect(page.locator("main input").nth(1)).toHaveValue("유분 많음");
});
