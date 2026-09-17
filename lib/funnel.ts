import { DEVICE_DATA_KEY } from "./device-data";

// Privacy-clean funnel analytics. First-party, on-device only: events live in
// localStorage and leave the device solely through the gated /api/sync pipeline
// (same as consent/pilot data). NO selfies, NO free text, NO identifiers beyond
// a random anonymous visitor/session id. Props are coerced to primitives so a
// caller can never accidentally log PII or a large blob.
//
// Purpose: diagnose where sessions leave the scan and survey journeys. A
// commerce click is only an outbound action; it does not prove a purchase,
// product success, or a prevented failure.

export type FunnelEventKind =
  // A visitor opened a link someone shared (#m=NNN). Recorded on the landing
  // page, client-side, from the hash that was already being read there — no new
  // network call and nothing extra leaves the device.
  | "share_landed"
  // The landing page itself. Nothing was recorded here at all, so "arrived at ARU"
  // had no count and every ratio below started somewhere further down the page.
  | "home_viewed"
  // /scan mount, as distinct from scan_started (the shutter). The gap between them
  // is where a camera permission denial lives, which was previously invisible:
  // a user who opened the camera and was refused left no trace in the funnel.
  | "scan_opened"
  // getUserMedia refused, the browser has no camera API at all, or the stream opened
  // and failed to attach. `reason` is one of
  // permission | busy | notfound | unsupported | attach.
  | "camera_blocked"
  // A camera that was already live stopped mid-session. Distinct from camera_blocked,
  // which is a camera that never opened: the permission is granted and the hardware
  // was working, so nothing on the block screen applies. `reason` is one of
  // muted | ended (the track itself died — another app took the camera) |
  // backgrounded (the tab was hidden or unloaded, which ARU does deliberately).
  // The two must be told apart before either is counted: only the first is a loss.
  | "camera_interrupted"
  | "scan_started"
  | "scan_completed"
  | "survey_viewed"
  | "survey_completed"
  | "reco_viewed"
  // /care mount. The page recorded only commerce_clicked, so a session that reached
  // the routine page and bought nothing was indistinguishable from one that never
  // got there.
  | "care_viewed"
  // /checkin mount — the landing page for every re-engagement email, and the only
  // measure of whether those emails bring anyone back.
  | "checkin_opened"
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

const KEY = DEVICE_DATA_KEY.funnelEvents;
const VISITOR_KEY = DEVICE_DATA_KEY.funnelVisitor;
const SESSION_KEY = DEVICE_DATA_KEY.funnelSession;
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

/**
 * The two fields every counter below actually reads.
 *
 * Both `summarizeFunnel` and `funnelDropoff` count SESSIONS per kind; neither has ever
 * touched `visitorId`, `id` or `props`. Naming that lets the server-side aggregate in
 * `lib/funnel-aggregate.ts` call them over rows it selected WITHOUT `visitor_id`,
 * instead of inventing a placeholder visitor id for a field nothing reads. The
 * narrowing is what makes "the aggregate never reads a visitor" checkable at the type
 * level as well as in the SQL.
 */
export type FunnelCountable = Pick<FunnelEvent, "kind" | "sessionId">;

export type FunnelSummary = {
  events: number;
  sessions: number;
  steps: Record<FunnelEventKind, number>; // sessions that reached each step
  // Legacy property name: completed-scan sessions that opened a merchant link.
  // Do not present this as a purchase or efficacy outcome.
  failurePreventionConversion: number;
  surveyCompletion: number; // completed-survey sessions / survey-viewed sessions
  shareRate: number; // share clicks / completed scans
  // Share arrivals that also reached a capture. The denominator is share
  // ARRIVALS, not all sessions: this is the receiving half of the only organic
  // acquisition loop the product has, and shareRate alone gives it no denominator.
  // Two caveats before anyone reads this as a viral coefficient: `scan_started`
  // fires at the shutter, not on /scan entry, so this counts arrivals that got as
  // far as capturing; and the sets are unordered, so a sender who opens their own
  // link in a new tab (a fresh sessionId) counts as an arrival.
  viralActivation: number;
  // Sessions that opened /scan and reached the shutter. The camera step was the
  // funnel's own anchor, so everything it lost before the shutter — permission
  // refused, camera busy, no camera, or simply backing out — counted as nothing
  // having happened. Denominator is scan_opened sessions.
  captureStart: number;
  // The measurable part of that loss: sessions that opened /scan and hit a camera
  // dead-end. Same denominator, but the two are NOT a partition in either direction:
  // a session that leaves without being refused is in neither, and one that is
  // refused, retries and then captures is in both, so they can also sum above 1.
  cameraBlockRate: number;
};

