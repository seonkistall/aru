import type { CareIntentKind, CareLocale } from "./care";
import type { MerchantId } from "./commerce";
import { DEVICE_DATA_KEY } from "./device-data";

export type ProductUse = {
  id: string;
  sku_id: string;
  name: string;
  confirmedUse: true;
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

// Keep the legacy key so device-data deletion also clears older click-derived
// rows. getProductUses excludes those rows because they lack confirmedUse.
const PRODUCT_USES_KEY = DEVICE_DATA_KEY.purchases;
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

function lsPush<T>(key: string, value: T, max = 500): boolean {
  if (typeof window === "undefined") return false;
  const all = lsGet<T>(key);
  all.push(value);
  try {
    // Guard + cap like the sibling stores: a blocked/full localStorage must not
    // reject into the caller's click handler, and these arrays must not grow
    // unbounded toward the quota.
    localStorage.setItem(key, JSON.stringify(all.slice(-max)));
    return true;
  } catch {
    return false;
  }
}

export async function recordProductUse(input: Omit<ProductUse, "id" | "ts" | "confirmedUse">): Promise<ProductUse | null> {
  const rec: ProductUse = { ...input, confirmedUse: true, id: uid(), ts: Date.now() };
  return lsPush(PRODUCT_USES_KEY, rec) ? rec : null;
}

export async function getProductUses(): Promise<ProductUse[]> {
  return lsGet<ProductUse>(PRODUCT_USES_KEY)
    .filter((record) => record.confirmedUse === true)
    .reverse();
}

// Returns null when the write was refused, the same as recordProductUse. The earlier
// version threw lsPush's boolean away and handed back a fully-populated Checkin, so a
// caller could not tell a stored answer from a dropped one — and /checkin's card then
// told the user "남겨주신 피드백을 저장했어요." over an empty store. lsPush returns
// false rather than throwing on purpose (a blocked or full localStorage must not
// reject into a click handler), which only works if the caller reads it.
export async function recordCheckin(checkin: Omit<Checkin, "id" | "ts">): Promise<Checkin | null> {
  const rec: Checkin = { ...checkin, id: uid(), ts: Date.now() };
  return lsPush(CHECKINS_KEY, rec) ? rec : null;
}

export async function getCheckins(): Promise<Checkin[]> {
  return lsGet<Checkin>(CHECKINS_KEY);
}

// Returns null on a refused write, like both siblings above. It used to discard
// lsPush's boolean and hand back a fully-populated CareIntent, so a blocked or full
// localStorage produced a silently short care-intent log that nothing could detect —
// `careIntentCount` under-reports and no caller can tell.
//
// Unlike /checkin, the screen deliberately does NOT surface this. `openCareLink`
// (app/care/page.tsx) records the intent and then opens the merchant link either way;
// the user's actual action succeeds whether or not the log write did, so an error row
// would report a failure that did not happen to them. The signal exists for the
// caller that needs it, and the UI question the backlog raised is answered here rather
// than left implied.
export async function recordCareIntent(intent: Omit<CareIntent, "id" | "ts">): Promise<CareIntent | null> {
  const rec: CareIntent = { ...intent, id: uid(), ts: Date.now() };
  return lsPush(CARE_INTENTS_KEY, rec) ? rec : null;
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
