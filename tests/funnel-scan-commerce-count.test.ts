import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { summarizeFunnel, type FunnelEvent } from "@/lib/funnel";

const root = resolve(__dirname, "..");

function ev(sessionId: string, kind: FunnelEvent["kind"]): FunnelEvent {
  return { id: `${sessionId}-${kind}`, kind, visitorId: "v", sessionId, ts: 0 };
}

/**
 * The /ops on-device headline reads "Of {N} completed scans, {M} reached an informed
 * purchase intent." with failurePreventionConversion as the big % under it. M used to
 * be `steps.commerce_clicked`, every session with any commerce click, including /care
 * clicks and survey-only sessions with no scan, while the % counts only clicks inside
 * completed-scan sessions. An operator who completed 2 scans, clicked from one, and
 * then clicked twice more from /care in fresh sessions read "Of 2 completed scans, 3
 * reached…" over 50%. Found by the cycle 114 bug hunt.
 */
describe("scanCommerceSessions", () => {
  const events = [
    ev("s1", "scan_completed"),
    ev("s1", "commerce_clicked"),
    ev("s2", "scan_completed"),
    ev("s3", "care_viewed"),
    ev("s3", "commerce_clicked"),
    ev("s4", "survey_completed"),
    ev("s4", "commerce_clicked"),
  ];

  it("counts only commerce clicks inside completed-scan sessions", () => {
    const summary = summarizeFunnel(events);
    expect(summary.steps.scan_completed).toBe(2);
    expect(summary.steps.commerce_clicked).toBe(3);
    expect(summary.scanCommerceSessions).toBe(1);
  });

  it("is the numerator of failurePreventionConversion, so the headline and its % agree", () => {
    const summary = summarizeFunnel(events);
    expect(summary.scanCommerceSessions / summary.steps.scan_completed).toBe(summary.failurePreventionConversion);
    expect(summary.scanCommerceSessions).toBeLessThanOrEqual(summary.steps.scan_completed);
  });

  it("is what the on-device headline prints", () => {
    const ops = readFileSync(resolve(root, "app/ops/page.tsx"), "utf8");
    expect(ops).toMatch(/completed scans, \{snapshot\.funnel\.scanCommerceSessions\} reached/);
  });
});
