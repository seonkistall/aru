import { expect, test } from "@playwright/test";

/**
 * Cycle 49's accessibility pass computed every colour token against `#ffffff`. Two of
 * them clear WCAG 2.2 AA there and fail on `--surface-tint` #f5f5f5, and `/privacy` is
 * where they render on it — its two `noticeStyle` cards. Measured at 360x800 on a
 * production build, `ko` and `en`, before the fix:
 *
 *   `--bronze`  #767676  4.540:1 on white, 4.166:1 on the tint  (the card's eyebrow)
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
 * The 6 other `--surface-tint` backgrounds in `app/*.tsx` were checked by the same sweep
 * (`app/components/product-card.tsx:109,115`, `app/report/page.tsx:633,642`,
 * `app/checkin/page.tsx:240`, `app/studio/page.tsx:173,180`) and pass: they carry
 * `--ink`, `--ink-soft`, `--success` or `--text-muted` #6e6e6e (4.677:1 on the tint). The
 * two disabled submit buttons that put `--muted` on the tint
 * (`app/survey/page.tsx:245`, `app/checkin/page.tsx:225`) are an inactive user interface
 * component, which SC 1.4.3's Incidental exception excludes.
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
