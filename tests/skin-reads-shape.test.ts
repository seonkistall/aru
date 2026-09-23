import { afterEach, describe, expect, it } from "vitest";
import { isSkinReads, loadLastResult, saveLastResult } from "@/lib/last-result";
import { DEVICE_DATA_KEY } from "@/lib/device-data";
import type { SkinReads } from "@/lib/skin";
import type { Survey } from "@/lib/recommend";

/**
 * The unit half of `tests/e2e/reads-shape.regression-17.spec.ts`. The browser half
 * measures what each wrong shape does to /report, /care, /studio and /survey; this half
 * pins the predicate itself, including the two deliberate holes in it — `source` is not
 * checked for membership and `extras` / `retakeReasons` elements are not checked, because
 * neither was measured to break anything.
 */

const VALID: SkinReads = {
  oil: { value: "유분 적정", level: 0, calm: true },
  pores: { value: "모공 보통", level: 1, calm: false },
  redness: { value: "붉은기 낮음", level: 0, calm: true },
  overall: { value: "전반 안정", level: 0, calm: true },
  headline: "오늘 피부는 안정적이에요",
  narrative: "전반적으로 안정적이에요.",
  confidence: 0.82,
  confidenceLabel: "보통",
  retakeRecommended: false,
  retakeReasons: [],
  signals: [{ label: "빛", ok: true, detail: "빛 충분" }],
  source: "roi-calibrated",
  raw: {} as SkinReads["raw"],
};

const VALID_SURVEY: Survey = { type: "지성", concerns: ["모공"], budget: 30000, avoid: [], category: "토너" };

// Same node-environment storage stub the other device-store shape tests use.
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

const patched = (patch: Record<string, unknown>) => ({ ...VALID, ...patch });

describe("isSkinReads accepts a real reading", () => {
  it("accepts the reading analyzeSkin produces", () => {
    expect(isSkinReads(VALID)).toBe(true);
  });

  it("accepts a reading carrying extras and retake reasons", () => {
    expect(
      isSkinReads(patched({ retakeRecommended: true, retakeReasons: ["빛 부족"], extras: [{ label: "결", value: "매끈", calm: true, note: "" }] })),
    ).toBe(true);
  });
});

describe("isSkinReads rejects every shape that took a screen", () => {
  // Each of these reached app/error.tsx on /report before the guard; the two partial
  // objects also reached it on /studio.
  const REJECTED: [string, unknown][] = [
    ["null", null],
    ["a number", 5],
    ["a string", "abcdef"],
    ["an empty object", {}],
    ["a boolean", true],
    ["an array", []],
    ["buckets that are strings", { ...VALID, oil: "많음", pores: "많음", redness: "많음", overall: "보통" }],
    ["oil only", { oil: VALID.oil }],
    ["a missing overall bucket", patched({ overall: undefined })],
    ["a bucket with no value", patched({ pores: { level: 1 } })],
    ["a bucket with no level", patched({ pores: { value: "모공 보통" } })],
    ["signals holding a number", patched({ signals: [5] })],
    ["signals holding a signal with no label", patched({ signals: [{ ok: true, detail: "d" }] })],
    ["signals that is not an array", patched({ signals: {} })],
    ["retakeReasons that is not an array", patched({ retakeReasons: "빛 부족" })],
    ["a non-finite confidence", patched({ confidence: Number.NaN })],
    ["a missing confidence", patched({ confidence: undefined })],
    ["a non-boolean retakeRecommended", patched({ retakeRecommended: "false" })],
    ["a missing headline", patched({ headline: undefined })],
  ];

  for (const [name, value] of REJECTED) {
    it(`rejects ${name}`, () => {
      expect(isSkinReads(value)).toBe(false);
    });
  }
});

describe("isSkinReads is structural and stops there", () => {
  // The same rule isSurvey follows: a reading whose `source` string this build no longer
  // knows still renders (SOURCE_LABEL[source] is undefined and the chip comes out empty),
  // and rejecting it would throw away a real reading, so membership is not tested.
  it("accepts a source this build does not know", () => {
    expect(isSkinReads(patched({ source: "made-up" }))).toBe(true);
  });

  it("accepts a confidenceLabel this build does not know", () => {
    expect(isSkinReads(patched({ confidenceLabel: "아주 높음" }))).toBe(true);
  });

  // Measured on /report, /care and /studio: neither of these throws or blanks a screen,
  // so neither is checked. If that ever changes, the e2e case is what will say so.
  it("accepts extras holding a non-extra", () => {
    expect(isSkinReads(patched({ extras: [5] }))).toBe(true);
  });

  it("accepts retakeReasons holding a non-string", () => {
    expect(isSkinReads(patched({ retakeReasons: [5] }))).toBe(true);
  });
});

describe("loadLastResult drops a wrong-shaped reads but keeps the record", () => {
  it("keeps a valid reads", () => {
    installStorage();
    saveLastResult({ survey: VALID_SURVEY, scan: null, reads: VALID, ts: 1 });
    expect(loadLastResult()?.reads).toEqual(VALID);
  });

  it("drops a wrong-shaped reads and still returns the survey", () => {
    installStorage({
      [DEVICE_DATA_KEY.lastResult]: JSON.stringify({ survey: VALID_SURVEY, scan: null, reads: 5, ts: 1 }),
    });
    const loaded = loadLastResult();
    expect(loaded).not.toBeNull();
    expect(loaded?.reads).toBeNull();
    expect(loaded?.survey).toEqual(VALID_SURVEY);
  });

  it("drops a partial reads that the old optional-chain test let through", () => {
    installStorage({
      [DEVICE_DATA_KEY.lastResult]: JSON.stringify({ survey: VALID_SURVEY, scan: null, reads: { oil: VALID.oil }, ts: 1 }),
    });
    expect(loadLastResult()?.reads).toBeNull();
  });

  it("still rejects the whole record when the survey is wrong-shaped", () => {
    installStorage({
      [DEVICE_DATA_KEY.lastResult]: JSON.stringify({ survey: 5, scan: null, reads: VALID, ts: 1 }),
    });
    expect(loadLastResult()).toBeNull();
  });
});

describe("the record rebuild in loadLastResult is not a pollution vector", () => {
  // docs/reads-shape-probe.md §4, read from the ECMA-262 source: JSON.parse makes
  // "__proto__" an ordinary own property (PropertyDefinitionEvaluation turns the proto
  // setter off under ParseJSON) and object spread copies it with CreateDataProperty
  // rather than Set (CopyDataProperties), so neither step reassigns a prototype.
  it("leaves Object.prototype alone when the stored record carries __proto__", () => {
    installStorage({
      [DEVICE_DATA_KEY.lastResult]: String.raw`{"__proto__":{"polluted":1},"survey":{"type":"지성","concerns":["모공"],"budget":30000,"avoid":[],"category":"토너"},"scan":null,"reads":5,"ts":1}`,
    });
    const loaded = loadLastResult();
    expect(loaded?.reads).toBeNull();
    expect(Object.getPrototypeOf(loaded as object)).toBe(Object.prototype);
    expect((({} as Record<string, unknown>).polluted)).toBeUndefined();
  });

  // Why the guard uses Number.isFinite and not the global isFinite: a confidence that
  // arrives out of a store as a string must not be coerced into a valid reading.
  it("rejects a confidence that arrives as a numeric string", () => {
    expect(isSkinReads(patched({ confidence: "0.82" }))).toBe(false);
    expect(isFinite("0.82" as unknown as number)).toBe(true);
  });
});
