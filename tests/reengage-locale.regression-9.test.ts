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
    ["ko", "결과 남기기"],
    ["en", "Leave feedback"],
    ["ja", "フィードバック"],
    ["zh", "提交反馈"],
  ] as const)("renders the %s email template", async (locale: Lang, expectedCta: string) => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.REENGAGE_FROM = "ARU <hello@example.com>";
    let payload: Record<string, string> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body));
      return Response.json({ id: "email_123" });
    }));

    await sendReengageEmail({
      email: "person@example.com",
      week: 2,
      link: "https://aru.example/checkin",
      unsubscribeLink: "https://aru.example/unsubscribe?token=signed",
      idempotencyKey: `aru-reengage/2/${locale}`,
      locale,
    } as Parameters<typeof sendReengageEmail>[0]);

    expect(payload?.html).toContain(expectedCta);
    if (locale !== "ko") expect(payload?.subject).not.toContain("피부");
  });

  it("persists locale in the schema and selects it in the cron runner", () => {
    const schema = readFileSync(resolve(import.meta.dirname, "../supabase/schema.sql"), "utf8");
    const runner = readFileSync(resolve(import.meta.dirname, "../app/api/reengage/run/route.ts"), "utf8");

    expect(schema).toContain("locale text not null default 'ko'");
    expect(runner).toContain("email,locale,${column}");
    expect(runner).toContain("locale: contact.locale");
  });
});
