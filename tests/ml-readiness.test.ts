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

  it("does not tell the operator that zero more crops are needed for a band crops cannot unlock", () => {
    // app/ops/page.tsx renders the readiness panel's last line as
    //
    //   {readiness.minCropsForNextBand !== null && (
    //     <p>Crops needed for next band: {Math.max(0, readiness.minCropsForNextBand - snapshot.crops)}</p>
    //   )}
    //
    // so a non-null value on the participant gate is a promise that collecting that
    // many crops moves the band. It does not: the branch above returns `calibrate`
    // for any crop count while fewer than five participants are linked, which the
    // first case in this file pins at 300 crops. With the gate reporting 30, /ops
    // printed "Crops needed for next band: 0" in exactly that state.
    const opsLine = (readiness: { minCropsForNextBand: number | null }, crops: number) =>
      readiness.minCropsForNextBand === null ? null : Math.max(0, readiness.minCropsForNextBand - crops);

    for (const crops of [30, 100, 300, 500]) {
      const gated = getMlReadiness({ labels: 500, crops, participants: 4 });
      expect(gated.band, `${crops} crops, 4 participants`).toBe("calibrate");
      expect(
        opsLine(gated, crops),
        `at ${crops} crops and 4 participants /ops offers a crop target the band does not depend on; ` +
        "the participant link is the gate and nextAction is what says so"
      ).toBeNull();
    }

    // The crop-count bands are unaffected: there the number is a real target.
    const collecting = getMlReadiness({ labels: 500, crops: 12, participants: 5 });
    expect(collecting.band).toBe("calibrate");
    expect(opsLine(collecting, 12)).toBe(18);
  });
});
