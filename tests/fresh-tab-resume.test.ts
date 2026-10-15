import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEVICE_DATA_KEY } from "@/lib/device-data";
import { recommend, type RecoResult, type Survey } from "@/lib/recommend";
import { clearSessionFallback } from "@/lib/session-store";
import Report from "@/app/report/page";
import Care from "@/app/care/page";
import SurveyPage from "@/app/survey/page";

/**
 * A returning visitor in a fresh tab has no survey in sessionStorage, so /report and /care
 * fall back to the result saved in localStorage (`aru_last_result`). They used to RENDER
 * that record and never hand it to the tab session, while every screen after them reads
 * the session only. So:
 *
 *   - after following the report's own scan nudge and scanning, coming back to /report
 *     found the session still without a survey, went down the same fallback, and showed
 *     the same report: the scan just taken was ignored;
 *   - /survey, which restores answers from the session survey only, came back empty;
 *   - with a camera reading saved days ago and a new scan today, /report and /care showed
 *     the old reading (on /report, beside a history strip labelling the newest scan "오늘").
 *
 * The same steps with the survey submitted in this tab work, because the session holds
 * it. The fix hands the saved survey to the session, and the saved reading only when the
 * session holds none (a scan from this tab wins), then reads it back through the same
 * session path. That path mirrors the result into `aru_last_result`, so it now does so
 * only when the content changed: a plain open of an old report writes nothing to
 * localStorage, as the old fallback did not. With the saved reading goes the marker
 * that the saved answers already absorbed its scan hint, so /survey does not re-press a
 * concern the visitor had unpressed and submitted (found by the cycle 117 review).
 *
 * The pages are driven through a minimal hook runtime: `useState` hands back its initial
 * value and records every setter call, effects run once after the render, as on mount.
 * The loaders are not exported (a page module may export only what Next.js allows), so
 * the view each page settles on is read from the setter calls.
 *
 * Found by the cycle 117 bug hunt.
 */

const runtime = vi.hoisted(() => ({ effects: [] as Array<() => unknown>, sets: [] as unknown[] }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const effect = (fn: () => unknown) => void runtime.effects.push(fn);
  return {
    ...actual,
    useState: (initial: unknown) => [
      typeof initial === "function" ? (initial as () => unknown)() : initial,
      (value: unknown) => void runtime.sets.push(value),
    ],
    useEffect: effect,
    useLayoutEffect: effect,
    useRef: (current: unknown) => ({ current }),
    useContext: (context: { _currentValue: unknown }) => context._currentValue,
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {}, push: () => {} }) }));

// Analytics writes to the same stores this test reads back; nothing here is about it.
vi.mock("@/lib/funnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/funnel")>()),
  recordPageView: () => null,
  recordFunnelEvent: () => null,
}));

type View = { survey: Survey; reads: unknown; result: RecoResult };

const SURVEY: Survey = { type: "복합성", concerns: ["모공", "붉은기"], budget: 29000, avoid: ["향료"], category: "세럼" };

function reads(oil: [string, number], pores: [string, number], redness: [string, number], headline: string) {
  const bucket = ([value, level]: [string, number]) => ({ value, level, calm: level === 0, confidence: 0.82 });
  return {
    oil: bucket(oil),
    pores: bucket(pores),
    redness: bucket(redness),
    overall: bucket(["균형 관리 필요", Math.max(oil[1], pores[1], redness[1])]),
    headline,
    narrative: "",
    confidence: 0.82,
    confidenceLabel: "보통",
    retakeRecommended: false,
    retakeReasons: [],
    signals: [{ label: "조명", ok: true, detail: "분석하기 좋은 밝기예요" }],
    source: "roi-calibrated",
    extras: [],
  };
}

// Saved three days ago: an oily reading.
const OLD_SCAN = { oil: 2, redness: 1, pores: 1, confidence: 0.82, retakeRecommended: false, source: "roi" };
const OLD_READS = reads(["유분 많음", 2], ["결 약간 보임", 1], ["붉은기 약간", 1], "T존 유분과 피부결을 함께 볼게요");
// Taken in this tab today: a calm one, so the picks differ from the old reading's.
const NEW_SCAN = { oil: 0, redness: 0, pores: 0, confidence: 0.9, retakeRecommended: false, source: "roi" };
const NEW_READS = reads(["유분 적음", 0], ["결 매끈", 0], ["붉은기 낮음", 0], "전반적으로 안정적인 피부예요");

