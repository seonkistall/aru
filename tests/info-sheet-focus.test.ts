import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/lib/i18n/core";

/**
 * /scan's info sheet (app/scan/info-sheet.tsx) is an aria-modal dialog that never
 * received focus.
 *
 * Opening it with "사진과 데이터 사용 자세히 보기" (app/scan/scan-controls.tsx) left focus on
 * that button, which sits behind the sheet and which aria-modal tells a screen reader to
 * treat as inert, so the dialog was not announced and a keyboard user's next Tab went on
 * through the page underneath.
 * Closing it with 닫기 unmounted the focused button and nothing took focus, so it fell to
 * <body>. Focus now moves to the dialog when it opens and goes back to the control that
 * opened it when it closes (닫기, Escape or the backdrop). Strict Mode's mount, cleanup,
 * mount in dev ends in the same place, and a re-render of /scan, which hands the sheet a
 * new onClose every time, moves nothing.
 *
 * There is no DOM here, so the sheet is driven with the small hook runtime of
 * tests/privacy-delete-focus.test.ts (this one also keeps effect cleanups, which run on
 * unmount), with stand-in nodes for its elements and a document whose activeElement is
 * the stand-in that has focus.
 *
 * Found by the cycle 117 bug hunt; fixed in cycle 118.
 */

const rt = vi.hoisted(() => {
  type EffectSlot = { deps?: readonly unknown[]; cleanup?: () => void };
  const state = {
    slots: [] as unknown[],
    cursor: 0,
    effects: [] as Array<() => void>,
  };
  function useRef<T>(init: T) {
    const i = state.cursor++;
    if (!(i in state.slots)) state.slots[i] = { current: init };
    return state.slots[i] as { current: T };
  }
  function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]) {
    const i = state.cursor++;
    const prev = state.slots[i] as EffectSlot | undefined;
    const changed =
      !prev || !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((d, k) => !Object.is(d, prev.deps![k]));
    if (!changed) return;
    const slot: EffectSlot = { deps, cleanup: prev?.cleanup };
    state.slots[i] = slot;
    state.effects.push(() => {
      slot.cleanup?.();
      const cleanup = fn();
      slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    });
  }
  /** Every effect's cleanup, as on unmount (or Strict Mode's simulated one). */
  function cleanupAll() {
    for (const slot of state.slots as EffectSlot[]) {
      if (slot && "deps" in slot && slot.cleanup) {
        const cleanup = slot.cleanup;
        slot.cleanup = undefined;
        cleanup();
      }
    }
  }
  return { state, useRef, useEffect, cleanupAll };
});

vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return { ...real, useRef: rt.useRef, useEffect: rt.useEffect };
});

type Element = { type: unknown; props: Record<string, unknown> };
type FakeNode = { tag: string; text: string; role: unknown; focus(): void };

const CLOSE = t("닫기");

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

function focusable(el: Element) {
  const tag = el.type as string;
  if (typeof el.props.tabIndex === "number") return true;
  if (tag === "a") return typeof el.props.href === "string";
  return ["button", "input", "select", "textarea"].includes(tag) && !el.props.disabled;
}

let InfoSheet: (props: { staffMode: boolean; onClose: () => void }) => unknown;
let tree: unknown;
let mounted: FakeNode[] = [];
let attached = new Set<{ current: unknown }>();
let focused: FakeNode | null = null;
let keyListeners: Array<(event: { key: string }) => void> = [];
const currentElement = new Map<FakeNode, Element>();

// The /scan button that opens the sheet. It is outside the sheet and stays.
const opener: FakeNode = { tag: "button", text: t("사진과 데이터 사용 자세히 보기"), role: undefined, focus: () => void (focused = opener) };
// document.body: activeElement when nothing has focus. Its focus() moves nothing.
const body: FakeNode = { tag: "body", text: "", role: undefined, focus: () => {} };

/** Host elements by position: the sheet's tree has the same shape on every render. */
function commit(next: unknown) {
  for (const ref of attached) ref.current = null;
  attached = new Set();
  const elements = [...hostElements(next)];
  const nextMounted = elements.map((el, i) => {
    const node: FakeNode = mounted[i] ?? {
      tag: el.type as string,
      text: textOf(el),
      role: el.props.role,
      // As in a browser, focus() moves focus only to an element that can take it: a
      // control, or anything with a numeric tabIndex. A plain <div role="dialog">
      // ignores the call and focus stays where it was.
      focus() {
        if (focusable(currentElement.get(node)!)) focused = node;
      },
    };
    currentElement.set(node, el);
    const ref = el.props.ref;
    if (ref && typeof ref === "object" && "current" in ref) {
      (ref as { current: unknown }).current = node;
      attached.add(ref as { current: unknown });
    }
    return node;
  });
  // Removing the focused element from the document drops focus to <body>.
  if (focused && mounted.includes(focused) && !nextMounted.includes(focused)) focused = null;
  mounted = nextMounted;
}

