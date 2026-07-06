// Local routine reminder — no backend, no push. Generates an iCalendar (.ics)
// file with a daily AM + PM reminder the user adds to their own calendar
// (works cross-platform), plus a saved-routine marker in localStorage so a
// returning visitor knows their routine is kept.

const SAVED_KEY = "aru_routine_saved_v1";

export function markRoutineSaved(label: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify({ label, ts: Date.now() }));
  } catch {
    /* best-effort */
  }
}

export function savedRoutine(): { label: string; ts: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// A fixed local wall-clock time on an arbitrary base date; RRULE makes it daily.
// No timezone header — floating local time is what a personal reminder wants.
function vevent(uid: string, hour: number, minute: number, summary: string, description: string): string {
  const dt = `20260101T${pad(hour)}${pad(minute)}00`;
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${dt}`,
    "RRULE:FREQ=DAILY",
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${summary}`,
    "END:VALARM",
    "END:VEVENT",
  ].join("\r\n");
}

function icsEscape(text: string): string {
  return text.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

// Build an .ics with a morning and evening daily reminder for the routine.
export function buildRoutineIcs(routineLabel: string): string {
  const desc = icsEscape(`아루 추천 루틴: ${routineLabel}. 앱에서 오늘의 단계를 확인하세요.`);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//aru//routine-reminder//KO",
    "CALSCALE:GREGORIAN",
    vevent("aru-am@aru-beauty.app", 8, 0, "아루 아침 루틴", desc),
    vevent("aru-pm@aru-beauty.app", 22, 0, "아루 저녁 루틴", desc),
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadRoutineIcs(routineLabel: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([buildRoutineIcs(routineLabel)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "aru-routine-reminder.ics";
  a.click();
  URL.revokeObjectURL(url);
}
