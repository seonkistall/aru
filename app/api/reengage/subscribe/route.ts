import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseSubscribeInput } from "@/lib/server/reengage-input";
import { createRateLimiter, isForeignOriginRequest, readBoundedJson, requestClientKey, RequestGuardError } from "@/lib/server/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// User opt-in for the 2/4-week routine reminder. Stores, only with explicit consent,
// the email, the consent flag with its copy version and time, and the locale the mail
// is written in, and resets the revocation, retention and sent markers to null. No
// survey answer: `context` is written null.
// Nothing is sent from here — /api/reengage/run does the (owner-key-gated) sending on
// a schedule.

const CONSENT_VERSION = "2026-07-15.v1";
const subscribeLimit = createRateLimiter({ max: 5, windowMs: 60_000, maxKeys: 10_000 });

export async function POST(request: Request) {
  // The same CSRF boundary /api/analyze and /api/reason have, and for the same reason
  // placed before the limiter. Without it another site's page could enrol any address
  // with consent: true (a text/plain form POST needs no preflight and no script), from
  // each visitor's own IP, so neither the limiter nor an IP-keyed firewall rule bounded
  // it. The only caller, ReengageOptIn on /report, is a same-origin fetch.
  if (isForeignOriginRequest(request)) {
    return Response.json({ ok: false, reason: "forbidden origin" }, { status: 403 });
  }
  if (!subscribeLimit(requestClientKey(request))) {
    return Response.json({ ok: false, reason: "rate limited" }, { status: 429 });
  }

  let body: { email: string; consent: true; locale: "ko" | "en" | "ja" | "zh" | "ar" };
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
      // Always null, whatever the body carried. The parser still accepts a `context`
      // so an older cached /report that sends one is not refused, but a skin type or
      // category is not stored next to the email: the opt-in's checkbox asks only to
      // store the email, and nothing reads the column. Writing null rather than leaving
      // the key out also clears a value an earlier opt-in stored, on re-subscribe; rows
      // stored before this change keep theirs until then (docs/reengage-setup.md).
      context: null,
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
