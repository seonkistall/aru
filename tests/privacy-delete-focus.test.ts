import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/lib/i18n/core";

/**
 * /privacy's "delete all device data" flow lost keyboard focus at every step.
 *
 * Pressing "이 기기의 ARU 데이터 모두 지우기" replaced that button with the confirmation
 * (heading, 취소, 모두 지우기); 취소 brought the button back; 모두 지우기 replaced the
 * confirmation with the role="status" line. Each time the pressed button was unmounted
 * and nothing took focus, so it fell to <body> and a keyboard or screen-reader user was
 * not told the confirmation or the outcome had appeared. Focus now moves to the
 * confirmation heading, back to the restored button, and to the status line.
 *
 * There is no DOM here, so this drives the page with a small hook runtime: useState,
 * useRef and useEffect are replaced, each render's element tree is "committed" by giving
 * every host element a stand-in node (attached to its object ref, if it has one, the
 * way React attaches refs before passive effects run), and focus drops to null when the
 * focused node leaves the tree. tests/e2e/privacy-delete-focus.regression-54.spec.ts
 * checks the same flow in a real browser, by keyboard.
 *
 * Found by the cycle 117 bug hunt.
 */

const rt = vi.hoisted(() => {
  const state = {
    slots: [] as unknown[],
    cursor: 0,
    effects: [] as Array<() => void>,
    dirty: false,
  };
  function useState<T>(init: T | (() => T)) {
    const i = state.cursor++;
    if (!(i in state.slots)) state.slots[i] = { value: typeof init === "function" ? (init as () => T)() : init };
    const slot = state.slots[i] as { value: T };
    const set = (next: T | ((prev: T) => T)) => {
      const value = typeof next === "function" ? (next as (prev: T) => T)(slot.value) : next;
      if (Object.is(value, slot.value)) return;
      slot.value = value;
      state.dirty = true;
    };
    return [slot.value, set] as const;
  }
  function useRef<T>(init: T) {
    const i = state.cursor++;
    if (!(i in state.slots)) state.slots[i] = { current: init };
    return state.slots[i] as { current: T };
  }
  function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]) {
    const i = state.cursor++;
    const prev = state.slots[i] as { deps?: readonly unknown[] } | undefined;
    const changed =
      !prev || !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((d, k) => !Object.is(d, prev.deps![k]));
    state.slots[i] = { deps };
    if (changed) state.effects.push(() => void fn());
  }
  return { state, useState, useRef, useEffect };
});

vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return { ...real, useState: rt.useState, useRef: rt.useRef, useEffect: rt.useEffect };
});

// The page subscribes to the language through context; there is no provider here.
vi.mock("@/lib/i18n", async () => {
  const core = await import("@/lib/i18n/core");
  return { t: core.t, useLanguage: () => ({}) };
});

type Element = { type: unknown; props: Record<string, unknown> };
type FakeNode = { tag: string; text: string; role: unknown; focus(): void };

const DELETE_ALL = t("이 기기의 ARU 데이터 모두 지우기");
const CONFIRM_HEADING = t("이 기기의 데이터를 모두 지울까요?");
const CANCEL = t("취소");
const DELETE_EVERYTHING = t("모두 지우기");
const DONE = t("이 기기에 저장된 ARU 데이터를 모두 지웠어요.");

function isElement(value: unknown): value is Element {
  return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

function children(el: Element): unknown[] {
  return [el.props.children].flat(Infinity);
}

function textOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (isElement(value)) return children(value).map(textOf).join("");
  return "";
}

