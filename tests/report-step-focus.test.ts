import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/lib/i18n/core";
import { DEVICE_DATA_KEY } from "@/lib/device-data";
import { clearSessionFallback } from "@/lib/session-store";
import type { Survey } from "@/lib/recommend";

/**
 * /report's step navigation dropped keyboard focus to <body>.
 *
 * The report is three steps (analysis, picks, routine) with "← 이전" and "다음: …" under
 * each. Pressing "다음" on the middle step removed that button (the last step has no
 * "다음"), and pressing "← 이전" there removed that one (the first step has no "이전").
 * Nothing took focus, so it fell to <body>: a keyboard user had to Tab from the top of
 * the page again, and a screen-reader user was not told the step had changed. On the
 * other presses the button survived but the page had scrolled to the top under it, so
 * focus sat on a control off screen below content that was never announced. Each "다음"
 * and "이전" press now moves focus to the page heading, which names the new step. The
 * step tabs keep focus on the pressed tab, and page load, Strict Mode's second effect run
 * and the language-switch remount (key={active} in lib/i18n.tsx) move nothing.
 *
 * There is no DOM here, so the page is driven with the small hook runtime of
 * tests/privacy-delete-focus.test.ts: useState, useRef and useEffect are replaced and
 * each render's element tree is "committed" to stand-in nodes. Unlike that test, a node
 * is matched to the previous render's the way React matches it, by its slot (or key)
 * under the same parent and its type, so a button whose text changes stays the same
 * node, and only a node that leaves the tree drops focus.
 *
 * Found by the cycle 117 bug hunt; fixed in cycle 118.
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

// One router for every render, as Next.js gives: it is a dependency of the page's effect.
const router = vi.hoisted(() => ({ replace: () => {}, push: () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// Analytics writes to the stores this test seeds; nothing here is about it.
vi.mock("@/lib/funnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/funnel")>()),
  recordPageView: () => null,
  recordFunnelEvent: () => null,
}));

type Element = { type: unknown; key?: unknown; props: Record<string, unknown> };
type FakeNode = { tag: string; text: string; role: unknown; el: Element | null; focus(): void };

const SURVEY: Survey = { type: "복합성", concerns: ["모공", "붉은기"], budget: 29000, avoid: ["향료"], category: "세럼" };

const NEXT = t("다음");
const BACK = t("이전");
// Step 1's heading is the report headline (survey-only here); steps 2 and 3 show their title.
const ANALYSIS_HEADING = t("{type} 피부를 위한 리포트", { type: t(SURVEY.type) });
const PICKS_TITLE = t("살펴볼 제품 후보");
const ROUTINE_TITLE = t("오늘부터 가볍게 시작할 루틴");

function isElement(value: unknown): value is Element {
  return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

function textOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (isElement(value)) return textOf(value.props.children);
  return "";
}

const typeIds = new Map<unknown, string>();
function typeName(type: unknown): string {
  if (typeof type === "string") return type;
  if (!typeIds.has(type)) typeIds.set(type, `#${typeIds.size}`);
  return typeIds.get(type)!;
}

/**
 * Every host element with the identity React would give it: the path of (slot or key,
 * type) pairs from the root. A conditional that renders `false` still holds its slot, and
 * a component's children are placed under it (where it renders them is not modelled).
 */
function* hostNodes(value: unknown, path: string): Generator<[Element, string]> {
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      const key = isElement(item) && item.key !== null && item.key !== undefined ? `key=${String(item.key)}` : String(i);
      yield* hostNodes(item, `${path}/${key}`);
    }
    return;
  }
  if (!isElement(value)) return;
  const at = `${path}:${typeName(value.type)}`;
  if (typeof value.type === "string") yield [value, at];
  const kids = value.props.children;
  yield* hostNodes(kids, Array.isArray(kids) ? at : `${at}/0`);
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
let session: ReturnType<typeof memoryStorage>;

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
  for (const [el, at] of hostNodes(next, "")) {
    let node = mounted.get(at);
    if (!node) {
      const created: FakeNode = {
        tag: el.type as string,
        text: "",
        role: undefined,
        el: null,
        // As in a browser, focus() moves focus only to an element that can take it: a
        // control, or anything with a numeric tabIndex. A heading without tabIndex={-1}
        // ignores the call and focus stays where it was.
        focus() {
          if (created.el && focusable(created.el)) focused = created;
        },
      };
      node = created;
    }
    node.el = el;
    node.text = textOf(el);
    node.role = el.props.role;
    nextMounted.set(at, node);
    const ref = el.props.ref;
    if (ref && typeof ref === "object" && "current" in ref) {
      (ref as { current: unknown }).current = node;
      attached.add(ref as { current: unknown });
    }
  }
  // Removing the focused element from the document drops focus to <body>. A control
  // outside this page (the language switcher) is not in `mounted` and stays focused.
  if (focused && [...mounted.values()].includes(focused) && ![...nextMounted.values()].includes(focused)) focused = null;
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

