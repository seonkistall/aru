import { afterEach, describe, expect, it } from "vitest";
import { DEVICE_DATA_KEY } from "@/lib/device-data";
import { cropSampleCount, getCropSamples } from "@/lib/crops";
import { getLabels, labelCount } from "@/lib/labels";
import { getScanHistory, pushScanHistory, scanHistoryCount } from "@/lib/scan-history";

/**
 * The store half of `tests/e2e/report-device-store-shape.regression-13.spec.ts`.
 *
 * That spec proves the consequence in a browser — a wrong-shaped `aru_scan_history_v1`
 * throws inside `ScanHistoryStrip`'s render and `app/error.tsx` takes the whole
 * `/report` page, `/api/out` links included. This file pins the two things a browser
 * case cannot show cheaply: that `scanHistoryCount()` has no try/catch of its own, so
 * on `null` it used to throw at `.length` in whatever called it, and that guarding at
 * the READ is what makes the next write REPAIR the key rather than leave the device
 * broken for the life of the install.
 *
 * Same guard and same argument as `lib/funnel.ts` (cycle 29,
 * `docs/funnel-store-shape.md`): both shipped references read there guard at the
 * consumer, and neither repairs.
 */

const KEY = DEVICE_DATA_KEY.scanHistory;

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

function installStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  (globalThis as { localStorage?: unknown }).localStorage = localStorage;
  return data;
}

const ENTRY = { oil: 1, redness: 0, pores: 2, confidence: 0.7, ts: 1_700_000_000_000 };

// Valid JSON every one, so the try/catch at the read never sees them.
const WRONG_SHAPES: [string, string][] = [
  ["null", "null"],
  ["a number", "5"],
  ["an object", '{"a":1}'],
  ["a string", '"abcdef"'],
  ["a boolean", "false"],
];

describe("a scan history holding something that is not a list of scans", () => {
  for (const [name, raw] of WRONG_SHAPES) {
    it(`reads as no history, and counts zero, when the store holds ${name}`, () => {
      installStorage({ [KEY]: raw });
      expect(getScanHistory(), `getScanHistory() on ${name}`).toEqual([]);
      expect(scanHistoryCount(), `scanHistoryCount() on ${name}`).toBe(0);
    });

    it(`repairs the store on the next scan when it holds ${name}`, () => {
      const store = installStorage({ [KEY]: raw });
      pushScanHistory(ENTRY);
      expect(JSON.parse(store.get(KEY) ?? "null"), `the store was not rewritten over ${name}`).toEqual([ENTRY]);
      expect(scanHistoryCount(), `scanHistoryCount() after repairing over ${name}`).toBe(1);
    });
  }

  // The two controls that make this an inconsistency and not a preference: an
  // unparseable value already self-healed, and a real array was never affected.
  it("already self-healed when the value could not be parsed at all", () => {
    const store = installStorage({ [KEY]: '[{"oil":1},' });
    expect(getScanHistory()).toEqual([]);
    pushScanHistory(ENTRY);
    expect(JSON.parse(store.get(KEY) ?? "null")).toEqual([ENTRY]);
  });

  it("leaves a real history alone", () => {
    const earlier = { ...ENTRY, ts: ENTRY.ts - 86_400_000 };
    const store = installStorage({ [KEY]: JSON.stringify([earlier]) });
    expect(getScanHistory()).toEqual([earlier]);
    pushScanHistory(ENTRY);
    expect(JSON.parse(store.get(KEY) ?? "null")).toEqual([earlier, ENTRY]);
    expect(scanHistoryCount()).toBe(2);
  });
});

/**
 * The other two stores whose value reaches a React RENDER rather than an effect.
 *
 * `app/scan/feedback.tsx` seeds state with `useState(() => labelCount())` and
 * `useState(() => cropSampleCount())`. A lazy `useState` initialiser runs DURING render,
 * and neither count function has a try/catch of its own — both are `getX().length` —
 * so a stored `null` threw a TypeError inside the component rather than returning a
 * wrong number. What that does to the page was NOT reached in this container: the
 * `Feedback` panel mounts only after a capture produces reads, and there is no camera
 * here. The throw below is measured; the page-level consequence is reasoned from the
 * call site and is not claimed as observed.
 *
 * The four device stores NOT changed — `lib/consent.ts`, `lib/store.ts`,
 * `lib/pilot.ts`, `lib/funnel-flush.ts` — read the same idiom and are not claimed to be
 * safe. The consent store in particular must not be given this guard casually: "read as
 * empty" there means "no event in the audit trail", which is guardrail 4 and a decision
 * rather than a line.
 */
describe("the two research stores that a lazy useState initialiser reads during render", () => {
  const CROPS = DEVICE_DATA_KEY.cropSamples;
  const LABELS = DEVICE_DATA_KEY.labels;

  for (const [name, raw] of WRONG_SHAPES) {
    it(`counts zero instead of throwing in render when they hold ${name}`, () => {
      installStorage({ [CROPS]: raw, [LABELS]: raw });
      expect(getCropSamples(), `getCropSamples() on ${name}`).toEqual([]);
      expect(getLabels(), `getLabels() on ${name}`).toEqual([]);
      // These two are the calls inside the lazy initialisers, so a throw here is a
      // throw inside `Feedback`'s first render.
      expect(() => cropSampleCount(), `cropSampleCount() on ${name}`).not.toThrow();
      expect(() => labelCount(), `labelCount() on ${name}`).not.toThrow();
      expect(cropSampleCount()).toBe(0);
      expect(labelCount()).toBe(0);
    });
  }

  it("leaves real research rows alone", () => {
    const crop = { id: "c1", image: "data:,", labels: {}, features: {}, source: "self", ts: 1 };
    const label = { id: "l1", labels: {}, features: {}, source: "self", ts: 1 };
    installStorage({ [CROPS]: JSON.stringify([crop]), [LABELS]: JSON.stringify([label]) });
    expect(cropSampleCount()).toBe(1);
    expect(labelCount()).toBe(1);
  });
});
