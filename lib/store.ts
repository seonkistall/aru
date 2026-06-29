import { getSupabase, hasSupabase } from "./supabase";
import type { CareIntentKind, CareLocale } from "./care";

export type Purchase = { id: string; sku_id: string; name: string; price: number; ts: number };
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

export async function recordPurchase(purchase: { sku_id: string; name: string; price: number }): Promise<Purchase> {
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
