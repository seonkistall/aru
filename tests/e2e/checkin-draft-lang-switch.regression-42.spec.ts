import { expect, test } from "@playwright/test";

/**
 * Regression: a language switch on `/checkin` threw away the answers on a card.
 *
 * `LanguageProvider` remounts the whole subtree under `key={active}`
 * (`lib/i18n.tsx`), so every piece of React state goes with the discarded tree.
 * `CheckinCard` held its three answers (만족도 / 트러블 / 재구매) in `useState` alone
 * and wrote nothing until 기록하기 succeeded, so a visitor who changed the language
 * mid-answer started over. Cycle 61 measured it and filed it; cycle 64 fixed it.
 *
 * Measured on a production build at 360x800 against `next start`, through the real
 * picker, with one confirmed product use seeded 3.5 weeks old so the card is due.
 * Two answers tapped (만족도 좋음, 트러블 없었어요): `main button[aria-pressed="true"]`
 * went 2 -> 0 on the switch to `en` before the fix and 2 -> 2 after it, with the
 * `main button` count 8 both times, so the card itself was never the thing that
 * changed.
 *
 * The fix is the pattern `/survey` already uses: the answers are mirrored into
 * `sessionStorage` under `DEVICE_DATA_KEY.checkinDraft`, keyed by the recorded
 * product use, registered in `lib/device-data.ts` so "delete my device data" clears
 * it, and removed when `recordCheckin` succeeds. Nothing new is written to
 * `localStorage`, the `key={active}` remount is untouched, and what `save()` sends
 * is unchanged.
 *
 * /checkin is where every re-engagement email lands
 * (`app/api/reengage/run/route.ts`), so it is the screen ARU's repeat purchases run
 * through.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DRAFT_KEY = "aru_checkin_draft_v1";
const USE_ID = "lang-switch-use";

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

const selected = (page: import("@playwright/test").Page) => page.locator('main button[aria-pressed="true"]');

function seedDueProductUse(page: import("@playwright/test").Page) {
  return page.addInitScript(({ startedAt, useId }) => {
    try {
      localStorage.setItem("aru.lang", "ko");
      localStorage.setItem(
        "gyeol_purchases",
        JSON.stringify([{ id: useId, sku_id: "cr3", name: "레드 블레미쉬 수분 크림", confirmedUse: true, ts: startedAt }])
      );
    } catch {
      /* private mode — the in-memory fallback keeps the session working */
    }
  }, { startedAt: Date.now() - 3.5 * WEEK_MS, useId: USE_ID });
}

test("a language switch on /checkin keeps the answers that were not saved yet", async ({ page }) => {
  await seedDueProductUse(page);
  await page.goto("/checkin");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");

  // The card's eight controls: 만족도 (3), 트러블 (2), 재구매 (2) and 기록하기. Asserted so
  // a card that stopped rendering cannot pass this test by emptiness.
  await expect(page.locator("main button")).toHaveCount(8);
  await page.getByRole("button", { name: "좋음" }).click();
  await page.getByRole("button", { name: "없었어요" }).click();
  await expect(selected(page)).toHaveCount(2);
  // Two of three answered, so 기록하기 is still disabled: nothing has been saved and
  // nothing is about to be.
  await expect(page.getByRole("button", { name: "기록하기" })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("gyeol_checkins"))).toBeNull();

  await switchLanguage(page, "English", "en");
  await expect(selected(page), "en must keep both answers").toHaveCount(2);
  await expect(page.locator("main button")).toHaveCount(8);

  // The draft is session-scoped, holds exactly the two answers under the product use's
  // own id, and nothing like it is in localStorage.
  const draft = await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY);
  expect(draft).not.toBeNull();
  const parsed = JSON.parse(draft!) as Record<string, { sat: number | null; trouble: boolean | null; repurchase: boolean | null }>;
  expect(Object.keys(parsed)).toEqual([USE_ID]);
  expect(parsed[USE_ID].sat).toBe(3);
  expect(parsed[USE_ID].trouble).toBe(false);
  expect(parsed[USE_ID].repurchase, "the unanswered question stays unanswered").toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY)).toBeNull();
  // Still nothing recorded: a draft is not a check-in.
  expect(await page.evaluate(() => localStorage.getItem("gyeol_checkins"))).toBeNull();
});

test("saving clears the /checkin draft, so a later visit is not restored from a stale one", async ({ page }) => {
  await seedDueProductUse(page);
  await page.goto("/checkin");
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 }).toBe("ko");

  await page.getByRole("button", { name: "좋음" }).click();
  await page.getByRole("button", { name: "없었어요" }).click();
  await page.getByRole("button", { name: "할래요" }).click();
  await expect(selected(page)).toHaveCount(3);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).not.toBeNull();

  const save = page.getByRole("button", { name: "기록하기" });
  await expect(save).toBeEnabled();
  await save.click();
  // The card collapses to its saved state, which is the existing behaviour and the
  // signal that `recordCheckin` resolved.
  await expect(page.getByRole("status")).toHaveText("남겨주신 피드백을 저장했어요.");

  // The answers live in the check-in record now, so the draft key is gone entirely
  // rather than left holding an empty object.
  await expect
    .poll(async () => page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY), { timeout: 10_000 })
    .toBeNull();
  const records = await page.evaluate(() => localStorage.getItem("gyeol_checkins"));
  expect(records).not.toBeNull();
  const checkins = JSON.parse(records!) as { sku_id: string; week: number; satisfaction: number; trouble: boolean; repurchase: boolean }[];
  expect(checkins).toHaveLength(1);
  // The payload is what it was before the draft existed: `roundFor` reads a
  // 3.5-week-old use as round 2 (its ladder is 4 weeks, then 2), and the three
  // answers as tapped.
  expect(checkins[0].sku_id).toBe("cr3");
  expect(checkins[0].week).toBe(2);
  expect(checkins[0].satisfaction).toBe(3);
  expect(checkins[0].trouble).toBe(false);
  expect(checkins[0].repurchase).toBe(true);

  // And the saved card is not re-opened by a language switch out of a stale draft.
  await switchLanguage(page, "English", "en");
  await expect(selected(page)).toHaveCount(0);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBeNull();
});
