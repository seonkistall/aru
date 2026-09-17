import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createRateLimiter, readBoundedJson, requestClientKey, RequestGuardError } from "@/lib/server/request-guard";
import {
  FUNNEL_INGEST_MAX_EVENTS,
  FUNNEL_INGEST_SCHEMA_VERSIONS,
  redactFunnelEvent,
} from "@/lib/funnel-contract";
import type { FunnelEvent } from "@/lib/funnel";
import type { SyncSource } from "@/lib/sync-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public funnel ingest. The first unauthenticated write surface ARU has.
 *
 * `lib/funnel-flush.ts` needs somewhere to post and cannot hold `SUPABASE_SYNC_TOKEN`,
 * so `/api/sync` refuses it 401. This route is the answer, and it is deliberately not
 * "`/api/sync` without the token check": everything that route can trust because a
 * caller proved it holds a secret, this route has to establish for itself.
 *
 * What an attacker can do with an endpoint like this, and the answer in each case —
 * every row has a test in `tests/funnel-ingest.test.ts`:
 *
 * | they send | this route |
 * |---|---|
 * | 10 MB of JSON | 413 on `content-length`, and again on real bytes, at 32 KB |
 * | 10,000 requests | 429 from its own limiter bucket, before the body is read |
 * | 10,000 events in one body | 400 on the count, before anything iterates them |
 * | a kind that does not exist | dropped by `redactFunnelEvent`; never reaches SQL |
 * | a prop key that is free text | dropped; only `FUNNEL_PROP_KEYS[kind]` survives |
 * | a 10 KB prop value | truncated to 40 characters |
 * | a `GyeolSyncPayload` with crops | 400 — there is no field here but `events` |
 * | `metadata.source: "ops-local"` | ignored; the marker is a constant below |
 * | an id that already exists | ignored; an existing row is never modified |
 * | a timestamp in 1970 or 2091 | dropped, so range queries stay usable |
 * | a request from another origin | 403 |
 * | a forged `visitorId` | **nothing.** See the note on `ingestRow` |
 *
 * The flag that makes any of this fire, `NEXT_PUBLIC_FUNNEL_FLUSH`, stays unset.
 * The transport existing is not permission to switch it on — §5 of
 * `docs/funnel-flush-design.md` leaves the PIPA consent basis to the owner.
 */

/**
 * 32 KB, against `/api/sync`'s 5 MB. That route carries base64 face crops; this one
 * carries at most 100 events of six short scalar fields, so the cap can be two orders
 * of magnitude tighter and a caller who needs more is not a browser.
 */
const MAX_INGEST_BYTES = 32 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Twenty a minute per client key. A real browser flushes on mount and on
 * `visibilitychange` to hidden; twenty is generous for a visitor tabbing in and out
 * and nowhere near enough to fill a table.
 *
 * Unlike `/api/sync`, which rate-limits *after* the token check so a spoofed
 * forwarding header cannot consume buckets, this limiter has to run first: there is
 * no auth here for it to run after, so it is the outermost defence rather than a
 * second one. The cost is that a caller rotating `x-forwarded-for` gets a fresh
 * bucket each time — which is why `maxKeys` bounds the map, `MAX_INGEST_BYTES`
 * bounds each request, and the marker below keeps these rows separable from the
 * operator's own.
 */
const RATE_LIMIT_MAX = 20;
const ingestLimit = createRateLimiter({ max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS, maxKeys: 20_000 });

/** Chosen here, never read from the body, so no caller can pass its rows off as an operator sync. */
const INGEST_SOURCE: SyncSource = "public-funnel";

type IngestBody = { schemaVersion?: unknown; events?: unknown };

export async function GET() {
  return Response.json({
    maxBytes: MAX_INGEST_BYTES,
    maxEvents: FUNNEL_INGEST_MAX_EVENTS,
    schemaVersions: FUNNEL_INGEST_SCHEMA_VERSIONS,
    rateLimit: { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX },
  });
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > MAX_INGEST_BYTES) {
    return refuse(413, `Body is too large. Limit is ${MAX_INGEST_BYTES} bytes.`);
  }

  if (!originAllowed(request)) return refuse(403, "Origin is not allowed.");

  if (!ingestLimit(requestClientKey(request))) {
    return refuse(429, "Too many funnel posts. Try again in a minute.");
  }

  let body: IngestBody;
  try {
    const parsed = await readBoundedJson(request, MAX_INGEST_BYTES);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return refuse(400, "Invalid JSON body.");
    body = parsed as IngestBody;
  } catch (error) {
    const status = error instanceof RequestGuardError ? error.status : 400;
    return refuse(status, status === 413 ? `Body is too large. Limit is ${MAX_INGEST_BYTES} bytes.` : "Invalid JSON body.");
  }

  if (!FUNNEL_INGEST_SCHEMA_VERSIONS.includes(body.schemaVersion as never)) {
    return refuse(400, "Unsupported or missing schemaVersion.");
  }

  // The whole contract with this route: one array, of funnel events. No labels, no
  // crop samples, no pilot notes, no consent events — not rejected field by field but
  // simply never read, so there is no field here that could ever carry a face.
  const incoming = body.events;
  if (!Array.isArray(incoming)) return refuse(400, "events must be an array.");
  if (incoming.length > FUNNEL_INGEST_MAX_EVENTS) {
    return refuse(400, `Too many events. Limit is ${FUNNEL_INGEST_MAX_EVENTS} per request.`);
  }

  const now = Date.now();
  const events = incoming
    .map((event) => redactFunnelEvent(event as FunnelEvent, now))
    .filter((event): event is FunnelEvent => event !== null);
  const dropped = incoming.length - events.length;
  if (!events.length) return refuse(400, "No valid funnel events.");

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return Response.json({ ok: false, accepted: 0, dropped, error: "not configured" }, { status: 503 });
  }

  const { error } = await supabase
    .from("funnel_events")
    .upsert(events.map((event) => ingestRow(event, now)), { onConflict: "id", ignoreDuplicates: true });
  if (error) return Response.json({ ok: false, accepted: 0, dropped, error: "store failed" }, { status: 500 });

  return Response.json({ ok: true, accepted: events.length, dropped }, { status: 202 });
}

