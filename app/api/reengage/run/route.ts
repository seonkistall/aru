import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isResendConfigured, sendReengageEmail } from "@/lib/reengage";

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
  let sent = 0;

  for (const week of [2, 4] as const) {
    const column = week === 2 ? "week2_sent_at" : "week4_sent_at";
    const { data } = await admin
      .from("reengage_contacts")
      .select(`email,${column}`)
      .is(column, null)
      .lte("created_at", new Date(now - week * WEEK_MS).toISOString())
      .limit(BATCH);
    for (const contact of data || []) {
      const result = await sendReengageEmail({ email: contact.email as string, week, link });
      if (result.sent) {
        await admin.from("reengage_contacts").update({ [column]: new Date().toISOString() }).eq("email", contact.email);
        sent += 1;
      }
    }
  }

  return Response.json({ ok: true, sent });
}
