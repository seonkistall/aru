import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SKIN_LABELS, confidenceLabel, headlineFor, narrativeFor, overallFor, type Bucket, type SkinLevel } from "@/lib/skin";
import { SKUS } from "@/lib/skus";

/**
 * Regression: Korean leaking into a non-Korean screen, checked by RENDERING every
 * user-facing screen and state rather than by reading source.
 *
 * Why rendering. `tests/i18n-coverage.test.ts` scans `t("…")` LITERALS, so a string
 * that is composed at runtime is invisible to it. Cycle 43 found `노출 여유 확인` on
 * `/report`'s first screen in en/ja/zh/ar for exactly that reason: `signalCheck`
 * (`lib/report-trust.ts`) builds `${signal.label} 확인` and the page passes the result
 * to `t()`. That class of defect only shows up on a laid-out page, and nothing had
 * swept the pages for it since.
 *
 * What this spec does. For each of `en`, `ja`, `zh`, `ar` at 360x800 it visits every
 * state below, collects every VISIBLE text node and every `aria-label` / `alt` /
 * `title` / `placeholder` containing Hangul (U+AC00–U+D7A3, U+1100–U+11FF,
 * U+3130–U+318F), and fails on anything not in ALLOWED below. `<details>` are forced
 * open before collecting, because their shut content is `display: none` and would
 * otherwise escape the sweep.
 *
 * FIXTURES ARE DERIVED, NOT TYPED OUT. Every reading is built from the shipped
 * producers — `SKIN_LABELS`, `headlineFor`, `narrativeFor`, `overallFor`,
 * `confidenceLabel` are imported, and `buildSignals`' four labels with their nine
 * details, the burst retake line and the two extra reads' label/value/note triples are
 * read out of `lib/skin.ts` at test time (the same trick
 * `tests/report-trust-chip-keys.test.ts` uses). Product names come from `SKUS`. A hand
 * written fixture is how a sweep reports a leak that the product cannot produce: the
 * first pass of this sweep did exactly that, and every one of its 192 hits was an
 * invented string. So a new signal detail, a new bucket label or a renamed SKU is
 * swept here without anyone remembering this file, and nothing is swept that the
 * product cannot show.
 *
 * COVERAGE OF THE READING STATES, stated as what it is: the six `/report` step-0
 * readings put all NINE `SKIN_LABELS` values on screen and take all FIVE `headlineFor`
 * branches and all three `overallFor` values; signals, extras and confidence rotate
 * across them so all four signals appear in both states, `조명`'s third detail
 * (`빛이 강해요`) appears, all three `톤 균일감` and all three `T존 반사광` variants
 * appear, and `retakeReasons` renders both the signal details and the burst line.
 *
 * NOT REACHABLE HERE, and so not swept: `/scan`'s own result card
 * (`app/scan/result-card.tsx`). `phase === "result"` follows a real capture and the
 * canvas `captureStream()` shim cannot produce a face — seeding `gyeol_reads` puts
 * `/scan` back on its intro screen, measured (28 text nodes, 466 characters, the same
 * as a cold `/scan`). Its strings are the same ones `/report` renders through
 * `ConfidenceBridge` and `analysisRows`, plus the full `retakeReasons` list where
 * `/report` shows the first three. Also not swept: the LLM `narrative`, which is
 * returned only under `ko` (`localizedNarrative`, `lib/skin.ts`) and filtered by
 * `efficacyClean()` server-side, and `/ops`, `/eval` and `/pilot`, which are
 * research-mode screens and Korean by design.
 */

const LOCALES = ["en", "ja", "zh", "ar"] as const;
const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;

/**
 * Hangul a non-Korean reader is ALLOWED to see. One entry, and it is the language
 * switcher's own name for Korean. Everything else ARU renders on a consumer screen is
 * meant to be translated, product names and brands included — the catalogue's Korean
 * names are dictionary keys and `lib/i18n/<lang>.ts` carries a romanised or translated
 * form for each. An entry added here needs a recorded decision named on its own line,
 * not a judgement call made while fixing a red run.
 */
