import { describe, expect, it } from "vitest";
import { captureGateDecision, mergeVisionAnalysis } from "@/app/scan/capture-analysis";
import type { Landmark, Quality } from "@/app/scan/types";
import type { SkinReads } from "@/lib/skin";

const landmarks: Landmark[] = [{ x: 0.5, y: 0.5 }];
const passingQuality: Quality = {
  face: true,
  centered: true,
  distance: true,
  brightness: true,
  noGlare: true,
  steady: true,
  skinReady: true,
  score: 6,
  message: "ready",
};

describe("capture gate decision", () => {
  it("blocks capture until the guide is ready", () => {
    expect(captureGateDecision({ guideState: "loading", landmarks, quality: passingQuality })).toBe("guide");
    expect(captureGateDecision({ guideState: "failed", landmarks, quality: passingQuality })).toBe("guide");
  });

  it("rejects missing landmarks and failed capture-frame quality", () => {
    expect(captureGateDecision({ guideState: "ready", landmarks: [] })).toBe("face");
    expect(captureGateDecision({ guideState: "ready", landmarks, quality: { ...passingQuality, skinReady: false } })).toBe("quality");
    expect(captureGateDecision({ guideState: "ready", landmarks, quality: passingQuality })).toBeNull();
  });
});

describe("vision merge", () => {
  it("preserves retake reasons and recomputes the retake decision", () => {
    const base = {
      oil: { value: "calm", level: 0, confidence: 0.6 },
      redness: { value: "calm", level: 0, confidence: 0.6 },
      pores: { value: "calm", level: 0, confidence: 0.6 },
      narrative: "local",
      source: "roi-calibrated",
      confidence: 0.7,
      retakeRecommended: false,
      retakeReasons: ["lighting", "movement"],
      // The merge recomputes the decision from `signals`, not from how many entries
      // `retakeReasons` holds — the burst wobble line lives in that array too.
      signals: [
        { label: "조명", ok: false, detail: "lighting" },
        { label: "반사", ok: true, detail: "반사가 크지 않아요" },
        { label: "피부 영역", ok: true, detail: "볼/T존 영역이 충분히 잡혔어요" },
      ],
    } as SkinReads;

    const merged = mergeVisionAnalysis(base, { labels: { oil: 2 }, confidence: { oil: 0.9 } });

    expect(merged.oil.level).toBe(2);
    expect(merged.retakeReasons).toEqual(["lighting", "movement"]);
    expect(merged.retakeRecommended).toBe(true);
    expect(merged.source).toBe("vision-api");
  });
});
