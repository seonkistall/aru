import { FUNNEL_ORDER, funnelDropoff, summarizeFunnel, type FunnelCountable, type FunnelEventKind, type FunnelStage, type FunnelSummary } from "./funnel";
import { SYNC_SOURCES, type SyncSource } from "./sync-payload";

/**
 * The read side of `funnel_events`.
 *
 * Cycle 6 built the browser flush and cycle 7 built `POST /api/funnel`, so the table
 * can be written. Nothing read it: `/ops` builds its funnel panel from `readSnapshot()`
 * over `lib/funnel.ts`, which is localStorage — the operator's own browser. With the
 * flag on and rows arriving, the only thing `/ops` would show is the operator's own
 * session. This module is what turns rows in the table into counts on a screen.
 *
 * Two rules it is built around, both from `supabase/schema.sql`'s own comment on the
 * `metadata` column:
 *
 * 1. **The two sources are never pooled.** `ops-local` is an operator uploading their
 *    own device's log through `POST /api/sync` behind a typed token; `public-funnel` is
 *    an unauthenticated write whose `visitor_id`, `session_id` and `ts` nobody can vouch
 *    for. Adding them would count an operator's own device alongside the open internet.
 *    Every aggregate below is per source, and the API returns a list, never a total.
 * 2. **Counts only, never a visitor's row sequence.** The schema comment says to treat
 *    a `public-funnel` row as evidence about a population, not about a visitor; a
 *    per-visitor timeline view is the thing that quietly turns that into tracking. So
 *    `visitor_id` is not in the select list at all — see `FUNNEL_AGGREGATE_COLUMNS` —
 *    and the counters this calls take `FunnelCountable`, which has no field for it.
 */

/**
 * Rows read per source in one aggregate.
 *
 * The aggregate runs in Node over rows PostgREST returns, rather than as a SQL
 * `GROUP BY`: `summarizeFunnel` counts DISTINCT SESSIONS per kind and computes five
 * ratios over set intersections, and reimplementing that in SQL would be a second
 * definition of every number `/ops` already shows — the two would drift and the panels
 * would stop being comparable, which is the whole point of showing them side by side.
 *
 * The cost is a row cap. It is stated in the response and rendered on the screen rather
 * than applied silently, because a truncated window undercounts sessions whose events
 * straddle the cut, and a screen that hides that is worse than one that shows nothing.
 */
export const FUNNEL_AGGREGATE_ROW_CAP = 5000;

/**
 * The only columns this read ever asks for.
 *
 * `visitor_id` is absent deliberately and `props` is absent deliberately. Neither is
 * needed to count sessions per step, and both are the fields that would make a
 * per-visitor view possible from this data. `tests/funnel-aggregate.test.ts` fails if
 * either appears here.
 */
export const FUNNEL_AGGREGATE_COLUMNS = "kind, session_id, ts";

/** The jsonb path PostgREST filters on. Matches `funnel_events_source_ts_idx`. */
export const FUNNEL_AGGREGATE_SOURCE_COLUMN = "metadata->>source";

/** One row as it comes back from PostgREST, before anything is trusted about it. */
export type FunnelAggregateRawRow = {
  kind?: unknown;
  session_id?: unknown;
  ts?: unknown;
};

export type FunnelSourceAggregate = {
  source: SyncSource;
  /** Rows this aggregate could COUNT. Rows that were read but had no usable `kind` or
   *  `session_id` are not here; they are `unusableRows`, and `rows + unusableRows` is
   *  what the page returned. Truncation is measured against that sum and not against
   *  this, which is the 2026-09-20 fix below. */
  rows: number;
  /** Rows the table holds for this source, whether or not they were read. */
  totalRows: number;
  /** `totalRows` exceeds what the page actually returned: the counts below describe
   *  the most recent rows only, and `unattributedRowCount` refuses to subtract. */
  truncated: boolean;
  /** Rows dropped because `kind` or `session_id` was not a usable string. */
  unusableRows: number;
  /**
   * Kinds present in the table that this build's `FUNNEL_ORDER` does not list.
   * `supabase/schema.sql` deliberately has no CHECK on `kind` so a new event kind
   * syncs without a migration, which means an older deploy reading a newer table sees
   * kinds it has no step for. They count towards `rows` and `sessions` and towards no
   * step, so without this an operator would see the two disagree and have no idea why.
   */
  unknownKinds: string[];
  /** Oldest / newest `ts` among the rows read. `null` when nothing was read. */
  firstTs: number | null;
  lastTs: number | null;
  /** The same shape `/ops` already renders for the on-device log, from the same code. */
  summary: FunnelSummary;
  stages: FunnelStage[];
};

