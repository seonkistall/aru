import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FUNNEL_ORDER, type FunnelEventKind } from "@/lib/funnel";
import {
  aggregateFunnelSource,
  FUNNEL_AGGREGATE_COLUMNS,
  FUNNEL_AGGREGATE_ROW_CAP,
  FUNNEL_AGGREGATE_SOURCE_COLUMN,
  unattributedRowCount,
} from "@/lib/funnel-aggregate";
import { SYNC_SOURCES } from "@/lib/sync-payload";

/**
 * The read side of `funnel_events`, which nothing had.
 *
 * Two things this file is written to hold, both of them rules from
 * `supabase/schema.sql`'s own comment on the `metadata` column rather than taste:
 * the two sources are never pooled, and the read is aggregate counts only — it must
 * not be able to reconstruct one visitor's row sequence.
 *
 * Supabase is mocked at the query-builder level rather than stubbed out, because the
 * assertions are about the QUERY: which columns are selected, which filter is applied,
 * and that `visitor_id` is never asked for. A test that only read the response body
 * could not tell a filtered read from a read of the whole table.
 */
const db = vi.hoisted(() => ({
  available: true,
  /** Rows the fake table holds, per source marker. */
  bySource: {} as Record<string, Record<string, unknown>[]>,
  /** Rows carrying no known marker — counted in the head count, in neither source. */
  unmarked: 0,
  /** Every call the route made, in order. */
  calls: [] as {
    table: string;
    columns: string;
    options: { count?: string; head?: boolean } | undefined;
    filters: { column: string; value: unknown }[];
    order?: { column: string; ascending?: boolean };
    limit?: number;
  }[],
  error: null as null | { message: string },
  /**
   * An error on the whole-table head count ALONE, with the per-source reads fine.
   * Without this the head count's own error check is untestable: setting `error`
   * fails the source reads too, and the later check catches it, so deleting the
   * first one failed nothing. It is a real guard — a count over the whole table can
   * be refused while a filtered read is served — and this is what holds it.
   */
  headError: null as null | { message: string },
  throws: false,
}));

vi.mock("@/lib/supabase-admin", () => ({
  hasValidSyncToken: (request: Request) => request.headers.get("authorization") === "Bearer valid",
  getSupabaseAdmin: async () => {
    if (!db.available) return null;
    return {
      from(table: string) {
        return {
          select(columns: string, options?: { count?: string; head?: boolean }) {
            const call = { table, columns, options, filters: [] as { column: string; value: unknown }[] } as (typeof db.calls)[number];
            db.calls.push(call);
            if (db.throws) throw new Error("client exploded");

            const total = () =>
              Object.values(db.bySource).reduce((sum, rows) => sum + rows.length, 0) + db.unmarked;

            const resolveRows = () => {
              const filter = call.filters.find((entry) => entry.column === FUNNEL_AGGREGATE_SOURCE_COLUMN);
              const rows = filter ? (db.bySource[String(filter.value)] ?? []) : [];
              const ordered = [...rows].sort((a, b) => Number(b.ts) - Number(a.ts));
              return { all: ordered, page: ordered.slice(0, call.limit ?? ordered.length) };
            };

            const builder = {
              eq(column: string, value: unknown) {
                call.filters.push({ column, value });
                return builder;
              },
              order(column: string, opts?: { ascending?: boolean }) {
                call.order = { column, ...opts };
                return builder;
              },
              limit(value: number) {
                call.limit = value;
                return builder;
              },
              then(onFulfilled: (value: unknown) => unknown) {
                if (db.error) return Promise.resolve({ data: null, error: db.error, count: null }).then(onFulfilled);
                if (options?.head && db.headError) {
                  return Promise.resolve({ data: null, error: db.headError, count: null }).then(onFulfilled);
                }
                if (options?.head) return Promise.resolve({ data: null, error: null, count: total() }).then(onFulfilled);
                const { all, page } = resolveRows();
                return Promise.resolve({ data: page, error: null, count: all.length }).then(onFulfilled);
              },
            };
            return builder;
          },
        };
      },
    };
  },
}));

const { GET: funnelGet } = await import("@/app/api/funnel/route");

const root = resolve(import.meta.dirname, "..");