/**
 * One row, from a body nobody authenticated.
 *
 * `visitor_id` and `session_id` are `crypto.randomUUID()` values the device generated
 * and the device sent, so a caller can put any string there — including one it read
 * off a shared link or simply guessed. **This route cannot prevent that and does not
 * pretend to**; an unauthenticated ingest that claimed trustworthy visitor identity
 * would be lying. What it can do is bound the damage and keep it visible:
 *
 * - `metadata.source` is the constant above, so these rows are always separable from
 *   `ops-local` ones in any query an operator writes;
 * - `receivedAt` is ARU's own clock, so a skewed or forged `ts` is recoverable;
 * - `ignoreDuplicates` means a write can only ever ADD a row. Guessing an existing
 *   id gets you nothing: `/api/sync`'s plain upsert would have let a caller rewrite
 *   an operator's row through this door, which is the one place where "the same
 *   upsert as /api/sync" would have been a real hole.
 *
 * The consequence for anyone reading the table: treat `public-funnel` rows as a
 * population, not as evidence about any one visitor.
 */
function ingestRow(event: FunnelEvent, receivedAt: number) {
  return {
    id: event.id,
    kind: event.kind,
    visitor_id: event.visitorId,
    session_id: event.sessionId,
    props: event.props ?? null,
    metadata: { source: INGEST_SOURCE, receivedAt },
    ts: event.ts,
  };
}

/**
 * Same-origin only, with no configuration required.
 *
 * `/api/sync`'s guard defaults to allow-all when `SUPABASE_SYNC_ALLOWED_ORIGINS` is
 * unset, which is defensible behind a token and not here. So the default is the
 * request's own host, and `FUNNEL_INGEST_ALLOWED_ORIGINS` only widens it (a preview
 * deployment posting to production, say).
 *
 * A missing `Origin` is refused, and that is a spec claim rather than a guess. The
 * Fetch Standard's "append a request `Origin` header" (whatwg/fetch, `fetch.bs`,
 * fetched 2026-09-17 via raw.githubusercontent.com) appends the header whenever
 * "request's method is neither `GET` nor `HEAD`" — unconditionally, same-origin
 * included. So a POST with no `Origin` at all did not come from a page fetch.
 *
 * The same algorithm can set the value to the literal `null` under a `no-referrer`
 * policy, or under `strict-origin`-family policies on an https→http downgrade.
 * Neither applies to ARU's own flush — `next.config.ts` ships
 * `Referrer-Policy: strict-origin-when-cross-origin` and the flush is same-origin
 * https — and `new URL("null")` throws, so that case lands in the `catch` and is
 * refused like any other unparseable origin.
 *
 * None of this stops curl, which can send whatever `Origin` it likes. It is a CSRF
 * boundary, not an authentication one: it keeps some other site's page from posting
 * on a visitor's behalf. The limiter above is what handles a caller who is not a
 * browser at all.
 */
function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  // Doubly held, and deliberately left that way: deleting this line changes no
  // behaviour, because a null origin reaches `new URL(null)` below, which throws into
  // the catch. Kept because it states the rule where the spec citation above explains
  // it, and because the catch is one refactor away from being narrowed. A break-test
  // of this line alone therefore fails nothing — the guard's own tests fail when the
  // `originAllowed` CALL is removed, which is the subject they exist to protect.
  if (!origin) return false;

  const allowList = (process.env.FUNNEL_INGEST_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowList.includes(origin)) return true;

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return false;
  try {
    // Hosts rather than full origins: the scheme can differ between the browser and
    // the handler when TLS terminates at the edge.
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function refuse(status: number, error: string) {
  return Response.json({ ok: false, accepted: 0, error }, { status });
}
