import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEVICE_DATA_KEY } from "@/lib/device-data";
import { getMlReadiness } from "@/lib/ml-readiness";

/**
 * /ops let the ML readiness band leave the participant gate on pilot notes alone.
 *
 * getMlReadiness keeps the band at "calibrate" while fewer than five participants are
 * linked to the opt-in crops; its own detail says how many are linked. /ops passed it
 * the pilot roster count instead, which counts every P001-P030 id with any pilot note:
 * a "planned" row (the /pilot form's default), an "excluded" row, a participant who
 * declined the learning crop. Five notes and a hundred crops all from one participant
 * showed "MobileNetV3 dry-run" where the gate should have held. The band now counts the
 * distinct pilot participants on the stored crops; the participants tile still shows
 * the roster.
 *
 * renderToString runs no effect, and /ops reads the device stores in one, so the page is
 * driven through a small hook runtime (useState, useRef, useMemo and useEffect replaced;
 * effects run after each render) like tests/landmarker-single-flight.test.ts, with
 * localStorage stubbed and fetch left pending so nothing leaves the process.
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
  function useMemo<T>(fn: () => T, deps: readonly unknown[]) {
    const i = state.cursor++;
    const slot = state.slots[i] as { value: T; deps: readonly unknown[] } | undefined;
    if (slot && same(slot.deps, deps)) return slot.value;
    const value = fn();
    state.slots[i] = { value, deps };
    return value;
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
  function unmount() {
    for (const slot of state.slots) {
      if (!slot || typeof slot !== "object" || !("ran" in slot)) continue;
      const effect = slot as EffectSlot;
      const cleanup = effect.cleanup;
      effect.cleanup = undefined;
      cleanup?.();
    }
  }
  return { state, useState, useRef, useMemo, useEffect, runEffects, unmount };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const hooks = { useState: rt.useState, useRef: rt.useRef, useMemo: rt.useMemo, useEffect: rt.useEffect };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});

type Element = { type: unknown; props: Record<string, unknown> };

let tree: unknown;
let store: Map<string, string>;

function isElement(value: unknown): value is Element {
  return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

function textOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (isElement(value)) return textOf(value.props.children);
  return "";
}

function* elements(value: unknown): Generator<Element> {
  if (Array.isArray(value)) {
    for (const item of value) yield* elements(item);
    return;
  }
  if (!isElement(value)) return;
  yield value;
  yield* elements(value.props.children);
}

function render(component: () => unknown) {
  for (let pass = 0; pass < 30; pass++) {
    rt.state.cursor = 0;
    rt.state.dirty = false;
    rt.state.pending = [];
    tree = component();
    rt.runEffects();
    if (!rt.state.dirty) return;
  }
  throw new Error("the page kept re-rendering");
}

/** Mounts /ops and lets its after-mount read of the device stores land. */
async function mountOps() {
  const Ops = (await import("@/app/ops/page")).default as () => unknown;
  render(Ops);
  await new Promise((resolve) => setTimeout(resolve, 5));
  render(Ops);
}

/** The title and detail the "ML readiness" section shows. */
function shownReadiness() {
  const section = [...elements(tree)].find(
    (el) => el.type === "section" && [...elements(el.props.children)].some((child) => child.type === "p" && textOf(child) === "ML readiness")
  );
  expect(section, "no ML readiness section on /ops").toBeTruthy();
  const inside = [...elements(section!.props.children)];
  const title = inside.find((el) => el.type === "h2");
  const detail = inside[inside.indexOf(title!) + 1];
  return { title: textOf(title), detail: textOf(detail) };
}

/** The value on the "participants" metric tile. */
function participantsTile() {
  const tile = [...elements(tree)].find((el) => el.props.label === "participants");
  expect(tile, "no participants tile on /ops").toBeTruthy();
  return tile!.props.value;
}

function note(participant: string, status: string, consentCrop: boolean) {
  return {
    id: `note-${participant}`,
    participant,
    participantId: participant,
    sessionId: `${participant}-1`,
    status,
    browser: "ios-safari",
    lighting: "window",
    makeup: "none",
    glasses: false,
    hairCover: false,
    scanCompleted: status !== "planned",
    consentAi: true,
    consentCrop,
    notes: "",
    ts: 1,
  };
}

function crop(index: number, participantId: unknown) {
  return {
    id: `crop-${index}`,
    image: "data:image/jpeg;base64,/9j/4AAQSkY=",
    labels: {},
    features: {},
    source: "pilot",
    ...(participantId === undefined ? {} : { meta: { schemaVersion: "2026-06-29.label.v2", participantId, sessionId: `${String(participantId)}-1` } }),
    ts: 1 + index,
  };
}

/** P001 planned, P002 consented, P003 scanned without crop consent, P004 excluded, P005 scanned. */
const FIVE_NOTES = [
  note("P001", "planned", false),
  note("P002", "consented", true),
  note("P003", "scanned", false),
  note("P004", "excluded", true),
  note("P005", "scanned", true),
];

function seed(notes: unknown[], crops: unknown[]) {
  store.set(DEVICE_DATA_KEY.pilotNotes, JSON.stringify(notes));
  store.set(DEVICE_DATA_KEY.cropSamples, JSON.stringify(crops));
}

beforeEach(() => {
  rt.state.slots = [];
  store = new Map();
  const storage = () => ({
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  });
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  // The sync and funnel status reads stay pending: nothing here talks to a server.
  vi.stubGlobal("fetch", () => new Promise(() => {}));
});

afterEach(() => {
  rt.unmount();
  vi.unstubAllGlobals();
});

describe("the /ops ML readiness band", () => {
  it("stays at the participant gate when five pilot notes exist but every crop is one participant's", async () => {
    seed(FIVE_NOTES, Array.from({ length: 100 }, (_, i) => crop(i, "P005")));
    await mountOps();

    const gated = getMlReadiness({ labels: 0, crops: 100, participants: 1 });
    expect(gated.band).toBe("calibrate");
    expect(participantsTile(), "the participants tile is the roster and should still count every noted id").toBe("5");
    expect(shownReadiness(), "/ops took the roster count for the participants linked to crops").toEqual({ title: gated.title, detail: gated.detail });
  });

  it("counts only valid pilot ids on the crops, once each", async () => {
    // P003 twice (once as typed on a device), plus ids that are not pilot participants.
    const ids = ["P001", "P002", "P003", "p3", "P031", "guest", 5, undefined];
    seed(FIVE_NOTES, Array.from({ length: 100 }, (_, i) => crop(i, ids[i % ids.length])));
    await mountOps();

    const gated = getMlReadiness({ labels: 0, crops: 100, participants: 3 });
    expect(gated.band).toBe("calibrate");
    expect(participantsTile()).toBe("5");
    expect(shownReadiness()).toEqual({ title: gated.title, detail: gated.detail });
  });

  it("leaves the gate once crops are linked to five pilot participants", async () => {
    const ids = ["P001", "P002", "P003", "P004", "P005"];
    seed(ids.map((id) => note(id, "scanned", true)), Array.from({ length: 100 }, (_, i) => crop(i, ids[i % ids.length])));
    await mountOps();

    const open = getMlReadiness({ labels: 0, crops: 100, participants: 5 });
    expect(open.band).toBe("dry-run");
    expect(shownReadiness()).toEqual({ title: open.title, detail: open.detail });
  });
});