/** A fresh mount, as on page load or after LanguageProvider's key={active} remount. */
function mount(options?: { strictMount?: boolean }) {
  rt.state.slots = [];
  mounted = new Map();
  attached = new Set();
  render(options);
}

function nodeOf(el: Element) {
  return [...mounted.values()].find((node) => node.el === el) ?? null;
}

/** Focus the button the predicate picks and activate it, the way Enter does. */
function press(description: string, pick: (label: string) => boolean) {
  const buttons = [...hostNodes(tree, "")].map(([el]) => el).filter((el) => el.type === "button" && pick(textOf(el)));
  expect(buttons, `expected exactly one ${description} button on the page`).toHaveLength(1);
  focused = nodeOf(buttons[0]);
  (buttons[0].props.onClick as () => void)();
  render();
}

const pressNext = () => press(`"${NEXT}: …"`, (label) => label.startsWith(`${NEXT}:`));
const pressBack = () => press(`"← ${BACK}"`, (label) => label.endsWith(BACK));

beforeEach(async () => {
  clearSessionFallback();
  const local = memoryStorage();
  session = memoryStorage();
  session.setItem(DEVICE_DATA_KEY.survey, JSON.stringify(SURVEY));
  vi.stubGlobal("window", {
    localStorage: local,
    sessionStorage: session,
    location: { pathname: "/report" },
    setTimeout: () => 0,
    clearTimeout: () => {},
    scrollTo: () => {},
  });
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  // The page asks /api/reason for better copy; that request never settles here.
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  focused = null;
  Page = (await import("@/app/report/page")).default as () => unknown;
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionFallback();
});

describe("/report step navigation focus", () => {
  it("moves focus nowhere on page load", () => {
    mount();
    expect(focused).toBeNull();
  });

  it("moves focus nowhere on page load when Strict Mode runs the mount effects twice", () => {
    mount({ strictMount: true });
    expect(focused).toBeNull();
  });

  it("moves focus nowhere when a language switch remounts the page on a later step", () => {
    mount();
    pressNext();
    pressNext();
    // The language control is outside the remounted subtree and keeps focus.
    const languageControl: FakeNode = { tag: "button", text: "Language", role: undefined, el: null, focus() {} };
    focused = languageControl;
    mount();
    expect(focused).toBe(languageControl);
    // The stored step came back, so this really was a remount onto the routine step.
    expect([...mounted.values()].find((node) => node.tag === "h1")?.text).toBe(ROUTINE_TITLE);
  });

  it("does not lose focus when 다음 on the middle step removes itself", () => {
    mount();
    pressNext();
    pressNext();
    expect(focused, `"${NEXT}" opened the last step, which has no "${NEXT}", and focus fell to <body>`).not.toBeNull();
    expect(focused).toMatchObject({ tag: "h1", text: ROUTINE_TITLE });
  });

  it("does not lose focus when 이전 on the middle step removes itself", () => {
    mount();
    pressNext();
    pressBack();
    expect(focused, `"${BACK}" opened the first step, which has no "${BACK}", and focus fell to <body>`).not.toBeNull();
    expect(focused).toMatchObject({ tag: "h1", text: ANALYSIS_HEADING });
  });

  it("puts focus on the new step's heading after every 다음 and 이전", () => {
    mount();
    pressNext();
    expect(focused).toMatchObject({ tag: "h1", text: PICKS_TITLE });
    pressNext();
    expect(focused).toMatchObject({ tag: "h1", text: ROUTINE_TITLE });
    pressBack();
    expect(focused).toMatchObject({ tag: "h1", text: PICKS_TITLE });
    pressBack();
    expect(focused).toMatchObject({ tag: "h1", text: ANALYSIS_HEADING });
  });

  it("leaves focus on a step tab that was pressed, as before", () => {
    mount();
    press(`"2. ${PICKS_TITLE}" tab`, (label) => label === `2. ${PICKS_TITLE}`);
    expect(focused).toMatchObject({ tag: "button", role: "tab", text: `2. ${PICKS_TITLE}` });
    expect([...mounted.values()].find((node) => node.tag === "h1")?.text).toBe(PICKS_TITLE);
  });
});
