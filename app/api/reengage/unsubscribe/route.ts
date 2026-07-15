import { retentionAfterRevocation } from "@/lib/reengage";
import { verifyUnsubscribeToken } from "@/lib/server/unsubscribe-token";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  let token = "";
  try { token = ((await request.json()) as { token?: string }).token || ""; }
  catch { return Response.json({ ok: false }, { status: 400 }); }
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, reason: "not configured" }, { status: 503 });
  const verified = verifyUnsubscribeToken(token, secret);
  if (!verified) return Response.json({ ok: false, reason: "invalid token" }, { status: 400 });
  const admin = await getSupabaseAdmin();
  if (!admin) return Response.json({ ok: false, reason: "not configured" }, { status: 503 });
  const now = Date.now();
  const { error } = await admin.from("reengage_contacts").update({ consent: false, revoked_at: new Date(now).toISOString(), retention_until: new Date(retentionAfterRevocation(now)).toISOString() }).eq("email", verified.email);
  return Response.json({ ok: !error }, { status: error ? 500 : 200 });
}
