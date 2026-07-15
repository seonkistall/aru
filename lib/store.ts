import type { CareIntentKind, CareLocale } from "./care";
import type { MerchantId } from "./commerce";
import { DEVICE_DATA_KEY } from "./device-data";

export type Purchase = {
  id: string;
  sku_id: string;
  name: string;
  price: number;
  merchant?: MerchantId;
  placement?: string;
  href?: string;
  ts: number;
};
export type Checkin = {
  id: string;
  sku_id: string;
  week: 2 | 4;
  satisfaction: number;
  trouble: boolean;
  repurchase: boolean;
  ts: number;
};
export type CareIntent = {
  id: string;
  kind: CareIntentKind;
  label: string;
  href: string;
  locale: CareLocale;
  context?: string;
  sku_id?: string;
  merchant?: MerchantId;
  placement?: string;
  partner_ready?: boolean;
  region?: string;
  ts: number;
};

const PURCHASES_KEY = DEVICE_DATA_KEY.purchases;
const CHECKINS_KEY = DEVICE_DATA_KEY.checkins;
const CARE_INTENTS_KEY = DEVICE_DATA_KEY.careIntents;

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
}

function lsGet<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function lsPush<T>(key: string, value: T, max = 500) {
  if (typeof window === "undefined") return;
  const all = lsGet<T>(key);
  all.push(value);
  try {
    // Guard + cap like the sibling stores: a blocked/full localStorage must not
    // reject into the caller's click handler, and these arrays must not grow
    // unbounded toward the quota.
    localStorage.setItem(key, JSON.stringify(all.slice(-max)));
  } catch {
    /* best-effort */
  }
}

export async function recordPurchase(purchase: Omit<Purchase, "id" | "ts">): Promise<Purchase> {
  const rec: Purchase = { ...purchase, id: uid(), ts: Date.now() };
  lsPush(PURCHASES_KEY, rec);
  return rec;
}

export async function getPurchases(): Promise<Purchase[]> {
  return lsGet<Purchase>(PURCHASES_KEY).reverse();
}

export async function recordCheckin(checkin: Omit<Checkin, "id" | "ts">): Promise<Checkin> {
  const rec: Checkin = { ...checkin, id: uid(), ts: Date.now() };
  lsPush(CHECKINS_KEY, rec);
  return rec;
}

export async function getCheckins(): Promise<Checkin[]> {
  return lsGet<Checkin>(CHECKINS_KEY);
}

export async function recordCareIntent(intent: Omit<CareIntent, "id" | "ts">): Promise<CareIntent> {
  const rec: CareIntent = { ...intent, id: uid(), ts: Date.now() };
  lsPush(CARE_INTENTS_KEY, rec);
  return rec;
}

export function getCareIntents(): CareIntent[] {
  return lsGet<CareIntent>(CARE_INTENTS_KEY).reverse();
}

export function careIntentCount(): number {
  return lsGet<CareIntent>(CARE_INTENTS_KEY).length;
}

export function exportCareIntents() {
  const rows = getCareIntents();
  const header = ["id", "kind", "label", "href", "locale", "context", "sku_id", "merchant", "placement", "partner_ready", "region", "ts"];
  const esc = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => esc(row[key as keyof CareIntent])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gyeol-care-intents-${rows.length}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function clearCareIntents() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CARE_INTENTS_KEY);
}
