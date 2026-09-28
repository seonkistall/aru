import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The contrast MATRIX, built once (cycle 51) instead of a per-screen sweep.
 *
 * Two cycles in a row shipped a text-colour token that clears WCAG 2.2 AA on white and
 * fails on a tinted surface, and each was found by rendering one screen: cycle 50 found
 * `--bronze` and `--plum` on `--surface-tint` #f5f5f5 on `/privacy`, and its supervisor
 * then found `--text-muted` on `--plum-soft` #fbe6e4 on `/report`'s retake card, which
 * the same sweep had walked past because it grepped for the other token. Contrast is a
 * property of a PAIR, so the defence has to be a pair table, not a screen list.
 *
 * This file computes every (text token x background token) ratio from the values in
 * `app/globals.css`, with the WCAG relative-luminance formula
 * (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio), and holds three things:
 *
 *  1. RENDERS - the pairs established to render as text, each asserted against its floor.
 *     Established by rendering, not by reading. A Playwright sweep of `/`, `/survey`,
 *     `/survey` with chips selected, `/care`, `/privacy`, `/studio`, `/checkin` and
 *     `/report`'s three steps, in ko and en, measured 1078 visible leaf text nodes and
 *     produced 17 distinct (colour, background) pairs. 15 of those are token-on-token
 *     and are listed below; the other 2 have a `color-mix()` background, which is not a
 *     token pair and is covered by
 *     `tests/e2e/tinted-surface-contrast.regression-35.spec.ts` instead. The 16th entry
 *     below, `--text-muted` on `--plum-soft`, is the retake card that the same e2e spec
 *     renders and this sweep did not reach.
 *  2. EXEMPT - a pair that renders UNDER its floor and is excused by a named WCAG
 *     exception, with the exception quoted.
 *  3. UNDER_FLOOR - every pair in the matrix below 4.5, as a snapshot. Moving any token
 *     changes this set, so a palette edit cannot quietly create a new failing pair that
 *     nobody looked at. It is a ratchet, not a claim that these pairs are fine.
 *
 * Plus two source guards, because the matrix is only as good as its inputs: every token
 * used as a `color:` or as a background in `app/` must be DEFINED in `app/globals.css`
 * and must be in the list below. The first of those is not hypothetical - it is how
 * cycle 51 found `color: var(--danger)` in `app/components/product-card.tsx` and
 * `app/checkin/page.tsx` with `--danger` defined nowhere, which made the declaration
 * invalid at computed-value time and rendered both save-failure messages in the
 * inherited `--ink` (measured: rgb(26, 26, 26)) rather than in a red.
 *
 * Research-only screens (`/ops`, `/pilot`, `/eval`) are out of scope by the standing
 * rule; their files are not scanned by the source guards.
 */

const CSS = readFileSync("app/globals.css", "utf8");

function tokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of CSS.matchAll(/^\s*(--[a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/gm)) out[m[1]] = m[2].toLowerCase();
  return out;
}

const T = tokens();

// WCAG 2.2 relative luminance and contrast ratio, same definition the e2e specs use.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every token used as a `color:` anywhere in `app/`, and every token used as the value of
// a background property there. Both lists are re-derived from source by the guards below,
// so neither can drift from what the app actually does.
const TEXT_TOKENS = ["--ink", "--ink-soft", "--text-muted", "--muted", "--faint", "--bronze", "--plum", "--plum-press", "--orange", "--success", "--on-plum", "--paper"];
const BACKGROUND_TOKENS = ["--paper", "--surface", "--surface-tint", "--rose", "--peach", "--plum-soft", "--plum", "--ink", "--line"];

/**
 * Tokens that are the background of a CHILDLESS element - a rule, a bar, a dot - so no
 * text can sit on them and SC 1.4.3 does not reach them. Each is self-closing in source:
 *   --bronze  app/components/share-card.tsx:49   `<div style={{ height: 1, width: 34 }} />`
 *   --blue    app/scan/scanning.tsx:10,15        two `height: 2` bars
 *   --success app/scan/page.tsx:467              an 8x8 aria-hidden dot (--muted when off)
 *   --muted   the same dot
 * They are still subject to SC 1.4.11 Non-text Contrast, which this file does not cover;
 * `--blue` #2f6de0 is 4.789395592096463:1 on `--paper` and 4.393009940622331:1 on
 * `--surface-tint`, both over that 3:1, and `--line` #dcdcdc is 1.3713058806238527:1 on
 * `--paper`, which is recorded in docs/AUTOPILOT.md rather than changed here.
 */
