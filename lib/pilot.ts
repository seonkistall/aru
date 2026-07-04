export type PilotLighting = "window" | "ceiling" | "dim" | "backlight" | "direct";
export type PilotBrowser = "ios-safari" | "android-chrome" | "desktop" | "other";
export type PilotStatus = "planned" | "consented" | "scanned" | "labeled" | "excluded";

export type PilotNote = {
  id: string;
  participant: string;
  participantId?: string;
  sessionId?: string;
  round?: string;
  deviceId?: string;
  reviewerId?: string;
  status?: PilotStatus;
  browser: PilotBrowser;
  lighting: PilotLighting;
  makeup: "none" | "light" | "heavy";
  glasses: boolean;
  hairCover: boolean;
  scanCompleted: boolean;
  labelComplete?: boolean;
  secondReviewNeeded?: boolean;
  excludedReason?: string;
  consentAi: boolean;
  consentCrop: boolean;
  notes: string;
  ts: number;
};

export type PilotSession = {
  participantId: string;
  sessionId: string;
  round: string;
  deviceId: string;
  reviewerId: string;
  startedAt: number;
};

const KEY = "gyeol_pilot_notes_v1";
const SESSION_KEY = "gyeol_current_pilot_session_v1";
// Exactly P001-P030. The old 0[0-9][1-9] left the tens digit unconstrained and
// also matched P031-P099, inflating the pilot participant count on ops typos.
const PARTICIPANT_RE = /^P(00[1-9]|0[12][0-9]|030)$/;

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
}

export const PILOT_PARTICIPANT_IDS = Array.from({ length: 30 }, (_, index) => `P${String(index + 1).padStart(3, "0")}`);

export function normalizeParticipantId(value: string): string {
  const clean = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^\d{1,2}$/.test(clean)) return `P${clean.padStart(3, "0")}`;
  if (/^P\d{1,2}$/.test(clean)) return `P${clean.slice(1).padStart(3, "0")}`;
  return clean;
}

export function isPilotParticipantId(value: string): boolean {
  return PARTICIPANT_RE.test(normalizeParticipantId(value));
}

export function createPilotSession(input: {
  participant: string;
  round?: string;
  deviceId?: string;
  reviewerId?: string;
  sessionId?: string;
}): PilotSession {
  const participantId = normalizeParticipantId(input.participant);
  return {
    participantId,
    sessionId: input.sessionId?.trim() || `${participantId}-${Date.now()}`,
    round: input.round?.trim() || "pilot-1",
    deviceId: input.deviceId?.trim() || "unknown-device",
    reviewerId: input.reviewerId?.trim() || "unassigned",
    startedAt: Date.now(),
  };
}

export function getCurrentPilotSession(): PilotSession | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function setCurrentPilotSession(session: PilotSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearCurrentPilotSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

export function getPilotNotes(): PilotNote[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function pilotNoteCount(): number {
  return getPilotNotes().length;
}

export function summarizePilotNotes() {
  const rows = getPilotNotes();
  const byBrowser = countBy(rows, (row) => row.browser);
  const byLighting = countBy(rows, (row) => row.lighting);
  const byStatus = countBy(rows, (row) => row.status || "planned");
  const participantIds = new Set(rows.map((row) => row.participantId || normalizeParticipantId(row.participant)).filter(isPilotParticipantId));

  return {
    total: rows.length,
    participants: participantIds.size,
    completed: rows.filter((row) => row.scanCompleted).length,
    labelComplete: rows.filter((row) => row.labelComplete).length,
    secondReviewNeeded: rows.filter((row) => row.secondReviewNeeded).length,
    excluded: rows.filter((row) => row.status === "excluded" || Boolean(row.excludedReason)).length,
    aiConsent: rows.filter((row) => row.consentAi).length,
    cropConsent: rows.filter((row) => row.consentCrop).length,
    blockedByMakeupOrObstruction: rows.filter((row) => row.makeup === "heavy" || row.glasses || row.hairCover).length,
    byBrowser,
    byLighting,
    byStatus,
  };
}

export function savePilotNote(note: Omit<PilotNote, "id" | "ts">): PilotNote {
  const session = createPilotSession({
    participant: note.participant,
    round: note.round,
    deviceId: note.deviceId,
    reviewerId: note.reviewerId,
    sessionId: note.sessionId,
  });
  const rec: PilotNote = { ...note, id: uid(), ts: Date.now() };
  rec.participantId = note.participantId || session.participantId;
  rec.sessionId = note.sessionId || session.sessionId;
  rec.round = note.round || session.round;
  rec.deviceId = note.deviceId || session.deviceId;
  rec.reviewerId = note.reviewerId || session.reviewerId;
  rec.status = note.status || (note.scanCompleted ? "scanned" : note.consentAi || note.consentCrop ? "consented" : "planned");
  const all = getPilotNotes();
  all.push(rec);
  localStorage.setItem(KEY, JSON.stringify(all));
  setCurrentPilotSession({
    participantId: rec.participantId,
    sessionId: rec.sessionId,
    round: rec.round,
    deviceId: rec.deviceId,
    reviewerId: rec.reviewerId,
    startedAt: rec.ts,
  });
  return rec;
}

export function exportPilotNotes() {
  const rows = getPilotNotes();
  const header = [
    "id",
    "participant",
    "participantId",
    "sessionId",
    "round",
    "deviceId",
    "reviewerId",
    "status",
    "browser",
    "lighting",
    "makeup",
    "glasses",
    "hairCover",
    "scanCompleted",
    "labelComplete",
    "secondReviewNeeded",
    "excludedReason",
    "consentAi",
    "consentCrop",
    "notes",
    "ts",
  ];
  const esc = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => esc(row[key as keyof PilotNote])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gyeol-pilot-notes-${rows.length}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function clearPilotNotes() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

function countBy<T extends string>(rows: PilotNote[], getKey: (row: PilotNote) => T): Partial<Record<T, number>> {
  return rows.reduce(
    (acc, row) => {
      const key = getKey(row);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<T, number>>
  );
}
