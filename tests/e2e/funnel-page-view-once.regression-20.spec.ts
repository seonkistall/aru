import { expect, test, type Browser } from "@playwright/test";

/**
 * Regression: every page-view funnel event was recorded TWICE for any user whose
 * saved language is not `en`, and once for users whose language is `en`.
 *
 * Found 2026-09-24 by walking the paying journey (scan state → /survey → /report →
 * /care) at 360x800 under `ko` and `en` and reading `aru_funnel_events_v1` at each
 * step. Mechanism: `LanguageProvider` (`lib/i18n.tsx`) renders its children under
 * `key={lang}`, and `getServerSnapshot()` returns `"en"` so SSR never flashes Korean.
 * A client with a saved `ko` hydrates as `en`, `useSyncExternalStore` then re-reads
 * localStorage, the key changes, and React unmounts and remounts the whole subtree.
 * The remount is deliberate and load-bearing — it is what makes plain `t()` calls pick
 * up the saved language — but it recreates every `useRef` mount guard and re-runs every
 * empty-deps `useEffect`, so the event fired again. `en` is the one language that
 * cannot trigger it, because it is what the server already rendered.
 *
 * Measured on a production build before the fix, one `goto` per row:
 *   /         home_viewed      ko 2  ja 2  ar 2  |  en 1
 *   /scan     scan_opened      ko 2  ja 2  ar 2  |  en 1
 *   /survey   survey_viewed    ko 2  ja 2  ar 2  |  en 1
 *   /report   reco_viewed      ko 2  ja 2  ar 2  |  en 1
 *   /care     care_viewed      ko 2  ja 2  ar 2  |  en 1
 *   /checkin  checkin_opened   ko 2  ja 2  ar 2  |  en 1
 *   /#m=210   share_landed     ko 2  ja 2  ar 2  |  en 1
 *
 * The fix is `recordPageView` in `lib/funnel.ts`: a module-scoped guard that lets a
 * kind through once per path visit instead of once per component mount. It is scoped
 * to the path, not the session, because a genuine second view must still count — which
 * is what the second test here holds down.
 */

const REAL_READS = {
  oil: { value: "유분 많음", level: 2, calm: false },
  pores: { value: "결 약간 보임", level: 1, calm: false },
  redness: { value: "붉은기 약간", level: 1, calm: false },
  overall: { value: "균형 관리 필요", level: 2, calm: false },
  headline: "T존 유분과 피부결을 함께 볼게요",
  narrative: "T존 유분감이 비교적 뚜렷하고, 볼에 옅은 붉은기가 보여요. 피부결은 약간 보이는 편이에요.",
  confidence: 0.72,
  confidenceLabel: "보통",
  retakeRecommended: false,
  retakeReasons: [],
  signals: [{ label: "조명", ok: true, detail: "빛이 충분해요" }],
  source: "roi-calibrated",
  raw: {},
};
// Exactly the two keys app/scan/use-capture-analysis.ts writes when a scan completes.
const SCAN = { oil: 2, redness: 1, pores: 1, confidence: 0.72, retakeRecommended: false, source: "roi-calibrated" };
const SURVEY = '{"type":"지성","concerns":["모공"],"budget":30000,"avoid":[],"category":"토너"}';
const VIEWPORT = { width: 360, height: 800 };
const EVENTS_KEY = "aru_funnel_events_v1";

async function seeded(browser: Browser, lang: string) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(
    ([l, reads, scan, survey]) => {
      localStorage.setItem("aru.lang", l as string);
      sessionStorage.setItem("gyeol_reads", reads as string);
      sessionStorage.setItem("gyeol_scan", scan as string);
      sessionStorage.setItem("gyeol_survey", survey as string);
    },
    [lang, JSON.stringify(REAL_READS), JSON.stringify(SCAN), SURVEY] as const,
  );
  return context;
}

const counts = (page: import("@playwright/test").Page) =>
  page.evaluate((key) => {
    const rows = JSON.parse(localStorage.getItem(key) || "[]") as { kind: string }[];
    const out: Record<string, number> = {};
    for (const row of rows) out[row.kind] = (out[row.kind] || 0) + 1;
    return out;
  }, EVENTS_KEY);

