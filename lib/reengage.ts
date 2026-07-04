// Re-engagement email helper. Sending is a no-op (documented, not faked) until
// the owner sets RESEND_API_KEY. Used by /api/reengage (manual) and
// /api/reengage/run (scheduled). The re-entry channel is email because mobile
// web has no push (design constraint).

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendReengageEmail(opts: { email: string; week: 2 | 4; link: string }): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set" };
  const from = process.env.REENGAGE_FROM || "ARU 아루 <hello@aru-beauty.app>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: opts.email,
      subject: `${opts.week}주 지났어요 — 피부는 좀 어때요?`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px">
          <p style="font-size:16px">골라드린 루틴이 잘 맞았는지 <b>30초</b>만 알려주세요. 다음 추천이 더 정확해져요.</p>
          <p><a href="${opts.link}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">결과 남기기 →</a></p>
          <p style="color:#8a8a8a;font-size:12px">아루 — 아름다움을, 매일의 루틴으로. 리마인더를 받고 싶지 않으면 알려주세요.</p>
        </div>`,
    }),
  });
  return { sent: response.ok, reason: response.ok ? undefined : `resend ${response.status}` };
}