const ALLOWED: Array<{ text: string; why: string }> = [
  {
    text: "한국어",
    // The decision is recorded in the dictionaries themselves: `"한국어": "한국어"` is
    // the value in ALL FOUR of lib/i18n/{en,ja,zh,ar}.ts — the only Hangul-bearing
    // value any of them carries (914 values each, 3 Hangul syllables each, all in this
    // one string). A language picker naming a language in that language is the endonym
    // convention every other row of this list follows (English / 日本語 / 中文 /
    // العربية), so translating it would make Korean the one row that does not.
    why: "the language switcher's endonym for Korean; same value in all four dictionaries",
  },
];

// --- fixtures derived from the shipped producers ------------------------------------
const skin = readFileSync(resolve(__dirname, "../../lib/skin.ts"), "utf8");

const signalBlock = skin.slice(skin.indexOf("function buildSignals("), skin.indexOf("satisfies ConfidenceSignal[]"));
const SIGNAL_LABELS = [...signalBlock.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
// `detail:` is a ternary per signal, so the details appear in source order per label:
// 조명 carries three (dark / blown / ok) and the other three carry two each.
const DETAILS_PER_LABEL: Record<string, string[]> = {};
{
  for (const [i, label] of SIGNAL_LABELS.entries()) {
    const next = i + 1 < SIGNAL_LABELS.length ? signalBlock.indexOf(`label: "${SIGNAL_LABELS[i + 1]}"`) : signalBlock.length;
    const own = signalBlock.slice(signalBlock.indexOf(`label: "${label}"`), next);
    DETAILS_PER_LABEL[label] = [...own.matchAll(/"([^"]*[가-힣][^"]*)"/g)].map((m) => m[1]).filter((s) => !SIGNAL_LABELS.includes(s));
  }
}
const BURST_REASON = /retakeReasons\.push\("([^"]+)"\)/.exec(skin)![1];

const extrasBlock = skin.slice(skin.indexOf("const toneEven: SkinExtraRead"), skin.indexOf("const overall = overallFor("));
const toneSrc = extrasBlock.slice(0, extrasBlock.indexOf("const gloss"));
const glossSrc = extrasBlock.slice(extrasBlock.indexOf("const gloss"));
const uniq = (src: string, key: "label" | "value" | "note") =>
  [...new Set([...src.matchAll(new RegExp(`${key}: (?:[^"\\n]*\\? )?"([^"]+)"`, "g"))].map((m) => m[1]))];
const TONE_LABEL = uniq(toneSrc, "label")[0];
const GLOSS_LABEL = uniq(glossSrc, "label")[0];
const TONE_VALUES = uniq(toneSrc, "value");
const TONE_NOTES = uniq(toneSrc, "note");
const GLOSS_VALUES = uniq(glossSrc, "value");
const GLOSS_NOTES = uniq(glossSrc, "note");

const bucket = (attr: "oil" | "redness" | "pores", level: SkinLevel): Bucket => ({ value: SKIN_LABELS[attr][level], level, calm: level === 0 });
const signalSet = (state: "ok" | "fail" | "bright") =>
  SIGNAL_LABELS.map((label, i) => {
    const details = DETAILS_PER_LABEL[label];
    // Per signal the ternary lists the FAILING detail first and the passing one last.
    if (state === "ok") return { label, ok: true, detail: details[details.length - 1] };
    if (state === "bright" && i === 0) return { label, ok: false, detail: details[1] };
    return { label, ok: false, detail: details[0] };
  });
const extrasSet = (i: number) => [
  { label: TONE_LABEL, value: TONE_VALUES[i % TONE_VALUES.length], calm: i % 2 === 0, note: TONE_NOTES[i % TONE_NOTES.length] },
  { label: GLOSS_LABEL, value: GLOSS_VALUES[i % GLOSS_VALUES.length], calm: i % 2 === 1, note: GLOSS_NOTES[i % GLOSS_NOTES.length] },
];

