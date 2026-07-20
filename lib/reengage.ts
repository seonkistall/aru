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

type EmailCopy = {
  subject: (week: 2 | 4) => string;
  heading: (week: 2 | 4) => string;
  body: (week: 2 | 4) => string;
  cta: (week: 2 | 4) => string;
  footer: string;
  unsubscribe: string;
};

const EMAIL_COPY: Record<Lang, EmailCopy> = {
  ko: {
    subject: (week) => week === 2 ? "ARU | 루틴을 시작한 지 2주가 됐어요" : "ARU | 4주 동안의 루틴을 돌아볼까요?",
    heading: (week) => week === 2 ? "요즘 루틴은 잘 맞고 있나요?" : "루틴을 사용한 지 4주가 됐어요",
    body: (week) => week === 2
      ? "잠깐 시간을 내어 지금까지의 사용감을 남겨보세요."
      : "지금까지의 사용감을 남기고 다음 스킨케어를 살펴보세요.",
    cta: (week) => `${week}주 체크인 남기기`,
    footer: "ARU — 매일의 스킨케어를 함께 살펴봐요. 이메일 알림은 언제든 그만 받을 수 있어요.",
    unsubscribe: "이메일 알림 그만 받기",
  },
  en: {
    subject: (week) => week === 2 ? "ARU | Two weeks into your routine" : "ARU | A look back at four weeks of your routine",
    heading: (week) => week === 2 ? "How is your routine feeling?" : "You've been using your routine for four weeks",
    body: (week) => week === 2
      ? "Take a moment to note how it has felt so far."
      : "Share how it has felt so far, then explore your next skincare options.",
    cta: (week) => `Leave my ${week}-week check-in`,
    footer: "ARU — skincare for your everyday routine. You can stop email reminders at any time.",
    unsubscribe: "Stop email reminders",
  },
  ja: {
    subject: (week) => week === 2 ? "ARU｜ルーティンを始めて2週間になりました" : "ARU｜4週間のルーティンを振り返りませんか？",
    heading: (week) => week === 2 ? "最近のルーティンはいかがですか？" : "ルーティンを使い始めて4週間になりました",
    body: (week) => week === 2
      ? "少しだけ時間をとって、これまでの使用感を残してみてください。"
      : "これまでの使用感を残して、次のスキンケアも見てみませんか。",
    cta: (week) => `${week}週間チェックインを残す`,
    footer: "ARU — 毎日のスキンケアを一緒に見直します。メールのお知らせはいつでも停止できます。",
    unsubscribe: "メールのお知らせを停止する",
  },
  zh: {
    subject: (week) => week === 2 ? "ARU｜护肤步骤坚持两周了" : "ARU｜回顾一下这四周的护肤步骤吧",
    heading: (week) => week === 2 ? "最近这套护肤步骤用得怎么样？" : "这套护肤步骤已经用了四周",
    body: (week) => week === 2
      ? "花一点时间，记录一下目前的使用感受。"
      : "记录这段时间的使用感受，再看看接下来的护肤建议。",
    cta: (week) => `填写第${week}周回访`,
    footer: "ARU——陪你回顾日常护肤。邮件提醒可以随时取消。",
    unsubscribe: "停止接收邮件提醒",
  },
  ar: {
    subject: (week) => week === 2 ? "ARU | أسبوعان منذ بدأت روتينك" : "ARU | نظرة على أربعة أسابيع من روتينك",
    heading: (week) => week === 2 ? "كيف تشعر مع روتينك؟" : "مضت أربعة أسابيع على استخدام روتينك",
    body: (week) => week === 2
      ? "خذ لحظة لتدوين انطباعك حتى الآن."
      : "شارك انطباعك حتى الآن، ثم استكشف خيارات عنايتك التالية.",
    cta: (week) => `تسجيل متابعة الأسبوع ${week}`,
    footer: "ARU — عناية بالبشرة لروتينك اليومي. يمكنك إيقاف رسائل التذكير في أي وقت.",
    unsubscribe: "إيقاف رسائل التذكير",
  },
};

function emailLocale(locale: unknown): Lang {
  return locale === "en" || locale === "ja" || locale === "zh" || locale === "ar" ? locale : "ko";
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
  const htmlDir = locale === "ar" ? "rtl" : "ltr";
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
          <div lang="${htmlLang}" dir="${htmlDir}" style="font-family:system-ui,sans-serif;max-width:480px">
            <h1 style="font-size:24px;line-height:1.35">${copy.heading(opts.week)}</h1>
            <p style="font-size:16px;line-height:1.6">${copy.body(opts.week)}</p>
            <p><a href="${escapeAttr(opts.link)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">${copy.cta(opts.week)}</a></p>
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
