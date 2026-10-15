import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/lib/i18n/core";

/**
 * Starting the camera was not single-flight.
 *
 * A double tap on 카메라로 살펴보기 / 다시 시도 / 카메라 다시 켜기 while getUserMedia was
 * still pending ran two starts. If both opened a stream, the second replaced the first
 * after the page had already gone to "ready", and the stream watcher (an effect keyed on
 * `phase`, which did not change) never watched it, so the camera dying under it went
 * unnoticed. If the second failed, which a device can do because ARU's own first stream
 * holds the camera, the page showed the 다른 앱이 사용 중 screen with the first stream
 * still live, recorded `camera_blocked {"reason":"busy"}`, and stopped nothing.
 *
 * Now a start that arrives while another is in progress is ignored, so a double tap
 * opens one stream. Ignoring is used rather than letting the newer tap win because the
 * newer tap's getUserMedia is the call that can fail on ARU's own camera.
 *
 * The page is driven through a small hook runtime: useState, useRef, useCallback and
 * useEffect are replaced (effects run after each render with their cleanups, in the
 * order React runs them), each render's <video> gets a fake element through its ref, and
 * getUserMedia returns promises the test settles by hand.
 *
 * Found by the cycle 115 bug hunt; fixed in cycle 118.
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
  return { state, useState, useRef, useCallback, useEffect, runEffects };
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

// The face guide is not what this is about; it stays "loading" for the whole test.
vi.mock("@/app/scan/create-landmarker", () => ({
  createVideoLandmarker: () => new Promise(() => {}),
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
const RETRY = t("다시 시도");
const RESTART = t("카메라 다시 켜기");

let Scan: () => unknown;
let tree: unknown;
let attached = new Set<{ current: unknown }>();
let video: { srcObject: unknown; play(): Promise<void> };
let streams: FakeStream[];
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

function* hostElements(value: unknown): Generator<Element> {
  if (Array.isArray(value)) {
    for (const item of value) yield* hostElements(item);
    return;
  }
  if (!isElement(value)) return;
  if (typeof value.type === "string") yield value;
  yield* hostElements(value.props.children);
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
  const stream = { track, getTracks: () => [track], getVideoTracks: () => [track] };
  streams.push(stream);
  return stream;
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

/** Gives every host element with an object ref its node, as React does before effects run. */
function commit(next: unknown) {
  for (const ref of attached) ref.current = null;
  attached = new Set();
  for (const el of hostElements(next)) {
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
    tree = Scan();
    commit(tree);
    rt.runEffects();
    if (!rt.state.dirty) return;
  }
  throw new Error("the page kept re-rendering");
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

function buttons(label: string) {
  return [...hostElements(tree)].filter((el) => el.type === "button" && textOf(el) === label);
}

/** One tap: the button's handler runs; nothing else happens until the test settles getUserMedia. */
function tap(label: string) {
  const [button] = buttons(label);
  expect(button, `no "${label}" button on the page`).toBeTruthy();
  (button.props.onClick as () => void)();
}

/**
 * Settles every getUserMedia call in the order it was made, re-rendering after each: the
 * first opens a stream, every later one gets `later(index)`, a stream or an error.
 */
async function settle(later: () => "stream" | Error) {
  let index = 0;
  for (let round = 0; round < 10; round++) {
    const next = requests.find((request) => !request.settled);
    if (!next) return;
    const outcome = index === 0 ? "stream" : later();
    if (outcome === "stream") next.resolve(makeStream());
    else next.reject(outcome);
    index += 1;
    await flush();
    render();
  }
  throw new Error("getUserMedia kept being called");
}

const busy = () => new DOMException("Could not start video source", "NotReadableError");

beforeEach(async () => {
  rt.state.slots = [];
  attached = new Set();
  streams = [];
  requests = [];
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
  Scan = (await import("@/app/scan/page")).default as () => unknown;
  render();
});

afterEach(() => vi.unstubAllGlobals());

/** The screens a start button is on, each reached the way a user reaches it. */
const screens: Array<{ name: string; label: string; reach: () => Promise<void> }> = [
  { name: "the first screen", label: START, reach: async () => {} },
  {
    name: "the denied screen",
    label: RETRY,
    reach: async () => {
      tap(START);
      requests[0].reject(new DOMException("Permission denied", "NotAllowedError"));
      await flush();
      render();
    },
  },
  {
    name: "the camera-paused screen",
    label: RESTART,
    reach: async () => {
      tap(START);
      await settle(busy);
      // The tab is hidden and shown again.
      doc.hidden = true;
      for (const listener of docListeners.get("visibilitychange") ?? []) listener();
      render();
      doc.hidden = false;
    },
  },
];

const outcomes: Array<{ name: string; later: () => "stream" | Error }> = [
  { name: "both would open a stream", later: () => "stream" },
  { name: "the second would find the camera busy", later: busy },
];

describe("a double tap on a camera start button", () => {
  describe.each(screens)("on $name", ({ label, reach }) => {
    it.each(outcomes)("opens one watched stream when $name", async ({ later }) => {
      await reach();
      expect(buttons(label), `"${label}" is not on the screen`).toHaveLength(1);
      const eventsBefore = log.events.length;
      const streamsBefore = streams.length;

      // Two taps before getUserMedia answers.
      tap(label);
      tap(label);
      await settle(later);

      expect(log.events.slice(eventsBefore).filter((event) => event.kind === "camera_blocked")).toEqual([]);
      // The live camera screen, not a blocked one.
      expect([...hostElements(tree)].some((el) => el.props["data-testid"] === "scan-capture")).toBe(true);
      expect(buttons(RETRY)).toHaveLength(0);

      const opened = streams.slice(streamsBefore);
      const live = streams.filter((stream) => stream.track.readyState === "live");
      expect(live, "live streams").toHaveLength(1);
      expect(opened).toContain(live[0]);
      expect(video.srcObject, "the live stream is not the one on screen").toBe(live[0]);
      // Watched once, so the camera dying under it is noticed.
      expect(live[0].track.listeners.get("mute")?.size ?? 0, "the live stream is not watched").toBe(1);
      expect(live[0].track.listeners.get("ended")?.size ?? 0, "the live stream is not watched").toBe(1);
    });
  });

  it("still starts again after a start has finished", async () => {
    tap(START);
    requests[0].reject(new DOMException("Permission denied", "NotAllowedError"));
    await flush();
    render();
    tap(RETRY);
    expect(requests).toHaveLength(2);
  });
});
