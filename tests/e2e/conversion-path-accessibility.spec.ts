import { expect, test } from "@playwright/test";

/**
 * First accessibility pass on the conversion path (cycle 49). The audit ran at 360x800 on
 * a production build, en and ko, over `/`, `/scan` (intro and ready), `/survey`, `/report`
 * picks and `/care` — Playwright's own APIs and computed styles, no axe and no new
 * dependency. What it found clean, and what this spec therefore does NOT need to defend:
 * 0 interactive controls with no accessible name out of 186 across the 12 screen x locale
 * pairs, 0 of 68 images without `alt` or `aria-hidden`, and 164 keyboard focus stops
 * every one of which had a visible indicator. (0 unlabelled form controls too, but the
 * path holds only 6 of them — the /scan consent checkboxes — so that one is thin.)
 *
 * What it found broken was contrast and one target, and that is what this spec pins.
 *
 * 1. `--plum`, the primary CTA colour, was #e0382c = 4.401:1 on white — under the WCAG 2.2
 *    AA floor of 4.5:1 (SC 1.4.3) in both directions, since contrast is symmetric. 60 of
 *    the 66 failing nodes (of 580 measured) were that one token. Now #d9362b = 4.653:1.
 * 2. `--orange` was #ef8a1f = 2.522:1, under the 3:1 large-text floor, on the 26px step
 *    numerals on `/`. Now #d57b1c = 3.144:1.
 * 3. `/survey`'s "카메라로 다시 살펴보기" link was 18.8px tall. It does NOT fail SC 2.5.8
 *    (24x24 with a Spacing exception: the nearest other target sits 72.9px from a 24px
 *    circle centred on it), but it misses `--tap-min: 44px`, which is this repo's contract
 *    and WCAG 2.5.5 AAA, and it has no sentence around it to claim the Inline exception
 *    the two `/guide/` links on `/` legitimately do.
 *
 * The ratios are computed here from the SAME formula the audit used and WCAG defines
 * (relative luminance, sRGB), against the colours the browser actually resolves — not
 * against the hex literals — so a token indirection that silently stops applying fails.
 */

// WCAG relative luminance and contrast ratio, from the normative definitions.
const CONTRAST = `(() => {
  const srgb = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = ([r, g, b]) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
  // \`color(srgb ...)\` too: Chromium serialises a \`color-mix()\` background that way, and an
  // rgb-only parse skips the layer and measures against the ancestor (cycle 51; ported here
  // by the supervisor from tinted-surface-contrast.regression-35.spec.ts).
  const parse = (s) => {
    const c = /color\\(\\s*srgb\\s+([^)]+)\\)/.exec(s || "");
    if (c) {
      const p = c[1].split(/[\\s\\/]+/).filter(Boolean).map(Number);
      return { rgb: [p[0] * 255, p[1] * 255, p[2] * 255], a: p.length > 3 ? p[3] : 1 };
    }
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
      // WCAG "large scale": 18pt (24px), or 14pt bold (18.66px).
      large: px >= 24 || (px >= 18.66 && weight >= 700),
    };
  };
})()`;

async function contrastOf(page: import("@playwright/test").Page, selector: string, nth = 0) {
  return page.evaluate(
    ([sel, index, src]) => {
      const el = document.querySelectorAll(sel as string)[index as number];
      if (!el) return null;
      return (eval(src as string) as (e: Element) => unknown)(el);
    },
    [selector, nth, CONTRAST] as const,
  ) as Promise<{ ratio: number; px: number; weight: number; large: boolean } | null>;
}

const SCAN = JSON.stringify({ oil: 2, redness: 1, pores: 1, confidence: 0.72, retakeRecommended: false, source: "roi-calibrated" });

