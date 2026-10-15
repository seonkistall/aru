import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/reengage/subscribe took a POST from any site.
 *
 * Its siblings that a page elsewhere could drive (/api/analyze, /api/reason,
 * /api/funnel) refuse a cross-site caller; subscribe had no such boundary. A page on
 * another site could make each visitor's browser POST `{ email, consent: true }` for an
 * address of its choosing, with no script needed (an HTML form with
 * enctype="text/plain" produces a body JSON.parse accepts), and the route stored it as
 * a consented opt-in and cleared any earlier opt-out. Every request came from a
 * different visitor's IP, so the per-client limiter did not bound it. Found by the
 * cycle 117 bug hunt.
 *
 * Supabase is mocked: nothing here talks to a real project.
 */
const store = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: async () => ({
    from: () => ({
      upsert: async (row: Record<string, unknown>) => {
        store.rows.push(row);
        return { error: null };
      },
    }),
  }),
}));

const { POST: subscribe } = await import("@/app/api/reengage/subscribe/route");

const BODY = JSON.stringify({ email: "someone.else@example.com", consent: true, context: "x" });
let client = 0;

function post(headers: Record<string, string>, body = BODY) {
  client += 1;
  return new Request("https://aru.test/api/reengage/subscribe", {
    method: "POST",
    headers: { host: "aru.test", "x-forwarded-for": `198.51.100.${client}`, ...headers },
    body,
  });
}

const SAME_PAGE = { "content-type": "application/json", origin: "https://aru.test", "sec-fetch-site": "same-origin" };

beforeEach(() => {
  store.rows = [];
});

describe("who may enrol an address", () => {
  it("refuses another site's fetch and stores nothing", async () => {
    const response = await subscribe(post({ "content-type": "text/plain;charset=UTF-8", origin: "https://evil.example", "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, reason: "forbidden origin" });
    expect(store.rows).toEqual([]);
  });

  it("refuses a script-free text/plain form post from another site", async () => {
    // What <form enctype="text/plain"> sends for name='{"email":...,"context":"' value='"}'.
    const formBody = '{"email":"form.victim@example.com","consent":true,"context":"="}\r\n';
    const response = await subscribe(post({ "content-type": "text/plain", origin: "https://evil.example" }, formBody));
    expect(response.status).toBe(403);
    expect(store.rows).toEqual([]);
  });

  it("refuses a POST with no Origin, which no page's fetch sends", async () => {
    const response = await subscribe(post({ "content-type": "application/json" }));
    expect(response.status).toBe(403);
    expect(store.rows).toEqual([]);
  });

  it("still stores the opt-in /report's own same-origin fetch sends", async () => {
    const response = await subscribe(post(SAME_PAGE));
    expect(response.status).toBe(200);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ email: "someone.else@example.com", consent: true });
  });

  it("refuses before the limiter, so refused calls do not use up a visitor's bucket", async () => {
    // The limiter allows 5 a minute per client; six refused calls from one address
    // must leave that address's own opt-in untouched.
    const ip = "203.0.113.200";
    for (let i = 0; i < 6; i += 1) {
      const refused = await subscribe(post({ "content-type": "text/plain", origin: "https://evil.example", "x-forwarded-for": ip }));
      expect(refused.status).toBe(403);
    }
    const own = await subscribe(post({ ...SAME_PAGE, "x-forwarded-for": ip }));
    expect(own.status).toBe(200);
  });
});
