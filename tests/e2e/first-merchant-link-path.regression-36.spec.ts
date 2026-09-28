import { expect, test } from "@playwright/test";

/**
 * How far a visitor has to go from `/` to the first link that can earn money. Nobody had
 * measured it before cycle 50, so nobody could tell whether it was getting longer.
 *
 * Measured at 360x800 on a production build, `ko` and `en`, survey-only path:
 *   4 screens   — `/`, `/survey`, `/report` analysis step, `/report` picks step
 *   6 taps      — the landing survey link; one chip per required field (3); submit;
 *                 the "2. 살펴볼 제품 후보" step tab
 *   3 required survey fields — 제품 종류 / 피부 타입 / 예산 (고민 and 피하고 싶은 성분
 *                 are optional and were not touched)
 *   scroll on the picks step until the first merchant link is fully in the viewport:
 *                 0 px in every one of the five locales, after cycle 52's reorder.
 *
 * Cycle 50 measured only `ko` (0 px, box 738.3→783.3) and `en` (153 px, 908→953). Cycle 52
 * measured all five and four of them were below the fold: `zh` 18.7 px (773.7→818.7),
 * `ja` 84.3 (839.3→884.3), `ar` 145.7 (900.7→945.7), `en` 153 (908→953). The block that
 * moved is the "추천 기준" section, from above the product grid to below it — a DOM-order
 * change with no edit to its copy, its styles or its conditions, and nothing done to which
 * picks are shown or to where `CommerceDisclosure` sits. Above the grid that section plus
 * its margins occupied 150.5 px in ko/zh/ja/ar and 174.5 px in en. After the move the
 * first link's box ends at 636.8 (ko), 672.2 (zh), 737.8 (ja), 782.5 (en) and 799.2 (ar)
 * of the 800 px viewport, so all five need 0 px.
 *
 * `ar` has 0.8 px of margin and that is the honest limit of this fix: the next copy edit
 * anywhere above the first card's buy button in `ar` will push it back below the fold, and
 * this spec is what says so. The answer then is another layout move, not a shorter
 * disclosure — the disclosure assertion below is inside the first link's own card
 * precisely so it cannot be the thing that gives way.
 *
 * Measured under both `CommerceDisclosure` states. With `NEXT_PUBLIC_COMMERCE_AFFILIATE=on`
 * every number above is byte-identical: the longer affiliate sentence still wraps to two
 * lines at 11.5px/1.45 in all five locales, so the disclosure block stays 33.3 px tall.
 *
 * The scan path is the same tail with three more screens and three more taps in front of
 * it (`/scan` intro → ready → result, then its "설문으로 이어가기" hand-off to `/survey`),
 * and it saves NO required field: the scan pre-selects three CONCERN chips, and 고민 is
 * optional, so all three required fields are still empty on arrival. That half is
 * measured in the cycle 50 entry of docs/AUTOPILOT.md; it is not asserted here because
 * the capture button needs a real face and the canvas `captureStream()` shim this repo
 * uses cannot produce one (`tests/e2e/mobile-layout.spec.ts` says the same).
 *
 * No step was cut. The cheap cut the brief looked for — a required field that does not
 * change the picks — does not exist: over the catalogue, varying budget alone changes
 * `recommend()`'s picks in 120 of 320 other-field combinations, skin type in 184 of 320
 * and category in 200 of 200 (`tests/recommend-required-fields.test.ts`).
 *
 * So this spec is a ratchet, not a fix: it fails if a screen, a tap or a required field is
 * ADDED to the path, and it fails if the first merchant link drops further below the fold
 * than it was measured at. It counts actions by driving them, so an extra required chip or
 * an extra step tab breaks it rather than being absorbed.
 */

const MERCHANT = 'a[href^="/api/out"]';