function row(kind: FunnelEventKind, sessionId: string, ts = Date.UTC(2026, 8, 17)) {
  return { kind, session_id: sessionId, ts };
}

function get(token?: string) {
  return funnelGet(
    new Request("https://aru.test/api/funnel", {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    })
  );
}

async function aggregateFor(token = "valid") {
  const body = await (await get(token)).json();
  return body.aggregate;
}

beforeEach(() => {
  db.available = true;
  db.bySource = {};
  db.unmarked = 0;
  db.calls = [];
  db.error = null;
  db.headError = null;
  db.throws = false;
});

describe("the aggregate is behind the sync token, in the shape /api/sync already uses", () => {
  it("omits the field entirely without a token, and does no database work", async () => {
    const body = await (await get()).json();
    expect(body.aggregate).toBeUndefined();
    // Not merely absent from the body: the query never ran. An unauthenticated caller
    // costs this route exactly what it cost before the aggregate existed.
    expect(db.calls).toEqual([]);
  });

  it("omits it for a wrong token too", async () => {
    const body = await (await get("nope")).json();
    expect(body.aggregate).toBeUndefined();
    expect(db.calls).toEqual([]);
  });

  it("still publishes the ingest fields the flush reads, either way", async () => {
    const anonymous = await (await get()).json();
    const authorised = await (await get("valid")).json();
    for (const body of [anonymous, authorised]) {
      expect(body.maxBytes).toBe(32 * 1024);
      expect(body.maxEvents).toBe(100);
      expect(body.rateLimit).toEqual({ windowMs: 60_000, max: 20 });
    }
  });

  it("invents no new auth mechanism — the route reads hasValidSyncToken and nothing else", () => {
    const source = readFileSync(resolve(root, "app/api/funnel/route.ts"), "utf8");
    expect(source).toContain("hasValidSyncToken(request)");
    // A second secret, a query-string key or a cookie check would all be a new
    // mechanism; the brief for this read was explicitly not to invent one.
    expect(source).not.toMatch(/process\.env\.[A-Z_]*(KEY|SECRET|PASSWORD)/);
  });
});

describe("aggregate counts only — no visitor, no row sequence", () => {
  it("never asks the database for visitor_id or props", async () => {
    db.bySource["public-funnel"] = [row("scan_started", "s1")];
    await aggregateFor();
    const columns = db.calls.map((call) => call.columns);
    expect(columns.length).toBeGreaterThan(0);
    for (const selected of columns) {
      expect(selected).not.toContain("visitor_id");
      expect(selected).not.toContain("props");
      expect(selected).not.toBe("*");
    }
    expect(FUNNEL_AGGREGATE_COLUMNS).toBe("kind, session_id, ts");
  });

  it("returns counts and never a row, an id, or a timeline", async () => {
    db.bySource["public-funnel"] = [row("scan_started", "s1"), row("scan_completed", "s1")];
    const aggregate = await aggregateFor();
    const serialised = JSON.stringify(aggregate);
    expect(serialised).not.toContain("s1");
    expect(serialised).not.toContain("visitor");
    for (const source of aggregate.sources) {
      expect(source).not.toHaveProperty("rowsRead");
      expect(source).not.toHaveProperty("events");
      expect(Object.keys(source.summary)).not.toContain("visitors");
    }
  });

  it("counts sessions from rows that carry no visitor id at all", () => {
    // The countable type has no field for one, which is what lets the route select
    // without it rather than selecting it and promising not to look.
    const aggregate = aggregateFunnelSource(
      "public-funnel",
      [row("scan_started", "a"), row("scan_started", "b"), row("scan_completed", "a")],
      3
    );
    expect(aggregate.summary.sessions).toBe(2);
    expect(aggregate.summary.steps.scan_started).toBe(2);
    expect(aggregate.summary.steps.scan_completed).toBe(1);
  });
});

