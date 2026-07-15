import { describe, expect, it } from "vitest";
import { resolveCaptureConsent } from "@/app/scan/consent-authorization";
import type { ConsentEvent } from "@/lib/consent";

const event = (overrides: Partial<ConsentEvent> = {}): ConsentEvent => ({
  id: "1", kind: "ai_analysis", granted: true, version: "v", text: "t", ts: 1, ...overrides,
});

describe("capture consent authorization", () => {
  it("allows an unscoped grant for the consumer flow", () => {
    expect(resolveCaptureConsent([event()], "ai_analysis", true)?.id).toBe("1");
  });

  it("does not use an unscoped grant for a pilot session", () => {
    expect(resolveCaptureConsent([event()], "ai_analysis", true, { participantId: "P001", sessionId: "S1" })).toBeNull();
  });

  it("requires the exact participant and session", () => {
    const events = [event({ id: "wrong", participantId: "P001", sessionId: "S0" }), event({ id: "right", participantId: "P001", sessionId: "S1" })];
    expect(resolveCaptureConsent(events, "ai_analysis", true, { participantId: "P001", sessionId: "S1" })?.id).toBe("right");
  });

  it("requires the current UI choice and latest grant", () => {
    expect(resolveCaptureConsent([event()], "ai_analysis", false)).toBeNull();
    expect(resolveCaptureConsent([event(), event({ id: "2", granted: false, ts: 2 })], "ai_analysis", true)).toBeNull();
  });
});
