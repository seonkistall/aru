import { describe, expect, it } from "vitest";
import { retentionAfterWeekFour, retentionAfterRevocation } from "@/lib/reengage";

describe("re-engagement retention", () => {
  it("retains contacts for 30 days after week four or revocation", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(retentionAfterWeekFour(100)).toBe(100 + 30 * day);
    expect(retentionAfterRevocation(200)).toBe(200 + 30 * day);
  });
});
