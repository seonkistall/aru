import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What a repeat POST to /api/reengage/subscribe does to a row that already exists.
 *
 * Three questions the supervisor asked on 2026-09-24, answered by driving the real
 * route handlers against a fake `reengage_contacts` table rather than by reading the
 * upsert and reasoning about it:
 *
 *   1. Does subscribing an address that previously unsubscribed undo the unsubscribe?
 *   2. Does re-subscribing an address that already received its week-2/4 mail make the
 *      runner send it again, and WHEN?
 *   3. Does the CRON bearer comparison behave correctly on a wrong-length header?
 *
 * (1) is a consent question and is measured here and decided nowhere — see
 * docs/reengage-resubscribe-consent-decision.md and the BLOCKERS entry. This file
 * pins CURRENT behaviour so the owner's answer, whatever it is, has to come here to
 * change it. (2) is ISSUE-008's deliberate behaviour, already pinned by
 * tests/reengage-resubscribe.regression-8.test.ts; what was NOT pinned is the delay
 * before the repeat mail actually goes out, which is what turns "resets the markers"
 * into a delivery, and that is measured below.
 *
 * The fake applies each filter the way Postgres would, including that a comparison
 * against NULL is not true; `upsert(..., { onConflict: "email" })` replaces the
 * matching row's supplied columns, which is what PostgREST's ON CONFLICT DO UPDATE
 * does for the columns present in the payload.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const db = vi.hoisted(() => ({ contacts: [] as Record<string, unknown>[] }));

function matches(row: Record<string, unknown>, filter: { op: string; column: string; value: unknown }) {
  const actual = row[filter.column];
  switch (filter.op) {
    case "eq":
    case "is":
      return actual === filter.value;
    case "lte":
      if (actual === null || actual === undefined) return false;
      return String(actual) <= String(filter.value);
    default:
      throw new Error(`fake supabase: unhandled operator ${filter.op}`);
  }
}

function makeBuilder(table: string) {
  const filters: { op: string; column: string; value: unknown }[] = [];
  let mode: "select" | "update" | "delete" | "upsert" = "select";
  let patch: Record<string, unknown> = {};

  const builder: Record<string, unknown> = {
    select() { return builder; },
    update(values: Record<string, unknown>) { mode = "update"; patch = values; return builder; },
    delete() { mode = "delete"; return builder; },
    upsert(values: Record<string, unknown>, options: { onConflict: string }) {
      if (options.onConflict !== "email") throw new Error(`fake supabase: unexpected onConflict ${options.onConflict}`);
      mode = "upsert";
      patch = values;
      return builder;
    },
    eq(column: string, value: unknown) { filters.push({ op: "eq", column, value }); return builder; },
    is(column: string, value: unknown) { filters.push({ op: "is", column, value }); return builder; },
    lte(column: string, value: unknown) { filters.push({ op: "lte", column, value }); return builder; },
    limit() { return builder; },
    then(resolve: (value: { data: unknown; error: null }) => unknown) {
      if (table !== "reengage_contacts") throw new Error(`fake supabase: unknown table ${table}`);
      if (mode === "upsert") {
        const existing = db.contacts.find((row) => row.email === patch.email);
        if (existing) Object.assign(existing, patch);
        else db.contacts.push({ ...patch });
        return resolve({ data: null, error: null });
      }
      const hits = db.contacts.filter((row) => filters.every((filter) => matches(row, filter)));
      if (mode === "update") {
        for (const row of hits) Object.assign(row, patch);
        return resolve({ data: null, error: null });
      }
      if (mode === "delete") {
        db.contacts = db.contacts.filter((row) => !hits.includes(row));
        return resolve({ data: hits, error: null });
      }
      return resolve({ data: hits.map((row) => ({ ...row })), error: null });
    },
  };
  return builder;
}

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: async () => ({ from: (table: string) => makeBuilder(table) }),
}));

const sent: { email: string; week: number }[] = [];

vi.mock("@/lib/reengage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reengage")>();
  return {
    ...actual,
    reengageSecretsConfigured: () => true,
    sendReengageEmail: async ({ email, week }: { email: string; week: 2 | 4 }) => {
      sent.push({ email, week });
      return { sent: true as const, id: "email_test" };
    },
  };
});

const { POST: subscribe } = await import("@/app/api/reengage/subscribe/route");
const { POST: unsubscribe } = await import("@/app/api/reengage/unsubscribe/route");
const { GET: run } = await import("@/app/api/reengage/run/route");
const { createUnsubscribeToken } = await import("@/lib/server/unsubscribe-token");

let clientCounter = 0;

function subscribeRequest(email: string) {
  // A fresh client key per call: the route rate-limits 5 per minute per client and
  // this file makes more than five subscribe calls in one process.
  clientCounter += 1;
  return new Request("https://aru.test/api/reengage/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `203.0.113.${clientCounter}` },
    body: JSON.stringify({ email, consent: true, context: "복합성·크림", locale: "ko" }),
  });
}