const DAY = 86_400_000;
const OLD_TS = Date.now() - 3 * DAY;

let local: Map<string, string>;
let session: Map<string, string>;

function store(values: Map<string, string>) {
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

beforeEach(() => {
  clearSessionFallback();
  local = new Map();
  session = new Map();
  vi.stubGlobal("localStorage", store(local));
  vi.stubGlobal("sessionStorage", store(session));
  vi.stubGlobal("window", { localStorage: store(local), sessionStorage: store(session), location: { pathname: "/" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionFallback();
});

function saveResult(record: { survey: Survey; scan: unknown; reads: unknown; ts: number }) {
  local.set(DEVICE_DATA_KEY.lastResult, JSON.stringify(record));
}

function scanInThisTab() {
  // The two keys `app/scan/use-capture-analysis.ts` writes on a finished scan.
  session.set(DEVICE_DATA_KEY.scan, JSON.stringify(NEW_SCAN));
  session.set(DEVICE_DATA_KEY.reads, JSON.stringify(NEW_READS));
}

/** One render, then the mount effects; returns the view the page put into state. */
function mount(Page: () => unknown): View | undefined {
  runtime.effects.length = 0;
  runtime.sets.length = 0;
  Page();
  for (const effect of runtime.effects.splice(0)) effect();
  return runtime.sets.find((value): value is View => typeof value === "object" && value !== null && "survey" in value && "result" in value);
}

function sessionJson(key: string) {
  const raw = session.get(key);
  return raw === undefined ? undefined : JSON.parse(raw);
}

describe.each([
  ["/report", Report],
  ["/care", Care],
] as const)("%s in a fresh tab, with a saved result", (_path, Page) => {
  it("uses a scan taken in this tab over a survey-only saved result", () => {
    saveResult({ survey: SURVEY, scan: null, reads: null, ts: OLD_TS });
    scanInThisTab();

    const view = mount(Page);

    expect(view?.reads).toEqual(NEW_READS);
    expect(view?.result.scanApplied).toBe(true);
    expect(view?.result.picks.map((pick) => pick.sku.id)).toEqual(recommend(SURVEY, NEW_SCAN).picks.map((pick) => pick.sku.id));
  });

  it("uses a scan taken in this tab over a reading saved days ago, and leaves it in the session", () => {
    saveResult({ survey: SURVEY, scan: OLD_SCAN, reads: OLD_READS, ts: OLD_TS });
    scanInThisTab();

    const view = mount(Page);

    expect(view?.reads).toEqual(NEW_READS);
    expect(view?.result.picks.map((pick) => pick.sku.id)).toEqual(recommend(SURVEY, NEW_SCAN).picks.map((pick) => pick.sku.id));
    expect(sessionJson(DEVICE_DATA_KEY.scan)).toEqual(NEW_SCAN);
    expect(sessionJson(DEVICE_DATA_KEY.reads)).toEqual(NEW_READS);
    // The saved answers never saw this tab's scan, so its hint is not marked absorbed.
    expect(sessionJson(DEVICE_DATA_KEY.surveyDraft)).toBeUndefined();
  });

  it("hands the saved survey and reading to the session, which is all /survey restores from", () => {
    saveResult({ survey: SURVEY, scan: OLD_SCAN, reads: OLD_READS, ts: OLD_TS });

    const view = mount(Page);

    expect(view?.reads).toEqual(OLD_READS);
    expect(view?.result.picks.map((pick) => pick.sku.id)).toEqual(recommend(SURVEY, OLD_SCAN).picks.map((pick) => pick.sku.id));
    expect(sessionJson(DEVICE_DATA_KEY.survey)).toEqual(SURVEY);
    expect(sessionJson(DEVICE_DATA_KEY.scan)).toEqual(OLD_SCAN);
    expect(sessionJson(DEVICE_DATA_KEY.reads)).toEqual(OLD_READS);
  });

  it("does not re-stamp the saved result when nothing changed, on the first open or the next", () => {
    saveResult({ survey: SURVEY, scan: OLD_SCAN, reads: OLD_READS, ts: OLD_TS });
    const before = local.get(DEVICE_DATA_KEY.lastResult);

    mount(Page);
    expect(local.get(DEVICE_DATA_KEY.lastResult)).toBe(before);
    // A language switch remounts the page, and a reload reads the session again; both
    // now go down the session path with the resumed values.
    mount(Page);
    expect(local.get(DEVICE_DATA_KEY.lastResult)).toBe(before);
  });

  it("writes nothing to the session when there is no saved result", () => {
    expect(mount(Page)).toBeUndefined();
    expect([...session.keys()]).toEqual([]);
  });
});

describe("/report mirrors a result that did change", () => {
  it("saves the saved survey combined with this tab's scan, stamped now", () => {
    saveResult({ survey: SURVEY, scan: OLD_SCAN, reads: OLD_READS, ts: OLD_TS });
    scanInThisTab();

    mount(Report);

    const saved = JSON.parse(local.get(DEVICE_DATA_KEY.lastResult) ?? "null");
    expect(saved).toMatchObject({ survey: SURVEY, scan: NEW_SCAN, reads: NEW_READS });
    expect(saved.ts).toBeGreaterThan(Date.now() - DAY);
  });
});

describe("/survey after a fresh-tab resume", () => {
  // Submitted in an earlier tab with 유분 unpressed although the photo flagged it; the
  // saved record keeps that choice beside the scan.
  const UNPRESSED: Survey = { type: "건성", concerns: ["건조"], budget: 29000, avoid: [], category: "세럼" };

  it.each([
    ["/report", Report],
    ["/care", Care],
  ] as const)("keeps the restored answers as submitted after %s resumed them", (_path, Page) => {
    saveResult({ survey: UNPRESSED, scan: OLD_SCAN, reads: OLD_READS, ts: OLD_TS });
    mount(Page);
    expect(sessionJson(DEVICE_DATA_KEY.surveyDraft)).toEqual({ hintFor: "유분,붉은기,모공" });

    runtime.effects.length = 0;
    runtime.sets.length = 0;
    SurveyPage();
    for (const effect of runtime.effects.splice(0)) effect();

    // The answers come back from the session, and the hint is not unioned in again:
    // that union is the page's one functional setConcerns call.
    expect(runtime.sets).toContainEqual(["건조"]);
    expect(runtime.sets.some((value) => typeof value === "function")).toBe(false);
  });
});

describe("/survey looked at before the fresh-tab resume", () => {
  // What /survey writes on a mere look, before anything is tapped.
  const GLANCE = { type: null, concerns: [], category: null, budget: null, avoid: [], hintFor: null };
  const SUBMITTED: Survey = { type: "건성", concerns: ["건조"], budget: 29000, avoid: ["향료"], category: "세럼" };

  function surveyAfter(Page: () => unknown) {
    mount(Page);
    runtime.effects.length = 0;
    runtime.sets.length = 0;
    SurveyPage();
    for (const effect of runtime.effects.splice(0)) effect();
    return runtime.sets;
  }

  // Found by the cycle 120 bug hunt: the look left an all-empty draft, the resume kept
  // it, and /survey applied it over the resumed survey, clearing 건조 and 향료 and
  // pressing the saved scan's hint again.
  it("keeps the submitted answers when the saved result has a scan", () => {
    saveResult({ survey: SUBMITTED, scan: OLD_SCAN, reads: OLD_READS, ts: OLD_TS });
    session.set(DEVICE_DATA_KEY.surveyDraft, JSON.stringify(GLANCE));
    const sets = surveyAfter(Report);
    expect(sessionJson(DEVICE_DATA_KEY.surveyDraft)).toEqual({ hintFor: "유분,붉은기,모공" });
    expect(sets).toContainEqual(["건조"]);
    expect(sets).toContainEqual(["향료"]);
    expect(sets).not.toContainEqual([]);
    expect(sets.some((value) => typeof value === "function")).toBe(false);
  });

  it("keeps the submitted answers when the saved result has no scan", () => {
    saveResult({ survey: SUBMITTED, scan: null, reads: null, ts: OLD_TS });
    session.set(DEVICE_DATA_KEY.surveyDraft, JSON.stringify(GLANCE));
    const sets = surveyAfter(Care);
    expect(sessionJson(DEVICE_DATA_KEY.surveyDraft)).toBeUndefined();
    expect(sets).toContainEqual(["건조"]);
    expect(sets).toContainEqual(["향료"]);
    expect(sets).not.toContainEqual([]);
  });

  // From the cycle 120 review: with a calm or set-aside scan in this tab the look writes
  // hintFor "" rather than null, and with a flagged one it writes the hint's own concerns.
  it("treats the look's draft as untouched when this tab's scan flags nothing", () => {
    saveResult({ survey: SUBMITTED, scan: OLD_SCAN, reads: OLD_READS, ts: OLD_TS });
    scanInThisTab();
    session.set(DEVICE_DATA_KEY.surveyDraft, JSON.stringify({ ...GLANCE, hintFor: "" }));
    const sets = surveyAfter(Report);
    expect(sessionJson(DEVICE_DATA_KEY.surveyDraft)).toBeUndefined();
    expect(sets).toContainEqual(["건조"]);
    expect(sets).toContainEqual(["향료"]);
    expect(sets).not.toContainEqual([]);
  });

  it("treats the look's draft as untouched when this tab's scan pressed its own hint", () => {
    saveResult({ survey: SUBMITTED, scan: null, reads: null, ts: OLD_TS });
    session.set(DEVICE_DATA_KEY.scan, JSON.stringify(OLD_SCAN));
    session.set(DEVICE_DATA_KEY.reads, JSON.stringify(OLD_READS));
    session.set(DEVICE_DATA_KEY.surveyDraft, JSON.stringify({ ...GLANCE, concerns: ["유분", "붉은기", "모공"], hintFor: "유분,붉은기,모공" }));
    const sets = surveyAfter(Report);
    expect(sessionJson(DEVICE_DATA_KEY.surveyDraft)).toBeUndefined();
    expect(sets).toContainEqual(["향료"]);
    expect(sets).not.toContainEqual([]);
  });

  it("keeps a draft whose hinted chips the visitor unpressed", () => {
    saveResult({ survey: SUBMITTED, scan: null, reads: null, ts: OLD_TS });
    session.set(DEVICE_DATA_KEY.scan, JSON.stringify(OLD_SCAN));
    session.set(DEVICE_DATA_KEY.reads, JSON.stringify(OLD_READS));
    const unpressed = { ...GLANCE, hintFor: "유분,붉은기,모공" };
    session.set(DEVICE_DATA_KEY.surveyDraft, JSON.stringify(unpressed));
    mount(Report);
    expect(sessionJson(DEVICE_DATA_KEY.surveyDraft)).toEqual(unpressed);
  });

  it("leaves a typed draft alone when there is no hint to mark", () => {
    saveResult({ survey: SUBMITTED, scan: null, reads: null, ts: OLD_TS });
    const typed = { ...GLANCE, type: "지성", concerns: ["모공"] };
    session.set(DEVICE_DATA_KEY.surveyDraft, JSON.stringify(typed));
    mount(Care);
    expect(sessionJson(DEVICE_DATA_KEY.surveyDraft)).toEqual(typed);
  });

  it("leaves a draft the visitor typed into alone", () => {
    saveResult({ survey: SUBMITTED, scan: OLD_SCAN, reads: OLD_READS, ts: OLD_TS });
    const typed = { ...GLANCE, type: "지성", concerns: ["모공"] };
    session.set(DEVICE_DATA_KEY.surveyDraft, JSON.stringify(typed));
    mount(Report);
    expect(sessionJson(DEVICE_DATA_KEY.surveyDraft)).toEqual(typed);
  });
});
