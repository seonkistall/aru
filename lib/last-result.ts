// Cross-session persistence of the user's most recent result, so a returning
// visitor can re-enter their report instead of starting over. On-device only
// (localStorage) — same privacy posture as the other local stores; nothing is
// transmitted. Stores the INPUTS (survey + scan levels + the read snapshot),
// which is enough to reconstruct the report via recommend().
import type { ScanReads, Survey } from "./recommend";
import type { SkinReads } from "./skin";

const KEY = "aru_last_result";

export type LastResult = { survey: Survey; scan: ScanReads; reads: SkinReads | null; ts: number };

export function saveLastResult(value: LastResult): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Persistence is best-effort; never break the report flow on quota/private mode.
  }
}

export function loadLastResult(): LastResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as LastResult) : null;
    return parsed && parsed.survey ? parsed : null;
  } catch {
    return null;
  }
}

export function hasLastResult(): boolean {
  return loadLastResult() !== null;
}

export function clearLastResult(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
