import { DEVICE_DATA_KEY } from "./device-data";
import { FUNNEL_ORDER, getFunnelEvents, type FunnelEvent, type FunnelEventKind, type FunnelProps } from "./funnel";
import type { GyeolSyncPayload } from "./sync-payload";

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
 * READ `docs/funnel-flush-design.md` BEFORE TURNING IT ON. A browser cannot hold
 * `SUPABASE_SYNC_TOKEN`, so an unauthenticated POST to `/api/sync` is refused 401
 * and this flush cannot succeed against that route today —
 * `tests/funnel-flush.test.ts` pins the 401 against the real handler so nobody
 * discovers it in production. The endpoint that can accept it does not exist yet.
 */

export const FUNNEL_FLUSH_FLAG = "NEXT_PUBLIC_FUNNEL_FLUSH";

/** Default target. Deliberately the existing gated route — see the 401 note above. */
export const FUNNEL_FLUSH_ENDPOINT = "/api/sync";

/** Upper bound on one request. The route's own limit is 5 MB; this stays far under it. */
export const FUNNEL_FLUSH_MAX_EVENTS = 200;

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
 * The prop keys each event kind is allowed to send off the device.
 *
 * `sanitizeProps` in `lib/funnel.ts` already coerces values to primitives and caps
 * strings at 40 characters, which is what keeps a blob or an object out. It does not
 * and cannot bound the *keys*: a future call site that records a survey completion
 * with a `{ note: freeText }` prop would pass that filter intact. On-device that was
 * a contained mistake. With a flush it is an egress of free text, so the boundary
 * gets its own allowlist and `tests/funnel-flush.test.ts` fails if any call site in
 * the tree uses a key that is not listed here.
 *
 * Every entry below is a key some call site actually passes today; the empty arrays
 * are the page-view kinds, which carry nothing but the fact of the view.
 */
export const FUNNEL_PROP_KEYS: Record<FunnelEventKind, readonly string[]> = {
  home_viewed: [],
  share_landed: [],
  scan_opened: [],
  camera_blocked: ["reason"],
  camera_interrupted: ["reason"],
  scan_started: ["mode"],
  scan_completed: ["retake", "source"],
  survey_viewed: [],
  survey_completed: ["concerns", "hasScan"],
  reco_viewed: ["scanApplied", "picks"],
  care_viewed: [],
  checkin_opened: [],
  share_clicked: ["surface", "mode"],
  commerce_clicked: ["placement", "merchant"],
};

const MAX_STRING = 40;

function redactProps(kind: FunnelEventKind, props: unknown): FunnelProps | undefined {
  if (!props || typeof props !== "object" || Array.isArray(props)) return undefined;
  const allowed = FUNNEL_PROP_KEYS[kind] ?? [];
  const clean: FunnelProps = {};
  for (const key of allowed) {
    const value = (props as Record<string, unknown>)[key];
    // Re-applied rather than trusted: these events were written to localStorage by
    // whatever version of sanitizeProps shipped that day and may predate any rule.
    if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "boolean") clean[key] = value;
    else if (typeof value === "string") clean[key] = value.slice(0, MAX_STRING);
  }
  return Object.keys(clean).length ? clean : undefined;
}

/**
 * Rebuild one event from an allowlist, field by field.
 *
 * Constructed, never spread. A stored event is JSON that was on disk in a browser
 * ARU does not control, so `{ ...event }` would forward any field a future version,
 * a bug or a hand-edited localStorage entry put on it. The five fields below are
 * everything `funnel_events` has a column for.
 *
 * Returns null for a kind that is not in `FUNNEL_ORDER`, so a retired or misspelled
 * kind is dropped here rather than rejected by the database later.
 */
export function redactFunnelEvent(event: FunnelEvent): FunnelEvent | null {
  if (!event || typeof event !== "object") return null;
  if (!FUNNEL_ORDER.includes(event.kind)) return null;
  if (typeof event.id !== "string" || !event.id) return null;
  if (!Number.isFinite(event.ts)) return null;
  return {
    id: event.id.slice(0, 64),
    kind: event.kind,
    visitorId: String(event.visitorId ?? "").slice(0, 64),
    sessionId: String(event.sessionId ?? "").slice(0, 64),
    props: redactProps(event.kind, event.props),
    ts: event.ts,
  };
}

/**
 * The request body for a flush: funnel events and nothing else.
 *
 * Emphatically NOT `buildLocalSyncPayload()`. That helper is what `/ops` posts and it
 * reads `getCropSamples()` — consented face images as data URLs — plus labels, pilot
 * notes and the consent audit log. Those travel on an operator's deliberate action
 * behind a typed token; reusing that builder here would put face crops on a path that
 * fires automatically in a consumer browser. The four arrays are present and empty
 * because the route requires them to be arrays, and empty is the whole point.
 */
export function buildFunnelFlushPayload(events: FunnelEvent[], now = Date.now()): GyeolSyncPayload {
  const funnelEvents = events
    .map(redactFunnelEvent)
    .filter((event): event is FunnelEvent => event !== null)
    .slice(0, FUNNEL_FLUSH_MAX_EVENTS);
  return {
    schemaVersion: "2026-07-04.sync.v2",
    clientGeneratedAt: now,
    source: "ops-local",
    labels: [],
    cropSamples: [],
    pilotNotes: [],
    consentEvents: [],
    funnelEvents,
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
 * Record that these ids are safely on a server.
 *
 * Only ever called after a 2xx. This is why the transport is `fetch` with
 * `keepalive` and not `navigator.sendBeacon`: sendBeacon is the obvious tool for a
 * pagehide flush, but it returns only whether the request was queued, never what the
 * server said — so a beacon flush would advance this cursor over a 401 and destroy
 * exactly the events it was meant to deliver.
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
    // A refused write means the next flush re-sends; the route upserts on id, so a
    // duplicate is a no-op server-side. Losing the cursor is safe, losing events is not.
  }
}

export type FunnelFlushOutcome =
  | "disabled" // the flag is off — no request was made
  | "empty" // nothing pending
  | "sent"
  | "rejected" // the server answered, and said no (401 today)
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

  const payload = buildFunnelFlushPayload(pending, options.now);
  if (!payload.funnelEvents?.length) return { outcome: "empty", attempted: 0 };

  const send = options.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);
  if (!send) return { outcome: "failed", attempted: pending.length };

  try {
    const response = await send(options.endpoint ?? FUNNEL_FLUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
      keepalive: true,
    });
    if (!response.ok) return { outcome: "rejected", attempted: pending.length, status: response.status };
    markFunnelEventsFlushed(payload.funnelEvents.map((event) => event.id));
    return { outcome: "sent", attempted: pending.length, status: response.status };
  } catch {
    return { outcome: "failed", attempted: pending.length };
  }
}
