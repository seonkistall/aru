import { describe, expect, it } from "vitest";
import { commitFeedbackSample, type FeedbackSampleCommit } from "@/lib/feedback-storage";

const base: FeedbackSampleCommit = {
  sample: {
    ts: 1,
    features: { shine: 0.1, relRedness: 0.02, cov: 0.1, tzoneL: 120, cheekL: 118 },
    labels: { oil: 1, redness: 1, pores: 1 },
    source: "confirmed",
  },
  cropDataUrl: "data:image/jpeg;base64,abc",
};

describe("commitFeedbackSample", () => {
  it("reports success when label and crop save", () => {
    const result = commitFeedbackSample(base, {
      saveLabel: () => true,
      saveCropSample: () => true,
      labelCount: () => 4,
      cropSampleCount: () => 2,
    });

    expect(result.ok).toBe(true);
    expect(result.labelSaved).toBe(true);
    expect(result.cropSaved).toBe(true);
    expect(result.labelCount).toBe(4);
    expect(result.cropCount).toBe(2);
    expect(result.message).toContain("4번째");
  });

  it("does not claim success when storage rejects the label or crop", () => {
    const result = commitFeedbackSample(base, {
      saveLabel: () => false,
      saveCropSample: () => false,
      labelCount: () => 3,
      cropSampleCount: () => 1,
    });

    expect(result.ok).toBe(false);
    expect(result.labelSaved).toBe(false);
    expect(result.cropSaved).toBe(false);
    expect(result.message).toContain("저장하지 못했어요");
  });
});
