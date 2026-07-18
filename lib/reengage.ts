// Re-engagement email helper. Sending is a no-op (documented, not faked) until
// the owner sets RESEND_API_KEY. Used by /api/reengage (manual) and
// /api/reengage/run (scheduled). The re-entry channel is email because mobile
// web has no push (design constraint).

import { createHash } from "node:crypto";
import { fetchWithTimeout } from "./server/request-guard";
import type { Lang } from "./i18n/core";

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

const EMAIL_COPY: Record<Lang, {
  subject: (week: 2 | 4) => string;
  body: string;
  cta: string;
  footer: string;
  unsubscribe: string;
}> = {
  ko: {
    subject: (week) => `${week}주 지났어요 — 피부는 좀 어때요?`,
    body: "골라드린 루틴이 잘 맞았는지 30초만 알려주세요. 다음 추천이 더 정확해져요.",
    cta: "결과 남기기 →",
    footer: "아루 — 아름다움을, 매일의 루틴으로. 리마인더는 언제든 중단할 수 있어요.",
    unsubscribe: "리마인더 구독 해지",
  },
  en: {
    subject: (week) => `${week} weeks in — how is your skin feeling?`,
    body: "Tell us in 30 seconds whether the routine suited you. Your feedback makes the next recommendation more accurate.",
    cta: "Leave feedback →",
    footer: "ARU — beauty, as a daily ritual. You can stop reminders at any time.",
    unsubscribe: "Unsubscribe from reminders",
  },
  ja: {
    subject: (week) => `${week}週間たちました — 肌の調子はいかがですか？`,
    body: "ルーティンが合っていたか、30秒で教えてください。次回のおすすめがより正確になります。",
    cta: "フィードバックを送る →",
    footer: "ARU — 美しさを毎日のルーティンに。リマインダーはいつでも停止できます。",
    unsubscribe: "リマインダーを停止",
  },
  zh: {
    subject: (week) => `使用${week}周了——皮肤感觉怎么样？`,
    body: "请用30秒告诉我们护肤流程是否适合你。你的反馈会让下次推荐更准确。",
    cta: "提交反馈 →",
    footer: "ARU——让美融入每日护肤。你可以随时停止提醒。",
    unsubscribe: "取消提醒订阅",
  },
};

function emailLocale(locale: unknown): Lang {
  return locale === "en" || locale === "ja" || locale === "zh" ? locale : "ko";
}

// Defense-in-depth: even though callers now pass a fixed server link, escape it
// before interpolating into the email HTML so a link can never break out of the
// href attribute or inject markup.
function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendReengageEmail(opts: {
  email: string;
  week: 2 | 4;
  link: string;
  unsubscribeLink?: string;
  idempotencyKey: string;
  locale?: Lang;
}): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.REENGAGE_FROM;
  if (!key || !from) return { sent: false, reason: "email not configured" };
  const locale = emailLocale(opts.locale);
  const copy = EMAIL_COPY[locale];
  const htmlLang = locale === "zh" ? "zh-CN" : locale;
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
        subject: copy.subject(opts.week),
        html: `
          <div lang="${htmlLang}" style="font-family:system-ui,sans-serif;max-width:480px">
            <p style="font-size:16px">${copy.body}</p>
            <p><a href="${escapeAttr(opts.link)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">${copy.cta}</a></p>
            <p style="color:#8a8a8a;font-size:12px">${copy.footer}</p>
            ${opts.unsubscribeLink ? `<p style="font-size:12px"><a href="${escapeAttr(opts.unsubscribeLink)}">${copy.unsubscribe}</a></p>` : ""}
          </div>`,
      }),
    }, 10_000);
    return { sent: response.ok, reason: response.ok ? undefined : "delivery failed" };
  } catch {
    return { sent: false, reason: "delivery failed" };
  }
}
