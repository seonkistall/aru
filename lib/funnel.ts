// Privacy-clean funnel analytics. First-party, on-device only: events live in
// localStorage and leave the device solely through the gated /api/sync pipeline
// (same as consent/pilot data). NO selfies, NO free text, NO identifiers beyond
// a random anonymous visitor/session id. Props are coerced to primitives so a
// caller can never accidentally log PII or a large blob.
//
// Purpose: measure the north-star "failure-prevention conversion" — of the
// people who complete a scan, how many go on to an informed purchase intent
// (commerce_clicked). That ratio is the kill-metric for the whole product.

export type FunnelEventKind =
  | "scan_started"
  | "scan_completed"
  | "survey_completed"
  | "reco_viewed"
  | "share_clicked"
  | "commerce_clicked";

export type FunnelProps = Record<string, string | number | boolean>;

export type FunnelEvent = {
  id: string;
  kind: FunnelEventKind;
  visitorId: string;
  sessionId: string;
  props?: FunnelProps;
  ts: number;
};

const KEY = "aru_funnel_events_v1";
const VISITOR_KEY = "aru_funnel_visitor_v1";
const SESSION_KEY = "aru_funnel_session_v1";
const MAX_EVENTS = 1000;

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
}

// Stable across visits (localStorage). Random — not derived from any device or
// user attribute, so it cannot be linked back to a person.
function visitorId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = uid();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

// Resets per tab session (sessionStorage) — the unit the funnel ratios count.
function sessionId(): string {
  if (typeof window === "undefined") return "server";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = uid();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// Keep only small primitives; drop everything else so props stay non-identifying.
function sanitizeProps(props?: FunnelProps): FunnelProps | undefined {
  if (!props) return undefined;
  const clean: FunnelProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "boolean") clean[key] = value;
    else if (typeof value === "string") clean[key] = value.slice(0, 40);
  }
  return Object.keys(clean).length ? clean : undefined;
}

export function getFunnelEvents(): FunnelEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function funnelEventCount(): number {
  return getFunnelEvents().length;
}

export function recordFunnelEvent(kind: FunnelEventKind, props?: FunnelProps): FunnelEvent | null {
  if (typeof window === "undefined") return null;
  // The whole body is guarded: even reading localStorage/sessionStorage for the
  // visitor/session ids can throw (blocked cookies, private mode). Analytics
  // must never break the user flow — scan_started fires outside capture()'s own
  // try, so an escaping throw would hang the scan.
  try {
    const event: FunnelEvent = {
      id: uid(),
      kind,
      visitorId: visitorId(),
      sessionId: sessionId(),
      props: sanitizeProps(props),
      ts: Date.now(),
    };
    const all = getFunnelEvents();
    all.push(event);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX_EVENTS)));
    return event;
  } catch {
    return null;
  }
}

export type FunnelSummary = {
  events: number;
  sessions: number;
  steps: Record<FunnelEventKind, number>; // sessions that reached each step
  // North-star: of sessions that completed a scan, the share that reached an
  // informed purchase intent (a commerce click).
  failurePreventionConversion: number;
  shareRate: number; // share clicks / completed scans
};

const ORDER: FunnelEventKind[] = [
  "scan_started",
  "scan_completed",
  "survey_completed",
  "reco_viewed",
  "share_clicked",
  "commerce_clicked",
];

export function summarizeFunnel(events: FunnelEvent[] = getFunnelEvents()): FunnelSummary {
  const sessions = new Set(events.map((event) => event.sessionId));
  const reached = (kind: FunnelEventKind) => new Set(events.filter((event) => event.kind === kind).map((event) => event.sessionId));

  const steps = {} as Record<FunnelEventKind, number>;
  const reachedSets = {} as Record<FunnelEventKind, Set<string>>;
  for (const kind of ORDER) {
    const set = reached(kind);
    reachedSets[kind] = set;
    steps[kind] = set.size;
  }

  // Both ratios are conditioned on sessions that completed a scan, so the
  // numerator must be the subset of that step's sessions which ALSO completed a
  // scan — commerce/share can fire on survey-only paths with no scan_completed,
  // which would otherwise push the ratio above 1.0.
  const completedSet = reachedSets.scan_completed;
  const withinCompleted = (kind: FunnelEventKind) => [...reachedSets[kind]].filter((id) => completedSet.has(id)).length;
  const ratio = (num: number) => (completedSet.size ? num / completedSet.size : 0);

  return {
    events: events.length,
    sessions: sessions.size,
    steps,
    failurePreventionConversion: ratio(withinCompleted("commerce_clicked")),
    shareRate: ratio(withinCompleted("share_clicked")),
  };
}

export function exportFunnelEvents() {
  const rows = getFunnelEvents();
  const header = ["id", "kind", "visitorId", "sessionId", "props", "ts"];
  const esc = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    header.join(","),
    ...rows.map((row) =>
      header.map((key) => esc(key === "props" ? JSON.stringify(row.props ?? {}) : row[key as keyof FunnelEvent])).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aru-funnel-events-${rows.length}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function clearFunnelEvents() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
