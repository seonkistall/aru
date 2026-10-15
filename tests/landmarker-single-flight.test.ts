import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/lib/i18n/core";
import { CameraGuide } from "@/app/scan/guide";

/**
 * Loading the face guide was not single-flight.
 *
 * The guide is a MediaPipe landmarker, and on a first visit making one means downloading
 * its wasm and model, which can take long enough for a visitor to switch apps. Hiding the
 * tab while it loaded stopped the camera and the quality loop, but not the load. Tapping
 * 카메라 다시 켜기 started the loop again, and since no landmarker had been installed yet,
 * the loop started a second load. When both finished, the later one replaced the earlier
 * without closing it, and leaving the page closed only the one in hand, so the earlier
 * one was never closed. When the earlier one failed instead (GPU, then its CPU retry)
 * after the later one had succeeded, its failure handler closed the landmarker the running
 * loop was using and put 얼굴 가이드를 불러오지 못했어요 over a guide that had loaded.
 *
 * Now a load asked for while one is running joins it. A load that a reload, a switch to
 * CPU or leaving the page has replaced closes what it makes instead of installing it, and
 * if it fails, it leaves the guide and the current landmarker alone.
 *
 * The page is driven through the same small hook runtime as
 * tests/camera-start-single-flight.test.ts (useState, useRef, useCallback and useEffect
 * replaced; effects run after each render with their cleanups), with getUserMedia and
 * createVideoLandmarker returning promises the test settles by hand. The last block drives
 * the hook on its own, for a reload that lands while a load is still running, which the
 * hook allows: the replaced load must neither install what it makes nor, failing, touch
 * the load that replaced it.
 *
 * Found by the cycle 119 bug hunt.
 */

const rt = vi.hoisted(() => {
  type EffectSlot = { deps?: readonly unknown[]; cleanup?: () => void; next?: () => unknown; ran: boolean };
  const state = { slots: [] as unknown[], cursor: 0, pending: [] as number[], dirty: false };
  const same = (a?: readonly unknown[], b?: readonly unknown[]) =>
    !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  function useState<T>(init: T | (() => T)) {
    const i = state.cursor++;
    if (!(i in state.slots)) state.slots[i] = { value: typeof init === "function" ? (init as () => T)() : init };
    const slot = state.slots[i] as { value: T; set?: (next: T | ((prev: T) => T)) => void };
    slot.set ??= (next) => {
      const value = typeof next === "function" ? (next as (prev: T) => T)(slot.value) : next;
      if (Object.is(value, slot.value)) return;
      slot.value = value;
      state.dirty = true;
    };
    return [slot.value, slot.set] as const;
  }
  function useRef<T>(init: T) {
    const i = state.cursor++;
    if (!(i in state.slots)) state.slots[i] = { current: init };
    return state.slots[i] as { current: T };
  }
  function useCallback<T>(fn: T, deps: readonly unknown[]) {
    const i = state.cursor++;
    const slot = state.slots[i] as { fn: T; deps: readonly unknown[] } | undefined;
    if (slot && same(slot.deps, deps)) return slot.fn;
    state.slots[i] = { fn, deps };
    return fn;
  }
  function useEffect(fn: () => unknown, deps?: readonly unknown[]) {
    const i = state.cursor++;
    const slot = (state.slots[i] ??= { ran: false }) as EffectSlot;
    if (slot.ran && deps && same(slot.deps, deps)) return;
    slot.deps = deps;
    slot.next = fn;
    state.pending.push(i);
  }
  function runEffects() {
    const due = state.pending.splice(0).map((i) => state.slots[i] as EffectSlot);
    for (const slot of due) slot.cleanup?.();
    for (const slot of due) {
      const cleanup = slot.next?.();
      slot.cleanup = typeof cleanup === "function" ? (cleanup as () => void) : undefined;
      slot.ran = true;
    }
  }
  /** Leaving the page: every effect's cleanup runs, once. */
  function unmount() {
    for (const slot of state.slots) {
      if (!slot || typeof slot !== "object" || !("ran" in slot)) continue;
      const effect = slot as EffectSlot;
      const cleanup = effect.cleanup;
      effect.cleanup = undefined;
      cleanup?.();
    }
  }
  return { state, useState, useRef, useCallback, useEffect, runEffects, unmount };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const hooks = { useState: rt.useState, useRef: rt.useRef, useCallback: rt.useCallback, useEffect: rt.useEffect };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});

const log = vi.hoisted(() => ({ events: [] as Array<{ kind: string; props?: Record<string, unknown> }> }));

vi.mock("@/lib/funnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/funnel")>()),
  recordFunnelEvent: (kind: string, props?: Record<string, unknown>) => {
    log.events.push({ kind, props });
    return null;
  },
  recordPageView: (kind: string) => {
    log.events.push({ kind });
    return null;
  },
}));

type FakeLandmarker = { closed: number; close(): void; detectForVideo(): { faceLandmarks: [] } };
/** One createVideoLandmarker call, settled by the test. */
type Creation = { delegate: string; settled: boolean; landmarker: FakeLandmarker; succeed(): void; fail(): void };

