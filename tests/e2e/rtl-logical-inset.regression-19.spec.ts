import { expect, test } from "@playwright/test";

/**
 * Regression: the second half of the RTL sweep. Cycle 34 measured `/report`,
 * `/care` and `/checkin`; this covers `/` (landing), `/survey`, `/scan` (the
 * pre-camera `init` screen — this container has no camera), `/studio`,
 * `/privacy` and `/unsubscribe` at 360x800 under en / ja / zh / ar.
 *
 * Four blocks positioned or aligned themselves with a PHYSICAL keyword, which
 * does not follow `dir=rtl`. Measured on the unchanged code at 360x800, `ar`,
 * as viewport x-coordinates:
 *
 * 1. `/privacy` — `outlineBtn` / `dangerBtn` carried `textAlign: "left"`. All
 *    seven of the page's non-centred buttons put their Arabic label against the
 *    reading END of a 282px-wide button. Content box runs 54…306; before the fix
 *    the labels ran 54…198, 54…242, 54…160, 54…218, 54…181, 54…280 and 87…306.
 * 2. `/` — `HowCard`'s text column carried `textAlign: "left"`, so in a 38…240
 *    box the Arabic title ended at 161 / 194 / 172 instead of at 240.
 * 3. `/` — `HowCard`'s mascot carried `marginLeft: -6`, which in RTL lands on the
 *    side away from the step number. The 6px/12px gutters swapped: number→mascot
 *    was 12 in `ar` against 6 in `en`, mascot→text 6 against 12.
 * 4. `/scan` `phase === "init"` — the three-line intro list carried
 *    `textAlign: "left"`; in a 62…273 box every Arabic line started at 62.
 * 5. `FlowSteps`' hairline divider carried `marginRight: 2`, so its 7px/9px
 *    gutters were mirrored: in `ar` home→divider read 9 and divider→step 7.
 *
 * The fix is `text-align: start` / `margin-inline-start` / `margin-inline-end`.
 * CSS Logical Properties and Values Level 1 spells the mapping out on an Arabic
 * example: `text-align: start; /* left in latin, right in arabic *​/` and
 * `margin-inline-start: 0px; /* margin-left in latin, margin-right in arabic *​/`.
 *
 * Deliberately NOT touched, and asserted nowhere here: everything drawn over the
 * camera image in `app/scan/guide.tsx`. Those are physical positions on a photo
 * of a face — mirroring them would put "왼볼" on the right cheek. The same spec
 * section says so: "the drop shadows on buttons on a page must remain consistent
 * throughout, so their offset will be chosen based on visual considerations and
 * physical directions, and not vary by writing system."
 */

const VIEWPORT = { width: 360, height: 800 };

async function open(browser: import("@playwright/test").Browser, lang: "en" | "ar", path: string) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript((l) => localStorage.setItem("aru.lang", l as string), lang);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  return { context, page };
}

// Arabic lays one visual line out as several client rects (one per bidi run), so
// rects are grouped by their top edge before the line's extent is read off.
const VISUAL_LINES = `(el) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  const byTop = new Map();
  for (const r of Array.from(range.getClientRects())) {
    if (r.width <= 0) continue;
    const key = Math.round(r.top);
    const cur = byTop.get(key) ?? { left: r.left, right: r.right };
    byTop.set(key, { left: Math.min(cur.left, r.left), right: Math.max(cur.right, r.right) });
  }
  return Array.from(byTop.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({ left: Math.round(v.left), right: Math.round(v.right) }));
}`;

// Where an element's own text may start and end, padding and border excluded.
const CONTENT_EDGES = `(el) => {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const l = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
  const rr = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
  return { left: Math.round(r.left + l), right: Math.round(r.right - rr) };
}`;

async function privacyButtons(page: import("@playwright/test").Page) {
  await expect(page.locator("button").first()).toBeVisible();
  return page.evaluate(
    ([linesSrc, edgesSrc]) => {
      const lines = eval(linesSrc as string) as (el: Element) => Array<{ left: number; right: number }>;
      const edges = eval(edgesSrc as string) as (el: Element) => { left: number; right: number };
      return Array.from(document.querySelectorAll("button"))
        .filter((b) => getComputedStyle(b).textAlign !== "center")
        .map((b) => ({ align: getComputedStyle(b).textAlign, box: edges(b), lines: lines(b) }));
    },
    [VISUAL_LINES, CONTENT_EDGES] as const,
  );
}

async function howCards(page: import("@playwright/test").Page) {
  await expect(page.locator("h3").first()).toBeVisible();
  return page.evaluate(
    ([linesSrc, edgesSrc]) => {
      const lines = eval(linesSrc as string) as (el: Element) => Array<{ left: number; right: number }>;
      const edges = eval(edgesSrc as string) as (el: Element) => { left: number; right: number };
      return Array.from(document.querySelectorAll("h3")).map((h) => {
        const textBox = h.parentElement as HTMLElement;
        const row = textBox.parentElement as HTMLElement;
        const [num, mascot] = Array.from(row.children) as HTMLElement[];
        const r = (el: HTMLElement) => el.getBoundingClientRect();
        return {
          align: getComputedStyle(textBox).textAlign,
          box: edges(textBox),
          title: lines(h),
          num: { left: Math.round(r(num).left), right: Math.round(r(num).right) },
          mascot: { left: Math.round(r(mascot).left), right: Math.round(r(mascot).right) },
        };
      });
    },
    [VISUAL_LINES, CONTENT_EDGES] as const,
  );
}

