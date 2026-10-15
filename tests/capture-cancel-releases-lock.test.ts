import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkinReads } from "@/lib/skin";
import type { Quality } from "@/app/scan/types";

/**
 * A cancelled capture held the capture lock until its /api/analyze request timed out.
 *
 * `cancelCapture` (called when the camera is interrupted: the tab hidden, the page hidden,
 * the track muted or ended) bumped the run counter and nothing else. It did not abort the
 * run's /api/analyze fetch, and `captureLockRef` was released only in that run's
 * `finally`. With AI consent on and a slow /api/analyze, hiding the tab mid-request and
 * coming back gave 카메라 다시 켜기 → a ready screen with capture enabled, and every tap
 * did nothing until the old request's 8 s timer fired. The quality loop's auto-capture
 * waits on the same promise (its `capturingRef` is cleared in that promise's `finally`),
 * so it stalled for as long.
 *
 * Now `cancelCapture` aborts the run's request and releases the lock, and a run releases
 * the lock in its own `finally` only while it is still the current run, so a cancelled
 * run that settles late cannot unlock the run that replaced it. A cancelled run still
 * records nothing and sets no state.
 *
 * The real hook is driven through a minimal hook runtime (refs are plain objects,
 * callbacks are returned as written, effects are collected and not run), with a fake
 * canvas and landmarker, and a fake fetch that settles only when the test says so, or
 * rejects when its signal is aborted, as a browser's does.
 *
 * Found by the cycle 115 bug hunt; fixed in cycle 118.
 */

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useRef: (current: unknown) => ({ current }),
    useCallback: (fn: unknown) => fn,
    useEffect: () => {},
  };
});

const log = vi.hoisted(() => ({ events: [] as Array<{ kind: string; props?: unknown }> }));

vi.mock("@/lib/funnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/funnel")>()),
  recordFunnelEvent: (kind: string, props?: unknown) => {
    log.events.push({ kind, props });
    return null;
  },
}));

// AI analysis granted, unscoped (no pilot session), so the run sends its crop to /api/analyze.
vi.mock("@/lib/consent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/consent")>();
  return {
    ...actual,
    getConsentEvents: () => [
      { id: "consent-ai", kind: "ai_analysis", granted: true, version: actual.CONSENT_VERSION, text: "", ts: 1 },
    ],
  };
});

// The pixels are not what this test is about: every frame passes, every crop exists.
vi.mock("@/app/scan/capture-analysis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/scan/capture-analysis")>()),
  evaluateCapturedQuality: () => PASSING,
  cropFace: () => ({ dataUrl: "data:image/jpeg;base64,AAAA", size: "448x448" }),
  cropFaceImageData: () => null,
}));

vi.mock("@/lib/skin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/skin")>()),
  analyzeSkinBurst: () => READS,
}));

const PASSING: Quality = {
  face: true,
  centered: true,
  distance: true,
  brightness: true,
  noGlare: true,
  steady: true,
  skinReady: true,
  score: 6,
  message: "",
};

const READS = {
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
  raw: {},
} as unknown as SkinReads;

// A face box in the middle of the frame; the burst frames find the same face, so it is steady.
const LANDMARKS = [
  { x: 0.3, y: 0.25 },
  { x: 0.7, y: 0.25 },
  { x: 0.5, y: 0.75 },
];

type Analyze = { signal: AbortSignal; at: number; settled: boolean; respond: (body: unknown) => void };

let analyze: Analyze[];
let setters: Array<[string, unknown]>;
let local: Map<string, string>;
let session: Map<string, string>;