const lm = vi.hoisted(() => ({ calls: [] as Creation[] }));

vi.mock("@/app/scan/create-landmarker", () => ({
  createVideoLandmarker: (delegate: string) =>
    new Promise((resolve, reject) => {
      const landmarker: FakeLandmarker = {
        closed: 0,
        close() {
          landmarker.closed += 1;
        },
        detectForVideo: () => ({ faceLandmarks: [] }),
      };
      const call: Creation = {
        delegate,
        settled: false,
        landmarker,
        succeed() {
          call.settled = true;
          resolve(landmarker);
        },
        fail() {
          call.settled = true;
          reject(new Error(`could not create the ${delegate} landmarker`));
        },
      };
      lm.calls.push(call);
    }),
  createImageLandmarker: () => new Promise(() => {}),
}));

type Element = { type: unknown; props: Record<string, unknown> };
type FakeTrack = {
  readyState: "live" | "ended";
  listeners: Map<string, Set<() => void>>;
  stop(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};
type FakeStream = { track: FakeTrack; getTracks(): FakeTrack[]; getVideoTracks(): FakeTrack[] };
type Request = { settled: boolean; resolve(stream: FakeStream): void; reject(error: unknown): void };

const START = t("카메라로 살펴보기");
const RESTART = t("카메라 다시 켜기");
const GUIDE_LOADING = t("얼굴 가이드 불러오는 중…");
const GUIDE_FAILED = t("얼굴 가이드를 불러오지 못했어요.");

let component: () => unknown;
let tree: unknown;
let attached = new Set<{ current: unknown }>();
let video: { srcObject: unknown; play(): Promise<void> };
let requests: Request[];
let docListeners: Map<string, Set<() => void>>;
let doc: { hidden: boolean };

function isElement(value: unknown): value is Element {
  return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

function textOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (isElement(value)) return textOf(value.props.children);
  return "";
}

/** Every element in the tree, components included (they are not rendered, only listed). */
function* elements(value: unknown): Generator<Element> {
  if (Array.isArray(value)) {
    for (const item of value) yield* elements(item);
    return;
  }
  if (!isElement(value)) return;
  yield value;
  yield* elements(value.props.children);
}

function makeStream(): FakeStream {
  const track: FakeTrack = {
    readyState: "live",
    listeners: new Map(),
    stop() {
      track.readyState = "ended";
    },
    addEventListener(type, listener) {
      if (!track.listeners.has(type)) track.listeners.set(type, new Set());
      track.listeners.get(type)!.add(listener);
    },
    removeEventListener(type, listener) {
      track.listeners.get(type)?.delete(listener);
    },
  };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}

function getUserMedia() {
  return new Promise<FakeStream>((resolve, reject) => {
    const request: Request = {
      settled: false,
      resolve: (stream) => {
        request.settled = true;
        resolve(stream);
      },
      reject: (error) => {
        request.settled = true;
        reject(error);
      },
    };
    requests.push(request);
  });
}

/** Gives every <video> with an object ref its node, as React does before effects run. */
function commit(next: unknown) {
  for (const ref of attached) ref.current = null;
  attached = new Set();
  for (const el of elements(next)) {
    const ref = el.props.ref;
    if (el.type === "video" && ref && typeof ref === "object" && "current" in ref) {
      (ref as { current: unknown }).current = video;
      attached.add(ref as { current: unknown });
    }
  }
}

function render() {
  for (let pass = 0; pass < 30; pass++) {
    rt.state.cursor = 0;
    rt.state.dirty = false;
    rt.state.pending = [];
    tree = component();
    commit(tree);
    rt.runEffects();
    if (!rt.state.dirty) return;
  }
  throw new Error("the component kept re-rendering");
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

function tap(label: string) {
  const [button] = [...elements(tree)].filter((el) => el.type === "button" && textOf(el) === label);
  expect(button, `no "${label}" button on the page`).toBeTruthy();
  (button.props.onClick as () => void)();
}

/** A tap on a camera start button, and getUserMedia opening a stream for it. */
async function openCamera(label: string) {
  tap(label);
  const request = requests.find((candidate) => !candidate.settled);
  expect(request, "the tap did not ask for the camera").toBeTruthy();
  request!.resolve(makeStream());
  await flush();
  render();
}

/** The visitor switches away from the tab and comes back to the camera-paused screen. */
function hideAndReturn() {
  doc.hidden = true;
  for (const listener of docListeners.get("visibilitychange") ?? []) listener();
  render();
  doc.hidden = false;
}

/** Settles every unsettled creation in the order made, including retries the hook makes on the way. */
async function settleCreations(outcome: "succeed" | "fail") {
  for (let round = 0; round < 10; round++) {
    const next = lm.calls.find((call) => !call.settled);
    if (!next) return;
    next[outcome]();
    await flush();
    render();
  }
  throw new Error("createVideoLandmarker kept being called");
}

/** What the camera frame shows for the face guide. */
function guide(): "loading" | "failed" | "ready" | "none" {
  const text = textOf(tree);
  if (text.includes(GUIDE_FAILED)) return "failed";
  if (text.includes(GUIDE_LOADING)) return "loading";
  if ([...elements(tree)].some((el) => el.type === CameraGuide)) return "ready";
  return "none";
}

beforeEach(() => {
  rt.state.slots = [];
  attached = new Set();
  requests = [];
  lm.calls = [];
  log.events = [];
  docListeners = new Map();
  video = { srcObject: null, play: async () => {} };
  const listen = (map: Map<string, Set<() => void>>) => ({
    addEventListener: (type: string, listener: () => void) => {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => void map.get(type)?.delete(listener),
  });
  doc = { hidden: false, ...listen(docListeners) } as { hidden: boolean };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", {
    location: { search: "", pathname: "/scan" },
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    ...listen(new Map()),
  });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
});

afterEach(() => {
  rt.unmount();
  vi.unstubAllGlobals();
});

describe("hiding /scan while the face guide loads, then 카메라 다시 켜기", () => {
  beforeEach(async () => {
    component = (await import("@/app/scan/page")).default as () => unknown;
    render();
    await openCamera(START);
    expect(guide()).toBe("loading");
    expect(lm.calls).toHaveLength(1);
    hideAndReturn();
    await openCamera(RESTART);
    expect(guide()).toBe("loading");
  });

  it("starts no second load: the restarted loop waits on the one already running", async () => {
    expect(lm.calls.map((call) => call.delegate)).toEqual(["GPU"]);

    await settleCreations("succeed");
    expect(guide()).toBe("ready");
  });

  it.each([
    { name: "before the page is left", leaveFirst: false },
    { name: "after the page is left", leaveFirst: true },
  ])("leaves no landmarker open once the page is left, when the loads finish $name", async ({ leaveFirst }) => {
    if (leaveFirst) rt.unmount();
    await settleCreations("succeed");
    if (!leaveFirst) {
      expect(guide()).toBe("ready");
      rt.unmount();
    }
    await flush();

    expect(lm.calls.length).toBeGreaterThan(0);
    expect(
      lm.calls.filter((call) => call.landmarker.closed === 0).map((call) => lm.calls.indexOf(call) + 1),
      "createVideoLandmarker calls whose landmarker was never closed"
    ).toEqual([]);
  });

  // With single flight there is no earlier load left to fail: the restart joined the
  // one in flight. On the old hook the restart made a second, and the first failing
  // after it put "failed" over the guide. A load that a reload replaced, which can
  // still fail late, is the describe block below.
  it("leaves no earlier load to fail afterwards, so the guide that loaded stays", async () => {
    expect(lm.calls, "the restart started its own load instead of joining the one in flight").toHaveLength(1);
    const live = lm.calls[lm.calls.length - 1];
    live.succeed();
    await flush();
    render();
    expect(guide()).toBe("ready");

    // Any earlier load fails late, GPU and then the CPU retry the hook makes for it.
    await settleCreations("fail");

    expect(guide(), "the failed overlay is over a guide that loaded").toBe("ready");
    expect(live.landmarker.closed, "the landmarker the loop is using was closed").toBe(0);
  });
});

describe("a load that a reload replaced while it ran", () => {
  let hook: ReturnType<typeof import("@/app/scan/use-landmarker").useLandmarker>;

  beforeEach(async () => {
    const { useLandmarker } = await import("@/app/scan/use-landmarker");
    component = function Probe() {
      hook = useLandmarker();
      return null;
    };
    render();

    void hook.loadLandmarker();
    render();
    expect(lm.calls).toHaveLength(1);

    // The guide is reloaded while the first load is still running, and the loop loads again.
    hook.reloadLandmarker();
    render();
    void hook.loadLandmarker();
    render();
    expect(lm.calls).toHaveLength(2);
  });

  it("does not fail the guide or close the reload's landmarker when it fails late", async () => {
    const live = lm.calls[1];
    live.succeed();
    await flush();
    render();
    expect(hook.guideState).toBe("ready");
    expect(hook.landmarkerRef.current).toBe(live.landmarker);

    await settleCreations("fail");

    expect(hook.guideState).toBe("ready");
    expect(hook.landmarkerRef.current, "the reload's landmarker was dropped").toBe(live.landmarker);
    expect(live.landmarker.closed, "the reload's landmarker was closed").toBe(0);
  });

  it("closes what it makes instead of installing it when it finishes late", async () => {
    const [replaced, live] = lm.calls;
    live.succeed();
    await flush();
    render();

    replaced.succeed();
    await flush();
    render();

    expect(hook.landmarkerRef.current, "the replaced load installed its landmarker").toBe(live.landmarker);
    expect(replaced.landmarker.closed, "the replaced load's landmarker was left open").toBe(1);
    expect(live.landmarker.closed).toBe(0);
    expect(hook.guideState).toBe("ready");

    rt.unmount();
    expect(live.landmarker.closed).toBe(1);
  });
});