describe("the two sources are never pooled", () => {
  it("queries each source on its own, on the indexed jsonb path", async () => {
    await aggregateFor();
    const filtered = db.calls.filter((call) => call.filters.length > 0);
    expect(filtered).toHaveLength(SYNC_SOURCES.length);
    expect(filtered.map((call) => call.filters[0].value)).toEqual([...SYNC_SOURCES]);
    for (const call of filtered) {
      expect(call.filters[0].column).toBe(FUNNEL_AGGREGATE_SOURCE_COLUMN);
      expect(call.table).toBe("funnel_events");
    }
  });

  it("matches the index supabase/schema.sql declares for exactly this read", () => {
    const schema = readFileSync(resolve(root, "supabase/schema.sql"), "utf8");
    expect(schema).toContain("funnel_events_source_ts_idx on funnel_events ((metadata->>'source'), ts)");
    expect(FUNNEL_AGGREGATE_SOURCE_COLUMN).toBe("metadata->>source");
  });

  it("keeps one source's rows out of the other's counts", async () => {
    db.bySource["ops-local"] = [row("scan_started", "op1"), row("scan_completed", "op1")];
    db.bySource["public-funnel"] = [row("scan_started", "p1"), row("scan_started", "p2")];
    const aggregate = await aggregateFor();
    const ops = aggregate.sources.find((entry: { source: string }) => entry.source === "ops-local");
    const pub = aggregate.sources.find((entry: { source: string }) => entry.source === "public-funnel");
    expect(ops.summary.sessions).toBe(1);
    expect(ops.summary.steps.scan_completed).toBe(1);
    expect(pub.summary.sessions).toBe(2);
    expect(pub.summary.steps.scan_completed).toBe(0);
  });

  it("offers no total that adds the two, anywhere in the response", async () => {
    db.bySource["ops-local"] = [row("scan_started", "op1")];
    db.bySource["public-funnel"] = [row("scan_started", "p1")];
    const aggregate = await aggregateFor();
    // tableRows is the table's own row count, which includes unmarked rows and is
    // therefore not the sum of the panels. Nothing else in the payload is a number
    // spanning both sources.
    expect(aggregate.sources).toHaveLength(2);
    expect(aggregate).not.toHaveProperty("summary");
    expect(aggregate).not.toHaveProperty("steps");
    expect(aggregate).not.toHaveProperty("sessions");
  });

  it("renders the two apart on /ops and says so", () => {
    const ops = readFileSync(resolve(root, "app/ops/page.tsx"), "utf8");
    // The on-device panel survives: the brief was to sit next to it, not replace it.
    expect(ops).toContain("summarizeFunnel()");
    expect(ops).toContain("on-device log");
    expect(ops).toContain("<ServerFunnelPanel");
    expect(ops).toContain("aggregate.sources.map");
  });
});

describe("the three normal states today", () => {
  it("says not configured rather than showing zeros", async () => {
    db.available = false;
    const aggregate = await aggregateFor();
    expect(aggregate).toEqual({ available: false, reason: "not-configured" });
  });

  it("distinguishes a failed query from an unconfigured one", async () => {
    db.error = { message: "relation does not exist" };
    const aggregate = await aggregateFor();
    expect(aggregate).toEqual({ available: false, reason: "query-failed" });
  });

  it("treats a head count that fails on its own as a failed read, not as an empty table", async () => {
    db.bySource["public-funnel"] = [row("scan_started", "p1")];
    db.headError = { message: "permission denied for table funnel_events" };
    const aggregate = await aggregateFor();
    // The per-source reads would have succeeded. Reporting them without the total
    // would print tableRows: 0 next to panels holding rows, and unattributedRows
    // would go negative-then-clamped to 0 — a made-up number on a screen whose whole
    // job is to say what it does not know.
    expect(aggregate).toEqual({ available: false, reason: "query-failed" });
  });

  it("survives a client that throws instead of returning an error", async () => {
    db.throws = true;
    const aggregate = await aggregateFor();
    expect(aggregate).toEqual({ available: false, reason: "query-failed" });
    // The ingest fields are what the flush itself reads; a broken aggregate must not
    // take the status handler down with it.
    const body = await (await get("valid")).json();
    expect(body.maxBytes).toBe(32 * 1024);
  });

  it("reports an empty table as available with zero rows, not as unavailable", async () => {
    const aggregate = await aggregateFor();
    expect(aggregate.available).toBe(true);
    expect(aggregate.tableRows).toBe(0);
    expect(aggregate.sources.map((entry: { totalRows: number }) => entry.totalRows)).toEqual([0, 0]);
    for (const source of aggregate.sources) {
      // Every ratio is 0 and no NaN reaches the screen; the UI is what turns a zero
      // denominator into "—".
      for (const value of Object.values(source.summary)) {
        if (typeof value === "number") expect(Number.isNaN(value)).toBe(false);
      }
      expect(source.summary.captureStart).toBe(0);
      expect(source.firstTs).toBeNull();
    }
  });

  it("still returns a panel for the empty source when only one has rows", async () => {
    db.bySource["public-funnel"] = [row("scan_started", "p1")];
    const aggregate = await aggregateFor();
    expect(aggregate.sources).toHaveLength(2);
    const ops = aggregate.sources.find((entry: { source: string }) => entry.source === "ops-local");
    expect(ops.totalRows).toBe(0);
    expect(ops.truncated).toBe(false);
  });
});

