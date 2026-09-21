import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The week-2 and week-4 mails must not both reach one person in one run.
 *
 * The runner sweeps `[2, 4]` in order, and the two passes used to be fully
 * independent: the week-4 query filtered on `week4_sent_at is null` and on
 * `consented_at` alone, never on whether the week-2 mail had gone out. A contact who
 * consented four or more weeks ago with neither column set matched BOTH queries, and
 * the week-2 send inside the loop sets only `week2_sent_at` — a column the week-4
 * query does not look at — so the same contact was selected again seconds later and
 * received "2주차" and "4주차" in one delivery window.
 *
 * That is the DEFAULT path rather than a corner case. `lib/reengage.ts` is a
 * documented no-op until the owner sets `RESEND_API_KEY`, while
 * `/api/reengage/subscribe` has been storing consenting contacts the whole time, so
 * the first cron tick after the secrets are set sweeps every contact who has been
 * waiting since consent.
 *
 * Supabase is faked at the query-builder level rather than stubbed out, because the
 * assertion is about WHICH ROWS THE QUERY SELECTS. The fake applies each filter the
 * way Postgres would, including that a comparison against NULL is not true — which is
 * the same rule that makes the fix hold week four back when week two has not been
 * sent at all.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Contact = {
  email: string;
  locale?: string;
  consent: boolean;
  revoked_at: string | null;
  consented_at: string;
  week2_sent_at: string | null;
  week4_sent_at: string | null;
  retention_until?: string | null;
};

const db = vi.hoisted(() => ({
  contacts: [] as Record<string, unknown>[],
  /** Every select the route issued, with the filters it carried. */
  selects: [] as { columns: string; filters: { op: string; column: string; value: unknown }[] }[],
}));

function matches(row: Record<string, unknown>, filter: { op: string; column: string; value: unknown }) {
  const actual = row[filter.column];
  switch (filter.op) {
    case "eq":
      return actual === filter.value;
    case "is":
      return actual === filter.value;
    case "lte":
      // Postgres: any comparison against NULL is NULL, which is not true, so the row
      // is excluded. Modelled rather than glossed over — the fix leans on it.
      if (actual === null || actual === undefined) return false;
      return String(actual) <= String(filter.value);
    default:
      throw new Error(`fake supabase: unhandled operator ${filter.op}`);
  }
}

function makeBuilder(table: string) {
  const filters: { op: string; column: string; value: unknown }[] = [];
  let columns = "";
  let mode: "select" | "update" | "delete" = "select";
  let patch: Record<string, unknown> = {};

  const builder: Record<string, unknown> = {
    select(cols: string) {
      if (mode === "select") columns = cols;
      return builder;
    },
    update(values: Record<string, unknown>) {
      mode = "update";
      patch = values;
      return builder;
    },
    delete() {
      mode = "delete";
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push({ op: "eq", column, value });
      return builder;
    },
    is(column: string, value: unknown) {
      filters.push({ op: "is", column, value });
      return builder;
    },
    lte(column: string, value: unknown) {
      filters.push({ op: "lte", column, value });
      return builder;
    },
    limit() {
      return builder;
    },
    then(resolve: (value: { data: unknown; error: null }) => unknown) {
      if (table !== "reengage_contacts") throw new Error(`fake supabase: unknown table ${table}`);
      const hits = db.contacts.filter((row) => filters.every((filter) => matches(row, filter)));
      if (mode === "update") {
        for (const row of hits) Object.assign(row, patch);
        return resolve({ data: null, error: null });
      }
      if (mode === "delete") {
        db.contacts = db.contacts.filter((row) => !hits.includes(row));
        return resolve({ data: hits, error: null });
      }
      db.selects.push({ columns, filters: [...filters] });
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

const { GET } = await import("@/app/api/reengage/run/route");

function request() {
  return new Request("https://aru.test/api/reengage/run", {
    headers: { authorization: "Bearer cron-secret" },
  });
}

function contact(overrides: Partial<Contact> & { email: string; weeksAgo: number }): Record<string, unknown> {
  const { weeksAgo, ...rest } = overrides;
  return {
    locale: "ko",
    consent: true,
    revoked_at: null,
    consented_at: new Date(Date.now() - weeksAgo * WEEK_MS).toISOString(),
    week2_sent_at: null,
    week4_sent_at: null,
    retention_until: null,
    ...rest,
  };
}

beforeEach(() => {
  sent.length = 0;
  db.selects.length = 0;
  db.contacts = [];
  process.env.CRON_SECRET = "cron-secret";
  process.env.REENGAGE_LINK_BASE = "https://aru.test";
  process.env.UNSUBSCRIBE_SECRET = "unsubscribe-secret";
});

describe("re-engagement runner: one mail per contact per run", () => {
  it("does not send week 2 and week 4 to the same contact in one sweep", async () => {
    db.contacts = [contact({ email: "waiting@example.com", weeksAgo: 9 })];

    const response = await GET(request());
    const body = await response.json();

    expect(sent).toEqual([{ email: "waiting@example.com", week: 2 }]);
    expect(body.sent).toBe(1);
    // The row was marked, so the next run is the one that may consider week four.
    expect(db.contacts[0].week2_sent_at).not.toBeNull();
    expect(db.contacts[0].week4_sent_at).toBeNull();
  });

  it("sends week 4 once the week-2 mail is two weeks behind it", async () => {
    db.contacts = [
      contact({
        email: "ready@example.com",
        weeksAgo: 9,
        week2_sent_at: new Date(Date.now() - 3 * WEEK_MS).toISOString(),
      }),
    ];

    await GET(request());

    expect(sent).toEqual([{ email: "ready@example.com", week: 4 }]);
    expect(db.contacts[0].week4_sent_at).not.toBeNull();
    // Week four is the last mail, so it is what starts the retention clock.
    expect(db.contacts[0].retention_until).not.toBeNull();
  });

  it("holds week 4 back while the week-2 mail is still recent", async () => {
    db.contacts = [
      contact({
        email: "justmailed@example.com",
        weeksAgo: 9,
        week2_sent_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    await GET(request());

    expect(sent).toEqual([]);
  });

  it("asks the database for the spacing rather than filtering in the runner", async () => {
    db.contacts = [contact({ email: "waiting@example.com", weeksAgo: 9 })];

    await GET(request());

    const weekFour = db.selects.find((select) => select.columns.includes("week4_sent_at"));
    expect(weekFour, "the week-4 pass did not run").toBeDefined();
    expect(weekFour!.filters.map((f) => `${f.op}:${f.column}`)).toContain("lte:week2_sent_at");
  });

  it("still mails a contact who is only due for week 2", async () => {
    db.contacts = [contact({ email: "twoweeks@example.com", weeksAgo: 3 })];

    await GET(request());

    expect(sent).toEqual([{ email: "twoweeks@example.com", week: 2 }]);
  });
});