test.describe("conversion-path accessibility", () => {
  test("the primary CTA text clears WCAG AA contrast on /scan and /survey", async ({ page }) => {
    // The survey is seeded so /survey's submit button is ENABLED. Measured disabled it
    // reads 4.166:1, and that is not a defect: SC 1.4.3's Incidental exception says text
    // "that is part of an inactive user interface component" has no contrast requirement.
    // Asserting on the disabled state would have pinned the wrong number.
    await page.addInitScript(
      ([survey]) => {
        try {
          localStorage.setItem("aru.lang", "ko");
          sessionStorage.setItem("gyeol_survey", survey as string);
        } catch {}
      },
      ['{"type":"지성","concerns":["모공"],"budget":30000,"avoid":[],"category":"토너"}'] as const,
    );

    await page.goto("/scan");
    await expect(page.locator('[data-testid="scan-start"]')).toBeVisible();
    const scanCta = await contrastOf(page, '[data-testid="scan-start"]');
    expect(scanCta).not.toBeNull();
    // Not large text (15px/700), so the floor is 4.5 and not 3.
    expect(scanCta!.large).toBe(false);
    expect(scanCta!.ratio, `/scan CTA ratio was ${scanCta!.ratio}`).toBeGreaterThanOrEqual(4.5);

    await page.goto("/survey");
    const submit = page.getByRole("button", { name: "내 스킨케어 결과 보기" });
    await expect(submit).toBeVisible();
    await expect(submit).toBeEnabled();
    const surveyCta = await page.evaluate(
      ([src]) => {
        const el = Array.from(document.querySelectorAll("button")).find((b) => /결과 보기/.test(b.textContent ?? ""));
          return el ? (eval(src as string) as (e: Element) => { ratio: number; large: boolean })(el) : null;
      },
      [CONTRAST] as const,
    );
    expect(surveyCta).not.toBeNull();
    expect(surveyCta!.large).toBe(false);
    expect(surveyCta!.ratio, `/survey CTA ratio was ${surveyCta!.ratio}`).toBeGreaterThanOrEqual(4.5);
  });

  test("the step numerals on / clear the large-text floor", async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem("aru.lang", "ko"); } catch {} });
    await page.goto("/");
    // The three HowCard ordinals: 26px, so large scale, so the floor is 3 — and the
    // assertion reads `large` back rather than assuming it, because a font-size change
    // below 24px would move the floor to 4.5 and this spec must notice.
    const found = await page.evaluate(
      ([src]) => {
          const measure = eval(src as string) as (e: Element) => { ratio: number; px: number; large: boolean };
        return Array.from(document.querySelectorAll("span"))
          .filter((s) => /^[123]$/.test((s.textContent ?? "").trim()) && parseFloat(getComputedStyle(s).fontSize) >= 24)
          .map(measure);
      },
      [CONTRAST] as const,
    );
    expect(found.length).toBe(3);
    for (const m of found) {
      expect(m.large).toBe(true);
      expect(m.ratio, `step numeral ratio was ${m.ratio}`).toBeGreaterThanOrEqual(3);
    }
  });

  test("the merchant out-link on /report picks clears WCAG AA contrast", async ({ page }) => {
    await page.addInitScript(
      ([survey, reads]) => {
        try {
          localStorage.setItem("aru.lang", "ko");
          sessionStorage.setItem("gyeol_survey", survey as string);
          sessionStorage.setItem("gyeol_reads", reads as string);
        } catch {}
      },
      [
        '{"type":"지성","concerns":["모공"],"budget":30000,"avoid":[],"category":"토너"}',
        JSON.stringify({
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
        }),
      ] as const,
    );
    await page.goto("/report");
    const tabs = page.locator('[role="tab"]');
    await expect(tabs).toHaveCount(3);
    await tabs.nth(1).click();
    // This is the only link on the path that earns money, so its label being legible is
    // not a cosmetic property.
    const buy = page.locator("a").filter({ hasText: "제품 보기" }).first();
    await expect(buy).toBeVisible();
    const m = await page.evaluate(
      ([src]) => {
        const el = Array.from(document.querySelectorAll("a")).find((a) => /제품 보기/.test(a.textContent ?? ""));
          return el ? (eval(src as string) as (e: Element) => { ratio: number; large: boolean })(el) : null;
      },
      [CONTRAST] as const,
    );
    expect(m).not.toBeNull();
    expect(m!.large).toBe(false);
    expect(m!.ratio, `buy-link ratio was ${m!.ratio}`).toBeGreaterThanOrEqual(4.5);
  });

  test("the /survey re-scan link is a 44px target, and stays reachable by keyboard", async ({ page }) => {
    await page.addInitScript(
      ([scan]) => {
        try {
          localStorage.setItem("aru.lang", "ko");
          sessionStorage.setItem("gyeol_scan", scan as string);
        } catch {}
      },
      [SCAN] as const,
    );
    await page.goto("/survey");
    const link = page.locator('a[href="/scan"]').filter({ hasText: "다시 살펴보기" });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    // `--tap-min`, read from the page rather than hard-coded, so moving the token moves
    // this assertion with it instead of leaving a stale 44 behind.
    const tapMin = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tap-min")));
    expect(tapMin).toBeGreaterThan(0);
    expect(box!.height, `re-scan link height was ${box!.height} against --tap-min ${tapMin}`).toBeGreaterThanOrEqual(tapMin);
    // A taller hit area must not have cost the underline or the focus ring.
    expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain("underline");
    await link.focus();
    const ring = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle, shadow: s.boxShadow };
    });
    expect(ring.style !== "none" || ring.shadow !== "none").toBe(true);
  });

  test("every interactive control on /survey and /care has an accessible name", async ({ page }) => {
    await page.addInitScript(
      ([scan, survey]) => {
        try {
          localStorage.setItem("aru.lang", "ko");
          sessionStorage.setItem("gyeol_scan", scan as string);
          sessionStorage.setItem("gyeol_survey", survey as string);
        } catch {}
      },
      [SCAN, '{"type":"지성","concerns":["모공"],"budget":30000,"avoid":[],"category":"토너"}'] as const,
    );
    // The audit's headline result, held on the two screens with the most controls (42 and
    // 13 at 360x800). `getByRole` computes the accessible name the way a screen reader
    // does, so this cannot drift away from what one actually gets; `page.accessibility`
    // was the obvious tool and is not available — @playwright/test 1.61.1 in this repo
    // has no `page.accessibility`, which the first version of this spec proved with
    // `TypeError: Cannot read properties of undefined (reading 'snapshot')`.
    const ROLES = ["button", "link", "checkbox", "radio", "textbox", "combobox", "tab", "switch"] as const;
    for (const path of ["/survey", "/care"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      let total = 0;
      for (const role of ROLES) {
        const all = await page.getByRole(role).count();
        if (all === 0) continue;
        total += all;
        // Anything whose accessible name has a non-space character in it.
        const withName = await page.getByRole(role, { name: /\S/ }).count();
        expect(withName, `${path}: ${all - withName} of ${all} ${role}s have no accessible name`).toBe(all);
      }
      // Guard against a page that rendered nothing and passed vacuously.
      expect(total, `${path} should expose interactive roles`).toBeGreaterThan(5);
    }
  });
});