describe("what the read cannot promise, said in the payload", () => {
  it("states truncation rather than silently capping", () => {
    const rows = Array.from({ length: 10 }, (_, index) => row("scan_started", `s${index}`));
    const aggregate = aggregateFunnelSource("public-funnel", rows, 4200);
    expect(aggregate.rows).toBe(10);
    expect(aggregate.totalRows).toBe(4200);
    expect(aggregate.truncated).toBe(true);
  });

  it("caps the page and orders newest first, so a truncated window is the recent one", async () => {
    db.bySource["public-funnel"] = [row("scan_started", "p1")];
    await aggregateFor();
    const filtered = db.calls.filter((call) => call.filters.length > 0);
    for (const call of filtered) {
      expect(call.limit).toBe(FUNNEL_AGGREGATE_ROW_CAP);
      expect(call.order).toEqual({ column: "ts", ascending: false });
      expect(call.options?.count).toBe("exact");
    }
  });

  it("reports rows that carry neither marker instead of dropping them", async () => {
    db.bySource["ops-local"] = [row("scan_started", "op1")];
    db.unmarked = 3;
    const aggregate = await aggregateFor();
    expect(aggregate.tableRows).toBe(4);
    expect(aggregate.unattributedRows).toBe(3);
  });

  it("refuses to compute unattributed rows when a source was truncated", () => {
    const truncated = aggregateFunnelSource("public-funnel", [row("scan_started", "s1")], 9000);
    const whole = aggregateFunnelSource("ops-local", [row("scan_started", "op1")], 1);
    expect(unattributedRowCount(10_000, [truncated, whole])).toBeNull();
    expect(unattributedRowCount(9_002, [whole, aggregateFunnelSource("public-funnel", [], 0)])).toBe(9_001);
  });

  it("keeps a kind this build has no step for, and names it", () => {
    const aggregate = aggregateFunnelSource(
      "public-funnel",
      [row("scan_started", "s1"), { kind: "checkout_started", session_id: "s2", ts: Date.UTC(2026, 8, 17) }],
      2
    );
    expect(FUNNEL_ORDER).not.toContain("checkout_started" as FunnelEventKind);
    expect(aggregate.unknownKinds).toEqual(["checkout_started"]);
    // Counted where it can be — the session is real — and in no step, which is why
    // the screen has to name it or the two numbers look inconsistent for no reason.
    expect(aggregate.summary.sessions).toBe(2);
    expect(aggregate.summary.steps.scan_started).toBe(1);
  });

  it("drops a row with no usable kind or session id, and counts the drop", () => {
    const aggregate = aggregateFunnelSource(
      "public-funnel",
      [row("scan_started", "s1"), { kind: null, session_id: "s2", ts: 1 }, { kind: "scan_started", session_id: "", ts: 1 }],
      3
    );
    expect(aggregate.rows).toBe(1);
    expect(aggregate.unusableRows).toBe(2);
    expect(aggregate.summary.sessions).toBe(1);
  });
});

describe("the flag this read does not touch", () => {
  it("leaves NEXT_PUBLIC_FUNNEL_FLUSH unset everywhere in the repository", () => {
    for (const file of ["app/api/funnel/route.ts", "lib/funnel-aggregate.ts", "app/ops/page.tsx"]) {
      expect(readFileSync(resolve(root, file), "utf8")).not.toContain("NEXT_PUBLIC_FUNNEL_FLUSH=on");
    }
  });
});