// One page-view kind per screen on the paying journey, plus the two screens either
// side of it, named as `lib/funnel.ts` names them.
const SCREENS: [string, string][] = [
  ["/", "home_viewed"],
  ["/scan", "scan_opened"],
  ["/survey", "survey_viewed"],
  ["/report", "reco_viewed"],
  ["/care", "care_viewed"],
  ["/checkin", "checkin_opened"],
];

for (const [path, kind] of SCREENS) {
  test(`${path} records ${kind} exactly once, in every language`, async ({ browser }) => {
    test.setTimeout(120_000);
    for (const lang of ["ko", "en", "ja", "ar"]) {
      const context = await seeded(browser, lang);
      const page = await context.newPage();
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      await page.waitForTimeout(900);
      expect(await counts(page), `${path} under ${lang}`).toEqual({ [kind]: 1 });
      await context.close();
    }
  });
}

test("a share landing records share_landed and home_viewed once each, in every language", async ({ browser }) => {
  test.setTimeout(120_000);
  for (const lang of ["ko", "en", "ja", "ar"]) {
    const context = await seeded(browser, lang);
    const page = await context.newPage();
    await page.goto("/#m=210");
    await page.waitForTimeout(900);
    expect(await counts(page), `/#m=210 under ${lang}`).toEqual({ share_landed: 1, home_viewed: 1 });
    await context.close();
  }
});

test("a genuine second view still counts: reload, and back/forward across /survey and /report", async ({ browser }) => {
  test.setTimeout(180_000);
  // Under `ko` — the language that used to double — the path-scoped guard must not
  // have traded double-counting for under-counting.
  const context = await seeded(browser, "ko");
  const page = await context.newPage();

  await page.goto("/report");
  await page.waitForTimeout(900);
  expect(await counts(page)).toEqual({ reco_viewed: 1 });

  // A reload is a new document, so a new module scope: it counts again.
  await page.reload();
  await page.waitForTimeout(900);
  expect(await counts(page)).toEqual({ reco_viewed: 2 });

  // Client-side navigation away and back: both are real views.
  await page.getByRole("link", { name: "설문" }).click();
  await page.waitForURL("**/survey");
  await page.waitForTimeout(900);
  expect(await counts(page)).toEqual({ reco_viewed: 2, survey_viewed: 1 });

  await page.goBack();
  await page.waitForURL("**/report");
  await page.waitForTimeout(900);
  expect(await counts(page)).toEqual({ reco_viewed: 3, survey_viewed: 1 });

  await page.goForward();
  await page.waitForURL("**/survey");
  await page.waitForTimeout(900);
  expect(await counts(page)).toEqual({ reco_viewed: 3, survey_viewed: 2 });

  await context.close();
});

// Added at supervisor review. The guard above used to learn the current path only
// from pages that record a view, so a detour through a page that records nothing —
// /report links /privacy — left it pointing at /report, and the view on the way back
// was swallowed: `afterBack={"reco_viewed":1}` under both en and ko on the branch as
// first pushed. app/components/page-view-scope.tsx now tells it about every
// navigation; the language-key remount still does not reach it.
for (const lang of ["en", "ko"]) {
  test(`a detour through a page that records nothing still counts the way back (${lang})`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await seeded(browser, lang);
    const page = await context.newPage();
    await page.goto("/report");
    await page.waitForTimeout(900);
    expect(await counts(page)).toEqual({ reco_viewed: 1 });
    await page.locator('a[href="/privacy"]').first().click();
    await page.waitForURL("**/privacy");
    await page.waitForTimeout(900);
    expect(await counts(page)).toEqual({ reco_viewed: 1 });
    await page.goBack();
    await page.waitForURL("**/report");
    await page.waitForTimeout(1200);
    expect(await counts(page), `back from /privacy under ${lang}`).toEqual({ reco_viewed: 2 });
    await context.close();
  });
}