export type FunnelAggregate =
  | {
      available: false;
      /**
       * `not-configured` is the normal state today: no Supabase env in this
       * environment, so there is no table to read. `query-failed` is the table being
       * unreachable or the query erroring. They are different sentences on the screen
       * because they need different actions from an operator, and rendering either as
       * an empty panel would read as "nobody is using the product".
       */
      reason: "not-configured" | "query-failed";
    }
  | {
      available: true;
      /** ARU's clock when the read ran, not a client's. */
      readAt: number;
      rowCap: number;
      /** Exact row count of the whole table, all sources and none. */
      tableRows: number;
      /**
       * Rows carrying neither known source marker — a legacy row written before
       * `metadata` existed, say. `null` when it could not be derived because a source
       * was truncated. Reported rather than dropped: rows that are in the table and in
       * neither panel have to be visible somewhere or the panels look like the table.
       */
      unattributedRows: number | null;
      sources: FunnelSourceAggregate[];
    };

const KNOWN_KINDS = new Set<string>(FUNNEL_ORDER);

/**
 * Turn PostgREST rows into countable ones, dropping what cannot be counted.
 *
 * A row whose `kind` or `session_id` is not a non-empty string is unusable rather than
 * unknown: it is in no funnel and belongs to no session. An unrecognised `kind` is a
 * different thing — a real row this build has no step for — and is kept.
 */
function toCountableRows(raw: FunnelAggregateRawRow[]): {
  rows: (FunnelCountable & { ts: number | null })[];
  unusableRows: number;
  unknownKinds: string[];
} {
  const rows: (FunnelCountable & { ts: number | null })[] = [];
  const unknown = new Set<string>();
  let unusableRows = 0;

  for (const row of raw) {
    const kind = typeof row?.kind === "string" ? row.kind : "";
    const sessionId = typeof row?.session_id === "string" ? row.session_id : "";
    if (!kind || !sessionId) {
      unusableRows++;
      continue;
    }
    if (!KNOWN_KINDS.has(kind)) unknown.add(kind);
    const ts = typeof row?.ts === "number" && Number.isFinite(row.ts) ? row.ts : null;
    rows.push({ kind: kind as FunnelEventKind, sessionId, ts });
  }

  return { rows, unusableRows, unknownKinds: [...unknown].sort() };
}

export function aggregateFunnelSource(
  source: SyncSource,
  raw: FunnelAggregateRawRow[],
  totalRows: number
): FunnelSourceAggregate {
  const { rows, unusableRows, unknownKinds } = toCountableRows(raw);
  const stamps = rows.map((row) => row.ts).filter((ts): ts is number => ts !== null);
  /**
   * What the page RETURNED, which is not what it could count.
   *
   * `toCountableRows` drops rows whose `kind` or `session_id` is not a usable string
   * and reports them separately as `unusableRows`, so `rows.length` is the countable
   * subset. Comparing the source's exact `count` against that subset made any unusable
   * row read as truncation: ten rows in the table, ten rows returned, two unusable, and
   * `truncated` came back true with the cap nowhere near. `/ops` then printed "Showing
   * the most recent 8 of 10 rows" about a page that was not short, and
   * `unattributedRowCount` — which returns `null` the moment any source is truncated —
   * stopped reporting unattributed rows at all. Both are the operator's only view of
   * the table, and both were wrong in the direction of saying data is missing when it
   * is not. Fixed 2026-09-20; pinned in tests/funnel-aggregate.test.ts.
   */
  const readRows = raw.length;

  return {
    source,
    rows: rows.length,
    // A total below what was read would be incoherent; clamp rather than print it.
    totalRows: Math.max(totalRows, readRows),
    truncated: totalRows > readRows,
    unusableRows,
    unknownKinds,
    firstTs: stamps.length ? Math.min(...stamps) : null,
    lastTs: stamps.length ? Math.max(...stamps) : null,
    summary: summarizeFunnel(rows),
    stages: funnelDropoff(rows),
  };
}

/**
 * Every source gets an aggregate, including the ones with no rows.
 *
 * Only one of the two having rows is a normal state today, and so is neither. Dropping
 * an empty source here would leave a screen showing one panel with no way to tell
 * whether the other is empty or simply not rendered — and the operator's reading of the
 * one panel they can see would silently become a reading of the whole table.
 */
export function aggregateSourceOrder(): SyncSource[] {
  return [...SYNC_SOURCES];
}

/**
 * Rows in the table that carry neither known marker.
 *
 * Only derivable when nothing was truncated: with a cap in play, what was read is not
 * the source's row count and the subtraction would report a made-up number. `null`
 * then, and the screen says the figure is unavailable rather than showing a zero.
 * Truncation is a property of the PAGE, not of how many of its rows were countable —
 * see `readRows` above.
 */
export function unattributedRowCount(tableRows: number, sources: FunnelSourceAggregate[]): number | null {
  if (sources.some((source) => source.truncated)) return null;
  const attributed = sources.reduce((total, source) => total + source.totalRows, 0);
  return Math.max(0, tableRows - attributed);
}
