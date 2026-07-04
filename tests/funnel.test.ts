import { describe, expect, it } from "vitest";
import { funnelDropoff, summarizeFunnel, type FunnelEvent } from "@/lib/funnel";

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

describe("funnelDropoff", () => {
  it("computes retention-of-start and drop-from-previous per stage", () => {
    const events = [
      // 4 started, 3 completed scan, 2 finished survey, 1 clicked commerce.
      ev("s1", "scan_started"), ev("s2", "scan_started"), ev("s3", "scan_started"), ev("s4", "scan_started"),
      ev("s1", "scan_completed"), ev("s2", "scan_completed"), ev("s3", "scan_completed"),
      ev("s1", "survey_completed"), ev("s2", "survey_completed"),
      ev("s1", "reco_viewed"), ev("s2", "reco_viewed"),
      ev("s1", "commerce_clicked"),
    ];
    const stages = funnelDropoff(events);
    expect(stages.map((s) => s.kind)).toEqual([
      "scan_started", "scan_completed", "survey_completed", "reco_viewed", "commerce_clicked",
    ]);
    expect(stages[0].count).toBe(4);
    expect(stages[0].ofStart).toBe(1);
    expect(stages[0].dropFromPrev).toBe(0);
    expect(stages[1].count).toBe(3);
    expect(stages[1].ofStart).toBeCloseTo(0.75, 6);
    expect(stages[1].dropFromPrev).toBeCloseTo(0.25, 6);
    expect(stages[4].count).toBe(1);
    expect(stages[4].ofStart).toBeCloseTo(0.25, 6);
    expect(stages[4].dropFromPrev).toBeCloseTo(0.5, 6); // 1 of 2 reco viewers
  });

  it("stays at zero (no NaN) with no events", () => {
    const stages = funnelDropoff([]);
    expect(stages.every((s) => s.ofStart === 0 && s.dropFromPrev === 0)).toBe(true);
  });

  it("stays monotonic (<=100%) when later steps fire without a scan (survey-only path)", () => {
    // /care -> "설문만 하기" -> /survey -> /report -> /care, never scanning:
    // survey/reco/commerce fire but scan_started does not. A naive count-ratio
    // funnel would show >100% or 0% for active stages; the cumulative funnel
    // excludes non-scan sessions.
    const events = [
      ev("only", "survey_completed"),
      ev("only", "reco_viewed"),
      ev("only", "commerce_clicked"),
    ];
    const stages = funnelDropoff(events);
    expect(stages[0].count).toBe(0); // no scan started
    for (const s of stages) {
      expect(s.ofStart).toBeLessThanOrEqual(1);
      expect(s.ofStart).toBeGreaterThanOrEqual(0);
      expect(s.dropFromPrev).toBeGreaterThanOrEqual(0);
    }
  });

  it("never exceeds 100% even when a later step has more raw sessions than scan_started", () => {
    // 1 scanner + 2 survey-only visitors: raw survey_completed (3) > scan_started (1).
    const events = [
      ev("scanner", "scan_started"), ev("scanner", "scan_completed"), ev("scanner", "survey_completed"),
      ev("a", "survey_completed"),
      ev("b", "survey_completed"),
    ];
    const stages = funnelDropoff(events);
    expect(stages[0].count).toBe(1);
    // survey stage in the SCAN funnel = only the scanner who also surveyed.
    expect(stages[2].count).toBe(1);
    expect(stages[2].ofStart).toBe(1);
    expect(stages.every((s) => s.ofStart <= 1)).toBe(true);
  });
});
