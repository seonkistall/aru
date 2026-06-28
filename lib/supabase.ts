import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ④ Supabase — env-gated. With NEXT_PUBLIC_SUPABASE_URL + ANON_KEY set, writes go
 * to Postgres (cross-device, the data flywheel persists). Without them, lib/store
 * falls back to localStorage so the app still runs in dev with zero config.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabase = Boolean(url && anon);
export const supabase: SupabaseClient | null = hasSupabase ? createClient(url!, anon!) : null;
