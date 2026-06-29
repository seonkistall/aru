export const CONSENT_VERSION = "2026-06-29.v1";

export type ConsentKind = "ai_analysis" | "learning_crop";

export type ConsentEvent = {
  id: string;
  kind: ConsentKind;
  granted: boolean;
  version: string;
  text: string;
  participantId?: string;
  sessionId?: string;
  ts: number;
};

export const CONSENT_TEXT: Record<ConsentKind, string> = {
  ai_analysis:
    "AI 분석용 전송: 얼굴 주변 크롭 이미지를 분석 API로 보내 보이는 피부 신호 기반 화장품 추천을 개선합니다. 학습용 저장과는 별도입니다.",
  learning_crop:
    "학습용 크롭 저장: 동의한 경우에만 얼굴 주변 크롭과 사용자가 확인한 라벨을 이 기기에 임시 저장하고, 내보낸 데이터만 ML 학습 검토에 사용합니다.",
};

const KEY = "gyeol_consent_events_v1";

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
}

export function getConsentEvents(): ConsentEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function consentEventCount(): number {
  return getConsentEvents().length;
}

export function latestConsent(kind: ConsentKind, scope?: { participantId?: string; sessionId?: string }): ConsentEvent | null {
  const events = getConsentEvents().filter((event) => {
    if (event.kind !== kind) return false;
    if (scope?.participantId && event.participantId !== scope.participantId) return false;
    if (scope?.sessionId && event.sessionId !== scope.sessionId) return false;
    return true;
  });
  return events.length ? events[events.length - 1] : null;
}

export function recordConsentEvent(kind: ConsentKind, granted: boolean, scope?: { participantId?: string; sessionId?: string }): ConsentEvent | null {
  if (typeof window === "undefined") return null;
  const last = latestConsent(kind, scope);
  if (last?.granted === granted && last.version === CONSENT_VERSION) return last;

  const event: ConsentEvent = {
    id: uid(),
    kind,
    granted,
    version: CONSENT_VERSION,
    text: CONSENT_TEXT[kind],
    participantId: scope?.participantId,
    sessionId: scope?.sessionId,
    ts: Date.now(),
  };
  const all = getConsentEvents();
  all.push(event);
  localStorage.setItem(KEY, JSON.stringify(all.slice(-200)));
  return event;
}

export function exportConsentEvents() {
  const rows = getConsentEvents();
  const header = ["id", "kind", "granted", "version", "participantId", "sessionId", "text", "ts"];
  const esc = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => esc(row[key as keyof ConsentEvent])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gyeol-consent-events-${rows.length}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function clearConsentEvents() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