let open = false;
let closeCount = 0;
const close = () => {
  closeCount++;
  unmount();
};

/** Render the sheet (again), commit it and run the effects whose deps changed. */
function render(onClose: () => void = close, { strictMount = false } = {}) {
  rt.state.cursor = 0;
  rt.state.effects = [];
  tree = InfoSheet({ staffMode: false, onClose });
  commit(tree);
  const effects = rt.state.effects;
  for (const effect of effects) effect();
  if (strictMount) {
    // Strict Mode in dev: mount, then a simulated unmount (cleanups), then mount again.
    rt.cleanupAll();
    for (const effect of effects) effect();
  }
}

function openSheet({ strictMount = false } = {}) {
  rt.state.slots = [];
  mounted = [];
  open = true;
  render(close, { strictMount });
}

/** /scan stops rendering the sheet: React removes its nodes, then runs the cleanups. */
function unmount() {
  if (!open) return;
  open = false;
  commit(null);
  rt.cleanupAll();
}

/** Focus the button with this exact label and activate it, the way Enter does. */
function press(label: string) {
  const button = [...hostElements(tree)].find((el) => el.type === "button" && textOf(el) === label);
  expect(button, `no "${label}" button in the sheet`).toBeTruthy();
  focused = mounted[[...hostElements(tree)].indexOf(button!)];
  (button!.props.onClick as () => void)();
}

beforeEach(async () => {
  keyListeners = [];
  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: (event: { key: string }) => void) => {
      if (type === "keydown") keyListeners.push(fn);
    },
    removeEventListener: (type: string, fn: (event: { key: string }) => void) => {
      if (type === "keydown") keyListeners = keyListeners.filter((listener) => listener !== fn);
    },
  });
  vi.stubGlobal("document", {
    body: Object.assign(body, { style: { overflow: "" } }),
    get activeElement() {
      return focused ?? body;
    },
  });
  rt.state.slots = [];
  mounted = [];
  attached = new Set();
  open = false;
  closeCount = 0;
  focused = opener;
  InfoSheet = (await import("@/app/scan/info-sheet")).InfoSheet as typeof InfoSheet;
});

afterEach(() => vi.unstubAllGlobals());

describe("/scan info sheet focus", () => {
  it("moves focus into the dialog when it opens", () => {
    openSheet();
    expect(focused, "the dialog opened but focus stayed on the control behind it").not.toBe(opener);
    expect(focused).toMatchObject({ role: "dialog" });
  });

  it("returns focus to the opener when 닫기 closes it", () => {
    openSheet();
    press(CLOSE);
    expect(closeCount).toBe(1);
    expect(focused, "닫기 closed the sheet and focus fell to <body>").not.toBeNull();
    expect(focused).toBe(opener);
  });

  it("returns focus to the opener when Escape closes it", () => {
    openSheet();
    for (const listener of keyListeners) listener({ key: "Escape" });
    expect(closeCount).toBe(1);
    expect(focused).toBe(opener);
  });

  it("returns focus to the opener when a tap on the backdrop closes it", () => {
    openSheet();
    const backdrop = [...hostElements(tree)].find((el) => el.props.role === "dialog");
    (backdrop!.props.onClick as () => void)();
    expect(closeCount).toBe(1);
    expect(focused).toBe(opener);
  });

  it("ends in the same place when Strict Mode runs the mount effects twice", () => {
    openSheet({ strictMount: true });
    expect(focused).toMatchObject({ role: "dialog" });
    press(CLOSE);
    expect(focused).toBe(opener);
  });

  it("moves nothing when /scan re-renders and hands the sheet a new onClose", () => {
    openSheet();
    // The visitor has Tabbed to 닫기; then the camera loop re-renders /scan.
    focused = mounted[[...hostElements(tree)].findIndex((el) => el.type === "button" && textOf(el) === CLOSE)];
    const closeButton = focused;
    render(() => close());
    expect(focused).toBe(closeButton);
  });
});
