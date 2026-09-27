import { expect, test } from "@playwright/test";

/**
 * Regression: the two guide pages (`app/guide/*`) are English by design, but they
 * render inside `LanguageProvider`, which writes
 * `document.documentElement.lang`/`dir` from the visitor's SAVED language
 * (`lib/i18n.tsx`). So the chrome could contradict the body it wrapped, and did.
 *
 * Measured on a production build at 360x800 before the fix, as viewport
 * x-coordinates on `/guide/serum-for-combination-skin`. Saved `ar`
 * (`html[dir=rtl]` around Latin prose):
 *
 * - the `<ul>`'s `padding-inline-start: 18px` resolved as `padding-right`, so the
 *   English list lost its indent: the first `<li>` box started at x **20**, the
 *   same x as the sibling paragraph above it, against **38** under `en`;
 * - every prose line right-aligned: the `<dd>` "Breakouts, Redness, Pores, Oil"
 *   ran **148.7…325** against **35…211.3** under `en`, and both `h1` lines ended
 *   flush at **340** (starting **190.83** / **108.98**) against **20…169.17** /
 *   **20…251.02**;
 * - the primary CTA's `→` crossed to the wrong side of its own label: the glyph
 *   sat at **41.83…61.92** and the `T` of "Take" at **67.44…79.31**, i.e. the
 *   arrow rendered BEFORE the words, against **298.08** / **41.83** under `en`;
 * - the closing "Another guide: <link>" sentence reversed its two runs — label
 *   **142.44…231.3**, link **231.3…340** — against label **20…108.86**, link
 *   **108.86…217.56**.
 *
 * Saved `ko` was a second, quieter case of the same shape. `html[lang="ko"]` is
 * the one locale `app/globals.css` does NOT hand `--font-display:
 * var(--font-sans)`, so the Korean hand-drawn display face and its 1.1 leading
 * landed on an English `h1`: the serum heading was **36.7**px tall and fitted on
 * one line where `en` needs **73.41** and two. The stylesheet's own comment asks
 * for the opposite ("Keep the hand-drawn display face Korean-only").
 *
 * Nothing overflowed in either case — `scrollWidth` was **360** against a
 * `clientWidth` of **360** under all five saved languages, before and after.
 *
 * The fix is `lang="en" dir="ltr"` plus `data-guide-root` on the guide's own
 * root `<main>`, and one companion rule in `app/globals.css`, because the font
 * and leading rules are anchored to `html[lang]` and no attribute on an inner
 * element can reach them.
 *
 * What this spec asserts is the invariant rather than the numbers: the guide's
 * measured geometry, as the 19-field snapshot below, is IDENTICAL under every
 * saved language. The before/after comes from a separate 23-field probe run
 * against a production build, not from this snapshot: before the fix `ar`
 * differed from `en` in 9 of those 23 fields on both pages and `ko` in 6 (serum)
 * / 2 (toner); after, 0. `ja` and `zh` differed in 0 fields even
 * before — they get the same `--font-display` override as `en` — so for those
 * two the defect was `html[lang]` misdescribing Latin text and nothing visual,
 * which is why the `lang` case below is a separate assertion and not folded
 * into the geometry.
 *
 * Deliberately NOT changed, and measured rather than assumed: the cycle-42
 * language hold. With the `ar` dictionary chunk delayed 4000ms and `aru.lang`
 * already `ar`, `<body>` goes `inert` **133**ms in, the scan CTA is visible at
 * opacity **0.55**, `elementFromPoint` at its centre (180, 540.2) returns
 * `HTML`, and a real mouse click there does not navigate. That window is real
 * but it cannot reach the visitor these pages exist for: a searcher arriving
 * from Google has no saved language, `defaultLang()` returns `en`, and the same
 * delayed-chunk probe with no `aru.lang` set saw `inert` **never** over 6093ms
 * of polling. Recorded as a finding, not fixed here — the hold lives in
 * `lib/i18n.tsx` and narrowing it is not this spec's subject.
 */

const VIEWPORT = { width: 360, height: 800 };
const PATHS = ["/guide/serum-for-combination-skin", "/guide/toner-for-oily-skin"];
const LANGS = ["en", "ko", "ja", "zh", "ar"] as const;

async function open(browser: import("@playwright/test").Browser, lang: string, path: string) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript((l) => {
    try {
      localStorage.setItem("aru.lang", l as string);
    } catch {
      /* private mode — the in-memory fallback keeps the session working */
    }
  }, lang);
  const page = await context.newPage();
  await page.goto(path);
  // Wait for the chrome to actually reach the saved language, so an `ar` case
  // cannot pass by still being in the English interval.
  const wanted = lang === "zh" ? "zh-CN" : lang;
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 20_000 })
    .toBe(wanted);
  return { context, page };
}

/**
 * Everything that moved. Reads the guide's own geometry, never the chrome's, so
 * `html[lang]`/`html[dir]` are deliberately absent — they are SUPPOSED to differ
 * per locale and are asserted separately.
 */