async function scanIntro(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("scan-start")).toBeVisible();
  return page.evaluate(
    ([linesSrc, edgesSrc]) => {
      const lines = eval(linesSrc as string) as (el: Element) => Array<{ left: number; right: number }>;
      const edges = eval(edgesSrc as string) as (el: Element) => { left: number; right: number };
      const list = (document.querySelector("[data-testid='scan-start']") as HTMLElement)
        .previousElementSibling as HTMLElement;
      const nav = document.querySelector("nav.aru-flow-steps") as HTMLElement;
      const [home, divider, firstStep] = Array.from(nav.children) as HTMLElement[];
      const r = (el: HTMLElement) => el.getBoundingClientRect();
      return {
        align: getComputedStyle(list).textAlign,
        rows: Array.from(list.children).map((row) => {
          const span = row.children[1] as HTMLElement;
          return { box: edges(span), lines: lines(span) };
        }),
        flow: {
          home: { left: Math.round(r(home).left), right: Math.round(r(home).right) },
          divider: { left: Math.round(r(divider).left), right: Math.round(r(divider).right) },
          step: { left: Math.round(r(firstStep).left), right: Math.round(r(firstStep).right) },
        },
      };
    },
    [VISUAL_LINES, CONTENT_EDGES] as const,
  );
}

test("/privacy's export and delete buttons put their label at the reading start under Arabic", async ({ browser }) => {
  const { context, page } = await open(browser, "ar", "/privacy");
  const buttons = await privacyButtons(page);

  expect(buttons.length, "the privacy screen should still offer its export/delete buttons").toBeGreaterThanOrEqual(7);
  for (const b of buttons) {
    // `text-align: start` computes to the specified keyword, not to a side, so the
    // keyword itself is the assertion; a physical `left` here is the defect.
    expect(b.align, "a privacy button aligned its label to the physical left").toBe("start");
    for (const line of b.lines) {
      expect(line.right, "an Arabic button label was pushed to the far end of its button").toBe(b.box.right);
    }
  }
  await context.close();
});

test("/privacy's buttons still read from the left in LTR", async ({ browser }) => {
  const { context, page } = await open(browser, "en", "/privacy");
  const buttons = await privacyButtons(page);

  expect(buttons.length).toBeGreaterThanOrEqual(7);
  for (const b of buttons) {
    expect(b.align).toBe("start");
    for (const line of b.lines) expect(line.left).toBe(b.box.left);
  }
  await context.close();
});

test("the landing cards' titles and mascot gutters follow the reading direction under Arabic", async ({ browser }) => {
  const { context, page } = await open(browser, "ar", "/");
  const cards = await howCards(page);

  expect(cards.length, "the landing page should still show its three how-it-works cards").toBe(3);
  for (const c of cards) {
    expect(c.align, "a landing card aligned its title to the physical left").toBe("start");
    for (const line of c.title) {
      expect(line.right, "an Arabic card title was pushed to the far end of its column").toBe(c.box.right);
    }
    // In RTL the number is the rightmost thing in the row, the mascot next.
    // `marginInlineStart: -6` has to tighten number→mascot, not mascot→text.
    expect(c.num.left - c.mascot.right, "the mascot's negative gutter landed on the wrong side").toBe(6);
    expect(c.mascot.left - c.box.right, "the mascot ate the text column's gutter").toBe(12);
  }
  await context.close();
});

test("the landing cards keep their LTR gutters", async ({ browser }) => {
  const { context, page } = await open(browser, "en", "/");
  const cards = await howCards(page);

  expect(cards.length).toBe(3);
  for (const c of cards) {
    expect(c.align).toBe("start");
    for (const line of c.title) expect(line.left).toBe(c.box.left);
    expect(c.mascot.left - c.num.right).toBe(6);
    expect(c.box.left - c.mascot.right).toBe(12);
  }
  await context.close();
});

test("the pre-camera intro list and the step rail follow the reading direction under Arabic", async ({ browser }) => {
  const { context, page } = await open(browser, "ar", "/scan");
  const { align, rows, flow } = await scanIntro(page);

  expect(align, "the scan intro list aligned to the physical left").toBe("start");
  expect(rows.length, "the intro should still list its three points").toBe(3);
  for (const row of rows) {
    for (const line of row.lines) {
      expect(line.right, "an Arabic intro line started at the far end of its column").toBe(row.box.right);
    }
  }
  // The hairline divider's 2px belongs after it in reading order, so in RTL the
  // wider gap is the one towards the first step, exactly as in LTR.
  expect(flow.home.left - flow.divider.right, "the flow divider's extra gutter is on the wrong side").toBe(7);
  expect(flow.divider.left - flow.step.right).toBe(9);
  await context.close();
});

test("the pre-camera intro list and the step rail are unchanged in LTR", async ({ browser }) => {
  const { context, page } = await open(browser, "en", "/scan");
  const { align, rows, flow } = await scanIntro(page);

  expect(align).toBe("start");
  expect(rows.length).toBe(3);
  for (const row of rows) {
    for (const line of row.lines) expect(line.left).toBe(row.box.left);
  }
  expect(flow.divider.left - flow.home.right).toBe(7);
  expect(flow.step.left - flow.divider.right).toBe(9);
  await context.close();
});
