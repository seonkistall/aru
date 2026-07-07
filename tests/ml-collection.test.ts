import { describe, expect, it } from "vitest";
import { shouldKeepLearningCrop, shouldShowFeedback } from "@/lib/ml-collection";

describe("ML collection gating", () => {
  it("keeps a learning crop whenever the user granted learning consent", () => {
    expect(shouldKeepLearningCrop({ datasetConsent: true })).toBe(true);
    expect(shouldKeepLearningCrop({ datasetConsent: false })).toBe(false);
  });

  it("shows feedback for research staff or consented learning sessions after a scan result", () => {
    expect(shouldShowFeedback({ hasReads: true, staffMode: true, datasetConsent: false })).toBe(true);
    expect(shouldShowFeedback({ hasReads: true, staffMode: false, datasetConsent: true })).toBe(true);
    expect(shouldShowFeedback({ hasReads: false, staffMode: true, datasetConsent: true })).toBe(false);
  });
});