function memory(values: Map<string, string>) {
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

function fakeFetch(_url: string, init: { signal: AbortSignal }) {
  return new Promise((resolve, reject) => {
    const call: Analyze = {
      signal: init.signal,
      at: Date.now(),
      settled: false,
      respond: (body) => {
        if (call.settled) return;
        call.settled = true;
        resolve({ ok: true, json: async () => body });
      },
    };
    init.signal.addEventListener("abort", () => {
      if (call.settled) return;
      call.settled = true;
      reject(new DOMException("The operation was aborted.", "AbortError"));
    });
    analyze.push(call);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  log.events = [];
  analyze = [];
  setters = [];
  local = new Map();
  session = new Map();
  const ctx = {
    drawImage: () => {},
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(4),
      width,
      height,
    }),
  };
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
  vi.stubGlobal("localStorage", memory(local));
  vi.stubGlobal("sessionStorage", memory(session));
  vi.stubGlobal("window", {
    localStorage: memory(local),
    sessionStorage: memory(session),
    location: { pathname: "/scan" },
    // Looked up at call time, so the fake timers installed above are the ones used.
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  });
  vi.stubGlobal("fetch", fakeFetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** One render of the real hook; its refs persist in the closures it returns. */
async function mountHook() {
  const hook = await import("@/app/scan/use-capture-analysis");
  const setter = (name: string) => (value: unknown) => void setters.push([name, value]);
  return hook.useCaptureAnalysis({
    videoRef: { current: { videoWidth: 720, videoHeight: 960 } as HTMLVideoElement },
    captureRef: { current: null },
    cropSizeRef: { current: {} },
    lastCenterRef: { current: null },
    captureMode: "balanced",
    quality: PASSING,
    guideState: "ready",
    consent: true,
    datasetConsent: false,
    ensureLandmarker: async () => ({ detectForVideo: () => ({ faceLandmarks: [LANDMARKS] }) }),
    readFrame: () => null,
    commitQuality: () => {},
    resetAutoCaptureProgress: () => {},
    holdAutoCapture: () => {},
    stopCamera: () => void setters.push(["stopCamera", true]),
    setPhase: setter("phase") as never,
    setAnalysisStep: setter("analysisStep") as never,
    setErr: setter("err") as never,
    setCropDataUrl: setter("cropDataUrl") as never,
    setCaptureMeta: setter("captureMeta") as never,
    setReads: setter("reads") as never,
  });
}

/** Runs the burst and the analysis steps until the run is waiting on /api/analyze. */
async function untilAnalyzeRequest(count: number) {
  for (let i = 0; i < 100 && analyze.length < count; i++) await vi.advanceTimersByTimeAsync(100);
  expect(analyze.length, "the capture never reached /api/analyze").toBe(count);
}

/** Lets every promise that can settle without a timer settle. */
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

const started = () => log.events.filter((event) => event.kind === "scan_started").length;

describe("cancelling a capture that is waiting on /api/analyze", () => {
  it("aborts the request instead of leaving it to its 8 s timer", async () => {
    const hook = await mountHook();
    void hook.capture();
    await untilAnalyzeRequest(1);

    hook.cancelCapture();

    expect(analyze[0].signal.aborted).toBe(true);
  });

  it("lets the next capture start at once, and the cancelled run settles without changing anything", async () => {
    const hook = await mountHook();
    let firstSettled = false;
    void hook.capture().finally(() => {
      firstSettled = true;
    });
    await untilAnalyzeRequest(1);
    expect(started()).toBe(1);

    setters = [];
    const eventsBefore = log.events.length;
    hook.cancelCapture();
    await flush();

    // No timer has run since the cancel. The quality loop's auto-capture clears its own
    // capturingRef when this promise settles, so it is free again too.
    expect(firstSettled, "the cancelled run is still pending on its request").toBe(true);
    expect(setters, "the cancelled run set state").toEqual([]);
    expect(log.events.length, "the cancelled run recorded an event").toBe(eventsBefore);
    expect(session.size + local.size, "the cancelled run wrote to storage").toBe(0);

    // The tap after 카메라 다시 켜기: a new run starts right away.
    void hook.capture();
    expect(started()).toBe(2);
    expect(setters).toContainEqual(["phase", "analyzing"]);
  });

  it("does not let the cancelled run unlock the run that replaced it", async () => {
    const hook = await mountHook();
    void hook.capture();
    await untilAnalyzeRequest(1);

    hook.cancelCapture();
    void hook.capture();
    expect(started()).toBe(2);
    // The cancelled run's request rejects and its finally runs while the new run is in flight.
    await flush();
    expect(analyze[0].settled).toBe(true);

    // The new run still holds the lock: a tap now is ignored.
    void hook.capture();
    expect(started()).toBe(2);

    // The new run finishes normally, exactly once, and gives the lock back.
    await untilAnalyzeRequest(2);
    analyze[1].respond({ ok: false });
    await vi.advanceTimersByTimeAsync(2000);
    expect(log.events.filter((event) => event.kind === "scan_completed")).toHaveLength(1);
    expect(setters.filter(([name, value]) => name === "phase" && value === "result")).toHaveLength(1);
    void hook.capture();
    expect(started()).toBe(3);
  });

  it("leaves a run that was never cancelled to its own request", async () => {
    const hook = await mountHook();
    void hook.capture();
    await untilAnalyzeRequest(1);
    expect(analyze[0].signal.aborted).toBe(false);

    // Taps while it is in flight are still ignored.
    void hook.capture();
    expect(started()).toBe(1);

    analyze[0].respond({ ok: false });
    await vi.advanceTimersByTimeAsync(2000);
    expect(analyze[0].signal.aborted).toBe(false);
    expect(log.events.filter((event) => event.kind === "scan_completed")).toHaveLength(1);
  });

  it("still gives up on a request that never answers after 8 s, and keeps the on-device result", async () => {
    const hook = await mountHook();
    void hook.capture();
    await untilAnalyzeRequest(1);

    // Measured from the moment the request went out, on the fake clock.
    await vi.advanceTimersByTimeAsync(7_999 - (Date.now() - analyze[0].at));
    expect(analyze[0].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(analyze[0].signal.aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    expect(log.events.filter((event) => event.kind === "scan_completed")).toHaveLength(1);
    expect(setters).toContainEqual(["reads", READS]);
    // The lock came back with the run.
    void hook.capture();
    expect(started()).toBe(2);
  });
});
