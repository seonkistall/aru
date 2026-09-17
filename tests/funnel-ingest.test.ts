import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FUNNEL_ORDER, type FunnelEvent } from "@/lib/funnel";
import { FUNNEL_INGEST_MAX_EVENTS, FUNNEL_INGEST_SCHEMA, FUNNEL_PROP_KEYS } from "@/lib/funnel-contract";
import { flushFunnelEvents, FUNNEL_FLUSH_ENDPOINT, FUNNEL_FLUSH_FLAG } from "@/lib/funnel-flush";
import { SYNC_SOURCES } from "@/lib/sync-payload";

/**
 * `POST /api/funnel` is the first unauthenticated write surface ARU has, so this file
 * is written as the attacker's list rather than the happy path: one describe block per
 * thing somebody can send, and the route's answer pinned in each.
 *
 * Supabase is mocked because the assertions are about what reaches SQL — the exact
 * rows, the conflict options, and which tables are touched at all. A test that only
 * read status codes could not tell a dropped prop key from a stored one.
 */
const store = vi.hoisted(() => ({
  available: true,
  error: null as null | { message: string },
  writes: [] as { table: string; rows: Record<string, unknown>[]; options: unknown }[],
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: async () =>
    store.available
      ? {
          from: (table: string) => ({
            upsert: async (rows: Record<string, unknown>[], options: unknown) => {
              store.writes.push({ table, rows, options });
              return { error: store.error };
            },
          }),
        }
      : null,
}));

const { POST: funnelPost, GET: funnelGet } = await import("@/app/api/funnel/route");

const root = resolve(import.meta.dirname, "..");
const originalEnv = { ...process.env };
const ORIGIN = "https://aru.test";
const HOST = "aru.test";

/** Each test gets its own client key so the module-level limiter cannot leak between them. */
let clientSeq = 0;

beforeEach(() => {
  store.available = true;
  store.error = null;
  store.writes = [];
  clientSeq += 1;
});

afterEach(() => {
  process.env = { ...originalEnv };
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

function event(overrides: Partial<FunnelEvent> = {}): FunnelEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    kind: "scan_completed",
    visitorId: "visitor-1",
    sessionId: "session-1",
    props: { retake: false, source: "roi-calibrated" },
    ts: 1_760_000_000_000,
    ...overrides,
  };
}

/** A request shaped the way a browser actually sends one: same-origin, with a Host. */
function post(body: unknown, headers: Record<string, string> = {}, raw?: string) {
  return new Request("https://aru.test/api/funnel", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      host: HOST,
      "x-forwarded-for": `198.51.100.${clientSeq}`,
      ...headers,
    },
    body: raw ?? JSON.stringify(body),
  });
}

function ingest(events: unknown[], headers?: Record<string, string>) {
  return post({ schemaVersion: FUNNEL_INGEST_SCHEMA, clientGeneratedAt: Date.now(), events }, headers);
}

function storedRows() {
  return store.writes.flatMap((write) => write.rows);
}

describe("send ten megabytes", () => {
  it("refuses a body over the cap, far under what /api/sync allows", async () => {
    const huge = "x".repeat(64 * 1024);
    const response = await funnelPost(ingest([event({ visitorId: huge })]));
    expect(response.status).toBe(413);
    expect(store.writes).toEqual([]);
  });

  it("publishes a cap two orders of magnitude under /api/sync's", async () => {
    const funnel = await (await funnelGet()).json();
    const sync = readFileSync(resolve(root, "app/api/sync/route.ts"), "utf8");
    expect(sync).toContain("const MAX_SYNC_BYTES = 5 * 1024 * 1024;");
    expect(funnel.maxBytes).toBe(32 * 1024);
    expect(funnel.maxBytes * 100).toBeLessThan(5 * 1024 * 1024);
  });
});

describe("send ten thousand requests", () => {
  it("runs its own limiter bucket, and runs it before the body is read", async () => {
    const from = { "x-forwarded-for": "203.0.113.7" };
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) {
      statuses.push((await funnelPost(ingest([event()], from))).status);
    }
    expect(statuses.filter((status) => status === 202)).toHaveLength(20);
    expect(statuses.slice(20)).toEqual([429, 429]);

    // A different caller is unaffected — the bucket is per client key, not global.
    expect((await funnelPost(ingest([event()], { "x-forwarded-for": "203.0.113.8" }))).status).toBe(202);
  });

  it("refuses more events in one body than it will ever accept", async () => {
    const events = Array.from({ length: FUNNEL_INGEST_MAX_EVENTS + 1 }, () => event());
    const response = await funnelPost(ingest(events));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Too many events") });
    // Refused on the count, so nothing iterated a 101-element array on the way out.
    expect(store.writes).toEqual([]);
  });
});

