// Re-engagement email helper. Sending is a no-op (documented, not faked) until
// the owner sets RESEND_API_KEY. Used by /api/reengage (manual) and
// /api/reengage/run (scheduled). The re-entry channel is email because mobile
// web has no push (design constraint).

import { createHash } from "node:crypto";
import { fetchWithTimeout } from "./server/request-guard";

type EmailEnv = Record<string, string | undefined>;

export function isResendConfigured(env: EmailEnv = process.env) {
  return Boolean(env.RESEND_API_KEY && env.REENGAGE_FROM);
}

export function reengageSecretsConfigured(env: EmailEnv = process.env) {
  return Boolean(
    isResendConfigured(env)
    && env.CRON_SECRET
    && env.UNSUBSCRIBE_SECRET
    && env.REENGAGE_LINK_BASE
  );
}

export function reengageIdempotencyKey(email: string, week: 2 | 4) {
  const contactHash = createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
  return `aru-reengage/${week}/${contactHash}`;
}

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const retentionAfterWeekFour = (sentAt: number) => sentAt + RETENTION_MS;
export const retentionAfterRevocation = (revokedAt: number) => revokedAt + RETENTION_MS;

// Defense-in-depth: even though callers now pass a fixed server link, escape it
// before interpolating into the email HTML so a link can never break out of the
// href attribute or inject markup.
function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendReengageEmail(opts: { email: string; week: 2 | 4; link: string; unsubscribeLink?: string; idempotencyKey: string }): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.REENGAGE_FROM;
  if (!key || !from) return { sent: false, reason: "email not configured" };
  try {
    const response = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": opts.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: opts.email,
        subject: `${opts.week}주 지났어요 — 피부는 좀 어때요?`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:480px">
            <p style="font-size:16px">골라드린 루틴이 잘 맞았는지 <b>30초</b>만 알려주세요. 다음 추천이 더 정확해져요.</p>
            <p><a href="${escapeAttr(opts.link)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">결과 남기기 →</a></p>
            <p style="color:#8a8a8a;font-size:12px">아루 — 아름다움을, 매일의 루틴으로. 리마인더를 받고 싶지 않으면 알려주세요.</p>
            ${opts.unsubscribeLink ? `<p style="font-size:12px"><a href="${escapeAttr(opts.unsubscribeLink)}">Unsubscribe</a></p>` : ""}
          </div>`,
      }),
    }, 10_000);
    return { sent: response.ok, reason: response.ok ? undefined : "delivery failed" };
  } catch {
    return { sent: false, reason: "delivery failed" };
  }
}
