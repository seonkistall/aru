import { expect, test } from "@playwright/test";

/**
 * `/care` is ARU's SECOND commerce surface — `/report`'s routine step sends people here
 * with "제품과 상담 정보 보기", and the nav reaches it from every page. Cycle 52 put
 * `/report`'s first merchant link above the fold in all five locales and pinned it
 * (`first-merchant-link-path.regression-36.spec.ts`); `/care` had never been measured at
 * all, so nobody could tell whether its buy button was on the first screen or whether a
 * copy edit had pushed it off.
 *
 * Measured 2026-09-29 (cycle 53) at 360x800 under `playwright.mobile.config.ts`, with a
 * valid survey in session storage, the same method as regression-36 (box in document
 * coordinates, smallest scroll that brings the whole box into view, margin below):
 *
 *   ko  517.7→576.1   0 px of scroll   223.9 px of margin below
 *   zh  494.5→552.9   0 px            247.1 px
 *   ar  577.1→635.6   0 px            164.4 px
 *   ja  581.5→639.9   0 px            160.1 px
 *   en  603.3→661.8   0 px            138.3 px
 *
 * So NOTHING was changed: no locale needed scroll and no layout-only move was called
 * for. `/care` is shorter above its first link than `/report` was because the link sits
 * in the first product row of the first section, with only the eyebrow, `FlowSteps`, the
 * title, the lead paragraph, the section head, the compare-intro row and the disclosure
 * above it — 463.3 px of blocks in `en`, against `/report`'s 737.5 after its reorder.
 *
 * The budget is 0 px of scroll, and `en` is the tightest locale with 138.3 px to spare —
 * 17x the margin `ar` has on `/report` (0.8 px), which is why this spec can afford a
 * hard zero without being a tripwire for a font-metric change. What it does catch is a
 * new block above that button, or copy that grows by more than ~138 px in `en`.
 *
 * Both `CommerceDisclosure` states were measured and every number above is identical
 * with `NEXT_PUBLIC_COMMERCE_AFFILIATE=on`: the disclosure block is 33.3 px in all five
 * locales either way, because the longer affiliate sentence still wraps to two lines.
 * The disclosure assertion below matches BOTH sentences per locale, so the day the owner
 * flips that flag this spec does not turn red.
 *
 * Unlike `/report`, `/care`'s merchant links are `<button>`s that call `window.open`
 * rather than `a[href^="/api/out"]` anchors, so they are located through the merchant
 * panel `/care` builds for each pick (`care-merchants-<sku id>`). The disclosure sits
 * once per SECTION, above all three product rows, rather than once per card — that is
 * where `/care` puts it and this spec asserts it stays above the first link, not that it
 * moves next to each one.
 */

const SURVEY = { type: "복합성", concerns: ["모공", "유분"], budget: 25000, avoid: [], category: "토너" };
const LANGS = ["ko", "en", "ja", "zh", "ar"] as const;
type Lang = (typeof LANGS)[number];

// Zero in every locale. The tightest, `en`, clears the fold by 138.3 px.
const SCROLL_BUDGET: Record<Lang, number> = { ko: 0, en: 0, ja: 0, zh: 0, ar: 0 };

// Each pattern matches BOTH disclosure sentences in its locale — today's and the
// affiliate one — so flipping NEXT_PUBLIC_COMMERCE_AFFILIATE cannot turn this red.
const DISCLOSURE: Record<Lang, RegExp> = {
  ko: /판매처로 이동하는 (제휴 )?링크예요/,
  en: /go(es)? to the retailer/,
  ja: /販売店への(アフィリエイト)?リンクです/,
  zh: /这是通往销售平台的(联盟)?链接/,
  ar: /يوصلك إلى المتجر/,
};

const FIRST_LINK = '[id^="care-merchants-"] button';

const GEOMETRY = `(() => {
  const round = (n) => Math.round(n * 10) / 10;
  const panels = Array.from(document.querySelectorAll('[id^="care-merchants-"]'));
  const link = panels[0].querySelector("button");
  const r = link.getBoundingClientRect();
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const section = link.closest("section");
  const disclosures = Array.from(section.querySelectorAll(":scope > p"));
  return {
    panels: panels.length,
    linksInFirstPanel: panels[0].querySelectorAll("button").length,
    text: (link.textContent || "").trim().replace(/\\s+/g, " "),
    topInDoc: round(r.top + window.scrollY),
    bottomInDoc: round(r.bottom + window.scrollY),
    innerHeight: window.innerHeight,
    neededScroll: round(Math.max(0, Math.min(maxScroll, r.bottom + window.scrollY - window.innerHeight))),
    marginBelow: round(window.innerHeight - (r.bottom + window.scrollY)),
    // Document order: every section-level <p> that carries the disclosure must come
    // BEFORE the first buy button, which is where 공정위's 심사지침 wants it.
    disclosureBeforeLink: disclosures.every((p) => p.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING),
  };
})()`;

for (const lang of LANGS) {
  test(`the first merchant link on /care is on the first screen in ${lang}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(([l, s]) => {
      try {
        localStorage.setItem("aru.lang", l as string);
        sessionStorage.setItem("gyeol_survey", s as string);
      } catch {}
    }, [lang, JSON.stringify(SURVEY)] as const);
    await page.goto("/care");
    await expect(page.locator(FIRST_LINK).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const g = (await page.evaluate(([src]) => eval(src as string), [GEOMETRY] as const)) as {
      panels: number;
      linksInFirstPanel: number;
      text: string;
      topInDoc: number;
      bottomInDoc: number;
      innerHeight: number;
      neededScroll: number;
      marginBelow: number;
      disclosureBeforeLink: boolean;
    };
    // Printed on every run, not only on failure: the measurement is the deliverable, and
    // a number nobody can read back has to be re-derived by hand next cycle.
    console.log(
      `[care-fold] ${lang}: panels=${g.panels} linksInFirstPanel=${g.linksInFirstPanel} ` +
        `firstLinkBox=${g.topInDoc}->${g.bottomInDoc} viewport=${g.innerHeight} ` +
        `scrollNeeded=${g.neededScroll} marginBelow=${g.marginBelow}`,
    );

    // The survey yields three picks, and a collapsed panel shows its highest-priority
    // merchant only — so a change that hid the primary link, or expanded the panel by
    // default, fails here rather than being absorbed into the geometry below.
    expect(g.panels, "one merchant panel per pick on /care").toBe(3);
    expect(g.linksInFirstPanel, "the collapsed panel shows one merchant").toBe(1);
    expect(g.innerHeight).toBe(800);
    expect(
      g.neededScroll,
      `${lang}: the first merchant link needs ${g.neededScroll}px of scroll (box ${g.topInDoc}→${g.bottomInDoc}), budget ${SCROLL_BUDGET[lang]}`,
    ).toBeLessThanOrEqual(SCROLL_BUDGET[lang]);

    // The ratchet must not be satisfiable by deleting the disclosure or moving it below
    // the button to win the pixels this spec counts.
    const disclosure = page.locator("section p").filter({ hasText: DISCLOSURE[lang] }).first();
    await expect(disclosure).toBeVisible();
    expect(g.disclosureBeforeLink, "the disclosure sits above the first buy button in its section").toBe(true);
  });
}
