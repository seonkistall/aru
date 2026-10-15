import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/lib/i18n/core";

/**
 * A camera that was allowed but could not start was reported as a refused permission.
 *
 * getUserMedia rejects with AbortError when the visitor has granted the camera and the
 * device still fails to start: Chrome's "Timeout starting video source", Firefox's
 * "Starting videoinput failed", typically because another app is holding the camera.
 * openCamera treats it as worth a retry, tries the fallback constraints, and rethrows when
 * those fail too. startCamera mapped every error name it did not list to "permission", so
 * the visitor was told 카메라 권한이 필요해요 about a permission they had just given, and
 * the funnel recorded camera_blocked {"reason":"permission"}.
 *
 * AbortError now maps to "busy", whose copy tells the visitor what to do: close the other
 * app and try again. A refusal (NotAllowedError) still maps to "permission".
 *
 * The page is driven through the same small hook runtime as
 * tests/camera-start-single-flight.test.ts (useState, useRef, useCallback and useEffect
 * replaced; effects run after each render with their cleanups), with getUserMedia
 * returning promises the test rejects by hand.
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

// The camera never opens here, so the face guide is never asked for.
vi.mock("@/app/scan/create-landmarker", () => ({
  createVideoLandmarker: () => new Promise(() => {}),
  createImageLandmarker: () => new Promise(() => {}),
}));

type Element = { type: unknown; props: Record<string, unknown> };
type Request = { settled: boolean; reject(error: unknown): void };

const START = t("카메라로 살펴보기");
const RETRY = t("다시 시도");
const BUSY = t("카메라를 다른 앱이 사용 중이에요. 다른 앱을 닫고 다시 시도해 주세요.");
const PERMISSION = t("카메라 권한이 필요해요.");

let Scan: () => unknown;
let tree: unknown;
let requests: Request[];

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

function getUserMedia() {
  return new Promise((_resolve, reject) => {
    const request: Request = {
      settled: false,
      reject: (error) => {
        request.settled = true;
        reject(error);
      },
    };
    requests.push(request);
  });
}

function render() {
  for (let pass = 0; pass < 30; pass++) {
    rt.state.cursor = 0;
    rt.state.dirty = false;
    rt.state.pending = [];
    tree = Scan();
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

function tap(label: string) {
  const [button] = buttons(label);
  expect(button, `no "${label}" button on the page`).toBeTruthy();
  (button.props.onClick as () => void)();
}

/** Rejects every getUserMedia call the start makes with `error`, re-rendering after each. */
async function failEveryAttempt(error: () => unknown) {
  for (let round = 0; round < 10; round++) {
    const next = requests.find((request) => !request.settled);
    if (!next) return;
    next.reject(error());
    await flush();
    render();
  }
  throw new Error("getUserMedia kept being called");
}

const blocked = () => log.events.filter((event) => event.kind === "camera_blocked").map((event) => event.props);

beforeEach(async () => {
  rt.state.slots = [];
  requests = [];
  log.events = [];
  const listen = () => ({ addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("document", { hidden: false, ...listen() });
  vi.stubGlobal("window", {
    location: { search: "", pathname: "/scan" },
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    ...listen(),
  });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  Scan = (await import("@/app/scan/page")).default as () => unknown;
  render();
});

afterEach(() => vi.unstubAllGlobals());

describe("a camera that was allowed but could not start", () => {
  it.each([
    { browser: "Chrome", message: "Timeout starting video source" },
    { browser: "Firefox", message: "Starting videoinput failed" },
  ])("is reported as busy, not as a permission to grant ($browser: $message)", async ({ message }) => {
    tap(START);
    await failEveryAttempt(() => new DOMException(message, "AbortError"));

    // The preferred constraints and then the fallback, both aborted.
    expect(requests).toHaveLength(2);
    expect(blocked()).toEqual([{ reason: "busy" }]);
    const text = textOf(tree);
    expect(text).toContain(BUSY);
    expect(text).not.toContain(PERMISSION);
    expect(buttons(RETRY)).toHaveLength(1);
  });

  it("still reports a refusal as a permission to grant", async () => {
    tap(START);
    await failEveryAttempt(() => new DOMException("Permission denied", "NotAllowedError"));

    // A refusal is final: no fallback attempt.
    expect(requests).toHaveLength(1);
    expect(blocked()).toEqual([{ reason: "permission" }]);
    const text = textOf(tree);
    expect(text).toContain(PERMISSION);
    expect(text).not.toContain(BUSY);
  });
});
