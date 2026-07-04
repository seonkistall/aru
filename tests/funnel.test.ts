import { describe, expect, it } from "vitest";
import { summarizeFunnel, type FunnelEvent } from "@/lib/funnel";

function ev(sessionId: string, kind: FunnelEvent["kind"]): FunnelEvent {
  return { id: `${sessionId}-${kind}`, kind, visitorId: "v", sessionId, ts: 0 };
}

describe("summarizeFunnel", () => {
  it("counts unique sessions reaching each step", () => {
    const events = [
      ev("s1", "scan_started"),
      ev("s1", "scan_completed"),
      ev("s1", "commerce_clicked"),
      ev("s2", "scan_started"),
      ev("s2", "scan_completed"),
      ev("s3", "scan_started"), // bounced before completing
    ];
    const summary = summarizeFunnel(events);
    expect(summary.sessions).toBe(3);
    expect(summary.steps.scan_started).toBe(3);
    expect(summary.steps.scan_completed).toBe(2);
    expect(summary.steps.commerce_clicked).toBe(1);
  });

  it("computes failure-prevention conversion over completed scans", () => {
    const events = [
      ev("s1", "scan_completed"),
      ev("s1", "commerce_clicked"),
      ev("s2", "scan_completed"),
    ];
    // 1 of 2 completed scans reached a commerce click.
    expect(summarizeFunnel(events).failurePreventionConversion).toBeCloseTo(0.5, 6);
  });

  it("does not divide by zero when no scan completed", () => {
    const summary = summarizeFunnel([ev("s1", "scan_started")]);
    expect(summary.failurePreventionConversion).toBe(0);
    expect(summary.shareRate).toBe(0);
  });

  it("ignores commerce/share sessions that never completed a scan (ratio stays <= 1)", () => {
    const events = [
      ev("s1", "scan_completed"),
      ev("s1", "commerce_clicked"),
      // Survey-only session: reached commerce/share with no scan_completed.
      ev("s2", "commerce_clicked"),
      ev("s2", "share_clicked"),
    ];
    const summary = summarizeFunnel(events);
    // Only s1 completed a scan and clicked commerce → 1/1, not 2/1.
    expect(summary.failurePreventionConversion).toBe(1);
    expect(summary.shareRate).toBe(0); // s1 never shared; s2 doesn't count
  });

  it("dedupes repeated events within a session", () => {
    const events = [ev("s1", "scan_completed"), ev("s1", "scan_completed"), ev("s1", "commerce_clicked")];
    const summary = summarizeFunnel(events);
    expect(summary.steps.scan_completed).toBe(1);
    expect(summary.failurePreventionConversion).toBe(1);
  });
});
