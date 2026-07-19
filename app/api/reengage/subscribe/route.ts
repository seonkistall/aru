import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseSubscribeInput } from "@/lib/server/reengage-input";
import { createRateLimiter, readBoundedJson, requestClientKey, RequestGuardError } from "@/lib/server/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// User opt-in for the 2/4-week routine reminder. Stores the minimum PII (email
// + optional product context) only with explicit consent. Nothing is sent from
// here — /api/reengage/run does the (owner-key-gated) sending on a schedule.

const CONSENT_VERSION = "2026-07-15.v1";
const subscribeLimit = createRateLimiter({ max: 5, windowMs: 60_000, maxKeys: 10_000 });

export async function POST(request: Request) {
  if (!subscribeLimit(requestClientKey(request))) {
    return Response.json({ ok: false, reason: "rate limited" }, { status: 429 });
  }

  let body: { email: string; consent: true; context: string; locale: "ko" | "en" | "ja" | "zh" };
  try {
    const parsed = parseSubscribeInput(await readBoundedJson(request, 2048));
    if (!parsed.ok) return Response.json({ ok: false, reason: parsed.reason }, { status: 400 });
    body = parsed.value;
  } catch (error) {
    const status = error instanceof RequestGuardError ? error.status : 400;
    return Response.json({ ok: false, reason: status === 413 ? "request too large" : "invalid json" }, { status });
  }

  const admin = await getSupabaseAdmin();
  if (!admin) return Response.json({ ok: false, reason: "not configured" }, { status: 503 });

  const consentedAt = new Date().toISOString();
  const { error } = await admin
    .from("reengage_contacts")
    .upsert({
      email: body.email,
      context: body.context,
      consent: true,
      consent_version: CONSENT_VERSION,
      consented_at: consentedAt,
      locale: body.locale,
      revoked_at: null,
      retention_until: null,
      week2_sent_at: null,
      week4_sent_at: null,
    }, { onConflict: "email" });
  if (error) return Response.json({ ok: false, reason: "store failed" }, { status: 500 });

  return Response.json({ ok: true });
}