async function snapshot(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const round = (n: number) => Math.round(n * 100) / 100;
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: round(r.x), right: round(r.right), w: round(r.width), h: round(r.height) };
    };
    const lines = (el: Element | null) => {
      if (!el) return null;
      const range = document.createRange();
      range.selectNodeContents(el);
      return [...range.getClientRects()]
        .filter((r) => r.width > 1)
        .map((r) => ({ x: round(r.x), right: round(r.right) }));
    };
    const charBox = (el: Element | null, ch: string) => {
      const node = el?.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) return null;
      const text = node.textContent ?? "";
      const i = text.indexOf(ch);
      if (i < 0) return null;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      return { x: round(r.x), right: round(r.right) };
    };

    const main = document.querySelector("main");
    const h1 = document.querySelector("h1");
    const ul = document.querySelector("main ul");
    const li = document.querySelector("main ul li");
    const cta = document.querySelector('[data-guide-cta="scan"]');
    const dd = document.querySelector("[data-guide-row] dd");
    const crossLink = document.querySelector("[data-guide-cross-link]");
    const style = (el: Element | null, prop: string) =>
      el ? getComputedStyle(el).getPropertyValue(prop) : null;

    return {
      mainDirection: style(main, "direction"),
      mainTextAlign: style(main, "text-align"),
      h1FontFamily: style(h1, "font-family"),
      h1LineHeight: style(h1, "line-height"),
      h1Box: box(h1),
      h1Lines: lines(h1),
      ulPaddingLeft: style(ul, "padding-left"),
      ulPaddingRight: style(ul, "padding-right"),
      ulBox: box(ul),
      liBox: box(li),
      liDirection: style(li, "direction"),
      ddLines: lines(dd),
      ctaBox: box(cta),
      ctaArrow: charBox(cta, "→"),
      ctaFirstWord: charBox(cta, "T"),
      crossLinkBox: box(crossLink),
      crossLinkSentenceLines: lines(crossLink?.parentElement ?? null),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
}

for (const path of PATHS) {
  test.describe(path, () => {
    test("lays out left-to-right inside an RTL chrome", async ({ browser }) => {
      const { context, page } = await open(browser, "ar", path);

      // The condition is real: the chrome IS right-to-left. Without this the
      // rest could pass by never having entered RTL at all.
      expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
      expect(await page.evaluate(() => document.documentElement.lang)).toBe("ar");

      const s = await snapshot(page);

      // Direction and alignment, on the body and on the list item that inherits it.
      expect(s.mainDirection).toBe("ltr");
      expect(s.liDirection).toBe("ltr");

      // The 18px list indent is on the reading START, i.e. the left. Before the
      // fix this read paddingLeft 0px / paddingRight 18px and liBox.x === ulBox.x.
      expect(s.ulPaddingLeft).toBe("18px");
      expect(s.ulPaddingRight).toBe("0px");
      expect(s.liBox!.x - s.ulBox!.x).toBe(18);

      // English prose starts at the left edge of the container, not the right.
      for (const line of s.h1Lines!) expect(line.x).toBe(s.ulBox!.x);
      expect(s.ddLines![0].x).toBeLessThan(180);

      // The CTA's arrow follows its label instead of preceding it.
      expect(s.ctaArrow!.x).toBeGreaterThan(s.ctaFirstWord!.right);

      // "Another guide: <link>" keeps its two runs in reading order.
      expect(s.crossLinkSentenceLines![0].x).toBeLessThan(s.crossLinkBox!.x);

      // Still no sideways scroll, which was already true before the fix.
      expect(s.scrollWidth).toBe(s.clientWidth);

      await context.close();
    });

    test("renders its English heading in the Latin display face under a Korean chrome", async ({
      browser,
    }) => {
      // html[lang="ko"] is the only locale app/globals.css does not hand
      // --font-display: var(--font-sans), so before the fix this h1 was drawn in
      // the Korean hand-drawn face at 1.1 leading. Compared against `en` rather
      // than against a font name, because the token is what the rule sets.
      const ko = await open(browser, "ko", path);
      const koSnap = await snapshot(ko.page);
      await ko.context.close();

      const en = await open(browser, "en", path);
      const enSnap = await snapshot(en.page);
      await en.context.close();

      expect(koSnap.h1FontFamily).toBe(enSnap.h1FontFamily);
      expect(koSnap.h1LineHeight).toBe(enSnap.h1LineHeight);
      expect(koSnap.h1Box).toEqual(enSnap.h1Box);
    });

    test("measures the same under every saved language", async ({ browser }) => {
      const snaps: Record<string, Awaited<ReturnType<typeof snapshot>>> = {};
      for (const lang of LANGS) {
        const { context, page } = await open(browser, lang, path);
        snaps[lang] = await snapshot(page);
        await context.close();
      }
      // Not an attribute check: every field here is a computed style, a bounding
      // box or a text-run rect.
      for (const lang of LANGS) {
        if (lang === "en") continue;
        expect(snaps[lang], `saved language ${lang} must lay out like en`).toEqual(snaps.en);
      }
    });

    test("declares its own language on its own root", async ({ browser }) => {
      // The semantic half. `ja`/`zh` showed no geometry difference at all, so
      // without this the only defect they had would go unpinned: a document
      // whose lang says Japanese wrapping an English page.
      const { context, page } = await open(browser, "ja", path);
      const root = await page.evaluate(() => {
        const main = document.querySelector("main");
        return { lang: main?.getAttribute("lang"), dir: main?.getAttribute("dir") };
      });
      expect(root).toEqual({ lang: "en", dir: "ltr" });
      expect(await page.evaluate(() => document.documentElement.lang)).toBe("ja");
      await context.close();
    });
  });
}