const NO_TEXT_BACKGROUNDS = ["--bronze", "--blue", "--success", "--muted"];

/**
 * Pairs established to render as text, with where, and the floor that applies.
 * `large: true` means every node of this pair the sweep saw was at least 24px, so
 * SC 1.4.3's Large Text exception sets the floor at 3 rather than 4.5.
 */
const RENDERS: { fg: string; bg: string; large?: boolean; where: string }[] = [
  { fg: "--ink", bg: "--paper", where: "body copy on every screen" },
  { fg: "--ink", bg: "--surface-tint", where: "/report step tabs, /privacy notice cards" },
  { fg: "--ink-soft", bg: "--paper", where: "secondary copy on every screen" },
  { fg: "--ink-soft", bg: "--surface-tint", where: "product-card highlight chips (app/components/product-card.tsx)" },
  { fg: "--text-muted", bg: "--paper", where: "merchant note, captions" },
  { fg: "--text-muted", bg: "--surface-tint", where: "/privacy notice-card eyebrow (cycle 50)" },
  { fg: "--text-muted", bg: "--plum-soft", where: "/report retake confidence card (cycle 50 supervisor)" },
  { fg: "--muted", bg: "--paper", where: "/ landing subtitle" },
  { fg: "--plum", bg: "--paper", where: "the required-field * on /survey, /studio errors" },
  { fg: "--plum-press", bg: "--paper", where: "the save-failure lines (cycle 51)" },
  { fg: "--plum-press", bg: "--surface-tint", where: "/privacy dangerBtn (cycle 50)" },
  { fg: "--plum-press", bg: "--plum-soft", where: "selected survey and checkin chips" },
  { fg: "--success", bg: "--paper", where: "the saved product-use button label" },
  { fg: "--on-plum", bg: "--plum", where: "the buy button and the rank badge" },
  { fg: "--paper", bg: "--ink", where: "the /report next-step button" },
  { fg: "--orange", bg: "--paper", large: true, where: "the / step numerals (26px) and the aria-hidden arrows (24-27px)" },
];

/**
 * Renders under its floor, and exempt. Quoted from the W3C source fetched in cycle 51
 * (raw.githubusercontent.com/w3c/wcag/main/guidelines/sc/20/contrast-minimum.html,
 * HTTP 200, 1071 bytes, sha256
 * f1d819b44cc5ba64e962ce64889de2ab214af6911b27a119f7d24c43197b2e64):
 *
 *   "Incidental - Text or images of text that are part of an inactive user interface
 *    component, that are pure decoration, that are not visible to anyone, or that are
 *    part of a picture that contains significant other visual content, have no contrast
 *    requirement."
 *
 * `/survey`'s submit is `button.disabled === true` until the three required fields are
 * answered; rendered at 360x800 it is rgb(118, 118, 118) on rgb(245, 245, 245), which is
 * an inactive user interface component by that sentence. `/checkin`'s equivalent submit
 * was NOT reached in a disabled state by that render (its card needs a product-use
 * record first), so it is carried here on the code alone and is marked as such.
 */
const EXEMPT: { fg: string; bg: string; why: string }[] = [
  { fg: "--muted", bg: "--surface-tint", why: "the disabled submit on /survey (rendered) and on /checkin (code only): SC 1.4.3 Incidental, inactive user interface component" },
];