function* hostElements(value: unknown): Generator<Element> {
  if (Array.isArray(value)) {
    for (const item of value) yield* hostElements(item);
    return;
  }
  if (!isElement(value)) return;
  if (typeof value.type === "string") yield value;
  for (const child of children(value)) yield* hostElements(child);
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

let Page: () => unknown;
let tree: unknown;
let mounted = new Map<string, FakeNode>();
let attached = new Set<{ current: unknown }>();
let focused: FakeNode | null = null;

function nodeKey(el: Element) {
  return `${el.type as string}:${textOf(el)}`;
}

function focusable(el: Element) {
  const tag = el.type as string;
  if (typeof el.props.tabIndex === "number") return true;
  if (tag === "a") return typeof el.props.href === "string";
  return ["button", "input", "select", "textarea"].includes(tag) && !el.props.disabled;
}

function commit(next: unknown) {
  for (const ref of attached) ref.current = null;
  attached = new Set();
  const nextMounted = new Map<string, FakeNode>();
  for (const el of hostElements(next)) {
    const key = nodeKey(el);
    const node: FakeNode =
      mounted.get(key) ??
      nextMounted.get(key) ?? {
        tag: el.type as string,
        text: textOf(el),
        role: el.props.role,
        // As in a browser, focus() moves focus only to an element that can take it: a
        // control, or anything with a numeric tabIndex. A heading or paragraph without
        // tabIndex={-1} ignores the call and focus stays where it was.
        focus() {
          if (focusable(el)) focused = node;
        },
      };
    nextMounted.set(key, node);
    const ref = el.props.ref;
    if (ref && typeof ref === "object" && "current" in ref) {
      (ref as { current: unknown }).current = node;
      attached.add(ref as { current: unknown });
    }
  }
  // Removing the focused element from the document drops focus to <body>.
  if (focused && ![...nextMounted.values()].includes(focused)) focused = null;
  mounted = nextMounted;
}

/** `strictMount` runs the first commit's effects twice, as React's Strict Mode does in dev. */
function render({ strictMount = false } = {}) {
  for (let pass = 0; pass < 20; pass++) {
    rt.state.cursor = 0;
    rt.state.dirty = false;
    rt.state.effects = [];
    tree = Page();
    commit(tree);
    const runs = strictMount && pass === 0 ? 2 : 1;
    for (let run = 0; run < runs; run++) for (const effect of rt.state.effects) effect();
    if (!rt.state.dirty) return;
  }
  throw new Error("the page kept re-rendering");
}

/** Focus the button with this exact label and activate it, the way Enter does. */
function press(label: string) {
  const button = [...hostElements(tree)].find((el) => el.type === "button" && textOf(el) === label);
  expect(button, `no "${label}" button on the page`).toBeTruthy();
  focused = mounted.get(nodeKey(button!)) ?? null;
  (button!.props.onClick as () => void)();
  render();
}

beforeEach(async () => {
  const local = memoryStorage();
  const session = memoryStorage();
  vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  rt.state.slots = [];
  mounted = new Map();
  attached = new Set();
  focused = null;
  Page = (await import("@/app/privacy/page")).default as () => unknown;
});

afterEach(() => vi.unstubAllGlobals());

describe("/privacy delete-all focus", () => {
  it("moves focus nowhere on page load", () => {
    render();
    expect(focused).toBeNull();
  });

  it("moves focus nowhere on page load when Strict Mode runs the mount effects twice", () => {
    render({ strictMount: true });
    expect(focused).toBeNull();
  });

  it("follows each step: confirmation heading, back to the button on 취소, then the status line", () => {
    render();

    press(DELETE_ALL);
    expect(focused, "the confirmation appeared but focus fell to <body>").not.toBeNull();
    expect(focused).toMatchObject({ tag: "h3", text: CONFIRM_HEADING });

    press(CANCEL);
    expect(focused, "취소 restored the delete button but focus fell to <body>").not.toBeNull();
    expect(focused).toMatchObject({ tag: "button", text: DELETE_ALL });

    press(DELETE_ALL);
    expect(focused).toMatchObject({ tag: "h3", text: CONFIRM_HEADING });

    press(DELETE_EVERYTHING);
    expect(focused, "the data was deleted but focus fell to <body>").not.toBeNull();
    expect(focused).toMatchObject({ tag: "p", role: "status", text: DONE });
  });
});
