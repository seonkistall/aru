import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SkinReads } from "@/lib/skin";

/**
 * /scan never told a screen-reader user how a scan ended. The countdown and the "얼굴
 * 인식됨" line are live regions, but both are rendered only while the camera is in its
 * "ready" phase, so they left the page the moment the photo was taken. No live region
 * carried the outcome: the analysing overlay has none, the result block's one status
 * line holds the share hint and mounts with that screen, and the noface / denied /
 * interrupted / unsupported screens each replace the button the user was on with a
 * plain paragraph. A screen-reader user could not tell that the photo was
 * taken, what it found, or that it had failed. A live region that mounts together with
 * its own screen is not announced either, so the region has to be on the page from the
 * first render and only its text may change.
 *
 * The second half: the result card's 설문으로 이어가기 was a plain <a href="/survey">, a
 * full page load. In a browser that refuses site storage, lib/session-store.ts keeps the
 * reading in a module-level Map, and a full load empties it, so the reading never
 * reached /survey or /report. An app-router <Link> keeps the JS context alive.
 *
 * The render half forces the page into each phase by wrapping React's useState for the
 * three initial values only page.tsx uses ("init", "permission", "backgrounded") and the
 * useState right after them (the reading). It runs no effect, so it shows what each
 * phase renders, not the transition; the transition is what the always-mounted region
 * in the source contract below is for.
 *
 * Found by the cycle 117 bug hunt.
 */

const forced = vi.hoisted(() => ({
  phase: null as string | null,
  deniedReason: null as string | null,
  interruptReason: null as string | null,
  reads: null as unknown,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  let readsIsNext = false;
  const useState = ((initial: unknown) => {
    const pair = actual.useState(initial);
    const wasReadsNext = readsIsNext;
    readsIsNext = initial === "backgrounded";
    if (initial === "init" && forced.phase) return [forced.phase, pair[1]];
    if (initial === "permission" && forced.deniedReason) return [forced.deniedReason, pair[1]];
    if (initial === "backgrounded" && forced.interruptReason) return [forced.interruptReason, pair[1]];
    if (wasReadsNext && initial === null && forced.reads) return [forced.reads, pair[1]];
    return pair;
  }) as typeof actual.useState;
  return { ...actual, default: { ...actual, useState }, useState };
});

afterEach(() => {
  forced.phase = null;
  forced.deniedReason = null;
  forced.interruptReason = null;
  forced.reads = null;
});

const READS: SkinReads = {
  oil: { value: "유분 많음", level: 2, calm: false },
  pores: { value: "결 보통", level: 0, calm: true },
  redness: { value: "붉은기 낮음", level: 0, calm: true },
  overall: { value: "대체로 안정", level: 0, calm: true },
  headline: "T존 유분이 도드라져 보여요",
  narrative: "",
  confidence: 0.9,
  confidenceLabel: "높음",
  retakeRecommended: false,
  retakeReasons: [],
  signals: [],
  source: "roi-calibrated",
  raw: {} as SkinReads["raw"],
};

async function render(state: Partial<typeof forced> = {}) {
  Object.assign(forced, state);
  const Scan = (await import("@/app/scan/page")).default;
  return renderToString(createElement(Scan));
}

const strip = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "").trim();

