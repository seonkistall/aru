import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// User opt-in for the 2/4-week routine reminder. Stores the minimum PII (email
// + optional product context) only with explicit consent. Nothing is sent from
// here — /api/reengage/run does the (owner-key-gated) sending on a schedule.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
const rate = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const rec = rate.get(ip);
  if (rec && now < rec.resetAt) {
    if (rec.count >= RATE_MAX) return Response.json({ ok: false, reason: "rate limited" }, { status: 429 });
    rec.count += 1;
  } else {
    rate.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
  }

  let body: { email?: string; consent?: boolean; context?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "invalid json" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ ok: false, reason: "invalid email" }, { status: 400 });
  }
  if (!body.consent) {
    return Response.json({ ok: false, reason: "consent required" }, { status: 400 });
  }

  const admin = await getSupabaseAdmin();
  if (!admin) return Response.json({ ok: false, reason: "not configured" }, { status: 503 });

  const { error } = await admin
    .from("reengage_contacts")
    .upsert({ email, context: (body.context || "").slice(0, 200), consent: true }, { onConflict: "email" });
  if (error) return Response.json({ ok: false, reason: "store failed" }, { status: 500 });

  return Response.json({ ok: true });
}