const FIRST_LINK_GEOMETRY = `(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && Number(s.opacity) > 0;
  };
  const all = Array.from(document.querySelectorAll('a[href^="/api/out"]')).filter(vis);
  if (!all.length) return { count: 0 };
  const r = all[0].getBoundingClientRect();
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  return {
    count: all.length,
    text: (all[0].textContent || "").trim(),
    href: all[0].getAttribute("href"),
    topInDoc: Math.round((r.top + window.scrollY) * 10) / 10,
    bottomInDoc: Math.round((r.bottom + window.scrollY) * 10) / 10,
    innerHeight: window.innerHeight,
    // The smallest scroll offset that puts the whole box in view.
    neededScroll: Math.round(Math.max(0, Math.min(maxScroll, r.bottom + window.scrollY - window.innerHeight)) * 10) / 10,
  };
})()`;

// The budget is zero in every locale, not a measured distance plus room: after the
// reorder the first buy button is inside the first viewport everywhere, and the thing
// worth ratcheting is that it stays there. A new block between the step tabs and the
// first buy button fails this spec in whichever locales it pushes past 800.
const SCROLL_BUDGET: Record<Lang, number> = { ko: 0, en: 0, ja: 0, zh: 0, ar: 0 };

const LANGS = ["ko", "en", "ja", "zh", "ar"] as const;
type Lang = (typeof LANGS)[number];

/** `내 스킨케어 결과 보기`, per lib/i18n/<lang>.ts. */
const SUBMIT: Record<Lang, string> = {
  ko: "내 스킨케어 결과 보기",
  en: "See my skincare results",
  ja: "スキンケア結果を見る",
  zh: "查看我的护肤结果",
  ar: "عرض نتائج العناية ببشرتي",
};

// Each pattern matches BOTH `CommerceDisclosure` states in its locale — the sentence
// ARU shows today and the affiliate one it shows once the owner sets
// NEXT_PUBLIC_COMMERCE_AFFILIATE=on. Matching only today's sentence would turn this
// spec red on the day that flag flips. (Supervisor, cycle 50 review.)
const DISCLOSURE: Record<Lang, RegExp> = {
  ko: /판매처로 이동하는 (제휴 )?링크예요/,
  en: /go(es)? to the retailer/,
  ja: /販売店への(アフィリエイト)?リンクです/,
  zh: /这是通往销售平台的(联盟)?链接/,
  ar: /يوصلك إلى المتجر/,
};

