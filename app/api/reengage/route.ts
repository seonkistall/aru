import { NextResponse } from "next/server";

/**
 * ② Re-engagement email (2·4주 체크인 유도). A scheduler (Vercel Cron / Supabase
 * pg_cron) calls this with the user's email N weeks after purchase. Sends via
 * Resend when RESEND_API_KEY is set; otherwise a no-op (documented, not faked).
 *
 * NOTE: mobile-web has no push, so email/카카오 알림톡 is the re-entry channel
 * (design constraint). Full cadence needs a scheduled trigger + the user's email
 * captured at consent — wire those before relying on the check-in kill-metric.
 */
export async function POST(req: Request) {
  const { email, week, link } = (await req.json()) as { email: string; week: 2 | 4; link: string };
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return NextResponse.json({ sent: false, reason: "RESEND_API_KEY not set" }, { status: 503 });
  }
  if (!email) return NextResponse.json({ sent: false, reason: "no email" }, { status: 400 });

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "결 <hello@yourdomain.kr>",
      to: email,
      subject: `${week}주 지났어요 — 피부는 어때요?`,
      html: `<p>골라드린 게 잘 맞았는지 30초만 알려주세요.</p><p><a href="${link}">결과 남기기 →</a></p>`,
    }),
  });
  return NextResponse.json({ sent: r.ok });
}
