import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const adminMock = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: adminMock.getSupabaseAdmin,
}));

import { POST as subscribe } from "@/app/api/reengage/subscribe/route";
import { GET as runReengage } from "@/app/api/reengage/run/route";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("re-engagement re-subscription schedule", () => {
  // Regression: ISSUE-008 — re-subscription kept old sent markers and creation time.
  // Found by product QA on 2026-07-19.
  // Report: .gstack/qa-reports/qa-report-aru-local-2026-07-19.md
  it("starts a fresh 2/4-week cycle when consent is renewed", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    adminMock.getSupabaseAdmin.mockResolvedValue({
      from: vi.fn(() => ({ upsert })),
    });

    const response = await subscribe(
      new Request("https://aru.example/api/reengage/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.81" },
        body: JSON.stringify({ email: "person@example.com", consent: true, context: "복합성·크림" }),
      })
    );

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        consent: true,
        revoked_at: null,
        retention_until: null,
        week2_sent_at: null,
        week4_sent_at: null,
        consented_at: expect.any(String),
      }),
      { onConflict: "email" }
    );
  });

  it("schedules cron from the latest consent rather than the original row", async () => {
    const dueColumn = vi.fn();
    const table = {
      delete: () => ({
        lte: () => ({
          select: async () => ({ data: [], error: null }),
        }),
      }),
      select: () => {
        const query = {
          eq: () => query,
          is: () => query,
          lte: (column: string) => {
            dueColumn(column);
            return query;
          },
          limit: async () => ({ data: [], error: null }),
        };
        return query;
      },
    };
    adminMock.getSupabaseAdmin.mockResolvedValue({ from: () => table });
    process.env.CRON_SECRET = "cron-secret";
    process.env.RESEND_API_KEY = "re_test";
    process.env.REENGAGE_FROM = "ARU <hello@example.com>";
    process.env.REENGAGE_LINK_BASE = "https://aru.example";
    process.env.UNSUBSCRIBE_SECRET = "unsubscribe-secret";

    const response = await runReengage(
      new Request("https://aru.example/api/reengage/run", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );

    expect(response.status).toBe(200);
    expect(dueColumn).toHaveBeenCalledTimes(2);
    expect(dueColumn).toHaveBeenNthCalledWith(1, "consented_at");
    expect(dueColumn).toHaveBeenNthCalledWith(2, "consented_at");
  });

  it("backfills the consent timestamp before making it the schedule source", () => {
    const schema = readFileSync(resolve(import.meta.dirname, "../supabase/schema.sql"), "utf8");
    const migration = readFileSync(
      resolve(import.meta.dirname, "../supabase/migrations/20260718193557_fix_reengage_resubscribe_schedule.sql"),
      "utf8"
    );

    expect(schema).toContain("set consented_at = created_at");
    expect(schema).toContain("alter column consented_at set not null");
    expect(migration).toContain("add column if not exists consented_at");
    expect(migration).toContain("add column if not exists revoked_at");
    expect(migration).toContain("add column if not exists retention_until");
  });
});
