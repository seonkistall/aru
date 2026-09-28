import { expect, test } from "@playwright/test";

/**
 * Cycle 49's accessibility pass computed every colour token against `#ffffff`. Two of
 * them clear WCAG 2.2 AA there and fail on `--surface-tint` #f5f5f5, and `/privacy` is
 * where they render on it — its two `noticeStyle` cards. Measured at 360x800 on a
 * production build, `ko` and `en`, before the fix:
 *
 *   `--bronze`  #767676  4.542:1 on white, 4.166:1 on the tint  (the card's eyebrow)
 *   `--plum`    #d9362b  4.653:1 on white, 4.268:1 on the tint  (`dangerBtn`)
 *
 * Both are body-size text, so the floor is 4.5 (SC 1.4.3). `--bronze` is now #6e6e6e and
 * `dangerBtn` now takes `--plum-press` #c22e23; `--plum` itself is untouched, because it
 * is the primary CTA colour on every screen and it already moved last cycle.
 *
 * This spec measures the ratio against the colours the BROWSER resolves on the element
 * that actually renders, not against hex literals, and it reads the background off the
 * ancestor chain — so it fails if the token moves back, if the card stops being tinted in
 * a way that changes the maths, or if the style stops applying. It also asserts the card
 * really is tinted and not white, because a white card would make the whole measurement
 * vacuous: that is the mistake this spec exists to stop being repeated.
 *
 * The 7 other `--surface-tint` backgrounds listed next were checked by the same sweep
 * (`app/components/product-card.tsx:109,115`, `app/report/page.tsx:633,642`,
 * `app/checkin/page.tsx:240`, `app/studio/page.tsx:173,180`) and pass: they carry
 * `--ink`, `--ink-soft`, `--success` or `--text-muted` #6e6e6e (4.677:1 on the tint). The
 * two disabled submit buttons that put `--muted` on the tint
 * (`app/survey/page.tsx:245`, `app/checkin/page.tsx:225`) are an inactive user interface
 * component, which SC 1.4.3's Incidental exception excludes.
 *
 * (Supervisor, cycle 50 review: the count above said 6 and listed 7. The list is not every
 * `--surface-tint` use either — `app/survey/page.tsx:140`, `app/report/page.tsx:46` and
 * `app/scan/scan-styles.ts:34` carry no text, and `scan-styles.ts:85`'s `stepBtn` is
 * `--ink`. And `--surface-tint` is not the only tint: `--plum-soft` is the retake card's
 * background, which the last test in this file covers.)
 */

// WCAG relative luminance and contrast ratio, from the normative definitions. Same
// formula as tests/e2e/conversion-path-accessibility.spec.ts.
const CONTRAST = `(() => {
  const srgb = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = ([r, g, b]) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
  const parse = (s) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(s || "");
    if (!m) return null;
    const p = m[1].split(/[,\\s\\/]+/).filter(Boolean).map(Number);
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));
  const bgOf = (el) => {
    const layers = [];
    let node = el;
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      node = node.parentElement;
    }
    let acc = [255, 255, 255];
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  };
  return (el) => {
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    const bg = bgOf(el);
    const [l1, l2] = [lum(over(fg, bg)), lum(bg)].sort((x, y) => y - x);
    const px = parseFloat(s.fontSize);
    const weight = Number(s.fontWeight) || 400;
    return {
      ratio: (l1 + 0.05) / (l2 + 0.05),
      px,
      weight,
      color: s.color,
      bg: "rgb(" + bg.map((c) => Math.round(c)).join(", ") + ")",
      large: px >= 24 || (px >= 18.66 && weight >= 700),
    };
  };
})()`;

/**
 * Every visible leaf text node inside a section whose own background is NOT white,
 * measured. Returns the tinted sections' resolved background too, so a card that quietly
 * became white cannot let this spec pass by having nothing left to check.
 */
const TINTED_TEXT = `(() => {
  const measure = MEASURE;
  const isWhite = (s) => /^rgba?\\(255,\\s*255,\\s*255/.test(s) || s === "rgba(0, 0, 0, 0)" || s === "transparent";
  const tinted = Array.from(document.querySelectorAll("section")).filter((s) => !isWhite(getComputedStyle(s).backgroundColor));
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && Number(st.opacity) > 0;
  };
  const nodes = [];
  for (const section of tinted) {
    for (const el of Array.from(section.querySelectorAll("*"))) {
      if (el.children.length > 0) continue;
      if (!(el.textContent || "").trim()) continue;
      if (!vis(el)) continue;
      nodes.push({ text: el.textContent.trim().slice(0, 40), ...measure(el) });
    }
  }
  return { tintedSections: tinted.length, backgrounds: tinted.map((s) => getComputedStyle(s).backgroundColor), nodes };
})()`;

