import { NextResponse } from "next/server";
import { isResendConfigured, sendReengageEmail } from "@/lib/reengage";

/**
 * Manual single re-engagement send (2·4주 체크인 유도). Sends via Resend when
 * RESEND_API_KEY is set; otherwise a documented no-op (not faked). The scheduled
 * path is /api/reengage/run; opt-in email capture is /api/reengage/subscribe.
 * mobile-web has no push, so email/카카오 알림톡 is the re-entry channel.
 */
export async function POST(req: Request) {
  const { email, week, link } = (await req.json()) as { email: string; week: 2 | 4; link: string };
  if (!isResendConfigured()) {
    return NextResponse.json({ sent: false, reason: "RESEND_API_KEY not set" }, { status: 503 });
  }
  if (!email) return NextResponse.json({ sent: false, reason: "no email" }, { status: 400 });
  return NextResponse.json(await sendReengageEmail({ email, week, link }));
}