type ReadsFixture = ReturnType<typeof readsFor>;
function readsFor(oil: SkinLevel, redness: SkinLevel, pores: SkinLevel, i: number) {
  const o = bucket("oil", oil);
  const r = bucket("redness", redness);
  const p = bucket("pores", pores);
  // Three confidences so all three `confidenceLabel` values and both `overallFor`
  // non-retake branches are reached, and the `< 0.58` branch (재촬영 권장) too.
  const confidence = [0.41, 0.72, 0.91][i % 3];
  const signalState = (["fail", "ok", "bright"] as const)[i % 3];
  const signals = signalSet(signalState);
  const retakeReasons = signalState === "ok" ? [BURST_REASON] : [...signals.filter((s) => !s.ok).map((s) => s.detail), BURST_REASON];
  return {
    oil: o,
    pores: p,
    redness: r,
    overall: overallFor(o, r, p, confidence),
    headline: headlineFor(o, r, p),
    narrative: narrativeFor(o, r, p),
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    retakeRecommended: signalState !== "ok",
    retakeReasons,
    signals,
    source: (["vision-api", "roi-calibrated", "ml-model"] as const)[i % 3],
    raw: {},
    extras: extrasSet(i),
  };
}
// All nine SKIN_LABELS values and all five headlineFor branches:
//   (2,2,2) redness>=2 · (2,0,1) oil>=2 && pores>=1 · (2,0,0) oil>=2
//   (0,0,2) pores>=2   · (0,0,0) and (1,1,1) the settled branch
const READS: ReadsFixture[] = [
  readsFor(2, 2, 2, 0),
  readsFor(2, 0, 1, 1),
  readsFor(2, 0, 0, 2),
  readsFor(0, 0, 2, 0),
  readsFor(1, 1, 1, 1),
  readsFor(0, 0, 0, 2),
];
const scanFor = (reads: ReadsFixture) => ({
  oil: reads.oil.level,
  redness: reads.redness.level,
  pores: reads.pores.level,
  confidence: reads.confidence,
  retakeRecommended: reads.retakeRecommended,
  source: reads.source,
});

const SURVEY_PLAIN = { type: "지성", concerns: ["모공"], budget: 39000, avoid: [], category: "토너" };
const SURVEY_NOTE = { type: "민감성", concerns: ["붉은기", "건조"], budget: 19000, avoid: ["향료", "알코올", "에센셜오일", "파라벤", "실리콘", "인공색소", "광물성오일"], category: "크림" };
const SURVEY_MANY = { type: "복합성", concerns: ["모공", "블랙헤드", "붉은기", "건조", "유분"], budget: 999999, avoid: ["향료", "알코올"], category: "세럼" };
const SURVEY_DRY = { type: "건성", concerns: ["각질", "탄력", "민감"], budget: 29000, avoid: ["광물성오일"], category: "클렌저" };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Real catalogue entries, so `/checkin`'s `t(productUse.name)` and `ProductVisual`'s
// composed aria-label are exercised on names the product can actually store.
const sku = (id: string) => SKUS.find((s) => s.id === id)!;
const productUse = (weeks: number, id: string) => ({ id: `use-${id}`, sku_id: id, name: sku(id).name, confirmedUse: true, ts: Date.now() - weeks * WEEK_MS });
const USES_DUE2 = [productUse(2.5, "cr3")];
const USES_DUE4 = [productUse(4.5, "tn2")];
const USES_NOTDUE = [productUse(0.5, "sr1")];
const USES_MIX = [...USES_DUE2, ...USES_DUE4, ...USES_NOTDUE];
const CHECKINS_DONE = [{ id: "c2", sku_id: "cr3", week: 2, sat: 3, trouble: false, repurchase: true, ts: Date.now() }];

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
  const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(10);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => stream } });
};

