import { expect, test } from "@playwright/test";

/**
 * Regression: the third RTL pass. Cycle 34 swept `/report`, `/care` and
 * `/checkin`; cycle 35 swept the other six screens but left two blocks
 * unmeasured because they render only at `phase === "ready"`, which needs a
 * camera. It does not need a real one: `getUserMedia` is shimmed to a canvas
 * `captureStream()`, the same trick `tests/e2e/mobile-layout.spec.ts` uses, and
 * the page reaches `ready` the way it does on a phone.
 *
 * Three physical-direction defects, all measured at 360x800 against a build,
 * as viewport x-coordinates under `en` and `ar`:
 *
 * 1. `app/scan/info-sheet.tsx` — the privacy `<ul>` indented with `paddingLeft:
 *    18`. The computed `list-style-type` is `none`, so there is no
 *    marker to place and the 18px is pure indent. Under `ar` it landed at the
 *    reading END: the `<ul>` box ran 33…327, every line of every `<li>` ended
 *    at 327, and the sibling `<b>` above also ended at 327 — an 18px indent in
 *    `en` (list text starts 51 against the sibling's 33) became 0px.
 * 2. `app/care/page.tsx` `tipList` — the same defect on the same numbers:
 *    box 39…321, `<li>` lines ended at 321, sibling at 321. `en`: 57 vs 39.
 * 3. `app/components/product-card.tsx` — the price span used `marginLeft:
 *    "auto"` to push itself to the end of a `display: flex` row. In RTL the
 *    LEFT is the inline end, so the auto margin resolved on the end side and
 *    the price stayed at the start. Measured on `/report`'s picks step, all
 *    three cards: `en` gap-at-start 25.4 / gap-at-end 0 (correct); `ar` 0 /
 *    23.3 (mirrored the wrong way).
 *
 * 4. `app/care/page.tsx` — the commerce intro's mascot pulled itself toward the
 *    paragraph with `marginLeft: -12`. Grepped here rather than handed over; it
 *    is the same keyword and the same shape as the landing card's mascot that
 *    cycle 35 fixed. Under `ar` the negative margin landed on the side away from
 *    the paragraph: the mascot ran 27…81 against a row of 39…321, i.e. 12px
 *    OUTSIDE the card's own inline end, and the paragraph gap read +6 where `en`
 *    reads -6.
 *
 * The fix is `padding-inline-start` and `margin-inline-start`. CSS Logical
 * Properties and Values Level 1 spells the mapping out on an Arabic example:
 * `padding-inline-start: 5px; /* padding-left in latin, padding-right in
 * arabic *​/`.
 *
 * Measured under `ar` and deliberately NOT changed, because none of them paints
 * differently: `scan-controls.tsx`'s `privacyPill` `textAlign: "right"` (its
 * Arabic string is one line whose box, 44…186.7, fits it exactly);
 * `app/report/page.tsx`'s value span `textAlign: "right"` (`flexShrink: 0`, box
 * width equals text width on all three rows); `app/care/page.tsx`'s `linkBtn`
 * and `otherMerchantsBtn` `textAlign: "left"` (every painted string is inside a
 * child that sets `textAlign: "start"`, or is a shrink-to-fit flex item under
 * `justify-content: space-between`). Also untouched: everything drawn over the
 * camera image in `app/scan/guide.tsx`, which is a physical overlay on a
 * mirrored photo of a face.
 */

const VIEWPORT = { width: 360, height: 800 };
const VALID_SURVEY = '{"type":"지성","concerns":["모공"],"budget":30000,"avoid":[],"category":"토너"}';
const REAL_READS = JSON.stringify({
  oil: { value: "유분 많음", level: 2, calm: false },
  pores: { value: "결 약간 보임", level: 1, calm: false },
  redness: { value: "붉은기 약간", level: 1, calm: false },
  overall: { value: "균형 관리 필요", level: 2, calm: false },
  headline: "T존 유분과 피부결을 함께 볼게요",
  narrative: "T존 유분감이 비교적 뚜렷해요.",
  confidence: 0.72,
  confidenceLabel: "보통",
  retakeRecommended: false,
  retakeReasons: [],
  signals: [{ label: "조명", ok: true, detail: "빛이 충분해요" }],
  source: "roi-calibrated",
  raw: {},
});

// A real MediaStream from a canvas, so `openCamera` resolves, `watchCameraStream`
// finds a track and the scan page reaches `phase === "ready"`.
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
  const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream })
    .captureStream(10);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => stream },
  });
};

type Dir = "en" | "ar";

