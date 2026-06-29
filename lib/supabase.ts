const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabase = Boolean(url && anon);

/**
 * Supabase is env-gated. With NEXT_PUBLIC_SUPABASE_URL + publishable/anon key
 * set, product/check-in writes can go to Postgres. Without them, lib/store
 * falls back to localStorage so the app still runs in dev with zero config.
 */
export async function getSupabase() {
  if (!hasSupabase) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url!, anon!);
}
