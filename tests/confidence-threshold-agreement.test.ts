import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { confidenceLabel, overallFor, type Bucket, type SkinLevel } from "@/lib/skin";
import { confidenceLabelFor } from "@/app/scan/capture-analysis";

/**
 * The 0.58 confidence floor lives in FIVE places, and nothing held them together.
 *
 *   lib/skin.ts                   confidenceLabel()      낮음 below it
 *   lib/skin.ts                   overallFor()           재촬영 권장 below it
 *   lib/skin.ts                   retakeRecommended      true below it
 *   app/scan/capture-analysis.ts  confidenceLabelFor()   낮음 below it
 *   app/scan/capture-analysis.ts  retakeRecommended      true below it
 *
 * tests/confidence-label-contract.test.ts holds the two LABELS together, so moving
 * the number in both of them stayed green while a scan at 0.59 rendered 낮음 in the
 * confidence chip next to 대체로 안정 in the 전반 row with retakeRecommended false —
 * one screen disagreeing with itself, the same defect
 * tests/vision-merge-consistency.test.ts exists to prevent, one field over.
 *
 * Two of the five are not exported (they are inline expressions inside
 * readsFromRaw and mergeVisionAnalysis), so this file pins the exported three
 * behaviourally and all five as source literals. Deliberately separate from the
 * label contract test, whose scope the supervisor set.
 */

const root = resolve(import.meta.dirname, "..");
const bucket = (level: SkinLevel): Bucket => ({ value: "x", level, calm: level === 0, confidence: 0.9 });

/** Every `< 0.58` / `>= 0.58` literal in a file, with enough context to name the site. */
function thresholdLiterals(file: string, patterns: RegExp[]): number[] {
  const source = readFileSync(resolve(root, file), "utf8");
  return patterns.map((pattern) => {
    const match = source.match(pattern);
    expect(match, `${file}: no site matching ${pattern} — the code moved, so this test is blind`).toBeTruthy();
    return Number(match![1]);
  });
}

describe("the confidence floor agrees across all five of its sites", () => {
  it("puts the label boundary and the 전반 boundary in the same place", () => {
    // Sweep finely enough that a boundary moved by 0.001 is caught.
    let lowCount = 0;
    let retakeCount = 0;
    for (let i = 0; i <= 2000; i += 1) {
      const c = i / 2000;
      const isLow = confidenceLabel(c) === "낮음";
      const isRetake = overallFor(bucket(0), bucket(0), bucket(0), c).value === "재촬영 권장";
      expect(confidenceLabelFor(c), `the two label copies disagree at ${c}`).toBe(confidenceLabel(c));
      expect(isRetake, `confidence ${c}: label 낮음=${isLow} but 전반 재촬영 권장=${isRetake}`).toBe(isLow);
      if (isLow) lowCount += 1;
      if (isRetake) retakeCount += 1;
    }
    // Both boundaries must actually be inside the swept range: two functions that
    // never fire would agree trivially.
    expect(lowCount).toBeGreaterThan(0);
    expect(lowCount).toBeLessThan(2001);
    expect(retakeCount).toBe(lowCount);
  });

  it("holds at the boundary itself, where a strict/non-strict slip lives", () => {
    for (const epsilon of [1e-9, 1e-12]) {
      expect(confidenceLabel(0.58 - epsilon)).toBe("낮음");
      expect(overallFor(bucket(0), bucket(0), bucket(0), 0.58 - epsilon).value).toBe("재촬영 권장");
      expect(confidenceLabel(0.58)).not.toBe("낮음");
      expect(overallFor(bucket(0), bucket(0), bucket(0), 0.58).value).not.toBe("재촬영 권장");
    }
  });

  it("carries the same literal at all five sites", () => {
    const found = [
      ...thresholdLiterals("lib/skin.ts", [
        /if \(confidence >= ([0-9.]+)\) return "보통";/,
        /if \(confidence < ([0-9.]+)\) return \{ value: "재촬영 권장"/,
        /retakeRecommended: confidence < ([0-9.]+) \|\| retakeReasons\.length >= 2/,
      ]),
      ...thresholdLiterals("app/scan/capture-analysis.ts", [
        /if \(confidence >= ([0-9.]+)\) return "보통";/,
        /next\.retakeRecommended = next\.confidence < ([0-9.]+) \|\| next\.retakeReasons\.length >= 2/,
      ]),
    ];
    expect(found.length).toBe(5);
    expect(found.every(Number.isFinite), `parsed: ${found.join(", ")}`).toBe(true);
    expect(new Set(found).size, `the five sites carry: ${found.join(", ")}`).toBe(1);
  });
});
