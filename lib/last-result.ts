// Cross-session persistence of the user's most recent result, so a returning
// visitor can re-enter their report instead of starting over. On-device only
// (localStorage) — same privacy posture as the other local stores; nothing is
// transmitted. Stores the INPUTS (survey + scan levels + the read snapshot),
// which is enough to reconstruct the report via recommend().
import { isSurvey, type ScanReads, type Survey } from "./recommend";
import type { SkinReads } from "./skin";
import { DEVICE_DATA_KEY } from "./device-data";

const KEY = DEVICE_DATA_KEY.lastResult;

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
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // `parsed.survey` used to be a truthiness check, which `5`, `"abcdef"` and `{}` all
    // pass — and this value is what BOTH revenue screens fall back to in a fresh tab, so
    // a truthy non-survey here is a dead /report and a dead /care on every future visit.
    if (typeof parsed !== "object" || parsed === null) return null;
    return isSurvey((parsed as { survey?: unknown }).survey) ? (parsed as LastResult) : null;
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
