import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, timingSafeEqual } from "node:crypto";
import { cronAuthorized } from "@/lib/server/cron-auth";

/**
 * The owner-key gate on both re-engagement sending routes.
 *
 * Until 2026-09-24 each route compared the header with `===`, which returns on the
 * first differing byte. This file pins the replacement AND, more importantly, the
 * failure modes the obvious version of the fix introduces: `crypto.timingSafeEqual`
 * throws on unequal byte lengths, so a wrong-length header fed to it raw becomes a
 * 500 rather than a 401. Every wrong-length case below is therefore a real path a
 * caller can reach with one curl, not a hypothetical.
 */

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; vi.resetModules(); });

function headerRequest(authorization?: string) {
  return new Request("https://aru.test/api/reengage/run", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("cronAuthorized", () => {
  const env = { CRON_SECRET: "s3cret-value" };

  it("accepts the exact bearer", () => {
    expect(cronAuthorized(headerRequest("Bearer s3cret-value"), env)).toBe(true);
  });

  it("rejects a same-length wrong bearer", () => {
    expect(cronAuthorized(headerRequest("Bearer s3cret-valuf"), env)).toBe(false);
  });

  const wrongLength = [
    ["empty", ""],
    ["missing header", undefined],
    ["prefix only", "Bearer "],
    ["a truncated secret", "Bearer s3cret-valu"],
    ["a longer secret", "Bearer s3cret-value-extra"],
    ["the bare secret with no scheme", "s3cret-value"],
    ["a different scheme", "Basic s3cret-value"],
    ["4KB of junk", `Bearer ${"x".repeat(4096)}`],
  ] as const;

  for (const [name, header] of wrongLength) {
    it(`rejects ${name} without throwing`, () => {
      expect(() => cronAuthorized(headerRequest(header), env)).not.toThrow();
      expect(cronAuthorized(headerRequest(header), env)).toBe(false);
    });
  }

  it("sees a trailing space already stripped by the Headers layer, as `===` did", () => {
    // Not a property of either comparison: `new Request(...)` normalises the header
    // value before any handler reads it, so both the old `===` and the new digest
    // compare are handed "Bearer s3cret-value" and both accept. Recorded here because
    // it looks like a constant-time bypass and is not one — the bytes compared are
    // identical to the secret's, and nothing weaker is accepted.
    const request = headerRequest("Bearer s3cret-value ");
    expect(request.headers.get("authorization")).toBe("Bearer s3cret-value");
    expect(cronAuthorized(request, env)).toBe(true);
  });

  it("rejects everything when CRON_SECRET is unset, including an empty header", () => {
    expect(cronAuthorized(headerRequest("Bearer s3cret-value"), {})).toBe(false);
    expect(cronAuthorized(headerRequest(""), {})).toBe(false);
    expect(cronAuthorized(headerRequest("Bearer "), { CRON_SECRET: "" })).toBe(false);
  });

  it("reads process.env when no env is passed, which is how the routes call it", () => {
    process.env.CRON_SECRET = "from-process-env";
    expect(cronAuthorized(headerRequest("Bearer from-process-env"))).toBe(true);
    expect(cronAuthorized(headerRequest("Bearer other"))).toBe(false);
  });

  it("compares digests, so the raw lengths never reach timingSafeEqual", () => {
    // The property the fix depends on, asserted rather than assumed: hashing makes
    // both sides 32 bytes whatever went in, which is what stops the throw above.
    const short = createHash("sha256").update("", "utf8").digest();
    const long = createHash("sha256").update("x".repeat(100_000), "utf8").digest();
    expect(short.length).toBe(32);
    expect(long.length).toBe(32);
    expect(timingSafeEqual(short, long)).toBe(false);
  });
});

describe("both routes are gated by it", () => {
  it("/api/reengage/run returns 401 for a wrong-length header, not a 500", async () => {
    vi.resetModules();
    process.env.CRON_SECRET = "s3cret-value";
    const { GET } = await import("@/app/api/reengage/run/route");
    for (const header of ["", "Bearer ", "Bearer s3cret-valu", `Bearer ${"x".repeat(4096)}`]) {
      const response = await GET(headerRequest(header));
      expect(response.status).toBe(401);
      expect((await response.json()).reason).toBe("unauthorized");
    }
  });

  it("/api/reengage returns 401 for a wrong-length header, not a 500", async () => {
    vi.resetModules();
    process.env.CRON_SECRET = "s3cret-value";
    const { POST } = await import("@/app/api/reengage/route");
    for (const header of ["", "Bearer ", "Bearer s3cret-valu", `Bearer ${"x".repeat(4096)}`]) {
      const response = await POST(new Request("https://aru.test/api/reengage", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: header },
        body: JSON.stringify({ email: "a@example.com", week: 2 }),
      }));
      expect(response.status).toBe(401);
      expect((await response.json()).reason).toBe("unauthorized");
    }
  });

  it("/api/reengage gets past the gate with the right bearer and stops at the secrets check", async () => {
    vi.resetModules();
    process.env.CRON_SECRET = "s3cret-value";
    delete process.env.RESEND_API_KEY;
    const { POST } = await import("@/app/api/reengage/route");
    const response = await POST(new Request("https://aru.test/api/reengage", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: "Bearer s3cret-value" },
      body: JSON.stringify({ email: "a@example.com", week: 2 }),
    }));
    // 503, not 401: the bearer was accepted and the route stopped where it should,
    // which is what proves the gate is not rejecting valid callers. Nothing is sent.
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe("email not fully configured");
  });

  it("neither route still defines its own authorized()", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    for (const file of ["../app/api/reengage/run/route.ts", "../app/api/reengage/route.ts"]) {
      const source = readFileSync(resolve(import.meta.dirname, file), "utf8");
      expect(source).toContain("cronAuthorized");
      expect(source).not.toMatch(/function authorized\(/);
      expect(source).not.toContain("=== `Bearer ${secret}`");
      // Added at supervisor review: an inline revert — the import left in place, unused,
      // and the header compared against `Bearer ${process.env.CRON_SECRET}` with `!==` —
      // passed every assertion above (18 passed) and only drew an eslint WARNING. The
      // gate has to be CALLED, and no route may build the bearer string itself.
      expect(source).toMatch(/if \(!cronAuthorized\((request|req)\)\)/);
      expect(source).not.toContain("Bearer ${");
    }
  });
});