const COLLECT = `(() => {
  const H = /[\\uAC00-\\uD7A3\\u1100-\\u11FF\\u3130-\\u318F]/;
  const visible = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
      n = n.parentElement;
    }
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return !r || r.width > 0 || r.height > 0;
  };
  const pathOf = (el) => {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 6) {
      let p = n.tagName.toLowerCase();
      if (n.getAttribute && n.getAttribute("data-testid")) p += "[" + n.getAttribute("data-testid") + "]";
      parts.unshift(p);
      n = n.parentElement;
    }
    return parts.join(">");
  };
  let opened = 0;
  for (let pass = 0; pass < 4; pass += 1) {
    const shut = Array.from(document.querySelectorAll("details:not([open])"));
    if (!shut.length) break;
    for (const d of shut) { d.setAttribute("open", ""); opened += 1; }
  }
  const hits = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = (node.nodeValue || "").trim();
    if (!text || !H.test(text)) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const tag = parent.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript" || tag === "title") continue;
    if (!visible(parent)) continue;
    hits.push({ kind: "text", tag, path: pathOf(parent), text });
  }
  for (const attr of ["aria-label", "alt", "title", "placeholder"]) {
    for (const el of Array.from(document.querySelectorAll("[" + attr + "]"))) {
      const v = el.getAttribute(attr) || "";
      if (!H.test(v)) continue;
      if (!visible(el)) continue;
      hits.push({ kind: attr, tag: el.tagName.toLowerCase(), path: pathOf(el), text: v });
    }
  }
  const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter(visible).length;
  let nodes = 0;
  const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w2.nextNode()) if ((w2.currentNode.nodeValue || "").trim()) nodes += 1;
  return {
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    hits,
    opened,
    nodes,
    chars: (document.body.innerText || "").replace(/\\s+/g, "").length,
  };
})()`;

type Hit = { kind: string; tag: string; path: string; text: string };
type Collected = { lang: string; dir: string; hits: Hit[]; opened: number; nodes: number; chars: number };
type State = {
  name: string;
  path: string;
  store?: Array<[string, string, unknown]>;
  drive?: (p: import("@playwright/test").Page) => Promise<void>;
  /** The floor a render has to clear for the sweep to have looked at anything. */
  minNodes: number;
};

const tab = (index: number) => async (p: import("@playwright/test").Page) => {
  await p.getByRole("tab").nth(index).click({ timeout: 10_000 });
  await p.waitForTimeout(600);
};
const reportStore = (reads: ReadsFixture, survey: unknown): Array<[string, string, unknown]> => [
  ["session", "gyeol_reads", reads],
  ["session", "gyeol_scan", scanFor(reads)],
  ["session", "gyeol_survey", survey],
];

