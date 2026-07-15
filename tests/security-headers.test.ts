import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

const root = resolve(import.meta.dirname, "..");

describe("browser security headers", () => {
  it("applies the production baseline to every route", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    const groups = await nextConfig.headers?.();
    expect(groups).toHaveLength(1);
    expect(groups?.[0].source).toBe("/(.*)");
    const headers = Object.fromEntries((groups?.[0].headers ?? []).map(({ key, value }) => [key, value]));

    expect(headers["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains; preload");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(headers["Permissions-Policy"]).toContain("camera=(self)");
    expect(headers["Permissions-Policy"]).toContain("microphone=()");
    expect(headers["Permissions-Policy"]).toContain("geolocation=()");
  });

  it("starts CSP in report-only mode with local assets", async () => {
    const groups = await nextConfig.headers?.();
    const headers = Object.fromEntries((groups?.[0].headers ?? []).map(({ key, value }) => [key, value]));
    expect(headers["Content-Security-Policy"]).toBeUndefined();
    expect(headers["Content-Security-Policy-Report-Only"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy-Report-Only"]).toContain("worker-src 'self' blob:");
    expect(headers["Content-Security-Policy-Report-Only"]).toContain("object-src 'none'");
  });
});

describe("retired browser security modules", () => {
  it("removes the unused public Supabase client and duplicate limiter", () => {
    expect(existsSync(resolve(root, "lib/supabase.ts"))).toBe(false);
    expect(existsSync(resolve(root, "lib/rate-limit.ts"))).toBe(false);
  });

  it("does not advertise a browser Supabase credential", () => {
    const envExample = readFileSync(resolve(root, ".env.local.example"), "utf8");
    expect(envExample).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(envExample).not.toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });
});
