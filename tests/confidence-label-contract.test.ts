import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ATTR_THRESHOLDS, confidenceLabel, distanceConfidence } from "@/lib/skin";
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
 * the open item this test was written alongside might have changed the thresholds or
 * dropped the label to two levels. Whatever that decision is, it has to be made in both
 * places, so the cases below this comment pin the agreement and the ordering rather
 * than the numbers.
 *
 * Cycle 14 made that decision — the label reports READING MARGIN, and the 높음 gate
 * moved from 0.78 to 0.8614 — so the second half of this file now also pins WHERE the
 * gate is and why, which the numbers-free cases above deliberately do not.
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
    for (const edge of [0.58, 0.8614]) {
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

  /**
   * Cycle 14's decision, pinned as a derivation rather than as a constant, so that a
   * cycle which changes `distanceConfidence`'s range or the 0.72/0.28 composition has
   * to come back here and decide what the gate means afterwards.
   */
  describe("the 높음 gate reports reading margin", () => {
    const root = resolve(import.meta.dirname, "..");
    const skinTs = readFileSync(resolve(root, "lib/skin.ts"), "utf8");

    // Same bisection as the case above, on one function; the agreement cases hold the
    // other to it.
    const gateOf = (label: (value: number) => string) => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        if (label(mid) === "높음") hi = mid;
        else lo = mid;
      }
      return hi;
    };

    // `attrConfidence * 0.72 + signalScore * 0.28`, with signalScore pinned below.
    const compose = (margin: number) => margin * 0.72 + 1 * 0.28;

    it("still composes confidence the way the derivation assumes", () => {
      // The gate below is derived FROM this line. If it changes, the derivation is
      // stale and the number has to be re-derived rather than carried forward.
      expect(skinTs).toContain("const confidence = clamp01((attrConfidence * 0.72 + signalScore * 0.28)");
      expect(skinTs).toContain("(burst ? 0.9 + 0.1 * meanAgreement : 1))");
    });

    it("bounds the reading-margin axis to [0.695, 0.92] on real thresholds", () => {
      // `distanceConfidence` is the whole axis: 0.695 is a reading sitting exactly on a
      // cut point, 0.92 one a half-span away. Swept on every published attribute's own
      // cuts rather than on invented ones.
      const seen: number[] = [];
      for (const [lo, hi] of Object.values(ATTR_THRESHOLDS)) {
        const span = hi - lo;
        for (let v = lo - 2 * span; v <= hi + 2 * span; v += span / 500) seen.push(distanceConfidence(v, lo, hi));
        seen.push(distanceConfidence(lo, lo, hi), distanceConfidence(hi, lo, hi), distanceConfidence((lo + hi) / 2, lo, hi));
      }
      expect(Math.min(...seen)).toBeCloseTo(0.695, 12);
      expect(Math.max(...seen)).toBeCloseTo(0.92, 12);
      // The midpoint of that axis is what it returns a quarter-span from the nearest
      // cut, and that is where the gate is placed.
      for (const [lo, hi] of Object.values(ATTR_THRESHOLDS)) {
        expect(distanceConfidence(lo + (hi - lo) * 0.25, lo, hi)).toBeCloseTo((0.695 + 0.92) / 2, 12);
      }
    });

    it("sits at the midpoint of the reachable range, where the old gate sat below its floor", () => {
      const floor = compose(0.695);
      const ceiling = compose(0.92);
      expect(floor).toBeCloseTo(0.7804, 10);
      expect(ceiling).toBeCloseTo(0.9424, 10);

      const gate = gateOf(confidenceLabel);
      expect(gate).toBeCloseTo(compose((0.695 + 0.92) / 2), 6);
      expect(gate).toBeCloseTo(0.8614, 10);

      // The defect this closes: 0.78 was BELOW the floor, so at full frame agreement
      // every capture whose signals all passed read 높음 whatever its reading margin,
      // and the label could only ever be moved by the burst multiplier.
      expect(0.78, "the old gate was below the reachable floor").toBeLessThan(floor);
      expect(gate).toBeGreaterThan(floor);
      expect(gate).toBeLessThan(ceiling);
      // Half the range on each side, so margin actually decides it.
      expect((ceiling - gate) / (ceiling - floor)).toBeCloseTo(0.5, 6);
    });

    it("demotes frame wobble from the deciding input to a nudge", () => {
      // Three frames, one attribute disagreeing on one of them: meanAgreement 8/9, so
      // the multiplier is 0.9 + 0.1 * 8/9. Under the old gate that dropped the floor
      // from 0.7804 to 0.7717 and so flipped EVERY well-captured scan from 높음 to
      // 보통. Under the new one it decides the label only inside a narrow band.
      const multiplier = 0.9 + 0.1 * ((1 + 1 + 2 / 3) / 3);
      const floor = compose(0.695);
      const ceiling = compose(0.92);
      const gate = gateOf(confidenceLabel);

      // What the old gate did, as arithmetic rather than as a call, because the gate
      // has moved: 0.78 sat under the full-agreement floor and over the wobbled one,
      // so this one wobble was the difference between 높음 and 보통 for EVERY capture.
      expect(floor).toBeGreaterThan(0.78);
      expect(floor * multiplier).toBeLessThan(0.78);
      expect(floor * multiplier).toBeCloseTo(0.7717, 4);

      // Readings this wobble moves across the gate: [gate, gate / multiplier).
      const band = Math.min(ceiling, gate / multiplier) - gate;
      expect(band / (ceiling - floor), `${band} of ${ceiling - floor}`).toBeLessThan(0.1);
      expect(confidenceLabel(gate * 1.0001)).toBe("높음");
      expect(confidenceLabel(gate * 1.0001 * multiplier)).toBe("보통");
      // ...and readings clear of that band keep their label through the same wobble.
      expect(confidenceLabel(ceiling)).toBe("높음");
      expect(confidenceLabel(ceiling * multiplier)).toBe("높음");
    });

    it("keeps the vision cap below the gate, so the two cannot drift apart unnoticed", () => {
      // `mergeVisionAnalysis` caps its own confidence at 0.86, which is 0.0014 below
      // the gate — so a vision-model confidence cannot reach 높음 on its own strength,
      // only through the Math.max that carries the ROI reading's margin. That is
      // arguably what the cap is for, but the two constants were chosen independently
      // and are close enough that moving either alone changes a whole path's label.
      const captureAnalysis = readFileSync(resolve(root, "app/scan/capture-analysis.ts"), "utf8");
      const cap = captureAnalysis.match(/Math\.min\((0\.\d+), visionConfidence/);
      expect(cap, "the vision confidence cap moved or was removed").toBeTruthy();
      const capValue = Number(cap![1]);
      expect(capValue).toBe(0.86);
      expect(confidenceLabelFor(capValue)).toBe("보통");
      expect(capValue).toBeLessThan(gateOf(confidenceLabelFor));
    });

    it("does not move the 0.58 gate, which three other call sites compare against", () => {
      expect(confidenceLabel(0.58)).toBe("보통");
      expect(confidenceLabel(0.58 - 1e-12)).toBe("낮음");
      expect(skinTs).toContain("return confidence < 0.58 || signals.some");
      expect(skinTs).toContain("if (confidence < 0.58) return { value: \"재촬영 권장\"");
    });
  });
});
