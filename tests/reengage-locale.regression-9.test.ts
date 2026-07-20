import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendReengageEmail } from "@/lib/reengage";
import { parseSubscribeInput } from "@/lib/server/reengage-input";
import type { Lang } from "@/lib/i18n/core";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("localized re-engagement email", () => {
  // Regression: ISSUE-009 — every locale received Korean reminder email.
  // Found by product QA on 2026-07-19.
  // Report: .gstack/qa-reports/qa-report-aru-local-2026-07-19.md
  it("validates and retains the opt-in locale", () => {
    expect(parseSubscribeInput({ email: "person@example.com", consent: true, locale: "en" })).toEqual({
      ok: true,
      value: { email: "person@example.com", consent: true, context: "", locale: "en" },
    });
    expect(parseSubscribeInput({ email: "person@example.com", consent: true, locale: "fr" })).toEqual({
      ok: false,
      reason: "invalid locale",
    });
  });

  it.each([
    ["ko", {
      subjects: ["ARU | 루틴을 시작한 지 2주가 됐어요", "ARU | 4주 동안의 루틴을 돌아볼까요?"],
      headings: ["요즘 루틴은 잘 맞고 있나요?", "루틴을 사용한 지 4주가 됐어요"],
      bodies: ["잠깐 시간을 내어 지금까지의 사용감을 남겨보세요.", "지금까지의 사용감을 남기고 다음 스킨케어를 살펴보세요."],
      ctas: ["2주 체크인 남기기", "4주 체크인 남기기"],
      unsubscribe: "이메일 알림 그만 받기",
      lang: "ko",
    }],
    ["en", {
      subjects: ["ARU | Two weeks into your routine", "ARU | A look back at four weeks of your routine"],
      headings: ["How is your routine feeling?", "You've been using your routine for four weeks"],
      bodies: ["Take a moment to note how it has felt so far.", "Share how it has felt so far, then explore your next skincare options."],
      ctas: ["Leave my 2-week check-in", "Leave my 4-week check-in"],
      unsubscribe: "Stop email reminders",
      lang: "en",
    }],
    ["ja", {
      subjects: ["ARU｜ルーティンを始めて2週間になりました", "ARU｜4週間のルーティンを振り返りませんか？"],
      headings: ["最近のルーティンはいかがですか？", "ルーティンを使い始めて4週間になりました"],
      bodies: ["少しだけ時間をとって、これまでの使用感を残してみてください。", "これまでの使用感を残して、次のスキンケアも見てみませんか。"],
      ctas: ["2週間チェックインを残す", "4週間チェックインを残す"],
      unsubscribe: "メールのお知らせを停止する",
      lang: "ja",
    }],
    ["zh", {
      subjects: ["ARU｜护肤步骤坚持两周了", "ARU｜回顾一下这四周的护肤步骤吧"],
      headings: ["最近这套护肤步骤用得怎么样？", "这套护肤步骤已经用了四周"],
      bodies: ["花一点时间，记录一下目前的使用感受。", "记录这段时间的使用感受，再看看接下来的护肤建议。"],
      ctas: ["填写第2周回访", "填写第4周回访"],
      unsubscribe: "停止接收邮件提醒",
      lang: "zh-CN",
    }],
    ["ar", {
      subjects: ["ARU | أسبوعان منذ بدأت روتينك", "ARU | نظرة على أربعة أسابيع من روتينك"],
      headings: ["كيف تشعر مع روتينك؟", "مضت أربعة أسابيع على استخدام روتينك"],
      bodies: ["خذ لحظة لتدوين انطباعك حتى الآن.", "شارك انطباعك حتى الآن، ثم استكشف خيارات عنايتك التالية."],
      ctas: ["تسجيل متابعة الأسبوع 2", "تسجيل متابعة الأسبوع 4"],
      unsubscribe: "إيقاف رسائل التذكير",
      lang: "ar",
    }],
  ] as const)("renders distinct week-specific %s email templates", async (locale: Lang, expected) => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.REENGAGE_FROM = "ARU <hello@example.com>";
    const payloads: Record<string, string>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "email_123" });
    }));

    for (const week of [2, 4] as const) {
      await sendReengageEmail({
        email: "person@example.com",
        week,
        link: "https://aru.example/checkin",
        unsubscribeLink: "https://aru.example/unsubscribe?token=signed",
        idempotencyKey: `aru-reengage/${week}/${locale}`,
        locale,
      });
    }

    expect(payloads).toHaveLength(2);
    for (const [index, payload] of payloads.entries()) {
      expect(payload.subject).toBe(expected.subjects[index]);
      expect(payload.html).toContain(`<div lang="${expected.lang}"`);
      expect(payload.html).toContain(`<h1`);
      expect(payload.html).toContain(expected.headings[index]);
      expect(payload.html).toContain(expected.bodies[index]);
      expect(payload.html).toContain(expected.ctas[index]);
      expect(payload.html).toContain(expected.unsubscribe);
      expect(payload.html).not.toMatch(/더 정확|more accurate|より正確|更准确/);
    }
    expect(payloads[0].subject).not.toBe(payloads[1].subject);
  });

  it("persists locale in the schema and selects it in the cron runner", () => {
    const schema = readFileSync(resolve(import.meta.dirname, "../supabase/schema.sql"), "utf8");
    const runner = readFileSync(resolve(import.meta.dirname, "../app/api/reengage/run/route.ts"), "utf8");

    expect(schema).toContain("locale text not null default 'ko'");
    expect(runner).toContain("email,locale,${column}");
    expect(runner).toContain("locale: contact.locale");
  });
});
