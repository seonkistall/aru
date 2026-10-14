import { describe, expect, it, vi } from "vitest";
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

// Once crops fill the shared quota, the label written first is refused and the crop
// written second succeeds by evicting its own oldest crops. The label gets one retry
// into the space the crop save freed (cycle 116 hunt).
describe("commitFeedbackSample after the crop save frees space", () => {
  it("retries a refused label once the crop save has succeeded", () => {
    let room = false;
    let labelCalls = 0;
    const result = commitFeedbackSample(base, {
      saveLabel: () => {
        labelCalls += 1;
        return room;
      },
      saveCropSample: () => {
        room = true; // evicted old crops to fit
        return true;
      },
      labelCount: () => 5,
      cropSampleCount: () => 3,
    });

    expect(labelCalls).toBe(2);
    expect(result.labelSaved).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("does not retry when the crop save failed too, or when there was no crop", () => {
    let labelCalls = 0;
    const deps = {
      saveLabel: () => {
        labelCalls += 1;
        return false;
      },
      saveCropSample: () => false,
      labelCount: () => 0,
      cropSampleCount: () => 0,
    };
    commitFeedbackSample(base, deps);
    expect(labelCalls).toBe(1);

    labelCalls = 0;
    commitFeedbackSample({ ...base, cropDataUrl: null }, deps);
    expect(labelCalls).toBe(1);
  });
});

// The same retry against the real stores and a localStorage that enforces a quota, so
// the test cannot assume more room than the crop save actually frees (the cycle 116
// review). Counted the way Chrome counts: key plus value, in UTF-16 units.
describe("commitFeedbackSample on a full device store", () => {
  const QUOTA = 400_000;
  const data = new Map<string, string>();
  const used = () => [...data].reduce((sum, [key, value]) => sum + key.length + value.length, 0);
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      const before = data.get(key);
      data.set(key, value);
      if (used() > QUOTA) {
        if (before === undefined) data.delete(key);
        else data.set(key, before);
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
    },
    removeItem: (key: string) => void data.delete(key),
  };

  async function realDeps() {
    const labels = await import("@/lib/labels");
    const crops = await import("@/lib/crops");
    return { saveLabel: labels.saveLabel, saveCropSample: crops.saveCropSample, labelCount: labels.labelCount, cropSampleCount: crops.cropSampleCount };
  }

  it("keeps the label when the new crop is smaller than the one it evicts", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", storage);
    try {
      const deps = await realDeps();
      const crop = (chars: number) => `data:image/jpeg;base64,${"A".repeat(chars)}`;
      // Fill with 20,000-char crops until the crop store starts evicting.
      for (let i = 0; i < 40 && used() < QUOTA - 25_000; i++) commitFeedbackSample({ ...base, cropDataUrl: crop(20_000) }, deps);
      // Use up the slack so the next label is refused before the crop save.
      while (deps.saveLabel(base.sample)) { /* fill */ }

      const before = deps.labelCount();
      const result = commitFeedbackSample({ ...base, cropDataUrl: crop(17_000) }, deps);

      expect(result.cropSaved).toBe(true);
      expect(result.labelSaved).toBe(true);
      expect(deps.labelCount()).toBe(before + 1);
    } finally {
      vi.unstubAllGlobals();
      data.clear();
    }
  });
});
