import { afterEach, describe, expect, it } from "vitest";
import { DEVICE_DATA_KEY } from "@/lib/device-data";
import { funnelEventCount, getFunnelEvents, recordFunnelEvent } from "@/lib/funnel";

/**
 * The funnel store can hold something that parses and is not a list of events, and
 * before this file the two failure modes were treated differently for no reason.
 *
 * `getFunnelEvents` wraps `JSON.parse` in a try/catch, so a TRUNCATED value returns `[]`
 * and the next `recordFunnelEvent` overwrites the key — the store repairs itself and the
 * only loss is the events already in it. A value that PARSES to the wrong shape took no
 * such path: it was returned as-is, `recordFunnelEvent` called `.push` on it, the throw
 * landed in the outer catch that exists so analytics can never break the user flow, and
 * the function returned null. Nothing rewrites the key on that path, so every later event
 * on that device hit the same throw: one bad value switched the funnel off permanently and
 * silently, on the device, for the whole life of the install.
 *
 * `/api/sync` already rejects a non-array `funnelEvents` before it reaches the upsert
 * (tests/api-json-boundaries.test.ts) after the same shape got through once. This is the
 * device-side half of that hole.
 *
 * What two shipped analytics SDKs do with the same store, read from their own published
 * source on 2026-09-22 and written up in docs/funnel-store-shape.md: both guard by
 * truthiness at the consumer and neither validates the shape at the read. `Array.isArray`
 * at the read is stronger than either, and it is what makes the repair possible.
 */

const KEY = DEVICE_DATA_KEY.funnelEvents;

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
});

function installStorage(seed: Record<string, string> = {}) {
  const make = (data: Map<string, string>) => ({
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  });
  const local = new Map(Object.entries(seed));
  const session = new Map<string, string>();
  const localStorage = make(local);
  const sessionStorage = make(session);
  (globalThis as { window?: unknown }).window = { localStorage, sessionStorage };
  (globalThis as { localStorage?: unknown }).localStorage = localStorage;
  (globalThis as { sessionStorage?: unknown }).sessionStorage = sessionStorage;
  return local;
}

// Every one of these is valid JSON, so the try/catch never sees it.
const WRONG_SHAPES: [string, string][] = [
  ["null", "null"],
  ["a number", "5"],
  ["an object", '{"a":1}'],
  ["a string", '"abc"'],
  ["a boolean", "false"],
];

describe("the funnel store holding something that is not a list of events", () => {
  for (const [name, raw] of WRONG_SHAPES) {
    it(`reads as no events when the store holds ${name}`, () => {
      installStorage({ [KEY]: raw });
      expect(getFunnelEvents(), `getFunnelEvents() on ${name}`).toEqual([]);
      expect(funnelEventCount(), `funnelEventCount() on ${name}`).toBe(0);
    });

    it(`keeps recording, and repairs the store, when it holds ${name}`, () => {
      const store = installStorage({ [KEY]: raw });
      const event = recordFunnelEvent("scan_opened");
      expect(event, `recordFunnelEvent() returned null on ${name} — the funnel is off`).not.toBeNull();
      expect(event!.kind).toBe("scan_opened");

      // The repair: the bad value is gone, so the NEXT event is not lost either.
      const after = JSON.parse(store.get(KEY)!);
      expect(Array.isArray(after), `the store still holds ${name} after a write`).toBe(true);
      expect(after).toHaveLength(1);

      expect(recordFunnelEvent("scan_started")).not.toBeNull();
      expect(getFunnelEvents()).toHaveLength(2);
    });
  }

  // The behaviour the wrong-shape path is being brought into line with. If this ever
  // stops holding, the argument above is no longer the argument.
  it("already repaired itself when the store held a value that does not parse at all", () => {
    const store = installStorage({ [KEY]: "[{unterminated" });
    expect(getFunnelEvents()).toEqual([]);
    expect(recordFunnelEvent("home_viewed")).not.toBeNull();
    expect(JSON.parse(store.get(KEY)!)).toHaveLength(1);
  });

  // A real list is untouched by any of this.
  it("appends to a store that already holds events", () => {
    const seeded = [{ id: "a", kind: "home_viewed", visitorId: "v", sessionId: "s", ts: 1 }];
    const store = installStorage({ [KEY]: JSON.stringify(seeded) });
    expect(getFunnelEvents()).toHaveLength(1);
    expect(recordFunnelEvent("scan_opened")).not.toBeNull();
    expect(JSON.parse(store.get(KEY)!)).toHaveLength(2);
  });
});
