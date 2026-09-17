import { DEVICE_DATA_KEY } from "./device-data";
import {
  FUNNEL_INGEST_MAX_EVENTS,
  FUNNEL_INGEST_SCHEMA,
  FUNNEL_PROP_KEYS,
  redactFunnelEvent,
  type FunnelIngestSchemaVersion,
} from "./funnel-contract";
import { getFunnelEvents, type FunnelEvent } from "./funnel";

/**
 * Send funnel events off the device, once somebody deliberately turns it on.
 *
 * `lib/funnel.ts` has recorded to localStorage since it was written and its header
 * says the events "leave the device solely through the gated /api/sync pipeline".
 * The pipeline is real — `lib/sync-payload.ts` carries `funnelEvents`, the route
 * upserts them, `supabase/schema.sql` has the table — but nothing ever POSTed it
 * except a human sitting on `/ops`, which is 404'd in production by `proxy.ts` and
 * needs `SUPABASE_SYNC_TOKEN` typed in. So every real user's funnel data has been
 * written to their own browser and read by nobody.
 *
 * This module is that missing call site. It is **off by default** and changes
 * nothing in any browser until `NEXT_PUBLIC_FUNNEL_FLUSH=on` is set, in the same
 * style as `NEXT_PUBLIC_COMMERCE_AFFILIATE`.
 *
 * READ `docs/funnel-flush-design.md` BEFORE TURNING IT ON. Cycle 6 shipped this
 * pointed at `/api/sync`, which a browser cannot authenticate to; cycle 7 built
 * `POST /api/funnel` — unauthenticated, rate-limited, origin-guarded, funnel-only —
 * and this now posts there instead. The transport working is **not** permission to
 * switch the flag on: §5 of that doc leaves the PIPA consent basis open, and it is
 * an owner decision, not a loop decision.
 */

export const FUNNEL_FLUSH_FLAG = "NEXT_PUBLIC_FUNNEL_FLUSH";

/**
 * The ingest endpoint, and the reason it is not `/api/sync`.
 *
 * `POST /api/sync` requires `SUPABASE_SYNC_TOKEN`, and anything a page can send a
 * visitor can read: put that token in `NEXT_PUBLIC_*` and it is inlined into every
 * client bundle; fetch it from an endpoint and that endpoint is the unauthenticated
 * ingest you were trying to avoid, now handing out a service-role-adjacent secret.
 * So the flush gets a route built for an untrusted caller instead of a token it
 * cannot hold. `tests/funnel-flush.test.ts` still pins the 401 from `/api/sync`.
 */
export const FUNNEL_FLUSH_ENDPOINT = "/api/funnel";

/** One definition, shared with the route, so the client cannot send a body the server refuses on count. */
export const FUNNEL_FLUSH_MAX_EVENTS = FUNNEL_INGEST_MAX_EVENTS;

/** Re-exported so existing importers keep one source of truth — see `lib/funnel-contract.ts`. */
export { FUNNEL_PROP_KEYS, redactFunnelEvent };

const CURSOR_KEY = DEVICE_DATA_KEY.funnelFlushed;

/**
 * Whether funnel events may leave the device automatically.
 *
 * Same shape as `affiliateDisclosureActive()`: an exact `"on"`, so `true`, `1` or a
 * stray whitespace value cannot switch on an egress path by accident. The privacy
 * copy on `/privacy` is driven by this same function, so the page cannot describe a
 * transfer that is not happening, nor stay silent about one that is.
 *
 * The literal `process.env.NEXT_PUBLIC_FUNNEL_FLUSH` is load-bearing and must not be
 * rewritten as `process.env[FUNNEL_FLUSH_FLAG]`. Next inlines public env through
 * webpack's DefinePlugin, keyed on that exact expression — `getNextPublicEnvironmentVariables`
 * in `next/dist/lib/static-env.js` builds the key as `` `process.env.${key}` `` — so the
 * dynamic form is never replaced, reads `undefined` in every browser, and the flag
 * could not be switched on at all. `tests/funnel-flush.test.ts` pins the literal.
 */
export function funnelFlushActive(): boolean {
  return process.env.NEXT_PUBLIC_FUNNEL_FLUSH === "on";
}

/**
 * The request body for a flush: funnel events and nothing else.
 *
 * Emphatically NOT `buildLocalSyncPayload()`, and no longer even the same *shape*.
 * That helper is what `/ops` posts and it reads `getCropSamples()` — consented face
 * images as data URLs — plus labels, pilot notes and the consent audit log. Those
 * travel on an operator's deliberate action behind a typed token. Cycle 6 kept the
 * `GyeolSyncPayload` shape here with the four arrays pinned empty; this body has no
 * field for them at all, so the mistake is now unrepresentable rather than merely
 * tested for, and `/api/funnel` reads nothing but `events`.
 */
