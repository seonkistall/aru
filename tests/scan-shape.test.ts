import { afterEach, describe, expect, it } from "vitest";
import { DEVICE_DATA_KEY } from "@/lib/device-data";
import { recommend, type ScanReads, type Survey } from "@/lib/recommend";
import { isScanReads, loadLastResult } from "@/lib/last-result";

/**
 * The `scan` half of `tests/survey-shape.test.ts`, on the same saved record.
 *
 * `survey` got a structural guard in cycle 32 and `reads` in cycle 33, both because a
 * wrong-shaped value THREW — `recommend()` at `survey.concerns`, the report at
 * `reads.oil.value` — and app/error.tsx took the page. `scan` is the third field and it
 * fails the other way: `shouldApplyScan` is
 * `Boolean(scan && !scan.retakeRecommended && (scan.confidence ?? 0.7) >= 0.58)`, so a
 * truthy non-reading sets `scanApplied` true, nothing throws, and the report says it
 * used the camera. Nothing on screen says otherwise.
 *
 * The screen-level consequence is measured in
 * `tests/e2e/saved-scan-shape.regression-32.spec.ts`.
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

const SURVEY: Survey = { type: "복합성", concerns: ["모공", "붉은기"], budget: 29000, avoid: ["향료"], category: "세럼" };

// Exactly the six fields `app/scan/use-capture-analysis.ts` writes to the scan key.
const GOOD = { oil: 2, redness: 1, pores: 1, confidence: 0.82, retakeRecommended: false, source: "roi" };

// Values no capture ever wrote. `lies` records what `shouldApplyScan` does with each
// one TODAY, unguarded: true means it sets `scanApplied` and the report claims the
// camera. `[]` and `{}` are the two a weaker `typeof scan === "object"` guard lets past,
// and both lie. The two `false` rows are refused by accident rather than by design —
// `"높음" >= 0.58` is false and `!"no"` is false — so the guard is what makes the
// refusal intentional, and the row is here so a later change to those expressions
// cannot quietly turn them into the first kind.
const WRONG_SHAPES: [string, unknown, boolean][] = [
  ["the number 1", 1, true],
  ["a string", "x", true],
  ["an empty array", [], true],
  ["an empty object", {}, true],
  ["true", true, true],
  ["an array of readings", [GOOD], true],
  ["a reading missing pores", { oil: 2, redness: 1, confidence: 0.82 }, true],
  ["a reading whose oil is a string", { ...GOOD, oil: "2" }, true],
  ["a reading whose confidence is a string", { ...GOOD, confidence: "높음" }, false],
  ["a reading whose retakeRecommended is a string", { ...GOOD, retakeRecommended: "no" }, false],
];

describe("isScanReads", () => {
  for (const [name, value, lies] of WRONG_SHAPES) {
    it(`rejects ${name}`, () => {
      expect(isScanReads(value)).toBe(false);
      // The defect itself, stated as the reason the guard exists: unguarded, the value
      // reaches recommend() and the result claims the camera was used.
      expect(recommend(SURVEY, value as ScanReads).scanApplied).toBe(lies);
      // Guarded, it never does, whichever of the two it was.
      expect(recommend(SURVEY, isScanReads(value) ? value : null).scanApplied).toBe(false);
    });
  }

  it("eight of the ten wrong shapes reach scanApplied today, which is the defect's size", () => {
    expect(WRONG_SHAPES.filter(([, , lies]) => lies).length).toBe(8);
  });

  it("accepts the reading the app writes, and recommend() still applies it", () => {
    expect(isScanReads(GOOD)).toBe(true);
    expect(recommend(SURVEY, GOOD).scanApplied).toBe(true);
  });

  it("accepts a reading with only the three levels, since the rest are optional in the type", () => {
    expect(isScanReads({ oil: 0, redness: 0, pores: 0 })).toBe(true);
  });

  it("accepts a reading whose source string this build does not know, which is not corruption", () => {
    // Structural only, the same rule as isSurvey/isSkinReads: an unknown source is a
    // usable reading, and rejecting it would throw away a real capture.
    expect(isScanReads({ ...GOOD, source: "roi-calibrated-v9" })).toBe(true);
  });

  it("rejects null, so the caller's no-scan path is not confused with a reading", () => {
    expect(isScanReads(null)).toBe(false);
    expect(isScanReads(undefined)).toBe(false);
  });

  it("keeps a low-confidence reading, because refusing it is shouldApplyScan's job, not the guard's", () => {
    const low = { ...GOOD, confidence: 0.4 };
    expect(isScanReads(low)).toBe(true);
    // And the result then says the photo was only a reference, which is the honest copy
    // this page already had for a bad capture.
    expect(recommend(SURVEY, low).scanApplied).toBe(false);
  });
});

describe("the saved record, which is what /report and /care fall back to in a fresh tab", () => {
  for (const [name, value] of WRONG_SHAPES) {
    it(`drops a scan that is ${name} and keeps the rest of the record`, () => {
      installStorage({
        [DEVICE_DATA_KEY.lastResult]: JSON.stringify({ survey: SURVEY, scan: value, reads: null, ts: 1 }),
      });
      const saved = loadLastResult();
      expect(saved).not.toBeNull();
      expect(saved?.scan).toBeNull();
      // The survey survives: a wrong-shaped scan must not cost the visitor their report.
      expect(saved?.survey.category).toBe("세럼");
      expect(saved?.ts).toBe(1);
      expect(recommend(saved!.survey, saved!.scan).scanApplied).toBe(false);
    });
  }

  it("keeps a real reading, so the guard does not cost a returning visitor their capture", () => {
    installStorage({
      [DEVICE_DATA_KEY.lastResult]: JSON.stringify({ survey: SURVEY, scan: GOOD, reads: null, ts: 1 }),
    });
    const saved = loadLastResult();
    expect(saved?.scan).toEqual(GOOD);
    expect(recommend(saved!.survey, saved!.scan).scanApplied).toBe(true);
  });

  it("drops a missing scan to null rather than leaving it undefined", () => {
    installStorage({
      [DEVICE_DATA_KEY.lastResult]: JSON.stringify({ survey: SURVEY, reads: null, ts: 1 }),
    });
    expect(loadLastResult()?.scan).toBeNull();
  });
});
