import { NextResponse } from "next/server";
import { isResendConfigured, sendReengageEmail } from "@/lib/reengage";

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
  if (!isResendConfigured()) {
    return NextResponse.json({ sent: false, reason: "RESEND_API_KEY not set" }, { status: 503 });
  }

  let body: { email?: string; week?: 2 | 4 };
  try {
    body = (await req.json()) as { email?: string; week?: 2 | 4 };
  } catch {
    return NextResponse.json({ sent: false, reason: "invalid JSON" }, { status: 400 });
  }
  const email = body.email;
  if (!email) return NextResponse.json({ sent: false, reason: "no email" }, { status: 400 });
  const week = body.week === 4 ? 4 : 2;
  const link = (process.env.REENGAGE_LINK_BASE || "https://aru-beauty.vercel.app") + "/checkin";
  return NextResponse.json(await sendReengageEmail({ email, week, link }));
}
