import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isResendConfigured, retentionAfterWeekFour, sendReengageEmail } from "@/lib/reengage";
import { createUnsubscribeToken } from "@/lib/server/unsubscribe-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scheduled runner (Vercel Cron). Vercel adds `Authorization: Bearer <CRON_SECRET>`
// when CRON_SECRET is set. Safe no-op until both CRON_SECRET and RESEND_API_KEY
// are configured — it never sends without the owner explicitly enabling it.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH = 200;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const admin = await getSupabaseAdmin();
  if (!admin || !isResendConfigured()) {
    return Response.json({ ok: true, sent: 0, reason: "not fully configured (no-op)" });
  }

  const now = Date.now();
  const link = (process.env.REENGAGE_LINK_BASE || "https://aru-beauty.vercel.app") + "/checkin";
  const base = process.env.REENGAGE_LINK_BASE || "https://aru-beauty.vercel.app";
  const unsubscribeSecret = process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET!;
  let sent = 0;

  await admin.from("reengage_contacts").delete().lte("retention_until", new Date(now).toISOString());

  for (const week of [2, 4] as const) {
    const column = week === 2 ? "week2_sent_at" : "week4_sent_at";
    const { data } = await admin
      .from("reengage_contacts")
      .select(`email,${column}`)
      .eq("consent", true)
      .is("revoked_at", null)
      .is(column, null)
      .lte("created_at", new Date(now - week * WEEK_MS).toISOString())
      .limit(BATCH);
    for (const contact of data || []) {
      const email = contact.email as string;
      const token = createUnsubscribeToken(email, unsubscribeSecret, now + 180 * 24 * 60 * 60 * 1000);
      const result = await sendReengageEmail({ email, week, link, unsubscribeLink: `${base}/unsubscribe?token=${encodeURIComponent(token)}` });
      if (result.sent) {
        const update = week === 4 ? { [column]: new Date().toISOString(), retention_until: new Date(retentionAfterWeekFour(now)).toISOString() } : { [column]: new Date().toISOString() };
        await admin.from("reengage_contacts").update(update).eq("email", contact.email);
        sent += 1;
      }
    }
  }

  return Response.json({ ok: true, sent });
}
