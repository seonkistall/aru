import { getSupabase, hasSupabase } from "./supabase";
import type { CareIntentKind, CareLocale } from "./care";
import type { MerchantId } from "./commerce";

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

function lsPush<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  const all = lsGet<T>(key);
  all.push(value);
  localStorage.setItem(key, JSON.stringify(all));
}

async function insertOrLocal<T>(table: string, key: string, value: T) {
  const supabase = await getSupabase();
  if (hasSupabase && supabase) {
    try {
      const { error } = await supabase.from(table).insert(value as never);
      if (!error) return;
    } catch {}
  }
  lsPush(key, value);
}

export async function recordPurchase(purchase: Omit<Purchase, "id" | "ts">): Promise<Purchase> {
  const rec: Purchase = { ...purchase, id: uid(), ts: Date.now() };
  await insertOrLocal("purchases", "gyeol_purchases", rec);
  return rec;
}

export async function getPurchases(): Promise<Purchase[]> {
  const supabase = await getSupabase();
  if (hasSupabase && supabase) {
    const { data, error } = await supabase.from("purchases").select("*").order("ts", { ascending: false });
    if (!error) return (data as Purchase[]) ?? [];
  }
  return lsGet<Purchase>("gyeol_purchases").reverse();
}

export async function recordCheckin(checkin: Omit<Checkin, "id" | "ts">): Promise<Checkin> {
  const rec: Checkin = { ...checkin, id: uid(), ts: Date.now() };
  await insertOrLocal("checkins", "gyeol_checkins", rec);
  return rec;
}

export async function getCheckins(): Promise<Checkin[]> {
  const supabase = await getSupabase();
  if (hasSupabase && supabase) {
    const { data, error } = await supabase.from("checkins").select("*");
    if (!error) return (data as Checkin[]) ?? [];
  }
  return lsGet<Checkin>("gyeol_checkins");
}

export async function recordCareIntent(intent: Omit<CareIntent, "id" | "ts">): Promise<CareIntent> {
  const rec: CareIntent = { ...intent, id: uid(), ts: Date.now() };
  await insertOrLocal("care_intents", "gyeol_care_intents", rec);
  return rec;
}

export function getCareIntents(): CareIntent[] {
  return lsGet<CareIntent>("gyeol_care_intents").reverse();
}

export function careIntentCount(): number {
  return lsGet<CareIntent>("gyeol_care_intents").length;
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
  localStorage.removeItem("gyeol_care_intents");
}