function runRequest(authorization = "Bearer cron-secret") {
  return new Request("https://aru.test/api/reengage/run", { headers: { authorization } });
}

beforeEach(() => {
  sent.length = 0;
  db.contacts = [];
  process.env.CRON_SECRET = "cron-secret";
  process.env.REENGAGE_LINK_BASE = "https://aru.test";
  process.env.UNSUBSCRIBE_SECRET = "unsubscribe-secret";
  process.env.RESEND_API_KEY = "re_test";
  process.env.REENGAGE_FROM = "ARU <hello@aru.test>";
});

describe("question 1: a POST for a previously-unsubscribed address", () => {
  it("re-consents the revoked row, and the runner then mails it again", async () => {
    expect((await subscribe(subscribeRequest("person@example.com"))).status).toBe(200);
    const token = createUnsubscribeToken("person@example.com", "unsubscribe-secret", Date.now() + WEEK_MS);
    expect((await unsubscribe(new Request("https://aru.test/api/reengage/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }))).status).toBe(200);

    const revoked = db.contacts[0];
    expect(revoked.consent).toBe(false);
    expect(revoked.revoked_at).not.toBeNull();
    expect(revoked.retention_until).not.toBeNull();

    // The POST nobody has to prove they own the address to make. No double opt-in
    // exists, so this is reachable by anyone who knows the address.
    expect((await subscribe(subscribeRequest("person@example.com"))).status).toBe(200);

    const after = db.contacts[0];
    expect(db.contacts).toHaveLength(1);
    expect(after.consent).toBe(true);
    expect(after.revoked_at).toBeNull();
    expect(after.retention_until).toBeNull();

    // And it is a live mailing row again, not merely a flag flip: age the new consent
    // past the two-week gate and the runner selects it.
    after.consented_at = new Date(Date.now() - 3 * WEEK_MS).toISOString();
    await run(runRequest());
    expect(sent).toEqual([{ email: "person@example.com", week: 2 }]);
  });

  it("writes no column that records the revocation it overwrote", async () => {
    await subscribe(subscribeRequest("erased@example.com"));
    const token = createUnsubscribeToken("erased@example.com", "unsubscribe-secret", Date.now() + WEEK_MS);
    await unsubscribe(new Request("https://aru.test/api/reengage/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }));
    await subscribe(subscribeRequest("erased@example.com"));

    // Every column the ROUTE writes, so this fails if a later change adds one that
    // would have held the history. Scope, stated rather than implied: the fake builds
    // the row from the upsert payload, so Postgres defaults are not modelled. In the
    // real table `email` and `created_at` (supabase/schema.sql:187,191) also survive,
    // because PostgREST's ON CONFLICT DO UPDATE touches only the payload's columns —
    // and neither of them records that a revocation ever happened.
    expect(Object.keys(db.contacts[0]).sort()).toEqual([
      "consent", "consent_version", "consented_at", "context", "email",
      "locale", "retention_until", "revoked_at", "week2_sent_at", "week4_sent_at",
    ]);
    expect(db.contacts[0].revoked_at).toBeNull();
  });
});

describe("question 2: re-subscribing an address that already received its mail", () => {
  it("clears the sent markers but does NOT re-send inside the new consent's first two weeks", async () => {
    await subscribe(subscribeRequest("mailed@example.com"));
    const row = db.contacts[0];
    row.consented_at = new Date(Date.now() - 9 * WEEK_MS).toISOString();
    row.week2_sent_at = new Date(Date.now() - 5 * WEEK_MS).toISOString();
    row.week4_sent_at = new Date(Date.now() - 3 * WEEK_MS).toISOString();

    await run(runRequest());
    expect(sent).toEqual([]); // both mails already out

    await subscribe(subscribeRequest("mailed@example.com"));
    expect(db.contacts[0].week2_sent_at).toBeNull();
    expect(db.contacts[0].week4_sent_at).toBeNull();

    // The markers are gone, but `consented_at` was replaced by NOW in the same upsert,
    // and the runner gates on `consented_at <= now - 2 weeks`. So the cleared markers
    // do not produce a mail on the next tick.
    sent.length = 0;
    await run(runRequest());
    expect(sent).toEqual([]);
  });

  it("does re-send week 2 once the NEW consent is itself two weeks old", async () => {
    await subscribe(subscribeRequest("returning@example.com"));
    const row = db.contacts[0];
    row.week2_sent_at = new Date(Date.now() - 5 * WEEK_MS).toISOString();
    await subscribe(subscribeRequest("returning@example.com"));
    db.contacts[0].consented_at = new Date(Date.now() - 3 * WEEK_MS).toISOString();

    await run(runRequest());
    expect(sent).toEqual([{ email: "returning@example.com", week: 2 }]);
  });
});
