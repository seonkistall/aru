import { FUNNEL_ORDER, type FunnelEvent, type FunnelEventKind, type FunnelProps } from "./funnel";

/**
 * What a funnel event is allowed to be, stated once for both ends of the wire.
 *
 * This module exists because the same allowlist has to hold in two places that do not
 * share a runtime: the browser flush (`lib/funnel-flush.ts`) and the public ingest
 * route (`app/api/funnel/route.ts`). The browser copy is a **courtesy** — `/api/funnel`
 * is unauthenticated, so anyone with curl can POST whatever they like and never run a
 * line of ARU's client code. The server therefore has to re-derive the same answer,
 * and two copies of an allowlist drift. This is one copy, imported by both.
 *
 * Nothing here touches `window`, `localStorage`, `process.env` or the network, which
 * is what makes it importable from a route handler. Keep it that way.
 *
 * `tests/funnel-ingest.test.ts` fails if the route re-declares any of this locally.
 */

/** The body `POST /api/funnel` accepts. Old versions stay listed so a cached bundle keeps working. */
export const FUNNEL_INGEST_SCHEMA_VERSIONS = ["2026-09-17.funnel.v1"] as const;
export type FunnelIngestSchemaVersion = (typeof FUNNEL_INGEST_SCHEMA_VERSIONS)[number];
export const FUNNEL_INGEST_SCHEMA: FunnelIngestSchemaVersion = "2026-09-17.funnel.v1";

/**
 * Events per request. 100 × ~200 bytes sits an order of magnitude under the byte cap,
 * so the byte cap is what actually bites and this is the belt to its braces: a body of
 * 10,000 tiny events is refused on the count before anything iterates it.
 */
export const FUNNEL_INGEST_MAX_EVENTS = 100;

/** Same 40 characters `sanitizeProps` applies on-device. Re-applied, never trusted. */
export const FUNNEL_PROP_STRING_MAX = 40;

/** Ids are opaque to ARU; this only stops a megabyte of "id" reaching a text column. */
export const FUNNEL_ID_MAX = 64;

/**
 * Plausibility window for a client clock, not a security control.
 *
 * `ts` is whatever the visitor's device said, so it is forgeable like everything else
 * in the body. What the window does buy: a row stamped 1970 or 2091 poisons every
 * `funnel_events (kind, ts)` range query an operator will ever run, and dropping it
 * costs nothing. The upper bound is generous because a device clock an hour fast is
 * ordinary; the route also records its own `receivedAt`, which is the timestamp to
 * trust when the two disagree.
 */
export const FUNNEL_TS_MIN = Date.UTC(2020, 0, 1);
export const FUNNEL_TS_FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

/**
 * The prop keys each event kind may send off the device.
 *
 * `sanitizeProps` in `lib/funnel.ts` coerces values to primitives and caps strings,
 * which is what keeps a blob or an object out. It does not and cannot bound the
 * *keys*: a future call site recording a survey completion with a `{ note: freeText }`
 * prop passes that filter intact. On-device that is a contained mistake. Across a
 * network it is an egress of free text, so the boundary gets its own allowlist.
 *
 * Every entry is a key some call site actually passes today; the empty arrays are the
 * page-view kinds, which carry nothing but the fact of the view.
 * `tests/funnel-flush.test.ts` fails if a call site anywhere in `app/` or `lib/` uses
 * a key that is not listed here.
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

export function redactFunnelProps(kind: FunnelEventKind, props: unknown): FunnelProps | undefined {
  if (!props || typeof props !== "object" || Array.isArray(props)) return undefined;
  const allowed = FUNNEL_PROP_KEYS[kind] ?? [];
  const clean: FunnelProps = {};
  // Driven by the allowlist, never by the object's own keys: iterating what arrived
  // would let an unknown key through the moment the filter below is relaxed.
  for (const key of allowed) {
    const value = (props as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "boolean") clean[key] = value;
    else if (typeof value === "string") clean[key] = value.slice(0, FUNNEL_PROP_STRING_MAX);
  }
  return Object.keys(clean).length ? clean : undefined;
}

/**
 * Rebuild one event from an allowlist, field by field.
 *
 * Constructed, never spread. On the browser side a stored event is JSON that was on
 * disk in a browser ARU does not control; on the server side it is a JSON object from
 * the open internet. Either way `{ ...event }` forwards whatever a future version, a
 * bug, a hand-edited localStorage entry or an attacker put on it. The five fields
 * below plus `props` are everything `funnel_events` has a column for.
 *
 * Returns null — drop the event — rather than throwing, for a kind that is not in
 * `FUNNEL_ORDER`, an empty or missing id, an empty visitor/session id, or a timestamp
 * outside the plausibility window.
 */
export function redactFunnelEvent(event: FunnelEvent, now = Date.now()): FunnelEvent | null {
  if (!event || typeof event !== "object") return null;
  if (!FUNNEL_ORDER.includes(event.kind)) return null;
  if (typeof event.id !== "string" || !event.id) return null;
  if (!Number.isFinite(event.ts)) return null;
  if (event.ts < FUNNEL_TS_MIN || event.ts > now + FUNNEL_TS_FUTURE_SLACK_MS) return null;
  const visitorId = String(event.visitorId ?? "").slice(0, FUNNEL_ID_MAX);
  const sessionId = String(event.sessionId ?? "").slice(0, FUNNEL_ID_MAX);
  // Both columns are `not null`, and "" satisfies that while being unusable: a row
  // with no session id is in no funnel and counts towards no ratio.
  if (!visitorId || !sessionId) return null;
  return {
    id: event.id.slice(0, FUNNEL_ID_MAX),
    kind: event.kind,
    visitorId,
    sessionId,
    props: redactFunnelProps(event.kind, event.props),
    ts: event.ts,
  };
}