async function open(
  browser: import("@playwright/test").Browser,
  lang: Dir,
  path: string,
  opts: { camera?: boolean; survey?: boolean; reads?: boolean } = {},
) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(
    ([l, survey, reads, wantSurvey, wantReads]) => {
      localStorage.setItem("aru.lang", l as string);
      if (wantSurvey) sessionStorage.setItem("gyeol_survey", survey as string);
      if (wantReads) sessionStorage.setItem("gyeol_reads", reads as string);
    },
    [lang, VALID_SURVEY, REAL_READS, Boolean(opts.survey), Boolean(opts.reads)] as const,
  );
  if (opts.camera) await context.addInitScript(FAKE_CAMERA);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  return { context, page };
}

// Where a list's own text begins on the reading-start side, and where the block
// just above it begins. Arabic lays one visual line out as several client rects
// (one per bidi run), so the extent is read off the range rather than the box.
const LIST_INDENT = `(ul) => {
  const rtl = getComputedStyle(ul).direction === "rtl";
  const extent = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
    return { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)) };
  };
  const startOf = (e) => (rtl ? e.right : e.left);
  const box = ul.getBoundingClientRect();
  const sibling = ul.previousElementSibling;
  return {
    paddingInlineStart: getComputedStyle(ul).paddingInlineStart,
    ulStart: Math.round(rtl ? box.right : box.left),
    siblingStart: Math.round(startOf(extent(sibling))),
    itemStarts: Array.from(ul.querySelectorAll("li")).map((li) => Math.round(startOf(extent(li)))),
  };
}`;

async function reachReadyPhase(page: import("@playwright/test").Page) {
  await page.getByTestId("scan-start").click();
  await expect(page.locator("main [data-quality-checklist]")).toBeVisible({ timeout: 30_000 });
}

for (const lang of ["en", "ar"] as const) {
  const sign = lang === "ar" ? -1 : 1;

  test(`the scan info sheet's privacy list keeps its 18px indent at the reading start under ${lang}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const { context, page } = await open(browser, lang, "/scan", { camera: true });
    await reachReadyPhase(page);
    // The last button in the options panel is "see how photos and data are used".
    await page.evaluate(() => (Array.from(document.querySelectorAll("section button")).pop() as HTMLElement).click());
    const list = page.locator('[role="dialog"] ul');
    await expect(list).toBeVisible();

    const m = await list.evaluate((el, src) => (eval(src) as (n: Element) => unknown)(el), LIST_INDENT);
    const indent = m as { paddingInlineStart: string; ulStart: number; siblingStart: number; itemStarts: number[] };

    expect(indent.paddingInlineStart, "the list indent must be a logical inline-start padding").toBe("18px");
    expect(indent.itemStarts.length, "the privacy list should still carry its three points").toBe(3);
    for (const start of indent.itemStarts) {
      // 18px in from the list box, on whichever side the language reads from.
      expect((start - indent.ulStart) * sign, "a list line did not start 18px in from the list box").toBe(18);
      // …and therefore 18px in from the sentence above it, which is the visible indent.
      expect((start - indent.siblingStart) * sign, "the list lost its indent against the line above it").toBe(18);
    }
    await context.close();
  });

  test(`/care's foreign-visitor tips keep their 18px indent at the reading start under ${lang}`, async ({
    browser,
  }) => {
    const { context, page } = await open(browser, lang, "/care", { survey: true, reads: true });
    const list = page.locator("ul").last();
    await expect(list).toBeVisible();

    const m = await list.evaluate((el, src) => (eval(src) as (n: Element) => unknown)(el), LIST_INDENT);
    const indent = m as { paddingInlineStart: string; ulStart: number; siblingStart: number; itemStarts: number[] };

    expect(indent.paddingInlineStart).toBe("18px");
    expect(indent.itemStarts.length, "the tips list should still carry its three points").toBe(3);
    for (const start of indent.itemStarts) {
      expect((start - indent.ulStart) * sign, "a tip line did not start 18px in from the list box").toBe(18);
      expect((start - indent.siblingStart) * sign, "the tips list lost its indent against the line above it").toBe(18);
    }
    await context.close();
  });

  test(`the product card's price sits at the row's reading end under ${lang}`, async ({ browser }) => {
    const { context, page } = await open(browser, lang, "/report", { survey: true, reads: true });
    await page.getByRole("tab").nth(1).click();
    // The picks step renders its cards after the recommender runs, so wait for the
    // price spans themselves rather than for the first button on the step.
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("div")).filter(
          (d) =>
            (d as HTMLElement).style?.display === "flex" &&
            (d as HTMLElement).style?.flexWrap === "wrap" &&
            getComputedStyle(d.lastElementChild as Element).fontWeight === "800",
        ).length === 3,
      undefined,
      { timeout: 20_000 },
    );

    const rows = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll("div")).filter(
        (d) =>
          d.style?.display === "flex" &&
          d.style?.flexWrap === "wrap" &&
          // The price is the only 800-weight span in a wrapping meta row; the
          // highlight chips beside it are 400.
          getComputedStyle(d.lastElementChild as Element).fontWeight === "800",
      );
      return candidates.map((row) => {
        const price = row.lastElementChild as HTMLElement;
        const rtl = getComputedStyle(row).direction === "rtl";
        const rr = row.getBoundingClientRect();
        const pr = price.getBoundingClientRect();
        return {
          marginInlineEnd: getComputedStyle(price).marginInlineEnd,
          gapAtStart: Math.round(rtl ? rr.right - pr.right : pr.left - rr.left),
          gapAtEnd: Math.round(rtl ? pr.left - rr.left : rr.right - pr.right),
        };
      });
    });

    expect(rows.length, "the picks step should still render its three product cards").toBe(3);
    for (const row of rows) {
      // The auto margin has to absorb the slack BEFORE the price, never after it.
      expect(row.gapAtEnd, "the price span was not flush with the row's reading end").toBe(0);
      expect(row.gapAtStart, "the auto margin did not absorb the row's slack").toBeGreaterThan(0);
      expect(row.marginInlineEnd, "the auto margin resolved on the end side").toBe("0px");
    }
    await context.close();
  });

  test(`/care's commerce mascot keeps its negative gutter on the paragraph side under ${lang}`, async ({
    browser,
  }) => {
    const { context, page } = await open(browser, lang, "/care", { survey: true, reads: true });
    const mascot = page.locator('span[style*="margin-inline-start"]').first();
    await expect(mascot).toBeVisible();

    const gutters = await mascot.evaluate((span) => {
      const row = span.parentElement as HTMLElement;
      const paragraph = row.firstElementChild as HTMLElement;
      const rtl = getComputedStyle(row).direction === "rtl";
      const m = span.getBoundingClientRect();
      const p = paragraph.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      return {
        // Negative: the mascot deliberately overlaps the paragraph's box by 6px.
        paragraphToMascot: Math.round(rtl ? p.left - m.right : m.left - p.right),
        // Zero: the mascot ends exactly at the row's inline end, never past it.
        mascotToRowEnd: Math.round(rtl ? m.left - r.left : r.right - m.right),
      };
    });

    expect(gutters.paragraphToMascot, "the mascot's negative gutter landed on the wrong side").toBe(-6);
    expect(gutters.mascotToRowEnd, "the mascot hung outside the card's inline end").toBe(0);
    await context.close();
  });
}