for (const lang of ["ko", "en"] as const) {
  test(`every text node on /privacy's tinted cards clears WCAG AA in ${lang}`, async ({ page }) => {
    await page.addInitScript(([l]) => { try { localStorage.setItem("aru.lang", l as string); } catch {} }, [lang] as const);
    await page.goto("/privacy");
    await page.waitForLoadState("networkidle");
    // The delete controls are behind a mount effect that reads device storage, so the
    // tinted card's own button only exists once the page has settled.
    await expect(page.locator("section").first()).toBeVisible();

    const report = (await page.evaluate(([src]) => eval(src as string), [
      TINTED_TEXT.replace("MEASURE", CONTRAST),
    ] as const)) as {
      tintedSections: number;
      backgrounds: string[];
      nodes: { text: string; ratio: number; px: number; weight: number; large: boolean; color: string; bg: string }[];
    };

    // Vacuity guards, both directions: there must be tinted cards, and they must hold text.
    expect(report.tintedSections, "/privacy should render tinted notice cards").toBeGreaterThanOrEqual(2);
    for (const bg of report.backgrounds) {
      expect(bg, `a notice card resolved to ${bg}, so the tinted measurement is vacuous`).not.toMatch(/255,\s*255,\s*255/);
    }
    expect(report.nodes.length, "the tinted cards should hold measurable text").toBeGreaterThan(5);

    const failing = report.nodes
      .filter((n) => n.ratio < (n.large ? 3 : 4.5))
      .map((n) => `"${n.text}" ${n.color} on ${n.bg} = ${Math.round(n.ratio * 1000) / 1000}:1 (${n.px}px/${n.weight})`);
    expect(failing, `${lang}: text under the AA floor on a tinted card`).toEqual([]);
  });
}

test("the two tokens this cycle moved are the values the fix chose", async ({ page }) => {
  // The token values themselves, read off the page. A ratio assertion alone would pass
  // if someone swapped BOTH the token and the card background; this says which values
  // the measurements above were taken with.
  await page.goto("/privacy");
  const tokens = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      bronze: s.getPropertyValue("--bronze").trim(),
      plum: s.getPropertyValue("--plum").trim(),
      plumPress: s.getPropertyValue("--plum-press").trim(),
      surfaceTint: s.getPropertyValue("--surface-tint").trim(),
    };
  });
  expect(tokens.bronze).toBe("#6e6e6e");
  expect(tokens.plumPress).toBe("#c22e23");
  // Deliberately pinned as UNCHANGED: the brand red stays where cycle 49 put it.
  expect(tokens.plum).toBe("#d9362b");
  expect(tokens.surfaceTint).toBe("#f5f5f5");

  // And the destructive buttons take the darker red, not the brand one.
  const colors = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .filter((b) => /지우기|삭제|Delete|Clear/.test(b.textContent ?? ""))
      .map((b) => getComputedStyle(b).color),
  );
  expect(colors.length, "/privacy should render its delete buttons").toBeGreaterThan(2);
  for (const c of colors) expect(c).toBe("rgb(194, 46, 35)");
});

// Supervisor, cycle 50 review. `--surface-tint` was not the only tinted surface: /report's
// confidence card turns `--plum-soft` when the reading recommends a retake, and it holds
// the `--bronze` label and the `--text-muted` "의료 진단이 아니라…" line. With `--plum-soft`
// at #fbe6e4 those measured 4.259:1. The sweep above only renders the non-retake card,
// which is white, so this renders the retake one.
for (const lang of ["ko", "en"] as const) {
  test(`every text node on /report's retake confidence card clears WCAG AA in ${lang}`, async ({ page }) => {
    await page.addInitScript(
      ([l, survey, reads]) => {
        try {
          localStorage.setItem("aru.lang", l as string);
          sessionStorage.setItem("gyeol_survey", survey as string);
          sessionStorage.setItem("gyeol_reads", reads as string);
        } catch {}
      },
      [
        lang,
        '{"type":"지성","concerns":["모공"],"budget":30000,"avoid":[],"category":"토너"}',
        JSON.stringify({
          oil: { value: "유분 많음", level: 2, calm: false },
          pores: { value: "결 약간 보임", level: 1, calm: false },
          redness: { value: "붉은기 약간", level: 1, calm: false },
          overall: { value: "균형 관리 필요", level: 2, calm: false },
          headline: "T존 유분과 피부결을 함께 볼게요",
          narrative: "T존 유분감이 비교적 뚜렷해요.",
          confidence: 0.41,
          confidenceLabel: "낮음",
          retakeRecommended: true,
          retakeReasons: ["촬영 프레임 사이에 신호가 조금 흔들렸어요"],
          signals: [{ label: "조명", ok: false, detail: "빛이 충분해요" }],
          source: "roi-calibrated",
          raw: {},
        }),
      ] as const,
    );
    await page.goto("/report");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("section").first()).toBeVisible();

    const report = (await page.evaluate(([src]) => eval(src as string), [
      TINTED_TEXT.replace("MEASURE", CONTRAST),
    ] as const)) as {
      tintedSections: number;
      backgrounds: string[];
      nodes: { text: string; ratio: number; px: number; weight: number; large: boolean; color: string; bg: string }[];
    };

    // Vacuity guards: the retake card must really be tinted, and hold the text in question.
    expect(report.tintedSections, "/report should render the tinted retake card").toBeGreaterThanOrEqual(1);
    for (const bg of report.backgrounds) {
      expect(bg, `a tinted section resolved to ${bg}`).not.toMatch(/255,\s*255,\s*255/);
    }
    expect(report.nodes.length, "the retake card should hold measurable text").toBeGreaterThan(5);

    const failing = report.nodes
      .filter((n) => n.ratio < (n.large ? 3 : 4.5))
      .map((n) => `"${n.text}" ${n.color} on ${n.bg} = ${Math.round(n.ratio * 1000) / 1000}:1 (${n.px}px/${n.weight})`);
    expect(failing, `${lang}: text under the AA floor on the retake card`).toEqual([]);
  });
}