/** The text of every role="status" element in the markup. */
function statusTexts(html: string): string[] {
  return [...html.matchAll(/<(p|div)\b[^>]*\brole="status"[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => strip(m[2]));
}

/** The markup with every role="status" element cut out: what the screen itself shows. */
function withoutStatus(html: string): string {
  return html.replace(/<(p|div)\b[^>]*\brole="status"[^>]*>[\s\S]*?<\/\1>/g, "");
}

describe("/scan announces how a scan went", () => {
  it("has an empty status region on the page from the first render", async () => {
    const html = await render();
    expect(statusTexts(html)).toContain("");
  });

  const cases: { name: string; state: Partial<typeof forced>; says: string[] }[] = [
    { name: "analyzing", state: { phase: "analyzing" }, says: ["피부 신호를 읽는 중"] },
    { name: "result", state: { phase: "result", reads: READS }, says: [READS.headline] },
    {
      name: "noface",
      state: { phase: "noface" },
      says: ["피부가 선명하게 보이지 않았어요. 가이드라인에 맞춰서 밝은 곳에서 정면으로 다시 촬영해 주세요."],
    },
    { name: "denied / permission", state: { phase: "denied" }, says: ["카메라 권한이 필요해요."] },
    {
      name: "denied / busy",
      state: { phase: "denied", deniedReason: "busy" },
      says: ["카메라를 다른 앱이 사용 중이에요. 다른 앱을 닫고 다시 시도해 주세요."],
    },
    { name: "denied / notfound", state: { phase: "denied", deniedReason: "notfound" }, says: ["연결된 카메라를 찾지 못했어요."] },
    {
      name: "denied / attach",
      state: { phase: "denied", deniedReason: "attach" },
      says: ["카메라는 켜졌는데 화면에 연결하지 못했어요. 다시 시도해 주세요."],
    },
    {
      name: "interrupted / backgrounded",
      state: { phase: "interrupted" },
      says: ["카메라가 잠시 멈췄어요.", "계속하려면 카메라를 다시 켜주세요."],
    },
    {
      name: "interrupted / muted",
      state: { phase: "interrupted", interruptReason: "muted" },
      says: ["카메라가 잠시 멈췄어요.", "다른 앱이 카메라를 쓰고 있을 수 있어요. 그 앱을 닫고 다시 켜주세요."],
    },
    { name: "unsupported", state: { phase: "unsupported" }, says: ["이 브라우저에서는 카메라를 사용할 수 없어요."] },
  ];

  it.each(cases)("says what the $name screen shows, in a status region", async ({ state, says }) => {
    const html = await render(state);
    expect(statusTexts(html)).toContain(says.join(" "));
    // No new wording: every sentence announced is one the screen already shows.
    const screen = strip(withoutStatus(html));
    for (const sentence of says) expect(screen).toContain(sentence);
  });

  it("is empty again while the camera is live", async () => {
    const html = await render({ phase: "ready" });
    expect(statusTexts(html)).toContain("");
  });
});

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
/** Comment-only lines and JSX comments stripped, so a comment is not read as code. */
const page = read("app/scan/page.tsx")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join("\n");

describe("the announcement region (source contract)", () => {
  const jsx = page.slice(page.indexOf("return (\n    <main"));

  it("is rendered outside every phase conditional", () => {
    expect(jsx.length, "the page's <main> return moved").toBeLessThan(page.length);
    const region = jsx.search(/<p role="status" aria-live="polite" className="sr-only">\{announcement\}<\/p>/);
    const firstPhaseBranch = jsx.search(/\{\(?phase\b/);
    expect(region, "no always-mounted announcement region").toBeGreaterThan(-1);
    expect(firstPhaseBranch).toBeGreaterThan(-1);
    expect(region).toBeLessThan(firstPhaseBranch);
  });

  it("only uses strings the screens already show", () => {
    const start = page.indexOf('let announcement = "";');
    expect(start, "the announcement is no longer built in one place").toBeGreaterThan(-1);
    const block = page.slice(start, page.indexOf("return (\n    <main", start));
    const literals = [...block.matchAll(/\bt\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(literals.length).toBeGreaterThan(0);
    const shown = jsx + read("app/scan/scanning.tsx");
    for (const literal of literals) expect(shown, `"${literal}" is not shown anywhere on /scan`).toContain(`t("${literal}")`);
    expect(block).toContain("t(reads.headline)");
    expect(read("app/scan/result-card.tsx")).toContain("{t(reads.headline)}");
  });
});

describe("the result card's survey hand-off", () => {
  it("is an app-router <Link>, not a full page load", () => {
    expect(page).toContain('import Link from "next/link";');
    const start = page.indexOf("{phase === \"result\" && reads && (");
    expect(start, "the result block moved").toBeGreaterThan(-1);
    const result = page.slice(start);
    expect(result).toMatch(/<Link\s+href="\/survey"[^>]*>\s*\{t\("설문으로 이어가기"\)\}\s*<\/Link>/);
    expect(result).not.toMatch(/<a\s+href="\/survey"/);
  });
});
