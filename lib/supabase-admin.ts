import type { SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function isSupabaseSyncConfigured() {
  return Boolean(getSupabaseUrl() && getServiceRoleKey() && getSyncToken());
}

export async function getSupabaseAdmin() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) return null;
  if (!adminClient) {
    const { createClient } = await import("@supabase/supabase-js");
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

export function hasValidSyncToken(request: Request) {
  const expected = getSyncToken();
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const direct = request.headers.get("x-gyeol-sync-token") || "";
  return bearer === expected || direct === expected;
}

function getSupabaseUrl() {
  return [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL]
    .find((value): value is string => isValidSupabaseUrl(value));
}

function getServiceRoleKey() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) return undefined;
  const modern = /^sb_secret_[A-Za-z0-9_-]{32,}$/.test(value);
  const legacy = value.startsWith("eyJ") && value.length >= 100 && value.split(".").length === 3;
  return modern || legacy ? value : undefined;
}

function getSyncToken() {
  const value = process.env.SUPABASE_SYNC_TOKEN;
  return value && value === value.trim() && value.length >= 32 ? value : undefined;
}

function isValidSupabaseUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    return Boolean(url.hostname && (url.protocol === "https:" || localHttp));
  } catch {
    return false;
  }
}