for (const lang of LANGS) {
  test(`the survey-only path to the first merchant link is 4 screens and 6 taps in ${lang}`, async ({ page }) => {
    await page.addInitScript(([l]) => { try { localStorage.setItem("aru.lang", l as string); } catch {} }, [lang] as const);
    const screens: string[] = [];
    const taps: string[] = [];

    // Screen 1: the landing page.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    screens.push("/");

    // Tap 1: the survey-only entry. `/scan` is the other entry and it is longer, not
    // shorter, so this is the floor.
    const entry = page.locator('a[href="/survey"]').first();
    await expect(entry).toBeVisible();
    taps.push("landing → /survey");
    await entry.click();
    await page.waitForURL("**/survey");
    await page.waitForLoadState("networkidle");
    screens.push("/survey");

    // Required fields: the `Section`s that render the `*` marker. Counted from the DOM,
    // so making an optional section required fails this spec.
    const required = await page.evaluate(() =>
      Array.from(document.querySelectorAll("section"))
        .map((section, index) => ({ index, section }))
        .filter(({ section }) => Array.from(section.querySelectorAll("span")).some((s) => (s.textContent ?? "").trim() === "*"))
        .map(({ index, section }) => ({ index, label: (section.querySelector("p")?.textContent ?? "").replace(/\s*\*\s*$/, "").trim() })),
    );
    expect(required.length, `required fields on /survey: ${required.map((r) => r.label).join(", ")}`).toBe(3);

    // Taps 2-4: one chip per required field.
    for (const field of required) {
      const chip = page.locator("section").nth(field.index).locator("button").first();
      await expect(chip).toBeVisible();
      taps.push(`/survey ${field.label}`);
      await chip.click();
    }

    // Tap 5: submit. It must be enabled on exactly those three answers — if a fourth
    // field became required it would still be disabled here and this would fail.
    const submit = page.locator("button").filter({ hasText: SUBMIT[lang] }).first();
    await expect(submit).toBeEnabled();
    taps.push("/survey submit");
    await submit.click();
    await page.waitForURL("**/report");
    await page.waitForLoadState("networkidle");
    screens.push("/report analysis");

    // The analysis step carries no merchant link, which is why the sixth tap exists.
    const onAnalysis = await page.locator(MERCHANT).count();
    expect(onAnalysis, "the /report analysis step should hold no merchant link").toBe(0);

    // Tap 6: the picks step tab.
    const tabs = page.locator('[role="tab"]');
    await expect(tabs).toHaveCount(3);
    taps.push("/report picks tab");
    await tabs.nth(1).click();
    await expect(page.locator(MERCHANT).first()).toBeVisible();
    screens.push("/report picks");

    expect(screens, "screens from / to the first merchant link").toHaveLength(4);
    expect(taps, `taps from / to the first merchant link: ${taps.join(" | ")}`).toHaveLength(6);

    const geometry = (await page.evaluate(([src]) => eval(src as string), [FIRST_LINK_GEOMETRY] as const)) as {
      count: number;
      text: string;
      href: string;
      topInDoc: number;
      bottomInDoc: number;
      innerHeight: number;
      neededScroll: number;
    };
    // Printed on every run, not only on failure: the measured path is the deliverable
    // here, and a number nobody can see again has to be re-derived by hand next time.
    console.log(
      `[path] ${lang}: screens=${screens.length} taps=${taps.length} requiredFields=${required.length} ` +
        `merchantLinks=${geometry.count} firstLinkBox=${geometry.topInDoc}->${geometry.bottomInDoc} ` +
        `viewport=${geometry.innerHeight} scrollNeeded=${geometry.neededScroll} ` +
        `marginBelow=${Math.round((geometry.innerHeight - geometry.bottomInDoc) * 10) / 10} taps=[${taps.join(" | ")}]`,
    );
    expect(geometry.count, "merchant links on the picks step").toBe(4);
    expect(geometry.href).toContain("merchant=");
    expect(geometry.innerHeight).toBe(800);
    expect(
      geometry.neededScroll,
      `${lang}: the first merchant link needs ${geometry.neededScroll}px of scroll (box ${geometry.topInDoc}→${geometry.bottomInDoc}), budget ${SCROLL_BUDGET[lang]}`,
    ).toBeLessThanOrEqual(SCROLL_BUDGET[lang]);

    // The affiliate disclosure is a legal requirement and travels with the link, so the
    // ratchet is not allowed to be satisfied by deleting it OR by moving it away from the
    // link to win the pixels this spec counts. It is asserted inside the first merchant
    // link's OWN card, not merely somewhere on the page, and it must be above the link
    // there — which is where 공정위's 심사지침 wants it and where cycle 50 fenced it off.
    const card = page.locator('div:has(> a[href^="/api/out"])').first();
    const disclosure = card.locator("p").filter({ hasText: DISCLOSURE[lang] }).first();
    await expect(disclosure).toBeVisible();
    const order = await page.evaluate(() => {
      const link = Array.from(document.querySelectorAll('a[href^="/api/out"]'))[0] as HTMLElement;
      const p = Array.from(link.parentElement!.children).indexOf(link);
      const notes = Array.from(link.parentElement!.querySelectorAll(":scope > p"));
      return { linkIndex: p, lastNoteIndex: Math.max(...notes.map((n) => Array.from(link.parentElement!.children).indexOf(n))) };
    });
    expect(order.lastNoteIndex, "the disclosure sits above the buy button in the same card").toBeLessThan(order.linkIndex);
  });
}
