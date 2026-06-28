import { supabase, hasSupabase } from "./supabase";

/**
 * Persistence for purchases + check-ins (② re-engagement, ④ Supabase).
 * Supabase when configured; localStorage fallback otherwise. Browser-only.
 */

export type Purchase = { id: string; sku_id: string; name: string; price: number; ts: number };
export type Checkin = {
  id: string;
  sku_id: string;
  week: 2 | 4;
  satisfaction: number; // 1..3 (별로/보통/좋음)
  trouble: boolean;
  repurchase: boolean;
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
function lsPush<T>(key: string, v: T) {
  if (typeof window === "undefined") return;
  const all = lsGet<T>(key);
  all.push(v);
  localStorage.setItem(key, JSON.stringify(all));
}

export async function recordPurchase(p: { sku_id: string; name: string; price: number }): Promise<Purchase> {
  const rec: Purchase = { ...p, id: uid(), ts: Date.now() };
  if (hasSupabase && supabase) await supabase.from("purchases").insert(rec);
  else lsPush("gyeol_purchases", rec);
  return rec;
}

export async function getPurchases(): Promise<Purchase[]> {
  if (hasSupabase && supabase) {
    const { data } = await supabase.from("purchases").select("*").order("ts", { ascending: false });
    return (data as Purchase[]) ?? [];
  }
  return lsGet<Purchase>("gyeol_purchases").reverse();
}

export async function recordCheckin(c: Omit<Checkin, "id" | "ts">): Promise<Checkin> {
  const rec: Checkin = { ...c, id: uid(), ts: Date.now() };
  if (hasSupabase && supabase) await supabase.from("checkins").insert(rec);
  else lsPush("gyeol_checkins", rec);
  return rec;
}

export async function getCheckins(): Promise<Checkin[]> {
  if (hasSupabase && supabase) {
    const { data } = await supabase.from("checkins").select("*");
    return (data as Checkin[]) ?? [];
  }
  return lsGet<Checkin>("gyeol_checkins");
}
