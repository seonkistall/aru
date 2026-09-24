import { expect, test } from "@playwright/test";

/**
 * Regression: on `/report` two blocks positioned themselves with the PHYSICAL
 * `left` / `padding-left` / `border-left`, which do not follow `dir=rtl`. Found
 * 2026-09-24 by running /report, /care and /checkin at 360x800 under each of
 * en / ja / zh / ar with a real survey and reading in storage.
 *
 * 1. Picks step — `ProductCompare`'s row-label column is `position: sticky`. Under
 *    Arabic the scroller runs the other way (negative `scrollLeft`), so `left: 0`
 *    never catches it: scrolled to the inline end the column moved 82px and its
 *    right edge landed at 401 on a 360px viewport, i.e. clipped off-screen, taking
 *    the row labels ("Budget band", "Volume", …) with it. Measured before the fix:
 *      ar  stickyBefore L=201 R=319   stickyAfter L=283 R=401
 *      en  stickyBefore L=41  R=179   stickyAfter L=41  R=179   (correct)
 *
 * 2. Routine step — `RoutineHalf`'s numbered rail. `paddingLeft: 40` plus a rail and
 *    step numbers at `left: 13` / `left: -40` kept the numbering on the physical left
 *    while Arabic titles right-align, so each number sat at the far END of its line
 *    at a distance that varied with the title. Measured before the fix (ar):
 *      title L=137 R=319 | index L=41 R=69     (en: title L=81 R=319 | index L=41 R=69)
 *
 * The fix is `inset-inline-start` / `padding-inline-start` / `border-inline-start`
 * and `text-align: start` — CSS Logical Properties and Values Level 1, whose own
 * example spells out the mapping for Arabic.
 *
 * Both are on `/report`, which is the screen the commerce out-links sit on.
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
const VALID_SURVEY = '{"type":"지성","concerns":["모공"],"budget":30000,"avoid":[],"category":"토너"}';
const VIEWPORT = { width: 360, height: 800 };

async function openReport(browser: import("@playwright/test").Browser, lang: "en" | "ar") {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(
    ([l, survey, reads]) => {
      localStorage.setItem("aru.lang", l as string);
      sessionStorage.setItem("gyeol_survey", survey as string);
      sessionStorage.setItem("gyeol_reads", reads as string);
    },
    [lang, VALID_SURVEY, JSON.stringify(REAL_READS)] as const,
  );
  const page = await context.newPage();
  await page.goto("/report");
  await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  return { context, page };
}

// Scrolls the compare table to its inline end and reports where the sticky
// row-label column ended up, in viewport coordinates.
async function measureStickyColumn(page: import("@playwright/test").Page) {
  await page.getByRole("tab").nth(1).click();
  // The comparison lives in a collapsed <details>; expanding it is the user action
  // that puts the scrollable table on screen in the first place.
  await page.locator("details summary").first().click();
  const table = page.locator("table").first();
  await expect(table).toBeVisible();
  return page.evaluate(() => {
    const el = document.querySelector("table") as HTMLTableElement;
    const scroller = el.parentElement as HTMLElement;
    const label = () => (el.querySelector("tbody th") as HTMLElement).getBoundingClientRect();
    const rtl = getComputedStyle(scroller).direction === "rtl";
    const before = label();
    scroller.scrollLeft = rtl ? -9999 : 9999;
    const after = label();
    return {
      rtl,
      scrolled: Math.abs(scroller.scrollLeft) > 0,
      beforeLeft: Math.round(before.left),
      afterLeft: Math.round(after.left),
      afterRight: Math.round(after.right),
      viewport: document.documentElement.clientWidth,
      textAlign: getComputedStyle(el.querySelector("tbody th") as HTMLElement).textAlign,
    };
  });
}

// Where each routine step's number sits relative to the title it numbers.
async function measureRoutineRail(page: import("@playwright/test").Page) {
  await page.getByRole("tab").nth(2).click();
  await expect(page.locator("h3").first()).toBeVisible();
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("h3"))
      .slice(0, 3)
      .map((h) => {
        const lane = h.closest("div[style*='position: relative']") as HTMLElement;
        const index = lane.querySelector(":scope > span") as HTMLElement;
        const hr = h.getBoundingClientRect();
        const ir = index.getBoundingClientRect();
        return {
          titleLeft: Math.round(hr.left),
          titleRight: Math.round(hr.right),
          indexLeft: Math.round(ir.left),
          indexRight: Math.round(ir.right),
        };
      });
    const rail = Array.from(document.querySelectorAll("span[aria-hidden]"))
      .map((s) => getComputedStyle(s as HTMLElement))
      .filter((cs) => cs.borderLeftStyle === "dotted" || cs.borderRightStyle === "dotted")
      .map((cs) => (cs.borderRightStyle === "dotted" ? "right" : "left"));
    return { rows, rail };
  });
}

test("the compare table's row-label column stays pinned and on-screen under Arabic", async ({ browser }) => {
  const { context, page } = await openReport(browser, "ar");
  const m = await measureStickyColumn(page);

  expect(m.rtl, "the compare scroller should be in RTL under Arabic").toBe(true);
  expect(m.scrolled, "the table must actually be scrollable for this to mean anything").toBe(true);
  // The defect: the column travelled with the content instead of sticking.
  expect(m.afterLeft, "the sticky row-label column moved when the table was scrolled").toBe(m.beforeLeft);
  // And travelled far enough to leave the screen.
  expect(m.afterRight, "the sticky row-label column was pushed past the viewport").toBeLessThanOrEqual(m.viewport);
  // `text-align: start` computes to the specified keyword, not to a side
  // (CSS Logical Properties L1: "Computed value: specified keyword"), so the
  // assertion is on the keyword itself — a physical `left` here is the defect.
  expect(m.textAlign, "row labels should align to the inline start, not the physical left").toBe("start");

  await context.close();
});

test("the compare table's row-label column still pins to the left in LTR", async ({ browser }) => {
  const { context, page } = await openReport(browser, "en");
  const m = await measureStickyColumn(page);

  expect(m.rtl).toBe(false);
  expect(m.scrolled).toBe(true);
  expect(m.afterLeft).toBe(m.beforeLeft);
  expect(m.afterRight).toBeLessThanOrEqual(m.viewport);
  expect(m.textAlign, "row labels should align to the inline start in LTR too").toBe("start");

  await context.close();
});

test("routine step numbers sit in front of their step under Arabic", async ({ browser }) => {
  const { context, page } = await openReport(browser, "ar");
  const { rows, rail } = await measureRoutineRail(page);

  expect(rows.length, "the routine step needs at least three steps to measure").toBeGreaterThanOrEqual(3);
  for (const row of rows) {
    // In RTL "in front of" means to the RIGHT of the title's own right edge.
    expect(row.indexLeft, "a routine number sat behind its title instead of in front of it").toBeGreaterThanOrEqual(row.titleRight);
    expect(row.indexLeft - row.titleRight, "the gap between number and title should be the lane gutter, not the leftover line").toBeLessThanOrEqual(20);
  }
  expect(rail.length, "the dotted rail should still be drawn").toBeGreaterThan(0);
  expect(new Set(rail), "the rail should be drawn on the inline-start edge, which is the right in RTL").toEqual(new Set(["right"]));

  await context.close();
});

test("routine step numbers stay in front of their step in LTR", async ({ browser }) => {
  const { context, page } = await openReport(browser, "en");
  const { rows, rail } = await measureRoutineRail(page);

  expect(rows.length).toBeGreaterThanOrEqual(3);
  for (const row of rows) {
    expect(row.indexRight, "a routine number sat after its title in LTR").toBeLessThanOrEqual(row.titleLeft);
    expect(row.titleLeft - row.indexRight).toBeLessThanOrEqual(20);
  }
  expect(new Set(rail), "the rail should be drawn on the inline-start edge, which is the left in LTR").toEqual(new Set(["left"]));

  await context.close();
});