const STATES: State[] = [
  { name: "/", path: "/", minNodes: 30 },
  { name: "/scan intro", path: "/scan", minNodes: 20 },
  {
    name: "/scan ready",
    path: "/scan",
    minNodes: 30,
    drive: async (p) => {
      await p.getByTestId("scan-start").click({ timeout: 10_000 });
      await p.locator("main [data-quality-checklist]").waitFor({ state: "visible", timeout: 30_000 });
      const boxes = p.locator('main input[type="checkbox"]');
      for (let i = 0; i < (await boxes.count()); i += 1) await boxes.nth(i).check({ timeout: 5000 });
      await p.waitForTimeout(1200);
    },
  },
  { name: "/survey empty", path: "/survey", minNodes: 50 },
  {
    name: "/survey chips selected",
    path: "/survey",
    minNodes: 50,
    drive: async (p) => {
      const sections = p.locator("section");
      for (let i = 0; i < (await sections.count()); i += 1) {
        const chip = sections.nth(i).locator("button").first();
        if (await chip.count()) await chip.click({ timeout: 5000 });
      }
      await p.waitForTimeout(300);
    },
  },
  { name: "/survey with scan hint", path: "/survey", store: [["session", "gyeol_reads", READS[0]], ["session", "gyeol_scan", scanFor(READS[0])]], minNodes: 50 },
];
// `/report` step 0 over the six readings: this is where the reading itself renders.
for (const [i, reads] of READS.entries()) {
  STATES.push({ name: `/report reads${i} step0`, path: "/report", store: reportStore(reads, SURVEY_PLAIN), minNodes: 40 });
}
// Steps 1 and 2 over the survey shapes that change what they render: the budget note,
// the avoid list, the relaxed note and the routine's hero products.
for (const [tag, survey, reads] of [
  ["plain", SURVEY_PLAIN, READS[0]],
  ["note+avoid", SURVEY_NOTE, READS[1]],
  ["many", SURVEY_MANY, READS[3]],
  ["dry", SURVEY_DRY, READS[4]],
] as const) {
  STATES.push(
    { name: `/report ${tag} step1`, path: "/report", store: reportStore(reads, survey), drive: tab(1), minNodes: 60 },
    { name: `/report ${tag} step2`, path: "/report", store: reportStore(reads, survey), drive: tab(2), minNodes: 50 },
  );
}
for (const step of [0, 1, 2]) {
  STATES.push({
    name: `/report survey-only step${step}`,
    path: "/report",
    store: [["session", "gyeol_survey", SURVEY_PLAIN]],
    drive: step > 0 ? tab(step) : undefined,
    minNodes: 30,
  });
}
STATES.push(
  { name: "/care plain", path: "/care", store: [["session", "gyeol_survey", SURVEY_PLAIN], ["session", "gyeol_reads", READS[0]], ["session", "gyeol_scan", scanFor(READS[0])]], minNodes: 40 },
  { name: "/care note+avoid", path: "/care", store: [["session", "gyeol_survey", SURVEY_NOTE]], minNodes: 30 },
  { name: "/care many", path: "/care", store: [["session", "gyeol_survey", SURVEY_MANY]], minNodes: 40 },
  {
    name: "/care merchants expanded",
    path: "/care",
    store: [["session", "gyeol_survey", SURVEY_PLAIN]],
    minNodes: 60,
    drive: async (p) => {
      const toggles = p.locator("button[aria-controls]");
      for (let i = 0; i < (await toggles.count()); i += 1) await toggles.nth(i).click({ timeout: 5000 });
      await p.waitForTimeout(400);
    },
  },
  { name: "/care no survey", path: "/care", minNodes: 10 },
  { name: "/checkin due 2주", path: "/checkin", store: [["local", "gyeol_purchases", USES_DUE2]], minNodes: 20 },
  { name: "/checkin due 4주", path: "/checkin", store: [["local", "gyeol_purchases", USES_DUE4]], minNodes: 20 },
  { name: "/checkin not yet due", path: "/checkin", store: [["local", "gyeol_purchases", USES_NOTDUE]], minNodes: 15 },
  { name: "/checkin already answered", path: "/checkin", store: [["local", "gyeol_purchases", USES_DUE2], ["local", "gyeol_checkins", CHECKINS_DONE]], minNodes: 15 },
  { name: "/checkin empty", path: "/checkin", minNodes: 10 },
  {
    // The save path, and the 사용 중 / 2주차 / 4주차 badges in one render. Only the
    // pills inside `main` are clicked: the language switcher is a button too, and
    // clicking it switches the locale out from under the sweep.
    name: "/checkin answered here",
    path: "/checkin",
    store: [["local", "gyeol_purchases", USES_MIX]],
    // 37 in every locale after both forms are saved — the pill rows are replaced by
    // the saved-feedback line, so this render is SHORTER than the unanswered one.
    minNodes: 30,
    drive: async (p) => {
      const pills = p.locator("main button[aria-pressed]");
      for (let i = 0; i < (await pills.count()); i += 1) await pills.nth(i).click({ timeout: 5000 });
      await p.waitForTimeout(300);
      const saves = p.locator("main button:not([aria-pressed]):not([aria-controls])");
      for (let i = 0; i < (await saves.count()); i += 1) {
        if (await saves.nth(i).isEnabled()) await saves.nth(i).click({ timeout: 5000 });
      }
      await p.waitForTimeout(500);
    },
  },
  {
    // The share and download buttons are deliberately not clicked: `download` starts a
    // browser download and `share` a canvas render, and neither is a text state.
    name: "/studio presets + toggles",
    path: "/studio",
    minNodes: 25,
    drive: async (p) => {
      const presets = p.locator("main button:not([aria-pressed])");
      for (let i = 0; i < Math.min(await presets.count(), 4); i += 1) await presets.nth(i).click({ timeout: 5000 });
      const toggles = p.locator("main button[aria-pressed]");
      for (let i = 0; i < (await toggles.count()); i += 1) await toggles.nth(i).click({ timeout: 5000 });
      await p.waitForTimeout(400);
    },
  },
  { name: "/studio from scan", path: "/studio", store: [["session", "gyeol_reads", READS[0]], ["session", "gyeol_scan", scanFor(READS[0])]], minNodes: 25 },
  { name: "/privacy", path: "/privacy", store: [["local", "gyeol_purchases", USES_MIX], ["local", "gyeol_checkins", CHECKINS_DONE], ["session", "gyeol_reads", READS[0]], ["session", "gyeol_survey", SURVEY_PLAIN]], minNodes: 40 },
  { name: "/unsubscribe no token", path: "/unsubscribe", minNodes: 12 },
  { name: "/unsubscribe with token", path: "/unsubscribe?token=sweep-not-a-real-token", minNodes: 12 },
  { name: "/guide/toner-for-oily-skin", path: "/guide/toner-for-oily-skin", minNodes: 50 },
  { name: "/guide/serum-for-combination-skin", path: "/guide/serum-for-combination-skin", minNodes: 50 },
  { name: "not-found", path: "/definitely-not-a-page", minNodes: 8 },
  {
    // The language switcher collapsed shows only the ACTIVE locale's label, so its
    // Korean row is invisible on every state above. Opened, it is the one place a
    // non-Korean reader sees Hangul on purpose — which is why ALLOWED has an entry and
    // why this state exists to exercise it rather than leaving the entry untested.
    name: "language switcher open",
    path: "/",
    minNodes: 30,
    drive: async (p) => {
      await p.locator('button[aria-label="Language"]').click({ timeout: 10_000 });
      await p.locator('[role="listbox"]').waitFor({ state: "visible", timeout: 10_000 });
      await p.waitForTimeout(300);
    },
  },
);

