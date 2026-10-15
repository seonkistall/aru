import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * POST /api/sync counts a request against the rate limit only after its sync token
 * checks out.
 *
 * The limiter is keyed on the forwarded client address, which a caller on the operator's
 * network shares and which, off Vercel, any caller can set (whether Vercel lets a
 * client-set x-vercel-forwarded-for through is recorded as unknown). Were it counted
 * before the token check, a caller without the token could use up that bucket with
 * token-less requests and lock the operator out of /ops sync with 429s for the rest of
 * the window. Moving the limiter above the token
 * check left every other test green, so nothing pinned the order.
 *
 * The route's own token check runs (only the Supabase client and its env check are
 * replaced), the requests are dry runs, and the limit is read from the route's GET.
 *
 * Found by the cycle 120 bug hunt.
 */

vi.mock("@/lib/supabase-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase-admin")>()),
  isSupabaseSyncConfigured: () => true,
  getSupabaseAdmin: async () => {
    throw new Error("a dry run must not reach Supabase");
  },
}));

const { GET, POST } = await import("@/app/api/sync/route");

const TOKEN = "test-sync-token-0123456789abcdef0123456789";
const CLIENT = "203.0.113.7";
const saved = { token: process.env.SUPABASE_SYNC_TOKEN, origins: process.env.SUPABASE_SYNC_ALLOWED_ORIGINS };

beforeAll(() => {
  process.env.SUPABASE_SYNC_TOKEN = TOKEN;
  delete process.env.SUPABASE_SYNC_ALLOWED_ORIGINS;
});

afterAll(() => {
  // Assigning undefined would leave the string "undefined" behind.
  if (saved.token === undefined) delete process.env.SUPABASE_SYNC_TOKEN;
  else process.env.SUPABASE_SYNC_TOKEN = saved.token;
  if (saved.origins === undefined) delete process.env.SUPABASE_SYNC_ALLOWED_ORIGINS;
  else process.env.SUPABASE_SYNC_ALLOWED_ORIGINS = saved.origins;
});

function syncRequest(auth: Record<string, string>) {
  const payload = {
    schemaVersion: "2026-07-04.sync.v2",
    clientGeneratedAt: 1,
    source: "ops-local",
    labels: [],
    cropSamples: [],
    pilotNotes: [],
    consentEvents: [],
  };
  return new Request("http://localhost/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": CLIENT, ...auth },
    body: JSON.stringify({ dryRun: true, payload }),
  });
}

/** No token, a wrong bearer token, and a wrong direct-header token, in turn. */
const WITHOUT_TOKEN: Record<string, string>[] = [
  {},
  { authorization: "Bearer not-the-sync-token-0123456789abcdef0123" },
  { "x-gyeol-sync-token": "not-the-sync-token-0123456789abcdef0123" },
];

describe("POST /api/sync rate limit", () => {
  it("is not used up by token-less requests from the operator's client address", async () => {
    const { rateLimit } = (await (await GET(new Request("http://localhost/api/sync"))).json()) as { rateLimit: { max: number } };
    expect(rateLimit.max).toBeGreaterThan(0);

    const refused: number[] = [];
    for (let i = 0; i < rateLimit.max * 2 + 1; i++) {
      refused.push((await POST(syncRequest(WITHOUT_TOKEN[i % WITHOUT_TOKEN.length]))).status);
    }
    expect(new Set(refused), "a token-less request was answered with something other than 401").toEqual(new Set([401]));

    // The operator, from the same address, still has the whole bucket.
    const valid = { authorization: `Bearer ${TOKEN}` };
    const first = await POST(syncRequest(valid));
    expect(first.status, "the token-less requests used up the operator's limit").toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, dryRun: true });

    const rest: number[] = [];
    for (let i = 1; i < rateLimit.max; i++) rest.push((await POST(syncRequest(valid))).status);
    expect(new Set(rest), "the token-less requests used part of the operator's limit").toEqual(new Set([200]));

    // And the limit is still there for the operator: one more in the window is refused.
    expect((await POST(syncRequest(valid))).status).toBe(429);
  });
});
