import { NextResponse } from "next/server";
import { reengageIdempotencyKey, reengageSecretsConfigured, sendReengageEmail } from "@/lib/reengage";
import { parseManualReengageInput } from "@/lib/server/reengage-input";
import { readBoundedJson, RequestGuardError } from "@/lib/server/request-guard";
import { createUnsubscribeToken } from "@/lib/server/unsubscribe-token";

/**
 * Manual single re-engagement send (2·4주 체크인 유도). Admin-only: gated behind
 * CRON_SECRET like /api/reengage/run so it can't be used as an open email relay.
 * The link is a fixed server value (never client-supplied) to prevent arbitrary
 * phishing links / HTML injection from the trusted sender domain. Sends via
 * Resend when RESEND_API_KEY is set; otherwise a documented no-op.
 */
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ sent: false, reason: "unauthorized" }, { status: 401 });
  }
  let body: { email: string; week: 2 | 4 };
  try {
    const parsed = parseManualReengageInput(await readBoundedJson(req, 1024));
    if (!parsed.ok) return NextResponse.json({ sent: false, reason: parsed.reason }, { status: 400 });
    body = parsed.value;
  } catch (error) {
    const status = error instanceof RequestGuardError ? error.status : 400;
    return NextResponse.json({ sent: false, reason: status === 413 ? "request too large" : "invalid JSON" }, { status });
  }
  if (!reengageSecretsConfigured()) {
    return NextResponse.json({ sent: false, reason: "email not fully configured" }, { status: 503 });
  }
  const base = process.env.REENGAGE_LINK_BASE!;
  const token = createUnsubscribeToken(body.email, process.env.UNSUBSCRIBE_SECRET!, Date.now() + 180 * 24 * 60 * 60 * 1000);
  return NextResponse.json(await sendReengageEmail({
    email: body.email,
    week: body.week,
    link: base + "/checkin",
    unsubscribeLink: `${base}/unsubscribe?token=${encodeURIComponent(token)}`,
    idempotencyKey: reengageIdempotencyKey(body.email, body.week),
  }));
}