describe("post from somewhere else", () => {
  it("refuses another site's origin with no configuration needed", async () => {
    const response = await funnelPost(ingest([event()], { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(store.writes).toEqual([]);
  });

  // The Fetch Standard appends Origin to every request whose method is neither GET nor
  // HEAD, same-origin included (whatwg/fetch, fetch.bs, "append a request Origin
  // header"). So a POST arriving without one did not come from a page fetch.
  it("refuses a request that carries no Origin at all", async () => {
    const response = await funnelPost(new Request("https://aru.test/api/funnel", {
      method: "POST",
      headers: { "content-type": "application/json", host: HOST },
      body: JSON.stringify({ schemaVersion: FUNNEL_INGEST_SCHEMA, events: [event()] }),
    }));
    expect(response.status).toBe(403);
  });

  // The same algorithm serializes the origin as the literal `null` under a
  // no-referrer policy. `new URL("null")` throws, so it lands in the catch.
  it("refuses the literal null origin", async () => {
    expect((await funnelPost(ingest([event()], { origin: "null" }))).status).toBe(403);
  });

  it("accepts the page's own origin across an edge that terminated TLS", async () => {
    const response = await funnelPost(ingest([event()], { origin: "https://aru.test", "x-forwarded-host": HOST }));
    expect(response.status).toBe(202);
  });

  it("widens only through its own env, never /api/sync's", async () => {
    process.env.FUNNEL_INGEST_ALLOWED_ORIGINS = "https://preview.aru.test";
    expect((await funnelPost(ingest([event()], { origin: "https://preview.aru.test" }))).status).toBe(202);
    expect((await funnelPost(ingest([event()], { origin: "https://other.example" }))).status).toBe(403);
  });
});

describe("send something that is not a funnel event array", () => {
  it("refuses invalid JSON", async () => {
    expect((await funnelPost(post(null, {}, "{not json"))).status).toBe(400);
  });

  it("refuses a top-level array", async () => {
    expect((await funnelPost(post([event()]))).status).toBe(400);
  });

  it("refuses an unknown schemaVersion", async () => {
    const response = await funnelPost(post({ schemaVersion: "2026-07-04.sync.v2", events: [event()] }));
    expect(response.status).toBe(400);
    expect(store.writes).toEqual([]);
  });

  it("refuses events that is not an array", async () => {
    // The shape that cost /api/sync a 500 before cycle 6 fixed it: a string has a
    // .length, so an unchecked value reaches .map.
    const response = await funnelPost(post({ schemaVersion: FUNNEL_INGEST_SCHEMA, events: "abc" }));
    expect(response.status).toBe(400);
  });

  // The load-bearing assertion of this file. /api/sync's body can carry consented face
  // crops as base64 data URLs; this route has no field for them, so the mistake is
  // unrepresentable rather than filtered.
  it("cannot be handed a GyeolSyncPayload, and ignores a crop smuggled beside events", async () => {
    const crop = "data:image/png;base64,AAAA";
    const asSyncPayload = await funnelPost(post({
      payload: {
        schemaVersion: "2026-07-04.sync.v2",
        clientGeneratedAt: 1,
        source: "ops-local",
        labels: [],
        cropSamples: [{ id: "crop-1", image: crop, ts: 1 }],
        pilotNotes: [],
        consentEvents: [],
        funnelEvents: [event()],
      },
    }));
    expect(asSyncPayload.status).toBe(400);
    expect(store.writes).toEqual([]);

    const smuggled = await funnelPost(post({
      schemaVersion: FUNNEL_INGEST_SCHEMA,
      events: [event()],
      cropSamples: [{ id: "crop-1", image: crop, ts: 1 }],
      labels: [{ id: "label-1" }],
      consentEvents: [{ id: "consent-1", kind: "learning_crop", granted: true }],
    }));
    expect(smuggled.status).toBe(202);
    expect(store.writes.map((write) => write.table)).toEqual(["funnel_events"]);
    expect(JSON.stringify(store.writes)).not.toContain("data:image");
    expect(JSON.stringify(store.writes)).not.toContain("consent-1");
  });
});

describe("send a kind or a prop key the client would never send", () => {
  it("drops a kind that is not in FUNNEL_ORDER", async () => {
    const response = await funnelPost(ingest([
      event({ id: "keep-me" }),
      event({ id: "drop-me", kind: "email_entered" as never }),
    ]));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: 1, dropped: 1 });
    expect(storedRows().map((row) => row.id)).toEqual(["keep-me"]);
  });

  // Mechanical over every kind, so a kind added later is covered without editing this
  // test. The client allowlist is a courtesy once the endpoint is public; this is the
  // server re-deriving the same answer from the same constant.
  it("keeps only the declared prop keys, for every kind there is", async () => {
    const events = FUNNEL_ORDER.map((kind, index) => event({
      id: `kind-${index}`,
      kind,
      props: {
        ...Object.fromEntries(FUNNEL_PROP_KEYS[kind].map((key) => [key, "declared"])),
        note: "사용자가 직접 입력한 자유 텍스트",
        email: "someone@example.com",
      } as never,
    }));
    const response = await funnelPost(ingest(events));
    expect(response.status).toBe(202);
    expect(storedRows()).toHaveLength(FUNNEL_ORDER.length);

    for (const [index, kind] of FUNNEL_ORDER.entries()) {
      const row = storedRows().find((stored) => stored.id === `kind-${index}`);
      const expected = FUNNEL_PROP_KEYS[kind];
      expect(Object.keys((row?.props as Record<string, unknown>) ?? {}).sort(), kind).toEqual([...expected].sort());
    }
    expect(JSON.stringify(store.writes)).not.toContain("example.com");
    expect(JSON.stringify(store.writes)).not.toContain("자유 텍스트");
  });

  it("truncates a prop value to the same 40 characters the device applies", async () => {
    await funnelPost(ingest([event({ kind: "camera_blocked", props: { reason: "z".repeat(500) } })]));
    expect((storedRows()[0].props as { reason: string }).reason).toHaveLength(40);
  });

  it("drops a timestamp no clock could plausibly have produced", async () => {
    const response = await funnelPost(ingest([
      event({ id: "epoch", ts: 0 }),
      event({ id: "far-future", ts: Date.now() + 90 * 24 * 60 * 60 * 1000 }),
      event({ id: "real", ts: Date.now() - 1000 }),
    ]));
    expect(await response.json()).toMatchObject({ accepted: 1, dropped: 2 });
    expect(storedRows().map((row) => row.id)).toEqual(["real"]);
  });

  // Both columns are `not null` and "" satisfies that, so an empty id would be stored
  // rather than rejected — a row in no funnel, counting towards no ratio, inflating
  // the event total of every query that does not think to exclude it.
  it("drops an event with no visitor or session id", async () => {
    const response = await funnelPost(ingest([
      event({ id: "no-visitor", visitorId: "" }),
      event({ id: "no-session", sessionId: undefined as never }),
      event({ id: "complete" }),
    ]));
    expect(await response.json()).toMatchObject({ accepted: 1, dropped: 2 });
    expect(storedRows().map((row) => row.id)).toEqual(["complete"]);
  });

  it("refuses a body in which nothing survived", async () => {
    const response = await funnelPost(ingest([event({ kind: "email_entered" as never })]));
    expect(response.status).toBe(400);
    expect(store.writes).toEqual([]);
  });
});

describe("forge another visitor, or another writer", () => {
  // Honest about the limit: an unauthenticated route cannot verify a device-generated
  // id, and this one does not pretend to. What it can do is keep the two writers apart
  // and stamp its own clock, so an operator reading the table knows which population
  // a row belongs to and when ARU actually saw it.
  it("marks the row public-funnel whatever the body claims", async () => {
    const before = Date.now();
    await funnelPost(post({
      schemaVersion: FUNNEL_INGEST_SCHEMA,
      source: "ops-local",
      metadata: { source: "ops-local" },
      events: [event({ id: "forged" })],
    }));
    const metadata = storedRows()[0].metadata as { source: string; receivedAt: number };
    expect(metadata.source).toBe("public-funnel");
    expect(metadata.source).not.toBe("ops-local");
    expect(metadata.receivedAt).toBeGreaterThanOrEqual(before);
    expect(SYNC_SOURCES).toContain(metadata.source);
  });

  it("uses a marker /api/sync does not, so the two populations stay separable", () => {
    const sync = readFileSync(resolve(root, "app/api/sync/route.ts"), "utf8");
    const funnel = readFileSync(resolve(root, "app/api/funnel/route.ts"), "utf8");
    expect(sync).toContain('const SYNC_METADATA_SOURCE: SyncSource = "ops-local";');
    expect(funnel).toContain('const INGEST_SOURCE: SyncSource = "public-funnel";');
    expect(new Set(SYNC_SOURCES).size).toBe(SYNC_SOURCES.length);
  });

  // /api/sync's plain upsert overwrites on id. Reached through an unauthenticated
  // door that would let anyone who guesses an id rewrite an operator's row, so this
  // route may only ever ADD.
  it("can only add a row, never modify one that exists", async () => {
    await funnelPost(ingest([event()]));
    expect(store.writes[0].options).toEqual({ onConflict: "id", ignoreDuplicates: true });
  });

  it("reports a store failure without leaking the driver's message", async () => {
    store.error = { message: 'duplicate key value violates unique constraint "funnel_events_pkey"' };
    const response = await funnelPost(ingest([event()]));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("funnel_events_pkey");
  });

  it("answers 503 rather than throwing when Supabase is not configured", async () => {
    store.available = false;
    expect((await funnelPost(ingest([event()]))).status).toBe(503);
  });
});

describe("the allowlist the client and the server must agree on", () => {
  // The whole point of lib/funnel-contract.ts. If the route ever grows its own copy of
  // the kind list or the prop allowlist, the two drift silently and the server's
  // re-validation becomes a second opinion instead of the same one.
  it("is imported by the route, not re-declared in it", () => {
    const funnel = readFileSync(resolve(root, "app/api/funnel/route.ts"), "utf8");
    expect(funnel).toContain('from "@/lib/funnel-contract"');
    expect(funnel).toContain("redactFunnelEvent");
    // No second definition of either constant anywhere in the route.
    expect(funnel).not.toMatch(/(const|let)\s+FUNNEL_PROP_KEYS/);
    expect(funnel).not.toMatch(/(const|let)\s+FUNNEL_ORDER/);

    const contract = readFileSync(resolve(root, "lib/funnel-contract.ts"), "utf8");
    const flush = readFileSync(resolve(root, "lib/funnel-flush.ts"), "utf8");
    expect(contract).toMatch(/export const FUNNEL_PROP_KEYS/);
    // The browser side re-exports rather than restating it.
    expect(flush).not.toMatch(/export const FUNNEL_PROP_KEYS/);
    expect(flush).toContain('from "./funnel-contract"');
  });
});

describe("the flush, end to end against the real handler", () => {
  // The thing cycle 6 could not do. Its counterpart — POST /api/sync still refusing
  // the same browser 401 — stays pinned in tests/funnel-flush.test.ts.
  it("succeeds against POST /api/funnel", async () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    };
    (globalThis as { window?: unknown }).window = { localStorage: storage };
    (globalThis as { localStorage?: unknown }).localStorage = storage;
    process.env[FUNNEL_FLUSH_FLAG] = "on";

    const seen: string[] = [];
    const result = await flushFunnelEvents({
      events: [event({ id: "flushed-1" }), event({ id: "flushed-2", kind: "care_viewed", props: undefined })],
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen.push(url);
        return funnelPost(new Request(`https://aru.test${url}`, {
          method: "POST",
          headers: { ...(init.headers as Record<string, string>), origin: ORIGIN, host: HOST, "x-forwarded-for": "203.0.113.99" },
          body: init.body as string,
        }));
      }) as unknown as typeof fetch,
    });

    expect(seen).toEqual([FUNNEL_FLUSH_ENDPOINT]);
    expect(FUNNEL_FLUSH_ENDPOINT).toBe("/api/funnel");
    expect(result).toMatchObject({ outcome: "sent", attempted: 2, status: 202 });
    expect(storedRows().map((row) => row.id).sort()).toEqual(["flushed-1", "flushed-2"]);
    // And the cursor advanced, so a second flush sends nothing.
    expect(JSON.parse(data.get("aru_funnel_flushed_v1") ?? "[]").sort()).toEqual(["flushed-1", "flushed-2"]);
  });
});