test("the /scan capture button stays above the 800px fold in every locale", async ({ browser }) => {
  test.setTimeout(180_000);
  for (const lang of ["ko", "en", "ja", "zh", "ar"] as const) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    await context.addInitScript((l) => localStorage.setItem("aru.lang", l as string), lang);
    await context.addInitScript(FAKE_CAMERA);
    const page = await context.newPage();
    await page.goto("/scan");
    // ja/zh/ar arrive by dynamic import(), so `LanguageProvider` renders English
    // first and remounts the subtree (`key={active}`, `lib/i18n.tsx:125`) when the
    // chunk lands. Clicking before that remount starts the camera on a tree that is
    // about to be thrown away, and `phase` goes back to `init`. `html[lang]` is set
    // by an effect from the same `active`, so it is the signal the remount is done.
    await expect(page.locator("html")).toHaveAttribute("lang", lang === "zh" ? "zh-CN" : lang);
    await reachReadyPhase(page);

    const measured = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("main button"));
      const capture = buttons[buttons.length - 1] as HTMLElement;
      const rect = capture.getBoundingClientRect();
      const text = document.body.innerText;
      return {
        bottom: rect.bottom,
        label: capture.textContent?.trim() ?? "",
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        placeholders: text.match(/\{[a-zA-Z_]+\}/g) ?? [],
        korean: (text.match(/[가-힣]+/g) ?? []).length,
      };
    });

    expect(measured.label, `the capture button lost its label in ${lang}`).not.toBe("");
    expect(measured.bottom, `the capture button fell below the fold in ${lang}`).toBeLessThanOrEqual(800);
    expect(measured.scrollWidth, `${lang} scrolled sideways at 360px`).toBe(measured.clientWidth);
    expect(measured.placeholders, `an un-interpolated placeholder rendered in ${lang}`).toEqual([]);
    if (lang !== "ko") {
      expect(measured.korean, `Korean source text leaked into ${lang}`).toBe(0);
    }
    await context.close();
  }
});
