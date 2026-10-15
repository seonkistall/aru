import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A superseded face-guide load that finishes must not clear the load that replaced it.
 *
 * useLandmarker keeps the creation in flight in pendingRef so that every caller asking
 * while it runs joins it. A reload drops pendingRef and starts a new creation, while the
 * replaced one is still running. When the replaced one then settles, its cleanup clears
 * pendingRef only if it still holds that replaced load. Cleared unconditionally, the
 * replacement's creation is forgotten while it is still running: the next caller makes
 * another one, both install themselves, and the one installed first is never closed.
 * Nothing pinned that check, so dropping it left the suite green.
 *
 * The hook is driven through the same small hook runtime as
 * tests/landmarker-single-flight.test.ts (useState, useRef, useCallback and useEffect
 * replaced; effects run after each render with their cleanups), with
 * createVideoLandmarker returning promises the test settles by hand.
 *
 * Found by the cycle 120 bug hunt.
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

type FakeLandmarker = { closed: number; close(): void; detectForVideo(): { faceLandmarks: [] } };
/** One createVideoLandmarker call, settled by the test. */
type Creation = {
  delegate: string;
  outcome: "pending" | "succeeded" | "failed";
  landmarker: FakeLandmarker;
  succeed(): void;
  fail(): void;
};

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
        outcome: "pending",
        landmarker,
        succeed() {
          call.outcome = "succeeded";
          resolve(landmarker);
        },
        fail() {
          call.outcome = "failed";
          reject(new Error(`could not create the ${delegate} landmarker`));
        },
      };
      lm.calls.push(call);
    }),
  createImageLandmarker: () => new Promise(() => {}),
}));

let component: () => unknown;
let hook: ReturnType<typeof import("@/app/scan/use-landmarker").useLandmarker>;

function render() {
  for (let pass = 0; pass < 30; pass++) {
    rt.state.cursor = 0;
    rt.state.dirty = false;
    rt.state.pending = [];
    component();
    rt.runEffects();
    if (!rt.state.dirty) return;
  }
  throw new Error("the component kept re-rendering");
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

/** Landmarkers a creation handed back that nothing ever closed, by call number. */
function leftOpen() {
  return lm.calls
    .filter((call) => call.outcome === "succeeded" && call.landmarker.closed === 0)
    .map((call) => lm.calls.indexOf(call) + 1);
}

beforeEach(async () => {
  rt.state.slots = [];
  lm.calls = [];
  const { useLandmarker } = await import("@/app/scan/use-landmarker");
  component = function Probe() {
    hook = useLandmarker();
    return null;
  };
  render();
});

afterEach(() => {
  rt.unmount();
});

describe("a load that a reload replaced, settling before the reload's own load", () => {
  it.each([
    { outcome: "succeeds" as const },
    { outcome: "fails" as const },
  ])("leaves the reload's creation in flight to join when it $outcome", async ({ outcome }) => {
    void hook.loadLandmarker();
    render();
    const replaced = lm.calls[0];

    // The guide is reloaded while the first load runs, and the loop loads again.
    hook.reloadLandmarker();
    render();
    void hook.loadLandmarker();
    render();
    expect(lm.calls).toHaveLength(2);
    const live = lm.calls[1];

    // The replaced load settles first: made and closed, or failed on GPU and then on
    // the CPU retry the hook makes for it.
    if (outcome === "succeeds") {
      replaced.succeed();
      await flush();
      render();
      expect(replaced.landmarker.closed, "the replaced load installed what it made").toBe(1);
    } else {
      replaced.fail();
      await flush();
      render();
      const retry = lm.calls[2];
      expect(retry?.delegate, "the replaced load made no CPU retry").toBe("CPU");
      retry.fail();
      await flush();
      render();
    }
    expect(live.outcome, "the reload's creation should still be running").toBe("pending");
    const made = lm.calls.length;
    expect(made).toBe(outcome === "succeeds" ? 2 : 3);

    // Asked for again while the reload's creation runs: it joins that one.
    const joined = hook.ensureLandmarker();
    render();
    expect(lm.calls.length, "another creation started beside the one still in flight").toBe(made);

    live.succeed();
    await flush();
    render();
    // Anything else still running finishes too, so nothing below waits on it.
    for (const call of lm.calls) if (call.outcome === "pending") call.succeed();
    await flush();
    render();
    expect(await joined).toBe(live.landmarker);
    expect(hook.landmarkerRef.current).toBe(live.landmarker);
    expect(hook.guideState).toBe("ready");

    rt.unmount();
    await flush();

    expect(leftOpen(), "createVideoLandmarker calls whose landmarker was never closed").toEqual([]);
  });
});