for (const locale of LOCALES) {
  test(`no Korean leaks into any ${locale} screen`, async ({ browser }) => {
    test.setTimeout(20 * 60_000);
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.addInitScript((l) => { try { localStorage.setItem("aru.lang", l as string); } catch {} }, locale);
    await context.addInitScript(FAKE_CAMERA);
    const page = await context.newPage();
    await page.goto("/");

    // An allowlist entry that carries no Hangul cannot be absorbing a hit, so it is
    // either dead or a widening of the check by accident.
    for (const entry of ALLOWED) {
      expect(entry.text, `allowlist entry ${JSON.stringify(entry.text)} has no Hangul in it`).toMatch(HANGUL);
      expect(entry.why.length, `allowlist entry ${JSON.stringify(entry.text)} has no reason recorded`).toBeGreaterThan(20);
    }

    const leaks: string[] = [];
    let renders = 0;
    for (const state of STATES) {
      // Storage is same-origin, so one page serves every state.
      await page.evaluate(
        (entries) => {
          for (const key of Object.keys(localStorage)) if (key !== "aru.lang") localStorage.removeItem(key);
          sessionStorage.clear();
          for (const [store, key, value] of entries as Array<[string, string, unknown]>) {
            (store === "local" ? localStorage : sessionStorage).setItem(key, JSON.stringify(value));
          }
        },
        state.store ?? [],
      );
      await page.goto(state.path, { timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      await page.waitForFunction(() => document.fonts.status === "loaded", undefined, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(300);
      if (state.drive) await state.drive(page);

      const out = (await page.evaluate(([src]) => eval(src as string), [COLLECT] as const)) as Collected;
      renders += 1;
      // The locale has to still be the one under test — a drive step that taps the
      // language switcher would otherwise turn the whole page Korean and the sweep
      // would call it a product defect.
      expect(out.lang, `${state.name}: the page is no longer in ${locale}`).toBe(locale === "zh" ? "zh-CN" : locale);
      expect(out.dir).toBe(locale === "ar" ? "rtl" : "ltr");
      // Assert the state actually RENDERED. A route that answered with a skeleton or
      // an empty <main> has no Hangul in it and would pass the leak check for free.
      expect(out.nodes, `${state.name}: only ${out.nodes} non-empty text nodes rendered`).toBeGreaterThanOrEqual(state.minNodes);

      for (const hit of out.hits) {
        if (ALLOWED.some((a) => a.text === hit.text)) continue;
        leaks.push(`${locale} ${state.name}: [${hit.kind}] <${hit.tag}> ${hit.path} :: ${hit.text}`);
      }
      console.log(`[hangul] ${locale} | ${state.name} | nodes=${out.nodes} chars=${out.chars} detailsOpened=${out.opened} hangulHits=${out.hits.length}`);
    }
    console.log(`[hangul] ${locale}: ${renders} renders, ${leaks.length} leaks`);
    expect(renders, "every state should have been rendered").toBe(STATES.length);
    expect(leaks, `Korean rendered to a ${locale} reader:\n${leaks.join("\n")}`).toEqual([]);
    await context.close();
  });
}