export const FUNNEL_ORDER: FunnelEventKind[] = [
  "home_viewed",
  "share_landed",
  "scan_opened",
  "camera_blocked",
  "camera_interrupted",
  "scan_started",
  "scan_completed",
  "survey_viewed",
  "survey_completed",
  "reco_viewed",
  "care_viewed",
  "checkin_opened",
  "share_clicked",
  "commerce_clicked",
];

export function summarizeFunnel(events: FunnelCountable[] = getFunnelEvents()): FunnelSummary {
  const sessions = new Set(events.map((event) => event.sessionId));
  const reached = (kind: FunnelEventKind) => new Set(events.filter((event) => event.kind === kind).map((event) => event.sessionId));

  const steps = {} as Record<FunnelEventKind, number>;
  const reachedSets = {} as Record<FunnelEventKind, Set<string>>;
  for (const kind of FUNNEL_ORDER) {
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
  const surveyViewedSet = reachedSets.survey_viewed;
  const completedAfterView = [...reachedSets.survey_completed].filter((id) => surveyViewedSet.has(id)).length;
  const landedSet = reachedSets.share_landed;
  const landedThenScanned = [...reachedSets.scan_started].filter((id) => landedSet.has(id)).length;
  // Conditioned on scan_opened for the same reason the ratios above are conditioned
  // on scan_completed: scan_started can exist without it in a log recorded before
  // scan_opened was fired at all, and an unconditioned numerator would read >1.
  const openedSet = reachedSets.scan_opened;
  const withinOpened = (kind: FunnelEventKind) => [...reachedSets[kind]].filter((id) => openedSet.has(id)).length;
  const ofOpened = (num: number) => (openedSet.size ? num / openedSet.size : 0);

  return {
    events: events.length,
    sessions: sessions.size,
    steps,
    failurePreventionConversion: ratio(withinCompleted("commerce_clicked")),
    surveyCompletion: surveyViewedSet.size ? completedAfterView / surveyViewedSet.size : 0,
    shareRate: ratio(withinCompleted("share_clicked")),
    viralActivation: landedSet.size ? landedThenScanned / landedSet.size : 0,
    captureStart: ofOpened(withinOpened("scan_started")),
    cameraBlockRate: ofOpened(withinOpened("camera_blocked")),
  };
}

export type FunnelStage = {
  kind: FunnelEventKind;
  label: string;
  count: number;
  ofStart: number; // fraction of scan_started sessions still present
  dropFromPrev: number; // fraction lost since the previous stage
};

// The linear conversion path (share is a side branch, excluded here).
const STAGE_ORDER: { kind: FunnelEventKind; label: string }[] = [
  { kind: "scan_started", label: "스캔 시작" },
  { kind: "scan_completed", label: "스캔 완료" },
  { kind: "survey_completed", label: "설문 완료" },
  { kind: "reco_viewed", label: "추천 조회" },
  { kind: "commerce_clicked", label: "구매 클릭" },
];

// A true cumulative funnel: a session counts at stage i only if it reached that
// stage AND every earlier stage (intersection anchored on scan_started). This
// stays monotonic (never >100%, never a negative drop) even though the raw
// per-step counts are independent per-session sets where survey/reco/commerce
// can fire with no scan — a survey-only session simply isn't in the scan funnel.
export function funnelDropoff(events: FunnelCountable[] = getFunnelEvents()): FunnelStage[] {
  const sessionsFor = (kind: FunnelEventKind) => new Set(events.filter((event) => event.kind === kind).map((event) => event.sessionId));
  const start = sessionsFor(STAGE_ORDER[0].kind).size;
  let running: Set<string> | null = null;
  let prevCount = start;
  return STAGE_ORDER.map((stage, index) => {
    const set = sessionsFor(stage.kind);
    running = running === null ? set : new Set([...running].filter((id) => set.has(id)));
    const count = running.size;
    const result: FunnelStage = {
      kind: stage.kind,
      label: stage.label,
      count,
      ofStart: start ? count / start : 0,
      dropFromPrev: index === 0 || !prevCount ? 0 : 1 - count / prevCount,
    };
    prevCount = count;
    return result;
  });
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
