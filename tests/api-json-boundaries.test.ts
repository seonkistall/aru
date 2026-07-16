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
    process.env.SUPABASE_SYNC_TOKEN = "sync-test-secret";
    delete process.env.SUPABASE_SYNC_ALLOWED_ORIGINS;
    const body = JSON.stringify({ padding: "가".repeat(1_750_000) });
    const request = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: { authorization: "Bearer sync-test-secret" },
      body,
    });

    const response = await syncPost(request);
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(5 * 1024 * 1024);
    expect(response.status).toBe(413);
  });
});