export type FunnelFlushBody = {
  schemaVersion: FunnelIngestSchemaVersion;
  clientGeneratedAt: number;
  events: FunnelEvent[];
};

export function buildFunnelFlushBody(events: FunnelEvent[], now = Date.now()): FunnelFlushBody {
  return {
    schemaVersion: FUNNEL_INGEST_SCHEMA,
    clientGeneratedAt: now,
    events: events
      .map((event) => redactFunnelEvent(event, now))
      .filter((event): event is FunnelEvent => event !== null)
      .slice(0, FUNNEL_FLUSH_MAX_EVENTS),
  };
}

function readCursor(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const parsed = JSON.parse(localStorage.getItem(CURSOR_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/**
 * Events recorded on this device that no server has acknowledged.
 *
 * The cursor is a set of ids rather than a high-water timestamp because the event log
 * is capped at `MAX_EVENTS` and trimmed from the front, so a timestamp cursor would
 * silently skip whatever was trimmed between two flushes.
 */
export function pendingFunnelEvents(events: FunnelEvent[] = getFunnelEvents()): FunnelEvent[] {
  const sent = readCursor();
  return events.filter((event) => !sent.has(event.id));
}

/**
 * Record that these ids will never need sending again.
 *
 * Called with the ids as they are stored on this device, which is why the caller
 * passes the events it *attempted* rather than the redacted ones it sent. Two ways
 * that mattered, both of which left a device re-POSTing the same events on every
 * page-hide for the life of the browser profile:
 *
 * - an id longer than `FUNNEL_ID_MAX` is truncated by `redactFunnelEvent`, so the
 *   cursor would store a prefix that `pendingFunnelEvents` never matches;
 * - an event the redactor drops outright (a retired kind, a 1970 timestamp) never
 *   reached the cursor at all, and being undeliverable it would be re-offered,
 *   re-dropped and re-offered again forever.
 *
 * Only ever called after a 2xx, or when the redactor left nothing to send. This is
 * also why the transport is `fetch` with `keepalive` and not `navigator.sendBeacon`:
 * sendBeacon reports only whether the request was queued, never what the server said,
 * so a beacon flush would advance this cursor over a 401 and destroy exactly the
 * events it was meant to deliver.
 */
export function markFunnelEventsFlushed(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const sent = readCursor();
    for (const id of ids) sent.add(id);
    // Bounded the same way the event log is: keep the most recent ids, since an id
    // older than the trimmed log can never be offered again.
    const kept = [...sent].slice(-2000);
    localStorage.setItem(CURSOR_KEY, JSON.stringify(kept));
  } catch {
    // A refused write means the next flush re-sends; the route ignores an id it has
    // already stored, so a duplicate is a no-op server-side. Losing the cursor is
    // safe, losing events is not.
  }
}

export type FunnelFlushOutcome =
  | "disabled" // the flag is off — no request was made
  | "empty" // nothing pending, or nothing pending survived redaction
  | "sent"
  | "rejected" // the server answered, and said no
  | "failed"; // the request never got an answer

export type FunnelFlushResult = {
  outcome: FunnelFlushOutcome;
  attempted: number;
  status?: number;
};

/**
 * Flush pending events. Returns what happened rather than throwing: this runs on a
 * page-hide path where an escaping rejection would surface as an unhandled rejection
 * in a user's console, and analytics must never be able to break the user flow.
 */
export async function flushFunnelEvents(options: {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  events?: FunnelEvent[];
  now?: number;
} = {}): Promise<FunnelFlushResult> {
  if (!funnelFlushActive()) return { outcome: "disabled", attempted: 0 };

  const pending = pendingFunnelEvents(options.events).slice(0, FUNNEL_FLUSH_MAX_EVENTS);
  if (!pending.length) return { outcome: "empty", attempted: 0 };

  const attemptedIds = pending.map((event) => event.id);
  const body = buildFunnelFlushBody(pending, options.now);
  if (!body.events.length) {
    // Nothing survived redaction, so there is nothing a server could accept. Retire
    // the ids rather than offering them again on every page-hide forever.
    markFunnelEventsFlushed(attemptedIds);
    return { outcome: "empty", attempted: 0 };
  }

  const send = options.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);
  if (!send) return { outcome: "failed", attempted: pending.length };

  try {
    const response = await send(options.endpoint ?? FUNNEL_FLUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (!response.ok) return { outcome: "rejected", attempted: pending.length, status: response.status };
    markFunnelEventsFlushed(attemptedIds);
    return { outcome: "sent", attempted: pending.length, status: response.status };
  } catch {
    return { outcome: "failed", attempted: pending.length };
  }
}
