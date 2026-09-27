import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { recommend, shouldApplyScan, type ScanReads, type Survey } from "@/lib/recommend";

/**
 * Two screens read the same sessionStorage `scan` record and used to answer differently
 * about whether it is usable. `/report` (via `recommend()` -> `shouldApplyScan`) defaulted
 * an absent `confidence` to 0.7 and applied the scan; `/survey`'s own copy of the
 * condition defaulted it to 0 and showed "촬영 조건이 충분하지 않아 …", the honest hint for
 * a photo it could not trust. On exactly one input — a reading with no `confidence` at all
 * — the visitor was told the photo was unusable and then handed picks whose every reason
 * opened "카메라에서 확인한 …".
 *
 * `/survey` now calls the exported `shouldApplyScan`, so there is one rule and no default
 * to keep in sync. This file pins both halves: the verdict itself, and the absence of a
 * second copy of the condition anywhere that reads the store.
 */

const SURVEY: Survey = { type: "지성", concerns: ["모공"], budget: 30000, avoid: [], category: "토너" };
const root = resolve(import.meta.dirname, "..");

// The case the two screens disagreed on: shaped like a reading, no `confidence` key.
const NO_CONFIDENCE: NonNullable<ScanReads> = { oil: 2, redness: 1, pores: 1, retakeRecommended: false };

describe("a reading with no confidence gets ONE verdict", () => {
  it("is applied, which is what the picks screen does with it", () => {
    expect(shouldApplyScan(NO_CONFIDENCE)).toBe(true);
    expect(recommend(SURVEY, NO_CONFIDENCE).scanApplied).toBe(true);
  });

  it("agrees with the same reading carrying the default it used to be given", () => {
    // `?? 0.7` is not an arbitrary constant: a record that spells the default out must get
    // the identical verdict, or the fallback is doing something the data cannot.
    expect(shouldApplyScan({ ...NO_CONFIDENCE, confidence: 0.7 })).toBe(shouldApplyScan(NO_CONFIDENCE));
    expect(recommend(SURVEY, { ...NO_CONFIDENCE, confidence: 0.7 }).scanApplied).toBe(
      recommend(SURVEY, NO_CONFIDENCE).scanApplied,
    );
  });

  it("still refuses the readings it should, so agreement is not achieved by always saying yes", () => {
    expect(shouldApplyScan({ ...NO_CONFIDENCE, confidence: 0.57 })).toBe(false);
    expect(shouldApplyScan({ ...NO_CONFIDENCE, retakeRecommended: true })).toBe(false);
    expect(shouldApplyScan(null)).toBe(false);
    expect(recommend(SURVEY, { ...NO_CONFIDENCE, confidence: 0.57 }).scanApplied).toBe(false);
  });

  it("puts the boundary in one place, at 0.58", () => {
    expect(shouldApplyScan({ ...NO_CONFIDENCE, confidence: 0.58 })).toBe(true);
    expect(shouldApplyScan({ ...NO_CONFIDENCE, confidence: 0.5799999 })).toBe(false);
  });
});

describe("no screen keeps its own copy of the condition", () => {
  const readers = ["app/survey/page.tsx", "app/report/page.tsx", "app/care/page.tsx"];

  it("/survey asks lib/recommend.ts for the verdict", () => {
    const src = readFileSync(resolve(root, "app/survey/page.tsx"), "utf8");
    expect(src).toContain("shouldApplyScan");
    expect(src).toContain('from "@/lib/recommend"');
  });

  it("no store reader compares confidence itself", () => {
    // The drift was a `confidence ?? <default>` beside a threshold. Any new one is the
    // same defect, so this fails on the shape rather than on the old literal.
    for (const file of readers) {
      const src = readFileSync(resolve(root, file), "utf8");
      const code = src
        .split("\n")
        .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
        .join("\n");
      expect(code, `${file} must not default confidence itself`).not.toMatch(/confidence\s*\?\?/);
      expect(code, `${file} must not hold its own confidence threshold`).not.toMatch(/confidence[^\n]*0\.58/);
    }
  });

  it("lib/recommend.ts holds exactly one such comparison", () => {
    const src = readFileSync(resolve(root, "lib/recommend.ts"), "utf8");
    const code = src.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    expect(code.match(/confidence\s*\?\?/g) ?? []).toHaveLength(1);
  });
});
