import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clinicLinks, productSearchLinks, type CareLink } from "@/lib/care";
import { DEVICE_DATA_KEY } from "@/lib/device-data";
import { getFunnelEvents, recordFunnelEvent } from "@/lib/funnel";
import { markFunnelEventsFlushed, pendingFunnelEvents } from "@/lib/funnel-flush";
import { t } from "@/lib/i18n/core";
import { SKUS } from "@/lib/skus";
import { careIntentCount, recordCareIntent } from "@/lib/store";

/**
 * /privacy's product and consultation link history missed every /report merchant click.
 *
 * The page says a retailer or consultation link click is stored on this device, shows
 * a count of those records and offers "제품·상담 링크 기록 삭제". The count and the button
 * read only the care intents, and only /care's openCareLink writes one. /report's
 * merchant links (ProductCard, placement "report_product"; the summary link,
 * "report_summary") write only a commerce_clicked row to the funnel store, and /care
 * writes that same row next to its care intent. So after /report clicks the page said
 * 0 records with the button disabled, and after the button every commerce_clicked row,
 * /care's included, was still on the device.
 *
 * The count now adds the commerce_clicked rows /care did not also record as a care
 * intent, counting a /care row whose purchase intent is gone (removed by the old
 * button, which cleared the intents alone, or never written because the store refused
 * it), and the button also removes every commerce_clicked row. The clicks below go
 * through the real writers with the placements the call sites pass; the /care pair
 * mirrors openCareLink (app/care/page.tsx). The page is driven with the hook runtime
 * from tests/privacy-delete-focus.test.ts.
 *
 * Found by the cycle 122 bug hunt.
 */

const rt = vi.hoisted(() => {
  const state = {
    slots: [] as unknown[],
    cursor: 0,
    effects: [] as Array<() => void>,
    dirty: false,
  };
  function useState<T>(init: T | (() => T)) {
    const i = state.cursor++;
    if (!(i in state.slots)) state.slots[i] = { value: typeof init === "function" ? (init as () => T)() : init };
    const slot = state.slots[i] as { value: T };
    const set = (next: T | ((prev: T) => T)) => {
      const value = typeof next === "function" ? (next as (prev: T) => T)(slot.value) : next;
      if (Object.is(value, slot.value)) return;
      slot.value = value;
      state.dirty = true;
    };
    return [slot.value, set] as const;
  }
  function useRef<T>(init: T) {
    const i = state.cursor++;
    if (!(i in state.slots)) state.slots[i] = { current: init };
    return state.slots[i] as { current: T };
  }
  function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]) {
    const i = state.cursor++;
    const prev = state.slots[i] as { deps?: readonly unknown[] } | undefined;
    const changed =
      !prev || !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((d, k) => !Object.is(d, prev.deps![k]));
    state.slots[i] = { deps };
    if (changed) state.effects.push(() => void fn());
  }
  return { state, useState, useRef, useEffect };
});

vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return { ...real, useState: rt.useState, useRef: rt.useRef, useEffect: rt.useEffect };
});

// The page subscribes to the language through context; there is no provider here.
vi.mock("@/lib/i18n", async () => {
  const core = await import("@/lib/i18n/core");
  return { t: core.t, useLanguage: () => ({}) };
});

type Element = { type: unknown; props: Record<string, unknown> };

const DELETE_LINK_HISTORY = t("제품·상담 링크 기록 삭제");
const countLine = (careTotal: number) => t("현재 제품·상담 링크 기록은 {careTotal}개예요.", { careTotal });

function isElement(value: unknown): value is Element {
  return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

function textOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (isElement(value)) return [value.props.children].flat(Infinity).map(textOf).join("");
  return "";
}

