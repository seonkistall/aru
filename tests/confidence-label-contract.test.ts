import { describe, expect, it } from "vitest";
import { confidenceLabel } from "@/lib/skin";
import { confidenceLabelFor } from "@/app/scan/capture-analysis";

/**
 * The confidence label exists twice: `confidenceLabel` in lib/skin.ts is what the ROI
 * and ML paths write, and `confidenceLabelFor` in app/scan/capture-analysis.ts is what
 * `mergeVisionAnalysis` writes when a vision key is configured. Today they are
 * identical, so nothing is broken — which is exactly why a drift would be silent: move
 * one threshold and, for the same confidence, a user with the vision path enabled is
 * told 높음 while a user without it is told 보통, from one scan of one face.
 *
 * A contract test rather than a merge: the two call sites have different shapes, and
 * `docs/AUTOPILOT.md` has an open item that may yet change the thresholds or drop the
 * label to two levels. Whatever that decision is, it has to be made in both places, so
 * this pins the agreement and the ordering rather than the numbers.
 *
 * Scope, stated so it is not mistaken for more than it is: `0.58` appears five times —
 * these two labels, `overallFor`'s 재촬영 권장 branch, and `retakeRecommended` in each
 * of the two files. This holds the two LABEL copies together and nothing else, so
 * moving 0.58 in both of them still passes while leaving a scan at 0.59 reading
 * 낮음 next to 대체로 안정 and `retakeRecommended: false`. Covering all five is a
 * separate test and is in the backlog.
 */
describe("confidenceLabel agrees across the two analysis paths", () => {
  // 0 to 1 in 0.0005 steps, plus the exact boundaries and their neighbours, where a
  // >= / > slip lives and a coarse sweep would step straight over it.
  const sweep = (() => {
    const values = new Set<number>();
    for (let i = 0; i <= 2000; i += 1) values.add(i / 2000);
    for (const edge of [0.58, 0.78]) {
      for (const delta of [-1e-9, -1e-12, 0, 1e-12, 1e-9]) values.add(edge + delta);
    }
    // Out of range on both sides: neither function clamps, and a caller one day might
    // not either.
    for (const outside of [-1, -0.001, 1.001, 2]) values.add(outside);
    return [...values].sort((a, b) => a - b);
  })();

  it("returns the same label for every value in a 0.0005 sweep and at both boundaries", () => {
    const disagreements = sweep
      .filter((value) => confidenceLabel(value) !== confidenceLabelFor(value))
      .map((value) => `${value}: skin.ts=${confidenceLabel(value)} capture-analysis.ts=${confidenceLabelFor(value)}`);
    expect(disagreements, `${disagreements.length} of ${sweep.length} values disagree`).toEqual([]);
  });

  it("never goes backwards as confidence rises", () => {
    const rank = { 낮음: 0, 보통: 1, 높음: 2 } as const;
    for (const label of [confidenceLabel, confidenceLabelFor]) {
      const ascending = sweep.filter((value) => value >= 0 && value <= 1);
      for (let i = 1; i < ascending.length; i += 1) {
        expect(
          rank[label(ascending[i])],
          `${label.name} dropped from ${label(ascending[i - 1])} at ${ascending[i - 1]} to ${label(ascending[i])} at ${ascending[i]}`
        ).toBeGreaterThanOrEqual(rank[label(ascending[i - 1])]);
      }
    }
  });

  it("uses all three labels, so the two cannot agree by both being constant", () => {
    for (const label of [confidenceLabel, confidenceLabelFor]) {
      expect(new Set(sweep.map(label)), label.name).toEqual(new Set(["낮음", "보통", "높음"]));
    }
  });

  // The boundaries are inclusive from below on both sides. Pinned as a pair rather
  // than as two numbers: if a cycle moves them, it has to move them here too, and
  // this file is the one place that says they must move together.
  it("puts both boundaries in the same place", () => {
    // Smallest value whose label is `target` or better — for 보통 that means 보통 OR
    // 높음, which is what the second clause is for. Invariant: label(lo) is below
    // target, label(hi) is at or above it, so hi converges on the boundary from the
    // right. If a function went constant this would return 1 for both and the
    // comparison would be vacuous; the "uses all three labels" case above is what
    // rules that out.
    const boundary = (label: (value: number) => string, target: string) => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        if (label(mid) === target || (target === "보통" && label(mid) === "높음")) hi = mid;
        else lo = mid;
      }
      return hi;
    };
    for (const target of ["보통", "높음"]) {
      expect(boundary(confidenceLabel, target)).toBeCloseTo(boundary(confidenceLabelFor, target), 12);
    }
  });
});
