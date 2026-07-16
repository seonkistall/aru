import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { reengageIdempotencyKey, reengageSecretsConfigured, retentionAfterWeekFour, sendReengageEmail } from "@/lib/reengage";
import { createUnsubscribeToken } from "@/lib/server/unsubscribe-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scheduled runner (Vercel Cron). Vercel adds `Authorization: Bearer <CRON_SECRET>`
// when CRON_SECRET is set. Safe no-op until both CRON_SECRET and RESEND_API_KEY
// are configured — it never sends without the owner explicitly enabling it.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH = 50;
const MAX_RUN_MS = 45_000;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const admin = await getSupabaseAdmin();
  if (!admin || !reengageSecretsConfigured()) {
    return Response.json({ ok: true, sent: 0, reason: "not fully configured (no-op)" });
  }

  const now = Date.now();
  const base = process.env.REENGAGE_LINK_BASE!;
  const link = base + "/checkin";
  const unsubscribeSecret = process.env.UNSUBSCRIBE_SECRET!;
  let sent = 0;
  let failed = 0;
  let updateFailed = 0;
  let deleted = 0;
  let truncated = false;

  const cleanup = await admin.from("reengage_contacts").delete().lte("retention_until", new Date(now).toISOString()).select("email");
  if (cleanup.error) failed += 1;
  else deleted = cleanup.data?.length ?? 0;

  weekLoop:
  for (const week of [2, 4] as const) {
    const column = week === 2 ? "week2_sent_at" : "week4_sent_at";
    const { data, error } = await admin
      .from("reengage_contacts")
      .select(`email,${column}`)
      .eq("consent", true)
      .is("revoked_at", null)
      .is(column, null)
      .lte("created_at", new Date(now - week * WEEK_MS).toISOString())
      .limit(BATCH);
    if (error) {
      failed += 1;
      continue;
    }
    for (const contact of data || []) {
      if (Date.now() - now >= MAX_RUN_MS) {
        truncated = true;
        break weekLoop;
      }
      const email = contact.email as string;
      const token = createUnsubscribeToken(email, unsubscribeSecret, now + 180 * 24 * 60 * 60 * 1000);
      const idempotencyKey = reengageIdempotencyKey(email, week);
      const result = await sendReengageEmail({
        email,
        week,
        link,
        unsubscribeLink: `${base}/unsubscribe?token=${encodeURIComponent(token)}`,
        idempotencyKey,
      });
      if (result.sent) {
        const update = week === 4 ? { [column]: new Date().toISOString(), retention_until: new Date(retentionAfterWeekFour(now)).toISOString() } : { [column]: new Date().toISOString() };
        sent += 1;
        const saved = await admin.from("reengage_contacts").update(update).eq("email", contact.email);
        if (saved.error) {
          updateFailed += 1;
          console.error("re-engagement delivery state update failed", { contactHash: idempotencyKey.split("/").at(-1), week });
        }
      } else {
        failed += 1;
      }
    }
  }

  const ok = failed === 0 && updateFailed === 0;
  return Response.json({ ok, sent, failed, updateFailed, deleted, truncated }, { status: ok ? 200 : 207 });
}