// Every pair in the matrix under 4.5, as a snapshot. Regenerate deliberately, never to
// make the test pass.
const UNDER_FLOOR = [
  "--bronze on --ink",
  "--bronze on --line",
  "--bronze on --plum",
  "--faint on --ink",
  "--faint on --line",
  "--faint on --peach",
  "--faint on --plum",
  "--faint on --plum-soft",
  "--faint on --rose",
  "--faint on --surface-tint",
  "--ink on --plum",
  "--ink-soft on --ink",
  "--ink-soft on --plum",
  "--muted on --ink",
  "--muted on --line",
  "--muted on --peach",
  "--muted on --plum",
  "--muted on --plum-soft",
  "--muted on --rose",
  "--muted on --surface-tint",
  "--on-plum on --line",
  "--on-plum on --peach",
  "--on-plum on --plum-soft",
  "--on-plum on --rose",
  "--on-plum on --surface-tint",
  "--orange on --line",
  "--orange on --paper",
  "--orange on --peach",
  "--orange on --plum",
  "--orange on --plum-soft",
  "--orange on --rose",
  "--orange on --surface",
  "--orange on --surface-tint",
  "--paper on --line",
  "--paper on --peach",
  "--paper on --plum-soft",
  "--paper on --rose",
  "--paper on --surface-tint",
  "--plum on --ink",
  "--plum on --line",
  "--plum on --peach",
  "--plum on --plum-soft",
  "--plum on --rose",
  "--plum on --surface-tint",
  "--plum-press on --ink",
  "--plum-press on --line",
  "--plum-press on --plum",
  "--success on --ink",
  "--success on --line",
  "--success on --plum",
  "--text-muted on --ink",
  "--text-muted on --line",
  "--text-muted on --plum",
];

const APP_FILES: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // Research-only screens are reported, not defended.
      if (name === "ops" || name === "pilot" || name === "eval") continue;
      walk(full);
    } else if (/\.(tsx|ts|css)$/.test(name)) APP_FILES.push(full);
  }
})("app");

function used(pattern: RegExp): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of APP_FILES) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(pattern)) {
      for (const v of (m[0].match(/--[a-z-]+/g) ?? [])) if (!found.has(v)) found.set(v, file);
    }
  }
  return found;
}

describe("the app/globals.css contrast matrix", () => {
  it("parses every colour token it needs out of app/globals.css", () => {
    for (const token of [...TEXT_TOKENS, ...BACKGROUND_TOKENS]) {
      expect(T[token], `${token} is not defined in app/globals.css`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("every pair established to render as text clears its floor", () => {
    const failing = RENDERS.filter((p) => contrast(T[p.fg], T[p.bg]) < (p.large ? 3 : 4.5)).map(
      (p) => `${p.fg} ${T[p.fg]} on ${p.bg} ${T[p.bg]} = ${contrast(T[p.fg], T[p.bg])} (floor ${p.large ? 3 : 4.5}) - ${p.where}`,
    );
    expect(failing, "token pairs that render as text and are under their WCAG AA floor").toEqual([]);
  });

  it("no pair is both claimed to render cleanly and claimed to be exempt", () => {
    const rendering = new Set(RENDERS.map((p) => `${p.fg} on ${p.bg}`));
    for (const e of EXEMPT) expect(rendering.has(`${e.fg} on ${e.bg}`), `${e.fg} on ${e.bg} is in both lists`).toBe(false);
  });

  it("the set of pairs under 4.5 is exactly the recorded one", () => {
    const now: string[] = [];
    for (const fg of TEXT_TOKENS) {
      for (const bg of BACKGROUND_TOKENS) {
        if (T[fg] === T[bg]) continue;
        if (contrast(T[fg], T[bg]) < 4.5) now.push(`${fg} on ${bg}`);
      }
    }
    expect(now.sort()).toEqual([...UNDER_FLOOR].sort());
  });

  it("every token used as a colour in app/ is defined in app/globals.css and listed here", () => {
    const colours = used(/(?:^|[^-a-zA-Z])color: *[^;,}]*/gm);
    for (const [token, file] of colours) {
      expect(T[token], `${token} is used as a colour in ${file} but is not defined in app/globals.css`).toBeDefined();
      expect(TEXT_TOKENS, `${token} (${file}) is not in TEXT_TOKENS, so the matrix never checks it`).toContain(token);
    }
  });

  it("every token used as a background in app/ is defined in app/globals.css and listed here", () => {
    const backgrounds = used(/background(?:Color)?: *[^;,}]*/gm);
    for (const [token, file] of backgrounds) {
      if (token === "--tap-min" || token.startsWith("--font")) continue;
      expect(T[token], `${token} is used as a background in ${file} but is not defined in app/globals.css`).toBeDefined();
      expect(
        [...BACKGROUND_TOKENS, ...NO_TEXT_BACKGROUNDS],
        `${token} (${file}) is in neither BACKGROUND_TOKENS nor NO_TEXT_BACKGROUNDS, so the matrix never checks it`,
      ).toContain(token);
    }
  });
});
