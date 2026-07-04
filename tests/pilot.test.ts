import { describe, expect, it } from "vitest";
import { isPilotParticipantId, normalizeParticipantId } from "@/lib/pilot";

describe("normalizeParticipantId", () => {
  it("pads bare numbers and P-prefixed numbers to P0NN", () => {
    expect(normalizeParticipantId("7")).toBe("P007");
    expect(normalizeParticipantId("30")).toBe("P030");
    expect(normalizeParticipantId("p5")).toBe("P005");
  });
});

describe("isPilotParticipantId (P001-P030 only)", () => {
  it("accepts the full in-range roster", () => {
    for (const n of [1, 9, 10, 19, 20, 29, 30]) {
      expect(isPilotParticipantId(`P${String(n).padStart(3, "0")}`), `P00${n}`).toBe(true);
    }
  });

  it("rejects out-of-range ids (the old regex wrongly matched P031-P099)", () => {
    expect(isPilotParticipantId("P031")).toBe(false);
    expect(isPilotParticipantId("P045")).toBe(false);
    expect(isPilotParticipantId("P099")).toBe(false);
    expect(isPilotParticipantId("P000")).toBe(false);
  });
});
