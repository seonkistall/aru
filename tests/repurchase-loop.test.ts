import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckinCard, CheckinDone, RepurchaseLink } from "@/app/checkin/page";
import { FUNNEL_ORDER, summarizeFunnel, type FunnelCountable } from "@/lib/funnel";
import { FUNNEL_PROP_KEYS, redactFunnelEvent } from "@/lib/funnel-contract";
import { SKUS } from "@/lib/skus";

const root = resolve(import.meta.dirname, "..");
const checkin = readFileSync(resolve(root, "app/checkin/page.tsx"), "utf8");
const SKU = SKUS[0];

/**
 * The repeat purchase is the difference between the two revenue architectures in
 * `scripts/revenue-model.mjs`, and the gap between them is a factor of three in the
 * traffic $10,000/month needs. Until 2026-09-21 the product asked "재구매 할래요?",
 * wrote the answer to localStorage, and said thank you.
 */
describe("the check-in asks about repurchase and then offers one", () => {
  // These render the components rather than grepping their source. The first version
  // of this file used `expect(source).toContain(...)`, and a review showed four of six
  // cases still passing with the render site deleted and RepurchaseLink left dead in
  // the file — a grep cannot see whether a component is mounted.
  it("routes the offer through /api/out so the click is attributable", () => {
    const html = renderToStaticMarkup(createElement(RepurchaseLink, { sku: SKU }));
    expect(html).toContain(`href="/api/out?sku=${SKU.id}&amp;merchant=`);
    expect(html).toContain("placement=checkin_repurchase");
  });

  it("carries the disclosure every commerce surface owes", () => {
    // 올리브영's curator terms withhold the payout when it is missing, so this is a
    // revenue precondition. Asserted on rendered output, not on an import.
    const html = renderToStaticMarkup(createElement(RepurchaseLink, { sku: SKU }));
    expect(html).toContain("ARU는 이 링크로 수수료를 받지 않아요");
  });

  it("marks the outbound link so it cannot pass ranking signal", () => {
    const html = renderToStaticMarkup(createElement(RepurchaseLink, { sku: SKU }));
    expect(html).toContain("sponsored");
    expect(html).toContain("nofollow");
  });

  it("records the intent, not only the click", () => {
    // A user who says 할래요 and does not tap through is the most interesting row in
    // the table: demand the funnel can see and the merchant link did not capture.
    expect(checkin).toContain('recordFunnelEvent("repurchase_intent"');
    expect(FUNNEL_ORDER).toContain("repurchase_intent");
  });

  it("mounts the offer when the answer was 할래요, and not otherwise", () => {
    // Both directions of the branch, rendered. Grepping the source could only ever
    // prove the component exists in the file, not that anything renders it.
    const offered = renderToStaticMarkup(createElement(CheckinDone, { showRepurchase: true, sku: SKU }));
    expect(offered).toContain("/api/out");
    expect(offered).toContain("checkin_repurchase");

    const notOffered = renderToStaticMarkup(createElement(CheckinDone, { showRepurchase: false, sku: SKU }));
    expect(notOffered).toContain("남겨주신 피드백을 저장했어요");
    expect(notOffered).not.toContain("/api/out");
  });

  it("shows no offer to a card answered on a previous visit", () => {
    // The gate that matters: `done` is also set from storage on mount, so a card
    // rendered as already-answered must NOT carry a buy link — re-offering a purchase
    // to someone who may already have made it is worse than staying quiet. A static
    // render runs no effects, which is exactly the returning-visitor state.
    const html = renderToStaticMarkup(
      createElement(CheckinCard, {
        productUse: { id: "u1", sku_id: SKU.id, name: SKU.name, confirmedUse: true as const, ts: 0 },
        done: true,
        onDone: () => {},
      })
    );
    expect(html).toContain("남겨주신 피드백을 저장했어요");
    expect(html).not.toContain("/api/out");
    expect(html).not.toContain("checkin_repurchase");
  });

  it("sends only bounded integers off the device", () => {
    expect(FUNNEL_PROP_KEYS.repurchase_intent).toEqual(["week", "satisfaction"]);
    const redacted = redactFunnelEvent({
      id: "e1",
      kind: "repurchase_intent",
      visitorId: "v",
      sessionId: "s",
      ts: Date.now(),
      props: { week: 4, satisfaction: 3, skuId: "tn1", note: "leaked free text" },
    });
    expect(redacted?.props).toEqual({ week: 4, satisfaction: 3 });
  });

  it("counts a repurchase click in the same funnel as a first purchase", () => {
    // `commerce_clicked` with a different placement, not a new kind: the revenue
    // model treats the two as the same event happening more than once per user, and
    // a separate kind would drop the repeat out of every existing ratio.
    const events: FunnelCountable[] = [
      { kind: "scan_completed", sessionId: "s1" },
      { kind: "commerce_clicked", sessionId: "s1" },
      { kind: "checkin_opened", sessionId: "s2" },
      { kind: "repurchase_intent", sessionId: "s2" },
      { kind: "commerce_clicked", sessionId: "s2" },
    ];
    const summary = summarizeFunnel(events);
    expect(summary.steps.repurchase_intent).toBe(1);
    expect(summary.steps.commerce_clicked).toBe(2);
  });
});