function* hostElements(value: unknown): Generator<Element> {
  if (Array.isArray(value)) {
    for (const item of value) yield* hostElements(item);
    return;
  }
  if (!isElement(value)) return;
  if (typeof value.type === "string") yield value;
  for (const child of [value.props.children].flat(Infinity)) yield* hostElements(child);
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

let Page: () => unknown;
let tree: unknown;

function render() {
  for (let pass = 0; pass < 20; pass++) {
    rt.state.cursor = 0;
    rt.state.dirty = false;
    rt.state.effects = [];
    tree = Page();
    for (const effect of rt.state.effects) effect();
    if (!rt.state.dirty) return;
  }
  throw new Error("the page kept re-rendering");
}

const [countBefore, countAfter] = countLine(987654321).split("987654321");

function linkCountText() {
  const line = [...hostElements(tree)].find((el) => el.type === "p" && textOf(el).startsWith(countBefore) && textOf(el).endsWith(countAfter));
  expect(line, "no link-record count on the page").toBeTruthy();
  return textOf(line);
}

function deleteLinkHistoryButton() {
  const button = [...hostElements(tree)].find((el) => el.type === "button" && textOf(el) === DELETE_LINK_HISTORY);
  expect(button, `no "${DELETE_LINK_HISTORY}" button on the page`).toBeTruthy();
  return button!;
}

function commerceRows() {
  return getFunnelEvents()
    .filter((event) => event.kind === "commerce_clicked")
    .map((event) => `${event.props?.placement}/${event.props?.merchant}`);
}

const sku = SKUS.find((candidate) => candidate.commerceLinks.length > 0)!;
const merchant = productSearchLinks(sku)[0].merchant!;

// /report: ProductCard and the summary link record only the funnel row.
function reportClick(placement: "report_product" | "report_summary") {
  recordFunnelEvent("commerce_clicked", { placement, merchant });
}

// /care: openCareLink's two writes, in its order.
async function careClick(link: CareLink) {
  await recordCareIntent({
    kind: link.kind,
    label: link.label,
    href: link.href,
    locale: "en",
    sku_id: link.skuId,
    merchant: link.merchant,
    placement: link.placement,
    region: link.region,
  });
  if (link.kind === "purchase") {
    recordFunnelEvent("commerce_clicked", { placement: link.placement ?? "care", merchant: link.merchant ?? "search" });
  }
}

beforeEach(async () => {
  const local = memoryStorage();
  const session = memoryStorage();
  vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  rt.state.slots = [];
  Page = (await import("@/app/privacy/page")).default as () => unknown;
});

afterEach(() => vi.unstubAllGlobals());

describe("/privacy product and consultation link history", () => {
  it("counts /report merchant clicks, which write no care intent, and enables the delete button", () => {
    reportClick("report_summary");
    reportClick("report_product");
    reportClick("report_product");
    reportClick("report_product");

    render();
    expect(linkCountText()).toBe(countLine(4));
    expect(deleteLinkHistoryButton().props.disabled).toBe(false);
  });

  it("counts each click once: /report clicks, /care purchase clicks (care intent and funnel row) and a /care clinic click", async () => {
    const carePurchase = productSearchLinks(sku, "care_en")[0];
    const clinic = clinicLinks("en")[0];
    reportClick("report_summary");
    reportClick("report_product");
    await careClick(carePurchase);
    await careClick(carePurchase);
    await careClick(clinic);
    // The default placement, used when productSearchLinks is called without one.
    await careClick(productSearchLinks(sku)[0]);

    render();
    expect(linkCountText()).toBe(countLine(6));
  });

  it("counts /care click rows left without their care intent, as the old button left them, and lets the button remove them", async () => {
    const carePurchase = productSearchLinks(sku, "care_en")[0];
    await careClick(carePurchase);
    await careClick(carePurchase);
    await careClick(clinicLinks("en")[0]);
    // What the old "delete link history" did: the intents went, the funnel rows stayed.
    localStorage.removeItem(DEVICE_DATA_KEY.careIntents);
    await careClick(clinicLinks("en")[0]);

    render();
    // Two orphaned /care rows plus the clinic intent written afterwards.
    expect(linkCountText()).toBe(countLine(3));
    expect(deleteLinkHistoryButton().props.disabled).toBe(false);

    (deleteLinkHistoryButton().props.onClick as () => void)();
    render();
    expect(commerceRows()).toEqual([]);
    expect(linkCountText()).toBe(countLine(0));
  });

  it("deletes every commerce_clicked row and care intent, keeps the other funnel rows, and leaves the flush cursor as it was", async () => {
    recordFunnelEvent("reco_viewed");
    reportClick("report_summary");
    reportClick("report_product");
    await careClick(productSearchLinks(sku, "care_en")[0]);
    await careClick(clinicLinks("en")[0]);
    recordFunnelEvent("care_viewed");
    const [recoViewed, firstReportClick] = getFunnelEvents();
    markFunnelEventsFlushed([recoViewed.id, firstReportClick.id]);
    const cursorBefore = localStorage.getItem(DEVICE_DATA_KEY.funnelFlushed);

    render();
    (deleteLinkHistoryButton().props.onClick as () => void)();
    render();

    expect(commerceRows(), "commerce_clicked rows left on the device after the delete").toEqual([]);
    expect(careIntentCount()).toBe(0);
    expect(getFunnelEvents().map((event) => event.kind)).toEqual(["reco_viewed", "care_viewed"]);
    expect(linkCountText()).toBe(countLine(0));
    expect(deleteLinkHistoryButton().props.disabled).toBe(true);
    expect(localStorage.getItem(DEVICE_DATA_KEY.funnelFlushed)).toBe(cursorBefore);
    expect(pendingFunnelEvents().map((event) => event.kind)).toEqual(["care_viewed"]);
  });
});
