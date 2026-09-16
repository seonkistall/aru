import { afterEach, describe, expect, it } from "vitest";
import { POST as manualPost } from "@/app/api/reengage/route";
import { POST as subscribePost } from "@/app/api/reengage/subscribe/route";
import { POST as unsubscribePost } from "@/app/api/reengage/unsubscribe/route";
import { POST as syncPost } from "@/app/api/sync/route";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function jsonRequest(url: string, value: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
}

describe("remaining JSON API boundaries", () => {
  it("uses the shared bounded limiter for authenticated sync attempts", () => {
    const route = readFileSync(resolve(import.meta.dirname, "../app/api/sync/route.ts"), "utf8");
    expect(route).toContain("createRateLimiter");
    expect(route).not.toContain("const rateLimit = new Map");
  });

  // funnelEvents is optional (added in sync.v2) and was the only array in the payload
  // with no Array.isArray check. A non-array truthy value passed validation, and
  // `funnelEvents.length` is defined on a string, so the route reached
  // `funnelEvents.map(...)` and threw: `TypeError: funnelEvents.map is not a function`,
  // uncaught, i.e. a 500 where every other malformed array is a 400. Reproduced with
  // SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SYNC_TOKEN all set, which is
  // the only configuration that reaches the upsert.
  it("rejects a non-array funnelEvents before it reaches the upsert", async () => {
    process.env.SUPABASE_SYNC_TOKEN = "tok-0123456789012345678901234567890123";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_abcdefghijklmnop";
    const payload = {
      schemaVersion: "2026-07-04.sync.v2",
      clientGeneratedAt: 1,
      source: "ops-local",
      labels: [],
      cropSamples: [],
      pilotNotes: [],
      consentEvents: [],
      funnelEvents: "abc",
    };
    const response = await syncPost(jsonRequest("http://localhost/api/sync", { payload }, {
      authorization: "Bearer tok-0123456789012345678901234567890123",
    }));
    expect(response.status).toBe(400);
  });

  it("rejects an oversized subscription body using actual bytes", async () => {
    const response = await subscribePost(jsonRequest("http://localhost/api/reengage/subscribe", {
      email: "a@example.com",
      consent: true,
      context: "가".repeat(700),
    }, { "x-vercel-forwarded-for": "198.51.100.10" }));

    expect(response.status).toBe(413);
  });

  it("rejects unknown subscription fields before database configuration", async () => {
    const response = await subscribePost(jsonRequest("http://localhost/api/reengage/subscribe", {
      email: "a@example.com",
      consent: true,
      admin: true,
    }, { "x-vercel-forwarded-for": "198.51.100.11" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ reason: "invalid body" });
  });

  it("validates a manual send before checking Resend configuration", async () => {
    process.env.CRON_SECRET = "cron-test-secret";
    delete process.env.RESEND_API_KEY;

    const response = await manualPost(jsonRequest("http://localhost/api/reengage", {
      email: "a@example.com",
      week: 3,
    }, { authorization: "Bearer cron-test-secret" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ reason: "invalid week" });
  });

  it("rejects an oversized unsubscribe body before secret configuration", async () => {
    const response = await unsubscribePost(jsonRequest("http://localhost/api/reengage/unsubscribe", {
      token: "x".repeat(4097),
    }));

    expect(response.status).toBe(413);
  });

  it("rejects actual oversized sync bytes when content-length is unavailable", async () => {
    process.env.SUPABASE_SYNC_TOKEN = "s".repeat(32);
    delete process.env.SUPABASE_SYNC_ALLOWED_ORIGINS;
    const body = JSON.stringify({ padding: "가".repeat(1_750_000) });
    const request = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: { authorization: `Bearer ${"s".repeat(32)}` },
      body,
    });

    const response = await syncPost(request);
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(5 * 1024 * 1024);
    expect(response.status).toBe(413);
  });
});
