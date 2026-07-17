import { afterEach, describe, expect, it } from "vitest";
import {
  getSupabaseAdmin,
  hasValidSyncToken,
  isSupabaseSyncConfigured,
} from "@/lib/supabase-admin";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Supabase server environment guard", () => {
  it("rejects masked Vercel values instead of reporting sync as configured", async () => {
    process.env.SUPABASE_URL = "[sensitive]";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "[sensitive]";
    process.env.SUPABASE_SYNC_TOKEN = "[sensitive]";

    expect(isSupabaseSyncConfigured()).toBe(false);
    await expect(getSupabaseAdmin()).resolves.toBeNull();
  });

  it("accepts a valid HTTPS URL, modern secret key, and high-entropy sync token", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = `sb_secret_${"a".repeat(32)}`;
    process.env.SUPABASE_SYNC_TOKEN = "s".repeat(32);

    expect(isSupabaseSyncConfigured()).toBe(true);
  });

  it("treats modern secret keys as opaque instead of assuming an undocumented length", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_opaque-value";
    process.env.SUPABASE_SYNC_TOKEN = "s".repeat(32);

    expect(isSupabaseSyncConfigured()).toBe(true);
  });

  it("keeps legacy service-role JWTs compatible during key migration", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = `eyJ${"a".repeat(64)}.${"b".repeat(64)}.${"c".repeat(43)}`;
    process.env.SUPABASE_SYNC_TOKEN = "s".repeat(32);

    expect(isSupabaseSyncConfigured()).toBe(true);
  });

  it("does not authenticate requests when the configured sync token is weak", () => {
    process.env.SUPABASE_SYNC_TOKEN = "sync-test-secret";
    const request = new Request("https://example.com/api/sync", {
      headers: { authorization: "Bearer sync-test-secret" },
    });

    expect(hasValidSyncToken(request)).toBe(false);
  });
});
