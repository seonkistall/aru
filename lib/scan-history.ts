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

/**
 * Guarded with `Array.isArray`, because the two corruption modes were reaching very
 * different places. A TRUNCATED value throws in `JSON.parse` and the catch returns
 * `[]`, so the strip renders nothing and the next `pushScanHistory` overwrites the
 * key — the store repairs itself. A value that PARSES to the wrong shape had no such
 * path: it was handed back as written, and `ScanHistoryStrip` renders it on
 * `/report`, where `history.length < 2` is `undefined < 2` on an object (false) and
 * `history.slice(-6)` then throws INSIDE RENDER. React unmounts the segment and
 * `app/error.tsx` replaces the whole report — the analysis, the product cards and
 * both `/api/out` links with them — and because the crash is deterministic in the
 * stored value, `reset()` throws again. Same guard, same reason, as `lib/funnel.ts`:
 * checking at the read is also what lets the next write repair the key.
 * `tests/e2e/report-device-store-shape.regression-13.spec.ts`.
 */
export function getScanHistory(): ScanHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? (parsed as ScanHistoryEntry[]) : [];
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
