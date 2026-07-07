import { describe, expect, it } from "vitest";
import { getMlReadiness } from "@/lib/ml-readiness";

describe("getMlReadiness", () => {
  it("keeps ML in calibration when opt-in crops are not linked to enough pilot participants", () => {
    expect(getMlReadiness({ labels: 500, crops: 300, participants: 0 }).band).toBe("calibrate");
    expect(getMlReadiness({ labels: 500, crops: 300, participants: 4 }).band).toBe("calibrate");
  });

  it("allows the first training band only after the participant coverage gate passes", () => {
    expect(getMlReadiness({ labels: 500, crops: 300, participants: 5 }).band).toBe("train");
  });
});
