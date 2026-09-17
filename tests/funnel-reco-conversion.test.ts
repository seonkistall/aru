import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { summarizeFunnel, type FunnelEvent } from "@/lib/funnel";
import { aggregateFunnelSource } from "@/lib/funnel-aggregate";

const root = resolve(__dirname, "..");

function ev(sessionId: string, kind: FunnelEvent["kind"]): FunnelEvent {
  return { id: `${sessionId}-${kind}`, kind, visitorId: "v", sessionId, ts: 0 };
}

/**
 * `recoCommerceRate` is the recommendation's own number.
 *
 * `failurePreventionConversion` divides commerce clicks by COMPLETED SCANS, so it
 * answers "does a scan lead anywhere": a session that completed a scan and never
 * opened /report sits in its denominator, and a survey-only session that saw a
 * recommendation and clicked through is in neither half of it. This one is
 * conditioned on `reco_viewed` the way `captureStart` is conditioned on
 * `scan_opened`, which is what makes it a statement about the reasons.
 */
describe("recoCommerceRate", () => {
  it("divides commerce clicks by reco views, not by completed scans", () => {
    const events = [
      ev("s1", "reco_viewed"),
      ev("s1", "commerce_clicked"),
      ev("s2", "reco_viewed"),
      // Completed a scan, never reached /report. In failurePreventionConversion's
      // denominator; in this one's, nowhere.
      ev("s3", "scan_completed"),
    ];
    expect(summarizeFunnel(events).recoCommerceRate).toBeCloseTo(0.5, 6);
  });

  it("cannot exceed 1: a click with no reco view is in neither half", () => {
    const events = [
      ev("s1", "reco_viewed"),
      ev("s1", "commerce_clicked"),
      // Survey-only and /care-only paths both reach commerce_clicked with no
      // reco_viewed. An unconditioned numerator would read 2/1 here.
      ev("s2", "commerce_clicked"),
      ev("s3", "care_viewed"),
      ev("s3", "commerce_clicked"),
    ];
    const summary = summarizeFunnel(events);
    expect(summary.steps.commerce_clicked).toBe(3);
    expect(summary.steps.reco_viewed).toBe(1);
    expect(summary.recoCommerceRate).toBe(1);
  });

  it("returns 0 rather than NaN when nothing viewed a reco", () => {
    const summary = summarizeFunnel([ev("s1", "scan_completed"), ev("s1", "commerce_clicked")]);
    expect(summary.recoCommerceRate).toBe(0);
    // /ops prints "—" for this case rather than "0% of reco views" — see the
    // zero-denominator rows in both panels.
    expect(summary.steps.reco_viewed).toBe(0);
  });

  it("leaves failurePreventionConversion alone: the two disagree on the same log", () => {
    const events = [
      // Completed a scan, saw the reco, clicked. In both numerators.
      ev("s1", "scan_completed"),
      ev("s1", "reco_viewed"),
      ev("s1", "commerce_clicked"),
      // Completed a scan and stopped. In the scan denominator only.
      ev("s2", "scan_completed"),
      // Survey-only: saw the reco and clicked, never scanned. In this denominator only.
      ev("s3", "reco_viewed"),
      ev("s3", "commerce_clicked"),
    ];
    const summary = summarizeFunnel(events);
    expect(summary.failurePreventionConversion).toBeCloseTo(0.5, 6); // 1 of 2 completed scans
    expect(summary.recoCommerceRate).toBe(1); // 2 of 2 reco views
  });

  it("counts a /care click inside a reco-viewed session — the decision, not an accident", () => {
    // commerce_clicked fires from /care as well as /report (its `placement` prop is
    // "care" there, "report_product"/"report_summary" on /report), and /care is
    // reachable from the nav on every page. The numerator is NOT filtered by
    // placement, so this session counts and the ratio reads 1 for a click that no
    // recommendation card produced. The ratio inflates in exactly this shape.
    //
    // Why it is not filtered: the server-side aggregate never selects `props`
    // (FUNNEL_AGGREGATE_COLUMNS is "kind, session_id, ts") and FunnelCountable has no
    // field for them. Filtering here would either widen that select list, undoing a
    // deliberate privacy narrowing, or make the two /ops panels print different
    // numbers under one label.
    const events: FunnelEvent[] = [
      { ...ev("s1", "reco_viewed"), props: { scanApplied: true, picks: 3 } },
      { ...ev("s1", "care_viewed") },
      { ...ev("s1", "commerce_clicked"), props: { placement: "care", merchant: "oliveyoung" } },
    ];
    expect(summarizeFunnel(events).recoCommerceRate).toBe(1);
  });

  it("is computed from rows that carry no props at all, so the server panel has it too", () => {
    // The shape PostgREST returns for the aggregate: kind, session_id, ts and nothing
    // else. If the ratio needed a prop it could not be computed here.
    const rows = [
      { kind: "reco_viewed", session_id: "p1", ts: 1 },
      { kind: "commerce_clicked", session_id: "p1", ts: 2 },
      { kind: "reco_viewed", session_id: "p2", ts: 3 },
      { kind: "reco_viewed", session_id: "p3", ts: 4 },
      { kind: "reco_viewed", session_id: "p4", ts: 5 },
    ];
    const aggregate = aggregateFunnelSource("public-funnel", rows, rows.length);
    expect(aggregate.summary.recoCommerceRate).toBe(0.25);
  });

  it("is rendered by both /ops panels", () => {
    // Checked rather than assumed: the two panels share summarizeFunnel but each
    // names the fields it prints, so a new ratio reaches neither screen on its own.
    const ops = readFileSync(resolve(root, "app/ops/page.tsx"), "utf8");
    expect(ops).toContain("snapshot.funnel.recoCommerceRate"); // on-device log
    expect(ops).toContain("source.summary.recoCommerceRate"); // per-source aggregate
    // Both print the denominator they divide by, so the number is not read as a
    // share of scans.
    expect(ops).toContain("of reco views");
  });
});
