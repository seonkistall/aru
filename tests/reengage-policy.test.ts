import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reengageIdempotencyKey,
  reengageSecretsConfigured,
  retentionAfterWeekFour,
  retentionAfterRevocation,
  sendReengageEmail,
} from "@/lib/reengage";

const root = resolve(import.meta.dirname, "..");
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("re-engagement retention", () => {
  it("retains contacts for 30 days after week four or revocation", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(retentionAfterWeekFour(100)).toBe(100 + 30 * day);
    expect(retentionAfterRevocation(200)).toBe(200 + 30 * day);
  });

  it("requires every production email setting", () => {
    const configured = {
      RESEND_API_KEY: "re_test",
      CRON_SECRET: "cron",
      UNSUBSCRIBE_SECRET: "unsubscribe",
      REENGAGE_FROM: "ARU <hello@example.com>",
      REENGAGE_LINK_BASE: "https://aru-beauty.vercel.app",
    };
    expect(reengageSecretsConfigured(configured)).toBe(true);
    for (const key of Object.keys(configured)) {
      expect(reengageSecretsConfigured({ ...configured, [key]: "" }), key).toBe(false);
    }
  });

  it("builds a deterministic bounded key without exposing the email", () => {
    const first = reengageIdempotencyKey("Person@Example.com", 2);
    expect(first).toBe(reengageIdempotencyKey("person@example.com", 2));
    expect(first).not.toBe(reengageIdempotencyKey("person@example.com", 4));
    expect(first).not.toContain("person@example.com");
    expect(first.length).toBeLessThanOrEqual(256);
  });

  it("passes the idempotency key to Resend and uses a bounded request", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.REENGAGE_FROM = "ARU <hello@example.com>";
    let requestInit: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init;
      return Response.json({ id: "email_123" });
    }));

    const result = await sendReengageEmail({
      email: "person@example.com",
      week: 2,
      link: "https://aru-beauty.vercel.app/checkin",
      unsubscribeLink: "https://aru-beauty.vercel.app/unsubscribe?token=signed",
      idempotencyKey: "aru-reengage/2/abc",
    });

    expect(result).toEqual({ sent: true });
    expect((requestInit?.headers as Record<string, string>)["Idempotency-Key"]).toBe("aru-reengage/2/abc");
    expect(readFileSync(resolve(root, "lib/reengage.ts"), "utf8")).toContain("fetchWithTimeout");
  });

  it("keeps cron and unsubscribe secrets distinct", () => {
    const runner = readFileSync(resolve(root, "app/api/reengage/run/route.ts"), "utf8");
    const unsubscribe = readFileSync(resolve(root, "app/api/reengage/unsubscribe/route.ts"), "utf8");
    expect(runner).not.toContain("UNSUBSCRIBE_SECRET || process.env.CRON_SECRET");
    expect(unsubscribe).not.toContain("UNSUBSCRIBE_SECRET || process.env.CRON_SECRET");
  });

  it("bounds the cron batch and exposes post-send update failures", () => {
    const runner = readFileSync(resolve(root, "app/api/reengage/run/route.ts"), "utf8");
    expect(runner).toContain("const BATCH = 50");
    expect(runner).toContain("45_000");
    expect(runner).toContain("idempotencyKey");
    expect(runner).toContain("updateFailed");
  });
});
