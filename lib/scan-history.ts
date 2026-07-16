import { DEVICE_DATA_KEY } from "./device-data";

// Local scan history (MAU re-engagement). On-device only — a lightweight trail
// of past scan levels so a returning user can see their skin over time without
// an account or email. Same privacy posture as the other local stores.

export type ScanHistoryEntry = {
  oil: number;
  redness: number;
  pores: number;
  confidence: number;
  ts: number;
};

const KEY = DEVICE_DATA_KEY.scanHistory;
const MAX = 30;

export function getScanHistory(): ScanHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function pushScanHistory(entry: ScanHistoryEntry): void {
  if (typeof window === "undefined") return;
  try {
    const all = getScanHistory();
    all.push(entry);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX)));
  } catch {
    // Best-effort; history must never break the scan flow.
  }
}

export function scanHistoryCount(): number {
  return getScanHistory().length;
}
