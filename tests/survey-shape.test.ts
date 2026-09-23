import { afterEach, describe, expect, it } from "vitest";
import { DEVICE_DATA_KEY } from "@/lib/device-data";
import { isSurvey, recommend, type Survey } from "@/lib/recommend";
import { loadLastResult, saveLastResult } from "@/lib/last-result";

/**
 * The survey half of `tests/commerce-store-shape.test.ts`, on the same paying path.
 *
 * Cycles 29-31 guarded the LIST stores (`lib/funnel.ts`, `lib/scan-history.ts`,
 * `lib/crops.ts`, `lib/labels.ts`, `lib/store.ts`, `lib/pilot.ts`). The survey is the
 * one restored value that is neither a list nor consumed by the component that reads
 * it: `/report` and `/care` hand it to `recommend()`, which indexes five fields on it
 * without checking one of them. So this file measures, first, WHICH wrong shapes reach
 * a throw there — the reason the guard exists — and then that the guard rejects exactly
 * those and no legitimate survey.
 *
 * The page-level consequence (app/error.tsx over the report, commerce links and all) is
 * reproduced in a browser instead, in
 * `tests/e2e/commerce-survey-shape.regression-16.spec.ts`.
 */

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

const GOOD: Survey = { type: "지성", concerns: ["모공", "유분"], budget: 30000, avoid: ["향료"], category: "토너" };

// Valid JSON every one, so the try/catch at the read never sees them.
const WRONG_SHAPES: [string, unknown][] = [
  ["null", null],
  ["a number", 5],
  ["a string", "abcdef"],
  ["an empty object", {}],
  ["a boolean", true],
  ["an array", []],
  ["a survey with no avoid list", { type: "지성", concerns: ["모공"], budget: 30000, category: "토너" }],
  ["a survey with no concerns list", { type: "지성", budget: 30000, avoid: [], category: "토너" }],
  ["a survey whose concerns is a string", { type: "지성", concerns: "모공", budget: 30000, avoid: [], category: "토너" }],
  ["a survey whose budget is a string", { type: "지성", concerns: [], budget: "30000", avoid: [], category: "토너" }],
  ["a survey whose budget is null", { type: "지성", concerns: [], budget: null, avoid: [], category: "토너" }],
];

// Which of them throw, measured rather than assumed — eight do, and the other three are
// the reason the guard checks `budget` and `concerns` and not only the object itself:
// they return a full report scored off fields recommend() never actually read.
//
//   null                   -> THREW Cannot read properties of null (reading 'concerns')
//   a number               -> THREW Cannot read properties of undefined (reading 'includes')
//   a string               -> THREW Cannot read properties of undefined (reading 'includes')
//   an empty object        -> THREW Cannot read properties of undefined (reading 'includes')
//   a boolean              -> THREW Cannot read properties of undefined (reading 'includes')
//   an array               -> THREW Cannot read properties of undefined (reading 'includes')
//   no avoid list          -> THREW Cannot read properties of undefined (reading 'every')
//   no concerns list       -> THREW Cannot read properties of undefined (reading 'includes')
//   concerns is a string   -> OK picks=3 relaxed=null
//   budget is a string     -> OK picks=3 relaxed=null
//   budget is null         -> OK picks=3 relaxed=budget
const THROWS_IN_RECOMMEND = new Set([
  "null",
  "a number",
  "a string",
  "an empty object",
  "a boolean",
  "an array",
  "a survey with no avoid list",
  "a survey with no concerns list",
]);

describe("what recommend() does with a survey it should never have been given", () => {
  for (const [name, value] of WRONG_SHAPES) {
    it(`is rejected before recommend() sees ${name}`, () => {
      expect(isSurvey(value)).toBe(false);
    });

    it(`would ${THROWS_IN_RECOMMEND.has(name) ? "throw" : "answer off fields it never read"} on ${name}`, () => {
      if (THROWS_IN_RECOMMEND.has(name)) {
        // Inside /report's and /care's mount effect this throw is app/error.tsx over
        // the page, commerce links and all.
        expect(() => recommend(value as Survey, null)).toThrow(TypeError);
      } else {
        // No throw, a full report, and no field of the user's survey behind it — the
        // quieter half of the same defect, and why the guard checks the fields.
        expect(recommend(value as Survey, null).picks.length).toBe(3);
      }
    });
  }

  it("accepts the real survey the app writes, and recommend() answers on it", () => {
    expect(isSurvey(GOOD)).toBe(true);
    expect(recommend(GOOD, null).picks.length).toBeGreaterThan(0);
  });

  it("accepts a survey naming a category this build no longer ships, which is not corruption", () => {
    // Structural check only: recommend() returns no picks and /report renders its
    // no-picks branch. An enum check here would bounce that user to the survey instead.
    const older = { ...GOOD, category: "앰플" } as unknown as Survey;
    expect(isSurvey(older)).toBe(true);
    expect(recommend(older, null).picks.length).toBe(0);
  });

  it("accepts a survey carrying a concern id this build does not know", () => {
    const older = { ...GOOD, concerns: ["모공", "광채"] } as unknown as Survey;
    expect(isSurvey(older)).toBe(true);
    expect(recommend(older, null).picks.length).toBeGreaterThan(0);
  });
});

describe("the saved-result store, which is what both screens fall back to in a fresh tab", () => {
  for (const [name, value] of WRONG_SHAPES) {
    it(`reads as no saved result when its survey is ${name}`, () => {
      installStorage({ [DEVICE_DATA_KEY.lastResult]: JSON.stringify({ survey: value, scan: null, reads: null, ts: 1 }) });
      expect(loadLastResult()).toBeNull();
    });
  }

  for (const [name, value] of WRONG_SHAPES) {
    it(`reads as no saved result when the whole record is ${name}`, () => {
      installStorage({ [DEVICE_DATA_KEY.lastResult]: JSON.stringify(value) });
      expect(loadLastResult()).toBeNull();
    });
  }

  it("still returns a record whose survey is real", () => {
    installStorage();
    saveLastResult({ survey: GOOD, scan: null, reads: null, ts: 1758600000000 });
    expect(loadLastResult()?.survey).toEqual(GOOD);
  });

  it("reads as no saved result when the stored text is not JSON at all", () => {
    installStorage({ [DEVICE_DATA_KEY.lastResult]: "{not json" });
    expect(loadLastResult()).toBeNull();
  });
});
